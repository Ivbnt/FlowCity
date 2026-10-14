// Cycle jour / nuit calé sur l'heure réelle : on calcule la position du soleil
// (élévation + azimut) pour Villejuif, donc les levers/couchers suivent les saisons.
import * as THREE from 'three';

export const STUDIO_LOCATION = { lat: 48.79, lon: 2.36 };

const rad = Math.PI / 180;

// Position solaire approchée (précision ~1°, largement suffisante pour l'ambiance).
export function sunPosition(date = new Date(), { lat, lon } = STUDIO_LOCATION) {
  const d = date.getTime() / 86400000 - 10957.5; // jours depuis J2000
  const g = (357.529 + 0.98560028 * d) * rad;
  const q = 280.459 + 0.98564736 * d;
  const L = (q + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * rad;
  const e = (23.439 - 0.00000036 * d) * rad;
  const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L));
  const dec = Math.asin(Math.sin(e) * Math.sin(L));
  const gmst = (18.697374558 + 24.06570982441908 * d) % 24;
  const ha = (gmst * 15 + lon) * rad - ra;
  const phi = lat * rad;
  const elevation = Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(ha));
  const azimuth = Math.atan2(-Math.sin(ha), Math.tan(dec) * Math.cos(phi) - Math.sin(phi) * Math.cos(ha));
  return { elevation: elevation / rad, azimuth };
}

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// Palette des ambiances
const C = {
  nightHemiSky: new THREE.Color('#6a6dff'),
  dayHemiSky: new THREE.Color('#d7ecff'),
  nightHemiGround: new THREE.Color('#1a0610'),
  dayHemiGround: new THREE.Color('#5a5446'),
  moon: new THREE.Color('#cfd6ff'),
  sunLow: new THREE.Color('#ff9a5c'),
  sunHigh: new THREE.Color('#fff4e0'),
  nightGround: new THREE.Color('#0a0a12'),
  dayGround: new THREE.Color('#a9b98f'),
  // Dôme : zénith / horizon / sol pour la nuit, le jour et le crépuscule
  nightTop: new THREE.Color('#04040a'),
  nightHorizon: new THREE.Color('#1c0f26'),
  dayTop: new THREE.Color('#3f8fe0'),
  dayHorizon: new THREE.Color('#cfe6f7'),
  duskTop: new THREE.Color('#2b2a6b'),
  duskHorizon: new THREE.Color('#ff8a5c'),
  nightTree: new THREE.Color('#12392b'),
  dayTree: new THREE.Color('#4f9d5a'),
};

/**
 * Renvoie l'état d'ambiance pour une date (ou un mode forcé "day" / "night").
 * day : 0 = nuit noire, 1 = plein jour ; dusk : intensité des couleurs de lever/coucher.
 */
export function skyState(mode = 'auto', date = new Date()) {
  const sun = sunPosition(date);
  let elev = sun.elevation;
  let az = sun.azimuth;
  if (mode === 'day') {
    elev = 45;
    az = 0.6;
  } else if (mode === 'night') {
    elev = -30;
  }
  const day = smooth(-6, 12, elev);
  const dusk = Math.max(0, 1 - Math.abs(elev - 1) / 9) * (mode === 'auto' ? 1 : 0);
  return { day, dusk, elevation: elev, azimuth: az, label: day > 0.7 ? 'Jour' : dusk > 0.35 ? (date.getHours() < 12 ? 'Aube' : 'Crépuscule') : day > 0.2 ? 'Jour' : 'Nuit' };
}

// Applique l'ambiance à la scène de la ville.
export function applySky(city, s) {
  const { day, dusk } = s;
  const top = C.nightTop.clone().lerp(C.dayTop, day).lerp(C.duskTop, dusk * 0.6);
  const horizon = C.nightHorizon.clone().lerp(C.dayHorizon, day).lerp(C.duskHorizon, dusk * 0.75);
  const u = city.skyUniforms;
  u.top.value.copy(top);
  u.horizon.value.copy(horizon);
  u.bottom.value.copy(horizon).multiplyScalar(0.6);
  city.scene.fog.color.copy(horizon).lerp(top, 0.25);
  city.scene.fog.density = THREE.MathUtils.lerp(0.004, 0.0016, day);

  city.hemi.color.copy(C.nightHemiSky).lerp(C.dayHemiSky, day);
  city.hemi.groundColor.copy(C.nightHemiGround).lerp(C.dayHemiGround, day);
  city.hemi.intensity = THREE.MathUtils.lerp(0.55, 1.25, day);

  // Soleil le jour, lune la nuit : même lumière directionnelle qui porte les ombres.
  const elevR = Math.max(s.elevation, 8) * (Math.PI / 180);
  if (day > 0.05) {
    const dir = new THREE.Vector3(Math.sin(s.azimuth) * Math.cos(elevR), Math.sin(elevR), Math.cos(s.azimuth) * Math.cos(elevR));
    city.sunLight.position.copy(dir.multiplyScalar(150));
  } else {
    city.sunLight.position.set(-60, 110, 40);
  }
  city.sunLight.color.copy(C.moon).lerp(C.sunHigh, day).lerp(C.sunLow, dusk * 0.7);
  // Disque du soleil le jour, de la lune la nuit
  if (day > 0.05 || dusk > 0.2) {
    const e = s.elevation * (Math.PI / 180);
    u.sunDir.value.set(Math.sin(s.azimuth) * Math.cos(e), Math.sin(e), Math.cos(s.azimuth) * Math.cos(e)).normalize();
    u.sunColor.value.copy(C.sunHigh).lerp(C.sunLow, dusk);
    u.sunSize.value = 0.9993;
    u.glow.value = 0.55;
  } else {
    u.sunDir.value.set(-0.45, 0.5, -0.75).normalize();
    u.sunColor.value.copy(C.moon);
    u.sunSize.value = 0.99965;
    u.glow.value = 0.12;
  }
  city.treeMat.color.copy(C.nightTree).lerp(C.dayTree, day);
  city.lampMat.emissiveIntensity = THREE.MathUtils.lerp(2.4, 0.05, day);
  if (city.glassMat) city.glassMat.emissiveIntensity = THREE.MathUtils.lerp(1.3, 0.12, day);
  if (city.hall?.beamMat) city.hall.beamMat.opacity = THREE.MathUtils.lerp(0.14, 0.0, day);
  for (const pm of city.platformMats || []) pm.mat.color.copy(pm.night).lerp(pm.day, day);
  city.sunLight.intensity = THREE.MathUtils.lerp(1.1, 2.8, day);

  city.groundMat.color.copy(C.nightGround).lerp(C.dayGround, day);
  city.grid.material.opacity = THREE.MathUtils.lerp(0.35, 0.12, day);
  city.stars.material.opacity = 1 - smooth(0.05, 0.4, day);
  city.dust.material.opacity = THREE.MathUtils.lerp(0.6, 0.15, day);
  city.redGlow.intensity = THREE.MathUtils.lerp(400, 90, day);
  city.bloom.strength = THREE.MathUtils.lerp(0.85, 0.3, day);
  city.bloom.threshold = THREE.MathUtils.lerp(0.35, 0.7, day);
  city.renderer.toneMappingExposure = THREE.MathUtils.lerp(1.05, 0.95, day);

  // Fenêtres : allumées la nuit, presque éteintes en plein jour ; murs plus clairs le jour.
  city.windowFactor = THREE.MathUtils.lerp(1, 0.18, day);
  for (const meta of city.nodes.values()) {
    if (!meta.wallMat) continue;
    meta.wallMat.emissiveIntensity = meta.baseGlow * city.windowFactor;
    meta.wallMat.color.copy(meta.nightColor).lerp(meta.dayColor, day);
  }
  city.pineMat?.color.copy(C.nightTree).lerp(C.dayTree, day).multiplyScalar(0.7);
  city.town?.applySky(day);
  city.container.classList.toggle('is-day', day > 0.5);
}
