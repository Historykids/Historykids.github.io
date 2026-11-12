import * as THREE from "../vendor/three.module.js";
import { createCanvasRenderer } from "./touge-racing-canvas.js";

export const ROAD_HALF = 7.2;
export const LAPS = 3;

const waypoints = [
  [-51, 69], [-4, 70], [52, 76], [86, 60], [98, 26], [86, -9],
  [58, -45], [30, -43], [4, -62], [-33, -79], [-73, -65],
  [-103, -32], [-107, 15], [-89, 49]
];
const curve = new THREE.CatmullRomCurve3(
  waypoints.map(([x, z]) => new THREE.Vector3(x, 0, z)),
  true
);
curve.arcLengthDivisions = 1200;
export const TRACK_LENGTH = curve.getLength();

const segments = 560;
const step = TRACK_LENGTH / segments;
const samples = Array.from({ length: segments }, (_, i) => curve.getPointAt(i / segments));

export const BOOST_PADS = [
  { distance: TRACK_LENGTH * .065, lane: 0 },
  { distance: TRACK_LENGTH * .485, lane: -2.5 },
  { distance: TRACK_LENGTH * .83, lane: 2.5 }
];
export const PAD_LENGTH = 9;
export const PAD_HALF_WIDTH = 2.35;

export function trackSample(distance, out = {}) {
  const index = ((distance % TRACK_LENGTH + TRACK_LENGTH) % TRACK_LENGTH) / step;
  const base = Math.floor(index);
  const a = samples[base % segments];
  const b = samples[(base + 1) % segments];
  const before = samples[(base + segments - 1) % segments];
  const after = samples[(base + 2) % segments];
  const alpha = index - base;
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const fx = dx + .5 * ((1 - alpha) * (a.x - before.x - dx) + alpha * (after.x - b.x - dx));
  const fz = dz + .5 * ((1 - alpha) * (a.z - before.z - dz) + alpha * (after.z - b.z - dz));
  const magnitude = Math.hypot(fx, fz);
  out.x = a.x + dx * alpha;
  out.z = a.z + dz * alpha;
  out.fx = fx / magnitude;
  out.fz = fz / magnitude;
  out.rx = -out.fz;
  out.rz = out.fx;
  return out;
}

function ribbon(scene, material, left, right, y, from = 0, to = TRACK_LENGTH) {
  const vertices = [];
  const indices = [];
  appendRibbon(vertices, indices, left, right, y, from, to);
  addSurface(scene, material, vertices, indices);
}

function appendRibbon(vertices, indices, left, right, y, from, to) {
  const count = Math.ceil((to - from) / step);
  const offset = vertices.length / 3;
  for (let i = 0; i <= count; i++) {
    const p = trackSample(from + (to - from) * i / count);
    vertices.push(p.x + p.rx * left, y, p.z + p.rz * left);
    vertices.push(p.x + p.rx * right, y, p.z + p.rz * right);
    const index = offset + i * 2;
    if (i < count) indices.push(index, index + 1, index + 2, index + 1, index + 3, index + 2);
  }
}

function addSurface(scene, material, vertices, indices) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  scene.add(new THREE.Mesh(geometry, material));
}

function box(group, material, x, y, z, w, h, d) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  group.add(mesh);
  return mesh;
}

function place(object, distance, lane, height = 0) {
  const p = trackSample(distance);
  object.position.set(p.x + p.rx * lane, height, p.z + p.rz * lane);
  object.rotation.y = Math.atan2(p.fx, p.fz);
}

const flat = color => new THREE.MeshLambertMaterial({ color });
const bright = color => new THREE.MeshBasicMaterial({ color });

function buildRoad(scene) {
  const surfaces = new Map();
  function strip(material, left, right, y, from = 0, to = TRACK_LENGTH) {
    if (!surfaces.has(material)) surfaces.set(material, { vertices: [], indices: [] });
    const { vertices, indices } = surfaces.get(material);
    appendRibbon(vertices, indices, left, right, y, from, to);
  }
  const white = bright(0xe8edf2);
  const red = flat(0xcc4339);
  const kerb = flat(0xe9d9b8);
  const lanes = flat(0xd2b984);
  strip(flat(0x51463e), -ROAD_HALF - 1.25, ROAD_HALF + 1.25, .09);
  strip(flat(0x292d37), -ROAD_HALF, ROAD_HALF, .14);
  strip(white, -ROAD_HALF + .22, -ROAD_HALF + .38, .17);
  strip(white, ROAD_HALF - .38, ROAD_HALF - .22, .17);

  for (let distance = 0; distance < TRACK_LENGTH; distance += 8) {
    strip(lanes, -.075, .075, .17, distance, distance + 3.5);
  }
  const blocks = Math.round(TRACK_LENGTH / 3.6);
  const block = TRACK_LENGTH / blocks;
  for (let i = 0; i < blocks; i++) {
    const material = i % 2 ? red : kerb;
    for (const side of [-1, 1]) {
      const edge = side * ROAD_HALF;
      const left = side < 0 ? edge - .65 : edge;
      strip(material, left, left + .65, .155, i * block, (i + 1) * block);
    }
  }

  const dark = bright(0x242c36);
  for (let i = 0; i < 14; i++) {
    for (let row = 0; row < 2; row++) {
      strip((i + row) % 2 ? white : dark, i - 7, i - 6, .18,
        row * .75 - .75, row * .75);
    }
  }

  const padColor = bright(0x137db1);
  const padLine = bright(0xa3edff);
  for (const pad of BOOST_PADS) {
    strip(padColor, pad.lane - PAD_HALF_WIDTH, pad.lane + PAD_HALF_WIDTH,
      .18, pad.distance, pad.distance + PAD_LENGTH);
    for (let i = 0; i < 3; i++) {
      const arrow = new THREE.Group();
      place(arrow, pad.distance + 1.8 + i * 2.6, pad.lane, .19);
      for (const side of [-1, 1]) {
        const wing = box(arrow, padLine, side * .72, 0, 0, 1.75, .016, .2);
        wing.rotation.y = side * .43;
      }
      scene.add(arrow);
    }
  }
  for (const [material, { vertices, indices }] of surfaces) {
    addSurface(scene, material, vertices, indices);
  }
}

function makeSky(scene) {
  const sun = new THREE.Vector3(.81, .185, .5).normalize();
  const sky = new THREE.Mesh(new THREE.SphereGeometry(515, 24, 12), new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: { sun: { value: sun } },
    vertexShader: `
      varying vec3 vPosition;
      void main() {
        vPosition = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 sun;
      varying vec3 vPosition;
      void main() {
        vec3 direction = normalize(vPosition);
        float y = direction.y;
        float azimuth = dot(normalize(vec3(direction.x, 0.0, direction.z + .0001)), normalize(vec3(sun.x, 0.0, sun.z)));
        float glow = pow(max(0.0, azimuth), 4.0);
        vec3 horizon = mix(vec3(.67, .44, .41), vec3(1.0, .65, .39), glow);
        vec3 color = mix(horizon, vec3(.16, .33, .51), smoothstep(-.015, .65, y));
        float alignment = max(0.0, dot(direction, sun));
        color += pow(alignment, 38.0) * vec3(.19, .09, .015);
        color = mix(color, vec3(1.0, .87, .62), smoothstep(.9987, .9991, alignment));
        gl_FragColor = vec4(color, 1.0);
      }
    `
  }));
  scene.add(sky);
  const light = new THREE.DirectionalLight(0xffcfaa, 2.05);
  light.position.set(sun.x * 100, 38, sun.z * 100);
  scene.add(light, new THREE.HemisphereLight(0xe5e8ff, 0x5c5147, 1.65));
  return sky;
}

function instances(scene, geometry, material, transforms) {
  const group = new THREE.InstancedMesh(geometry, material, transforms.length);
  const dummy = new THREE.Object3D();
  transforms.forEach(([x, y, z, w, h, d, yaw = 0], i) => {
    dummy.position.set(x, y, z);
    dummy.scale.set(w, h, d);
    dummy.rotation.y = yaw;
    dummy.updateMatrix();
    group.setMatrixAt(i, dummy.matrix);
  });
  scene.add(group);
}

function landscape(scene) {
  box(scene, flat(0x4a624d), -9, -.69, -95, 305, 1.37, 380);
  box(scene, flat(0x62564b), -8, -1.11, 92.4, 305, 1.2, 8);
  box(scene, flat(0x317181), 0, -1.8, 0, 1000, .45, 1000);

  let seed = 1347;
  function random() {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 2 ** 32;
  }

  const ranges = [
    [[-153, -90, 65], [-105, -126, 49], [-72, -124, 69], [-18, -131, 47], [48, -139, 66], [107, -108, 61], [136, -65, 47]],
    [[-179, 17, 53], [-168, -34, 68], [-158, -115, 82], [-107, -177, 70], [-43, -183, 88], [45, -185, 85], [152, -140, 70]],
    [[174, 177, 24], [187, 182, 35], [216, 200, 43], [-169, 207, 27], [-194, 219, 43]]
  ];
  const peak = new THREE.ConeGeometry(1, 1, 5);
  ranges.forEach((range, i) => {
    instances(scene, peak, flat([0x4a6158, 0x3f5356, 0x47616c][i]), range.map(([x, z, height]) =>
      [x, height * .5 - 1.5, z, height * (.75 + random() * .45), height, height, random() * Math.PI]));
  });

  const trees = [];
  const trunks = [];
  const rocks = [];
  const bounds = samples.filter((_, i) => i % 3 === 0);
  for (let i = 0; i < 360; i++) {
    const x = random() * 290 - 155;
    const z = random() * 220 - 132;
    const scale = .65 + random() * 1.05;
    if (bounds.some(p => Math.hypot(p.x - x, p.z - z) < 12.5 + scale)) continue;
    const yaw = random() * Math.PI;
    trees.push([x, 3.35 * scale, z, 1.9 * scale, 4.4 * scale, 1.9 * scale, yaw]);
    trunks.push([x, .76 * scale, z, .37 * scale, 1.5 * scale, .37 * scale, yaw]);
  }
  instances(scene, new THREE.ConeGeometry(1, 1, 5), flat(0x315b49), trees);
  instances(scene, new THREE.BoxGeometry(1, 1, 1), flat(0x6f5143), trunks);

  const swells = [];
  for (let i = 0; i < 145; i++) {
    const x = random() * 430 - 215;
    const z = 98 + random() * 155;
    swells.push([x, -1.55, z, 1.7 + random() * 11, .025, .12 + random() * .38, -.15]);
    if (i < 75) {
      const size = .7 + random() * 2;
      rocks.push([random() * 298 - 158, -.6, 90 + random() * 9, size * 1.55, size, size, random() * 4]);
    }
  }
  instances(scene, new THREE.DodecahedronGeometry(1), flat(0x655c57), rocks);
  instances(scene, new THREE.BoxGeometry(1, 1, 1), flat(0x59979f), swells);
}

function roadside(scene) {
  const orange = flat(0xc34f36);
  const roof = flat(0x283944);
  const concrete = flat(0xc6ab8a);
  const gate = new THREE.Group();
  for (const x of [-8.8, 8.8]) {
    box(gate, concrete, x, .27, 0, 1.48, .54, 1.52);
    box(gate, orange, x, 4, 0, .72, 7.7, .72);
  }
  box(gate, orange, 0, 6.17, 0, 20, .62, .72);
  box(gate, orange, 0, 7.7, 0, 21.1, .6, .95);
  box(gate, roof, 0, 8.07, 0, 22, .27, 1.35);
  box(gate, orange, 0, 6.97, 0, .85, 1.26, .6);
  place(gate, 0, 0);
  scene.add(gate);

  const lamp = flat(0x303e46);
  const bulb = bright(0xffd486);
  const lamps = [17, 28, 88, 100, 112, TRACK_LENGTH - 14];
  for (const distance of lamps) {
    const post = new THREE.Group();
    box(post, lamp, 0, 2.05, 0, .19, 4.1, .19);
    box(post, lamp, -.55, 4, 0, 1.25, .2, .24);
    box(post, bulb, -1.02, 3.88, 0, .45, .09, .34);
    place(post, distance, -ROAD_HALF - 1.75);
    post.rotateY(Math.PI);
    scene.add(post);
  }

  const metal = flat(0x9ea9a6);
  const posts = [];
  for (let distance = 8; distance < TRACK_LENGTH * .36; distance += 4.5) {
    const p = trackSample(distance);
    const lane = ROAD_HALF + 1.18;
    posts.push([p.x + p.rx * lane, .43, p.z + p.rz * lane, .24, .86, .25,
      Math.atan2(p.fx, p.fz)]);
  }
  instances(scene, new THREE.BoxGeometry(1, 1, 1), metal, posts);
  ribbon(scene, metal, ROAD_HALF + 1.01, ROAD_HALF + 1.35, .8, 7, TRACK_LENGTH * .36);
}

const carGlass = flat(0x192e3f);
const carTrim = flat(0x242931);
const tires = flat(0x161a20);
const rims = flat(0x9da7b6);
const taillight = bright(0xff513e);
const headlight = bright(0xffe9bd);

function car(scene, paint) {
  const group = new THREE.Group();
  const body = flat(paint);
  box(group, carTrim, 0, .42, 0, 2.12, .27, 3.95);
  box(group, body, 0, .74, .05, 2.15, .44, 3.95);
  box(group, body, 0, .99, .94, 1.98, .16, 1.7);
  box(group, body, 0, .99, -1.31, 1.97, .16, 1.18);
  box(group, carGlass, 0, 1.17, -.28, 1.68, .37, 1.63);
  box(group, body, 0, 1.38, -.31, 1.62, .12, 1.22);
  box(group, carGlass, 0, 1.15, .52, 1.64, .2, .56).rotation.x = -.44;
  box(group, carGlass, 0, 1.15, -1.06, 1.62, .17, .55).rotation.x = .42;
  box(group, body, 0, 1.22, -1.76, 2.04, .12, .29);
  for (const x of [-.79, .79]) {
    box(group, carTrim, x, 1.11, -1.76, .13, .22, .16);
    box(group, taillight, x, .78, -1.939, .45, .17, .1);
    box(group, headlight, x, .78, 2.025, .44, .16, .075);
  }
  for (const x of [-1.05, 1.05]) {
    for (const z of [-1.28, 1.25]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(.39, .39, .28, 12), tires);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(x, .4, z);
      group.add(wheel);
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(.23, .23, .29, 8), rims);
      hub.rotation.copy(wheel.rotation);
      hub.position.copy(wheel.position);
      group.add(hub);
    }
  }
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(2.75, 4.6), new THREE.MeshBasicMaterial({
    color: 0x171a20, transparent: true, opacity: .37, depthWrite: false
  }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = .024;
  group.add(shadow);
  scene.add(group);
  return group;
}

export function createScene(canvas, racers) {
  const attributes = { antialias: true, alpha: false };
  const context = canvas.getContext("webgl2", attributes) || canvas.getContext("webgl", attributes);
  const renderer = context
    ? new THREE.WebGLRenderer({ canvas, context })
    : createCanvasRenderer(canvas, racers, {
        sample: trackSample, length: TRACK_LENGTH, halfWidth: ROAD_HALF,
        pads: BOOST_PADS, padLength: PAD_LENGTH, padHalfWidth: PAD_HALF_WIDTH
      });
  const scene = new THREE.Scene();
  let sky;
  let cars = [];
  if (context) {
    scene.fog = new THREE.FogExp2(0xc99982, .0036);
    sky = makeSky(scene);
    landscape(scene);
    buildRoad(scene);
    roadside(scene);
    cars = racers.map(racer => car(scene, racer.color));
  }

  const camera = new THREE.PerspectiveCamera(61, 1, .12, 720);
  const frame = {};
  const next = {};
  const eye = new THREE.Vector3();
  const target = new THREE.Vector3();
  const aim = new THREE.Vector3();
  let portrait = false;

  function resize(width, height) {
    portrait = width < height;
    camera.aspect = width / height;
    camera.fov = portrait ? 68 : 61;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, portrait ? 1.35 : 1.5));
    renderer.setSize(width, height, false);
  }

  function render(state, dt, resetCamera) {
    cars.forEach((model, index) => {
      const racer = racers[index];
      const p = trackSample(racer.distance, frame);
      model.position.set(p.x + p.rx * racer.lane, .18, p.z + p.rz * racer.lane);
      model.rotation.y = Math.atan2(p.fx, p.fz) - racer.steer * .17;
    });

    const player = racers[0];
    const p = trackSample(player.distance, frame);
    const lookingAhead = trackSample(player.distance + 27, next);
    const intro = state === "ready";
    const back = intro ? (portrait ? 14 : 16) : (portrait ? 11.4 : 10.6);
    const lane = player.lane + (intro && !portrait ? -11.4 : 0);
    eye.set(p.x - p.fx * back + p.rx * lane, intro ? 6.7 : 4.65, p.z - p.fz * back + p.rz * lane);
    target.set(lookingAhead.x + p.rx * (intro ? -1 : player.lane * .36),
      intro ? 2.75 : 2.65, lookingAhead.z + p.rz * (intro ? -1 : player.lane * .36));
    const ease = resetCamera ? 1 : 1 - Math.exp(-10 * dt);
    camera.position.lerp(eye, ease);
    if (sky) sky.position.copy(camera.position);
    aim.lerp(target, ease);
    camera.lookAt(aim);
    renderer.render(scene, camera);
  }

  return { render, resize };
}
