// Créer une automatisation en reliant des bâtiments, directement dans la ville.
// 1) on clique sur le bâtiment qui donne le départ, 2) sur ceux qui doivent agir, dans l'ordre.
// À chaque clic, une bulle pose une question simple. Pas de schéma, pas de jargon.
import { h, put, toast, guard } from './dom.js';
import { SERVICES, opDef, defaultParams, fieldVisible } from '../shared/services.mjs';
import { buildingDef, blueprintOp, providersOf } from '../shared/buildings.mjs';
import { uid } from '../shared/engine.mjs';
import { ADVANCED_OPS, say, toFriendly, fromFriendly, simpleFields, SIMPLE_FIELDS, infosAfter, FRIENDLY, describe, shortName, isLinear, extraInfos, webhookPath } from '../shared/simple.mjs';

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

export class Linker {
  // ctx = { api, city(), world, status(), setDraft(chain|null), onClose(), openAdvanced(id), openPlace(type) }
  constructor(ctx) {
    this.ctx = ctx;
    this.active = false;
    this.bar = h('div', { id: 'fc-linkbar', class: 'fc-sheet hidden' });
    this.card = h('aside', { id: 'fc-linkcard', class: 'fc-sheet hidden' });
    document.getElementById('app').append(this.bar, this.card);
  }

  // ---------- Démarrage / fin ----------
  start({ buildingId, workflowId } = {}) {
    const c = this.ctx.city();
    this.wf = null;
    this.steps = [];
    if (workflowId) {
      const wf = c.workflows.find((w) => w.id === workflowId);
      if (!wf) return;
      if (!isLinear(wf)) {
        toast('Cette automatisation a des aiguillages : elle s’ouvre en mode avancé.', 'warn');
        return this.ctx.openAdvanced(wf.id);
      }
      this.wf = wf;
      let cur = wf.nodes.find((n) => opDef(n.op)?.kind === 'trigger');
      while (cur) {
        this.steps.push({ id: cur.id, op: cur.op, params: { ...cur.params }, simple: cur.simple ? { ...cur.simple } : null, buildingId: cur.buildingId || providersOf(c, cur.op)[0]?.id, label: cur.label || '' });
        const e = wf.edges.find((x) => x.from === cur.id);
        cur = e && wf.nodes.find((n) => n.id === e.to);
      }
    }
    this.active = true;
    document.body.classList.add('linking');
    this.render();
    if (buildingId) this.click(buildingId);
  }
  close() {
    this.active = false;
    document.body.classList.remove('linking');
    this.bar.classList.add('hidden');
    this.card.classList.add('hidden');
    this.ctx.world.setLinking(null);
    this.ctx.setDraft(null);
    this.ctx.onClose?.();
  }

  // ---------- Ce que sait faire un bâtiment ----------
  phase() {
    return this.steps.length ? 'action' : 'trigger';
  }
  opsOf(b, phase = this.phase()) {
    const c = this.ctx.city();
    const def = buildingDef(b.type, c.blueprints);
    if (!def) return [];
    let ops = [];
    for (const sid of def.services || []) ops.push(...Object.keys(SERVICES[sid].ops).map((op) => ({ op })));
    if (b.type === 'mairie') ops.push(...Object.keys(SERVICES.flow.ops).map((op) => ({ op })));
    if (def.modular && b.config?.op) ops.push({ op: b.config.op });
    if (def.blueprint) {
      const bp = def.blueprint;
      ops.push({ op: blueprintOp(bp), preset: bp.kind === 'workflow' ? { workflowId: bp.workflowId } : bp.params || {}, label: bp.name, desc: bp.desc });
    }
    return ops.filter(({ op, preset }) => {
      const d = opDef(op);
      if (!d) return false;
      if (phase === 'trigger') return d.kind === 'trigger';
      return d.kind !== 'trigger' && (!ADVANCED_OPS.has(op) || preset);
    });
  }
  eligible() {
    const c = this.ctx.city();
    return new Set(c.buildings.filter((b) => this.opsOf(b).length).map((b) => b.id));
  }

  // ---------- Clic sur un bâtiment ----------
  click(id) {
    const c = this.ctx.city();
    const b = c.buildings.find((x) => x.id === id);
    if (!b) return;
    const def = buildingDef(b.type, c.blueprints);
    const ops = this.opsOf(b);
    if (!ops.length) {
      toast(this.phase() === 'trigger' ? `${def.emoji} ${shortName(def)} ne peut pas donner le départ. Clique sur un bâtiment qui brille.` : `${def.emoji} ${shortName(def)} n’a rien à faire ici. Clique sur un bâtiment qui brille.`, 'warn');
      return;
    }
    if (ops.length === 1) return this.form(b, ops[0]);
    this.choose(b, ops);
  }

  choose(b, ops) {
    const c = this.ctx.city();
    const def = buildingDef(b.type, c.blueprints);
    const trig = this.phase() === 'trigger';
    put(this.card,
      h('header', { class: 'fc-lc-head' }, h('span', { class: 'em' }, def.emoji), h('div', {}, h('b', {}, b.name || shortName(def)), h('small', {}, trig ? 'Qu’est-ce qui donne le départ ?' : `Que doit faire ${b.name || shortName(def)} ?`)), h('button', { class: 'fc-icon-btn', onclick: () => this.card.classList.add('hidden') }, '✕')),
      h('div', { class: 'fc-lc-choices' },
        ...ops.map((o) =>
          h('button', { class: 'fc-lc-choice', onclick: () => this.form(b, o) },
            h('span', { class: 'ic' }, SERVICES[o.op.split('.')[0]].icon),
            h('div', {}, h('b', {}, cap(trig ? `quand ${say(o.op)}` : o.label || say(o.op))), h('small', {}, o.desc || opDef(o.op).desc)),
          ),
        ),
      ),
    );
    this.card.classList.remove('hidden');
  }

  // Formulaire simple d'une étape (nouvelle ou modifiée)
  form(b, o, editIndex = null, state = null) {
    const c = this.ctx.city();
    const def = buildingDef(b.type, c.blueprints);
    const op = o.op;
    const d = opDef(op);
    const prev = editIndex !== null ? this.steps[editIndex] : null;
    const params = state?.params || (prev ? { ...prev.params } : { ...defaultParams(op), ...(o.preset || {}) });
    const simple = state?.simple || (prev?.simple ? { ...prev.simple } : {});
    const special = SIMPLE_FIELDS[op];
    if (special) for (const f of special.fields) if (simple[f.key] === undefined && f.default !== undefined) simple[f.key] = f.default;
    const before = (editIndex !== null ? this.steps.slice(0, editIndex) : this.steps).map((s) => s.op);
    const prevSteps = editIndex !== null ? this.steps.slice(0, editIndex) : this.steps;
    const extra = extraInfos(prevSteps);
    const label = (k) => FRIENDLY[k] || extra[k] || k;
    const infos = [...Object.keys(extra), ...infosAfter(before)];
    if (op === 'webhook.in' && !params.path) params.path = webhookPath(this.wf?.name || shortName(def));
    let focused = null;
    const rows = [];
    const values = special ? simple : params;
    for (const f of simpleFields(op)) {
      if (!special && !fieldVisible(f, params, op)) continue;
      const v = values[f.key] ?? '';
      const set = (val) => {
        values[f.key] = val;
        // champs qui dépendent de ce choix (ex. l'heure seulement pour « chaque jour ») : on réaffiche
        if (!special && d.fields.some((x) => x.showIf && Object.keys(x.showIf).includes(f.key))) this.form(b, o, editIndex, { params, simple });
      };
      let input;
      if (f.type === 'info') input = h('select', { class: 'fc-input', onchange: (e) => set(e.target.value) }, ...(infos.length ? infos : ['subject']).map((k) => h('option', { value: `{{${k}}}`, selected: v === `{{${k}}}` }, label(k))));
      else if (f.type === 'select') input = h('select', { class: 'fc-input', onchange: (e) => set(e.target.value) }, ...f.options.map(([val, l]) => h('option', { value: val, selected: String(v || f.default || '') === val }, l)));
      else if (f.type === 'bool') input = h('label', { class: 'fc-check' }, h('input', { type: 'checkbox', checked: Boolean(v), onchange: (e) => set(e.target.checked) }), f.label);
      else if (f.type === 'textarea') input = h('textarea', { class: 'fc-input', rows: 4, placeholder: toFriendly(f.placeholder || ''), oninput: (e) => (values[f.key] = fromFriendly(e.target.value, extra)), onfocus: (e) => (focused = e.target) }, toFriendly(v, extra));
      else input = h('input', { class: 'fc-input', type: f.type === 'number' ? 'number' : 'text', value: toFriendly(String(v), extra), placeholder: toFriendly(f.placeholder || ''), oninput: (e) => (values[f.key] = fromFriendly(e.target.value, extra)), onfocus: (e) => (focused = e.target) });
      rows.push(f.type === 'bool' ? input : h('label', { class: 'fc-field' }, h('span', {}, f.label, f.required ? ' *' : ''), input));
    }
    const svc = SERVICES[op.split('.')[0]];
    const connected = svc.auth.kind === 'none' || (svc.auth.kind === 'google' ? c.connections.includes('google') : c.connections.includes(op.split('.')[0]));
    const chips = infos.length || d.kind !== 'trigger'
      ? h('div', { class: 'fc-lc-infos' },
          h('small', {}, infos.length ? 'Ajouter une information de l’étape d’avant :' : 'Ajouter :'),
          h('div', { class: 'fc-chips tabs' }, ...[...infos, '$today', '$time'].map((k) => h('button', { class: 'fc-chip', onclick: () => insert(`[${label(k)}]`) }, label(k)))),
        )
      : null;
    function insert(t) {
      const el = focused || rows.map((r) => r.querySelector?.('textarea, input[type=text]')).find(Boolean);
      if (!el) return;
      const s = el.selectionStart ?? el.value.length;
      el.value = el.value.slice(0, s) + t + el.value.slice(el.selectionEnd ?? s);
      el.focus();
      el.selectionStart = el.selectionEnd = s + t.length;
      el.dispatchEvent(new Event('input'));
    }
    const trig = d.kind === 'trigger';
    put(this.card,
      h('header', { class: 'fc-lc-head' }, h('span', { class: 'em' }, def.emoji), h('div', {}, h('b', {}, cap(trig ? `quand ${say(op)}` : o.label || say(op))), h('small', {}, b.name || shortName(def))), h('button', { class: 'fc-icon-btn', onclick: () => this.card.classList.add('hidden') }, '✕')),
      h('p', { class: 'fc-muted small' }, d.desc),
      connected ? null : h('p', { class: 'fc-alert' }, `🔌 ${svc.name} n’est pas encore branché. Tu peux quand même essayer (en simulation) ; pour que ça marche pour de vrai, branche-le à la Centrale électrique.`),
      ...rows,
      op === 'webhook.in' ? this.webhookBox(params) : null,
      d.kind !== 'trigger' ? chips : null,
      h('div', { class: 'fc-row end' },
        editIndex === null && this.opsOf(b).length > 1 ? h('button', { class: 'fc-btn ghost', onclick: () => this.choose(b, this.opsOf(b)) }, '← Autre choix') : null,
        h('button', { class: 'fc-btn primary', onclick: () => {
          const finalParams = special ? { ...params, ...special.compose(simple) } : params;
          if (op === 'webhook.in') finalParams.path = String(finalParams.path || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-|-$/g, '') || webhookPath('adresse');
          const step = { id: prev?.id || uid('n'), op, params: finalParams, simple: special ? simple : null, buildingId: b.id, label: o.label || '' };
          if (editIndex !== null) this.steps[editIndex] = step;
          else this.steps.push(step);
          this.card.classList.add('hidden');
          this.render();
          if (this.steps.length === 1) toast('Départ choisi ! Clique maintenant sur le bâtiment qui doit agir.', 'ok');
        } }, editIndex !== null ? '✓ Enregistrer' : trig ? '✓ C’est le départ' : '✓ Ajouter cette étape'),
      ),
    );
    this.card.classList.remove('hidden');
    this.card.querySelector('textarea, input[type=text]')?.focus();
  }

  // Adresse de la Gare à donner à l'autre application, avec la marche à suivre
  webhookBox(params, { live = false } = {}) {
    const st = this.ctx.status();
    const base = st.webhookBase || 'http://127.0.0.1:47800/hook/';
    const url = () => `${base}${params.path}`;
    const urlEl = h('code', { class: 'fc-url' }, url());
    const fields = String(params.fields || '').split(',').map((x) => x.trim()).filter(Boolean);
    const example = Object.fromEntries((fields.length ? fields : ['nom', 'email', 'message']).map((f) => [f, '…']));
    const local = /127\.0\.0\.1/.test(base);
    return h('div', { class: 'fc-webhook' },
      h('b', {}, '📮 L’adresse de ta Gare'),
      h('div', { class: 'fc-row' }, urlEl, h('button', { class: 'fc-btn small', onclick: () => navigator.clipboard?.writeText(url()).then(() => toast('Adresse copiée : colle-la dans l’autre application.', 'ok')) }, '📋 Copier')),
      h('p', { class: 'fc-muted small' }, local ? '🖥️ Pour l’instant, seules les applications de cet ordinateur peuvent l’appeler. Pour le bureau ou Internet : Gare → « Qui peut appeler la Gare ? ».' : '🌐 Cette adresse est joignable depuis l’extérieur de ton ordinateur.'),
      h('details', {},
        h('summary', {}, 'Comment l’utiliser ?'),
        h('ol', { class: 'fc-list small' },
          h('li', {}, 'Dans l’autre application (Typeform, Tally, Stripe, Zapier, Make, ton site, ton logiciel métier…), cherche « Webhook » ou « URL de notification ».'),
          h('li', {}, 'Colle l’adresse ci-dessus. Les données doivent arriver en JSON ou comme un formulaire.'),
          h('li', {}, 'Mets l’automatisation en marche : chaque envoi la démarre, et les informations reçues deviennent des étiquettes [nom], [email]…'),
        ),
        h('small', { class: 'fc-muted' }, 'Exemple de données attendues :'),
        h('pre', { class: 'fc-sample' }, JSON.stringify(example, null, 2)),
        h('small', { class: 'fc-muted' }, 'Formulaire HTML prêt à coller sur un site :'),
        h('pre', { class: 'fc-sample' }, `<form method="POST" action="${url()}">\n${(fields.length ? fields : ['nom', 'email', 'message']).map((f) => `  <input name="${f}" placeholder="${f}">`).join('\n')}\n  <button>Envoyer</button>\n</form>`),
      ),
      live ? null : h('p', { class: 'fc-muted small' }, 'Indique ci-dessus les informations qui vont arriver (ex. nom, email, message) : tu pourras les réutiliser dans les étapes suivantes.'),
    );
  }

  // ---------- Barre d'instructions + chaîne ----------
  render() {
    const c = this.ctx.city();
    const chain = this.steps.map((s) => s.buildingId);
    this.ctx.world.setLinking({ eligible: this.eligible(), chain });
    this.ctx.setDraft(chain);
    const n = this.steps.length;
    const instruction = !n ? '① Clique sur le bâtiment qui donne le DÉPART (ceux qui brillent) : la Poste pour un mail reçu, la Mairie pour une heure précise, la Gare pour des données envoyées par une autre application (webhook)…' : n === 1 ? '② Clique maintenant sur le bâtiment qui doit AGIR (tu peux cliquer sur le même).' : 'Ajoute une autre étape en cliquant sur un bâtiment, ou termine.';
    const chips = this.steps.map((s, i) => {
      const b = c.buildings.find((x) => x.id === s.buildingId);
      const def = b && buildingDef(b.type, c.blueprints);
      const text = i === 0 ? `Quand ${say(s.op)}` : s.label || say(s.op);
      return h('div', { class: 'fc-lb-step' },
        h('span', { class: 'num' }, i + 1),
        h('span', {}, def?.emoji || '•'),
        h('button', { class: 'txt', title: 'Modifier', onclick: () => b && this.form(b, { op: s.op, label: s.label }, i) }, cap(text)),
        i === n - 1 ? h('button', { class: 'fc-icon-btn tiny', title: 'Retirer cette étape', onclick: () => (this.steps.pop(), this.render()) }, '✕') : null,
      );
    });
    put(this.bar,
      h('div', { class: 'fc-lb-head' }, h('b', {}, this.wf ? `✏️ ${this.wf.name}` : '🔗 Nouvelle automatisation'), h('span', { class: 'fc-spacer' }), h('button', { class: 'fc-btn ghost small', onclick: () => this.close() }, 'Annuler'), h('button', { class: 'fc-btn primary small', disabled: n < 2, onclick: () => this.finish() }, '✓ Terminer')),
      h('p', { class: 'fc-lb-instr' }, instruction),
      n ? h('div', { class: 'fc-lb-chain' }, ...chips.flatMap((x, i) => (i ? [h('span', { class: 'arrow' }, '→'), x] : [x]))) : null,
    );
    this.bar.classList.remove('hidden');
  }

  // ---------- Terminer : nom, essai, mise en marche ----------
  workflow() {
    const nodes = this.steps.map((s, i) => ({ id: s.id, op: s.op, label: s.label, params: s.params, x: 60 + i * 260, y: 120, buildingId: s.buildingId, ...(s.simple ? { simple: s.simple } : {}) }));
    const edges = nodes.slice(1).map((n, i) => ({ id: uid('e'), from: nodes[i].id, to: n.id }));
    return { ...(this.wf || { id: uid('w'), enabled: false, mode: 'sim' }), nodes, edges };
  }
  finish() {
    const c = this.ctx.city();
    const draft = this.workflow();
    const sentence = describe(draft, c);
    const guest = Boolean(this.ctx.status().session?.guest);
    const strip = (t) => t.replace(/\s*\(.*?\)\s*/g, ' ').trim();
    let autoName = cap(`${strip(say(this.steps[0].op))} → ${this.steps.slice(1).map((s) => strip(s.label || say(s.op))).join(', ')}`);
    if (autoName.length > 60) autoName = `${autoName.slice(0, 60).replace(/\s+\S*$/, '')}…`;
    const name = h('input', { class: 'fc-input', value: this.wf?.name || autoName });
    const result = h('div', { class: 'fc-lc-result' });
    const save = async (patch = {}) => {
      const wf = { ...draft, name: name.value.trim() || autoName, ...patch };
      const r = await guard(() => this.ctx.api.city.act({ type: 'workflow.save', workflow: wf }));
      if (r) this.wf = r.info;
      return r?.info;
    };
    const needs = this.steps.map((s) => SERVICES[s.op.split('.')[0]]).filter((s) => s.auth.kind !== 'none' && !(s.auth.kind === 'google' ? c.connections.includes('google') : c.connections.includes(Object.keys(SERVICES).find((k) => SERVICES[k] === s))));
    put(this.card,
      h('header', { class: 'fc-lc-head' }, h('span', { class: 'em' }, '✨'), h('div', {}, h('b', {}, 'Ton automatisation est prête'), h('small', {}, 'Relis-la, essaie-la, puis mets-la en marche.')), h('button', { class: 'fc-icon-btn', onclick: () => this.card.classList.add('hidden') }, '✕')),
      h('ol', { class: 'fc-sentence' }, ...sentence.map((s) => h('li', {}, h('span', {}, s.emoji), ' ', s.text))),
      h('label', { class: 'fc-field' }, h('span', {}, 'Son nom'), name),
      this.steps[0].op === 'webhook.in' ? this.webhookBox(this.steps[0].params, { live: true }) : null,
      needs.length ? h('p', { class: 'fc-alert' }, `🔌 À brancher pour le fonctionnement réel : ${[...new Set(needs.map((s) => s.name))].join(', ')} (Centrale électrique).`) : null,
      h('div', { class: 'fc-lc-actions' },
        h('button', { class: 'fc-btn block', onclick: async () => {
          const wf = await save();
          if (!wf) return;
          put(result, h('p', { class: 'fc-muted' }, '⏳ Essai en cours… regarde les données circuler dans la ville !'));
          const r = await guard(() => this.ctx.api.wf.run(wf.id, 'sim'));
          if (r) put(result, h('p', { class: r.ok ? 'fc-ok' : 'fc-alert' }, r.ok ? '✅ L’essai a marché (avec des données d’exemple, rien n’a été envoyé).' : `❌ ${r.error}`), ...r.steps.map((s) => h('div', { class: 'fc-lc-stepres' }, s.skipped ? '⏭' : s.ok ? '✓' : '✗', ' ', cap(say(s.op)), h('small', {}, s.skipped ? ' — rien à traiter' : ` — ${s.out} élément(s)`))));
        } }, '🧪 Essayer pour voir (sans rien envoyer)'),
        h('button', { class: 'fc-btn primary block', onclick: async () => {
          const real = !guest && !needs.length;
          const wf = await save({ mode: real ? 'real' : 'sim' });
          if (!wf) return;
          await guard(() => this.ctx.api.city.act({ type: 'workflow.toggle', id: wf.id, enabled: true }));
          toast(real ? `▶ « ${wf.name} » est en marche : ta ville s’en occupe.` : `▶ « ${wf.name} » tourne en simulation (${guest ? 'visite sans compte' : 'services à brancher'}).`, 'ok');
          this.close();
        } }, '▶ Mettre en marche'),
        h('button', { class: 'fc-btn ghost block', onclick: async () => (await save()) && (toast('Enregistrée (à l’arrêt).', 'ok'), this.close()) }, 'Enregistrer sans la mettre en marche'),
        this.steps[0].op === 'webhook.in' && this.ctx.api.webhook
          ? h('button', { class: 'fc-btn block', title: 'Fait comme une autre application : envoie des données d’exemple à l’adresse de la Gare', onclick: async () => {
              const wf = await save({ mode: guest ? 'sim' : 'real' });
              if (!wf) return;
              await guard(() => this.ctx.api.city.act({ type: 'workflow.toggle', id: wf.id, enabled: true }));
              const data = Object.fromEntries(String(this.steps[0].params.fields || 'message').split(',').map((x) => x.trim()).filter(Boolean).map((f) => [f, `test ${f}`]));
              const r = await guard(() => this.ctx.api.webhook.test(this.steps[0].params.path, data));
              if (r) toast('📮 Appel de test reçu par la Gare : l’automatisation a démarré.', 'ok');
            } }, '📮 Mettre en marche et envoyer un appel de test')
          : null,
      ),
      result,
    );
    this.card.classList.remove('hidden');
  }
}
