// Boîte à outils des intérieurs : une pièce = sol, murs (avec ouvertures de portes), plafond, lumières,
// objets de déco, objets utilisables (visés + E) et obstacles. Utilisée par les bureaux privés et par
// les intérieurs de tous les bâtiments. Les pièces sont construites sous la ville (y négatif) et la ville
// est masquée pendant la visite : seule la pièce est dessinée.
import * as THREE from 'three';
import { textTexture } from './landmarks.js';
import { bake } from './bake.js';

const mats = new Map();
// Matériau partagé par couleur + réglages (les pièces se reconstruisent sans multiplier les matériaux)
export function mat(color, o = {}) {
  const k = `${color}|${JSON.stringify(o)}`;
  if (!mats.has(k)) mats.set(k, new THREE.MeshStandardMaterial({ color, roughness: 0.7, ...o }));
  return mats.get(k);
}
export const glow = (color, intensity = 1.4) => mat('#000000', { emissive: color, emissiveIntensity: intensity });

export class Room {
  /**
   * w × d (x × z), hauteur h ; le sol est à y. Les portes sont des ouvertures dans les murs :
   * doors = [{ side: 'front'|'back'|'left'|'right', at: position le long du mur, width }]
   */
  constructor({ w = 12, d = 10, h = 4, y = -80, floor = '#3a2a20', wall = '#2c3244', ceil = '#15171f', trim = '#e9e2d4', doors = [{ side: 'front', at: 0, width: 1.5 }], name = '' } = {}) {
    Object.assign(this, { w, d, h, y, name });
    this.group = new THREE.Group();
    this.group.position.set(0, y, 0);
    this.pick = [];
    this.colliders = [];
    this.anims = [];
    this.lights = 0;
    // Sol, plafond, plinthes
    this.box(w, 0.1, d, mat(floor, { roughness: 0.6 }), 0, -0.05, 0);
    this.box(w, 0.12, d, mat(ceil), 0, h + 0.06, 0);
    const W = mat(wall, { roughness: 0.85 });
    const T = mat(trim, { roughness: 0.6 });
    const sides = {
      back: { len: w, pos: (u) => [u, -d / 2], rot: false },
      front: { len: w, pos: (u) => [u, d / 2], rot: false },
      left: { len: d, pos: (u) => [-w / 2, u], rot: true },
      right: { len: d, pos: (u) => [w / 2, u], rot: true },
    };
    for (const [side, S] of Object.entries(sides)) {
      const gaps = doors.filter((x) => x.side === side).map((x) => [x.at - x.width / 2, x.at + x.width / 2]).sort((a, b) => a[0] - b[0]);
      let u = -S.len / 2;
      const segs = [];
      for (const [a, b] of gaps) {
        if (a > u) segs.push([u, a]);
        u = b;
      }
      if (u < S.len / 2) segs.push([u, S.len / 2]);
      for (const [a, b] of segs) {
        const len = b - a;
        const mid = (a + b) / 2;
        const [x, z] = S.pos(mid);
        if (S.rot) {
          this.box(0.2, h, len, W, x, h / 2, z, { solid: true });
          this.box(0.24, 0.16, len, T, x, 0.08, z);
        } else {
          this.box(len, h, 0.2, W, x, h / 2, z, { solid: true });
          this.box(len, 0.16, 0.24, T, x, 0.08, z);
        }
      }
      // Linteau au-dessus des portes
      for (const [a, b] of gaps) {
        const [x, z] = S.pos((a + b) / 2);
        if (S.rot) this.box(0.2, h - 2.4, b - a, W, x, 2.4 + (h - 2.4) / 2, z);
        else this.box(b - a, h - 2.4, 0.2, W, x, 2.4 + (h - 2.4) / 2, z);
      }
    }
    this.bounds = { x0: -w / 2 + 0.4, x1: w / 2 - 0.4, z0: -d / 2 + 0.4, z1: d / 2 - 0.4, y0: y, y1: y + h - 0.2 };
    this.floorY = y;
    this.spawn = new THREE.Vector3(0, y, d / 2 - 1.3);
    this.ambient(0.9);
  }

  // ---------- Primitives (coordonnées locales, y depuis le sol) ----------
  add(mesh, x, yy, z, o = {}) {
    mesh.position.set(x, yy, z);
    if (o.ry) mesh.rotation.y = o.ry;
    if (o.rx) mesh.rotation.x = o.rx;
    if (o.rz) mesh.rotation.z = o.rz;
    mesh.castShadow = false;
    mesh.receiveShadow = !o.noShadow;
    this.group.add(mesh);
    if (o.id) this.use(mesh, o.id);
    if (o.keep) mesh.userData.keep = true;
    if (o.solid) {
      // Boîte dans le repère de la pièce (la pièce est centrée en x = z = 0)
      mesh.updateMatrix();
      if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
      const bb = mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrix);
      this.colliders.push({ x0: bb.min.x, x1: bb.max.x, z0: bb.min.z, z1: bb.max.z, top: this.y + bb.max.y });
    }
    return mesh;
  }
  box(sx, sy, sz, m, x, yy, z, o = {}) {
    return this.add(new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), m), x, yy, z, o);
  }
  cyl(rt, rb, hh, m, x, yy, z, o = {}) {
    return this.add(new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, hh, o.seg || 16), m), x, yy, z, o);
  }
  ball(r, m, x, yy, z, o = {}) {
    return this.add(new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), m), x, yy, z, o);
  }
  // Panneau à texte (affiche, écran, enseigne)
  sign(lines, sw, sh, x, yy, z, { ry = 0, bg = '#111', fg = '#fff', glow: g = 0.6, font, id, w = 512, h = 256 } = {}) {
    // Taille de police adaptée à la ligne la plus longue (le texte ne déborde pas)
    const longest = Math.max(...(Array.isArray(lines) ? lines : [lines]).map((l) => String(l).length), 1);
    const px = Math.round(Math.min(h / 4, (w * 1.75) / longest));
    const tex = textTexture(lines, { w, h, bg, fg, font: font || `bold ${px}px Inter Variable, sans-serif` });
    const m = new THREE.MeshStandardMaterial({ map: tex, emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: g, roughness: 0.5 });
    return this.add(new THREE.Mesh(new THREE.PlaneGeometry(sw, sh), m), x, yy, z, { ry, id, keep: true });
  }
  use(mesh, id) {
    mesh.userData.nodeId = id;
    this.pick.push(mesh);
    return mesh;
  }
  light(color, intensity, dist, x, yy, z) {
    if (this.lights >= 4) return null;
    this.lights++;
    const l = new THREE.PointLight(color, intensity, dist, 1.5);
    l.position.set(x, yy, z);
    this.group.add(l);
    return l;
  }
  ambient(i) {
    this.group.add(new THREE.HemisphereLight('#c9d0ff', '#3a2a24', i));
  }

  // ---------- Mobilier réutilisable ----------
  desk(x, z, { ry = 0, w = 2.2, color = '#4a2e1f', screen = null, id = null } = {}) {
    const top = this.box(w, 0.08, 1, mat(color, { roughness: 0.5 }), x, 0.92, z, { ry, solid: true });
    const leg = mat('#1a1a1f', { metalness: 0.6, roughness: 0.4 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const p = rot(sx * (w / 2 - 0.08), sz * 0.42, ry);
      this.box(0.06, 0.9, 0.06, leg, x + p[0], 0.45, z + p[1]);
    }
    if (screen) {
      const p = rot(0, -0.3, ry);
      this.sign(screen.lines, 0.95, 0.55, x + p[0], 1.33, z + p[1], { ry, bg: screen.bg || '#0b1020', fg: screen.fg || '#7fd4ff', glow: 1, id, w: 384, h: 224 });
      this.box(0.06, 0.3, 0.06, leg, x + p[0], 1.06, z + p[1] - 0.02);
    }
    return top;
  }
  chair(x, z, ry = 0, color = '#1a1a22') {
    const m = mat(color, { roughness: 0.5 });
    this.box(0.55, 0.08, 0.55, m, x, 0.5, z, { ry });
    const p = rot(0, 0.27, ry);
    this.box(0.55, 0.6, 0.07, m, x + p[0], 0.82, z + p[1], { ry });
    this.box(0.06, 0.48, 0.06, mat('#333'), x, 0.24, z);
  }
  shelf(x, z, { ry = 0, w = 2.4, h = 2.4, color = '#2c2119', items = 'books' } = {}) {
    const m = mat(color);
    const back = this.box(w, h, 0.4, m, x, h / 2, z, { ry, solid: true });
    const cols = items === 'records' ? ['#111', '#c9a227', '#111', '#e8e2d4'] : items === 'boxes' ? ['#8a6b4a', '#a9845a', '#6d5236'] : ['#c8102e', '#1f6fbf', '#ffb020', '#2fd17a', '#9b7bff', '#e8e2d4'];
    const rows = Math.floor(h / 0.55);
    const n = Math.floor(w / 0.26);
    for (let r = 0; r < rows; r++) {
      for (let i = 0; i < n; i++) {
        if ((r * 7 + i * 3) % 5 === 0) continue;
        const p = rot(-w / 2 + 0.18 + i * 0.26, 0.24, ry);
        const hh = items === 'boxes' ? 0.35 : 0.3 + ((r + i) % 3) * 0.04;
        this.box(items === 'records' ? 0.04 : 0.2, hh, items === 'boxes' ? 0.3 : 0.24, mat(cols[(r + i) % cols.length]), x + p[0], 0.3 + r * 0.55 + hh / 2, z + p[1], { ry });
      }
    }
    return back;
  }
  plant(x, z, s = 1) {
    this.cyl(0.24 * s, 0.18 * s, 0.45 * s, mat('#8a4b32'), x, 0.22 * s, z, { solid: true });
    this.add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.5 * s, 1), mat('#1f6b4a', { flatShading: true })), x, 0.85 * s, z);
  }
  sofa(x, z, ry = 0, color = '#3a1420') {
    const m = mat(color, { roughness: 0.9 });
    this.box(2.4, 0.45, 0.9, m, x, 0.23, z, { ry, solid: true });
    const p = rot(0, 0.4, ry);
    this.box(2.4, 0.7, 0.2, m, x + p[0], 0.6, z + p[1], { ry });
  }
  rug(x, z, w, d, color = '#5a1020') {
    this.box(w, 0.02, d, mat(color, { roughness: 0.95 }), x, 0.012, z);
  }
  table(x, z, w = 1.6, d = 0.9, color = '#6b4a32') {
    this.box(w, 0.07, d, mat(color, { roughness: 0.5 }), x, 0.78, z, { solid: true });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) this.box(0.06, 0.76, 0.06, mat('#2a2a30'), x + sx * (w / 2 - 0.08), 0.38, z + sz * (d / 2 - 0.08));
  }
  counter(x, z, w, { ry = 0, color = '#2a2d36', top = '#d8d2c4', id = null } = {}) {
    const c = this.box(w, 1.05, 0.7, mat(color), x, 0.52, z, { ry, solid: true });
    const t = this.box(w + 0.1, 0.06, 0.8, mat(top, { roughness: 0.35 }), x, 1.08, z, { ry });
    if (id) {
      this.use(c, id);
      this.use(t, id);
    }
    return c;
  }
  speaker(x, z, s = 1, ry = 0) {
    this.box(0.6 * s, 1.1 * s, 0.5 * s, mat('#111114'), x, 0.55 * s, z, { ry, solid: true });
    const p = rot(0, -0.26 * s, ry);
    this.cyl(0.2 * s, 0.2 * s, 0.03, mat('#2a2a30', { metalness: 0.5 }), x + p[0], 0.4 * s, z + p[1], { rx: Math.PI / 2, ry });
    this.cyl(0.09 * s, 0.09 * s, 0.03, mat('#2a2a30', { metalness: 0.5 }), x + p[0], 0.85 * s, z + p[1], { rx: Math.PI / 2, ry });
  }
  // Cadre doré accroché au mur (ry = orientation de la face visible)
  frame(x, yy, z, w, h, ry, color) {
    this.box(w + 0.12, h + 0.12, 0.05, mat('#c9a227', { metalness: 0.8, roughness: 0.3 }), x, yy, z, { ry });
    this.box(w, h, 0.02, mat(color), x + Math.sin(ry) * 0.03, yy, z + Math.cos(ry) * 0.03, { ry });
  }
  // Porte de sortie (sur le mur de devant) : viser + E pour ressortir dans la ville
  exit(x = 0, side = 'front') {
    const z = side === 'front' ? this.d / 2 - 0.05 : -this.d / 2 + 0.05;
    this.box(1.3, 2.35, 0.08, mat('#5b3a2a', { roughness: 0.6 }), x, 1.18, z, { id: 'room:exit' });
    this.sign('SORTIE', 0.9, 0.28, x, 2.6, z - (side === 'front' ? 0.06 : -0.06), { ry: side === 'front' ? Math.PI : 0, bg: '#0f7a3a', fg: '#fff', glow: 0.9, w: 256, h: 80, id: 'room:exit' });
    this.spawn.set(x, this.y, side === 'front' ? this.d / 2 - 1.3 : -this.d / 2 + 1.3);
  }
  // Fin de construction : fusion du décor statique (seuls les objets utilisables / animés restent à part)
  finish() {
    bake(this.group);
    this.anim = (dt, t) => this.anims.forEach((fn) => fn(dt, t));
    return this;
  }
}

// Décalage (dx, dz) tourné de ry autour de l'axe vertical
function rot(dx, dz, ry) {
  const c = Math.cos(ry);
  const s = Math.sin(ry);
  return [dx * c + dz * s, -dx * s + dz * c];
}
