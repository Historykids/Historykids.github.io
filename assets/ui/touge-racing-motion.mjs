import { driveSample, racerWorldPosition } from "./touge-racing-tracks.mjs?v=24";

const angleDifference = (angle, from) => Math.atan2(Math.sin(angle - from), Math.cos(angle - from));

export function smoothRacerPose(track, racer, pose, dt, reset = false) {
  const fresh = reset || racer.id !== pose.id || racer.shortcut !== pose.shortcut || racer.free !== pose.free || !Number.isFinite(pose.distance);
  const travel = fresh ? 1 : 1 - Math.exp(-27 * dt);
  const lateral = fresh ? 1 : 1 - Math.exp(-16 * dt);
  pose.distance = fresh ? racer.distance : pose.distance + (racer.distance - pose.distance) * travel;
  pose.lane = racer.free ? 0 : fresh ? racer.lane : pose.lane + (racer.lane - pose.lane) * lateral;
  const p = driveSample(track, pose.distance - 1.7, racer.shortcut);
  const ahead = driveSample(track, pose.distance + 1.7, racer.shortcut);
  const angle = racer.free ? racer.heading : Math.atan2(ahead.x - p.x, ahead.z - p.z) -
    (racer.steer || 0) * (racer.drifting ? .41 : .14);
  pose.yaw = fresh ? angle : pose.yaw + angleDifference(angle, pose.yaw) * (1 - Math.exp(-12 * dt));
  pose.id = racer.id;
  pose.color = racer.color;
  pose.ghost = racer.ghost;
  pose.shortcut = racer.shortcut;
  pose.free = racer.free;
  if (racer.free) {
    pose.x = fresh ? racer.x : pose.x + (racer.x - pose.x) * travel;
    pose.z = fresh ? racer.z : pose.z + (racer.z - pose.z) * travel;
    pose.heading = pose.yaw;
  }
  pose.dnf = racer.dnf;
  pose.finishedAt = racer.finishedAt;
  pose.cruising = racer.cruising;
  pose.shield = racer.shield;
  pose.drifting = racer.drifting;
  const world=racerWorldPosition(track,racer);
  const ground=track.heightAt?.(world.x,world.z)??0;
  const y=track.manualDrive&&!racer.airborne ? Math.max(ground,racer.airY??0) : racer.airY??0;
  pose.airY=fresh?y:(pose.airY??y)+(y-(pose.airY??y))*travel;
  pose.airborne=racer.airborne;
  pose.verticalSpeed=racer.verticalSpeed??0;
  pose.jumpAge=racer.jumpAge??0;
  pose.trick=racer.trick;
  return pose;
}
