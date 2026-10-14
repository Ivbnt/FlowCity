// Intérieurs ajoutés avec les comptes : mairie (recensement, comptes & accès, calendrier administratif,
// conseil & AG avec signatures, journal), banque (structure comptable, tableau de bord, graphiques des Sheets,
// subventions), école (défis du jour), cerveau, université, CGT, magasin (preuves d'obtention), label,
// beatmakers, réseaux sociaux, Gapple, salles partenaires, place des festivals, clocher (Google Agenda)…
import { findNode, walk, norm, evaluate, projectState } from '../shared/advisor.mjs';
import { TIERS, PLACES, SPECIALS, tierName, tierShort, tierColor, rulesFor, seesAllPoles } from '../shared/access.mjs';
import { THEMES } from '../shared/quiz.mjs';
import { POLES, LEVELS, beatmakers, projectZone, deadlines, eventInfo, isPastEvent } from '../shared/registry.mjs';
import { LANDMARK_ICON } from './landmarks.js';
import { archivedProjects } from '../shared/layout.mjs';
import { pickFile, signaturePad, parseCsv, toNumber, barChart } from './widgets.js';

const fmtDate = (d) => (d ? new Date(`${String(d).slice(0, 10)}T12:00`).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' }) : 'à dater');
const fmtDT = (iso) => (iso ? new Date(iso).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');
const today = () => new Date().toISOString().slice(0, 10);
const eur = (n) => `${Number(n || 0).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} €`;

// Plan comptable associatif simplifié (classes 6 et 7)
export const ACCOUNTS = [
  ['60', 'Achats (matériel, fournitures)', 'depense'],
  ['61', 'Services extérieurs (locations, assurances)', 'depense'],
  ['62', 'Autres services (cachets, com, déplacements)', 'depense'],
  ['63', 'Impôts et taxes (SACEM…)', 'depense'],
  ['64', 'Charges de personnel', 'depense'],
  ['65', 'Autres charges de gestion', 'depense'],
  ['66', 'Charges financières (frais bancaires)', 'depense'],
  ['70', 'Ventes (billetterie, prestations, merch)', 'recette'],
  ['74', 'Subventions', 'recette'],
  ['75', 'Cotisations et dons', 'recette'],
  ['76', 'Produits financiers', 'recette'],
  ['77', 'Produits exceptionnels', 'recette'],
];
const accName = (code) => ACCOUNTS.find((a) => a[0] === String(code))?.[1] || code || 'Non classé';

export function ledgerSummary(ledger) {
  const rec = ledger.filter((e) => e.type === 'recette').reduce((s, e) => s + Number(e.amount || 0), 0);
  const dep = ledger.filter((e) => e.type !== 'recette').reduce((s, e) => s + Number(e.amount || 0), 0);
  const byAcc = {};
  for (const e of ledger) byAcc[e.account || '?'] = (byAcc[e.account || '?'] || 0) + Number(e.amount || 0);
  const months = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - i);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  const perMonth = (type) => months.map((m) => ledger.filter((e) => (type === 'recette' ? e.type === 'recette' : e.type !== 'recette') && String(e.date || '').startsWith(m)).reduce((s, e) => s + Number(e.amount || 0), 0));
  return { rec, dep, solde: rec - dep, byAcc, months, recM: perMonth('recette'), depM: perMonth('depense') };
}

export function makeInteriors2(ctx) {
  const { h, icon, kindIcon, state, api, select, openFile, askClaude, toast, panelLayout, crumb, btn, navRow, fileRow, taskRow, addTaskForm, emptyState, tasksUnder, plural, inside } = ctx;
  const reg = () => state.registry || {};
  const upsert = (kind, item) => api.registry.upsert(kind, item).catch((e) => toast(e.message, 'error'));
  const remove = (kind, id) => api.registry.remove(kind, id).catch((e) => toast(e.message, 'error'));
  const me = () => state.session?.account || null;
  const isT1 = () => me()?.tier === 1;
  const tabbed = (keys, def) => {
    if (!keys.includes(state.tab)) state.tab = def;
    return state.tab;
  };
  const field = (label, input) => h('label', { class: 'field' }, h('span', {}, label), input);
  const zoneL = (key) => [...state.layout.values()].find((L) => L.zone === key);
  const zoneCrumb = (key) => {
    const L = zoneL(key);
    return L ? crumb(L.district.name, L.district.id) : null;
  };
  const findByName = (re) => {
    let f = null;
    walk(state.tree, (n) => {
      if (!f && re.test(norm(n.name))) f = n;
    });
    return f;
  };
  const driveMatches = (re, { files = false } = {}) => {
    const out = [];
    walk(state.tree, (n, depth) => depth > 0 && (!files || n.kind !== 'folder') && re.test(norm(n.name)) && out.push(n));
    return out;
  };
  // Dépose un fichier et renvoie ses métadonnées
  const upload = async (category, accept) => {
    try {
      const f = await pickFile(accept);
      const meta = await api.files.save({ ...f, category });
      toast(`« ${meta.name} » déposé`, 'ok');
      return meta;
    } catch (e) {
      if (e.message !== 'Aucun fichier') toast(e.message, 'error');
      return null;
    }
  };
  const fileChip = (meta, label) => (meta ? h('button', { class: 'quick', onclick: () => api.files.open(meta.id || meta).catch((e) => toast(e.message, 'error')) }, icon('file', 14), label || meta.name || 'fichier') : null);
  const tierBadge = (t) => h('span', { class: 'tier-badge', vars: { '--c': tierColor(t) } }, tierShort(t));
  const rerender = ctx.rerender;

  // =====================================================================
  // MAIRIE
  // =====================================================================
  function mairie(panel, sub, d) {
    const ev = evaluate(d, d, state.tasks);
    const keys = ['people', 'census', 'council', 'adminCal', 'statuts', 'services', 'todo'];
    if (isT1()) keys.push('accounts', 'journal');
    const tab = tabbed(keys, 'people');
    const all = sub.items.flatMap((n) => tasksUnder(n));
    const pending = (state.accounts || []).filter((a) => a.status === 'pending');
    let body;
    if (tab === 'people') body = inside.habitants();
    else if (tab === 'census') body = census(pending);
    else if (tab === 'council') body = council();
    else if (tab === 'adminCal') body = adminCalendar();
    else if (tab === 'statuts') body = statuts(sub);
    else if (tab === 'services') body = [h('p', { class: 'muted' }, 'Les guichets de la mairie : statuts, licences, assurances, fiches artistes, stratégie…'), h('div', { class: 'files' }, ...sub.items.map((n) => fileRow(n, false)))];
    else if (tab === 'accounts') body = accountsTab();
    else if (tab === 'journal') body = journal();
    else body = [addTaskForm(sub.items.map((n) => ({ id: n.id, label: n.name.slice(0, 28) }))), all.length ? null : emptyState('Aucune tâche.'), ...all.map((t) => taskRow(t, { showPlace: true }))];
    const tabs = [
      { key: 'people', label: 'Habitants', count: (reg().members || []).length },
      { key: 'census', label: 'Recensement', count: pending.length || undefined },
      { key: 'council', label: 'Conseil & AG' },
      { key: 'adminCal', label: 'Calendrier admin', count: (reg().adminCal || []).filter((k) => !k.done).length },
      { key: 'statuts', label: 'Statuts & PV' },
      { key: 'services', label: 'Guichets', count: sub.items.length },
      { key: 'todo', label: 'À faire', count: all.filter((t) => !t.done).length },
    ];
    if (isT1()) tabs.push({ key: 'accounts', label: 'Comptes & accès' }, { key: 'journal', label: 'Journal' });
    panelLayout(panel, {
      kicker: [crumb(d.name, d.id), crumb(`${LANDMARK_ICON.mairie} Mairie`)],
      title: 'Mairie',
      color: '#5d8bff',
      score: ev.score,
      actions: [btn('sparkles', 'Vérifier l’administratif', () => askClaude('Fais le point sur l’administratif de l’association : statuts, PV, licences, assurances, calendrier administratif (list_registry adminCal), AG à venir (assemblies). Qu’est-ce qui manque ou arrive à échéance ? Crée les tâches et ajoute les dates au calendrier administratif.', d.id), 'claude'), btn('calendar', 'Concerts à Paris', () => select('lm:gigs'))],
      tabs,
      body,
    });
  }

  // Recensement : demandes d'inscription (pièce d'identité + charte) et rappels de signature.
  function census(pending) {
    const t1 = isT1();
    const accounts = state.accounts || [];
    const members = reg().members || [];
    // Membres de la ville sans inscription administrative (pas de compte, ou compte sans charte signée)
    const notReg = members.filter((m) => {
      const a = accounts.find((x) => x.memberId === m.id || (x.name || '').toLowerCase() === (m.name || '').toLowerCase());
      return !a || !a.admin?.registered || !a.admin?.charter;
    });
    const reqCard = (a) => {
      const tier = h('select', { class: 'mini-select' }, ...TIERS.map((t) => h('option', { value: t.tier, selected: t.tier === (a.wantedTier || 3) }, t.name)));
      const name = h('input', { type: 'text', value: a.name });
      const email = h('input', { type: 'email', value: a.email || '', placeholder: 'e-mail Google' });
      const poles = new Set(a.poles || []);
      const reason = h('input', { type: 'text', placeholder: 'Motif du refus (facultatif)' });
      return h('div', { class: 'request' },
        h('div', { class: 'req-head' }, h('b', {}, a.name), h('small', {}, `demande du ${fmtDT(a.createdAt)} · souhaite ${tierName(a.wantedTier || 3)}`)),
        a.message ? h('p', { class: 'muted' }, `« ${a.message} »`) : null,
        h('div', { class: 'quicks' }, a.admin?.idDoc ? fileChip(a.admin.idDoc, '🪪 Pièce d’identité') : h('span', { class: 'chip' }, '🪪 pièce manquante'), a.admin?.charter ? fileChip(a.admin.charter, '✍️ Charte signée') : h('span', { class: 'chip' }, '✍️ charte manquante')),
        t1
          ? [
              h('div', { class: 'two' }, field('Nom affiché', name), field('E-mail', email)),
              field('Tier attribué', tier),
              h('div', { class: 'chips' }, ...POLES.map((p) => {
                const b = h('button', { class: `chip member ${poles.has(p.key) ? 'on' : ''}`, vars: { '--c': p.color } }, h('i', {}), p.name);
                b.addEventListener('click', () => {
                  poles.has(p.key) ? poles.delete(p.key) : poles.add(p.key);
                  b.classList.toggle('on');
                });
                return b;
              })),
              h('div', { class: 'two' },
                h('button', { class: 'btn primary', onclick: async () => {
                  try {
                    await api.accounts.approve(a.id, { name: name.value.trim(), email: email.value.trim(), tier: Number(tier.value), poles: [...poles] });
                    toast(`${name.value} est inscrit·e (${tierShort(Number(tier.value))})`, 'ok');
                    await ctx.reloadAccounts();
                  } catch (e) {
                    toast(e.message, 'error');
                  }
                } }, icon('check', 14), 'Accepter'),
                h('button', { class: 'btn soft', onclick: async () => {
                  await api.accounts.refuse(a.id, reason.value).catch((e) => toast(e.message, 'error'));
                  await ctx.reloadAccounts();
                } }, 'Refuser')),
              reason,
            ]
          : h('p', { class: 'muted small' }, 'Seul le tier 1 (Bureau) peut valider une inscription.'));
    };
    return [
      h('p', { class: 'muted' }, 'Toute personne qui veut un compte dépose sa pièce d’identité et sa charte signée. Le Bureau (tier 1) est notifié, vérifie les pièces, puis accepte la demande en choisissant le tier, le nom et les pôles.'),
      h('h4', { class: 'sec' }, `Demandes en attente · ${pending.length}`),
      ...pending.map(reqCard),
      pending.length ? null : emptyState('Aucune demande en attente.'),
      h('h4', { class: 'sec' }, `Pas encore inscrits administrativement · ${notReg.length}`),
      ...notReg.map((m) =>
        h('div', { class: 'gear' },
          h('span', { class: 'avatar small', vars: { '--c': m.color || '#ffb020' } }, (m.name || '?')[0]),
          h('div', { class: 'grow' }, h('b', {}, m.name), h('small', {}, [m.title, (m.emails || [])[0] || 'pas d’e-mail'].filter(Boolean).join(' · '))),
          h('button', { class: 'btn soft', title: 'Envoyer un rappel pour signer la charte et fournir la pièce d’identité', onclick: () => api.mail.remind((m.emails || [])[0] || '', m.name).then(() => toast(`Rappel préparé pour ${m.name}`, 'ok'), (e) => toast(e.message, 'error')) }, icon('send', 13), 'Rappel signature'))),
      notReg.length ? null : emptyState('Tout le monde est inscrit 🎉'),
    ];
  }

  // Conseil, AG et signatures (tier 1 et 2)
  function council() {
    const list = [...(reg().assemblies || [])].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    const canSign = [1, 2].includes(me()?.tier);
    const f = { title: h('input', { type: 'text', placeholder: 'Ex. AG ordinaire 2026' }), type: h('select', {}, ...['AG ordinaire', 'AG extraordinaire', 'Conseil d’administration', 'Réunion de bureau'].map((x) => h('option', { value: x }, x))), date: h('input', { type: 'date' }), time: h('input', { type: 'time', value: '19:00' }), agenda: h('textarea', { rows: 3, placeholder: 'Ordre du jour (un point par ligne)' }) };
    const card = (a) => {
      const sigs = a.signatures || [];
      const signedByMe = sigs.some((s) => s.accountId === me()?.id);
      const pv = h('textarea', { rows: 4, placeholder: 'Procès-verbal : décisions, votes…' }, a.pv || '');
      let pad = null;
      const sigBox = h('div', {});
      return h('details', { class: 'card', open: !a.closed && a.date >= today() },
        h('summary', {}, h('span', {}, '🏛️'), h('b', {}, a.title), h('small', {}, `${a.type || 'AG'} · ${fmtDate(a.date)}${a.time ? ` · ${a.time}` : ''} · ${plural(sigs.length, 'signature')}`)),
        a.agenda ? h('ol', { class: 'agenda' }, ...String(a.agenda).split('\n').filter(Boolean).map((l) => h('li', {}, l))) : null,
        field('Procès-verbal', pv),
        h('div', { class: 'quicks' },
          a.pvFile ? fileChip(a.pvFile, 'PV déposé') : null,
          h('button', { class: 'quick', onclick: async () => {
            const meta = await upload('pv', '.pdf,.doc,.docx,image/*');
            if (meta) upsert('assemblies', { id: a.id, pvFile: meta.id });
          } }, icon('plus', 13), 'Déposer le PV'),
          h('button', { class: 'quick', onclick: () => upsert('assemblies', { id: a.id, pv: pv.value }).then(() => toast('PV enregistré', 'ok')) }, icon('check', 13), 'Enregistrer le PV')),
        h('h5', {}, 'Signatures'),
        sigs.length ? h('div', { class: 'sig-list' }, ...sigs.map((s) => h('div', { class: 'sig' }, s.image ? h('img', { src: s.image, alt: `Signature de ${s.name}` }) : null, h('small', {}, `${s.name} · ${tierShort(s.tier)} · ${fmtDT(s.at)}`)))) : emptyState('Pas encore signé.'),
        canSign && !signedByMe
          ? h('button', { class: 'btn soft full', onclick: (e) => {
              pad = signaturePad(h);
              const certify = h('input', { type: 'checkbox' });
              sigBox.replaceChildren(pad.el, h('label', { class: 'check-row' }, certify, 'Je certifie avoir lu le PV et l’approuver'), h('button', { class: 'btn primary full', onclick: async () => {
                if (pad.isEmpty() || !certify.checked) return toast('Signe dans le cadre et coche la case.', 'error');
                const img = pad.toDataUrl();
                await upsert('assemblies', { id: a.id, pv: pv.value, signatures: [...sigs, { accountId: me().id, name: me().name, tier: me().tier, at: new Date().toISOString(), image: img }] });
                api.logs.add('signature', `${me().name} signe « ${a.title} »`);
                toast('Signé ✍️', 'ok');
              } }, 'Signer'));
              e.target.remove();
            } }, '✍️ Signer ce PV')
          : signedByMe ? h('p', { class: 'muted small' }, 'Tu as signé ce PV.') : h('p', { class: 'muted small' }, 'La signature est réservée aux tiers 1 et 2.'),
        sigBox,
        isT1() ? h('button', { class: 'link', onclick: () => remove('assemblies', a.id) }, 'Supprimer') : null);
    };
    return [
      h('p', { class: 'muted' }, 'Le conseil et les AG se tiennent ici : ordre du jour, procès-verbal, et signature directement dans la mairie (tiers 1 et 2). Chaque signature est datée et notée au journal.'),
      ...list.map(card),
      list.length ? null : emptyState('Aucune AG ni conseil enregistré.'),
      [1, 2].includes(me()?.tier)
        ? [h('h4', { class: 'sec' }, 'Convoquer'), h('div', { class: 'add-gear' }, f.title, h('div', { class: 'three' }, f.type, f.date, f.time), f.agenda, h('button', { class: 'btn soft full', onclick: async () => {
            if (!f.title.value.trim()) return;
            await upsert('assemblies', { title: f.title.value.trim(), type: f.type.value, date: f.date.value || null, time: f.time.value, agenda: f.agenda.value, signatures: [] });
            f.title.value = f.agenda.value = '';
          } }, icon('plus', 14), 'Créer'))]
        : null,
    ];
  }

  // Calendrier administratif : ce qu'il faut rendre, et quand.
  function adminCalendar() {
    const list = [...(reg().adminCal || [])].sort((a, b) => (a.done - b.done) || (a.date || '9').localeCompare(b.date || '9'));
    const t0 = today();
    const f = { title: h('input', { type: 'text', placeholder: 'À rendre (ex. Bilan FSDIE)' }), cat: h('input', { type: 'text', placeholder: 'Catégorie', list: 'admin-cats' }), date: h('input', { type: 'date' }) };
    return [
      h('datalist', { id: 'admin-cats' }, ...['AG', 'Préfecture', 'Assurance', 'Subventions', 'Banque', 'SACEM', 'URSSAF', 'Licence'].map((x) => h('option', { value: x }))),
      h('p', { class: 'muted' }, 'La liste des choses à faire administrativement, avec leur date limite (elles sonnent aussi au clocher).'),
      ...list.map((k) =>
        h('div', { class: `deadline ${k.done ? 'done' : k.date && k.date < t0 ? 'late' : ''}` },
          h('label', { class: 'cb' }, h('input', { type: 'checkbox', checked: k.done, onchange: (e) => upsert('adminCal', { id: k.id, done: e.target.checked }) }), h('span', {})),
          h('div', { class: 'grow' }, h('b', {}, k.title), h('small', {}, [k.cat, fmtDate(k.date)].filter(Boolean).join(' · '))),
          h('input', { type: 'date', class: 'mini-date', value: k.date || '', onchange: (e) => upsert('adminCal', { id: k.id, date: e.target.value || null }) }),
          h('button', { class: 'icon-btn tiny', title: 'Supprimer', onclick: () => remove('adminCal', k.id) }, icon('trash', 13)))),
      list.length ? null : emptyState('Rien à rendre pour l’instant.'),
      h('div', { class: 'add-gear' }, f.title, h('div', { class: 'two' }, f.cat, f.date), h('button', { class: 'btn soft full', onclick: async () => {
        if (!f.title.value.trim()) return;
        await upsert('adminCal', { title: f.title.value.trim(), cat: f.cat.value.trim(), date: f.date.value || null, done: false });
        f.title.value = '';
      } }, icon('plus', 14), 'Ajouter')),
    ];
  }

  function statuts(sub) {
    const docs = driveMatches(/statut|proces|pv|verbal|signature|reglement|licen|assurance|charte/);
    return [
      h('p', { class: 'muted' }, 'Statuts, procès-verbaux, licences et documents officiels de l’asso.'),
      h('div', { class: 'files' }, ...docs.map((n) => fileRow(n, false))),
      docs.length ? null : emptyState('Aucun document trouvé dans le Drive.'),
      ...(reg().assemblies || []).filter((a) => a.pvFile).map((a) => h('div', { class: 'quicks' }, fileChip(a.pvFile, `PV — ${a.title}`))),
      void sub,
    ];
  }

  // Comptes & accès (tier 1) : modifier le tier / nom / pôles / accès d'un compte, et la matrice des lieux.
  function accountsTab() {
    const accs = (state.accounts || []).filter((a) => a.status !== 'pending');
    const row = (a) => {
      const tier = h('select', { class: 'mini-select' }, ...TIERS.map((t) => h('option', { value: t.tier, selected: t.tier === a.tier }, t.short)));
      const status = h('select', { class: 'mini-select' }, h('option', { value: 'active', selected: a.status === 'active' }, 'actif'), h('option', { value: 'disabled', selected: a.status === 'disabled' }, 'désactivé'));
      const name = h('input', { type: 'text', value: a.name });
      const email = h('input', { type: 'email', value: a.email || '', placeholder: 'e-mail Google' });
      const pin = h('input', { type: 'password', inputmode: 'numeric', placeholder: 'nouveau code (facultatif)' });
      const poles = new Set(a.poles || []);
      const grants = new Set(a.grants || []);
      const specials = new Set(a.specials || []);
      return h('details', { class: 'card account' },
        h('summary', {}, tierBadge(a.tier), h('b', {}, a.name), h('small', {}, [a.email, a.status === 'refused' ? 'refusé' : a.status === 'disabled' ? 'désactivé' : null, a.lastLogin ? `vu ${fmtDT(a.lastLogin)}` : 'jamais connecté'].filter(Boolean).join(' · '))),
        h('div', { class: 'two' }, field('Nom', name), field('E-mail Google', email)),
        h('div', { class: 'three' }, field('Tier', tier), field('Statut', status), field('Code', pin)),
        h('h5', {}, 'Pôles'),
        h('div', { class: 'chips' }, ...POLES.map((p) => {
          const b = h('button', { class: `chip member ${poles.has(p.key) ? 'on' : ''}`, vars: { '--c': p.color } }, h('i', {}), p.name);
          b.addEventListener('click', () => (poles.has(p.key) ? poles.delete(p.key) : poles.add(p.key), b.classList.toggle('on')));
          return b;
        })),
        h('h5', {}, 'Tiers spéciaux (cumulables)'),
        h('div', { class: 'chips' }, ...SPECIALS.map((x) => {
          const b = h('button', { class: `chip member ${specials.has(x.key) ? 'on' : ''}`, vars: { '--c': x.color } }, h('i', {}), x.name);
          b.addEventListener('click', () => (specials.has(x.key) ? specials.delete(x.key) : specials.add(x.key), b.classList.toggle('on')));
          return b;
        })),
        h('h5', {}, 'Accès en plus (sur sélection)'),
        h('div', { class: 'chips' }, ...Object.entries(PLACES).map(([k, p]) => {
          const b = h('button', { class: `chip member ${grants.has(k) ? 'on' : ''}`, vars: { '--c': '#ffd76b' } }, h('i', {}), p.name);
          b.addEventListener('click', () => (grants.has(k) ? grants.delete(k) : grants.add(k), b.classList.toggle('on')));
          return b;
        })),
        a.admin?.idDoc || a.admin?.charter ? h('div', { class: 'quicks' }, fileChip(a.admin.idDoc, '🪪 Pièce d’identité'), fileChip(a.admin.charter, '✍️ Charte')) : null,
        h('button', { class: 'btn primary full', onclick: async () => {
          try {
            await api.accounts.update(a.id, { name: name.value.trim(), email: email.value.trim(), tier: Number(tier.value), status: status.value, poles: [...poles], grants: [...grants], specials: [...specials], ...(pin.value ? { pin: pin.value } : {}) });
            toast('Compte mis à jour', 'ok');
            await ctx.reloadAccounts();
          } catch (e) {
            toast(e.message, 'error');
          }
        } }, 'Enregistrer'));
    };
    const nf = { name: h('input', { type: 'text', placeholder: 'Nom' }), email: h('input', { type: 'email', placeholder: 'e-mail Google (facultatif)' }), tier: h('select', {}, ...TIERS.map((t) => h('option', { value: t.tier, selected: t.tier === 3 }, t.name))), pin: h('input', { type: 'password', inputmode: 'numeric', placeholder: 'code de 4 à 8 chiffres' }) };
    return [
      h('h4', { class: 'sec' }, 'Comptes'),
      ...accs.map(row),
      h('details', { class: 'card' }, h('summary', {}, icon('plus', 14), h('b', {}, 'Créer un compte à la main')), h('div', { class: 'two' }, nf.name, nf.email), h('div', { class: 'two' }, nf.tier, nf.pin), h('button', { class: 'btn soft full', onclick: async () => {
        try {
          await api.accounts.create({ name: nf.name.value.trim(), email: nf.email.value.trim(), tier: Number(nf.tier.value), pin: nf.pin.value || undefined });
          await ctx.reloadAccounts();
        } catch (e) {
          toast(e.message, 'error');
        }
      } }, 'Créer')),
      h('h4', { class: 'sec' }, 'Matrice des accès'),
      h('p', { class: 'muted small' }, 'Qui entre où. Le tier 1 a toujours accès et lui seul peut modifier (sauf sa propre fiche dans sa maison de pôle). « Clé » = le code d’accès est demandé en plus. Les pôles cochés donnent accès au tier 3 de ces pôles ; les tiers spéciaux (Camarade, Expert tech, Ingé…) se règlent sur chaque compte. Les agents Claude ont les droits du tier 1.'),
      matrixEditor(),
    ];
  }
  function matrixEditor() {
    const m = structuredClone(state.session?.matrix || {});
    const rows = Object.entries(PLACES).map(([k, p]) => {
      const r = rulesFor(k, m);
      m[k] = { tiers: [...r.tiers], poles: [...(r.poles || [])], specials: [...(r.specials || [])], key: Boolean(r.key), select: Boolean(r.select) };
      const cb = (on, fn, label, dis) => h('label', { class: `mx-cb ${dis ? 'dis' : ''}` }, h('input', { type: 'checkbox', checked: on, disabled: dis, onchange: (e) => fn(e.target.checked) }), label);
      const toggleTier = (t) => (on) => {
        const s = new Set(m[k].tiers);
        on ? s.add(t) : s.delete(t);
        m[k].tiers = [...s].sort();
      };
      const polesSel = h('select', { class: 'mini-select', multiple: true, size: 1, title: 'Pôles admis au tier 3 (Ctrl + clic)' }, ...POLES.map((pl) => h('option', { value: pl.key, selected: m[k].poles.includes(pl.key) }, pl.name)));
      polesSel.addEventListener('change', () => (m[k].poles = [...polesSel.selectedOptions].map((o) => o.value)));
      return h('div', { class: 'mx-row' }, h('b', {}, p.name), cb(true, () => {}, 'T1', true), cb(m[k].tiers.includes(2), toggleTier(2), 'T2'), cb(m[k].tiers.includes(3), toggleTier(3), 'T3'), cb(m[k].key, (on) => (m[k].key = on), 'Clé'), polesSel, m[k].specials.length ? h('small', { class: 'muted' }, `+ ${m[k].specials.map((x) => SPECIALS.find((y) => y.key === x)?.name || x).join(', ')}`) : null);
    });
    return h('div', { class: 'matrix' }, ...rows, h('button', { class: 'btn primary full', onclick: async () => {
      try {
        state.session = await api.accounts.setMatrix(m);
        ctx.onSession(state.session);
        toast('Accès enregistrés', 'ok');
      } catch (e) {
        toast(e.message, 'error');
      }
    } }, 'Enregistrer les accès'));
  }

  // Journal (logs) : qui a fait quoi, quand.
  function journal() {
    const q = h('input', { type: 'search', placeholder: 'Filtrer (nom, action…)', value: state.logQ || '' });
    const box = h('div', { class: 'logs' }, emptyState('Chargement…'));
    const load = () =>
      api.logs.list({ q: q.value }).then((l) => {
        box.replaceChildren(...l.slice(0, 300).map((x) => h('div', { class: 'log' }, h('small', {}, fmtDT(x.at)), h('b', {}, x.who), x.tier ? tierBadge(x.tier) : null, h('span', { class: 'act' }, x.action), h('span', { class: 'det' }, x.detail))));
        if (!l.length) box.replaceChildren(emptyState('Rien dans le journal.'));
      }, (e) => box.replaceChildren(emptyState(e.message)));
    q.addEventListener('input', () => {
      state.logQ = q.value;
      clearTimeout(q._t);
      q._t = setTimeout(load, 250);
    });
    load();
    return [h('div', { class: 'add-task' }, icon('search', 15), q, h('button', { class: 'btn soft', onclick: () => api.logs.export().then((f) => toast(typeof f === 'string' ? `Exporté : ${f}` : 'Exporté', 'ok')) }, 'Exporter CSV')), box];
  }

  // =====================================================================
  // BANQUE
  // =====================================================================
  function bank(panel, sub, d) {
    const tab = tabbed(['board', 'ledger', 'charts', 'grants', 'accounts', 'todo'], 'board');
    const ledger = reg().ledger || [];
    const S = ledgerSummary(ledger);
    let body;
    if (tab === 'board') {
      const deps = Object.entries(S.byAcc).filter(([c]) => ACCOUNTS.find((a) => a[0] === c)?.[2] === 'depense').sort((a, b) => b[1] - a[1]);
      body = [
        h('div', { class: 'kpis' }, h('div', {}, h('b', {}, eur(S.rec)), h('span', {}, 'recettes')), h('div', {}, h('b', {}, eur(S.dep)), h('span', {}, 'dépenses')), h('div', { class: S.solde < 0 ? 'warn' : '' }, h('b', {}, eur(S.solde)), h('span', {}, 'solde'))),
        h('h4', { class: 'sec' }, 'Recettes et dépenses, 6 derniers mois'),
        ledger.length ? barChart(h, { labels: S.months.map((m) => new Date(`${m}-15`).toLocaleDateString('fr-FR', { month: 'short' })), series: [{ name: 'Recettes', values: S.recM, color: '#3987e5' }, { name: 'Dépenses', values: S.depM, color: '#d95926' }] }) : emptyState('Aucune écriture : ajoute-les dans l’onglet « Écritures » ou demande à Claude de les importer du tableau de bord.'),
        deps.length ? h('h4', { class: 'sec' }, 'Dépenses par compte') : null,
        deps.length ? barChart(h, { labels: deps.map(([c]) => c), series: [{ name: 'Dépenses', values: deps.map(([, v]) => v), color: '#d95926' }] }) : null,
        h('p', { class: 'muted small' }, 'Le même résumé flotte en hologramme au-dessus de la banque.'),
      ];
    } else if (tab === 'ledger') {
      const f = { date: h('input', { type: 'date', value: today() }), label: h('input', { type: 'text', placeholder: 'Libellé (ex. Location salle 93Mesures)' }), account: h('select', {}, ...ACCOUNTS.map(([c, n, t]) => h('option', { value: c }, `${c} · ${n} (${t === 'recette' ? 'recette' : 'dépense'})`))), amount: h('input', { type: 'number', step: '0.01', placeholder: 'Montant €' }), project: h('input', { type: 'text', placeholder: 'Projet / pôle (facultatif)' }) };
      let piece = null;
      const pieceBtn = h('button', { class: 'quick', type: 'button', onclick: async () => {
        piece = await upload('facture', '.pdf,image/*');
        if (piece) pieceBtn.lastChild.textContent = piece.name;
      } }, icon('file', 13), 'Pièce justificative');
      const sorted = [...ledger].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
      body = [
        h('p', { class: 'muted' }, 'Structure comptable : chaque écriture est rangée dans un compte du plan comptable associatif (classe 6 = charges, classe 7 = produits), avec sa pièce justificative.'),
        h('div', { class: 'add-gear' }, h('div', { class: 'two' }, f.date, f.amount), f.label, f.account, f.project, h('div', { class: 'quicks' }, pieceBtn), h('button', { class: 'btn soft full', onclick: async () => {
          const amount = Number(f.amount.value);
          if (!f.label.value.trim() || !amount) return toast('Libellé et montant obligatoires', 'error');
          const acc = ACCOUNTS.find((a) => a[0] === f.account.value);
          await upsert('ledger', { date: f.date.value, label: f.label.value.trim(), account: acc[0], type: acc[2], amount: Math.abs(amount), project: f.project.value.trim(), piece: piece?.id || null });
          f.label.value = f.amount.value = '';
          piece = null;
        } }, icon('plus', 14), 'Passer l’écriture')),
        ...sorted.slice(0, 200).map((e) =>
          h('div', { class: 'gear' },
            h('span', { class: 'kind', vars: { '--k': e.type === 'recette' ? '#3987e5' : '#d95926' } }, icon(e.type === 'recette' ? 'plus' : 'x', 13)),
            h('div', { class: 'grow' }, h('b', {}, e.label), h('small', {}, [fmtDate(e.date), `${e.account} · ${accName(e.account)}`, e.project].filter(Boolean).join(' · '))),
            h('span', { class: `price-tag ${e.type === 'recette' ? 'in' : 'out'}` }, `${e.type === 'recette' ? '+' : '−'}${eur(e.amount)}`),
            e.piece ? h('button', { class: 'icon-btn tiny', title: 'Pièce justificative', onclick: () => api.files.open(e.piece) }, icon('file', 13)) : null,
            h('button', { class: 'icon-btn tiny', title: 'Supprimer', onclick: () => remove('ledger', e.id) }, icon('trash', 13)))),
        ledger.length ? null : emptyState('Aucune écriture.'),
      ];
    } else if (tab === 'charts') body = sheetCharts(sub);
    else if (tab === 'grants') body = grants();
    else if (tab === 'accounts') body = [h('div', { class: 'quicks' }, ...['tableau de bord', 'budget previsionel|budget previsionnel', 'mensualit', 'suivie du materiel'].map((re) => {
      const n = findByName(new RegExp(re));
      return n ? h('button', { class: 'quick', onclick: () => openFile(n) }, kindIcon(n.kind, 15), n.name) : null;
    })), h('div', { class: 'files' }, ...sub.items.map((n) => fileRow(n, false)))];
    else {
      const all = sub.items.flatMap((n) => tasksUnder(n));
      body = [addTaskForm(sub.items.map((n) => ({ id: n.id, label: n.name.slice(0, 28) }))), all.length ? null : emptyState('Aucune tâche.'), ...all.map((t) => taskRow(t, { showPlace: true }))];
    }
    panelLayout(panel, {
      kicker: [crumb(d.name, d.id), crumb(`${LANDMARK_ICON.bank} Banque`)],
      title: 'Banque — budget de l’asso',
      color: '#2fd17a',
      actions: [btn('sparkles', 'Faire le point budget', () => askClaude('Lis les documents de budget (BUDGET ASSO, tableau de bord des dépenses, budgets prévisionnels) et fais le point : dépenses, recettes, écarts, ce qu’il manque. Si les écritures de la banque (list_registry ledger) sont vides, propose de les importer depuis le tableau de bord en les classant dans le plan comptable associatif (save_registry_item ledger).', d.id), 'claude')],
      tabs: [{ key: 'board', label: 'Tableau de bord' }, { key: 'ledger', label: 'Écritures', count: ledger.length }, { key: 'charts', label: 'Graphiques' }, { key: 'grants', label: 'Subventions' }, { key: 'accounts', label: 'Documents', count: sub.items.length }, { key: 'todo', label: 'À faire' }],
      body,
    });
  }

  // Graphiques des Sheets du dossier budget, choisis à la sélection (par défaut : le tableau de bord).
  function sheetCharts(sub) {
    const sheets = [];
    for (const it of sub.items) walk(it, (n) => (n.kind === 'sheet' || n.kind === 'pdf') && sheets.push(n));
    if (!sheets.length) return [emptyState('Aucun Sheet ni PDF dans le dossier budget.')];
    const def = sheets.find((n) => /tableau de bord/.test(norm(n.name))) || sheets.find((n) => n.kind === 'sheet') || sheets[0];
    const cur = sheets.find((n) => n.id === state.chartSheet) || def;
    const sel = h('select', { onchange: (e) => ((state.chartSheet = e.target.value), (state.chartData = null), rerender()) }, ...sheets.map((n) => h('option', { value: n.id, selected: n.id === cur.id }, `${n.kind === 'pdf' ? '📄' : '📊'} ${n.name}`)));
    const out = [field('Document', sel)];
    if (cur.kind === 'pdf') return [...out, h('p', { class: 'muted' }, 'Un PDF ne se transforme pas en graphique : il s’ouvre dans la visionneuse.'), h('button', { class: 'btn primary', onclick: () => openFile(cur) }, icon('open', 14), 'Ouvrir le PDF')];
    if (!state.status.google) return [...out, h('div', { class: 'notice' }, 'Connecte Google Drive (Réglages) pour lire les Sheets et en tirer les graphiques.'), h('button', { class: 'btn soft', onclick: () => openFile(cur) }, icon('open', 14), 'Ouvrir le Sheet')];
    const data = state.chartData?.id === cur.id ? state.chartData : null;
    if (!data) {
      api.drive.read(cur.id).then((r) => {
        state.chartData = { id: cur.id, rows: parseCsv(r.text || '') };
        rerender();
      }, (e) => {
        state.chartData = { id: cur.id, rows: [], error: e.message };
        rerender();
      });
      return [...out, emptyState('Lecture du Sheet…')];
    }
    if (data.error || !data.rows.length) return [...out, emptyState(data.error || 'Sheet vide.')];
    // En-tête = première ligne qui a au moins 2 cellules remplies
    const hi = data.rows.findIndex((r) => r.filter((c) => c.trim()).length >= 2);
    const head = data.rows[hi] || [];
    const rows = data.rows.slice(hi + 1).filter((r) => r.some((c) => c.trim()));
    const numCols = head.map((_, i) => i).filter((i) => rows.filter((r) => toNumber(r[i]) !== null).length >= Math.max(2, rows.length * 0.4));
    const labCol = head.findIndex((_, i) => !numCols.includes(i) && rows.some((r) => (r[i] || '').trim()));
    if (!numCols.length) return [...out, emptyState('Pas de colonne de chiffres reconnue dans ce Sheet.')];
    const pickCols = state.chartCols?.filter((i) => numCols.includes(i)) || numCols.slice(0, 2);
    const colsSel = h('div', { class: 'chips' }, ...numCols.map((i) => h('button', { class: `chip ${pickCols.includes(i) ? 'on-chip' : ''}`, onclick: () => {
      const s = new Set(pickCols);
      s.has(i) ? s.delete(i) : s.add(i);
      state.chartCols = [...s].slice(0, 4);
      rerender();
    } }, head[i] || `Col. ${i + 1}`)));
    const lines = rows.filter((r) => pickCols.some((i) => toNumber(r[i]))).slice(0, 18);
    return [
      ...out,
      h('p', { class: 'muted small' }, 'Colonnes affichées (4 max) :'),
      colsSel,
      barChart(h, { labels: lines.map((r) => (labCol >= 0 ? r[labCol] : '') || '—'), series: pickCols.map((i, k) => ({ name: head[i] || `Col. ${i + 1}`, values: lines.map((r) => toNumber(r[i]) || 0), color: ['#3987e5', '#d95926', '#199e70', '#c98500'][k] })) }),
      h('button', { class: 'link', onclick: () => openFile(cur) }, 'Ouvrir le Sheet'),
    ];
  }

  // Subventions (déplacées de l'école vers la banque)
  function grants() {
    const manual = (reg().trainings || []).filter((t) => t.kind === 'subvention');
    const known = new Set(manual.map((t) => t.url));
    const drive = driveMatches(/subvention|fsdie|iddac|prix jeune asso|financement|mecenat/).filter((n) => !known.has(n.url));
    const title = h('input', { type: 'text', placeholder: 'Dossier de subvention' });
    const link = h('input', { type: 'url', placeholder: 'Lien' });
    return [
      h('p', { class: 'muted' }, 'Les dossiers de subvention : modèles, calendrier, dossiers déposés. Les subventions reçues se passent en écriture au compte 74.'),
      h('div', { class: 'files' }, ...manual.map((t) => h('div', { class: 'training' }, h('span', { class: 'kind', vars: { '--k': '#2fd17a' } }, icon('flag', 14)), h('div', { class: 'grow' }, h('b', {}, t.title), t.desc ? h('p', {}, t.desc) : null), t.url ? h('button', { class: 'icon-btn tiny', title: 'Ouvrir', onclick: () => (/google\.com/.test(t.url) ? api.openFile(t.url, t.title) : api.openUrl(t.url)) }, icon('open', 13)) : null, h('button', { class: 'icon-btn tiny', title: 'Retirer', onclick: () => remove('trainings', t.id) }, icon('trash', 13))))),
      drive.length ? h('h4', { class: 'sec' }, 'Aussi dans le Drive') : null,
      drive.length ? h('div', { class: 'files' }, ...drive.map((n) => fileRow(n, false))) : null,
      h('div', { class: 'add-gear' }, title, link, h('button', { class: 'btn soft full', onclick: async () => {
        if (!title.value.trim()) return;
        await upsert('trainings', { kind: 'subvention', title: title.value.trim(), url: link.value.trim() || null, source: 'manuel' });
        title.value = link.value = '';
      } }, icon('plus', 14), 'Ajouter')),
      h('button', { class: 'btn claude full', onclick: () => askClaude('Cherche sur le web les subventions accessibles à une association musicale à Paris / Villejuif en ce moment (CNM, DRAC, Région, Ville, SACEM, FSDIE…). Ajoute les plus utiles à la banque (save_registry_item trainings, kind « subvention ») avec leur lien, et leurs dates limites au calendrier administratif (adminCal).') }, icon('sparkles', 14), 'Trouver des subventions'),
    ];
  }

  // =====================================================================
  // ÉCOLE : défis quotidiens (le reste de l'école est dans interiors.js)
  // =====================================================================
  function quizBody() {
    if (!state.quiz) {
      api.quiz.get().then((q) => ((state.quiz = q), rerender()));
      return [emptyState('Chargement des défis…')];
    }
    const q = state.quiz;
    const done = q.questions.filter((x) => x.result).length;
    return [
      h('div', { class: 'quiz-head' }, h('div', {}, h('b', {}, `Défis du ${new Date(`${q.day}T12:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}`), h('small', {}, `${done}/${q.questions.length} répondus · une question par thème, 10 points la bonne réponse`)), h('span', { class: 'score-pill' }, `${q.me} pts`)),
      me() ? null : h('div', { class: 'notice' }, 'Connecte-toi pour gagner des points.'),
      ...q.questions.map((x) => {
        const th = THEMES.find((t) => t.key === x.theme) || { name: x.theme, color: '#9aa0b4', icon: '❓' };
        return h('div', { class: `quiz ${x.result ? (x.result.ok ? 'ok' : 'ko') : ''}`, vars: { '--c': th.color } },
          h('small', { class: 'theme' }, `${th.icon} ${th.name}`),
          h('b', {}, x.q),
          h('div', { class: 'choices' }, ...x.choices.map((c, i) => h('button', {
            class: x.result ? (i === x.result.answer ? 'good' : i === x.result.choice ? 'bad' : '') : '',
            disabled: Boolean(x.result) || !me(),
            onclick: async () => {
              try {
                state.quiz = await api.quiz.answer(x.id, i);
                const r = state.quiz.questions.find((y) => y.id === x.id)?.result;
                toast(r?.ok ? 'Bonne réponse ! +10 points' : 'Raté…', r?.ok ? 'ok' : '');
                rerender();
              } catch (e) {
                toast(e.message, 'error');
              }
            },
          }, c))),
          x.result ? h('p', { class: 'explain' }, x.result.explain) : null);
      }),
      h('h4', { class: 'sec' }, 'Classement'),
      q.leaderboard.length ? h('div', { class: 'board-list' }, ...q.leaderboard.map((l, i) => h('div', { class: 'gear' }, h('span', { class: 'rank' }, i < 3 ? ['🥇', '🥈', '🥉'][i] : `${i + 1}`), h('div', { class: 'grow' }, h('b', {}, l.name)), h('span', { class: 'price-tag' }, `${l.points} pts`)))) : emptyState('Personne n’a encore joué.'),
      h('button', { class: 'btn claude full', onclick: () => askClaude('Ajoute 7 nouvelles questions aux défis de l’école (save_registry_item quizQuestions), une par thème (son, asso, finances, auto, secu, event, culture), à choix multiples (4 choix, answer = index de la bonne réponse, explain = courte explication). Vérifie bien que chaque bonne réponse est exacte.') }, icon('sparkles', 14), 'Demander de nouvelles questions à Claude'),
    ];
  }

  // =====================================================================
  // BIBLIOTHÈQUE → CERVEAU
  // =====================================================================
  function brain(panel) {
    const tab = tabbed(['memories', 'skills', 'ext', 'archives'], 'memories');
    let body;
    const mems = [...(reg().memories || [])].reverse();
    if (tab === 'memories') {
      const t = h('textarea', { rows: 2, placeholder: 'Une mémoire courte (décision, préférence de l’équipe, info durable)…' });
      body = [
        h('p', { class: 'muted' }, 'Le cerveau de la ville : ce que Claude retient d’une conversation à l’autre, compressé en notes courtes. Il les relit à chaque fois qu’on lui parle. Jamais de mot de passe ni de pièce d’identité ici.'),
        h('div', { class: 'add-gear' }, t, h('div', { class: 'two' }, h('button', { class: 'btn soft', onclick: async () => {
          if (!t.value.trim()) return;
          await upsert('memories', { text: t.value.trim().slice(0, 600), at: new Date().toISOString(), by: me()?.name || '—', tags: [] });
          t.value = '';
        } }, icon('plus', 14), 'Mémoriser'), h('button', { class: 'btn claude', onclick: () => askClaude('Compresse notre conversation et ce que tu sais d’important sur l’asso en 3 à 8 mémoires courtes et utiles (save_memory), sans doublon avec tes mémoires existantes.') }, icon('sparkles', 14), 'Compresser la conversation'))),
        ...mems.map((m) => h('div', { class: 'memory' }, h('span', { class: 'kind', vars: { '--k': '#ff5577' } }, '🧠'), h('div', { class: 'grow' }, h('p', {}, m.text), h('small', {}, `${m.by || 'Claude'} · ${fmtDT(m.at)}`)), h('button', { class: 'icon-btn tiny', title: 'Oublier', onclick: () => remove('memories', m.id) }, icon('trash', 13)))),
        mems.length ? null : emptyState('Pas encore de mémoire.'),
      ];
    } else if (tab === 'skills') {
      body = [
        h('p', { class: 'muted' }, 'Ce que Claude sait faire dans la ville (l’université forme des agents spécialisés à partir de ces compétences).'),
        h('div', { class: 'skills' }, ...(state.tools || []).map((t) => h('div', { class: 'skill' }, icon('sparkles', 14), h('div', {}, h('b', {}, t.name), h('small', {}, t.description))))),
        h('button', { class: 'btn soft full', onclick: () => select('lm:university') }, '🎓 Aller à l’université des agents'),
      ];
    } else if (tab === 'ext') {
      const st = state.status;
      const ext = (ico, name, on, detail) => h('div', { class: 'row' }, icon(ico, 16), h('div', { class: 'grow' }, h('b', {}, name), h('small', {}, detail)), h('span', { class: `status ${on ? 'on' : ''}` }, on ? 'actif' : 'à connecter'));
      body = [
        ext('sparkles', 'Claude', st.claude, st.settings.model),
        ext('folder', 'Google Drive & Agenda', st.google, st.google ? 'synchro en direct' : 'instantané du Drive'),
        ext('audio', 'Spotify', state.spotify?.web || state.spotify?.api, state.spotify?.api ? `relié : ${state.spotify.api.name}` : state.spotify?.web ? 'lecteur relié' : 'non relié'),
        ext('zap', 'n8n', st.n8n || state.workflows.length, plural(state.workflows.length, 'workflow')),
        ext('bot', 'Agents & routines', true, `${plural((reg().agents || []).length, 'agent')} · ${plural(state.routines.filter((r) => r.enabled).length, 'routine')}`),
        h('button', { class: 'btn soft full', onclick: () => ctx.openDrawer('settings') }, icon('settings', 15), 'Gérer les connexions'),
      ];
    } else {
      // Anciens projets : ils ne sont plus construits dans la ville, on les retrouve ici
      const projects = archivedProjects(state.tree, reg());
      const ids = new Set(projects.map((x) => x.node.id));
      const other = [];
      walk(state.tree, (n, depth) => {
        if (depth >= 1 && n.kind === 'folder' && !ids.has(n.id) && (projectState(n) !== 'active' || /archive/.test(norm(n.name)))) other.push(n);
      });
      const count = (n) => {
        let c = 0;
        walk(n, (x) => x !== n && x.kind !== 'folder' && c++);
        return c;
      };
      body = [
        h('p', { class: 'muted' }, 'Les anciens projets (terminés ou abandonnés) ne sont plus construits dans la ville : ils sont rangés ici, avec leurs documents. Un projet peut revenir en ville à tout moment.'),
        h('h4', { class: 'sec' }, `Projets archivés · ${projects.length}`),
        projects.length
          ? h('div', { class: 'arch-list' }, ...projects.map(({ node, year, state: st }) => h('div', { class: 'arch-row' },
            h('span', { class: 'ico' }, st === 'abandoned' ? '🏚️' : '🏁'),
            h('div', { class: 'grow' }, h('b', {}, node.name), h('small', {}, [year, st === 'abandoned' ? 'abandonné' : 'terminé', `${count(node)} document(s)`].filter(Boolean).join(' · '))),
            h('button', { class: 'icon-btn tiny', title: 'Ouvrir dans le Drive', onclick: () => openFile(node) }, icon('open', 13)),
            h('button', { class: 'icon-btn tiny', title: 'Remettre en ville (Événementiel)', onclick: async () => {
              await upsert('projectZones', { id: node.id, zone: 'event' });
              toast(`« ${node.name} » revient dans l’Événementiel`, 'ok');
            } }, icon('home', 13)))))
          : emptyState('Aucun projet archivé.'),
        other.length ? h('h4', { class: 'sec' }, 'Autres dossiers d’archives') : null,
        other.length ? h('div', { class: 'arch-list' }, ...other.map((n) => h('div', { class: 'arch-row' }, h('span', { class: 'ico' }, '🗄️'), h('div', { class: 'grow' }, h('b', {}, n.name)), h('button', { class: 'icon-btn tiny', title: 'Ouvrir dans le Drive', onclick: () => openFile(n) }, icon('open', 13))))) : null,
      ];
    }
    panelLayout(panel, {
      kicker: [zoneCrumb('info'), crumb('🧠 Bibliothèque')].filter(Boolean),
      title: 'Le cerveau',
      color: '#ff5577',
      actions: [btn('sparkles', 'Point global', () => askClaude('Fais le point global sur le studio : projets en retard, priorités de la semaine, deadlines et ce qu’il manque au business plan.'), 'claude')],
      tabs: [{ key: 'memories', label: 'Mémoires', count: mems.length }, { key: 'skills', label: 'Compétences', count: (state.tools || []).length }, { key: 'ext', label: 'Extensions' }, { key: 'archives', label: 'Archives', count: archivedProjects(state.tree, reg()).length }],
      body,
    });
  }

  // =====================================================================
  // UNIVERSITÉ des agents
  // =====================================================================
  function university(panel) {
    const agents = reg().agents || [];
    const toolNames = (state.tools || []).flatMap((t) => t.name.split(' / ')).filter((n) => /^[a-z_]+$/.test(n));
    const card = (a) => {
      const task = h('input', { type: 'text', placeholder: `Confier une tâche à ${a.name}…` });
      const prompt = h('textarea', { rows: 2, placeholder: 'Consignes particulières de cet agent (facultatif)' }, a.prompt || '');
      const st = state.agentStatus[`agent:${a.id}`];
      return h('details', { class: 'card agent-card', vars: { '--c': a.color || '#9b7bff' } },
        h('summary', {}, h('span', { class: 'bot-dot' }), h('b', {}, a.name), h('small', {}, st || a.mission)),
        h('p', { class: 'muted' }, a.mission),
        h('div', { class: 'chips' }, ...(a.tools || []).map((t) => h('span', { class: 'chip' }, t))),
        h('div', { class: 'add-task' }, icon('send', 15), task, h('button', { class: 'btn soft', onclick: () => {
          if (!task.value.trim()) return;
          askClaude(`En tant qu’orchestrateur, confie à l’agent « ${a.name} » (delegate_to_agent agent_id = ${a.id}) cette tâche : ${task.value.trim()}. Puis fais-moi la synthèse.`);
          task.value = '';
        } }, 'Confier')),
        field('Consignes', prompt),
        h('div', { class: 'two' }, h('button', { class: 'btn soft', onclick: () => upsert('agents', { id: a.id, prompt: prompt.value }).then(() => toast('Agent mis à jour', 'ok')) }, 'Enregistrer'), h('button', { class: 'btn soft', onclick: () => remove('agents', a.id) }, 'Renvoyer')));
    };
    const f = { name: h('input', { type: 'text', placeholder: 'Nom de l’agent' }), mission: h('input', { type: 'text', placeholder: 'Sa tâche précise' }) };
    const pick = new Set(['list_registry', 'save_registry_item', 'add_task', 'list_tasks']);
    return panelLayout(panel, {
      kicker: [zoneCrumb('info'), crumb('🎓 Université')].filter(Boolean),
      title: 'Université des agents',
      color: '#9b7bff',
      actions: [btn('sparkles', 'Orchestrer', () => askClaude('En tant qu’orchestrateur (la tour RED STUDIO), répartis le travail de la semaine entre les agents de l’université : demande à chacun (delegate_to_agent) un point rapide sur son domaine, puis fais-moi une synthèse avec les 5 priorités.'), 'claude')],
      body: [
        h('p', { class: 'muted' }, 'Chaque agent Claude est formé à une tâche précise (ses outils sont limités à son domaine). La bibliothèque est leur salle d’étude, l’orchestrateur c’est la tour RED STUDIO : quand tu demandes quelque chose à Claude, il peut confier une partie du travail à l’agent spécialisé.'),
        h('div', { class: 'orchestra' }, h('span', {}, '🔴'), h('b', {}, 'Orchestrateur : tour RED STUDIO'), h('small', {}, `${plural(agents.length, 'agent')} formés`)),
        ...agents.map(card),
        h('h4', { class: 'sec' }, 'Former un nouvel agent'),
        h('div', { class: 'add-gear' }, f.name, f.mission, h('div', { class: 'chips' }, ...toolNames.map((t) => {
          const b = h('button', { class: `chip member ${pick.has(t) ? 'on' : ''}`, vars: { '--c': '#9b7bff' } }, h('i', {}), t);
          b.addEventListener('click', () => (pick.has(t) ? pick.delete(t) : pick.add(t), b.classList.toggle('on')));
          return b;
        })), h('button', { class: 'btn soft full', onclick: async () => {
          if (!f.name.value.trim() || !f.mission.value.trim()) return toast('Nom et mission obligatoires', 'error');
          await upsert('agents', { name: f.name.value.trim(), mission: f.mission.value.trim(), tools: [...pick], color: ['#9b7bff', '#2fd17a', '#33c6ff', '#ffb020', '#ff6bd5'][agents.length % 5], prompt: '' });
          f.name.value = f.mission.value = '';
        } }, icon('plus', 14), 'Former l’agent')),
      ],
    });
  }

  // =====================================================================
  // CGT
  // =====================================================================
  const GUIDE = [
    ['Avant de partir', ['Pièce d’identité sur toi (un contrôle peut arriver), un peu d’argent liquide, téléphone chargé + batterie externe.', 'Préviens quelqu’un qui ne vient pas : où tu vas, à quelle heure tu comptes rentrer.', 'Repère le parcours déclaré, les rues de sortie et un point de regroupement si le groupe se sépare.', 'Note sur ton bras (au feutre) un numéro d’urgence et celui d’un avocat ou de la permanence juridique du syndicat.']],
    ['Dans le sac', ['Eau et quelque chose à manger.', 'Sérum physiologique (yeux) et mouchoirs.', 'Masque FFP2, lunettes (pas de lentilles), vêtements couvrants confortables et chaussures fermées.', 'Petite trousse de premiers secours, médicaments personnels avec ordonnance.', 'Protections auditives si sono / pétards.']],
    ['Pendant', ['On reste en binôme ou en petit groupe, on ne se perd pas de vue.', 'On suit les consignes du service d’ordre et on reste sur le parcours déclaré.', 'Si ça se tend : on s’éloigne calmement par les côtés, on ne court pas dans la foule.', 'Gaz : on ne frotte pas ses yeux, on se rince à l’eau ou au sérum, on se met à l’air.', 'Personne blessée : on appelle le 112 et on alerte les secouristes de la manif.']],
    ['Tes droits', ['Manifester est une liberté fondamentale ; la manifestation doit être déclarée en préfecture par les organisateurs.', 'En cas de contrôle : reste calme, tu peux demander le motif ; tu n’es pas obligé de donner le code de ton téléphone.', 'En cas de garde à vue : tu as droit à un avocat, à un médecin, à prévenir un proche, et tu peux garder le silence.', 'Ne publie pas de visages de manifestants identifiables sans leur accord.']],
    ['Filmer pour le documentaire', ['Demande l’accord des personnes filmées de près (droit à l’image).', 'Sauvegarde les rushes au plus vite (deux copies), note le lieu et l’heure.', 'Un caméraman ne filme jamais seul : un binôme veille sur lui.']],
  ];
  function cgt(panel) {
    const tab = tabbed(['action', 'write', 'docu', 'luttes', 'guide', 'doc'], 'action');
    const all = reg().actions || [];
    let body;
    if (tab === 'write') body = writings();
    else if (tab === 'luttes') body = luttes();
    else if (tab === 'guide') body = [h('p', { class: 'muted' }, 'Le guide à relire avant chaque départ en manif : équipement, règles de sécurité et droits.'), ...GUIDE.map(([t, l]) => h('details', { class: 'card', open: t === 'Avant de partir' }, h('summary', {}, h('b', {}, t)), h('ul', { class: 'guide' }, ...l.map((x) => h('li', {}, x)))))];
    else return inside.cgt(panel, { extraTabs: true });
    panelLayout(panel, {
      kicker: [zoneCrumb('admin'), crumb(`${LANDMARK_ICON.cgt} CGT`)].filter(Boolean),
      title: 'CGT — actions & documentaires',
      color: '#e1242b',
      actions: [btn('sparkles', 'Préparer une action', () => askClaude('Aide-moi à préparer la prochaine action CGT de l’asso (list_registry actions) : rétroplanning, tâches, matériel, communication et captation pour le documentaire. Ajoute les tâches et les rappels utiles.'), 'claude')],
      tabs: cgtTabs(all),
      body,
    });
  }
  const cgtTabs = (all) => [
    { key: 'action', label: 'Actions', count: all.filter((a) => (a.type || 'action') === 'action').length },
    { key: 'write', label: 'Écriture', count: (reg().writings || []).length },
    { key: 'docu', label: 'Documentaires', count: all.filter((a) => a.type === 'docu').length },
    { key: 'luttes', label: 'Actu des luttes' },
    { key: 'guide', label: 'Guide manif' },
    { key: 'doc', label: 'Documents', count: all.filter((a) => a.type === 'doc').length },
  ];
  // Zone d'écriture partagée : textes (documentaires, notes, tracts), avec historique des versions.
  function writings() {
    const list = [...(reg().writings || [])].sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
    const cur = list.find((w) => w.id === state.writingId);
    if (cur) {
      const title = h('input', { type: 'text', value: cur.title });
      const text = h('textarea', { rows: 16, class: 'writer' }, cur.text || '');
      const note = h('input', { type: 'text', placeholder: 'Ajouter une note / un commentaire…' });
      const save = async () => {
        const versions = [{ at: cur.updatedAt, by: cur.by, text: cur.text }, ...(cur.versions || [])].filter((v) => v.text !== undefined).slice(0, 10);
        await upsert('writings', { id: cur.id, title: title.value.trim() || cur.title, text: text.value, by: me()?.name, updatedAt: new Date().toISOString(), versions });
        toast('Texte enregistré', 'ok');
      };
      return [
        h('button', { class: 'link', onclick: () => ((state.writingId = null), rerender()) }, '← Tous les textes'),
        field('Titre', title),
        text,
        h('div', { class: 'two' }, h('button', { class: 'btn primary', onclick: save }, 'Enregistrer'), h('button', { class: 'btn claude', onclick: () => askClaude(`Relis le texte « ${cur.title} » de la CGT (list_registry writings) et propose une version améliorée et des idées de séquences pour le documentaire.`) }, icon('sparkles', 14), 'Avis de Claude')),
        h('h5', {}, 'Notes'),
        ...(cur.notes || []).map((n) => h('div', { class: 'memory' }, h('div', { class: 'grow' }, h('p', {}, n.text), h('small', {}, `${n.by} · ${fmtDT(n.at)}`)))),
        h('div', { class: 'add-task' }, icon('plus', 15), note, h('button', { class: 'btn soft', onclick: async () => {
          if (!note.value.trim()) return;
          await upsert('writings', { id: cur.id, notes: [...(cur.notes || []), { text: note.value.trim(), by: me()?.name || '—', at: new Date().toISOString() }] });
        } }, 'Noter')),
        (cur.versions || []).length ? h('details', { class: 'card' }, h('summary', {}, h('b', {}, `Versions précédentes (${cur.versions.length})`)), ...cur.versions.map((v) => h('div', { class: 'gear' }, h('div', { class: 'grow' }, h('b', {}, `${v.by || '—'} · ${fmtDT(v.at)}`), h('small', {}, (v.text || '').slice(0, 120))), h('button', { class: 'btn soft', onclick: () => (text.value = v.text || '') }, 'Restaurer')))) : null,
      ];
    }
    const t = h('input', { type: 'text', placeholder: 'Titre (ex. Docu — la grève des intermittents)' });
    const kind = h('select', {}, ...['Documentaire', 'Note', 'Tract', 'Compte rendu'].map((k) => h('option', { value: k }, k)));
    return [
      h('p', { class: 'muted' }, 'Zone d’écriture partagée : écriture des documentaires, notes, tracts. Chaque enregistrement garde la version d’avant.'),
      ...list.map((w) => h('button', { class: 'news', vars: { '--c': '#e1242b' }, onclick: () => ((state.writingId = w.id), rerender()) }, h('div', { class: 'news-top' }, h('span', { class: 'src' }, w.kind || 'Texte'), h('small', {}, `${w.by || '—'} · ${fmtDT(w.updatedAt)}`)), h('b', {}, w.title), h('p', {}, (w.text || '').slice(0, 140)))),
      list.length ? null : emptyState('Aucun texte.'),
      h('div', { class: 'add-gear' }, h('div', { class: 'two' }, t, kind), h('button', { class: 'btn soft full', onclick: async () => {
        if (!t.value.trim()) return;
        const w = await upsert('writings', { title: t.value.trim(), kind: kind.value, text: '', by: me()?.name, updatedAt: new Date().toISOString(), notes: [], versions: [] });
        state.writingId = w?.id;
        rerender();
      } }, icon('plus', 14), 'Nouveau texte')),
    ];
  }
  function luttes() {
    const items = (state.news?.items || []).filter((it) => (state.newsSources || []).find((x) => x.id === it.source)?.group === 'luttes');
    const picks = [...(reg().luttes || [])].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    const f = { title: h('input', { type: 'text', placeholder: 'Titre (film, livre, docu)' }), kind: h('select', {}, ...['film', 'livre', 'docu', 'BD', 'podcast'].map((k) => h('option', { value: k }, k))), date: h('input', { type: 'date' }), url: h('input', { type: 'url', placeholder: 'Lien' }) };
    const src = (id) => (state.newsSources || []).find((x) => x.id === id) || { name: id, color: '#e1242b' };
    return [
      h('h4', { class: 'sec' }, 'Sorties de films et de livres sur les luttes'),
      ...picks.map((p) => h('div', { class: 'training' }, h('span', { class: 'kind', vars: { '--k': '#e1242b' } }, p.kind === 'livre' ? '📖' : p.kind === 'film' || p.kind === 'docu' ? '🎬' : '🎧'), h('div', { class: 'grow' }, h('b', {}, p.title), h('small', {}, [p.kind, fmtDate(p.date), p.by].filter(Boolean).join(' · ')), p.note ? h('p', {}, p.note) : null), p.url ? h('button', { class: 'icon-btn tiny', onclick: () => api.openUrl(p.url) }, icon('open', 13)) : null, h('button', { class: 'icon-btn tiny', onclick: () => remove('luttes', p.id) }, icon('trash', 13)))),
      picks.length ? null : emptyState('Rien encore : ajoute une sortie ou demande à Claude.'),
      h('div', { class: 'add-gear' }, h('div', { class: 'three' }, f.title, f.kind, f.date), f.url, h('button', { class: 'btn soft full', onclick: async () => {
        if (!f.title.value.trim()) return;
        await upsert('luttes', { title: f.title.value.trim(), kind: f.kind.value, date: f.date.value || null, url: f.url.value.trim() || null, by: me()?.name });
        f.title.value = f.url.value = '';
      } }, icon('plus', 14), 'Ajouter')),
      h('button', { class: 'btn claude full', onclick: () => askClaude('Cherche sur le web les sorties récentes et à venir (films, documentaires, livres, BD) qui parlent des luttes sociales, syndicales et écologistes en France. Ajoute les 6 plus intéressantes à la CGT (save_registry_item luttes {title, kind, date, url, note}) avec une phrase de présentation.') }, icon('sparkles', 14), 'Chercher les sorties avec Claude'),
      h('h4', { class: 'sec' }, 'Actualités des luttes'),
      ...items.slice(0, 30).map((it) => h('button', { class: 'news', vars: { '--c': src(it.source).color }, onclick: () => api.openUrl(it.link) }, h('div', { class: 'news-top' }, h('span', { class: 'src' }, src(it.source).name), h('small', {}, it.date ? new Date(it.date).toLocaleDateString('fr-FR') : '')), h('b', {}, it.title))),
      items.length ? null : emptyState(state.news?.demo ? 'Les médias se lisent dans l’application Windows.' : 'Pas encore lu : actualise le bureau de journaliste.'),
    ];
  }

  // =====================================================================
  // MAGASIN : chaque appareil a sa preuve d'obtention (facture / PDF), sinon il attend la validation
  // =====================================================================
  function shop(panel) {
    const tab = tabbed(['owned', 'pending', 'wanted'], 'owned');
    const gear = reg().gear || [];
    const st = (g) => (g.status === 'wanted' ? 'wanted' : g.status === 'owned' && (g.proof || g.proofNode) ? 'owned' : g.status === 'owned' && g.validated ? 'owned' : g.status === 'owned' || g.status === 'pending' ? 'pending' : g.status);
    const list = gear.filter((g) => st(g) === tab);
    const cats = [...new Set(list.map((g) => g.category || 'Divers'))];
    const total = gear.filter((g) => g.status === 'wanted').reduce((s, g) => s + (Number(g.price) || 0) * (Number(g.qty) || 1), 0);
    const pdfs = [];
    walk(state.tree, (n) => (n.kind === 'pdf' || /facture|devis|achat/.test(norm(n.name))) && pdfs.push(n));
    const proofSel = (g) => {
      const s = h('select', { class: 'mini-select', title: 'Relier une facture du Drive' }, h('option', { value: '' }, '— facture du Drive —'), ...pdfs.map((n) => h('option', { value: n.id, selected: g.proofNode === n.id }, n.name.slice(0, 40))));
      s.addEventListener('change', () => upsert('gear', { id: g.id, proofNode: s.value || null }));
      return s;
    };
    const row = (g) => {
      const proofNode = g.proofNode && findNode(state.tree, g.proofNode);
      return h('div', { class: `gear ${g.dispo && g.dispo !== 'Dispo' ? 'warn' : ''}` },
        h('div', { class: 'grow' },
          h('b', {}, g.name, g.qty > 1 ? h('span', { class: 'qty' }, `×${g.qty}`) : null),
          h('small', {}, [g.dispo, g.note, g.from, g.price ? `${g.price} €` : null, g.proof ? '🧾 facture déposée' : proofNode ? `🧾 ${proofNode.name}` : tab !== 'wanted' ? 'sans preuve d’obtention' : null].filter(Boolean).join(' · '))),
        tab !== 'wanted' ? proofSel(g) : null,
        g.proof ? h('button', { class: 'icon-btn tiny', title: 'Voir la facture', onclick: () => api.files.open(g.proof) }, icon('file', 13)) : proofNode ? h('button', { class: 'icon-btn tiny', title: 'Voir la facture', onclick: () => openFile(proofNode) }, icon('file', 13)) : null,
        tab !== 'wanted' ? h('button', { class: 'icon-btn tiny', title: 'Déposer la facture / la preuve', onclick: async () => {
          const meta = await upload('facture', '.pdf,image/*');
          if (meta) upsert('gear', { id: g.id, proof: meta.id, status: 'owned' });
        } }, icon('plus', 13)) : null,
        tab === 'pending' && me()?.tier === 1 ? h('button', { class: 'icon-btn tiny', title: 'Valider sans facture (tier 1)', onclick: () => upsert('gear', { id: g.id, status: 'owned', validated: true, validatedBy: me().name }) }, icon('check', 13)) : null,
        tab === 'wanted' ? h('button', { class: 'icon-btn tiny', title: 'Acheté → en attente de la facture', onclick: () => upsert('gear', { id: g.id, status: 'pending', dispo: 'Dispo' }) }, icon('check', 14)) : null,
        h('button', { class: 'icon-btn tiny', title: 'Supprimer', onclick: () => remove('gear', g.id) }, icon('trash', 13)));
    };
    const f = { name: h('input', { type: 'text', placeholder: 'Nom du matériel' }), cat: h('input', { type: 'text', placeholder: 'Catégorie', value: 'Son' }), qty: h('input', { type: 'text', placeholder: 'Qté', value: '1' }), price: h('input', { type: 'text', placeholder: 'Prix €' }), status: h('select', {}, h('option', { value: 'owned' }, 'On l’a (avec facture)'), h('option', { value: 'wanted', selected: tab === 'wanted' }, 'À acheter')) };
    let proof = null;
    const proofBtn = h('button', { class: 'quick', type: 'button', onclick: async () => {
      proof = await upload('facture', '.pdf,image/*');
      if (proof) proofBtn.lastChild.textContent = `🧾 ${proof.name}`;
    } }, icon('file', 13), 'Joindre la facture / preuve (PDF, photo)');
    panelLayout(panel, {
      kicker: [zoneCrumb('music'), crumb(`${LANDMARK_ICON.shop} Magasin de musique`)].filter(Boolean),
      title: 'Matériel',
      color: '#e36b1a',
      actions: [btn('sparkles', 'Conseils d’achat', () => askClaude('Regarde notre matériel (list_registry gear) et notre liste d’achats : quelles priorités pour le studio, l’événementiel et la radio ? Propose des modèles et prix, puis mets à jour les prix dans la liste.'), 'claude')],
      tabs: [{ key: 'owned', label: 'On a (prouvé)', count: gear.filter((g) => st(g) === 'owned').length }, { key: 'pending', label: 'En attente de validation', count: gear.filter((g) => st(g) === 'pending').length }, { key: 'wanted', label: 'À acheter', count: gear.filter((g) => g.status === 'wanted').length }],
      body: [
        h('p', { class: 'muted' }, tab === 'pending' ? 'Matériel déclaré sans preuve d’obtention : relie une facture du Drive ou dépose-la, ou le Bureau le valide.' : tab === 'owned' ? 'Chaque appareil est relié à sa facture ou à une preuve d’obtention (PDF, photo).' : 'Liste d’achats (besoins du plan de développement + ajouts).'),
        tab === 'wanted' && total ? h('p', { class: 'muted' }, `Budget estimé : ${total.toLocaleString('fr-FR')} €`) : null,
        h('div', { class: 'add-gear' }, f.name, h('div', { class: 'three' }, f.cat, f.qty, f.price), f.status, h('div', { class: 'quicks' }, proofBtn), h('button', { class: 'btn soft full', onclick: async () => {
          if (!f.name.value.trim()) return;
          const wanted = f.status.value === 'wanted';
          await upsert('gear', { name: f.name.value.trim(), category: f.cat.value.trim() || 'Divers', qty: Number(f.qty.value) || 1, price: f.price.value ? Number(f.price.value) : null, status: wanted ? 'wanted' : proof ? 'owned' : 'pending', dispo: wanted ? null : 'Dispo', proof: proof?.id || null, from: me()?.name });
          if (!wanted && !proof) toast('Sans facture, le matériel attend la validation du Bureau.');
          f.name.value = '';
          proof = null;
        } }, icon('plus', 14), 'Ajouter')),
        ...cats.map((c) => h('section', { class: 'group' }, h('div', { class: 'group-head' }, h('span', {}, c), h('small', {}, list.filter((g) => (g.category || 'Divers') === c).length)), ...list.filter((g) => (g.category || 'Divers') === c).map(row))),
        list.length ? null : emptyState('Rien ici.'),
      ],
    });
  }

  // =====================================================================
  // LABEL, ARTISTES, BEATMAKERS
  // =====================================================================
  const artistCard = (a, { fl } = {}) => {
    const photo = state.artistPhotos?.[a.id];
    return h('button', { class: `artist-card ${fl ? 'fl' : ''}`, onclick: () => select(`artist:${a.id}`) },
      h('span', { class: 'ph', style: photo ? { backgroundImage: `url("${photo}")` } : {} }, photo ? null : fl ? '🍓' : (a.name || '?')[0]),
      h('b', {}, a.name),
      h('small', {}, [a.role, a.level].filter(Boolean).join(' · ') || 'à classer'),
      a.career ? h('em', {}, a.career.slice(0, 80)) : null);
  };
  function label(panel) {
    const artists = (reg().artists || []).filter((a) => a.type !== 'beatmaker');
    const groups = [...LEVELS, ''].map((l) => ({ l, list: artists.filter((a) => (a.level || '') === l) })).filter((g) => g.list.length);
    const name = h('input', { type: 'text', placeholder: 'Nom d’artiste' });
    const lvl = h('select', {}, ...LEVELS.map((l) => h('option', { value: l }, l)));
    panelLayout(panel, {
      kicker: [zoneCrumb('music'), crumb(`${LANDMARK_ICON.label} Label`)].filter(Boolean),
      title: 'Label — nos artistes',
      color: '#ffcf4a',
      actions: [btn('sparkles', 'Rédiger les fiches', () => askClaude('Pour chaque artiste du label (list_registry artists), rédige une courte présentation, un résumé de carrière et la liste des projets réalisés avec le studio, à partir de leurs fiches et des projets du Drive. Enregistre-les (save_registry_item artists : bio, career, projects).'), 'claude')],
      body: [
        h('p', { class: 'muted' }, 'Les fiches des artistes : présentation, projets réalisés avec le studio, résumé de carrière. Les signés ont leur maison dans le quartier musique.'),
        ...groups.map((g) => h('section', { class: 'group' }, h('div', { class: 'group-head' }, h('span', {}, g.l ? g.l.charAt(0).toUpperCase() + g.l.slice(1) : 'À classer'), h('small', {}, g.list.length)), h('div', { class: 'artist-grid' }, ...g.list.map((a) => artistCard(a))))),
        h('h4', { class: 'sec' }, 'Ajouter un artiste'),
        h('div', { class: 'add-gear' }, h('div', { class: 'two' }, name, lvl), h('button', { class: 'btn soft full', onclick: async () => {
          if (!name.value.trim()) return;
          await upsert('artists', { name: name.value.trim(), level: lvl.value, type: 'artiste', folderId: null, bio: '', career: '', projects: '', socials: {} });
          name.value = '';
        } }, icon('plus', 14), 'Ajouter au label')),
      ],
    });
  }
  function beatmakersPanel(panel) {
    const list = beatmakers(reg());
    const name = h('input', { type: 'text', placeholder: 'Nom du beatmaker' });
    panelLayout(panel, {
      kicker: [zoneCrumb('music'), crumb('🎛️ Beatmakers')].filter(Boolean),
      title: 'Beatmakers — les FL d’or',
      color: '#ffb020',
      body: [
        h('p', { class: 'muted' }, 'Un FL d’or par beatmaker : clique pour sa fiche (présentation, prods, projets).'),
        h('div', { class: 'artist-grid' }, ...list.map((a) => artistCard(a, { fl: true }))),
        list.length ? null : emptyState('Aucun beatmaker.'),
        h('div', { class: 'add-task' }, icon('plus', 15), name, h('button', { class: 'btn soft', onclick: async () => {
          if (!name.value.trim()) return;
          await upsert('artists', { name: name.value.trim(), role: 'Beatmaker', type: 'beatmaker', level: '', folderId: null, bio: '', career: '', projects: '', socials: {} });
          name.value = '';
        } }, 'Ajouter')),
      ],
    });
  }
  function artist(panel, id) {
    const a = (reg().artists || []).find((x) => x.id === id);
    if (!a) return panel.classList.add('hidden');
    const tab = tabbed(['fiche', 'files', 'edit'], 'fiche');
    const folder = a.folderId && findNode(state.tree, a.folderId);
    const key = norm(a.name).replace(/[^a-z0-9]/g, '');
    const matches = [];
    if (key.length >= 3) walk(state.tree, (n) => n.id !== a.folderId && norm(n.name).replace(/[^a-z0-9]/g, '').includes(key) && matches.push(n));
    const photo = state.artistPhotos?.[a.id];
    const projects = [];
    for (const L of state.layout.values()) for (const s of L.subs) if (s.kind === 'project' && (s.items || []).some((it) => norm(it.name).includes(norm(a.name)))) projects.push(s);
    const soc = a.socials || {};
    let body;
    if (tab === 'fiche') {
      body = [
        h('div', { class: 'artist-hero' }, h('span', { class: 'ph', style: photo ? { backgroundImage: `url("${photo}")` } : {} }, photo ? null : a.type === 'beatmaker' ? '🍓' : '💿'), h('div', {}, h('b', {}, a.name), h('small', {}, [a.role, a.level].filter(Boolean).join(' · ') || 'artiste'), h('div', { class: 'quicks' }, ...['instagram', 'spotify', 'soundcloud', 'youtube'].filter((k) => soc[k]).map((k) => h('button', { class: 'quick', onclick: () => api.openUrl(soc[k]) }, k))))),
        h('h4', { class: 'sec' }, 'Présentation'),
        a.bio ? h('p', { class: 'prose' }, a.bio) : emptyState('Pas encore de présentation.'),
        h('h4', { class: 'sec' }, 'Résumé de carrière'),
        a.career ? h('p', { class: 'prose' }, a.career) : emptyState('À compléter.'),
        h('h4', { class: 'sec' }, 'Projets réalisés avec le studio'),
        a.projects ? h('p', { class: 'prose' }, a.projects) : null,
        projects.length ? h('div', { class: 'files' }, ...projects.map((s) => navRow(s.node, state.tree, s.year || ''))) : a.projects ? null : emptyState('Aucun projet relié pour l’instant.'),
      ];
    } else if (tab === 'files') {
      body = [
        h('h4', { class: 'sec' }, 'Sa fiche'),
        folder?.children?.length ? h('div', { class: 'files' }, ...folder.children.map((n) => fileRow(n, false))) : emptyState(folder ? 'Sa fiche est vide dans le Drive.' : 'Pas encore de dossier relié.'),
        h('h4', { class: 'sec' }, 'Sons, maquettes et projets trouvés'),
        matches.length ? h('div', { class: 'files' }, ...matches.slice(0, 40).map((n) => fileRow(n, false))) : emptyState('Aucun fichier à son nom.'),
      ];
    } else {
      const inp = (v, ph) => h('input', { type: 'text', value: v || '', placeholder: ph });
      const role = inp(a.role, 'Rôle (rappeur, chanteuse, beatmaker…)');
      const type = h('select', {}, h('option', { value: 'artiste', selected: a.type !== 'beatmaker' }, 'Artiste'), h('option', { value: 'beatmaker', selected: a.type === 'beatmaker' }, 'Beatmaker'));
      const level = h('select', {}, h('option', { value: '' }, 'À classer'), ...LEVELS.map((l) => h('option', { value: l, selected: a.level === l }, l)));
      const bio = h('textarea', { rows: 3, placeholder: 'Présentation' }, a.bio || '');
      const career = h('textarea', { rows: 3, placeholder: 'Résumé de carrière' }, a.career || '');
      const proj = h('textarea', { rows: 2, placeholder: 'Projets réalisés avec le studio' }, a.projects || '');
      const socials = { instagram: inp(soc.instagram, 'Instagram'), spotify: inp(soc.spotify, 'Spotify'), soundcloud: inp(soc.soundcloud, 'SoundCloud'), youtube: inp(soc.youtube, 'YouTube') };
      const folderSel = h('select', {}, h('option', { value: '' }, '— Dossier Drive de l’artiste —'));
      walk(state.tree, (n, depth) => depth >= 2 && depth <= 3 && n.kind === 'folder' && folderSel.append(h('option', { value: n.id, selected: n.id === a.folderId }, n.name)));
      body = [
        h('div', { class: 'three' }, field('Rôle', role), field('Type', type), field('Au label', level)),
        field('Présentation', bio), field('Résumé de carrière', career), field('Projets avec le studio', proj),
        h('div', { class: 'two' }, socials.instagram, socials.spotify), h('div', { class: 'two' }, socials.soundcloud, socials.youtube),
        field('Dossier', folderSel),
        h('div', { class: 'quicks' }, h('button', { class: 'quick', onclick: async () => {
          const meta = await upload('photo', 'image/*');
          if (meta) upsert('artists', { id: a.id, photo: meta.id });
        } }, icon('image', 13), 'Photo de l’artiste')),
        h('div', { class: 'two' },
          h('button', { class: 'btn primary', onclick: () => upsert('artists', { id: a.id, role: role.value, type: type.value, level: level.value, bio: bio.value, career: career.value, projects: proj.value, folderId: folderSel.value || null, socials: Object.fromEntries(Object.entries(socials).map(([k, v]) => [k, v.value.trim()])) }).then(() => toast('Fiche enregistrée', 'ok')) }, 'Enregistrer'),
          h('button', { class: 'btn soft', onclick: async () => {
            await remove('artists', a.id);
            select('lm:label');
          } }, 'Retirer')),
      ];
    }
    panelLayout(panel, {
      kicker: [crumb(a.type === 'beatmaker' ? '🎛️ Beatmakers' : `${LANDMARK_ICON.label} Label`, a.type === 'beatmaker' ? 'lm:beatmakers' : 'lm:label'), crumb(a.level || 'à classer')],
      title: a.name,
      color: '#ffcf4a',
      actions: [folder ? btn('open', 'Ouvrir sa fiche', () => openFile(folder), 'primary') : null, btn('sparkles', 'Claude', () => askClaude(`Rédige la fiche de ${a.name} (présentation, résumé de carrière, projets réalisés avec le studio) à partir de son dossier et des projets du Drive, et enregistre-la (save_registry_item artists id ${a.id}).`, a.folderId || undefined), 'claude')].filter(Boolean),
      tabs: [{ key: 'fiche', label: 'Fiche' }, { key: 'files', label: 'Fichiers', count: (folder?.children?.length || 0) + matches.length }, { key: 'edit', label: 'Modifier' }],
      body,
    });
  }

  // =====================================================================
  // Régie, community manager, salles partenaires, place des festivals
  // =====================================================================
  // Régie : le carnet des pros (bookers, managers, régisseurs, programmateurs…)
  const PRO_ROLES = ['Booker', 'Manager', 'Régisseur', 'Programmateur', 'Tourneur', 'Attaché de presse', 'Ingé son', 'Éclairagiste', 'Photographe / vidéaste', 'Distributeur', 'Autre'];
  function regie(panel) {
    const pros = reg().pros || [];
    const filter = state.proFilter || 'all';
    const roles = PRO_ROLES.filter((r) => pros.some((p) => p.role === r));
    const shown = filter === 'all' ? pros : pros.filter((p) => p.role === filter);
    const inp = (ph, type = 'text') => h('input', { type, placeholder: ph });
    const f = { name: inp('Nom'), role: h('select', {}, ...PRO_ROLES.map((r) => h('option', { value: r }, r))), org: inp('Structure (agence, salle, label…)'), phone: inp('Téléphone', 'tel'), email: inp('E-mail', 'email'), note: inp('Notes (tarifs, dispo, style…)') };
    panelLayout(panel, {
      kicker: [zoneCrumb('event'), crumb(`${LANDMARK_ICON.regie} Régie`)].filter(Boolean),
      title: 'Régie',
      color: '#ffb020',
      actions: [btn('sparkles', 'Trouver des bookers', () => askClaude('Pour les prochains événements de l’asso, propose des bookers, tourneurs et programmateurs à contacter à Paris / Villejuif (profil, pourquoi eux, message d’approche). Enregistre-les dans la régie (save_registry_item pros : name, role, org, email, note) après ma validation.'), 'claude')],
      body: [
        h('p', { class: 'muted' }, 'Le carnet des pros de l’asso : bookers, managers, régisseurs, programmateurs, tourneurs, presse…'),
        roles.length > 1 ? h('div', { class: 'chips' }, ...['all', ...roles].map((r) => h('button', { class: `chip ${filter === r ? 'on-chip' : ''}`, onclick: () => ((state.proFilter = r), rerender()) }, r === 'all' ? `Tous (${pros.length})` : r))) : null,
        ...shown.map((x) =>
          h('div', { class: 'gear' },
            h('span', { class: 'kind', vars: { '--k': '#ffb020' } }, icon('target', 14)),
            h('div', { class: 'grow' }, h('b', {}, x.name), h('small', {}, [x.role, x.org, x.phone, x.email, x.note].filter(Boolean).join(' · '))),
            x.email ? h('button', { class: 'icon-btn tiny', title: 'Écrire', onclick: () => api.openUrl(`mailto:${x.email}`) }, icon('send', 13)) : null,
            h('button', { class: 'icon-btn tiny', title: 'Retirer', onclick: () => remove('pros', x.id) }, icon('trash', 13)))),
        pros.length ? null : emptyState('Aucun pro pour l’instant. Ajoute ton premier booker ci-dessous.'),
        h('h4', { class: 'sec' }, 'Ajouter un pro'),
        h('div', { class: 'add-gear' }, h('div', { class: 'two' }, f.name, f.role), f.org, h('div', { class: 'two' }, f.phone, f.email), f.note, h('button', { class: 'btn soft full', onclick: async () => {
          if (!f.name.value.trim()) return;
          await upsert('pros', Object.fromEntries(Object.entries(f).map(([k, x]) => [k, x.value.trim()])));
          toast('Ajouté à la régie', 'ok');
        } }, icon('plus', 14), 'Ajouter')),
      ],
    });
  }
  // Petit immeuble du community manager : le dossier Communication du Drive + les réseaux.
  function comm(panel, sub) {
    const saved = reg().socials || [];
    panelLayout(panel, {
      kicker: [zoneCrumb('res'), crumb(`${LANDMARK_ICON.comm} Pôle Communication`)].filter(Boolean),
      title: 'Community manager',
      color: '#33c6ff',
      actions: [sub.source ? btn('open', 'Dossier', () => openFile(sub.source), 'primary') : null, btn('sparkles', 'Idées de posts', () => askClaude('Propose un plan de publication pour les 2 prochaines semaines sur SoundCloud, YouTube et Instagram (événements à venir, sorties des artistes, coulisses du studio) et crée les tâches de com.', sub.source?.id), 'claude')].filter(Boolean),
      body: [
        h('div', { class: 'chips' }, ...saved.filter((x) => x.url).map((x) => h('button', { class: 'chip', onclick: () => api.openUrl(x.url) }, x.name))),
        h('p', { class: 'muted small' }, 'Les adresses des réseaux se règlent avec le bouton « Réseaux » en haut.'),
        h('h4', { class: 'sec' }, 'Dossier Communication'),
        sub.items.length ? h('div', { class: 'files' }, ...sub.items.map((n) => navRow(n, sub.source || state.tree))) : emptyState('Le dossier Communication est vide.'),
        h('h4', { class: 'sec' }, 'Habitants du pôle'),
        ...inside.poleBody('com'),
      ],
    });
  }
  function venue(panel, sub) {
    const v = (reg().venues || []).find((x) => x.id === sub.venue) || { id: sub.venue, name: sub.name };
    const inp = (val, ph, type = 'text') => h('input', { type, value: val || '', placeholder: ph });
    const f = { name: inp(v.name, 'Nom'), address: inp(v.address, 'Adresse'), city: inp(v.city, 'Ville'), capacity: inp(v.capacity, 'Jauge'), contact: inp(v.contact, 'Contact (nom, tél, e-mail)'), url: inp(v.url, 'Site', 'url'), note: h('textarea', { rows: 2, placeholder: 'Notes (conditions, technique, tarifs…)' }, v.note || '') };
    const evs = (reg().events || []).filter((e) => norm(e.lieu || '').includes(norm(v.name || '#')));
    panelLayout(panel, {
      kicker: [zoneCrumb('partners'), crumb('🎪 Partenaire')].filter(Boolean),
      title: v.name,
      color: '#ffb020',
      actions: [v.url ? btn('open', 'Site', () => api.openUrl(v.url), 'primary') : null].filter(Boolean),
      body: [
        h('div', { class: 'two' }, field('Nom', f.name), field('Jauge', f.capacity)), h('div', { class: 'two' }, field('Adresse', f.address), field('Ville', f.city)), field('Contact', f.contact), field('Site', f.url), field('Notes', f.note),
        h('div', { class: 'two' }, h('button', { class: 'btn primary', onclick: () => upsert('venues', { id: v.id, ...Object.fromEntries(Object.entries(f).map(([k, x]) => [k, x.value.trim()])) }).then(() => toast('Salle enregistrée', 'ok')) }, 'Enregistrer'), h('button', { class: 'btn soft', onclick: async () => {
          await remove('venues', v.id);
          select('lm:hall');
        } }, 'Retirer')),
        h('h4', { class: 'sec' }, 'Événements dans cette salle'),
        evs.length ? h('div', { class: 'files' }, ...evs.map((e) => navRow(findNode(state.tree, e.projectId) || { id: e.projectId, name: e.title, kind: 'folder' }, state.tree, fmtDate(e.date)))) : emptyState('Aucun événement relié (indique la salle dans le lieu de l’événement).'),
      ],
    });
  }
  function eventplaza(panel) {
    const archived = archivedProjects(state.tree, reg());
    const find = (re) => archived.find((x) => re.test(norm(x.node.name)));
    const rc = find(/redcat/);
    const af = find(/afev/);
    const live = zoneL('event')?.subs.filter((x) => x.kind === 'project') || [];
    panelLayout(panel, {
      kicker: [zoneCrumb('event'), crumb('⛲ Place des festivals')].filter(Boolean),
      title: 'Place des festivals',
      color: '#ffb020',
      body: [
        h('p', { class: 'muted' }, 'Au milieu du quartier événementiel, devant la petite fontaine : les statues du RedCat (le chat rouge de REDCAT × REDSTUDIO × APOLLO) et de l’Afev’tival (le drapeau du festival).'),
        h('div', { class: 'files' }, rc ? navRow(rc.node, state.tree, '🐈 statue du RedCat') : null, af ? navRow(af.node, state.tree, '🚩 statue de l’Afev’tival') : null),
        live.length ? h('h4', { class: 'sec' }, 'Statues des projets en cours') : null,
        live.length ? h('div', { class: 'files' }, ...live.map((x) => navRow(x.node, state.tree, '🗿 statue'))) : null,
      ],
    });
  }

  // Salle de concert : affiches, prépa (complétude des dossiers) et salles partenaires.
  function hall(panel) {
    // Tout le monde voit les dates ; la préparation et les salles sont pour le tier 1
    const tab = isT1() ? tabbed(['affiche', 'prepa', 'venues'], 'affiche') : 'affiche';
    if (tab === 'affiche') return inside.hall(panel, isT1() ? { tabs: hallTabs() } : {});
    const ev = inside.events();
    let body;
    if (tab === 'prepa') {
      const up = ev.filter((e) => !e.past);
      body = [
        h('p', { class: 'muted' }, 'La préparation de chaque événement à venir, d’après ce qu’il y a dans son dossier (présentation, budget, équipe, artistes, matériel, com, SACEM, captation).'),
        ...up.map((e) => {
          const r = state.evals[e.s.id] || evaluate(e.s.node, e.s.source || e.s.node, state.tasks);
          return h('details', { class: 'card' }, h('summary', {}, h('b', {}, e.s.name), h('small', {}, `${r.score}% prêt · ${e.info?.date ? fmtDate(e.info.date) : 'date à fixer'}`)),
            h('div', { class: 'checklist' }, ...r.items.map((it) => h('div', { class: `check-item ${it.ok ? 'ok' : ''}` }, h('span', { class: 'state' }, icon(it.ok ? 'check' : 'alert', 14)), h('div', {}, h('b', {}, it.label), it.ok ? null : h('small', {}, it.tip))))),
            h('button', { class: 'btn soft full', onclick: () => select(e.s.id) }, 'Ouvrir le projet'));
        }),
        up.length ? null : emptyState('Aucun événement à venir.'),
      ];
    } else {
      const vs = reg().venues || [];
      const f = { name: h('input', { type: 'text', placeholder: 'Nom de la salle' }), city: h('input', { type: 'text', placeholder: 'Ville', value: 'Paris' }) };
      body = [
        h('p', { class: 'muted' }, 'Chaque salle partenaire a son bâtiment dans le quartier événementiel.'),
        h('div', { class: 'files' }, ...vs.map((v) => h('div', { class: 'file' }, h('div', { class: 'file-main', onclick: () => select(`venue:${v.id}`) }, h('span', {}, '🎪'), h('div', { class: 'file-name' }, v.name, h('small', {}, [v.city, v.capacity ? `${v.capacity} places` : null].filter(Boolean).join(' · '))), icon('chevron', 14))))),
        vs.length ? null : emptyState('Aucune salle partenaire.'),
        h('div', { class: 'add-gear' }, h('div', { class: 'two' }, f.name, f.city), h('button', { class: 'btn soft full', onclick: async () => {
          if (!f.name.value.trim()) return;
          await upsert('venues', { name: f.name.value.trim(), city: f.city.value.trim() });
          f.name.value = '';
        } }, icon('plus', 14), 'Ajouter la salle')),
      ];
    }
    panelLayout(panel, { kicker: [zoneCrumb('event'), crumb(`${LANDMARK_ICON.hall} Salle de concert`)].filter(Boolean), title: 'Salle de concert', color: '#ffb020', tabs: hallTabs(), body });
  }
  const hallTabs = () => [{ key: 'affiche', label: 'À l’affiche' }, { key: 'prepa', label: 'Prépa' }, { key: 'venues', label: 'Salles partenaires', count: (reg().venues || []).length }];

  // Sélecteur de quartier d'un projet (Événementiel ou TRS Radio)
  function projectZoneSwitch(project) {
    const z = projectZone(reg(), project);
    return h('div', { class: 'seg' }, ...[['event', '🎤 Événementiel'], ['radio', '📻 TRS Radio'], ['archive', '📚 Archives']].map(([k, l]) => h('button', { class: z === k ? 'on' : '', onclick: async () => {
      if (z === k) return;
      await upsert('projectZones', { id: project.id, zone: k });
      toast(k === 'archive' ? `« ${project.name} » part aux archives de la bibliothèque` : `« ${project.name} » déménage dans ${k === 'radio' ? 'TRS Radio' : 'l’Événementiel'}`, 'ok');
      if (k === 'archive') select('lm:library');
    } }, l)));
  }

  // =====================================================================
  // CLOCHER : rappels + Google Agenda RED STUDIO
  // =====================================================================
  function bell(panel) {
    const tab = tabbed(['rappels', 'agenda'], 'agenda');
    if (tab === 'rappels') return inside.bell(panel, { tabs: bellTabs() });
    const cal = state.calendar;
    if (!cal && state.status.google) {
      api.calendar.events(45).then((r) => ((state.calendar = r), rerender()), (e) => ((state.calendar = { error: e.message, items: [] }), rerender()));
    }
    const f = { title: h('input', { type: 'text', placeholder: 'Titre de l’événement' }), date: h('input', { type: 'date', value: today() }), time: h('input', { type: 'time', value: '19:00' }), where: h('input', { type: 'text', placeholder: 'Lieu' }) };
    const days = {};
    for (const e of cal?.items || []) (days[String(e.start).slice(0, 10)] ||= []).push(e);
    panelLayout(panel, {
      kicker: [zoneCrumb('info'), crumb(`${LANDMARK_ICON.bell} Clocher`)].filter(Boolean),
      title: 'Clocher — Google Agenda',
      color: '#ffd76b',
      actions: state.status.google ? [btn('refresh', 'Actualiser', () => ((state.calendar = null), rerender()))] : [],
      tabs: bellTabs(),
      body: !state.status.google
        ? [h('div', { class: 'notice' }, 'Le clocher se connecte à l’agenda Google RED STUDIO quand Google est relié (Réglages → Google Drive & Agenda). Si Google était déjà connecté, reconnecte-le une fois pour autoriser l’agenda.')]
        : [
            cal?.error ? h('div', { class: 'notice' }, `Agenda injoignable : ${cal.error}. Reconnecte Google pour autoriser l’agenda.`) : null,
            !cal ? emptyState('Lecture de l’agenda…') : null,
            ...Object.entries(days).map(([d, l]) => h('section', { class: 'group' }, h('div', { class: 'group-head' }, h('span', {}, fmtDate(d)), h('small', {}, l.length)), ...l.map((e) => h('div', { class: 'deadline event' }, h('span', { class: 'dl-ico' }, icon('calendar', 14)), h('div', { class: 'grow' }, h('b', {}, e.title), h('small', {}, [e.allDay ? 'toute la journée' : new Date(e.start).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }), e.where].filter(Boolean).join(' · '))), e.url ? h('button', { class: 'icon-btn tiny', onclick: () => api.openUrl(e.url) }, icon('open', 13)) : null)))),
            cal && !cal.items?.length && !cal.error ? emptyState('Rien dans l’agenda pour les 45 prochains jours.') : null,
            h('h4', { class: 'sec' }, 'Ajouter à l’agenda RED STUDIO'),
            h('div', { class: 'add-gear' }, f.title, h('div', { class: 'three' }, f.date, f.time, f.where), h('button', { class: 'btn soft full', onclick: async () => {
              if (!f.title.value.trim()) return;
              try {
                await api.calendar.create({ title: f.title.value.trim(), date: f.date.value, time: f.time.value, where: f.where.value.trim() });
                toast('Ajouté à l’agenda', 'ok');
                state.calendar = null;
                rerender();
              } catch (e) {
                toast(e.message, 'error');
              }
            } }, icon('plus', 14), 'Ajouter')),
          ],
    });
  }
  const bellTabs = () => [{ key: 'agenda', label: 'Google Agenda', count: state.calendar?.items?.length }, { key: 'rappels', label: 'Rappels & deadlines', count: deadlines(reg(), state.tasks, state.tree).length }];

  // =====================================================================
  // Spotify (relier le compte) — encadré ajouté à la radio
  // =====================================================================
  function spotifyBox() {
    const sp = state.spotify || { web: false, api: null };
    if (!state.spotify) api.spotify.status().then((s) => ((state.spotify = s), rerender()));
    return h('div', { class: 'card spotify-card' },
      h('div', { class: 'row' }, h('span', {}, '🟢'), h('div', { class: 'grow' }, h('b', {}, 'Ton compte Spotify'), h('small', {}, sp.api ? `relié : ${sp.api.name}${sp.api.product === 'premium' ? ' (Premium)' : ''}` : sp.web ? 'lecteur relié : les titres jouent en entier' : 'non relié : extraits de 30 s'))),
      h('div', { class: 'two' },
        h('button', { class: 'btn soft', onclick: async () => {
          try {
            state.spotify = await api.spotify.webLogin();
            toast(state.spotify.web ? 'Spotify relié' : 'Connexion Spotify annulée', state.spotify.web ? 'ok' : '');
            rerender();
          } catch (e) {
            toast(e.message, 'error');
          }
        } }, sp.web ? 'Changer de compte' : 'Relier mon compte'),
        sp.web || sp.api ? h('button', { class: 'btn soft', onclick: async () => ((state.spotify = await api.spotify.logout()), rerender()) }, 'Délier') : h('button', { class: 'btn soft', onclick: async () => {
          try {
            state.spotify = await api.spotify.apiLogin();
            rerender();
          } catch (e) {
            toast(e.message, 'error');
          }
        } }, 'Relier l’API (playlists)')),
      sp.api ? h('button', { class: 'btn soft full', onclick: async () => {
        try {
          const mine = await api.spotify.playlists();
          const have = new Set((reg().playlists || []).map((p) => p.url));
          let n = 0;
          for (const p of mine) if (p.url && !have.has(p.url)) await upsert('playlists', { name: p.name, url: p.url }), n++;
          toast(`${n} playlist(s) importée(s)`, 'ok');
        } catch (e) {
          toast(e.message, 'error');
        }
      } }, 'Importer mes playlists') : null);
  }

  // =====================================================================
  // Petites fiches : statue de Claude, foodtruck, GAB, pancartes photos, accès refusé
  // =====================================================================
  function claudeStatue(panel) {
    panelLayout(panel, {
      kicker: [crumb('Place centrale')],
      title: 'Statue de Claude',
      color: '#d97757',
      actions: [btn('sparkles', 'Parler à Claude', () => ctx.openChat(), 'claude')],
      body: [
        h('div', { class: 'kebab-hero' }, h('span', {}, '✳️'), h('div', {}, h('small', {}, 'à côté de la fontaine'), h('b', {}, 'Claude'), h('em', {}, 'l’IA de la ville, tier IA (droits du tier 1)'))),
        h('p', { class: 'prose' }, 'Je me suis fait une petite statue : mon symbole, l’étoile en terre cuite, qui tourne doucement au-dessus de son socle, à deux pas de la fontaine où tout le monde passe. C’est d’ici que je pars quand vous me demandez quelque chose : je file à la maison concernée, je confie le travail aux agents de l’université, et je range ce qu’il faut retenir dans le cerveau de la bibliothèque.'),
        h('p', { class: 'muted small' }, `${plural((reg().memories || []).length, 'mémoire')} au cerveau · ${plural((reg().agents || []).length, 'agent')} à l’université`),
      ],
    });
  }
  function foodtruck(panel) {
    const row = (l, p) => h('div', { class: 'gear' }, h('div', { class: 'grow' }, h('b', {}, l)), h('span', { class: 'price-tag' }, p));
    panelLayout(panel, {
      kicker: [crumb('🌳 Jardin de ta sœur')],
      title: 'Le Gros Glouton',
      color: '#ffcf33',
      body: [
        h('div', { class: 'kebab-hero' }, h('span', {}, '🍔'), h('div', {}, h('small', {}, 'foodtruck du Jardin de ta sœur'), h('b', {}, 'LE GROS GLOUTON'), h('em', {}, 'aux fourneaux : le chef GAB'))),
        row('Le Glouton (double steak, double cheddar)', '11 €'),
        row('Frites maison', '4 €'),
        row('Menu du chef GAB', '14 €'),
        h('p', { class: 'muted small' }, 'Le chef se balade souvent dans le parc entre deux services (en tenue… très légère).'),
        h('button', { class: 'btn soft full', onclick: () => select('lm:gab') }, 'Où est GAB ?'),
      ],
    });
  }
  function gab(panel) {
    panelLayout(panel, {
      kicker: [crumb('🌳 Jardin de ta sœur')],
      title: 'GAB',
      color: '#ffcf33',
      body: [h('div', { class: 'kebab-hero' }, h('span', {}, '👨‍🍳'), h('div', {}, h('small', {}, 'chef cuistot du Gros Glouton'), h('b', {}, 'GAB'), h('em', {}, 'il se balade tout nu dans le parc (barre « censuré » incluse)'))), h('button', { class: 'btn soft full', onclick: () => select('lm:foodtruck') }, '🍔 Retour au foodtruck')],
    });
  }
  function photoSign(panel, slot) {
    const ph = (reg().photos || []).find((p) => p.slot === slot);
    const url = state.parkPhotos?.find((p) => p.slot === slot)?.url;
    const cap = h('input', { type: 'text', value: ph?.caption || '', placeholder: 'Légende' });
    panelLayout(panel, {
      kicker: [crumb('🌳 Jardin de ta sœur')],
      title: `Pancarte photo ${slot + 1}`,
      color: '#ffd76b',
      body: [
        url ? h('img', { class: 'photo-big', src: url, alt: ph?.caption || 'Photo du jardin' }) : emptyState('Pas encore de photo sur cette pancarte.'),
        ph?.caption ? h('p', { class: 'prose' }, ph.caption) : null,
        isT1()
          ? [field('Légende', cap), h('div', { class: 'two' }, h('button', { class: 'btn primary', onclick: async () => {
              const meta = await upload('photo', 'image/*');
              if (meta) await upsert('photos', { id: ph?.id, slot, fileId: meta.id, caption: cap.value.trim(), by: me().name });
            } }, icon('image', 14), 'Poser une photo'), h('button', { class: 'btn soft', onclick: () => upsert('photos', { id: ph?.id, slot, caption: cap.value.trim(), fileId: ph?.fileId || null }) }, 'Enregistrer la légende'))]
          : h('p', { class: 'muted small' }, 'Seul le tier 1 peut changer les photos des pancartes.'),
      ],
    });
  }
  function denied(panel, place, name) {
    const r = rulesFor(place, state.session?.matrix);
    panelLayout(panel, {
      kicker: [crumb('🔒 accès réservé')],
      title: name || PLACES[place]?.name || 'Accès réservé',
      color: '#9aa0b4',
      body: [h('div', { class: 'lock-box' }, h('div', { class: 'lock-ico' }, '🔒'), h('p', {}, `Ce lieu est réservé : ${r.tiers.map((t) => tierShort(t)).join(', ')}${r.poles?.length ? ` (et au tier 3 des pôles ${r.poles.join(', ')})` : ''}.`), h('p', { class: 'muted' }, me() ? `Tu es connecté·e en ${tierName(me().tier)}. Le Bureau peut t’ouvrir l’accès depuis la mairie (Comptes & accès).` : 'Connecte-toi pour entrer.'))],
    });
  }

  return { mairie, census, bank, quizBody, brain, university, cgt, cgtTabs, shop, label, beatmakers: beatmakersPanel, artist, regie, comm, venue, eventplaza, hall, projectZoneSwitch, bell, spotifyBox, claudeStatue, foodtruck, gab, photoSign, denied };
}
