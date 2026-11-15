import { driveSample } from "./touge-racing-tracks.mjs?v=15";

const angleDifference = (angle, from) => Math.atan2(Math.sin(angle - from), Math.cos(angle - from));

export function smoothRacerPose(track, racer, pose, dt, reset = false) {
  const fresh = reset || racer.id !== pose.id || racer.shortcut !== pose.shortcut || !Number.isFinite(pose.distance);
  const travel = fresh ? 1 : 1 - Math.exp(-27 * dt);
  const lateral = fresh ? 1 : 1 - Math.exp(-16 * dt);
  pose.distance = fresh ? racer.distance : pose.distance + (racer.distance - pose.distance) * travel;
  pose.lane = fresh ? racer.lane : pose.lane + (racer.lane - pose.lane) * lateral;
  const p = driveSample(track, pose.distance - 1.7, racer.shortcut);
  const ahead = driveSample(track, pose.distance + 1.7, racer.shortcut);
  const angle = Math.atan2(ahead.x - p.x, ahead.z - p.z) -
    (racer.steer || 0) * (racer.drifting ? .41 : .14);
  pose.yaw = fresh ? angle : pose.yaw + angleDifference(angle, pose.yaw) * (1 - Math.exp(-12 * dt));
  pose.id = racer.id;
  pose.color = racer.color;
  pose.ghost = racer.ghost;
  pose.shortcut = racer.shortcut;
  pose.dnf = racer.dnf;
  pose.finishedAt = racer.finishedAt;
  pose.shield = racer.shield;
  pose.drifting = racer.drifting;
  return pose;
}
