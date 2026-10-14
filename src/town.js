// La ville "vivante" autour des quartiers : avenues, rond-point, périphérique, trottoirs, bouches à incendie,
// parkings, parcs, quartier pavillonnaire, forêt — et ce qui bouge : voitures, piétons, oiseaux, avions.
import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { textTexture } from './landmarks.js';

const M = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0.05, ...o });

// Aléatoire déterministe propre à la ville (même disposition à chaque lancement)
let s = 11;
const rnd = () => {
  s = (s * 16807) % 2147483647;
  return (s - 1) / 2147483646;
};
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];

const WALLS = ['#e8dcc6', '#d9c3a5', '#f0e6d8', '#cdb79e', '#e3d3c3', '#c9b8a8', '#efe2cf', '#d8c8b8'];
const ROOFS = ['#8a3b2e', '#6b4a3a', '#4a4f5a', '#7a3a2a', '#5b5f66'];
const CARS = ['#c8102e', '#1f3fbf', '#f2f2f2', '#1b1b1f', '#9aa0a8', '#2f7d4a', '#e0a320', '#6b2fa3', '#3fa9d6'];
const CLOTHES = ['#ff5577', '#33c6ff', '#ffb020', '#9b7bff', '#2fd17a', '#f2f2f2', '#2a2a33', '#e36b1a', '#4f8bff', '#c8102e'];
const SKINS = ['#f1c9a5', '#d9a77e', '#a8714a', '#7a4b2c', '#e8b98f'];

export const ROAD_W = 7;
const SIDEWALK = 2;

function prism(w, h, d) {
  const sh = new THREE.Shape();
  sh.moveTo(-w / 2, 0);
  sh.lineTo(w / 2, 0);
  sh.lineTo(0, h);
  sh.closePath();
  const geo = new THREE.ExtrudeGeometry(sh, { depth: d, bevelEnabled: false });
  geo.translate(0, 0, -d / 2);
  return geo;
}

// ---------- Véhicules et passants ----------
export function makeCar(color, mats) {
  const g = new THREE.Group();
  const paint = M(color, { metalness: 0.5, roughness: 0.35 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.7, 3.8), paint);
  body.position.y = 0.6;
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.62, 2), mats.carGlass);
  cabin.position.set(0, 1.25, -0.25);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.08, 1.9), paint);
  roof.position.set(0, 1.58, -0.25);
  g.add(body, cabin, roof);
  for (const [x, z] of [[-0.9, 1.25], [0.9, 1.25], [-0.9, -1.25], [0.9, -1.25]]) {
    const w = new THREE.Mesh(mats.wheelGeo, mats.wheel);
    w.rotation.z = Math.PI / 2;
    w.position.set(x, 0.36, z);
    g.add(w);
  }
  for (const x of [-0.6, 0.6]) {
    const hl = new THREE.Mesh(mats.lightGeo, mats.head);
    hl.position.set(x, 0.65, 1.91);
    const tl = new THREE.Mesh(mats.lightGeo, mats.tail);
    tl.position.set(x, 0.7, -1.91);
    g.add(hl, tl);
  }
  body.castShadow = true;
  return g;
}

function makeWalker(mats) {
  const g = new THREE.Group();
  const cloth = M(pick(CLOTHES));
  const body = new THREE.Mesh(mats.walkerBody, cloth);
  body.position.y = 0.75;
  const legs = new THREE.Mesh(mats.walkerLegs, mats.jeans);
  legs.position.y = 0.3;
  const head = new THREE.Mesh(mats.walkerHead, M(pick(SKINS)));
  head.position.y = 1.32;
  g.add(legs, body, head);
  g.userData.body = body;
  return g;
}

function makeBird(mat) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.6, 5), mat);
  body.rotation.x = Math.PI / 2;
  g.add(body);
  const wings = [-1, 1].map((side) => {
    const pivot = new THREE.Group();
    const w = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.03, 0.28), mat);
    w.position.x = side * 0.35;
    pivot.add(w);
    pivot.userData.side = side;
    g.add(pivot);
    return pivot;
  });
  g.userData.wings = wings;
  return g;
}

function makePlane() {
  const g = new THREE.Group();
  const white = M('#f4f4f6', { metalness: 0.3, roughness: 0.4 });
  const fus = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.55, 9, 12), white);
  fus.rotation.x = Math.PI / 2;
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.7, 12, 8), white);
  nose.position.z = 4.5;
  const wing = new THREE.Mesh(new THREE.BoxGeometry(11, 0.18, 1.8), white);
  wing.position.z = 0.5;
  const stab = new THREE.Mesh(new THREE.BoxGeometry(4, 0.14, 1), white);
  stab.position.z = -4;
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.14, 2, 1.4), M('#c8102e'));
  fin.position.set(0, 1, -4);
  const lights = [
    ['#ff2d2d', -5.5, 0.5],
    ['#2dff6b', 5.5, 0.5],
  ].map(([c, x, z]) => {
    const l = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), new THREE.MeshBasicMaterial({ color: c }));
    l.position.set(x, 0, z);
    return l;
  });
  const strobe = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), new THREE.MeshBasicMaterial({ color: '#ffffff' }));
  strobe.position.set(0, 0.8, 0);
  const trail = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.05, 70, 6, 1, true), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.22, depthWrite: false }));
  trail.rotation.x = Math.PI / 2;
  trail.position.z = -40;
  g.add(fus, nose, wing, stab, fin, ...lights, strobe, trail);
  g.userData.strobe = strobe;
  g.userData.trail = trail;
  return g;
}

// ---------- Chemins (voitures et passants) ----------
// Un chemin est une boucle échantillonnée (points + longueurs cumulées).
function samplePath(pts, closed = true) {
  const out = [];
  const n = pts.length;
  for (let i = 0; i < (closed ? n : n - 1); i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    if (a.arc) continue;
    const steps = Math.max(1, Math.ceil(a.distanceTo(b) / 1.5));
    for (let k = 0; k < steps; k++) out.push(a.clone().lerp(b, k / steps));
  }
  return out;
}
function arcPoints(r, a0, a1, steps = 16) {
  const out = [];
  for (let k = 0; k <= steps; k++) {
    const a = a0 + ((a1 - a0) * k) / steps;
    out.push(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r));
  }
  return out;
}
function buildLoop(raw, lane) {
  const pts = [];
  for (const p of raw) if (!pts.length || pts[pts.length - 1].distanceTo(p) > 0.01) pts.push(p);
  const dense = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const steps = Math.max(1, Math.ceil(a.distanceTo(b) / 1.2));
    for (let k = 0; k < steps; k++) dense.push(a.clone().lerp(b, k / steps));
  }
  // Décalage sur la voie de droite (ou le trottoir)
  const res = dense.map((p, i) => {
    const f = dense[(i + 1) % dense.length].clone().sub(dense[(i - 1 + dense.length) % dense.length]).setY(0).normalize();
    return p.clone().add(new THREE.Vector3(-f.z, 0, f.x).multiplyScalar(lane));
  });
  const cum = [0];
  for (let i = 1; i <= res.length; i++) cum.push(cum[i - 1] + res[i - 1].distanceTo(res[i % res.length]));
  return { pts: res, cum, len: cum[cum.length - 1] };
}
function along(loop, d, out) {
  const L = loop.len;
  d = ((d % L) + L) % L;
  let lo = 0;
  let hi = loop.cum.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (loop.cum[mid] <= d) lo = mid;
    else hi = mid;
  }
  const a = loop.pts[lo];
  const b = loop.pts[(lo + 1) % loop.pts.length];
  const t = (d - loop.cum[lo]) / Math.max(1e-6, loop.cum[lo + 1] - loop.cum[lo]);
  out.copy(a).lerp(b, t);
  return Math.atan2(b.x - a.x, b.z - a.z);
}

/**
 * Construit la ville autour des quartiers.
 * geo = { AV, X0, X1, Z0, Z1, plazaR, slack: [{x0,x1,z0,z1}], zoneRects: [{x0,x1,z0,z1}] }
 */
export function buildTown(city, geo) {
  s = 11;
  const W = city.world;
  const mats = {
    asphalt: M('#1c1c22', { roughness: 0.95 }),
    walk: M('#26262c', { roughness: 0.9 }),
    grass: M('#13241a', { roughness: 1 }),
    line: new THREE.MeshBasicMaterial({ color: '#d8d8d8' }),
    carGlass: M('#1d2633', { metalness: 0.6, roughness: 0.15 }),
    wheel: M('#111114'),
    wheelGeo: new THREE.CylinderGeometry(0.36, 0.36, 0.28, 12),
    lightGeo: new THREE.BoxGeometry(0.35, 0.18, 0.05),
    head: new THREE.MeshStandardMaterial({ color: '#fff6d8', emissive: '#fff1c2', emissiveIntensity: 2 }),
    tail: new THREE.MeshStandardMaterial({ color: '#ff2d2d', emissive: '#ff2020', emissiveIntensity: 1.5 }),
    jeans: M('#2b3a5a'),
    walkerBody: new THREE.CapsuleGeometry(0.22, 0.45, 4, 8),
    walkerLegs: new THREE.BoxGeometry(0.32, 0.6, 0.2),
    walkerHead: new THREE.SphereGeometry(0.18, 10, 8),
    wood: M('#7a5232'),
    water: new THREE.MeshStandardMaterial({ color: '#1b4f8a', emissive: '#1a5fbf', emissiveIntensity: 0.25, roughness: 0.08, metalness: 0.3 }),
    sand: M('#2a261f'),
    bird: M('#24242a'),
  };
  city.platformMats.push(
    { mat: mats.asphalt, night: mats.asphalt.color.clone(), day: new THREE.Color('#4a4b52') },
    { mat: mats.walk, night: mats.walk.color.clone(), day: new THREE.Color('#c9c4ba') },
    { mat: mats.grass, night: mats.grass.color.clone(), day: new THREE.Color('#7fa463') },
    { mat: mats.sand, night: mats.sand.color.clone(), day: new THREE.Color('#d8c7a0') },
  );
  const anims = [];
  const flat = (w, d, mat, x, z, y = 0.05, ry = 0) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
    m.rotation.set(-Math.PI / 2, 0, ry);
    m.position.set(x, y, z);
    m.receiveShadow = true;
    W.add(m);
    return m;
  };
  const slab = (w, d, h, mat, x, z, y = 0) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y + h / 2, z);
    m.receiveShadow = true;
    W.add(m);
    return m;
  };
  const hydrants = [];
  const benches = [];
  const tree = (x, z, kind = 'round') => {
    const v = new THREE.Vector3(x, 0, z);
    v.kind = kind;
    city.treeSpots.push(v);
  };
  const lamp = (x, z) => city.lampSpots.push(new THREE.Vector3(x, 0, z));

  const { AV, X0, X1, Z0, Z1, plazaR } = geo;
  const R_IN = plazaR + 0.5;
  const R_OUT = R_IN + ROAD_W;
  const RR = (R_IN + R_OUT) / 2;

  // ---------- Rond-point ----------
  const ring = new THREE.Mesh(new THREE.RingGeometry(R_IN, R_OUT, 64), mats.asphalt);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.04;
  ring.receiveShadow = true;
  W.add(ring);
  const ringWalk = new THREE.Mesh(new THREE.RingGeometry(R_OUT, R_OUT + SIDEWALK, 64), mats.walk);
  ringWalk.rotation.x = -Math.PI / 2;
  ringWalk.position.y = 0.07;
  W.add(ringWalk);

  // ---------- Routes droites + trottoirs ----------
  const road = (ax, az, bx, bz, { walks = true, center = true } = {}) => {
    const a = new THREE.Vector3(ax, 0, az);
    const b = new THREE.Vector3(bx, 0, bz);
    const len = a.distanceTo(b);
    const ang = Math.atan2(bx - ax, bz - az);
    const mid = a.clone().add(b).multiplyScalar(0.5);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_W, len), mats.asphalt);
    m.rotation.set(-Math.PI / 2, 0, ang);
    m.position.set(mid.x, 0.04, mid.z);
    m.receiveShadow = true;
    W.add(m);
    const dir = b.clone().sub(a).normalize();
    const side = new THREE.Vector3(dir.z, 0, -dir.x);
    if (center) {
      // Ligne pointillée
      const n = Math.floor(len / 4);
      const dash = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.15, 1.8), mats.line, n);
      const mtx = new THREE.Matrix4();
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, ang, 'YXZ'));
      for (let i = 0; i < n; i++) {
        const p = a.clone().lerp(b, (i + 0.5) / n);
        mtx.compose(new THREE.Vector3(p.x, 0.06, p.z), q, new THREE.Vector3(1, 1, 1));
        dash.setMatrixAt(i, mtx);
      }
      W.add(dash);
    }
    if (walks) {
      for (const sgn of [-1, 1]) {
        const off = side.clone().multiplyScalar(sgn * (ROAD_W / 2 + SIDEWALK / 2));
        const w = new THREE.Mesh(new THREE.BoxGeometry(SIDEWALK, 0.14, len), mats.walk);
        w.rotation.y = ang;
        w.position.set(mid.x + off.x, 0.07, mid.z + off.z);
        w.receiveShadow = true;
        W.add(w);
        // Bouches à incendie, lampadaires et arbres d'alignement le long du trottoir
        const edge = side.clone().multiplyScalar(sgn * (ROAD_W / 2 + SIDEWALK - 0.4));
        for (let d = 8; d < len - 4; d += 9) {
          const p = a.clone().add(dir.clone().multiplyScalar(d)).add(edge);
          const k = Math.round(d / 9);
          if (k % 4 === 1) hydrants.push(p.clone());
          else if (k % 4 === 3) lamp(p.x, p.z);
          const t = a.clone().add(dir.clone().multiplyScalar(d + 2)).add(side.clone().multiplyScalar(sgn * (ROAD_W / 2 + SIDEWALK + 1.6)));
          if (k % 2 === 0) tree(t.x, t.z);
        }
      }
    }
    return m;
  };
  const crosswalk = (x, z, ang) => {
    const g = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.6, 3.2), mats.line, 8);
    const mtx = new THREE.Matrix4();
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, ang, 'YXZ'));
    const dir = new THREE.Vector3(Math.cos(ang), 0, -Math.sin(ang));
    for (let i = 0; i < 8; i++) {
      const off = dir.clone().multiplyScalar((i - 3.5) * 0.9);
      mtx.compose(new THREE.Vector3(x + off.x, 0.065, z + off.z), q, new THREE.Vector3(1, 1, 1));
      g.setMatrixAt(i, mtx);
    }
    W.add(g);
  };

  // Avenues (du rond-point au périphérique) et périphérique
  road(R_OUT, 0, X1, 0);
  road(-R_OUT, 0, X0, 0);
  road(0, R_OUT, 0, Z1);
  road(0, -R_OUT, 0, Z0);
  road(X0, Z0, X1, Z0);
  road(X1, Z0, X1, Z1);
  road(X1, Z1, X0, Z1);
  road(X0, Z1, X0, Z0);
  // Carrefours du périphérique
  for (const [x, z] of [[X0, Z0], [X1, Z0], [X1, Z1], [X0, Z1], [X0, 0], [X1, 0], [0, Z0], [0, Z1]]) flat(ROAD_W, ROAD_W, mats.asphalt, x, z, 0.045);
  crosswalk(R_OUT + 2.5, 0, 0);
  crosswalk(-R_OUT - 2.5, 0, 0);
  crosswalk(0, R_OUT + 2.5, Math.PI / 2);
  crosswalk(0, -R_OUT - 2.5, Math.PI / 2);

  // Bandes vertes entre les avenues et les quartiers
  const greenStrip = (x0, x1, z0, z1) => {
    if (x1 - x0 < 1 || z1 - z0 < 1) return;
    flat(x1 - x0, z1 - z0, mats.grass, (x0 + x1) / 2, (z0 + z1) / 2, 0.03);
  };
  const inner = ROAD_W / 2 + SIDEWALK;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const xa = sx > 0 ? inner : X0 + inner;
      const xb = sx > 0 ? X1 - inner : -inner;
      const za = sz > 0 ? inner : Z0 + inner;
      const zb = sz > 0 ? Z1 - inner : -inner;
      greenStrip(xa, xb, za, zb);
    }
  }

  // ---------- Parcs, parkings, pavillons ----------
  const label = (text, x, z, y = 3) => {
    const el = document.createElement('div');
    el.className = 'town-label';
    el.textContent = text;
    const l = new CSS2DObject(el);
    l.position.set(x, y, z);
    W.add(l);
  };
  const PARKS = ['Parc des Lilas', 'Square Jean-Ferrat', 'Jardin des Platanes', 'Parc de la Bièvre', 'Square Louise-Michel', 'Jardin du Studio'];
  let parkN = 0;
  function park(x0, x1, z0, z1, name) {
    const w = x1 - x0;
    const d = z1 - z0;
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;
    const lawn = M('#1a3322', { roughness: 1 });
    city.platformMats.push({ mat: lawn, night: lawn.color.clone(), day: new THREE.Color('#8dbb6a') });
    slab(w, d, 0.12, lawn, cx, cz);
    flat(w - 1, 1.6, mats.sand, cx, cz, 0.13);
    flat(1.6, d - 1, mats.sand, cx, cz, 0.13);
    if (w > 14 && d > 14) {
      const pond = new THREE.Mesh(new THREE.CircleGeometry(Math.min(w, d) * 0.16, 32), mats.water);
      pond.rotation.x = -Math.PI / 2;
      pond.position.set(cx + w * 0.24, 0.15, cz - d * 0.24);
      W.add(pond);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(Math.min(w, d) * 0.16, 0.18, 6, 32), M('#9a9286'));
      rim.rotation.x = Math.PI / 2;
      rim.position.copy(pond.position);
      W.add(rim);
    }
    // Arbres en bordure et en bosquets
    const nt = Math.floor((w + d) / 3.2);
    for (let i = 0; i < nt; i++) {
      const t = rnd();
      const onX = i % 2 === 0;
      const px = onX ? x0 + 1.2 + t * (w - 2.4) : rnd() < 0.5 ? x0 + 1.4 : x1 - 1.4;
      const pz = onX ? (rnd() < 0.5 ? z0 + 1.4 : z1 - 1.4) : z0 + 1.2 + t * (d - 2.4);
      tree(px, pz, rnd() < 0.25 ? 'pine' : 'round');
    }
    for (let i = 0; i < Math.floor((w * d) / 90); i++) {
      const px = x0 + 3 + rnd() * (w - 6);
      const pz = z0 + 3 + rnd() * (d - 6);
      if (Math.abs(px - cx) > 2 && Math.abs(pz - cz) > 2) tree(px, pz);
    }
    // Bancs le long des allées + massifs de fleurs
    for (const [bx, bz, r] of [[cx - w * 0.25, cz + 1.6, 0], [cx + w * 0.25, cz - 1.6, Math.PI], [cx + 1.6, cz + d * 0.25, -Math.PI / 2], [cx - 1.6, cz - d * 0.25, Math.PI / 2]]) benches.push({ x: bx, z: bz, r });
    for (let i = 0; i < 4; i++) {
      const fb = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1, 0.3, 12), M(pick(['#ff6b9a', '#ffd35a', '#c86bff', '#ff8a3d'])));
      fb.position.set(cx + (i % 2 ? 3.2 : -3.2), 0.25, cz + (i < 2 ? 3.2 : -3.2));
      W.add(fb);
    }
    lamp(cx + 2.2, cz + 2.2);
    lamp(cx - 2.2, cz - 2.2);
    label(name || PARKS[parkN++ % PARKS.length], cx, cz, 4);
    return { x0, x1, z0, z1, cx, cz };
  }

  const parked = [];
  function parking(x0, x1, z0, z1) {
    const w = x1 - x0;
    const d = z1 - z0;
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;
    slab(w, d, 0.1, mats.asphalt, cx, cz);
    const rows = Math.max(1, Math.floor(d / 11));
    const cols = Math.floor((w - 2) / 2.8);
    for (let r = 0; r < rows; r++) {
      for (const sgn of [-1, 1]) {
        const zl = z0 + 5.5 + r * 11 + sgn * 3;
        for (let c = 0; c <= cols; c++) {
          const xl = x0 + 1 + c * 2.8;
          const ln = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 4.6), mats.line);
          ln.rotation.x = -Math.PI / 2;
          ln.position.set(xl, 0.12, zl);
          W.add(ln);
          if (c < cols && rnd() < 0.65) parked.push({ x: xl + 1.4, z: zl, r: sgn > 0 ? Math.PI : 0 });
        }
      }
    }
    const pole = slab(0.15, 0.15, 3.2, M('#555'), x0 + 1, z1 - 1);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.4), new THREE.MeshStandardMaterial({ map: textTexture('P', { bg: '#1f5fbf', fg: '#fff', w: 128, h: 128, font: 'bold 96px Inter Variable, sans-serif' }), emissive: '#ffffff', emissiveIntensity: 0.3 }));
    sign.material.emissiveMap = sign.material.map;
    sign.position.set(x0 + 1, 3.6, z1 - 0.9);
    W.add(sign);
    void pole;
  }

  const houseMats = new Map();
  const hm = (c) => {
    if (!houseMats.has(c)) houseMats.set(c, M(c));
    return houseMats.get(c);
  };
  // Pavillon avec jardin, haie, allée et parfois une voiture
  function pavillon(x, z, rot) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = rot;
    const lawn = new THREE.Mesh(new THREE.BoxGeometry(9, 0.1, 9), mats.grass);
    lawn.position.y = 0.05;
    lawn.receiveShadow = true;
    g.add(lawn);
    const wall = hm(pick(WALLS));
    const roofM = hm(pick(ROOFS));
    const w = 4.2 + rnd() * 1.6;
    const d = 3.6 + rnd() * 1.2;
    const h = rnd() < 0.4 ? 4.6 : 2.7;
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wall);
    body.position.set(0, h / 2 + 0.1, -1.4);
    body.castShadow = body.receiveShadow = true;
    const roof = new THREE.Mesh(prism(w + 0.6, 1.5 + rnd() * 0.5, d + 0.5), roofM);
    roof.position.set(0, h + 0.1, -1.4);
    roof.castShadow = true;
    const chim = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.2, 0.5), hm('#8a6f5a'));
    chim.position.set(w * 0.28, h + 1.1, -1.8);
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.7, 0.05), hm('#5b3a2a'));
    door.position.set(-w * 0.18, 0.95, -1.4 + d / 2 + 0.03);
    g.add(body, roof, chim, door);
    for (let fl = 0; fl < (h > 4 ? 2 : 1); fl++) {
      for (const wx of [w * 0.22, -w * 0.4]) {
        if (fl === 0 && wx < 0) continue;
        const win = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.05), city.glassMat);
        win.position.set(wx, 1.3 + fl * 2, -1.4 + d / 2 + 0.03);
        g.add(win);
      }
    }
    // Haie + allée
    const hedge = hm('#1f4a2c');
    for (const [hx, hz, hw, hd] of [[0, -4.4, 9, 0.35], [-4.4, 0, 0.35, 9], [4.4, 0, 0.35, 9], [-2.6, 4.4, 3.8, 0.35]]) {
      const hg = new THREE.Mesh(new THREE.BoxGeometry(hw, 0.7, hd), hedge);
      hg.position.set(hx, 0.4, hz);
      g.add(hg);
    }
    const drive = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 4.6), mats.walk);
    drive.rotation.x = -Math.PI / 2;
    drive.position.set(2.7, 0.12, 2.2);
    g.add(drive);
    if (rnd() < 0.55) {
      const car = makeCar(pick(CARS), mats);
      car.position.set(2.7, 0.1, 2.2);
      car.rotation.y = rnd() < 0.5 ? 0 : Math.PI;
      g.add(car);
    }
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.4, 0.3), hm('#c8102e'));
    box.position.set(1, 0.9, 4.3);
    g.add(box);
    W.add(g);
  }

  // Remplit les espaces libres des quadrants (parcs et parkings en alternance)
  let n = 0;
  for (const r of geo.slack) {
    const w = r.x1 - r.x0;
    const d = r.z1 - r.z0;
    if (w < 12 || d < 12) {
      if (w > 4 && d > 4) greenStrip(r.x0, r.x1, r.z0, r.z1);
      continue;
    }
    if (n % 3 === 1 && w >= 16 && d >= 12) parking(r.x0 + 1, r.x1 - 1, r.z0 + 1, r.z1 - 1);
    else park(r.x0 + 1, r.x1 - 1, r.z0 + 1, r.z1 - 1);
    n++;
  }

  // Hors du périphérique : quartier pavillonnaire (devant et à droite), grand parc + parking (à gauche)
  const out = ROAD_W / 2 + SIDEWALK + 5.5;
  for (let x = X0 + 8; x < X1 - 6; x += 10.5) pavillon(x, Z1 + out, 0);
  for (let x = X0 + 8; x < X1 - 6; x += 10.5) pavillon(x, Z1 + out + 11, Math.PI);
  for (let z = Z0 + 8; z < Z1 - 6; z += 10.5) pavillon(X1 + out, z, Math.PI / 2);
  // Rue de desserte du quartier pavillonnaire
  road(X0, Z1 + out + 5.5, X1 + out + 6, Z1 + out + 5.5, { walks: false });
  road(X1 + out + 6, Z1 + out + 5.5, X1 + out + 6, Z0, { walks: false });
  label('Quartier pavillonnaire', (X0 + X1) / 2, Z1 + out + 5.5, 6);
  const bigPark = park(X0 - out - 24, X0 - out + 4, Z0 + 4, (Z0 + Z1) / 2 - 2, 'Grand parc');
  parking(X0 - out - 24, X0 - out + 4, (Z0 + Z1) / 2 + 2, Math.min(Z1, (Z0 + Z1) / 2 + 26));
  void bigPark;

  // ---------- Forêt tout autour ----------
  const fx0 = X0 - out - 30;
  const fx1 = X1 + out + 14;
  const fz0 = Z0 - 10;
  const fz1 = Z1 + out + 18;
  const FM = 75;
  for (let i = 0, placed = 0; i < 6000 && placed < 1300; i++) {
    const x = fx0 - FM + rnd() * (fx1 - fx0 + 2 * FM);
    const z = fz0 - FM + rnd() * (fz1 - fz0 + 2 * FM);
    if (x > fx0 && x < fx1 && z > fz0 && z < fz1) continue;
    // Lisière irrégulière : moins d'arbres près de la ville
    const dist = Math.max(fx0 - x, x - fx1, fz0 - z, z - fz1);
    if (rnd() > 0.35 + dist / 40) continue;
    tree(x, z, rnd() < 0.55 ? 'pine' : 'round');
    placed++;
  }
  // Bosquets derrière les quartiers du fond
  for (let i = 0; i < 70; i++) tree(X0 + rnd() * (X1 - X0), Z0 - 6 - rnd() * 6, rnd() < 0.5 ? 'pine' : 'round');

  // ---------- Mobilier : bouches à incendie, bancs, voitures garées ----------
  if (hydrants.length) {
    const hb = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.17, 0.2, 0.7, 10), M('#d01818', { roughness: 0.5 }), hydrants.length);
    const hc = new THREE.InstancedMesh(new THREE.SphereGeometry(0.19, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), M('#d01818', { roughness: 0.5 }), hydrants.length);
    const hn = new THREE.InstancedMesh(new THREE.BoxGeometry(0.55, 0.12, 0.12), M('#b0b0b0', { metalness: 0.6 }), hydrants.length);
    const m4 = new THREE.Matrix4();
    hydrants.forEach((p, i) => {
      m4.makeTranslation(p.x, 0.49, p.z);
      hb.setMatrixAt(i, m4);
      m4.makeTranslation(p.x, 0.84, p.z);
      hc.setMatrixAt(i, m4);
      m4.makeTranslation(p.x, 0.55, p.z);
      hn.setMatrixAt(i, m4);
    });
    hb.castShadow = true;
    W.add(hb, hc, hn);
  }
  for (const b of benches) {
    const g = new THREE.Group();
    const seat = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.1, 0.5), mats.wood);
    seat.position.y = 0.5;
    const back = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.5, 0.08), mats.wood);
    back.position.set(0, 0.8, -0.22);
    const legs = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.45, 0.4), M('#333'));
    legs.position.y = 0.23;
    legs.scale.set(1, 1, 0.2);
    g.add(seat, back, legs);
    g.position.set(b.x, 0.12, b.z);
    g.rotation.y = b.r;
    W.add(g);
  }
  for (const p of parked) {
    const c = makeCar(pick(CARS), mats);
    c.position.set(p.x, 0.1, p.z);
    c.rotation.y = p.r;
    W.add(c);
  }

  // ---------- Circulation ----------
  // Groupes activables depuis le menu « Affichage »
  const groups = { traffic: new THREE.Group(), birds: new THREE.Group(), planes: new THREE.Group() };
  W.add(groups.traffic, groups.birds, groups.planes);
  const loops = [];
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const XE = sx > 0 ? X1 : X0;
    const ZE = sz > 0 ? Z1 : Z0;
    const a0 = Math.atan2(sz, 0);
    const a1 = Math.atan2(0, sx);
    let da = a1 - a0;
    while (da > Math.PI) da -= Math.PI * 2;
    while (da < -Math.PI) da += Math.PI * 2;
    let pts = [new THREE.Vector3(sx * RR, 0, 0), new THREE.Vector3(XE, 0, 0), new THREE.Vector3(XE, 0, ZE), new THREE.Vector3(0, 0, ZE), new THREE.Vector3(0, 0, sz * RR), ...arcPoints(RR, a0, a0 + da, 10).slice(1, -1)];
    if (sx * sz > 0) pts = pts.reverse();
    loops.push(pts);
  }
  // Voitures
  const cars = [];
  loops.forEach((pts, li) => {
    const loop = buildLoop(pts, 1.75);
    const count = Math.max(3, Math.round(loop.len / 45));
    const speed = 9 + rnd() * 3;
    for (let i = 0; i < count; i++) {
      const c = makeCar(pick(CARS), mats);
      groups.traffic.add(c);
      cars.push({ obj: c, loop, d: (i / count) * loop.len + li * 7, speed });
    }
  });
  // Bus sur le périphérique
  const outer = buildLoop([new THREE.Vector3(X0, 0, Z0), new THREE.Vector3(X0, 0, Z1), new THREE.Vector3(X1, 0, Z1), new THREE.Vector3(X1, 0, Z0)], 1.75);
  for (let i = 0; i < 2; i++) {
    const bus = new THREE.Group();
    const bb = new THREE.Mesh(new THREE.BoxGeometry(2.3, 2.6, 9), M(i ? '#2fd17a' : '#1f6fbf', { roughness: 0.5 }));
    bb.position.y = 1.7;
    const bw = new THREE.Mesh(new THREE.BoxGeometry(2.32, 0.8, 8.4), mats.carGlass);
    bw.position.y = 2.2;
    bus.add(bb, bw);
    for (const z of [-3, 3]) for (const x of [-1.1, 1.1]) {
      const w = new THREE.Mesh(mats.wheelGeo, mats.wheel);
      w.rotation.z = Math.PI / 2;
      w.position.set(x, 0.4, z);
      bus.add(w);
    }
    groups.traffic.add(bus);
    cars.push({ obj: bus, loop: outer, d: i * outer.len * 0.5, speed: 7 });
  }
  // Passants sur les trottoirs
  const walkers = [];
  loops.forEach((pts) => {
    for (const lane of [ROAD_W / 2 + SIDEWALK / 2, -(ROAD_W / 2 + SIDEWALK / 2)]) {
      const loop = buildLoop(pts, lane);
      for (let i = 0; i < 3; i++) {
        const w = makeWalker(mats);
        groups.traffic.add(w);
        walkers.push({ obj: w, loop, d: rnd() * loop.len, speed: (1.1 + rnd() * 0.6) * (lane > 0 ? 1 : -1), phase: rnd() * 6 });
      }
    }
  });
  const tmp = new THREE.Vector3();
  anims.push((dt, t) => {
    if (!groups.traffic.visible) return;
    for (const c of cars) {
      c.d += c.speed * dt;
      const ang = along(c.loop, c.d, tmp);
      c.obj.position.set(tmp.x, 0.05, tmp.z);
      c.obj.rotation.y = ang;
    }
    for (const w of walkers) {
      w.d += w.speed * dt;
      const ang = along(w.loop, w.d, tmp);
      w.obj.position.set(tmp.x, 0.14 + Math.abs(Math.sin(t * 7 + w.phase)) * 0.06, tmp.z);
      w.obj.rotation.y = ang + (w.speed < 0 ? Math.PI : 0);
    }
  });

  // ---------- Oiseaux ----------
  const flocks = [];
  for (let f = 0; f < 5; f++) {
    const g = new THREE.Group();
    const birds = [];
    const nb = 6 + Math.floor(rnd() * 6);
    for (let i = 0; i < nb; i++) {
      const b = makeBird(mats.bird);
      b.userData.off = new THREE.Vector3((rnd() - 0.5) * 7, (rnd() - 0.5) * 2.5, (rnd() - 0.5) * 7);
      b.userData.ph = rnd() * 6;
      g.add(b);
      birds.push(b);
    }
    groups.birds.add(g);
    flocks.push({ g, birds, r: 30 + rnd() * 70, h: 16 + rnd() * 20, sp: (0.08 + rnd() * 0.08) * (rnd() < 0.5 ? 1 : -1), a: rnd() * 6, cx: (rnd() - 0.5) * 60, cz: (rnd() - 0.5) * 60 });
  }
  anims.push((dt, t) => {
    if (!groups.birds.visible) return;
    for (const f of flocks) {
      f.a += f.sp * dt;
      const x = f.cx + Math.cos(f.a) * f.r;
      const z = f.cz + Math.sin(f.a) * f.r;
      f.g.position.set(x, f.h + Math.sin(t * 0.5 + f.a) * 3, z);
      f.g.rotation.y = -f.a + (f.sp > 0 ? Math.PI : 0);
      for (const b of f.birds) {
        const o = b.userData.off;
        b.position.set(o.x + Math.sin(t + b.userData.ph) * 0.6, o.y + Math.sin(t * 1.7 + b.userData.ph) * 0.4, o.z);
        const flap = Math.sin(t * 12 + b.userData.ph) * 0.7;
        for (const wg of b.userData.wings) wg.rotation.z = wg.userData.side * flap;
      }
    }
  });

  // ---------- Avions ----------
  const planes = [0, 1, 2].map((i) => {
    const p = makePlane();
    p.scale.setScalar(1.6);
    groups.planes.add(p);
    const st = { obj: p, t: i * 0.33 };
    respawn(st, i * 37);
    return st;
  });
  function respawn(st, seed = 0) {
    const a = rnd() * Math.PI * 2 + seed;
    const R = 330;
    st.from = new THREE.Vector3(Math.cos(a) * R, 0, Math.sin(a) * R);
    st.to = new THREE.Vector3(-Math.cos(a + 0.4) * R, 0, -Math.sin(a + 0.4) * R);
    st.h = 85 + rnd() * 50;
    st.dur = 45 + rnd() * 25;
    st.k = st.t || 0;
    st.t = 0;
    st.obj.position.copy(st.from).setY(st.h);
    st.obj.lookAt(st.to.clone().setY(st.h));
  }
  anims.push((dt, t) => {
    if (!groups.planes.visible) return;
    for (const p of planes) {
      p.k += dt / p.dur;
      if (p.k >= 1) {
        p.k = 0;
        respawn(p);
      }
      p.obj.position.copy(p.from).lerp(p.to, p.k).setY(p.h);
      p.obj.userData.strobe.visible = Math.sin(t * 9) > 0.7;
    }
  });

  // Jour / nuit : phares et feux
  city.town = {
    groups,
    applySky(day) {
      mats.head.emissiveIntensity = THREE.MathUtils.lerp(2.2, 0.15, day);
      mats.tail.emissiveIntensity = THREE.MathUtils.lerp(1.6, 0.3, day);
      mats.water.emissiveIntensity = THREE.MathUtils.lerp(0.3, 0.05, day);
      for (const p of planes) p.obj.userData.trail.material.opacity = THREE.MathUtils.lerp(0.06, 0.35, day);
    },
  };
  city.anims.push(...anims);
}
