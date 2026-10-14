// Habitants et rôles : qui fait partie de la ville, et ce que chacun a le droit d'y faire.
// Trois rôles de base (Créateur, Gestionnaire, Membre) ; on peut en créer d'autres en cochant
// des droits écrits en français courant.

export const PERMS = [
  { id: 'build', icon: '🏗️', label: 'Construire, déplacer et démolir des bâtiments' },
  { id: 'automate', icon: '🔗', label: 'Créer et modifier des automatisations' },
  { id: 'run', icon: '▶', label: 'Lancer, mettre en marche ou arrêter les automatisations' },
  { id: 'connect', icon: '⚡', label: 'Brancher des comptes à la Centrale électrique' },
  { id: 'tasks', icon: '✅', label: 'Gérer les tâches et le bloc-notes' },
  { id: 'people', icon: '👥', label: 'Ajouter des personnes et changer leur rôle' },
  { id: 'roles', icon: '🎭', label: 'Créer et modifier les rôles' },
  { id: 'settings', icon: '⚙️', label: 'Réglages de la ville (nom, mode de jeu, sauvegarde, remise à zéro)' },
];
const ALL = Object.fromEntries(PERMS.map((p) => [p.id, true]));

export const DEFAULT_ROLES = [
  { id: 'createur', name: 'Créateur', emoji: '👑', color: '#ffd23f', builtin: true, locked: true, desc: 'A fondé la ville : tous les droits, pour toujours.', perms: { ...ALL } },
  { id: 'gestionnaire', name: 'Gestionnaire', emoji: '🧭', color: '#33c6ff', builtin: true, desc: 'Construit, automatise et gère les membres.', perms: { build: true, automate: true, run: true, connect: true, tasks: true, people: true, roles: false, settings: false } },
  { id: 'membre', name: 'Membre', emoji: '🙂', color: '#2fd17a', builtin: true, desc: 'Visite la ville, essaie et lance les automatisations, gère les tâches.', perms: { build: false, automate: false, run: true, connect: false, tasks: true, people: false, roles: false, settings: false } },
];

// Droit nécessaire pour chaque action sur la ville (absent = libre, ex. journal interne)
export const ACTION_PERM = {
  place: 'build', move: 'build', remove: 'build', configure: 'build', roads: 'build', autobuild: 'build', connect: 'build', 'blueprint.save': 'build', 'blueprint.delete': 'build',
  'workflow.save': 'automate', 'workflow.fromTemplate': 'automate', 'workflow.delete': 'automate',
  'workflow.toggle': 'run',
  'task.add': 'tasks', 'task.update': 'tasks', 'task.delete': 'tasks', 'notes.save': 'tasks',
  'city.rename': 'settings', 'city.sandbox': 'settings', 'city.profile': 'settings', 'city.usage': 'settings', reset: 'settings', taxes: 'settings',
  'people.add': 'people', 'people.update': 'people', 'people.remove': 'people',
  'role.save': 'roles', 'role.delete': 'roles',
};

const norm = (e) => String(e || '').trim().toLowerCase();
export function ensurePeople(city) {
  if (!Array.isArray(city.roles) || !city.roles.length) city.roles = structuredClone(DEFAULT_ROLES);
  for (const r of DEFAULT_ROLES) if (!city.roles.some((x) => x.id === r.id)) city.roles.push(structuredClone(r));
  // Le rôle Créateur garde toujours tous les droits
  Object.assign(city.roles.find((r) => r.id === 'createur'), { perms: { ...ALL }, locked: true, builtin: true });
  if (!Array.isArray(city.people)) city.people = [];
  const owner = norm(city.owner?.email);
  if (owner && !city.people.some((p) => norm(p.email) === owner)) city.people.unshift({ email: owner, name: city.owner.name || owner, roleId: 'createur', addedAt: city.createdAt || new Date().toISOString() });
  for (const p of city.people) if (!city.roles.some((r) => r.id === p.roleId)) p.roleId = 'membre';
  return city;
}
export function personOf(city, email) {
  return (city.people || []).find((p) => norm(p.email) === norm(email)) || null;
}
export function roleOf(city, email) {
  if (norm(email) && norm(email) === norm(city.owner?.email)) return city.roles?.find((r) => r.id === 'createur') || DEFAULT_ROLES[0];
  const p = personOf(city, email);
  return p ? city.roles.find((r) => r.id === p.roleId) || null : null;
}
export function can(city, email, perm) {
  if (!perm) return true;
  return Boolean(roleOf(city, email)?.perms?.[perm]);
}
export function permsOf(city, email) {
  return Object.fromEntries(PERMS.map((p) => [p.id, can(city, email, p.id)]));
}
// On ne peut donner que des droits qu'on a soi-même (un gestionnaire ne peut pas fabriquer un créateur).
function assignable(city, actor, role) {
  if (!role || role.id === 'createur') return false;
  if (actor === undefined) return true;
  return PERMS.every((p) => !role.perms?.[p.id] || can(city, actor, p.id));
}
const rid = () => `role_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

// Actions sur les habitants et les rôles. `actor` = e-mail de la personne qui agit.
export function applyPeopleAction(city, a, actor, log) {
  ensurePeople(city);
  const findRole = (id) => {
    const r = city.roles.find((x) => x.id === id);
    if (!r) throw new Error('Rôle introuvable');
    return r;
  };
  switch (a.type) {
    case 'people.add': {
      const email = norm(a.email);
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('Adresse e-mail invalide.');
      if (personOf(city, email)) throw new Error('Cette personne fait déjà partie de la ville.');
      const role = findRole(a.roleId || 'membre');
      if (!assignable(city, actor, role)) throw new Error(`Tu ne peux pas donner le rôle « ${role.name} » : il a des droits que tu n’as pas.`);
      const p = { email, name: String(a.name || '').trim().slice(0, 60) || email.split('@')[0], roleId: role.id, addedAt: new Date().toISOString(), addedBy: actor || null };
      city.people.push(p);
      log(`👥 ${p.name} rejoint la ville (${role.emoji} ${role.name})`);
      return p;
    }
    case 'people.update': {
      const p = personOf(city, a.email);
      if (!p) throw new Error('Personne introuvable');
      if (p.roleId === 'createur' && a.roleId && a.roleId !== 'createur') throw new Error('Le créateur garde son rôle.');
      if (a.name !== undefined) p.name = String(a.name).trim().slice(0, 60) || p.name;
      if (a.roleId && a.roleId !== p.roleId) {
        const role = findRole(a.roleId);
        if (!assignable(city, actor, role)) throw new Error(`Tu ne peux pas donner le rôle « ${role.name} » : il a des droits que tu n’as pas.`);
        if (!assignable(city, actor, findRole(p.roleId))) throw new Error('Tu ne peux pas changer le rôle de quelqu’un qui a plus de droits que toi.');
        p.roleId = role.id;
        log(`🎭 ${p.name} devient ${role.emoji} ${role.name}`);
      }
      return p;
    }
    case 'people.remove': {
      const p = personOf(city, a.email);
      if (!p) throw new Error('Personne introuvable');
      if (p.roleId === 'createur') throw new Error('Le créateur ne peut pas être retiré de sa ville.');
      if (!assignable(city, actor, findRole(p.roleId))) throw new Error('Tu ne peux pas retirer quelqu’un qui a plus de droits que toi.');
      city.people = city.people.filter((x) => x !== p);
      log(`👋 ${p.name} a quitté la ville`);
      return null;
    }
    case 'role.save': {
      const r = a.role || {};
      const existing = r.id && city.roles.find((x) => x.id === r.id);
      if (existing?.locked) throw new Error('Le rôle Créateur ne se modifie pas.');
      const perms = Object.fromEntries(PERMS.map((p) => [p.id, Boolean(r.perms?.[p.id])]));
      if (actor !== undefined) for (const p of PERMS) if (perms[p.id] && !can(city, actor, p.id)) throw new Error(`Tu ne peux pas donner le droit « ${p.label} » : tu ne l’as pas toi-même.`);
      const name = String(r.name || '').trim().slice(0, 30);
      if (!name) throw new Error('Donne un nom au rôle.');
      if (city.roles.some((x) => x.id !== r.id && x.name.toLowerCase() === name.toLowerCase())) throw new Error('Un rôle porte déjà ce nom.');
      const clean = { id: existing?.id || rid(), name, emoji: String(r.emoji || '🏷️').slice(0, 4), color: /^#[0-9a-f]{6}$/i.test(r.color) ? r.color : '#9b7bff', desc: String(r.desc || '').slice(0, 160), builtin: Boolean(existing?.builtin), perms };
      if (existing) Object.assign(existing, clean);
      else {
        city.roles.push(clean);
        log(`🎭 Nouveau rôle : ${clean.emoji} ${clean.name}`);
      }
      return clean;
    }
    case 'role.delete': {
      const r = findRole(a.id);
      if (r.builtin) throw new Error('Les rôles de base ne se suppriment pas (tu peux changer leurs droits).');
      const users = city.people.filter((p) => p.roleId === r.id);
      for (const p of users) p.roleId = 'membre';
      city.roles = city.roles.filter((x) => x !== r);
      log(`🗑️ Rôle supprimé : ${r.name}${users.length ? ` (${users.length} personne(s) redevenue(s) Membre)` : ''}`);
      return null;
    }
    default:
      return undefined;
  }
}
