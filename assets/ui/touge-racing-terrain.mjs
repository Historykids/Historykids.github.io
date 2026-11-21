const TAU = Math.PI * 2;
const GRID_SIZE = 36;
const CHECKPOINTS = 8;
const CHECKPOINT_REACH = 96;
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

export function buildTerrain(track) {
  const margin = 150;
  const bounds = {
    left: Math.min(...track.outline.map(p => p.x)) - margin,
    right: Math.max(...track.outline.map(p => p.x)) + margin,
    top: Math.min(...track.outline.map(p => p.z)) - margin,
    bottom: Math.max(...track.outline.map(p => p.z)) + margin
  };
  const gates = Array.from({ length: CHECKPOINTS }, (_, i) => {
    const distance = track.length * (i + 1) / CHECKPOINTS;
    return { ...track.sample(distance), distance };
  });
  const cells = new Map();
  const count = Math.ceil(track.length / 4);
  const step = track.length / count;
  const samples = Array.from({ length: count }, (_, i) => track.sample(i * step));
  for (const [index, p] of samples.entries()) {
    const x = Math.floor(p.x / GRID_SIZE), z = Math.floor(p.z / GRID_SIZE);
    const key = x + ":" + z;
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key).push(index);
  }
  function roadAt(x, z) {
    let best = (track.halfWidth + 5) ** 2, found;
    const gx = Math.floor(x / GRID_SIZE), gz = Math.floor(z / GRID_SIZE);
    for (let ix = gx - 1; ix <= gx + 1; ix++) {
      for (let iz = gz - 1; iz <= gz + 1; iz++) {
        for (const i of cells.get(ix + ":" + iz) ?? []) {
          const a = samples[i], b = samples[(i + 1) % count];
          const dx = b.x - a.x, dz = b.z - a.z, length = Math.hypot(dx, dz);
          const t = clamp(((x - a.x) * dx + (z - a.z) * dz) / length ** 2, 0, 1);
          const rx = x - a.x - t * dx, rz = z - a.z - t * dz;
          const error = rx * rx + rz * rz;
          if (error >= best) continue;
          best = error;
          const distance = ((i + t) * step) % track.length;
          const center = track.sample(distance);
          found = { ...center, distance, lane: (x - center.x) * center.rx + (z - center.z) * center.rz, error };
        }
      }
    }
    return found;
  }
  return { bounds, gates, roadAt };
}

export function terrainPoint(racer, out = {}) {
  out.x = racer.x;
  out.z = racer.z;
  out.fx = Math.sin(racer.heading);
  out.fz = Math.cos(racer.heading);
  out.rx = -out.fz;
  out.rz = out.fx;
  return out;
}

export function enterTerrain(track, racer) {
  const road = track.sample(racer.distance);
  racer.free = true;
  racer.x = road.x + road.rx * racer.lane;
  racer.z = road.z + road.rz * racer.lane;
  racer.heading = Math.atan2(road.fx, road.fz) - Math.atan2(racer.lateralSpeed, Math.max(1, racer.speed));
  if (!track.manualDrive || track.assistedSteering) racer.lane = 0;
  racer.lateralSpeed = 0;
  racer.onAsphalt = track.manualDrive && !track.assistedSteering ? Math.abs(racer.lane) <= track.halfWidth : false;
}

export function moveAcrossTerrain(track, racer, dt) {
  const { bounds, roadAt } = track.terrain;
  const step = racer.speed * dt;
  racer.x = clamp(racer.x + Math.sin(racer.heading) * step, bounds.left, bounds.right);
  racer.z = clamp(racer.z + Math.cos(racer.heading) * step, bounds.top, bounds.bottom);
  const road = roadAt(racer.x, racer.z);
  racer.onAsphalt = !!road && road.error <= track.halfWidth ** 2;
  if (track.manualDrive && !track.assistedSteering) {
    if (road) {
      racer.distance = road.distance + Math.round((racer.distance - road.distance) / track.length) * track.length;
      racer.lane = road.lane;
    }
    return;
  }
  if (!road || road.error >= (track.halfWidth - .55) ** 2) return;
  const direction = Math.sin(racer.heading) * road.fx + Math.cos(racer.heading) * road.fz;
  if (direction < .83) return;
  racer.free = false;
  racer.distance = road.distance + Math.round((racer.distance - road.distance) / track.length) * track.length;
  racer.lane = road.lane;
  racer.lateralSpeed = racer.speed * (Math.sin(racer.heading) * road.rx + Math.cos(racer.heading) * road.rz);
}

export function turnAcrossTerrain(racer, input, dt, speedScale) {
  const steering = clamp(racer.speed / (10 * speedScale), 0, 1);
  const rate = input.drift ? 2.1 : 1.55;
  racer.heading = (racer.heading - input.turn * rate * steering * dt + TAU) % TAU;
}

export function updateTerrainProgress(track, racer, before, after, dt, elapsed) {
  const gates = track.terrain.gates;
  const current = racer.nextGate ?? 0;
  const completed = racer.completedLaps ?? 0;
  const gate = gates[current];
  const frontBefore = (before.x - gate.x) * gate.fx + (before.z - gate.z) * gate.fz;
  const frontAfter = (after.x - gate.x) * gate.fx + (after.z - gate.z) * gate.fz;
  if (frontBefore < 0 && frontAfter >= 0) {
    const t = -frontBefore / (frontAfter - frontBefore);
    const x = before.x + (after.x - before.x) * t;
    const z = before.z + (after.z - before.z) * t;
    const reach = current === gates.length - 1 ? track.halfWidth + 2 : CHECKPOINT_REACH;
    if (Math.abs((x - gate.x) * gate.rx + (z - gate.z) * gate.rz) <= reach) {
      racer.nextGate = (current + 1) % gates.length;
      if (racer.nextGate === 0) {
        racer.completedLaps = completed + 1;
        const crossing = elapsed + t * dt;
        racer.lapEnds?.push(crossing);
        racer.progress = racer.completedLaps * track.length;
        return crossing;
      }
    }
  }
  const next = racer.nextGate ?? 0;
  const target = gates[next];
  const prior = gates[(next + gates.length - 1) % gates.length];
  const dx = target.x - prior.x, dz = target.z - prior.z;
  const fraction = clamp(((after.x - prior.x) * dx + (after.z - prior.z) * dz) / (dx * dx + dz * dz), 0, .999);
  racer.progress = (completed + (next + fraction) / gates.length) * track.length;
  return null;
}
