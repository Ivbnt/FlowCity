// Les bureaux privés au sommet de la tour RED STUDIO : un palier, puis deux bureaux côte à côte
// (Vincent à gauche, Ivane à droite). À l'entrée de chacun, une plaque dorée avec le nom et les fonctions.
// Seule la porte de son propre bureau est ouverte ; dedans : poste Claude admin, coffre-fort, baie vitrée.
import * as THREE from 'three';
import { Room, mat, glow } from './rooms.js';

export const OFFICES = [
  { key: 'vincent', name: 'Vincent', side: -1, fallback: ['Président de THE RED STUDIO', 'Maire de la ville'] },
  { key: 'ivane', name: 'Ivane', side: 1, fallback: ['Vice-président · Trésorier', 'Adjoint au maire'] },
];

/**
 * mine = clé du bureau du compte connecté ; members = membres du registre (pour les fonctions sur les plaques).
 */
export function buildOffices({ mine, members = [] }) {
  const W = 26;
  const D = 17;
  const H = 4.2;
  const Z = 1.5; // cloison entre le palier (devant) et les bureaux (derrière)
  const R = new Room({ w: W, d: D, h: H, y: -80, floor: '#2b1e17', wall: '#2c3244', ceil: '#0d0f16', doors: [{ side: 'front', at: 0, width: 1.5 }] });
  const wall = mat('#2c3244', { roughness: 0.85 });
  // Cloison avec deux portes, et mur entre les deux bureaux
  for (const [a, b] of [[-W / 2, -7.25], [-5.75, 5.75], [7.25, W / 2]]) R.box(b - a, H, 0.2, wall, (a + b) / 2, H / 2, Z, { solid: true });
  for (const x of [-6.5, 6.5]) R.box(1.5, H - 2.4, 0.2, wall, x, 2.4 + (H - 2.4) / 2, Z);
  R.box(0.2, H, D / 2 + Z, wall, 0, H / 2, (Z - D / 2) / 2, { solid: true });
  // Bandeau néon rouge
  const neon = glow('#ff2d55', 2);
  R.box(W - 0.4, 0.05, 0.05, neon, 0, H - 0.15, -D / 2 + 0.15);
  R.box(W - 0.4, 0.05, 0.05, neon, 0, H - 0.15, D / 2 - 0.15);

  // ---------- Palier ----------
  R.exit(0);
  R.rug(0, 5, 7, 3.4, '#5a1020');
  R.plant(-11.8, 7.6, 1.1);
  R.plant(11.8, 7.6, 1.1);
  R.sofa(-9, 7.7, Math.PI, '#232838');
  R.sign(['THE RED STUDIO', 'Direction'], 3.2, 1.1, 0, 2.7, Z + 0.12, { bg: '#0b0b12', fg: '#ff2d55', glow: 1.1, w: 512, h: 176 });
  R.light('#ffe2b8', 40, 18, 0, H - 0.4, 5);

  const skyline = skylineTexture();
  for (const o of OFFICES) {
    const m = members.find((x) => (x.name || '').toLowerCase() === o.key);
    const lines = [o.name.toUpperCase(), ...(m ? [m.role, m.title].filter(Boolean) : o.fallback)];
    const cx = o.side * 6.5;
    const own = o.key === mine;
    // Plaque dorée gravée à l'entrée (côté palier)
    R.box(1.7, 0.95, 0.05, mat('#a8841c', { metalness: 1, roughness: 0.25 }), cx + o.side * -1.7, 1.65, Z + 0.13);
    R.sign(lines, 1.55, 0.82, cx + o.side * -1.7, 1.65, Z + 0.165, { bg: '#d4af37', fg: '#2a1d05', glow: 0.35, w: 512, h: 272, font: 'bold 72px Georgia, serif', id: `office:plaque:${o.key}` });
    // Porte : ouverte pour son bureau, fermée (et infranchissable) pour l'autre
    const leaf = mat(own ? '#6b4a32' : '#3a2a20', { roughness: 0.55 });
    if (own) R.box(0.06, 2.35, 1.4, leaf, cx - 0.72, 1.18, Z - 0.7);
    else R.box(1.45, 2.35, 0.1, leaf, cx, 1.18, Z, { solid: true, id: `office:door:${o.key}` });
    R.ball(0.05, mat('#c9a227', { metalness: 1, roughness: 0.2 }), own ? cx - 0.66 : cx + o.side * 0.5, 1.1, own ? Z - 1.3 : Z + 0.08);

    // ---------- Bureau ----------
    const back = -D / 2 + 0.12;
    const bay = new THREE.Mesh(new THREE.PlaneGeometry(9.5, H - 1.3), new THREE.MeshBasicMaterial({ map: skyline }));
    R.add(bay, cx, H / 2 + 0.15, back, { keep: true });
    for (let i = 0; i <= 4; i++) R.box(0.08, H - 1.3, 0.08, mat('#2a2d36', { metalness: 0.6 }), cx - 4.75 + i * 2.375, H / 2 + 0.15, back + 0.05);
    R.sign(`BUREAU DE ${o.name.toUpperCase()}`, 3, 0.4, cx, H - 0.45, back + 0.06, { bg: '#0b0b12', fg: '#d4af37', glow: 0.9, w: 512, h: 72 });
    R.rug(cx, -4, 5, 3.4, own ? '#5a1020' : '#24304a');
    R.desk(cx, -6.2, { w: 2.8, screen: { lines: ['CLAUDE · ADMIN', `poste de ${o.name}`], bg: '#1b0f0a', fg: '#ff9a6b' }, id: `office:claude:${o.key}` });
    R.chair(cx, -5.3, 0);
    const orb = R.ball(0.15, glow('#e0805f', 1.6), cx + 1.05, 1.2, -6.35, { id: `office:claude:${o.key}`, keep: true });
    R.anims.push((dt, t) => (orb.position.y = 1.2 + Math.sin(t * 2 + o.side) * 0.05));
    R.cyl(0.03, 0.03, 0.55, mat('#ccc', { metalness: 0.8 }), cx - 1.05, 1.22, -6.5);
    R.cyl(0.05, 0.22, 0.24, glow('#ffb45c', 1.4), cx - 1.05, 1.55, -6.45, { seg: 16 });
    // Coffre-fort contre le mur extérieur
    const sx = o.side * (W / 2 - 0.85);
    const safe = R.box(1, 1.6, 1.4, mat('#5d636e', { metalness: 0.85, roughness: 0.3 }), sx, 0.8, -4.2, { solid: true, id: `office:vault:${o.key}` });
    void safe;
    const face = sx - o.side * 0.52;
    R.box(0.05, 1.3, 1.1, mat('#7a818d', { metalness: 0.9, roughness: 0.25 }), face, 0.8, -4.2, { id: `office:vault:${o.key}` });
    const dial = R.cyl(0.16, 0.16, 0.07, mat('#c9a227', { metalness: 1, roughness: 0.2 }), face - o.side * 0.04, 0.95, -4.2, { rz: Math.PI / 2, keep: true, seg: 24 });
    R.anims.push((dt, t) => (dial.rotation.x = Math.sin(t * 0.7) * 0.5));
    R.ball(0.05, glow(own ? '#2fd17a' : '#ff3355', 2), face - o.side * 0.03, 1.4, -3.75);
    // Bibliothèque, canapé, plantes, cadres
    R.shelf(o.side * (W / 2 - 0.3), -0.6, { ry: -o.side * Math.PI / 2, w: 2.6, h: 2.6 });
    R.sofa(o.side * 0.8, -3, o.side * Math.PI / 2, own ? '#3a1420' : '#1f2638');
    R.plant(cx - 4.6, -7.6);
    R.plant(cx + 4.6, -7.6, 0.8);
    R.frame(o.side * 0.13, 2.4, -6, 1.2, 0.8, o.side * Math.PI / 2, '#ff2d55');
    R.light(own ? '#ffe2b8' : '#c9d4ff', own ? 55 : 30, 16, cx, H - 0.4, -3.5);
  }
  R.name = 'Étage de la direction';
  return R.finish();
}

// Vue de nuit sur la ville (gratte-ciel et fenêtres allumées), dessinée une fois.
function skylineTexture() {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 384;
  const x = c.getContext('2d');
  const sky = x.createLinearGradient(0, 0, 0, c.height);
  sky.addColorStop(0, '#05050c');
  sky.addColorStop(0.7, '#2a0d22');
  sky.addColorStop(1, '#4a1022');
  x.fillStyle = sky;
  x.fillRect(0, 0, c.width, c.height);
  let s = 3;
  const r = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
  for (let i = 0; i < 80; i++) {
    x.fillStyle = `rgba(220,220,255,${0.3 + r() * 0.6})`;
    x.fillRect(r() * c.width, r() * c.height * 0.5, 1.5, 1.5);
  }
  for (let layer = 0; layer < 2; layer++) {
    for (let bx = -20; bx < c.width; ) {
      const bw = 30 + r() * 70;
      const bh = (layer ? 120 : 60) + r() * (layer ? 200 : 140);
      x.fillStyle = layer ? '#0b0b14' : '#15131f';
      x.fillRect(bx, c.height - bh, bw, bh);
      for (let wy = c.height - bh + 8; wy < c.height - 6; wy += 12) for (let wx = bx + 5; wx < bx + bw - 6; wx += 10) if (r() < 0.35) {
        x.fillStyle = r() < 0.15 ? '#ff5577' : '#ffd9a0';
        x.fillRect(wx, wy, 4, 6);
      }
      bx += bw + 4;
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
