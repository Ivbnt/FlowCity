// Rendu 3D de la ville : HQ au centre, un quartier par dossier racine, une maison par projet,
// des chambres flottantes autour de la maison sélectionnée, des agents Claude qui se baladent
// et des drones pour les workflows n8n.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { norm } from '../shared/advisor.mjs';
import { skyState, applySky } from './sky.js';
import { organizeCity, subNode } from '../shared/layout.mjs';
import { LANDMARK_BUILDERS, LANDMARK_SIZE, LANDMARK_ICON, buildLibrary, buildSchool, buildBellTower, buildBoard, posterTexture, glass } from './landmarks.js';

export const DISTRICT_COLORS = {
  communication: '#33c6ff',
  event: '#ffb020',
  administratif: '#9b7bff',
  musique: '#ff3355',
};
const EXTRA_COLORS = ['#2fd17a', '#ff6bd5', '#4f8bff', '#ff8a3d'];
export const KIND_COLORS = {
  doc: '#4f8bff',
  sheet: '#2fd17a',
  slides: '#ffb020',
  pdf: '#ff5a5a',
  image: '#c86bff',
  audio: '#ff6bd5',
  video: '#ff8a3d',
  file: '#9aa0b4',
};
export function districtColor(node, i) {
  const n = norm(node.name);
  for (const [k, c] of Object.entries(DISTRICT_COLORS)) if (n.includes(k.slice(0, 5))) return c;
  return EXTRA_COLORS[i % EXTRA_COLORS.length];
}
export function scoreColor(score) {
  return score >= 75 ? '#2fd17a' : score >= 45 ? '#ffb020' : '#ff3355';
}

const PLATFORM_H = 0.6;
const CELL = 10.5;
const SUB_CELL = 8.2;
const SUB_H = 0.35;
const LOT_GAP = 3;

// Range les parcelles (sous-quartiers) en rangées dans le quartier.
function packDistrict(L) {
  const flat = L.mode === 'flat';
  const lots = L.subs.map((sub) => {
    if (sub.landmark) {
      const [w, dep] = LANDMARK_SIZE[sub.landmark];
      return { sub, cols: 1, rows: 1, cell: 0, w, dep };
    }
    const n = sub.items.length;
    const cols = Math.max(flat ? 2 : 1, Math.ceil(Math.sqrt(n)));
    const rows = Math.max(1, Math.ceil(n / cols));
    const cell = flat ? CELL : SUB_CELL;
    return { sub, cols, rows, cell, w: cols * cell + (flat ? 4 : 2.6), dep: rows * cell + (flat ? 4 : 2.6) };
  });
  if (flat) return { w: lots[0].w, dep: lots[0].dep, lots: lots.map((l) => ({ ...l, x: 0, z: 0 })) };
  const area = lots.reduce((s, l) => s + (l.w + LOT_GAP) * (l.dep + LOT_GAP), 0);
  // Les bâtiments emblématiques (banque + mairie, studio + magasin) restent côte à côte
  const maxW = L.mode === 'landmarks' ? lots.reduce((s, l) => s + l.w + LOT_GAP, 0) : Math.max(...lots.map((l) => l.w), Math.sqrt(area) * 1.15);
  const rowsOut = [];
  let row = { items: [], w: 0, dep: 0 };
  for (const l of lots) {
    if (row.items.length && row.w + LOT_GAP + l.w > maxW) {
      rowsOut.push(row);
      row = { items: [], w: 0, dep: 0 };
    }
    row.w += (row.items.length ? LOT_GAP : 0) + l.w;
    row.dep = Math.max(row.dep, l.dep);
    row.items.push(l);
  }
  rowsOut.push(row);
  const innerW = Math.max(...rowsOut.map((r) => r.w));
  const innerD = rowsOut.reduce((s, r) => s + r.dep, 0) + LOT_GAP * (rowsOut.length - 1);
  const w = innerW + 5;
  const dep = innerD + 6;
  let zc = -innerD / 2;
  const placed = [];
  for (const r of rowsOut) {
    let xc = -r.w / 2;
    for (const l of r.items) {
      placed.push({ ...l, x: xc + l.w / 2, z: zc + r.dep / 2 - 0.6 });
      xc += l.w + LOT_GAP;
    }
    zc += r.dep + LOT_GAP;
  }
  return { w, dep, lots: placed };
}
// Aléatoire déterministe : la ville garde la même disposition d'arbres à chaque lancement.
let seed = 7;
function rand() {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
}

function walkItems(items, fn) {
  for (const it of items || []) {
    fn(it);
    walkItems(it.children, fn);
  }
}

function roundedRect(w, d, r) {
  const s = new THREE.Shape();
  const x = -w / 2;
  const y = -d / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + d - r);
  s.quadraticCurveTo(x + w, y + d, x + w - r, y + d);
  s.lineTo(x + r, y + d);
  s.quadraticCurveTo(x, y + d, x, y + d - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function makeWindowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#000';
  g.fillRect(0, 0, 128, 128);
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 4; x++) {
      const lit = Math.random();
      if (lit < 0.45) continue;
      g.fillStyle = lit > 0.9 ? '#ffd7a0' : lit > 0.7 ? '#ffb86b' : '#6f7cff';
      g.globalAlpha = 0.55 + Math.random() * 0.45;
      g.fillRect(x * 32 + 9, y * 32 + 8, 14, 18);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function label(html, cls) {
  const el = document.createElement('div');
  el.className = cls;
  el.innerHTML = html;
  return new CSS2DObject(el);
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

class Agent {
  constructor(city, { id, name, color, kind = 'claude', home = null, scale = 1, wander = null, stops = null, pickId = null }) {
    this.city = city;
    this.id = id;
    this.kind = kind;
    this.home = home;
    this.wander = wander;
    this.stops = stops;
    this.stopIdx = 0;
    this.hold = false;
    this.path = [];
    this.wait = 1 + Math.random() * 2;
    this.working = false;
    this.district = null;
    this.speed = kind === 'claude' ? 7 : kind === 'kid' ? 3.2 : kind === 'postman' ? 4.5 : 5;
    const col = new THREE.Color(color);
    const g = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.32, 0.55, 4, 12),
      new THREE.MeshStandardMaterial({ color: 0x1a1a24, emissive: col, emissiveIntensity: 0.35, roughness: 0.4 }),
    );
    body.position.y = 0.65;
    body.castShadow = true;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 16, 12), new THREE.MeshBasicMaterial({ color: col }));
    head.position.y = 1.35;
    const halo = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.04, 8, 32), new THREE.MeshBasicMaterial({ color: col }));
    halo.rotation.x = Math.PI / 2;
    halo.position.y = 1.75;
    g.add(body, head, halo);
    this.halo = halo;
    if (kind === 'postman') {
      // Casquette jaune + sacoche
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.3, 0.14, 16), new THREE.MeshStandardMaterial({ color: '#ffcf33' }));
      cap.position.y = 1.55;
      const bag = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.34, 0.18), new THREE.MeshStandardMaterial({ color: '#8a5a2b' }));
      bag.position.set(0.32, 0.75, 0.05);
      g.add(cap, bag);
      halo.visible = false;
      body.material.emissive.set('#2050ff');
    }
    if (kind === 'kid') halo.visible = false;
    g.scale.setScalar(scale);
    if (pickId) {
      body.userData.nodeId = pickId;
      head.userData.nodeId = pickId;
      city.pickables.push(body, head);
      this.pickMeshes = [body, head];
    }
    this.bubble = label(`<b>${esc(name)}</b><span></span>`, `agent-bubble agent-${kind}`);
    this.bubble.position.y = 2.4;
    this.bubble.element.style.setProperty('--c', color);
    g.add(this.bubble);
    this.group = g;
    this.t = Math.random() * 10;
    city.agentLayer.add(g);
    if (wander) {
      g.position.copy(wander());
      this.district = null;
    } else if (stops?.length) {
      g.position.copy(stops[0].pos);
      this.district = stops[0].district;
    } else {
      const start = city.randomSpot(home);
      g.position.copy(start.pos);
      this.district = start.district;
    }
  }

  say(text) {
    const span = this.bubble.element.querySelector('span');
    span.textContent = text || '';
    this.bubble.element.classList.toggle('has-text', Boolean(text));
  }

  goTo(target, districtId) {
    this.path = this.city.route(this.group.position, this.district, target, districtId);
    this.district = districtId;
  }

  update(dt) {
    this.t += dt;
    const p = this.group.position;
    if (this.path.length) {
      const next = this.path[0];
      const d = next.clone().sub(p);
      const dist = d.length();
      const step = this.speed * dt;
      if (dist <= step) {
        p.copy(next);
        this.path.shift();
      } else {
        d.normalize();
        p.addScaledVector(d, step);
        this.group.rotation.y = Math.atan2(d.x, d.z);
      }
      this.group.children[0].position.y = 0.65 + Math.abs(Math.sin(this.t * 10)) * 0.12;
    } else if (!this.working && !this.hold) {
      this.wait -= dt;
      if (this.wait <= 0) {
        if (this.stops?.length) {
          // Tournée du facteur
          this.stopIdx = (this.stopIdx + 1) % this.stops.length;
          const st = this.stops[this.stopIdx];
          this.goTo(st.pos.clone(), st.district);
          this.say(this.stopIdx % 3 === 0 ? '📬' : '');
          this.wait = 1.5;
        } else if (this.wander) {
          this.goTo(this.wander(), null);
          this.wait = 1 + Math.random() * 3;
        } else {
          const s = this.city.randomSpot(this.home);
          this.goTo(s.pos, s.district);
          this.wait = 2 + Math.random() * 4;
        }
      }
    }
    this.halo.rotation.z += dt * (this.working ? 6 : 1.2);
    this.halo.scale.setScalar(this.working ? 1 + Math.sin(this.t * 8) * 0.15 : 1);
  }

  dispose() {
    if (this.pickMeshes) this.city.pickables = this.city.pickables.filter((m) => !this.pickMeshes.includes(m));
    this.city.agentLayer.remove(this.group);
    this.bubble.element.remove();
  }
}

export class City {
  constructor(container, { onSelect, onHover, onOpen } = {}) {
    this.container = container;
    this.onSelect = onSelect || (() => {});
    this.onHover = onHover || (() => {});
    this.onOpen = onOpen || (() => {});
    this.nodes = new Map();
    this.pickables = [];
    this.agents = new Map();
    this.drones = new Map();
    this.tweens = [];
    this.selectedId = null;
    this.clock = new THREE.Clock();
    this.windowTex = makeWindowTexture();
    this.anims = [];
    this.civic = [];
    this.labelExtra = {};
    this.glassMat = glass;

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    container.appendChild(renderer.domElement);
    this.renderer = renderer;

    const labels = new CSS2DRenderer();
    labels.domElement.className = 'label-layer';
    container.appendChild(labels.domElement);
    this.labelRenderer = labels;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#06060b');
    scene.fog = new THREE.FogExp2('#06060b', 0.0085);
    this.scene = scene;

    const camera = new THREE.PerspectiveCamera(48, 1, 0.5, 900);
    camera.position.set(70, 62, 92);
    this.camera = camera;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.maxPolarAngle = Math.PI / 2.15;
    controls.minDistance = 8;
    controls.maxDistance = 260;
    controls.target.set(0, 0, 0);
    this.controls = controls;

    this.hemi = new THREE.HemisphereLight('#6a6dff', '#1a0610', 0.55);
    scene.add(this.hemi);
    const moon = new THREE.DirectionalLight('#cfd6ff', 1.1);
    this.sunLight = moon;
    moon.position.set(-60, 110, 40);
    moon.castShadow = true;
    moon.shadow.mapSize.set(2048, 2048);
    Object.assign(moon.shadow.camera, { left: -110, right: 110, top: 110, bottom: -110, near: 10, far: 300 });
    moon.shadow.bias = -0.0005;
    scene.add(moon);
    const redGlow = new THREE.PointLight('#ff2d55', 400, 90, 1.6);
    redGlow.position.set(0, 18, 0);
    scene.add(redGlow);
    this.redGlow = redGlow;

    this.buildEnvironment();

    this.world = new THREE.Group();
    this.agentLayer = new THREE.Group();
    scene.add(this.world, this.agentLayer);

    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.85, 0.55, 0.35);
    composer.addPass(this.bloom);
    composer.addPass(new OutputPass());
    this.composer = composer;

    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.bindEvents();
    new ResizeObserver(() => this.resize()).observe(container);
    this.resize();
    renderer.setAnimationLoop(() => this.tick());
  }

  buildEnvironment() {
    // Dôme de ciel : dégradé zénith → horizon + disque du soleil / de la lune.
    this.skyUniforms = {
      top: { value: new THREE.Color('#05050c') },
      horizon: { value: new THREE.Color('#1a0d22') },
      bottom: { value: new THREE.Color('#06060b') },
      sunDir: { value: new THREE.Vector3(-0.4, 0.6, 0.3).normalize() },
      sunColor: { value: new THREE.Color('#dfe6ff') },
      sunSize: { value: 0.9994 },
      glow: { value: 0.25 },
    };
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(520, 48, 24),
      new THREE.ShaderMaterial({
        uniforms: this.skyUniforms,
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: `uniform vec3 top; uniform vec3 horizon; uniform vec3 bottom; uniform vec3 sunDir; uniform vec3 sunColor; uniform float sunSize; uniform float glow;
          varying vec3 vDir;
          void main(){
            float h = vDir.y;
            vec3 col = h > 0.0 ? mix(horizon, top, pow(smoothstep(0.0, 0.55, h), 0.8)) : mix(horizon, bottom, smoothstep(0.0, 0.12, -h));
            float d = dot(normalize(vDir), normalize(sunDir));
            col += sunColor * glow * pow(max(d, 0.0), 24.0);
            col += sunColor * smoothstep(sunSize, sunSize + 0.0004, d) * 1.6;
            gl_FragColor = vec4(col, 1.0);
            #include <colorspace_fragment>
          }`,
      }),
    );
    dome.renderOrder = -1;
    this.scene.add(dome);
    this.scene.background = null;

    this.treeMat = new THREE.MeshStandardMaterial({ color: '#1f6b4a', roughness: 0.8, flatShading: true });
    this.trunkMat = new THREE.MeshStandardMaterial({ color: '#4a3326', roughness: 0.9 });
    this.lampMat = new THREE.MeshStandardMaterial({ color: '#ffd9a0', emissive: '#ffb45c', emissiveIntensity: 2 });
    this.poleMat = new THREE.MeshStandardMaterial({ color: '#2a2a33', roughness: 0.5, metalness: 0.6 });

    this.groundMat = new THREE.MeshStandardMaterial({ color: '#0a0a12', roughness: 0.95, metalness: 0 });
    const ground = new THREE.Mesh(new THREE.CircleGeometry(400, 64), this.groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);
    const grid = new THREE.GridHelper(400, 80, '#26264a', '#141428');
    grid.position.y = 0.01;
    grid.material.transparent = true;
    grid.material.opacity = 0.35;
    this.scene.add(grid);
    this.grid = grid;

    const starGeo = new THREE.BufferGeometry();
    const pts = [];
    for (let i = 0; i < 1600; i++) {
      const r = 440 + Math.random() * 60;
      const th = Math.random() * Math.PI * 2;
      const ph = Math.random() * Math.PI * 0.45;
      pts.push(r * Math.sin(ph) * Math.cos(th), r * Math.cos(ph), r * Math.sin(ph) * Math.sin(th));
    }
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: '#c9ccff', size: 1.2, sizeAttenuation: false, fog: false, transparent: true }));
    this.stars = stars;
    this.scene.add(stars);

    // Particules flottantes (ambiance "studio")
    const dustGeo = new THREE.BufferGeometry();
    const dust = [];
    for (let i = 0; i < 260; i++) dust.push((Math.random() - 0.5) * 200, Math.random() * 30, (Math.random() - 0.5) * 200);
    dustGeo.setAttribute('position', new THREE.Float32BufferAttribute(dust, 3));
    this.dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ color: '#ff5577', size: 0.25, transparent: true, opacity: 0.6 }));
    this.scene.add(this.dust);
  }

  // ---------- Construction de la ville ----------
  build(tree, { tasks = {}, evals = {} } = {}) {
    this.clearWorld();
    this.tree = tree;
    this.treeSpots = [];
    seed = 7;
    this.lampSpots = [];
    this.layout = organizeCity(tree);
    this.buildHQ(tree);
    const districts = tree.children || [];
    const n = Math.max(districts.length, 1);
    districts.forEach((d, i) => {
      const L = this.layout.get(d.id);
      const pack = packDistrict(L);
      const angle = (i / n) * Math.PI * 2 + Math.PI / 4;
      const radius = 26 + Math.max(pack.w, pack.dep) * 0.62;
      const center = new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
      this.buildDistrict(d, { center, angle, color: districtColor(d, i), L, pack });
    });
    this.buildCivic();
    this.buildDecor();
    this.cityRadius = Math.max(40, ...[...this.nodes.values()].filter((m) => m.type === 'district').map((m) => Math.hypot(m.pos.x, m.pos.z) + Math.max(m.w, m.dep) / 2));
    this.updateBadges(tasks, evals);
    for (const a of this.agents.values()) {
      const sp = this.randomSpot(a.home);
      a.group.position.copy(sp.pos);
      a.district = sp.district;
      a.path = [];
    }
    this.layoutDrones();
    this.updateSky();
  }

  // Mode "auto" = heure réelle ; "day" / "night" = forcé.
  setSkyMode(mode) {
    this.skyMode = mode;
    this.updateSky();
  }

  updateSky() {
    this.sky = skyState(this.skyMode || 'auto');
    applySky(this, this.sky);
    return this.sky;
  }

  clearWorld() {
    this.clearRooms();
    this.world.traverse((o) => {
      if (o.isCSS2DObject) o.element.remove();
      o.geometry?.dispose?.();
    });
    this.world.clear();
    this.nodes.clear();
    this.pickables = this.pickables.filter((m) => m.userData.nodeId?.startsWith?.('member:'));
    this.platformMats = [];
    this.hall = null;
    this.anims = [];
    this.civic = [];
  }

  buildHQ(tree) {
    const g = new THREE.Group();
    const plazaMat = new THREE.MeshStandardMaterial({ color: '#12121c', roughness: 0.7 });
    const plaza = new THREE.Mesh(new THREE.CylinderGeometry(15, 15.5, 0.3, 64), plazaMat);
    this.platformMats.push({ mat: plazaMat, night: plazaMat.color.clone(), day: new THREE.Color('#bdb5ab') });
    plaza.position.y = 0.15;
    plaza.receiveShadow = true;
    const ringLine = new THREE.Mesh(new THREE.TorusGeometry(15, 0.08, 6, 96), new THREE.MeshBasicMaterial({ color: '#ff2d55' }));
    ringLine.rotation.x = Math.PI / 2;
    ringLine.position.y = 0.32;
    g.add(plaza, ringLine);

    // Bibliothèque : le point central de la ville (et de Claude)
    const lib = buildLibrary();
    lib.group.position.y = 0.3;
    for (const m of lib.pick) {
      m.userData.nodeId = tree.id;
      this.pickables.push(m);
    }
    g.add(lib.group);
    this.anims.push(lib.anim);
    this.hqRings = [];
    const lbl = label(`<div class="hq-title">${esc(tree.name)}</div><div class="hq-sub">${LANDMARK_ICON.library} Bibliothèque</div>`, 'hq-label');
    lbl.position.y = 21;
    g.add(lbl);
    this.world.add(g);
    this.nodes.set(tree.id, { node: tree, type: 'hq', pos: new THREE.Vector3(0, 0.3, 0), front: new THREE.Vector3(0, 0.3, 10.5), group: g, district: null, label: lbl });
  }

  buildDistrict(d, { center, angle, color, L, pack }) {
    const { w, dep } = pack;
    const g = new THREE.Group();
    g.position.copy(center);
    const col = new THREE.Color(color);

    const shape = roundedRect(w, dep, 3.2);
    const platGeo = new THREE.ExtrudeGeometry(shape, { depth: PLATFORM_H - 0.2, bevelEnabled: true, bevelThickness: 0.2, bevelSize: 0.35, bevelSegments: 3, curveSegments: 10 });
    platGeo.rotateX(-Math.PI / 2);
    const platMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#14141e').lerp(col, 0.07), roughness: 0.85 });
    const plat = new THREE.Mesh(platGeo, platMat);
    plat.receiveShadow = true;
    plat.userData.nodeId = d.id;
    this.pickables.push(plat);
    this.platformMats.push({ mat: platMat, night: platMat.color.clone(), day: new THREE.Color('#c9c3b8').lerp(col, 0.12) });
    const rim = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(shape.getPoints(24).map((p) => new THREE.Vector3(p.x, PLATFORM_H + 0.03, -p.y))),
      new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 }),
    );
    const glowRing = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(roundedRect(w + 1.6, dep + 1.6, 4).getPoints(24).map((p) => new THREE.Vector3(p.x, 0.04, -p.y))),
      new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.35 }),
    );
    g.add(plat, rim, glowRing);
    for (let i = 0; i < 16; i++) {
      const side = i % 4;
      const t = (rand() - 0.5) * 0.9;
      const off = 2.4 + rand() * 1.6;
      const local = side === 0 ? [t * w, -dep / 2 - off] : side === 1 ? [t * w, dep / 2 + off] : side === 2 ? [-w / 2 - off, t * dep] : [w / 2 + off, t * dep];
      this.treeSpots.push(new THREE.Vector3(center.x + local[0], 0, center.z + local[1]));
    }

    const lbl = label(`<div class="d-name">${esc(d.name)}</div>`, 'district-label');
    lbl.element.style.setProperty('--c', color);
    lbl.position.set(0, 12, -dep / 2);
    g.add(lbl);

    // Route vers le QG + lampadaires
    const gateLocal = new THREE.Vector3(-Math.cos(angle), 0, -Math.sin(angle));
    const edgeDist = Math.min(Math.abs(w / 2 / (gateLocal.x || 1e-6)), Math.abs(dep / 2 / (gateLocal.z || 1e-6)));
    const gate = center.clone().add(gateLocal.clone().multiplyScalar(edgeDist));
    gate.y = 0.05;
    const plazaPt = new THREE.Vector3(Math.cos(angle) * 15, 0.3, Math.sin(angle) * 15);
    const len = gate.distanceTo(plazaPt);
    const road = new THREE.Mesh(new THREE.PlaneGeometry(3.2, len), new THREE.MeshStandardMaterial({ color: '#15151f', roughness: 0.9 }));
    road.rotation.x = -Math.PI / 2;
    road.rotation.z = -Math.atan2(gate.z - plazaPt.z, gate.x - plazaPt.x) + Math.PI / 2;
    road.position.copy(gate.clone().add(plazaPt).multiplyScalar(0.5)).setY(0.04);
    road.receiveShadow = true;
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(0.18, len), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 }));
    strip.rotation.copy(road.rotation);
    strip.position.copy(road.position).setY(0.06);
    this.world.add(road, strip);
    const steps = Math.floor(len / 7);
    const perp = new THREE.Vector3(-(gate.z - plazaPt.z), 0, gate.x - plazaPt.x).normalize().multiplyScalar(2.4);
    for (let k = 1; k < steps; k++) {
      const p = plazaPt.clone().lerp(gate, k / steps).setY(0);
      this.lampSpots.push(p.clone().add(k % 2 ? perp : perp.clone().negate()));
    }

    const info = { node: d, type: 'district', pos: center.clone().setY(PLATFORM_H), group: g, color, gate, plazaPt, w, dep, district: d.id, houses: [] };
    this.nodes.set(d.id, info);
    for (const lot of pack.lots) this.buildLot(lot, { g, center, color, d, info, flat: L.mode === 'flat' });
    // Banque et mairie reliées par une passerelle couverte
    const bank = pack.lots.find((l) => l.sub.landmark === 'bank');
    const mairie = pack.lots.find((l) => l.sub.landmark === 'mairie');
    if (bank && mairie) {
      const a = new THREE.Vector3(mairie.x, 0, mairie.z);
      const b2 = new THREE.Vector3(bank.x, 0, bank.z);
      const len = a.distanceTo(b2) - 9;
      const mid = a.clone().add(b2).multiplyScalar(0.5);
      const ang = Math.atan2(b2.z - a.z, b2.x - a.x);
      const bridgeMat = new THREE.MeshStandardMaterial({ color: '#d8cdb8', roughness: 0.6 });
      const tube = new THREE.Mesh(new THREE.BoxGeometry(len, 1.8, 2), bridgeMat);
      tube.position.set(mid.x, PLATFORM_H + 3.6, mid.z);
      tube.rotation.y = -ang;
      tube.castShadow = true;
      const glassStrip = new THREE.Mesh(new THREE.BoxGeometry(len, 0.6, 2.05), glass);
      glassStrip.position.copy(tube.position);
      glassStrip.rotation.copy(tube.rotation);
      const path = new THREE.Mesh(new THREE.PlaneGeometry(len + 6, 2.2), new THREE.MeshStandardMaterial({ color: '#b9ae9c' }));
      path.rotation.set(-Math.PI / 2, 0, -ang);
      path.position.set(mid.x, PLATFORM_H + 0.02, mid.z);
      g.add(tube, glassStrip, path);
    }
    this.world.add(g);
  }

  // Une parcelle = un sous-quartier (projet ou thème), avec ses maisons en grille.
  buildLot(lot, { g, center, color, d, info, flat }) {
    if (lot.sub.landmark) return this.buildLandmarkLot(lot, { g, center, color, d, info });
    const { sub, x, z, w, dep, cols, rows, cell } = lot;
    const col = new THREE.Color(color);
    const abandoned = sub.state === 'abandoned';
    const baseY = flat ? PLATFORM_H : PLATFORM_H + SUB_H;
    const lotCenter = new THREE.Vector3(center.x + x, baseY, center.z + z);
    if (!flat) {
      const shape = roundedRect(w, dep, 1.8);
      const geo = new THREE.ExtrudeGeometry(shape, { depth: SUB_H - 0.08, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.2, bevelSegments: 2, curveSegments: 8 });
      geo.rotateX(-Math.PI / 2);
      const mat = new THREE.MeshStandardMaterial({ color: abandoned ? '#1b1b1f' : new THREE.Color('#1a1a26').lerp(col, 0.1), roughness: 0.8 });
      const slab = new THREE.Mesh(geo, mat);
      slab.position.set(x, PLATFORM_H + 0.08, z);
      slab.receiveShadow = true;
      slab.userData.nodeId = sub.id;
      this.pickables.push(slab);
      this.platformMats.push({ mat, night: mat.color.clone(), day: abandoned ? new THREE.Color('#9d978e') : new THREE.Color('#ece6dc').lerp(col, 0.1) });
      const rimMat = new THREE.LineDashedMaterial({ color: abandoned ? '#55555c' : color, dashSize: 0.9, gapSize: 0.5, transparent: true, opacity: 0.8 });
      const rim = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(shape.getPoints(16).map((p) => new THREE.Vector3(p.x + x, baseY + 0.03, -p.y + z))), rimMat);
      rim.computeLineDistances();
      g.add(slab, rim);
      const lbl = label('', 'sub-label');
      lbl.element.style.setProperty('--c', abandoned ? '#77777f' : color);
      lbl.position.set(x, baseY + 0.4, z + dep / 2 + 0.6);
      g.add(lbl);
      const node = subNode(sub);
      const meta = { node, sub, type: 'sub', pos: lotCenter.clone(), front: new THREE.Vector3(lotCenter.x, baseY, lotCenter.z + dep / 2 + 0.8), w, dep, district: d.id, houses: [], label: lbl, abandoned };
      this.nodes.set(sub.id, meta);
      if (!sub.items.length) {
        // Parcelle vide : panneau "à construire"
        const sign = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.1, 0.12), new THREE.MeshStandardMaterial({ color: '#2a2a33', emissive: abandoned ? '#000' : '#ffb020', emissiveIntensity: 0.35 }));
        sign.position.set(x, baseY + 1.4, z);
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1, 0.12), new THREE.MeshStandardMaterial({ color: '#3a3a44' }));
        post.position.set(x, baseY + 0.5, z);
        for (let i = 0; i < 3; i++) {
          const cone = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.55, 8), new THREE.MeshStandardMaterial({ color: abandoned ? '#444' : '#ff7a1a' }));
          cone.position.set(x - 1.2 + i * 1.2, baseY + 0.28, z + 1.3);
          g.add(cone);
        }
        sign.userData.nodeId = sub.id;
        this.pickables.push(sign);
        g.add(sign, post);
      }
    }
    sub.items.forEach((item, k) => {
      const cx = (k % cols) - (cols - 1) / 2;
      const cz = Math.floor(k / cols) - (rows - 1) / 2;
      const local = new THREE.Vector3(x + cx * cell, baseY, z + cz * cell);
      const house = item.kind === 'folder' ? this.buildHouse(item, color, d.id) : this.buildKiosk(item, d.id);
      house.position.copy(local);
      g.add(house);
      const world = new THREE.Vector3(center.x + local.x, baseY, center.z + local.z);
      const meta = this.nodes.get(item.id);
      meta.pos = world;
      meta.sub = flat ? null : sub.id;
      meta.front = world.clone().add(new THREE.Vector3(0, 0, meta.size / 2 + 1.4));
      info.houses.push(item.id);
      if (!flat) this.nodes.get(sub.id).houses.push(item.id);
      (item.children || []).forEach((c) => this.nodes.set(c.id, { node: c, type: 'room', pos: world, front: meta.front, district: d.id, house: item.id }));
      (item.children || []).forEach((c) =>
        (c.children || []).forEach(function rec(xn) {
          this.nodes.set(xn.id, { node: xn, type: 'deep', pos: world, front: meta.front, district: d.id, house: item.id });
          (xn.children || []).forEach(rec, this);
        }, this),
      );
    });
    // quelques arbres entre les maisons
    for (let cx = 0; cx <= cols; cx++) {
      for (let cz = 0; cz <= rows; cz++) {
        if (rand() < (flat ? 0.45 : 0.7)) continue;
        this.treeSpots.push(new THREE.Vector3(center.x + x + (cx - cols / 2) * cell, baseY, center.z + z + (cz - rows / 2) * cell));
      }
    }
  }

  // Bâtiment emblématique posé sur sa parcelle (banque, mairie, studio, magasin, salle de concert).
  buildLandmarkLot(lot, { g, center, color, d, info }) {
    const { sub, x, z, w, dep } = lot;
    const lm = LANDMARK_BUILDERS[sub.landmark]();
    lm.group.position.set(x, PLATFORM_H, z - 0.5);
    g.add(lm.group);
    for (const m of lm.pick) {
      m.userData.nodeId = sub.id;
      this.pickables.push(m);
    }
    if (lm.anim) this.anims.push(lm.anim);
    if (lm.posters) this.hall = lm;
    const lbl = label('', 'sub-label lm');
    lbl.element.style.setProperty('--c', color);
    lbl.position.set(x, PLATFORM_H + lm.h + 1.5, z);
    g.add(lbl);
    const pos = new THREE.Vector3(center.x + x, PLATFORM_H, center.z + z);
    const front = new THREE.Vector3(pos.x, PLATFORM_H, pos.z + dep / 2 + 0.8);
    const node = subNode(sub);
    this.nodes.set(sub.id, { node, sub, type: 'sub', landmark: sub.landmark, pos, front, w, dep, district: d.id, houses: [], label: lbl, lm });
    info.houses.push(sub.id);
    info.landmarks = info.landmarks || {};
    info.landmarks[sub.landmark] = { pos, front, w, dep };
    // Le contenu du bâtiment pointe vers lui (pour la caméra et les agents)
    walkItems(sub.items, (it) => this.nodes.set(it.id, { node: it, type: 'inlm', lm: sub.id, pos, front, district: d.id }));
  }

  buildHouse(item, color, districtId) {
    const g = new THREE.Group();
    let desc = 0;
    (function count(n) {
      for (const c of n.children || []) {
        desc++;
        count(c);
      }
    })(item);
    const size = 3 + Math.min(2.2, Math.log2(1 + (item.children?.length || 0)) * 0.8);
    const h = 2.4 + Math.log2(2 + desc) * 1.7;
    const state = /avort|annul|abandon/.test(norm(item.name)) ? 'abandoned' : /fini|final|termin/.test(norm(item.name)) ? 'done' : 'active';
    const col = new THREE.Color(color);
    const recent = item.modified ? (Date.now() - Date.parse(item.modified)) / 86400000 : 999;
    const glow = state === 'abandoned' ? 0 : recent < 30 ? 1.6 : recent < 120 ? 1.0 : 0.55;

    const tex = this.windowTex.clone();
    tex.repeat.set(Math.max(1, Math.round(size / 1.6)), Math.max(1, Math.round(h / 1.8)));
    const nightColor = state === 'abandoned' ? new THREE.Color('#2a2a2e') : new THREE.Color('#1b1b26').lerp(col, 0.12);
    const dayColor = state === 'abandoned' ? new THREE.Color('#77736c') : new THREE.Color('#d9d4cc').lerp(col, 0.18);
    const wallMat = new THREE.MeshStandardMaterial({
      color: nightColor.clone(),
      roughness: 0.55,
      metalness: 0.25,
      emissive: state === 'abandoned' ? '#000000' : '#ffffff',
      emissiveMap: tex,
      emissiveIntensity: glow * (this.windowFactor ?? 1),
    });
    const roofMat = new THREE.MeshStandardMaterial({ color: state === 'abandoned' ? '#333' : col, roughness: 0.5, emissive: col, emissiveIntensity: state === 'abandoned' ? 0 : 0.25 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(size, h, size), [wallMat, wallMat, roofMat, roofMat, wallMat, wallMat]);
    body.position.y = h / 2;
    body.castShadow = body.receiveShadow = true;
    body.userData.nodeId = item.id;
    this.pickables.push(body);
    const outlineColor = state === 'done' ? '#ffd76b' : state === 'abandoned' ? '#55555c' : color;
    const outline = new THREE.LineSegments(new THREE.EdgesGeometry(body.geometry), new THREE.LineBasicMaterial({ color: outlineColor, transparent: true, opacity: 0.85 }));
    outline.position.copy(body.position);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(size * 0.78, size * 0.55, 4), roofMat);
    roof.rotation.y = Math.PI / 4;
    roof.position.y = h + size * 0.275;
    roof.castShadow = true;
    roof.userData.nodeId = item.id;
    this.pickables.push(roof);
    if (state === 'abandoned') {
      roof.rotation.z = 0.35;
      roof.position.x = size * 0.2;
      for (let i = 0; i < 5; i++) {
        const deb = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 0.4), new THREE.MeshStandardMaterial({ color: '#2b2b30' }));
        deb.position.set((Math.random() - 0.5) * size * 1.6, 0.15, size / 2 + Math.random() * 1.2);
        deb.rotation.y = Math.random() * 3;
        g.add(deb);
      }
    }
    const door = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 1.3), new THREE.MeshBasicMaterial({ color: state === 'abandoned' ? '#111' : col }));
    door.position.set(0, 0.65, size / 2 + 0.01);

    const ringBg = new THREE.Mesh(new THREE.RingGeometry(size * 0.72 + 0.6, size * 0.72 + 0.85, 64), new THREE.MeshBasicMaterial({ color: '#2a2a3a', transparent: true, opacity: 0.6 }));
    ringBg.rotation.x = -Math.PI / 2;
    ringBg.position.y = 0.03;
    g.add(body, outline, roof, door, ringBg);

    const lbl = label('', 'house-label');
    lbl.position.y = h + size * 0.6 + 1.2;
    g.add(lbl);
    this.nodes.set(item.id, { node: item, type: 'house', group: g, body, wallMat, baseGlow: glow, nightColor, dayColor, outline, label: lbl, size, height: h, district: districtId, state, ringParent: g });
    return g;
  }

  buildKiosk(item, districtId) {
    const g = new THREE.Group();
    const color = KIND_COLORS[item.kind] || KIND_COLORS.file;
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.4, 0.2), new THREE.MeshStandardMaterial({ color: '#22222c' }));
    post.position.y = 0.7;
    const panel = new THREE.Mesh(
      new THREE.BoxGeometry(2.6, 1.7, 0.18),
      new THREE.MeshStandardMaterial({ color: '#111118', emissive: color, emissiveIntensity: 0.9, roughness: 0.3 }),
    );
    panel.position.y = 2.1;
    panel.castShadow = true;
    panel.userData.nodeId = item.id;
    this.pickables.push(panel);
    const frame = new THREE.LineSegments(new THREE.EdgesGeometry(panel.geometry), new THREE.LineBasicMaterial({ color }));
    frame.position.copy(panel.position);
    g.add(post, panel, frame);
    const lbl = label('', 'house-label kiosk');
    lbl.position.y = 3.8;
    g.add(lbl);
    this.nodes.set(item.id, { node: item, type: 'house', kiosk: true, group: g, body: panel, outline: frame, label: lbl, size: 2.6, height: 3, district: districtId, state: 'active', ringParent: g });
    return g;
  }

  // Badges (tâches ouvertes) + anneau de complétude au sol.
  updateBadges(tasks, evals) {
    this.badgeArgs = [tasks, evals];
    for (const [id, meta] of this.nodes) {
      if (meta.type === 'sub') {
        let open = 0;
        let urgent = 0;
        (function rec(n) {
          for (const t of tasks[n.id] || []) if (!t.done) (open++, t.priority === 1 && urgent++);
          (n.children || []).forEach(rec);
        })(meta.node);
        const sc = evals[id]?.score;
        if (meta.landmark) {
          const extra = this.labelExtra[id];
          meta.label.element.innerHTML =
            `<span class="s-ico">${LANDMARK_ICON[meta.landmark]}</span><span class="s-name">${esc(meta.node.name)}</span>` +
            (extra ? `<span class="h-badge ${extra.urgent ? 'urgent' : ''}">${esc(extra.text)}</span>` : open ? `<span class="h-badge ${urgent ? 'urgent' : ''}">${open}</span>` : '');
          continue;
        }
        meta.label.element.innerHTML =
          `<span class="s-name">${esc(meta.node.name)}</span>` +
          (sc !== undefined && !meta.abandoned && meta.sub.items.length ? `<span class="s-score" style="--s:${scoreColor(sc)}">${sc}%</span>` : '') +
          (meta.abandoned ? '<span class="s-tag">abandonné</span>' : !meta.sub.items.length ? '<span class="s-tag">à construire</span>' : '') +
          (open ? `<span class="h-badge ${urgent ? 'urgent' : ''}">${open}</span>` : '');
        continue;
      }
      if (meta.type !== 'house') continue;
      const ids = [];
      (function rec(n) {
        ids.push(n.id);
        (n.children || []).forEach(rec);
      })(meta.node);
      const open = ids.reduce((s, x) => s + (tasks[x] || []).filter((t) => !t.done).length, 0);
      const urgent = ids.reduce((s, x) => s + (tasks[x] || []).filter((t) => !t.done && t.priority === 1).length, 0);
      const ev = evals[id];
      const score = ev?.score;
      meta.label.element.innerHTML =
        `<span class="h-name">${esc(meta.node.name)}</span>` +
        (open ? `<span class="h-badge ${urgent ? 'urgent' : ''}">${open}</span>` : '');
      meta.label.element.classList.toggle('has-badge', open > 0);
      if (meta.kiosk) continue;
      if (meta.scoreRing) {
        meta.ringParent.remove(meta.scoreRing);
        meta.scoreRing.geometry.dispose();
      }
      if (score !== undefined && meta.state !== 'abandoned') {
        const r = meta.size * 0.72;
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(r + 0.6, r + 0.85, 64, 1, Math.PI / 2, Math.max(0.02, (score / 100) * Math.PI * 2)),
          new THREE.MeshBasicMaterial({ color: scoreColor(score), side: THREE.DoubleSide }),
        );
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = 0.05;
        meta.ringParent.add(ring);
        meta.scoreRing = ring;
      }
    }
  }

  // Lieux hors quartiers : école, clocher + tableau d'emploi du temps.
  buildCivic() {
    const rects = [...this.nodes.values()].filter((m) => m.type === 'district').map((m) => ({ x: m.pos.x, z: m.pos.z, hw: m.w / 2 + 5, hd: m.dep / 2 + 5 }));
    const place = (hw, hd, angle) => {
      for (let r = 30; r < 260; r += 2) {
        for (const da of [0, 0.12, -0.12, 0.25, -0.25]) {
          const a = angle + da;
          const x = Math.cos(a) * r;
          const z = Math.sin(a) * r;
          if (!rects.some((q) => Math.abs(q.x - x) < q.hw + hw && Math.abs(q.z - z) < q.hd + hd)) {
            rects.push({ x, z, hw: hw + 2, hd: hd + 2 });
            return new THREE.Vector3(x, 0, z);
          }
        }
      }
      return new THREE.Vector3(Math.cos(angle) * 60, 0, Math.sin(angle) * 60);
    };
    const pad = (pos, w, d, color) => {
      const shape = roundedRect(w, d, 2.5);
      const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.3, bevelEnabled: true, bevelThickness: 0.1, bevelSize: 0.2, bevelSegments: 2 });
      geo.rotateX(-Math.PI / 2);
      const mat = new THREE.MeshStandardMaterial({ color: '#16161f', roughness: 0.85 });
      const m = new THREE.Mesh(geo, mat);
      m.position.copy(pos);
      m.receiveShadow = true;
      this.platformMats.push({ mat, night: mat.color.clone(), day: new THREE.Color('#d9d2c4') });
      const rim = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(shape.getPoints(16).map((p) => new THREE.Vector3(p.x + pos.x, 0.45, -p.y + pos.z))), new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.8 }));
      this.world.add(m, rim);
    };
    const civicLabel = (html, pos, y) => {
      const l = label(html, 'sub-label lm civic');
      l.element.style.setProperty('--c', '#ffd76b');
      l.position.set(pos.x, y, pos.z);
      this.world.add(l);
      return l;
    };
    // École (face à la caméra d'accueil)
    const sPos = place(11, 11, Math.PI / 2);
    pad(sPos, 21, 21, '#ffb020');
    const school = buildSchool();
    school.group.position.set(sPos.x, 0.4, sPos.z);
    this.world.add(school.group);
    for (const m of school.pick) (m.userData.nodeId = 'lm:school'), this.pickables.push(m);
    const sLbl = civicLabel('', sPos, 12);
    this.nodes.set('lm:school', { node: { id: 'lm:school', name: 'École' }, type: 'special', key: 'school', pos: sPos.clone().setY(0.4), front: sPos.clone().add(new THREE.Vector3(0, 0.4, 10)), district: null, label: sLbl });
    this.schoolYard = { x: sPos.x + school.yard.x, z: sPos.z + school.yard.z, w: school.yard.w, d: school.yard.d };
    this.addRoad(sPos, '#ffb020');
    // Clocher + tableau
    const bPos = place(8, 7, 0);
    pad(bPos, 16, 13, '#ffd76b');
    const bell = buildBellTower();
    bell.group.position.set(bPos.x - 3, 0.4, bPos.z - 1);
    this.world.add(bell.group);
    for (const m of bell.pick) (m.userData.nodeId = 'lm:bell'), this.pickables.push(m);
    this.anims.push(bell.anim);
    this.bell = bell;
    const board = buildBoard();
    board.group.position.set(bPos.x + 4, 0.4, bPos.z + 2.5);
    board.group.rotation.y = -0.35;
    this.world.add(board.group);
    for (const m of board.pick) (m.userData.nodeId = 'lm:board'), this.pickables.push(m);
    this.board = board;
    const bLbl = civicLabel('', new THREE.Vector3(bPos.x - 3, 0, bPos.z - 1), 21);
    const tLbl = civicLabel('', new THREE.Vector3(bPos.x + 4, 0, bPos.z + 2.5), 7.5);
    this.nodes.set('lm:bell', { node: { id: 'lm:bell', name: 'Clocher' }, type: 'special', key: 'bell', pos: bPos.clone().setY(0.4), front: bPos.clone().add(new THREE.Vector3(-3, 0.4, 4)), district: null, label: bLbl });
    this.nodes.set('lm:board', { node: { id: 'lm:board', name: 'Emploi du temps' }, type: 'special', key: 'board', pos: bPos.clone().add(new THREE.Vector3(4, 0.4, 2.5)), front: bPos.clone().add(new THREE.Vector3(4, 0.4, 5)), district: null, label: tLbl });
    this.addRoad(bPos, '#ffd76b');
    if (this.schedule) board.setSchedule(this.schedule);
    if (this.bellLevel !== undefined) bell.setAlert(this.bellLevel);
    this.refreshLandmarkLabels();
    this.setupPostman();
  }

  addRoad(pos, color) {
    const dir = pos.clone().setY(0).normalize();
    const start = dir.clone().multiplyScalar(15);
    const end = pos.clone().sub(dir.clone().multiplyScalar(9));
    const len = start.distanceTo(end);
    if (len < 1) return;
    const road = new THREE.Mesh(new THREE.PlaneGeometry(2.4, len), new THREE.MeshStandardMaterial({ color: '#15151f', roughness: 0.9 }));
    road.rotation.x = -Math.PI / 2;
    road.rotation.z = -Math.atan2(end.z - start.z, end.x - start.x) + Math.PI / 2;
    road.position.copy(start.clone().add(end).multiplyScalar(0.5)).setY(0.04);
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(0.14, len), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8 }));
    strip.rotation.copy(road.rotation);
    strip.position.copy(road.position).setY(0.06);
    this.world.add(road, strip);
  }

  // Le facteur fait la tournée des bâtiments.
  setupPostman() {
    const stops = [];
    const push = (m) => m?.front && stops.push({ pos: m.front.clone(), district: m.district || null });
    push(this.nodes.get(this.tree.id));
    for (const m of this.nodes.values()) if (m.type === 'sub' && m.landmark) push(m);
    push(this.nodes.get('lm:school'));
    push(this.nodes.get('lm:bell'));
    for (const m of this.nodes.values()) if (m.type === 'district' && !m.landmarks) push({ front: m.gate.clone().setY(0.6), district: m.node.id });
    this.removeAgent('postman');
    if (stops.length > 1) this.spawnAgent({ id: 'postman', name: 'Facteur', color: '#ffcf33', kind: 'postman', stops, pickId: 'lm:post' });
  }

  // Petites infos ajoutées aux étiquettes des bâtiments (nb de rappels, matos à acheter…)
  setLabelExtra(map) {
    Object.assign(this.labelExtra, map);
    this.refreshLandmarkLabels();
    if (this.badgeArgs) this.updateBadges(...this.badgeArgs);
  }

  refreshLandmarkLabels() {
    const names = { 'lm:school': ['school', 'École'], 'lm:bell': ['bell', 'Clocher'], 'lm:board': ['board', 'Emploi du temps'] };
    for (const [id, [key, name]] of Object.entries(names)) {
      const m = this.nodes.get(id);
      if (!m) continue;
      const extra = this.labelExtra[id];
      m.label.element.innerHTML = `<span class="s-ico">${LANDMARK_ICON[key]}</span><span class="s-name">${name}</span>${extra ? `<span class="h-badge ${extra.urgent ? 'urgent' : ''}">${esc(extra.text)}</span>` : ''}`;
    }
  }

  setBellAlert(level) {
    this.bellLevel = level;
    this.bell?.setAlert(level);
  }

  setSchedule(entries) {
    this.schedule = entries;
    this.board?.setSchedule(entries);
  }

  // Affiches de la façade de la salle de concert (les 4 prochaines / dernières)
  setPosters(list) {
    if (!this.hall) return;
    this.hall.posters.forEach((m, i) => {
      const p = list[i];
      m.material.map?.dispose();
      m.material.map = p ? posterTexture(p.title, p.sub, p.color, p.past) : null;
      m.material.color.set(p ? '#ffffff' : '#333333');
      m.material.emissive = new THREE.Color(p ? '#ffffff' : '#000000');
      m.material.emissiveMap = m.material.map;
      m.material.emissiveIntensity = 0.35;
      m.material.needsUpdate = true;
    });
  }

  // Les membres de l'association = les enfants de l'école.
  setMembers(members) {
    const yard = this.schoolYard;
    if (!yard) return;
    const wander = () => new THREE.Vector3(yard.x + (Math.random() - 0.5) * yard.w, 0.55, yard.z + (Math.random() - 0.5) * yard.d);
    const wanted = new Set(members.map((m) => `member:${m.id}`));
    for (const id of [...this.agents.keys()]) if (id.startsWith('member:') && !wanted.has(id)) this.removeAgent(id);
    for (const m of members) {
      const id = `member:${m.id}`;
      const existing = this.agents.get(id);
      if (existing) {
        existing.bubble.element.querySelector('b').textContent = m.name;
        existing.wander = wander;
        if (!existing.hold) existing.goTo(wander(), null);
        continue;
      }
      const a = this.spawnAgent({ id, name: m.name, color: m.color || '#ffb020', kind: 'kid', scale: 0.7, wander, pickId: id });
      a.bubble.element.classList.add('kid');
    }
  }

  // Envoie certains membres vers un bâtiment (ex. la salle de concert pour un événement), les autres retournent à l'école.
  gatherMembers(memberIds, targetId) {
    const target = targetId && this.nodes.get(targetId);
    for (const [id, a] of this.agents) {
      if (!id.startsWith('member:')) continue;
      const mid = id.slice(7);
      if (target && memberIds.includes(mid)) {
        a.hold = true;
        a.speed = 11;
        const off = new THREE.Vector3((Math.random() - 0.5) * 5, 0, Math.random() * 2);
        a.goTo(target.front.clone().add(off), target.district);
      } else if (a.hold) {
        a.hold = false;
        a.speed = 3.2;
        a.goTo(a.wander(), null);
      }
    }
  }

  // Arbres et lampadaires (instanciés pour rester fluides).
  buildDecor() {
    const trees = this.treeSpots.filter((p) => Math.hypot(p.x, p.z) > 18);
    if (trees.length) {
      const crown = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1.15, 0), this.treeMat, trees.length);
      const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.14, 0.2, 1.1, 6), this.trunkMat, trees.length);
      const m = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      trees.forEach((p, i) => {
        const sc = 0.7 + rand() * 0.7;
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand() * 6.28);
        m.compose(new THREE.Vector3(p.x, p.y + 1.5 * sc, p.z), q, new THREE.Vector3(sc, sc * 1.25, sc));
        crown.setMatrixAt(i, m);
        m.compose(new THREE.Vector3(p.x, p.y + 0.55 * sc, p.z), q, new THREE.Vector3(sc, sc, sc));
        trunk.setMatrixAt(i, m);
      });
      crown.castShadow = trunk.castShadow = true;
      this.world.add(crown, trunk);
    }
    if (this.lampSpots.length) {
      const n = this.lampSpots.length;
      const pole = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.07, 0.09, 3, 6), this.poleMat, n);
      const bulb = new THREE.InstancedMesh(new THREE.SphereGeometry(0.22, 10, 8), this.lampMat, n);
      const m = new THREE.Matrix4();
      this.lampSpots.forEach((p, i) => {
        m.makeTranslation(p.x, 1.5, p.z);
        pole.setMatrixAt(i, m);
        m.makeTranslation(p.x, 3.1, p.z);
        bulb.setMatrixAt(i, m);
      });
      this.world.add(pole, bulb);
    }
  }

  // ---------- Sélection, chambres, caméra ----------
  houseOf(id) {
    const m = this.nodes.get(id);
    if (!m) return null;
    if (m.type === 'house') return m;
    if (m.house) return this.nodes.get(m.house);
    return null;
  }

  select(id, { fly = true } = {}) {
    const prev = this.nodes.get(this.selectedId);
    const prevHouse = prev && (prev.type === 'house' ? prev : this.nodes.get(prev.house));
    let meta = this.nodes.get(id);
    if (!meta && id?.startsWith('member:')) {
      const a = this.agents.get(id);
      if (a) meta = { type: 'special', pos: a.group.position.clone(), district: null, kid: a };
    }
    if (meta?.type === 'inlm') meta = this.nodes.get(meta.lm);
    if (id === 'lm:post') {
      const a = this.agents.get('postman');
      if (a) meta = { type: 'special', pos: a.group.position.clone(), district: a.district };
    }
    this.selectedId = id;
    this.focusDistrict(meta ? (meta.type === 'district' ? meta.node.id : meta.district) : null);
    const house = this.houseOf(id);
    if (prevHouse && prevHouse !== house) this.setGhost(prevHouse, false);
    document.querySelectorAll('.house-label.selected, .sub-label.selected').forEach((e) => e.classList.remove('selected'));
    if (!meta) {
      this.clearRooms();
      // On recule pour revoir le quartier quand on ferme une fiche
      if (prev && fly) this.flyTo(this.controls.target.clone(), 90);
      return;
    }
    if (house) {
      house.label.element.classList.add('selected');
      if (!house.kiosk) this.setGhost(house, true);
      if (this.roomsFor !== house.node.id) this.showRooms(house);
      this.highlightRoom(meta.type === 'room' || meta.type === 'deep' ? id : null);
      if (fly) this.flyTo(house.pos.clone().setY(house.height / 2), 36);
    } else {
      this.clearRooms();
      if ((meta.type === 'sub' || meta.type === 'special') && meta.label) meta.label.element.classList.add('selected');
      if (fly) {
        if (meta.type === 'special') this.flyTo(meta.pos.clone().setY(3), meta.kid ? 16 : 34);
        else if (meta.landmark) this.flyTo(meta.pos.clone().setY(4), Math.max(meta.w, meta.dep) * 1.6 + 12);
        else if (meta.type === 'sub') this.flyTo(meta.pos, Math.max(meta.w, meta.dep) * 1.7 + 20);
        else if (meta.type === 'district') this.flyTo(meta.pos, Math.max(meta.w, meta.dep) * 1.35);
        else if (meta.type === 'hq') this.flyTo(new THREE.Vector3(0, 6, 0), 42);
      }
    }
  }

  // Quand on est dans un quartier, on masque les étiquettes des autres pour alléger l'écran.
  focusDistrict(districtId) {
    for (const m of this.nodes.values()) {
      if (!m.label || (m.type !== 'house' && m.type !== 'sub')) continue;
      m.label.element.classList.toggle('other', Boolean(districtId) && m.district !== districtId);
    }
  }

  setGhost(house, on) {
    if (!house.wallMat) return;
    house.wallMat.transparent = on;
    house.wallMat.opacity = on ? 0.28 : 1;
    house.wallMat.depthWrite = !on;
    house.outline.material.opacity = on ? 1 : 0.85;
  }

  showRooms(house) {
    this.clearRooms();
    this.roomsFor = house.node.id;
    const rooms = (house.node.children || []).slice(0, 18);
    const g = new THREE.Group();
    g.position.copy(house.pos);
    const radius = house.size * 0.9 + 3.2;
    this.roomTiles = [];
    rooms.forEach((r, i) => {
      const a = (i / Math.max(rooms.length, 1)) * Math.PI * 2;
      const color = r.kind === 'folder' ? this.nodes.get(house.district)?.color || '#ffffff' : KIND_COLORS[r.kind] || KIND_COLORS.file;
      const tile = new THREE.Mesh(
        r.kind === 'folder' ? new THREE.BoxGeometry(1.3, 1.1, 1.3) : new THREE.BoxGeometry(1.1, 1.4, 0.2),
        new THREE.MeshStandardMaterial({ color: '#15151e', emissive: color, emissiveIntensity: 0.55, roughness: 0.3, metalness: 0.4 }),
      );
      tile.position.set(Math.cos(a) * radius, 2.2 + (i % 2) * 0.9, Math.sin(a) * radius);
      tile.userData.nodeId = r.id;
      tile.userData.baseY = tile.position.y;
      tile.userData.phase = i;
      const edge = new THREE.LineSegments(new THREE.EdgesGeometry(tile.geometry), new THREE.LineBasicMaterial({ color }));
      tile.add(edge);
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, tile.position.y, 4), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35 }));
      beam.position.set(tile.position.x, tile.position.y / 2, tile.position.z);
      const lbl = label(`<span>${esc(r.name)}</span><em></em>`, 'room-label');
      lbl.position.y = 1.2;
      lbl.element.style.setProperty('--c', color);
      tile.add(lbl);
      tile.userData.label = lbl;
      g.add(tile, beam);
      this.pickables.push(tile);
      this.roomTiles.push(tile);
    });
    this.roomGroup = g;
    this.scene.add(g);
    this.refreshRoomCounts();
  }

  refreshRoomCounts(tasks = this.lastTasks || {}) {
    this.lastTasks = tasks;
    for (const t of this.roomTiles || []) {
      const ids = [];
      (function rec(n) {
        ids.push(n.id);
        (n.children || []).forEach(rec);
      })(this.nodes.get(t.userData.nodeId)?.node || { id: t.userData.nodeId });
      const open = ids.reduce((s, x) => s + (tasks[x] || []).filter((k) => !k.done).length, 0);
      t.userData.label.element.querySelector('em').textContent = open ? `${open} tâche${open > 1 ? 's' : ''}` : '';
    }
  }

  highlightRoom(id) {
    for (const t of this.roomTiles || []) {
      const on = t.userData.nodeId === id;
      t.scale.setScalar(on ? 1.35 : 1);
      t.userData.label.element.classList.toggle('active', on);
    }
  }

  clearRooms() {
    if (this.roomGroup) {
      this.roomGroup.traverse((o) => {
        if (o.isCSS2DObject) o.element.remove();
        o.geometry?.dispose?.();
      });
      this.scene.remove(this.roomGroup);
      this.pickables = this.pickables.filter((p) => !this.roomTiles.includes(p));
    }
    this.roomGroup = null;
    this.roomTiles = [];
    this.roomsFor = null;
  }

  flyTo(target, distance, fixedDir) {
    const cam = this.camera;
    const fromPos = cam.position.clone();
    const fromTarget = this.controls.target.clone();
    const dir = fixedDir ? fixedDir.clone().normalize() : fromPos.clone().sub(fromTarget).normalize();
    if (dir.y < 0.45) dir.y = 0.45;
    dir.normalize();
    const toPos = target.clone().add(dir.multiplyScalar(distance));
    this.tweens = [{ t: 0, dur: 1.1, fn: (k) => {
      cam.position.lerpVectors(fromPos, toPos, k);
      this.controls.target.lerpVectors(fromTarget, target, k);
    } }];
  }

  resetView() {
    this.flyTo(new THREE.Vector3(0, 0, 0), Math.max(125, (this.cityRadius || 60) * 2.1), new THREE.Vector3(0.12, 0.62, 1));
  }

  // ---------- Agents ----------
  randomSpot(homeDistrict) {
    const ds = [...this.nodes.values()].filter((m) => m.type === 'district');
    const d = (homeDistrict && this.nodes.get(homeDistrict)) || ds[Math.floor(Math.random() * ds.length)];
    if (!d || !d.houses?.length) {
      const a = Math.random() * Math.PI * 2;
      return { pos: new THREE.Vector3(Math.cos(a) * 11, 0.3, Math.sin(a) * 11), district: null };
    }
    const h = this.nodes.get(d.houses[Math.floor(Math.random() * d.houses.length)]);
    return { pos: h.front.clone().add(new THREE.Vector3((Math.random() - 0.5) * 3, 0, Math.random())), district: d.node.id };
  }

  route(from, fromDistrict, to, toDistrict) {
    if (fromDistrict && fromDistrict === toDistrict) return [to.clone()];
    const pts = [];
    const a = fromDistrict && this.nodes.get(fromDistrict);
    const b = toDistrict && this.nodes.get(toDistrict);
    if (a) pts.push(a.gate.clone().setY(0.1), a.plazaPt.clone());
    if (b) pts.push(b.plazaPt.clone(), b.gate.clone().setY(0.1));
    pts.push(to.clone());
    return pts;
  }

  spawnAgent(opts) {
    if (this.agents.has(opts.id)) return this.agents.get(opts.id);
    const a = new Agent(this, opts);
    this.agents.set(opts.id, a);
    return a;
  }

  removeAgent(id) {
    this.agents.get(id)?.dispose();
    this.agents.delete(id);
  }

  sendAgent(id, nodeId, status) {
    const a = this.agents.get(id);
    if (!a) return;
    if (status !== undefined) a.say(status);
    const meta = nodeId && this.nodes.get(nodeId);
    if (!meta) return;
    if (meta.type === 'hq') a.goTo(new THREE.Vector3(3, 0.3, 11), null);
    else if (meta.type === 'district') a.goTo(meta.gate.clone().setY(0.6), meta.node.id);
    else a.goTo((meta.front || meta.pos).clone(), meta.district);
  }

  // Drones n8n : ils tournent au-dessus de leur quartier (selon les tags) ou du QG.
  setDrones(workflows) {
    for (const d of this.drones.values()) {
      this.scene.remove(d.group);
      d.label.element.remove();
    }
    this.drones.clear();
    workflows.forEach((w, i) => {
      const color = w.active ? '#ff6bd5' : '#5b5b6b';
      const group = new THREE.Group();
      const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.7), new THREE.MeshStandardMaterial({ color: '#15151e', emissive: color, emissiveIntensity: 1.1 }));
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.05, 6, 24), new THREE.MeshBasicMaterial({ color }));
      ring.rotation.x = Math.PI / 2;
      group.add(core, ring);
      const lbl = label(`<b>n8n</b> ${esc(w.name)}`, `drone-label ${w.active ? '' : 'off'}`);
      lbl.position.y = 1.6;
      group.add(lbl);
      this.scene.add(group);
      this.drones.set(w.id, { w, group, core, ring, label: lbl, phase: (i * Math.PI * 2) / Math.max(workflows.length, 1), pulse: 0 });
    });
    this.layoutDrones();
  }

  layoutDrones() {
    const districts = [...this.nodes.values()].filter((m) => m.type === 'district');
    for (const d of this.drones.values()) {
      const tag = (d.w.tags || []).map(norm);
      const home = districts.find((m) => tag.some((t) => norm(m.node.name).includes(t) || t.includes(norm(m.node.name))));
      d.center = home ? home.pos.clone() : new THREE.Vector3();
      d.radius = home ? Math.max(home.w, home.dep) * 0.45 : 20;
    }
  }

  pulseDrone(id) {
    const d = this.drones.get(id);
    if (d) d.pulse = 2.5;
  }

  // ---------- Interaction ----------
  bindEvents() {
    const el = this.renderer.domElement;
    let down = null;
    this.lastInteraction = performance.now();
    const touch = () => (this.lastInteraction = performance.now());
    el.addEventListener('wheel', touch, { passive: true });
    el.addEventListener('pointerdown', (e) => {
      touch();
      down = { x: e.clientX, y: e.clientY };
    });
    el.addEventListener('pointerup', (e) => {
      if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) return;
      const id = this.pick(e);
      this.onSelect(id || null);
    });
    el.addEventListener('dblclick', (e) => {
      const id = this.pick(e);
      if (id) this.onOpen(id);
    });
    el.addEventListener('pointermove', (e) => {
      const id = this.pick(e);
      if (id !== this.hoverId) {
        this.hoverId = id;
        el.style.cursor = id ? 'pointer' : 'grab';
        document.querySelectorAll('.house-label.hover, .sub-label.hover').forEach((x) => x.classList.remove('hover'));
        const m = id && this.houseOf(id);
        if (m) m.label.element.classList.add('hover');
        const sm = id && this.nodes.get(id);
        if (sm?.type === 'sub') sm.label.element.classList.add('hover');
        this.onHover(id);
      }
    });
  }

  pick(e) {
    const r = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = this.raycaster.intersectObjects(this.pickables, false)[0];
    return hit?.object.userData.nodeId || null;
  }

  resize() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (!w || !h) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
    this.bloom.setSize(w, h);
    this.labelRenderer.setSize(w, h);
  }

  tick() {
    const raw = this.clock.getDelta();
    const dt = Math.min(raw, 0.05);
    const t = this.clock.elapsedTime;
    for (const tw of this.tweens) {
      tw.t += Math.min(raw, 0.25);
      tw.fn(easeInOut(Math.min(1, tw.t / tw.dur)));
    }
    this.tweens = this.tweens.filter((tw) => tw.t < tw.dur);
    // Au repos (20 s sans toucher et rien de sélectionné), la caméra tourne doucement autour de la ville.
    this.controls.autoRotate = !this.selectedId && !this.tweens.length && performance.now() - this.lastInteraction > 20000;
    this.controls.autoRotateSpeed = 0.35;
    this.controls.update();
    this.hqRings?.forEach((r, i) => (r.rotation.z += dt * (0.3 + i * 0.15) * (i % 2 ? -1 : 1)));
    if (this.dust) this.dust.rotation.y += dt * 0.01;
    for (const tile of this.roomTiles || []) {
      tile.position.y = tile.userData.baseY + Math.sin(t * 1.6 + tile.userData.phase) * 0.25;
      tile.rotation.y += dt * 0.4;
    }
    for (const a of this.agents.values()) a.update(dt);
    for (const fn of this.anims) fn(dt, t);
    for (const d of this.drones.values()) {
      const a = t * 0.25 + d.phase;
      d.group.position.set(d.center.x + Math.cos(a) * d.radius, 9 + Math.sin(t * 1.3 + d.phase) * 0.8, d.center.z + Math.sin(a) * d.radius);
      d.core.rotation.y += dt * 2;
      d.ring.rotation.z += dt;
      d.pulse = Math.max(0, d.pulse - dt);
      d.group.scale.setScalar(1 + d.pulse * 0.4);
      d.core.material.emissiveIntensity = 1.1 + d.pulse * 2;
    }
    const dist = this.camera.position.distanceTo(this.controls.target);
    this.container.classList.toggle('zoom-far', dist > 75);
    this.container.classList.toggle('zoom-city', dist > 130);
    this.composer.render();
    this.labelRenderer.render(this.scene, this.camera);
  }
}
