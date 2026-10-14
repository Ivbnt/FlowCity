// Intérieurs des bâtiments : ce que l'on voit en cliquant sur la bibliothèque, la banque, la mairie,
// le studio, le magasin, la salle de concert, l'école, le clocher, le tableau et le facteur.
import { findNode, walk, norm, evaluate, projectState } from '../shared/advisor.mjs';
import { themeGroups } from '../shared/layout.mjs';
import { eventInfo, isPastEvent, deadlines, TITLES, ROLE_SUGGESTIONS, memberZone, LEVELS, POLES, HOME_TYPES, homeType, polePeople } from '../shared/registry.mjs';
import { LANDMARK_ICON, GENRE_COLORS, GENRE_LABELS } from './landmarks.js';

const DAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
const fmtDate = (d) => (d ? new Date(`${d}T12:00`).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' }) : 'sans date');
const today = () => new Date().toISOString().slice(0, 10);

export function makeInteriors(ctx) {
  // Objet renvoyé (complété à la fin) : main.js peut y ranger des infos partagées, ex. la question du post-it
  const self = {};
  const { h, icon, kindIcon, state, api, select, openFile, askClaude, toast, panelLayout, crumb, btn, navRow, fileRow, taskRow, addTaskForm, emptyState, checklist, tasksUnder, dColor, plural } = ctx;
  const reg = () => state.registry || { members: [], artists: [], gear: [], events: [], reminders: [], schedule: [], gigs: [], trainings: [], playlists: [] };
  const upsert = (kind, item) => api.registry.upsert(kind, item);
  const remove = (kind, id) => api.registry.remove(kind, id);
  const tabbed = (keys, def) => {
    if (!keys.includes(state.tab)) state.tab = def;
    return state.tab;
  };
  const findByName = (re) => {
    let f = null;
    walk(state.tree, (n) => {
      if (!f && re.test(norm(n.name))) f = n;
    });
    return f;
  };
  const quickOpen = (re, label) => {
    const n = findByName(re);
    return n ? h('button', { class: 'quick', onclick: () => openFile(n) }, kindIcon(n.kind, 15), label || n.name) : null;
  };
  const eventDistrict = () => [...state.layout.values()].find((L) => L.zone === 'event') || [...state.layout.values()].find((L) => L.mode === 'projects');
  // Tous les projets d'EVENT, qu'ils soient dans le quartier événementiel ou TRS Radio
  const projectSubs = () => [...state.layout.values()].filter((L) => L.zone === 'event' || L.zone === 'radio' || L.mode === 'projects').flatMap((L) => L.subs);
  const zoneL = (key) => [...state.layout.values()].find((L) => L.zone === key);
  const zoneCrumb = (key) => {
    const L = zoneL(key);
    return L ? crumb(L.district.name, L.district.id) : null;
  };
  const mairieSub = () => [...state.layout.values()].flatMap((L) => L.subs).find((s) => s.landmark === 'mairie');
  const memberById = (id) => reg().members.find((m) => m.id === id);
  const field = (label, input) => h('label', { class: 'field' }, h('span', {}, label), input);

  // ---------- Bibliothèque (centre de la ville et de Claude) ----------
  function library(panel) {
    const tab = tabbed(['archives', 'skills', 'ext'], 'archives');
    let body;
    if (tab === 'archives') {
      const arch = [];
      walk(state.tree, (n, depth) => {
        if (depth >= 1 && n.kind === 'folder' && (projectState(n) !== 'active' || /archive/.test(norm(n.name)))) arch.push({ n, why: projectState(n) === 'abandoned' ? 'abandonné' : 'terminé / archivé' });
      });
        for (const s of projectSubs()) {
        if (s.kind !== 'project' || arch.some((a) => a.n.id === s.id)) continue;
        if (isPastEvent(eventInfo(reg(), s.id), s.state)) arch.push({ n: s.node, why: 'événement passé' });
      }
      body = [
        h('p', { class: 'muted' }, 'Projets terminés, abandonnés ou passés, rangés ici pour mémoire.'),
        arch.length ? h('div', { class: 'files' }, ...arch.map(({ n, why }) => navRow(n, ctx.zoneOf(n.id) || state.tree, why))) : emptyState('Aucune archive pour l’instant.'),
      ];
    } else if (tab === 'skills') {
      body = [
        h('p', { class: 'muted' }, 'Ce que Claude sait faire dans la ville. Les actions qui modifient le Drive ou lancent n8n te demandent toujours ton accord.'),
        h('div', { class: 'skills' }, ...(state.tools || []).map((t) => h('div', { class: 'skill' }, icon('sparkles', 14), h('div', {}, h('b', {}, t.name), h('small', {}, t.description))))),
      ];
    } else {
      const st = state.status;
      const ext = (ico, name, on, detail) => h('div', { class: 'row' }, icon(ico, 16), h('div', { class: 'grow' }, h('b', {}, name), h('small', {}, detail)), h('span', { class: `status ${on ? 'on' : ''}` }, on ? 'actif' : 'à connecter'));
      body = [
        ext('sparkles', 'Claude', st.claude, st.settings.model),
        ext('folder', 'Google Drive', st.google, st.google ? 'synchro en direct' : `instantané du ${new Date(state.tree.snapshotDate || Date.now()).toLocaleDateString('fr-FR')}`),
        ext('zap', 'n8n', st.n8n || state.workflows.length, `${plural(state.workflows.length, 'workflow')}`),
        ext('bot', 'Routines Claude', state.routines.some((r) => r.enabled), `${plural(state.routines.filter((r) => r.enabled).length, 'routine')} active(s)`),
        h('button', { class: 'btn soft full', onclick: () => ctx.openDrawer('settings') }, icon('settings', 15), 'Gérer les connexions'),
      ];
    }
    panelLayout(panel, {
      kicker: [zoneCrumb('info'), crumb(`${LANDMARK_ICON.library} Bibliothèque`)].filter(Boolean),
      title: 'Bibliothèque',
      color: '#ff2d55',
      actions: [btn('sparkles', 'Point global', () => askClaude('Fais le point global sur le studio : projets en retard, priorités de la semaine, deadlines et ce qu’il manque au business plan.'), 'claude'), btn('roadmap', 'Feuille de route', () => ctx.openDrawer('roadmap'))],
      tabs: [{ key: 'archives', label: 'Archives' }, { key: 'skills', label: 'Compétences', count: (state.tools || []).length }, { key: 'ext', label: 'Extensions' }],
      body,
    });
  }
  const walkHas = (root, id) => {
    let f = false;
    walk(root, (n) => (f = f || n.id === id));
    return f;
  };

  // ---------- Banque ----------
  function bank(panel, sub, d) {
    const tab = tabbed(['accounts', 'todo'], 'accounts');
    const all = sub.items.flatMap((n) => tasksUnder(n));
    const body =
      tab === 'accounts'
        ? [
            h('div', { class: 'quicks' }, quickOpen(/tableau de bord/, 'Tableau de bord des dépenses'), quickOpen(/budget previsionel|budget previsionnel/, 'Budget prévisionnel'), quickOpen(/mensualit/, 'Mensualités'), quickOpen(/suivie du materiel/, 'Suivi du matériel')),
            h('div', { class: 'files' }, ...sub.items.map((n) => fileRow(n, false))),
          ]
        : [addTaskForm(sub.items.map((n) => ({ id: n.id, label: n.name.slice(0, 28) }))), all.length ? null : emptyState('Aucune tâche.'), ...all.map((t) => taskRow(t, { showPlace: true }))];
    panelLayout(panel, {
      kicker: [crumb(d.name, d.id), crumb(`${LANDMARK_ICON.bank} Banque`)],
      title: 'Banque — budget de l’asso',
      color: '#2fd17a',
      actions: [btn('sparkles', 'Faire le point budget', () => askClaude('Lis les documents de budget (BUDGET ASSO, tableau de bord des dépenses, budgets prévisionnels) et fais le point : dépenses, recettes, écarts, ce qu’il manque. Crée les tâches utiles.', d.id), 'claude')],
      tabs: [{ key: 'accounts', label: 'Comptes', count: sub.items.length }, { key: 'todo', label: 'À faire', count: all.filter((t) => !t.done).length }],
      body,
    });
  }

  // ---------- Mairie (administratif + habitants) ----------
  function mairie(panel, sub, d) {
    const ev = evaluate(d, d, state.tasks);
    const tab = tabbed(['services', 'people', 'todo', 'progress'], 'people');
    const all = sub.items.flatMap((n) => tasksUnder(n));
    let body;
    if (tab === 'services') body = [h('p', { class: 'muted' }, 'Les guichets de la mairie : statuts, licences, assurances, fiches artistes, stratégie…'), h('div', { class: 'files' }, ...sub.items.map((n) => fileRow(n, false)))];
    else if (tab === 'people') body = habitants();
    else if (tab === 'todo') body = [addTaskForm(sub.items.map((n) => ({ id: n.id, label: n.name.slice(0, 28) }))), all.length ? null : emptyState('Aucune tâche.'), ...all.map((t) => taskRow(t, { showPlace: true }))];
    else body = [checklist(ev, d.folders?.[0]?.id || d.id)];
    panelLayout(panel, {
      kicker: [crumb(d.name, d.id), crumb(`${LANDMARK_ICON.mairie} Mairie`)],
      title: 'Mairie',
      color: '#5d8bff',
      score: ev.score,
      actions: [btn('sparkles', 'Vérifier l’administratif', () => askClaude('Fais le point sur l’administratif de l’association : statuts, licences, assurances, subventions. Qu’est-ce qui manque ou arrive à échéance ? Crée les tâches et rappels utiles.', d.id), 'claude'), btn('calendar', 'Concerts à Paris', () => select('lm:gigs'))],
      tabs: [{ key: 'people', label: 'Habitants', count: reg().members.length }, { key: 'services', label: 'Guichets', count: sub.items.length }, { key: 'todo', label: 'À faire', count: all.filter((t) => !t.done).length }, { key: 'progress', label: 'Progression' }],
      body,
    });
  }

  // Liste des habitants gérée depuis la mairie : titre (maire, adjoint…), rôle dans l'asso, documents.
  const roleList = () => h('datalist', { id: 'role-suggest' }, ...ROLE_SUGGESTIONS.map((r) => h('option', { value: r })));
  const zoneLabel = (m) => ({ mairie: 'à la mairie', 'q:admin': 'quartier administratif', 'q:music': 'près des lieux de musique' })[memberZone(m)] || 'se balade en ville';
  function habitants() {
    const members = [...reg().members].sort((a, b) => TITLES.indexOf(a.title || 'Habitant') - TITLES.indexOf(b.title || 'Habitant'));
    const nameIn = h('input', { type: 'text', placeholder: 'Prénom' });
    const roleIn = h('input', { type: 'text', placeholder: 'Rôle dans l’asso', list: 'role-suggest' });
    const titleIn = h('select', {}, ...TITLES.map((t) => h('option', { value: t, selected: t === 'Habitant' }, t)));
    return [
      roleList(),
      h('p', { class: 'muted' }, 'Les membres de l’asso sont les habitants de la ville. Le président est le maire, le vice-président son adjoint. Les techniciens et photographes traînent près des lieux de musique, l’organisation dans l’administratif.'),
      ...members.map((m) => {
        const title = h('select', { class: 'mini-select' }, ...TITLES.map((t) => h('option', { value: t, selected: t === (m.title || 'Habitant') }, t)));
        const role = h('input', { type: 'text', value: m.role || '', list: 'role-suggest', placeholder: 'Rôle' });
        const save = () => upsert('members', { id: m.id, title: title.value, role: role.value.trim() }).then(() => toast(`${m.name} : ${title.value} · ${role.value.trim() || 'sans rôle'}`, 'ok'));
        title.addEventListener('change', save);
        role.addEventListener('change', save);
        return h('div', { class: 'resident', vars: { '--c': m.color || '#ffb020' } },
          h('button', { class: 'avatar', title: 'Ouvrir sa fiche', onclick: () => select(`member:${m.id}`) }, m.name[0]),
          h('div', { class: 'grow' }, h('b', {}, m.name), h('small', {}, `${plural((m.docs || []).length, 'document')} · ${zoneLabel(m)}`), h('div', { class: 'two' }, title, role)),
          h('button', { class: 'icon-btn tiny', title: 'Documents et dossiers', onclick: () => {
            state.tab = 'docs';
            select(`member:${m.id}`);
          } }, icon('file', 14)));
      }),
      h('h4', { class: 'sec' }, 'Nouvel habitant'),
      h('div', { class: 'add-gear' }, h('div', { class: 'two' }, nameIn, titleIn), roleIn, h('button', { class: 'btn soft full', onclick: async () => {
        if (!nameIn.value.trim()) return;
        const colors = ['#ff5577', '#33c6ff', '#ffb020', '#9b7bff', '#2fd17a', '#ff6bd5', '#4f8bff', '#ff8a3d'];
        await upsert('members', { name: nameIn.value.trim(), title: titleIn.value, role: roleIn.value.trim(), emails: [], docs: [], color: colors[reg().members.length % colors.length] });
        nameIn.value = roleIn.value = '';
      } }, icon('plus', 14), 'Ajouter à la ville')),
    ];
  }

  // ---------- Studio d'enregistrement ----------
  function artistMatches(a) {
    const out = [];
    const folder = a.folderId && findNode(state.tree, a.folderId);
    const key = norm(a.name).replace(/[^a-z0-9]/g, '');
    if (key.length >= 3) {
      walk(state.tree, (n) => {
        if (n.id === a.folderId) return;
        const nn = norm(n.name).replace(/[^a-z0-9]/g, '');
        if (nn.includes(key)) out.push(n);
      });
    }
    return { folder, matches: out };
  }
  function studio(panel, sub, d) {
    const tab = tabbed(['discs', 'rooms', 'todo'], 'discs');
    const artists = reg().artists;
    let body;
    if (tab === 'discs') {
      const nameIn = h('input', { type: 'text', placeholder: 'Nouvel artiste…' });
      body = [
        h('p', { class: 'muted' }, 'Un disque d’or par artiste : clique pour voir ses sons, maquettes et fichiers.'),
        h('div', { class: 'discs' }, ...artists.map((a) => {
          const { folder, matches } = artistMatches(a);
          const n = (folder?.children?.length || 0) + matches.length;
          return h('button', { class: 'disc', onclick: () => select(`artist:${a.id}`) }, h('span', { class: 'vinyl' }, h('i', {})), h('b', {}, a.name), h('small', {}, [a.role, n ? plural(n, 'fichier') : null].filter(Boolean).join(' · ') || '—'));
        })),
        h('div', { class: 'add-task' }, icon('plus', 16), nameIn, h('button', { class: 'btn soft', onclick: async () => {
          if (!nameIn.value.trim()) return;
          await upsert('artists', { name: nameIn.value.trim(), role: '', folderId: null });
          nameIn.value = '';
        } }, 'Ajouter')),
      ];
    } else if (tab === 'rooms') {
      body = themeGroups(sub.items, 'music').map((g) => h('section', { class: 'group' }, h('div', { class: 'group-head' }, icon('audio', 14), h('span', {}, `Salle ${g.name}`)), h('div', { class: 'files' }, ...g.items.map((n) => fileRow(n, false)))));
    } else {
      const all = sub.items.flatMap((n) => tasksUnder(n));
      body = [addTaskForm(sub.items.map((n) => ({ id: n.id, label: n.name.slice(0, 28) }))), all.length ? null : emptyState('Aucune tâche.'), ...all.map((t) => taskRow(t, { showPlace: true }))];
    }
    panelLayout(panel, {
      kicker: [crumb(d.name, d.id), crumb(`${LANDMARK_ICON.studio} Studio`)],
      title: 'Studio d’enregistrement',
      color: '#ff3355',
      actions: [btn('sparkles', 'Point sur les sorties', () => askClaude('Fais le point sur les projets musicaux et les artistes : maquettes, mix, sorties à préparer. Crée les tâches.', d.id), 'claude')],
      tabs: [{ key: 'discs', label: 'Disques d’or', count: artists.length }, { key: 'rooms', label: 'Salles', count: sub.items.length }, { key: 'todo', label: 'À faire' }],
      body,
    });
  }

  function artist(panel, id) {
    const a = reg().artists.find((x) => x.id === id);
    if (!a) return panel.classList.add('hidden');
    const { folder, matches } = artistMatches(a);
    const role = h('input', { type: 'text', value: a.role || '', placeholder: 'Rôle (chanteur, beatmaker…)' });
    const level = h('select', {}, h('option', { value: '' }, 'À classer'), ...LEVELS.map((l) => h('option', { value: l, selected: a.level === l }, l)));
    const note = h('textarea', { rows: 2, placeholder: 'Notes' }, a.note || '');
    const folderSel = h('select', {}, h('option', { value: '' }, '— Dossier Drive de l’artiste —'));
    walk(state.tree, (n, depth) => depth >= 2 && depth <= 3 && n.kind === 'folder' && folderSel.append(h('option', { value: n.id, selected: n.id === a.folderId }, n.name)));
    const studioSub = [...state.layout.values()].flatMap((L) => L.subs).find((s) => s.landmark === 'studio');
    panelLayout(panel, {
      kicker: [crumb(`${LANDMARK_ICON.label} Label`, 'lm:label'), crumb(a.level || 'à classer')],
      title: a.name,
      color: '#ffcf4a',
      actions: [folder ? btn('open', 'Ouvrir sa fiche', () => openFile(folder), 'primary') : null, btn('sparkles', 'Claude', () => askClaude(`Fais le point sur l’artiste ${a.name} : ses sons, maquettes, projets en cours et prochaines étapes.`, a.folderId || undefined), 'claude')].filter(Boolean),
      body: [
        h('div', { class: 'disc-hero' }, h('span', { class: 'vinyl big' }, h('i', {})), h('div', {}, h('b', {}, a.name), h('small', {}, a.role || 'artiste'))),
        h('h4', { class: 'sec' }, 'Sa fiche'),
        folder?.children?.length ? h('div', { class: 'files' }, ...folder.children.map((n) => fileRow(n, false))) : emptyState(folder ? 'Sa fiche est vide dans le Drive.' : 'Pas encore de dossier relié.'),
        h('h4', { class: 'sec' }, 'Sons, maquettes et projets trouvés'),
        matches.length ? h('div', { class: 'files' }, ...matches.slice(0, 30).map((n) => fileRow(n, false))) : emptyState('Aucun fichier à son nom pour l’instant.'),
        h('h4', { class: 'sec' }, 'Infos'),
        h('div', { class: 'two' }, field('Rôle', role), field('Au label', level)),
        field('Dossier', folderSel),
        field('Notes', note),
        h('div', { class: 'two' },
          h('button', { class: 'btn primary', onclick: () => upsert('artists', { id: a.id, role: role.value, level: level.value, note: note.value, folderId: folderSel.value || null }).then(() => toast('Artiste mis à jour', 'ok')) }, 'Enregistrer'),
          h('button', { class: 'btn soft', onclick: async () => {
            await remove('artists', a.id);
            if (studioSub) select(studioSub.id);
          } }, 'Retirer')),
      ],
    });
  }

  // ---------- Magasin de musique (matériel) ----------
  function shop(panel) {
    const tab = tabbed(['owned', 'wanted'], 'owned');
    const gear = reg().gear;
    const list = gear.filter((g) => g.status === tab);
    const cats = [...new Set(list.map((g) => g.category || 'Divers'))];
    const total = gear.filter((g) => g.status === 'wanted').reduce((s, g) => s + (Number(g.price) || 0) * (Number(g.qty) || 1), 0);
    const f = { name: h('input', { type: 'text', placeholder: 'Nom du matériel' }), cat: h('input', { type: 'text', placeholder: 'Catégorie', value: tab === 'owned' ? 'Son' : '' }), qty: h('input', { type: 'text', placeholder: 'Qté', value: '1' }), price: h('input', { type: 'text', placeholder: 'Prix €' }) };
    const row = (g) =>
      h('div', { class: `gear ${g.dispo && g.dispo !== 'Dispo' ? 'warn' : ''}` },
        h('div', { class: 'grow' }, h('b', {}, g.name, g.qty > 1 ? h('span', { class: 'qty' }, `×${g.qty}`) : null), h('small', {}, [g.dispo, g.note, g.from, g.price ? `${g.price} €` : null].filter(Boolean).join(' · '))),
        g.status === 'wanted'
          ? h('button', { class: 'icon-btn tiny', title: 'Acheté → passer en inventaire', onclick: () => upsert('gear', { id: g.id, status: 'owned', dispo: 'Dispo' }) }, icon('check', 14))
          : h('button', { class: 'icon-btn tiny', title: 'À racheter / remplacer', onclick: () => upsert('gear', { id: g.id, status: 'wanted' }) }, icon('refresh', 13)),
        h('button', { class: 'icon-btn tiny', title: 'Supprimer', onclick: () => remove('gear', g.id) }, icon('trash', 13)));
    panelLayout(panel, {
      kicker: [crumb(`${LANDMARK_ICON.shop} Magasin de musique`)],
      title: 'Matériel',
      color: '#e36b1a',
      actions: [btn('sparkles', 'Conseils d’achat', () => askClaude('Regarde notre matériel (list_registry gear) et notre liste d’achats : quelles priorités pour le studio, l’événementiel et la radio ? Propose des modèles et prix, puis mets à jour les prix dans la liste.'), 'claude')],
      tabs: [{ key: 'owned', label: 'On a', count: gear.filter((g) => g.status === 'owned').length }, { key: 'wanted', label: 'À acheter', count: gear.filter((g) => g.status === 'wanted').length }],
      body: [
        h('div', { class: 'quicks' }, quickOpen(/full matos/, 'Excel Full Matos check'), quickOpen(/^suivie du materiel$/, 'Suivi du matériel')),
        tab === 'wanted' && total ? h('p', { class: 'muted' }, `Budget estimé : ${total.toLocaleString('fr-FR')} €`) : null,
        h('div', { class: 'add-gear' }, f.name, h('div', { class: 'three' }, f.cat, f.qty, f.price), h('button', { class: 'btn soft full', onclick: async () => {
          if (!f.name.value.trim()) return;
          await upsert('gear', { name: f.name.value.trim(), category: f.cat.value.trim() || 'Divers', qty: Number(f.qty.value) || 1, price: f.price.value ? Number(f.price.value) : null, status: tab, dispo: tab === 'owned' ? 'Dispo' : null });
          f.name.value = '';
        } }, icon('plus', 14), tab === 'owned' ? 'Ajouter à l’inventaire' : 'Ajouter à la liste d’achats')),
        ...cats.map((c) => h('section', { class: 'group' }, h('div', { class: 'group-head' }, h('span', {}, c), h('small', {}, list.filter((g) => (g.category || 'Divers') === c).length)), ...list.filter((g) => (g.category || 'Divers') === c).map(row))),
      ],
    });
  }

  // ---------- Salle de concert ----------
  function events() {
    return projectSubs()
      .filter((s) => s.kind === 'project')
      .map((s) => {
        const info = eventInfo(reg(), s.id);
        return { s, info, past: isPastEvent(info, s.state) };
      });
  }
  function poster(e, color) {
    return h('button', { class: `poster ${e.past ? 'past' : ''} ${e.s.state === 'abandoned' ? 'cancel' : ''}`, vars: { '--c': color }, onclick: () => select(e.s.id) },
      h('b', {}, e.s.name),
      h('small', {}, e.info?.date ? fmtDate(e.info.date) : e.s.year || (e.past ? 'terminé' : 'date à fixer')),
      e.info?.lieu ? h('em', {}, e.info.lieu) : null,
      e.info?.team?.length ? h('span', { class: 'team' }, ...e.info.team.map(memberById).filter(Boolean).map((m) => h('i', { vars: { '--c': m.color }, title: m.name }, m.name[0]))) : null);
  }
  function hall(panel, opts = {}) {
    const L = eventDistrict();
    const color = '#ffb020';
    const ev = events();
    const upcoming = ev.filter((e) => !e.past).sort((a, b) => (a.info?.date || '9').localeCompare(b.info?.date || '9'));
    const past = ev.filter((e) => e.past).sort((a, b) => (b.info?.date || '').localeCompare(a.info?.date || ''));
    panelLayout(panel, {
      kicker: [L ? crumb(L.district.name, L.district.id) : null, crumb(`${LANDMARK_ICON.hall} Salle de concert`)].filter(Boolean),
      title: 'À l’affiche',
      color,
      tabs: opts.tabs,
      actions: [btn('sparkles', 'Préparer le prochain', () => askClaude('Quel est le prochain événement ? Fais la check-list complète (lieu, équipe, budget, technique, com, SACEM) et crée les tâches et rappels.', L?.district.id), 'claude')],
      body: [
        h('p', { class: 'muted' }, 'Clique sur une affiche pour voir les infos, les documents et l’équipe. Les membres de l’équipe viennent dans la salle.'),
        h('div', { class: 'billboard' },
          h('section', {}, h('h4', { class: 'sec' }, `À venir · ${upcoming.length}`), h('div', { class: 'posters' }, ...upcoming.map((e) => poster(e, color))), upcoming.length ? null : emptyState('Aucun événement à venir.')),
          h('section', {}, h('h4', { class: 'sec' }, `Terminés · ${past.length}`), h('div', { class: 'posters stack' }, ...past.map((e) => poster(e, color))), past.length ? null : emptyState('Rien encore.'))),
      ],
    });
  }

  // Bloc "Événement" dans la fiche d'un projet EVENT (date, lieu, équipe).
  function eventEditor(project) {
    const info = eventInfo(reg(), project.id) || { projectId: project.id, team: [] };
    const date = h('input', { type: 'date', value: info.date || '' });
    const lieu = h('input', { type: 'text', value: info.lieu || '', placeholder: 'Lieu' });
    const desc = h('textarea', { rows: 2, placeholder: 'Description, horaires…' }, info.desc || '');
    const team = new Set(info.team || []);
    const save = () => upsert('events', { projectId: project.id, title: project.name, date: date.value || null, lieu: lieu.value, desc: desc.value, team: [...team] }).then(() => toast('Événement enregistré', 'ok'));
    return [
      h('h4', { class: 'sec' }, 'Quartier du projet'),
      ctx.inside2 ? ctx.inside2.projectZoneSwitch(project) : null,
      h('div', { class: 'two' }, field('Date', date), field('Lieu', lieu)),
      field('Description', desc),
      h('h4', { class: 'sec' }, 'Équipe sur l’événement'),
      h('div', { class: 'chips' }, ...reg().members.map((m) => {
        const b = h('button', { class: `chip member ${team.has(m.id) ? 'on' : ''}`, vars: { '--c': m.color } }, h('i', {}), m.name);
        b.addEventListener('click', () => {
          team.has(m.id) ? team.delete(m.id) : team.add(m.id);
          b.classList.toggle('on');
        });
        return b;
      })),
      h('button', { class: 'btn primary full', onclick: save }, 'Enregistrer l’événement'),
    ];
  }

  // ---------- École (membres) ----------
  function ownedNodes(m) {
    const out = [];
    const emails = (m.emails || []).map((e) => e.toLowerCase());
    if (!emails.length) return out;
    walk(state.tree, (n, depth) => depth > 0 && n.owner && emails.includes(n.owner.toLowerCase()) && out.push(n));
    return out.sort((a, b) => (b.modified || '').localeCompare(a.modified || ''));
  }
  // ---------- École : formations, subventions, documents d'information ----------
  const FREQ = { quotidienne: 'Chaque jour', hebdomadaire: 'Chaque semaine', mensuelle: 'Chaque mois' };
  const driveMatches = (re, { files = false } = {}) => {
    const out = [];
    walk(state.tree, (n, depth) => depth > 0 && (!files || n.kind !== 'folder') && re.test(norm(n.name)) && out.push(n));
    return out;
  };
  const trainingRow = (t) =>
    h('div', { class: 'training' },
      h('span', { class: 'kind', vars: { '--k': t.kind === 'subvention' ? '#2fd17a' : t.kind === 'info' ? '#4f8bff' : '#ffb020' } }, icon(t.kind === 'subvention' ? 'flag' : t.kind === 'info' ? 'file' : 'sparkles', 14)),
      h('div', { class: 'grow' },
        h('b', {}, t.title),
        h('small', {}, [FREQ[t.freq] || t.freq, t.day ? `${t.day}` : null, t.time, t.date ? fmtDate(String(t.date).slice(0, 10)) : null, t.trainer ? `avec ${t.trainer}` : null, t.source === 'api' ? 'API' : null].filter(Boolean).join(' · ')),
        t.desc ? h('p', {}, t.desc) : null),
      t.url ? h('button', { class: 'icon-btn tiny', title: 'Ouvrir', onclick: () => (/google\.com/.test(t.url) ? api.openFile(t.url, t.title) : api.openUrl(t.url)) }, icon('open', 13)) : null,
      t.source !== 'api' ? h('button', { class: 'icon-btn tiny', title: 'Retirer', onclick: () => remove('trainings', t.id) }, icon('trash', 13)) : null);
  function school(panel) {
    const tab = tabbed(['defis', 'formations', 'infos'], 'defis');
    const api_ = state.formations?.items || [];
    const manual = reg().trainings || [];
    const of = (kind) => [...api_.filter((t) => t.kind === kind), ...manual.filter((t) => (t.kind || 'formation') === kind)];
    let body;
    if (tab === 'formations') {
      const list = of('formation');
      const groups = [['quotidienne', 'Chaque jour'], ['hebdomadaire', 'Chaque semaine'], ['autre', 'Ponctuelles / autres']];
      const f = {
        title: h('input', { type: 'text', placeholder: 'Intitulé (ex. Mixage Ableton)' }),
        freq: h('select', {}, h('option', { value: 'quotidienne' }, 'Quotidienne'), h('option', { value: 'hebdomadaire', selected: true }, 'Hebdomadaire'), h('option', { value: '' }, 'Ponctuelle')),
        day: h('select', {}, h('option', { value: '' }, 'Jour'), ...DAYS.map((d) => h('option', { value: d }, d))),
        time: h('input', { type: 'time', value: '18:00' }),
        url: h('input', { type: 'url', placeholder: 'Lien (visio, support…)' }),
      };
      const url = state.status.settings.formationsUrl;
      body = [
        url
          ? h('div', { class: 'api-line' }, icon('zap', 14), h('span', { class: 'grow' }, state.formations?.error ? `API injoignable : ${state.formations.error}` : state.formations?.at ? `${plural(api_.length, 'élément')} reçu(s) de ton API · ${new Date(state.formations.at).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : 'Pas encore synchronisé'), h('button', { class: 'btn soft', onclick: () => ctx.loadFormations(true) }, icon('refresh', 13), 'Actualiser'))
          : h('div', { class: 'notice' }, 'Branche ton API de formations pour voir les formations quotidiennes et hebdomadaires ici. ', h('button', { class: 'link', onclick: () => ctx.openDrawer('settings') }, 'Réglages → Formations')),
        ...groups.map(([k, label]) => {
          const l = list.filter((t) => (k === 'autre' ? !['quotidienne', 'hebdomadaire'].includes(t.freq) : t.freq === k));
          return l.length ? h('section', { class: 'group' }, h('div', { class: 'group-head' }, h('span', {}, label), h('small', {}, l.length)), ...l.map(trainingRow)) : null;
        }),
        list.length ? null : emptyState('Aucune formation pour l’instant.'),
        h('h4', { class: 'sec' }, 'Ajouter une formation'),
        h('div', { class: 'add-gear' }, f.title, h('div', { class: 'three' }, f.freq, f.day, f.time), f.url, h('button', { class: 'btn soft full', onclick: async () => {
          if (!f.title.value.trim()) return;
          await upsert('trainings', { kind: 'formation', title: f.title.value.trim(), freq: f.freq.value || null, day: f.day.value || null, time: f.time.value, url: f.url.value.trim() || null, source: 'manuel' });
          f.title.value = '';
        } }, icon('plus', 14), 'Ajouter')),
      ];
    } else if (tab === 'defis') {
      body = ctx.inside2.quizBody();
    } else if (tab === 'grants-old') {
      const known = new Set(manual.map((t) => t.url));
      const drive = driveMatches(/subvention|fsdie|iddac|prix jeune asso|financement|mecenat/).filter((n) => !known.has(n.url));
      const title = h('input', { type: 'text', placeholder: 'Formation ou dossier de subvention' });
      const link = h('input', { type: 'url', placeholder: 'Lien' });
      body = [
        h('p', { class: 'muted' }, 'Tout pour apprendre à monter un dossier de subvention : modèles, calendrier, dossiers déjà déposés.'),
        h('div', { class: 'files' }, ...of('subvention').map(trainingRow)),
        drive.length ? h('h4', { class: 'sec' }, 'Aussi dans le Drive') : null,
        drive.length ? h('div', { class: 'files' }, ...drive.map((n) => fileRow(n, false))) : null,
        h('h4', { class: 'sec' }, 'Ajouter'),
        h('div', { class: 'add-gear' }, title, link, h('button', { class: 'btn soft full', onclick: async () => {
          if (!title.value.trim()) return;
          await upsert('trainings', { kind: 'subvention', title: title.value.trim(), url: link.value.trim() || null, source: 'manuel' });
          title.value = link.value = '';
        } }, icon('plus', 14), 'Ajouter')),
      ];
    } else {
      const docs = driveMatches(/presentation|plan de developpement|strategie|notice|guide|charte|statut|fiche|tuto|mode d.emploi|process/, { files: true });
      const title = h('input', { type: 'text', placeholder: 'Document d’information (ex. Guide orga d’un événement)' });
      const link = h('input', { type: 'url', placeholder: 'Lien' });
      body = [
        h('p', { class: 'muted' }, 'Les documents à lire avant de lancer un projet : présentations, stratégie, plan de développement, guides.'),
        of('info').length ? h('div', { class: 'files' }, ...of('info').map(trainingRow)) : null,
        h('div', { class: 'files' }, ...docs.map((n) => fileRow(n, false))),
        h('h4', { class: 'sec' }, 'Ajouter un document'),
        h('div', { class: 'add-gear' }, title, link, h('button', { class: 'btn soft full', onclick: async () => {
          if (!title.value.trim()) return;
          await upsert('trainings', { kind: 'info', title: title.value.trim(), url: link.value.trim() || null, source: 'manuel' });
          title.value = link.value = '';
        } }, icon('plus', 14), 'Ajouter')),
      ];
    }
    panelLayout(panel, {
      kicker: [zoneCrumb('info'), crumb(`${LANDMARK_ICON.school} École`)].filter(Boolean),
      title: 'École — formations',
      color: '#ffb020',
      actions: [btn('sparkles', 'Trouver des formations', () => askClaude('Cherche sur le web les formations gratuites (gestion d’asso, son, événementiel, communication) accessibles à une association musicale à Paris / Villejuif en ce moment. Ajoute les plus utiles à l’école (save_registry_item trainings, kind « formation ») avec leur lien.'), 'claude')],
      tabs: [{ key: 'defis', label: 'Défis du jour', count: state.quiz ? state.quiz.questions.filter((q) => !q.result).length || undefined : undefined }, { key: 'formations', label: 'Formations', count: of('formation').length }, { key: 'infos', label: 'Infos projets' }],
      body,
    });
  }

  function member(panel, id) {
    const m = memberById(id);
    if (!m) return panel.classList.add('hidden');
    const tab = tabbed(['files', 'docs', 'tasks', 'info'], 'files');
    const owned = ownedNodes(m);
    let fiche = null;
    walk(state.tree, (n) => {
      if (!fiche && n.kind === 'folder' && norm(n.name) === norm(m.name)) fiche = n;
    });
    const evs = (reg().events || []).filter((e) => (e.team || []).includes(m.id));
    const tasks = [];
    for (const [nodeId, l] of Object.entries(state.tasks)) for (const t of l) if (t.assignee === m.id) tasks.push({ ...t, nodeId });
    let body;
    if (tab === 'files') {
      body = [
        fiche ? h('div', { class: 'quicks' }, h('button', { class: 'quick', onclick: () => openFile(fiche) }, icon('folder', 15), `Sa fiche : ${fiche.name}`)) : null,
        evs.length ? h('h4', { class: 'sec' }, 'Ses événements') : null,
        ...evs.map((e) => navRow(findNode(state.tree, e.projectId) || { id: e.projectId, name: e.title, kind: 'folder' }, eventDistrict()?.district || state.tree, e.date ? fmtDate(e.date) : '')),
        h('h4', { class: 'sec' }, `Ses dossiers et fichiers (${owned.length})`),
        owned.length ? h('div', { class: 'files' }, ...owned.slice(0, 40).map((n) => fileRow(n, false))) : emptyState(m.emails?.length ? 'Aucun fichier à son nom dans le Drive.' : 'Ajoute son e-mail Google dans « Infos » pour retrouver ses dossiers.'),
      ];
    } else if (tab === 'docs') {
      const docs = m.docs || [];
      const pick = h('select', {}, h('option', { value: '' }, '— Choisir un fichier du Drive —'));
      walk(state.tree, (n, depth) => depth > 0 && pick.append(h('option', { value: n.id }, `${'· '.repeat(Math.max(0, depth - 1))}${n.name}`)));
      const dName = h('input', { type: 'text', placeholder: 'ou nom du document' });
      const dUrl = h('input', { type: 'url', placeholder: 'lien (contrat, CV, attestation…)' });
      body = [
        h('p', { class: 'muted' }, 'Documents rattachés à ce membre depuis la mairie (contrat, adhésion, attestation, fiche…).'),
        docs.length
          ? h('div', { class: 'files' }, ...docs.map((dc) => {
              const n = dc.nodeId && findNode(state.tree, dc.nodeId);
              return h('div', { class: 'file' }, h('div', { class: 'file-main', onclick: () => (n ? openFile(n) : dc.url && (/google\.com/.test(dc.url) ? api.openFile(dc.url, dc.name) : api.openUrl(dc.url))) },
                h('span', { class: 'kind', vars: { '--k': '#5d8bff' } }, n ? kindIcon(n.kind, 15) : icon('file', 15)),
                h('div', { class: 'file-name' }, dc.name, h('small', {}, n ? 'Drive' : dc.url || '')),
                h('button', { class: 'icon-btn tiny', title: 'Retirer', onclick: (e) => {
                  e.stopPropagation();
                  upsert('members', { id: m.id, docs: docs.filter((x) => x !== dc) });
                } }, icon('trash', 13))));
            }))
          : emptyState('Aucun document pour l’instant.'),
        h('h4', { class: 'sec' }, 'Ajouter un document'),
        h('div', { class: 'add-gear' }, pick, h('div', { class: 'two' }, dName, dUrl), h('button', { class: 'btn soft full', onclick: async () => {
          const n = pick.value && findNode(state.tree, pick.value);
          if (!n && !dName.value.trim() && !dUrl.value.trim()) return;
          const doc = n ? { name: n.name, nodeId: n.id } : { name: dName.value.trim() || dUrl.value.trim(), url: dUrl.value.trim() || null };
          await upsert('members', { id: m.id, docs: [...docs, doc] });
          toast('Document ajouté', 'ok');
        } }, icon('plus', 14), 'Ajouter')),
      ];
    } else if (tab === 'tasks') {
      const input = h('input', { type: 'text', placeholder: `Confier une tâche à ${m.name}…` });
      body = [
        h('div', { class: 'add-task' }, icon('plus', 16), input, h('button', { class: 'btn soft', onclick: async () => {
          if (!input.value.trim()) return;
          await api.tasks.add(state.tree.id, { title: input.value.trim(), priority: 2, assignee: m.id });
          input.value = '';
        } }, 'Ajouter')),
        tasks.length ? null : emptyState('Aucune tâche confiée.'),
        ...tasks.sort((a, b) => a.done - b.done).map((t) => taskRow(t, { showPlace: t.nodeId !== state.tree.id })),
      ];
    } else {
      const name = h('input', { type: 'text', value: m.name });
      const role = h('input', { type: 'text', value: m.role || '', list: 'role-suggest' });
      const title = h('select', {}, ...TITLES.map((t) => h('option', { value: t, selected: t === (m.title || 'Habitant') }, t)));
      const emails = h('input', { type: 'text', value: (m.emails || []).join(', '), placeholder: 'e-mails Google, séparés par des virgules' });
      const color = h('input', { type: 'color', value: m.color || '#ffb020' });
      body = [
        roleList(),
        field('Prénom', name), h('div', { class: 'two' }, field('Titre dans la ville', title), field('Rôle dans l’asso', role)), field('E-mails Google (pour retrouver ses fichiers)', emails), field('Couleur', color),
        h('div', { class: 'two' },
          h('button', { class: 'btn primary', onclick: () => upsert('members', { id: m.id, name: name.value.trim() || m.name, title: title.value, role: role.value.trim(), emails: emails.value.split(',').map((x) => x.trim()).filter(Boolean), color: color.value }).then(() => toast('Membre mis à jour', 'ok')) }, 'Enregistrer'),
          h('button', { class: 'btn soft', onclick: async () => {
            await remove('members', m.id);
            const ms = mairieSub();
            select(ms ? ms.id : null);
          } }, 'Retirer de la ville')),
      ];
    }
    panelLayout(panel, {
      kicker: [mairieSub() ? crumb(`${LANDMARK_ICON.mairie} Mairie`, mairieSub().id) : null, crumb(m.title || 'habitant')].filter(Boolean),
      title: m.name,
      color: m.color || '#ffb020',
      actions: [btn('sparkles', 'Claude', () => askClaude(`Quelles sont les missions et tâches de ${m.name} (${m.title || 'habitant'}, ${m.role || 'membre'}) ? Fais le point et propose la suite.`), 'claude')],
      tabs: [{ key: 'files', label: 'Dossiers', count: owned.length }, { key: 'docs', label: 'Documents', count: (m.docs || []).length }, { key: 'tasks', label: 'Tâches', count: tasks.filter((t) => !t.done).length }, { key: 'info', label: 'Infos' }],
      body: [h('div', { class: 'member-hero', vars: { '--c': m.color || '#ffb020' } }, h('span', { class: 'avatar big' }, m.name[0]), h('div', {}, h('b', {}, `${m.title || 'Habitant'} · ${m.role || 'rôle à définir'}`), h('small', {}, `${zoneLabel(m)} · ${(m.emails || []).join(' · ') || 'pas d’e-mail'}`))), ...body],
    });
  }

  // ---------- Clocher (rappels & deadlines) ----------
  function bell(panel, opts = {}) {
    const list = deadlines(reg(), state.tasks, state.tree);
    const t0 = today();
    const week = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    const groups = [
      ['En retard', list.filter((d) => d.date && d.date < t0), 'late'],
      ['Aujourd’hui', list.filter((d) => d.date === t0), 'today'],
      ['Cette semaine', list.filter((d) => d.date && d.date > t0 && d.date <= week), ''],
      ['Plus tard', list.filter((d) => d.date && d.date > week), ''],
    ];
    const title = h('input', { type: 'text', placeholder: 'Rappel (ex. Envoyer dossier SACEM)' });
    const date = h('input', { type: 'date', value: t0 });
    const time = h('input', { type: 'time', value: '09:00' });
    const item = (d) =>
      h('div', { class: `deadline ${d.kind}` },
        d.kind === 'reminder' ? h('label', { class: 'cb' }, h('input', { type: 'checkbox', onchange: () => upsert('reminders', { id: d.id, done: true }) }), h('span', {})) : h('span', { class: 'dl-ico' }, icon(d.kind === 'event' ? 'flag' : 'tasks', 14)),
        h('div', { class: 'grow' }, h('b', {}, d.title), h('small', {}, `${fmtDate(d.date)}${d.time ? ` · ${d.time}` : ''}${d.nodeId && findNode(state.tree, d.nodeId) ? ` · ${findNode(state.tree, d.nodeId).name}` : ''}`)),
        d.nodeId ? h('button', { class: 'icon-btn tiny', title: 'Voir', onclick: () => select(d.nodeId) }, icon('chevron', 13)) : null,
        d.kind === 'reminder' ? h('button', { class: 'icon-btn tiny', title: 'Supprimer', onclick: () => remove('reminders', d.id) }, icon('trash', 13)) : null);
    panelLayout(panel, {
      kicker: [zoneCrumb('info'), crumb(`${LANDMARK_ICON.bell} Clocher`)].filter(Boolean),
      title: 'Rappels & deadlines',
      color: '#ffd76b',
      tabs: opts.tabs,
      actions: [btn('sparkles', 'Trouver les deadlines', () => askClaude('Parcours le Drive (subventions, SACEM, événements, budgets…) et repère les échéances importantes. Ajoute-les comme rappels dans le clocher (save_registry_item reminders).'), 'claude')],
      body: [
        h('div', { class: 'add-gear' }, title, h('div', { class: 'two' }, date, time), h('button', { class: 'btn soft full', onclick: async () => {
          if (!title.value.trim()) return;
          await upsert('reminders', { title: title.value.trim(), date: date.value, time: time.value, nodeId: state.selectedId && findNode(state.tree, state.selectedId) ? state.selectedId : null, done: false });
          title.value = '';
        } }, icon('plus', 14), 'Ajouter un rappel')),
        h('p', { class: 'muted small' }, 'Le clocher sonne (et Windows t’envoie une notification) quand un rappel arrive à échéance.'),
        ...groups.filter(([, l]) => l.length).map(([name, l, cls]) => h('section', { class: `group ${cls}` }, h('div', { class: 'group-head' }, h('span', {}, name), h('small', {}, l.length)), ...l.map(item))),
        list.length ? null : emptyState('Aucune échéance. Ajoute un rappel ou une date limite à une tâche.'),
      ],
    });
  }

  // ---------- Tableau : emploi du temps ----------
  function board(panel) {
    const entries = reg().schedule;
    const f = {
      day: h('select', {}, ...DAYS.map((d, i) => h('option', { value: i, selected: i === (new Date().getDay() + 6) % 7 }, d))),
      start: h('input', { type: 'time', value: '18:00' }),
      end: h('input', { type: 'time', value: '20:00' }),
      title: h('input', { type: 'text', placeholder: 'Quoi ? (session studio, réunion…)' }),
      who: h('select', {}, h('option', { value: '' }, 'Tout le monde'), ...reg().members.map((m) => h('option', { value: m.id }, m.name))),
    };
    panelLayout(panel, {
      kicker: [zoneCrumb('info'), crumb(`${LANDMARK_ICON.board} Tableau`)].filter(Boolean),
      title: 'Emploi du temps',
      color: '#2fd17a',
      body: [
        h('div', { class: 'week' }, ...DAYS.map((d, i) => {
          const list = entries.filter((e) => Number(e.day) === i).sort((a, b) => (a.start || '').localeCompare(b.start || ''));
          return h('div', { class: `day ${i === (new Date().getDay() + 6) % 7 ? 'today' : ''}` }, h('b', {}, d.slice(0, 3)), ...list.map((e) => {
            const m = memberById(e.who);
            return h('div', { class: 'slot', vars: { '--c': m?.color || '#2fd17a' } }, h('small', {}, `${e.start || ''}${e.end ? `–${e.end}` : ''}`), h('span', {}, e.title), m ? h('em', {}, m.name) : null, h('button', { class: 'x', title: 'Supprimer', onclick: () => remove('schedule', e.id) }, '×'));
          }));
        })),
        h('h4', { class: 'sec' }, 'Ajouter un créneau'),
        h('div', { class: 'add-gear' }, f.title, h('div', { class: 'three' }, f.day, f.start, f.end), f.who, h('button', { class: 'btn soft full', onclick: async () => {
          if (!f.title.value.trim()) return;
          await upsert('schedule', { day: Number(f.day.value), start: f.start.value, end: f.end.value, title: f.title.value.trim(), who: f.who.value || null });
          f.title.value = '';
        } }, icon('plus', 14), 'Ajouter')),
      ],
    });
  }

  // ---------- Tableau des concerts (devant la mairie) ----------
  const weekRange = () => {
    const now = new Date();
    const mon = new Date(now);
    mon.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    const sun = new Date(mon);
    sun.setDate(mon.getDate() + 6);
    const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return [iso(mon), iso(sun)];
  };
  // Concerts affichés : ceux de la semaine (passés compris), sinon les prochains.
  function weekGigs() {
    const [a, b] = weekRange();
    const all = [...(reg().gigs || [])].sort((x, y) => `${x.date}${x.time || ''}`.localeCompare(`${y.date}${y.time || ''}`));
    const week = all.filter((g) => g.date >= a && g.date <= b);
    return week.length ? week : all.filter((g) => g.date >= a);
  }
  function gigs(panel) {
    const filter = state.gigFilter || 'all';
    const list = weekGigs().filter((g) => filter === 'all' || g.genre === filter);
    const [a, b] = weekRange();
    const days = [...new Set(list.map((g) => g.date))];
    const f = {
      artist: h('input', { type: 'text', placeholder: 'Qui passe ?' }),
      genre: h('select', {}, ...Object.entries(GENRE_LABELS).map(([k, l]) => h('option', { value: k }, l))),
      date: h('input', { type: 'date', value: new Date().toISOString().slice(0, 10) }),
      venue: h('input', { type: 'text', placeholder: 'Salle' }),
      price: h('input', { type: 'text', placeholder: 'Prix' }),
    };
    const card = (g) =>
      h('div', { class: 'gig', vars: { '--c': GENRE_COLORS[g.genre] || '#9aa0b4' } },
        h('span', { class: 'genre' }, GENRE_LABELS[g.genre] || g.genre),
        h('div', { class: 'grow' }, h('b', {}, g.artist), h('small', {}, [g.venue, g.time].filter(Boolean).join(' · ')), g.note ? h('em', {}, g.note) : null),
        h('span', { class: `price ${g.price ? '' : 'unknown'}` }, g.price || 'prix ?'),
        g.url ? h('button', { class: 'icon-btn tiny', title: 'Billetterie / source', onclick: () => api.openUrl(g.url) }, icon('open', 13)) : null,
        h('button', { class: 'icon-btn tiny', title: 'Retirer', onclick: () => remove('gigs', g.id) }, icon('trash', 13)));
    panelLayout(panel, {
      kicker: [zoneCrumb('admin'), mairieSub() ? crumb(`${LANDMARK_ICON.mairie} devant la mairie`, mairieSub().id) : null].filter(Boolean),
      title: 'Concerts à Paris',
      color: '#ffd76b',
      actions: [btn('sparkles', 'Mettre à jour la semaine', () => askClaude(`Cherche sur le web les concerts rap, rock indé et pop à Paris du ${fmtDate(a)} au ${fmtDate(b)} (${a} → ${b}) : qui passe, la salle, la date, l’heure et le prix des places. Puis remplace le tableau devant la mairie avec set_gigs.`), 'claude')],
      body: [
        h('p', { class: 'muted' }, `Semaine du ${fmtDate(a)} au ${fmtDate(b)} · rap, rock indé et pop. Prix « dès » relevés sur les billetteries : vérifie avant d’acheter.`),
        h('div', { class: 'seg' }, ...[['all', 'Tous'], ...Object.entries(GENRE_LABELS)].map(([k, l]) => h('button', { class: filter === k ? 'on' : '', onclick: () => {
          state.gigFilter = k;
          ctx.rerender();
        } }, l))),
        ...days.map((d) => h('section', { class: 'group' }, h('div', { class: 'group-head' }, h('span', {}, fmtDate(d)), h('small', {}, list.filter((g) => g.date === d).length)), ...list.filter((g) => g.date === d).map(card))),
        list.length ? null : emptyState('Aucun concert affiché. Demande à Claude de mettre à jour la semaine.'),
        h('h4', { class: 'sec' }, 'Afficher un concert'),
        h('div', { class: 'add-gear' }, f.artist, h('div', { class: 'three' }, f.genre, f.date, f.price), f.venue, h('button', { class: 'btn soft full', onclick: async () => {
          if (!f.artist.value.trim()) return;
          await upsert('gigs', { artist: f.artist.value.trim(), genre: f.genre.value, date: f.date.value, venue: f.venue.value.trim(), price: f.price.value.trim(), source: 'manuel' });
          f.artist.value = f.venue.value = f.price.value = '';
        } }, icon('plus', 14), 'Afficher')),
      ],
    });
  }

  // ---------- Radio (Spotify) ----------
  function radio(panel) {
    const pls = reg().playlists || [];
    const name = h('input', { type: 'text', placeholder: 'Nom (ex. Rap FR du moment)' });
    const link = h('input', { type: 'url', placeholder: 'Lien Spotify (playlist, album, titre, artiste…)' });
    const L = eventDistrict();
    const row = (p) => {
      const sp = ctx.spotifyRef(p.url);
      const playing = ctx.radio.current === p.url;
      return h('div', { class: `playlist ${playing ? 'on' : ''}` },
        h('button', { class: 'play', title: playing ? 'En cours' : 'Écouter ici', onclick: () => ctx.radio.play(p) }, icon(playing ? 'audio' : 'play', 15)),
        h('div', { class: 'grow' }, h('b', {}, p.name), h('small', {}, sp ? sp.type : 'lien non reconnu')),
        sp ? h('button', { class: 'icon-btn tiny', title: 'Ouvrir dans l’appli Spotify', onclick: () => api.openUrl(`spotify:${sp.type}:${sp.id}`) }, icon('open', 13)) : null,
        h('button', { class: 'icon-btn tiny', title: 'Retirer', onclick: () => remove('playlists', p.id) }, icon('trash', 13)));
    };
    panelLayout(panel, {
      kicker: [L ? crumb(L.district.name, L.district.id) : null, crumb(`${LANDMARK_ICON.radio} Radio`)].filter(Boolean),
      title: 'Radio — Spotify',
      color: '#1db954',
      actions: [
        btn('play', 'Écouter', () => pls[0] && ctx.radio.play(pls.find((p) => p.url === ctx.radio.current) || pls[0]), 'primary'),
        btn('sparkles', 'Playlist pour l’asso', () => askClaude('Propose une playlist Spotify qui colle à l’univers de THE RED STUDIO (rap, indé, pop, artistes de l’asso) : cherche des playlists publiques existantes sur le web et ajoute les meilleures à la radio (save_registry_item playlists {name, url}).'), 'claude'),
      ],
      body: [
        ctx.inside2 ? ctx.inside2.spotifyBox() : null,
        h('p', { class: 'muted' }, 'Le lecteur reste en bas de l’écran pendant que tu te balades dans la ville. Sans compte relié, Spotify ne joue que des extraits de 30 s : relie ton compte ci-dessus, ou bouton ↗ pour écouter dans l’appli Spotify.'),
        h('div', { class: 'files' }, ...pls.map(row)),
        pls.length ? null : emptyState('Aucune playlist. Colle un lien Spotify ci-dessous.'),
        h('h4', { class: 'sec' }, 'Ajouter une playlist'),
        h('div', { class: 'add-gear' }, name, link, h('button', { class: 'btn soft full', onclick: async () => {
          const url = link.value.trim();
          if (!ctx.spotifyRef(url)) return toast('Colle un lien open.spotify.com (playlist, album, titre…)', 'error');
          await upsert('playlists', { name: name.value.trim() || 'Playlist', url });
          name.value = link.value = '';
        } }, icon('plus', 14), 'Ajouter')),
      ],
    });
  }

  // ---------- Label : artistes et niveau d'implication ----------
  function label(panel) {
    const artists = reg().artists;
    const groups = [...LEVELS, ''].map((l) => ({ l, list: artists.filter((a) => (a.level || '') === l) }));
    const name = h('input', { type: 'text', placeholder: 'Nom d’artiste' });
    const role = h('input', { type: 'text', placeholder: 'Rôle (rappeur, beatmaker…)' });
    const lvl = h('select', {}, ...LEVELS.map((l) => h('option', { value: l }, l)));
    const row = (a) => {
      const sel = h('select', { class: 'mini-select' }, h('option', { value: '' }, 'À classer'), ...LEVELS.map((l) => h('option', { value: l, selected: a.level === l }, l)));
      sel.addEventListener('change', () => upsert('artists', { id: a.id, level: sel.value }).then(() => toast(`${a.name} : ${sel.value || 'à classer'}`, 'ok')));
      return h('div', { class: 'gear' }, h('span', { class: 'vinyl' }, h('i', {})), h('button', { class: 'grow as-link', onclick: () => select(`artist:${a.id}`) }, h('b', {}, a.name), h('small', {}, a.role || '—')), sel);
    };
    panelLayout(panel, {
      kicker: [zoneCrumb('music'), crumb(`${LANDMARK_ICON.label} Label`)].filter(Boolean),
      title: 'Label — nos artistes',
      color: '#ffcf4a',
      actions: [btn('sparkles', 'Plan pour les signés', () => askClaude('Pour chaque artiste signé au label (list_registry artists, level « signé »), fais le point sur ses sons, projets et sorties dans le Drive et propose les prochaines étapes (tâches).'), 'claude')],
      body: [
        h('div', { class: 'chips' }, ...groups.filter((g) => g.list.length).map((g) => h('span', { class: 'chip' }, `${g.l || 'à classer'} · ${g.list.length}`))),
        ...groups.filter((g) => g.list.length).map((g) => h('section', { class: 'group' }, h('div', { class: 'group-head' }, h('span', {}, g.l ? g.l.charAt(0).toUpperCase() + g.l.slice(1) : 'À classer'), h('small', {}, g.list.length)), ...g.list.map(row))),
        h('h4', { class: 'sec' }, 'Ajouter un artiste'),
        h('div', { class: 'add-gear' }, h('div', { class: 'two' }, name, lvl), role, h('button', { class: 'btn soft full', onclick: async () => {
          if (!name.value.trim()) return;
          await upsert('artists', { name: name.value.trim(), role: role.value.trim(), level: lvl.value, folderId: null, note: '' });
          name.value = role.value = '';
        } }, icon('plus', 14), 'Ajouter au label')),
      ],
    });
  }

  // ---------- CGT : actions et documentaires ----------
  const STATUS = { action: ['prévue', 'en cours', 'faite'], docu: ['idée', 'écriture', 'tournage', 'montage', 'diffusé'] };
  function cgt(panel) {
    const tab = ['action', 'docu', 'doc'].includes(state.tab) ? state.tab : 'action';
    const all = reg().actions || [];
    const list = all.filter((a) => (a.type || 'action') === tab).sort((a, b) => (a.date || '9').localeCompare(b.date || '9'));
    const card = (a) => {
      const st = STATUS[a.type] ? h('select', { class: 'mini-select' }, ...STATUS[a.type].map((x) => h('option', { value: x, selected: a.status === x }, x))) : null;
      st?.addEventListener('change', () => upsert('actions', { id: a.id, status: st.value }));
      return h('div', { class: 'training' },
        h('span', { class: 'kind', vars: { '--k': '#e1242b' } }, icon(a.type === 'docu' ? 'video' : a.type === 'doc' ? 'file' : 'flag', 14)),
        h('div', { class: 'grow' }, h('b', {}, a.title), h('small', {}, [a.date ? fmtDate(a.date) : null, a.lieu].filter(Boolean).join(' · ')), a.desc ? h('p', {}, a.desc) : null),
        st,
        a.url ? h('button', { class: 'icon-btn tiny', title: 'Ouvrir', onclick: () => (/google\.com/.test(a.url) ? api.openFile(a.url, a.title) : api.openUrl(a.url)) }, icon('open', 13)) : null,
        h('button', { class: 'icon-btn tiny', title: 'Supprimer', onclick: () => remove('actions', a.id) }, icon('trash', 13)));
    };
    const f = { title: h('input', { type: 'text', placeholder: tab === 'action' ? 'Action (rassemblement, tractage, réunion…)' : tab === 'docu' ? 'Titre du documentaire' : 'Nom du document' }), date: h('input', { type: 'date' }), lieu: h('input', { type: 'text', placeholder: 'Lieu' }), desc: h('textarea', { rows: 2, placeholder: 'Description' }), url: h('input', { type: 'url', placeholder: 'Lien (Drive, vidéo…)' }) };
    const drive = tab === 'doc' ? driveMatches(/cgt|syndic|greve|tract|manif|documentaire/) : [];
    panelLayout(panel, {
      kicker: [zoneCrumb('admin'), crumb(`${LANDMARK_ICON.cgt} CGT`)].filter(Boolean),
      title: 'CGT — actions & documentaires',
      color: '#e1242b',
      actions: [btn('sparkles', 'Préparer une action', () => askClaude('Aide-moi à préparer la prochaine action CGT de l’asso (list_registry actions) : rétroplanning, tâches, matériel, communication et captation pour le documentaire. Ajoute les tâches et les rappels utiles.'), 'claude')],
      tabs: ctx.inside2 ? ctx.inside2.cgtTabs(all) : [{ key: 'action', label: 'Actions' }, { key: 'docu', label: 'Documentaires' }, { key: 'doc', label: 'Documents' }],
      body: [
        ...list.map(card),
        drive.length ? h('div', { class: 'files' }, ...drive.map((n) => fileRow(n, false))) : null,
        list.length || drive.length ? null : emptyState(tab === 'action' ? 'Aucune action enregistrée.' : tab === 'docu' ? 'Aucun documentaire.' : 'Aucun document.'),
        h('h4', { class: 'sec' }, tab === 'action' ? 'Nouvelle action' : tab === 'docu' ? 'Nouveau documentaire' : 'Ajouter un document'),
        h('div', { class: 'add-gear' }, f.title, tab === 'action' ? h('div', { class: 'two' }, f.date, f.lieu) : null, tab !== 'doc' ? f.desc : null, f.url, h('button', { class: 'btn soft full', onclick: async () => {
          if (!f.title.value.trim()) return;
          await upsert('actions', { type: tab, title: f.title.value.trim(), date: f.date.value || null, lieu: f.lieu.value.trim(), desc: f.desc.value.trim(), url: f.url.value.trim() || null, status: STATUS[tab]?.[0] || null });
        } }, icon('plus', 14), 'Ajouter')),
      ],
    });
  }

  // ---------- Caserne des pompiers : antivirus et codes de sécurité ----------
  function fire(panel) {
    const tab = tabbed(['checkup', 'antivirus', 'codes'], 'checkup');
    let body;
    if (tab === 'checkup') {
      // Check-up sécurité de l'appli et des données
      const ck = state.checkup;
      const LV = { ok: ['#2fd17a', 'OK'], warn: ['#ffb020', 'À surveiller'], bad: ['#ff3355', 'À corriger'] };
      const runCk = async () => {
        try {
          state.checkup = await api.security.checkup();
          ctx.rerender();
        } catch (e) {
          toast(e.message, 'error');
        }
      };
      if (!ck) runCk();
      body = [
        h('p', { class: 'muted' }, 'Les pompiers passent l’appli en revue : chiffrement, codes, comptes, tentatives refusées, antivirus, sauvegarde.'),
        ck ? h('div', { class: 'checkup' }, ...ck.items.map((x) => h('div', { class: `ck-row ${x.level}`, vars: { '--k': LV[x.level][0] } }, h('span', { class: 'ck-dot' }), h('div', { class: 'grow' }, h('b', {}, x.title), h('small', {}, x.detail)), h('em', {}, LV[x.level][1])))) : h('p', { class: 'muted' }, 'Inspection en cours…'),
        h('button', { class: 'btn soft full', onclick: runCk }, icon('refresh', 14), 'Refaire le check-up'),
      ];
    } else if (tab === 'antivirus') {
      const list = [...(reg().security || [])].sort((a, b) => (a.expires || '9').localeCompare(b.expires || '9'));
      const t0 = today();
      const soon = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
      const f = { name: h('input', { type: 'text', placeholder: 'Logiciel (Bitdefender, Windows Defender…)' }), poste: h('input', { type: 'text', placeholder: 'Poste / appareil' }), expires: h('input', { type: 'date', title: 'Fin de licence' }), note: h('input', { type: 'text', placeholder: 'Note (n° de licence, compte…)' }) };
      body = [
        h('p', { class: 'muted' }, 'Les antivirus de chaque poste et la date de fin de licence (elle remonte dans le clocher).'),
        ...list.map((x) => {
          const state_ = !x.expires ? '' : x.expires < t0 ? 'expirée' : x.expires <= soon ? 'à renouveler' : 'à jour';
          return h('div', { class: `gear ${state_ && state_ !== 'à jour' ? 'warn' : ''}` },
            h('span', { class: 'kind', vars: { '--k': state_ === 'expirée' ? '#ff3355' : state_ === 'à renouveler' ? '#ffb020' : '#2fd17a' } }, icon('check', 14)),
            h('div', { class: 'grow' }, h('b', {}, x.name), h('small', {}, [x.poste, x.expires ? `licence jusqu’au ${fmtDate(x.expires)}` : 'sans date de fin', state_, x.note].filter(Boolean).join(' · '))),
            h('button', { class: 'icon-btn tiny', title: 'Supprimer', onclick: () => remove('security', x.id) }, icon('trash', 13)));
        }),
        list.length ? null : emptyState('Aucun antivirus enregistré.'),
        h('h4', { class: 'sec' }, 'Ajouter un antivirus'),
        h('div', { class: 'add-gear' }, f.name, h('div', { class: 'two' }, f.poste, f.expires), f.note, h('button', { class: 'btn soft full', onclick: async () => {
          if (!f.name.value.trim()) return;
          await upsert('security', { name: f.name.value.trim(), poste: f.poste.value.trim(), expires: f.expires.value || null, note: f.note.value.trim() });
        } }, icon('plus', 14), 'Ajouter')),
      ];
    } else {
      if (!state.vault) {
        api.vault.get().then((v) => {
          state.vault = v;
          ctx.rerender();
        }, (e) => toast(e.message, 'error'));
      }
      const vault = state.vault || [];
      const shown = (state.vaultShown ||= new Set());
      const saveVault = async (list) => {
        try {
          state.vault = await api.vault.save(list);
          ctx.rerender();
        } catch (e) {
          toast(e.message, 'error');
        }
      };
      const f = { label: h('input', { type: 'text', placeholder: 'Quoi ? (Wi-Fi studio, alarme, compte Google…)' }), login: h('input', { type: 'text', placeholder: 'Identifiant' }), code: h('input', { type: 'password', placeholder: 'Code / mot de passe' }), note: h('input', { type: 'text', placeholder: 'Note' }) };
      body = [
        h('p', { class: 'muted' }, 'Coffre chiffré sur ce PC (comme les clés API). Claude n’y a pas accès.'),
        ...vault.map((v) =>
          h('div', { class: 'gear' },
            h('div', { class: 'grow' }, h('b', {}, v.label), h('small', {}, [v.login, v.note].filter(Boolean).join(' · ')), h('code', { class: 'secret' }, shown.has(v.id) ? v.code : '•'.repeat(Math.min(12, Math.max(6, v.code.length))))),
            h('button', { class: 'icon-btn tiny', title: shown.has(v.id) ? 'Masquer' : 'Afficher', onclick: () => {
              shown.has(v.id) ? shown.delete(v.id) : shown.add(v.id);
              ctx.rerender();
            } }, icon('target', 13)),
            h('button', { class: 'icon-btn tiny', title: 'Copier', onclick: () => navigator.clipboard.writeText(v.code).then(() => toast('Copié', 'ok')) }, icon('doc', 13)),
            h('button', { class: 'icon-btn tiny', title: 'Supprimer', onclick: () => saveVault(vault.filter((x) => x.id !== v.id)) }, icon('trash', 13)))),
        state.vault && !vault.length ? emptyState('Coffre vide.') : null,
        h('h4', { class: 'sec' }, 'Ajouter un code'),
        h('div', { class: 'add-gear' }, f.label, h('div', { class: 'two' }, f.login, f.code), f.note, h('button', { class: 'btn soft full', onclick: () => {
          if (!f.label.value.trim() || !f.code.value) return;
          saveVault([...vault, { id: Math.random().toString(36).slice(2, 10), label: f.label.value.trim(), login: f.login.value.trim(), code: f.code.value, note: f.note.value.trim() }]);
        } }, icon('plus', 14), 'Ranger dans le coffre')),
      ];
    }
    panelLayout(panel, {
      kicker: [zoneCrumb('admin'), crumb(`${LANDMARK_ICON.fire} Caserne`)].filter(Boolean),
      title: 'Pompiers — sécurité',
      color: '#c8102e',
      actions: [btn('sparkles', 'Bilan sécurité', () => askClaude('Fais un bilan de la sécurité informatique de l’asso à partir des antivirus enregistrés (list_registry security) : licences à renouveler, postes non protégés, et bonnes pratiques (sauvegardes, double authentification, gestionnaire de mots de passe). Crée les tâches et rappels utiles, sans jamais me demander de mot de passe.'), 'claude')],
      tabs: [{ key: 'checkup', label: 'Check-up', count: state.checkup ? state.checkup.items.filter((x) => x.level !== 'ok').length : 0 }, { key: 'antivirus', label: 'Antivirus', count: (reg().security || []).length }, { key: 'codes', label: 'Codes de sécurité', count: state.vault?.length }],
      body,
    });
  }

  // ---------- Résidences des pôles ----------
  function pole(panel, sub) {
    const p = POLES.find((x) => x.key === sub.pole);
    const people = polePeople(reg(), p.key);
    const type = homeType(people.length);
    const f = { name: h('input', { type: 'text', placeholder: 'Nom' }), phone: h('input', { type: 'tel', placeholder: 'Téléphone' }), email: h('input', { type: 'email', placeholder: 'E-mail' }), note: h('input', { type: 'text', placeholder: 'Note (matériel, dispo, tarif…)' }) };
    panelLayout(panel, {
      kicker: [zoneCrumb('res'), crumb(`${LANDMARK_ICON.pole} ${type.name}`)].filter(Boolean),
      title: `Pôle ${p.name}`,
      color: p.color,
      actions: [btn('sparkles', 'Recruter', () => askClaude(`Le pôle ${p.name} compte ${people.length} personne(s). Propose comment le renforcer (profils, où recruter à Paris / Villejuif, message type) et crée les tâches.`), 'claude')],
      body: [
        h('div', { class: 'home-scale' }, ...HOME_TYPES.filter((t) => t.key !== 'terrain').map((t, i, arr) => h('span', { class: t.key === type.key ? 'on' : '' }, h('b', {}, t.name), h('small', {}, i === arr.length - 1 ? `+${arr[i - 1].max}` : `${i ? arr[i - 1].max + 1 : 1}–${t.max}`)))),
        h('p', { class: 'muted' }, `${plural(people.length, 'personne')} → ${type.name.toLowerCase()}. Plus le pôle grandit, plus sa maison grandit.`),
        ...people.map((x) =>
          h('div', { class: 'gear' },
            h('span', { class: 'kind', vars: { '--k': p.color } }, icon(x.member ? 'home' : 'target', 14)),
            h('div', { class: 'grow' }, h('b', {}, x.name), h('small', {}, (x.member ? [`membre de l’asso · ${x.role || ''}`] : [x.phone, x.email, x.note]).filter(Boolean).join(' · '))),
            x.member ? h('button', { class: 'icon-btn tiny', title: 'Sa fiche', onclick: () => select(`member:${x.id}`) }, icon('chevron', 13)) : h('button', { class: 'icon-btn tiny', title: 'Retirer', onclick: () => remove('poles', x.id) }, icon('trash', 13)))),
        people.length ? null : emptyState('Personne dans ce pôle pour l’instant.'),
        h('h4', { class: 'sec' }, 'Ajouter une personne'),
        h('div', { class: 'add-gear' }, h('div', { class: 'two' }, f.name, f.phone), f.email, f.note, h('button', { class: 'btn soft full', onclick: async () => {
          if (!f.name.value.trim()) return;
          await upsert('poles', { pole: p.key, name: f.name.value.trim(), phone: f.phone.value.trim(), email: f.email.value.trim(), note: f.note.value.trim() });
          f.name.value = f.phone.value = f.email.value = f.note.value = '';
        } }, icon('plus', 14), 'Ajouter au pôle')),
        h('p', { class: 'muted small' }, 'Les membres de l’asso apparaissent ici automatiquement selon leur rôle (réglé à la mairie).'),
      ],
    });
  }

  // ---------- Bureau de journaliste ----------
  const ago = (iso) => {
    if (!iso) return '';
    const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
    if (m < 60) return `il y a ${Math.max(1, m)} min`;
    if (m < 1440) return `il y a ${Math.round(m / 60)} h`;
    return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  };
  function parseSource(name, url) {
    const u = url.trim();
    const id = `perso_${Math.random().toString(36).slice(2, 8)}`;
    const handle = u.match(/youtube\.com\/@([\w.-]+)/);
    const chan = u.match(/youtube\.com\/channel\/(UC[\w-]{22})/);
    if (chan) return { id, name, cat: 'vidéo', color: '#9aa0b4', youtube: { channelId: chan[1] }, enabled: true };
    if (handle) return { id, name, cat: 'vidéo', color: '#9aa0b4', youtube: { handle: handle[1], query: name }, enabled: true };
    if (/rss|feed|atom|\.xml|backend/i.test(u)) return { id, name, cat: 'presse', color: '#9aa0b4', feed: u, enabled: true };
    return { id, name, cat: 'presse', color: '#9aa0b4', site: u, enabled: true };
  }
  // Liste des sources suivies (presse ou skate) : activer, ajouter, retirer.
  function sourcesTab(group, intro) {
    const all = state.newsSources || [];
    const srcs = all.filter((x) => (x.group || 'press') === group);
    const st = state.news?.status || {};
    const name = h('input', { type: 'text', placeholder: group === 'skate' ? 'Skateur ou magazine' : 'Nom du média' });
    const url = h('input', { type: 'url', placeholder: 'Flux RSS, site, ou chaîne YouTube (youtube.com/@…)' });
    const kind = group === 'skate' ? h('select', {}, h('option', { value: 'skater' }, 'Skateur'), h('option', { value: 'mag' }, 'Magazine')) : null;
    const save = async (list) => {
      state.newsSources = await api.news.saveSources(list);
      ctx.loadNews(true);
      ctx.rerender();
    };
    return [
      h('p', { class: 'muted' }, intro),
      ...srcs.map((x) =>
        h('div', { class: 'row' },
          h('label', { class: 'switch' }, h('input', { type: 'checkbox', checked: x.enabled !== false, onchange: (e) => save(all.map((y) => (y.id === x.id ? { ...y, enabled: e.target.checked } : y))) }), h('span', {})),
          h('i', { class: 'dot', vars: { '--c': x.color } }),
          h('div', { class: 'grow' }, h('b', {}, x.name), h('small', {}, st[x.id] ? (st[x.id].ok ? plural(st[x.id].n, 'élément') : `injoignable : ${st[x.id].error}`) : x.enabled === false ? 'désactivé' : 'pas encore lu')),
          h('button', { class: 'icon-btn tiny', title: 'Retirer', onclick: () => save(all.filter((y) => y.id !== x.id)) }, icon('trash', 13)))),
      h('h4', { class: 'sec' }, 'Ajouter'),
      h('div', { class: 'add-gear' }, kind ? h('div', { class: 'two' }, name, kind) : name, url, h('button', { class: 'btn soft full', onclick: () => {
        if (!name.value.trim() || !url.value.trim()) return;
        save([...all, { ...parseSource(name.value.trim(), url.value), group, kind: kind?.value }]);
      } }, icon('plus', 14), 'Suivre')),
      h('button', { class: 'link', onclick: async () => save([...all.filter((x) => (x.group || 'press') !== group), ...(await api.news.defaults()).filter((x) => (x.group || 'press') === group)]) }, 'Revenir à la liste de départ'),
    ];
  }

  function press(panel) {
    const tab = tabbed(['une', 'videos', 'sources'], 'une');
    const all = state.newsSources || [];
    const srcs = all.filter((x) => x.group !== 'skate');
    const raw = state.news || { items: [], status: {} };
    const news = { ...raw, items: (raw.items || []).filter((it) => all.find((x) => x.id === it.source)?.group !== 'skate') };
    const srcOf = (id) => srcs.find((x) => x.id === id) || { name: id, color: '#9aa0b4' };
    const filter = state.newsFilter || 'all';
    const card = (it) => {
      const sr = srcOf(it.source);
      return h('button', { class: 'news', vars: { '--c': sr.color }, onclick: () => api.openUrl(it.link) },
        h('div', { class: 'news-top' }, h('span', { class: 'src' }, sr.name), h('small', {}, ago(it.date))),
        h('b', {}, it.title),
        it.desc && !it.video ? h('p', {}, it.desc.slice(0, 180)) : null);
    };
    let body;
    if (tab === 'sources') {
      body = sourcesTab('press', 'Les médias que le bureau suit. Pour un site, l’appli trouve son flux RSS ; pour une chaîne YouTube, ses dernières vidéos.');
    } else {
      const list = news.items.filter((it) => (tab === 'videos' ? it.video : true) && (filter === 'all' || it.source === filter));
      const used = [...new Set(news.items.filter((it) => (tab === 'videos' ? it.video : true)).map((it) => it.source))];
      body = [
        news.demo ? h('p', { class: 'notice' }, 'Aperçu navigateur : les médias se lisent dans l’application Windows.') : null,
        h('div', { class: 'api-line' }, icon('refresh', 14), h('span', { class: 'grow' }, state.newsLoading ? 'Lecture des médias…' : news.at ? `Mis à jour ${ago(news.at)} · ${plural(news.items.length, 'article')}` : 'Pas encore lu'), h('button', { class: 'btn soft', onclick: () => ctx.loadNews(true) }, 'Actualiser')),
        used.length ? h('div', { class: 'chips' }, h('button', { class: `chip ${filter === 'all' ? 'on-chip' : ''}`, onclick: () => ((state.newsFilter = 'all'), ctx.rerender()) }, 'Tous'), ...used.map((id) => h('button', { class: `chip ${filter === id ? 'on-chip' : ''}`, vars: { '--c': srcOf(id).color }, onclick: () => ((state.newsFilter = id), ctx.rerender()) }, srcOf(id).name))) : null,
        ...list.slice(0, 60).map(card),
        list.length ? null : emptyState(news.at ? 'Rien pour ce filtre.' : 'Clique sur « Actualiser » pour lire tes médias.'),
      ];
    }
    panelLayout(panel, {
      kicker: [zoneCrumb('info'), crumb(`${LANDMARK_ICON.press} Presse`)].filter(Boolean),
      title: 'Bureau de journaliste',
      color: '#ff2d55',
      actions: [btn('sparkles', 'Revue de presse', () => askClaude('Fais-moi la revue de presse du jour à partir de mes médias (read_news) : les 5 à 8 sujets importants, ce qu’en disent les différents médias, et ce qui concerne la culture, la musique, l’associatif ou le social. Termine par les liens.'), 'claude')],
      tabs: [{ key: 'une', label: 'À la une', count: news.items.length }, { key: 'videos', label: 'Vidéos', count: news.items.filter((it) => it.video).length }, { key: 'sources', label: 'Médias', count: srcs.filter((x) => x.enabled !== false).length }],
      body,
    });
  }

  // ---------- Post-it de l'école ----------
  function postit(panel) {
    const input = h('input', { type: 'text', placeholder: 'Ta réponse', autocomplete: 'off' });
    const msg = h('p', { class: 'lock-msg' }, '');
    const check = async () => {
      const r = await api.postit.check(input.value);
      if (r.ok) {
        state.postitCode = r.code;
        ctx.revealPostit(r.code);
        ctx.rerender();
      } else {
        msg.textContent = 'Mauvaise réponse…';
        input.value = '';
      }
    };
    input.addEventListener('keydown', (e) => e.key === 'Enter' && check());
    panelLayout(panel, {
      kicker: [zoneCrumb('info'), crumb('🗒️ derrière l’école')].filter(Boolean),
      title: 'Un post-it…',
      color: '#ffe866',
      body: state.postitCode
        ? [h('div', { class: 'lock-box' }, h('div', { class: 'postit-big' }, h('small', {}, 'code :'), h('b', {}, state.postitCode)), h('p', { class: 'muted' }, 'Le code des zones sensibles. Chut.'))]
        : [h('div', { class: 'lock-box' }, h('div', { class: 'postit-big blur' }, h('small', {}, 'code :'), h('b', {}, '••••••')), h('p', {}, h('b', {}, self.postitQ || 'Qui est le premier artiste du studio ?')), input, msg, h('button', { class: 'btn primary', onclick: check }, 'Répondre'))],
    });
    setTimeout(() => input.focus(), 50);
  }

  // ---------- Kebab ----------
  function kebab(panel) {
    const row = (label, price, note) => h('div', { class: 'gear' }, h('div', { class: 'grow' }, h('b', {}, label), note ? h('small', {}, note) : null), h('span', { class: 'price-tag' }, price));
    panelLayout(panel, {
      kicker: [zoneCrumb('music'), crumb('🥙 Kebab')].filter(Boolean),
      title: 'Le kebab',
      color: '#c8102e',
      actions: [btn('sparkles', 'Prix à jour', () => askClaude('Cherche sur le web le prix moyen actuel d’un kebab (sandwich seul et menu avec frites et boisson) à Paris, avec tes sources, et donne-moi trois bonnes adresses près de Villejuif.'), 'claude')],
      body: [
        h('div', { class: 'kebab-hero' }, h('span', {}, '🥙'), h('div', {}, h('small', {}, 'Prix moyen d’un menu kebab à Paris'), h('b', {}, '≈ 12 €'), h('em', {}, 'fourchette 10 – 15 € selon le quartier'))),
        row('Menu kebab (frites + boisson)', '10 – 15 €', 'Paris, 2026 — estimation à partir de plusieurs relevés'),
        row('Moyenne nationale du menu', '10 – 12 €', 'en hausse de plus de 40 % en cinq ans'),
        row('Fourchette haute annoncée à Paris', '13 – 18 €', 'chiffre d’une chaîne de kebabs, sans doute surestimé'),
        h('p', { class: 'muted small' }, 'Sources : L’Express Franchise, XKebab, City Guide Paris (relevés 2025-2026). Pas de chiffre officiel : demande à Claude de vérifier les prix du moment.'),
      ],
    });
  }

  // ---------- Skate park ----------
  const FRESH_DAYS = 21;
  function skateData() {
    const all = state.newsSources || [];
    const sk = all.filter((x) => x.group === 'skate' && x.enabled !== false);
    const items = state.news?.items || [];
    const skaters = sk.filter((x) => x.kind === 'skater').map((x) => {
      const last = items.find((it) => it.source === x.id);
      const fresh = last?.date && Date.now() - Date.parse(last.date) < FRESH_DAYS * 86400000;
      return { src: x, last, fresh };
    });
    const mags = items.filter((it) => sk.find((x) => x.id === it.source && x.kind !== 'skater'));
    return { sk, skaters, mags };
  }
  function skate(panel) {
    const tab = tabbed(['skaters', 'mags', 'sources'], 'skaters');
    const { sk, skaters, mags } = skateData();
    let body;
    if (tab === 'skaters') {
      const sorted = [...skaters].sort((a, b) => (b.last?.date || '').localeCompare(a.last?.date || ''));
      body = [
        h('p', { class: 'muted' }, `Quand un skateur sort une vidéo (moins de ${FRESH_DAYS} jours), il vient rider au skate park.`),
        ...sorted.map(({ src, last, fresh }) =>
          h('button', { class: 'news', vars: { '--c': src.color }, onclick: () => last && api.openUrl(last.link) },
            h('div', { class: 'news-top' }, h('span', { class: 'src' }, `${fresh ? '🛹 ' : ''}${src.name}`), h('small', {}, last?.date ? new Date(last.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : '')),
            h('b', {}, last ? last.title : state.news?.status?.[src.id]?.ok === false ? 'Chaîne injoignable pour le moment' : 'Pas encore lu'),
            fresh ? h('p', {}, 'Nouvelle vidéo : il est au skate park en ce moment.') : null)),
        skaters.length ? null : emptyState('Aucun skateur suivi.'),
      ];
    } else if (tab === 'mags') {
      body = [
        h('div', { class: 'api-line' }, icon('refresh', 14), h('span', { class: 'grow' }, state.newsLoading ? 'Lecture…' : `${plural(mags.length, 'article')}`), h('button', { class: 'btn soft', onclick: () => ctx.loadNews(true) }, 'Actualiser')),
        ...mags.slice(0, 40).map((it) => {
          const src = sk.find((x) => x.id === it.source);
          return h('button', { class: 'news', vars: { '--c': src?.color }, onclick: () => api.openUrl(it.link) }, h('div', { class: 'news-top' }, h('span', { class: 'src' }, src?.name), h('small', {}, it.date ? new Date(it.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : '')), h('b', {}, it.title), it.desc && !it.video ? h('p', {}, it.desc.slice(0, 160)) : null);
        }),
        mags.length ? null : emptyState(state.news?.demo ? 'Les magazines se lisent dans l’application Windows.' : 'Rien pour l’instant : clique sur « Actualiser ».'),
      ];
    } else body = sourcesTab('skate', 'Skateurs (chaîne YouTube) et magazines suivis par le skate park.');
    panelLayout(panel, {
      kicker: [zoneCrumb('res'), crumb('🛹 Skate park')].filter(Boolean),
      title: 'Skate park',
      color: '#ffb020',
      actions: [btn('sparkles', 'Quoi de neuf ?', () => askClaude('Fais le point sur l’actu du skate : les dernières vidéos des skateurs suivis et les derniers articles des magazines (read_news avec source = Thrasher, Jenkem, Free Skate Mag…), en quelques lignes avec les liens.'), 'claude')],
      tabs: [{ key: 'skaters', label: 'Skateurs', count: skaters.filter((x) => x.fresh).length || undefined }, { key: 'mags', label: 'Magazines', count: mags.length }, { key: 'sources', label: 'Suivis', count: sk.length }],
      body,
    });
  }

  // ---------- FBI ----------
  function fbi(panel) {
    const st = state.fbi || { hasKey: false, active: false };
    const field2 = (ph, type = 'password') => h('input', { type, placeholder: ph, autocomplete: 'off' });
    let body;
    if (!st.hasKey) {
      const k1 = field2('Clé d’activation (4 caractères min.)');
      const k2 = field2('Confirmer la clé');
      body = [
        h('div', { class: 'lock-box' }, h('div', { class: 'lock-ico' }, '🕵️'), h('p', { class: 'muted' }, 'Le FBI n’est pas encore activé. Choisis sa clé d’activation : elle sera chiffrée sur ce PC et demandée à chaque lancement de l’appli.'), k1, k2,
          h('button', { class: 'btn primary', onclick: async () => {
            if (k1.value !== k2.value) return toast('Les deux clés ne correspondent pas', 'error');
            try {
              state.fbi = await api.fbi.setKey(k1.value);
              ctx.rerender();
            } catch (e) {
              toast(e.message, 'error');
            }
          } }, 'Activer le FBI')),
      ];
    } else if (!st.active) {
      const k = field2('Clé d’activation');
      const msg = h('p', { class: 'lock-msg' }, '');
      const go = async () => {
        const r = await api.fbi.activate(k.value);
        if (r.ok) {
          state.fbi = { ...st, active: true };
          ctx.rerender();
        } else {
          k.value = '';
          msg.textContent = r.wait ? `Bloqué ${r.wait} s.` : `Clé refusée${r.left ? ` (${r.left} essai${r.left > 1 ? 's' : ''})` : ''}.`;
        }
      };
      k.addEventListener('keydown', (e) => e.key === 'Enter' && go());
      body = [h('div', { class: 'lock-box' }, h('div', { class: 'lock-ico' }, '🕵️'), h('p', { class: 'muted' }, 'Accès restreint. Entre la clé d’activation.'), k, msg, h('button', { class: 'btn primary', onclick: go }, 'Entrer'))];
      setTimeout(() => k.focus(), 50);
    } else {
      if (!state.fbiData) {
        api.fbi.get().then((d) => {
          state.fbiData = { searchCode: '', files: [], ...d };
          ctx.rerender();
        }, (e) => toast(e.message, 'error'));
      }
      const data = state.fbiData || { searchCode: '', files: [] };
      const persist = async (d) => {
        state.fbiData = await api.fbi.save(d);
        ctx.rerender();
      };
      const code = h('input', { type: 'text', value: data.searchCode || '', placeholder: 'À fournir plus tard', class: 'code-field' });
      const f = { title: h('input', { type: 'text', placeholder: 'Nom du dossier' }), code: h('input', { type: 'text', placeholder: 'Code / référence' }), notes: h('textarea', { rows: 3, placeholder: 'Notes' }) };
      const oldK = field2('Clé actuelle');
      const newK = field2('Nouvelle clé');
      body = [
        h('h4', { class: 'sec' }, 'Code de recherche'),
        h('div', { class: 'add-task' }, icon('search', 16), code, h('button', { class: 'btn soft', onclick: () => persist({ ...data, searchCode: code.value.trim() }).then(() => toast('Code de recherche enregistré', 'ok')) }, 'Enregistrer')),
        data.searchCode ? null : h('p', { class: 'muted small' }, 'Emplacement prêt : colle ici le code de recherche quand tu l’auras.'),
        h('h4', { class: 'sec' }, `Dossiers (${(data.files || []).length})`),
        ...(data.files || []).map((x) =>
          h('div', { class: 'training' },
            h('span', { class: 'kind', vars: { '--k': '#3a6bff' } }, icon('file', 14)),
            h('div', { class: 'grow' }, h('b', {}, x.title), h('small', {}, [x.code, x.status, x.date].filter(Boolean).join(' · ')), x.notes ? h('p', {}, x.notes) : null),
            h('button', { class: 'icon-btn tiny', title: x.status === 'classé' ? 'Rouvrir' : 'Classer', onclick: () => persist({ ...data, files: data.files.map((y) => (y.id === x.id ? { ...y, status: y.status === 'classé' ? 'ouvert' : 'classé' } : y)) }) }, icon('check', 13)),
            h('button', { class: 'icon-btn tiny', title: 'Supprimer', onclick: () => persist({ ...data, files: data.files.filter((y) => y.id !== x.id) }) }, icon('trash', 13)))),
        h('div', { class: 'add-gear' }, h('div', { class: 'two' }, f.title, f.code), f.notes, h('button', { class: 'btn soft full', onclick: () => {
          if (!f.title.value.trim()) return;
          persist({ ...data, files: [...(data.files || []), { id: Math.random().toString(36).slice(2, 10), title: f.title.value.trim(), code: f.code.value.trim(), notes: f.notes.value.trim(), status: 'ouvert', date: today() }] });
        } }, icon('plus', 14), 'Ouvrir un dossier')),
        h('details', { class: 'card' }, h('summary', {}, h('b', {}, 'Changer la clé d’activation')), h('div', { class: 'two' }, oldK, newK), h('button', { class: 'btn soft full', onclick: async () => {
          try {
            state.fbi = await api.fbi.setKey(newK.value, oldK.value);
            toast('Clé changée', 'ok');
          } catch (e) {
            toast(e.message, 'error');
          }
        } }, 'Changer')),
      ];
    }
    panelLayout(panel, {
      kicker: [zoneCrumb('admin'), crumb('🕵️ FBI')].filter(Boolean),
      title: 'FBI',
      color: '#3a6bff',
      actions: st.active ? [btn('x', 'Désactiver', async () => {
        state.fbi = await api.fbi.lock();
        state.fbiData = null;
        ctx.rerender();
      })] : [],
      body,
    });
  }

  // ---------- Facteur ----------
  function postman(panel) {
    const recent = [];
    walk(state.tree, (n, depth) => depth > 0 && n.modified && recent.push(n));
    recent.sort((a, b) => b.modified.localeCompare(a.modified));
    panelLayout(panel, {
      kicker: [crumb('📬 Le facteur')],
      title: 'Courrier du jour',
      color: '#4f8bff',
      body: [h('p', { class: 'muted' }, 'Les dernières modifications du Drive, livrées par le facteur.'), h('div', { class: 'files' }, ...recent.slice(0, 25).map((n) => fileRow(n, false)))],
    });
  }

  return Object.assign(self, { habitants, library, bank, mairie, studio, artist, shop, hall, eventEditor, school, member, bell, board, postman, events, gigs, weekGigs, radio, label, cgt, fire, pole, press, postit, kebab, skate, skateData, fbi });
}
