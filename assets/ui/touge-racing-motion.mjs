const angleDifference = (angle, from) => Math.atan2(Math.sin(angle - from), Math.cos(angle - from));

export function smoothRacerPose(track, racer, pose, dt, reset = false) {
  const fresh = reset || racer.id !== pose.id || !Number.isFinite(pose.distance);
  const travel = fresh ? 1 : 1 - Math.exp(-27 * dt);
  const lateral = fresh ? 1 : 1 - Math.exp(-16 * dt);
  pose.distance = fresh ? racer.distance : pose.distance + (racer.distance - pose.distance) * travel;
  pose.lane = fresh ? racer.lane : pose.lane + (racer.lane - pose.lane) * lateral;
  const p = track.sample(pose.distance - 1.7);
  const ahead = track.sample(pose.distance + 1.7);
  const angle = Math.atan2(ahead.x - p.x, ahead.z - p.z) -
    (racer.steer || 0) * (racer.drifting ? .41 : .14);
  pose.yaw = fresh ? angle : pose.yaw + angleDifference(angle, pose.yaw) * (1 - Math.exp(-12 * dt));
  pose.id = racer.id;
  pose.color = racer.color;
  pose.dnf = racer.dnf;
  pose.finishedAt = racer.finishedAt;
  pose.shield = racer.shield;
  pose.drifting = racer.drifting;
  return pose;
}
