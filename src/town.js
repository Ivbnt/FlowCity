// La ville "vivante" autour des quartiers : avenues, rond-point, périphérique, trottoirs, bouches à incendie,
// parkings, parcs, quartier pavillonnaire, forêt — et ce qui bouge : voitures, piétons, oiseaux, avions.
import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { textTexture } from './landmarks.js';
import { bake } from './bake.js';

const M = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0.05, ...o });
// Matériaux partagés par couleur (moins de matériaux = fusion possible et moins de changements d'état au rendu)
const matCache = new Map();
const MC = (color, o = {}) => {
  const k = `${color}|${JSON.stringify(o)}`;
  if (!matCache.has(k)) matCache.set(k, M(color, o));
  return matCache.get(k);
};

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
  const paint = MC(color, { metalness: 0.5, roughness: 0.35 });
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
  g.userData.car = true;
  return g;
}

function makeWalker(mats) {
  const g = new THREE.Group();
  const cloth = MC(pick(CLOTHES));
  const body = new THREE.Mesh(mats.walkerBody, cloth);
  body.position.y = 0.75;
  const legs = new THREE.Mesh(mats.walkerLegs, mats.jeans);
  legs.position.y = 0.3;
  const head = new THREE.Mesh(mats.walkerHead, MC(pick(SKINS)));
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
  // Tout ce qui ne bouge pas (routes, parcs, pavillons, voitures garées…) est fusionné à la fin : beaucoup moins d'objets à dessiner.
  const S = new THREE.Group();
  W.add(S);
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
    S.add(m);
    return m;
  };
  const slab = (w, d, h, mat, x, z, y = 0) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y + h / 2, z);
    m.receiveShadow = true;
    S.add(m);
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
  S.add(ring);
  const ringWalk = new THREE.Mesh(new THREE.RingGeometry(R_OUT, R_OUT + SIDEWALK, 64), mats.walk);
  ringWalk.rotation.x = -Math.PI / 2;
  ringWalk.position.y = 0.07;
  S.add(ringWalk);

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
    S.add(m);
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
        S.add(w);
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
  // Rues entre les quartiers éloignés (colonnes / rangées supplémentaires)
  for (const st of geo.streets || []) {
    road(st.ax, st.az, st.bx, st.bz);
    flat(ROAD_W, ROAD_W, mats.asphalt, st.ax, st.az, 0.045);
    flat(ROAD_W, ROAD_W, mats.asphalt, st.bx, st.bz, 0.045);
    if (st.ax === st.bx) flat(ROAD_W, ROAD_W, mats.asphalt, st.ax, 0, 0.046);
    else flat(ROAD_W, ROAD_W, mats.asphalt, 0, st.az, 0.046);
  }
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
  // Noms des rues : la rue centrale (axe avant / arrière) et l'avenue perpendiculaire
  const streetLabel = (text, x, z) => {
    const el = document.createElement('div');
    el.className = 'town-label street-label';
    el.textContent = text;
    const l = new CSS2DObject(el);
    l.position.set(x, 0.6, z);
    W.add(l);
  };
  for (const sgn of [-1, 1]) {
    streetLabel('Rue Chantecrit', 0, sgn * (R_OUT + ((sgn > 0 ? Z1 : -Z0) - R_OUT) * 0.5));
    streetLabel('Avenue de la République', sgn * (R_OUT + ((sgn > 0 ? X1 : -X0) - R_OUT) * 0.5), 0);
  }
  for (const st of geo.streets || []) streetLabel(st.name, (st.ax + st.bx) / 2 + (st.ax === st.bx ? 0 : (st.bx - st.ax) * 0.28), (st.az + st.bz) / 2 + (st.ax === st.bx ? (st.bz - st.az) * 0.28 : 0));

  const PARKS = ['Square Jean-Ferrat', 'Jardin des Platanes', 'Parc de la Bièvre', 'Square Louise-Michel', 'Jardin du Studio'];
  let parkN = 0;
  function park(x0, x1, z0, z1, name, jardin = false) {
    const w = x1 - x0;
    const d = z1 - z0;
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;
    // (Jardin : pas d'arbre, de banc ni de lampadaire dans le lac ou sur le foodtruck)
    const R = Math.min(w, d) * 0.24;
    const inLake = (px, pz) => jardin && (Math.hypot((px - (x0 + w * 0.62)) / 1.35, pz - (z0 + d * 0.38)) < R + 2.5 || (Math.abs(px - (x0 + w * 0.28)) < 5 && Math.abs(pz - (z0 + d * 0.3)) < 5) || (Math.abs(px - (x0 + w * 0.25)) < 3 && Math.abs(pz - (z0 + d * 0.72)) < 2.5));
    const lawn = M('#1a3322', { roughness: 1 });
    city.platformMats.push({ mat: lawn, night: lawn.color.clone(), day: new THREE.Color('#8dbb6a') });
    slab(w, d, 0.12, lawn, cx, cz);
    flat(w - 1, 1.6, mats.sand, cx, cz, 0.13);
    flat(1.6, d - 1, mats.sand, cx, cz, 0.13);
    if (w > 14 && d > 14 && !jardin) {
      const pond = new THREE.Mesh(new THREE.CircleGeometry(Math.min(w, d) * 0.16, 32), mats.water);
      pond.rotation.x = -Math.PI / 2;
      pond.position.set(cx + w * 0.24, 0.15, cz - d * 0.24);
      S.add(pond);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(Math.min(w, d) * 0.16, 0.18, 6, 32), M('#9a9286'));
      rim.rotation.x = Math.PI / 2;
      rim.position.copy(pond.position);
      S.add(rim);
    }
    // Arbres en bordure et en bosquets
    const nt = Math.floor((w + d) / 3.2);
    for (let i = 0; i < nt; i++) {
      const t = rnd();
      const onX = i % 2 === 0;
      const px = onX ? x0 + 1.2 + t * (w - 2.4) : rnd() < 0.5 ? x0 + 1.4 : x1 - 1.4;
      const pz = onX ? (rnd() < 0.5 ? z0 + 1.4 : z1 - 1.4) : z0 + 1.2 + t * (d - 2.4);
      if (!inLake(px, pz)) tree(px, pz, rnd() < 0.25 ? 'pine' : 'round');
    }
    for (let i = 0; i < Math.floor((w * d) / 90); i++) {
      const px = x0 + 3 + rnd() * (w - 6);
      const pz = z0 + 3 + rnd() * (d - 6);
      if (Math.abs(px - cx) > 2 && Math.abs(pz - cz) > 2 && !inLake(px, pz)) tree(px, pz);
    }
    // Bancs le long des allées + massifs de fleurs
    for (const [bx, bz, r] of [[cx - w * 0.25, cz + 1.6, 0], [cx + w * 0.25, cz - 1.6, Math.PI], [cx + 1.6, cz + d * 0.25, -Math.PI / 2], [cx - 1.6, cz - d * 0.25, Math.PI / 2]]) if (!inLake(bx, bz)) benches.push({ x: bx, z: bz, r });
    for (let i = 0; i < 4; i++) {
      if (inLake(cx + (i % 2 ? 3.2 : -3.2), cz + (i < 2 ? 3.2 : -3.2))) continue;
      const fb = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1, 0.3, 12), M(pick(['#ff6b9a', '#ffd35a', '#c86bff', '#ff8a3d'])));
      fb.position.set(cx + (i % 2 ? 3.2 : -3.2), 0.25, cz + (i < 2 ? 3.2 : -3.2));
      S.add(fb);
    }
    if (!inLake(cx + 2.2, cz + 2.2)) lamp(cx + 2.2, cz + 2.2);
    if (!inLake(cx - 2.2, cz - 2.2)) lamp(cx - 2.2, cz - 2.2);
    label(name || PARKS[parkN++ % PARKS.length], jardin ? x0 + w * 0.5 : cx, jardin ? z0 + d * 0.62 : cz, 4);
    return { x0, x1, z0, z1, cx, cz };
  }

  // ---------- Jardin de ta sœur : lac, barque, pêcheurs, kiffeurs, foodtruck du Gros Glouton, GAB, pancartes photos ----------
  function jardin(p) {
    const { x0, x1, z0, z1 } = p;
    const w = x1 - x0;
    const d = z1 - z0;
    const R = Math.min(w, d) * 0.24;
    const lx = x0 + w * 0.62;
    const lz = z0 + d * 0.38;
    const lake = new THREE.Mesh(new THREE.CircleGeometry(R, 48), mats.water);
    lake.rotation.x = -Math.PI / 2;
    lake.scale.set(1.35, 1, 1);
    lake.position.set(lx, 0.15, lz);
    S.add(lake);
    const shore = new THREE.Mesh(new THREE.TorusGeometry(R, 0.25, 6, 48), M('#9a9286'));
    shore.rotation.x = Math.PI / 2;
    shore.scale.set(1.35, 1, 1);
    shore.position.set(lx, 0.15, lz);
    S.add(shore);
    // Ponton + barque qui tourne sur le lac
    const dock = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.15, 4), mats.wood);
    dock.position.set(lx - R * 1.35 - 0.6, 0.25, lz);
    dock.rotation.y = Math.PI / 2;
    S.add(dock);
    const boat = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.45, 0.5, 12, 1, false, 0, Math.PI), M('#8a4a22'));
    hull.rotation.set(Math.PI / 2, 0, Math.PI / 2);
    hull.scale.set(1, 2.6, 1);
    boat.add(hull);
    const rower = makeWalker(mats);
    rower.scale.setScalar(0.8);
    rower.position.y = -0.2;
    boat.add(rower);
    for (const sgn of [-1, 1]) {
      const oar = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.06, 0.12), mats.wood);
      oar.position.set(sgn * 0.9, 0.3, 0);
      oar.userData.sgn = sgn;
      boat.add(oar);
    }
    W.add(boat);
    // Pêcheurs sur la berge (canne + fil)
    const rodMat = M('#3a2a1a');
    const lineMat = new THREE.LineBasicMaterial({ color: '#dddddd' });
    for (let i = 0; i < 3; i++) {
      const a = Math.PI * 0.55 + i * 0.5;
      const px = lx + Math.cos(a) * (R * 1.35 + 1.4);
      const pz = lz + Math.sin(a) * (R + 1.4);
      const f = makeWalker(mats);
      f.position.set(px, 0.12, pz);
      f.rotation.y = Math.atan2(lx - px, lz - pz);
      const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.08, 12), M('#556b2f'));
      hat.position.y = 1.52;
      f.add(hat);
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.035, 2.6, 5), rodMat);
      rod.position.set(0.25, 1.4, 0.9);
      rod.rotation.x = 1.0;
      f.add(rod);
      const tip = new THREE.Vector3(0.25, 2.1, 2.0);
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([tip, new THREE.Vector3(0.25, 0.05, 2.6)]), lineMat);
      f.add(line);
      const bob = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), M('#ff3333'));
      bob.position.set(0.25, 0.05, 2.6);
      f.add(bob);
      W.add(f);
      anims.push((dt, t) => (bob.position.y = 0.05 + Math.sin(t * 2 + i) * 0.03));
    }
    // Les kiffeurs : assis sur un banc, petits nuages de fumée
    const bx = x0 + w * 0.25;
    const bz = z0 + d * 0.72;
    const bench = new THREE.Group();
    const seat = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.12, 0.6), mats.wood);
    seat.position.y = 0.5;
    const back = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.6, 0.08), mats.wood);
    back.position.set(0, 0.85, -0.28);
    bench.add(seat, back);
    bench.position.set(bx, 0.12, bz);
    S.add(bench);
    const smokeMat = new THREE.MeshBasicMaterial({ color: '#d8d8d8', transparent: true, opacity: 0.5, depthWrite: false });
    const puffs = [];
    for (let i = 0; i < 3; i++) {
      const k = makeWalker(mats);
      k.position.set(bx - 1.1 + i * 1.1, 0.12, bz + 0.05);
      k.userData.body.position.y = 0.95;
      k.children[0].position.set(0, 0.45, 0.3);
      k.children[0].rotation.x = Math.PI / 2;
      k.children[2].position.y = 1.5;
      const joint = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.035, 0.28, 6), M('#f4efe2', { emissive: '#ff7a1a', emissiveIntensity: 0.2 }));
      joint.position.set(0.12, 1.42, 0.18);
      joint.rotation.z = Math.PI / 2.4;
      k.add(joint);
      W.add(k);
      for (let j = 0; j < 4; j++) {
        const pf = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), smokeMat.clone());
        pf.userData = { x: k.position.x + 0.2, z: k.position.z + 0.2, ph: (j / 4) * 3 + i };
        W.add(pf);
        puffs.push(pf);
      }
    }
    label('les kiffeurs', bx, bz, 2.6);
    anims.push((dt, t) => {
      for (const pf of puffs) {
        const k = ((t * 0.35 + pf.userData.ph) % 3) / 3;
        pf.position.set(pf.userData.x + Math.sin(t + pf.userData.ph) * 0.3 * k, 1.6 + k * 2.4, pf.userData.z + k * 0.5);
        pf.scale.setScalar(0.6 + k * 2.2);
        pf.material.opacity = 0.45 * (1 - k);
      }
    });
    // Foodtruck « Le Gros Glouton »
    const fx = x0 + w * 0.28;
    const fz = z0 + d * 0.3;
    const truck = new THREE.Group();
    const van = new THREE.Mesh(new THREE.BoxGeometry(5.2, 2.6, 2.4), M('#ffcf33', { roughness: 0.5 }));
    van.position.y = 1.7;
    const cab = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.8, 2.3), M('#ffcf33', { roughness: 0.5 }));
    cab.position.set(3.3, 1.3, 0);
    const win = new THREE.Mesh(new THREE.BoxGeometry(2.8, 1, 0.06), city.glassMat);
    win.position.set(-0.4, 1.9, 1.23);
    const awning = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.08, 1.2), M('#c8102e'));
    awning.position.set(-0.4, 2.7, 1.75);
    awning.rotation.x = 0.35;
    const signTex = textTexture(['LE GROS GLOUTON', 'chef GAB'], { w: 512, h: 128, bg: '#c8102e', fg: '#ffffff', font: 'bold 56px Inter Variable, sans-serif' });
    const sg = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 1.1), new THREE.MeshStandardMaterial({ map: signTex, emissive: '#ffffff', emissiveMap: signTex, emissiveIntensity: 0.6 }));
    sg.position.set(-0.2, 3.35, 1.21);
    truck.add(van, cab, win, awning, sg);
    for (const [x, z] of [[-1.7, 1.2], [1.7, 1.2], [-1.7, -1.2], [1.7, -1.2], [3.3, 1.2], [3.3, -1.2]]) {
      const wh = new THREE.Mesh(mats.wheelGeo, mats.wheel);
      wh.rotation.z = Math.PI / 2;
      wh.rotation.y = Math.PI / 2;
      wh.position.set(x, 0.4, z);
      truck.add(wh);
    }
    for (const x of [-2, 0, 2]) {
      const tbl = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.06, 12), M('#e8e8e8'));
      tbl.position.set(x, 0.95, 3.6);
      truck.add(tbl);
    }
    truck.position.set(fx, 0.12, fz);
    W.add(truck);
    for (const m of [van, cab, sg]) {
      m.userData.nodeId = 'lm:foodtruck';
      city.pickables.push(m);
    }
    city.nodes.set('lm:foodtruck', { node: { id: 'lm:foodtruck', name: 'Le Gros Glouton' }, type: 'special', pos: new THREE.Vector3(fx, 0.3, fz), front: new THREE.Vector3(fx, 0.3, fz + 4), district: null });
    label('🍔 Le Gros Glouton', fx, fz, 5);
    // GAB, le chef, se balade dans le parc… sans rien sur lui (une barre « censuré » préserve la décence)
    const gab = new THREE.Group();
    const skin = M('#e8b98f', { roughness: 0.7 });
    const gBody = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.5, 4, 10), skin);
    gBody.position.y = 0.78;
    const gLegs = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.62, 0.22), skin);
    gLegs.position.y = 0.3;
    const gHead = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), skin);
    gHead.position.y = 1.38;
    const toque = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.17, 0.32, 12), M('#ffffff'));
    toque.position.y = 1.66;
    const toqueTop = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 8), M('#ffffff'));
    toqueTop.position.y = 1.86;
    const censor = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.2, 0.3), new THREE.MeshBasicMaterial({ color: '#000000' }));
    censor.position.set(0, 0.5, 0.05);
    const spatula = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.6, 0.18), M('#9aa0a8', { metalness: 0.7 }));
    spatula.position.set(0.36, 0.85, 0.1);
    gab.add(gBody, gLegs, gHead, toque, toqueTop, censor, spatula);
    for (const m of [gBody, gHead, toque]) {
      m.userData.nodeId = 'lm:gab';
      city.pickables.push(m);
    }
    const gl = document.createElement('div');
    gl.className = 'agent-bubble agent-resident kid has-text';
    gl.style.setProperty('--c', '#ffcf33');
    gl.innerHTML = '<b>GAB</b><span>chef du Gros Glouton</span>';
    const glo = new CSS2DObject(gl);
    glo.position.y = 2.5;
    gab.add(glo);
    W.add(gab);
    const gabState = { pos: new THREE.Vector3(fx + 3, 0.12, fz + 3), to: new THREE.Vector3(fx, 0.12, fz + 5), wait: 0 };
    gab.position.copy(gabState.pos);
    city.nodes.set('lm:gab', { node: { id: 'lm:gab', name: 'GAB' }, type: 'special', get pos() { return gab.position.clone(); }, get front() { return gab.position.clone().add(new THREE.Vector3(0, 0, 2)); }, district: null });
    anims.push((dt, t) => {
      const dv = gabState.to.clone().sub(gab.position).setY(0);
      if (dv.length() < 0.2) {
        gabState.wait -= dt;
        if (gabState.wait <= 0) {
          gabState.to.set(x0 + 3 + Math.random() * (w - 6), 0.12, z0 + 3 + Math.random() * (d - 6));
          if (Math.hypot(gabState.to.x - lx, (gabState.to.z - lz) * 1.35) < R * 1.5) gabState.to.set(fx + 1, 0.12, fz + 4.5);
          gabState.wait = 1.5 + Math.random() * 3;
        }
      } else {
        dv.normalize();
        gab.position.addScaledVector(dv, dt * 1.4);
        gab.rotation.y = Math.atan2(dv.x, dv.z);
        gab.position.y = 0.12 + Math.abs(Math.sin(t * 7)) * 0.06;
      }
      // Barque
      const a = t * 0.12;
      boat.position.set(lx + Math.cos(a) * R * 0.75 * 1.35, 0.25, lz + Math.sin(a) * R * 0.75);
      boat.rotation.y = -a;
      for (const o of boat.children) if (o.userData.sgn) o.rotation.x = Math.sin(t * 3) * 0.5;
    });
    // Pancartes à photos (modifiables par le tier 1)
    const slots = [[x0 + w * 0.12, z0 + d * 0.5], [x0 + w * 0.45, z0 + d * 0.88], [x0 + w * 0.88, z0 + d * 0.78], [x0 + w * 0.5, z0 + d * 0.12]];
    slots.forEach(([sx, sz], i) => {
      const grp = new THREE.Group();
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.14, 2.4, 0.14), mats.wood);
      post.position.y = 1.2;
      const frame = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.9, 0.12), mats.wood);
      frame.position.y = 2.7;
      const mat = new THREE.MeshStandardMaterial({ map: textTexture(['PHOTO', 'à poser (tier 1)'], { w: 256, h: 192, bg: '#2a2a33', fg: '#ffd76b', font: 'bold 44px Inter Variable, sans-serif' }), emissive: '#ffffff', emissiveIntensity: 0.25 });
      mat.emissiveMap = mat.map;
      const pic = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.7), mat);
      pic.position.set(0, 2.7, 0.07);
      grp.add(post, frame, pic);
      grp.position.set(sx, 0.12, sz);
      grp.rotation.y = Math.atan2((x0 + x1) / 2 - sx, (z0 + z1) / 2 - sz);
      W.add(grp);
      const id = `lm:photo:${i}`;
      for (const m of [frame, pic]) {
        m.userData.nodeId = id;
        city.pickables.push(m);
      }
      city.nodes.set(id, { node: { id, name: `Pancarte photo ${i + 1}` }, type: 'special', pos: new THREE.Vector3(sx, 2, sz), front: new THREE.Vector3(sx, 0.3, sz + 3), district: null });
      city.photoSigns.push({
        slot: i,
        set: (ph) => {
          if (!ph?.url) {
            mat.map = textTexture(['PHOTO', ph?.caption || 'à poser (tier 1)'], { w: 256, h: 192, bg: '#2a2a33', fg: '#ffd76b', font: 'bold 44px Inter Variable, sans-serif' });
            mat.emissiveMap = mat.map;
            mat.needsUpdate = true;
            return;
          }
          new THREE.TextureLoader().load(ph.url, (tex) => {
            tex.colorSpace = THREE.SRGBColorSpace;
            mat.map = tex;
            mat.emissiveMap = tex;
            mat.needsUpdate = true;
          });
        },
      });
    });
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
          S.add(ln);
          if (c < cols && rnd() < 0.65) parked.push({ x: xl + 1.4, z: zl, r: sgn > 0 ? Math.PI : 0 });
        }
      }
    }
    const pole = slab(0.15, 0.15, 3.2, M('#555'), x0 + 1, z1 - 1);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.4), new THREE.MeshStandardMaterial({ map: textTexture('P', { bg: '#1f5fbf', fg: '#fff', w: 128, h: 128, font: 'bold 96px Inter Variable, sans-serif' }), emissive: '#ffffff', emissiveIntensity: 0.3 }));
    sign.material.emissiveMap = sign.material.map;
    sign.position.set(x0 + 1, 3.6, z1 - 0.9);
    S.add(sign);
    void pole;
  }

  const houseMats = new Map();
  const hm = (c) => {
    if (!houseMats.has(c)) houseMats.set(c, M(c));
    return houseMats.get(c);
  };
  // Pavillon avec jardin, haie, allée et parfois une voiture
  function pavillon(x, z, rot, { car = true } = {}) {
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
    for (const [hx, hz, hw, hd] of [[0, -4.4, 9, 0.35], [-4.4, 0, 0.35, 9], [4.4, 0, 0.35, 9], [-3.2, 4.4, 2.6, 0.35]]) {
      const hg = new THREE.Mesh(new THREE.BoxGeometry(hw, 0.7, hd), hedge);
      hg.position.set(hx, 0.4, hz);
      g.add(hg);
    }
    const drive = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 4.6), mats.walk);
    drive.rotation.x = -Math.PI / 2;
    drive.position.set(2.7, 0.12, 2.2);
    g.add(drive);
    // Allée de la porte jusqu'à l'accès (rue, ruelle ou parking)
    const path = new THREE.Mesh(new THREE.BoxGeometry(1, 0.05, 4.5 - (-1.4 + d / 2)), hm('#b9b2a6'));
    path.position.set(-w * 0.18, 0.12, (4.5 + (-1.4 + d / 2)) / 2);
    g.add(path);
    if (car && rnd() < 0.55) {
      const car = makeCar(pick(CARS), mats);
      car.position.set(2.7, 0.1, 2.2);
      car.rotation.y = rnd() < 0.5 ? 0 : Math.PI;
      g.add(car);
    }
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.4, 0.3), hm('#c8102e'));
    box.position.set(1, 0.9, 4.3);
    g.add(box);
    S.add(g);
  }

  // Maison de ville (mitoyenne, à étage, volets) : posée au ras de la rue ou de la ruelle
  function maisonVille(x, z, rot) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = rot;
    const w = 3.8 + rnd() * 1.4;
    const d = 4.6;
    const h = 5.2 + rnd() * 1.4;
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), hm(pick(WALLS)));
    body.position.set(0, h / 2 + 0.1, 0);
    body.castShadow = body.receiveShadow = true;
    // Faîtage parallèle à la rue, pignons sur les côtés
    const roof = new THREE.Mesh(prism(d + 0.4, 1.6, w + 0.3), hm(pick(ROOFS)));
    roof.rotation.y = Math.PI / 2;
    roof.position.set(0, h + 0.1, 0);
    roof.castShadow = true;
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.9, 0.06), hm(pick(['#1f3fbf', '#2f7d4a', '#7a2a2a', '#3a2a20'])));
    door.position.set(-w * 0.22, 1.05, d / 2 + 0.03);
    const step = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.14, 0.45), hm('#b9b2a6'));
    step.position.set(-w * 0.22, 0.08, d / 2 + 0.25);
    g.add(body, roof, door, step);
    const volet = hm(pick(['#2f6b9a', '#4a7a4a', '#9a3a2a', '#d8c8a0']));
    for (let fl = 0; fl < 2; fl++) {
      for (const wx of fl ? [-w * 0.22, w * 0.22] : [w * 0.22]) {
        const win = new THREE.Mesh(new THREE.BoxGeometry(0.75, 1, 0.05), city.glassMat);
        win.position.set(wx, 1.5 + fl * 2.3, d / 2 + 0.03);
        g.add(win);
        for (const sx of [-1, 1]) {
          const v = new THREE.Mesh(new THREE.BoxGeometry(0.36, 1.05, 0.04), volet);
          v.position.set(wx + sx * 0.58, 1.5 + fl * 2.3, d / 2 + 0.04);
          g.add(v);
        }
      }
    }
    S.add(g);
  }

  // Quartier à la française le long d'une bande hors du périphérique :
  // une rue principale qui serpente, reliée au périphérique, une place du village avec fontaine,
  // des impasses en raquette, des ruelles piétonnes et des parkings. Chaque maison est tournée vers son accès
  // (rue, ruelle ou parking) avec son allée ; rien ne se chevauche (cercles d'occupation).
  function bourg({ along, a0, a1, base, sign, name, place: placeName, seed }) {
    const W2 = (u, v) => (along === 'x' ? new THREE.Vector2(u, base + sign * v) : new THREE.Vector2(base + sign * v, u));
    const busy = [];
    const free = (p, r) => busy.every((b) => Math.hypot(b.x - p.x, b.y - p.y) >= b.r + r);
    const occupy = (p, r) => busy.push({ x: p.x, y: p.y, r });
    const occupyLine = (a, b, r) => {
      const n = Math.max(1, Math.ceil(a.distanceTo(b) / 2.5));
      for (let i = 0; i <= n; i++) occupy(a.clone().lerp(b, i / n), r);
    };
    const roadR = ROAD_W / 2 + SIDEWALK + 0.4;
    // Le périphérique longe la bande
    occupyLine(W2(a0 - 10, 0), W2(a1 + 10, 0), roadR + 0.5);
    const ph = seed * 1.7;
    const mainV = (u) => 21 + Math.sin(u / 23 + ph) * 5 + Math.sin(u / 9.7 + ph * 2) * 1.6;
    // Rue principale (segments courts + raccords ronds aux jointures)
    const pts = [];
    for (let u = a0; u <= a1 + 0.01; u += 6) pts.push(W2(u, mainV(u)));
    for (let i = 0; i < pts.length - 1; i++) {
      road(pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y, { center: i % 2 === 0 });
      occupyLine(pts[i], pts[i + 1], roadR);
      const j = new THREE.Mesh(new THREE.CircleGeometry(ROAD_W / 2, 20), mats.asphalt);
      j.rotation.x = -Math.PI / 2;
      j.position.set(pts[i + 1].x, 0.041, pts[i + 1].y);
      S.add(j);
    }
    // Raquettes de retournement aux deux bouts de la rue principale
    for (const e of [pts[0], pts[pts.length - 1]]) {
      const turn = new THREE.Mesh(new THREE.CircleGeometry(5.2, 28), mats.asphalt);
      turn.rotation.x = -Math.PI / 2;
      turn.position.set(e.x, 0.043, e.y);
      S.add(turn);
      occupy(e, 6.5);
    }
    // Rue secondaire en boucle, plus haut, reliée à la rue principale à ses deux bouts
    const backV = (u) => mainV(u) + 31 + Math.sin(u / 17 + ph) * 3;
    const bu0 = a0 + 22;
    const bu1 = a1 - 22;
    const pts2 = [];
    for (let u = bu0; u <= bu1 + 0.01; u += 6) pts2.push(W2(u, backV(u)));
    for (let i = 0; i < pts2.length - 1; i++) {
      road(pts2[i].x, pts2[i].y, pts2[i + 1].x, pts2[i + 1].y, { center: false });
      occupyLine(pts2[i], pts2[i + 1], roadR);
      const j = new THREE.Mesh(new THREE.CircleGeometry(ROAD_W / 2, 20), mats.asphalt);
      j.rotation.x = -Math.PI / 2;
      j.position.set(pts2[i + 1].x, 0.041, pts2[i + 1].y);
      S.add(j);
    }
    for (const u of [bu0, bu1]) {
      const a = W2(u, mainV(u));
      const b = W2(u, backV(u));
      road(a.x, a.y, b.x, b.y, { walks: false });
      occupyLine(a, b, ROAD_W / 2 + 1.2);
    }
    // Accès routiers au périphérique (dont le prolongement de la rue centrale)
    const links = [a0 + 16, along === 'x' ? 0 : (a0 + a1) / 2, a1 - 16];
    for (const u of links) {
      const a = W2(u, ROAD_W / 2);
      const b = W2(u, mainV(u));
      road(a.x, a.y, b.x, b.y, { walks: false });
      occupyLine(a, b, ROAD_W / 2 + 1.2);
    }
    // Place du village (au bout de la rue centrale) : pavés, fontaine, arbres, bancs, maisons de ville autour
    const pu = links[1];
    const pc = W2(pu, mainV(pu) + 13);
    const pave = M('#8f8676', { roughness: 0.9 });
    city.platformMats.push({ mat: pave, night: new THREE.Color('#2e2b27'), day: new THREE.Color('#cfc4b0') });
    const place = new THREE.Mesh(new THREE.CircleGeometry(7.5, 40), pave);
    place.rotation.x = -Math.PI / 2;
    place.position.set(pc.x, 0.06, pc.y);
    place.receiveShadow = true;
    S.add(place);
    const lane0 = W2(pu, mainV(pu) + roadR - 0.4);
    const lane1 = W2(pu, mainV(pu) + 13 - 7);
    pedestrian(lane0, lane1);
    occupyLine(lane0, lane1, 1.8);
    const basin = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 2, 0.6, 24), M('#a39b8c'));
    basin.position.set(pc.x, 0.3, pc.y);
    const water = new THREE.Mesh(new THREE.CircleGeometry(1.6, 24), mats.water);
    water.rotation.x = -Math.PI / 2;
    water.position.set(pc.x, 0.58, pc.y);
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.3, 1.8, 10), M('#a39b8c'));
    col.position.set(pc.x, 1.2, pc.y);
    S.add(basin, water, col);
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + 0.4;
      tree(pc.x + Math.cos(a) * 5, pc.y + Math.sin(a) * 5);
      benches.push({ x: pc.x + Math.cos(a + 0.8) * 4.2, z: pc.y + Math.sin(a + 0.8) * 4.2, r: -a - 0.8 + Math.PI / 2 });
    }
    lamp(pc.x + 3, pc.y - 3);
    occupy(pc, 8);
    label(placeName, pc.x, pc.y, 4.5);
    for (let k = 0; k < 9; k++) {
      const a = Math.PI * (0.15 + (k / 8) * 1.7) + (along === 'x' ? 0 : -Math.PI / 2);
      const hp = new THREE.Vector2(pc.x + Math.cos(a) * 12.5, pc.y + Math.sin(a) * 12.5);
      if (!free(hp, 3)) continue;
      maisonVille(hp.x, hp.y, Math.atan2(pc.x - hp.x, pc.y - hp.y));
      occupy(hp, 3.2);
    }
    // Impasses en raquette, ruelles piétonnes et parkings, de part et d'autre de la place
    const slots = [];
    for (let u = a0 + 28; u < a1 - 20; u += 26 + rnd() * 10) if (Math.abs(u - pu) > 22) slots.push(u);
    slots.forEach((u, i) => {
      const v0 = mainV(u) + roadR - 0.5;
      const kind = ['impasse', 'ruelle', 'parking'][(i + seed) % 3];
      if (kind === 'impasse') {
        const end = W2(u, v0 + 9);
        const a = W2(u, mainV(u));
        road(a.x, a.y, end.x, end.y, { walks: false, center: false });
        occupyLine(a, end, ROAD_W / 2 + 0.8);
        const turn = new THREE.Mesh(new THREE.CircleGeometry(5.5, 28), mats.asphalt);
        turn.rotation.x = -Math.PI / 2;
        turn.position.set(end.x, 0.042, end.y);
        S.add(turn);
        occupy(end, 5.4);
        lamp(end.x + 4, end.y);
        // Pavillons autour de la raquette, tournés vers elle
        for (let k = 0; k < 6; k++) {
          const ang = Math.PI * (0.2 + k * 0.32) + (along === 'x' ? 0 : -Math.PI / 2);
          const hp = new THREE.Vector2(end.x + Math.cos(ang) * 11, end.y + Math.sin(ang) * 11);
          if (!free(hp, 4.6)) continue;
          pavillon(hp.x, hp.y, Math.atan2(end.x - hp.x, end.y - hp.y));
          occupy(hp, 4.8);
        }
      } else if (kind === 'ruelle') {
        // Passage piéton qui relie la rue principale à la rue secondaire
        const a = W2(u, v0);
        const b = W2(u, backV(u) - roadR + 0.5);
        pedestrian(a, b);
        occupyLine(a, b, 1.6);
        // Maisons de ville des deux côtés, porte sur la ruelle
        for (let t = 3; t < backV(u) - roadR - v0 - 2; t += 5.2) {
          for (const sd of [-1, 1]) {
            const hp = W2(u + sd * 4.4, v0 + t);
            const lp = W2(u, v0 + t);
            if (!free(hp, 2.8)) continue;
            maisonVille(hp.x, hp.y, Math.atan2(lp.x - hp.x, lp.y - hp.y));
            occupy(hp, 3);
          }
        }
      } else {
        const c = W2(u, v0 + 9);
        const half = 7;
        const x0 = Math.min(W2(u - half, v0 + 3).x, W2(u + half, v0 + 15).x);
        const x1 = Math.max(W2(u - half, v0 + 3).x, W2(u + half, v0 + 15).x);
        const z0 = Math.min(W2(u - half, v0 + 3).y, W2(u + half, v0 + 15).y);
        const z1 = Math.max(W2(u - half, v0 + 3).y, W2(u + half, v0 + 15).y);
        parking(x0, x1, z0, z1);
        const a = W2(u, mainV(u));
        const b = W2(u, v0 + 3);
        road(a.x, a.y, b.x, b.y, { walks: false, center: false });
        occupy(c, 9);
        occupyLine(a, b, ROAD_W / 2 + 0.8);
        // Maisons qui donnent sur le parking
        for (const t of [-1, 1]) {
          const hp = W2(u + t * (half + 5), v0 + 9);
          const lp = W2(u + t * half, v0 + 9);
          if (!free(hp, 4.6)) continue;
          pavillon(hp.x, hp.y, Math.atan2(lp.x - hp.x, lp.y - hp.y), { car: false });
          occupy(hp, 4.8);
        }
      }
    });
    // Le long des deux rues : pavillons et maisons de ville, retraits et angles irréguliers
    for (const [street, from, to] of [[mainV, a0 + 4, a1 - 2], [backV, bu0, bu1]]) for (let u = from; u < to; u += 7 + rnd() * 5) {
      for (const sd of [1, -1]) {
        const ville = rnd() < 0.35;
        const off = roadR + (ville ? 2.6 : 4.8) + rnd() * 1.2;
        const v = street(u) + sd * off;
        if (v < roadR + 5 || v > BAND) continue;
        const hp = W2(u + (rnd() - 0.5) * 2, v);
        const r = ville ? 3 : 4.7;
        if (!free(hp, r)) continue;
        const lp = W2(u, street(u));
        const rot = Math.atan2(lp.x - hp.x, lp.y - hp.y) + (rnd() - 0.5) * 0.25;
        if (ville) maisonVille(hp.x, hp.y, rot);
        else pavillon(hp.x, hp.y, rot);
        occupy(hp, r + 0.3);
      }
    }
    const mid = W2((a0 + a1) / 2 + 30, mainV((a0 + a1) / 2 + 30));
    label(name, mid.x, mid.y, 6);
  }
  // Ruelle piétonne pavée (sans voitures), avec lampadaires
  function pedestrian(a, b) {
    const len = a.distanceTo(b);
    const m = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.1, len), M('#b8ab94', { roughness: 0.9 }));
    m.position.set((a.x + b.x) / 2, 0.06, (a.y + b.y) / 2);
    m.rotation.y = Math.atan2(b.x - a.x, b.y - a.y);
    m.receiveShadow = true;
    S.add(m);
    for (let t = 4; t < len; t += 8) {
      const p = a.clone().lerp(b, t / len);
      const sd = new THREE.Vector2(b.y - a.y, -(b.x - a.x)).normalize().multiplyScalar(1.6);
      lamp(p.x + sd.x, p.y + sd.y);
    }
  }

  // Remplit les espaces libres des quadrants (parcs et parkings en alternance). Le plus grand devient le Jardin de ta sœur.
  let n = 0;
  const big = [...geo.slack].sort((a, b) => (b.x1 - b.x0) * (b.z1 - b.z0) - (a.x1 - a.x0) * (a.z1 - a.z0))[0];
  if (big) jardin(park(big.x0 + 1, big.x1 - 1, big.z0 + 1, big.z1 - 1, 'Jardin de ta sœur', true));
  for (const r of geo.slack) {
    if (r === big) continue;
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

  // Hors du périphérique : deux quartiers « à la française » (devant et à droite), grand parc + parking (à gauche)
  const out = ROAD_W / 2 + SIDEWALK + 5.5;
  const BAND = 64;
  bourg({ along: 'x', a0: X0 - 4, a1: X1 + 4, base: Z1, sign: 1, name: 'Le Vieux Bourg', place: 'Place du Marché', seed: 1 });
  bourg({ along: 'z', a0: Z0 + 2, a1: Z1 - 8, base: X1, sign: 1, name: 'Les Coteaux', place: 'Place de l’Église', seed: 2 });
  const bigPark = park(X0 - out - 24, X0 - out + 4, Z0 + 4, (Z0 + Z1) / 2 - 2, 'Grand parc');
  parking(X0 - out - 24, X0 - out + 4, (Z0 + Z1) / 2 + 2, Math.min(Z1, (Z0 + Z1) / 2 + 26));
  void bigPark;

  // ---------- Forêt tout autour ----------
  const fx0 = X0 - out - 30;
  const fx1 = X1 + BAND + 6;
  const fz0 = Z0 - 10;
  const fz1 = Z1 + BAND + 6;
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
    S.add(g);
  }
  for (const p of parked) {
    const c = makeCar(pick(CARS), mats);
    c.position.set(p.x, 0.1, p.z);
    c.rotation.y = p.r;
    S.add(c);
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
      c.traverse((o) => (o.castShadow = false));
      bake(c);
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
    bus.userData.car = true;
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
        bake(w);
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

  bake(S);

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
