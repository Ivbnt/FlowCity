// Interface du bureau privé : le portail à code (8 chiffres), le poste Claude admin et le coffre-fort.
import { buildOffices, OFFICES } from './office.js';
import { pickFile } from './widgets.js';

export function makeOffice(ctx) {
  const { h, icon, api, state, toast, panelLayout, select, codePad, nav, rerender } = ctx;
  const S = { log: [], busy: false, auto: false, docs: null, notes: null, room: null };
  const kicker = (label) => [{ label: `🔐 Bureau de ${OFFICES.find((o) => o.key === state.office?.key)?.name || ''}`.trim() }, { label }];
  const fmtSize = (n) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} Mo` : `${Math.max(1, Math.round(n / 1024))} Ko`);

  async function refresh() {
    try {
      state.office = await api.office.status();
    } catch {
      state.office = { owner: false };
    }
    return state.office;
  }

  // Portail : pavé numérique dans une fenêtre au centre de l'écran
  function gate() {
    if (!state.office?.owner) return toast('Ce bureau est privé.', 'error');
    if (state.office.unlocked) return enter();
    document.exitPointerLock?.();
    const modal = h('div', { class: 'modal office-gate' });
    const close = () => modal.remove();
    const pad = codePad({
      max: 8,
      onSubmit: async (code) => {
        const r = await api.office.unlock(code);
        if (r.denied) return 'Ce bureau est privé.';
        if (!r.ok) return r.wait ? `Bloqué : réessaie dans ${r.wait} s.` : `Code incorrect${r.left ? ` (${r.left} essai${r.left > 1 ? 's' : ''})` : ''}.`;
        await refresh();
        close();
        enter();
        if (!r.custom && !state.office.custom) toast('Pense à choisir ton code à 8 chiffres (coffre-fort → Code)', '');
        return null;
      },
    });
    pad.prepend(h('div', { class: 'lock-ico' }, '🔐'), h('b', {}, 'Bureau privé'), h('p', { class: 'muted' }, 'Code à 8 chiffres, puis ✓ (ou Entrée).'));
    modal.append(h('div', { class: 'modal-card sheet' }, h('button', { class: 'icon-btn gate-x', title: 'Fermer', onclick: close }, icon('x', 15)), pad));
    modal.addEventListener('click', (e) => e.target === modal && close());
    document.body.querySelector('#app').append(modal);
  }

  // Entrée en POV dans la pièce, avec son avatar
  function enter() {
    S.room = buildOffices({ mine: state.office?.key, members: state.registry?.members || [] });
    nav.enterRoom(S.room);
    select(null);
    toast('Bienvenue. Ton bureau est la porte ouverte ; vise le poste Claude ou le coffre et appuie sur E.', 'ok');
  }
  // Objets visés dans les bureaux (E ou clic)
  function interact(id) {
    const [, what, key] = id.split(':');
    if (what === 'lift') return state.office?.owner ? gate() : toast('Étage de la direction : privé.', 'error');
    const o = OFFICES.find((x) => x.key === key);
    const mine = key === state.office?.key;
    if (what === 'plaque') {
      const m = (state.registry?.members || []).find((x) => (x.name || '').toLowerCase() === key);
      return toast(`${o?.name} — ${(m ? [m.role, m.title].filter(Boolean) : o?.fallback || []).join(' · ')}`, '');
    }
    if (!mine) return toast(`Bureau de ${o?.name || key} : privé.`, 'error');
    if (what === 'claude') return select('office:claude');
    if (what === 'vault') return select('office:vault');
    return null;
  }
  function leave() {
    nav.exitRoom();
    select(null);
  }

  function onEvent(evt) {
    const push = (cls, text) => {
      S.log.push({ cls, text });
      if (S.log.length > 200) S.log.shift();
    };
    if (evt.type === 'start') S.busy = true;
    if (evt.type === 'tool') push('tool', `${ctx.toolLabel(evt.name)}`);
    if (evt.type === 'text') push('claude', evt.text);
    if (evt.type === 'error') push('err', evt.error);
    if (evt.type === 'done' || evt.type === 'error') S.busy = false;
    if (state.selectedId === 'office:claude') rerender();
  }

  const closed = (panel, title) =>
    panelLayout(panel, { kicker: kicker(title), title, color: '#ff2d55', body: [h('div', { class: 'empty' }, 'Le bureau est fermé.', h('button', { class: 'btn primary', onclick: gate }, 'Entrer le code'))] });

  // Poste Claude admin
  function claude(panel) {
    if (!state.office?.unlocked) return closed(panel, 'Claude · admin');
    const input = h('textarea', { rows: 3, placeholder: 'Demande à Claude (admin) : comptes, accès, journal, registres, coffre…' });
    const send = async () => {
      const prompt = input.value.trim();
      if (!prompt || S.busy) return;
      S.log.push({ cls: 'me', text: prompt });
      S.busy = true;
      rerender();
      try {
        await api.agent.run({ agentId: 'office', prompt, admin: true, autoApprove: S.auto });
      } catch (e) {
        S.busy = false;
        S.log.push({ cls: 'err', text: e.message });
        rerender();
      }
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        send();
      }
    });
    const log = h('div', { class: 'office-log' }, ...(S.log.length ? S.log.map((m) => h('div', { class: `msg ${m.cls}` }, m.text)) : [h('p', { class: 'muted small' }, 'Claude travaille ici avec le modèle le plus puissant et les autorisations admin. Rien de ce qui se dit ici n’est visible des autres membres.')]));
    panelLayout(panel, {
      kicker: kicker('Poste Claude'),
      title: 'Claude · admin',
      color: '#e0805f',
      actions: [
        h('button', { class: 'btn soft', onclick: () => api.agent.stop('office') }, icon('stop', 14), 'Stop'),
        h('button', { class: 'btn soft', onclick: () => {
          api.agent.reset('office');
          S.log = [];
          rerender();
        } }, icon('refresh', 14), 'Nouvelle'),
      ],
      body: [
        h('label', { class: 'check-row' }, h('input', { type: 'checkbox', checked: S.auto, onchange: (e) => (S.auto = e.target.checked) }), 'Valider automatiquement ses actions (comptes, accès, Drive)'),
        log,
        h('div', { class: 'chat-input office-input' }, input, h('button', { class: 'send', title: 'Envoyer', disabled: S.busy, onclick: send }, S.busy ? '…' : icon('send', 16))),
      ],
    });
    setTimeout(() => {
      log.scrollTop = log.scrollHeight;
      input.focus();
    }, 30);
  }

  // Coffre-fort : documents chiffrés, notes privées, code du bureau
  function vault(panel) {
    if (!state.office?.unlocked) return closed(panel, 'Coffre-fort');
    if (!S.docs) {
      Promise.all([api.office.vaultList(), api.office.notesGet()])
        .then(([d, n]) => {
          S.docs = d;
          S.notes = n;
          rerender();
        })
        .catch((e) => toast(e.message, 'error'));
      return panelLayout(panel, { kicker: kicker('Coffre-fort'), title: 'Coffre-fort', color: '#c9a227', body: [h('p', { class: 'muted' }, 'Ouverture du coffre…')] });
    }
    state.tab ||= 'docs';
    const tab = state.tab;
    let body;
    if (tab === 'docs') {
      body = [
        h('button', { class: 'btn primary full', onclick: async () => {
          try {
            const f = await pickFile('*/*');
            S.docs = await api.office.vaultAdd(f);
            toast('Document rangé dans le coffre (chiffré)', 'ok');
            rerender();
          } catch (e) {
            if (e.message !== 'Aucun fichier') toast(e.message, 'error');
          }
        } }, icon('plus', 14), 'Ranger un document'),
        S.docs.length
          ? h('div', { class: 'files vault-docs' }, ...S.docs.map((d) => h('div', { class: 'file' },
            h('span', { class: 'ico' }, '📄'),
            h('div', { class: 'grow' }, h('b', {}, d.name), h('small', {}, `${fmtSize(d.size)} · ${new Date(d.at).toLocaleDateString('fr-FR')}`)),
            h('button', { class: 'icon-btn tiny', title: 'Ouvrir', onclick: () => api.office.vaultOpen(d.id).catch((e) => toast(e.message, 'error')) }, icon('doc', 13)),
            h('button', { class: 'icon-btn tiny', title: 'Retirer du coffre', onclick: async () => {
              if (!window.confirm(`Retirer « ${d.name} » du coffre ?`)) return;
              S.docs = await api.office.vaultRemove(d.id);
              rerender();
            } }, icon('trash', 13)))))
          : h('div', { class: 'empty' }, 'Le coffre est vide.'),
      ];
    } else if (tab === 'notes') {
      const ta = h('textarea', { rows: 14, placeholder: 'Notes privées (chiffrées sur ce PC)' }, S.notes || '');
      body = [ta, h('button', { class: 'btn soft full', onclick: async () => {
        await api.office.notesSave(ta.value);
        S.notes = ta.value;
        toast('Notes enregistrées', 'ok');
      } }, 'Enregistrer')];
    } else {
      const o = h('input', { type: 'password', inputmode: 'numeric', maxlength: 8, placeholder: 'Code actuel' });
      const n = h('input', { type: 'password', inputmode: 'numeric', maxlength: 8, placeholder: 'Nouveau code (8 chiffres)' });
      body = [
        h('p', { class: 'muted' }, state.office.custom ? 'Ton code à 8 chiffres est en place.' : 'Le code est encore 0000 : choisis ton code à 8 chiffres, que toi seul connais.'),
        h('div', { class: 'two' }, o, n),
        h('button', { class: 'btn primary full', onclick: async () => {
          try {
            state.office = await api.office.setCode(o.value, n.value);
            toast('Code du bureau changé', 'ok');
            rerender();
          } catch (e) {
            toast(e.message, 'error');
          }
        } }, 'Changer le code'),
        h('button', { class: 'btn soft full', onclick: async () => {
          state.office = await api.office.lock();
          S.docs = null;
          S.notes = null;
          leave();
        } }, '🔒 Fermer le bureau et sortir'),
      ];
    }
    panelLayout(panel, {
      kicker: kicker('Coffre-fort'),
      title: 'Coffre-fort',
      color: '#c9a227',
      tabs: [{ key: 'docs', label: 'Documents', count: S.docs.length }, { key: 'notes', label: 'Notes' }, { key: 'code', label: 'Code' }],
      body,
    });
  }

  return { refresh, gate, enter, leave, interact, onEvent, claude, vault, reset: () => Object.assign(S, { docs: null, notes: null, log: [] }) };
}
