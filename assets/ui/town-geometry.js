import * as THREE from "three";

export function fitModel(original, footprint) {
  const offset = new THREE.Group();
  offset.add(original.clone(true));
  const box = new THREE.Box3().setFromObject(offset);
  const size = box.getSize(new THREE.Vector3());
  if (box.isEmpty() || !Number.isFinite(size.length())) throw new Error("Empty model");
  const center = box.getCenter(new THREE.Vector3());
  offset.position.set(-center.x, -box.min.y, -center.z);
  offset.traverse((o) => {
    if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; }
  });
  const root = new THREE.Group();
  root.add(offset);
  root.scale.setScalar(footprint / Math.max(size.x, size.z, size.y * .65, .01));
  return root;
}

// A light local model is visible immediately, even when the detailed GLB fails.
export function createBuilding(type) {
  const root = new THREE.Group();
  root.userData.localModel = true;
  const materials = new Map();
  function material(color) {
    if (!materials.has(color)) materials.set(color, new THREE.MeshStandardMaterial({ color, roughness: .95 }));
    return materials.get(color);
  }
  function mesh(geometry, color, x, y, z) {
    const object = new THREE.Mesh(geometry, material(color));
    object.position.set(x, y, z);
    object.castShadow = object.receiveShadow = true;
    root.add(object);
    return object;
  }
  const box = (w, h, d, color, x, y, z) => mesh(new THREE.BoxGeometry(w, h, d), color, x, y, z);
  function roof(w, d, h, y, color = 0x4e5554) {
    const shape = new THREE.Shape();
    shape.moveTo(-w / 2, 0); shape.lineTo(w / 2, 0); shape.lineTo(0, h); shape.closePath();
    mesh(new THREE.ExtrudeGeometry(shape, { depth: d, bevelEnabled: false }), color, 0, y, -d / 2);
  }
  if (type === "road") {
    box(.84, .03, .84, 0xad9b81, 0, .015, 0);
    for (let i = 0; i < 4; i++) box(.78, .025, .16, 0x968d7c, 0, .04, -.3 + i * .2);
  } else if (type === "field") {
    box(.82, .035, .82, 0x806346, 0, .018, 0);
    for (let i = 0; i < 4; i++) box(.1, .09, .72, 0x81904b, -.3 + i * .2, .075, 0);
  } else if (type === "tree") {
    mesh(new THREE.CylinderGeometry(.055, .07, .55, 6), 0x745339, 0, .275, 0);
    mesh(new THREE.ConeGeometry(.36, .62, 7), 0x5c7451, 0, .66, 0);
    mesh(new THREE.ConeGeometry(.28, .48, 7), 0x708557, 0, .94, 0);
  } else if (type === "bridge") {
    for (let i = 0; i < 7; i++) box(.78, .05, .11, 0x9d7850, 0, .13 + .1 * Math.sin(i / 6 * Math.PI), -.36 + i * .12);
    [-.36, .36].forEach((x) => {
      [-.35, 0, .35].forEach((z) => box(.05, .35, .05, 0x705139, x, .25, z));
      box(.045, .045, .83, 0x705139, x, .42, 0);
    });
  } else {
    const castle = type === "castle", temple = type === "temple";
    box(.7, .12, .66, 0x858477, 0, .06, 0);
    box(.62, .4, .55, castle ? 0xe7deca : 0xc5ab80, 0, .32, 0);
    box(.14, .28, .025, 0x654b34, 0, .26, .29);
    [-.22, .22].forEach((x) => box(.1, .14, .025, 0x5e5141, x, .35, .29));
    roof(.86, .78, .23, .52, temple ? 0x6e604b : 0x4e5554);
    if (castle || temple) {
      box(.4, .25, .36, 0xe7deca, 0, .8, 0);
      roof(.6, .54, .2, .925);
    }
    if (type === "shop") box(.64, .07, .16, 0x9f6146, 0, .41, .35);
    if (type === "school") box(.2, .07, .025, 0xc1a56c, 0, .45, .3);
  }
  return root;
}

function disposeLocal(root) {
  if (!root.userData.localModel) return;
  const materials = new Set();
  root.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); materials.add(o.material); } });
  materials.forEach((m) => m.dispose());
}

export async function syncBuildings(town, city, loadModel, onError = () => {}) {
  town.entries ||= new Map();
  const ids = new Set(city.map((b) => b.id));
  for (const [id, entry] of town.entries) {
    if (!ids.has(id)) {
      town.buildings.remove(entry.root); disposeLocal(entry.root); town.entries.delete(id);
    }
  }
  const loading = [];
  for (const b of city) {
    let entry = town.entries.get(b.id);
    if (entry && entry.type !== b.type) {
      town.buildings.remove(entry.root); disposeLocal(entry.root); town.entries.delete(b.id); entry = null;
    }
    if (!entry) {
      entry = { type: b.type, root: createBuilding(b.type) };
      town.entries.set(b.id, entry);
      town.buildings.add(entry.root);
      const current = entry;
      current.loading = Promise.resolve().then(() => loadModel(b.type)).then((original) => {
        if (town.entries.get(b.id) !== current) return;
        const detailed = fitModel(original, .86);
        detailed.position.copy(current.root.position);
        detailed.rotation.copy(current.root.rotation);
        detailed.userData.id = b.id;
        town.buildings.remove(current.root); disposeLocal(current.root);
        current.root = detailed; town.buildings.add(detailed); town.render();
      }).catch((error) => {
        if (town.entries.get(b.id) === current) onError(b.type, error);
      });
    }
    entry.root.userData.id = b.id;
    entry.root.position.set(b.x - 14.5, 0, b.y - 8.5);
    entry.root.rotation.y = (b.rot || 0) * Math.PI / 180;
    loading.push(entry.loading);
  }
  town.render();
  await Promise.allSettled(loading);
}

export function createGround(scene, mini) {
  const base = new THREE.Mesh(new THREE.BoxGeometry(mini ? 5 : 30, .3, mini ? 5 : 18),
    new THREE.MeshStandardMaterial({ color: 0xc7ad83, roughness: 1 }));
  base.position.y = -.16; base.receiveShadow = true; scene.add(base);
  if (mini) return base;
  // Earth plots and faint boundaries use the same 30 by 18 cells as placement.
  const earth = new THREE.InstancedMesh(new THREE.PlaneGeometry(.99, .99),
    new THREE.MeshStandardMaterial({ roughness: 1 }), 540);
  const dummy = new THREE.Object3D(), color = new THREE.Color();
  for (let y = 0; y < 18; y++) for (let x = 0; x < 30; x++) {
    dummy.rotation.x = -Math.PI / 2; dummy.position.set(x - 14.5, -.008, y - 8.5); dummy.updateMatrix();
    earth.setMatrixAt(y * 30 + x, dummy.matrix);
    color.setHSL(.095, .28, .62 + ((x * 17 + y * 13) % 7) * .008);
    earth.setColorAt(y * 30 + x, color);
  }
  earth.receiveShadow = true; scene.add(earth);
  const vertices = [];
  for (let x = -15; x <= 15; x++) vertices.push(x, -.006, -9, x, -.006, 9);
  for (let z = -9; z <= 9; z++) vertices.push(-15, -.006, z, 15, -.006, z);
  const grid = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3)),
    new THREE.LineBasicMaterial({ color: 0x8c7656, transparent: true, opacity: .24 }));
  scene.add(grid);
  const stoneMaterial = new THREE.MeshStandardMaterial({ color: 0x8a877a, roughness: 1 });
  for (let x = -14.5; x < 15; x++) for (const z of [-9.14, 9.14]) {
    const stone = new THREE.Mesh(new THREE.BoxGeometry(.94, .2, .24), stoneMaterial);
    stone.position.set(x, -.09, z); stone.receiveShadow = true; scene.add(stone);
  }
  for (let z = -8.5; z < 9; z++) for (const x of [-15.14, 15.14]) {
    const stone = new THREE.Mesh(new THREE.BoxGeometry(.24, .2, .94), stoneMaterial);
    stone.position.set(x, -.09, z); stone.receiveShadow = true; scene.add(stone);
  }
  return base;
}
