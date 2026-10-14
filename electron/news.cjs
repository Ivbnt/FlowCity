// Bureau de journaliste : lit les flux RSS / Atom des médias suivis (sites et chaînes YouTube).
// Pour un site sans adresse de flux connue, on cherche le <link rel="alternate"> de la page d'accueil ;
// pour une chaîne YouTube, on retrouve son identifiant depuis son @nom ou une recherche.
const store = require('./store.cjs');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

// Médias suivis par défaut (liste partagée avec l'aperçu navigateur)
const DEFAULT_SOURCES = require('../shared/media.json');

function sources() {
  const saved = store.get('newsSources');
  if (!Array.isArray(saved) || !saved.length) return DEFAULT_SOURCES.map((s) => ({ ...s, enabled: true }));
  // Les nouvelles sources par défaut (ex. le skate) s'ajoutent à une liste déjà personnalisée
  const removed = new Set(store.get('newsRemoved') || []);
  const extra = DEFAULT_SOURCES.filter((d) => !saved.some((x) => x.id === d.id) && !removed.has(d.id)).map((d) => ({ ...d, enabled: true }));
  return [...saved.map((x) => ({ group: 'press', ...x })), ...extra];
}
function saveSources(list) {
  const ids = new Set(list.map((x) => x.id));
  store.set('newsRemoved', DEFAULT_SOURCES.filter((d) => !ids.has(d.id)).map((d) => d.id));
  store.set('newsSources', list);
  return list;
}

async function get(url, timeout = 12000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  try {
    const r = await fetch(url, { headers: { 'user-agent': UA, accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, text/html;q=0.8, */*;q=0.5', 'accept-language': 'fr-FR,fr;q=0.9' }, signal: ctrl.signal, redirect: 'follow' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return { text: await r.text(), url: r.url };
  } finally {
    clearTimeout(t);
  }
}

const decode = (s) =>
  String(s || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&apos;|&rsquo;/g, '’')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
const tag = (block, name) => {
  const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i'));
  return m ? m[1] : '';
};

// RSS 2.0 et Atom (dont les flux YouTube)
function parseFeed(xml) {
  const items = [];
  const blocks = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) || xml.match(/<entry[\s>][\s\S]*?<\/entry>/gi) || [];
  for (const b of blocks.slice(0, 25)) {
    const title = decode(tag(b, 'title'));
    let link = decode(tag(b, 'link'));
    if (!link) link = (b.match(/<link[^>]*rel="alternate"[^>]*href="([^"]+)"/i) || b.match(/<link[^>]*href="([^"]+)"/i) || [])[1] || '';
    const date = decode(tag(b, 'pubDate') || tag(b, 'published') || tag(b, 'updated') || tag(b, 'dc:date'));
    const desc = decode(tag(b, 'description') || tag(b, 'summary') || tag(b, 'media:description') || tag(b, 'content')).slice(0, 280);
    const thumb = (b.match(/<media:thumbnail[^>]*url="([^"]+)"/i) || b.match(/<enclosure[^>]*url="([^"]+\.(?:jpg|jpeg|png|webp)[^"]*)"/i) || [])[1] || null;
    const video = /yt:videoId/.test(b);
    if (title && link) items.push({ title, link: link.replace(/&amp;/g, '&'), date: date ? new Date(date).toISOString() : null, desc, thumb, video });
  }
  return items;
}
const isFeed = (txt) => /<(rss|feed|rdf:RDF)[\s>]/i.test(txt.slice(0, 2000));

async function discoverFeed(site) {
  const { text, url } = await get(site);
  if (isFeed(text)) return url;
  const m = text.match(/<link[^>]+type="application\/(?:rss|atom)\+xml"[^>]*>/i);
  const href = m && (m[0].match(/href="([^"]+)"/i) || [])[1];
  if (!href) throw new Error('aucun flux RSS sur le site');
  return new URL(href.replace(/&amp;/g, '&'), url).href;
}

async function youtubeChannel(yt) {
  const cache = store.get('newsYtCache') || {};
  const key = yt.channelId || yt.handle || yt.query;
  if (yt.channelId) return yt.channelId;
  if (cache[key]) return cache[key];
  const find = (html) => (html.match(/"channelId":"(UC[\w-]{22})"/) || html.match(/channel\/(UC[\w-]{22})/) || [])[1];
  let id = null;
  if (yt.handle) id = find((await get(`https://www.youtube.com/@${encodeURIComponent(yt.handle)}`).catch(() => ({ text: '' }))).text);
  if (!id && yt.query) id = find((await get(`https://www.youtube.com/results?search_query=${encodeURIComponent(yt.query)}&sp=EgIQAg%253D%253D`).catch(() => ({ text: '' }))).text);
  if (!id) throw new Error('chaîne YouTube introuvable');
  cache[key] = id;
  store.set('newsYtCache', cache);
  return id;
}

// Essaie dans l'ordre : flux connu, chaîne YouTube, découverte sur le site.
async function fetchSource(src) {
  const tries = [];
  if (src.feed) tries.push(async () => src.feed);
  if (src.youtube) tries.push(async () => `https://www.youtube.com/feeds/videos.xml?channel_id=${await youtubeChannel(src.youtube)}`);
  if (src.site) tries.push(() => discoverFeed(src.site));
  let lastErr = null;
  for (const t of tries) {
    try {
      const feedUrl = await t();
      const { text } = await get(feedUrl);
      if (!isFeed(text)) throw new Error('réponse qui n’est pas un flux');
      const items = parseFeed(text);
      if (items.length) return { items, feedUrl };
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('aucune adresse');
}

let running = null;
async function refresh(force = false) {
  const cache = store.get('newsCache');
  if (!force && cache && Date.now() - Date.parse(cache.at) < 20 * 60000) return cache;
  if (running) return running;
  running = (async () => {
    const list = sources().filter((s) => s.enabled !== false);
    const results = await Promise.all(
      list.map(async (src) => {
        try {
          const { items } = await fetchSource(src);
          return { id: src.id, ok: true, items: items.map((it) => ({ ...it, source: src.id })) };
        } catch (e) {
          // On garde les anciens articles de la source si le site ne répond pas
          const old = (cache?.items || []).filter((it) => it.source === src.id);
          return { id: src.id, ok: false, error: /fetch failed|abort/i.test(e.message) ? 'site injoignable (connexion ?)' : e.message, items: old };
        }
      }),
    );
    const items = results.flatMap((r) => r.items).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    const out = { at: new Date().toISOString(), items, status: Object.fromEntries(results.map((r) => [r.id, r.ok ? { ok: true, n: r.items.length } : { ok: false, error: r.error }])) };
    store.set('newsCache', out);
    return out;
  })();
  try {
    return await running;
  } finally {
    running = null;
  }
}

module.exports = { sources, saveSources, refresh, parseFeed, DEFAULT_SOURCES, cached: () => store.get("newsCache") };
