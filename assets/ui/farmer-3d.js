import * as THREE from "three";

export function createFarmer(id, type="farmer") {
  const root = new THREE.Group(), body = new THREE.Group(), hips = new THREE.Group();
  root.userData.id = id; root.add(body, hips);
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(.15, 12), new THREE.MeshBasicMaterial({ color: 0x493c2a, transparent: true, opacity: .22, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = .002; root.add(shadow);
  let hash = 0; for (const c of id) hash = (hash * 31 + c.charCodeAt(0)) >>> 0;
  const coat = type==="merchant" ? 0x297a78 : type==="samurai" ? 0x334466 : type==="monk" ? 0x9a6039 : [0x485f73, 0x79674e, 0x657454, 0x685976][hash % 4];
  root.userData.type=type;
  const palette = new Map();
  const material = (color) => {
    if (!palette.has(color)) palette.set(color, new THREE.MeshStandardMaterial({ color, roughness: 1 }));
    return palette.get(color);
  };
  function mesh(parent, geometry, color, x = 0, y = 0, z = 0) {
    const object = new THREE.Mesh(geometry, material(color));
    object.position.set(x, y, z); object.castShadow = false; parent.add(object); return object;
  }
  mesh(body, new THREE.CylinderGeometry(.12, .15, .3, 7), coat);
  mesh(body, new THREE.BoxGeometry(.26, .055, .24), 0x504131, 0, -.07, 0);
  const head = new THREE.Group(); head.position.y = .245; body.add(head);
  mesh(head, new THREE.SphereGeometry(.105, 10, 7), 0xd5aa7a);
  const hat = mesh(head, new THREE.ConeGeometry(.225, .09, 12), 0xc5a15f, 0, .09, 0);
  const brim=mesh(head, new THREE.CylinderGeometry(.23, .23, .018, 12), 0xd5b774, 0, .05, 0);
  hat.visible=brim.visible=type==="farmer";
  if(type==="merchant" || type==="samurai") {
    mesh(head,new THREE.SphereGeometry(.103,8,6),0x272b2b,0,.05,-.02);
    mesh(head,new THREE.BoxGeometry(.045,.055,.085),0x272b2b,0,.125,-.035);
  }
  if(type==="samurai") {
    mesh(body,new THREE.BoxGeometry(.27,.18,.14),0x26384d,0,.01,.08);
    const sword=mesh(hips,new THREE.CylinderGeometry(.025,.025,.48,6),0x2b2f36,-.19,.08,0);sword.rotation.z=-.5;
    mesh(hips,new THREE.BoxGeometry(.12,.025,.055),0xc7a34d,-.085,.28,0);
  }
  if(type==="monk") {
    const beads=mesh(body,new THREE.TorusGeometry(.1,.018,5,12),0x493b2a,0,.12,.125);beads.rotation.x=.4;
    mesh(body,new THREE.CylinderGeometry(.018,.018,.78,5),0x836037,.23,-.12,.03);
    mesh(body,new THREE.TorusGeometry(.045,.009,4,8),0xc7a34d,.23,.29,.03);
  }
  [-.035, .035].forEach((x) => mesh(head, new THREE.SphereGeometry(.012, 5, 4), 0x34352d, x, .01, .094));
  function limb(parent, x, y, length, color) {
    const pivot = new THREE.Group(); pivot.position.set(x, y, 0); parent.add(pivot);
    mesh(pivot, new THREE.CylinderGeometry(.045, .035, length, 6), color, 0, -length / 2, 0);
    return pivot;
  }
  const leftArm = limb(body, -.17, .11, .27, coat), rightArm = limb(body, .17, .11, .27, coat);
  [leftArm, rightArm].forEach((arm) => mesh(arm, new THREE.SphereGeometry(.042, 6, 5), 0xd5aa7a, 0, -.28, 0));
  const leftLeg = limb(hips, -.07, 0, .32, 0x454940), rightLeg = limb(hips, .07, 0, .32, 0x454940);
  [leftLeg, rightLeg].forEach((leg) => mesh(leg, new THREE.BoxGeometry(.08, .035, .13), 0x9e8251, 0, -.31, .025));
  const hoe = new THREE.Group(); hoe.position.set(0, -.27, .015); rightArm.add(hoe);
  mesh(hoe, new THREE.CylinderGeometry(.012, .012, .43, 5), 0x8c683f, 0, -.15, 0);
  mesh(hoe, new THREE.BoxGeometry(.12, .02, .07), 0x646963, .035, -.36, 0);
  const basket = new THREE.Group(); basket.position.set(0, -.3, .04); leftArm.add(basket);
  mesh(basket, new THREE.CylinderGeometry(.1, .075, .12, 8), 0xb38a4f, 0, -.07, 0);
  mesh(basket, new THREE.TorusGeometry(.08, .01, 4, 10, Math.PI), 0x886739, 0, .02, 0);
  const scroll = new THREE.Group(); scroll.position.set(0, -.02, .22); body.add(scroll);
  mesh(scroll, new THREE.BoxGeometry(.21, .015, .13), 0xe9d5a6);
  [-.115, .115].forEach((x) => { const roll = mesh(scroll, new THREE.CylinderGeometry(.018, .018, .15, 6), 0xb69764, x); roll.rotation.x = Math.PI / 2; });
  root.userData.rig = { body, hips, head, hat, leftArm, rightArm, leftLeg, rightLeg, hoe, basket, scroll };
  root.scale.setScalar(.5);
  return root;
}

export function animateFarmer(root, actor) {
  const r = root.userData.rig, t = actor.elapsed;
  const land = globalThis.HKCore.town;
  root.position.set(actor.x + .5 - land.width / 2, 0, actor.y + .5 - land.height / 2); root.rotation.y = actor.heading;
  r.body.position.y = .51; r.hips.position.y = .34;
  r.body.rotation.set(0, 0, 0); r.head.rotation.set(0, 0, 0);
  [r.leftArm, r.rightArm, r.leftLeg, r.rightLeg].forEach((limb) => limb.rotation.set(0, 0, 0));
  r.hoe.visible = actor.action === "farm"; r.basket.visible = actor.action === "shop" || actor.action === "trade" || (actor.type==="merchant" && actor.phase==="walk"); r.scroll.visible = actor.action === "read";
  const swing = Math.sin(t * 9) * .55;
  if (actor.phase === "walk") {
    r.leftLeg.rotation.x = swing; r.rightLeg.rotation.x = -swing;
    r.leftArm.rotation.x = -swing * .75; r.rightArm.rotation.x = swing * .75;
    r.body.position.y += Math.abs(Math.sin(t * 9)) * .018;
  } else if (actor.action === "farm") {
    r.body.rotation.x = .3 + Math.sin(t * 3) * .16;
    r.rightArm.rotation.x = -1.2 + Math.sin(t * 3) * .7;
    r.leftArm.rotation.x = -.65 + Math.sin(t * 3) * .3;
  } else if (actor.action === "pray" || actor.action === "chant") {
    r.body.rotation.x = .12 + Math.max(0, Math.sin(t * 1.6)) * .25;
    r.leftArm.rotation.x = r.rightArm.rotation.x = -1.05;
    r.leftArm.rotation.z = -.35; r.rightArm.rotation.z = .35;
  } else if (actor.action === "rest" || actor.action === "shade") {
    r.body.position.y = .36; r.hips.position.y = .2;
    r.leftLeg.rotation.x = r.rightLeg.rotation.x = -1;
    r.leftArm.rotation.x = -.5; r.rightArm.rotation.x = -.5 + Math.sin(t * 1.6) * .1;
    r.head.rotation.z = Math.sin(t) * .08;
  } else if (actor.action === "look") {
    r.head.rotation.x = -.3; r.rightArm.rotation.x = -2.1; r.rightArm.rotation.z = -.2;
  } else if (actor.action === "read") {
    r.head.rotation.x = .2; r.leftArm.rotation.x = r.rightArm.rotation.x = -1.1;
  } else if (actor.action === "guard") {
    r.head.rotation.y=Math.sin(t*.8)*.4;r.rightArm.rotation.x=-.4;
  } else if (actor.action === "shop" || actor.action === "trade") {
    r.leftArm.rotation.x = -.35; r.rightArm.rotation.x = -.8 + Math.sin(t * 2) * .2;
    r.head.rotation.y = Math.sin(t * .8) * .18;
  } else {
    r.rightArm.rotation.x = -2.5; r.rightArm.rotation.z = Math.sin(t * 4) * .3;
  }
}

export function createFarmerView(scene) {
  const group = new THREE.Group(), people = new Map(); scene.add(group);
  function update(actors) {
    const types = new Map(actors.map((a) => [a.id,a.type || "farmer"]));
    for (const [id, mesh] of people) if (!types.has(id) || types.get(id)!==mesh.userData.type) {
      group.remove(mesh); const materials = new Set();
      mesh.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); materials.add(o.material); } });
      materials.forEach((m) => m.dispose()); people.delete(id);
    }
    for (const actor of actors) {
      if (!people.has(actor.id)) { const mesh = createFarmer(actor.id,actor.type || "farmer"); people.set(actor.id, mesh); group.add(mesh); }
      animateFarmer(people.get(actor.id), actor);
    }
  }
  return { group, people, update };
}
