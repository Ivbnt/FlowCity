// Intérieurs des bâtiments, visitables en POV (E devant un bâtiment). Chaque lieu a sa déco dans son thème
// et un objet « fiche » (comptoir, écran, pupitre…) qui ouvre son panneau. La porte SORTIE ramène dans la ville.
// Les animations détaillées viendront plus tard : ici, la déco et quelques petits mouvements.
import { Room, mat, glow } from './rooms.js';

const OUTDOOR = new Set(['skate', 'eventplaza']);
export const hasInterior = (kind) => kind && !OUTDOOR.has(kind);

/**
 * kind = type de lieu (landmark) ou 'house' pour une maison-projet du Drive.
 * info = { id: id de la fiche à ouvrir, name, color, items: [noms de dossiers / fichiers] }
 */
export function buildInterior(kind, info) {
  const T = THEMES[kind] || THEMES.house;
  const R = new Room({ w: T.w || 12, d: T.d || 10, h: T.h || 4, floor: T.floor || '#3a2a20', wall: T.wall || '#2c3244', ceil: T.ceil || '#15171f', trim: T.trim || '#e9e2d4' });
  R.exit(0);
  // Enseigne du lieu au-dessus de la sortie (côté intérieur) et lumière principale
  R.sign(info.name || 'Bienvenue', 3.2, 0.5, 0, R.h - 0.55, R.d / 2 - 0.13, { ry: Math.PI, bg: '#0b0b12', fg: info.color || '#ff2d55', glow: 1, w: 640, h: 100 });
  R.light(T.light || '#ffe2b8', T.lightI || 45, 18, 0, R.h - 0.4, 0);
  T.build(R, info);
  R.name = info.name;
  return R.finish();
}

const W2 = (R) => R.w / 2;
const D2 = (R) => R.d / 2;
const back = (R) => -R.d / 2 + 0.12;
// Posters / affiches au mur du fond
function posters(R, list, { y = 2.4, w = 1.1, h = 1.5, bg = '#1a0a12', fg = '#fff' } = {}) {
  list.forEach((txt, i) => {
    const x = -((list.length - 1) * (w + 0.5)) / 2 + i * (w + 0.5);
    R.frame(x, y, back(R) + 0.02, w, h, 0, '#111');
    R.sign(txt, w - 0.1, h - 0.1, x, y, back(R) + 0.08, { bg, fg, glow: 0.7, w: 256, h: 352, font: 'bold 44px Inter Variable, sans-serif' });
  });
}
// Rangées d'archives étiquetées (dossiers du Drive)
function archive(R, items, x, z, ry = 0) {
  R.shelf(x, z, { ry, w: 2.6, h: 2.2, items: 'boxes' });
  (items || []).slice(0, 3).forEach((n, i) => R.sign(n.slice(0, 22), 2.2, 0.26, x + Math.sin(ry) * 0.24, 2 + 0.35 * i, z + Math.cos(ry) * 0.24, { ry, bg: '#f4efe2', fg: '#2a1d10', glow: 0.25, w: 512, h: 60 }));
}
function bigScreen(R, lines, id, { x = 0, y = 2.2, w = 4, h = 2, z = null, ry = 0, bg = '#071018', fg = '#7fd4ff' } = {}) {
  return R.sign(lines, w, h, x, y, z ?? back(R) + 0.08, { ry, bg, fg, glow: 1.1, id, w: 768, h: 384 });
}
function stage(R, color, { w = 7, d = 3 } = {}) {
  R.box(w, 0.6, d, mat('#141418'), 0, 0.3, back(R) + d / 2 + 0.1, { solid: true });
  R.box(w, 0.04, 0.04, glow(color, 2), 0, 0.62, back(R) + d + 0.1);
  R.speaker(-w / 2 + 0.4, back(R) + 0.5, 1.4);
  R.speaker(w / 2 - 0.4, back(R) + 0.5, 1.4);
  R.cyl(0.03, 0.03, 1.4, mat('#222'), 0, 1.3, back(R) + d * 0.6);
  R.ball(0.08, mat('#444', { metalness: 0.6 }), 0, 2.05, back(R) + d * 0.6);
}
function lightsRig(R, colors) {
  const balls = colors.map((c, i) => R.ball(0.16, glow(c, 2.2), -3 + i * (6 / Math.max(1, colors.length - 1)), R.h - 0.5, back(R) + 1.2, { keep: true }));
  R.anims.push((dt, t) => balls.forEach((b, i) => b.scale.setScalar(0.8 + 0.4 * Math.abs(Math.sin(t * 3 + i)))));
}
const goldDisc = (R, x, y, z, ry = 0) => {
  R.frame(x, y, z, 0.8, 0.8, ry, '#151515');
  R.cyl(0.32, 0.32, 0.02, mat('#d4af37', { metalness: 1, roughness: 0.2 }), x + Math.sin(ry) * 0.05, y, z + Math.cos(ry) * 0.05, { rx: Math.PI / 2, ry, seg: 32 });
};

const THEMES = {
  // ---------- Musique ----------
  studio: {
    w: 13, d: 10, floor: '#2a2a30', wall: '#1d1f2a', light: '#ff9a6b',
    build(R, info) {
      // Cabine de prise de son vitrée au fond, console devant
      R.box(5, 3, 0.08, mat('#9fd4ff', { transparent: true, opacity: 0.25, metalness: 0.4, roughness: 0.05 }), 0, 1.5, back(R) + 3.2, { solid: true });
      R.cyl(0.03, 0.03, 1.5, mat('#222'), 0, 0.75, back(R) + 1.5);
      R.ball(0.12, mat('#888', { metalness: 0.9 }), 0, 1.55, back(R) + 1.5);
      for (let i = 0; i < 6; i++) R.box(1.6, 1.2, 0.08, mat('#2a1b3a', { roughness: 1 }), -4.5 + i * 1.8, 2.2, back(R) + 0.05);
      R.counter(0, 0, 4.2, { color: '#111', top: '#2a2a30', id: info.id });
      for (let i = 0; i < 14; i++) R.box(0.06, 0.04, 0.4, glow(['#ff3355', '#ffb020', '#2fd17a'][i % 3], 1.2), -1.9 + i * 0.29, 1.13, 0);
      R.speaker(-2.6, 0.2, 0.8);
      R.speaker(2.6, 0.2, 0.8);
      R.sofa(0, 3.6, Math.PI, '#33202a');
      goldDisc(R, -W2(R) + 0.15, 2.3, -1, Math.PI / 2);
      goldDisc(R, -W2(R) + 0.15, 2.3, 1, Math.PI / 2);
      R.sign(['ON AIR', 'REC'], 1.2, 0.5, 2.8, 3.2, back(R) + 3.25, { bg: '#300', fg: '#ff3355', glow: 1.4, w: 256, h: 110 });
    },
  },
  label: {
    w: 12, d: 10, floor: '#1a1a1f', wall: '#121218', light: '#ffd76b', trim: '#c9a227',
    build(R, info) {
      for (let i = 0; i < 5; i++) goldDisc(R, -4 + i * 2, 2.3, back(R) + 0.02);
      for (let i = 0; i < 3; i++) goldDisc(R, -W2(R) + 0.15, 2.3, -2 + i * 2, Math.PI / 2);
      R.desk(0, -1.5, { w: 2.6, color: '#111', screen: { lines: ['LABEL', 'fiches artistes'], bg: '#100c00', fg: '#ffd76b' }, id: info.id });
      R.chair(0, -0.6);
      R.sofa(W2(R) - 0.6, 1.5, -Math.PI / 2, '#2a2214');
      R.shelf(W2(R) - 0.3, -2.5, { ry: -Math.PI / 2, w: 2.4, h: 2.2, items: 'records' });
      R.rug(0, 0.5, 5, 3, '#2a2214');
      R.plant(-W2(R) + 0.8, D2(R) - 1.2);
    },
  },
  radio: {
    w: 11, d: 9, floor: '#232530', wall: '#1b2030', light: '#7fd4ff',
    build(R, info) {
      R.table(0, -1.5, 3.4, 1.4, '#20202a');
      for (const x of [-1, 0, 1]) {
        R.cyl(0.02, 0.02, 0.5, mat('#333'), x, 1.05, -1.6);
        R.ball(0.09, mat('#777', { metalness: 0.8 }), x, 1.35, -1.6);
        R.chair(x, -0.4, 0, '#1a2a3a');
      }
      bigScreen(R, ['ON AIR', 'TRS RADIO'], info.id, { bg: '#1a0008', fg: '#ff3355' });
      R.shelf(-W2(R) + 0.3, 1.5, { ry: Math.PI / 2, w: 2.6, h: 2.2, items: 'records' });
      R.speaker(W2(R) - 0.6, back(R) + 0.6, 1);
      lightsRig(R, ['#ff3355', '#33c6ff']);
    },
  },
  shop: {
    w: 12, d: 10, floor: '#4a3626', wall: '#2a2622', light: '#ffd9a0',
    build(R, info) {
      R.counter(-2.5, 2.4, 3, { color: '#3a2a1f', id: info.id });
      R.sign('CAISSE', 1, 0.3, -2.5, 1.45, 2.05, { bg: '#c8102e', fg: '#fff', w: 256, h: 76 });
      // Mur de guitares
      for (let i = 0; i < 6; i++) {
        const x = -3.5 + i * 1.4;
        R.box(0.36, 1.1, 0.08, mat(['#c8102e', '#e8e2d4', '#111', '#ffb020', '#1f6fbf', '#2fd17a'][i]), x, 1.6, back(R) + 0.1);
        R.box(0.08, 0.9, 0.05, mat('#3a2a1f'), x, 2.55, back(R) + 0.1);
      }
      R.speaker(W2(R) - 0.6, -1, 1.2, -Math.PI / 2);
      R.speaker(W2(R) - 0.6, 0.5, 1, -Math.PI / 2);
      R.table(2.5, 0.5, 2, 1, '#2a2622');
      for (let i = 0; i < 4; i++) R.box(0.4, 0.12, 0.3, mat('#111'), 1.8 + i * 0.45, 0.88, 0.5);
      R.shelf(-W2(R) + 0.3, -1, { ry: Math.PI / 2, w: 3, h: 2.2, items: 'boxes' });
    },
  },
  beatmakers: {
    w: 12, d: 9, floor: '#1e1e26', wall: '#191926', light: '#ffb020',
    build(R, info) {
      for (const [x, z] of [[-3, -2], [0, -2], [3, -2]]) {
        R.desk(x, z, { w: 2.2, color: '#14141a', screen: { lines: ['FL STUDIO', '140 BPM'], bg: '#0d1206', fg: '#ffb020' }, id: info.id });
        R.chair(x, z + 0.9, 0, '#2a2a34');
        R.box(1.2, 0.05, 0.4, mat('#222'), x, 0.98, z + 0.15);
      }
      for (let i = 0; i < 4; i++) goldDisc(R, -3 + i * 2, 2.6, back(R) + 0.02);
      R.speaker(-W2(R) + 0.6, 1.5, 1.1, Math.PI / 2);
      R.speaker(W2(R) - 0.6, 1.5, 1.1, -Math.PI / 2);
      R.sofa(0, D2(R) - 1.4, Math.PI, '#2a1a10');
      lightsRig(R, ['#ffb020', '#ff3355', '#ffb020']);
    },
  },
  gapple: {
    w: 11, d: 9, floor: '#2a2a2a', wall: '#1a2a1a', light: '#9be37a',
    build(R, info) {
      R.ball(0.9, mat('#d4af37', { metalness: 1, roughness: 0.25 }), 0, 1.6, -2, { keep: true });
      R.cyl(0.6, 0.7, 0.7, mat('#111'), 0, 0.35, -2, { solid: true });
      R.desk(-3, 0, { w: 2.2, screen: { lines: ['GAPPLE', 'prods'], bg: '#071407', fg: '#9be37a' }, id: info.id });
      R.chair(-3, 0.9);
      R.speaker(3, -2.5, 1.1);
      R.shelf(W2(R) - 0.3, 1, { ry: -Math.PI / 2, w: 2.4, h: 2, items: 'records' });
      R.plant(-W2(R) + 0.8, back(R) + 0.8);
    },
  },
  kebab: {
    w: 11, d: 9, floor: '#d8d2c4', wall: '#8a3b2e', light: '#fff1c2',
    build(R, info) {
      R.counter(0, -2, 6, { color: '#c8c2b4', top: '#9aa0a8', id: info.id });
      R.cyl(0.25, 0.3, 1.3, mat('#7a4a2a', { roughness: 0.9 }), -1.5, 1.75, -3.2, { keep: true });
      R.box(1.2, 1, 0.3, glow('#ff6a2a', 0.8), -1.5, 1.7, -3.7);
      R.sign(['MENU', 'Kebab frites 10 €', 'Tacos 9 €'], 3, 1.4, 1.8, 2.6, back(R) + 0.08, { bg: '#111', fg: '#ffd76b', glow: 1, w: 512, h: 256 });
      for (const [x, z] of [[-3, 1.5], [0, 1.5], [3, 1.5]]) {
        R.table(x, z, 1, 1, '#c8102e');
        R.chair(x - 0.7, z, -Math.PI / 2, '#c8102e');
        R.chair(x + 0.7, z, Math.PI / 2, '#c8102e');
      }
    },
  },
  social: {
    w: 10, d: 8, floor: '#1a1a22', wall: '#1d1f2a', light: '#ff6bd5',
    build(R, info) {
      R.desk(0, -1.6, { w: 2.4, screen: { lines: [info.name, 'posts · stats'], bg: '#160a14', fg: '#ff6bd5' }, id: info.id });
      R.chair(0, -0.7);
      R.cyl(0.4, 0.4, 0.04, glow('#fff6d8', 1.6), 2.5, 1.7, -1, { rx: Math.PI / 2, seg: 32 });
      R.cyl(0.02, 0.02, 1.7, mat('#222'), 2.5, 0.85, -1);
      R.box(4, 2.6, 0.05, mat('#ff6bd5'), 0, 1.3, back(R) + 0.05);
      R.plant(-W2(R) + 0.8, 1.5);
    },
  },
  artist: {
    w: 10, d: 9, floor: '#4a3626', wall: '#2c2834', light: '#ffd9a0',
    build(R, info) {
      R.sofa(0, 1.5, Math.PI, '#3a1420');
      R.rug(0, 0.2, 4, 2.6, '#5a1020');
      R.table(0, 0.2, 1.4, 0.7, '#2a1d14');
      R.desk(-2.8, -2.6, { w: 2, screen: { lines: [info.name, 'sa fiche'], bg: '#100c00', fg: '#ffd76b' }, id: info.id });
      R.chair(-2.8, -1.7);
      R.cyl(0.08, 0.08, 1.2, mat('#6b4a32'), 2.8, 0.9, -2.8, { rz: 0.3 });
      R.box(0.45, 0.6, 0.12, mat('#c8102e'), 2.95, 0.5, -2.8);
      goldDisc(R, 0, 2.4, back(R) + 0.02);
      R.plant(W2(R) - 0.8, D2(R) - 1.4);
    },
  },
  // ---------- Événementiel ----------
  hall: {
    w: 16, d: 13, h: 5, floor: '#141418', wall: '#18121e', light: '#ffb020', lightI: 25,
    build(R, info) {
      stage(R, '#ffb020', { w: 9, d: 3.5 });
      lightsRig(R, ['#ff3355', '#ffb020', '#33c6ff', '#ff6bd5']);
      R.counter(-5.5, 3.5, 3, { color: '#1a1a1f', id: info.id });
      R.sign('BAR', 1, 0.35, -5.5, 2.3, 3.1, { bg: '#ffb020', fg: '#111', w: 256, h: 90 });
      for (let i = 0; i < 4; i++) R.frame(W2(R) - 0.13, 2.4, -3 + i * 2, 1, 1.4, -Math.PI / 2, ['#c8102e', '#1f6fbf', '#ffb020', '#2fd17a'][i]);
    },
  },
  venue: { w: 14, d: 11, h: 4.6, floor: '#141418', wall: '#1d1424', light: '#ff6bd5', lightI: 25, build: (R, info) => THEMES.hall.build(R, info) },
  project: {
    w: 12, d: 10, floor: '#2a2a30', wall: '#232838', light: '#ffd9a0',
    build(R, info) {
      R.table(0, -1, 3.6, 1.6, '#3a2a1f');
      for (const x of [-1.2, 0, 1.2]) {
        R.chair(x, -0.0, 0);
        R.chair(x, -2.0, Math.PI);
      }
      bigScreen(R, [info.name, 'rétroplanning'], info.id, { bg: '#0b0b12', fg: '#ffb020' });
      archive(R, info.items, -W2(R) + 0.3, 1.5, Math.PI / 2);
      R.plant(W2(R) - 0.8, D2(R) - 1.4);
      R.box(1.8, 1.1, 0.05, mat('#f4efe2'), W2(R) - 0.13, 1.7, -1, { ry: -Math.PI / 2 });
    },
  },
  // ---------- Administratif ----------
  hq: {
    w: 14, d: 11, h: 4.6, floor: '#1a1a1f', wall: '#1f1218', light: '#ff2d55', lightI: 35,
    build(R, info) {
      R.counter(0, -2, 4, { color: '#c8102e', top: '#111', id: info.id });
      R.sign('THE RED STUDIO', 5, 1, 0, 3, back(R) + 0.08, { bg: '#0b0b12', fg: '#ff2d55', glow: 1.3, w: 768, h: 160 });
      R.sofa(-4, 2.5, Math.PI / 2, '#2a2a34');
      R.sofa(4, 2.5, -Math.PI / 2, '#2a2a34');
      R.plant(-W2(R) + 0.8, back(R) + 0.8, 1.2);
      R.plant(W2(R) - 0.8, back(R) + 0.8, 1.2);
      R.box(1.4, 2.4, 0.1, mat('#9aa0a8', { metalness: 0.9, roughness: 0.25 }), W2(R) - 2, 1.2, back(R) + 0.07, { id: 'office:lift' });
      R.sign('↑ Direction', 1.4, 0.3, W2(R) - 2, 2.65, back(R) + 0.1, { bg: '#111', fg: '#d4af37', w: 256, h: 60 });
    },
  },
  mairie: {
    w: 15, d: 12, h: 4.8, floor: '#6b5a48', wall: '#e8dcc6', trim: '#8a6f5a', light: '#fff1c2', lightI: 35,
    build(R, info) {
      // Salle du conseil : grande table, drapeaux, Marianne
      R.table(0, -1.5, 5, 1.8, '#5b3a2a');
      for (let i = 0; i < 4; i++) {
        R.chair(-1.8 + i * 1.2, -0.3, 0, '#3a2a20');
        R.chair(-1.8 + i * 1.2, -2.7, Math.PI, '#3a2a20');
      }
      for (const [x, c] of [[-1.2, '#1f3fbf'], [-0.9, '#f2f2f2'], [-0.6, '#c8102e']]) R.box(0.3, 1.2, 0.02, mat(c), x - 3, 2.6, back(R) + 0.1);
      R.cyl(0.03, 0.03, 2.5, mat('#c9a227', { metalness: 1 }), -4.4, 1.25, back(R) + 0.15);
      R.frame(2.5, 2.6, back(R) + 0.02, 1.4, 1.8, 0, '#f2f2f2');
      R.counter(-W2(R) + 1.2, 2.5, 2.4, { color: '#8a6f5a', top: '#e8dcc6', id: info.id });
      R.sign('ACCUEIL · ÉTAT CIVIL', 2.4, 0.3, -W2(R) + 1.2, 2.2, 2.05, { bg: '#1f3fbf', fg: '#fff', w: 512, h: 64 });
      archive(R, info.items, W2(R) - 0.3, 1.5, -Math.PI / 2);
      R.plant(W2(R) - 0.9, back(R) + 0.9, 1.1);
    },
  },
  bank: {
    w: 13, d: 11, h: 4.8, floor: '#d8d2c4', wall: '#cfc6b3', trim: '#8a7a5a', light: '#fff1c2',
    build(R, info) {
      R.counter(0, -1, 7, { color: '#5b4a32', top: '#e8e2d4', id: info.id });
      for (const x of [-2.4, 0, 2.4]) R.box(0.05, 1, 0.6, mat('#9fd4ff', { transparent: true, opacity: 0.3 }), x, 1.6, -1);
      R.sign('GUICHETS', 2, 0.3, 0, 2.5, -1.05, { bg: '#2a6b3a', fg: '#fff', w: 512, h: 76 });
      // Salle des coffres au fond
      R.box(3, 2.6, 0.3, mat('#5d636e', { metalness: 0.9, roughness: 0.3 }), 0, 1.3, back(R) + 0.2);
      R.cyl(1, 1, 0.2, mat('#7a818d', { metalness: 0.95, roughness: 0.2 }), 0, 1.3, back(R) + 0.4, { rx: Math.PI / 2, seg: 32 });
      for (let i = 0; i < 6; i++) R.cyl(0.04, 0.04, 0.9, mat('#c9a227', { metalness: 1 }), 0, 1.3, back(R) + 0.55, { rz: (i * Math.PI) / 3 });
      bigScreen(R, ['BUDGET', 'recettes · dépenses'], info.id, { x: W2(R) - 0.13, y: 2.4, w: 2.6, h: 1.4, z: 1.5, ry: -Math.PI / 2, bg: '#04140a', fg: '#2fd17a' });
      R.plant(-W2(R) + 0.8, D2(R) - 1.5, 1.1);
      for (let i = 0; i < 3; i++) R.cyl(0.3, 0.3, 0.12, mat('#d4af37', { metalness: 1, roughness: 0.2 }), -W2(R) + 1.5, 0.06 + i * 0.12, back(R) + 1.2);
    },
  },
  cgt: {
    w: 12, d: 10, floor: '#2a2a30', wall: '#3a1414', light: '#ffd9a0',
    build(R, info) {
      R.box(6, 1, 0.05, mat('#c8102e'), 0, 3, back(R) + 0.06);
      R.sign(['TOUS ENSEMBLE', '✊'], 5.6, 0.9, 0, 3, back(R) + 0.1, { bg: '#c8102e', fg: '#fff', glow: 0.6, w: 768, h: 128 });
      R.table(0, -0.5, 3.4, 1.4, '#3a2a1f');
      for (const x of [-1.2, 0, 1.2]) R.chair(x, 0.6, 0);
      R.desk(-W2(R) + 1.4, -2.6, { w: 2, screen: { lines: ['ACTIONS', 'docus · luttes'], bg: '#1a0505', fg: '#ff6b6b' }, id: info.id });
      R.shelf(W2(R) - 0.3, -1, { ry: -Math.PI / 2, w: 3, h: 2.2 });
      posters(R, ['GRÈVE', 'MANIF'], { y: 1.6, w: 0.9, h: 1.2, bg: '#c8102e' });
    },
  },
  fire: {
    w: 15, d: 12, h: 5, floor: '#3a3a40', wall: '#c8c2b4', trim: '#c8102e', light: '#fff1c2', lightI: 35,
    build(R, info) {
      // Camion de pompiers au garage
      R.box(2.4, 1.8, 5.5, mat('#c8102e', { metalness: 0.4, roughness: 0.4 }), -3.5, 1.3, -1.5, { solid: true });
      R.box(2.3, 1.2, 1.6, mat('#c8102e', { metalness: 0.4, roughness: 0.4 }), -3.5, 1.1, 1.8);
      R.box(2.3, 0.6, 0.05, mat('#1d2633', { metalness: 0.6, roughness: 0.15 }), -3.5, 1.45, 2.6);
      for (const z of [-3.4, 0.3, 2]) for (const sx of [-1.2, 1.2]) R.cyl(0.42, 0.42, 0.3, mat('#111'), -3.5 + sx, 0.42, z, { rz: Math.PI / 2 });
      R.box(0.2, 0.2, 5, mat('#c0c0c0', { metalness: 0.9 }), -3.5, 2.35, -1.5);
      const beacon = R.ball(0.15, glow('#3399ff', 3), -3.5, 2.3, 1.2, { keep: true });
      R.anims.push((dt, t) => (beacon.visible = Math.sin(t * 8) > 0));
      R.cyl(0.05, 0.05, R.h, mat('#c9a227', { metalness: 1 }), 2, R.h / 2, -2);
      for (let i = 0; i < 4; i++) {
        R.box(0.5, 1.6, 0.4, mat('#222'), 3 + i * 0.7, 0.8, back(R) + 0.3);
        R.ball(0.18, mat('#e0a320'), 3 + i * 0.7, 1.85, back(R) + 0.3);
      }
      R.desk(4.5, 2.5, { w: 2, screen: { lines: ['SÉCURITÉ', 'antivirus · licences'], bg: '#1a0505', fg: '#ff6b6b' }, id: info.id });
      R.chair(4.5, 3.4);
      R.cyl(0.2, 0.2, 0.6, mat('#c8102e'), W2(R) - 0.4, 0.3, 0);
    },
  },
  fbi: {
    w: 12, d: 10, floor: '#16181d', wall: '#141a24', light: '#7fd4ff', lightI: 30,
    build(R, info) {
      for (let i = 0; i < 3; i++) bigScreen(R, [['DOSSIERS', 'TOP SECRET'], ['RECHERCHE', '…'], ['CARTE', 'Paris']][i], info.id, { x: -3.6 + i * 3.6, y: 2.5, w: 3.2, h: 1.6, bg: '#020a10', fg: ['#7fd4ff', '#2fd17a', '#ff3355'][i] });
      R.table(0, -0.5, 4, 1.4, '#111418');
      for (const x of [-1.4, 0, 1.4]) R.chair(x, 0.5, 0, '#0d0f14');
      R.box(2.4, 1.8, 0.05, mat('#3a2a1f'), W2(R) - 0.13, 1.7, 1, { ry: -Math.PI / 2 });
      for (let i = 0; i < 5; i++) R.box(0.3, 0.4, 0.02, mat('#f4efe2'), W2(R) - 0.17, 1.4 + (i % 2) * 0.6, 0.2 + i * 0.4, { ry: -Math.PI / 2 });
      R.shelf(-W2(R) + 0.3, 1.5, { ry: Math.PI / 2, w: 2.6, h: 2.2, items: 'boxes' });
    },
  },
  // ---------- Information ----------
  library: {
    w: 15, d: 12, h: 5, floor: '#3a2a20', wall: '#2a2030', light: '#ffd9a0',
    build(R, info) {
      for (let i = 0; i < 4; i++) R.shelf(-5.4 + i * 3.6, back(R) + 0.3, { w: 3.2, h: 3.4 });
      for (const z of [-1.5, 1.5]) {
        R.shelf(-W2(R) + 0.3, z, { ry: Math.PI / 2, w: 2.6, h: 3 });
        R.shelf(W2(R) - 0.3, z, { ry: -Math.PI / 2, w: 2.6, h: 3 });
      }
      R.table(0, 0, 4, 1.4, '#5b3a2a');
      for (const x of [-1.4, 0, 1.4]) {
        R.chair(x, 1, 0);
        R.cyl(0.05, 0.12, 0.35, glow('#ffd76b', 1), x, 0.98, -0.3);
      }
      // Le cerveau de Claude
      const brain = R.ball(0.7, glow('#e0805f', 1.2), 0, 2.9, -1.8, { id: info.id, keep: true });
      R.anims.push((dt, t) => brain.scale.setScalar(1 + Math.sin(t * 1.5) * 0.05));
    },
  },
  university: {
    w: 14, d: 11, floor: '#2a2a30', wall: '#20283a', light: '#c9d4ff',
    build(R, info) {
      R.box(5, 2, 0.05, mat('#1f3a2a'), 0, 2.2, back(R) + 0.06);
      R.sign(['AGENTS', 'orchestrateur → spécialistes'], 4.6, 1.6, 0, 2.2, back(R) + 0.1, { bg: '#1f3a2a', fg: '#e8f4e8', glow: 0.5, w: 640, h: 224, id: info.id });
      for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) {
        R.desk(-3.5 + c * 3.5, -1 + r * 2.4, { w: 2, screen: { lines: ['agent', ['admin', 'trésorerie', 'com', 'event', 'radio', 'veille'][r * 3 + c]], bg: '#0b0b18', fg: '#9b7bff' } });
        R.chair(-3.5 + c * 3.5, -0.1 + r * 2.4);
      }
    },
  },
  press: {
    w: 12, d: 10, floor: '#3a3a40', wall: '#2a2a30', light: '#fff1c2',
    build(R, info) {
      for (const [x, z] of [[-3, -1.5], [0, -1.5], [3, -1.5], [-3, 1.2], [3, 1.2]]) {
        R.desk(x, z, { w: 2, screen: { lines: ['DÉPÊCHE', 'revue de presse'], bg: '#0e0e10', fg: '#e8e2d4' }, id: info.id });
        R.chair(x, z + 0.9);
        for (let i = 0; i < 3; i++) R.box(0.4, 0.02, 0.3, mat('#f4efe2'), x + 0.6 - i * 0.05, 0.97 + i * 0.02, z + 0.1);
      }
      bigScreen(R, ['FLASH INFO', 'les médias suivis'], info.id, { y: 2.8, w: 4.4, h: 1.2, bg: '#1a0505', fg: '#ff3355' });
    },
  },
  school: {
    w: 14, d: 11, floor: '#6b5a48', wall: '#e3d3c3', trim: '#5b4a3a', light: '#fff6d8', lightI: 40,
    build(R, info) {
      R.box(6, 2, 0.05, mat('#1f3a2a'), 0, 2.2, back(R) + 0.06);
      R.sign(['Défis du jour', 'son · asso · finances'], 5.6, 1.6, 0, 2.2, back(R) + 0.1, { bg: '#1f3a2a', fg: '#f4f4e8', glow: 0.4, w: 768, h: 224, id: info.id });
      R.desk(0, back(R) + 1.8, { w: 2, color: '#5b3a2a' });
      for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) {
        R.table(-4.2 + c * 2.8, -0.6 + r * 1.7, 1.4, 0.6, '#a9845a');
        R.chair(-4.2 + c * 2.8, -0.1 + r * 1.7, 0, '#2f7d4a');
      }
      R.ball(0.35, mat('#1f6fbf'), W2(R) - 0.8, 1.2, back(R) + 0.8);
    },
  },
  bell: {
    w: 9, d: 9, h: 6, floor: '#5b4a3a', wall: '#cdb79e', trim: '#5b4a3a', light: '#ffd9a0',
    build(R, info) {
      const bell = R.cyl(0.4, 0.9, 1.1, mat('#c9a227', { metalness: 1, roughness: 0.25 }), 0, 4.6, -1, { keep: true, id: info.id, seg: 24 });
      R.anims.push((dt, t) => (bell.rotation.z = Math.sin(t * 1.2) * 0.12));
      R.cyl(0.02, 0.02, 3.3, mat('#d8c7a0'), 0.2, 2.2, -1);
      for (let i = 0; i < 10; i++) R.box(1.2, 0.12, 0.5, mat('#6b4a32'), -W2(R) + 1, 0.2 + i * 0.35, back(R) + 0.5 + i * 0.45);
      R.sign(['RAPPELS', 'deadlines · agenda'], 2.4, 1.2, W2(R) - 0.13, 2, 1, { ry: -Math.PI / 2, bg: '#1f3a2a', fg: '#fff', glow: 0.5, w: 512, h: 256, id: info.id });
    },
  },
  // Atelier des automatisations : tapis roulant de tâches, baies de serveurs, poste n8n et poste Claude
  automation: {
    w: 14, d: 11, h: 4.6, floor: '#2a2d36', wall: '#1c1f2a', light: '#ff6bd5', lightI: 35,
    build(R, info) {
      R.box(9, 0.8, 1.2, mat('#3a3f4c', { metalness: 0.5 }), 0, 0.4, -1, { solid: true });
      R.box(9, 0.05, 1, mat('#15151a'), 0, 0.82, -1);
      const parcels = [0, 1, 2, 3].map((i) => R.box(0.6, 0.5, 0.6, glow(['#ff6bd5', '#e0805f', '#33c6ff', '#ffd76b'][i], 0.6), -4 + i * 2.6, 1.1, -1, { keep: true }));
      R.anims.push((dt) => parcels.forEach((p) => (p.position.x = p.position.x > 4.3 ? -4.3 : p.position.x + dt * 1.1)));
      for (let i = 0; i < 4; i++) {
        R.box(0.9, 2.4, 0.9, mat('#111418', { metalness: 0.5 }), -W2(R) + 0.8, 1.2, -3.5 + i * 1.2, { solid: true });
        for (let k = 0; k < 6; k++) R.box(0.05, 0.05, 0.05, glow(k % 2 ? '#2fd17a' : '#33c6ff', 2), -W2(R) + 1.27, 0.4 + k * 0.35, -3.5 + i * 1.2);
      }
      R.desk(-2.5, 2.5, { w: 2.2, screen: { lines: ['n8n', 'workflows'], bg: '#16061a', fg: '#ff6bd5' }, id: info.id });
      R.chair(-2.5, 3.4);
      R.desk(2.5, 2.5, { w: 2.2, screen: { lines: ['CLAUDE', 'routines des agents'], bg: '#1b0f0a', fg: '#ff9a6b' }, id: info.id });
      R.chair(2.5, 3.4);
      bigScreen(R, ['FILE DES TÂCHES', 'les agents formés à la bibliothèque travaillent ici'], info.id, { y: 2.8, w: 6, h: 1.5, bg: '#0b0b12', fg: '#ff6bd5' });
      const gear = R.cyl(0.7, 0.7, 0.15, mat('#e0805f', { metalness: 0.7, roughness: 0.3 }), W2(R) - 0.2, 2.6, 0, { rz: Math.PI / 2, keep: true, seg: 12 });
      R.anims.push((dt) => (gear.rotation.x += dt));
    },
  },
  // ---------- Résidences ----------
  pole: {
    w: 11, d: 9, floor: '#4a3626', wall: '#2c3244', light: '#ffd9a0',
    build(R, info) {
      R.sofa(-2, 1.5, Math.PI, '#33435a');
      R.rug(-2, 0.4, 4, 2.4, info.color || '#2f7d4a');
      R.table(-2, 0.4, 1.4, 0.7);
      R.table(2.5, -2, 2, 1.2, '#6b4a32');
      for (const x of [2, 3]) {
        R.chair(x, -1.2, 0);
        R.chair(x, -2.8, Math.PI);
      }
      R.desk(-3, -2.8, { w: 1.8, screen: { lines: [info.name, 'les habitants'], bg: '#0b0b12', fg: info.color || '#2fd17a' }, id: info.id });
      R.shelf(W2(R) - 0.3, 1.5, { ry: -Math.PI / 2, w: 2.4, h: 2 });
      R.plant(-W2(R) + 0.8, back(R) + 0.8);
    },
  },
  // Maison-projet du Drive : un atelier avec ses dossiers en archives
  house: {
    w: 11, d: 9, floor: '#4a3626', wall: '#2c3244', light: '#ffd9a0',
    build(R, info) {
      R.desk(0, -2.6, { w: 2.4, screen: { lines: [info.name.slice(0, 18), `${(info.items || []).length} éléments`], bg: '#0b0b12', fg: '#ffd76b' }, id: info.id });
      R.chair(0, -1.7);
      archive(R, info.items, -W2(R) + 0.3, 0, Math.PI / 2);
      archive(R, (info.items || []).slice(3), W2(R) - 0.3, 0, -Math.PI / 2);
      R.rug(0, 0.8, 4, 2.6, '#33435a');
      R.plant(W2(R) - 0.8, D2(R) - 1.3);
      R.sofa(0, D2(R) - 2.2, Math.PI, '#3a2a30');
    },
  },
};
