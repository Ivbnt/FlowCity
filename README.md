# Map TRS — la ville 3D de THE RED STUDIO

Application Windows qui transforme le Google Drive **THE RED STUDIO** en petite ville 3D néon :

| Dans le Drive | Dans la ville |
|---|---|
| Dossier racine `THE RED STUDIO` | Le **QG** (tour rouge au centre) |
| Dossiers de 1er niveau (COMMUNICATION, EVENT, ADMINISTRATIF, MUSIQUE) | Les **quartiers** (une couleur chacun) |
| Sous-dossiers | Les **maisons** (hauteur = quantité de contenu, fenêtres allumées = activité récente) |
| Fichiers au 2e niveau | Des **panneaux** lumineux (bleu = Doc, vert = Sheet…) |
| Contenu d'une maison | Les **chambres**, qui flottent autour de la maison quand on clique dessus |
| Projet « avorté » / « terminé » | Maison en ruine / liseré doré |

## Les lieux de la ville

| Lieu | Où | Ce qu'on y trouve |
|---|---|---|
| 📚 **Bibliothèque** | au centre | le point central de Claude : archives (projets terminés, abandonnés, événements passés), ses compétences et les extensions connectées |
| 🏛️ **Mairie** + 🏦 **Banque** (reliées) | ADMINISTRATIF | la mairie regroupe statuts, licences, assurances, fiches artistes, stratégie ; la banque le budget (BUDGET ASSO, gestion des budgets, tableau de bord des dépenses…) |
| 🎙️ **Studio d'enregistrement** | MUSIQUE | un disque d'or par artiste (dossiers de FICHES ARTISTES + Excel Artiste) avec ses sons et maquettes, et les « salles » (création, sorties, visuels) |
| 🎸 **Magasin de musique** | MUSIQUE | tout le matériel qu'on a (repris de « Excel Full Matos check ») et ce qu'on veut acheter (besoins du plan de développement) |
| 🎤 **Salle de concert** | EVENT | les affiches des événements : à venir d'un côté, terminés empilés de l'autre ; date, lieu, équipe et documents de chaque événement |
| 🏫 **École** | près du centre | les membres de l'asso, qui jouent dans la cour ; leurs rôles, leurs dossiers Drive, leurs tâches. Quand on ouvre un événement, son équipe part à la salle de concert |
| 🔔 **Clocher** + 🗓️ **tableau** | près du centre | rappels et deadlines (la cloche sonne et Windows notifie) ; l'emploi du temps de la semaine affiché sur le tableau |
| 📬 **Facteur** | partout | il fait la tournée des bâtiments ; clique dessus pour le courrier du jour (dernières modifs du Drive) |

## Ce que fait l'application

- **Tâches partout** : chaque maison a un « hall » (tâches du projet) et chaque chambre sa propre liste. Les badges au-dessus des maisons montrent les tâches ouvertes (rouge = urgent).
- **Conseiller « projet complet »** : pour chaque événement, l'appli vérifie ce qui existe dans le dossier (présentation, budget prévisionnel, équipe, artistes, matériel, com, SACEM, captation, bilan) et affiche un score + ce qui manque, avec un bouton « + tâche ». Pour ADMINISTRATIF, COMMUNICATION et MUSIQUE, l'évaluation se fait à l'échelle du quartier.
- **Feuille de route BP** : les 3 pôles du *Plan de développement 2026-2028* (Musique, Événementiel, Radio/Média) avec les besoins humains et matériels à cocher, et l'état du business plan (sections présentes / manquantes).
- **Claude dans la ville** : une console pour donner des consignes à Claude. L'agent (bonhomme orange) marche jusqu'à la maison sur laquelle il travaille. Il peut lire les docs/sheets, faire le point, créer et cocher des tâches, **créer des dossiers et des Google Docs**, et **lancer des workflows n8n**. Toute écriture dans le Drive ou vers n8n demande ton accord.
- **Routines** : des agents Claude (violets) qui travaillent tout seuls à intervalle régulier (point hebdo, détection des dossiers vides, relances partenaires…).
- **n8n** : tes workflows apparaissent comme des drones roses au-dessus du quartier correspondant à leur tag. Bouton ▶ pour les déclencher via leur webhook. C'est la porte d'entrée vers Slack, Discord, Gmail, Agenda, Notion, Instagram…

Sans aucune connexion, l'application fonctionne déjà avec un **instantané du Drive au 12/10/2026** et des tâches de départ tirées des vrais documents (référencement Google de la feuille « Stratégie communication », 32 associations à contacter, budget 93Mesures vide, etc.).

## Lancer l'application (Windows)

1. Installe **Node.js LTS** depuis [nodejs.org](https://nodejs.org/fr) (une seule fois, « Suivant » partout).
2. Sur GitHub, ouvre la branche du projet → bouton vert **Code** → **Download ZIP**, puis décompresse le dossier.
3. Double-clique sur **`Lancer Map TRS.bat`**. La première fois, l'installation des composants prend 1 à 3 minutes, puis la ville s'ouvre.

Pour avoir un vrai `.exe` (installeur avec raccourci sur le bureau, ou version portable) : double-clique sur **`Creer l'exe Windows.bat`**. Les fichiers apparaissent dans le dossier `release`.

> Windows SmartScreen peut avertir car l'exe n'est pas signé : « Informations complémentaires » → « Exécuter quand même ».

Le workflow GitHub **Build Windows** (onglet Actions) fabrique aussi les `.exe` automatiquement, si les GitHub Actions sont disponibles sur le compte.

En ligne de commande : `npm install`, puis `npm start` (lancer), `npm run dev` (développement), `npm run dist:win` (fabriquer les .exe).

## Connecter les outils (menu 🔌 Intégrations)

1. **Claude** — crée une clé sur [console.anthropic.com](https://console.anthropic.com) → *API Keys*, colle-la. Modèle par défaut : Claude Opus 5.5.
2. **Google Drive** (lecture/écriture en direct) :
   1. [console.cloud.google.com](https://console.cloud.google.com) → nouveau projet → *APIs & Services* → activer **Google Drive API** ;
   2. *Écran de consentement OAuth* → externe → ajoute les adresses de l'équipe en « utilisateurs test » ;
   3. *Identifiants* → *Créer un ID client OAuth* → type **Application de bureau** ;
   4. colle le Client ID et le secret dans l'appli → **Connecter** (le navigateur s'ouvre). La ville se reconstruit avec le Drive réel.
3. **n8n** — dans n8n : *Settings → n8n API → Create API key*. Renseigne l'URL de l'instance et la clé. Pour qu'un workflow soit déclenchable, ajoute-lui un nœud **Webhook** (ou colle l'URL du webhook dans *Agents & automatisations*). Mets-lui un tag du nom d'un quartier pour que son drone vole au-dessus.

Les clés et jetons sont stockés **chiffrés** (Windows DPAPI via Electron `safeStorage`) dans `%APPDATA%/Map TRS/map-trs.json`, avec les tâches et les routines.

## Architecture

```
electron/
  main.cjs      fenêtre, IPC, tâches, routines planifiées, outils exécutés pour Claude
  claude.cjs    boucle d'agent (API Messages + outils) avec validation humaine des écritures
  google.cjs    OAuth bureau (PKCE, boucle locale) + Drive v3 : arborescence, lecture, création
  n8n.cjs       liste des workflows (API v1) et déclenchement par webhook
  store.cjs     stockage JSON local + secrets chiffrés
  preload.cjs   pont sécurisé vers l'interface
shared/
  advisor.mjs   règles de complétude par type de projet + feuille de route BP
  seed.mjs      tâches de départ
  drive-snapshot.json  instantané de l'arborescence du Drive
src/
  city.js       scène Three.js (quartiers, maisons, chambres, agents, drones, bloom)
  main.js       interface : panneaux, tâches, console Claude, modales
  api.js        accès au processus principal (+ mode démo dans un navigateur)
```

## Idées pour la suite
- Synchroniser les tâches dans une Google Sheet partagée (pour que toute l'équipe voie les mêmes tâches) ;
- Agenda des événements (Google Calendar) affiché sur la place du QG ;
- Avatars de l'équipe dans la ville (qui travaille sur quoi) ;
- Modèles 3D personnalisés (studio, salle de concert, radio) à la place des maisons génériques.
