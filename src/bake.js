// Fusion de géométries statiques : des centaines de petits objets qui partagent le même matériau
// deviennent un seul objet à dessiner. C'est ce qui rend la ville fluide (moins d'appels de dessin).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const ATTRS = ['position', 'normal', 'uv'];

// Géométrie "à plat" (sans index, avec position / normal / uv) dans le repère de `root`.
function normalized(mesh, toRoot) {
  let g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
  for (const k of Object.keys(g.attributes)) if (!ATTRS.includes(k)) g.deleteAttribute(k);
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  g.morphAttributes = {};
  g.clearGroups();
  g.applyMatrix4(toRoot);
  return g;
}

/**
 * Fusionne tous les maillages statiques sous `root` (repère local de root), par matériau.
 * Ignore : maillages instanciés, cliquables (userData.nodeId), marqués userData.keep, multi-matériaux.
 * Les étiquettes (CSS2D) et autres objets non maillés restent en place.
 */
export function bake(root, { minGroup = 2 } = {}) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const buckets = new Map();
  // Les sous-arbres marqués userData.noBake (bâtiments animés…) ne sont pas touchés.
  (function visit(o) {
    if (o !== root && o.userData.noBake) return;
    for (const c of o.children) visit(c);
    if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || o === root) return;
    if (o.userData.nodeId || o.userData.keep || Array.isArray(o.material) || !o.visible) return;
    const key = `${o.material.uuid}|${o.castShadow ? 1 : 0}|${o.receiveShadow ? 1 : 0}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(o);
  })(root);
  let merged = 0;
  const emptied = new Set();
  for (const list of buckets.values()) {
    if (list.length < minGroup) continue;
    const toRoot = new THREE.Matrix4();
    const geos = list.map((m) => normalized(m, toRoot.multiplyMatrices(inv, m.matrixWorld)));
    const geo = mergeGeometries(geos, false);
    geos.forEach((g) => g.dispose());
    if (!geo) continue;
    geo.computeBoundingSphere();
    const out = new THREE.Mesh(geo, list[0].material);
    out.castShadow = list[0].castShadow;
    out.receiveShadow = list[0].receiveShadow;
    out.userData.baked = true;
    out.matrixAutoUpdate = false;
    root.add(out);
    for (const m of list) {
      if (m.parent && m.parent !== root) emptied.add(m.parent);
      m.parent?.remove(m);
    }
    merged += list.length;
  }
  // Seuls les groupes que la fusion vient de vider sont retirés (jamais un groupe vide exprès,
  // comme le support d'une maison de pôle qui se construit plus tard)
  for (let g of emptied) {
    while (g && g !== root && g.isGroup && !g.children.length && !g.userData.noBake) {
      const p = g.parent;
      p?.remove(g);
      g = p;
    }
  }
  return merged;
}
