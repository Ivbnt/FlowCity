// Petits utilitaires d'interface : création d'éléments, notifications, fenêtres modales.

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'class') el.className = v;
    else if (k === 'value') el.value = v;
    else if (k === 'checked') el.checked = Boolean(v);
    else if (k === 'html') el.innerHTML = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat(Infinity)) if (c !== null && c !== undefined && c !== false) el.append(c instanceof Node ? c : String(c));
  return el;
}
export const $ = (s, root = document) => root.querySelector(s);
// Remplace le contenu d'un élément en ignorant les valeurs vides (null, false…) comme h().
export function put(el, ...children) {
  el.replaceChildren(...children.flat(Infinity).filter((c) => c !== null && c !== undefined && c !== false));
  return el;
}

export function toast(text, kind = '') {
  const box = $('#fc-toasts');
  if (!box) return;
  const el = h('div', { class: `fc-toast ${kind}` }, text);
  box.append(el);
  setTimeout(() => el.classList.add('out'), 4200);
  setTimeout(() => el.remove(), 4700);
}

// Fenêtre modale ; renvoie { close, el }
export function modal(content, { wide = false, onClose, dismissable = true } = {}) {
  const back = h('div', { class: 'fc-modal-back' });
  const card = h('div', { class: `fc-modal ${wide ? 'wide' : ''}` }, content);
  back.append(card);
  const close = () => {
    back.classList.add('out');
    setTimeout(() => back.remove(), 180);
    onClose?.();
    document.removeEventListener('keydown', esc);
  };
  const esc = (e) => e.key === 'Escape' && dismissable && close();
  if (dismissable) back.addEventListener('pointerdown', (e) => e.target === back && close());
  document.addEventListener('keydown', esc);
  document.body.append(back);
  return { close, el: card };
}

export function confirmBox(text, { ok = 'Confirmer', cancel = 'Annuler', danger = false } = {}) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => {
      if (done) return;
      done = true;
      m.close();
      resolve(v);
    };
    const m = modal(
      h('div', { class: 'fc-confirm' }, h('p', {}, text), h('div', { class: 'fc-row end' }, h('button', { class: 'fc-btn ghost', onclick: () => finish(false) }, cancel), h('button', { class: `fc-btn ${danger ? 'danger' : 'primary'}`, onclick: () => finish(true) }, ok))),
      { onClose: () => finish(false) },
    );
  });
}

export const fmtDate = (iso) => {
  try {
    return new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso;
  }
};
export const plural = (n, w, p = `${w}s`) => `${n} ${n > 1 ? p : w}`;
export function fmtMinutes(min) {
  const m = Math.round(min);
  if (m < 60) return `${m} min`;
  const hh = Math.floor(m / 60);
  return hh < 48 ? `${hh} h ${String(m % 60).padStart(2, '0')}` : `${Math.round(hh / 24)} j`;
}
export async function guard(fn, okText) {
  try {
    const r = await fn();
    if (okText) toast(okText, 'ok');
    return r;
  } catch (e) {
    toast(String(e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''), 'error');
    return undefined;
  }
}
