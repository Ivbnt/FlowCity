// Moteur d'exécution des workflows de FlowCity (partagé : processus principal + aperçu navigateur).
//
// Un workflow = des étapes (nodes) reliées par des flèches (edges). La première étape est un
// déclencheur ; il produit des « éléments » (items : un mail, un fichier, une ligne…). Chaque
// étape suivante reçoit ces éléments et les traite un par un. Pour rester simple
// à comprendre, le résultat d'une action s'ajoute à l'élément : les étapes suivantes peuvent
// donc utiliser {{subject}} (du mail) ET {{answer}} (de l'IA).
//
//   workflow = { id, name, nodes: [{ id, op, params, x, y, label? }], edges: [{ from, to, out? }] }
//   adapter  = { call(op, params, item, ctx) → objet | tableau | null,
//                approve(question, item) → bool, evalExpr(expr, item) → valeur, notify?(evt) }

import { opDef } from './services.mjs';

export const LIMITS = { items: 200, nodes: 60, waitSeconds: 300 };

// ---------- Variables {{…}} ----------
const pad = (n) => String(n).padStart(2, '0');
export function builtins(now = new Date()) {
  const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const tomorrow = new Date(now.getTime() + 86400000);
  return {
    $now: now.toISOString(),
    $today: today,
    $tomorrow: `${tomorrow.getFullYear()}-${pad(tomorrow.getMonth() + 1)}-${pad(tomorrow.getDate())}`,
    $time: `${pad(now.getHours())}:${pad(now.getMinutes())}`,
    $month: `${now.getFullYear()}-${pad(now.getMonth() + 1)}`,
    $year: String(now.getFullYear()),
    $weekday: ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'][now.getDay()],
  };
}
function lookup(obj, path) {
  let cur = obj;
  for (const k of path.split('.')) {
    if (cur === null || cur === undefined) return undefined;
    cur = cur[k];
  }
  return cur;
}
export function render(tpl, item, extra = builtins()) {
  if (typeof tpl !== 'string') return tpl;
  return tpl.replace(/\{\{\s*([$\w.-]+)\s*\}\}/g, (_m, key) => {
    if (key === '$item' || key === '$json') return JSON.stringify(item ?? {});
    const v = key.startsWith('$') ? extra[key] : lookup(item, key);
    if (v === undefined || v === null) return '';
    return typeof v === 'object' ? JSON.stringify(v) : String(v);
  });
}
export function renderParams(params, item) {
  const ex = builtins();
  const out = {};
  for (const [k, v] of Object.entries(params || {})) out[k] = render(v, item, ex);
  return out;
}
export function usesVariables(wf) {
  return (wf.nodes || []).some((n) => Object.values(n.params || {}).some((v) => /\{\{[^}]+\}\}/.test(String(v))));
}

// ---------- Conditions ----------
export function compare(left, op, right) {
  const l = String(left ?? '');
  const r = String(right ?? '');
  const ll = l.toLowerCase();
  const rl = r.toLowerCase();
  const num = (x) => Number(String(x).replace(',', '.'));
  switch (op) {
    case 'contains': return ll.includes(rl);
    case 'notContains': return !ll.includes(rl);
    case 'equals': return ll.trim() === rl.trim();
    case 'notEquals': return ll.trim() !== rl.trim();
    case 'startsWith': return ll.startsWith(rl);
    case 'gt': return num(l) > num(r);
    case 'lt': return num(l) < num(r);
    case 'empty': return l.trim() === '';
    case 'notEmpty': return l.trim() !== '';
    case 'olderThan':
    case 'newerThan': {
      const t = Date.parse(l);
      if (Number.isNaN(t)) return false;
      const days = (Date.now() - t) / 86400000;
      return op === 'olderThan' ? days > num(r) : days <= num(r);
    }
    case 'regex':
      try {
        return new RegExp(r, 'i').test(l);
      } catch {
        return false;
      }
    default: return false;
  }
}

// « nom = valeur » par ligne → objet
export function parseAssignments(text, item) {
  const out = {};
  for (const line of String(text || '').split('\n')) {
    const m = line.match(/^\s*([\w.-]+)\s*[=:]\s*(.*)$/);
    if (m) out[m[1]] = render(m[2], item);
  }
  return out;
}

// ---------- Structure du graphe ----------
export function triggerOf(wf) {
  return (wf.nodes || []).find((n) => opDef(n.op)?.kind === 'trigger') || null;
}
export function outgoing(wf, nodeId) {
  return (wf.edges || []).filter((e) => e.from === nodeId);
}
// Ajouter cette flèche créerait-elle une boucle ?
export function createsCycle(wf, from, to) {
  if (from === to) return true;
  const seen = new Set();
  const stack = [to];
  while (stack.length) {
    const cur = stack.pop();
    if (cur === from) return true;
    if (seen.has(cur)) continue;
    seen.add(cur);
    for (const e of outgoing(wf, cur)) stack.push(e.to);
  }
  return false;
}
// Étapes atteignables depuis le déclencheur (dans l'ordre d'exécution).
export function reachable(wf) {
  const t = triggerOf(wf);
  if (!t) return [];
  const order = [];
  const seen = new Set();
  const queue = [t.id];
  while (queue.length) {
    const id = queue.shift();
    if (seen.has(id)) continue;
    seen.add(id);
    order.push(id);
    for (const e of outgoing(wf, id)) queue.push(e.to);
  }
  return order;
}

// ---------- Vérification (pédagogique) ----------
// Renvoie une liste de problèmes { level: 'error'|'warn', nodeId?, text }.
export function validate(wf, { isAvailable = () => true, isConnected = () => true, real = false } = {}) {
  const issues = [];
  const nodes = wf.nodes || [];
  const triggers = nodes.filter((n) => opDef(n.op)?.kind === 'trigger');
  if (!nodes.length) issues.push({ level: 'error', text: 'Le workflow est vide : ajoute un déclencheur (ce qui le démarre).' });
  else if (!triggers.length) issues.push({ level: 'error', text: 'Il manque un déclencheur : sans lui, le workflow ne sait pas quand démarrer.' });
  if (triggers.length > 1) issues.push({ level: 'error', text: 'Un workflow n’a qu’un seul déclencheur. Fais deux workflows (ou utilise « Lancer un autre workflow »).' });
  if (nodes.length > LIMITS.nodes) issues.push({ level: 'error', text: `Trop d’étapes (${LIMITS.nodes} maximum).` });
  const reach = new Set(reachable(wf));
  for (const n of nodes) {
    const def = opDef(n.op);
    if (!def) {
      issues.push({ level: 'error', nodeId: n.id, text: `Étape inconnue (${n.op}).` });
      continue;
    }
    const name = n.label || def.label;
    if (def.kind !== 'trigger' && !reach.has(n.id)) issues.push({ level: 'warn', nodeId: n.id, text: `« ${name} » n’est relié à rien : tire une flèche depuis l’étape précédente.` });
    for (const f of def.fields || []) {
      // En simulation, un champ vide n'empêche pas de tester (les données sont fictives)
      if (f.required && !String(n.params?.[f.key] ?? f.default ?? '').trim()) issues.push({ level: real ? 'error' : 'warn', nodeId: n.id, text: `« ${name} » : le champ « ${f.label} » est à remplir${real ? '' : ' avant le mode réel'}.` });
    }
    if (!isAvailable(n.op)) issues.push({ level: 'error', nodeId: n.id, text: `« ${name} » : construis d’abord le bâtiment qui fournit ce service.` });
    else if (real && !isConnected(n.op)) issues.push({ level: 'error', nodeId: n.id, text: `« ${name} » : le service n’est pas connecté (Centrale électrique).` });
    if (def.branches && !outgoing(wf, n.id).length) issues.push({ level: 'warn', nodeId: n.id, text: `« ${name} » : relie au moins la sortie « oui ».` });
  }
  if (nodes.length && triggers.length === 1 && reach.size === 1) issues.push({ level: 'warn', text: 'Le déclencheur n’est suivi d’aucune action : ajoute ce que le workflow doit faire.' });
  return issues;
}

// ---------- Exécution ----------
const clip = (v, n = 300) => {
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  return s && s.length > n ? `${s.slice(0, n)}…` : s;
};
function sampleOf(items) {
  const it = items[0];
  if (!it) return null;
  const out = {};
  for (const [k, v] of Object.entries(it).slice(0, 14)) out[k] = k === 'data' ? '[fichier]' : clip(v, 160);
  return out;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Exécute un workflow.
 * opts = { adapter, triggerItems?, signal?: { aborted }, onStep?(step), mode: 'sim'|'real' }
 * Renvoie { ok, steps, error?, items (sortie finale), savedMinutes, ms }
 */
export async function runWorkflow(wf, { adapter, triggerItems, signal = {}, onStep, mode = 'sim' } = {}) {
  const t0 = Date.now();
  const steps = [];
  const trigger = triggerOf(wf);
  if (!trigger) return { ok: false, steps, error: 'Aucun déclencheur', items: [], savedMinutes: 0, ms: 0 };
  const byId = new Map((wf.nodes || []).map((n) => [n.id, n]));
  let saved = 0;
  let finalItems = [];
  const ctx = { workflowId: wf.id, workflowName: wf.name, mode };

  async function execNode(node, input) {
    const def = opDef(node.op);
    const label = node.label || def?.label || node.op;
    const step = { nodeId: node.id, op: node.op, label, in: input.length, out: 0, ok: true, startedAt: Date.now() };
    onStep?.({ ...step, status: 'running' });
    let outputs = { main: [] };
    try {
      if (signal.aborted) throw new Error('Exécution arrêtée');
      if (!def) throw new Error(`Étape inconnue : ${node.op}`);
      if (def.kind === 'trigger') {
        outputs.main = (input.length ? input : await adapter.call(node.op, renderParams(node.params, {}), {}, ctx)) || [];
        if (!Array.isArray(outputs.main)) outputs.main = [outputs.main];
      } else if (def.kind === 'logic') {
        outputs = await execLogic(node, input);
      } else {
        for (const item of input) {
          if (signal.aborted) throw new Error('Exécution arrêtée');
          const params = renderParams(node.params, item);
          const r = await adapter.call(node.op, params, item, ctx);
          const list = r === null || r === undefined ? [{}] : Array.isArray(r) ? r : [r];
          for (const x of list) outputs.main.push({ ...item, ...x });
          saved += def.write ? 2 : 1;
          if (outputs.main.length > LIMITS.items) throw new Error(`Plus de ${LIMITS.items} éléments : ajoute un filtre ou une limite.`);
        }
      }
      const all = Object.values(outputs).flat();
      if (all.length > LIMITS.items) {
        for (const k of Object.keys(outputs)) outputs[k] = outputs[k].slice(0, LIMITS.items);
        step.note = `Limité à ${LIMITS.items} éléments.`;
      }
      step.out = Object.values(outputs).flat().length;
      step.branches = def.branches ? Object.fromEntries(def.branches.map((b) => [b, (outputs[b] || []).length])) : undefined;
      step.sample = sampleOf(Object.values(outputs).flat());
    } catch (e) {
      step.ok = false;
      step.error = e.message || String(e);
    }
    step.ms = Date.now() - step.startedAt;
    steps.push(step);
    onStep?.({ ...step, status: step.ok ? 'done' : 'error' });
    if (!step.ok) throw Object.assign(new Error(step.error), { step });
    return outputs;
  }

  async function execLogic(node, input) {
    const p = node.params || {};
    switch (node.op) {
      case 'logic.if': {
        const out = { oui: [], non: [] };
        for (const it of input) (compare(render(p.left, it), p.op || 'contains', render(p.right, it)) ? out.oui : out.non).push(it);
        return out;
      }
      case 'logic.filter':
        return { main: input.filter((it) => compare(render(p.left, it), p.op || 'contains', render(p.right, it))) };
      case 'logic.set':
        return { main: input.map((it) => ({ ...it, ...parseAssignments(p.assign, it) })) };
      case 'logic.limit':
        return { main: input.slice(0, Math.max(0, Number(p.max) || 5)) };
      case 'logic.wait': {
        const s = Math.min(LIMITS.waitSeconds, Math.max(0, Number(p.seconds) || 0));
        const end = Date.now() + s * 1000;
        while (Date.now() < end && !signal.aborted) await sleep(Math.min(250, end - Date.now()));
        return { main: input };
      }
      case 'logic.merge': {
        if (!input.length) return { main: [] };
        const field = p.field || 'title';
        const list = input.map((it) => it[field] ?? '').filter((x) => x !== '');
        return { main: [{ ...input[0], count: input.length, list, text: list.map((x) => `• ${typeof x === 'object' ? JSON.stringify(x) : x}`).join('\n'), items: input }] };
      }
      case 'logic.split': {
        const out = [];
        for (const it of input) {
          let v = lookup(it, p.field || 'items');
          if (typeof v === 'string') v = v.split('\n').filter(Boolean);
          for (const x of Array.isArray(v) ? v : []) out.push({ ...it, ...(x && typeof x === 'object' ? x : {}), value: x });
        }
        return { main: out };
      }
      case 'logic.code': {
        const target = p.target || 'resultat';
        const out = [];
        for (const it of input) out.push({ ...it, [target]: await adapter.evalExpr(p.expr, it) });
        return { main: out };
      }
      case 'logic.approval': {
        const out = [];
        for (const it of input) {
          const ok = await adapter.approve(render(p.question || 'On continue ?', it), it, ctx);
          if (ok) out.push({ ...it, approved: true });
        }
        return { main: out };
      }
      default:
        throw new Error(`Logique inconnue : ${node.op}`);
    }
  }

  try {
    // Parcours en largeur : chaque étape reçoit les éléments de l'étape précédente.
    const queue = [[trigger, triggerItems || []]];
    let guard = 0;
    while (queue.length) {
      if (++guard > LIMITS.nodes * 4) throw new Error('Trop d’étapes exécutées (boucle ?)');
      const [node, input] = queue.shift();
      if (opDef(node.op)?.kind !== 'trigger' && !input.length) {
        steps.push({ nodeId: node.id, op: node.op, label: node.label || opDef(node.op)?.label, in: 0, out: 0, ok: true, skipped: true, ms: 0 });
        onStep?.({ nodeId: node.id, status: 'skipped' });
        continue;
      }
      const outputs = await execNode(node, input);
      const next = outgoing(wf, node.id);
      if (!next.length) finalItems = finalItems.concat(Object.values(outputs).flat());
      for (const e of next) {
        const target = byId.get(e.to);
        if (!target) continue;
        const items = outputs[e.out || 'main'] ?? outputs.oui ?? outputs.main ?? [];
        queue.push([target, items]);
      }
    }
    return { ok: true, steps, items: finalItems.slice(0, 20), savedMinutes: saved, ms: Date.now() - t0 };
  } catch (e) {
    return { ok: false, steps, error: e.message, failedNode: e.step?.nodeId, items: [], savedMinutes: saved, ms: Date.now() - t0 };
  }
}

// Nouveau identifiant court
export function uid(prefix = 'n') {
  return `${prefix}${Date.now().toString(36).slice(-4)}${Math.random().toString(36).slice(2, 7)}`;
}

// Prochain déclenchement d'une horloge (flow.schedule) après `from`.
export function nextScheduleTime(params, from = new Date()) {
  const mode = params?.mode || 'daily';
  const t = new Date(from.getTime());
  t.setSeconds(0, 0);
  if (mode === 'minutes') {
    const every = Math.max(5, Number(params.every) || 30);
    return new Date(t.getTime() + every * 60000);
  }
  if (mode === 'hourly') {
    t.setMinutes(0);
    return new Date(t.getTime() + 3600000);
  }
  const [hh, mm] = String(params.time || '08:00').split(':').map((x) => Number(x) || 0);
  const c = new Date(from.getTime());
  c.setHours(hh, mm, 0, 0);
  if (mode === 'weekly') {
    const wd = Number(params.weekday ?? 1);
    let add = (wd - c.getDay() + 7) % 7;
    if (add === 0 && c <= from) add = 7;
    c.setDate(c.getDate() + add);
    return c;
  }
  if (c <= from) c.setDate(c.getDate() + 1);
  return c;
}
