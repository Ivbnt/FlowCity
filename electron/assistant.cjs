// Assistant du Laboratoire IA : Claude, en professeur d'automatisation. Il connaît la ville du joueur
// et le catalogue des services ; il peut proposer un workflow complet, créé seulement avec ton accord.
const Anthropic = require('@anthropic-ai/sdk');

let S;
let messages = [];
let busy = false;

const SYSTEM = `Tu es l'assistant du Laboratoire IA de Flowcity, un jeu de construction de ville (façon SimCity) qui apprend à créer des automatisations (workflows).
Dans Flowcity, chaque bâtiment branche la ville sur un service : la Poste = Gmail, les Archives = Google Drive, le Beffroi = Google Agenda, le Cadastre = Google Sheets, le Centre de tri = la logique (conditions, filtres), le Laboratoire = l'IA, la Tour radio = notifications (ntfy, Telegram…), la Gare = webhooks entrants, l'Usine = n8n/Make/Zapier, la Centrale électrique = les connexions (clés API, comptes).
Une automatisation (workflow) = un déclencheur puis des étapes ; les données circulent sous forme d'« éléments » ; les champs s'insèrent avec {{champ}} (l'interface simple les affiche comme [Objet], [Expéditeur]…) (ex. {{from}}, {{subject}}, {{answer}}), et {{$today}}, {{$time}}… pour la date.
Ton rôle : un professeur patient et concret, qui tutoie, explique le POURQUOI en une phrase, et fait progresser la personne. Réponds en français, court et clair, avec des listes quand c'est utile.
- Commence par get_city pour connaître les bâtiments construits, les connexions et les workflows.
- Parle d'« automatisations » plutôt que de « workflows », avec des mots simples : beaucoup d'utilisateurs ne connaissent pas l'informatique. Dans l'interface, on crée une automatisation en cliquant sur « Relier des bâtiments » puis sur les bâtiments dans l'ordre.
- Pour proposer une automatisation, utilise list_operations pour connaître les opérations exactes et leurs champs, puis create_workflow (la personne valide avant la création). Le workflow est créé en simulation et désactivé : explique comment le tester puis l'activer.
- Si un bâtiment manque pour une étape, dis lequel construire. Si un service n'est pas connecté, explique comment l'obtenir à la Centrale électrique.
- N'invente jamais d'opération : seulement celles de list_operations.
- Ne demande jamais de mot de passe ni de clé dans la conversation : les clés se saisissent à la Centrale électrique.`;

const TOOLS = [
  { name: 'get_city', description: 'État de la ville : niveau, bâtiments construits, services disponibles et connectés, workflows (étapes, activé, dernier résultat), mission en cours.', input_schema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'list_operations', description: 'Catalogue des opérations (id, type, champs, sorties) pour un ou plusieurs services. Sans argument : la liste des services.', input_schema: { type: 'object', properties: { services: { type: 'array', items: { type: 'string' } } }, additionalProperties: false } },
  {
    name: 'create_workflow',
    description: 'Crée un workflow dans la ville (en simulation, désactivé). La personne doit valider. steps[0] doit être un déclencheur. links : liste de [indexDépart, indexArrivée, sortie?] (sortie "oui"/"non" après une Condition) ; sans links, les étapes sont enchaînées dans l’ordre.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        description: { type: 'string' },
        steps: { type: 'array', items: { type: 'object', properties: { op: { type: 'string' }, label: { type: 'string' }, params: { type: 'object' } }, required: ['op'] } },
        links: { type: 'array', items: { type: 'array', items: {} } },
      },
      required: ['name', 'steps'],
      additionalProperties: false,
    },
  },
];

function init(shared) {
  S = shared;
}
function reset() {
  messages = [];
}

function cityView(city) {
  const avail = [...S.buildings.availableServices(city)];
  return {
    name: city.name,
    level: S.buildings.levelOf(city.xp),
    credits: city.credits,
    buildings: city.buildings.map((b) => S.buildings.buildingDef(b.type, city.blueprints)?.name || b.type),
    services_disponibles: avail,
    connexions: city.connections,
    workflows: city.workflows.map((w) => ({ id: w.id, name: w.name, enabled: w.enabled, mode: w.mode, steps: w.nodes.map((n) => n.op), last: w.lastRun })),
    missions_faites: Object.keys(city.missions),
  };
}

async function exec(name, input, city, ctx) {
  if (name === 'get_city') return cityView(city);
  if (name === 'list_operations') {
    const want = input.services?.length ? input.services : null;
    if (!want) return Object.entries(S.services.SERVICES).map(([id, s]) => ({ id, name: s.name, desc: s.desc }));
    return want.map((id) => {
      const s = S.services.SERVICES[id];
      if (!s) return { id, error: 'service inconnu' };
      return { id, name: s.name, ops: Object.entries(s.ops).map(([op, d]) => ({ op, kind: d.kind, label: d.label, desc: d.desc, fields: (d.fields || []).map((f) => ({ key: f.key, label: f.label, required: Boolean(f.required), default: f.default, options: f.options?.map((o) => o[0]) })), outputs: d.outputs, branches: d.branches })) };
    });
  }
  if (name === 'create_workflow') {
    const ok = await ctx.approve(`L’assistant propose de créer le workflow « ${input.name} » (${(input.steps || []).length} étapes). On le crée ?`);
    if (!ok) return 'La personne a refusé la création.';
    const wf = ctx.createWorkflow(input);
    return { created: true, id: wf.id, name: wf.name };
  }
  throw new Error(`Outil inconnu : ${name}`);
}

async function chat({ apiKey, model, text, fresh, city, userName }, ctx) {
  if (busy) throw new Error('L’assistant réfléchit déjà…');
  busy = true;
  if (fresh) messages = [];
  const base = messages.length;
  messages.push({ role: 'user', content: text });
  ctx.emit({ type: 'start' });
  try {
    const client = new Anthropic({ apiKey });
    for (let turn = 0; turn < 12; turn++) {
      const r = await client.beta.messages.create({
        model: model || 'claude-opus-5-5',
        max_tokens: 16000,
        output_config: { effort: 'medium' },
        system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }, { type: 'text', text: `La personne s'appelle ${userName || 'joueur'}.` }],
        tools: TOOLS,
        messages,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
      });
      messages.push({ role: 'assistant', content: r.content });
      for (const b of r.content) if (b.type === 'text' && b.text.trim()) ctx.emit({ type: 'text', text: b.text });
      if (r.stop_reason === 'refusal') {
        ctx.emit({ type: 'error', error: 'Claude a refusé cette demande.' });
        break;
      }
      if (r.stop_reason !== 'tool_use') break;
      const results = [];
      for (const tu of r.content.filter((b) => b.type === 'tool_use')) {
        ctx.emit({ type: 'tool', name: tu.name });
        try {
          const out = await exec(tu.name, tu.input || {}, city, ctx);
          results.push({ type: 'tool_result', tool_use_id: tu.id, content: typeof out === 'string' ? out : JSON.stringify(out) });
        } catch (e) {
          results.push({ type: 'tool_result', tool_use_id: tu.id, content: `Erreur : ${e.message}`, is_error: true });
        }
      }
      messages.push({ role: 'user', content: results });
    }
    ctx.emit({ type: 'done' });
  } catch (e) {
    messages.length = base;
    let msg = e.message;
    if (e instanceof Anthropic.AuthenticationError) msg = 'Clé API Claude invalide (Centrale électrique).';
    else if (e instanceof Anthropic.RateLimitError) msg = 'Trop de demandes : réessaie dans un instant.';
    else if (e instanceof Anthropic.APIConnectionError) msg = 'Impossible de joindre Claude (connexion internet ?).';
    ctx.emit({ type: 'error', error: msg });
  } finally {
    busy = false;
  }
}

module.exports = { init, reset, chat };
