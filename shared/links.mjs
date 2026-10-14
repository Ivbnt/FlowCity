// Connexions entre les lieux de la ville : qui travaille avec qui (artistes ↔ beatmakers, artistes ↔ projets)
// et où partent les papiers (documents administratifs → mairie, budget → banque).
// Deux sources : les collaborations saisies à la main (registre « collabs ») et celles déduites du Drive
// (un fichier « prod Gapple » dans la fiche d'un artiste, un « budget prévisionnel » dans un projet…).
import { norm, walk } from './advisor.mjs';

export const LINK_KINDS = {
  prod: { name: 'Prod', color: '#ffb020', icon: '🎛️' },
  feat: { name: 'Feat', color: '#ff5577', icon: '🎤' },
  mix: { name: 'Mix / master', color: '#33c6ff', icon: '🎚️' },
  clip: { name: 'Clip / visuel', color: '#ff6bd5', icon: '🎬' },
  live: { name: 'Live / scène', color: '#ff8a3d', icon: '🎸' },
  projet: { name: 'Joue dans le projet', color: '#ffd76b', icon: '⭐' },
  budget: { name: 'Budget', color: '#2fd17a', icon: '💶' },
  admin: { name: 'Administratif', color: '#9b7bff', icon: '📄' },
  gestion: { name: 'Gestion', color: '#d8cdb8', icon: '🔗' },
  autre: { name: 'Collab', color: '#c9ccff', icon: '🤝' },
};

const BUDGET_KW = ['budget', 'devis', 'facture', 'subvention', 'compta', 'tresor', 'depense', 'recette', 'remboursement', 'note de frais', 'bilan financier'];
const ADMIN_KW = ['contrat', 'convention', 'sacem', 'assurance', 'licence', 'autorisation', 'statut', 'attestation', 'declaration', 'partenariat', 'cession', 'pv ', 'proces verbal', 'cerfa'];

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Le mot doit être entier ("Asher" dans "prod 409Asher" oui, "arles" dans "Charles" non).
export function mentions(text, name) {
  const n = norm(name).trim();
  if (n.replace(/[^a-z0-9]/g, '').length < 3) return false;
  return new RegExp(`(^|[^a-z])${esc(n)}($|[^a-z])`).test(norm(text));
}
const hasKw = (name, kws) => {
  const n = ` ${norm(name)} `;
  return kws.some((k) => n.includes(k));
};

export const isBeatmaker = (a) => a.type === 'beatmaker' || /beat|prod/i.test(a.role || '');

/**
 * Toutes les connexions de la ville.
 * Renvoie [{ id, a, b, kind, auto, docs: [{id, name, kind, url}], note }] où a / b sont des ids de la ville :
 * 'artist:<id>' (artistes et beatmakers), id d'un projet EVENT, 'lm:mairie', 'lm:bank'.
 */
export function buildLinks(tree, layout, reg) {
  const out = new Map();
  const add = (a, b, kind, { auto = true, doc = null, note = '', id = null } = {}) => {
    if (!a || !b || a === b) return;
    const [x, y] = a < b ? [a, b] : [b, a];
    const key = `${x}|${y}|${kind}`;
    const l = out.get(key) || { id: id || key, a: x, b: y, kind, auto, docs: [], note };
    if (!auto) l.auto = false;
    if (note && !l.note) l.note = note;
    if (doc && !l.docs.some((d) => d.id === doc.id)) l.docs.push({ id: doc.id, name: doc.name, kind: doc.kind, url: doc.url });
    out.set(key, l);
  };
  const artists = reg?.artists || [];
  const makers = artists.filter(isBeatmaker);
  const singers = artists.filter((a) => !isBeatmaker(a));

  // 1. Collaborations saisies à la main
  // collabs : { id, from: 'artist:<id>' | id de projet, to: idem, kind, note }
  for (const c of reg?.collabs || []) add(c.from, c.to, LINK_KINDS[c.kind] ? c.kind : 'autre', { auto: false, note: c.note || '', id: c.id });

  // 2. Fichiers d'un artiste qui citent un beatmaker (et inversement), fiches « projets »
  const filesOf = (a) => {
    const list = [];
    const folder = a.folderId && findIn(tree, a.folderId);
    if (folder) walk(folder, (n) => n !== folder && list.push(n));
    return list;
  };
  for (const s of singers) {
    const files = filesOf(s);
    for (const m of makers) {
      for (const f of files) if (mentions(f.name, m.name)) add(`artist:${s.id}`, `artist:${m.id}`, 'prod', { doc: f });
      if (mentions(`${s.projects || ''} ${s.career || ''}`, m.name)) add(`artist:${s.id}`, `artist:${m.id}`, 'prod');
    }
    for (const o of singers) if (o !== s && files.some((f) => mentions(f.name, o.name) && /feat|ft\.?|x /.test(norm(f.name)))) add(`artist:${s.id}`, `artist:${o.id}`, 'feat', { doc: files.find((f) => mentions(f.name, o.name)) });
  }
  for (const m of makers) for (const f of filesOf(m)) for (const s of singers) if (mentions(f.name, s.name)) add(`artist:${s.id}`, `artist:${m.id}`, 'prod', { doc: f });
  // Partout dans le Drive : un fichier qui cite un artiste ET un beatmaker (« Roxas - prod Gapple.wav »), ou deux artistes en feat
  if (artists.length > 1) {
    walk(tree, (n) => {
      if (n.kind === 'folder') return;
      const who = artists.filter((a) => mentions(n.name, a.name));
      if (who.length < 2) return;
      for (const x of who) {
        for (const y of who) {
          if (x.id >= y.id) continue;
          const bx = isBeatmaker(x);
          const by = isBeatmaker(y);
          if (bx !== by) add(`artist:${x.id}`, `artist:${y.id}`, 'prod', { doc: n });
          else if (!bx && /feat|ft\.?| x /.test(` ${norm(n.name)} `)) add(`artist:${x.id}`, `artist:${y.id}`, 'feat', { doc: n });
        }
      }
    });
  }

  // 3. Projets EVENT / TRS Radio : artistes cités, documents de budget (→ banque) et administratifs (→ mairie)
  for (const L of layout?.values?.() || []) {
    for (const sub of L.subs || []) {
      if (sub.kind !== 'project' || !sub.node) continue;
      const pid = sub.node.id;
      walk(sub.node, (n) => {
        if (n === sub.node) return;
        if (hasKw(n.name, BUDGET_KW)) add(pid, 'lm:bank', 'budget', { doc: n });
        else if (hasKw(n.name, ADMIN_KW)) add(pid, 'lm:mairie', 'admin', { doc: n });
        for (const a of artists) if (mentions(n.name, a.name)) add(pid, `artist:${a.id}`, 'projet', { doc: n });
      });
      const info = (reg?.events || []).find((e) => e.projectId === pid);
      for (const a of artists) if (info && mentions(`${info.lineup || ''} ${info.note || ''}`, a.name)) add(pid, `artist:${a.id}`, 'projet');
    }
  }
  // 4. La mairie et la banque travaillent toujours ensemble
  add('lm:mairie', 'lm:bank', 'gestion');
  return [...out.values()];
}

function findIn(tree, id) {
  let found = null;
  walk(tree, (n) => {
    if (!found && n.id === id) found = n;
  });
  return found;
}

export const linksOf = (links, id) => links.filter((l) => l.a === id || l.b === id);
export const otherEnd = (l, id) => (l.a === id ? l.b : l.a);
