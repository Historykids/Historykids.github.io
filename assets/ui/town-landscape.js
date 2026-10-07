import * as THREE from "three";

const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
function hash(x, z) {
  let n = Math.imul(x, 374761393) ^ Math.imul(z, 668265263) ^ 194703;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}
function noise(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z), u = smooth(0, 1, x - ix), v = smooth(0, 1, z - iz);
  const a = hash(ix, iz), b = hash(ix + 1, iz), c = hash(ix, iz + 1), d = hash(ix + 1, iz + 1);
  return ((a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v) * 2 - 1;
}
function ridges(x, z) {
  let sum = 0, amplitude = .52, weight = 1;
  for (let i = 0; i < 6; i++) {
    const ridge = (1 - Math.abs(noise(x, z))) ** 2;
    sum += ridge * amplitude * weight;
    weight = clamp(ridge * 1.7, .18, 1);
    x = x * 2.07 + 17.3; z = z * 2.07 - 9.1; amplitude *= .49;
  }
  return sum;
}

// Coordinates are the same world units as the buildable town. The protected
// rectangle stays below its floor, including imported larger town layouts.
export function createTerrainField(width, depth) {
  const unit = Math.max(width, depth) / 60, diagonal = Math.hypot(width, depth);
  const clearance = (x, z) => Math.hypot(Math.max(0, Math.abs(x) - width / 2), Math.max(0, Math.abs(z) - depth / 2));
  const riverX = z => width / 2 + unit * (9 + 3.2 * Math.sin(z / unit * .055) + 1.8 * Math.sin(z / unit * .119 + .7));
  const riverDistance = (x, z) => Math.abs(x - riverX(z));
  function height(x, z) {
    const d = clearance(x, z) / unit;
    if (d < 3) return -.18;
    const px = x / unit, pz = z / unit;
    const wx = px + noise(px * .023 + 7, pz * .023) * 12;
    const wz = pz + noise(px * .025 - 31, pz * .025 + 8) * 12;
    const spine = ridges(wx * .045 + 11, wz * .045 - 23);
    const ranges = .72 + .28 * Math.sin(d * .055 + noise(wx * .016, wz * .016) * 3.5);
    let y = diagonal * .83 * smooth(3, 65, d) * (.22 + .78 * spine) * ranges;
    y += unit * .55 * noise(wx * .36, wz * .36) * smooth(4, 18, d);
    // A tributary skirts the town, opening a natural valley through the hills.
    y *= smooth(4.5 * unit, 12 * unit, riverDistance(x, z));
    return Math.max(-.18, y - .18);
  }
  function normal(x, z) {
    const e = unit * .24;
    return new THREE.Vector3(height(x - e, z) - height(x + e, z), e * 2, height(x, z - e) - height(x, z + e)).normalize();
  }
  function color(x, z, y, n, photographic = false) {
    const d = clearance(x, z) / unit, patch = noise(x / unit * .1, z / unit * .1);
    const forest = smooth(4, 15, d);
    const c = new THREE.Color().setHSL(.205 + patch * .018, .24, .39 + patch * .035);
    c.lerp(new THREE.Color().setHSL(.29 + patch * .018, .48 + patch * .025, .105 + patch * .025), forest);
    const rock = smooth(.32, .77, 1 - n.y) * smooth(diagonal * .12, diagonal * .42, y);
    c.lerp(new THREE.Color(0x777c69), rock * .7);
    const light = .46 + .7 * Math.max(0, n.dot(new THREE.Vector3(-.46, .79, .4)));
    if (photographic) c.setRGB(.79 + patch * .04, .85 + patch * .035, .73 + patch * .035);
    return c.multiplyScalar(light);
  }
  return { width, depth, unit, diagonal, clearance, riverX, riverDistance, height, normal, color };
}

function terrainGeometry(field, angular = 240, radial = 112) {
  const { width, depth, diagonal } = field, positions = [], colors = [], uvs = [], indices = [];
  for (let r = 0; r <= radial; r++) for (let a = 0; a <= angular; a++) {
    const angle = a / angular * Math.PI * 2, ca = Math.cos(angle), sa = Math.sin(angle);
    const inner = Math.min(width / 2 / Math.max(Math.abs(ca), .0001), depth / 2 / Math.max(Math.abs(sa), .0001)) - .35;
    const distance = inner + (diagonal * 5 - inner) * (r / radial) ** 1.75;
    const x = ca * distance, z = sa * distance, y = field.height(x, z), n = field.normal(x, z);
    positions.push(x, y, z);
    const c = field.color(x, z, y, n); colors.push(c.r, c.g, c.b);
    uvs.push(x / (field.unit * 40), z / (field.unit * 40));
    if (r < radial && a < angular) {
      const i = r * (angular + 1) + a, j = i + angular + 1;
      indices.push(i, i + 1, j, j, i + 1, j + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices); geometry.computeVertexNormals(); geometry.computeBoundingSphere();
  return geometry;
}

function forestTexture() {
  const size = 256, bytes = new Uint8Array(size * size * 4);
  for (let z = 0; z < size; z++) for (let x = 0; x < size; x++) {
    const broad = noise(x / 12, z / 12), crown = noise(x / 3, z / 3);
    const dapple = .72 + broad * .13 + crown * .12 + hash(x, z) * .07;
    const i = (z * size + x) * 4;
    bytes[i] = clamp(dapple) * 255; bytes[i + 1] = clamp(dapple + .015) * 255; bytes[i + 2] = clamp(dapple - .025) * 255; bytes[i + 3] = 255;
  }
  const texture = new THREE.DataTexture(bytes, size, size);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter; texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true; texture.needsUpdate = true;
  return texture;
}

function forest(field, limit = 1700, attempts = 7000, detail = 1) {
  const spots = [], radius = field.diagonal * 1.9;
  for (let i = 0; i < attempts && spots.length < limit; i++) {
    const angle = hash(i, 41) * Math.PI * 2, distance = Math.sqrt(hash(i, 12)) * radius;
    const x = Math.cos(angle) * distance, z = Math.sin(angle) * distance, d = field.clearance(x, z) / field.unit;
    if (d < 6 || d > 85 || field.riverDistance(x, z) < field.unit * 2.5) continue;
    const y = field.height(x, z), n = field.normal(x, z);
    if (n.y < .56 || hash(i, 44) > .72 + noise(x / 18, z / 18) * .2) continue;
    spots.push({ x, y, z, i });
  }
  const mesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, detail), new THREE.MeshBasicMaterial({ color: 0xffffff }), spots.length);
  const object = new THREE.Object3D(); mesh.name = "wooded-foothills"; mesh.userData.canopy = true;
  for (let i = 0; i < spots.length; i++) {
    const s = spots[i], size = (.45 + hash(s.i, 17) * .7) * Math.min(field.unit, 1.6);
    object.position.set(s.x, s.y + size * .6, s.z); object.scale.set(size, size * (1.1 + hash(s.i, 18) * .6), size * .85);
    object.rotation.y = hash(s.i, 19) * Math.PI; object.updateMatrix(); mesh.setMatrixAt(i, object.matrix);
    mesh.setColorAt(i, new THREE.Color().setHSL(.285 + hash(s.i, 26) * .025, .46, .09 + hash(s.i, 21) * .035));
  }
  mesh.geometry.computeVertexNormals();
  // Baked facet lighting also works without custom WebGL shaders.
  const normals = mesh.geometry.attributes.normal, colors = [];
  for (let i = 0; i < normals.count; i++) { const light = .6 + .4 * Math.max(0, normals.getY(i)); colors.push(light, light, light); }
  mesh.geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3)); mesh.material.vertexColors = true;
  return mesh;
}

function river(field, segments = 600) {
  const positions = [], colors = [], indices = [], extent = field.diagonal * 3;
  for (let i = 0; i <= segments; i++) {
    const z = -extent + i / segments * extent * 2, x = field.riverX(z), width = field.unit * (.56 + .17 * Math.sin(z / field.unit * .07));
    for (const side of [-1, 1]) {
      const px = x + width * side;
      positions.push(px, field.height(px, z) + .065, z);
      const c = new THREE.Color(side === -1 ? 0x477d83 : 0x7ca3a1); colors.push(c.r, c.g, c.b);
    }
    if (i < segments) { const j = i * 2; indices.push(j, j + 2, j + 1, j + 1, j + 2, j + 3); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));g.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));g.setIndex(indices);
  const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide })); mesh.name = "valley-stream";return mesh;
}

export function createLandscape(scene, width, depth, { quality = "light" } = {}) {
  const lightweight = quality !== "detail";
  const field = createTerrainField(width, depth), group = new THREE.Group(); group.name = "surrounding-mountain-landscape";
  const texture = forestTexture();
  // Share one reduced mesh between WebGL and the software fallback in the default
  // view. Keep the same terrain field, town clearance and photographic forest.
  const geometry = lightweight ? terrainGeometry(field, 120, 64) : terrainGeometry(field);
  const terrain = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ vertexColors: true, map: texture }));
  terrain.name = "continuous-ridges-and-valleys";
  if (!lightweight) terrain.userData.softwareGeometry = terrainGeometry(field, 160, 80);
  const trees = lightweight ? forest(field, 400, 2000, 0) : forest(field);
  group.add(terrain, trees, river(field, lightweight ? 200 : 600));
  scene.add(group);
  scene.background = new THREE.Color(0xb9ced3);
  scene.fog = new THREE.Fog(0xb9ced3, field.diagonal * 1.7, field.diagonal * 6.5);
  let disposed = false, detailedTexture = null;
  // The scenery works immediately and offline. Its photographic canopy arrives
  // separately, so slow image loading never blocks placement or the town.
  const ready = typeof document === "undefined" ? Promise.resolve(false) : Promise.resolve().then(() =>
    new THREE.TextureLoader().loadAsync(new URL("../textures/mountain-forest-20261003.webp", import.meta.url).href)
  ).then(detail => {
    if (disposed) { detail.dispose(); return false; }
    detailedTexture = detail; detail.userData.forestCanopy = true; detail.wrapS = detail.wrapT = THREE.RepeatWrapping;
    detail.colorSpace = THREE.SRGBColorSpace; detail.anisotropy = 4; detail.needsUpdate = true;
    for (const geometry of [terrain.geometry, terrain.userData.softwareGeometry].filter(Boolean)) {
      const p = geometry.attributes.position, colors = geometry.attributes.color;
      for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i), c = field.color(x, z, p.getY(i), field.normal(x, z), true);colors.setXYZ(i, c.r, c.g, c.b); }
      colors.needsUpdate = true;
    }
    terrain.material.map = detail; terrain.material.needsUpdate = true;
    // The photograph already contains continuous crowns. Extra rounded trees
    // would cover its fine canopy detail; keep them for the offline material.
    trees.visible = false;
    return true;
  }).catch(() => false);
  return {
    group, field, ready, quality: lightweight ? "light" : "detail",
    dispose() { disposed = true; const materials = new Set(); group.traverse(o => { if(o.isMesh) {o.geometry.dispose();o.userData.softwareGeometry?.dispose();materials.add(o.material);} });materials.forEach(m=>m.dispose());texture.dispose();detailedTexture?.dispose();scene.remove(group); }
  };
}
