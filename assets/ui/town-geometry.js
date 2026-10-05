import * as THREE from "three";
const C = globalThis.HKCore;

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
  if (typeof footprint === "number") root.scale.setScalar(footprint / Math.max(size.x, size.z, size.y * .65, .01));
  else {
    const sx = footprint.width / Math.max(size.x, .01), sz = footprint.depth / Math.max(size.z, .01);
    const scale = Math.min(sx, sz, footprint.height / Math.max(size.y, .01));
    if (footprint.stretch) root.scale.set(sx, footprint.height / Math.max(size.y, .01), sz);
    else root.scale.setScalar(scale);
  }
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
    for (let i = 0; i < 8; i++) {
      const plank=box(.82, .07, .22, i%2?0xa98459:0x9d7850, 0, .18, -.805 + i * .23);
      plank.name="bridge-deck";
    }
    [-.36, .36].forEach((x) => {
      [-.86, 0, .86].forEach((z) => box(.065, .42, .065, 0x705139, x, .28, z));
      box(.06, .06, 1.86, 0x705139, x, .46, 0);
      box(.04, .04, 1.86, 0x806046, x, .32, 0);
    });
  } else if (type === "fence") {
    [-.87,.87].forEach(z=>box(.17,.88,.17,0x765038,0,.44,z));
    [.3,.65].forEach(y=>box(.095,.12,1.82,0x98734e,0,y,0));
    [-.6,-.3,0,.3,.6].forEach((z,i)=>{
      box(.06,.62,.15,i%2?0xad895e:0x98734e,.03,.4,z);
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
  const materials = new Set();
  root.traverse((o) => { if (o.isMesh && o.userData.townOwned) { o.geometry.dispose(); materials.add(o.material); } });
  materials.forEach((m) => m.dispose());
}
function createPlot(type, original) {
  const item = C.items.find((i) => i.id === type), root = new THREE.Group();
  const local = !original;
  root.userData.localModel = local;
  const floor = new THREE.Mesh(new THREE.BoxGeometry(item.width - .06, .035, item.depth - .06),
    new THREE.MeshStandardMaterial({ color: type === "field" ? 0x9a9b66 : type === "castle" ? 0xa4a18e : 0xba9e76, roughness: 1 }));
  floor.position.y = .015; floor.receiveShadow = true; floor.userData.townOwned = true; root.add(floor);
  const model = fitModel(original || createBuilding(type), { width: item.width * .9, depth: item.depth * .9, height: item.height, stretch: type !== "fence" });
  if (local) model.traverse((o) => { if (o.isMesh) o.userData.townOwned = true; });
  model.position.y = .034; root.add(model);
  return root;
}

export async function syncBuildings(town, city, loadModel, onError = () => {}) {
  if (town.disposed) return;
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
      entry = { type: b.type, root: createPlot(b.type) };
      town.entries.set(b.id, entry);
      town.buildings.add(entry.root);
      const current = entry;
      current.loading = Promise.resolve().then(() => loadModel(b.type)).then((original) => {
        if (town.disposed || town.entries.get(b.id) !== current) return;
        const detailed = createPlot(b.type, original);
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
    const f = C.footprint(b);
    entry.root.position.set(b.x + f.width / 2 - C.town.width / 2, 0, b.y + f.depth / 2 - C.town.height / 2);
    entry.root.rotation.y = (b.rot || 0) * Math.PI / 180;
    loading.push(entry.loading);
  }
  town.render();
  await Promise.allSettled(loading);
}

export function createGround(scene, mini) {
  const width = mini ? 5 : C.town.width, depth = mini ? 5 : C.town.height;
  const base = new THREE.Mesh(new THREE.BoxGeometry(width, .3, depth),
    new THREE.MeshStandardMaterial({ color: 0xc7ad83, roughness: 1 }));
  base.position.y = -.16; base.receiveShadow = true; scene.add(base);
  if (mini) return base;
  base.name = "town-foundation";
  // The foundation's top used to sit only .002 below thousands of soil tiles.
  // Remove that competing face: there is only one visible floor at any distance.
  const foundation = base.geometry, indices = [], n = foundation.attributes.normal;
  for (let i = 0; i < foundation.index.count; i += 3) {
    const a = foundation.index.getX(i), b = foundation.index.getX(i + 1), c = foundation.index.getX(i + 2);
    if (n.getY(a) > .9 && n.getY(b) > .9 && n.getY(c) > .9) continue;
    indices.push(a, b, c);
  }
  foundation.setIndex(indices); foundation.clearGroups();
  // Broad, softly blended earth tones do not form a repeating one-cell pattern.
  const surface = new THREE.PlaneGeometry(width, depth, Math.ceil(width / 4), Math.ceil(depth / 4));
  const p = surface.attributes.position, colors = [], color = new THREE.Color(0xbbaa8d);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getY(i);
    const variation = 1 + Math.sin(x * .13 + Math.cos(z * .11)) * .018 + Math.cos(z * .17 + x * .06) * .014;
    colors.push(color.r * variation, color.g * variation, color.b * variation);
  }
  surface.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  const earth = new THREE.Mesh(surface, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
  earth.name = "town-earth"; earth.rotation.x = -Math.PI / 2;
  earth.receiveShadow = true; scene.add(earth);
  const vertices = [];
  for (let x = -width / 2; x <= width / 2; x++) vertices.push(x, .02, -depth / 2, x, .02, depth / 2);
  for (let z = -depth / 2; z <= depth / 2; z++) vertices.push(-width / 2, .02, z, width / 2, .02, z);
  const grid = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3)),
    new THREE.LineBasicMaterial({ color: 0x8c7656, transparent: true, opacity: .24 }));
  grid.name = "town-ground-grid"; scene.add(grid);
  const stoneMaterial = new THREE.MeshStandardMaterial({ color: 0x8a877a, roughness: 1 });
  for (let x = .5 - width / 2; x < width / 2; x++) for (const z of [-depth / 2 - .14, depth / 2 + .14]) {
    const stone = new THREE.Mesh(new THREE.BoxGeometry(.94, .2, .24), stoneMaterial);
    stone.position.set(x, -.09, z); stone.receiveShadow = true; scene.add(stone);
  }
  for (let z = .5 - depth / 2; z < depth / 2; z++) for (const x of [-width / 2 - .14, width / 2 + .14]) {
    const stone = new THREE.Mesh(new THREE.BoxGeometry(.24, .2, .94), stoneMaterial);
    stone.position.set(x, -.09, z); stone.receiveShadow = true; scene.add(stone);
  }
  // Placement rays meet the visible soil, not an underground supporting face.
  return earth;
}

export function groundGridOpacity(camera, target, viewportHeight) {
  const distance = camera.position.distanceTo(target);
  if (!distance || !viewportHeight) return 0;
  const angle = Math.abs(camera.position.y - target.y) / distance;
  const pixelsPerCell = viewportHeight * angle / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * distance);
  return .24 * THREE.MathUtils.clamp((pixelsPerCell - 4) / 6, 0, 1);
}
