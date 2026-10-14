// Fenêtres des bâtiments : chaque bâtiment ouvre un panneau qui correspond à son rôle.
import * as THREE from 'three';
import { h, put, toast, guard, confirmBox, fmtDate, fmtMinutes, plural } from './dom.js';
import { SERVICES, CATEGORIES, opDef, allOps, defaultParams, fieldVisible } from '../shared/services.mjs';
import { BUILDINGS, BUILDING_CATEGORIES, buildingDef, levelProgress, BLUEPRINT_SHAPES, blueprintCost, availableServices } from '../shared/buildings.mjs';
import { MISSIONS, missionStatus } from '../shared/missions.mjs';
import { GLOSSARY, TEMPLATES, PROFILES } from '../shared/library.mjs';
import { population, happiness, dailyTaxes, savedMinutes, hasRoadAccess } from '../shared/city.mjs';
import { validate } from '../shared/engine.mjs';
import { buildModel } from './models.js';

// ctx = { api, city(), status(), openEditor(id?), select(id), setTool(t), refreshStatus(), startBuild(type) }
export function renderPanel(ctx, building, arg) {
  const c = ctx.city();
  const def = buildingDef(building.type, c.blueprints);
  const head = h('header', { class: 'fc-panel-head' },
    h('span', { class: 'em' }, def.emoji),
    h('div', { class: 'grow' },
      h('input', { class: 'fc-panel-name', value: building.name || def.name, title: 'Renommer', onchange: (e) => guard(() => ctx.api.city.act({ type: 'configure', id: building.id, name: e.target.value === def.name ? '' : e.target.value })) }),
      h('small', {}, BUILDING_CATEGORIES[def.category]?.label || ''),
    ),
    h('button', { class: 'fc-icon-btn', title: 'Fermer', onclick: () => ctx.select(null) }, '✕'),
  );
  const access = !['deco', 'roads'].includes(def.category) && !hasRoadAccess(c, building) ? h('div', { class: 'fc-alert' }, '🚧 Pas de route devant ce bâtiment : les flux de données le rejoindront en volant. Trace une route qui le touche, ou :', h('button', { class: 'fc-btn small block', onclick: () => guard(() => ctx.api.city.act({ type: 'connect', id: building.id }), 'Bâtiment relié au réseau') }, '🛣️ Relier automatiquement à la route')) : null;
  const P = ctx.perms();
  const link = P.automate && ctx.linkable(building) ? h('button', { class: 'fc-btn primary block big', onclick: () => ctx.startLinking({ buildingId: ctx.linkable(building) === 'trigger' ? building.id : undefined }) }, '🔗 Relier ce bâtiment à un autre') : null;
  const body = h('div', { class: 'fc-panel-body' }, h('p', { class: 'fc-role' }, def.role), access, link);
  const fn = PANELS[def.panel] || (def.services ? servicePanel : def.blueprint ? blueprintBuildingPanel : genericPanel);
  body.append(...[].concat(fn(ctx, building, def, arg) || []).filter(Boolean));
  const foot = !P.build ? null : h('footer', { class: 'fc-panel-foot' },
    h('button', { class: 'fc-btn ghost small', onclick: () => guard(() => ctx.api.city.act({ type: 'move', id: building.id, x: building.x, z: building.z, rot: (building.rot + 1) % 4 })) }, '↻ Pivoter'),
    h('span', { class: 'fc-spacer' }),
    h('button', { class: 'fc-btn danger small', onclick: async () => (await confirmBox(`Démolir ${building.name || def.name} ?`, { ok: 'Démolir', danger: true })) && (await guard(() => ctx.api.city.act({ type: 'remove', id: building.id }))) && ctx.select(null) }, '🧨 Démolir'),
  );
  if (!P.build) head.querySelector('.fc-panel-name').disabled = true;
  return [head, body, foot].filter(Boolean);
}

const section = (title, ...children) => h('section', { class: 'fc-sec' }, h('h3', {}, title), ...children);

// ---------- Bâtiments de service ----------
function servicePanel(ctx, b, def) {
  const c = ctx.city();
  const out = [];
  for (const sid of def.services) {
    const s = SERVICES[sid];
    const connected = s.auth.kind === 'none' || (s.auth.kind === 'google' ? c.connections.includes('google') : c.connections.includes(sid));
    const used = c.workflows.filter((w) => w.nodes.some((n) => n.op.startsWith(`${sid}.`))).length;
    out.push(
      section(`${s.icon} ${s.name}`,
        h('p', { class: 'fc-muted' }, s.desc),
        h('div', { class: 'fc-row' }, h('span', { class: `fc-pill ${connected ? 'ok' : 'warn'}` }, connected ? (s.auth.kind === 'none' ? 'Sans compte' : '⚡ Connecté') : '🔌 À connecter'), h('small', { class: 'fc-muted' }, used ? `utilisé par ${plural(used, 'workflow')}` : 'pas encore utilisé'), !connected ? h('button', { class: 'fc-btn small', onclick: () => ctx.openPlace('centrale', sid) }, 'Brancher') : null),
        h('ul', { class: 'fc-ops' }, ...Object.entries(s.ops).map(([id, d]) => h('li', {}, h('span', { class: `k ${d.kind}` }, d.kind === 'trigger' ? '⚡' : d.kind === 'logic' ? '🔀' : '▶'), h('b', {}, d.label), h('small', {}, d.desc)))),
      ),
    );
  }
  return out;
}
function genericPanel(ctx, b, def) {
  if (def.category === 'deco') return h('p', { class: 'fc-muted small' }, 'Un peu de décor pour une ville agréable à parcourir (essaie la vue à pied 🚶).');
  return null;
}
function blueprintBuildingPanel(ctx, b, def) {
  const bp = def.blueprint;
  const what = bp.kind === 'workflow' ? `Lance le workflow « ${ctx.city().workflows.find((w) => w.id === bp.workflowId)?.name || '?'} »` : bp.kind === 'http' ? `Appelle ${bp.params?.url}` : `${SERVICES[bp.op.split('.')[0]]?.icon} ${opDef(bp.op)?.label}`;
  return [section('Fonction', h('p', {}, what), h('p', { class: 'fc-muted small' }, 'Quand tu relies des bâtiments, clique sur celui-ci : sa fonction est déjà réglée.')), h('button', { class: 'fc-btn block', onclick: () => ctx.openPlace('architecte', bp.id) }, '📐 Modifier le plan')];
}

// ---------- Mairie ----------
function mairie(ctx) {
  const c = ctx.city();
  const st = ctx.status();
  const lp = levelProgress(c.xp);
  const tasks = h('div', { class: 'fc-tasks' });
  const renderTasks = () => {
    const cc = ctx.city();
    put(tasks, 
      ...cc.tasks.filter((t) => !t.done).slice(0, 12).map((t) => h('label', { class: `fc-task p${t.priority}` }, h('input', { type: 'checkbox', onchange: () => guard(() => ctx.api.city.act({ type: 'task.update', id: t.id, done: true })) }), h('span', {}, t.title), h('small', {}, t.source !== 'toi' ? `🤖 ${t.source}` : t.due || ''))),
      cc.tasks.some((t) => !t.done) ? null : h('p', { class: 'fc-muted small' }, 'Aucune tâche en cours. Tes automatisations peuvent en créer pour toi (étape « Créer une tâche perso »).'),
    );
  };
  renderTasks();
  const add = h('input', { class: 'fc-input', placeholder: '+ Nouvelle tâche (Entrée)', onkeydown: async (e) => e.key === 'Enter' && e.target.value.trim() && (await guard(() => ctx.api.city.act({ type: 'task.add', title: e.target.value.trim() }))) && ((e.target.value = ''), renderTasks()) });
  const stats = [
    ['⏱️', fmtMinutes(savedMinutes(c)), 'temps gagné'],
    ['⚙️', c.workflows.filter((w) => w.enabled).length, 'automatisations en marche'],
    ['🏗️', c.buildings.length, 'bâtiments'],
    ['🔌', c.connections.length, 'connexions'],
  ];
  if (!c.sandbox) stats.push(['👥', population(c), 'habitants'], ['😊', `${happiness(c)} %`, 'bonheur']);
  return [
    section('Ta ville', h('div', { class: 'fc-row' }, h('input', { class: 'fc-input', value: c.name, onchange: (e) => guard(() => ctx.api.city.act({ type: 'city.rename', name: e.target.value })) })), h('div', { class: 'fc-stats' }, ...stats.map(([i, v, l]) => h('div', {}, h('span', {}, i), h('b', {}, String(v)), h('small', {}, l))))),
    section('Habitants', h('div', { class: 'fc-row wrap' }, ...c.people.slice(0, 8).map((p) => h('span', { class: 'fc-role-badge', title: p.email, style: { '--rc': c.roles.find((r) => r.id === p.roleId)?.color } }, `${c.roles.find((r) => r.id === p.roleId)?.emoji || ''} ${p.name}`)), c.people.length > 8 ? h('small', {}, `+${c.people.length - 8}`) : null), h('button', { class: 'fc-btn block', onclick: () => ctx.openPeople() }, '👥 Gérer les habitants et les rôles')),
    section('Tes tâches', add, tasks),
    section('Mode de jeu',
      h('div', { class: 'fc-seg wide' },
        h('button', { class: c.sandbox ? 'on' : '', onclick: () => guard(() => ctx.api.city.act({ type: 'city.sandbox', on: true })) }, '🧱 Bac à sable'),
        h('button', { class: c.sandbox ? '' : 'on', onclick: () => guard(() => ctx.api.city.act({ type: 'city.sandbox', on: false })) }, '🎮 Défi'),
      ),
      h('p', { class: 'fc-muted small' }, c.sandbox ? 'Tout est débloqué et gratuit : construis comme tu veux.' : `Niveau ${lp.level} (${lp.name}) · ${c.credits} crédits. Gagne des crédits avec les missions de l’École, les exécutions réelles et les impôts.`),
      c.sandbox ? null : h('button', { class: 'fc-btn block', disabled: c.lastTaxes === new Date().toISOString().slice(0, 10), onclick: () => guard(() => ctx.api.city.act({ type: 'taxes' })).then((r) => r && toast(`💰 +${r.info.amount} crédits`, 'ok')) }, c.lastTaxes === new Date().toISOString().slice(0, 10) ? 'Impôts collectés aujourd’hui ✔' : `💰 Collecter les impôts (+${dailyTaxes(c)})`),
    ),
    section('Ton usage', h('p', { class: 'fc-muted small' }, 'Choisis ce qui t’intéresse : la ville te propose les bons bâtiments et les bonnes recettes.'), h('div', { class: 'fc-profiles small' }, ...PROFILES.map((p) => h('button', { class: `fc-profile ${c.profile === p.id ? 'on' : ''}`, onclick: () => ctx.chooseProfile(p.id) }, h('span', {}, p.emoji), h('b', {}, p.name))))),
    section('Journal', h('ul', { class: 'fc-journal' }, ...c.journal.slice(0, 25).map((j) => h('li', { class: j.kind }, h('small', {}, fmtDate(j.at)), ' ', j.text)))),
    section('Compte',
      h('div', { class: 'fc-row' }, st.session?.picture ? h('img', { class: 'fc-avatar', src: st.session.picture, alt: '' }) : h('span', { class: 'fc-avatar' }, '👤'), h('div', { class: 'grow' }, h('b', {}, st.session?.name || ''), h('small', { class: 'fc-muted' }, st.session?.guest ? ' Visite sans compte (simulation)' : ` ${st.session?.email || ''}`))),
      h('div', { class: 'fc-row wrap' },
        h('button', { class: 'fc-btn small', onclick: () => guard(() => ctx.api.city.export(), 'Ville sauvegardée') }, '💾 Sauvegarder la ville'),
        h('button', { class: 'fc-btn small', onclick: () => guard(() => ctx.api.city.import()) }, '📂 Ouvrir une ville'),
        h('button', { class: 'fc-btn small danger', onclick: async () => (await confirmBox('Raser la ville et repartir d’une carte vide ? (Tes connexions restent enregistrées.)', { ok: 'Tout raser', danger: true })) && guard(() => ctx.api.city.act({ type: 'reset' })) }, '🧨 Repartir de zéro'),
        h('button', { class: 'fc-btn small ghost', onclick: () => ctx.logout() }, 'Se déconnecter'),
      ),
    ),
  ];
}

// ---------- Maison ----------
function maison(ctx) {
  const c = ctx.city();
  let timer;
  const notes = h('textarea', { class: 'fc-input notes', rows: 10, placeholder: 'Ton bloc-notes…', oninput: (e) => (clearTimeout(timer), (timer = setTimeout(() => ctx.api.city.act({ type: 'notes.save', text: e.target.value }), 600))) }, c.notes || '');
  const open = c.tasks.filter((t) => !t.done);
  const done = c.tasks.filter((t) => t.done).slice(0, 5);
  return [
    section(`Tes tâches (${open.length})`, ...open.slice(0, 20).map((t) => h('label', { class: `fc-task p${t.priority}` }, h('input', { type: 'checkbox', onchange: () => guard(() => ctx.api.city.act({ type: 'task.update', id: t.id, done: true })) }), h('span', {}, t.title), h('button', { class: 'fc-icon-btn tiny', title: 'Supprimer', onclick: () => guard(() => ctx.api.city.act({ type: 'task.delete', id: t.id })) }, '✕'))), open.length ? null : h('p', { class: 'fc-muted small' }, 'Rien à faire. Profite !'), done.length ? h('details', {}, h('summary', { class: 'fc-muted small' }, 'Faites récemment'), ...done.map((t) => h('div', { class: 'fc-task done' }, '✔ ', t.title))) : null),
    section('Bloc-notes', notes),
    section('Idées pour ta maison', h('ul', { class: 'fc-list' }, h('li', {}, '📅 Un rappel avant chaque rendez-vous (Beffroi + Tour radio).'), h('li', {}, '⛅ La météo chaque matin sur ton téléphone.'), h('li', {}, '⭐ Les mails étoilés deviennent des tâches ici.')), h('button', { class: 'fc-btn block', onclick: () => ctx.openPlace('bibliotheque') }, '📚 Voir les recettes')),
  ];
}

// ---------- École ----------
function ecole(ctx) {
  const c = ctx.city();
  const ms = missionStatus(c);
  return [
    h('div', { class: 'fc-progress' }, h('div', { style: { width: `${(ms.count / MISSIONS.length) * 100}%` } }), h('span', {}, `${ms.count} / ${MISSIONS.length} missions`)),
    ...ms.list.map((m) =>
      h('details', { class: `fc-mission ${m.done ? 'done' : ''} ${ms.current?.id === m.id ? 'current' : ''}`, open: ms.current?.id === m.id },
        h('summary', {}, h('span', {}, m.done ? '✅' : ms.current?.id === m.id ? '👉' : '⬜'), h('b', {}, m.title), h('small', {}, m.concept)),
        h('p', {}, m.story),
        h('ol', {}, ...m.steps.map((s) => h('li', {}, s))),
        h('small', { class: 'fc-muted' }, c.sandbox ? `+${m.reward.xp} XP` : `Récompense : ${m.reward.credits} crédits · ${m.reward.xp} XP`),
      ),
    ),
  ];
}

// ---------- Bibliothèque ----------
function bibliotheque(ctx) {
  const c = ctx.city();
  const prof = c.profile;
  const list = h('div', { class: 'fc-templates' });
  let filter = prof || 'all';
  const fill = () => {
    put(list, 
      ...TEMPLATES.filter((t) => filter === 'all' || t.profiles.includes(filter)).map((t) => {
        const missing = t.needs.filter((n) => !ctx.city().buildings.some((b) => b.type === n));
        return h('div', { class: 'fc-template' },
          h('div', { class: 'fc-row' }, h('b', { class: 'grow' }, t.name), h('small', { class: 'fc-pill' }, t.level)),
          h('p', { class: 'fc-muted small' }, t.desc),
          h('div', { class: 'fc-needs' }, ...t.needs.map((n) => h('span', { class: missing.includes(n) ? 'miss' : 'ok', title: BUILDINGS[n].name }, BUILDINGS[n].emoji))),
          missing.length ? h('p', { class: 'fc-muted small' }, `À construire d’abord : ${missing.map((n) => `${BUILDINGS[n].emoji} ${BUILDINGS[n].name}`).join(', ')}`) : null,
          h('div', { class: 'fc-row' },
            h('button', { class: 'fc-btn small primary', onclick: async () => {
              const r = await guard(() => ctx.api.city.act({ type: 'workflow.fromTemplate', id: t.id }));
              if (!r) return;
              if (missing.length) toast('Recette ajoutée à « Mes automatisations ». Construis les bâtiments manquants pour la faire marcher.', 'warn');
              else ctx.startLinking({ workflowId: r.info.id });
            } }, '➕ Utiliser cette recette'),
          ),
        );
      }),
    );
  };
  fill();
  const tabs = h('div', { class: 'fc-chips tabs' }, h('button', { class: `fc-chip ${filter === 'all' ? 'on' : ''}`, onclick: (e) => setF('all', e) }, 'Toutes'), ...PROFILES.map((p) => h('button', { class: `fc-chip ${filter === p.id ? 'on' : ''}`, onclick: (e) => setF(p.id, e) }, `${p.emoji} ${p.name}`)));
  function setF(f, e) {
    filter = f;
    tabs.querySelectorAll('.fc-chip').forEach((x) => x.classList.remove('on'));
    e.target.classList.add('on');
    fill();
  }
  return [section('Recettes d’automatisations', h('p', { class: 'fc-muted small' }, 'Des automatisations toutes prêtes, à adapter à ta façon.'), tabs, list), section('Glossaire', h('dl', { class: 'fc-glossary' }, ...GLOSSARY.flatMap(([t, d]) => [h('dt', {}, t), h('dd', {}, d)])))];
}

// ---------- Centrale électrique : connexions ----------
function centrale(ctx, b, def, focusService) {
  const c = ctx.city();
  const st = ctx.status();
  const built = availableServices(c);
  const out = [];
  const google = section('🟦 Google (Gmail, Drive, Agenda, Sheets)',
    st.session?.guest
      ? h('p', { class: 'fc-alert' }, 'Tu visites sans compte : tout fonctionne en simulation. Déconnecte-toi puis « Se connecter avec Google » pour agir sur tes vrais mails et fichiers.')
      : c.connections.includes('google')
        ? h('div', {}, h('p', {}, `⚡ Connecté en tant que ${st.session?.email}`), h('div', { class: 'fc-row' }, h('button', { class: 'fc-btn small', onclick: () => guard(() => ctx.api.cred.test('google')).then((m) => m && toast(m, 'ok')) }, 'Tester'), h('button', { class: 'fc-btn small ghost', onclick: async () => (await confirmBox('Déconnecter Google ? Les automatisations qui utilisent Gmail, Drive, Agenda ou Sheets s’arrêteront.', { ok: 'Déconnecter', danger: true })) && guard(() => ctx.api.auth.disconnectGoogle()).then(ctx.refreshStatus) }, 'Déconnecter')))
        : h('div', {}, h('p', { class: 'fc-muted' }, 'Google n’est plus connecté.'), h('button', { class: 'fc-btn primary', onclick: () => guard(() => ctx.api.auth.google()).then(ctx.refreshStatus) }, 'Reconnecter Google')),
  );
  if (!ctx.perms().connect) out.push(h('p', { class: 'fc-alert' }, '🔒 Ton rôle ne permet pas de brancher ou de changer les comptes. Tu peux voir ce qui est branché.'));
  out.push(h('p', { class: 'fc-muted small' }, st.encrypted ? '🔒 Les clés sont chiffrées sur ton ordinateur et ne quittent jamais ta machine (sauf vers le service concerné).' : st.demo ? 'Aperçu navigateur : les informations restent dans ce navigateur.' : '⚠️ Chiffrement indisponible sur ce système : les clés sont stockées en clair.'), google);
  const entries = Object.entries(SERVICES).filter(([, s]) => s.auth.kind === 'fields');
  entries.sort(([a], [b2]) => Number(built.has(b2)) - Number(built.has(a)) || (a === focusService ? -1 : b2 === focusService ? 1 : 0));
  const byCat = {};
  for (const [id, s] of entries) (byCat[s.category] ||= []).push([id, s]);
  for (const [cat, list] of Object.entries(byCat)) {
    out.push(h('h3', { class: 'fc-cat' }, CATEGORIES[cat]?.label || cat));
    for (const [id, s] of list) {
      const saved = st.credentials?.[id];
      const inputs = {};
      const form = h('div', { class: 'fc-form' }, ...s.auth.fields.map((f) => h('label', { class: 'fc-field' }, h('span', {}, f.label), (inputs[f.key] = h('input', { class: 'fc-input', type: f.secret ? 'password' : 'text', value: saved?.[f.key] || '', placeholder: f.placeholder || '', autocomplete: 'off' })))));
      out.push(
        h('details', { class: 'fc-cred', open: id === focusService },
          h('summary', {}, h('span', {}, s.icon), h('b', {}, s.name), h('span', { class: `fc-pill ${saved ? 'ok' : ''}` }, saved ? '⚡ branché' : 'non branché'), built.has(id) ? null : h('small', { class: 'fc-muted' }, ' (bâtiment pas encore construit)')),
          h('p', { class: 'fc-muted small' }, s.auth.help || ''),
          form,
          h('div', { class: 'fc-row' },
            h('button', { class: 'fc-btn small primary', disabled: !ctx.perms().connect, onclick: async () => {
              const values = Object.fromEntries(Object.entries(inputs).map(([k, el]) => [k, el.value]));
              const r = await guard(() => ctx.api.cred.save(id, values), `${s.name} enregistré`);
              if (r) ctx.refreshStatus();
            } }, 'Enregistrer'),
            h('button', { class: 'fc-btn small', onclick: () => guard(() => ctx.api.cred.test(id)).then((m) => m && toast(`${s.name} : ${m}`, 'ok')) }, 'Tester la connexion'),
            saved ? h('button', { class: 'fc-btn small ghost', onclick: () => guard(() => ctx.api.cred.remove(id)).then(ctx.refreshStatus) }, 'Oublier') : null,
          ),
        ),
      );
    }
  }
  return out;
}

// ---------- Laboratoire IA (assistant) ----------
function labo(ctx, b, def) {
  const out = servicePanel(ctx, b, def);
  const log = h('div', { class: 'fc-chat-log' }, ...(ctx.chat.history.length ? ctx.chat.history.map(chatBubble) : [h('div', { class: 'fc-bubble ai' }, 'Salut ! Je suis Claude, ton assistant d’automatisation. Dis-moi ce que tu voudrais automatiser (« ranger mes factures », « suivre mes candidatures »…) et je t’aide à la construire, pas à pas.')]));
  const input = h('textarea', { class: 'fc-input', rows: 2, placeholder: 'Ex. : je veux être prévenu quand un recruteur me répond' });
  const send = async () => {
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    ctx.chat.history.push({ role: 'user', text });
    log.append(chatBubble({ role: 'user', text }));
    log.scrollTop = log.scrollHeight;
    await guard(() => ctx.api.assistant.send(text, false));
  };
  input.addEventListener('keydown', (e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), send()));
  ctx.chat.log = log;
  out.unshift(section('✳️ Assistant Claude', log, h('div', { class: 'fc-row' }, input, h('button', { class: 'fc-btn primary', onclick: send }, 'Envoyer')), h('div', { class: 'fc-row' }, h('small', { class: 'fc-muted grow' }, ctx.status().claude ? 'Claude voit ta ville et peut te proposer des automatisations (tu valides avant création).' : '🔌 Branche ta clé Claude à la Centrale électrique pour discuter.'), h('button', { class: 'fc-btn small ghost', onclick: () => ((ctx.chat.history = []), ctx.api.assistant.reset(), put(log)) }, 'Nouvelle discussion'))));
  return out;
}
export function chatBubble(m) {
  return h('div', { class: `fc-bubble ${m.role === 'user' ? 'me' : m.role === 'tool' ? 'tool' : m.role === 'error' ? 'err' : 'ai'}` }, m.text);
}

// ---------- Atelier modulable ----------
function atelier(ctx, b) {
  const ops = allOps().filter((o) => o.kind !== 'trigger');
  const cur = b.config?.op;
  const sel = h('select', { class: 'fc-input', onchange: (e) => guard(() => ctx.api.city.act({ type: 'configure', id: b.id, config: { op: e.target.value } })) }, h('option', { value: '' }, '— choisir une fonction —'), ...Object.entries(SERVICES).map(([sid, s]) => h('optgroup', { label: `${s.icon} ${s.name}` }, ...ops.filter((o) => o.service === sid).map((o) => h('option', { value: o.id, selected: o.id === cur }, o.label)))));
  const color = h('input', { type: 'color', value: b.config?.color || '#c8d1dc', onchange: (e) => guard(() => ctx.api.city.act({ type: 'configure', id: b.id, config: { color: e.target.value } })) });
  return [
    section('Fonction de l’atelier', sel, cur ? h('p', { class: 'fc-muted small' }, opDef(cur)?.desc) : h('p', { class: 'fc-muted small' }, 'Un atelier débloque une seule étape, sans construire le grand bâtiment. Pratique pour une petite ville !')),
    section('Couleur', h('div', { class: 'fc-row' }, color, h('small', { class: 'fc-muted' }, 'Personnalise son apparence.'))),
  ];
}

// ---------- Bureau d'architecte ----------
function architecte(ctx, b, def, editId) {
  const c = ctx.city();
  const blank = { name: 'Mon bâtiment', emoji: '🏗️', desc: '', shape: 'office', color: '#88aaff', accent: '#ffb020', floors: 3, size: [1, 1], kind: 'op', op: 'discord.send', params: defaultParams('discord.send') };
  let bp = structuredClone(c.blueprints.find((x) => x.id === editId) || blank);
  const preview = miniPreview();
  const form = h('div', { class: 'fc-form' });
  const refresh = () => {
    preview.set(bp);
    renderForm();
  };
  const fld = (label, el) => h('label', { class: 'fc-field' }, h('span', {}, label), el);
  function renderForm() {
    const opSel = h('select', { class: 'fc-input', onchange: (e) => ((bp.op = e.target.value), (bp.params = defaultParams(bp.op)), renderForm()) }, ...Object.entries(SERVICES).map(([sid, s]) => h('optgroup', { label: `${s.icon} ${s.name}` }, ...Object.entries(s.ops).filter(([, d]) => d.kind !== 'trigger').map(([id, d]) => h('option', { value: id, selected: bp.op === id }, d.label)))));
    const params = h('div', { class: 'fc-form sub' });
    if (bp.kind === 'op' && opDef(bp.op))
      for (const f of opDef(bp.op).fields || []) {
        if (!fieldVisible(f, bp.params, bp.op)) continue;
        const el = f.type === 'select' ? h('select', { class: 'fc-input', onchange: (e) => (bp.params[f.key] = e.target.value) }, ...f.options.map(([v, l]) => h('option', { value: v, selected: (bp.params[f.key] ?? f.default) === v }, l))) : h(f.type === 'textarea' ? 'textarea' : 'input', { class: 'fc-input', value: bp.params[f.key] || '', placeholder: f.placeholder || '', oninput: (e) => (bp.params[f.key] = e.target.value) }, f.type === 'textarea' ? bp.params[f.key] || '' : null);
        params.append(fld(`${f.label} (préréglé)`, el));
      }
    if (bp.kind === 'http') {
      bp.params ||= {};
      params.append(
        fld('Méthode', h('select', { class: 'fc-input', onchange: (e) => (bp.params.method = e.target.value) }, ...['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map((m) => h('option', { selected: (bp.params.method || 'GET') === m }, m)))),
        fld('Adresse de l’API', h('input', { class: 'fc-input', value: bp.params.url || '', placeholder: 'https://api.exemple.com/…', oninput: (e) => (bp.params.url = e.target.value) })),
        fld('En-têtes', h('textarea', { class: 'fc-input', rows: 2, placeholder: 'Authorization: Bearer …', oninput: (e) => (bp.params.headers = e.target.value) }, bp.params.headers || '')),
        fld('Corps (JSON)', h('textarea', { class: 'fc-input', rows: 3, placeholder: '{"texte": "{{subject}}"}', oninput: (e) => (bp.params.body = e.target.value) }, bp.params.body || '')),
      );
    }
    put(form, 
      h('div', { class: 'fc-row' }, fld('Nom', h('input', { class: 'fc-input', value: bp.name, oninput: (e) => (bp.name = e.target.value) })), fld('Emoji', h('input', { class: 'fc-input emoji', value: bp.emoji, maxlength: 4, oninput: (e) => (bp.emoji = e.target.value) }))),
      fld('À quoi il sert (pour toi)', h('input', { class: 'fc-input', value: bp.desc, placeholder: 'Prévient la coloc sur Discord', oninput: (e) => (bp.desc = e.target.value) })),
      h('div', { class: 'fc-row' },
        fld('Forme', h('select', { class: 'fc-input', onchange: (e) => ((bp.shape = e.target.value), refresh()) }, ...BLUEPRINT_SHAPES.map(([v, l]) => h('option', { value: v, selected: bp.shape === v }, l)))),
        fld('Étages', h('input', { class: 'fc-input', type: 'range', min: 1, max: 12, value: bp.floors, oninput: (e) => ((bp.floors = Number(e.target.value)), preview.set(bp)) })),
      ),
      h('div', { class: 'fc-row' },
        fld('Couleur', h('input', { type: 'color', value: bp.color, oninput: (e) => ((bp.color = e.target.value), preview.set(bp)) })),
        fld('Détails', h('input', { type: 'color', value: bp.accent, oninput: (e) => ((bp.accent = e.target.value), preview.set(bp)) })),
        fld('Taille', h('select', { class: 'fc-input', onchange: (e) => ((bp.size = e.target.value.split('x').map(Number)), refresh()) }, ...['1x1', '2x1', '2x2', '3x2', '3x3'].map((v) => h('option', { selected: bp.size.join('x') === v }, v)))),
      ),
      fld('Fonction du bâtiment', h('div', { class: 'fc-seg wide' }, ...[['op', '▶ Une action'], ['http', '🌐 Une API'], ['workflow', '⚙️ Un workflow']].map(([k, l]) => h('button', { class: bp.kind === k ? 'on' : '', onclick: () => ((bp.kind = k), renderForm()) }, l)))),
      bp.kind === 'op' ? fld('Action', opSel) : null,
      bp.kind === 'workflow' ? fld('Workflow lancé', h('select', { class: 'fc-input', onchange: (e) => (bp.workflowId = e.target.value) }, h('option', { value: '' }, '— choisir —'), ...c.workflows.map((w) => h('option', { value: w.id, selected: bp.workflowId === w.id }, w.name)))) : null,
      params,
      h('p', { class: 'fc-muted small' }, c.sandbox ? '' : `Coût de construction : ${blueprintCost(bp)} crédits`),
      h('div', { class: 'fc-row' },
        h('button', { class: 'fc-btn primary', onclick: async () => {
          const r = await guard(() => ctx.api.city.act({ type: 'blueprint.save', blueprint: bp }), 'Plan enregistré');
          if (r) {
            bp = structuredClone(r.info);
            ctx.startBuild(`bp:${bp.id}`);
          }
        } }, '💾 Enregistrer et construire'),
        editId ? h('button', { class: 'fc-btn ghost', onclick: () => ((bp = structuredClone(blank)), refresh()) }, 'Nouveau plan') : null,
      ),
    );
  }
  refresh();
  const list = c.blueprints.length
    ? section('Tes plans', ...c.blueprints.map((x) => h('div', { class: 'fc-row bp' }, h('span', {}, x.emoji), h('b', { class: 'grow' }, x.name), h('button', { class: 'fc-btn small', onclick: () => ctx.startBuild(`bp:${x.id}`) }, 'Construire'), h('button', { class: 'fc-btn small ghost', onclick: () => ctx.openPlace('architecte', x.id) }, 'Modifier'), h('button', { class: 'fc-icon-btn tiny', title: 'Supprimer', onclick: () => guard(() => ctx.api.city.act({ type: 'blueprint.delete', id: x.id })).then((r) => r && ctx.openPlace('architecte')) }, '✕'))))
    : null;
  return [section(editId ? 'Modifier le plan' : 'Dessiner un bâtiment', preview.el, form), list];
}
// Aperçu 3D tournant du bâtiment en cours de dessin
function miniPreview() {
  const canvas = h('canvas', { class: 'fc-preview', width: 320, height: 200 });
  const r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight('#ffffff', '#88aa77', 1.3));
  const sun = new THREE.DirectionalLight('#fff', 2);
  sun.position.set(5, 10, 6);
  scene.add(sun);
  const cam = new THREE.PerspectiveCamera(35, 320 / 200, 0.1, 200);
  let model = null;
  let t = 0;
  const loop = () => {
    if (!canvas.isConnected && t > 1) return r.dispose();
    t += 0.016;
    if (model) model.rotation.y = t * 0.6;
    r.render(scene, cam);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  return {
    el: canvas,
    set(bp) {
      if (model) scene.remove(model);
      const def = { name: bp.name, style: { shape: bp.shape, color: bp.color, accent: bp.accent, floors: bp.floors }, size: bp.size };
      model = buildModel(def, bp.size);
      scene.add(model);
      const box = new THREE.Box3().setFromObject(model);
      const sz = box.getSize(new THREE.Vector3()).length();
      cam.position.set(sz * 0.9, sz * 0.7, sz * 0.9);
      cam.lookAt(0, box.max.y * 0.4, 0);
    },
  };
}

// ---------- Caserne : erreurs ----------
function caserne(ctx) {
  const c = ctx.city();
  const fails = c.runs.filter((r) => !r.ok).slice(0, 20);
  return [
    section(`🔥 Incendies récents (${fails.length})`, fails.length ? null : h('p', { class: 'fc-muted' }, 'Aucun incendie : tous tes workflows tournent bien. 👏'), ...fails.map((r) => h('div', { class: 'fc-fail' }, h('div', { class: 'fc-row' }, h('b', { class: 'grow' }, r.workflowName), h('small', {}, fmtDate(r.at))), h('p', { class: 'fc-alert inline' }, r.error), h('p', { class: 'fc-muted small' }, explainError(r.error)), h('div', { class: 'fc-row' }, h('button', { class: 'fc-btn small', onclick: () => ctx.startLinking({ workflowId: r.workflowId }) }, 'Ouvrir l’automatisation'), h('button', { class: 'fc-btn small', onclick: () => guard(() => ctx.api.wf.run(r.workflowId)) }, '↻ Relancer'))))),
    section('🚨 Alerte en cas d’erreur', h('p', { class: 'fc-muted small' }, 'Quand un workflow coché échoue, tu reçois une notification (et sur ton téléphone si ntfy est branché).'), ...c.workflows.map((w) => h('label', { class: 'fc-check' }, h('input', { type: 'checkbox', checked: w.alertOnError, onchange: (e) => guard(() => ctx.api.city.act({ type: 'workflow.save', workflow: { ...w, alertOnError: e.target.checked } })) }), w.name))),
  ];
}
function explainError(e = '') {
  if (/non connecté|Centrale/i.test(e)) return '💡 Un service n’est pas branché : va à la Centrale électrique.';
  if (/401|403|invalide|expir|révoqu/i.test(e)) return '💡 La clé ou l’autorisation n’est plus valable : reconnecte le service à la Centrale.';
  if (/404|introuvable/i.test(e)) return '💡 Quelque chose n’existe pas (identifiant de fichier, de dossier, adresse) : vérifie les champs de l’étape.';
  if (/429|Trop/i.test(e)) return '💡 Le service reçoit trop de demandes : espace les exécutions ou ajoute une Limite.';
  if (/obligatoire|vide|manquant/i.test(e)) return '💡 Un champ obligatoire est vide (parfois une {{variable}} qui n’existe pas).';
  return '💡 Ouvre l’automatisation (bouton Modifier) et vérifie les réglages de chaque étape.';
}

// ---------- Hôpital : bilan de santé ----------
function hopital(ctx) {
  const c = ctx.city();
  const conns = c.connections;
  const rows = c.workflows.map((w) => {
    const issues = validate(w, { isAvailable: (op) => availableServicesHas(c, op), isConnected: (op) => isConn(conns, op), real: w.mode === 'real' });
    const errors = issues.filter((i) => i.level === 'error');
    const rate = w.stats?.runs ? Math.round((w.stats.ok / w.stats.runs) * 100) : null;
    return h('div', { class: 'fc-health' }, h('span', {}, errors.length ? '🤒' : issues.length ? '🤧' : '💪'), h('div', { class: 'grow' }, h('b', {}, w.name), h('small', { class: 'fc-muted' }, errors[0]?.text || issues[0]?.text || 'En pleine forme.')), rate !== null ? h('span', { class: 'fc-pill' }, `${rate} % de réussite`) : null, h('button', { class: 'fc-btn small ghost', onclick: () => ctx.startLinking({ workflowId: w.id }) }, 'Soigner'));
  });
  const testAll = async () => {
    for (const s of ['google', ...conns.filter((x) => x !== 'google')]) {
      if (s === 'google' && !conns.includes('google')) continue;
      try {
        const m = await ctx.api.cred.test(s);
        toast(`✅ ${SERVICES[s]?.name || 'Google'} : ${m}`, 'ok');
      } catch (e) {
        toast(`❌ ${SERVICES[s]?.name || 'Google'} : ${String(e.message).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')}`, 'error');
      }
    }
  };
  return [section('Connexions', h('p', { class: 'fc-muted small' }, `${plural(conns.length, 'service branché', 'services branchés')}.`), h('button', { class: 'fc-btn', onclick: testAll }, '🩺 Tester toutes les connexions')), section('Workflows', ...(rows.length ? rows : [h('p', { class: 'fc-muted' }, 'Pas encore de patients.')]))];
}
const availableServicesHas = (c, op) => availableServices(c).has(op.split('.')[0]) || c.buildings.some((b) => b.config?.op === op);
const isConn = (conns, op) => {
  const s = SERVICES[op.split('.')[0]];
  return !s || s.auth.kind === 'none' || (s.auth.kind === 'google' ? conns.includes('google') : conns.includes(op.split('.')[0]));
};

// ---------- Commissariat : sécurité ----------
function commissariat(ctx) {
  const c = ctx.city();
  const writers = c.workflows.filter((w) => w.nodes.some((n) => opDef(n.op)?.write));
  return [
    section('Règles de prudence', h('ul', { class: 'fc-list' }, h('li', {}, 'Teste toujours en 🧪 simulation avant de passer en ⚡ réel.'), h('li', {}, 'Mets « Demander mon accord » avant une action sensible (mail à un client, publication…).'), h('li', {}, 'Ajoute une « Limite » après une recherche pour ne jamais traiter 200 éléments d’un coup.'), h('li', {}, 'Ne colle jamais une clé ailleurs qu’à la Centrale électrique.'))),
    section(`Workflows qui agissent pour toi (${writers.length})`, ...writers.map((w) => h('div', { class: 'fc-health' }, h('span', {}, w.mode === 'real' ? '⚡' : '🧪'), h('div', { class: 'grow' }, h('b', {}, w.name), h('small', { class: 'fc-muted' }, w.nodes.filter((n) => opDef(n.op)?.write).map((n) => opDef(n.op).label).join(', '))), w.nodes.some((n) => n.op === 'logic.approval') ? h('span', { class: 'fc-pill ok' }, 'avec accord') : h('span', { class: 'fc-pill warn' }, 'sans accord'), h('button', { class: 'fc-btn small ghost', onclick: () => ctx.startLinking({ workflowId: w.id }) }, 'Voir'))), writers.length ? null : h('p', { class: 'fc-muted' }, 'Aucun workflow n’écrit encore dans tes comptes.')),
  ];
}

// ---------- Observatoire : statistiques ----------
function observatoire(ctx) {
  const c = ctx.city();
  const days = [...Array(14)].map((_, i) => {
    const d = new Date(Date.now() - (13 - i) * 86400000).toISOString().slice(0, 10);
    const runs = c.runs.filter((r) => r.at.startsWith(d));
    return { d, ok: runs.filter((r) => r.ok).length, ko: runs.filter((r) => !r.ok).length };
  });
  const max = Math.max(1, ...days.map((x) => x.ok + x.ko));
  const chart = h('div', { class: 'fc-bars' }, ...days.map((x) => h('div', { class: 'bar', title: `${x.d} : ${x.ok} réussies, ${x.ko} échouées` }, h('i', { class: 'ko', style: { height: `${(x.ko / max) * 100}%` } }), h('i', { class: 'ok', style: { height: `${(x.ok / max) * 100}%` } }), h('small', {}, x.d.slice(8)))));
  const byWf = c.workflows.map((w) => ({ w, saved: c.runs.filter((r) => r.workflowId === w.id && r.ok && r.mode === 'real').reduce((s, r) => s + (r.savedMinutes || 0), 0) })).sort((a, b) => b.saved - a.saved);
  return [section('Exécutions (14 jours)', chart), section(`Temps gagné : ${fmtMinutes(savedMinutes(c))}`, h('p', { class: 'fc-muted small' }, 'Estimation : 1 minute par action réelle, 2 par action qui écrit ou envoie quelque chose.'), ...byWf.map(({ w, saved }) => h('div', { class: 'fc-row' }, h('span', { class: 'grow' }, w.name), h('b', {}, fmtMinutes(saved)))))];
}

// ---------- Banque ----------
function banque(ctx, b, def) {
  const c = ctx.city();
  return [...servicePanel(ctx, b, def), c.sandbox ? null : section(`Trésor : ${c.credits} crédits`, h('ul', { class: 'fc-journal' }, ...c.ledger.slice(0, 30).map((l) => h('li', {}, h('b', { class: l.amount > 0 ? 'pos' : 'neg' }, `${l.amount > 0 ? '+' : ''}${l.amount}`), ' ', l.label))))].filter(Boolean);
}

const PANELS = { mairie, maison, ecole, bibliotheque, centrale, labo, atelier, architecte, caserne, hopital, commissariat, observatoire, banque };
