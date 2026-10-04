/* Walking and daily routines also work without WebGL or a network connection. */
(function (root) {
  "use strict";
  const C = root.HKCore || (typeof require === "function" ? require("./core.js") : null);
  const WIDTH = C.town.width;
  const actions = {
    field: { key: "farm", text: "畑のそばで農作業", icon: "🌾" },
    shop: { key: "shop", text: "商家で買い物", icon: "🧺" },
    house: { key: "rest", text: "家のそばでひと休み", icon: "🍵" },
    temple: { key: "pray", text: "寺のそばでお参り", icon: "🙏" },
    castle: { key: "look", text: "お城を見上げています", icon: "🏯" },
    school: { key: "read", text: "学校のそばで読み書き", icon: "📜" },
    tree: { key: "shade", text: "木陰で涼んでいます", icon: "🌳" },
  };
  const roles = {
    merchant: {shop:{key:"trade",text:"商家で品物を売り買い",icon:"💰"},field:{key:"trade",text:"畑で収穫物の買い付け",icon:"🧺"},castle:{key:"trade",text:"お城へ品物を届けています",icon:"🏯"}},
    samurai: {castle:{key:"guard",text:"お城の門を警護",icon:"⚔️"},shop:{key:"guard",text:"商家のそばを見回り",icon:"👀"},field:{key:"guard",text:"畑のそばを見回り",icon:"⚔️"},house:{key:"guard",text:"住宅のそばを見回り",icon:"👀"}},
    monk: {temple:{key:"chant",text:"寺のそばで読経",icon:"📿"},house:{key:"pray",text:"住民の無事をお祈り",icon:"🙏"},school:{key:"read",text:"学校で教えを説いています",icon:"📜"},field:{key:"pray",text:"畑で豊作をお祈り",icon:"🌾"}},
  };
  const key = (x, y) => y * WIDTH + x;
  function randomFor(id) {
    let seed = 2166136261;
    for (const c of id) seed = Math.imul(seed ^ c.charCodeAt(0), 16777619);
    return () => { seed += 0x6d2b79f5; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t ^= t + Math.imul(t ^ t >>> 7, 61 | t); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }
  function createEngine() {
    let city = [], blocked = new Set(), signature = "";
    const actors = new Map();
    const free = (x, y) => Number.isInteger(x) && Number.isInteger(y) && x >= 0 && x < WIDTH && y >= 0 && y < C.town.height && !blocked.has(key(x, y));
    const neighbors = (x, y) => [[x + 1, y], [x, y + 1], [x - 1, y], [x, y - 1]].filter(([a, b]) => free(a, b));
    function nearest(x, y) {
      let best = null, distance = Infinity;
      for (let b = 0; b < C.town.height; b++) for (let a = 0; a < WIDTH; a++) {
        const d = Math.abs(a - x) + Math.abs(b - y);
        if (free(a, b) && d < distance) { best = { x: a, y: b }; distance = d; }
      }
      return best;
    }
    function reachable(x, y) {
      const start = key(x, y), visited = new Map([[start, { x, y, previous: null, distance: 0 }]]), queue = [start];
      for (let i = 0; i < queue.length; i++) {
        const cell = visited.get(queue[i]);
        for (const [a, b] of neighbors(cell.x, cell.y)) if (!visited.has(key(a, b))) {
          visited.set(key(a, b), { x: a, y: b, previous: queue[i], distance: cell.distance + 1 }); queue.push(key(a, b));
        }
      }
      return visited;
    }
    function plan(actor) {
      const cell = nearest(Math.round(actor.x), Math.round(actor.y));
      if (!cell) { actor.phase = "idle"; actor.text = "歩ける場所を待っています"; return; }
      actor.x = cell.x; actor.y = cell.y;
      const visited = reachable(cell.x, cell.y), candidates = [];
      for (const building of city) {
        if (!actions[building.type]) continue;
        const f = C.footprint(building), perimeter = [];
        for (let x = building.x; x < building.x + f.width; x++) perimeter.push([x, building.y - 1], [x, building.y + f.depth]);
        for (let y = building.y; y < building.y + f.depth; y++) perimeter.push([building.x - 1, y], [building.x + f.width, y]);
        const destinations = perimeter.filter(([x, y]) => free(x, y)).map(([x, y]) => visited.get(key(x, y))).filter(Boolean).sort((a, b) => a.distance - b.distance);
        if (destinations.length) candidates.push({ building, cell: destinations[0], visits: actor.visits.get(building.id) || 0, rank: destinations[0].distance + actor.random() * 8 });
      }
      candidates.sort((a, b) => a.visits - b.visits || a.rank - b.rank);
      let destination;
      if (candidates.length && (!actor.trips || actor.trips % 4 !== 0)) {
        const target = candidates[0]; destination = target.cell; actor.target = target.building;
      } else {
        const cells = [...visited.values()].filter((c) => c.distance >= 2 && c.distance <= 7);
        destination = cells.length ? cells[Math.floor(actor.random() * cells.length)] : visited.get(key(cell.x, cell.y));
        actor.target = null;
      }
      const route = [];
      while (destination && destination.previous !== null) { route.unshift({ x: destination.x, y: destination.y }); destination = visited.get(destination.previous); }
      actor.route = route; actor.phase = "walk"; actor.action = "walk"; actor.elapsed = 0;
      actor.text = actor.target ? "「" + (root.HKCore?.items.find((i) => i.id === actor.target.type)?.name || actor.target.type) + "」へ歩いています" : "町をおさんぽ";
      if (!route.length) arrive(actor);
    }
    function arrive(actor) {
      const routine = actor.target && (roles[actor.type]?.[actor.target.type] || actions[actor.target.type]);
      actor.trips = (actor.trips || 0) + 1;
      actor.phase = "act"; actor.action = routine?.key || "wave"; actor.text = routine?.text || "のんびり周りを眺めています";
      actor.icon = routine?.icon || "👋"; actor.elapsed = 0;
      actor.duration = (actor.action === "farm" ? 7 : 4) + actor.random() * 4;
      if (actor.target) {
        const f = C.footprint(actor.target);
        actor.heading = Math.atan2(actor.target.x + (f.width - 1) / 2 - actor.x, actor.target.y + (f.depth - 1) / 2 - actor.y);
        actor.visits.set(actor.target.id, (actor.visits.get(actor.target.id) || 0) + 1);
      }
    }
    function sync(residents, buildings) {
      city = buildings;
      const nextSignature = JSON.stringify([C.town.width, C.town.height, city.map((b) => [b.id, b.type, b.x, b.y, b.rot])]);
      const changed = nextSignature !== signature;
      signature = nextSignature;
      blocked = new Set(city.filter((b) => b.type !== "road" && b.type !== "bridge").flatMap((b) => C.occupiedCells(b).map((c) => key(c.x, c.y))));
      const ids = new Set(residents.map((r) => r.id));
      for (const id of actors.keys()) if (!ids.has(id)) actors.delete(id);
      for (const resident of residents) {
        let actor = actors.get(resident.id);
        const spawn = resident.x + "," + resident.y;
        const type = resident.type || "farmer";
        if (!actor || actor.spawn !== spawn || actor.type !== type) {
          actor = { id: resident.id, type, x: resident.x, y: resident.y, spawn, heading: 0, visits: new Map(), random: randomFor(resident.id), route: [], phase: "idle", action: "wave", elapsed: 0, text: "町へようこそ", icon: "👋" };
          actor.speed = .85 + actor.random() * .3; actors.set(resident.id, actor); plan(actor);
        } else if (changed) plan(actor);
      }
    }
    function tick(seconds) {
      const dt = Math.max(0, Math.min(seconds, .25));
      for (const actor of actors.values()) {
        actor.elapsed += dt;
        if (actor.phase === "walk") {
          let remaining = dt * actor.speed;
          while (remaining > 0 && actor.route.length) {
            const cell = actor.route[0], dx = cell.x - actor.x, dy = cell.y - actor.y, distance = Math.hypot(dx, dy);
            actor.heading = Math.atan2(dx, dy);
            if (distance <= remaining) { actor.x = cell.x; actor.y = cell.y; actor.route.shift(); remaining -= distance; }
            else { actor.x += dx / distance * remaining; actor.y += dy / distance * remaining; remaining = 0; }
          }
          if (!actor.route.length) arrive(actor);
        } else if (actor.phase === "act" && actor.elapsed >= actor.duration) plan(actor);
      }
      return snapshot();
    }
    const snapshot = () => [...actors.values()];
    return { sync, tick, snapshot, nearest, free };
  }
  const api = { createEngine, actions, roles };
  root.HKResidents = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
