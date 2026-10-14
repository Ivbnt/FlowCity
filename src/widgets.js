// Petits composants partagés : dépôt de fichier, pavé de signature, graphiques (SVG), CSV.

// Ouvre le sélecteur de fichiers et renvoie { name, mime, data (base64) }.
export function pickFile(accept = '*/*') {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = () => {
      const f = input.files?.[0];
      if (!f) return reject(new Error('Aucun fichier'));
      if (f.size > 15 * 1024 * 1024) return reject(new Error('Fichier trop lourd (15 Mo max)'));
      const r = new FileReader();
      r.onload = () => resolve({ name: f.name, mime: f.type || 'application/octet-stream', data: String(r.result).split(',')[1] || '' });
      r.onerror = () => reject(new Error('Lecture impossible'));
      r.readAsDataURL(f);
    };
    input.click();
  });
}

// Pavé de signature : on signe à la souris ou au doigt. toFile() renvoie une image PNG.
export function signaturePad(h) {
  const c = h('canvas', { class: 'sigpad', width: 520, height: 170 });
  const g = c.getContext('2d');
  const clear = () => {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, c.width, c.height);
    g.strokeStyle = '#c9c9d4';
    g.beginPath();
    g.moveTo(20, 140);
    g.lineTo(500, 140);
    g.stroke();
    g.strokeStyle = '#111';
    g.lineWidth = 2.4;
    g.lineCap = 'round';
    empty = true;
  };
  let empty = true;
  let drawing = false;
  const at = (e) => {
    const r = c.getBoundingClientRect();
    return [((e.clientX - r.left) * c.width) / r.width, ((e.clientY - r.top) * c.height) / r.height];
  };
  c.addEventListener('pointerdown', (e) => {
    drawing = true;
    c.setPointerCapture(e.pointerId);
    g.beginPath();
    g.moveTo(...at(e));
  });
  c.addEventListener('pointermove', (e) => {
    if (!drawing) return;
    g.lineTo(...at(e));
    g.stroke();
    empty = false;
  });
  c.addEventListener('pointerup', () => (drawing = false));
  clear();
  const wrap = h('div', { class: 'sigwrap' }, c, h('button', { class: 'link', type: 'button', onclick: clear }, 'Effacer'));
  return {
    el: wrap,
    isEmpty: () => empty,
    toFile: (name = 'signature.png') => ({ name, mime: 'image/png', data: c.toDataURL('image/png').split(',')[1] }),
    toDataUrl: () => c.toDataURL('image/png'),
  };
}

// Analyse un CSV (séparateur , ou ;) en tableau de lignes.
export function parseCsv(text) {
  const sep = (text.split('\n')[0].match(/;/g) || []).length > (text.split('\n')[0].match(/,/g) || []).length ? ';' : ',';
  const rows = [];
  let row = [];
  let cell = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === sep) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell || row.length) rows.push([...row, cell]);
  return rows.filter((r) => r.some((x) => x.trim()));
}
// "1 234,50 €" → 1234.5
export function toNumber(s) {
  const t = String(s ?? '').replace(/[\s €$%]/g, '').replace(/[^\d,.-]/g, '');
  if (!t || t === '-' ) return null;
  const n = Number(t.includes(',') && !t.includes('.') ? t.replace(',', '.') : t.replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

const SERIES = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#9085e9'];
const fmt = (n) => Number(n).toLocaleString('fr-FR', { maximumFractionDigits: 0 });

// Barres verticales groupées (une ou plusieurs séries), une seule échelle, survol avec infobulle,
// légende dès 2 séries, et vue tableau.
export function barChart(h, { labels, series, unit = '€', height = 220 }) {
  const W = 560;
  const H = height;
  const pad = { l: 46, r: 8, t: 10, b: 38 };
  const max = Math.max(1, ...series.flatMap((s) => s.values.map((v) => Math.abs(v || 0))));
  const step = niceStep(max);
  const top = Math.ceil(max / step) * step;
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const gw = iw / Math.max(1, labels.length);
  const bw = Math.max(3, Math.min(22, (gw - 8) / series.length - 2));
  const ns = 'http://www.w3.org/2000/svg';
  const el = (t, a) => {
    const e = document.createElementNS(ns, t);
    for (const [k, v] of Object.entries(a)) e.setAttribute(k, v);
    return e;
  };
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart' });
  for (let v = 0; v <= top; v += step) {
    const y = pad.t + ih - (v / top) * ih;
    svg.append(el('line', { x1: pad.l, x2: W - pad.r, y1: y, y2: y, class: v ? 'grid' : 'base' }));
    const tx = el('text', { x: pad.l - 6, y: y + 4, class: 'tick', 'text-anchor': 'end' });
    tx.textContent = fmt(v);
    svg.append(tx);
  }
  const tip = h('div', { class: 'chart-tip hidden' });
  labels.forEach((lab, i) => {
    const x0 = pad.l + i * gw + (gw - (bw + 2) * series.length) / 2;
    series.forEach((s, k) => {
      const v = Math.abs(s.values[i] || 0);
      const bh = (v / top) * ih;
      const x = x0 + k * (bw + 2);
      const y = pad.t + ih - bh;
      // Barre : haut arrondi (4px), pied posé sur la ligne de base
      const r = Math.min(4, bw / 2, bh);
      const d = `M${x},${y + bh} V${y + r} Q${x},${y} ${x + r},${y} H${x + bw - r} Q${x + bw},${y} ${x + bw},${y + r} V${y + bh} Z`;
      if (bh > 0.5) svg.append(el('path', { d, fill: s.color || SERIES[k], class: 'bar' }));
      const hit = el('rect', { x: x - 2, y: pad.t, width: bw + 4, height: ih, fill: 'transparent' });
      hit.addEventListener('mouseenter', (e) => {
        tip.replaceChildren(h('b', {}, lab), h('span', {}, h('i', { style: { background: s.color || SERIES[k] } }), `${s.name} : ${fmt(s.values[i] || 0)} ${unit}`));
        tip.classList.remove('hidden');
        const r2 = svg.getBoundingClientRect();
        tip.style.left = `${((x + bw / 2) / W) * r2.width}px`;
        tip.style.top = `${(y / H) * r2.height - 8}px`;
        void e;
      });
      hit.addEventListener('mouseleave', () => tip.classList.add('hidden'));
      svg.append(hit);
    });
    const tx = el('text', { x: pad.l + i * gw + gw / 2, y: H - pad.b + 16, class: 'tick', 'text-anchor': 'middle' });
    tx.textContent = String(lab).slice(0, 10);
    svg.append(tx);
  });
  const legend = series.length > 1 ? h('div', { class: 'legend' }, ...series.map((s, k) => h('span', {}, h('i', { style: { background: s.color || SERIES[k] } }), s.name))) : null;
  const table = h('table', { class: 'chart-table hidden' }, h('tr', {}, h('th', {}, ''), ...series.map((s) => h('th', {}, s.name))), ...labels.map((l, i) => h('tr', {}, h('td', {}, l), ...series.map((s) => h('td', {}, `${fmt(s.values[i] || 0)} ${unit}`)))));
  const toggle = h('button', { class: 'link', type: 'button', onclick: () => table.classList.toggle('hidden') }, 'Voir le tableau');
  return h('div', { class: 'chart-box' }, legend, h('div', { class: 'chart-wrap' }, svg, tip), toggle, table);
}
function niceStep(max) {
  const raw = max / 4;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  return [1, 2, 2.5, 5, 10].map((m) => m * p).find((s) => s >= raw) || raw;
}
export { SERIES };
