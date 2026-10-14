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
  const root = new THREE.Group();
  const g = new THREE.Group();
  g.position.z = -3.2;
  root.add(g);
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
  // Parvis + tableau d'affichage des concerts devant la mairie
  const parvis = add(root, new THREE.BoxGeometry(14, 0.12, 6), M('#cfc4ad', { roughness: 0.9 }), 0, 0.06, 5.2, { shadow: false });
  const gigs = buildGigsBoard();
  gigs.group.position.set(0, 0, 5.6);
  root.add(gigs.group);
  return {
    group: root,
    pick: [body, tower, parvis],
    h: 14,
    extras: [{ id: 'lm:gigs', name: 'Concerts à Paris', icon: '🎟️', pick: gigs.pick, pos: new THREE.Vector3(0, 0, 5.6), h: 6.4, api: gigs }],
    anim: (dt, t) => {
      hand1.rotation.z = -t * 0.02;
      hand2.rotation.z = -1.2 - t * 0.0017;
      gigs.anim(dt, t);
    },
  };
}

// Tableau d'affichage des concerts (rap, rock indie, pop) de la semaine à Paris.
export const GENRE_COLORS = { rap: '#ffb020', rock: '#33c6ff', pop: '#ff6bd5' };
export const GENRE_LABELS = { rap: 'Rap', rock: 'Rock indé', pop: 'Pop' };
export function gigsTexture(list) {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 560;
  const g = c.getContext('2d');
  g.fillStyle = '#101018';
  g.fillRect(0, 0, 1024, 560);
  g.strokeStyle = '#ffd76b';
  g.lineWidth = 10;
  g.strokeRect(5, 5, 1014, 550);
  g.fillStyle = '#ffd76b';
  g.font = 'bold 40px Inter Variable, Segoe UI, sans-serif';
  g.textAlign = 'center';
  g.fillText('CONCERTS À PARIS · CETTE SEMAINE', 512, 58);
  g.textAlign = 'left';
  const rows = list.slice(0, 8);
  if (!rows.length) {
    g.fillStyle = '#aaa';
    g.font = '28px Inter Variable, Segoe UI, sans-serif';
    g.fillText('Rien d’affiché pour cette semaine — demande à Claude de mettre à jour.', 40, 280);
  }
  rows.forEach((e, i) => {
    const y = 110 + i * 56;
    const col = GENRE_COLORS[e.genre] || '#9aa0b4';
    g.fillStyle = col;
    g.fillRect(28, y - 30, 12, 42);
    g.font = 'bold 24px Inter Variable, Segoe UI, sans-serif';
    g.fillStyle = col;
    g.fillText((GENRE_LABELS[e.genre] || e.genre || '').toUpperCase(), 52, y - 6);
    g.fillStyle = '#ffffff';
    g.font = '22px Inter Variable, Segoe UI, sans-serif';
    const d = e.date ? new Date(`${e.date}T12:00`).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' }) : '';
    g.fillText(d, 52, y + 18);
    g.font = 'bold 30px Inter Variable, Segoe UI, sans-serif';
    g.fillText(String(e.artist || '').slice(0, 30), 200, y + 4);
    g.font = '22px Inter Variable, Segoe UI, sans-serif';
    g.fillStyle = '#c9c9d6';
    g.fillText(String(e.venue || '').slice(0, 26), 640, y + 4);
    g.fillStyle = '#ffd76b';
    g.textAlign = 'right';
    g.font = 'bold 26px Inter Variable, Segoe UI, sans-serif';
    g.fillText(e.price ? String(e.price).slice(0, 12) : '?', 996, y + 4);
    g.textAlign = 'left';
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildGigsBoard() {
  const g = new THREE.Group();
  const wood = M('#2a2a33', { metalness: 0.5, roughness: 0.4 });
  box(g, 0.25, 6, 0.25, wood, -5.1, 0, 0);
  box(g, 0.25, 6, 0.25, wood, 5.1, 0, 0);
  box(g, 10.8, 0.3, 0.9, M('#1f3fbf'), 0, 6, 0);
  const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#ffffff', emissiveIntensity: 0.55 });
  const panel = add(g, new THREE.BoxGeometry(10, 5.47, 0.16), mat, 0, 3.4, 0);
  const lamp = add(g, new THREE.BoxGeometry(10, 0.12, 0.3), M('#ffd76b', { emissive: '#ffd76b', emissiveIntensity: 1.5 }), 0, 5.9, 0.35, { shadow: false });
  return {
    group: g,
    pick: [panel],
    setGigs: (list) => {
      mat.map?.dispose();
      mat.map = gigsTexture(list);
      mat.emissiveMap = mat.map;
      mat.needsUpdate = true;
    },
    anim: (dt, t) => {
      lamp.material.emissiveIntensity = 1.3 + Math.sin(t * 2) * 0.3;
    },
  };
}

// Tour du RED STUDIO (le dossier racine du Drive), dans le quartier administratif.
export function buildRedStudio() {
  const g = new THREE.Group();
  box(g, 11, 0.5, 11, STONE_DARK, 0, 0, 0);
  const glassMat = M('#0d0d14', { metalness: 0.6, roughness: 0.2, emissive: '#ff2d55', emissiveIntensity: 0.12 });
  const body = box(g, 8, 15, 8, glassMat, 0, 0.5, 0);
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(8, 15, 8)), new THREE.LineBasicMaterial({ color: '#ff2d55' }));
  edges.position.y = 8;
  g.add(edges);
  // Bandes de fenêtres
  for (let y = 2; y < 15; y += 2.2) for (const z of [4.02, -4.02]) add(g, new THREE.BoxGeometry(7, 0.5, 0.05), glass, 0, y, z, { shadow: false });
  const top = box(g, 5.5, 3, 5.5, M('#ff2d55', { emissive: '#ff2d55', emissiveIntensity: 0.5 }), 0, 15.5, 0);
  sign(g, 'THE RED STUDIO', 7.6, 1.3, 0, 13.2, 4.06, { bg: '#16060b', fg: '#ff3355', emissive: 1.4 });
  sign(g, 'TRS', 3.4, 1.6, 0, 17, 2.78, { bg: '#ff2d55', fg: '#ffffff', emissive: 0.8 });
  box(g, 2, 2.8, 0.2, DARK, 0, 0.5, 4.02);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(5, 0.08, 6, 64), new THREE.MeshBasicMaterial({ color: '#ff2d55' }));
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 19.5;
  g.add(ring);
  add(g, new THREE.CylinderGeometry(0.1, 0.1, 3, 8), DARK, 0, 20, 0);
  const beacon = add(g, new THREE.SphereGeometry(0.35, 12, 8), M('#ff2d55', { emissive: '#ff2d55', emissiveIntensity: 2 }), 0, 21.6, 0, { shadow: false });
  return {
    group: g,
    pick: [body, top],
    h: 22,
    anim: (dt, t) => {
      ring.rotation.z += dt * 0.5;
      ring.position.y = 19.5 + Math.sin(t) * 0.3;
      beacon.material.emissiveIntensity = 1.2 + Math.sin(t * 3) * 0.8;
    },
  };
}

// Radio (Spotify) : studio radio vert avec antenne et ondes.
export function buildRadio() {
  const g = new THREE.Group();
  const green = '#1db954';
  const body = box(g, 10, 5.5, 8, M('#101511', { roughness: 0.4, metalness: 0.3 }), 0, 0, 0);
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(10, 5.5, 8)), new THREE.LineBasicMaterial({ color: green }));
  edges.position.y = 2.75;
  g.add(edges);
  box(g, 10.4, 0.4, 8.4, M(green, { emissive: green, emissiveIntensity: 0.6 }), 0, 5.5, 0);
  // Logo : disque vert + 3 ondes
  const logo = new THREE.Group();
  add(logo, new THREE.CircleGeometry(1.5, 40), M(green, { emissive: green, emissiveIntensity: 0.9 }), 0, 0, 0, { shadow: false });
  [0.95, 0.65, 0.38].forEach((r, i) => {
    const arc = new THREE.Mesh(new THREE.TorusGeometry(r, 0.09, 6, 24, Math.PI * 0.62), new THREE.MeshBasicMaterial({ color: '#0b0f0c' }));
    arc.rotation.z = Math.PI * 0.19;
    arc.position.set(0, 0.1 - i * 0.38 + 0.38, 0.02);
    logo.add(arc);
  });
  logo.position.set(-2.6, 3.4, 4.06);
  g.add(logo);
  sign(g, ['RADIO', 'SPOTIFY'], 4.2, 1.8, 1.9, 3.4, 4.06, { bg: '#0b0f0c', fg: green, emissive: 1.1 });
  box(g, 1.4, 2.4, 0.15, M(green, { emissive: green, emissiveIntensity: 0.4 }), 1.9, 0, 4.03);
  const onAir = sign(g, 'ON AIR', 2.2, 0.7, -2.6, 1.3, 4.07, { bg: '#2a0008', fg: '#ff3355', emissive: 1.5 });
  // Antenne + ondes
  const mast = add(g, new THREE.CylinderGeometry(0.08, 0.22, 7, 6), M('#c9ccd6', { metalness: 0.8, roughness: 0.3 }), 2.8, 9.4, -2);
  for (let i = 0; i < 4; i++) add(g, new THREE.BoxGeometry(1.2 - i * 0.22, 0.06, 0.06), DARK, 2.8, 7 + i * 1.4, -2, { shadow: false });
  const tip = add(g, new THREE.SphereGeometry(0.22, 10, 8), M('#ff3355', { emissive: '#ff3355', emissiveIntensity: 2 }), 2.8, 13, -2, { shadow: false });
  const waveMat = new THREE.MeshBasicMaterial({ color: green, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false });
  const waves = [0, 1, 2].map((i) => {
    const w = new THREE.Mesh(new THREE.TorusGeometry(1, 0.05, 6, 40), waveMat.clone());
    w.rotation.x = Math.PI / 2;
    w.position.set(2.8, 13, -2);
    w.userData.phase = i / 3;
    g.add(w);
    return w;
  });
  return {
    group: g,
    pick: [body, mast],
    h: 14,
    anim: (dt, t) => {
      for (const w of waves) {
        const k = (t * 0.45 + w.userData.phase) % 1;
        w.scale.setScalar(0.4 + k * 4.5);
        w.material.opacity = 0.55 * (1 - k);
      }
      tip.material.emissiveIntensity = 1 + Math.sin(t * 5) * 0.8;
      onAir.material.emissiveIntensity = 1.2 + Math.sin(t * 3) * 0.4;
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
  sign(g, ['ÉCOLE', 'formations'], 3.6, 1.1, 0, 4.3, -1.15, { bg: '#f3e7d4', fg: '#8a3b2e', emissive: 0.35 });
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
  // Post-it caché au dos de l'école, derrière un arbre
  const postMat = new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#fff59a', emissiveIntensity: 0.25, side: THREE.DoubleSide });
  const postit = add(g, new THREE.PlaneGeometry(0.55, 0.55), postMat, 4.75, 1.15, -7.8, { ry: Math.PI, rz: 0.12, shadow: false });
  const trunk = add(g, new THREE.CylinderGeometry(0.18, 0.26, 2, 7), M('#4a3326', { roughness: 0.9 }), 4.1, 1, -9.2);
  const crown = add(g, new THREE.IcosahedronGeometry(1.7, 0), M('#1f6b4a', { roughness: 0.8, flatShading: true }), 4.1, 2.9, -9.2);
  crown.scale.set(1, 1.3, 1);
  return {
    group: g,
    pick: [body, roof, yard],
    h: 10,
    yard: { x: 0, z: 4.4, w: 15, d: 7.5 },
    postit,
    trunk,
    setPostit: (code) => {
      const c = document.createElement('canvas');
      c.width = c.height = 128;
      const x = c.getContext('2d');
      x.fillStyle = '#ffe866';
      x.fillRect(0, 0, 128, 128);
      x.fillStyle = 'rgba(0,0,0,0.08)';
      x.fillRect(0, 0, 128, 14);
      x.fillStyle = '#1f2a6b';
      x.font = 'italic 18px Segoe Print, Comic Sans MS, cursive';
      x.textAlign = 'center';
      x.fillText('code :', 64, 46);
      x.font = 'bold 30px Segoe Print, Comic Sans MS, cursive';
      if (code) x.fillText(code, 64, 88);
      else {
        // Flouté tant que la question n'est pas résolue
        x.filter = 'blur(5px)';
        x.fillText('▒▒▒▒▒▒', 64, 88);
        x.filter = 'none';
        x.font = 'bold 13px Inter Variable, sans-serif';
        x.fillStyle = '#c8102e';
        x.fillText('? clique-moi', 64, 118);
      }
      postMat.map?.dispose();
      postMat.map = new THREE.CanvasTexture(c);
      postMat.map.colorSpace = THREE.SRGBColorSpace;
      postMat.emissive.set('#ffffff');
      postMat.emissiveMap = postMat.map;
      postMat.emissiveIntensity = 0.45;
      postMat.needsUpdate = true;
    },
  };
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

// CGT : local syndical pour les actions et les documentaires.
export function buildCGT() {
  const g = new THREE.Group();
  const brick = M('#9c3b2c', { roughness: 0.85 });
  box(g, 13, 0.4, 10, STONE_DARK, 0, 0, 0);
  const body = box(g, 11, 6, 7, brick, 0, 0.4, -0.8);
  box(g, 11.6, 0.5, 7.6, M('#3a1612'), 0, 6.4, -0.8);
  windows(g, 4, 1.1, 1.5, 4.2, 2.72, 2.4);
  box(g, 1.8, 2.8, 0.2, DARK, 0, 0.4, 2.72);
  sign(g, 'CGT', 3.2, 1.3, 0, 5.2, 2.85, { bg: '#e1242b', fg: '#ffffff', emissive: 0.9 });
  sign(g, ['ACTIONS', 'documentaires'], 3, 1.2, -3.6, 2.2, 2.85, { bg: '#1a0a08', fg: '#ffb3a8', emissive: 0.6 });
  // Banderoles et drapeaux rouges
  const flags = [];
  for (const x of [-5.6, 5.6]) {
    add(g, new THREE.CylinderGeometry(0.06, 0.06, 5, 8), DARK, x, 2.9, 4);
    const f = add(g, new THREE.PlaneGeometry(1.6, 1), M('#e1242b', { side: THREE.DoubleSide, emissive: '#7a0000', emissiveIntensity: 0.4 }), x + 0.8, 4.8, 4, { shadow: false });
    flags.push(f);
  }
  add(g, new THREE.PlaneGeometry(7, 0.9), M('#ffffff', { side: THREE.DoubleSide }), 0, 7.4, 2.6, { shadow: false });
  sign(g, 'TOUS ENSEMBLE', 6.8, 0.8, 0, 7.4, 2.62, { bg: '#ffffff', fg: '#e1242b', emissive: 0.3 });
  // Mégaphone sur le toit
  add(g, new THREE.ConeGeometry(0.5, 1.2, 16, 1, true), M('#dddddd', { side: THREE.DoubleSide }), 4, 7.6, 0, { rz: Math.PI / 2 });
  return {
    group: g,
    pick: [body],
    h: 9,
    anim: (dt, t) => flags.forEach((f, i) => (f.rotation.y = Math.sin(t * 2 + i) * 0.35)),
  };
}

// Label : les artistes du studio et leur niveau d'implication.
export function buildLabel() {
  const g = new THREE.Group();
  box(g, 12, 0.4, 10, STONE_DARK, 0, 0, 0);
  const body = box(g, 10, 7, 7, M('#0f0f14', { metalness: 0.5, roughness: 0.3 }), 0, 0.4, -0.8);
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(10, 7, 7)), new THREE.LineBasicMaterial({ color: '#ffcf4a' }));
  edges.position.set(0, 3.9, -0.8);
  g.add(edges);
  // Vinyle géant sur la façade
  const vinyl = new THREE.Group();
  add(vinyl, new THREE.CylinderGeometry(2.4, 2.4, 0.12, 48), M('#111111', { metalness: 0.4, roughness: 0.2 }), 0, 0, 0, { rx: Math.PI / 2 });
  add(vinyl, new THREE.CylinderGeometry(0.9, 0.9, 0.14, 32), GOLD, 0, 0, 0.01, { rx: Math.PI / 2 });
  vinyl.position.set(-1.8, 4.2, 2.8);
  g.add(vinyl);
  sign(g, ['LABEL', 'TRS'], 3.4, 1.8, 2.8, 4.6, 2.76, { bg: '#0f0f14', fg: '#ffcf4a', emissive: 1 });
  box(g, 1.6, 2.6, 0.15, GOLD, 2.8, 0.4, 2.72);
  return { group: g, pick: [body], h: 9, anim: (dt) => (vinyl.rotation.z += dt * 0.6) };
}

// Caserne des pompiers : antivirus et codes de sécurité.
export function buildFireStation() {
  const g = new THREE.Group();
  box(g, 15, 0.4, 11, STONE_DARK, 0, 0, 0);
  const red = M('#c8102e', { roughness: 0.55 });
  const body = box(g, 10, 5.2, 7.5, red, -1.5, 0.4, -0.8);
  box(g, 10.4, 0.5, 7.9, M('#f2f2f2'), -1.5, 5.6, -0.8);
  for (let i = 0; i < 3; i++) {
    box(g, 2.6, 3.4, 0.15, M('#d9d9de', { metalness: 0.5 }), -4.6 + i * 3.1, 0.4, 3);
    for (let k = 0; k < 4; k++) add(g, new THREE.BoxGeometry(2.5, 0.05, 0.05), DARK, -4.6 + i * 3.1, 1.2 + k * 0.75, 3.1, { shadow: false });
  }
  sign(g, 'POMPIERS', 5.4, 0.9, -1.5, 4.5, 3.1, { bg: '#ffffff', fg: '#c8102e', emissive: 0.5 });
  // Tour de séchage + gyrophares
  const tower = box(g, 2.6, 10, 2.6, red, 5, 0.4, -2);
  box(g, 3, 0.4, 3, M('#f2f2f2'), 5, 10.4, -2);
  const sirenBlue = add(g, new THREE.SphereGeometry(0.35, 12, 8), M('#2a5bff', { emissive: '#2a5bff', emissiveIntensity: 2 }), 4.4, 11.2, -2, { shadow: false });
  const sirenRed = add(g, new THREE.SphereGeometry(0.35, 12, 8), M('#ff2d2d', { emissive: '#ff2d2d', emissiveIntensity: 2 }), 5.6, 11.2, -2, { shadow: false });
  // Bouclier "antivirus"
  const shield = new THREE.Shape();
  shield.moveTo(0, 1);
  shield.quadraticCurveTo(0.8, 0.9, 0.9, 0.6);
  shield.quadraticCurveTo(0.9, -0.4, 0, -1);
  shield.quadraticCurveTo(-0.9, -0.4, -0.9, 0.6);
  shield.quadraticCurveTo(-0.8, 0.9, 0, 1);
  add(g, new THREE.ShapeGeometry(shield), M('#2fd17a', { emissive: '#2fd17a', emissiveIntensity: 0.7, side: THREE.DoubleSide }), 5, 7.5, -0.69, { shadow: false });
  // Camion
  const truck = new THREE.Group();
  add(truck, new THREE.BoxGeometry(2, 1.3, 4.2), red, 0, 0.95, 0);
  add(truck, new THREE.BoxGeometry(1.9, 0.9, 1.2), red, 0, 1.95, 1.4);
  add(truck, new THREE.BoxGeometry(0.3, 0.3, 3.6), M('#d9d9de', { metalness: 0.6 }), 0, 1.75, -0.6);
  for (const [x, z] of [[-1, 1.4], [1, 1.4], [-1, -1.4], [1, -1.4]]) add(truck, new THREE.CylinderGeometry(0.4, 0.4, 0.3, 14), DARK, x, 0.4, z, { rz: Math.PI / 2 });
  truck.position.set(-4.6, 0.4, 5.2);
  g.add(truck);
  return {
    group: g,
    pick: [body, tower],
    h: 12,
    anim: (dt, t) => {
      const on = Math.sin(t * 6) > 0;
      sirenBlue.material.emissiveIntensity = on ? 2.5 : 0.2;
      sirenRed.material.emissiveIntensity = on ? 0.2 : 2.5;
    },
  };
}

// Maison d'un pôle : la taille dépend du nombre de personnes (pavillon → gratte-ciel).
export function buildPoleHome(color = '#2fd17a') {
  const g = new THREE.Group();
  const lawn = add(g, new THREE.BoxGeometry(11, 0.15, 11), M('#2d5a3a', { roughness: 0.95 }), 0, 0.075, 0, { shadow: false });
  const hedge = M('#1f4a2c', { roughness: 0.9 });
  for (const [x, z, w, d] of [[0, -5.3, 11, 0.4], [-5.3, 0, 0.4, 11], [5.3, 0, 0.4, 11], [-3.2, 5.3, 4.6, 0.4], [3.2, 5.3, 4.6, 0.4]]) add(g, new THREE.BoxGeometry(w, 0.7, d), hedge, x, 0.35, z, { shadow: false });
  add(g, new THREE.BoxGeometry(1.6, 0.05, 3.5), M('#cfc4ad'), 0, 0.17, 3.6, { shadow: false });
  const home = new THREE.Group();
  g.add(home);
  const wall = M('#ece6dc', { roughness: 0.7 });
  const accent = M(color, { emissive: color, emissiveIntensity: 0.25 });
  const lit = (w, h, d, y, x = 0, z = 0) => {
    // Façade avec fenêtres allumées (texture partagée)
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [wall, wall, accent, wall, wall, wall]);
    m.position.set(x, y + h / 2, z);
    m.castShadow = m.receiveShadow = true;
    home.add(m);
    const rows = Math.max(1, Math.floor(h / 1.6));
    const cols = Math.max(1, Math.floor(w / 1.4));
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      if ((r * 7 + c * 3) % 5 === 0) continue;
      add(home, new THREE.BoxGeometry(0.55, 0.7, 0.05), glass, x - w / 2 + (c + 0.5) * (w / cols), y + 0.9 + r * (h / rows), z + d / 2 + 0.02, { shadow: false });
    }
    return m;
  };
  let picks = [];
  let height = 4;
  const setCount = (n, type) => {
    home.traverse((o) => o.geometry?.dispose?.());
    home.clear();
    picks = [];
    if (type === 'terrain') {
      // Personne dans ce pôle : terrain vide, juste un panneau
      const post = add(home, new THREE.BoxGeometry(0.12, 1.2, 0.12), DARK, 0, 0.6, 0);
      const tex = textTexture(['TERRAIN VIDE', 'en attente d’habitants'], { w: 256, h: 140, bg: '#2a2a33', fg: '#ffffff', font: 'bold 34px Inter Variable, sans-serif' });
      const pan = add(home, new THREE.BoxGeometry(2, 1.1, 0.1), new THREE.MeshStandardMaterial({ map: tex, emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: 0.35 }), 0, 1.6, 0);
      picks = [post, pan];
      height = 3;
    } else if (type === 'pavillon') {
      picks.push(lit(4, 2.6, 3.6, 0.15, 0, -1));
      const roof = add(home, prism(4.6, 1.6, 4.1), accent, 0, 2.75, -1);
      picks.push(roof);
      height = 4.6;
    } else if (type === 'maison') {
      picks.push(lit(6, 4.4, 4.6, 0.15, 0, -1.2));
      picks.push(add(home, prism(6.8, 2, 5.2), accent, 0, 4.55, -1.2));
      add(home, new THREE.BoxGeometry(1, 1.4, 1), wall, 2, 6, -1.6);
      height = 7;
    } else if (type === 'villa') {
      picks.push(lit(8, 3.2, 5, 0.15, -0.8, -2));
      picks.push(lit(4.5, 2.6, 4, 3.35, -2.4, -2.4));
      add(home, new THREE.BoxGeometry(8.4, 0.2, 5.4), accent, -0.8, 3.4, -2);
      add(home, new THREE.BoxGeometry(3.6, 0.12, 2.4), M('#3fb8ff', { emissive: '#1f7fff', emissiveIntensity: 0.5, roughness: 0.1 }), 3, 0.2, 2.3, { shadow: false });
      height = 7;
    } else if (type === 'immeuble') {
      picks.push(lit(6, 12, 5, 0.15, 0, -1.5));
      add(home, new THREE.BoxGeometry(6.4, 0.5, 5.4), accent, 0, 12.4, -1.5);
      height = 13.5;
    } else if (type === 'grand') {
      picks.push(lit(7, 20, 6, 0.15, 0, -1.5));
      picks.push(lit(4.5, 3, 4, 20.15, 0, -1.5));
      add(home, new THREE.BoxGeometry(7.4, 0.5, 6.4), accent, 0, 20.2, -1.5);
      height = 24;
    } else {
      picks.push(lit(6.5, 22, 6.5, 0.15, 0, -1.2));
      picks.push(lit(5, 14, 5, 22.15, 0, -1.2));
      picks.push(lit(3.4, 8, 3.4, 36.15, 0, -1.2));
      add(home, new THREE.CylinderGeometry(0.1, 0.2, 6, 8), M('#c9ccd6', { metalness: 0.8 }), 0, 47, -1.2);
      add(home, new THREE.SphereGeometry(0.3, 12, 8), M('#ff2d55', { emissive: '#ff2d55', emissiveIntensity: 2 }), 0, 50.2, -1.2, { shadow: false });
      add(home, new THREE.BoxGeometry(6.9, 0.4, 6.9), accent, 0, 22.2, -1.2);
      height = 51;
    }
    // Boîte aux lettres avec cadenas
    add(home, new THREE.BoxGeometry(0.5, 0.4, 0.35), accent, 1.6, 1.1, 5);
    add(home, new THREE.BoxGeometry(0.08, 0.9, 0.08), DARK, 1.6, 0.6, 5);
    // Entre deux paliers, le bâtiment grandit encore un peu à chaque habitant en plus
    const RANGES = { pavillon: [1, 5], maison: [6, 10], villa: [11, 20], immeuble: [21, 50], grand: [51, 100], gratteciel: [101, 300] };
    const r = RANGES[type];
    const frac = r ? Math.min(1, Math.max(0, (n - r[0]) / Math.max(1, r[1] - r[0]))) : 0;
    const sXZ = r ? 0.82 + frac * 0.3 : 1;
    const sY = r ? 0.8 + frac * 0.45 : 1;
    home.scale.set(sXZ, sY, sXZ);
    height *= sY;
    return { picks, height };
  };
  return { group: g, pick: [lawn], h: 6, setCount, get height() { return height; } };
}

// Bureau de journaliste : immeuble de presse, parabole, et bandeau lumineux qui fait défiler les titres.
export function buildPress() {
  const g = new THREE.Group();
  box(g, 14, 0.4, 11, STONE_DARK, 0, 0, 0);
  const brick = M('#b5654a', { roughness: 0.85 });
  const body = box(g, 12, 7.5, 7.5, brick, 0, 0.4, -0.8);
  box(g, 12.4, 0.5, 7.9, M('#e9e1d2'), 0, 7.9, -0.8);
  box(g, 12.2, 0.3, 7.7, M('#e9e1d2'), 0, 3.9, -0.8);
  windows(g, 4, 1.6, 1.8, 5.8, 2.97, 2.8);
  add(g, new THREE.BoxGeometry(7.5, 2.2, 0.08), glass, -1.6, 1.7, 2.97, { shadow: false });
  box(g, 1.6, 2.6, 0.15, DARK, 4.2, 0.4, 2.97);
  sign(g, 'PRESSE', 3.6, 0.9, 0, 8.9, 2.9, { bg: '#16161c', fg: '#ffffff', accent: '#ff2d55', emissive: 1 });
  sign(g, ['BUREAU', 'de journaliste'], 2.8, 1.2, 4.2, 3.4, 3.05, { bg: '#f3e7d4', fg: '#16161c', emissive: 0.35 });
  // Bandeau défilant
  const c = document.createElement('canvas');
  c.width = 2048;
  c.height = 64;
  const tickerTex = new THREE.CanvasTexture(c);
  tickerTex.colorSpace = THREE.SRGBColorSpace;
  tickerTex.wrapS = THREE.RepeatWrapping;
  const tickerMat = new THREE.MeshStandardMaterial({ color: '#ffffff', map: tickerTex, emissive: '#ffffff', emissiveMap: tickerTex, emissiveIntensity: 1.1 });
  const ticker = add(g, new THREE.PlaneGeometry(12, 0.6), tickerMat, 0, 4.45, 2.98, { shadow: false });
  ticker.material.map.repeat.set(0.35, 1);
  // Parabole + antenne
  const dish = new THREE.Group();
  add(dish, new THREE.SphereGeometry(1.1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 3), M('#e8e8ee', { side: THREE.DoubleSide, metalness: 0.4 }), 0, 0, 0, { rx: Math.PI / 2.4 });
  add(dish, new THREE.CylinderGeometry(0.04, 0.04, 1, 6), DARK, 0, 0.1, 0.5, { rx: 1 });
  dish.position.set(-4, 9, -2);
  g.add(dish);
  add(g, new THREE.CylinderGeometry(0.1, 0.1, 1.2, 8), DARK, -4, 8.6, -2);
  add(g, new THREE.CylinderGeometry(0.05, 0.08, 4, 6), M('#c9ccd6', { metalness: 0.8 }), 4, 10.2, -3);
  // Kiosque à journaux devant
  const kiosk = new THREE.Group();
  add(kiosk, new THREE.CylinderGeometry(0.9, 0.9, 2.2, 10), M('#1f4a2c'), 0, 1.1, 0);
  add(kiosk, new THREE.ConeGeometry(1.2, 0.8, 10), M('#1f4a2c'), 0, 2.6, 0);
  for (let i = 0; i < 6; i++) add(kiosk, new THREE.PlaneGeometry(0.5, 0.7), M(['#f2f2f2', '#ffd76b', '#ff8fa5'][i % 3], { side: THREE.DoubleSide }), Math.cos(i) * 0.92, 1.2, Math.sin(i) * 0.92, { ry: -i + Math.PI / 2, shadow: false });
  kiosk.position.set(-5, 0.4, 4.3);
  g.add(kiosk);
  let text = '';
  const draw = (headlines) => {
    const x = c.getContext('2d');
    x.fillStyle = '#0b0b10';
    x.fillRect(0, 0, 2048, 64);
    x.font = 'bold 34px Inter Variable, Segoe UI, sans-serif';
    x.fillStyle = '#ffd76b';
    x.textBaseline = 'middle';
    text = headlines.length ? `  ${headlines.join('   •   ')}   •  ` : '  Bureau de journaliste — branche-toi sur tes médias  •  ';
    // Répète le texte pour remplir le bandeau
    let px = 0;
    while (px < 2048) {
      x.fillText(text, px, 34);
      px += Math.max(400, x.measureText(text).width);
    }
    tickerTex.needsUpdate = true;
  };
  draw([]);
  return {
    group: g,
    pick: [body],
    h: 11,
    setTicker: draw,
    anim: (dt) => {
      tickerTex.offset.x = (tickerTex.offset.x + dt * 0.025) % 1;
      dish.rotation.y += dt * 0.15;
    },
  };
}

// Kebab : petite échoppe avec broche qui tourne.
export function buildKebab() {
  const g = new THREE.Group();
  box(g, 10, 0.3, 9, STONE_DARK, 0, 0, 0);
  const body = box(g, 8, 4.2, 6, M('#f2e3c6'), 0, 0.3, -1);
  box(g, 8.4, 0.35, 6.4, M('#3a2a1a'), 0, 4.5, -1);
  // Auvent rouge et blanc
  for (let i = 0; i < 8; i++) add(g, new THREE.BoxGeometry(1, 0.08, 1.6), M(i % 2 ? '#ffffff' : '#c8102e'), -3.5 + i, 3.4, 2.7, { rx: 0.4 });
  add(g, new THREE.BoxGeometry(5, 2, 0.08), glass, -1, 1.7, 2.02, { shadow: false });
  box(g, 1.2, 2.5, 0.12, M('#3a2a1a'), 2.8, 0.3, 2.02);
  sign(g, 'KEBAB', 4, 1, 0, 3.95, 2.1, { bg: '#c8102e', fg: '#ffd76b', emissive: 1.2 });
  // Broche à kebab derrière la vitre
  const spit = new THREE.Group();
  add(spit, new THREE.CylinderGeometry(0.03, 0.03, 1.8, 6), M('#ccc', { metalness: 0.8 }), 0, 0, 0);
  add(spit, new THREE.CylinderGeometry(0.28, 0.42, 1.2, 12), M('#9a5a2a', { emissive: '#ff6a00', emissiveIntensity: 0.25, roughness: 0.9 }), 0, -0.1, 0);
  spit.position.set(-2.2, 1.6, 1.4);
  g.add(spit);
  // Terrasse : tables + tabourets
  for (const x of [-3, 0, 3]) {
    add(g, new THREE.CylinderGeometry(0.5, 0.5, 0.06, 14), M('#e8e8e8'), x, 1, 3.9);
    add(g, new THREE.CylinderGeometry(0.05, 0.05, 0.9, 6), DARK, x, 0.55, 3.9);
    for (const dx of [-0.75, 0.75]) add(g, new THREE.CylinderGeometry(0.2, 0.2, 0.55, 10), M('#c8102e'), x + dx, 0.55, 3.9);
  }
  return { group: g, pick: [body], h: 6, anim: (dt) => (spit.rotation.y += dt * 1.5) };
}

// Skate park : bowl, rampes, rails et curb ; les skateurs (récents sur YouTube) y roulent.
export function buildSkatepark() {
  const g = new THREE.Group();
  const concrete = M('#bdbab3', { roughness: 0.9 });
  const ground = box(g, 20, 0.3, 16, concrete, 0, 0, 0);
  // Quarter pipes (profil courbe extrudé)
  const qp = (w) => {
    const sh = new THREE.Shape();
    sh.moveTo(0, 0);
    sh.lineTo(2.4, 0);
    sh.lineTo(2.4, 2);
    sh.quadraticCurveTo(0.2, 2, 0, 0);
    const geo = new THREE.ExtrudeGeometry(sh, { depth: w, bevelEnabled: false });
    geo.translate(-1.2, 0, -w / 2);
    return geo;
  };
  const q1 = add(g, qp(8), concrete, -8, 0.3, 0, { ry: Math.PI });
  const q2 = add(g, qp(8), concrete, 8, 0.3, 0);
  for (const x of [-9.3, 9.3]) add(g, new THREE.CylinderGeometry(0.06, 0.06, 8, 8), M('#555', { metalness: 0.8 }), x, 2.35, 0, { rx: Math.PI / 2 });
  // Pyramide (fun box), rail, curb
  const fun = add(g, new THREE.CylinderGeometry(1.2, 3, 0.9, 4), concrete, 0, 0.75, -4, { ry: Math.PI / 4 });
  add(g, new THREE.BoxGeometry(5, 0.06, 0.06), M('#ffd76b', { metalness: 0.8 }), 0, 1, 4);
  for (const x of [-2.4, 2.4]) add(g, new THREE.BoxGeometry(0.06, 0.7, 0.06), M('#ffd76b', { metalness: 0.8 }), x, 0.65, 4);
  add(g, new THREE.BoxGeometry(4, 0.45, 0.8), M('#9aa0a8'), 0, 0.52, 6.6);
  // Graffitis sur un muret
  const wall = box(g, 10, 2, 0.3, M('#d9d4c8'), 0, 0.3, -7.6);
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 100;
  const x = c.getContext('2d');
  x.fillStyle = '#d9d4c8';
  x.fillRect(0, 0, 512, 100);
  ['#ff3355', '#33c6ff', '#ffb020', '#2fd17a'].forEach((col, i) => {
    x.fillStyle = col;
    x.beginPath();
    x.ellipse(70 + i * 125, 50, 60, 34, (i - 1.5) * 0.3, 0, Math.PI * 2);
    x.fill();
  });
  x.font = 'bold 54px Impact, sans-serif';
  x.fillStyle = '#111';
  x.textAlign = 'center';
  x.fillText('SKATE PARK', 256, 68);
  const gt = new THREE.CanvasTexture(c);
  gt.colorSpace = THREE.SRGBColorSpace;
  add(g, new THREE.PlaneGeometry(10, 1.95), new THREE.MeshStandardMaterial({ map: gt }), 0, 1.3, -7.44, { shadow: false });
  void wall;
  // Spots où les skateurs roulent (aller-retour entre les quarters, passage sur le rail)
  const paths = [
    (t) => [Math.sin(t) * 7.6, Math.max(0, Math.abs(Math.sin(t)) - 0.72) * 6, -1.5],
    (t) => [Math.sin(t + 1.5) * 7.6, Math.max(0, Math.abs(Math.sin(t + 1.5)) - 0.72) * 6, 1.6],
    (t) => [Math.cos(t) * 3.2, 0.3 + Math.max(0, Math.sin(t * 2)) * 0.9, -4 + Math.sin(t) * 2.4],
    (t) => [((t * 2.4) % 14) - 7, Math.abs(((t * 2.4) % 14) - 7) < 2.5 ? 1.05 : 0, 4],
    (t) => [Math.sin(t * 0.8) * 5, Math.max(0, Math.sin(t * 3.2)) * 0.8, 6 - Math.cos(t * 0.8) * 1.2],
  ];
  return { group: g, pick: [ground, q1, q2, fun], h: 5, skatePaths: paths };
}

// FBI : immeuble fédéral en béton, accès par clé d'activation.
export function buildFBI() {
  const g = new THREE.Group();
  box(g, 15, 0.4, 12, STONE_DARK, 0, 0, 0);
  const conc = M('#8d8f94', { roughness: 0.75 });
  const body = box(g, 12, 9, 8, conc, 0, 0.4, -1);
  // Bandeaux de fenêtres sombres
  for (let y = 1.8; y < 9; y += 1.8) add(g, new THREE.BoxGeometry(11, 0.9, 0.05), M('#1a2230', { metalness: 0.6, roughness: 0.2, emissive: '#3a6bff', emissiveIntensity: 0.12 }), 0, y, 3.02, { shadow: false });
  box(g, 12.6, 0.6, 8.6, M('#5d6066'), 0, 9.4, -1);
  sign(g, 'FBI', 3.4, 1.2, 0, 10.6, 3.05, { bg: '#0b1a3a', fg: '#ffd76b', emissive: 0.9 });
  box(g, 3, 2.8, 0.2, M('#0b0b0f'), 0, 0.4, 3.05);
  // Drapeau, antennes, barrière
  add(g, new THREE.CylinderGeometry(0.06, 0.06, 6, 8), M('#cfcfd4', { metalness: 0.7 }), -6.6, 3.4, 4.6);
  add(g, new THREE.PlaneGeometry(1.6, 1), M('#1f3fbf', { side: THREE.DoubleSide }), -5.8, 5.9, 4.6, { shadow: false });
  for (const x of [-3, 3]) add(g, new THREE.CylinderGeometry(0.05, 0.08, 4, 6), M('#c9ccd6', { metalness: 0.8 }), x, 11.7, -3);
  const scan = add(g, new THREE.BoxGeometry(0.15, 0.15, 0.15), M('#ff2d2d', { emissive: '#ff2d2d', emissiveIntensity: 2 }), 3, 13.8, -3, { shadow: false });
  add(g, new THREE.BoxGeometry(4.5, 0.15, 0.15), M('#ffffff', { emissive: '#ff2d2d', emissiveIntensity: 0.3 }), 4.5, 1.2, 5.4);
  // SUV noirs
  for (const x of [3.6, 6]) {
    const suv = new THREE.Group();
    add(suv, new THREE.BoxGeometry(1.9, 1.1, 4.2), M('#0c0c10', { metalness: 0.6, roughness: 0.3 }), 0, 0.85, 0);
    add(suv, new THREE.BoxGeometry(1.8, 0.7, 2.6), M('#1d2633', { metalness: 0.6, roughness: 0.15 }), 0, 1.7, -0.4);
    suv.position.set(x, 0.4, 7.6);
    g.add(suv);
  }
  return { group: g, pick: [body], h: 14, anim: (dt, t) => (scan.material.emissiveIntensity = Math.sin(t * 4) > 0 ? 2.5 : 0.2) };
}

// Place du clocher : le clocher et, à côté, le tableau de l'emploi du temps.
export function buildBellSquare() {
  const g = new THREE.Group();
  const bell = buildBellTower();
  bell.group.position.set(-3.5, 0, -1);
  const board = buildBoard();
  board.group.position.set(4.5, 0, 2.5);
  board.group.rotation.y = -0.35;
  g.add(bell.group, board.group);
  return {
    group: g,
    pick: bell.pick,
    h: 19,
    anim: bell.anim,
    bell,
    extras: [{ id: 'lm:board', name: 'Emploi du temps', icon: '🗓️', pick: board.pick, pos: new THREE.Vector3(4.5, 0, 2.5), h: 7.5, api: board }],
  };
}

export const LANDMARK_BUILDERS = { bank: buildBank, mairie: buildMairie, studio: buildStudio, shop: buildShop, hall: buildHall, hq: buildRedStudio, radio: buildRadio, library: buildLibrary, school: buildSchool, bell: buildBellSquare, cgt: buildCGT, label: buildLabel, fire: buildFireStation, pole: buildPoleHome, press: buildPress, kebab: buildKebab, skate: buildSkatepark, fbi: buildFBI };
export const LANDMARK_SIZE = { bank: [14, 13], mairie: [19, 20], studio: [16, 14], shop: [13, 12], hall: [22, 16], hq: [13, 13], radio: [14, 13], library: [20, 20], school: [19, 21], bell: [17, 14], cgt: [15, 13], label: [14, 12], fire: [17, 14], pole: [12, 12], press: [15, 13], kebab: [12, 11], skate: [22, 18], fbi: [17, 15] };
export const LANDMARK_ICON = { university: '🎓', social: '📣', beatmakers: '🎛️', gapple: '🍏', artist: '🏡', venue: '🎪', project: '🏢', eventplaza: '⛲', automation: '⚙️', claude: '✳️', bank: '🏦', mairie: '🏛️', studio: '🎙️', shop: '🎸', hall: '🎤', school: '🏫', bell: '🔔', board: '🗓️', library: '🧠', hq: '🔴', radio: '📻', gigs: '🎟️', cgt: '✊', label: '💿', fire: '🚒', pole: '🏠', press: '📰', kebab: '🥙', skate: '🛹', fbi: '🕵️' };
