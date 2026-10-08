import * as THREE from "three";
import { OrbitControls } from "../vendor/OrbitControls.js";
import { GLTFLoader } from "../vendor/GLTFLoader.js";
import { fitModel, alignLinearModel, createBuilding, createGround, groundGridOpacity, syncBuildings } from "./town-geometry.js?v=pagoda-torii-20261008";
import { createFarmerView } from "./farmer-3d.js?v=missions-20261005";
import { createLandscape } from "./town-landscape.js?v=mountains-fast-20261008";
import { SoftwareTownRenderer } from "./town-software-renderer.js?v=scenery-cache-20261008";
import { createTownEventView } from "./town-events.js?v=town-events-20261005";
import { createResidentCamera } from "./resident-camera.js?v=first-person-20261007";
const C = window.HKCore;
const urls = {
  house: "house.2a9f3.glb",
  shop: "j8ap2an8eses0ho1p.glb",
  castle: "ja76386p2an8esecas6t9le.glb",
  temple: "japanese.tem3pl4e1383.glb",
  pagoda: "pagoda.glb",
  torii: "torii.glb",
  tree: "t6r7e9e.glb",
  field: "f2i342el2d.glb",
  road: "w8a9l0k9w7a2y.glb",
  bridge: "b7r89i6d8g9e.glb",
  fence: "fence_wood.glb",
  school: "s7c7h9o89ol.glb",
};
const loader = new GLTFLoader(),
  cache = new Map();
let farmerView = null, residentCamera = null, eventView = null, followEvent = false, eventFrame = null, lastEventFrame = 0, watchedFire = 0;
let town = null,
  preview = null,
  marker = null,
  failedTypes = new Set();
function loadModel(type) {
  if (!cache.has(type)) {
    const url = new URL("../_m/" + urls[type], import.meta.url);
    cache.set(
      type,
      loader.loadAsync(url.href).then((g) => alignLinearModel(g.scene, type)),
    );
  }
  return cache.get(type);
}
function createScene(host, { mini = false } = {}) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: mini, alpha: mini, powerPreference: "low-power" });
  } catch (error) {
    if (mini) throw error;
    renderer = new SoftwareTownRenderer();
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.25));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  const diagonal = Math.hypot(C.town.width, C.town.height);
  const landscape = mini ? null : createLandscape(scene, C.town.width, C.town.height);
  const camera = new THREE.PerspectiveCamera(40, 1, mini ? .1 : .5, Math.max(240, diagonal * 16));
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = false;
  controls.maxPolarAngle = Math.PI * 0.47;
  controls.minDistance = 4;
  controls.maxDistance = mini ? 20 : diagonal * 2.6;
  controls.enableZoom = !mini;
  controls.enablePan = !mini;
  controls.enableRotate = !mini;
  controls.target.set(0, mini ? 1 : 0, 0);
  camera.position.set(mini ? 6 : 23, mini ? 5 : 28, mini ? 8 : 30);
  controls.update();
  function resetCamera() {
    if (mini) return;
    const halfVertical = THREE.MathUtils.degToRad(camera.fov / 2), halfHorizontal = Math.atan(Math.tan(halfVertical) * camera.aspect);
    const distance = diagonal / 2 / Math.sin(Math.min(halfVertical, halfHorizontal)) * 1.28;
    controls.target.set(0, 0, 0);
    camera.position.copy(new THREE.Vector3(.42, .52, 1).normalize().multiplyScalar(distance));
    controls.update();
  }
  const ambient = new THREE.HemisphereLight(0xf1faff, 0x536244, 2.4);
  scene.add(ambient);
  const sun = new THREE.DirectionalLight(0xfff0d7, 3.5);
  sun.position.set(12, 23, 12);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  const shadowSize = mini ? 8 : diagonal / 2 + 10;
  sun.shadow.camera.left = -shadowSize;
  sun.shadow.camera.right = shadowSize;
  sun.shadow.camera.top = shadowSize;
  sun.shadow.camera.bottom = -shadowSize;
  sun.shadow.camera.far = Math.max(100, diagonal * 2);
  sun.shadow.bias = -0.0003;
  scene.add(sun);
  const base = createGround(scene, mini);
  // At this point only mountains and the fixed town floor are in the scene.
  // Residents, buildings and placement markers remain independently animated.
  scene.traverse(o => { if (o.isMesh) o.userData.staticScenery = true; });
  const groundGrid = scene.getObjectByName("town-ground-grid");
  const buildings = new THREE.Group();
  scene.add(buildings);
  host.replaceChildren(renderer.domElement);
  renderer.domElement.setAttribute("aria-label", "森と山々に囲まれた、わたしの町");
  if (!mini) {
    const badge = document.createElement("span"); badge.className = "town-scenery-label";
    badge.textContent = landscape.quality === "light" ? "山あいの町 · 軽量版" : "山あいの町";
    host.append(badge);
  }
  let shadowBuildings = "";
  const render = () => {
    if (disposed) return;
    if (groundGrid) {
      groundGrid.material.opacity = groundGridOpacity(camera, controls.target, host.clientHeight);
      groundGrid.visible = groundGrid.material.opacity > 0;
    }
    const signature = buildings.children.map((o) => o.uuid).join(":") || "empty";
    if (signature !== shadowBuildings || !shadowBuildings) {
      renderer.shadowMap.needsUpdate = true; shadowBuildings = signature;
    }
    if (host.clientWidth && host.clientHeight) renderer.render(scene, camera);
  };
  let framed = mini, disposed = false;
  landscape?.ready.then(() => { if (!disposed) render(); });
  const observer = new ResizeObserver(() => {
    if (!host.clientWidth || !host.clientHeight) return;
    renderer.setSize(host.clientWidth, host.clientHeight, false);
    camera.aspect = host.clientWidth / host.clientHeight;
    camera.updateProjectionMatrix();
    if (!framed) { resetCamera(); framed = true; }
    render();
  });
  observer.observe(host);
  controls.addEventListener("change", render);
  renderer.domElement.addEventListener("webglcontextlost", (e) => {
    e.preventDefault();
    if (!mini) {
      if (document.getElementById("townGrid").hidden) document.getElementById("town2d").click();
      window.HK?.notify(
        "3D表示が止まりました。「マス目で置く」で町を操作できます。",
      );
    }
  });
  renderer.domElement.addEventListener("webglcontextrestored", render);
  return {
    host,
    renderer,
    scene,
    camera,
    controls,
    base,
    buildings,
    landscape,
    render,
    resetCamera,
    landWidth: C.town.width,
    landHeight: C.town.height,
    dispose() { disposed = true; this.disposed = true; this.entries?.clear(); observer.disconnect(); controls.dispose(); landscape?.dispose(); renderer.dispose(); scene.clear(); },
    mini,
  };
}
async function initPreview() {
  const host = document.getElementById("townPreview");
  try {
    preview = createScene(host, { mini: true });
    const localCastle = fitModel(createBuilding("castle"), 3.3);
    preview.buildings.add(localCastle);
    preview.render();
    const castle = fitModel(await loadModel("castle"), 3.3);
    preview.buildings.remove(localCastle);
    preview.buildings.add(castle);
    preview.render();
  } catch (e) {
    if (!preview) host.innerHTML =
      '<p class="preview-loading">3Dは対応ブラウザで楽しめるよ。<br>町はマス目からもつくれます。</p>';
    console.warn("Castle preview unavailable", e);
  }
}
function initTown() {
  if (town) return;
  try {
    town = createScene(document.getElementById("townCanvas"));
    window.HKTownReady = true;
    farmerView = createFarmerView(town.scene);
    eventView = createTownEventView(town.scene);
    eventView.update(window.HK.townEvent,window.HK.state.city);
    eventView.animate();
    startEventLoop();
    farmerView.update(window.HK.residentActors);
    residentCamera = createResidentCamera(town.camera, town.controls, farmerView.people, (id) => {
      document.getElementById("residentViewControls").hidden = !id;
      const resident = window.HK.state.residents.find(r => r.id === id);
      const role = resident && C.items.find(item => item.id === (resident.type || "farmer"));
      document.getElementById("residentViewName").textContent = id ? (role?.name || "住民") + "の一人称視点" : "";
      document.getElementById("townHelp").textContent = id ? "ドラッグで見回せます。住民と一緒に町を歩こう。「町全体に戻る」で終了。" : "指1本で回転、2本で拡大・移動。建物をタップすると操作できます。";
    });
    town.controls.addEventListener("start", () => { followEvent = false; });
    const ray = new THREE.Raycaster(),
      pointer = new THREE.Vector2();
    let down = null;
    town.renderer.domElement.addEventListener("pointerdown", (e) => {
      down = [e.clientX, e.clientY];
      if (residentCamera.id) { town.renderer.domElement.setPointerCapture?.(e.pointerId); }
    });
    town.renderer.domElement.addEventListener("pointermove", (e) => {
      if (!residentCamera.id || !down) return;
      residentCamera.look(e.clientX - down[0], e.clientY - down[1]);
      down = [e.clientX, e.clientY]; town.render();
    });
    town.renderer.domElement.addEventListener("pointercancel", () => { down = null; });
    town.renderer.domElement.addEventListener("pointerup", (e) => {
      if (residentCamera.id) { down = null; return; }
      if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 8)
        return;
      const rect = town.renderer.domElement.getBoundingClientRect();
      pointer.set(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        (-(e.clientY - rect.top) / rect.height) * 2 + 1,
      );
      ray.setFromCamera(pointer, town.camera);
      if (window.HK.pending) {
        const hit = ray.intersectObject(town.base)[0];
        if (hit) {
          const x = Math.floor(hit.point.x + C.town.width / 2),
            y = Math.floor(hit.point.z + C.town.height / 2);
          window.HK.setCell(x, y);
        }
      } else {
        const hit = ray.intersectObjects([...town.buildings.children, ...farmerView.group.children], true)[0];
        if (hit) {
          let o = hit.object;
          while (o && !o.userData.id) o = o.parent;
          if (o?.userData.id) {
            if (window.HK.state.residents.some((r) => r.id === o.userData.id)) window.HK.watchResident(o.userData.id);
            else window.HK.buildingDetail(o.userData.id);
          }
        }
      }
    });
    syncTown();
  } catch (e) {
    document.getElementById("townCanvas").innerHTML =
      '<div class="town-loading">3D表示を使えません。<br>「マス目で置く」で町づくりを楽しんでね。</div>';
    window.HK.notify("マス目から建物を配置・移動できます。");
    console.warn("3D town unavailable", e);
  }
}
async function syncTown() {
  if (!town || !window.HK) return;
  if (town.landWidth !== C.town.width || town.landHeight !== C.town.height) {
    residentCamera?.exit(); residentCamera = null;
    eventView?.dispose();eventView=null;
    town.dispose(); town = null; marker = null; followEvent = false; window.HKTownReady = false;
    initTown(); showMarker(window.HK.pending); return;
  }
  farmerView.update(window.HK.residentActors);
  residentCamera?.update();
  eventView?.update(window.HK.townEvent,window.HK.state.city);
  eventView?.animate();startEventLoop();
  await syncBuildings(town, window.HK.state.city, loadModel, (type, error) => {
    if (!failedTypes.has(type)) {
      failedTypes.add(type);
      window.HK.notify("詳細モデルを読み込めないため、町の建物を簡易表示しています。");
    }
    console.warn("Detailed model unavailable", type, error);
  });
}
function startEventLoop() {
  if(eventFrame!==null || !town || !window.HK.townEvent || document.hidden || document.getElementById("view-town").hidden)return;
  const frame=time=>{
    eventFrame=null;
    if(!town || document.hidden || document.getElementById("view-town").hidden || !town.host.clientWidth || !town.host.clientHeight)return;
    if(time-lastEventFrame>=(town.renderer.isSoftwareRenderer ? 350 : 66)) {
      lastEventFrame=time;
      const moving=eventView?.animate();
      if(followEvent) {
        const lord=eventView.group.getObjectByName("visiting-shogun");
        if(lord && moving) {
          const target=lord.position.clone().add(new THREE.Vector3(0,.4,0));
          town.controls.target.lerp(target,.25);town.camera.position.lerp(target.clone().add(new THREE.Vector3(5,6,9)),.25);town.controls.update();
        } else followEvent=false;
      }
      town.render();if(!moving)return;
    }
    eventFrame=requestAnimationFrame(frame);
  };
  eventFrame=requestAnimationFrame(frame);
}
function showMarker(p) {
  if (!town) return;
  if (!marker) { marker = new THREE.Group(); town.scene.add(marker); }
  for (const child of [...marker.children]) { marker.remove(child); child.geometry.dispose(); child.material.dispose(); }
  if (p) {
    const valid = C.canPlace(window.HK.state.city, p.x, p.y, p.id, p.type, p.rot);
    for (const plot of [p]) {
      const f = C.footprint(plot), mesh = new THREE.Mesh(new THREE.BoxGeometry(f.width * .95, .04, f.depth * .95), new THREE.MeshBasicMaterial({ color: valid ? 0xffa159 : 0xc44a42, transparent: true, opacity: .85 }));
      mesh.position.set(plot.x + f.width / 2 - C.town.width / 2, .04, plot.y + f.depth / 2 - C.town.height / 2); marker.add(mesh);
    }
  }
  town.render();
}
function boot() {
  initPreview();
  window.addEventListener("hk-town-open", () => {
    initTown();
    farmerView?.update(window.HK.residentActors);
    eventView?.update(window.HK.townEvent,window.HK.state.city);eventView?.animate();startEventLoop();
    town?.render();
  });
  window.addEventListener("hk-town-change", syncTown);
  window.addEventListener("hk-town-event",e=>{
    if(!town)return;eventView.update(e.detail,window.HK.state.city);eventView.animate();town.render();startEventLoop();
  });
  window.addEventListener("hk-event-watch",()=>{
    initTown();if(!town || !window.HK.townEvent || !eventView.layout)return;
    residentCamera?.exit();followEvent=false;
    const layout=eventView.layout,type=window.HK.townEvent.type;let target;
    if(type==="fire" && layout.fires.length){const p=layout.fires[watchedFire++%layout.fires.length];target=new THREE.Vector3(p.x-C.town.width/2,p.height+.5,p.y-C.town.height/2);}
    else if(type==="festival" && layout.festival){const p=layout.festival;target=new THREE.Vector3(p.x+p.width/2-C.town.width/2,.7,p.y+p.depth/2-C.town.height/2);}
    else if(type==="shogun"){target=eventView.group.getObjectByName("visiting-shogun")?.position.clone();followEvent=!!target;}
    if(target){town.controls.target.copy(target);town.camera.position.copy(target).add(new THREE.Vector3(type==="festival" ? 9 : 5,7,type==="festival" ? 12 : 9));town.controls.update();town.render();startEventLoop();}
  });
  document.addEventListener("visibilitychange",startEventLoop);
  window.addEventListener("hk-resident-watch", (e) => {
    initTown(); if (!town) return;
    followEvent=false;
    farmerView.update(window.HK.residentActors);
    if (residentCamera.watch(e.detail)) {
      document.getElementById("townCanvas").scrollIntoView({behavior: "smooth", block: "center"});
      town.render();
    }
  });
  window.addEventListener("hk-residents-frame", (e) => {
    if (!town || !town.host.clientWidth || !town.host.clientHeight) return;
    farmerView.update(e.detail);
    residentCamera.update();
    town.render();
  });
  window.addEventListener("hk-placement", (e) => { if (e.detail) residentCamera?.exit(); showMarker(e.detail); });
  window.addEventListener("hk-camera-reset", () => {
    if (!town) return;
    residentCamera?.exit();
    followEvent=false;
    town.resetCamera();
    town.render();
  });
  document.getElementById("residentViewExit").addEventListener("click", () => window.dispatchEvent(new Event("hk-camera-reset")));
  document.getElementById("town2d").addEventListener("click", () => residentCamera?.exit());
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && residentCamera?.id) window.dispatchEvent(new Event("hk-camera-reset")); });
  if (location.hash === "#town") initTown();
}
if (document.readyState === "loading")
  document.addEventListener("DOMContentLoaded", boot, { once: true });
else boot();
