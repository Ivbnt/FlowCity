// Monde 3D de Flowcity : terrain vide, grille de construction, bâtiments, routes, flux de données
// (les workflows actifs circulent en permanence entre leurs bâtiments ; un test envoie des colis),
// jour / nuit, vue d'ensemble ou balade à pied (POV).
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { buildModel, TILE, mat, nightUniform, makeTree } from './models.js';
import { buildingDef } from '../shared/buildings.mjs';
import { GRID, footprint, hasRoadAccess } from '../shared/city.mjs';

const HALF = (GRID * TILE) / 2;
export const tileToWorld = (x, z) => [x * TILE - HALF + TILE / 2, z * TILE - HALF + TILE / 2];
const worldToTile = (wx, wz) => [Math.floor((wx + HALF) / TILE), Math.floor((wz + HALF) / TILE)];
const key = (x, z) => `${x},${z}`;

export class World {
  constructor(el, handlers = {}) {
    this.el = el;
    this.h = handlers;
    this.city = null;
    this.tool = { kind: 'select' };
    this.rot = 0;
    this.objects = new Map(); // id bâtiment → { group, sig, label }
    this.packets = [];
    this.flows = [];
    this.flowSpec = [];
    this.clock = new THREE.Clock();
    this.night = 0;
    this.mode = 'orbit';
    this.nightTarget = 0;

    const r = (this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' }));
    r.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    r.setSize(el.clientWidth, el.clientHeight);
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.outputColorSpace = THREE.SRGBColorSpace;
    el.append(r.domElement);
    this.labels = new CSS2DRenderer();
    this.labels.setSize(el.clientWidth, el.clientHeight);
    this.labels.domElement.className = 'fc-labels';
    el.append(this.labels.domElement);

    const scene = (this.scene = new THREE.Scene());
    this.skyColor = new THREE.Color('#9fd3ff');
    scene.background = this.skyColor;
    scene.fog = new THREE.Fog('#9fd3ff', 260, 520);
    this.camera = new THREE.PerspectiveCamera(42, el.clientWidth / el.clientHeight, 0.5, 1500);
    this.camera.position.set(38, 52, 62);

    this.hemi = new THREE.HemisphereLight('#dff1ff', '#6b8f4e', 1.0);
    scene.add(this.hemi);
    const sun = (this.sun = new THREE.DirectionalLight('#fff3dd', 2.2));
    sun.position.set(80, 140, 60);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = sc.bottom = -HALF - 10;
    sc.right = sc.top = HALF + 10;
    sc.far = 400;
    sun.shadow.bias = -0.0004;
    scene.add(sun);

    this.buildGround();
    this.roadGroup = new THREE.Group();
    scene.add(this.roadGroup);
    this.buildGroup = new THREE.Group();
    scene.add(this.buildGroup);
    this.fxGroup = new THREE.Group();
    scene.add(this.fxGroup);

    // Caméra : clic droit = tourner, clic gauche glissé = se déplacer, molette = zoom
    const c = (this.controls = new OrbitControls(this.camera, r.domElement));
    c.target.set(0, 0, 0);
    c.enableDamping = true;
    c.dampingFactor = 0.08;
    c.screenSpacePanning = false;
    c.minDistance = 18;
    c.maxDistance = 260;
    c.maxPolarAngle = 1.32;
    c.minPolarAngle = 0.25;
    c.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
    c.addEventListener('change', () => this.clampTarget());

    // Fantôme de construction + surbrillance de case
    this.ghost = new THREE.Group();
    this.ghost.visible = false;
    scene.add(this.ghost);
    this.cursor = new THREE.Mesh(new THREE.PlaneGeometry(TILE, TILE), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.35, depthWrite: false }));
    this.cursor.rotation.x = -Math.PI / 2;
    this.cursor.position.y = 0.06;
    this.cursor.visible = false;
    scene.add(this.cursor);
    this.roadPreview = new THREE.Group();
    scene.add(this.roadPreview);

    this.ray = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    this.keys = new Set();
    this.bindInput();
    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(el);
    this.setNightAuto();
    r.setAnimationLoop(() => this.frame());
  }

  // ---------- Terrain ----------
  buildGround() {
    const size = GRID * TILE;
    // Herbe de la carte constructible
    const c = document.createElement('canvas');
    c.width = c.height = 512;
    const g = c.getContext('2d');
    g.fillStyle = '#7cbf5f';
    g.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 2600; i++) {
      g.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(30,70,20,0.07)';
      g.fillRect(Math.random() * 512, Math.random() * 512, 3, 3);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(6, 6);
    tex.colorSpace = THREE.SRGBColorSpace;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshStandardMaterial({ map: tex, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    ground.userData.ground = true;
    this.ground = ground;
    this.scene.add(ground);
    // Bordure (falaise) et campagne autour
    const edge = new THREE.Mesh(new THREE.BoxGeometry(size + 1, 3, size + 1), mat('#8a6f4e'));
    edge.position.y = -1.52;
    this.scene.add(edge);
    const outer = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1400), new THREE.MeshStandardMaterial({ color: '#5f9a4a', roughness: 1 }));
    outer.rotation.x = -Math.PI / 2;
    outer.position.y = -3;
    outer.receiveShadow = true;
    this.scene.add(outer);
    // Forêt et collines tout autour (hors de la zone constructible)
    const rnd = mulberry(42);
    for (let i = 0; i < 260; i++) {
      const a = rnd() * Math.PI * 2;
      const d = HALF + 12 + rnd() * 120;
      const t = makeTree(Math.cos(a) * d, Math.sin(a) * d, 1.5 + rnd() * 2.2);
      t.position.y = -3;
      this.scene.add(t);
    }
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2 + rnd() * 0.3;
      const d = 300 + rnd() * 90;
      const hill = new THREE.Mesh(new THREE.ConeGeometry(50 + rnd() * 60, 40 + rnd() * 70, 7), mat(rnd() > 0.5 ? '#6f9f5c' : '#7aa86a', { flatShading: true }));
      hill.position.set(Math.cos(a) * d, 12, Math.sin(a) * d);
      this.scene.add(hill);
    }
    // Grille (visible en mode construction)
    this.grid = new THREE.GridHelper(size, GRID, '#ffffff', '#ffffff');
    this.grid.material.transparent = true;
    this.grid.material.opacity = 0.16;
    this.grid.position.y = 0.04;
    this.grid.visible = false;
    this.scene.add(this.grid);
  }

  clampTarget() {
    const t = this.controls.target;
    t.x = Math.max(-HALF, Math.min(HALF, t.x));
    t.z = Math.max(-HALF, Math.min(HALF, t.z));
    t.y = 0;
  }

  resize() {
    const w = this.el.clientWidth;
    const h = this.el.clientHeight;
    if (!w || !h) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.labels.setSize(w, h);
  }

  // ---------- Synchronisation avec l'état de la ville ----------
  setCity(city) {
    this.city = city;
    const seen = new Set();
    for (const b of city.buildings) {
      seen.add(b.id);
      const def = buildingDef(b.type, city.blueprints);
      if (!def) continue;
      const sig = `${b.type}|${b.x}|${b.z}|${b.rot}|${b.config?.color || ''}|${b.config?.op || ''}|${JSON.stringify(def.style)}|${b.name || ''}`;
      const cur = this.objects.get(b.id);
      if (cur && cur.sig === sig) continue;
      if (cur) this.disposeObject(b.id);
      this.objects.set(b.id, this.makeBuilding(b, def, sig));
    }
    for (const id of [...this.objects.keys()]) if (!seen.has(id)) this.disposeObject(id);
    this.updateAccess();
    this.buildRoads();
    this.buildFlows();
    this.applyLinking();
  }

  // Mode « relier des bâtiments » : bâtiments utilisables en surbrillance, les autres estompés,
  // et numéro d'étape (①②③…) sur ceux déjà reliés. info = { eligible: Set, chain: [ids] } | null
  setLinking(info) {
    this.linking = info;
    this.applyLinking();
  }
  applyLinking() {
    const info = this.linking;
    this.el.dataset.linking = info ? '1' : '';
    for (const [id, o] of this.objects) {
      const steps = info ? info.chain.map((b, i) => (b === id ? i + 1 : 0)).filter(Boolean) : [];
      o.tag.classList.toggle('eligible', Boolean(info?.eligible.has(id)));
      o.tag.classList.toggle('dim', Boolean(info && !info.eligible.has(id) && !steps.length));
      o.tag.dataset.step = steps.join(' · ');
      o.tag.classList.toggle('linked', steps.length > 0);
    }
  }
  makeBuilding(b, def, sig) {
    const fp = footprint(b, this.city.blueprints);
    // Le modèle est construit dans son sens d'origine puis tourné : son emprise devient `fp`.
    const model = buildModel(def, def.size, b.config || {});
    const group = new THREE.Group();
    group.add(model);
    // Orientation : la façade regarde vers +z ; rot tourne par quarts de tour
    model.rotation.y = -(b.rot || 0) * (Math.PI / 2);
    const [cx, cz] = tileToWorld(b.x + (fp[0] - 1) / 2, b.z + (fp[1] - 1) / 2);
    group.position.set(cx, 0, cz);
    group.traverse((o) => {
      o.userData.buildingId = b.id;
    });
    // Étiquette emoji (+ alerte « pas de route »)
    const tag = document.createElement('div');
    tag.className = 'fc-tag';
    tag.innerHTML = `<span class="em">${def.emoji}</span><span class="nm"></span><span class="warn" title="Pas de route : relie ce bâtiment à une route">🚧</span>`;
    tag.querySelector('.nm').textContent = b.name || def.name;
    const label = new CSS2DObject(tag);
    label.position.set(0, this.heightOf(model) + 1.2, 0);
    group.add(label);
    // Animation d'apparition
    group.scale.setScalar(0.01);
    group.userData.grow = 0;
    this.buildGroup.add(group);
    this.puff(cx, cz, fp);
    return { group, sig, label, tag, model, def, fp };
  }
  heightOf(o) {
    const box = new THREE.Box3().setFromObject(o);
    return Math.max(1.5, box.max.y);
  }
  disposeObject(id) {
    const o = this.objects.get(id);
    if (!o) return;
    this.buildGroup.remove(o.group);
    o.label.element.remove();
    o.group.traverse((x) => x.geometry?.dispose?.());
    this.objects.delete(id);
  }
  updateAccess() {
    if (!this.city) return;
    for (const b of this.city.buildings) {
      const o = this.objects.get(b.id);
      if (!o) continue;
      const cat = o.def.category;
      const needs = !['deco', 'roads'].includes(cat);
      o.tag.classList.toggle('no-road', needs && !hasRoadAccess(this.city, b));
    }
  }

  // Routes : asphalte + trottoirs + marquage, selon les voisins.
  buildRoads() {
    const sig = [...this.city.roads].sort().join(';');
    if (sig === this.roadSig) return;
    this.roadSig = sig;
    this.roadGroup.clear();
    const set = (this.roadSet = new Set(this.city.roads));
    const tiles = this.city.roads.map((k) => k.split(',').map(Number));
    if (!tiles.length) return;
    const asphalt = new THREE.InstancedMesh(new THREE.BoxGeometry(TILE, 0.1, TILE), mat('#3d4250'), tiles.length);
    asphalt.receiveShadow = true;
    const dashGeo = new THREE.BoxGeometry(0.22, 0.02, 1.1);
    const dashes = [];
    const curbGeo = new THREE.BoxGeometry(TILE, 0.18, 0.45);
    const curbs = [];
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const one = new THREE.Vector3(1, 1, 1);
    tiles.forEach(([x, z], i) => {
      const [wx, wz] = tileToWorld(x, z);
      m4.makeTranslation(wx, 0.05, wz);
      asphalt.setMatrixAt(i, m4);
      const n = set.has(key(x, z - 1));
      const s = set.has(key(x, z + 1));
      const e = set.has(key(x + 1, z));
      const w = set.has(key(x - 1, z));
      if ((n || s) && !(e || w)) for (const dz of [-1, 1]) dashes.push([wx, wz + dz, 0]);
      else if ((e || w) && !(n || s)) for (const dx of [-1, 1]) dashes.push([wx + dx, wz, Math.PI / 2]);
      // trottoirs sur les côtés sans route
      if (!n) curbs.push([wx, wz - TILE / 2 + 0.22, 0]);
      if (!s) curbs.push([wx, wz + TILE / 2 - 0.22, 0]);
      if (!e) curbs.push([wx + TILE / 2 - 0.22, wz, Math.PI / 2]);
      if (!w) curbs.push([wx - TILE / 2 + 0.22, wz, Math.PI / 2]);
    });
    this.roadGroup.add(asphalt);
    const inst = (geo, material, list, y) => {
      if (!list.length) return;
      const im = new THREE.InstancedMesh(geo, material, list.length);
      list.forEach(([x, z, r], i) => {
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), r);
        m4.compose(new THREE.Vector3(x, y, z), q, one);
        im.setMatrixAt(i, m4);
      });
      im.receiveShadow = true;
      this.roadGroup.add(im);
    };
    inst(dashGeo, mat('#f5f2e8'), dashes, 0.11);
    inst(curbGeo, mat('#c9c6be'), curbs, 0.09);
    this.updateAccess();
  }

  neighbors(x, z) {
    const out = [];
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (this.roadSet?.has(key(x + dx, z + dz))) out.push([x + dx, z + dz]);
    return out;
  }
  // ---------- Colis de données (exécution des workflows) ----------
  accessTile(b) {
    const fp = footprint(b, this.city.blueprints);
    for (let i = -1; i <= fp[0]; i++)
      for (let j = -1; j <= fp[1]; j++) {
        const edge = i === -1 || j === -1 || i === fp[0] || j === fp[1];
        const corner = (i === -1 || i === fp[0]) && (j === -1 || j === fp[1]);
        if (edge && !corner && this.roadSet?.has(key(b.x + i, b.z + j))) return [b.x + i, b.z + j];
      }
    return null;
  }
  roadPath(a, b) {
    if (!a || !b) return null;
    const start = key(...a);
    const goal = key(...b);
    const prev = new Map([[start, null]]);
    const queue = [a];
    while (queue.length) {
      const cur = queue.shift();
      const k = key(...cur);
      if (k === goal) break;
      for (const n of this.neighbors(...cur)) {
        const nk = key(...n);
        if (!prev.has(nk)) {
          prev.set(nk, cur);
          queue.push(n);
        }
      }
    }
    if (!prev.has(goal)) return null;
    const path = [];
    let cur = b;
    while (cur) {
      path.unshift(cur);
      cur = prev.get(key(...cur));
    }
    return path;
  }
  centerOf(id) {
    const o = this.objects.get(id);
    return o ? o.group.position.clone() : null;
  }
  // Trajet entre deux bâtiments : par la route si possible, sinon un arc dans les airs.
  routeCurve(fromId, toId, y = 0.8) {
    const A = this.city?.buildings.find((b) => b.id === fromId);
    const B = this.city?.buildings.find((b) => b.id === toId);
    const pa = this.centerOf(fromId);
    const pb = this.centerOf(toId);
    if (!pa || !pb) return null;
    if (fromId !== toId) {
      const path = this.roadPath(this.accessTile(A), this.accessTile(B));
      if (path && path.length) {
        const pts = [pa.clone().setY(y), ...path.map((t) => {
          const [x, z] = tileToWorld(...t);
          return new THREE.Vector3(x, y, z);
        }), pb.clone().setY(y)];
        return { curve: new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.1), road: true };
      }
    }
    const mid = pa.clone().lerp(pb, 0.5);
    mid.y = 8 + pa.distanceTo(pb) * 0.15;
    return { curve: new THREE.CatmullRomCurve3([pa.clone().setY(3), mid, pb.clone().setY(3)], false, 'catmullrom', 0.5), road: false };
  }

  // Flux permanents : un ruban lumineux par workflow actif, avec des données qui y circulent.
  setFlows(spec) {
    this.flowSpec = spec || [];
    this.buildFlows();
  }
  buildFlows() {
    for (const f of this.flows) this.fxGroup.remove(f.group);
    this.flows = [];
    if (!this.city) return;
    for (const spec of this.flowSpec) {
      const group = new THREE.Group();
      const segs = [];
      for (let i = 0; i < spec.chain.length - 1; i++) {
        const r = this.routeCurve(spec.chain[i], spec.chain[i + 1], 0.35 + (spec.lane || 0) * 0.12);
        if (!r) continue;
        const tube = new THREE.Mesh(new THREE.TubeGeometry(r.curve, Math.max(8, Math.round(r.curve.getLength())), 0.12, 6, false), new THREE.MeshBasicMaterial({ color: spec.color, transparent: true, opacity: 0.55, depthWrite: false }));
        group.add(tube);
        segs.push(r.curve);
      }
      if (!segs.length) continue;
      const dots = [];
      const total = segs.reduce((a, c) => a + c.getLength(), 0);
      const n = Math.max(2, Math.min(12, Math.round(total / 10)));
      for (let k = 0; k < n; k++) {
        const d = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 8), new THREE.MeshBasicMaterial({ color: spec.color }));
        group.add(d);
        dots.push({ mesh: d, t: k / n });
      }
      this.fxGroup.add(group);
      this.flows.push({ group, segs, dots, total, speed: 6 / total });
    }
  }
  stepFlows(dt, t) {
    for (const f of this.flows) {
      for (const d of f.dots) {
        d.t = (d.t + dt * f.speed) % 1;
        // position le long de la suite de segments
        let dist = d.t * f.total;
        for (const c of f.segs) {
          const L = c.getLength();
          if (dist <= L) {
            d.mesh.position.copy(c.getPointAt(dist / L));
            break;
          }
          dist -= L;
        }
        d.mesh.scale.setScalar(0.8 + Math.sin(t * 6 + d.t * 20) * 0.2);
      }
    }
  }

  // Envoie un colis du bâtiment A au bâtiment B (pendant un test ou une exécution).
  sendPacket(fromId, toId, color = '#33c6ff') {
    const route = this.routeCurve(fromId, toId);
    if (!route) return;
    const mesh = new THREE.Group();
    const cube = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.9), mat(color, { emissive: color, emissiveIntensity: 1.2 }));
    mesh.add(cube);
    const glow = new THREE.PointLight(color, 6, 8);
    mesh.add(glow);
    this.fxGroup.add(mesh);
    const { curve, road } = route;
    const length = curve.getLength();
    const p = { mesh, curve, t: 0, speed: Math.max(0.35, 22 / Math.max(4, length)), road, cube };
    this.packets.push(p);
    return p;
  }
  pulse(id, kind = 'ok') {
    const o = this.objects.get(id);
    if (!o) return;
    const color = kind === 'error' ? '#ff3355' : kind === 'run' ? '#ffd23f' : '#2fd17a';
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.9, 32), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.copy(o.group.position).setY(0.2);
    ring.userData.life = 0;
    ring.userData.max = Math.max(o.fp[0], o.fp[1]) * TILE * 0.9;
    this.fxGroup.add(ring);
    (this.rings ||= []).push(ring);
    o.tag.classList.remove('flash-ok', 'flash-error', 'flash-run');
    void o.tag.offsetWidth;
    o.tag.classList.add(`flash-${kind}`);
  }
  puff(x, z, fp) {
    for (let i = 0; i < 10; i++) {
      const s = new THREE.Mesh(new THREE.IcosahedronGeometry(0.5 + Math.random() * 0.5, 0), mat('#f0ece4', { transparent: true, opacity: 0.8, flatShading: true }));
      s.position.set(x + (Math.random() - 0.5) * fp[0] * TILE, 0.4, z + (Math.random() - 0.5) * fp[1] * TILE);
      s.userData.v = new THREE.Vector3((Math.random() - 0.5) * 2, 2 + Math.random() * 2, (Math.random() - 0.5) * 2);
      s.userData.life = 0;
      this.fxGroup.add(s);
      (this.puffs ||= []).push(s);
    }
  }
  focus(id) {
    const p = this.centerOf(id);
    if (!p) return;
    this.flyTo = { from: this.controls.target.clone(), to: p.setY(0), t: 0 };
  }

  // ---------- Outils ----------
  setTool(tool) {
    this.tool = tool || { kind: 'select' };
    const building = this.tool.kind === 'build';
    this.grid.visible = this.tool.kind !== 'select';
    this.controls.mouseButtons.LEFT = this.tool.kind === 'select' ? THREE.MOUSE.PAN : null;
    this.ghost.clear();
    this.ghost.visible = false;
    this.cursor.visible = false;
    this.roadPreview.clear();
    if (building) {
      const def = this.tool.def;
      const model = buildModel(def, def.size, {});
      model.traverse((o) => {
        if (o.isMesh) {
          o.material = o.material.clone();
          o.material.transparent = true;
          o.material.opacity = 0.6;
          o.castShadow = false;
        }
      });
      this.ghostModel = model;
      this.ghost.add(model);
      this.rot = 0;
    }
    this.el.dataset.tool = this.tool.kind;
  }
  rotateGhost() {
    this.rot = (this.rot + 1) % 4;
    if (this.ghostModel) this.ghostModel.rotation.y = -this.rot * (Math.PI / 2);
    this.updateHover();
  }

  // ---------- Entrées ----------
  bindInput() {
    const dom = this.renderer.domElement;
    let down = null;
    dom.addEventListener('pointermove', (e) => {
      if (this.mode === 'pov') return;
      const r = dom.getBoundingClientRect();
      this.mouse.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      this.pointerIn = true;
      this.updateHover();
      if (down && this.tool.kind === 'road' && this.hoverTile) this.previewRoad(down.tile, this.hoverTile);
      if (down && this.tool.kind === 'bulldoze' && this.hoverTile) this.previewRoad(down.tile, this.hoverTile, true);
    });
    dom.addEventListener('pointerleave', () => {
      this.pointerIn = false;
      this.cursor.visible = false;
      this.ghost.visible = false;
      this.h.onHover?.(null);
    });
    dom.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || this.mode === 'pov') return;
      down = { x: e.clientX, y: e.clientY, tile: this.hoverTile, building: this.hoverBuilding };
      if (this.tool.kind === 'road' || this.tool.kind === 'bulldoze') dom.setPointerCapture(e.pointerId);
    });
    dom.addEventListener('pointerup', (e) => {
      if (e.button !== 0 || !down) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6;
      const start = down;
      down = null;
      this.roadPreview.clear();
      if (this.tool.kind === 'road' && start.tile && this.hoverTile) {
        this.h.onRoads?.({ add: lineTiles(start.tile, this.hoverTile) });
        return;
      }
      if (this.tool.kind === 'bulldoze') {
        if (moved && start.tile && this.hoverTile) this.h.onRoads?.({ remove: lineTiles(start.tile, this.hoverTile) });
        else if (this.hoverBuilding) this.h.onBulldoze?.(this.hoverBuilding);
        else if (this.hoverTile) this.h.onRoads?.({ remove: [this.hoverTile] });
        return;
      }
      if (moved) return;
      if (this.tool.kind === 'build' && this.hoverTile) {
        const [w, d] = this.rot % 2 ? [this.tool.def.size[1], this.tool.def.size[0]] : this.tool.def.size;
        this.h.onPlace?.({ x: this.hoverTile[0] - Math.floor((w - 1) / 2), z: this.hoverTile[1] - Math.floor((d - 1) / 2), rot: this.rot });
        return;
      }
      if (this.tool.kind === 'select') this.h.onSelect?.(this.hoverBuilding || null);
    });
    dom.addEventListener('contextmenu', (e) => e.preventDefault());
    dom.addEventListener('click', () => {
      if (this.mode === 'pov' && document.pointerLockElement !== dom) dom.requestPointerLock?.();
    });
    document.addEventListener('mousemove', (e) => {
      if (this.mode !== 'pov' || document.pointerLockElement !== dom) return;
      this.player.yaw -= e.movementX * 0.0025;
      this.player.pitch = Math.max(-1.2, Math.min(1.2, this.player.pitch - e.movementY * 0.0025));
    });
    window.addEventListener('keydown', (e) => {
      if (/input|textarea|select/i.test(document.activeElement?.tagName || '') || document.activeElement?.isContentEditable) return;
      this.keys.add(e.key.toLowerCase());
      if (e.key.toLowerCase() === 'r' && this.tool.kind === 'build') this.rotateGhost();
      if (this.mode === 'pov' && e.key.toLowerCase() === 'e' && this.povTarget) {
        document.exitPointerLock?.();
        this.h.onSelect?.(this.povTarget);
      }
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => this.keys.clear());
  }
  pick() {
    this.ray.setFromCamera(this.mouse, this.camera);
    const hits = this.ray.intersectObjects([this.buildGroup, this.ground], true);
    let building = null;
    let point = null;
    for (const h of hits) {
      if (!building && h.object.userData.buildingId) building = h.object.userData.buildingId;
      if (h.object === this.ground) {
        point = h.point;
        break;
      }
    }
    if (!point) {
      const p = new THREE.Vector3();
      if (this.ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), p)) point = p;
    }
    return { building, point };
  }
  updateHover() {
    if (!this.pointerIn) return;
    const { building, point } = this.pick();
    const tile = point ? worldToTile(point.x, point.z) : null;
    const inside = tile && tile[0] >= 0 && tile[1] >= 0 && tile[0] < GRID && tile[1] < GRID;
    this.hoverTile = inside ? tile : null;
    if (building !== this.hoverBuilding) {
      if (this.hoverBuilding) this.objects.get(this.hoverBuilding)?.tag.classList.remove('hover');
      this.hoverBuilding = building;
      if (building) this.objects.get(building)?.tag.classList.add('hover');
      this.h.onHover?.(building);
    }
    // Curseur et fantôme
    if (this.tool.kind === 'build' && inside) {
      const def = this.tool.def;
      const [w, d] = this.rot % 2 ? [def.size[1], def.size[0]] : def.size;
      const x = tile[0] - Math.floor((w - 1) / 2);
      const z = tile[1] - Math.floor((d - 1) / 2);
      const [cx, cz] = tileToWorld(x + (w - 1) / 2, z + (d - 1) / 2);
      this.ghost.position.set(cx, 0.02, cz);
      this.ghost.visible = true;
      const ok = this.h.canPlace ? this.h.canPlace(x, z, this.rot) : true;
      this.cursor.visible = true;
      this.cursor.scale.set(w, d, 1);
      this.cursor.position.set(cx, 0.07, cz);
      this.cursor.material.color.set(ok ? '#5dff8a' : '#ff4d5e');
      this.cursor.material.opacity = 0.45;
    } else if ((this.tool.kind === 'road' || this.tool.kind === 'bulldoze') && inside) {
      this.ghost.visible = false;
      const [cx, cz] = tileToWorld(...tile);
      this.cursor.visible = true;
      this.cursor.scale.set(1, 1, 1);
      this.cursor.position.set(cx, 0.07, cz);
      this.cursor.material.color.set(this.tool.kind === 'bulldoze' ? '#ff4d5e' : '#ffffff');
    } else {
      this.cursor.visible = false;
      this.ghost.visible = false;
    }
  }
  previewRoad(a, b, remove = false) {
    this.roadPreview.clear();
    if (!a || !b) return;
    const geo = new THREE.PlaneGeometry(TILE * 0.96, TILE * 0.96);
    const m = new THREE.MeshBasicMaterial({ color: remove ? '#ff4d5e' : '#8fa3c7', transparent: true, opacity: 0.6, depthWrite: false });
    for (const [x, z] of lineTiles(a, b)) {
      const p = new THREE.Mesh(geo, m);
      p.rotation.x = -Math.PI / 2;
      const [wx, wz] = tileToWorld(x, z);
      p.position.set(wx, 0.13, wz);
      this.roadPreview.add(p);
    }
  }

  // ---------- Balade à pied (POV) ----------
  setMode(mode) {
    if (mode === this.mode) return;
    this.mode = mode;
    const pov = mode === 'pov';
    this.controls.enabled = !pov;
    this.setTool({ kind: 'select' });
    this.el.dataset.mode = mode;
    if (pov) {
      this.savedView = { pos: this.camera.position.clone(), target: this.controls.target.clone() };
      const m = this.city?.buildings.find((b) => b.type === 'mairie');
      // On apparaît devant la Mairie (sinon au centre de la vue), en regardant vers elle
      const [sx, sz] = m ? tileToWorld(m.x + 1, m.z + 4) : [this.controls.target.x, this.controls.target.z];
      this.player = { x: sx, z: sz, yaw: 0, pitch: -0.05 };
      if (this.blocked(this.player.x, this.player.z)) this.player = { ...this.player, ...this.freeSpot() };
      this.camera.fov = 70;
      this.camera.near = 0.1;
      this.camera.updateProjectionMatrix();
      this.renderer.domElement.requestPointerLock?.();
    } else {
      document.exitPointerLock?.();
      this.camera.fov = 42;
      this.camera.near = 0.5;
      this.camera.updateProjectionMatrix();
      if (this.savedView) {
        this.camera.position.copy(this.savedView.pos);
        this.controls.target.copy(this.savedView.target);
      }
    }
    this.h.onMode?.(mode);
  }
  // Peut-on marcher ici ? (bord de la carte, murs des bâtiments ; parcs et fontaines se traversent)
  blocked(x, z) {
    if (Math.abs(x) > HALF - 0.5 || Math.abs(z) > HALF - 0.5) return true;
    if (!this.city) return false;
    const [tx, tz] = worldToTile(x, z);
    return this.city.buildings.some((b) => {
      const def = buildingDef(b.type, this.city.blueprints);
      if (!def || ['park', 'fountain', 'lamp'].includes(def.style?.shape)) return false;
      const [w, d] = footprint(b, this.city.blueprints);
      return tx >= b.x && tx < b.x + w && tz >= b.z && tz < b.z + d;
    });
  }
  freeSpot() {
    for (let r = 0; r < GRID; r++)
      for (let i = -r; i <= r; i++) {
        const [x, z] = tileToWorld(GRID / 2 + i, GRID / 2 + r);
        if (!this.blocked(x, z)) return { x, z };
      }
    return { x: 0, z: 0 };
  }
  stepPov(dt) {
    const p = this.player;
    const k = this.keys;
    const sp = (k.has('shift') ? 14 : 7) * dt;
    const fx = -Math.sin(p.yaw);
    const fz = -Math.cos(p.yaw);
    let mx = 0;
    let mz = 0;
    if (k.has('z') || k.has('w') || k.has('arrowup')) (mx += fx), (mz += fz);
    if (k.has('s') || k.has('arrowdown')) (mx -= fx), (mz -= fz);
    if (k.has('d') || k.has('arrowright')) (mx -= fz), (mz += fx);
    if (k.has('q') || k.has('a') || k.has('arrowleft')) (mx += fz), (mz -= fx);
    const len = Math.hypot(mx, mz);
    if (len) {
      const nx = p.x + (mx / len) * sp;
      const nz = p.z + (mz / len) * sp;
      if (!this.blocked(nx, p.z)) p.x = nx;
      if (!this.blocked(p.x, nz)) p.z = nz;
    }
    this.walk = (this.walk || 0) + (len ? dt * 9 : 0);
    this.camera.position.set(p.x, 1.7 + Math.sin(this.walk) * 0.05, p.z);
    this.camera.rotation.set(p.pitch, p.yaw, 0, 'YXZ');
    // Bâtiment visé (au centre de l'écran)
    this.ray.setFromCamera(new THREE.Vector2(0, 0), this.camera);
    const hit = this.ray.intersectObject(this.buildGroup, true).find((x) => x.distance < 14 && x.object.userData.buildingId);
    const id = hit?.object.userData.buildingId || null;
    if (id !== this.povTarget) {
      this.povTarget = id;
      this.h.onPovTarget?.(id);
    }
  }

  // ---------- Jour / nuit ----------
  setNightAuto() {
    const h = new Date().getHours() + new Date().getMinutes() / 60;
    this.nightTarget = h < 6.5 || h > 20.5 ? 1 : h < 7.5 ? 7.5 - h : h > 19.5 ? h - 19.5 : 0;
  }
  setNight(v) {
    this.nightTarget = v;
  }

  // ---------- Boucle ----------
  frame() {
    const dt = Math.min(0.05, this.clock.getDelta());
    const t = this.clock.elapsedTime;
    // Clavier : ZQSD / WASD / flèches pour se déplacer, A/E pour tourner
    const k = this.keys;
    if (this.mode === 'pov') this.stepPov(dt);
    else if (k.size) {
      const fwd = new THREE.Vector3();
      this.camera.getWorldDirection(fwd);
      fwd.y = 0;
      fwd.normalize();
      const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0));
      const sp = 40 * dt * (k.has('shift') ? 2.2 : 1);
      const mv = new THREE.Vector3();
      if (k.has('z') || k.has('w') || k.has('arrowup')) mv.add(fwd);
      if (k.has('s') || k.has('arrowdown')) mv.sub(fwd);
      if (k.has('d') || k.has('arrowright')) mv.add(right);
      if (k.has('q') || k.has('arrowleft')) mv.sub(right);
      if (mv.lengthSq()) {
        mv.normalize().multiplyScalar(sp);
        this.camera.position.add(mv);
        this.controls.target.add(mv);
        this.clampTarget();
      }
      const turn = (k.has('e') ? 1 : 0) - (k.has('a') ? 1 : 0);
      if (turn) {
        const off = this.camera.position.clone().sub(this.controls.target);
        off.applyAxisAngle(new THREE.Vector3(0, 1, 0), turn * dt * 1.4);
        this.camera.position.copy(this.controls.target).add(off);
      }
    }
    if (this.flyTo) {
      const f = this.flyTo;
      f.t = Math.min(1, f.t + dt * 1.6);
      const e = f.t < 0.5 ? 2 * f.t * f.t : 1 - (-2 * f.t + 2) ** 2 / 2;
      const target = f.from.clone().lerp(f.to, e);
      const delta = target.clone().sub(this.controls.target);
      this.controls.target.add(delta);
      this.camera.position.add(delta);
      if (f.t >= 1) this.flyTo = null;
    }
    if (this.mode !== 'pov') this.controls.update();

    // Apparition des bâtiments
    for (const o of this.objects.values()) {
      if (o.group.userData.grow < 1) {
        o.group.userData.grow = Math.min(1, o.group.userData.grow + dt * 2.5);
        const g = o.group.userData.grow;
        const xz = Math.min(1, g * 1.6);
        o.group.scale.set(xz, 1 - (1 - g) ** 3, xz);
      }
    }
    // Petits détails animés
    this.buildGroup.traverse((o) => {
      const u = o.userData;
      if (u.spin) o.rotation.y += dt * 1.5;
      else if (u.blink) o.material.emissiveIntensity = Math.sin(t * 4) > 0 ? 2.5 : 0.2;
      else if (u.smoke) {
        const ph = (t * 0.5 + u.smoke.x) % 1;
        o.position.y = u.smoke.y + ph * 3;
        o.scale.setScalar(0.6 + ph * 1.4);
        o.material.opacity = 0.6 * (1 - ph);
      } else if (u.flag) o.rotation.y = Math.sin(t * 3) * 0.3;
      else if (u.jet) o.scale.y = 1 + Math.sin(t * 6) * 0.08;
      else if (u.clockHand) o.rotation.z = -t * 0.5;
      else if (u.lamp) o.material.emissiveIntensity = 0.3 + this.night * 3;
    });
    this.stepFlows(dt, t);
    // Colis
    for (let i = this.packets.length - 1; i >= 0; i--) {
      const p = this.packets[i];
      p.t += dt * p.speed;
      const pos = p.curve.getPointAt(Math.min(1, p.t));
      p.mesh.position.copy(pos);
      p.cube.rotation.y += dt * 4;
      p.cube.rotation.x += dt * 2;
      if (p.t >= 1) {
        this.fxGroup.remove(p.mesh);
        this.packets.splice(i, 1);
      }
    }
    for (let i = (this.rings || []).length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.userData.life += dt;
      const s = 1 + r.userData.life * r.userData.max * 1.6;
      r.scale.setScalar(s);
      r.material.opacity = Math.max(0, 0.9 - r.userData.life * 1.3);
      if (r.userData.life > 0.7) {
        this.fxGroup.remove(r);
        this.rings.splice(i, 1);
      }
    }
    for (let i = (this.puffs || []).length - 1; i >= 0; i--) {
      const s = this.puffs[i];
      s.userData.life += dt;
      s.position.addScaledVector(s.userData.v, dt);
      s.material.opacity = Math.max(0, 0.8 - s.userData.life);
      if (s.userData.life > 0.8) {
        this.fxGroup.remove(s);
        this.puffs.splice(i, 1);
      }
    }
    // Jour / nuit en douceur
    if (Math.abs(this.night - this.nightTarget) > 0.001) {
      this.night += (this.nightTarget - this.night) * Math.min(1, dt * 2);
      const n = this.night;
      nightUniform.value = n;
      this.skyColor.set('#9fd3ff').lerp(new THREE.Color('#0d1530'), n);
      this.scene.fog.color.copy(this.skyColor);
      this.hemi.intensity = 1.0 - n * 0.7;
      this.sun.intensity = 2.2 - n * 1.9;
      this.sun.color.set('#fff3dd').lerp(new THREE.Color('#8aa2ff'), n);
    }
    this.renderer.render(this.scene, this.camera);
    this.labels.render(this.scene, this.camera);
  }

  screenshotTarget() {
    return this.controls.target.clone();
  }
}

// Cases d'une ligne en L entre deux cases (d'abord horizontal, puis vertical)
export function lineTiles(a, b) {
  const out = [];
  const [x0, z0] = a;
  const [x1, z1] = b;
  const sx = Math.sign(x1 - x0) || 1;
  const sz = Math.sign(z1 - z0) || 1;
  const horizontalFirst = Math.abs(x1 - x0) >= Math.abs(z1 - z0);
  if (horizontalFirst) {
    for (let x = x0; x !== x1 + sx; x += sx) out.push([x, z0]);
    for (let z = z0 + sz; z !== z1 + sz; z += sz) if (z0 !== z1) out.push([x1, z]);
  } else {
    for (let z = z0; z !== z1 + sz; z += sz) out.push([x0, z]);
    for (let x = x0 + sx; x !== x1 + sx; x += sx) if (x0 !== x1) out.push([x, z1]);
  }
  return out;
}

function mulberry(a) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
