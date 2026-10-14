// Tests du cœur de Flowcity (moteur, ville, catalogue) : node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import { runWorkflow, validate, render, compare, createsCycle, nextScheduleTime } from '../shared/engine.mjs';
import { SERVICES, opDef, allOps } from '../shared/services.mjs';
import { BUILDINGS, providersOf } from '../shared/buildings.mjs';
import { newCity, applyAction, recordRun, hasRoadAccess } from '../shared/city.mjs';
import { TEMPLATES, PROFILES } from '../shared/library.mjs';
import { mockCall } from '../shared/mock.mjs';

const adapter = { call: async (op, p, item) => mockCall(op, p, item), approve: async () => true, evalExpr: (e, item) => item[e] };
const wf = (nodes, edges) => ({ id: 'w1', name: 'Test', nodes: nodes.map((n, i) => ({ id: `n${i}`, params: {}, ...n })), edges: edges.map(([a, b, out]) => ({ from: `n${a}`, to: `n${b}`, out })) });

test('variables {{…}}', () => {
  assert.equal(render('Mail de {{from}} : {{ subject }}', { from: 'Léa', subject: 'Facture' }), 'Mail de Léa : Facture');
  assert.equal(render('{{body.nom}}', { body: { nom: 'Bob' } }), 'Bob');
  assert.equal(render('{{absent}}!', {}), '!');
  assert.match(render('{{$today}}', {}), /^\d{4}-\d{2}-\d{2}$/);
});

test('conditions', () => {
  assert.ok(compare('Votre FACTURE', 'contains', 'facture'));
  assert.ok(compare('12', 'gt', '3'));
  assert.ok(compare(new Date(Date.now() - 10 * 86400000).toISOString(), 'olderThan', '7'));
  assert.ok(!compare(new Date().toISOString(), 'olderThan', '7'));
});

test('exécution avec condition oui/non', async () => {
  const w = wf([{ op: 'gmail.search', params: { max: '5' } }, { op: 'flow.manual' }, { op: 'logic.if', params: { left: '{{subject}}', op: 'contains', right: 'facture' } }, { op: 'gmail.label', params: { label: 'Factures' } }, { op: 'flow.note', params: { text: '{{subject}}' } }], [[1, 0], [0, 2], [2, 3, 'oui'], [2, 4, 'non']]);
  const r = await runWorkflow(w, { adapter });
  assert.ok(r.ok, r.error);
  const ifStep = r.steps.find((s) => s.op === 'logic.if');
  assert.equal(ifStep.branches.oui, 1);
  assert.equal(ifStep.branches.non, 4);
});

test('validation pédagogique', () => {
  assert.ok(validate({ nodes: [], edges: [] }).some((i) => /vide/.test(i.text)));
  const w = wf([{ op: 'flow.manual' }, { op: 'gmail.send' }], [[0, 1]]);
  assert.ok(validate(w, { real: true }).some((i) => i.level === 'error' && /à remplir/.test(i.text)));
  assert.ok(!validate(w).some((i) => i.level === 'error'));
  assert.ok(createsCycle(wf([{ op: 'flow.manual' }, { op: 'flow.note' }], [[0, 1]]), 'n1', 'n0'));
});

test('horloge', () => {
  const from = new Date('2026-10-14T09:00:00');
  assert.equal(nextScheduleTime({ mode: 'daily', time: '08:00' }, from).getDate(), 15);
  assert.equal(nextScheduleTime({ mode: 'weekly', weekday: '1', time: '08:00' }, from).getDay(), 1);
});

test('catalogue cohérent', () => {
  for (const op of allOps()) assert.ok(['trigger', 'action', 'logic'].includes(op.kind), op.id);
  for (const b of Object.values(BUILDINGS)) for (const s of b.services || []) assert.ok(SERVICES[s], s);
  for (const t of TEMPLATES) {
    for (const n of t.nodes) assert.ok(opDef(n.op), `${t.id}: ${n.op}`);
    for (const b of t.needs) assert.ok(BUILDINGS[b], `${t.id}: ${b}`);
  }
  for (const p of PROFILES) for (const b of p.buildings) assert.ok(BUILDINGS[b], b);
});

test('ville : construction, routes, recettes, missions', () => {
  const c = newCity({ name: 'Ada Lovelace' });
  assert.equal(c.buildings.length, 0);
  assert.throws(() => applyAction(c, { type: 'place', building: 'poste', x: 5, z: 5 }), /Mairie/);
  applyAction(c, { type: 'place', building: 'mairie', x: 10, z: 10 });
  assert.ok(c.missions.fonder);
  assert.throws(() => applyAction(c, { type: 'place', building: 'ecole', x: 11, z: 11 }), /occupé/);
  applyAction(c, { type: 'roads', add: [...Array(9)].map((_, i) => [9 + i, 13]) });
  assert.ok(hasRoadAccess(c, c.buildings[0]));
  assert.ok(c.missions.routes);
  // Recette : construit les bâtiments manquants et crée le workflow
  const t = TEMPLATES.find((x) => x.id === 'monitoring');
  applyAction(c, { type: 'autobuild', buildings: t.needs });
  const { info } = applyAction(c, { type: 'workflow.fromTemplate', id: 'monitoring' });
  for (const n of info.nodes) assert.ok(providersOf(c, n.op).length, n.op);
  recordRun(c, info, { ok: true, steps: info.nodes.map((n) => ({ op: n.op, ok: true, nodeId: n.id })), savedMinutes: 2, ms: 10 }, 'sim');
  assert.ok(c.missions.premier);
});

test('mode défi : coût et niveaux', () => {
  const c = newCity({});
  applyAction(c, { type: 'city.sandbox', on: false });
  applyAction(c, { type: 'place', building: 'mairie', x: 1, z: 1 });
  assert.throws(() => applyAction(c, { type: 'place', building: 'usine', x: 20, z: 20 }), /niveau/);
});

test('mode simple : étiquettes lisibles et phrases', async () => {
  const { toFriendly, fromFriendly, describe, isLinear, SIMPLE_FIELDS } = await import('../shared/simple.mjs');
  assert.equal(toFriendly('Mail de {{from}} : {{subject}} {{inconnu}}'), 'Mail de [Expéditeur] : [Objet] {{inconnu}}');
  assert.equal(fromFriendly('Mail de [Expéditeur] le [Date du jour] [rien]'), 'Mail de {{from}} le {{$today}} [rien]');
  assert.equal(SIMPLE_FIELDS['gmail.newEmail'].compose({ from: 'maman@x.fr', word: 'facture', attachment: true, unread: true }).query, 'in:inbox from:(maman@x.fr) "facture" has:attachment is:unread');
  const c = newCity({});
  applyAction(c, { type: 'place', building: 'mairie', x: 5, z: 5 });
  applyAction(c, { type: 'place', building: 'poste', x: 12, z: 5 });
  const [m, p] = c.buildings;
  const w = { id: 'w', name: 'x', nodes: [{ id: 'a', op: 'gmail.newEmail', params: {}, simple: { from: 'Léa' }, buildingId: p.id }, { id: 'b', op: 'flow.notify', params: {}, buildingId: m.id }], edges: [{ from: 'a', to: 'b' }] };
  const s = describe(w, c);
  assert.equal(s[0].text, 'Quand je reçois un mail (de Léa)');
  assert.match(s[1].text, /^Mairie affiche un message/);
  assert.ok(isLinear(w));
});
