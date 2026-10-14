// Atelier des workflows : éditeur visuel (façon n8n, en plus simple) pour apprendre à automatiser.
// Palette des étapes (débloquées par les bâtiments construits) → toile avec flèches → réglages.
import { h, $, put, toast, guard, confirmBox, fmtDate, plural } from './dom.js';
import { SERVICES, CATEGORIES, opDef, serviceOf, defaultParams, fieldVisible } from '../shared/services.mjs';
import { BUILDINGS, buildingDef, providersOf, blueprintOp } from '../shared/buildings.mjs';
import { validate, createsCycle, uid, triggerOf, builtins } from '../shared/engine.mjs';
import { TEMPLATES } from '../shared/library.mjs';

const NODE_W = 210;
const NODE_H = 78;
const KIND_LABEL = { trigger: 'Déclencheur', action: 'Action', logic: 'Logique' };

// Bâtiment qui fournit un service (pour dire « construis la Poste »)
function hostOf(serviceId) {
  if (serviceId === 'flow') return BUILDINGS.mairie;
  return Object.values(BUILDINGS).find((b) => b.services?.includes(serviceId)) || null;
}

export class Editor {
  constructor(app) {
    this.app = app; // { api, city(), world, isGuest(), close() }
    this.wf = null;
    this.sel = null;
    this.selEdge = null;
    this.view = { x: 40, y: 30, k: 1 };
    this.runState = {}; // nodeId → { status, out }
    this.lastRun = null;
    this.focusInput = null;
    this.saveTimer = null;
    this.el = h('section', { id: 'fc-editor', class: 'fc-sheet' });
    document.body.append(this.el);
    this.offs = [
      app.api.wf.onStep((s) => this.onStep(s)),
      app.api.wf.onStart((s) => s.workflowId === this.wf?.id && ((this.runState = {}), (this.running = true), this.renderRunBar())),
      app.api.wf.onEnd((e) => e.workflowId === this.wf?.id && this.onEnd(e)),
    ];
    this.keyHandler = (e) => {
      if (/input|textarea|select/i.test(document.activeElement?.tagName || '')) return;
      if ((e.key === 'Delete' || e.key === 'Backspace') && (this.sel || this.selEdge)) {
        e.preventDefault();
        if (this.selEdge) this.removeEdge(this.selEdge);
        else this.removeNode(this.sel);
      }
      if (e.key === 'Escape') this.close();
    };
    document.addEventListener('keydown', this.keyHandler);
    const c = app.city();
    this.open(c.workflows[0]?.id || null);
  }
  close() {
    this.flush();
    this.offs.forEach((f) => f());
    document.removeEventListener('keydown', this.keyHandler);
    this.el.classList.add('out');
    setTimeout(() => this.el.remove(), 200);
    this.app.onClosed?.();
  }

  // ---------- Données ----------
  open(id) {
    this.flush();
    const c = this.app.city();
    const w = c.workflows.find((x) => x.id === id);
    this.wf = w ? structuredClone(w) : null;
    this.sel = null;
    this.selEdge = null;
    this.runState = {};
    this.lastRun = w ? c.runs.find((r) => r.workflowId === w.id) || null : null;
    this.view = { x: 40, y: 30, k: 1 };
    this.render();
  }
  async create(template) {
    if (template) {
      const r = await guard(() => this.app.api.city.act({ type: 'workflow.fromTemplate', id: template }));
      if (r) this.open(r.info.id);
      return;
    }
    const wf = { id: uid('w'), name: `Workflow ${this.app.city().workflows.length + 1}`, enabled: false, mode: 'sim', nodes: [], edges: [] };
    const r = await guard(() => this.app.api.city.act({ type: 'workflow.save', workflow: wf }));
    if (r) this.open(r.info.id);
  }
  changed(rerender = true) {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.flush(), 500);
    if (rerender) this.renderCanvas();
    this.renderIssues();
  }
  async flush() {
    if (!this.saveTimer || !this.wf) return;
    clearTimeout(this.saveTimer);
    this.saveTimer = null;
    const r = await guard(() => this.app.api.city.act({ type: 'workflow.save', workflow: this.wf }));
    if (r?.info) {
      // On garde les flèches nettoyées par le serveur (sans boucle)
      this.wf.edges = r.info.edges;
    }
  }
  node(id) {
    return this.wf?.nodes.find((n) => n.id === id);
  }

  // ---------- Rendu général ----------
  render() {
    const c = this.app.city();
    this.el.innerHTML = '';
    const list = h('aside', { class: 'fc-ed-list' },
      h('div', { class: 'fc-ed-list-head' }, h('b', {}, 'Mes workflows'), h('button', { class: 'fc-btn small primary', onclick: () => this.create() }, '+ Nouveau')),
      c.workflows.length ? null : h('p', { class: 'fc-muted small' }, 'Aucun workflow pour l’instant. Crée le premier, ou prends une recette à la Bibliothèque.'),
      ...c.workflows.map((w) =>
        h('button', { class: `fc-ed-item ${w.id === this.wf?.id ? 'active' : ''}`, onclick: () => this.open(w.id) },
          h('span', { class: `dot ${w.enabled ? 'on' : ''} ${w.lastRun && !w.lastRun.ok ? 'err' : ''}` }),
          h('span', { class: 'nm' }, w.name),
          h('small', {}, w.mode === 'real' ? 'réel' : 'simu'),
        ),
      ),
      c.buildings.some((b) => b.type === 'bibliotheque')
        ? h('details', { class: 'fc-ed-templates' }, h('summary', {}, '📚 Recettes de la Bibliothèque'), ...TEMPLATES.map((t) => h('button', { class: 'fc-ed-tpl', title: t.desc, onclick: () => this.create(t.id) }, h('span', {}, t.name), h('small', {}, t.level))))
        : h('p', { class: 'fc-muted small' }, '📚 Construis la Bibliothèque pour obtenir des recettes toutes prêtes.'),
    );
    const close = h('button', { class: 'fc-icon-btn', title: 'Fermer (Échap)', onclick: () => this.close() }, '✕');
    if (!this.wf) {
      this.el.append(list, h('div', { class: 'fc-ed-empty' }, h('div', { class: 'big' }, '⚙️'), h('h2', {}, 'L’atelier des workflows'), h('p', {}, 'Un workflow, c’est une recette que ta ville suit toute seule : un DÉCLENCHEUR (quand ?) puis des ACTIONS (quoi ?).'), h('button', { class: 'fc-btn primary', onclick: () => this.create() }, 'Créer mon premier workflow')), close);
      return;
    }
    this.toolbar = h('header', { class: 'fc-ed-bar' });
    this.palette = h('aside', { class: 'fc-ed-palette' });
    this.canvas = h('div', { class: 'fc-ed-canvas' });
    this.inspector = h('aside', { class: 'fc-ed-inspector' });
    this.runbar = h('footer', { class: 'fc-ed-run' });
    this.issuesEl = h('div', { class: 'fc-ed-issues' });
    const main = h('div', { class: 'fc-ed-main' }, this.toolbar, h('div', { class: 'fc-ed-body' }, this.palette, h('div', { class: 'fc-ed-center' }, this.canvas, this.issuesEl), this.inspector), this.runbar);
    this.el.append(list, main, close);
    this.renderToolbar();
    this.renderPalette();
    this.setupCanvas();
    this.renderCanvas();
    this.renderInspector();
    this.renderIssues();
    this.renderRunBar();
  }

  renderToolbar() {
    const w = this.wf;
    const guest = this.app.isGuest();
    const name = h('input', { class: 'fc-ed-name', value: w.name, oninput: (e) => ((w.name = e.target.value), this.changed(false)) });
    const mode = h('div', { class: 'fc-seg' },
      h('button', { class: w.mode !== 'real' ? 'on' : '', title: 'Données d’exemple, rien n’est envoyé pour de vrai', onclick: () => this.setMode('sim') }, '🧪 Simulation'),
      h('button', { class: w.mode === 'real' ? 'on' : '', title: guest ? 'Connecte-toi avec Google pour le mode réel' : 'Agit pour de vrai sur tes comptes', disabled: guest, onclick: () => this.setMode('real') }, '⚡ Réel'),
    );
    const run = h('button', { class: 'fc-btn primary', onclick: () => this.run() }, this.running ? '⏳ En cours…' : '▶ Tester');
    const stop = h('button', { class: 'fc-btn ghost', title: 'Arrêter', onclick: () => this.app.api.wf.stop(w.id) }, '⏹');
    const toggle = h('label', { class: 'fc-switch', title: 'Un workflow actif démarre tout seul (horloge, nouveau mail, webhook…)' }, h('input', { type: 'checkbox', checked: w.enabled, onchange: (e) => this.toggle(e.target.checked) }), h('span', {}), w.enabled ? 'Actif' : 'Inactif');
    const more = h('details', { class: 'fc-menu' },
      h('summary', { class: 'fc-btn ghost' }, '⋯'),
      h('div', { class: 'fc-menu-pop' },
        h('label', { class: 'fc-check' }, h('input', { type: 'checkbox', checked: w.alertOnError, onchange: (e) => ((w.alertOnError = e.target.checked), this.changed(false)) }), '🚒 M’alerter en cas d’erreur'),
        h('button', { onclick: () => this.duplicate() }, '📄 Dupliquer'),
        h('button', { class: 'danger', onclick: () => this.remove() }, '🗑️ Supprimer le workflow'),
      ),
    );
    put(this.toolbar, name, mode, run, stop, toggle, h('span', { class: 'fc-spacer' }), h('span', { class: 'fc-muted small' }, w.lastRun ? `Dernière exécution : ${fmtDate(w.lastRun.at)} ${w.lastRun.ok ? '✅' : '❌'}` : ''), more);
  }
  async setMode(m) {
    if (m === 'real') {
      const ok = await confirmBox('Mode réel : les étapes agiront vraiment sur tes comptes (mails envoyés, fichiers créés…). Teste d’abord en simulation ! On passe en réel ?', { ok: 'Passer en réel' });
      if (!ok) return;
    }
    this.wf.mode = m;
    this.changed(false);
    this.renderToolbar();
    this.renderIssues();
  }
  async toggle(on) {
    await this.flush();
    const trig = triggerOf(this.wf);
    if (on && trig && this.wf.mode !== 'real' && !['flow.schedule', 'flow.manual'].includes(trig.op)) toast('En simulation, seul le déclencheur « Horloge » démarre tout seul. Passe en mode réel pour surveiller tes vrais comptes.', 'warn');
    if (on && trig?.op === 'flow.manual') toast('Ce workflow démarre à la main : l’activer ne change rien. Utilise une Horloge ou un autre déclencheur.', 'warn');
    const r = await guard(() => this.app.api.city.act({ type: 'workflow.toggle', id: this.wf.id, enabled: on }));
    if (r) {
      this.wf.enabled = on;
      this.wf.cursor = null;
      this.render();
    }
  }
  async run() {
    if (this.running) return;
    await this.flush();
    this.running = true;
    this.renderToolbar();
    this.runState = {};
    this.renderCanvas();
    await guard(() => this.app.api.wf.run(this.wf.id, this.wf.mode));
    this.running = false;
    if (this.el.isConnected) this.renderToolbar();
  }
  async duplicate() {
    await this.flush();
    const copy = structuredClone(this.wf);
    const map = new Map(copy.nodes.map((n) => [n.id, uid('n')]));
    copy.id = uid('w');
    copy.name = `${copy.name} (copie)`;
    copy.enabled = false;
    copy.nodes.forEach((n) => (n.id = map.get(n.id)));
    copy.edges = copy.edges.map((e) => ({ ...e, id: uid('e'), from: map.get(e.from), to: map.get(e.to) }));
    delete copy.stats;
    delete copy.lastRun;
    delete copy.cursor;
    const r = await guard(() => this.app.api.city.act({ type: 'workflow.save', workflow: copy }));
    if (r) this.open(copy.id);
  }
  async remove() {
    if (!(await confirmBox(`Supprimer « ${this.wf.name} » ?`, { ok: 'Supprimer', danger: true }))) return;
    clearTimeout(this.saveTimer);
    this.saveTimer = null;
    await guard(() => this.app.api.city.act({ type: 'workflow.delete', id: this.wf.id }));
    this.open(this.app.city().workflows[0]?.id || null);
  }

  // ---------- Palette ----------
  renderPalette() {
    const c = this.app.city();
    const q = h('input', { class: 'fc-input', placeholder: 'Chercher une étape…', oninput: () => fill() });
    const body = h('div', { class: 'fc-pal-body' });
    const hasTrigger = Boolean(triggerOf(this.wf));
    const fill = () => {
      const term = q.value.trim().toLowerCase();
      body.innerHTML = '';
      // Bâtiments sur mesure construits
      const bps = c.blueprints.filter((bp) => c.buildings.some((b) => b.type === `bp:${bp.id}`));
      if (bps.length) {
        body.append(h('div', { class: 'fc-pal-group' }, h('div', { class: 'fc-pal-title' }, '🛠️ Tes bâtiments sur mesure'), ...bps.filter((bp) => !term || bp.name.toLowerCase().includes(term)).map((bp) => h('button', { class: 'fc-pal-op', title: bp.desc || '', onclick: () => this.addNode(blueprintOp(bp), { blueprint: bp.id, label: bp.name, params: bp.kind === 'workflow' ? { workflowId: bp.workflowId } : bp.params }) }, h('span', { class: 'ic' }, bp.emoji), h('span', {}, bp.name), h('small', { class: 'k action' }, 'Action')))));
      }
      const groups = Object.entries(SERVICES)
        .map(([sid, s]) => {
          const ops = Object.entries(s.ops).filter(([id, d]) => !term || `${d.label} ${s.name} ${d.desc}`.toLowerCase().includes(term));
          return { sid, s, ops, available: ops.some(([id]) => providersOf(c, id).length) };
        })
        .filter((g) => g.ops.length)
        .sort((a, b) => Number(b.available) - Number(a.available));
      for (const g of groups) {
        const host = hostOf(g.sid);
        const items = g.ops.map(([id, d]) => {
          const ok = providersOf(c, id).length > 0;
          const isTrig = d.kind === 'trigger';
          return h('button', { class: `fc-pal-op ${ok ? '' : 'locked'}`, title: ok ? d.desc : `Construis ${host?.name || 'le bâtiment'} (ou un Atelier réglé sur cette fonction) pour débloquer.`, disabled: !ok, onclick: () => this.addNode(id) },
            h('span', { class: 'ic' }, g.s.icon),
            h('span', {}, d.label),
            h('small', { class: `k ${d.kind}` }, isTrig ? (hasTrigger ? 'Déclencheur ✓' : 'Déclencheur') : KIND_LABEL[d.kind]),
          );
        });
        body.append(h('div', { class: `fc-pal-group ${g.available ? '' : 'dim'}` }, h('div', { class: 'fc-pal-title' }, `${g.s.icon} ${g.s.name}`, g.available ? null : h('small', {}, ` 🔒 ${host?.emoji || ''} ${host?.name || ''}`)), ...items));
      }
    };
    fill();
    put(this.palette, h('div', { class: 'fc-pal-head' }, h('b', {}, 'Étapes'), h('small', { class: 'fc-muted' }, 'Clique pour ajouter')), q, body);
  }

  addNode(op, extra = {}) {
    const def = opDef(op);
    if (!def) return;
    const w = this.wf;
    if (def.kind === 'trigger' && triggerOf(w)) {
      toast('Ce workflow a déjà un déclencheur (un seul par workflow). Supprime l’ancien pour le remplacer.', 'warn');
      return;
    }
    if (def.kind !== 'trigger' && !triggerOf(w) && !w.nodes.length) toast('Astuce : un workflow commence toujours par un déclencheur (⚡ quand démarrer ?).', 'warn');
    const from = this.node(this.sel) || [...w.nodes].sort((a, b) => b.x - a.x)[0];
    let x = from ? from.x + NODE_W + 50 : 60;
    let y = from ? from.y : 120;
    while (w.nodes.some((n) => Math.abs(n.x - x) < 60 && Math.abs(n.y - y) < 60)) y += NODE_H + 30;
    if (def.kind === 'trigger') {
      x = Math.min(60, ...w.nodes.map((n) => n.x - NODE_W - 50));
      y = 120;
    }
    const n = { id: uid('n'), op, label: extra.label || '', params: { ...defaultParams(op), ...(extra.params || {}) }, x, y, ...(extra.blueprint ? { blueprint: extra.blueprint } : {}) };
    w.nodes.push(n);
    // Liaison automatique depuis l'étape sélectionnée (ou depuis le nouveau déclencheur vers la première étape)
    if (def.kind === 'trigger') {
      const first = w.nodes.find((m) => m.id !== n.id && !w.edges.some((e) => e.to === m.id));
      if (first) w.edges.push({ id: uid('e'), from: n.id, to: first.id });
    } else if (from && opDef(from.op)) {
      const fdef = opDef(from.op);
      let out;
      if (fdef.branches) out = w.edges.some((e) => e.from === from.id && e.out === 'oui') ? 'non' : 'oui';
      if (!createsCycle(w, from.id, n.id)) w.edges.push({ id: uid('e'), from: from.id, to: n.id, ...(out ? { out } : {}) });
    }
    this.sel = n.id;
    this.selEdge = null;
    this.changed();
    this.renderInspector();
    this.renderPalette();
  }
  removeNode(id) {
    const w = this.wf;
    w.nodes = w.nodes.filter((n) => n.id !== id);
    w.edges = w.edges.filter((e) => e.from !== id && e.to !== id);
    this.sel = null;
    this.changed();
    this.renderInspector();
    this.renderPalette();
  }
  removeEdge(id) {
    this.wf.edges = this.wf.edges.filter((e) => e.id !== id);
    this.selEdge = null;
    this.changed();
  }

  // ---------- Toile ----------
  setupCanvas() {
    const cv = this.canvas;
    this.stage = h('div', { class: 'fc-ed-stage' });
    this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.svg.classList.add('fc-ed-svg');
    this.stage.append(this.svg);
    cv.append(this.stage, h('div', { class: 'fc-ed-zoom' }, h('button', { onclick: () => this.zoom(1.15) }, '+'), h('button', { onclick: () => this.zoom(1 / 1.15) }, '−'), h('button', { title: 'Tout voir', onclick: () => this.fit() }, '⤢')));
    let pan = null;
    cv.addEventListener('pointerdown', (e) => {
      if (e.target !== cv && e.target !== this.stage && e.target !== this.svg) return;
      pan = { x: e.clientX, y: e.clientY, vx: this.view.x, vy: this.view.y };
      cv.setPointerCapture(e.pointerId);
      this.sel = null;
      this.selEdge = null;
      this.renderCanvas();
      this.renderInspector();
    });
    cv.addEventListener('pointermove', (e) => {
      if (pan) {
        this.view.x = pan.vx + e.clientX - pan.x;
        this.view.y = pan.vy + e.clientY - pan.y;
        this.applyView();
      }
      if (this.linking) this.updateLink(e);
    });
    cv.addEventListener('pointerup', (e) => {
      pan = null;
      if (this.linking) this.finishLink(e);
    });
    cv.addEventListener('wheel', (e) => {
      e.preventDefault();
      const r = cv.getBoundingClientRect();
      this.zoom(e.deltaY < 0 ? 1.1 : 1 / 1.1, e.clientX - r.left, e.clientY - r.top);
    }, { passive: false });
    requestAnimationFrame(() => this.fit());
  }
  zoom(f, cx, cy) {
    const r = this.canvas.getBoundingClientRect();
    cx ??= r.width / 2;
    cy ??= r.height / 2;
    const k = Math.max(0.35, Math.min(1.8, this.view.k * f));
    this.view.x = cx - ((cx - this.view.x) * k) / this.view.k;
    this.view.y = cy - ((cy - this.view.y) * k) / this.view.k;
    this.view.k = k;
    this.applyView();
  }
  fit() {
    const ns = this.wf?.nodes || [];
    const r = this.canvas?.getBoundingClientRect();
    if (!r || !r.width) return;
    if (!ns.length) {
      this.view = { x: 40, y: 30, k: 1 };
      return this.applyView();
    }
    const minX = Math.min(...ns.map((n) => n.x));
    const maxX = Math.max(...ns.map((n) => n.x + NODE_W));
    const minY = Math.min(...ns.map((n) => n.y));
    const maxY = Math.max(...ns.map((n) => n.y + NODE_H));
    const k = Math.max(0.85, Math.min(1.1, (r.width - 80) / (maxX - minX || 1), (r.height - 80) / (maxY - minY || 1)));
    this.view = { k, x: Math.max(40 - minX * k, (r.width - (maxX - minX) * k) / 2 - minX * k), y: (r.height - (maxY - minY) * k) / 2 - minY * k };
    this.applyView();
  }
  applyView() {
    this.stage.style.transform = `translate(${this.view.x}px, ${this.view.y}px) scale(${this.view.k})`;
    this.canvas.style.backgroundPosition = `${this.view.x}px ${this.view.y}px`;
    this.canvas.style.backgroundSize = `${24 * this.view.k}px ${24 * this.view.k}px`;
  }
  toStage(e) {
    const r = this.canvas.getBoundingClientRect();
    return [(e.clientX - r.left - this.view.x) / this.view.k, (e.clientY - r.top - this.view.y) / this.view.k];
  }
  portPos(n, kind, out) {
    if (kind === 'in') return [n.x, n.y + NODE_H / 2];
    const def = opDef(n.op);
    if (def?.branches) return [n.x + NODE_W, n.y + NODE_H * (out === 'non' ? 0.74 : 0.34)];
    return [n.x + NODE_W, n.y + NODE_H / 2];
  }

  renderCanvas() {
    if (!this.stage) return;
    const w = this.wf;
    this.stage.querySelectorAll('.fc-node').forEach((x) => x.remove());
    this.svg.innerHTML = '';
    // Flèches
    for (const e of w.edges) {
      const a = this.node(e.from);
      const b = this.node(e.to);
      if (!a || !b) continue;
      const [x1, y1] = this.portPos(a, 'out', e.out);
      const [x2, y2] = this.portPos(b, 'in');
      const dx = Math.max(50, Math.abs(x2 - x1) * 0.5);
      const d = `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`;
      const flowing = this.runState[e.from]?.status === 'done' && this.runState[e.to];
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', d);
      path.setAttribute('class', `edge ${e.out === 'non' ? 'no' : e.out === 'oui' ? 'yes' : ''} ${this.selEdge === e.id ? 'sel' : ''} ${flowing ? 'flow' : ''}`);
      const hit = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      hit.setAttribute('d', d);
      hit.setAttribute('class', 'edge-hit');
      hit.addEventListener('pointerdown', (ev) => {
        ev.stopPropagation();
        this.selEdge = e.id;
        this.sel = null;
        this.renderCanvas();
        this.renderInspector();
      });
      this.svg.append(path, hit);
      if (this.selEdge === e.id) {
        const mx = (x1 + x2) / 2;
        const my = (y1 + y2) / 2;
        const del = h('button', { class: 'fc-edge-del fc-node', style: { left: `${mx - 12}px`, top: `${my - 12}px` }, title: 'Supprimer la flèche', onclick: () => this.removeEdge(e.id) }, '✕');
        this.stage.append(del);
      }
    }
    if (this.linkPath) this.svg.append(this.linkPath);
    // Étapes
    const c = this.app.city();
    const issues = validate(w, { isAvailable: (op) => providersOf(c, op).length > 0 });
    for (const n of w.nodes) {
      const def = opDef(n.op);
      const svc = serviceOf(n.op);
      const bp = n.blueprint ? c.blueprints.find((b) => b.id === n.blueprint) : null;
      const rs = this.runState[n.id];
      const err = issues.some((i) => i.nodeId === n.id && i.level === 'error');
      const summary = this.summary(n);
      const el = h('div', {
        class: `fc-node kind-${def?.kind || 'x'} ${this.sel === n.id ? 'sel' : ''} ${rs ? `st-${rs.status}` : ''} ${err ? 'bad' : ''}`,
        style: { left: `${n.x}px`, top: `${n.y}px`, width: `${NODE_W}px`, height: `${NODE_H}px`, '--c': CATEGORIES[svc?.category]?.color || '#888' },
        'data-id': n.id,
      },
        h('div', { class: 'fc-node-ic' }, bp?.emoji || svc?.icon || '?'),
        h('div', { class: 'fc-node-txt' }, h('small', {}, `${KIND_LABEL[def?.kind] || ''} · ${bp ? 'sur mesure' : svc?.name || ''}`), h('b', {}, n.label || def?.label || n.op), summary ? h('span', { class: 'sum' }, summary) : null),
        def?.kind !== 'trigger' ? h('span', { class: 'port in' }) : null,
        ...(def?.branches ? def.branches.map((b) => h('span', { class: `port out br-${b}`, 'data-out': b, title: `Sortie « ${b} »` }, h('i', {}, b))) : [h('span', { class: 'port out', 'data-out': '' })]),
        rs ? h('span', { class: 'fc-node-badge' }, rs.status === 'running' ? '⏳' : rs.status === 'error' ? '❌' : rs.status === 'skipped' ? '⏭' : `✓ ${rs.out ?? ''}`) : null,
      );
      this.bindNode(el, n);
      this.stage.append(el);
    }
    if (!w.nodes.length) this.stage.append(h('div', { class: 'fc-node fc-ed-hint' }, h('b', {}, 'Comment ça marche ?'), h('ol', {}, h('li', {}, 'Dans la palette, choisis un DÉCLENCHEUR (⚡ quand démarrer : bouton, horloge, nouveau mail…).'), h('li', {}, 'Ajoute des ACTIONS (ce que la ville doit faire). Elles se relient toutes seules.'), h('li', {}, 'Règle chaque étape à droite, puis appuie sur ▶ Tester.'))));
  }
  summary(n) {
    const p = n.params || {};
    const pick = p.query || p.text || p.title || p.subject || p.prompt || p.url || p.name || p.left || p.time || '';
    return String(pick).replace(/\s+/g, ' ').slice(0, 42);
  }
  bindNode(el, n) {
    let drag = null;
    el.addEventListener('pointerdown', (e) => {
      const port = e.target.closest('.port.out');
      e.stopPropagation();
      if (port) {
        this.startLink(n, port.dataset.out || undefined, e);
        return;
      }
      drag = { x: e.clientX, y: e.clientY, nx: n.x, ny: n.y, moved: false };
      el.setPointerCapture(e.pointerId);
      if (this.sel !== n.id) {
        this.sel = n.id;
        this.selEdge = null;
        this.stage.querySelectorAll('.fc-node.sel').forEach((x) => x.classList.remove('sel'));
        el.classList.add('sel');
        this.renderInspector();
      }
    });
    el.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const dx = (e.clientX - drag.x) / this.view.k;
      const dy = (e.clientY - drag.y) / this.view.k;
      if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
      n.x = Math.round((drag.nx + dx) / 10) * 10;
      n.y = Math.round((drag.ny + dy) / 10) * 10;
      el.style.left = `${n.x}px`;
      el.style.top = `${n.y}px`;
      this.redrawEdgesOnly();
    });
    el.addEventListener('pointerup', () => {
      if (drag?.moved) this.changed();
      drag = null;
    });
  }
  redrawEdgesOnly() {
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(() => {
      const keep = this.sel;
      this.renderCanvas();
      this.sel = keep;
    });
  }
  startLink(n, out, e) {
    this.linking = { from: n, out };
    this.linkPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    this.linkPath.setAttribute('class', 'edge temp');
    this.svg.append(this.linkPath);
    this.canvas.setPointerCapture(e.pointerId);
    this.updateLink(e);
  }
  updateLink(e) {
    const { from, out } = this.linking;
    const [x1, y1] = this.portPos(from, 'out', out);
    const [x2, y2] = this.toStage(e);
    const dx = Math.max(40, Math.abs(x2 - x1) * 0.5);
    this.linkPath.setAttribute('d', `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`);
  }
  finishLink(e) {
    const { from, out } = this.linking;
    this.linking = null;
    this.linkPath?.remove();
    this.linkPath = null;
    const [sx, sy] = this.toStage(e);
    const target = this.wf.nodes.find((n) => sx >= n.x - 20 && sx <= n.x + NODE_W && sy >= n.y - 10 && sy <= n.y + NODE_H + 10);
    if (!target || target.id === from.id) return this.renderCanvas();
    if (opDef(target.op)?.kind === 'trigger') {
      toast('Un déclencheur ne reçoit rien : il démarre le workflow.', 'warn');
      return this.renderCanvas();
    }
    if (this.wf.edges.some((x) => x.from === from.id && x.to === target.id && (x.out || '') === (out || ''))) return this.renderCanvas();
    if (createsCycle(this.wf, from.id, target.id)) {
      toast('Cette flèche créerait une boucle infinie : impossible.', 'warn');
      return this.renderCanvas();
    }
    this.wf.edges.push({ id: uid('e'), from: from.id, to: target.id, ...(out ? { out } : {}) });
    this.changed();
  }

  // ---------- Réglages de l'étape ----------
  upstreamFields(nodeId) {
    const w = this.wf;
    const seen = new Set();
    const fields = new Map();
    const stack = w.edges.filter((e) => e.to === nodeId).map((e) => e.from);
    while (stack.length) {
      const id = stack.pop();
      if (seen.has(id)) continue;
      seen.add(id);
      const n = this.node(id);
      if (!n) continue;
      const def = opDef(n.op);
      const from = n.label || def?.label;
      for (const o of def?.outputs || []) if (!o.startsWith('(')) fields.set(o, from);
      if (n.op === 'logic.set') for (const line of String(n.params?.assign || '').split('\n')) {
        const m = line.match(/^\s*([\w.-]+)\s*[=:]/);
        if (m) fields.set(m[1], from);
      }
      if (n.op === 'claude.extract') for (const f of String(n.params?.fields || '').split(',').map((s) => s.trim()).filter(Boolean)) fields.set(f, from);
      if (n.op === 'logic.code') fields.set(n.params?.target || 'resultat', from);
      const step = this.lastRun?.steps?.find((s) => s.nodeId === id);
      for (const k of Object.keys(step?.sample || {})) if (!fields.has(k)) fields.set(k, from);
      for (const e of w.edges.filter((x) => x.to === id)) stack.push(e.from);
    }
    return [...fields.entries()];
  }
  insertVar(name) {
    const el = this.focusInput;
    if (!el || !el.isConnected) {
      navigator.clipboard?.writeText(`{{${name}}}`);
      toast(`{{${name}}} copié : colle-le dans un champ.`);
      return;
    }
    const s = el.selectionStart ?? el.value.length;
    const t = `{{${name}}}`;
    el.value = el.value.slice(0, s) + t + el.value.slice(el.selectionEnd ?? s);
    el.focus();
    el.selectionStart = el.selectionEnd = s + t.length;
    el.dispatchEvent(new Event('input'));
  }
  renderInspector() {
    const ins = this.inspector;
    if (!ins) return;
    const n = this.node(this.sel);
    if (!n) {
      const c = this.app.city();
      const w = this.wf;
      put(ins, 
        h('div', { class: 'fc-ins-head' }, h('b', {}, 'Réglages du workflow')),
        h('label', { class: 'fc-field' }, h('span', {}, 'Description (pour toi)'), h('textarea', { class: 'fc-input', rows: 3, placeholder: 'Ce que fait ce workflow…', oninput: (e) => ((w.desc = e.target.value), this.changed(false)) }, w.desc || '')),
        h('div', { class: 'fc-ins-stats' }, h('div', {}, h('b', {}, w.stats?.runs || 0), h('small', {}, 'exécutions')), h('div', {}, h('b', {}, w.stats?.ok || 0), h('small', {}, 'réussies')), h('div', {}, h('b', {}, w.stats?.fail || 0), h('small', {}, 'échecs'))),
        w.cursor?.error ? h('p', { class: 'fc-alert' }, `Dernière surveillance : ${w.cursor.error}`) : null,
        h('div', { class: 'fc-tip' }, h('b', {}, '💡 Le saviez-vous ?'), h('p', {}, 'Chaque étape reçoit les « éléments » de l’étape d’avant (un mail, une ligne, un fichier…) et les traite un par un. Utilise les {{variables}} pour réutiliser leurs champs.')),
        c.runs.filter((r) => r.workflowId === w.id).length ? h('div', { class: 'fc-ins-runs' }, h('b', {}, 'Historique'), ...c.runs.filter((r) => r.workflowId === w.id).slice(0, 8).map((r) => h('button', { class: 'fc-run-row', onclick: () => ((this.lastRun = r), this.renderRunBar()) }, h('span', {}, r.ok ? '✅' : '❌'), h('span', {}, fmtDate(r.at)), h('small', {}, `${r.mode === 'real' ? 'réel' : 'simu'} · ${r.source}`)))) : null,
      );
      return;
    }
    const def = opDef(n.op);
    const svc = serviceOf(n.op);
    const c = this.app.city();
    const providers = providersOf(c, n.op);
    const prov = providers[0] ? buildingDef(providers[0].type, c.blueprints) : null;
    const form = h('div', { class: 'fc-form' });
    for (const f of def.fields || []) {
      if (!fieldVisible(f, n.params, n.op)) continue;
      const val = n.params?.[f.key] ?? '';
      const set = (v) => {
        n.params = { ...(n.params || {}), [f.key]: v };
        this.changed();
        if (def.fields.some((x) => x.showIf && Object.keys(x.showIf).includes(f.key))) this.renderInspector();
      };
      let input;
      if (f.type === 'select') input = h('select', { class: 'fc-input', onchange: (e) => set(e.target.value) }, ...f.options.map(([v, l]) => h('option', { value: v, selected: String(val || f.default || '') === v }, l)));
      else if (f.type === 'workflow') input = h('select', { class: 'fc-input', onchange: (e) => set(e.target.value) }, h('option', { value: '' }, '— choisir —'), ...c.workflows.filter((x) => x.id !== this.wf.id).map((x) => h('option', { value: x.id, selected: val === x.id }, x.name)));
      else if (f.type === 'textarea') input = h('textarea', { class: 'fc-input', rows: 4, placeholder: f.placeholder || '', oninput: (e) => set(e.target.value), onfocus: (e) => (this.focusInput = e.target) }, val);
      else input = h('input', { class: 'fc-input', type: f.type === 'number' ? 'number' : 'text', value: val, placeholder: f.placeholder || '', oninput: (e) => set(e.target.value), onfocus: (e) => (this.focusInput = e.target) });
      form.append(h('label', { class: 'fc-field' }, h('span', {}, f.label, f.required ? h('i', { class: 'req' }, ' *') : null), input));
    }
    const vars = this.upstreamFields(n.id);
    const b = builtins();
    put(ins, 
      h('div', { class: 'fc-ins-head' }, h('span', { class: 'ic' }, svc?.icon), h('div', {}, h('small', {}, `${KIND_LABEL[def.kind]} · ${svc?.name}`), h('b', {}, def.label)), h('button', { class: 'fc-icon-btn', title: 'Supprimer l’étape (Suppr)', onclick: () => this.removeNode(n.id) }, '🗑️')),
      h('p', { class: 'fc-desc' }, def.desc),
      prov ? h('p', { class: 'fc-muted small' }, `Exécuté par : ${prov.emoji} ${prov.name}`) : h('p', { class: 'fc-alert' }, `🔒 Construis ${hostOf(n.op.split('.')[0])?.name || 'le bâtiment correspondant'} pour utiliser cette étape.`),
      h('label', { class: 'fc-field' }, h('span', {}, 'Nom de l’étape (facultatif)'), h('input', { class: 'fc-input', value: n.label || '', placeholder: def.label, oninput: (e) => ((n.label = e.target.value), this.changed()) })),
      form,
      def.kind !== 'trigger'
        ? h('div', { class: 'fc-vars' },
            h('b', {}, 'Variables disponibles'),
            h('p', { class: 'fc-muted small' }, vars.length ? 'Clique pour insérer dans le champ sélectionné.' : 'Relie cette étape à une étape précédente pour voir ses champs.'),
            h('div', { class: 'fc-chips' }, ...vars.map(([k, from]) => h('button', { class: 'fc-chip', title: `Vient de « ${from} »`, onclick: () => this.insertVar(k) }, `{{${k}}}`))),
            h('div', { class: 'fc-chips dim' }, ...Object.keys(b).map((k) => h('button', { class: 'fc-chip', title: `Ex. : ${b[k]}`, onclick: () => this.insertVar(k) }, `{{${k}}}`))),
          )
        : h('div', { class: 'fc-tip' }, h('b', {}, '⚡ Déclencheur'), h('p', {}, def.poll ? 'En mode réel et activé, la ville vérifie régulièrement s’il y a du nouveau. Quand tu appuies sur ▶ Tester, elle prend les derniers éléments existants pour que tu voies le résultat.' : 'C’est lui qui démarre le workflow.')),
      def.outputs?.length ? h('div', { class: 'fc-outs' }, h('b', {}, 'Ce que cette étape ajoute : '), def.outputs.map((o) => h('code', {}, o))) : null,
    );
  }

  // ---------- Problèmes ----------
  renderIssues() {
    if (!this.issuesEl) return;
    const c = this.app.city();
    const conns = c.connections || [];
    const issues = validate(this.wf, {
      isAvailable: (op) => providersOf(c, op).length > 0,
      isConnected: (op) => {
        const s = serviceOf(op);
        return !s || s.auth.kind === 'none' || (s.auth.kind === 'google' ? conns.includes('google') : conns.includes(op.split('.')[0]));
      },
      real: this.wf.mode === 'real',
    });
    put(this.issuesEl, 
      ...(issues.length
        ? issues.slice(0, 4).map((i) => h('button', { class: `fc-issue ${i.level}`, onclick: () => i.nodeId && ((this.sel = i.nodeId), this.renderCanvas(), this.renderInspector()) }, i.level === 'error' ? '⛔ ' : '⚠️ ', i.text))
        : this.wf.nodes.length
          ? [h('span', { class: 'fc-issue ok' }, '✅ Workflow prêt : appuie sur ▶ Tester.')]
          : []),
    );
  }

  // ---------- Exécution en direct ----------
  onStep(s) {
    if (s.workflowId !== this.wf?.id) return;
    this.runState[s.nodeId] = { status: s.status, out: s.out };
    if (this.stage) this.renderCanvas();
  }
  onEnd(e) {
    this.running = false;
    this.lastRun = e.run;
    this.wf.lastRun = { at: e.run.at, ok: e.run.ok };
    this.wf.stats = this.app.city().workflows.find((x) => x.id === this.wf.id)?.stats || this.wf.stats;
    if (!this.el.isConnected) return;
    this.renderToolbar();
    this.renderRunBar();
    this.renderCanvas();
    if (!this.sel) this.renderInspector();
    toast(e.run.ok ? `${e.run.mode === 'real' ? '✅' : '🧪'} « ${this.wf.name} » : ${plural(e.run.ops.length, 'étape')} réussie${e.run.ops.length > 1 ? 's' : ''}` : `❌ ${e.run.error}`, e.run.ok ? 'ok' : 'error');
  }
  renderRunBar() {
    const bar = this.runbar;
    if (!bar) return;
    const r = this.lastRun;
    if (this.running) return put(bar, h('div', { class: 'fc-run-live' }, h('span', { class: 'spin' }), 'Exécution en cours… regarde les colis de données circuler dans la ville !'));
    if (!r) return put(bar, h('span', { class: 'fc-muted small' }, 'Le résultat des tests s’affichera ici : chaque étape, ce qui est entré, ce qui est sorti.'));
    const detail = h('pre', { class: 'fc-sample' }, 'Clique sur une étape pour voir un exemple des données.');
    const showSample = (s) => {
      detail.textContent = s.error ? `Erreur : ${s.error}` : s.sample ? JSON.stringify(s.sample, null, 2) : s.skipped ? 'Étape sautée : aucun élément n’est arrivé jusqu’ici.' : 'Pas de données.';
    };
    const steps = r.steps.map((s) =>
      h('button', { class: `fc-step ${s.ok ? (s.skipped ? 'skip' : 'ok') : 'err'}`, onclick: () => showSample(s) },
        h('b', {}, `${serviceOf(s.op)?.icon || ''} ${s.label}`),
        h('small', {}, s.skipped ? 'sautée' : `${s.in ?? 0} → ${s.out ?? 0}${s.branches ? ` (oui ${s.branches.oui ?? 0} / non ${s.branches.non ?? 0})` : ''} · ${s.ms} ms`),
      ),
    );
    put(bar, h('div', { class: 'fc-run-head' }, h('b', {}, r.ok ? '✅ Réussi' : '❌ Échec'), h('small', {}, `${fmtDate(r.at)} · ${r.mode === 'real' ? 'réel' : 'simulation'} · ${r.source}`), r.error ? h('span', { class: 'fc-alert inline' }, r.error) : null), h('div', { class: 'fc-steps' }, ...steps), detail);
    const first = r.steps.find((s) => !s.ok) || r.steps[r.steps.length - 1];
    if (first) showSample(first);
  }
}

export { $ };
