// Modes de déplacement dans la ville :
// - « orbite » : la vue d'ensemble habituelle (souris pour tourner, molette pour zoomer) ;
// - « survol » : caméra libre (ZQSD / WASD, Espace monte, C descend, Maj accélère, souris pour regarder) ;
// - « POV » : tu marches dans la ville avec ton bonhomme (celui de ton compte, avec ta photo Google),
//   inventaire d'armes, points de vie, réapparition aléatoire, et god mode avec le code secret.
import * as THREE from 'three';

export const WEAPONS = [
  { key: 'hands', name: 'Mains', icon: '✋', mag: 0, rate: 4, dmg: 0 },
  { key: 'pistol', name: 'Pistolet', icon: '🔫', mag: 12, reserve: 60, rate: 3.5, dmg: 25, spread: 0.01, color: '#ffd76b' },
  { key: 'shotgun', name: 'Fusil à pompe', icon: '💥', mag: 6, reserve: 30, rate: 1.1, dmg: 12, pellets: 8, spread: 0.06, color: '#ffb020' },
  { key: 'rifle', name: 'Fusil d’assaut', icon: '🪖', mag: 30, reserve: 150, rate: 10, dmg: 18, spread: 0.02, auto: true, color: '#ff8a3d' },
  { key: 'sniper', name: 'Sniper', icon: '🎯', mag: 5, reserve: 20, rate: 0.8, dmg: 100, spread: 0, zoom: true, color: '#33c6ff' },
  { key: 'rocket', name: 'Lance-roquettes', icon: '🚀', mag: 1, reserve: 5, rate: 0.7, dmg: 120, rocket: true, color: '#ff3355' },
  { key: 'water', name: 'Pistolet à eau', icon: '💦', mag: 50, reserve: 500, rate: 12, dmg: 0, spread: 0.04, auto: true, water: true, color: '#7fd4ff' },
];
export const GOD_CODE = '!godfdpivane';

const EYE = 1.55;
const GRAVITY = 24;

export class Navigator {
  constructor(city, { onMode, onHud, onInteract, onGod } = {}) {
    this.city = city;
    this.mode = 'orbit';
    this.onMode = onMode || (() => {});
    this.onHud = onHud || (() => {});
    this.onInteract = onInteract || (() => {});
    this.onGod = onGod || (() => {});
    this.keys = new Set();
    this.yaw = 0;
    this.pitch = -0.2;
    this.third = true;
    this.vel = new THREE.Vector3();
    this.pos = new THREE.Vector3(0, 0.3, 22);
    this.hp = 100;
    this.god = false;
    this.dead = 0;
    this.lastHit = 0;
    this.weapon = 1;
    this.ammo = WEAPONS.map((w) => ({ mag: w.mag, reserve: w.reserve || 0 }));
    this.cool = 0;
    this.reloading = 0;
    this.firing = false;
    this.score = 0;
    this.fx = [];
    this.codeBuf = '';
    this.player = { name: 'Moi', color: '#ff2d55', picture: null };
    this.raycaster = new THREE.Raycaster();
    this.bindEvents();
  }

  get active() {
    return this.mode !== 'orbit';
  }

  setPlayer(p) {
    this.player = { ...this.player, ...p };
    if (this.avatar) {
      this.city.scene.remove(this.avatar);
      this.avatar = null;
    }
  }

  // ---------- Changement de mode ----------
  setMode(mode) {
    if (mode === this.mode) return;
    const cam = this.city.camera;
    const prev = this.mode;
    this.mode = mode;
    const ctl = this.city.controls;
    if (mode === 'orbit') {
      ctl.enabled = true;
      document.exitPointerLock?.();
      if (this.avatar) this.avatar.visible = false;
      this.hideBalloons();
      // On garde le point de vue : la cible de l'orbite est devant la caméra
      const dir = new THREE.Vector3();
      cam.getWorldDirection(dir);
      const target = cam.position.clone().add(dir.multiplyScalar(30));
      target.y = Math.max(0, target.y);
      ctl.target.copy(target);
      cam.fov = 48;
      cam.updateProjectionMatrix();
    } else {
      ctl.enabled = false;
      this.city.tweens = [];
      const dir = new THREE.Vector3();
      cam.getWorldDirection(dir);
      this.yaw = Math.atan2(-dir.x, -dir.z);
      this.pitch = Math.asin(THREE.MathUtils.clamp(dir.y, -0.99, 0.99));
      if (mode === 'pov') {
        if (prev !== 'pov') this.spawn(prev === 'fly' ? cam.position.clone().setY(0.3) : null);
        this.ensureAvatar();
        this.avatar.visible = this.third;
        this.buildColliders();
        this.spawnBalloons();
        this.pitch = -0.1;
      } else {
        if (this.avatar) this.avatar.visible = false;
        this.hideBalloons();
      }
    }
    this.onMode(mode);
    this.hud();
  }

  // ---------- Avatar du compte connecté ----------
  ensureAvatar() {
    if (this.avatar) {
      if (!this.avatar.parent) this.city.scene.add(this.avatar);
      return;
    }
    const g = new THREE.Group();
    const col = new THREE.Color(this.player.color);
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 0.6, 4, 12), new THREE.MeshStandardMaterial({ color: '#1a1a24', emissive: col, emissiveIntensity: 0.4, roughness: 0.4 }));
    body.position.y = 0.7;
    const headMat = new THREE.MeshStandardMaterial({ color: col });
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.27, 20, 14), headMat);
    head.position.y = 1.42;
    // Photo Google sur le visage
    if (this.player.picture) {
      new THREE.TextureLoader().load(this.player.picture, (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        const face = new THREE.Mesh(new THREE.CircleGeometry(0.22, 24), new THREE.MeshBasicMaterial({ map: tex }));
        face.position.set(0, 1.42, 0.26);
        g.add(face);
      });
    }
    const legs = [-0.13, 0.13].map((x) => {
      const l = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.5, 0.18), new THREE.MeshStandardMaterial({ color: '#2b3a5a' }));
      l.position.set(x, 0.25, 0);
      g.add(l);
      return l;
    });
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.14, 0.55), new THREE.MeshStandardMaterial({ color: '#222', metalness: 0.7, roughness: 0.3 }));
    gun.position.set(0.3, 0.95, 0.35);
    g.add(body, head, gun);
    const tag = document.createElement('div');
    tag.className = 'agent-bubble agent-resident kid has-text me';
    tag.style.setProperty('--c', this.player.color);
    tag.innerHTML = `<b>${String(this.player.name).replace(/[<>&]/g, '')}</b><span>toi</span>`;
    const { CSS2DObject } = this.city.CSS2D;
    const lbl = new CSS2DObject(tag);
    lbl.position.y = 2.3;
    g.add(lbl);
    g.userData = { legs, gun, tag };
    this.avatar = g;
    this.city.scene.add(g);
  }

  // Réapparition : au hasard parmi les places, les entrées de quartier et les parcs.
  spawn(at) {
    const spots = [new THREE.Vector3(0, 0.3, 19), new THREE.Vector3(19, 0.3, 0), new THREE.Vector3(-19, 0.3, 0), new THREE.Vector3(0, 0.3, -19)];
    for (const m of this.city.nodes.values()) if (m.type === 'district' && m.gate) spots.push(m.gate.clone().setY(0.6));
    const b = this.city.bounds;
    if (b) spots.push(new THREE.Vector3(b.X0 + 4, 0.1, b.Z1 - 4), new THREE.Vector3(b.X1 - 4, 0.1, b.Z0 + 4));
    this.pos.copy(at || spots[Math.floor(Math.random() * spots.length)]);
    this.vel.set(0, 0, 0);
    this.hp = 100;
    this.dead = 0;
  }

  // Obstacles : les bâtiments (boîtes au sol) qu'on ne traverse pas.
  buildColliders() {
    const boxes = [];
    const push = (obj) => {
      const bb = new THREE.Box3().setFromObject(obj);
      if (!isFinite(bb.min.x) || bb.max.y < 1) return;
      const w = bb.max.x - bb.min.x;
      const d = bb.max.z - bb.min.z;
      if (w > 40 || d > 40) return;
      boxes.push({ x0: bb.min.x, x1: bb.max.x, z0: bb.min.z, z1: bb.max.z, top: bb.max.y });
    };
    this.city.world.updateMatrixWorld(true);
    for (const m of this.city.nodes.values()) {
      if (m.type === 'sub' && m.lm) for (const p of m.lm.pick || []) push(p);
      if (m.type === 'house' && m.body && !m.kiosk) push(m.body);
    }
    this.colliders = boxes;
    this.platforms = [...this.city.nodes.values()].filter((m) => m.type === 'district').map((m) => ({ x0: m.pos.x - m.w / 2, x1: m.pos.x + m.w / 2, z0: m.pos.z - m.dep / 2, z1: m.pos.z + m.dep / 2 }));
  }

  groundAt(x, z) {
    for (const p of this.platforms || []) if (x > p.x0 && x < p.x1 && z > p.z0 && z < p.z1) return 0.6;
    if (Math.hypot(x, z) < 15) return 0.3;
    return 0.05;
  }

  collide(p) {
    const r = 0.45;
    for (const b of this.colliders || []) {
      if (p.y > b.top - 0.2) continue;
      if (p.x > b.x0 - r && p.x < b.x1 + r && p.z > b.z0 - r && p.z < b.z1 + r) {
        // On ressort par le côté le plus proche
        const dx0 = p.x - (b.x0 - r);
        const dx1 = b.x1 + r - p.x;
        const dz0 = p.z - (b.z0 - r);
        const dz1 = b.z1 + r - p.z;
        const m = Math.min(dx0, dx1, dz0, dz1);
        if (m === dx0) p.x = b.x0 - r;
        else if (m === dx1) p.x = b.x1 + r;
        else if (m === dz0) p.z = b.z0 - r;
        else p.z = b.z1 + r;
      }
    }
  }

  // ---------- Ballons-cibles (POV) ----------
  spawnBalloons() {
    this.hideBalloons();
    const g = new THREE.Group();
    const colors = ['#ff3355', '#ffb020', '#33c6ff', '#2fd17a', '#ff6bd5', '#9b7bff'];
    for (let i = 0; i < 14; i++) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.55, 14, 12), new THREE.MeshStandardMaterial({ color: colors[i % colors.length], emissive: colors[i % colors.length], emissiveIntensity: 0.35, roughness: 0.3 }));
      b.scale.y = 1.2;
      const a = Math.random() * Math.PI * 2;
      const r = 18 + Math.random() * 40;
      b.position.set(this.pos.x + Math.cos(a) * r, 3 + Math.random() * 6, this.pos.z + Math.sin(a) * r);
      b.userData = { balloon: true, base: b.position.y, ph: Math.random() * 6 };
      g.add(b);
    }
    this.balloons = g;
    this.city.scene.add(g);
  }
  hideBalloons() {
    if (this.balloons) this.city.scene.remove(this.balloons);
    this.balloons = null;
  }

  // ---------- Entrées ----------
  bindEvents() {
    const el = this.city.renderer.domElement;
    const typing = () => ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);
    window.addEventListener('keydown', (e) => {
      if (typing()) return;
      // Code secret du god mode (tapé n'importe où dans la ville)
      if (e.key.length === 1) {
        this.codeBuf = (this.codeBuf + e.key.toLowerCase()).slice(-GOD_CODE.length);
        if (this.codeBuf === GOD_CODE) this.toggleGod();
      }
      if (!this.active) return;
      const k = e.key.toLowerCase();
      this.keys.add(k);
      if (this.mode === 'pov') {
        if (/^[0-6]$/.test(k)) this.selectWeapon(Number(k));
        if (k === 'r') this.reload();
        if (k === 'v') {
          this.third = !this.third;
          if (this.avatar) this.avatar.visible = this.third;
        }
        if (k === ' ' && (this.onGround || this.god)) this.vel.y = this.god && !this.onGround ? 8 : 9;
      }
      if (k === 'e' || k === 'enter') this.interact();
      if (k === 'escape' && !document.pointerLockElement) this.setMode('orbit');
      if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.firing = false;
    });
    el.addEventListener('mousedown', (e) => {
      if (!this.active) return;
      if (!document.pointerLockElement) {
        el.requestPointerLock?.();
        return;
      }
      if (e.button === 0) {
        if (this.mode === 'pov' && this.weapon > 0) {
          this.firing = true;
          this.fire();
        } else this.interact();
      }
      if (e.button === 2 && WEAPONS[this.weapon].zoom) this.zoomed = true;
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.firing = false;
      if (e.button === 2) this.zoomed = false;
    });
    el.addEventListener('contextmenu', (e) => this.active && e.preventDefault());
    document.addEventListener('mousemove', (e) => {
      if (!this.active || document.pointerLockElement !== el) return;
      const s = this.zoomed ? 0.0007 : 0.0022;
      this.yaw -= e.movementX * s;
      this.pitch = THREE.MathUtils.clamp(this.pitch - e.movementY * s, -1.45, 1.35);
    });
    el.addEventListener('wheel', (e) => {
      if (this.mode !== 'pov') return;
      this.selectWeapon((this.weapon + (e.deltaY > 0 ? 1 : WEAPONS.length - 1)) % WEAPONS.length);
    }, { passive: true });
  }

  toggleGod() {
    this.god = !this.god;
    if (this.god) {
      this.hp = 100;
      this.dead = 0;
    }
    this.onGod(this.god);
    this.hud();
  }

  selectWeapon(i) {
    if (!WEAPONS[i]) return;
    this.weapon = i;
    this.reloading = 0;
    this.zoomed = false;
    this.hud();
  }

  reload() {
    const w = WEAPONS[this.weapon];
    const a = this.ammo[this.weapon];
    if (!w.mag || a.mag === w.mag || (!a.reserve && !this.god) || this.reloading) return;
    this.reloading = w.rocket ? 1.4 : 1.1;
    this.hud();
  }

  // Le bâtiment / l'élément sous la mire
  aimed() {
    const cam = this.city.camera;
    this.raycaster.setFromCamera(new THREE.Vector2(0, 0), cam);
    this.raycaster.far = 60;
    const hit = this.raycaster.intersectObjects(this.city.pickables, false)[0];
    return hit?.object.userData.nodeId || null;
  }
  interact() {
    const id = this.aimed();
    if (!id) return;
    document.exitPointerLock?.();
    this.onInteract(id);
  }

  // ---------- Tir ----------
  fire() {
    const w = WEAPONS[this.weapon];
    if (this.cool > 0 || this.reloading || this.dead || !w.mag) return;
    const a = this.ammo[this.weapon];
    if (a.mag <= 0) {
      if (this.god) a.mag = w.mag;
      else return this.reload();
    }
    if (!this.god) a.mag--;
    this.cool = 1 / w.rate;
    const cam = this.city.camera;
    const origin = cam.position.clone();
    const muzzle = this.avatar && this.third ? this.avatar.localToWorld(new THREE.Vector3(0.3, 0.95, 0.7)) : origin.clone().add(new THREE.Vector3(0.2, -0.25, 0).applyQuaternion(cam.quaternion));
    sound(w);
    this.flash(muzzle, w.color || '#ffd76b');
    if (w.rocket) {
      const dir = new THREE.Vector3();
      cam.getWorldDirection(dir);
      const rk = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 0.7, 8), new THREE.MeshStandardMaterial({ color: '#555', emissive: '#ff6a00', emissiveIntensity: 0.6 }));
      rk.position.copy(muzzle);
      rk.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      this.city.scene.add(rk);
      this.fx.push({ kind: 'rocket', obj: rk, dir, speed: 45, life: 3 });
    } else {
      const n = w.pellets || 1;
      for (let i = 0; i < n; i++) {
        const dir = new THREE.Vector3();
        cam.getWorldDirection(dir);
        if (w.spread && !(this.zoomed && w.zoom)) dir.add(new THREE.Vector3((Math.random() - 0.5) * w.spread * 2, (Math.random() - 0.5) * w.spread * 2, (Math.random() - 0.5) * w.spread * 2)).normalize();
        this.raycaster.set(origin, dir);
        this.raycaster.far = w.zoom ? 400 : 160;
        const targets = [...this.city.world.children, ...(this.balloons ? [this.balloons] : [])];
        const hits = this.raycaster.intersectObjects(targets, true).filter((h) => h.object.visible && !h.object.isPoints && !h.object.isSprite && h.object.type !== 'LineSegments' && h.object.type !== 'Line');
        const hit = hits[0];
        const end = hit ? hit.point : origin.clone().add(dir.multiplyScalar(this.raycaster.far));
        this.tracer(muzzle, end, w.water ? '#7fd4ff' : w.color || '#ffd76b');
        if (hit) {
          if (hit.object.userData.balloon) this.pop(hit.object);
          else this.impact(hit, w);
        }
      }
    }
    this.hud();
  }

  pop(b) {
    if (!b.parent) return;
    this.sparks(b.position, b.material.color.getHexString ? `#${b.material.color.getHexString()}` : '#ffffff', 26, 6);
    b.parent.remove(b);
    this.score += 10;
    sound({ key: 'pop' });
    if (this.balloons && !this.balloons.children.length) this.spawnBalloons();
    this.hud();
  }

  impact(hit, w) {
    const p = hit.point;
    if (w.water) return this.sparks(p, '#9fe0ff', 6, 2);
    this.sparks(p, '#ffd76b', 8, 4);
    if (hit.face) {
      const n = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
      const dec = new THREE.Mesh(new THREE.CircleGeometry(0.09, 8), new THREE.MeshBasicMaterial({ color: '#111', transparent: true, opacity: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }));
      dec.position.copy(p).add(n.clone().multiplyScalar(0.02));
      dec.lookAt(p.clone().add(n));
      this.city.scene.add(dec);
      this.fx.push({ kind: 'decal', obj: dec, life: 20 });
    }
  }

  explode(p) {
    this.sparks(p, '#ff8a3d', 60, 12);
    this.sparks(p, '#ffd76b', 30, 8);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), new THREE.MeshBasicMaterial({ color: '#ffb020', transparent: true, opacity: 0.8, depthWrite: false }));
    ball.position.copy(p);
    this.city.scene.add(ball);
    this.fx.push({ kind: 'boom', obj: ball, life: 0.5, max: 0.5 });
    sound({ key: 'boom' });
    // Les ballons proches éclatent ; on prend des dégâts si on est trop près
    for (const b of [...(this.balloons?.children || [])]) if (b.position.distanceTo(p) < 6) this.pop(b);
    const d = p.distanceTo(this.pos.clone().setY(this.pos.y + 1));
    if (d < 5) this.damage(Math.round(70 * (1 - d / 5)), 'explosion');
  }

  flash(p, color) {
    const l = new THREE.PointLight(color, 30, 8, 2);
    l.position.copy(p);
    this.city.scene.add(l);
    this.fx.push({ kind: 'light', obj: l, life: 0.06 });
  }
  tracer(a, b, color) {
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([a, b]), new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 }));
    this.city.scene.add(line);
    this.fx.push({ kind: 'line', obj: line, life: 0.08, max: 0.08 });
  }
  sparks(p, color, n, speed) {
    const geo = new THREE.BufferGeometry();
    const pts = new Float32Array(n * 3);
    const vel = [];
    for (let i = 0; i < n; i++) {
      pts.set([p.x, p.y, p.z], i * 3);
      vel.push(new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8 + 0.2, Math.random() - 0.5).normalize().multiplyScalar(speed * (0.4 + Math.random())));
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pts, 3));
    const pts3 = new THREE.Points(geo, new THREE.PointsMaterial({ color, size: 0.18, transparent: true, depthWrite: false }));
    this.city.scene.add(pts3);
    this.fx.push({ kind: 'sparks', obj: pts3, vel, life: 0.6, max: 0.6 });
  }

  damage(n, why) {
    if (this.god || this.dead || n <= 0) return;
    this.hp = Math.max(0, this.hp - n);
    this.lastHit = performance.now();
    this.hurt = 0.4;
    if (this.hp <= 0) {
      this.dead = 3;
      this.deathWhy = why;
    }
    this.hud();
  }

  hud() {
    const w = WEAPONS[this.weapon];
    this.onHud({ mode: this.mode, hp: Math.round(this.hp), god: this.god, weapon: this.weapon, weapons: WEAPONS, ammo: this.ammo[this.weapon], reloading: this.reloading > 0, dead: this.dead > 0, deathWhy: this.deathWhy, score: this.score, zoom: this.zoomed && w.zoom, third: this.third, locked: Boolean(document.pointerLockElement), hurt: this.hurt > 0 });
  }

  // ---------- Boucle ----------
  update(dt, t) {
    const cam = this.city.camera;
    const k = this.keys;
    const fwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    const move = new THREE.Vector3();
    if (k.has('z') || k.has('w') || k.has('arrowup')) move.add(fwd);
    if (k.has('s') || k.has('arrowdown')) move.sub(fwd);
    if (k.has('d') || k.has('arrowright')) move.add(right);
    if (k.has('q') || k.has('a') || k.has('arrowleft')) move.sub(right);
    const sprint = k.has('shift');
    if (this.mode === 'fly') {
      const look = new THREE.Vector3(-Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), -Math.cos(this.yaw) * Math.cos(this.pitch));
      const v = new THREE.Vector3();
      if (move.lengthSq()) v.add(look.clone().multiplyScalar(move.dot(fwd))).add(right.clone().multiplyScalar(move.dot(right)));
      if (k.has(' ')) v.y += 1;
      if (k.has('c') || k.has('control')) v.y -= 1;
      cam.position.addScaledVector(v.normalize(), dt * (sprint ? 70 : 28));
      cam.position.y = Math.max(1.5, cam.position.y);
      cam.lookAt(cam.position.clone().add(look));
      return;
    }
    // POV
    if (this.dead) {
      this.dead -= dt;
      if (this.dead <= 0) {
        this.spawn();
        this.hud();
      }
    } else {
      if (move.lengthSq()) move.normalize().multiplyScalar(sprint ? 9 : 5);
      const ctrl = this.onGround ? 1 : 0.35;
      this.vel.x += (move.x - this.vel.x) * Math.min(1, dt * 10 * ctrl);
      this.vel.z += (move.z - this.vel.z) * Math.min(1, dt * 10 * ctrl);
      if (this.god && k.has(' ') && !this.onGround) this.vel.y = Math.max(this.vel.y, 6);
      this.vel.y -= GRAVITY * dt * (this.god && k.has(' ') ? 0.2 : 1);
      this.pos.addScaledVector(this.vel, dt);
      this.collide(this.pos);
      const g = this.groundAt(this.pos.x, this.pos.z);
      this.onGround = this.pos.y <= g + 0.001;
      if (this.onGround) {
        if (this.vel.y < -22) this.damage(Math.round((-this.vel.y - 22) * 4), 'chute');
        this.pos.y = g;
        this.vel.y = Math.max(0, this.vel.y);
      }
      // Les voitures font mal
      const traffic = this.city.town?.groups?.traffic;
      if (traffic?.visible && performance.now() - this.lastHit > 900) {
        for (const c of traffic.children) {
          if (c.children.length < 4) continue;
          if (Math.hypot(c.position.x - this.pos.x, c.position.z - this.pos.z) < 1.6 && this.pos.y < 1.5) {
            this.damage(25, 'voiture');
            const push = this.pos.clone().sub(c.position).setY(0).normalize();
            this.vel.add(push.multiplyScalar(12)).setY(5);
            break;
          }
        }
      }
      // Récupération lente des points de vie
      if (!this.dead && this.hp < 100 && performance.now() - this.lastHit > 5000) {
        this.hp = Math.min(100, this.hp + dt * 4);
        if (Math.random() < dt * 2) this.hud();
      }
    }
    this.cool = Math.max(0, this.cool - dt);
    if (this.hurt > 0) {
      this.hurt -= dt;
      if (this.hurt <= 0) this.hud();
    }
    if (this.reloading > 0) {
      this.reloading -= dt;
      if (this.reloading <= 0) {
        const w = WEAPONS[this.weapon];
        const a = this.ammo[this.weapon];
        const need = w.mag - a.mag;
        const take = this.god ? need : Math.min(need, a.reserve);
        a.mag += take;
        if (!this.god) a.reserve -= take;
        this.reloading = 0;
        this.hud();
      }
    }
    if (this.firing && WEAPONS[this.weapon].auto) this.fire();
    // Avatar + caméra
    const av = this.avatar;
    if (av) {
      av.position.copy(this.pos);
      av.rotation.y = this.yaw + Math.PI;
      const speed = Math.hypot(this.vel.x, this.vel.z);
      av.userData.legs.forEach((l, i) => (l.rotation.x = Math.sin(t * 12 + i * Math.PI) * Math.min(1, speed / 5) * 0.7));
      av.userData.gun.visible = this.weapon > 0;
      av.rotation.x = this.dead ? -Math.PI / 2 : 0;
    }
    const look = new THREE.Vector3(-Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), -Math.cos(this.yaw) * Math.cos(this.pitch));
    const eye = this.pos.clone().setY(this.pos.y + EYE);
    if (this.third && !this.zoomed) {
      const back = look.clone().multiplyScalar(-4.2).add(new THREE.Vector3(0, 0.9, 0)).add(right.clone().multiplyScalar(0.8));
      cam.position.copy(eye).add(back);
      cam.position.y = Math.max(this.pos.y + 0.6, cam.position.y);
    } else cam.position.copy(eye);
    cam.lookAt(cam.position.clone().add(look));
    const fov = this.zoomed && WEAPONS[this.weapon].zoom ? 18 : 70;
    if (Math.abs(cam.fov - fov) > 0.5) {
      cam.fov += (fov - cam.fov) * Math.min(1, dt * 12);
      cam.updateProjectionMatrix();
    }
    // Effets
    for (const b of this.balloons?.children || []) b.position.y = b.userData.base + Math.sin(t * 1.2 + b.userData.ph) * 0.6;
    this.fx = this.fx.filter((f) => {
      f.life -= dt;
      if (f.kind === 'rocket') {
        const step = f.dir.clone().multiplyScalar(f.speed * dt);
        this.raycaster.set(f.obj.position, f.dir);
        this.raycaster.far = step.length() + 0.3;
        const hit = this.raycaster.intersectObjects([...this.city.world.children, ...(this.balloons ? [this.balloons] : [])], true).find((h) => !h.object.isPoints && h.object.type !== 'Line' && h.object.type !== 'LineSegments');
        if (hit || f.obj.position.y < 0.1 || f.life <= 0) {
          this.explode(hit ? hit.point : f.obj.position.clone());
          this.city.scene.remove(f.obj);
          return false;
        }
        f.obj.position.add(step);
        if (Math.random() < 0.6) this.sparks(f.obj.position, '#bbbbbb', 3, 1);
        return true;
      }
      if (f.kind === 'sparks') {
        const arr = f.obj.geometry.attributes.position.array;
        f.vel.forEach((v, i) => {
          v.y -= 14 * dt;
          arr[i * 3] += v.x * dt;
          arr[i * 3 + 1] += v.y * dt;
          arr[i * 3 + 2] += v.z * dt;
        });
        f.obj.geometry.attributes.position.needsUpdate = true;
        f.obj.material.opacity = Math.max(0, f.life / f.max);
      }
      if (f.kind === 'line') f.obj.material.opacity = Math.max(0, f.life / f.max);
      if (f.kind === 'boom') {
        f.obj.scale.setScalar(1 + (1 - f.life / f.max) * 4);
        f.obj.material.opacity = Math.max(0, f.life / f.max) * 0.8;
      }
      if (f.life <= 0) {
        this.city.scene.remove(f.obj);
        f.obj.geometry?.dispose?.();
        return false;
      }
      return true;
    });
  }
}

// Petits bruitages synthétisés (pas de fichier audio).
let actx;
function sound(w) {
  try {
    actx ||= new AudioContext();
    const now = actx.currentTime;
    const len = w.key === 'boom' ? 0.9 : w.key === 'pop' ? 0.08 : w.key === 'water' ? 0.05 : w.key === 'sniper' ? 0.35 : 0.16;
    const buf = actx.createBuffer(1, Math.ceil(actx.sampleRate * len), actx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, w.key === 'boom' ? 1.5 : 4);
    const src = actx.createBufferSource();
    src.buffer = buf;
    const f = actx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = w.key === 'boom' ? 500 : w.key === 'water' ? 3000 : w.key === 'pop' ? 2500 : 1800;
    const g = actx.createGain();
    g.gain.setValueAtTime(w.key === 'water' ? 0.05 : 0.25, now);
    src.connect(f).connect(g).connect(actx.destination);
    src.start();
  } catch {
    /* audio indisponible */
  }
}
