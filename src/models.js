// Modèles 3D procéduraux des bâtiments de Flowcity (style maquette « low-poly »).
// Chaque forme (shape) est construite à partir de primitives ; l'origine est au centre de l'emprise, au sol.
import * as THREE from 'three';

export const TILE = 4;

const matCache = new Map();
export function mat(color, opts = {}) {
  const k = `${color}|${JSON.stringify(opts)}`;
  if (!matCache.has(k)) matCache.set(k, new THREE.MeshStandardMaterial({ color, roughness: 0.78, metalness: 0.05, ...opts }));
  return matCache.get(k);
}
const glassMat = () => mat('#9fd0ff', { roughness: 0.15, metalness: 0.6, emissive: '#1b3550', emissiveIntensity: 0.4 });
const darkMat = () => mat('#2a2f3a');
const whiteMat = () => mat('#f4f1ea');

// Texture de fenêtres (allumées la nuit grâce à l'émissif)
let windowTex = null;
function windowsTexture() {
  if (windowTex) return windowTex;
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#000';
  g.fillRect(0, 0, 64, 64);
  for (let y = 0; y < 2; y++)
    for (let x = 0; x < 2; x++) {
      g.fillStyle = Math.random() > 0.35 ? '#ffd9a0' : '#334';
      g.fillRect(x * 32 + 8, y * 32 + 9, 16, 16);
    }
  windowTex = new THREE.CanvasTexture(c);
  windowTex.wrapS = windowTex.wrapT = THREE.RepeatWrapping;
  windowTex.colorSpace = THREE.SRGBColorSpace;
  return windowTex;
}
// Matériau de façade : couleur + fenêtres qui s'allument la nuit (uniforme partagé `night`)
export const nightUniform = { value: 0 };
const facadeCache = new Map();
function facade(color, rx = 2, ry = 2) {
  const k = `${color}|${rx}|${ry}`;
  if (facadeCache.has(k)) return facadeCache.get(k);
  const tex = windowsTexture().clone();
  tex.needsUpdate = true;
  tex.repeat.set(rx, ry);
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.75, emissiveMap: tex, emissive: '#ffcf8a', emissiveIntensity: 0 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uNight = nightUniform;
    sh.fragmentShader = sh.fragmentShader.replace('uniform vec3 emissive;', 'uniform vec3 emissive;\nuniform float uNight;').replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance = emissive * texture2D(emissiveMap, vEmissiveMapUv).rgb * (0.08 + uNight * 1.25);');
  };
  facadeCache.set(k, m);
  return m;
}

function box(w, h, d, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y + h / 2, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}
function cyl(rt, rb, h, material, x = 0, y = 0, z = 0, seg = 16) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), material);
  m.position.set(x, y + h / 2, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}
// Toit à deux pans (prisme) le long de x
function gable(w, h, d, material, y) {
  const s = new THREE.Shape();
  s.moveTo(-d / 2, 0);
  s.lineTo(d / 2, 0);
  s.lineTo(0, h);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: w, bevelEnabled: false });
  g.translate(0, 0, -w / 2);
  g.rotateY(Math.PI / 2);
  const m = new THREE.Mesh(g, material);
  m.position.y = y;
  m.castShadow = true;
  return m;
}
function dome(r, material, y, x = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), material);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

function tree(x, z, s = 1) {
  const g = new THREE.Group();
  g.add(cyl(0.12 * s, 0.18 * s, 0.9 * s, mat('#7a5230'), 0, 0, 0, 6));
  const top = new THREE.Mesh(new THREE.IcosahedronGeometry(0.75 * s, 0), mat(['#3fa34d', '#4caf50', '#2e8b57', '#5cb85c'][Math.floor(Math.random() * 4)], { flatShading: true }));
  top.position.y = 1.45 * s;
  top.castShadow = true;
  g.add(top);
  g.position.set(x, 0, z);
  return g;
}

// Construit le modèle d'un bâtiment. footprint = [w, d] en cases (déjà tourné si besoin).
export function buildModel(def, footprintTiles, config = {}) {
  const st = { ...(def.style || {}), ...(config.color ? { color: config.color } : {}) };
  const [fw, fd] = footprintTiles;
  const W = fw * TILE;
  const D = fd * TILE;
  const g = new THREE.Group();
  const color = st.color || '#cccccc';
  const accent = st.accent || '#ff5577';
  const floors = st.floors || 1;
  const fh = 1.6;
  const iw = W - 1.0;
  const id = D - 1.0;
  const plinth = () => box(W - 0.3, 0.12, D - 0.3, mat('#d9d6cf'), 0, 0, 0);

  switch (st.shape) {
    case 'hall': {
      g.add(plinth());
      const h = floors * fh + 0.6;
      g.add(box(iw, 0.3, id, mat('#e7e2d6'), 0, 0.12, 0));
      g.add(box(iw * 0.86, h, id * 0.72, mat(color), 0, 0.42, -id * 0.08));
      // colonnes
      const n = Math.max(4, Math.round(iw / 1.1));
      for (let i = 0; i < n; i++) g.add(cyl(0.16, 0.18, h, whiteMat(), -iw * 0.4 + (i * iw * 0.8) / (n - 1), 0.42, id * 0.33, 10));
      g.add(box(iw * 0.92, 0.3, id * 0.86, whiteMat(), 0, 0.42 + h, 0));
      const ped = gable(iw * 0.92, 1.1, id * 0.86, mat(accent), 0.72 + h);
      g.add(ped);
      if (def.name === 'Mairie') {
        g.add(cyl(0.9, 0.9, 0.8, whiteMat(), 0, 1.6 + h, -id * 0.05));
        g.add(dome(0.9, mat(accent), 2.4 + h, 0, -id * 0.05));
        g.add(cyl(0.03, 0.03, 1.6, darkMat(), 0, 3.2 + h, -id * 0.05, 6));
        const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.5), mat('#3a6fe0', { side: THREE.DoubleSide }));
        flag.position.set(0.42, 4.5 + h, -id * 0.05);
        flag.userData.flag = true;
        g.add(flag);
      }
      break;
    }
    case 'school': {
      g.add(plinth());
      const h = floors * fh;
      g.add(box(iw, h, id * 0.5, facade(color, 4, floors), 0, 0.12, -id * 0.25));
      g.add(box(iw * 0.45, h, id * 0.5, facade(color, 2, floors), -iw * 0.275, 0.12, id * 0.25));
      g.add(gable(iw, 1, id * 0.5, mat(accent), 0.12 + h).translateZ(-id * 0.25));
      g.add(box(0.8, 1.4, 0.8, mat(color), iw * 0.2, 0.12 + h, -id * 0.25));
      g.add(new THREE.Mesh(new THREE.ConeGeometry(0.7, 0.9, 4), mat(accent)).translateX(iw * 0.2).translateY(1.97 + h).translateZ(-id * 0.25).rotateY(Math.PI / 4));
      // cour
      g.add(box(iw * 0.5, 0.05, id * 0.45, mat('#c9b48a'), iw * 0.23, 0.12, id * 0.25));
      break;
    }
    case 'power': {
      g.add(plinth());
      g.add(box(iw * 0.5, 1.6, id * 0.6, mat(color), -iw * 0.22, 0.12, id * 0.12));
      for (const [x, z] of [[iw * 0.25, -id * 0.22], [iw * 0.25, id * 0.25]]) {
        const t = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 1.05, 3.4, 20, 1, true), mat('#e6e8ec', { side: THREE.DoubleSide }));
        t.position.set(x, 1.82, z);
        t.castShadow = true;
        g.add(t);
      }
      g.add(box(iw * 0.52, 0.25, 0.15, mat(accent, { emissive: accent, emissiveIntensity: 0.6 }), -iw * 0.22, 1.2, id * 0.43));
      g.add(cyl(0.18, 0.22, 3.2, mat('#9aa1ad'), -iw * 0.38, 0.12, -id * 0.3, 10));
      break;
    }
    case 'office':
    case 'tower': {
      g.add(plinth());
      const h = floors * fh;
      const tall = st.shape === 'tower';
      const bw = tall ? iw * 0.7 : iw;
      const bd = tall ? id * 0.7 : id * 0.8;
      g.add(box(bw, h, bd, tall ? glassMat() : facade(color, Math.max(2, Math.round(bw / 1.2)), floors), 0, 0.12, 0));
      if (tall) for (let i = 1; i < floors; i++) g.add(box(bw + 0.08, 0.12, bd + 0.08, mat(color), 0, 0.12 + i * fh, 0));
      g.add(box(bw + 0.1, 0.25, bd + 0.1, mat(accent), 0, 0.12 + h, 0));
      if (tall) g.add(cyl(0.04, 0.04, 1.6, darkMat(), 0, 0.37 + h, 0, 6));
      else g.add(box(bw * 0.3, 0.6, bd * 0.3, mat('#b8bec8'), bw * 0.2, 0.37 + h, 0));
      break;
    }
    case 'firestation': {
      g.add(plinth());
      const h = floors * fh;
      g.add(box(iw, h, id * 0.8, mat(color), 0, 0.12, -id * 0.05));
      for (let i = 0; i < 3; i++) g.add(box(iw * 0.24, h * 0.55, 0.06, mat(i % 2 ? '#3b3f48' : '#4a4f5a'), -iw * 0.3 + i * iw * 0.3, 0.12, id * 0.36));
      g.add(box(iw + 0.1, 0.25, id * 0.82, mat(accent), 0, 0.12 + h, -id * 0.05));
      g.add(box(0.9, h + 1.4, 0.9, mat(color), iw * 0.38, 0.12, -id * 0.32));
      break;
    }
    case 'hospital': {
      g.add(plinth());
      const h = floors * fh;
      g.add(box(iw, h, id * 0.7, facade(color, 5, floors), 0, 0.12, -id * 0.1));
      g.add(box(iw * 0.5, fh, id * 0.25, glassMat(), 0, 0.12, id * 0.33));
      g.add(box(1.4, 0.35, 0.45, mat(accent, { emissive: accent, emissiveIntensity: 0.5 }), 0, 0.3 + h, -id * 0.1));
      g.add(box(0.45, 0.35, 1.4, mat(accent, { emissive: accent, emissiveIntensity: 0.5 }), 0, 0.3 + h, -id * 0.1));
      break;
    }
    case 'police': {
      g.add(plinth());
      const h = floors * fh;
      g.add(box(iw, h, id * 0.8, facade(color, 4, floors), 0, 0.12, 0));
      g.add(box(iw + 0.1, 0.25, id * 0.82, mat(accent), 0, 0.12 + h, 0));
      g.add(box(1.2, 0.25, 0.4, mat('#ff2244', { emissive: '#ff2244', emissiveIntensity: 1 }), -0.35, 0.37 + h, 0));
      g.add(box(0.6, 0.25, 0.4, mat('#2266ff', { emissive: '#2266ff', emissiveIntensity: 1 }), 0.55, 0.37 + h, 0));
      break;
    }
    case 'observatory': {
      g.add(plinth());
      g.add(cyl(iw * 0.36, iw * 0.4, 2.2, mat(color), 0, 0.12, 0, 24));
      const d = dome(iw * 0.36, mat('#d7dbe3', { metalness: 0.4, roughness: 0.3 }), 2.32);
      g.add(d);
      const tube = cyl(0.25, 0.32, 2.2, mat(accent), 0, 0, 0, 12);
      tube.rotation.z = -0.7;
      tube.position.set(0.6, 3.1, 0);
      g.add(tube);
      break;
    }
    case 'house':
    case 'residence': {
      g.add(plinth());
      const h = floors * (st.shape === 'residence' ? 1.3 : 1.25);
      const bw = st.shape === 'residence' ? iw * 0.85 : iw * 0.75;
      const bd = st.shape === 'residence' ? id * 0.85 : id * 0.6;
      g.add(box(bw, h, bd, facade(color, 2, floors), 0, 0.12, -id * 0.05));
      g.add(gable(bw + 0.2, Math.min(1.4, bw * 0.45), bd + 0.3, mat(accent), 0.12 + h).translateZ(-id * 0.05));
      g.add(box(0.3, 0.9, 0.3, mat('#8d6e63'), bw * 0.28, 0.12 + h + 0.3, -id * 0.1));
      g.add(box(0.5, 0.9, 0.06, mat('#6d4c41'), 0, 0.12, -id * 0.05 + bd / 2 + 0.01));
      if (st.shape === 'house') {
        g.add(tree(-iw * 0.38, id * 0.35, 0.6));
        g.add(box(iw * 0.9, 0.3, 0.08, mat('#ffffff'), 0, 0.12, id * 0.46));
      }
      break;
    }
    case 'post': {
      g.add(plinth());
      const h = floors * fh;
      g.add(box(iw, h, id * 0.75, facade(color, 4, floors), 0, 0.12, -id * 0.05));
      g.add(box(iw + 0.1, 0.4, id * 0.77, mat(accent), 0, 0.12 + h, -id * 0.05));
      g.add(box(iw * 0.6, 0.5, 0.1, mat(accent), 0, 0.12 + h * 0.7, id * 0.33));
      // boîte aux lettres
      g.add(box(0.4, 0.8, 0.35, mat('#ffd84d'), iw * 0.38, 0.12, id * 0.42));
      break;
    }
    case 'warehouse': {
      g.add(plinth());
      g.add(box(iw, 1.4, id * 0.85, mat(color), 0, 0.12, 0));
      const roof = new THREE.Mesh(new THREE.CylinderGeometry(id * 0.43, id * 0.43, iw, 20, 1, false, 0, Math.PI), mat(accent));
      roof.rotation.z = Math.PI / 2; // axe le long de x, demi-cylindre vers le haut
      roof.position.y = 1.52;
      roof.castShadow = true;
      g.add(roof);
      g.add(box(iw * 0.35, 1.0, 0.06, darkMat(), 0, 0.12, id * 0.43));
      break;
    }
    case 'clock': {
      g.add(plinth());
      const h = floors * fh;
      g.add(box(iw * 0.9, h, id * 0.9, mat(color), 0, 0.12, 0));
      for (const [x, z, ry] of [[0, id * 0.451, 0], [0, -id * 0.451, Math.PI], [id * 0.451, 0, Math.PI / 2], [-id * 0.451, 0, -Math.PI / 2]]) {
        const face = new THREE.Mesh(new THREE.CircleGeometry(iw * 0.32, 24), mat('#fbf6e9', { emissive: '#fff2c8', emissiveIntensity: 0.25 }));
        face.position.set(x, h - 0.6, z);
        face.rotation.y = ry;
        g.add(face);
        const hand = new THREE.Mesh(new THREE.PlaneGeometry(0.06, iw * 0.26), darkMat());
        hand.position.set(x * 1.002, h - 0.6, z * 1.002);
        hand.rotation.y = ry;
        hand.userData.clockHand = true;
        g.add(hand);
      }
      const cone = new THREE.Mesh(new THREE.ConeGeometry(iw * 0.72, 1.8, 4), mat(accent));
      cone.position.y = 0.12 + h + 0.9;
      cone.rotation.y = Math.PI / 4;
      cone.castShadow = true;
      g.add(cone);
      break;
    }
    case 'antenna': {
      g.add(plinth());
      g.add(box(iw * 0.7, 0.8, id * 0.7, mat('#c9ced8'), 0, 0.12, 0));
      const h = floors * 1.2;
      for (const [x, z] of [[-0.35, -0.35], [0.35, -0.35], [-0.35, 0.35], [0.35, 0.35]]) {
        const leg = cyl(0.05, 0.05, h, mat(color), x * 0.6, 0.9, z * 0.6, 6);
        leg.rotation.z = x * -0.05;
        g.add(leg);
      }
      for (let i = 1; i < floors; i++) g.add(box(0.5, 0.05, 0.5, mat(i % 2 ? accent : color), 0, 0.9 + i * 1.2, 0));
      const dish = new THREE.Mesh(new THREE.SphereGeometry(0.45, 16, 8, 0, Math.PI * 2, 0, Math.PI / 3), mat('#ffffff', { side: THREE.DoubleSide }));
      dish.position.set(0.35, 0.9 + h * 0.6, 0);
      dish.rotation.z = Math.PI / 2;
      g.add(dish);
      const light = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), mat(accent, { emissive: accent, emissiveIntensity: 2 }));
      light.position.y = 0.95 + h;
      light.userData.blink = true;
      g.add(light);
      break;
    }
    case 'shop': {
      g.add(plinth());
      const h = Math.max(1, floors) * fh;
      g.add(box(iw, h, id * 0.75, facade(color, 3, floors), 0, 0.12, -id * 0.08));
      g.add(box(iw * 0.8, 1.0, 0.06, glassMat(), 0, 0.3, id * 0.3));
      const awn = box(iw * 0.95, 0.12, 1.0, mat(accent), 0, 1.45, id * 0.38);
      awn.rotation.x = 0.25;
      g.add(awn);
      g.add(box(iw + 0.1, 0.25, id * 0.77, mat(accent), 0, 0.12 + h, -id * 0.08));
      break;
    }
    case 'station': {
      g.add(plinth());
      g.add(box(iw * 0.55, 2.2, id * 0.55, facade(color, 3, 1), -iw * 0.18, 0.12, -id * 0.15));
      g.add(gable(iw * 0.55, 0.9, id * 0.55, mat(accent), 2.32).translateX(-iw * 0.18).translateZ(-id * 0.15));
      g.add(box(iw, 0.12, id * 0.3, mat(accent), 0, 2.0, id * 0.3));
      for (const x of [-iw * 0.45, 0, iw * 0.45]) g.add(cyl(0.07, 0.07, 1.9, darkMat(), x, 0.12, id * 0.42, 6));
      // rails
      g.add(box(iw, 0.06, 0.12, mat('#777'), 0, 0.12, id * 0.38));
      g.add(box(iw, 0.06, 0.12, mat('#777'), 0, 0.12, id * 0.46));
      const clockFace = new THREE.Mesh(new THREE.CircleGeometry(0.4, 20), mat('#fff'));
      clockFace.position.set(-iw * 0.18, 1.8, -id * 0.15 + id * 0.276);
      g.add(clockFace);
      break;
    }
    case 'factory': {
      g.add(plinth());
      const h = floors * fh;
      g.add(box(iw, h, id * 0.8, mat(color), 0, 0.12, 0));
      const n = 3;
      for (let i = 0; i < n; i++) {
        const tooth = gable(id * 0.8, 0.9, iw / n - 0.05, mat(accent), 0.12 + h);
        tooth.rotation.y = Math.PI / 2; // shed : faîtages parallèles à la profondeur
        tooth.position.x = -iw / 2 + (iw / n) * (i + 0.5);
        g.add(tooth);
      }
      for (const [x, z] of [[iw * 0.35, -id * 0.3], [iw * 0.15, -id * 0.3]]) {
        g.add(cyl(0.3, 0.38, h + 3, mat('#8f5a6b'), x, 0.12, z, 12));
        const smoke = new THREE.Mesh(new THREE.IcosahedronGeometry(0.4, 0), mat('#ffffff', { transparent: true, opacity: 0.55, flatShading: true }));
        smoke.position.set(x, h + 3.6, z);
        smoke.userData.smoke = { x, z, y: h + 3.6 };
        g.add(smoke);
      }
      break;
    }
    case 'lab': {
      g.add(plinth());
      const h = floors * fh;
      g.add(box(iw, h * 0.6, id * 0.85, mat(color), 0, 0.12, 0));
      g.add(dome(Math.min(iw, id) * 0.38, mat('#bfe6ff', { transparent: true, opacity: 0.75, roughness: 0.1, metalness: 0.3 }), 0.12 + h * 0.6));
      const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.45, 1), mat(accent, { emissive: accent, emissiveIntensity: 1.4, flatShading: true }));
      core.position.y = 0.12 + h * 0.6 + 0.7;
      core.userData.spin = true;
      g.add(core);
      break;
    }
    case 'workshop': {
      g.add(plinth());
      g.add(box(iw * 0.85, 1.3, id * 0.75, mat(color), 0, 0.12, 0));
      g.add(gable(iw * 0.95, 0.8, id * 0.85, mat(accent), 1.42));
      const gear = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.11, 6, 8), mat('#8a93a3', { metalness: 0.5 }));
      gear.position.set(0, 1.0, id * 0.38 + 0.02);
      gear.userData.spin = true;
      g.add(gear);
      break;
    }
    case 'tree':
      g.add(tree(0, 0, 1.1));
      break;
    case 'park': {
      g.add(box(W - 0.2, 0.08, D - 0.2, mat('#6cc070'), 0, 0, 0));
      g.add(box(0.7, 0.09, D - 0.4, mat('#d8c9a3'), 0, 0, 0));
      for (const [x, z, s] of [[-W * 0.3, -D * 0.28, 1], [W * 0.28, -D * 0.3, 0.8], [-W * 0.28, D * 0.25, 0.9], [W * 0.3, D * 0.3, 1.1]]) g.add(tree(x, z, s));
      for (const z of [-D * 0.12, D * 0.12]) g.add(box(0.9, 0.35, 0.3, mat('#8d6e63'), 0.75, 0.08, z));
      for (let i = 0; i < 10; i++) {
        const f = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 4), mat(['#ff5577', '#ffd23f', '#ffffff', '#c86bff'][i % 4]));
        f.position.set((Math.random() - 0.5) * W * 0.8, 0.15, (Math.random() - 0.5) * D * 0.8);
        if (Math.abs(f.position.x) > 0.6) g.add(f);
      }
      break;
    }
    case 'fountain': {
      g.add(box(W - 0.2, 0.08, D - 0.2, mat('#d9d4c7'), 0, 0, 0));
      g.add(cyl(W * 0.33, W * 0.35, 0.45, mat('#cfd8e3'), 0, 0.08, 0, 28));
      const water = new THREE.Mesh(new THREE.CircleGeometry(W * 0.31, 28), mat('#5ab8ff', { roughness: 0.1, metalness: 0.2, emissive: '#1a5a8a', emissiveIntensity: 0.3 }));
      water.rotation.x = -Math.PI / 2;
      water.position.y = 0.5;
      g.add(water);
      g.add(cyl(0.18, 0.25, 1.4, mat('#cfd8e3'), 0, 0.5, 0, 12));
      const jet = new THREE.Mesh(new THREE.ConeGeometry(0.35, 1.1, 12, 1, true), mat('#bfe6ff', { transparent: true, opacity: 0.6 }));
      jet.position.y = 2.3;
      jet.rotation.x = Math.PI;
      jet.userData.jet = true;
      g.add(jet);
      break;
    }
    case 'lamp': {
      g.add(cyl(0.05, 0.07, 2.2, darkMat(), 0, 0, 0, 6));
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 8), mat('#fff3c4', { emissive: '#ffd27a', emissiveIntensity: 0.4 }));
      bulb.position.y = 2.3;
      bulb.userData.lamp = true;
      g.add(bulb);
      break;
    }
    default:
      g.add(plinth());
      g.add(box(iw, floors * fh, id, mat(color), 0, 0.12, 0));
  }
  return g;
}

// Arbres du décor autour de la carte
export { tree as makeTree };
