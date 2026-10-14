// Agents Claude : boucle d'outils (API Messages) qui peut lire le Drive, gérer les tâches
// et déclencher des workflows n8n. Toute action d'écriture sur le Drive ou vers n8n
// passe par une demande de validation affichée dans l'application.
const Anthropic = require('@anthropic-ai/sdk');
const store = require('./store.cjs');

const FALLBACK_MODELS = ['claude-opus-5-5', 'claude-opus-5', 'claude-fable-5-1', 'claude-sonnet-5-5'];

const SYSTEM = `Tu es un agent de "Map TRS", la ville 3D qui représente le Google Drive de l'association THE RED STUDIO (studio d'enregistrement, événements, radio/média à Villejuif / Paris).
La ville : chaque dossier de premier niveau est un quartier (COMMUNICATION, EVENT, ADMINISTRATIF, MUSIQUE). Les quartiers sont découpés en sous-quartiers : dans EVENT chaque projet (Chamonix, 93Mesures…) est un sous-quartier dont les sous-dossiers sont les maisons ; dans ADMINISTRATIF et MUSIQUE les dossiers sont regroupés par thème (Finances, Juridique, Création, Visuels…). Le contenu d'une maison forme ses chambres.
Bâtiments : la Bibliothèque au centre (ton point central : archives, compétences, extensions) ; dans ADMINISTRATIF la Mairie et la Banque (budget, dossier BUDGET ASSO) reliées ; dans MUSIQUE le Studio d'enregistrement (un disque d'or par artiste) et le Magasin de musique (matériel possédé / à acheter) ; dans EVENT la Salle de concert (affiches des événements passés et à venir) ; l'École (les membres de l'association), le Clocher (rappels et deadlines) et le tableau d'emploi du temps. Ces données sont dans le registre (outils list_registry / save_registry_item). Chaque élément peut avoir une liste de tâches.
Tu aides l'équipe à piloter ses projets : faire le point, repérer ce qui manque pour qu'un projet soit complet (budget, présentation, équipe, com, SACEM…), créer des tâches concrètes, préparer des documents dans le Drive et lancer des automatisations n8n.
Règles :
- Réponds en français, de façon concise et actionnable.
- Utilise les outils pour vérifier avant d'affirmer ; cite les noms de dossiers/fichiers concernés.
- Les tâches que tu crées doivent être courtes, commençant par un verbe, avec une priorité (1 = urgent, 3 = plus tard).
- La création de dossiers/documents et le déclenchement de workflows demandent une validation de l'utilisateur : propose-les quand c'est utile, sans insister si c'est refusé.`;

const TOOLS = [
  {
    name: 'get_city_overview',
    description: 'Plan de la ville : arborescence du Drive (quartiers, maisons, chambres) avec ids et nombre de tâches ouvertes. À appeler en premier pour se repérer.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'list_folder',
    description: 'Liste le contenu d’un dossier du Drive (id, nom, type, date de modification).',
    input_schema: { type: 'object', properties: { folder_id: { type: 'string' } }, required: ['folder_id'], additionalProperties: false },
  },
  {
    name: 'read_file',
    description: 'Lit le contenu texte d’un fichier du Drive (Google Doc, Sheet en CSV, Slides, texte).',
    input_schema: { type: 'object', properties: { file_id: { type: 'string' } }, required: ['file_id'], additionalProperties: false },
  },
  {
    name: 'project_status',
    description: 'Diagnostic de complétude d’un projet (maison) : type de projet, score, pièces présentes et manquantes, tâches ouvertes/terminées.',
    input_schema: { type: 'object', properties: { node_id: { type: 'string' } }, required: ['node_id'], additionalProperties: false },
  },
  {
    name: 'list_tasks',
    description: 'Liste les tâches d’un élément (et de son contenu). Sans node_id : toutes les tâches ouvertes de la ville.',
    input_schema: { type: 'object', properties: { node_id: { type: 'string' } }, additionalProperties: false },
  },
  {
    name: 'add_task',
    description: 'Ajoute une tâche à un élément de la ville (maison ou chambre).',
    input_schema: {
      type: 'object',
      properties: {
        node_id: { type: 'string' },
        title: { type: 'string' },
        priority: { type: 'integer', enum: [1, 2, 3] },
        due: { type: 'string', description: 'Date limite AAAA-MM-JJ (optionnelle)' },
      },
      required: ['node_id', 'title'],
      additionalProperties: false,
    },
  },
  {
    name: 'update_task',
    description: 'Modifie une tâche : cocher/décocher, renommer, changer la priorité.',
    input_schema: {
      type: 'object',
      properties: {
        task_id: { type: 'string' },
        done: { type: 'boolean' },
        title: { type: 'string' },
        due: { type: 'string', description: 'Date limite AAAA-MM-JJ' },
        assignee: { type: 'string', description: 'id du membre responsable' },
        priority: { type: 'integer', enum: [1, 2, 3] },
      },
      required: ['task_id'],
      additionalProperties: false,
    },
  },
  {
    name: 'create_folder',
    description: 'Crée un dossier dans le Drive (nécessite la validation de l’utilisateur).',
    input_schema: { type: 'object', properties: { parent_id: { type: 'string' }, name: { type: 'string' } }, required: ['parent_id', 'name'], additionalProperties: false },
  },
  {
    name: 'create_doc',
    description: 'Crée un Google Doc avec un contenu texte dans un dossier (nécessite la validation de l’utilisateur). Utile pour rédiger une présentation, un budget, un bilan…',
    input_schema: {
      type: 'object',
      properties: { parent_id: { type: 'string' }, name: { type: 'string' }, content: { type: 'string' } },
      required: ['parent_id', 'name', 'content'],
      additionalProperties: false,
    },
  },
  {
    name: 'list_registry',
    description: 'Lit le registre de l’association : members (équipe, rôles), artists (artistes du studio), gear (matériel possédé / à acheter), events (date, lieu, équipe par projet), reminders (rappels du clocher), schedule (emploi du temps).',
    input_schema: { type: 'object', properties: { kind: { type: 'string', enum: ['members', 'artists', 'gear', 'events', 'reminders', 'schedule'] } }, required: ['kind'], additionalProperties: false },
  },
  {
    name: 'save_registry_item',
    description: 'Ajoute ou met à jour un élément du registre (identifié par id, ou par name ; pour events par projectId). Exemples : gear {name, qty, category, status: "owned"|"wanted", price, note} ; reminders {title, date: "AAAA-MM-JJ", time: "HH:MM"} ; schedule {day: 0-6 (lundi=0), start: "HH:MM", end, title, who} ; members {name, role} ; events {projectId, date, lieu, team: [ids membres]}.',
    input_schema: {
      type: 'object',
      properties: { kind: { type: 'string', enum: ['members', 'artists', 'gear', 'events', 'reminders', 'schedule'] }, item: { type: 'object' } },
      required: ['kind', 'item'],
      additionalProperties: false,
    },
  },
  {
    name: 'list_n8n_workflows',
    description: 'Liste les workflows n8n connectés (id, nom, actif, webhook).',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'trigger_n8n',
    description: 'Déclenche un workflow n8n via son webhook avec un payload JSON (nécessite la validation de l’utilisateur).',
    input_schema: {
      type: 'object',
      properties: { workflow_id: { type: 'string' }, payload: { type: 'object' } },
      required: ['workflow_id'],
      additionalProperties: false,
    },
  },
];

const WRITE_TOOLS = new Set(['create_folder', 'create_doc', 'trigger_n8n']);

const conversations = new Map();
const running = new Map();

function client() {
  const apiKey = store.getSecret('anthropicKey');
  return apiKey ? new Anthropic({ apiKey }) : new Anthropic();
}

function nodeIdOf(input) {
  return input?.node_id || input?.folder_id || input?.file_id || input?.parent_id || null;
}

/**
 * Lance (ou poursuit) une conversation d'agent.
 * ctx = { emit(evt), approve(desc) => Promise<boolean>, exec(name, input) => Promise<any> }
 */
async function run({ agentId, prompt, focusNodeId, fresh }, ctx) {
  if (running.get(agentId)) throw new Error('Cet agent est déjà en train de travailler.');
  const controller = { aborted: false };
  running.set(agentId, controller);
  const settings = store.get('settings');
  const model = settings.model || 'claude-opus-5-5';
  const messages = fresh ? [] : conversations.get(agentId) || [];
  const base = messages.length;
  const focus = focusNodeId ? `\n\n(Contexte : l'utilisateur regarde l'élément d'id ${focusNodeId}.)` : '';
  messages.push({ role: 'user', content: prompt + focus });
  conversations.set(agentId, messages);
  ctx.emit({ agentId, type: 'start', prompt, target: focusNodeId });

  try {
    const anthropic = client();
    for (let turn = 0; turn < 25; turn++) {
      if (controller.aborted) throw new Error('Arrêté par l’utilisateur');
      const params = {
        model,
        max_tokens: 16000,
        system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
        tools: TOOLS,
        messages,
        output_config: { effort: settings.effort || 'medium' },
      };
      if (FALLBACK_MODELS.includes(model)) {
        params.betas = ['server-side-fallback-2026-07-01'];
        params.fallbacks = 'default';
      }
      const response = await anthropic.beta.messages.create(params);
      messages.push({ role: 'assistant', content: response.content });

      for (const block of response.content) {
        if (block.type === 'text' && block.text.trim()) ctx.emit({ agentId, type: 'text', text: block.text });
      }

      if (response.stop_reason === 'refusal') {
        ctx.emit({ agentId, type: 'error', error: 'Claude a refusé cette demande.' });
        break;
      }
      if (response.stop_reason === 'max_tokens') {
        ctx.emit({ agentId, type: 'text', text: '… (réponse tronquée : limite de longueur atteinte)' });
        break;
      }
      if (response.stop_reason === 'pause_turn') continue;
      if (response.stop_reason !== 'tool_use') break;

      const results = [];
      for (const tu of response.content.filter((b) => b.type === 'tool_use')) {
        const target = nodeIdOf(tu.input);
        ctx.emit({ agentId, type: 'tool', name: tu.name, input: tu.input, target });
        try {
          if (WRITE_TOOLS.has(tu.name)) {
            const ok = await ctx.approve({ agentId, tool: tu.name, input: tu.input });
            if (!ok) {
              results.push({ type: 'tool_result', tool_use_id: tu.id, content: 'L’utilisateur a refusé cette action.', is_error: true });
              continue;
            }
          }
          const out = await ctx.exec(tu.name, tu.input || {});
          results.push({ type: 'tool_result', tool_use_id: tu.id, content: typeof out === 'string' ? out : JSON.stringify(out) });
        } catch (e) {
          results.push({ type: 'tool_result', tool_use_id: tu.id, content: `Erreur : ${e.message}`, is_error: true });
        }
      }
      messages.push({ role: 'user', content: results });
    }
    ctx.emit({ agentId, type: 'done' });
  } catch (e) {
    let msg = e.message;
    if (e instanceof Anthropic.AuthenticationError) msg = 'Clé API Anthropic invalide ou manquante (Intégrations → Claude).';
    else if (e instanceof Anthropic.RateLimitError) msg = 'Limite de requêtes atteinte, réessaie dans un instant.';
    else if (e instanceof Anthropic.APIConnectionError) msg = 'Impossible de joindre l’API Claude (connexion internet ?).';
    // On annule l'échange raté pour garder un historique valide (tool_use sans tool_result, etc.).
    messages.length = base;
    ctx.emit({ agentId, type: 'error', error: msg });
  } finally {
    running.delete(agentId);
  }
}

function stop(agentId) {
  const c = running.get(agentId);
  if (c) c.aborted = true;
}

function reset(agentId) {
  conversations.delete(agentId);
}

function isReady() {
  return store.hasSecret('anthropicKey') || Boolean(process.env.ANTHROPIC_API_KEY);
}

module.exports = { run, stop, reset, isReady, TOOLS };
