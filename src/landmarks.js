// Bâtiments emblématiques de la ville (géométrie simple, style "maquette" néon).
// Chaque fabrique renvoie { group, pick: [meshes cliquables], anim?(dt, t) , extras }.
import * as THREE from 'three';

const M = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.1, ...o });
const STONE = M('#e9e1d2', { roughness: 0.8 });
const STONE_DARK = M('#b9ae9c', { roughness: 0.85 });
const GOLD = M('#ffcf4a', { metalness: 0.85, roughness: 0.25, emissive: '#7a5200', emissiveIntensity: 0.4 });
const DARK = M('#17171f', { roughness: 0.45, metalness: 0.3 });

function add(g, geo, mat, x = 0, y = 0, z = 0, opts = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  if (opts.ry) m.rotation.y = opts.ry;
  if (opts.rx) m.rotation.x = opts.rx;
  if (opts.rz) m.rotation.z = opts.rz;
  m.castShadow = opts.shadow !== false;
  m.receiveShadow = true;
  g.add(m);
  return m;
}
const box = (g, w, h, d, mat, x, y, z, o) => add(g, new THREE.BoxGeometry(w, h, d), mat, x, y + h / 2, z, o);

export function textTexture(lines, { w = 512, h = 256, bg = '#111', fg = '#fff', font = 'bold 64px Inter Variable, Segoe UI, sans-serif', accent } = {}) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  if (accent) {
    g.fillStyle = accent;
    g.fillRect(0, h - 10, w, 10);
  }
  g.fillStyle = fg;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const arr = Array.isArray(lines) ? lines : [lines];
  arr.forEach((l, i) => {
    g.font = i === 0 ? font : font.replace(/\d+px/, (m) => `${Math.round(parseInt(m, 10) * 0.55)}px`);
    g.fillText(l, w / 2, (h / (arr.length + 1)) * (i + 1));
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function prism(w, h, d) {
  // Fronton triangulaire (base w, hauteur h, profondeur d)
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0);
  s.lineTo(w / 2, 0);
  s.lineTo(0, h);
  s.closePath();
  const geo = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false });
  geo.translate(0, 0, -d / 2);
  return geo;
}

function sign(g, text, w, h, x, y, z, { bg = '#111', fg = '#fff', accent, emissive = 0.9, ry = 0 } = {}) {
  const tex = textTexture(text, { bg, fg, accent, w: 512, h: Math.round((512 * h) / w) });
  const mat = new THREE.MeshStandardMaterial({ map: tex, emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: emissive });
  return add(g, new THREE.PlaneGeometry(w, h), mat, x, y, z, { ry, shadow: false });
}

// Matériaux "vitres" dont l'éclairage suit le jour / la nuit (piloté par la ville).
export const glass = M('#2a2f45', { emissive: '#ffcf8a', emissiveIntensity: 1.2, roughness: 0.2 });
const windows = (g, n, w, h, y, z, spacing, x0 = 0) => {
  for (let i = 0; i < n; i++) add(g, new THREE.BoxGeometry(w, h, 0.1), glass, x0 + (i - (n - 1) / 2) * spacing, y, z, { shadow: false });
};

export function buildBank() {
  const g = new THREE.Group();
  box(g, 12, 0.4, 10, STONE_DARK, 0, 0, 0);
  box(g, 11, 0.4, 9, STONE_DARK, 0, 0.4, 0);
  const body = box(g, 9.5, 5, 6.5, STONE, 0, 0.8, -0.6);
  for (let i = 0; i < 6; i++) add(g, new THREE.CylinderGeometry(0.32, 0.36, 4.6, 14), STONE, -3.9 + i * 1.56, 3.1, 3.2);
  box(g, 10.4, 0.5, 2.2, STONE, 0, 5.4, 3.1);
  const ped = add(g, prism(10.6, 1.8, 8.6), STONE, 0, 5.8, -0.2);
  add(g, new THREE.CylinderGeometry(0.75, 0.75, 0.15, 32), GOLD, 0, 6.5, 4.2, { rx: Math.PI / 2 });
  // Pièces d'or empilées
  for (let s = 0; s < 3; s++) for (let i = 0; i < 4 + s; i++) add(g, new THREE.CylinderGeometry(0.42, 0.42, 0.16, 18), GOLD, 4.6 + s * 0.9, 0.9 + i * 0.17, 4.2);
  box(g, 1.6, 2.6, 0.2, DARK, 0, 0.8, 2.66);
  windows(g, 3, 1, 1.6, 3.3, 2.66, 2.6);
  sign(g, 'BANQUE', 4.2, 0.9, 0, 6.05, 4.36, { bg: '#1e3a2a', fg: '#ffd76b', emissive: 0.6 });
  return { group: g, pick: [body, ped], h: 8 };
}

export function buildMairie() {
  const g = new THREE.Group();
  box(g, 17, 0.4, 11, STONE_DARK, 0, 0, 0);
  const body = box(g, 15, 5.5, 8, STONE, 0, 0.4, -0.5);
  box(g, 15.6, 0.6, 8.6, M('#5d6b86'), 0, 5.9, -0.5);
  const tower = box(g, 3.4, 4.2, 3.4, STONE, 0, 6.5, -0.5);
  add(g, new THREE.SphereGeometry(1.9, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), M('#5d6b86', { metalness: 0.4 }), 0, 10.7, -0.5);
  // Horloge
  add(g, new THREE.CircleGeometry(1.1, 32), M('#ffffff', { emissive: '#fff4d6', emissiveIntensity: 0.5 }), 0, 8.6, 1.22, { shadow: false });
  const hand1 = add(g, new THREE.BoxGeometry(0.08, 0.8, 0.02), DARK, 0, 8.9, 1.25, { shadow: false });
  const hand2 = add(g, new THREE.BoxGeometry(0.06, 0.55, 0.02), DARK, 0.2, 8.6, 1.25, { rz: -1.2, shadow: false });
  // Drapeau tricolore
  add(g, new THREE.CylinderGeometry(0.05, 0.05, 3, 8), DARK, 0, 12.9, -0.5);
  ['#1f3fbf', '#ffffff', '#e1242b'].forEach((c, i) => add(g, new THREE.PlaneGeometry(0.5, 0.9), M(c, { side: THREE.DoubleSide }), 0.28 + i * 0.5, 13.9, -0.5, { shadow: false }));
  for (let i = 0; i < 4; i++) add(g, new THREE.CylinderGeometry(0.3, 0.3, 4.4, 12), STONE, -2.1 + i * 1.4, 2.6, 3.7);
  box(g, 6.4, 0.5, 1.4, STONE, 0, 4.8, 3.6);
  box(g, 1.6, 2.8, 0.2, DARK, 0, 0.4, 3.52);
  windows(g, 4, 1, 1.5, 2.2, 3.52, 2.6, 0);
  windows(g, 5, 1, 1.4, 4.4, 3.52, 2.6, 0);
  sign(g, 'MAIRIE', 3.6, 0.8, 0, 5.05, 4.32, { bg: '#1f3fbf', fg: '#fff', emissive: 0.6 });
  return {
    group: g,
    pick: [body, tower],
    h: 14,
    anim: (dt, t) => {
      hand1.rotation.z = -t * 0.02;
      hand2.rotation.z = -1.2 - t * 0.0017;
    },
  };
}

export function buildStudio() {
  const g = new THREE.Group();
  const body = box(g, 13, 6, 10, M('#121218', { roughness: 0.35, metalness: 0.4 }), 0, 0, 0);
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(13, 6, 10)), new THREE.LineBasicMaterial({ color: '#ff2d55' }));
  edges.position.y = 3;
  g.add(edges);
  box(g, 13.2, 0.25, 0.25, M('#ff2d55', { emissive: '#ff2d55', emissiveIntensity: 2 }), 0, 4.6, 5.05, { shadow: false });
  const onAir = sign(g, 'ON AIR', 3.6, 1.2, 0, 4.0, 5.1, { bg: '#2a0008', fg: '#ff3355', emissive: 1.6 });
  sign(g, ['STUDIO', 'd’enregistrement'], 5, 1.6, 0, 2.2, 5.08, { bg: '#0d0d12', fg: '#fff', accent: '#ff2d55', emissive: 0.7 });
  box(g, 1.4, 2.2, 0.15, M('#ff2d55', { emissive: '#ff2d55', emissiveIntensity: 0.6 }), -4.6, 0, 5.05);
  // Disque d'or géant sur le toit
  const disc = new THREE.Group();
  add(disc, new THREE.CylinderGeometry(3.2, 3.2, 0.18, 48), GOLD, 0, 0, 0);
  add(disc, new THREE.CylinderGeometry(1, 1, 0.2, 32), M('#ff2d55', { emissive: '#ff2d55', emissiveIntensity: 0.4 }), 0, 0.01, 0);
  disc.position.set(0, 7.6, 0);
  disc.rotation.x = -0.35;
  g.add(disc);
  add(g, new THREE.CylinderGeometry(0.12, 0.12, 1.6, 8), DARK, 0, 6.6, 0);
  return {
    group: g,
    pick: [body],
    h: 10,
    anim: (dt, t) => {
      disc.rotation.y += dt * 0.8;
      onAir.material.emissiveIntensity = 1.2 + Math.sin(t * 3) * 0.5;
    },
  };
}

export function buildShop() {
  const g = new THREE.Group();
  const body = box(g, 9, 4.6, 7, M('#f2c9a0'), 0, 0, 0);
  box(g, 9.4, 0.4, 7.4, M('#7a3b2e'), 0, 4.6, 0);
  // Auvent rayé
  for (let i = 0; i < 9; i++) add(g, new THREE.BoxGeometry(1, 0.1, 1.8), M(i % 2 ? '#ffffff' : '#e1242b'), -4 + i, 3.55, 4.2, { rx: 0.45 });
  add(g, new THREE.BoxGeometry(5.8, 2.2, 0.12), glass, -1.2, 1.5, 3.52, { shadow: false });
  box(g, 1.4, 2.6, 0.15, M('#7a3b2e'), 3, 0, 3.55);
  sign(g, 'MAGASIN DE MUSIQUE', 6.5, 0.8, 0, 4.15, 3.6, { bg: '#7a3b2e', fg: '#ffe3b5', emissive: 0.6 });
  // Guitare-enseigne
  const guitar = new THREE.Group();
  add(guitar, new THREE.SphereGeometry(0.8, 18, 12), M('#e36b1a'), 0, 0, 0).scale.set(1, 1, 0.3);
  add(guitar, new THREE.SphereGeometry(0.6, 18, 12), M('#e36b1a'), 0, 0.95, 0).scale.set(1, 1, 0.3);
  add(guitar, new THREE.BoxGeometry(0.22, 2.2, 0.15), M('#3b2416'), 0, 2.2, 0);
  guitar.position.set(3.8, 6.2, 2.2);
  guitar.rotation.z = -0.3;
  g.add(guitar);
  return { group: g, pick: [body], h: 8.5 };
}

export function buildHall() {
  const g = new THREE.Group();
  const body = box(g, 18, 8, 11, M('#2a0f18', { roughness: 0.5 }), 0, 0, 0);
  box(g, 18.4, 0.6, 11.4, M('#ff2d55', { emissive: '#ff2d55', emissiveIntensity: 0.5 }), 0, 8, 0);
  // Marquise lumineuse
  box(g, 12, 2, 1.6, DARK, 0, 4.6, 6.2);
  const marquee = sign(g, 'SALLE DE CONCERT', 11.4, 1.6, 0, 5.6, 7.02, { bg: '#16060b', fg: '#ffd76b', emissive: 1.2 });
  const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.13, 8, 6), M('#ffd76b', { emissive: '#ffb020', emissiveIntensity: 2 }), 36);
  const mtx = new THREE.Matrix4();
  for (let i = 0; i < 36; i++) {
    const top = i < 18;
    mtx.makeTranslation(-5.8 + (i % 18) * 0.68, top ? 6.65 : 4.55, 7.05);
    bulbs.setMatrixAt(i, mtx);
  }
  g.add(bulbs);
  box(g, 4, 3.6, 0.2, DARK, 0, 0, 5.52);
  // Emplacements d'affiches sur la façade (remplis par la ville)
  const posters = [];
  for (let i = 0; i < 4; i++) {
    const m = add(g, new THREE.PlaneGeometry(2, 2.8), new THREE.MeshStandardMaterial({ color: '#333' }), i < 2 ? -7.4 + i * 2.3 : 5.1 + (i - 2) * 2.3, 1.9, 5.53, { shadow: false });
    posters.push(m);
  }
  // Faisceaux de projecteurs (visibles la nuit)
  const beamMat = new THREE.MeshBasicMaterial({ color: '#ff6bd5', transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide });
  const beams = [-5, 5].map((x) => {
    const b = new THREE.Mesh(new THREE.ConeGeometry(2.4, 22, 20, 1, true), beamMat);
    b.position.set(x, 19.5, 0);
    b.rotation.x = Math.PI;
    g.add(b);
    return b;
  });
  return {
    group: g,
    pick: [body],
    h: 10,
    posters,
    beamMat,
    anim: (dt, t) => {
      beams[0].rotation.z = Math.PI + Math.sin(t * 0.7) * 0.35;
      beams[1].rotation.z = Math.PI + Math.sin(t * 0.7 + 2) * 0.35;
      marquee.material.emissiveIntensity = 1 + Math.sin(t * 4) * 0.2;
    },
  };
}

export function posterTexture(title, sub, color, past) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 358;
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 256, 358);
  grd.addColorStop(0, past ? '#3b3b44' : color);
  grd.addColorStop(1, past ? '#1b1b22' : '#15060c');
  g.fillStyle = grd;
  g.fillRect(0, 0, 256, 358);
  g.fillStyle = 'rgba(255,255,255,0.9)';
  g.font = 'bold 30px Inter Variable, Segoe UI, sans-serif';
  g.textAlign = 'center';
  const words = title.toUpperCase().split(/\s+/);
  let line = '';
  let y = 120;
  for (const w of words) {
    if (g.measureText(`${line} ${w}`).width > 220 && line) {
      g.fillText(line, 128, y);
      line = w;
      y += 36;
    } else line = line ? `${line} ${w}` : w;
  }
  g.fillText(line, 128, y);
  g.font = '20px Inter Variable, Segoe UI, sans-serif';
  g.fillStyle = past ? '#aaa' : '#ffd76b';
  g.fillText(sub || '', 128, 320);
  if (past) {
    g.save();
    g.translate(128, 200);
    g.rotate(-0.35);
    g.strokeStyle = '#ff3355';
    g.lineWidth = 6;
    g.strokeRect(-90, -24, 180, 48);
    g.fillStyle = '#ff3355';
    g.font = 'bold 26px Inter Variable, sans-serif';
    g.fillText('TERMINÉ', 0, 9);
    g.restore();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildLibrary() {
  const g = new THREE.Group();
  add(g, new THREE.CylinderGeometry(9, 9.5, 0.6, 48), STONE_DARK, 0, 0.6, 0);
  add(g, new THREE.CylinderGeometry(8.4, 8.6, 0.5, 48), STONE_DARK, 0, 1.1, 0);
  const body = add(g, new THREE.CylinderGeometry(6.2, 6.2, 6.5, 32), STONE, 0, 4.6, 0);
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    add(g, new THREE.CylinderGeometry(0.3, 0.34, 6.2, 12), STONE, Math.cos(a) * 7.4, 4.45, Math.sin(a) * 7.4);
  }
  add(g, new THREE.CylinderGeometry(8, 8, 0.6, 48), STONE, 0, 7.85, 0);
  const dome = add(g, new THREE.SphereGeometry(6.4, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2), M('#b5384b', { metalness: 0.5, roughness: 0.35 }), 0, 8.1, 0);
  add(g, new THREE.CylinderGeometry(0.9, 0.9, 1.8, 16), STONE, 0, 15.2, 0);
  const lantern = add(g, new THREE.SphereGeometry(0.7, 16, 12), M('#ff2d55', { emissive: '#ff2d55', emissiveIntensity: 2 }), 0, 16.5, 0);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(6.6, 0.07, 6, 96), new THREE.MeshBasicMaterial({ color: '#ff2d55' }));
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 8.2;
  g.add(ring);
  // Porte + enseigne
  box(g, 2, 3, 0.3, DARK, 0, 1.35, 6.15);
  sign(g, 'BIBLIOTHÈQUE', 4.6, 0.8, 0, 6.9, 7.75, { bg: '#2a0a12', fg: '#ffd7a0', emissive: 0.8 });
  // Livres volants autour du dôme
  const books = new THREE.Group();
  ['#ff3355', '#33c6ff', '#ffb020', '#9b7bff', '#2fd17a', '#ff6bd5'].forEach((c, i) => {
    const b = add(books, new THREE.BoxGeometry(0.9, 1.2, 0.25), M(c, { emissive: c, emissiveIntensity: 0.5 }), Math.cos(i) * 9, 0, Math.sin(i) * 9, { shadow: false });
    b.userData.a = (i / 6) * Math.PI * 2;
  });
  books.position.y = 12;
  g.add(books);
  return {
    group: g,
    pick: [body, dome],
    h: 17,
    anim: (dt, t) => {
      books.children.forEach((b, i) => {
        const a = b.userData.a + t * 0.25;
        b.position.set(Math.cos(a) * 9, Math.sin(t * 1.3 + i) * 0.6, Math.sin(a) * 9);
        b.rotation.y = -a;
      });
      lantern.material.emissiveIntensity = 1.6 + Math.sin(t * 2) * 0.6;
    },
  };
}

export function buildSchool() {
  const g = new THREE.Group();
  const body = box(g, 12, 5, 6.5, M('#e08a5a'), 0, 0, -4.5);
  const roof = add(g, prism(13, 2.6, 7.4), M('#8a3b2e'), 0, 5, -4.5);
  box(g, 1.6, 1.8, 1.6, M('#f3e7d4'), 0, 6.4, -4.5);
  add(g, new THREE.ConeGeometry(1.3, 1.4, 4), M('#8a3b2e'), 0, 8.9, -4.5, { ry: Math.PI / 4 });
  add(g, new THREE.SphereGeometry(0.35, 12, 8), GOLD, 0, 7.4, -3.7);
  windows(g, 4, 1.4, 1.4, 2.8, -1.2, 2.6);
  box(g, 1.6, 2.6, 0.15, M('#5b3a2a'), 0, 0, -1.2);
  sign(g, 'ÉCOLE', 3, 0.8, 0, 4.4, -1.15, { bg: '#f3e7d4', fg: '#8a3b2e', emissive: 0.35 });
  // Cour avec clôture
  const yard = add(g, new THREE.BoxGeometry(17, 0.12, 9), M('#c9b28f', { roughness: 0.95 }), 0, 0.06, 4.2, { shadow: false });
  const posts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.12, 0.9, 0.12), M('#f3e7d4'), 40);
  const mtx = new THREE.Matrix4();
  for (let i = 0; i < 40; i++) {
    let x;
    let z;
    if (i < 16) [x, z] = [-8.5 + i * (17 / 15), 8.7];
    else if (i < 28) [x, z] = [-8.5, -0.3 + (i - 16) * 0.75];
    else [x, z] = [8.5, -0.3 + (i - 28) * 0.75];
    mtx.makeTranslation(x, 0.45, z);
    posts.setMatrixAt(i, mtx);
  }
  g.add(posts);
  // Marelle
  for (let i = 0; i < 5; i++) add(g, new THREE.PlaneGeometry(0.8, 0.8), new THREE.MeshBasicMaterial({ color: ['#ff3355', '#33c6ff', '#ffb020', '#2fd17a', '#9b7bff'][i] }), -5, 0.14, 1.5 + i * 0.9, { rx: -Math.PI / 2, shadow: false });
  return { group: g, pick: [body, roof, yard], h: 10, yard: { x: 0, z: 4.4, w: 15, d: 7.5 } };
}

export function buildBellTower() {
  const g = new THREE.Group();
  box(g, 5, 0.5, 5, STONE_DARK, 0, 0, 0);
  const body = box(g, 4, 9, 4, STONE, 0, 0.5, 0);
  // Beffroi ouvert : 4 piliers
  for (const [x, z] of [[-1.7, -1.7], [1.7, -1.7], [-1.7, 1.7], [1.7, 1.7]]) box(g, 0.6, 3, 0.6, STONE, x, 9.5, z);
  box(g, 4.4, 0.5, 4.4, STONE, 0, 12.5, 0);
  add(g, new THREE.ConeGeometry(3.2, 5, 4), M('#5d6b86', { metalness: 0.4 }), 0, 15.5, 0, { ry: Math.PI / 4 });
  add(g, new THREE.SphereGeometry(0.3, 12, 8), GOLD, 0, 18.2, 0);
  // Horloges
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2;
    add(g, new THREE.CircleGeometry(1.2, 32), M('#ffffff', { emissive: '#fff4d6', emissiveIntensity: 0.5 }), Math.sin(a) * 2.02, 7.6, Math.cos(a) * 2.02, { ry: a, shadow: false });
  }
  // Cloche
  const bellPivot = new THREE.Group();
  bellPivot.position.set(0, 12.2, 0);
  const pts = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    pts.push(new THREE.Vector2(0.3 + Math.pow(t, 2.2) * 1.1, -t * 2));
  }
  const bellMat = M('#d9a441', { metalness: 0.9, roughness: 0.3, emissive: '#000000' });
  const bell = add(bellPivot, new THREE.LatheGeometry(pts, 24), bellMat, 0, 0, 0);
  bell.material.side = THREE.DoubleSide;
  g.add(bellPivot);
  let alert = 0;
  return {
    group: g,
    pick: [body, bell],
    h: 19,
    setAlert: (lvl) => {
      alert = lvl;
      bellMat.emissive.set(lvl === 2 ? '#ff2d55' : lvl === 1 ? '#ffb020' : '#000000');
    },
    anim: (dt, t) => {
      bellPivot.rotation.z = alert ? Math.sin(t * (alert === 2 ? 6 : 3)) * 0.45 : Math.sin(t * 0.6) * 0.04;
      bellMat.emissiveIntensity = alert ? 0.6 + Math.sin(t * 6) * 0.4 : 0;
    },
  };
}

const DAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
export function scheduleTexture(entries) {
  const c = document.createElement('canvas');
  c.width = 700;
  c.height = 400;
  const g = c.getContext('2d');
  g.fillStyle = '#16301f';
  g.fillRect(0, 0, 700, 400);
  g.strokeStyle = '#8a6a3a';
  g.lineWidth = 16;
  g.strokeRect(0, 0, 700, 400);
  g.fillStyle = '#e8f0e0';
  g.font = 'bold 30px Inter Variable, Segoe UI, sans-serif';
  g.textAlign = 'center';
  g.fillText('EMPLOI DU TEMPS', 350, 48);
  const colW = 660 / 7;
  const today = (new Date().getDay() + 6) % 7;
  DAYS.forEach((d, i) => {
    const x = 20 + i * colW;
    if (i === today) {
      g.fillStyle = 'rgba(255,215,107,0.18)';
      g.fillRect(x, 66, colW - 4, 316);
    }
    g.fillStyle = i === today ? '#ffd76b' : '#cfe0c8';
    g.font = 'bold 20px Inter Variable, Segoe UI, sans-serif';
    g.fillText(d, x + colW / 2, 90);
    const list = entries.filter((e) => Number(e.day) === i).sort((a, b) => (a.start || '').localeCompare(b.start || ''));
    g.font = '15px Inter Variable, Segoe UI, sans-serif';
    list.slice(0, 6).forEach((e, k) => {
      g.fillStyle = '#ffffff';
      g.fillText((e.start || '').slice(0, 5), x + colW / 2, 122 + k * 44);
      g.fillStyle = '#cfe0c8';
      g.fillText((e.title || '').slice(0, 11), x + colW / 2, 140 + k * 44);
    });
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildBoard() {
  const g = new THREE.Group();
  box(g, 0.2, 3, 0.2, M('#6b4a2a'), -2.6, 0, 0);
  box(g, 0.2, 3, 0.2, M('#6b4a2a'), 2.6, 0, 0);
  const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#ffffff', emissiveIntensity: 0.35 });
  const panel = add(g, new THREE.BoxGeometry(6, 3.4, 0.15), mat, 0, 3.6, 0);
  return {
    group: g,
    pick: [panel],
    h: 6,
    setSchedule: (entries) => {
      mat.map?.dispose();
      mat.map = scheduleTexture(entries);
      mat.emissiveMap = mat.map;
      mat.needsUpdate = true;
    },
  };
}

export const LANDMARK_BUILDERS = { bank: buildBank, mairie: buildMairie, studio: buildStudio, shop: buildShop, hall: buildHall };
export const LANDMARK_SIZE = { bank: [14, 13], mairie: [19, 14], studio: [16, 14], shop: [13, 12], hall: [22, 16] };
export const LANDMARK_ICON = { bank: '🏦', mairie: '🏛️', studio: '🎙️', shop: '🎸', hall: '🎤', school: '🏫', bell: '🔔', board: '🗓️', library: '📚' };
