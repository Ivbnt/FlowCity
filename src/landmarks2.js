// Nouveaux bâtiments : cerveau (bibliothèque), université des agents, réseaux sociaux TRS, beatmakers (FL d'or),
// maison Gapple (pomme d'or), maisons d'artistes, salles partenaires, place des festivals, immeubles de projets
// avec leur statue, et la statue de Claude près de la fontaine.
import * as THREE from 'three';
import { textTexture, glass } from './landmarks.js';

const M = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.1, ...o });
const STONE = M('#e9e1d2', { roughness: 0.8 });
const STONE_DARK = M('#b9ae9c', { roughness: 0.85 });
const GOLD = M('#ffcf4a', { metalness: 0.9, roughness: 0.22, emissive: '#7a5200', emissiveIntensity: 0.45 });
const DARK = M('#17171f', { roughness: 0.45, metalness: 0.3 });
const BRONZE = M('#9c6b3c', { metalness: 0.75, roughness: 0.35 });

function add(g, geo, mat, x = 0, y = 0, z = 0, o = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  if (o.rx) m.rotation.x = o.rx;
  if (o.ry) m.rotation.y = o.ry;
  if (o.rz) m.rotation.z = o.rz;
  m.castShadow = o.shadow !== false;
  m.receiveShadow = true;
  g.add(m);
  return m;
}
const box = (g, w, h, d, mat, x, y, z, o) => add(g, new THREE.BoxGeometry(w, h, d), mat, x, y + h / 2, z, o);
function sign(g, text, w, h, x, y, z, { bg = '#111', fg = '#fff', accent, emissive = 0.9, ry = 0 } = {}) {
  const tex = textTexture(text, { bg, fg, accent, w: 512, h: Math.max(64, Math.round((512 * h) / w)) });
  return add(g, new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: emissive }), x, y, z, { ry, shadow: false });
}
const windows = (g, n, w, h, y, z, spacing, x0 = 0) => {
  for (let i = 0; i < n; i++) add(g, new THREE.BoxGeometry(w, h, 0.1), glass, x0 + (i - (n - 1) / 2) * spacing, y, z, { shadow: false });
};
const hashColor = (s, palette) => {
  let h = 0;
  for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return palette[h % palette.length];
};

// ---------- Bibliothèque → cerveau ----------
export function buildBrain() {
  const g = new THREE.Group();
  add(g, new THREE.CylinderGeometry(9, 9.5, 0.6, 48), STONE_DARK, 0, 0.6, 0);
  add(g, new THREE.CylinderGeometry(8.4, 8.6, 0.5, 48), STONE_DARK, 0, 1.1, 0);
  const body = add(g, new THREE.CylinderGeometry(6.2, 6.2, 6.5, 32), STONE, 0, 4.6, 0);
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    add(g, new THREE.CylinderGeometry(0.3, 0.34, 6.2, 12), STONE, Math.cos(a) * 7.4, 4.45, Math.sin(a) * 7.4);
  }
  add(g, new THREE.CylinderGeometry(8, 8, 0.6, 48), STONE, 0, 7.85, 0);
  // Le cerveau : deux hémisphères plissés, une scissure, des neurones qui clignotent
  const brainMat = M('#ff8fb1', { roughness: 0.55, emissive: '#ff2d55', emissiveIntensity: 0.25 });
  const brain = new THREE.Group();
  for (const side of [-1, 1]) {
    const geo = new THREE.SphereGeometry(3.4, 40, 28);
    const pos = geo.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const n = v.clone().normalize();
      // Circonvolutions : bosses sinusoïdales
      const k = 1 + 0.06 * Math.sin(n.x * 9 + n.y * 13) * Math.cos(n.z * 11 - n.y * 7) + 0.03 * Math.sin(n.y * 23 + n.z * 17);
      v.multiplyScalar(k);
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    geo.computeVertexNormals();
    const hemi = add(brain, geo, brainMat, side * 1.75, 0, 0);
    hemi.scale.set(0.95, 0.82, 1.25);
  }
  add(brain, new THREE.CylinderGeometry(0.8, 0.5, 2.4, 14), brainMat, 0, -2.6, -0.8, { rx: 0.4 });
  brain.position.y = 12.2;
  g.add(brain);
  const neurons = new THREE.Group();
  const nMat = new THREE.MeshBasicMaterial({ color: '#ffe0ec' });
  for (let i = 0; i < 60; i++) {
    const a = Math.random() * Math.PI * 2;
    const b = Math.acos(2 * Math.random() - 1);
    const r = 3.6 + Math.random() * 0.5;
    const s = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 4), nMat.clone());
    s.position.set(Math.sin(b) * Math.cos(a) * r * 1.6, Math.cos(b) * r * 0.85, Math.sin(b) * Math.sin(a) * r * 1.2);
    s.userData.ph = Math.random() * 6;
    neurons.add(s);
  }
  neurons.position.y = 12.2;
  g.add(neurons);
  // Synapses : arcs lumineux entre neurones
  const pts = [];
  const ns = neurons.children;
  for (let i = 0; i < 40; i++) pts.push(ns[i].position, ns[(i * 7 + 3) % ns.length].position);
  const syn = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: '#ff5577', transparent: true, opacity: 0.5 }));
  syn.position.y = 12.2;
  g.add(syn);
  box(g, 2, 3, 0.3, DARK, 0, 1.35, 6.15);
  sign(g, ['CERVEAU', 'bibliothèque'], 4.6, 1.3, 0, 6.7, 7.75, { bg: '#2a0a12', fg: '#ffd7a0', emissive: 0.8 });
  return {
    group: g,
    pick: [body, ...brain.children],
    h: 17,
    anim: (dt, t) => {
      brain.rotation.y = Math.sin(t * 0.3) * 0.4;
      neurons.rotation.y = brain.rotation.y;
      syn.rotation.y = brain.rotation.y;
      brainMat.emissiveIntensity = 0.22 + Math.sin(t * 2.2) * 0.12;
      for (const s of ns) s.material.color.setScalar(0.4 + 0.6 * Math.max(0, Math.sin(t * 3 + s.userData.ph)));
      syn.material.opacity = 0.3 + Math.sin(t * 1.7) * 0.2;
    },
  };
}

// ---------- Université des agents ----------
export function buildUniversity() {
  const g = new THREE.Group();
  box(g, 18, 0.4, 13, STONE_DARK, 0, 0, 0);
  for (let i = 0; i < 3; i++) box(g, 10 - i * 1.2, 0.3, 1, STONE, 0, 0.4 + i * 0.3, 5.6 - i * 0.6);
  const body = box(g, 16, 6.4, 8, M('#d9c9ae', { roughness: 0.8 }), 0, 0.4, -1.6);
  for (let i = 0; i < 8; i++) add(g, new THREE.CylinderGeometry(0.34, 0.38, 5.8, 14), STONE, -6.3 + i * 1.8, 3.6, 3.1);
  box(g, 16.6, 0.6, 2.2, STONE, 0, 6.5, 3);
  const ped = new THREE.Shape();
  ped.moveTo(-8.3, 0);
  ped.lineTo(8.3, 0);
  ped.lineTo(0, 2.2);
  ped.closePath();
  const pg = new THREE.ExtrudeGeometry(ped, { depth: 1.8, bevelEnabled: false });
  pg.translate(0, 0, -0.9);
  const pedMesh = add(g, pg, STONE, 0, 7.1, 3);
  sign(g, 'UNIVERSITÉ', 6.4, 0.9, 0, 6.85, 4.15, { bg: '#1c2a4a', fg: '#ffd76b', emissive: 0.7 });
  windows(g, 6, 1, 1.8, 3.4, 2.42, 2.5);
  box(g, 1.8, 3, 0.2, DARK, 0, 0.4, 2.46);
  // Toque de diplômé sur le toit
  const cap = new THREE.Group();
  add(cap, new THREE.BoxGeometry(4.2, 0.18, 4.2), DARK, 0, 0, 0);
  add(cap, new THREE.CylinderGeometry(1.3, 1.5, 1, 4), DARK, 0, -0.55, 0, { ry: Math.PI / 4 });
  const tassel = add(cap, new THREE.CylinderGeometry(0.05, 0.05, 1.4, 6), GOLD, 1.9, -0.6, 1.9);
  cap.position.set(0, 10.6, -1.6);
  cap.rotation.y = 0.5;
  g.add(cap);
  // Les agents spécialisés en orbite (petits robots colorés)
  const bots = new THREE.Group();
  ['#9b7bff', '#2fd17a', '#33c6ff', '#ffb020', '#ff6bd5', '#ffd76b', '#e1242b'].forEach((c, i) => {
    const b = new THREE.Group();
    add(b, new THREE.BoxGeometry(0.7, 0.6, 0.6), M('#15151e', { emissive: c, emissiveIntensity: 0.9 }), 0, 0, 0, { shadow: false });
    add(b, new THREE.SphereGeometry(0.12, 8, 6), new THREE.MeshBasicMaterial({ color: c }), 0, 0.5, 0, { shadow: false });
    b.userData.a = (i / 7) * Math.PI * 2;
    bots.add(b);
  });
  bots.position.set(0, 13, -1.6);
  g.add(bots);
  return {
    group: g,
    pick: [body, pedMesh],
    h: 14,
    anim: (dt, t) => {
      bots.children.forEach((b, i) => {
        const a = b.userData.a + t * 0.5;
        b.position.set(Math.cos(a) * 5, Math.sin(t * 2 + i) * 0.4, Math.sin(a) * 3);
        b.rotation.y = -a;
      });
      tassel.rotation.z = Math.sin(t * 2) * 0.2;
    },
  };
}

// ---------- Réseaux sociaux TRS ----------
export function buildSocial(color, sub) {
  const kind = sub?.social || 'youtube';
  const g = new THREE.Group();
  box(g, 11, 0.3, 10, STONE_DARK, 0, 0, 0);
  const C = { soundcloud: '#ff5500', youtube: '#ff0000', instagram: '#d62976' }[kind];
  const body = box(g, 8, 6, 6, M(kind === 'instagram' ? '#8a3ab9' : C, { roughness: 0.45 }), 0, 0.3, -1);
  box(g, 8.3, 0.3, 6.3, M('#ffffff'), 0, 6.3, -1);
  windows(g, 3, 1.2, 1.4, 4.5, 2.02, 2.4);
  box(g, 1.4, 2.4, 0.15, M('#ffffff'), 2.4, 0.3, 2.02);
  const logo = new THREE.Group();
  const white = M('#ffffff', { emissive: '#ffffff', emissiveIntensity: 0.6 });
  if (kind === 'youtube') {
    add(logo, new THREE.BoxGeometry(4.4, 3, 0.4), M('#ff0000', { emissive: '#ff0000', emissiveIntensity: 0.6 }), 0, 0, 0);
    const tri = new THREE.Shape();
    tri.moveTo(-0.6, -0.8);
    tri.lineTo(-0.6, 0.8);
    tri.lineTo(0.8, 0);
    tri.closePath();
    add(logo, new THREE.ExtrudeGeometry(tri, { depth: 0.2, bevelEnabled: false }), white, 0, 0, 0.2);
  } else if (kind === 'soundcloud') {
    // Nuage + barres
    [[-0.6, 0, 1.1], [0.7, 0.2, 1.3], [1.8, -0.2, 0.9], [-1.6, -0.3, 0.75]].forEach(([x, y, r]) => add(logo, new THREE.SphereGeometry(r, 18, 12), M('#ff7a1a', { emissive: '#ff5500', emissiveIntensity: 0.6 }), x, y, 0));
    for (let i = 0; i < 6; i++) add(logo, new THREE.BoxGeometry(0.16, 0.8 + (i % 3) * 0.35, 0.3), white, -3.4 + i * 0.32, -0.3, 0.3);
  } else {
    add(logo, new THREE.TorusGeometry(1.5, 0.22, 10, 4, Math.PI * 2), M('#ffffff', { emissive: '#feda75', emissiveIntensity: 0.6 }), 0, 0, 0, { rz: Math.PI / 4 });
    add(logo, new THREE.TorusGeometry(0.65, 0.18, 10, 32), white, 0, 0, 0.05);
    add(logo, new THREE.SphereGeometry(0.16, 10, 8), white, 0.85, 0.85, 0.05);
  }
  logo.position.set(0, 9, -1);
  g.add(logo);
  sign(g, { soundcloud: 'SOUNDCLOUD TRS', youtube: 'YOUTUBE TRS', instagram: 'INSTAGRAM TRS' }[kind], 6.6, 0.8, 0, 2.6, 2.03, { bg: '#111', fg: '#ffffff', accent: C, emissive: 0.9 });
  return { group: g, pick: [body, ...logo.children], h: 11, anim: (dt, t) => (logo.rotation.y = Math.sin(t * 0.8) * 0.5) };
}

// ---------- Beatmakers : le FL d'or ----------
function flFruit() {
  const f = new THREE.Group();
  const geo = new THREE.SphereGeometry(1.6, 28, 20);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const k = 1 - Math.max(0, -y / 1.6) * 0.35;
    pos.setX(i, pos.getX(i) * k);
    pos.setZ(i, pos.getZ(i) * k);
  }
  geo.computeVertexNormals();
  add(f, geo, GOLD, 0, 0, 0);
  for (let i = 0; i < 5; i++) add(f, new THREE.ConeGeometry(0.35, 1.2, 6), M('#ffd76b', { metalness: 0.8, roughness: 0.3, emissive: '#7a5200', emissiveIntensity: 0.3 }), Math.cos((i / 5) * 6.28) * 0.5, 1.7, Math.sin((i / 5) * 6.28) * 0.5, { rz: Math.cos((i / 5) * 6.28) * 0.6, rx: Math.sin((i / 5) * 6.28) * 0.6 });
  const tex = textTexture('FL', { w: 256, h: 128, bg: 'rgba(0,0,0,0)', fg: '#3a2400', font: 'bold 100px Inter Variable, sans-serif' });
  add(f, new THREE.PlaneGeometry(1.8, 0.9), new THREE.MeshBasicMaterial({ map: tex, transparent: true }), 0, 0, 1.62, { shadow: false });
  return f;
}
export function buildBeatmakers() {
  const g = new THREE.Group();
  box(g, 13, 0.3, 11, STONE_DARK, 0, 0, 0);
  const body = box(g, 10, 6.5, 7, M('#14141c', { metalness: 0.4, roughness: 0.35 }), 0, 0.3, -1);
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(10, 6.5, 7)), new THREE.LineBasicMaterial({ color: '#ffb020' }));
  edges.position.set(0, 3.55, -1);
  g.add(edges);
  // Pads de MPC en façade
  const pads = [];
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) pads.push(add(g, new THREE.BoxGeometry(0.7, 0.7, 0.12), M('#2a2a33', { emissive: ['#ff3355', '#ffb020', '#33c6ff', '#2fd17a'][(r + c) % 4], emissiveIntensity: 0.2 }), -3.2 + c * 0.85, 1.4 + r * 0.85, 2.56, { shadow: false }));
  sign(g, ['BEATMAKERS', 'FL d’or'], 4, 1.6, 2.4, 4.4, 2.56, { bg: '#14141c', fg: '#ffcf4a', emissive: 1 });
  box(g, 1.4, 2.4, 0.15, GOLD, 2.4, 0.3, 2.53);
  const fruit = flFruit();
  fruit.position.set(0, 9.6, -1);
  g.add(fruit);
  return {
    group: g,
    pick: [body],
    h: 12,
    anim: (dt, t) => {
      fruit.rotation.y += dt * 0.7;
      pads.forEach((p, i) => (p.material.emissiveIntensity = Math.max(0.15, Math.sin(t * 6 - i * 0.7)) * 1.2));
    },
  };
}
export { flFruit };

// ---------- Maison Gapple : une grosse pomme dorée ----------
export function buildGapple() {
  const g = new THREE.Group();
  add(g, new THREE.CylinderGeometry(5.6, 6, 0.4, 40), STONE_DARK, 0, 0.2, 0);
  const geo = new THREE.SphereGeometry(4, 40, 30);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const r = Math.hypot(x, z) / 4;
    // Creux en haut et en bas (forme de pomme)
    pos.setY(i, y * 0.9 - (1 - r) * (y > 0 ? 0.9 : -0.6));
  }
  geo.computeVertexNormals();
  const apple = add(g, geo, GOLD, 0, 4.4, 0);
  add(g, new THREE.CylinderGeometry(0.16, 0.22, 1.6, 8), M('#5b3a1a'), 0.2, 8.4, 0, { rz: -0.25 });
  const leaf = add(g, new THREE.SphereGeometry(0.9, 14, 8), M('#ffd76b', { metalness: 0.8, roughness: 0.3 }), 1, 8.6, 0, { rz: -0.7 });
  leaf.scale.set(1.2, 0.35, 0.6);
  // Porte et fenêtres creusées dans la pomme
  add(g, new THREE.BoxGeometry(1.4, 2.2, 0.3), DARK, 0, 1.5, 3.75);
  for (const [x, y] of [[-1.8, 4.2], [1.8, 4.2], [0, 5.8]]) add(g, new THREE.CircleGeometry(0.5, 16), glass, x, y, Math.sqrt(Math.max(0.1, 16 - x * x - (y - 4.4) ** 2)) * 0.92, { shadow: false });
  sign(g, 'GAPPLE', 3, 0.7, 0, 0.9, 5.2, { bg: '#16120a', fg: '#ffcf4a', emissive: 1 });
  return { group: g, pick: [apple], h: 10, anim: (dt, t) => (apple.rotation.y = Math.sin(t * 0.5) * 0.15) };
}

// ---------- Maison d'un artiste ----------
const ARTIST_COLORS = ['#ff3355', '#33c6ff', '#ffb020', '#9b7bff', '#2fd17a', '#ff6bd5', '#ff8a3d', '#4f8bff'];
export function buildArtistHome(color, sub) {
  const g = new THREE.Group();
  const c = color || hashColor(sub?.name || '', ARTIST_COLORS);
  box(g, 8, 0.2, 8, M('#2d5a3a', { roughness: 0.95 }), 0, 0, 0);
  const body = box(g, 5.6, 4.2, 4.6, M('#f2ede4', { roughness: 0.7 }), 0, 0.2, -0.8);
  box(g, 5.9, 0.3, 4.9, M(c, { emissive: c, emissiveIntensity: 0.25 }), 0, 4.4, -0.8);
  box(g, 2.4, 1.8, 2.4, M(c, { emissive: c, emissiveIntensity: 0.15 }), -1.2, 4.7, -1.2);
  add(g, new THREE.BoxGeometry(3, 1.6, 0.08), glass, 0.8, 2.6, 1.53, { shadow: false });
  box(g, 1, 2, 0.1, M('#3a2a1a'), -1.8, 0.2, 1.52);
  // Affiche de l'artiste (photo ou nom) : remplie par la ville
  const posterMat = new THREE.MeshStandardMaterial({ map: textTexture([String(sub?.name || 'Artiste').toUpperCase(), 'artiste TRS'], { w: 256, h: 320, bg: c, fg: '#ffffff', font: 'bold 40px Inter Variable, sans-serif' }), emissive: '#ffffff', emissiveIntensity: 0.25 });
  posterMat.emissiveMap = posterMat.map;
  const poster = add(g, new THREE.PlaneGeometry(2, 2.5), posterMat, 2.85, 2.6, -0.8, { ry: Math.PI / 2, shadow: false });
  sign(g, String(sub?.name || '').toUpperCase(), 3, 0.6, 0.8, 1.3, 1.55, { bg: '#111', fg: c, emissive: 1 });
  // Petit disque d'or au-dessus de la porte
  add(g, new THREE.CylinderGeometry(0.45, 0.45, 0.06, 24), GOLD, -1.8, 2.7, 1.6, { rx: Math.PI / 2 });
  return {
    group: g,
    pick: [body, poster],
    h: 7,
    setPhoto: (url) => {
      if (!url) return;
      new THREE.TextureLoader().load(url, (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        posterMat.map = tex;
        posterMat.emissiveMap = tex;
        posterMat.needsUpdate = true;
      });
    },
  };
}

// ---------- Salle partenaire ----------
export function buildVenue(color, sub) {
  const g = new THREE.Group();
  const name = String(sub?.name || 'Salle').toUpperCase();
  box(g, 11, 0.3, 10, STONE_DARK, 0, 0, 0);
  const wall = hashColor(name, ['#3a1630', '#16243a', '#2a1a10', '#1d2d1d']);
  const body = box(g, 9, 5.5, 6.5, M(wall, { roughness: 0.6 }), 0, 0.3, -1);
  box(g, 9.3, 0.4, 6.8, M('#111'), 0, 5.8, -1);
  box(g, 7, 1.2, 1, DARK, 0, 3.4, 2.7);
  const marquee = sign(g, name.slice(0, 18), 6.8, 1, 0, 4, 3.22, { bg: '#16060b', fg: '#ffd76b', emissive: 1.3 });
  const bulbs = [];
  for (let i = 0; i < 12; i++) bulbs.push(add(g, new THREE.SphereGeometry(0.1, 8, 6), M('#ffd76b', { emissive: '#ffb020', emissiveIntensity: 2 }), -3.3 + i * 0.6, 4.62, 3.22, { shadow: false }));
  box(g, 2.4, 2.8, 0.15, DARK, 0, 0.3, 2.27);
  sign(g, 'SALLE PARTENAIRE', 3.4, 0.45, 0, 2.95, 3.24, { bg: '#111', fg: '#ffffff', emissive: 0.6 });
  return {
    group: g,
    pick: [body],
    h: 8,
    anim: (dt, t) => {
      bulbs.forEach((b, i) => (b.material.emissiveIntensity = Math.sin(t * 5 + i) > 0 ? 2.2 : 0.4));
      marquee.material.emissiveIntensity = 1.1 + Math.sin(t * 3) * 0.2;
    },
  };
}

// ---------- Statues ----------
// Statue en bronze (ou en or) sur un socle, selon le thème du projet.
export function buildStatue(theme, { scale = 1, plaque } = {}) {
  const g = new THREE.Group();
  const mat = theme === 'cat' ? M('#c8102e', { metalness: 0.6, roughness: 0.3, emissive: '#5a0010', emissiveIntensity: 0.3 }) : theme === 'ruin' ? M('#77736c', { roughness: 0.9 }) : theme === 'topline' ? GOLD : BRONZE;
  add(g, new THREE.BoxGeometry(1.6, 1.2, 1.6), STONE, 0, 0.6, 0);
  add(g, new THREE.BoxGeometry(1.9, 0.2, 1.9), STONE_DARK, 0, 0.1, 0);
  const top = new THREE.Group();
  top.position.y = 1.2;
  g.add(top);
  const mic = (x = 0, h = 2.2) => {
    add(top, new THREE.CylinderGeometry(0.05, 0.05, h, 8), mat, x, h / 2, 0);
    add(top, new THREE.SphereGeometry(0.28, 14, 10), mat, x, h + 0.25, 0);
    add(top, new THREE.CylinderGeometry(0.35, 0.4, 0.08, 14), mat, x, 0.04, 0);
  };
  if (theme === 'cat') {
    add(top, new THREE.SphereGeometry(0.6, 16, 12), mat, 0, 0.6, 0).scale.set(1, 1.1, 1.3);
    add(top, new THREE.SphereGeometry(0.42, 16, 12), mat, 0, 1.45, 0.25);
    for (const x of [-0.22, 0.22]) add(top, new THREE.ConeGeometry(0.13, 0.35, 6), mat, x, 1.85, 0.25);
    add(top, new THREE.TorusGeometry(0.5, 0.06, 6, 20, Math.PI), mat, 0, 0.5, -0.7, { ry: Math.PI / 2 });
  } else if (theme === 'festival') {
    add(top, new THREE.CylinderGeometry(0.05, 0.05, 2.6, 8), mat, -0.4, 1.3, 0);
    const flag = add(top, new THREE.PlaneGeometry(1.1, 0.7), M('#ffb020', { side: THREE.DoubleSide, emissive: '#ffb020', emissiveIntensity: 0.4 }), 0.15, 2.25, 0, { shadow: false });
    flag.userData.flag = true;
    add(top, new THREE.SphereGeometry(0.45, 14, 10), mat, 0.4, 0.5, 0).scale.set(1, 0.4, 1.4);
    add(top, new THREE.BoxGeometry(0.12, 1.4, 0.06), mat, 0.4, 1.2, 0, { rz: 0.25 });
  } else if (theme === 'cypher') {
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      add(top, new THREE.CylinderGeometry(0.04, 0.04, 1.6, 6), mat, Math.cos(a) * 0.5, 0.8, Math.sin(a) * 0.5);
      add(top, new THREE.SphereGeometry(0.16, 10, 8), mat, Math.cos(a) * 0.5, 1.7, Math.sin(a) * 0.5);
    }
    add(top, new THREE.TorusGeometry(0.55, 0.05, 6, 24), GOLD, 0, 1.9, 0, { rx: Math.PI / 2 });
  } else if (theme === 'mic93') {
    mic(0, 2.2);
  } else if (theme === 'mountain') {
    add(top, new THREE.ConeGeometry(0.9, 1.8, 5), mat, 0, 0.9, 0);
    add(top, new THREE.ConeGeometry(0.42, 0.7, 5), M('#ffffff'), 0, 1.5, 0);
    add(top, new THREE.BoxGeometry(1.4, 0.06, 0.3), M('#ff3355'), 0.4, 1.95, 0.3, { rz: 0.4 });
  } else if (theme === 'topline') {
    add(top, new THREE.SphereGeometry(0.42, 16, 12), mat, -0.2, 0.42, 0).scale.set(1.25, 0.9, 1);
    add(top, new THREE.CylinderGeometry(0.07, 0.07, 1.9, 8), mat, 0.25, 1.35, 0);
    add(top, new THREE.BoxGeometry(0.6, 0.2, 0.08), mat, 0.5, 2.2, 0, { rz: -0.4 });
    add(top, new THREE.TorusGeometry(0.55, 0.07, 8, 20, Math.PI), mat, 0, 2.6, 0);
  } else if (theme === 'kitchen') {
    add(top, new THREE.CylinderGeometry(0.75, 0.65, 0.35, 20), mat, 0, 0.2, 0);
    add(top, new THREE.BoxGeometry(1.2, 0.08, 0.16), mat, 1.1, 0.3, 0);
    add(top, new THREE.CylinderGeometry(0.42, 0.45, 0.7, 16), M('#ffffff'), 0, 0.85, 0);
    for (let i = 0; i < 5; i++) add(top, new THREE.SphereGeometry(0.28, 10, 8), M('#ffffff'), Math.cos(i) * 0.3, 1.35, Math.sin(i) * 0.3);
  } else if (theme === 'ruin') {
    add(top, new THREE.CylinderGeometry(0.3, 0.35, 1.2, 10), mat, 0, 0.6, 0);
    add(top, new THREE.CylinderGeometry(0.3, 0.3, 0.8, 10), mat, 0.8, 0.2, 0.3, { rz: Math.PI / 2 });
    add(top, new THREE.BoxGeometry(0.4, 0.3, 0.3), mat, -0.6, 0.15, 0.4, { ry: 0.6 });
  } else if (theme === 'claude') {
    // Le symbole de Claude : une étoile à rayons arrondis
    const star = new THREE.Group();
    const terracotta = M('#d97757', { roughness: 0.45, metalness: 0.15, emissive: '#d97757', emissiveIntensity: 0.25 });
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const len = i % 2 ? 0.9 : 1.2;
      const ray = add(star, new THREE.CapsuleGeometry(0.13, len, 4, 8), terracotta, Math.cos(a) * len * 0.55, Math.sin(a) * len * 0.55, 0, { rz: a - Math.PI / 2 });
      ray.userData.ray = true;
    }
    add(star, new THREE.SphereGeometry(0.32, 16, 12), terracotta, 0, 0, 0);
    star.position.y = 1.9;
    top.add(star);
    top.userData.star = star;
  } else {
    add(top, new THREE.OctahedronGeometry(0.7), GOLD, 0, 1, 0);
  }
  if (plaque) {
    const tex = textTexture(plaque, { w: 512, h: 128, bg: '#2a2116', fg: '#ffd76b', font: 'bold 54px Inter Variable, sans-serif' });
    add(g, new THREE.PlaneGeometry(1.4, 0.35), new THREE.MeshStandardMaterial({ map: tex, emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: 0.4 }), 0, 0.65, 0.81, { shadow: false });
  }
  g.scale.setScalar(scale);
  g.userData.anim = (dt, t) => {
    top.traverse((o) => {
      if (o.userData.flag) o.rotation.y = Math.sin(t * 2.5) * 0.4;
    });
    if (top.userData.star) top.userData.star.rotation.z += dt * 0.4;
  };
  return g;
}

// Immeuble d'un projet (événement ou TRS Radio), avec ses documents dedans et sa statue devant.
const THEME_COLORS = { cat: '#c8102e', festival: '#ffb020', cypher: '#9b7bff', mic93: '#33c6ff', mountain: '#4f8bff', topline: '#ffcf4a', kitchen: '#2fd17a', ruin: '#55555c', star: '#ff6bd5' };
export function buildProjectTower(color, sub) {
  const g = new THREE.Group();
  const c = THEME_COLORS[sub?.theme] || color || '#ffb020';
  const ruin = sub?.theme === 'ruin';
  const floors = Math.max(2, Math.min(7, 2 + Math.ceil(Math.log2(1 + (sub?.items?.length || 0)) * 1.4)));
  const h = floors * 1.9;
  box(g, 11, 0.25, 11, STONE_DARK, 0, 0, 0);
  const wall = M(ruin ? '#4a4a50' : '#1a1a24', { roughness: 0.5, metalness: 0.3, emissive: c, emissiveIntensity: ruin ? 0 : 0.06 });
  const body = box(g, 6, h, 5.5, wall, 0, 0.25, -1.8);
  if (!ruin) {
    for (let f = 0; f < floors; f++) add(g, new THREE.BoxGeometry(5.2, 0.8, 0.06), glass, 0, 1.3 + f * 1.9, 0.98, { shadow: false });
    box(g, 6.3, 0.35, 5.8, M(c, { emissive: c, emissiveIntensity: 0.5 }), 0, h + 0.25, -1.8);
  } else {
    for (let i = 0; i < 6; i++) box(g, 0.8, 0.5, 0.6, M('#3a3a40'), -2 + Math.random() * 4, 0.25, 1.4 + Math.random() * 1.5, { ry: Math.random() * 3 });
  }
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(6, h, 5.5)), new THREE.LineBasicMaterial({ color: ruin ? '#55555c' : c, transparent: true, opacity: 0.8 }));
  edges.position.set(0, 0.25 + h / 2, -1.8);
  g.add(edges);
  const title = String(sub?.name || '').replace(/\s*\(.*\)\s*/g, '').toUpperCase().slice(0, 22);
  sign(g, title, 5.6, 0.8, 0, h - 0.3, 1.0, { bg: '#111', fg: ruin ? '#99999f' : c, emissive: ruin ? 0.3 : 1 });
  box(g, 1.4, 2.2, 0.12, DARK, -1.8, 0.25, 1);
  const statue = buildStatue(sub?.theme || 'star', { scale: 1.1 });
  statue.position.set(2.6, 0.25, 3);
  statue.rotation.y = -0.4;
  g.add(statue);
  return { group: g, pick: [body], h: h + 2, anim: statue.userData.anim };
}

// ---------- Place des festivals : petite fontaine et deux statues (RedCat et Afev'tival) ----------
export function buildEventPlaza() {
  const g = new THREE.Group();
  const pave = add(g, new THREE.CylinderGeometry(7, 7.2, 0.3, 40), M('#cfc6b6', { roughness: 0.85 }), 0, 0.15, 0);
  add(g, new THREE.CylinderGeometry(2.4, 2.6, 0.7, 32), STONE, 0, 0.6, 0);
  const water = add(g, new THREE.CylinderGeometry(2.15, 2.15, 0.05, 32), M('#2a7fd4', { emissive: '#2a7fff', emissiveIntensity: 0.3, roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.85 }), 0, 0.9, 0, { shadow: false });
  add(g, new THREE.CylinderGeometry(0.25, 0.35, 1.4, 12), STONE, 0, 1.4, 0);
  const drops = makeDroplets(70, 0.9, 2.1, 1.6);
  drops.group.position.y = 2;
  g.add(drops.group);
  const cat = buildStatue('cat', { scale: 0.8, plaque: 'REDCAT' });
  cat.position.set(-3.6, 0.3, 1.8);
  cat.rotation.y = 0.5;
  const fest = buildStatue('festival', { scale: 0.8, plaque: 'AFEV’TIVAL' });
  fest.position.set(3.6, 0.3, 1.8);
  fest.rotation.y = -0.5;
  g.add(cat, fest);
  for (const a of [0.9, 2.2, 4, 5.3]) {
    const b = new THREE.Group();
    add(b, new THREE.BoxGeometry(1.6, 0.1, 0.5), M('#7a5232'), 0, 0.5, 0);
    add(b, new THREE.BoxGeometry(1.4, 0.45, 0.4), M('#333'), 0, 0.22, 0).scale.set(1, 1, 0.2);
    b.position.set(Math.cos(a) * 5.4, 0.3, Math.sin(a) * 5.4);
    b.rotation.y = -a + Math.PI / 2;
    g.add(b);
  }
  return {
    group: g,
    pick: [pave],
    h: 5,
    anim: (dt, t) => {
      drops.update(dt);
      cat.userData.anim(dt, t);
      fest.userData.anim(dt, t);
      water.material.emissiveIntensity = 0.25 + Math.sin(t * 2) * 0.08;
    },
  };
}

// Gouttes d'eau en jets paraboliques (fontaines).
// Par défaut : gerbe en parapluie ; { fall } : rideau qui retombe d'une vasque ; { arc } : jet en arc dans l'axe +x.
export function makeDroplets(n, speed, spread, height, { fall = false, arc = false } = {}) {
  const geo = new THREE.SphereGeometry(0.07, 6, 4);
  const mat = new THREE.MeshBasicMaterial({ color: '#cfe9ff', transparent: true, opacity: 0.8, depthWrite: false });
  const mesh = new THREE.InstancedMesh(geo, mat, n);
  mesh.castShadow = false;
  const parts = Array.from({ length: n }, (_, i) => ({ t: (i / n) * 1.2, a: Math.random() * Math.PI * 2, s: 0.75 + Math.random() * 0.5 }));
  const m4 = new THREE.Matrix4();
  const group = new THREE.Group();
  group.add(mesh);
  const update = (dt) => {
    for (let i = 0; i < n; i++) {
      const p = parts[i];
      p.t += dt * speed;
      if (p.t > ((fall || arc) ? 1 : 1.2)) {
        p.t = 0;
        p.a = Math.random() * Math.PI * 2;
        p.s = 0.75 + Math.random() * 0.5;
      }
      const t = Math.min(1, p.t);
      if (fall) {
        const r = spread * (1 + t * 0.12);
        m4.makeTranslation(Math.cos(p.a) * r, -height * t * t, Math.sin(p.a) * r);
      } else if (arc) {
        const j = (p.s - 1) * 0.6;
        m4.makeTranslation(t * spread * (1 + j * 0.2), height * 4 * t * (1 - t), Math.sin(p.a) * 0.12);
      } else {
        const r = p.t * spread * p.s;
        const y = height * (4 * p.t * (1 - p.t)) * p.s;
        m4.makeTranslation(Math.cos(p.a) * r, y - (p.t > 1 ? (p.t - 1) * 2 : 0), Math.sin(p.a) * r);
      }
      mesh.setMatrixAt(i, m4);
    }
    mesh.instanceMatrix.needsUpdate = true;
  };
  update(0);
  return { group, update };
}

export const LANDMARK_BUILDERS2 = { library: buildBrain, university: buildUniversity, social: buildSocial, beatmakers: buildBeatmakers, gapple: buildGapple, artist: buildArtistHome, venue: buildVenue, project: buildProjectTower, eventplaza: buildEventPlaza };
export const LANDMARK_SIZE2 = { university: [20, 15], social: [12, 11], beatmakers: [14, 12], gapple: [13, 13], artist: [9, 9], venue: [12, 11], project: [12, 12], eventplaza: [16, 15] };
export const LANDMARK_ICON2 = { library: '🧠', university: '🎓', social: '📣', beatmakers: '🍓', gapple: '🍏', artist: '🏡', venue: '🎪', project: '🏢', eventplaza: '⛲' };
