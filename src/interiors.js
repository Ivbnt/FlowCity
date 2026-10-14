// Intérieurs des bâtiments : ce que l'on voit en cliquant sur la bibliothèque, la banque, la mairie,
// le studio, le magasin, la salle de concert, l'école, le clocher, le tableau et le facteur.
import { findNode, walk, norm, evaluate, projectState } from '../shared/advisor.mjs';
import { themeGroups } from '../shared/layout.mjs';
import { eventInfo, isPastEvent, deadlines } from '../shared/registry.mjs';
import { LANDMARK_ICON } from './landmarks.js';

const DAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
const fmtDate = (d) => (d ? new Date(`${d}T12:00`).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' }) : 'sans date');
const today = () => new Date().toISOString().slice(0, 10);

export function makeInteriors(ctx) {
  const { h, icon, kindIcon, state, api, select, openFile, askClaude, toast, panelLayout, crumb, btn, navRow, fileRow, taskRow, addTaskForm, emptyState, checklist, tasksUnder, dColor, plural } = ctx;
  const reg = () => state.registry || { members: [], artists: [], gear: [], events: [], reminders: [], schedule: [] };
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
  const eventDistrict = () => [...state.layout.values()].find((L) => L.mode === 'projects');
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
      const L = eventDistrict();
      for (const s of L?.subs || []) {
        if (s.kind !== 'project' || arch.some((a) => a.n.id === s.id)) continue;
        if (isPastEvent(eventInfo(reg(), s.id), s.state)) arch.push({ n: s.node, why: 'événement passé' });
      }
      body = [
        h('p', { class: 'muted' }, 'Projets terminés, abandonnés ou passés, rangés ici pour mémoire.'),
        arch.length ? h('div', { class: 'files' }, ...arch.map(({ n, why }) => navRow(n, findNode(state.tree, n.id) ? state.tree.children.find((d) => walkHas(d, n.id)) || state.tree : state.tree, why))) : emptyState('Aucune archive pour l’instant.'),
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
      kicker: [crumb(`${LANDMARK_ICON.library} Bibliothèque`)],
      title: state.tree.name,
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

  // ---------- Mairie ----------
  function mairie(panel, sub, d) {
    const ev = evaluate(d, d, state.tasks);
    const tab = tabbed(['services', 'todo', 'progress'], 'services');
    const all = sub.items.flatMap((n) => tasksUnder(n));
    const body =
      tab === 'services'
        ? [h('p', { class: 'muted' }, 'Les guichets de la mairie : statuts, licences, assurances, fiches artistes, stratégie…'), h('div', { class: 'files' }, ...sub.items.map((n) => fileRow(n, false)))]
        : tab === 'todo'
          ? [addTaskForm(sub.items.map((n) => ({ id: n.id, label: n.name.slice(0, 28) }))), all.length ? null : emptyState('Aucune tâche.'), ...all.map((t) => taskRow(t, { showPlace: true }))]
          : [checklist(ev, d.id)];
    panelLayout(panel, {
      kicker: [crumb(d.name, d.id), crumb(`${LANDMARK_ICON.mairie} Mairie`)],
      title: 'Mairie — administratif',
      color: '#5d8bff',
      score: ev.score,
      actions: [btn('sparkles', 'Vérifier l’administratif', () => askClaude('Fais le point sur l’administratif de l’association : statuts, licences, assurances, subventions. Qu’est-ce qui manque ou arrive à échéance ? Crée les tâches et rappels utiles.', d.id), 'claude')],
      tabs: [{ key: 'services', label: 'Guichets', count: sub.items.length }, { key: 'todo', label: 'À faire', count: all.filter((t) => !t.done).length }, { key: 'progress', label: 'Progression' }],
      body,
    });
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
    const note = h('textarea', { rows: 2, placeholder: 'Notes' }, a.note || '');
    const folderSel = h('select', {}, h('option', { value: '' }, '— Dossier Drive de l’artiste —'));
    walk(state.tree, (n, depth) => depth >= 2 && depth <= 3 && n.kind === 'folder' && folderSel.append(h('option', { value: n.id, selected: n.id === a.folderId }, n.name)));
    const studioSub = [...state.layout.values()].flatMap((L) => L.subs).find((s) => s.landmark === 'studio');
    panelLayout(panel, {
      kicker: [studioSub ? crumb(`${LANDMARK_ICON.studio} Studio`, studioSub.id) : null, crumb('disque d’or')],
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
        field('Rôle', role),
        field('Dossier', folderSel),
        field('Notes', note),
        h('div', { class: 'two' },
          h('button', { class: 'btn primary', onclick: () => upsert('artists', { id: a.id, role: role.value, note: note.value, folderId: folderSel.value || null }).then(() => toast('Artiste mis à jour', 'ok')) }, 'Enregistrer'),
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
    const L = eventDistrict();
    return (L?.subs || [])
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
  function hall(panel) {
    const L = eventDistrict();
    const color = L ? dColor(L.district) : '#ffb020';
    const ev = events();
    const upcoming = ev.filter((e) => !e.past).sort((a, b) => (a.info?.date || '9').localeCompare(b.info?.date || '9'));
    const past = ev.filter((e) => e.past).sort((a, b) => (b.info?.date || '').localeCompare(a.info?.date || ''));
    panelLayout(panel, {
      kicker: [L ? crumb(L.district.name, L.district.id) : null, crumb(`${LANDMARK_ICON.hall} Salle de concert`)].filter(Boolean),
      title: 'À l’affiche',
      color,
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
  function school(panel) {
    const members = reg().members;
    const nameIn = h('input', { type: 'text', placeholder: 'Prénom' });
    const roleIn = h('input', { type: 'text', placeholder: 'Rôle' });
    panelLayout(panel, {
      kicker: [crumb(`${LANDMARK_ICON.school} École`)],
      title: 'L’équipe de l’asso',
      color: '#ffb020',
      body: [
        h('p', { class: 'muted' }, 'Chaque enfant de la cour est un membre de l’association. Clique pour voir ses dossiers, son rôle et ses missions.'),
        h('div', { class: 'kids' }, ...members.map((m) => {
          const n = ownedNodes(m).length;
          const tasks = Object.values(state.tasks).flat().filter((t) => t.assignee === m.id && !t.done).length;
          return h('button', { class: 'kid-card', vars: { '--c': m.color || '#ffb020' }, onclick: () => select(`member:${m.id}`) }, h('span', { class: 'avatar' }, m.name[0]), h('b', {}, m.name), h('small', {}, m.role || 'rôle à définir'), h('em', {}, [n ? plural(n, 'dossier') : null, tasks ? plural(tasks, 'tâche') : null].filter(Boolean).join(' · ') || ' '));
        })),
        h('h4', { class: 'sec' }, 'Inscrire un membre'),
        h('div', { class: 'two' }, nameIn, roleIn),
        h('button', { class: 'btn soft full', onclick: async () => {
          if (!nameIn.value.trim()) return;
          const colors = ['#ff5577', '#33c6ff', '#ffb020', '#9b7bff', '#2fd17a', '#ff6bd5', '#4f8bff', '#ff8a3d'];
          await upsert('members', { name: nameIn.value.trim(), role: roleIn.value.trim(), emails: [], color: colors[members.length % colors.length] });
          nameIn.value = roleIn.value = '';
        } }, icon('plus', 14), 'Ajouter'),
      ],
    });
  }

  function member(panel, id) {
    const m = memberById(id);
    if (!m) return panel.classList.add('hidden');
    const tab = tabbed(['files', 'tasks', 'info'], 'files');
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
      const role = h('input', { type: 'text', value: m.role || '' });
      const emails = h('input', { type: 'text', value: (m.emails || []).join(', '), placeholder: 'e-mails Google, séparés par des virgules' });
      const color = h('input', { type: 'color', value: m.color || '#ffb020' });
      body = [
        field('Prénom', name), field('Rôle', role), field('E-mails Google (pour retrouver ses fichiers)', emails), field('Couleur', color),
        h('div', { class: 'two' },
          h('button', { class: 'btn primary', onclick: () => upsert('members', { id: m.id, name: name.value.trim() || m.name, role: role.value.trim(), emails: emails.value.split(',').map((x) => x.trim()).filter(Boolean), color: color.value }).then(() => toast('Membre mis à jour', 'ok')) }, 'Enregistrer'),
          h('button', { class: 'btn soft', onclick: async () => {
            await remove('members', m.id);
            select('lm:school');
          } }, 'Retirer de l’école')),
      ];
    }
    panelLayout(panel, {
      kicker: [crumb(`${LANDMARK_ICON.school} École`, 'lm:school'), crumb('membre')],
      title: m.name,
      color: m.color || '#ffb020',
      actions: [btn('sparkles', 'Claude', () => askClaude(`Quelles sont les missions et tâches de ${m.name} (${m.role || 'membre'}) ? Fais le point et propose la suite.`), 'claude')],
      tabs: [{ key: 'files', label: 'Dossiers', count: owned.length }, { key: 'tasks', label: 'Tâches', count: tasks.filter((t) => !t.done).length }, { key: 'info', label: 'Infos' }],
      body: [h('div', { class: 'member-hero', vars: { '--c': m.color || '#ffb020' } }, h('span', { class: 'avatar big' }, m.name[0]), h('div', {}, h('b', {}, m.role || 'rôle à définir'), h('small', {}, (m.emails || []).join(' · ') || 'pas d’e-mail'))), ...body],
    });
  }

  // ---------- Clocher (rappels & deadlines) ----------
  function bell(panel) {
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
      kicker: [crumb(`${LANDMARK_ICON.bell} Clocher`)],
      title: 'Rappels & deadlines',
      color: '#ffd76b',
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
      kicker: [crumb(`${LANDMARK_ICON.board} Tableau`)],
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

  return { library, bank, mairie, studio, artist, shop, hall, eventEditor, school, member, bell, board, postman, events };
}
