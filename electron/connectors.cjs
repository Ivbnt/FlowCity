// Exécution réelle des étapes de FlowCity : chaque opération du catalogue (shared/flowcity/services.mjs)
// a ici son implémentation (appel d'API). Les identifiants viennent de la Centrale électrique (chiffrés).
const vm = require('vm');
const Anthropic = require('@anthropic-ai/sdk');
const google = require('./google.cjs');

const UA = 'FlowCity/1.0 (+https://github.com/Ivbnt/FlowCity)';
const MAX_DOWNLOAD = 15 * 1024 * 1024;

async function fetchJson(url, opts = {}, label = 'Service') {
  const r = await fetch(url, { ...opts, headers: { 'User-Agent': UA, ...(opts.headers || {}) } });
  const text = await r.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    /* pas du JSON */
  }
  if (!r.ok) {
    const msg = json?.error?.message || json?.message || json?.error_description || json?.description || (typeof json?.error === 'string' ? json.error : '') || text.slice(0, 200);
    throw new Error(`${label} ${r.status} : ${msg || r.statusText}`);
  }
  return json ?? { text };
}
const postJson = (url, body, headers = {}, label) => fetchJson(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) }, label);

// Mini-lecteur RSS / Atom (sans dépendance) : titre, lien, date, résumé.
function parseFeed(xml) {
  const items = [];
  const blocks = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) || xml.match(/<entry[\s>][\s\S]*?<\/entry>/gi) || [];
  const tag = (b, t) => {
    const m = b.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)<\\/${t}>`, 'i'));
    return m ? m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, '’').replace(/\s+/g, ' ').trim() : '';
  };
  for (const b of blocks.slice(0, 30)) {
    const href = b.match(/<link[^>]*href="([^"]+)"/i)?.[1];
    items.push({ title: tag(b, 'title'), link: href || tag(b, 'link') || tag(b, 'guid'), date: tag(b, 'pubDate') || tag(b, 'published') || tag(b, 'updated'), summary: (tag(b, 'description') || tag(b, 'summary') || tag(b, 'media:description') || tag(b, 'content')).slice(0, 600) });
  }
  return items;
}
async function readFeed(url) {
  const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/rss+xml, application/atom+xml, text/xml, */*' } });
  if (!r.ok) throw new Error(`Flux ${r.status}`);
  return parseFeed(await r.text());
}
function parseHeaders(text) {
  const h = {};
  for (const line of String(text || '').split('\n')) {
    const i = line.indexOf(':');
    if (i > 0) h[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return h;
}

/**
 * ctx = { email, cred(service) → objet|null, notify(title, text), addTask(fields), journal(text),
 *         runSubflow(workflowId, item, depth), openExternal(url), model }
 */
function createConnectors(ctx) {
  const need = (service, ...keys) => {
    const c = ctx.cred(service);
    if (!c || keys.some((k) => !String(c[k] || '').trim())) throw new Error(`Service non connecté : renseigne ${service} à la Centrale électrique.`);
    return c;
  };
  const gapi = () => {
    if (!google.isConnected(ctx.email)) throw new Error('Google n’est pas connecté.');
    return google.makeApi(ctx.email);
  };

  async function askLLM(service, prompt, { system, max = 2000 } = {}) {
    if (service === 'claude') {
      const c = need('claude', 'apiKey');
      const client = new Anthropic({ apiKey: c.apiKey });
      const params = {
        model: ctx.model || 'claude-opus-5-5',
        max_tokens: max,
        output_config: { effort: 'low' },
        ...(system ? { system } : {}),
        messages: [{ role: 'user', content: prompt }],
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
      };
      const r = await client.beta.messages.create(params);
      if (r.stop_reason === 'refusal') throw new Error('Claude a refusé cette demande.');
      return r.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
    }
    const conf = service === 'openai' ? { url: 'https://api.openai.com/v1/chat/completions', model: 'gpt-4o-mini' } : { url: 'https://api.mistral.ai/v1/chat/completions', model: 'mistral-small-latest' };
    const c = need(service, 'apiKey');
    const messages = [...(system ? [{ role: 'system', content: system }] : []), { role: 'user', content: prompt }];
    const r = await postJson(conf.url, { model: c.model || conf.model, messages, max_tokens: max }, { Authorization: `Bearer ${c.apiKey}` }, service === 'openai' ? 'OpenAI' : 'Mistral');
    return r.choices?.[0]?.message?.content?.trim() || '';
  }

  const ops = {
    // ----- Cœur -----
    'flow.manual': async () => [{ startedAt: new Date().toISOString() }],
    'flow.schedule': async () => [{ firedAt: new Date().toISOString(), weekday: new Date().toLocaleDateString('fr-FR', { weekday: 'long' }) }],
    'flow.task': async (p) => ({ taskId: ctx.addTask({ title: p.title, priority: Number(p.priority) || 2, due: p.due || null }).id }),
    'flow.note': async (p) => (ctx.journal(`📝 ${p.text}`), {}),
    'flow.notify': async (p) => (ctx.notify(p.title || 'FlowCity', p.text || ''), {}),
    'flow.subflow': async (p, item, run) => ({ subResult: await ctx.runSubflow(p.workflowId, item, (run.depth || 0) + 1) }),

    // ----- Gmail -----
    'gmail.newEmail': async (p) => {
      const api = gapi();
      const ids = await google.gmail.ids(api, p.query || 'in:inbox', 3);
      return Promise.all(ids.map((id) => google.gmail.get(api, id)));
    },
    'gmail.search': async (p) => {
      const api = gapi();
      const ids = await google.gmail.ids(api, p.query || 'in:inbox', Number(p.max) || 10);
      return Promise.all(ids.map((id) => google.gmail.get(api, id)));
    },
    'gmail.send': async (p) => {
      const r = await gapi()(`${google.gmail.GM}/messages/send`, { method: 'POST', body: { raw: google.gmail.rfc822(p) } });
      return { sentId: r.id };
    },
    'gmail.reply': async (p, item) => {
      const api = gapi();
      let inReplyTo = item.messageIdHeader;
      if (!inReplyTo && item.id) inReplyTo = google.gmail.header(await api(`${google.gmail.GM}/messages/${item.id}`, { query: { format: 'metadata', metadataHeaders: 'Message-ID' } }), 'Message-ID');
      const r = await api(`${google.gmail.GM}/messages/send`, { method: 'POST', body: { raw: google.gmail.rfc822({ ...p, inReplyTo }), threadId: p.threadId || item.threadId } });
      return { sentId: r.id };
    },
    'gmail.draft': async (p) => {
      const r = await gapi()(`${google.gmail.GM}/drafts`, { method: 'POST', body: { message: { raw: google.gmail.rfc822(p) } } });
      return { draftId: r.id };
    },
    'gmail.label': async (p) => {
      const api = gapi();
      if (!p.messageId) throw new Error('Aucun mail à ranger (champ « Mail » vide).');
      const labelId = await google.gmail.labelId(api, p.label);
      const removeLabelIds = [...(p.markRead === 'yes' ? ['UNREAD'] : []), ...(p.archive === 'yes' ? ['INBOX'] : [])];
      await api(`${google.gmail.GM}/messages/${p.messageId}/modify`, { method: 'POST', body: { addLabelIds: [labelId], removeLabelIds } });
      return {};
    },
    'gmail.attachments': async (p) => {
      const api = gapi();
      if (!p.messageId) throw new Error('Aucun mail (champ « Mail » vide).');
      const m = await api(`${google.gmail.GM}/messages/${p.messageId}`, { query: { format: 'full' } });
      const out = [];
      for (const a of google.gmail.attachmentsOf(m.payload).slice(0, 10)) {
        if (a.size > MAX_DOWNLOAD) continue;
        const d = await api(`${google.gmail.GM}/messages/${p.messageId}/attachments/${a.attachmentId}`);
        out.push({ fileName: a.fileName, mimeType: a.mimeType, size: a.size, data: google.fromB64url(d.data).toString('base64') });
      }
      return out;
    },

    // ----- Drive -----
    'drive.newFile': async (p) => google.drive.list(gapi(), `'${google.esc(google.idFrom(p.folderId || 'root'))}' in parents and trashed = false`, 3),
    'drive.list': async (p) => google.drive.list(gapi(), `'${google.esc(google.idFrom(p.folderId || 'root'))}' in parents and trashed = false`, Number(p.max) || 20),
    'drive.search': async (p) => google.drive.list(gapi(), `name contains '${google.esc(p.name)}' and trashed = false`, Number(p.max) || 10),
    'drive.read': async (p) => google.drive.read(gapi(), google.idFrom(p.fileId)),
    'drive.folder': async (p) => {
      const api = gapi();
      const parent = google.idFrom(p.parentId || 'root');
      const existing = await google.drive.list(api, `'${google.esc(parent)}' in parents and name = '${google.esc(p.name)}' and mimeType = '${google.FOLDER}' and trashed = false`, 1);
      if (existing[0]) return { folderId: existing[0].fileId, folderLink: existing[0].link };
      const r = await api(`${google.drive.DR}/files`, { method: 'POST', query: { supportsAllDrives: 'true', fields: 'id,webViewLink' }, body: { name: p.name, mimeType: google.FOLDER, parents: [parent] } });
      return { folderId: r.id, folderLink: r.webViewLink };
    },
    'drive.doc': async (p) => google.drive.upload(gapi(), { parentId: google.idFrom(p.parentId || 'root'), name: p.name, mimeType: 'text/plain; charset=UTF-8', data: p.content, convert: 'application/vnd.google-apps.document' }),
    'drive.upload': async (p, item) => {
      if (!item.data) throw new Error('Pas de fichier à enregistrer : place cette étape après « Récupérer les pièces jointes ».');
      return google.drive.upload(gapi(), { parentId: google.idFrom(p.parentId || 'root'), name: p.fileName || item.fileName || 'fichier', mimeType: item.mimeType, data: Buffer.from(item.data, 'base64') });
    },

    // ----- Agenda -----
    'calendar.upcoming': async (p) => google.calendar.events(gapi(), new Date(), new Date(Date.now() + 2 * 86400000), 3),
    'calendar.list': async (p) => {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      return google.calendar.events(gapi(), new Date(), new Date(start.getTime() + Math.max(1, Number(p.days) || 1) * 86400000));
    },
    'calendar.create': async (p) => {
      const body = { summary: p.title, location: p.where || undefined };
      if (p.time) {
        const start = new Date(`${p.date}T${p.time}:00`);
        if (Number.isNaN(start.getTime())) throw new Error('Date ou heure invalide (AAAA-MM-JJ et HH:MM).');
        body.start = { dateTime: start.toISOString() };
        body.end = { dateTime: new Date(start.getTime() + (Number(p.duration) || 60) * 60000).toISOString() };
      } else {
        const d = new Date(`${p.date}T12:00:00`);
        if (Number.isNaN(d.getTime())) throw new Error('Date invalide (AAAA-MM-JJ).');
        const next = new Date(d.getTime() + 86400000);
        body.start = { date: p.date };
        body.end = { date: next.toISOString().slice(0, 10) };
      }
      const e = await gapi()(google.calendar.CAL, { method: 'POST', body });
      return { eventId: e.id, link: e.htmlLink };
    },

    // ----- Sheets -----
    'sheets.append': async (p) => {
      const id = google.idFrom(p.sheetId);
      const values = String(p.values || '').split('\n');
      const r = await gapi()(`https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${encodeURIComponent(p.range || 'A1')}:append`, { method: 'POST', query: { valueInputOption: 'USER_ENTERED', insertDataOption: 'INSERT_ROWS' }, body: { values: [values] } });
      return { updatedRange: r.updates?.updatedRange || '' };
    },
    'sheets.read': async (p) => {
      const id = google.idFrom(p.sheetId);
      const r = await gapi()(`https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${encodeURIComponent(p.range || 'A1:Z1000')}`);
      const [head, ...rows] = r.values || [];
      if (!head) return [];
      return rows.slice(0, Number(p.max) || 50).map((row) => Object.fromEntries(head.map((h, i) => [String(h || `col${i + 1}`).trim(), row[i] ?? ''])));
    },

    // ----- Messagerie -----
    'slack.send': async (p) => {
      const c = need('slack', 'webhook');
      const r = await fetch(c.webhook, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: p.text }) });
      if (!r.ok) throw new Error(`Slack ${r.status} : ${(await r.text()).slice(0, 100)}`);
      return {};
    },
    'discord.send': async (p) => {
      const c = need('discord', 'webhook');
      const r = await fetch(c.webhook, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: String(p.text).slice(0, 2000), username: p.username || 'FlowCity' }) });
      if (!r.ok) throw new Error(`Discord ${r.status} : ${(await r.text()).slice(0, 100)}`);
      return {};
    },
    'teams.send': async (p) => {
      const c = need('teams', 'webhook');
      const r = await fetch(c.webhook, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: p.text, type: 'message', attachments: [{ contentType: 'application/vnd.microsoft.card.adaptive', content: { type: 'AdaptiveCard', version: '1.4', body: [{ type: 'TextBlock', text: p.text, wrap: true }] } }] }) });
      if (!r.ok) throw new Error(`Teams ${r.status}`);
      return {};
    },
    'telegram.send': async (p) => {
      const c = need('telegram', 'token');
      const chatId = p.chatId || c.chatId;
      if (!chatId) throw new Error('Chat ID Telegram manquant.');
      const r = await postJson(`https://api.telegram.org/bot${c.token}/sendMessage`, { chat_id: chatId, text: String(p.text).slice(0, 4000) }, {}, 'Telegram');
      return { messageId: r.result?.message_id };
    },
    'whatsapp.send': async (p) => {
      const c = need('whatsapp', 'token', 'phoneId');
      const r = await postJson(`https://graph.facebook.com/v21.0/${c.phoneId}/messages`, { messaging_product: 'whatsapp', to: String(p.to).replace(/\D/g, ''), type: 'text', text: { body: p.text } }, { Authorization: `Bearer ${c.token}` }, 'WhatsApp');
      return { messageId: r.messages?.[0]?.id };
    },
    'sms.send': async (p) => {
      const c = need('sms', 'sid', 'token', 'from');
      const r = await fetchJson(`https://api.twilio.com/2010-04-01/Accounts/${c.sid}/Messages.json`, { method: 'POST', headers: { Authorization: `Basic ${Buffer.from(`${c.sid}:${c.token}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ To: p.to, From: c.from, Body: p.text }) }, 'Twilio');
      return { sid: r.sid };
    },
    'ntfy.send': async (p) => {
      const c = need('ntfy', 'topic');
      const server = (c.server || 'https://ntfy.sh').replace(/\/+$/, '');
      const r = await fetch(`${server}/${encodeURIComponent(c.topic)}`, { method: 'POST', headers: { Title: encodeURIComponent(p.title || 'FlowCity'), Priority: String(p.priority || 3), Tags: 'cityscape' }, body: p.text });
      if (!r.ok) throw new Error(`ntfy ${r.status}`);
      return {};
    },
    'email.compose': async (p) => {
      ctx.openExternal(`mailto:${encodeURIComponent(p.to || '')}?subject=${encodeURIComponent(p.subject || '')}&body=${encodeURIComponent(p.body || '')}`);
      return {};
    },

    // ----- Organisation -----
    'notion.page': async (p) => {
      const c = need('notion', 'token');
      const h = { Authorization: `Bearer ${c.token}`, 'Notion-Version': '2022-06-28' };
      const dbId = google.idFrom(p.databaseId).replace(/^.*?([0-9a-f]{32}).*$/i, '$1');
      const db = await fetchJson(`https://api.notion.com/v1/databases/${dbId}`, { headers: h }, 'Notion');
      const titleProp = Object.entries(db.properties || {}).find(([, v]) => v.type === 'title')?.[0] || 'Name';
      const children = p.content ? String(p.content).split('\n\n').slice(0, 50).map((t) => ({ object: 'block', type: 'paragraph', paragraph: { rich_text: [{ type: 'text', text: { content: t.slice(0, 1900) } }] } })) : [];
      const r = await postJson('https://api.notion.com/v1/pages', { parent: { database_id: dbId }, properties: { [titleProp]: { title: [{ text: { content: p.title } }] } }, children }, h, 'Notion');
      return { pageId: r.id, link: r.url };
    },
    'trello.card': async (p) => {
      const c = need('trello', 'key', 'token');
      const q = new URLSearchParams({ idList: p.listId, name: p.name, desc: p.desc || '', key: c.key, token: c.token });
      const r = await fetchJson(`https://api.trello.com/1/cards?${q}`, { method: 'POST' }, 'Trello');
      return { cardId: r.id, link: r.shortUrl };
    },
    'todoist.task': async (p) => {
      const c = need('todoist', 'token');
      const r = await postJson('https://api.todoist.com/api/v1/tasks', { content: p.content, ...(p.due ? { due_string: p.due, due_lang: 'fr' } : {}) }, { Authorization: `Bearer ${c.token}` }, 'Todoist');
      return { taskId: r.id, link: r.url || `https://app.todoist.com/app/task/${r.id}` };
    },
    'airtable.create': async (p) => {
      const c = need('airtable', 'token');
      const fields = {};
      for (const line of String(p.fields || '').split('\n')) {
        const m = line.match(/^\s*([^=:]+?)\s*[=:]\s*(.*)$/);
        if (m) fields[m[1]] = m[2];
      }
      const r = await postJson(`https://api.airtable.com/v0/${p.baseId}/${encodeURIComponent(p.table)}`, { records: [{ fields }], typecast: true }, { Authorization: `Bearer ${c.token}` }, 'Airtable');
      return { recordId: r.records?.[0]?.id };
    },
    'outlook.send': async (p) => {
      const c = need('outlook', 'token');
      const r = await fetch('https://graph.microsoft.com/v1.0/me/sendMail', { method: 'POST', headers: { Authorization: `Bearer ${c.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ message: { subject: p.subject, body: { contentType: 'Text', content: p.body }, toRecipients: String(p.to).split(/[,;]/).map((a) => ({ emailAddress: { address: a.trim() } })) } }) });
      if (!r.ok) throw new Error(`Outlook ${r.status} : ${(await r.text()).slice(0, 150)}`);
      return {};
    },

    // ----- IA -----
    'claude.ask': async (p) => ({ answer: await askLLM('claude', p.prompt) }),
    'openai.ask': async (p) => ({ answer: await askLLM('openai', p.prompt) }),
    'mistral.ask': async (p) => ({ answer: await askLLM('mistral', p.prompt) }),
    'claude.classify': async (p) => {
      const cats = String(p.categories || '').split(',').map((s) => s.trim()).filter(Boolean);
      const a = await askLLM('claude', `Catégories possibles : ${cats.join(', ')}\n\nTexte :\n${p.text}`, { system: 'Tu es un classeur. Réponds uniquement par le nom exact d’une des catégories proposées, sans ponctuation ni phrase.', max: 300 });
      const clean = a.toLowerCase().replace(/[^\p{L}\p{N} -]/gu, '').trim();
      return { category: cats.find((c) => c.toLowerCase() === clean) || cats.find((c) => clean.includes(c.toLowerCase())) || cats[cats.length - 1] || clean };
    },
    'claude.extract': async (p) => {
      const fields = String(p.fields || '').split(',').map((s) => s.trim()).filter(Boolean);
      const a = await askLLM('claude', `Champs à extraire : ${fields.join(', ')}\n\nTexte :\n${p.text}`, { system: 'Extrais les informations demandées. Réponds uniquement avec un objet JSON dont les clés sont exactement les champs demandés (chaîne vide si l’information est absente).', max: 1000 });
      try {
        const j = JSON.parse(a.slice(a.indexOf('{'), a.lastIndexOf('}') + 1));
        return Object.fromEntries(fields.map((f) => [f, j[f] ?? '']));
      } catch {
        throw new Error('Réponse de l’IA illisible (JSON attendu).');
      }
    },

    // ----- Automatisation & web -----
    'n8n.webhook': async (p, item) => ({ response: await webhookPost(p.url, item, 'n8n') }),
    'make.webhook': async (p, item) => ({ response: await webhookPost(p.url, item, 'Make') }),
    'zapier.webhook': async (p, item) => ({ response: await webhookPost(p.url, item, 'Zapier') }),
    'webhook.in': async () => [{ body: { exemple: 'Appelle l’adresse de la Gare pour envoyer de vraies données.' }, query: {}, receivedAt: new Date().toISOString() }],
    'http.check': async (p) => {
      if (!/^https?:\/\//.test(p.url || '')) throw new Error('Adresse invalide (http:// ou https://).');
      const t0 = Date.now();
      try {
        const r = await fetch(p.url, { method: 'GET', headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(Math.max(1, Number(p.timeout) || 10) * 1000) });
        return { up: r.ok ? 'oui' : 'non', status: r.status, ms: Date.now() - t0, checkedAt: new Date().toISOString() };
      } catch (e) {
        return { up: 'non', status: 0, ms: Date.now() - t0, error: e.message, checkedAt: new Date().toISOString() };
      }
    },
    'http.request': async (p) => {
      if (!/^https?:\/\//.test(p.url || '')) throw new Error('Adresse invalide (http:// ou https://).');
      const headers = { 'User-Agent': UA, ...parseHeaders(p.headers) };
      const method = (p.method || 'GET').toUpperCase();
      let body;
      if (method !== 'GET' && method !== 'DELETE' && String(p.body || '').trim()) {
        body = p.body;
        if (!Object.keys(headers).some((k) => k.toLowerCase() === 'content-type')) headers['Content-Type'] = 'application/json';
      }
      const r = await fetch(p.url, { method, headers, body });
      const text = (await r.text()).slice(0, 50000);
      let data = null;
      try {
        data = JSON.parse(text);
      } catch {
        /* texte */
      }
      if (!r.ok) throw new Error(`HTTP ${r.status} : ${text.slice(0, 150)}`);
      return { status: r.status, response: text.slice(0, 4000), data };
    },
    'github.issue': async (p) => {
      const c = need('github', 'token');
      const r = await postJson(`https://api.github.com/repos/${p.repo}/issues`, { title: p.title, body: p.body || '' }, { Authorization: `Bearer ${c.token}`, Accept: 'application/vnd.github+json' }, 'GitHub');
      return { issueNumber: r.number, link: r.html_url };
    },
    'rss.newItem': async (p) => (await readFeed(p.url)).slice(0, 3),
    'rss.read': async (p) => (await readFeed(p.url)).slice(0, Number(p.max) || 5),
    'youtube.newVideo': async (p) => (await readFeed(`https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(p.channelId)}`)).slice(0, 3),
    'weather.forecast': async (p) => {
      const g = await fetchJson(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(p.city || 'Paris')}&count=1&language=fr`, {}, 'Météo');
      const loc = g.results?.[0];
      if (!loc) throw new Error(`Ville introuvable : ${p.city}`);
      const f = await fetchJson(`https://api.open-meteo.com/v1/forecast?latitude=${loc.latitude}&longitude=${loc.longitude}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max&timezone=auto&forecast_days=1`, {}, 'Météo');
      const d = f.daily || {};
      const out = { city: loc.name, tempMin: d.temperature_2m_min?.[0], tempMax: d.temperature_2m_max?.[0], rain: d.precipitation_sum?.[0], wind: d.wind_speed_10m_max?.[0] };
      out.summary = `${out.city} : ${Math.round(out.tempMin)}° → ${Math.round(out.tempMax)}°, ${out.rain > 0.2 ? `pluie ${out.rain} mm` : 'pas de pluie'}, vent ${Math.round(out.wind)} km/h.`;
      return out;
    },
    'homeassistant.service': async (p) => {
      const c = need('homeassistant', 'url', 'token');
      const [domain, service] = String(p.service).split('.');
      if (!domain || !service) throw new Error('Service au format domaine.service (ex. light.turn_on).');
      await postJson(`${c.url.replace(/\/+$/, '')}/api/services/${domain}/${service}`, { entity_id: p.entity }, { Authorization: `Bearer ${c.token}` }, 'Home Assistant');
      return {};
    },
    'spotify.open': async (p) => {
      if (!/^https:\/\/open\.spotify\.com\//.test(p.url || '')) throw new Error('Lien Spotify attendu (https://open.spotify.com/…).');
      ctx.openExternal(p.url);
      return {};
    },
    'social.post': async (p, item) => {
      if (p.webhook) {
        await webhookPost(p.webhook, { network: p.network, text: p.text, image: p.image, item }, 'Publication');
        return { prepared: true };
      }
      ctx.addTask({ title: `Publier sur ${p.network} : ${String(p.text).slice(0, 80)}`, priority: 2 });
      return { prepared: true };
    },
    'stripe.payments': async (p) => {
      const c = need('stripe', 'secret');
      const r = await fetchJson(`https://api.stripe.com/v1/charges?limit=${Math.min(50, Number(p.max) || 10)}`, { headers: { Authorization: `Bearer ${c.secret}` } }, 'Stripe');
      return (r.data || []).map((x) => ({ amount: x.amount / 100, currency: x.currency, customer: x.billing_details?.email || x.customer || '', date: new Date(x.created * 1000).toISOString().slice(0, 10), status: x.status }));
    },
  };

  async function webhookPost(url, payload, label) {
    if (!/^https?:\/\//.test(url || '')) throw new Error(`Adresse du webhook ${label} manquante.`);
    const clean = { ...payload };
    delete clean.data; // pas de fichiers binaires dans un webhook
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': UA }, body: JSON.stringify({ source: 'flowcity', sentAt: new Date().toISOString(), ...clean }) });
    const text = await r.text();
    if (!r.ok) throw new Error(`${label} ${r.status} : ${text.slice(0, 150)}`);
    return text.slice(0, 2000);
  }

  async function call(op, params, item, run = {}) {
    const fn = ops[op];
    if (!fn) throw new Error(`« ${op} » n’est pas encore exécutable pour de vrai : utilise la simulation.`);
    return fn(params, item || {}, run);
  }

  // Formule (logic.code) : exécutée dans un bac à sable, 100 ms maximum, sans accès à Node.
  function evalExpr(expr, item) {
    try {
      return vm.runInNewContext(String(expr || 'null'), { item: JSON.parse(JSON.stringify(item || {})), Math, Date, JSON, String, Number }, { timeout: 100 });
    } catch (e) {
      throw new Error(`Formule invalide : ${e.message}`);
    }
  }

  // ----- Déclencheurs par interrogation : renvoie les nouveaux éléments depuis le dernier passage -----
  async function poll(node, cursor) {
    const p = node.params || {};
    const c = cursor || {};
    const first = !cursor;
    const seen = new Set(c.seen || []);
    const keep = (list) => [...list, ...seen].slice(0, 300);
    switch (node.op) {
      case 'gmail.newEmail': {
        const api = gapi();
        const ids = await google.gmail.ids(api, p.query || 'in:inbox', 25);
        const fresh = first ? [] : ids.filter((id) => !seen.has(id)).slice(0, 10);
        const items = await Promise.all(fresh.map((id) => google.gmail.get(api, id)));
        return { items, cursor: { seen: keep(ids) } };
      }
      case 'drive.newFile': {
        const since = c.since || new Date().toISOString();
        const files = first ? [] : await google.drive.list(gapi(), `'${google.esc(google.idFrom(p.folderId || 'root'))}' in parents and trashed = false and createdTime > '${since}'`, 20);
        const items = files.filter((f) => !seen.has(f.fileId));
        return { items, cursor: { since: first ? since : items[0]?.created || since, seen: keep(items.map((f) => f.fileId)) } };
      }
      case 'calendar.upcoming': {
        const minutes = Math.max(1, Number(p.minutes) || 30);
        const evs = await google.calendar.events(gapi(), new Date(), new Date(Date.now() + (minutes + 6) * 60000), 20);
        const due = evs.filter((e) => e.start?.includes('T') && new Date(e.start).getTime() - Date.now() <= minutes * 60000);
        const items = due.filter((e) => !seen.has(`${e.eventId}@${e.start}`));
        return { items, cursor: { seen: keep(items.map((e) => `${e.eventId}@${e.start}`)) } };
      }
      case 'rss.newItem':
      case 'youtube.newVideo': {
        const list = node.op === 'rss.newItem' ? await readFeed(p.url) : await readFeed(`https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(p.channelId)}`);
        const items = first ? [] : list.filter((x) => x.link && !seen.has(x.link)).slice(0, 5);
        return { items, cursor: { seen: keep(list.map((x) => x.link).filter(Boolean)) } };
      }
      default:
        return { items: [], cursor: c };
    }
  }

  return { call, poll, evalExpr, askLLM };
}

// ----- Test d'une connexion (Centrale électrique) -----
async function testService(service, c, { email } = {}) {
  const bearer = (t) => ({ Authorization: `Bearer ${t}` });
  switch (service) {
    case 'google': {
      if (!google.isConnected(email)) throw new Error('Non connecté');
      const p = await google.makeApi(email)('https://gmail.googleapis.com/gmail/v1/users/me/profile');
      return `Gmail : ${p.emailAddress} (${p.messagesTotal} mails)`;
    }
    case 'claude': {
      const client = new Anthropic({ apiKey: c.apiKey });
      const page = await client.models.list({ limit: 3 });
      return `Clé valide (${page.data.length ? page.data.map((m) => m.id).join(', ') : 'modèles disponibles'})`;
    }
    case 'openai': return (await fetchJson('https://api.openai.com/v1/models', { headers: bearer(c.apiKey) }, 'OpenAI'), 'Clé valide');
    case 'mistral': return (await fetchJson('https://api.mistral.ai/v1/models', { headers: bearer(c.apiKey) }, 'Mistral'), 'Clé valide');
    case 'telegram': return `Bot @${(await fetchJson(`https://api.telegram.org/bot${c.token}/getMe`, {}, 'Telegram')).result?.username}`;
    case 'notion': return `Intégration « ${(await fetchJson('https://api.notion.com/v1/users/me', { headers: { ...bearer(c.token), 'Notion-Version': '2022-06-28' } }, 'Notion')).name} »`;
    case 'trello': return `Compte ${(await fetchJson(`https://api.trello.com/1/members/me?key=${c.key}&token=${c.token}`, {}, 'Trello')).username}`;
    case 'todoist': return (await fetchJson('https://api.todoist.com/api/v1/projects', { headers: bearer(c.token) }, 'Todoist'), 'Jeton valide');
    case 'airtable': return `Compte ${(await fetchJson('https://api.airtable.com/v0/meta/whoami', { headers: bearer(c.token) }, 'Airtable')).email || 'valide'}`;
    case 'github': return `Compte ${(await fetchJson('https://api.github.com/user', { headers: { ...bearer(c.token), 'User-Agent': UA } }, 'GitHub')).login}`;
    case 'n8n': {
      const r = await fetchJson(`${String(c.url).replace(/\/+$/, '')}/api/v1/workflows?limit=100`, { headers: { 'X-N8N-API-KEY': c.apiKey, accept: 'application/json' } }, 'n8n');
      return `${(r.data || []).length} workflow(s) dans ton n8n`;
    }
    case 'homeassistant': return (await fetchJson(`${String(c.url).replace(/\/+$/, '')}/api/`, { headers: bearer(c.token) }, 'Home Assistant')).message || 'Connecté';
    case 'stripe': return (await fetchJson('https://api.stripe.com/v1/balance', { headers: bearer(c.secret) }, 'Stripe'), 'Clé valide');
    case 'sms': return `Compte ${(await fetchJson(`https://api.twilio.com/2010-04-01/Accounts/${c.sid}.json`, { headers: { Authorization: `Basic ${Buffer.from(`${c.sid}:${c.token}`).toString('base64')}` } }, 'Twilio')).friendly_name}`;
    case 'whatsapp': return (await fetchJson(`https://graph.facebook.com/v21.0/${c.phoneId}`, { headers: bearer(c.token) }, 'WhatsApp')).display_phone_number || 'Connecté';
    case 'outlook': return `Compte ${(await fetchJson('https://graph.microsoft.com/v1.0/me', { headers: bearer(c.token) }, 'Microsoft')).userPrincipalName}`;
    case 'ntfy': {
      const server = (c.server || 'https://ntfy.sh').replace(/\/+$/, '');
      const r = await fetch(`${server}/${encodeURIComponent(c.topic)}`, { method: 'POST', headers: { Title: 'FlowCity', Tags: 'white_check_mark' }, body: 'Connexion réussie : ta ville peut te prévenir !' });
      if (!r.ok) throw new Error(`ntfy ${r.status}`);
      return 'Notification de test envoyée sur ton téléphone';
    }
    case 'slack':
    case 'discord':
    case 'teams': {
      const body = service === 'discord' ? { content: '✅ FlowCity est connecté à ce salon !', username: 'FlowCity' } : { text: '✅ FlowCity est connecté à ce canal !' };
      const r = await fetch(c.webhook, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!r.ok) throw new Error(`${service} ${r.status}`);
      return 'Message de test envoyé';
    }
    default:
      return 'Enregistré (pas de test automatique pour ce service)';
  }
}

module.exports = { createConnectors, testService, parseFeed };
