// Accès au processus principal. Dans Electron : window.flow (preload). Dans un simple navigateur
// (aperçu, démo), le même jeu tourne en local : ville dans le stockage du navigateur,
// exécutions en simulation uniquement.
import { applyAction, migrateCity, newCity, recordRun } from '../shared/city.mjs';
import { runWorkflow, validate } from '../shared/engine.mjs';
import { mockCall } from '../shared/mock.mjs';
import { opAvailable } from '../shared/buildings.mjs';
import { SERVICES } from '../shared/services.mjs';

function browserApi() {
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
  let user = load('fc.user', null);
  let creds = load('fc.creds', {});
  const cityKey = () => `fc.city.${user?.email || 'x'}`;
  const connections = () => [...(user && !user.guest ? ['google'] : []), ...Object.keys(creds).filter((k) => creds[k])];
  const getCity = () => Object.assign(migrateCity(load(cityKey(), null) || newCity(user || {})), { connections: connections() });
  const putCity = (c) => {
    c.connections = connections();
    save(cityKey(), c);
    emit('city:changed', c);
    return c;
  };
  const status = () => ({
    session: user,
    demo: true,
    googleClientId: 'demo',
    webhookBase: 'http://127.0.0.1:47800/hook/',
    encrypted: false,
    connections: connections(),
    credentials: Object.fromEntries(Object.entries(SERVICES).filter(([, s]) => s.auth.kind === 'fields').map(([id, s]) => [id, creds[id] ? Object.fromEntries(s.auth.fields.map((f) => [f.key, f.secret ? '••••••' : creds[id][f.key] || ''])) : null])),
    claude: false,
  });
  const login = (u) => {
    user = u;
    save('fc.user', u);
    const c = getCity();
    putCity(c);
    emit('session:changed', status());
    return status();
  };
  const act = (action) => {
    const c = getCity();
    const before = Object.keys(c.missions).length;
    const { info } = applyAction(c, action);
    putCity(c);
    if (Object.keys(c.missions).length > before) emit('missions:done', Object.keys(c.missions).slice(before));
    return { city: c, info };
  };
  const pending = new Map();
  const running = new Map();

  async function execute(wf, { triggerItems, source = 'manuel', depth = 0 } = {}) {
    const c = getCity();
    const issues = validate(wf, { isAvailable: (op) => opAvailable(c, op) }).filter((i) => i.level === 'error');
    if (issues.length) throw new Error(issues[0].text);
    const runId = `x${Date.now().toString(36)}`;
    const signal = { aborted: false };
    if (!depth) running.set(wf.id, signal);
    emit('run:start', { runId, workflowId: wf.id, name: wf.name, mode: 'sim', source });
    const adapter = {
      call: async (op, params, item) => {
        await new Promise((r) => setTimeout(r, 350 + Math.random() * 350));
        if (op === 'flow.notify') emit('toast', { kind: 'ok', text: `🔔 ${params.title || 'FlowCity'} — ${params.text || ''}` });
        if (op === 'flow.task') act({ type: 'task.add', title: params.title, priority: Number(params.priority) || 2, due: params.due || null, source: wf.name });
        if (op === 'flow.note') act({ type: 'journal', text: `📝 ${params.text}` });
        if (op === 'flow.subflow') {
          const sub = getCity().workflows.find((w) => w.id === params.workflowId);
          if (!sub) throw new Error('Workflow lancé introuvable');
          if (depth >= 3) throw new Error('Trop de workflows imbriqués');
          const r = await execute(sub, { triggerItems: [item], source: `lancé par « ${wf.name} »`, depth: depth + 1 });
          if (!r.ok) throw new Error(`Le workflow « ${sub.name} » a échoué`);
        }
        return mockCall(op, params, item);
      },
      approve: (question) =>
        new Promise((resolve) => {
          const id = `ap${Math.random().toString(36).slice(2)}`;
          pending.set(id, resolve);
          emit('approval:request', { id, question, workflow: wf.name });
        }),
      evalExpr: (expr, item) => {
        // Pas d'évaluation de code dans l'aperçu navigateur (politique de sécurité) : accès simple item.champ
        const m = String(expr).trim().match(/^item\.([\w.]+)$/);
        if (!m) throw new Error('Formules disponibles seulement dans l’application (aperçu : item.champ uniquement).');
        return m[1].split('.').reduce((o, k) => o?.[k], item);
      },
    };
    try {
      const result = await runWorkflow(wf, { adapter, triggerItems, signal, mode: 'sim', onStep: (s) => emit('run:step', { runId, workflowId: wf.id, ...s }) });
      const city = getCity();
      const before = Object.keys(city.missions).length;
      const run = recordRun(city, wf, result, 'sim', source);
      putCity(city);
      if (Object.keys(city.missions).length > before) emit('missions:done', Object.keys(city.missions).slice(before));
      emit('run:end', { runId, workflowId: wf.id, run, items: result.items });
      return { ...run, items: result.items };
    } finally {
      if (!depth) running.delete(wf.id);
    }
  }

  return {
    isElectron: false,
    status: async () => status(),
    auth: {
      google: async () => login({ email: 'demo@flowcity.local', name: 'Joueur démo', picture: null, guest: false, demo: true }),
      guest: async () => login({ email: 'invite@flowcity.local', name: 'Visiteur', picture: null, guest: true }),
      logout: async () => {
        user = null;
        save('fc.user', null);
        emit('session:changed', status());
        return status();
      },
      disconnectGoogle: async () => status(),
      setClient: async () => status(),
      onChange: on('session:changed'),
    },
    city: {
      get: async () => getCity(),
      act: async (a) => act(a),
      export: async () => {
        const blob = new Blob([JSON.stringify(getCity(), null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `${getCity().name}.flowcity.json`;
        a.click();
        return true;
      },
      import: async () => null,
      onChange: on('city:changed'),
      onMissions: on('missions:done'),
    },
    cred: {
      save: async (service, values) => {
        creds = { ...creds, [service]: values };
        save('fc.creds', creds);
        act({ type: 'flag', key: 'credSaved' }); // revérifie les missions avec la nouvelle connexion
        return status();
      },
      test: async (service) => (service === 'google' ? 'Aperçu : Google simulé' : 'Aperçu navigateur : enregistré (le test réel se fait dans l’application)'),
      remove: async (service) => {
        const next = { ...creds };
        delete next[service];
        creds = next;
        save('fc.creds', creds);
        putCity(getCity());
        return status();
      },
    },
    wf: {
      run: async (id) => {
        const wf = getCity().workflows.find((w) => w.id === id);
        if (!wf) throw new Error('Workflow introuvable');
        if (running.has(id)) throw new Error('Ce workflow est déjà en cours.');
        return execute(wf);
      },
      stop: async (id) => {
        const s = running.get(id);
        if (s) s.aborted = true;
      },
      onStart: on('run:start'),
      onStep: on('run:step'),
      onEnd: on('run:end'),
    },
    approval: {
      respond: async (id, ok) => {
        pending.get(id)?.(Boolean(ok));
        pending.delete(id);
      },
      onRequest: on('approval:request'),
    },
    assistant: {
      send: async () => {
        throw new Error('L’assistant Claude est disponible dans l’application (avec ta clé API).');
      },
      reset: async () => {},
      onEvent: on('assistant:event'),
    },
    settings: { set: async () => status() },
    openUrl: async (u) => window.open(u, '_blank', 'noopener'),
    onToast: on('toast'),
  };
}

export const api = window.flow || browserApi();
