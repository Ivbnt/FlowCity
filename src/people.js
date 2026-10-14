// Panneau « Habitants » : les personnes de la ville, leur rôle, et les rôles eux-mêmes
// (droits à cocher, en français courant).
import { h, toast, guard, confirmBox } from './dom.js';
import { PERMS, roleOf, can, permsOf } from '../shared/people.mjs';

const EMOJIS = ['🏷️', '🤝', '🛠️', '📣', '💼', '🎓', '🧑‍💻', '🧾', '👀', '⭐', '🧹', '🎨'];
const initials = (n) => String(n || '?').split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((x) => x[0].toUpperCase()).join('');

// ctx = { api, city(), status(), close(), rerender() }
export function peoplePanel(ctx) {
  const c = ctx.city();
  const me = ctx.status().session?.email;
  const myRole = roleOf(c, me);
  const mine = permsOf(c, me);
  const canPeople = mine.people;
  const canRoles = mine.roles;
  // Un rôle est attribuable si ses droits sont inclus dans les miens (et ce n'est pas Créateur)
  const assignable = (r) => r.id !== 'createur' && PERMS.every((p) => !r.perms[p.id] || mine[p.id]);
  const count = (id) => c.people.filter((p) => p.roleId === id).length;
  const act = (a, ok) => guard(() => ctx.api.city.act(a), ok);

  // ----- Habitants -----
  const people = c.people.map((p) => {
    const r = c.roles.find((x) => x.id === p.roleId);
    const isMe = p.email === me;
    const editable = canPeople && p.roleId !== 'createur' && !isMe && assignable(r || { perms: {} });
    return h('div', { class: 'fc-person' },
      h('span', { class: 'fc-person-av', style: { background: r?.color || '#888' } }, initials(p.name)),
      h('div', { class: 'grow' }, h('b', {}, p.name, isMe ? ' (toi)' : ''), h('small', {}, p.email)),
      editable
        ? h('select', { class: 'fc-input role-sel', onchange: (e) => act({ type: 'people.update', email: p.email, roleId: e.target.value }, 'Rôle changé') }, ...c.roles.filter((x) => x.id === p.roleId || assignable(x)).map((x) => h('option', { value: x.id, selected: x.id === p.roleId }, `${x.emoji} ${x.name}`)))
        : h('span', { class: 'fc-role-badge', style: { '--rc': r?.color } }, `${r?.emoji || ''} ${r?.name || '?'}`),
      editable ? h('button', { class: 'fc-icon-btn tiny', title: 'Retirer de la ville', onclick: async () => (await confirmBox(`Retirer ${p.name} de la ville ?`, { ok: 'Retirer', danger: true })) && act({ type: 'people.remove', email: p.email }) }, '✕') : null,
    );
  });

  // ----- Ajouter quelqu'un -----
  const name = h('input', { class: 'fc-input', placeholder: 'Prénom et nom' });
  const email = h('input', { class: 'fc-input', type: 'email', placeholder: 'son adresse Google (ex. lea@gmail.com)' });
  const role = h('select', { class: 'fc-input' }, ...c.roles.filter(assignable).map((x) => h('option', { value: x.id, selected: x.id === 'membre' }, `${x.emoji} ${x.name}`)));
  const add = canPeople
    ? h('section', { class: 'fc-sec' },
        h('h3', {}, 'Ajouter une personne'),
        h('div', { class: 'fc-row' }, name, role),
        email,
        h('div', { class: 'fc-row' },
          h('button', { class: 'fc-btn primary', onclick: async () => {
            const r = await act({ type: 'people.add', email: email.value, name: name.value, roleId: role.value }, 'Personne ajoutée');
            if (r) invite(r.info, c, ctx);
          } }, '➕ Ajouter'),
        ),
        h('p', { class: 'fc-muted small' }, 'Elle pourra entrer dans ta ville en se connectant à Flowcity avec ce compte Google sur cet ordinateur. Sur un autre ordinateur : envoie-lui le fichier de la ville (Mairie → Sauvegarder la ville), qu’elle ouvrira avec « Ouvrir une ville ».'),
      )
    : null;

  // ----- Rôles -----
  const roles = c.roles.map((r) => roleCard(r));
  function roleCard(r, isNew = false) {
    const draft = structuredClone(r);
    const editable = canRoles && !r.locked;
    const save = h('button', { class: 'fc-btn small primary hidden', onclick: () => act({ type: 'role.save', role: draft }, isNew ? 'Rôle créé' : 'Rôle enregistré') }, isNew ? 'Créer le rôle' : 'Enregistrer');
    const dirty = () => save.classList.remove('hidden');
    const head = editable && (isNew || !r.builtin)
      ? h('div', { class: 'fc-row' },
          h('select', { class: 'fc-input emoji-sel', onchange: (e) => ((draft.emoji = e.target.value), dirty()) }, ...[...new Set([draft.emoji, ...EMOJIS])].map((x) => h('option', { selected: x === draft.emoji }, x))),
          h('input', { class: 'fc-input', value: draft.name, placeholder: 'Nom du rôle (ex. Comptable)', oninput: (e) => ((draft.name = e.target.value), dirty()) }),
          h('input', { type: 'color', value: draft.color, oninput: (e) => ((draft.color = e.target.value), dirty()) }),
        )
      : null;
    const perms = h('div', { class: 'fc-perms' },
      ...PERMS.map((p) =>
        h('label', { class: `fc-perm ${draft.perms[p.id] ? 'on' : ''}`, title: editable && !mine[p.id] ? 'Tu ne peux pas donner un droit que tu n’as pas' : '' },
          h('input', { type: 'checkbox', checked: draft.perms[p.id], disabled: !editable || !mine[p.id], onchange: (e) => ((draft.perms[p.id] = e.target.checked), e.target.parentElement.classList.toggle('on', e.target.checked), dirty()) }),
          h('span', {}, p.icon), h('span', {}, p.label),
        ),
      ),
    );
    return h('details', { class: 'fc-role-card', open: isNew },
      h('summary', {}, h('span', { class: 'fc-role-badge', style: { '--rc': r.color } }, `${r.emoji} ${r.name || 'Nouveau rôle'}`), h('small', { class: 'fc-muted' }, r.locked ? 'tous les droits' : `${PERMS.filter((p) => r.perms[p.id]).length} droit(s)`), h('small', { class: 'fc-muted' }, isNew ? '' : `· ${count(r.id)} pers.`)),
      r.desc ? h('p', { class: 'fc-muted small' }, r.desc) : null,
      head,
      perms,
      h('div', { class: 'fc-row' },
        save,
        editable && !r.builtin && !isNew ? h('button', { class: 'fc-btn small ghost', onclick: async () => (await confirmBox(`Supprimer le rôle « ${r.name} » ? Les personnes concernées redeviendront Membres.`, { ok: 'Supprimer', danger: true })) && act({ type: 'role.delete', id: r.id }) }, '🗑️ Supprimer le rôle') : null,
      ),
    );
  }
  const newRoleBox = h('div', {});
  const newRole = canRoles
    ? h('button', { class: 'fc-btn block', onclick: () => {
        const base = c.roles.find((x) => x.id === 'membre');
        newRoleBox.replaceChildren(roleCard({ id: null, name: '', emoji: '🏷️', color: '#9b7bff', perms: { ...base.perms }, desc: '' }, true));
        newRoleBox.querySelector('input.fc-input')?.focus();
      } }, '➕ Créer un nouveau rôle')
    : null;

  return [
    h('header', { class: 'fc-panel-head' }, h('span', { class: 'em' }, '👥'), h('div', { class: 'grow' }, h('b', { class: 'fc-panel-title' }, 'Habitants'), h('small', {}, `${c.people.length} personne${c.people.length > 1 ? 's' : ''} · ${c.name}`)), h('button', { class: 'fc-icon-btn', onclick: () => ctx.close() }, '✕')),
    h('div', { class: 'fc-panel-body' },
      h('div', { class: 'fc-myrole', style: { '--rc': myRole?.color } },
        h('b', {}, `Ton rôle : ${myRole?.emoji || ''} ${myRole?.name || 'aucun'}`),
        PERMS.every((p) => mine[p.id]) ? h('p', { class: 'fc-muted small' }, 'Tous les droits : tu peux tout faire dans cette ville.') : h('ul', {}, ...PERMS.filter((p) => mine[p.id]).map((p) => h('li', {}, p.icon, ' ', p.label))),
        PERMS.some((p) => !mine[p.id]) ? h('small', { class: 'fc-muted' }, `Pas autorisé : ${PERMS.filter((p) => !mine[p.id]).map((p) => p.label.toLowerCase()).join(' ; ')}.`) : null,
      ),
      h('section', { class: 'fc-sec' }, h('h3', {}, 'Les habitants'), ...people),
      add,
      h('section', { class: 'fc-sec' }, h('h3', {}, 'Les rôles'), h('p', { class: 'fc-muted small' }, 'Chaque rôle est une liste de droits. Ouvre un rôle pour voir (ou changer) ce qu’il permet.'), ...roles, newRoleBox, newRole),
    ),
  ];
}

// Message d'invitation tout prêt (ouvre la messagerie de l'utilisateur)
function invite(p, c, ctx) {
  const subject = `Rejoins ma ville « ${c.name} » sur Flowcity`;
  const body = `Bonjour ${p.name},\n\nJe t’ai ajouté(e) à ma ville « ${c.name} » sur Flowcity, l’application où l’on automatise son organisation en construisant une ville.\n\nPour y entrer : ouvre Flowcity et connecte-toi avec ton compte Google (${p.email}). Si tu es sur un autre ordinateur, je t’envoie aussi le fichier de la ville : ouvre-le depuis la Mairie (« Ouvrir une ville »).\n\nÀ bientôt !`;
  toast('Tu peux la prévenir par mail : le message est prêt.', 'ok');
  const url = `mailto:${encodeURIComponent(p.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  ctx.api.openUrl(url);
}

export { can };
