// Software perspective renderer for browsers that cannot open a WebGL context.
export function createCanvasRenderer(canvas, racers, track) {
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("Canvas 2D is unavailable");
  const { sample, length, halfWidth, pads, padLength, padHalfWidth } = track;
  const terrain = [];
  const road = [];
  const scenery = [];
  const vehicles = racers.map(racer => ({
    body: shade(racer.color, 1),
    side: shade(racer.color, .75),
    light: shade(racer.color, 1.23)
  }));
  const near = .7;
  let ratio = 1;
  let width = 1;
  let height = 1;

  function shade(color, factor) {
    const channels = [color >> 16, color >> 8 & 255, color & 255];
    return "rgb(" + channels.map(channel => Math.min(255, Math.round(channel * factor))).join(",") + ")";
  }

  function point(p, lane, y) {
    return [p.x + p.rx * lane, y, p.z + p.rz * lane];
  }

  function strip(to, a, b, left, right, y, color) {
    to.push({ color, corners: [point(a, left, y), point(a, right, y), point(b, right, y), point(b, left, y)] });
  }

  function trackStrip(surfaces, start, end, left, right, y, color) {
    const segments = Math.ceil((end - start) / 3);
    for (let i = 0; i < segments; i++) {
      const a = sample(start + (end - start) * i / segments);
      const b = sample(start + (end - start) * (i + 1) / segments);
      strip(surfaces, a, b, left, right, y, color);
    }
  }

  function box(faces, p, x, y, z, w, h, d, colors) {
    const corners = [
      [-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1],
      [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]
    ].map(([dx, dy, dz]) => {
      const localX = x + dx * w / 2;
      const localZ = z + dz * d / 2;
      return [p.x + p.rx * localX + p.fx * localZ, y + dy * h / 2, p.z + p.rz * localX + p.fz * localZ];
    });
    const sides = [
      [0, 1, 2, 3], [4, 7, 6, 5], [0, 3, 7, 4],
      [1, 5, 6, 2], [3, 2, 6, 7]
    ];
    sides.forEach((indices, index) => {
      faces.push({ color: colors[index], corners: indices.map(i => corners[i]) });
    });
  }

  const sea = { color: "#487d8c", corners: [[-1100, -.25, 94], [-1100, -.25, 1100], [1100, -.25, 1100], [1100, -.25, 94]] };
  terrain.push(sea);
  for (let i = 0; i < 21; i++) {
    const x = Math.sin(i * 2.4) * 150 + i * 11 - 135;
    const z = 101 + (i * 17) % 95;
    terrain.push({ color: i % 3 ? "#578d99" : "#6a99a1",
      corners: [[x, -.23, z], [x + 8 + i % 9, -.23, z], [x + 12 + i % 9, -.23, z + .24], [x + 2, -.23, z + .24]] });
  }

  const peaks = [
    [-169, 25, 53], [-147, -49, 58], [-129, -97, 70], [-86, -128, 56],
    [-48, -153, 79], [0, -140, 50], [57, -148, 70], [112, -120, 57],
    [150, -81, 68], [185, 164, 30], [230, 191, 38], [-169, 203, 34]
  ];
  for (const [x, z, h] of peaks) {
    scenery.push({ color: z > 110 ? "#526c75" : "#566658",
      corners: [[x - h, -.5, z], [x, h, z + 3], [x + h, -.5, z + 10]] });
    scenery.push({ color: z > 110 ? "#607e87" : "#6b7560",
      corners: [[x, h, z + 3], [x + h * .35, 0, z - 7], [x + h, -.5, z + 10]] });
  }

  const segmentCount = Math.ceil(length / 3.6);
  for (let index = 0; index < segmentCount; index++) {
    const from = length * index / segmentCount;
    const to = length * (index + 1) / segmentCount;
    const a = sample(from);
    const b = sample(to);
    const kerb = index % 2 ? "#bc4e47" : "#e0d1b1";
    strip(road, a, b, -halfWidth - .7, halfWidth + .7, .09, kerb);
    strip(road, a, b, -halfWidth, halfWidth, .13, index % 2 ? "#353641" : "#373843");
    strip(road, a, b, -halfWidth + .22, -halfWidth + .37, .16, "#e3dfd3");
    strip(road, a, b, halfWidth - .37, halfWidth - .22, .16, "#e3dfd3");
    if (index % 2 === 0) strip(road, a, b, -.08, .08, .16, "#c9b388");
    if (index % 4 === 0) {
      const side = index % 12 === 0 && from > length * .37 ? 1 : -1;
      const offset = side * (12 + 4 * Math.sin(index * .8) ** 2);
      const h = 3 + 3 * Math.sin(index) ** 2;
      const trunk = ["#6c5747", "#6c5747", "#534636", "#534636", "#6c5747"];
      box(scenery, a, offset, h * .23, 0, .26, h * .46, .26, trunk);
      for (let layer = 0; layer < 2; layer++) {
        const y = h * (.28 + layer * .26);
        const w = h * (.31 - layer * .07);
        scenery.push({ color: layer ? "#3b6456" : "#335447",
          corners: [point(a, offset - w, y), point(a, offset, y + h * .59), point(a, offset + w, y)] });
        const base = point(a, offset, y);
        scenery.push({ color: layer ? "#446958" : "#3c5e4f",
          corners: [[base[0] - a.fx * w, y, base[2] - a.fz * w], point(a, offset, y + h * .59),
            [base[0] + a.fx * w, y, base[2] + a.fz * w]] });
      }
    }
  }
  for (let cell = 0; cell < 14; cell++) {
    for (let row = 0; row < 2; row++) {
      trackStrip(road, -.8 + row * .8, row * .8, cell - 7, cell - 6, .19,
        (cell + row) % 2 ? "#eee8dd" : "#222b37");
    }
  }
  for (const pad of pads) {
    trackStrip(road, pad.distance, pad.distance + padLength, pad.lane - padHalfWidth, pad.lane + padHalfWidth, .19, "#137cae");
    for (let i = 0; i < 3; i++) {
      const tip = sample(pad.distance + 2 + i * 2.6);
      const front = sample(pad.distance + 1.4 + i * 2.6);
      const back = sample(pad.distance + .6 + i * 2.6);
      road.push({ color: "#a5efff", corners: [point(back, pad.lane - 1.45, .2), point(tip, pad.lane, .2),
        point(back, pad.lane + 1.45, .2), point(front, pad.lane, .2)] });
    }
  }

  const start = sample(0);
  const vermilion = ["#d76a48", "#b84e37", "#a34336", "#c5573c", "#ef8860"];
  const beam = ["#304552", "#293a45", "#293a45", "#293a45", "#5b6364"];
  for (const lane of [-8.8, 8.8]) box(scenery, start, lane, 3.9, 0, .75, 7.8, .75, vermilion);
  box(scenery, start, 0, 6.15, 0, 20, .62, .72, vermilion);
  box(scenery, start, 0, 7.68, 0, 21.1, .62, .9, vermilion);
  box(scenery, start, 0, 8.06, 0, 22, .26, 1.3, beam);
  box(scenery, start, 0, 6.94, 0, .8, 1.2, .62, vermilion);

  function setPixelRatio(value) { ratio = Math.min(value, 1.25); }

  function setSize(w, h) {
    width = w;
    height = h;
    canvas.width = Math.round(w * ratio);
    canvas.height = Math.round(h * ratio);
  }

  function render(_scene, camera) {
    camera.updateMatrixWorld();
    const view = camera.matrixWorldInverse.elements;
    const focal = height / (2 * Math.tan(camera.fov * Math.PI / 360));
    const horizon = height / 2 + focal * (view[1] * view[2] + view[9] * view[10]) /
      (view[2] * view[2] + view[10] * view[10]);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

    function transform([x, y, z]) {
      return [
        view[0] * x + view[4] * y + view[8] * z + view[12],
        view[1] * x + view[5] * y + view[9] * z + view[13],
        -(view[2] * x + view[6] * y + view[10] * z + view[14])
      ];
    }

    function project({ corners, color }) {
      const vertices = corners.map(transform);
      const clipped = [];
      for (let i = 0; i < vertices.length; i++) {
        const a = vertices[i];
        const b = vertices[(i + 1) % vertices.length];
        if (a[2] >= near) clipped.push(a);
        if ((a[2] >= near) !== (b[2] >= near)) {
          const t = (near - a[2]) / (b[2] - a[2]);
          clipped.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, near]);
        }
      }
      if (clipped.length < 3) return null;
      const screen = clipped.map(([x, y, z]) => [width / 2 + x * focal / z, height / 2 - y * focal / z]);
      if (screen.every(([x]) => x < 0) || screen.every(([x]) => x > width) ||
          screen.every(([, y]) => y < 0) || screen.every(([, y]) => y > height)) return null;
      return { color, screen, depth: clipped.reduce((sum, p) => sum + p[2], 0) / clipped.length };
    }

    function paint(polygon) {
      if (!polygon) return;
      ctx.beginPath();
      polygon.screen.forEach(([x, y], index) => index ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
      ctx.closePath();
      ctx.fillStyle = polygon.color;
      ctx.fill();
    }

    const sky = ctx.createLinearGradient(0, 0, 0, Math.max(1, horizon));
    sky.addColorStop(0, "#395c80");
    sky.addColorStop(.6, "#a58082");
    sky.addColorStop(1, "#f0aa79");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, width, height);
    const sun = transform([camera.position.x + 170, camera.position.y + 39, camera.position.z + 105]);
    if (sun[2] > near) {
      const x = width / 2 + sun[0] * focal / sun[2];
      const y = height / 2 - sun[1] * focal / sun[2];
      const r = focal * .034;
      const glow = ctx.createRadialGradient(x, y, 0, x, y, r * 3.7);
      glow.addColorStop(0, "#ffe1a3cc");
      glow.addColorStop(1, "#ffe1a300");
      ctx.fillStyle = glow;
      ctx.fillRect(x - r * 4, y - r * 4, r * 8, r * 8);
      ctx.fillStyle = "#ffe8ae";
      ctx.beginPath();
      ctx.arc(x, y, r, 0, 2 * Math.PI);
      ctx.fill();
    }
    const ground = ctx.createLinearGradient(0, horizon, 0, Math.max(horizon + 1, height));
    ground.addColorStop(0, "#9c8980");
    ground.addColorStop(.37, "#647b5f");
    ground.addColorStop(1, "#496650");
    ctx.fillStyle = ground;
    ctx.fillRect(0, horizon, width, height - horizon);
    terrain.forEach(surface => paint(project(surface)));
    road.forEach(surface => paint(project(surface)));

    const faces = [...scenery];
    racers.forEach((racer, index) => {
      const p = sample(racer.distance);
      p.x += p.rx * racer.lane;
      p.z += p.rz * racer.lane;
      const { body, side, light } = vehicles[index];
      const paintwork = [body, side, side, body, light];
      const glass = ["#203746", "#294455", "#203746", "#294455", light];
      const rubber = ["#232735", "#232735", "#232735", "#232735", "#303744"];
      const red = Array(5).fill("#ff5346");
      box(faces, p, 0, .7, 0, 2.14, .54, 3.98, paintwork);
      box(faces, p, 0, 1.13, -.2, 1.66, .43, 1.64, glass);
      box(faces, p, 0, 1.12, -1.8, 1.98, .095, .26, paintwork);
      for (const side of [-1, 1]) {
        box(faces, p, side * .77, .78, -2, .44, .14, .05, red);
        for (const z of [-1.3, 1.28]) box(faces, p, side * .94, .36, z, .35, .64, .68, rubber);
      }
    });
    faces.map(project).filter(Boolean).sort((a, b) => b.depth - a.depth).forEach(paint);
  }

  return { render, setPixelRatio, setSize };
}
