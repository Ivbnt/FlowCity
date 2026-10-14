// Intégration n8n : liste des workflows (API publique v1) et déclenchement via webhooks.
const store = require('./store.cjs');

function config() {
  const url = (store.get('settings').n8nUrl || '').replace(/\/+$/, '');
  const key = store.getSecret('n8nKey');
  return { url, key };
}

function isConfigured() {
  const { url, key } = config();
  return Boolean(url && key);
}

async function listWorkflows() {
  const { url, key } = config();
  if (!url || !key) return [];
  const r = await fetch(`${url}/api/v1/workflows?limit=100`, { headers: { 'X-N8N-API-KEY': key, accept: 'application/json' } });
  if (!r.ok) throw new Error(`n8n ${r.status} : ${(await r.text()).slice(0, 200)}`);
  const json = await r.json();
  const hooks = store.get('n8nHooks') || {};
  return (json.data || []).map((w) => ({
    id: String(w.id),
    name: w.name,
    active: Boolean(w.active),
    tags: (w.tags || []).map((t) => t.name),
    updatedAt: w.updatedAt,
    webhook: hooks[w.id] || findWebhookUrl(url, w),
  }));
}

// Si le workflow contient un nœud Webhook, on reconstruit son URL de production.
function findWebhookUrl(base, wf) {
  const node = (wf.nodes || []).find((n) => n.type === 'n8n-nodes-base.webhook');
  const p = node?.parameters?.path;
  return p ? `${base}/webhook/${p}` : '';
}

async function trigger(webhookUrl, payload) {
  if (!webhookUrl) throw new Error('Aucun webhook pour ce workflow (ajoute un nœud Webhook ou renseigne l’URL).');
  const r = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source: 'map-trs', sentAt: new Date().toISOString(), ...(payload || {}) }),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`Webhook ${r.status} : ${text.slice(0, 200)}`);
  return text.slice(0, 4000);
}

module.exports = { isConfigured, listWorkflows, trigger };
