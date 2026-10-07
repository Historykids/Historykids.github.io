import * as THREE from "three";

// Use the animated head's actual eye position, including the resident's scale.
export function createResidentCamera(camera, controls, people, onChange = () => {}) {
  let id = null, hidden = null, saved = null, yaw = 0, pitch = 0;
  const eye = new THREE.Vector3(), forward = new THREE.Vector3(), rotation = new THREE.Quaternion();
  function exit() {
    if (!id) return;
    if (hidden) hidden.visible = true;
    id = null; hidden = null;
    camera.fov = saved.fov; camera.near = saved.near;
    camera.position.copy(saved.position); controls.target.copy(saved.target);
    controls.enabled = saved.enabled; camera.updateProjectionMatrix(); controls.update();
    saved = null; onChange(null);
  }
  function update() {
    if (!id) return false;
    const person = people.get(id);
    if (!person) { exit(); return false; }
    if (hidden !== person) { if (hidden) hidden.visible = true; hidden = person; }
    person.visible = false;
    person.updateWorldMatrix(true, true);
    const head = person.userData.rig.head;
    eye.set(0, .01, .102); head.localToWorld(eye);
    head.getWorldQuaternion(rotation);
    forward.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)).applyQuaternion(rotation);
    camera.position.copy(eye); controls.target.copy(eye).add(forward);
    camera.up.set(0, 1, 0); camera.lookAt(controls.target);
    camera.updateMatrixWorld(); return true;
  }
  return {
    get id() { return id; },
    watch(next) {
      if (!people.has(next)) return false;
      if (id) exit();
      saved = { fov: camera.fov, near: camera.near, position: camera.position.clone(), target: controls.target.clone(), enabled: controls.enabled };
      id = next; yaw = pitch = 0; controls.enabled = false;
      camera.fov = 75; camera.near = .02; camera.updateProjectionMatrix();
      update(); onChange(next); return true;
    },
    look(dx, dy) {
      if (!id) return;
      yaw -= dx * .006; pitch = THREE.MathUtils.clamp(pitch + dy * .006, -.9, .9); update();
    },
    update, exit,
  };
}
