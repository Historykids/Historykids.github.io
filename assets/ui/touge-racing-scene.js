import { coachwork } from "./touge-racing-coachwork.mjs?v=25";
import * as THREE from "../vendor/three.module.js";
import { createCanvasRenderer } from "./touge-racing-canvas.js?v=26";
import { worldScenery } from "./touge-racing-world.mjs?v=25";
import { ITEM_LANES, ITEM_ZONE_AFTER, ITEM_ZONE_BEFORE, driveSample, nearShortcut, racerSample, roadHeight, SHORTCUT_COLOR } from "./touge-racing-tracks.mjs?v=25";
import { smoothRacerPose } from "./touge-racing-motion.mjs?v=25";
import { DOPA_COLORS, DOPA_SKY, ITEMS, PULSE_LIFETIME, boostRemaining, isRoughSurface, pulsePosition } from "./touge-racing-rules.mjs?v=25";

function ribbon(track, scene, material, left, right, y, from = 0, to = track.length) {
  const vertices = [];
  const indices = [];
  appendRibbon(track, vertices, indices, left, right, y, from, to);
  addSurface(scene, material, vertices, indices);
}

function appendRibbon(track, vertices, indices, left, right, y, from, to) {
  const count = Math.ceil((to - from) / 1.1);
  const offset = vertices.length / 3;
  for (let i = 0; i <= count; i++) {
    const p = track.sample(from + (to - from) * i / count);
    const base=roadHeight(track,from+(to-from)*i/count);
    vertices.push(p.x + p.rx * left, base+y, p.z + p.rz * left);
    vertices.push(p.x + p.rx * right, base+y, p.z + p.rz * right);
    const index = offset + i * 2;
    if (i < count) indices.push(index, index + 1, index + 2, index + 1, index + 3, index + 2);
  }
}

function addSurface(scene, material, vertices, indices) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  if(material.map)geometry.setAttribute("uv",new THREE.Float32BufferAttribute(vertices.flatMap((v,i)=>i%3===0?[v/7,vertices[i+2]/7]:[]),2));
  geometry.computeVertexNormals();
  const mesh=new THREE.Mesh(geometry, material);
  mesh.receiveShadow=true;
  scene.add(mesh);
}

function box(group, material, x, y, z, w, h, d) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  group.add(mesh);
  return mesh;
}

function place(track, object, distance, lane, height = 0) {
  const p = track.sample(distance);
  object.position.set(p.x + p.rx * lane, roadHeight(track,distance)+height, p.z + p.rz * lane);
  object.rotation.y = Math.atan2(p.fx, p.fz);
}

const flat = color => new THREE.MeshStandardMaterial({ color, roughness:.82, metalness:.04 });
const bright = color => new THREE.MeshBasicMaterial({ color });

function buildRoad(scene, track, neon) {
  const { length: TRACK_LENGTH, halfWidth: ROAD_HALF, pads: BOOST_PADS, padLength: PAD_LENGTH, padHalfWidth: PAD_HALF_WIDTH } = track;
  const surfaces = new Map();
  function strip(material, left, right, y, from = 0, to = TRACK_LENGTH) {
    if (!surfaces.has(material)) surfaces.set(material, { vertices: [], indices: [] });
    const { vertices, indices } = surfaces.get(material);
    appendRibbon(track, vertices, indices, left, right, y, from, to);
  }
  const white = bright(0xe8edf2);
  const red = flat(track.signature ? track.colors[5] : 0xcc4339);
  const kerb = flat(0xe9d9b8);
  const lanes = flat(0xd2b984);
  strip(flat(0x51463e), -ROAD_HALF - 1.25, ROAD_HALF + 1.25, .09);
  const asphalt=flat(track.signature ? {firn:0x9aa3a9,meridian:0xb1aaa1,puna:0x848991}[track.id] : 0x292d37);
  if(track.signature) asphalt.roughness=track.id==="meridian"?.43:.77;
  const pixels=document.createElement("canvas");
  pixels.width=pixels.height=128;
  const paint=pixels.getContext("2d");
  if(paint){
    paint.fillStyle="#414651";paint.fillRect(0,0,128,128);
    let seed=41;
    for(let i=0;i<6500;i++){
      seed=(Math.imul(seed,1664525)+1013904223)>>>0;
      const x=seed%128,y=(seed>>>8)%128;
      paint.fillStyle=i%2?"#555b65":"#2e333d";paint.fillRect(x,y,1,1);
    }
    const texture=new THREE.CanvasTexture(pixels);
    texture.colorSpace=THREE.SRGBColorSpace;
    texture.anisotropy=4;
    texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
    texture.repeat.set(1,1);
    asphalt.map=texture;
  }
  strip(asphalt, -ROAD_HALF, ROAD_HALF, .14);
  if (neon) {
    const accents = DOPA_COLORS.map(bright);
    for (let from = 0, i = 0; from < TRACK_LENGTH; from += 25, i++) {
      const to = Math.min(TRACK_LENGTH, from + 25);
      strip(accents[i % accents.length], -ROAD_HALF + .06, -ROAD_HALF + .47, .171, from, to);
      strip(accents[(i + 3) % accents.length], ROAD_HALF - .47, ROAD_HALF - .06, .171, from, to);
    }
  } else {
    strip(white, -ROAD_HALF + .22, -ROAD_HALF + .38, .17);
    strip(white, ROAD_HALF - .38, ROAD_HALF - .22, .17);
  }

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

  const padColor = bright(neon ? 0x8b268e : 0x137db1);
  const padLine = bright(neon ? 0xffeb6c : 0xa3edff);
  for (const pad of BOOST_PADS) {
    strip(padColor, pad.lane - PAD_HALF_WIDTH, pad.lane + PAD_HALF_WIDTH,
      .18, pad.distance, pad.distance + PAD_LENGTH);
    for (let i = 0; i < 3; i++) {
      const arrow = new THREE.Group();
      place(track, arrow, pad.distance + 1.8 + i * 2.6, pad.lane, .19);
      for (const side of [-1, 1]) {
        const wing = box(arrow, padLine, side * .72, 0, 0, 1.75, .016, .2);
        wing.rotation.y = side * .43;
      }
      scene.add(arrow);
    }
  }
  const cut = track.shortcut;
  if (cut && !track.offroad && !track.terrain) {
    const gold = bright(SHORTCUT_COLOR);
    ribbon(cut, scene, flat(0x554637), -cut.halfWidth, cut.halfWidth, .168);
    for (const side of [-1, 1]) {
      const edge = side * (cut.halfWidth - .22);
      ribbon(cut, scene, gold, edge - .18, edge + .18, .184);
    }
    strip(gold, cut.lane - 1.6, cut.lane + 1.6, .179, cut.from - 3.5, cut.from + 1);
    strip(gold, cut.lane - .28, cut.lane + .28, .178, cut.from - 43, cut.from - 3.5);
  }
  if(track.manualDrive) for(const ramp of track.ramps){
    const vertices=[],indices=[],steps=12;
    for(let i=0;i<=steps;i++){
      const distance=ramp.distance+ramp.length*i/steps,p=track.sample(distance);
      for(const side of [-1,1])vertices.push(p.x+p.rx*(ramp.lane+side*ramp.halfWidth),
        roadHeight(track,distance)+.2+ramp.height*i/steps,p.z+p.rz*(ramp.lane+side*ramp.halfWidth));
      if(i<steps){const a=i*2;indices.push(a,a+1,a+2,a+1,a+3,a+2);}
    }
    addSurface(scene,flat(track.newCourse?0x176f91:0x254c7c),vertices,indices);
    for(let i=0;i<4;i++){
      const group=new THREE.Group(),t=(i+.5)/4;
      place(track,group,ramp.distance+ramp.length*t,ramp.lane,ramp.height*t+.23);
      for(const side of [-1,1]){
        const arrow=box(group,bright(0x9effdd),side*.75,0,0,1.9,.03,.3);
        arrow.rotation.y=side*.5;
      }
      scene.add(group);
    }
  }
  for (const [material, { vertices, indices }] of surfaces) {
    addSurface(scene, material, vertices, indices);
  }
}

function makeSky(scene, track, colors) {
  const asRGB = value => new THREE.Vector3(
    parseInt(value.slice(1, 3), 16) / 255,
    parseInt(value.slice(3, 5), 16) / 255,
    parseInt(value.slice(5, 7), 16) / 255
  );
  const sun = new THREE.Vector3(...({firn:[-.68,.48,.56],meridian:[.86,.09,.44],puna:[.45,.24,-.85]}[track.id] ?? [.81,.185,.5])).normalize();
  const sky = new THREE.Mesh(new THREE.SphereGeometry(515, 24, 12), new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: { weather: {value:track.signature ? (track.id==="meridian"?.18:.58) : 0}, sun: { value: sun }, zenith: { value: asRGB(colors[0]) }, horizonColor: { value: asRGB(colors[1]) }, night: { value: track.theme === "night" ? 1 : 0 } },
    vertexShader: `
      varying vec3 vPosition;
      void main() {
        vPosition = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float weather;
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float noise(vec2 p){
        vec2 v=floor(p), f=fract(p); f=f*f*(3.-2.*f);
        return mix(mix(hash(v),hash(v+vec2(1,0)),f.x),mix(hash(v+vec2(0,1)),hash(v+vec2(1,1)),f.x),f.y);
      }
      uniform vec3 sun;
      uniform vec3 zenith;
      uniform vec3 horizonColor;
      uniform float night;
      varying vec3 vPosition;
      void main() {
        vec3 direction = normalize(vPosition);
        float y = direction.y;
        float azimuth = dot(normalize(vec3(direction.x, 0.0, direction.z + .0001)), normalize(vec3(sun.x, 0.0, sun.z)));
        float glow = pow(max(0.0, azimuth), 4.0);
        vec3 horizon = horizonColor * mix(.75, 1.02, glow);
        vec3 color = mix(horizon, zenith, smoothstep(-.015, .65, y));
        float alignment = max(0.0, dot(direction, sun));
        color += pow(alignment, 38.0) * vec3(.19, .09, .015);
        color = mix(color, mix(vec3(1.0, .87, .62), vec3(.88, .92, 1.0), night), smoothstep(.9987, .9991, alignment));
        if(weather>0. && y>.018){
          vec2 p=direction.xz/max(y,.035)*2.7;
          float density=.52*noise(p)+.28*noise(p*2.1)+.14*noise(p*4.3)+.06*noise(p*9.);
          float cloud=smoothstep(.47,.73,density)*smoothstep(.018,.14,y)*weather;
          color=mix(color,mix(vec3(.56,.61,.68),vec3(1.,.95,.88),density),cloud);
        }
        gl_FragColor = vec4(color, 1.0);
      }
    `
  }));
  scene.add(sky);
  const light = new THREE.DirectionalLight(track.theme === "night" ? 0xa8bbff : 0xffcfaa, track.theme === "night" ? 1.1 : 2.05);
  light.position.set(sun.x * 100, 38, sun.z * 100);
  scene.add(light, new THREE.HemisphereLight(0xe5e8ff, 0x5c5147, 1.65));
  scene.userData.sun=light;
  scene.userData.sunDirection=sun;
  light.castShadow=true;
  light.shadow.mapSize.set(1536,1536);
  light.shadow.camera.left=light.shadow.camera.bottom=-65;
  light.shadow.camera.right=light.shadow.camera.top=65;
  light.shadow.camera.near=1;light.shadow.camera.far=230;
  light.shadow.bias=-.0008;
  scene.add(light.target);
  return sky;
}

function instances(scene, geometry, material, transforms) {
  const group = new THREE.InstancedMesh(geometry, material, transforms.length);
  const dummy = new THREE.Object3D();
  transforms.forEach(([x, y, z, w, h, d, yaw = 0], i) => {
    dummy.position.set(x, y+(scene.userData.heightAt?.(x,z)??0), z);
    dummy.scale.set(w, h, d);
    dummy.rotation.y = yaw;
    dummy.updateMatrix();
    group.setMatrixAt(i, dummy.matrix);
  });
  scene.add(group);
}

function landscape(scene, track) {
  const worldScale = track.layoutScale ?? 1;
  const coastal = ["coast", "harbor", "sakura"].includes(track.theme);
  if(track.manualDrive){
    const bounds=track.terrain.bounds,vertices=[],indices=[],segments=110;
    for(let z=0;z<=segments;z++)for(let x=0;x<=segments;x++){
      const px=bounds.left+(bounds.right-bounds.left)*x/segments,pz=bounds.top+(bounds.bottom-bounds.top)*z/segments;
      vertices.push(px,track.heightAt(px,pz)-.12,pz);
      if(x<segments&&z<segments){const a=z*(segments+1)+x;indices.push(a,a+segments+1,a+1,a+1,a+segments+1,a+segments+2);}
    }
    const ground=flat(track.colors[2]);
    if(track.signature){
      ground.vertexColors=true;
      const geometry=new THREE.BufferGeometry(), colors=[];
      for(let i=0;i<vertices.length;i+=3){
        const x=vertices[i],z=vertices[i+2];
        const grain=.84+.09*Math.sin(x*.046+Math.sin(z*.064))+.12*Math.cos(z*.051+x*.02);
        colors.push(grain,grain*.99,grain*.95);
      }
      geometry.setAttribute("position",new THREE.Float32BufferAttribute(vertices,3));
      geometry.setAttribute("color",new THREE.Float32BufferAttribute(colors,3));
      geometry.setIndex(indices);geometry.computeVertexNormals();
      const terrain=new THREE.Mesh(geometry,ground);
      terrain.receiveShadow=true;scene.add(terrain);
    }else addSurface(scene,ground,vertices,indices);
    box(scene,flat(track.colors[3]),0,-3,0,4000,1,4000);
  }else{
    box(scene, flat(track.colors[2]), 0, -.69, -105 * worldScale, 530 * worldScale, 1.37, (coastal ? 402 : 700) * worldScale);
    box(scene, flat(coastal ? track.colors[3] : track.colors[2]), 0, -1.8, 0, 1000 * worldScale, .45, 1000 * worldScale);
  }

  if (track.signature) return;
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
  ranges.forEach(range => {
    instances(scene, peak, flat(track.colors[5]), range.map(([x, z, height]) =>
      [x * worldScale, height * .5 * worldScale - 1.5, z * worldScale, height * (.75 + random() * .45) * worldScale, height * worldScale, height * worldScale, random() * Math.PI]));
  });

  const trees = [];
  const trunks = [];
  const rocks = [];
  const bounds = track.outline;
  for (let i = 0; i < (track.theme === "desert" ? 45 : 360); i++) {
    const x = (random() * 290 - 155) * worldScale;
    const z = (random() * 220 - 132) * worldScale;
    const scale = .65 + random() * 1.05;
    if (nearShortcut(track, x, z) || bounds.some(p => Math.hypot(p.x - x, p.z - z) < track.halfWidth + 5 + scale)) continue;
    const yaw = random() * Math.PI;
    trees.push([x, 3.35 * scale, z, 1.9 * scale, 4.4 * scale, 1.9 * scale, yaw]);
    trunks.push([x, .76 * scale, z, .37 * scale, 1.5 * scale, .37 * scale, yaw]);
  }
  instances(scene, (track.theme === "sakura" ? new THREE.IcosahedronGeometry(1, 0) : new THREE.ConeGeometry(1, 1, 5)), flat(track.colors[4]), trees);
  instances(scene, new THREE.BoxGeometry(1, 1, 1), flat(0x6f5143), trunks);

  const swells = [];
  for (let i = 0; i < 145; i++) {
    const x = (random() * 430 - 215) * worldScale;
    const z = (98 + random() * 155) * worldScale;
    swells.push([x, -1.55, z, 1.7 + random() * 11, .025, .12 + random() * .38, -.15]);
    if (i < 75) {
      const size = .7 + random() * 2;
      rocks.push([(random() * 298 - 158) * worldScale, -.6, (90 + random() * 9) * worldScale, size * 1.55, size, size, random() * 4]);
    }
  }
  instances(scene, new THREE.DodecahedronGeometry(1), flat(0x655c57), rocks);
  if (coastal) instances(scene, new THREE.BoxGeometry(1, 1, 1), flat(new THREE.Color(track.colors[3]).multiplyScalar(1.25)), swells);
  if (["night", "harbor"].includes(track.theme)) {
    const buildings = Array.from({ length: 30 }, (_, i) => {
      const x = -160 + (i % 10) * 34, z = -112 - Math.floor(i / 10) * 25;
      const h = track.theme === "night" ? 14 + random() * 34 : 4 + random() * 8;
      return [x * worldScale, h / 2, z * worldScale, 11 + random() * 7, h, 10, 0];
    });
    instances(scene, new THREE.BoxGeometry(1, 1, 1), flat(track.theme === "night" ? "#445078" : "#8c6261"), buildings);
    if (track.theme === "night") {
      instances(scene, new THREE.BoxGeometry(1, 1, 1), bright(0xffd7a0),
        buildings.flatMap(([x, y, z, w, h, d]) => [0.3, .6, .82].map(level => [x, h * level, z + d / 2, w * .7, .48, .3, 0])));
    }
  }
}

function addWorldScenery(scene, track) {
  const byColor = new Map();
  for (const shape of worldScenery(track)) {
    if (!byColor.has(shape.color)) byColor.set(shape.color, { positions: [], indices: [] });
    const { positions, indices } = byColor.get(shape.color);
    const start = positions.length / 3;
    for (const [x,y,z] of shape.vertices) positions.push(x,y+(track.heightAt?.(x,z)??0),z);
    for (const face of shape.faces) {
      for (let i = 1; i + 1 < face.length; i++) indices.push(start + face[0], start + face[i], start + face[i + 1]);
    }
  }
  for (const [color, mesh] of byColor) {
    const material = flat(color);
    material.side = THREE.DoubleSide;
    if(track.id==="meridian" && ["#435865","#526573","#66636b","#455660"].includes(color)){
      material.metalness=.72;material.roughness=.22;
    }
    addSurface(scene, material, mesh.positions, mesh.indices);
  }
}

function itemGates(scene, track, neon) {
  const shapes = [];
  const material = flat("#a27bff");
  const core = bright("#e1d4ff");
  const turbo = bright(ITEMS.turbo.color);
  const geometry = new THREE.BoxGeometry(1.34, 1.34, 1.34);
  const accents = neon ? DOPA_COLORS.filter(color => color !== DOPA_COLORS[2]).map(bright) : null;
  for (const [gate, distance] of track.itemLines.entries()) {
    const isTurbo = distance === track.offroadItemLine;
    ribbon(track, scene, flat("#694e9e"), -track.halfWidth + .3, track.halfWidth - .3, .195, distance - ITEM_ZONE_BEFORE, distance + ITEM_ZONE_AFTER);
    for (const [slot, fraction] of ITEM_LANES.entries()) {
      const group = new THREE.Group();
      const gem = new THREE.Mesh(geometry, isTurbo ? turbo : accents?.[(gate + slot) % (accents?.length || 1)] ?? material);
      gem.rotation.z = Math.PI / 4;
      group.add(gem);
      box(group, core, 0, 0, -.71, .44, .44, .11);
      place(track, group, distance, track.halfWidth * fraction, 1.15);
      scene.add(group);
      shapes.push(group);
    }
  }
  return shapes;
}

function roadside(scene, track) {
  const { halfWidth: ROAD_HALF, length: TRACK_LENGTH } = track;
  const orange = flat(track.colors[6]);
  const roof = flat(0x283944);
  const concrete = flat(0xc6ab8a);
  const gate = new THREE.Group();
  const gantry = track.region && track.id !== "fuji";
  for (const x of [-ROAD_HALF - 1.6, ROAD_HALF + 1.6]) {
    box(gate, concrete, x, .27, 0, 1.48, .54, 1.52);
    box(gate, orange, x, 4, 0, .72, 7.7, .72);
  }
  if (gantry) {
    box(gate, roof, 0, 6.8, 0, ROAD_HALF * 2 + 4, 1.7, .9);
    for (let i = -3; i <= 3; i++) {
      box(gate, bright(i % 2 ? track.colors[6] : "#e4f1f7"), i * 1.2, 6.9, -.49, .87, .45, .08);
    }
  } else {
    box(gate, orange, 0, 6.17, 0, 20, .62, .72);
    box(gate, orange, 0, 7.7, 0, 21.1, .6, .95);
    box(gate, roof, 0, 8.07, 0, 22, .27, 1.35);
    box(gate, orange, 0, 6.97, 0, .85, 1.26, .6);
  }
  if (track.theme === "castle") {
    box(gate, flat(0xe4d6bf), 0, 8.2, 0, 17, 2.65, 2.55);
    box(gate, roof, 0, 9.65, 0, 22, .5, 3.8);
    box(gate, roof, 0, 10.15, 0, 17, .6, 2.5);
  }
  place(track, gate, 0, 0);
  scene.add(gate);

  const lamp = flat(0x303e46);
  const bulb = bright(0xffd486);
  const lamps = [17, 28, 88, 100, 112, TRACK_LENGTH - 14];
  for (const distance of lamps) {
    const post = new THREE.Group();
    box(post, lamp, 0, 2.05, 0, .19, 4.1, .19);
    box(post, lamp, -.55, 4, 0, 1.25, .2, .24);
    box(post, bulb, -1.02, 3.88, 0, .45, .09, .34);
    place(track, post, distance, -ROAD_HALF - 1.75);
    post.rotateY(Math.PI);
    scene.add(post);
  }

  const metal = flat(0x9ea9a6);
  const posts = [];
  for (let distance = 8; distance < TRACK_LENGTH * .36; distance += 4.5) {
    const p = track.sample(distance);
    const lane = ROAD_HALF + 1.18;
    posts.push([p.x + p.rx * lane, .43, p.z + p.rz * lane, .24, .86, .25,
      Math.atan2(p.fx, p.fz)]);
  }
  instances(scene, new THREE.BoxGeometry(1, 1, 1), metal, posts);
  ribbon(track, scene, metal, ROAD_HALF + 1.01, ROAD_HALF + 1.35, .8, 7, TRACK_LENGTH * .36);
}

const carGlass = new THREE.MeshPhysicalMaterial({color:0x4e849b,roughness:.1,metalness:.45,clearcoat:1});
const carTrim = flat(0x242931);
const tires = flat(0x161a20);
const rims = flat(0x9da7b6);
const taillight = bright(0xff513e);
const headlight = bright(0xffe9bd);

function car(scene, paint, ghost, track) {
  const group = new THREE.Group();
  const body = new THREE.MeshPhysicalMaterial({color:paint,metalness:.55,roughness:.23,clearcoat:1,clearcoatRoughness:.18});
  group.userData.paint = body;
  if (track.signature) {
    const {panels,wheel,axles}=coachwork(track.id);
    const finishes={paint:body, glass:carGlass.clone(),trim:carTrim.clone(),metal:rims.clone(),red:taillight.clone(),lamp:headlight.clone()};
    for(const [finish,material] of Object.entries(finishes)){
      const vertices=[];
      for(const panel of panels.filter(panel=>panel.finish===finish)){
        for(let i=1;i<panel.vertices.length-1;i++) vertices.push(...panel.vertices[0],...panel.vertices[i],...panel.vertices[i+1]);
      }
      if(!vertices.length)continue;
      material.side=THREE.DoubleSide;
      const geometry=new THREE.BufferGeometry();
      geometry.setAttribute("position",new THREE.Float32BufferAttribute(vertices,3));
      geometry.computeVertexNormals();
      group.add(new THREE.Mesh(geometry,material));
    }
    for(const side of [-1,1])for(const z of axles){
      const rotor=new THREE.Group();
      rotor.position.set(side*1.01,wheel,z);
      rotor.userData.wheel=true;
      group.add(rotor);
      const tire=new THREE.Mesh(new THREE.TorusGeometry(wheel*.78,wheel*.22,10,32),tires);
      tire.rotation.y=Math.PI/2;
      rotor.add(tire);
      const disc=new THREE.Mesh(new THREE.CylinderGeometry(wheel*.65,wheel*.65,.14,24),carTrim);
      disc.rotation.z=Math.PI/2;rotor.add(disc);
      for(let spoke=0;spoke<5;spoke++){
        const bar=box(rotor,rims,side*.092,0,0,.035,.047,wheel*1.32);
        bar.rotation.x=spoke*Math.PI/5;
      }
    }
  } else {
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
      wheel.userData.wheel=true;
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(.23, .23, .29, 8), rims);
      hub.rotation.copy(wheel.rotation);
      hub.position.copy(wheel.position);
      group.add(hub);
    }
  }
  }
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(2.75, 4.6), new THREE.MeshBasicMaterial({
    color: 0x171a20, transparent: true, opacity: .37, depthWrite: false
  }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = .024;
  shadow.userData.shadow=true;
  if (ghost) {
    const materials = new Map();
    group.traverse(mesh => {
      if (!mesh.isMesh) return;
      if (!materials.has(mesh.material)) {
        const material = mesh.material.clone();
        material.transparent = true;
        material.opacity = .42;
        material.depthWrite = false;
        materials.set(mesh.material, material);
      }
      mesh.material = materials.get(mesh.material);
    });
    group.userData.paint = materials.get(body);
    shadow.visible = false;
  }
  group.add(shadow);
  group.traverse(object=>{if(object.isMesh&&object!==shadow){object.castShadow=!ghost;object.receiveShadow=true;}});
  scene.add(group);
  return group;
}

export function createScene(canvas, racers, track, { showItems = false, raceCamera = false, speedClass } = {}) {
  const neon = speedClass === "dopagaki";
  const skyColors = neon ? DOPA_SKY : track.colors;
  const attributes = { antialias: true, alpha: false };
  const context = canvas.getContext("webgl2", attributes) || canvas.getContext("webgl", attributes);
  const poses = racers.map(() => ({}));
  const renderer = context
    ? new THREE.WebGLRenderer({ canvas, context })
    : createCanvasRenderer(canvas, poses, track, showItems, neon);
  const scene = new THREE.Scene();
  scene.userData.heightAt=track.heightAt;
  let sky;
  const cars = [];
  const pulseModels = [];
  let crates = [];
  if (context) {
    renderer.outputColorSpace=THREE.SRGBColorSpace;
    renderer.toneMapping=THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure=1.15;
    renderer.shadowMap.enabled=true;
    renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    const reflectionFaces=Array.from({length:6},(_,side)=>{
      const face=document.createElement("canvas");
      face.width=face.height=128;
      const brush=face.getContext("2d");
      const gradient=brush.createLinearGradient(0,0,0,128);
      gradient.addColorStop(0,skyColors[0]);
      gradient.addColorStop(.58,skyColors[1]);
      gradient.addColorStop(1,track.colors[2]);
      brush.fillStyle=gradient;brush.fillRect(0,0,128,128);
      if(side===0){brush.fillStyle="#fff6d9";brush.fillRect(15,22,34,14);}
      return face;
    });
    const environment=new THREE.CubeTexture(reflectionFaces);
    environment.colorSpace=THREE.SRGBColorSpace;
    environment.needsUpdate=true;
    scene.environment=environment;
    scene.fog = new THREE.FogExp2(skyColors[1], .0014);
    sky = makeSky(scene, track, skyColors);
    landscape(scene, track);
    buildRoad(scene, track, neon);
    roadside(scene, track);
    addWorldScenery(scene, track);
    if (showItems) crates = itemGates(scene, track, neon);
  }

  const camera = new THREE.PerspectiveCamera(61, 1, .12, 720);
  const frame = {};
  const next = {};
  const eye = new THREE.Vector3();
  const target = new THREE.Vector3();
  const aim = new THREE.Vector3();
  const point = new THREE.Vector3();
  const motion = raceCamera ? matchMedia("(prefers-reduced-motion: reduce)") : null;
  let portrait = false;
  let cameraRacer;

  function resize(width, height) {
    portrait = width < height;
    camera.aspect = width / height;
    camera.fov = portrait ? 68 : 61;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, portrait ? 1.35 : 1.5));
    renderer.setSize(width, height, false);
  }

  function renderPulses(projectiles, elapsed) {
    let count = 0;
    for (const pulse of projectiles) {
      if (elapsed >= pulse.launchedAt + PULSE_LIFETIME) continue;
      let model = pulseModels[count];
      if (!model) {
        model = new THREE.Group();
        const core = new THREE.Mesh(new THREE.SphereGeometry(.76, 12, 8), bright("#ffffff"));
        core.scale.y = .66;
        const rim = new THREE.Mesh(new THREE.TorusGeometry(.77, .14, 6, 16), bright("#ffffff"));
        rim.rotation.x = Math.PI / 2;
        model.add(core, rim);
        pulseModels.push(model);
        scene.add(model);
      }
      model.children[0].material.color.set(ITEMS[pulse.kind].color);
      if (neon) {
        model.children[1].material.color.set(pulse.kind === "pulse" ? DOPA_COLORS[0] : DOPA_COLORS[2]);
        model.scale.setScalar(1.45);
      }
      const shot = pulsePosition(track, pulse, elapsed);
      const p = racerSample(track, shot, frame);
      model.position.set(p.x + p.rx * shot.lane, .84, p.z + p.rz * shot.lane);
      model.visible = true;
      count++;
    }
    for (let i = count; i < pulseModels.length; i++) pulseModels[i].visible = false;
  }

  function render(state, dt, resetCamera, itemRespawns = null, elapsed = 0, projectiles = [], focus = 0) {
    const subject = racers[focus];
    const switchView = resetCamera || cameraRacer !== subject.id;
    cameraRacer = subject.id;
    racers.forEach((racer, index) => {
      const pose = smoothRacerPose(track, racer, poses[index], dt, resetCamera);
      const visible = !racer.dnf && (index === 0 || racer.finishedAt === null || racer.cruising);
      if (!context || (!visible && !cars[index])) return;
      const model = cars[index] ?? (cars[index] = car(scene, racer.color, racer.ghost, track));
      model.visible = visible;
      if (!visible) return;
      const p = racerSample(track, pose, frame);
      model.position.set(p.x + p.rx * pose.lane, .18+pose.airY, p.z + p.rz * pose.lane);
      model.rotation.y = pose.yaw;
      const ahead=track.heightAt?.(model.position.x+p.fx*3,model.position.z+p.fz*3)??0;
      const behind=track.heightAt?.(model.position.x-p.fx*3,model.position.z-p.fz*3)??0;
      model.rotation.x=pose.airborne?-Math.atan2(pose.verticalSpeed,Math.max(12,racer.speed)): -Math.atan2(ahead-behind,6);
      model.rotation.z=pose.trick?Math.sin(pose.jumpAge*Math.PI*2)*.38:(racer.steer||0)*Math.min(.07,racer.speed*.001);
      for(const part of model.children)if(part.userData.wheel)part.rotation.x-=racer.speed*dt/.39;
      for(const part of model.children)if(part.userData.shadow)part.position.y=.024-(pose.airY-(track.heightAt?.(model.position.x,model.position.z)??0));
      model.userData.paint.color.setHex(pose.color);
    });
    crates.forEach((crate, index) => {
      crate.visible = !itemRespawns || itemRespawns[index] <= elapsed;
      if (crate.visible) crate.children[0].rotation.y += dt * (neon ? 3 : 1.7);
    });
    const player = poses[focus];
    const p = racerSample(track, player, frame);
    const ahead = player.distance + 24 * (player.shortcut ? track.shortcut.ratio : 1);
    const lookingAhead = player.free ? { x: p.x + p.fx * 24, z: p.z + p.fz * 24 } :
      driveSample(track, ahead, player.shortcut, next);
    const intro = state === "ready";
    const boost = motion && !motion.matches && state === "racing" && boostRemaining(subject) > 0 &&
      !isRoughSurface(track, subject) ? 1 : 0;
    const rush = neon && motion && !motion.matches && state === "racing"
      ? 8 * Math.min(1, subject.speed / 78) : 0;
    const fov = (portrait ? 68 : 61) + rush + boost * (neon ? 11 : 7);
    if (Math.abs(camera.fov - fov) > .05) {
      camera.fov += (fov - camera.fov) * (switchView ? 1 : 1 - Math.exp(-7 * dt));
      camera.updateProjectionMatrix();
    }
    const back = intro ? (portrait ? 14 : 16) : (portrait ? 11.4 : 10.6);
    const lane = player.lane + (intro && !portrait ? -11.4 : 0);
    const elevation=player.airY||0;
    eye.set(p.x - p.fx * back + p.rx * lane, elevation+(intro ? 6.7 : 4.65), p.z - p.fz * back + p.rz * lane);
    target.set(lookingAhead.x + p.rx * (intro ? -1 : player.lane * .36),
      elevation+(intro ? 2.75 : 2.65), lookingAhead.z + p.rz * (intro ? -1 : player.lane * .36));
    const ease = switchView ? 1 : 1 - Math.exp(-8 * dt);
    camera.position.lerp(eye, ease);
    if (sky) sky.position.copy(camera.position);
    aim.lerp(target, ease);
    camera.lookAt(aim);
    if (context) {
      const sun=scene.userData.sun;
      if(sun){
        sun.target.position.set(p.x,elevation,p.z);
        if(track.signature)sun.position.copy(sun.target.position).addScaledVector(scene.userData.sunDirection,128);
        else sun.position.set(p.x+90,elevation+110,p.z+60);
      }
      renderPulses(projectiles, elapsed);
      renderer.render(scene, camera);
    } else renderer.render(scene, camera, itemRespawns, elapsed, projectiles);
  }

  function tirePoint(side, output) {
    const pose = poses[0];
    const p = racerSample(track, pose, frame);
    const x = p.x + p.rx * pose.lane;
    const z = p.z + p.rz * pose.lane;
    const sine = Math.sin(pose.yaw), cosine = Math.cos(pose.yaw);
    point.set(x + cosine * side - sine * 1.3, .39+pose.airY, z - sine * side - cosine * 1.3).project(camera);
    output.x = (point.x + 1) * .5;
    output.y = (1 - point.y) * .5;
    return point.z >= -1 && point.z <= 1 && output.x > 0 && output.x < 1 && output.y > 0 && output.y < 1;
  }

  function dispose() {
    if (!context) return;
    scene.traverse(object => {
      object.geometry?.dispose();
      object.material?.map?.dispose();
      object.material?.dispose();
    });
    renderer.dispose();
    scene.environment?.dispose();
    renderer.forceContextLoss();
  }

  return { render, resize, dispose, tirePoint };
}
