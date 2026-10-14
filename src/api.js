// Accès au processus principal. Dans Electron on utilise window.trs (preload) ;
// dans un simple navigateur (npm run build + aperçu), on bascule sur un mode démo local.
import snapshot from '../shared/drive-snapshot.json';
import MEDIA from '../shared/media.json';
import { buildSeed, newId } from '../shared/seed.mjs';
import { findNode } from '../shared/advisor.mjs';
import { buildRegistrySeed, migrateRegistry, normalizeFormations, rid } from '../shared/registry.mjs';
import { tierName } from '../shared/access.mjs';
import { dailyQuestions, publicQuestion, todayKey } from '../shared/quiz.mjs';

// Liste des compétences de Claude affichée dans la bibliothèque en mode démo.
const DEMO_TOOLS = [
  ['get_city_overview', 'Plan de la ville et organisation en sous-quartiers'],
  ['list_folder', 'Lister le contenu d’un dossier du Drive'],
  ['read_file', 'Lire un Doc, une Sheet ou des Slides'],
  ['project_status', 'Diagnostic de complétude d’un projet'],
  ['list_tasks / add_task / update_task', 'Gérer les tâches de la ville'],
  ['create_folder / create_doc', 'Créer des dossiers et des Google Docs (avec ton accord)'],
  ['list_registry / save_registry_item', 'Habitants, artistes, matériel, événements, rappels, emploi du temps, formations, playlists'],
  ['web_search / set_gigs', 'Chercher les concerts de la semaine à Paris et mettre à jour le tableau devant la mairie'],
  ['list_formations', 'Lire les formations quotidiennes / hebdomadaires sur l’API de l’asso'],
  ['list_n8n_workflows / trigger_n8n', 'Voir et lancer les automatisations n8n (avec ton accord)'],
].map(([name, description]) => ({ name, description }));

function demoApi() {
  const listeners = {};
  const emit = (ch, p) => (listeners[ch] || []).forEach((cb) => cb(p));
  const on = (ch) => (cb) => {
    (listeners[ch] ||= []).push(cb);
    return () => (listeners[ch] = listeners[ch].filter((x) => x !== cb));
  };
  const load = (k, d) => {
    try {
      return JSON.parse(localStorage.getItem(k)) ?? d;
    } catch {
      return d;
    }
  };
  const save = (k, v) => {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch {
      /* stockage indisponible : on reste en mémoire */
    }
  };
  let tasks = load('trs.tasks', null) || buildSeed();
  let routines = load('trs.routines', []);
  let registry = migrateRegistry(load('trs.registry', null) || buildRegistrySeed(snapshot));
  const setRegistry = (r) => {
    registry = { ...r };
    save('trs.registry', registry);
    emit('registry:changed', registry);
    return registry;
  };
  const setTasks = (t) => {
    tasks = t;
    save('trs.tasks', t);
    emit('tasks:changed', t);
  };
  const find = (id) => {
    for (const [nodeId, list] of Object.entries(tasks)) {
      const t = list.find((x) => x.id === id);
      if (t) return { nodeId, list, t };
    }
    throw new Error('Tâche introuvable');
  };
  const settings = { rootFolderId: snapshot.id, model: 'claude-opus-5-5', effort: 'medium', googleClientId: '', n8nUrl: '', formationsUrl: load('trs.formationsUrl', '') };
  let formationsCache = load('trs.formationsCache', null);
  const lockState = { code: load('trs.lockCode', '042069'), until: 0 };
  const status = () => ({ settings, google: false, claude: false, n8n: false, snapshot: true, demo: true });

  return {
    isElectron: false,
    status: async () => status(),
    tree: { get: async () => snapshot, refresh: async () => snapshot, onChange: on('tree:changed'), onProgress: on('tree:progress') },
    tasks: {
      get: async () => tasks,
      add: async (nodeId, f) => {
        const task = { id: newId(), title: f.title, priority: f.priority || 2, due: f.due || null, assignee: f.assignee || null, done: false, createdBy: 'user', createdAt: new Date().toISOString() };
        setTasks({ ...tasks, [nodeId]: [...(tasks[nodeId] || []), task] });
        return task;
      },
      update: async (id, patch) => {
        const { t } = find(id);
        Object.assign(t, patch);
        setTasks({ ...tasks });
        return t;
      },
      remove: async (id) => {
        const { nodeId, list } = find(id);
        setTasks({ ...tasks, [nodeId]: list.filter((x) => x.id !== id) });
      },
      onChange: on('tasks:changed'),
    },
    settings: {
      set: async (p) => {
        Object.assign(settings, p);
        save('trs.formationsUrl', settings.formationsUrl || '');
        return status();
      },
      secret: async () => status(),
    },
    google: { connect: async () => { throw new Error('Disponible dans l’application Windows'); }, disconnect: async () => status() },
    agent: {
      // Agent de démonstration : se déplace vers l'élément et répond sans appeler l'API.
      run: async ({ agentId = 'console', prompt, focusNodeId }) => {
        emit('agent:event', { agentId, type: 'start', prompt, target: focusNodeId });
        const target = focusNodeId || snapshot.children[1].id;
        setTimeout(() => emit('agent:event', { agentId, type: 'tool', name: 'project_status', input: { node_id: target }, target }), 600);
        setTimeout(() => {
          const n = findNode(snapshot, target);
          emit('agent:event', {
            agentId,
            type: 'text',
            text: `Mode démo : je suis allé voir « ${n?.name ?? 'la ville'} ». Dans l’application Windows, ajoute ta clé API Claude (Intégrations) pour que je puisse lire le Drive, créer des tâches et lancer tes workflows n8n.`,
          });
          emit('agent:event', { agentId, type: 'done' });
        }, 2600);
        return true;
      },
      stop: async () => {},
      reset: async () => {},
      onEvent: on('agent:event'),
      onApproval: on('approval:request'),
      respond: async () => {},
    },
    routines: {
      get: async () => routines,
      save: async (l) => ((routines = l), save('trs.routines', l), l),
      runNow: async (id) => {
        const r = routines.find((x) => x.id === id);
        if (r) demo.agent.run({ agentId: `routine:${r.id}`, prompt: r.prompt, focusNodeId: r.nodeId });
      },
      onChange: on('routines:changed'),
    },
    n8n: {
      list: async () => [
        { id: 'demo1', name: 'Relance partenaires (démo)', active: true, tags: ['COMMUNICATION'], webhook: '' },
        { id: 'demo2', name: 'Post Instagram auto (démo)', active: true, tags: ['MUSIQUE'], webhook: '' },
        { id: 'demo3', name: 'Récap hebdo Slack (démo)', active: false, tags: ['ADMINISTRATIF'], webhook: '' },
      ],
      setKey: async () => status(),
      setHook: async () => {},
      trigger: async () => 'ok (démo)',
      onFired: on('n8n:fired'),
    },
    openUrl: async (u) => (/^spotify:/.test(u) ? (window.location.href = u) : window.open(u, '_blank')),
    openFile: async (u) => window.open(u, '_blank'),
    registry: {
      get: async () => registry,
      upsert: async (kind, item) => {
        const list = [...(registry[kind] || [])];
        const key = kind === 'events' ? 'projectId' : 'id';
        const i = item[key] ? list.findIndex((x) => x[key] === item[key]) : -1;
        const saved = i >= 0 ? { ...list[i], ...item } : { id: rid(kind[0]), ...item };
        if (i >= 0) list[i] = saved;
        else list.push(saved);
        setRegistry({ ...registry, [kind]: list });
        return saved;
      },
      remove: async (kind, id) => setRegistry({ ...registry, [kind]: (registry[kind] || []).filter((x) => x.id !== id && x.projectId !== id) }),
      replace: async (kind, list) => setRegistry({ ...registry, [kind]: list }),
      onChange: on('registry:changed'),
    },
    tools: async () => DEMO_TOOLS,
    // Verrou des zones sensibles (mode démo : en mémoire / stockage du navigateur)
    lock: {
      check: async (code) => {
        if (String(code) === lockState.code) {
          lockState.until = Date.now() + 10 * 60000;
          return { ok: true, until: lockState.until };
        }
        return { ok: false, left: 4 };
      },
      status: async () => ({ unlocked: Date.now() < lockState.until, until: lockState.until }),
      lock: async () => ((lockState.until = 0), { unlocked: false }),
      setCode: async (o, n) => {
        if (String(o) !== lockState.code) throw new Error('Ancien code incorrect');
        if (!/^\d{6}$/.test(String(n))) throw new Error('Le nouveau code doit faire 6 chiffres');
        lockState.code = String(n);
        save('trs.lockCode', lockState.code);
        return true;
      },
    },
    postit: {
      question: async () => 'Qui est le premier artiste du studio ?',
      check: async (a) => (['dn$', 'dns', 'dn'].includes(String(a || '').toLowerCase().replace(/[\s.'’-]/g, '')) ? { ok: true, code: lockState.code } : { ok: false }),
    },
    fbi: (() => {
      let active = false;
      const st = () => ({ hasKey: Boolean(load('trs.fbiKey', null)), active });
      return {
        status: async () => st(),
        activate: async (k) => (String(k) === load('trs.fbiKey', null) ? ((active = true), { ok: true }) : { ok: false, left: 2 }),
        setKey: async (n, o) => {
          const cur = load('trs.fbiKey', null);
          if (cur && String(o) !== cur) throw new Error('Ancienne clé incorrecte');
          if (String(n || '').length < 6) throw new Error('La clé doit faire au moins 6 caractères');
          save('trs.fbiKey', String(n));
          active = true;
          return st();
        },
        lock: async () => ((active = false), st()),
        get: async () => {
          if (!active) throw new Error('FBI : clé d’activation requise');
          return load('trs.fbiVault', {});
        },
        save: async (d) => (save('trs.fbiVault', d), d),
      };
    })(),
    vault: {
      get: async () => {
        if (Date.now() >= lockState.until) throw new Error('Zone protégée : entre le code à 6 chiffres.');
        return load('trs.vault', []);
      },
      save: async (l) => {
        if (Date.now() >= lockState.until) throw new Error('Zone protégée : entre le code à 6 chiffres.');
        save('trs.vault', l);
        return l;
      },
    },
    // Bureau de journaliste : les flux se lisent depuis l'application Windows (pas depuis un navigateur).
    news: {
      get: async () => ({ at: null, items: [], status: {}, demo: true }),
      cached: async () => null,
      sources: async () => load('trs.newsSources', null) || MEDIA.map((m) => ({ ...m, enabled: true })),
      saveSources: async (l) => (save('trs.newsSources', l), l),
      defaults: async () => MEDIA.map((m) => ({ ...m, enabled: true })),
    },
    formations: {
      fetch: async () => {
        if (!settings.formationsUrl) return { items: [], at: null, url: '' };
        const r = await fetch(settings.formationsUrl, { headers: { accept: 'application/json' } });
        if (!r.ok) throw new Error(`API formations ${r.status}`);
        formationsCache = { items: normalizeFormations(await r.json()), at: new Date().toISOString(), url: settings.formationsUrl };
        save('trs.formationsCache', formationsCache);
        return formationsCache;
      },
      cached: async () => formationsCache,
    },
    ...demoAccounts({ load, save, emit, on, getRegistry: () => registry, setRegistry }),
    onToast: on('toast'),
  };
}

// Comptes en mode démo : tout reste dans le navigateur (pas de vraie sécurité, c'est un aperçu).
function demoAccounts({ load, save, emit, on, getRegistry, setRegistry }) {
  const seedAccounts = () => {
    const reg = getRegistry();
    const bureau = (reg.members || []).filter((m) => /maire|adjoint/i.test(m.title || '')).map((m) => ({ id: `u_${m.id}`, name: m.name, email: (m.emails || [])[0] || '', memberId: m.id, tier: 1, poles: ['bureau'], grants: [], status: 'active', admin: { registered: true } }));
    return [...bureau, { id: 'u_demo3', name: 'Visiteur démo', email: '', memberId: null, tier: 3, poles: [], grants: [], status: 'active', admin: { registered: false } }];
  };
  let accounts = load('trs.accounts', null) || seedAccounts();
  let matrix = load('trs.matrix', {});
  let logs = load('trs.logs', []);
  let current = null;
  try {
    current = sessionStorage.getItem('trs.me');
  } catch {
    current = null;
  }
  const me = () => accounts.find((a) => a.id === current) || null;
  const persist = () => {
    save('trs.accounts', accounts);
    emit('accounts:changed', accounts);
  };
  const log = (action, detail = '') => {
    logs.push({ at: new Date().toISOString(), who: me()?.name || 'anonyme', tier: me()?.tier || null, action, detail });
    logs = logs.slice(-2000);
    save('trs.logs', logs);
  };
  const session = () => ({ account: me(), matrix, firstRun: false, demo: true, accounts: accounts.filter((a) => a.status === 'active').map((a) => ({ id: a.id, name: a.name, tier: a.tier, hasPin: true, google: Boolean(a.email) })) });
  const changed = () => {
    const s = session();
    emit('session:changed', s);
    emit('registry:changed', getRegistry());
    return s;
  };
  const tier1 = () => {
    if (me()?.tier !== 1) throw new Error('Réservé au tier 1 (Bureau).');
  };
  const quizStore = () => load('trs.quiz', { answers: {}, scores: {} });
  const quizState = () => {
    const st = quizStore();
    const day = todayKey();
    const mine = (current && st.answers[current]?.[day]) || {};
    const qs = dailyQuestions(getRegistry().quizQuestions || []);
    return {
      day,
      questions: qs.map((q) => ({ ...publicQuestion(q), result: mine[q.id] ? { ...mine[q.id], answer: q.answer, explain: q.explain } : null })),
      leaderboard: Object.entries(st.scores).map(([id, points]) => ({ id, name: accounts.find((a) => a.id === id)?.name || id, points })).sort((a, b) => b.points - a.points),
      me: st.scores[current] || 0,
    };
  };
  const files = load('trs.files', {});
  return {
    session: { get: async () => session(), onChange: on('session:changed'), onNotice: on('notice') },
    auth: {
      pin: async (id, pin, remember) => {
        const a = accounts.find((x) => x.id === id);
        if (!a) throw new Error('Compte inconnu');
        current = a.id;
        try {
          sessionStorage.setItem('trs.me', current);
        } catch {
          /* rien */
        }
        void pin;
        void remember;
        log('connexion', 'Connexion (démo)');
        return changed();
      },
      google: async () => {
        throw new Error('La connexion Google se fait dans l’application Windows.');
      },
      logout: async () => {
        log('déconnexion', '');
        current = null;
        try {
          sessionStorage.removeItem('trs.me');
        } catch {
          /* rien */
        }
        return changed();
      },
      setPin: async () => true,
      request: async (form) => {
        accounts.push({ id: rid('u'), name: form.name, email: form.email || '', poles: form.poles || [], tier: 3, wantedTier: Number(form.wantedTier) || 3, grants: [], message: form.message || '', status: 'pending', createdAt: new Date().toISOString(), admin: { idDoc: form.idDoc, charter: form.charter, registered: false } });
        persist();
        log('inscription', `Demande de ${form.name}`);
        emit('toast', { kind: 'ok', text: `🏛️ Nouvelle demande d’inscription : ${form.name}` });
        return { ok: true };
      },
    },
    accounts: {
      list: async () => accounts,
      approve: async (id, patch) => {
        tier1();
        const a = accounts.find((x) => x.id === id);
        Object.assign(a, patch, { status: 'active', approvedBy: me().name, approvedAt: new Date().toISOString(), admin: { ...(a.admin || {}), registered: true } });
        const reg = getRegistry();
        if (!reg.members.some((m) => m.name.toLowerCase() === a.name.toLowerCase())) {
          const m = { id: rid('m'), name: a.name, title: 'Habitant', role: patch.role || '', emails: a.email ? [a.email] : [], docs: [], color: '#33c6ff' };
          setRegistry({ ...reg, members: [...reg.members, m] });
          a.memberId = m.id;
        }
        persist();
        log('inscription acceptée', `${a.name} → ${tierName(a.tier)}`);
        changed();
        return a;
      },
      refuse: async (id, reason) => {
        tier1();
        const a = accounts.find((x) => x.id === id);
        a.status = 'refused';
        a.refusedReason = reason;
        persist();
        log('inscription refusée', a.name);
        return a;
      },
      update: async (id, patch) => {
        tier1();
        const a = accounts.find((x) => x.id === id);
        const { pin, ...rest } = patch;
        Object.assign(a, rest, rest.admin ? { admin: { ...(a.admin || {}), ...rest.admin } } : {});
        persist();
        log('compte modifié', a.name);
        changed();
        return a;
      },
      create: async (form) => {
        tier1();
        const a = { id: rid('u'), status: 'active', tier: 3, poles: [], grants: [], admin: { registered: false }, ...form };
        accounts.push(a);
        persist();
        log('compte créé', a.name);
        return a;
      },
      setMatrix: async (m) => {
        tier1();
        matrix = m;
        save('trs.matrix', m);
        log('accès', 'Matrice des accès modifiée');
        return changed();
      },
      onChange: on('accounts:changed'),
    },
    logs: {
      list: async ({ q } = {}) => {
        tier1();
        return [...logs].reverse().filter((x) => !q || `${x.who} ${x.action} ${x.detail}`.toLowerCase().includes(String(q).toLowerCase()));
      },
      export: async () => 'Export disponible dans l’application Windows',
      add: async (a, d) => log(a, d),
    },
    drive: { read: async () => { throw new Error('La lecture des Sheets se fait dans l’application Windows.'); } },
    mail: { remind: async (to, name) => ((window.location.href = `mailto:${to}?subject=${encodeURIComponent('THE RED STUDIO — inscription à finaliser')}`), log('rappel', name), true) },
    files: {
      save: async ({ name, mime, data, category }) => {
        const id = rid('f');
        if (data.length < 1500000) files[id] = { name, mime, data, category };
        save('trs.files', files);
        log('fichier', `${name} déposé`);
        return { id, name, mime, size: Math.round((data.length * 3) / 4), category, at: new Date().toISOString(), by: me()?.name };
      },
      open: async (id) => files[id] && window.open(`data:${files[id].mime};base64,${files[id].data}`, '_blank'),
      dataUrl: async (id) => (files[id] ? `data:${files[id].mime};base64,${files[id].data}` : null),
      meta: async (ids) => ids.filter((id) => files[id]).map((id) => ({ id, name: files[id].name, mime: files[id].mime, category: files[id].category })),
    },
    quiz: {
      get: async () => quizState(),
      answer: async (qid, choice) => {
        if (!current) throw new Error('Connecte-toi pour jouer');
        const st = quizStore();
        const day = todayKey();
        const q = dailyQuestions(getRegistry().quizQuestions || []).find((x) => x.id === qid);
        st.answers[current] ||= {};
        st.answers[current][day] ||= {};
        if (q && !st.answers[current][day][qid]) {
          const ok = Number(choice) === q.answer;
          st.answers[current][day][qid] = { choice: Number(choice), ok };
          if (ok) st.scores[current] = (st.scores[current] || 0) + 10;
          save('trs.quiz', st);
        }
        return quizState();
      },
    },
    usage: {
      tick: async (ms) => {
        const u = load('trs.usage', { activeMs: 0, breakUntil: 0 });
        const now = Date.now();
        if (u.breakUntil > now) return { ...u, onBreak: true };
        if (u.breakUntil && u.activeMs >= 7200000) u.activeMs = 0;
        u.activeMs += Math.min(ms || 0, 120000);
        if (u.activeMs >= 7200000) u.breakUntil = now + 300000;
        save('trs.usage', u);
        return { ...u, onBreak: u.breakUntil > now, left: Math.max(0, 7200000 - u.activeMs) };
      },
    },
    calendar: {
      list: async () => [],
      events: async () => {
        throw new Error('Google Agenda se branche dans l’application Windows.');
      },
      create: async () => {
        throw new Error('Google Agenda se branche dans l’application Windows.');
      },
    },
    spotify: { status: async () => ({ web: false, api: null }), webLogin: async () => ({ web: false, api: null }), apiLogin: async () => { throw new Error('Disponible dans l’application Windows'); }, logout: async () => ({ web: false, api: null }), playlists: async () => [] },
  };
}

const demo = window.trs ? null : demoApi();
export const api = window.trs || demo;
