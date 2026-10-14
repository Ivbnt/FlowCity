# Map TRS — la ville 3D de THE RED STUDIO

Application Windows qui transforme le Google Drive **THE RED STUDIO** en petite ville 3D néon :

La ville a **7 quartiers** autour d'un rond-point avec fontaine (vrais jets d'eau) et la **statue de Claude**. La rue centrale est la **Rue Chantecrit**, la perpendiculaire l'**Avenue de la République** ; d'autres rues séparent les quartiers éloignés. Autour : le **Jardin de ta sœur** (lac, barque, pêcheurs, les kiffeurs sur leur banc, le foodtruck **Le Gros Glouton** et son chef GAB qui se balade tout nu — barre « censuré » comprise —, pancartes photos), d'autres parcs, des parkings, deux quartiers à la française hors du périphérique — **Le Vieux Bourg** (place du Marché) et **Les Coteaux** (place de l'Église) : rue principale qui serpente, rue en boucle, impasses en raquette, passages piétons pavés, parkings ; chaque maison est tournée vers son accès avec son allée — et une forêt.

| Quartier | Où | Lieux |
|---|---|---|
| 🎤 **ÉVÉNEMENTIEL** | au-dessus de la musique | Salle de concert (affiches, prépa des dossiers, salles partenaires), place des événements (fontaine + statues du RedCat et de l'Afev'tival), un immeuble par événement en cours avec sa statue |
| 🤝 **PARTENAIRES** | au-dessus de l'administratif | un bâtiment par association ou salle partenaire (Apollo…), ajoutées depuis la salle de concert |
| 📻 **TRS RADIO** | à gauche de la musique | 93 Mesures, StudKitchen, Topline, Chamonix : un immeuble par projet avec ses documents et sa statue, et les réseaux TRS (SoundCloud, YouTube, Instagram). Chaque projet peut passer d'Événementiel à TRS Radio ou aux Archives (onglet « Événement » du projet) |
| 🔴 **MUSIQUE** | au fond à gauche | Label, Studio, Radio Spotify, Kebab, Magasin de musique, Beatmakers (FL d'or), maison Gapple (pomme d'or → drive.gappleprod.com), une maison par artiste signé |
| 🟣 **ADMINISTRATIF** | au fond à droite | Tour RED STUDIO, Mairie + Banque (hologramme du budget), concerts à Paris, CGT, caserne, FBI |
| 🔵 **INFORMATION** | devant à gauche | Bibliothèque devenue **cerveau** (avec les **archives** des anciens projets), **Université des agents**, **Automatisations** (l'atelier où les agents, formés à la bibliothèque, exécutent les routines Claude et les workflows n8n), École, Bureau de journaliste, Clocher (Google Agenda) |
| 🟢 **RÉSIDENCES** | devant à droite | une maison par pôle qui grandit avec chaque habitant (terrain vide quand le pôle n'a personne, puis pavillon, maison, villa, immeuble… jusqu'au gratte-ciel), skate park |

## Comptes et niveaux d'accès

Chacun se connecte au lancement : **avec Google** (même Client ID que le Drive) ou en choisissant son nom et son **code** (4 à 8 chiffres). **Tous les codes ont été remis à `0000`** (comptes, clé d'accès des zones sensibles, FBI, bureaux privés) : changez-les vite (le check-up des pompiers liste ceux qui sont encore à 0000). Après 5 codes faux, le compte est bloqué 1 min, puis 5, puis 15.

| Tier | Qui | |
|---|---|---|
| **Tier 1** | le Bureau | tout, y compris valider les inscriptions, les comptes, la matrice des accès, le journal |
| **Tier 2** | l'AG | mairie, clocher, emploi du temps, magasin, quartier musique… |
| **Tier 3** | membres et pôles | école, radio, presse, ville… et les lieux ouverts à leur pôle ou à eux personnellement |
| **IA** | les agents Claude | droits du tier 1 (sauf les coffres). Quand un membre parle à Claude, Claude n'a que les droits de ce membre |

Accès par défaut (modifiables à la mairie, onglet « Comptes & accès ») : École et Spotify pour tous ; Bibliothèque, Université, Label, Studio, Événementiel et TRS Radio au tier 1 ; Clocher et Mairie aux tiers 1-2 ; Banque et CGT au tier 1 **avec la clé d'accès** ; Magasin aux tiers 1-2 + pôles son / lumière / vidéo ; le reste du quartier musique aux tiers 1-2 + tier 3 sur sélection. Chaque pôle peut recevoir d'autres accès, et chaque compte des accès en plus.

**Recensement** : sans compte, on fait une demande d'inscription (pièce d'identité + charte signée dans l'appli ou déposée en PDF). Le Bureau est notifié (Windows + badge sur la mairie), vérifie les pièces, et accepte en choisissant le tier, le nom et les pôles. Les membres pas encore inscrits administrativement ont un bouton « Rappel signature » (e-mail prêt à envoyer).

**Journal** : connexions, entrées dans les lieux protégés, modifications du registre, tâches, demandes à Claude, validations, signatures, fichiers déposés, god mode… Consultable et exportable en CSV par le tier 1 (mairie → Journal).

Les pièces d'identité, chartes et signatures sont **chiffrées** sur le PC (DPAPI). La base est locale à chaque PC : pour partager les comptes entre plusieurs ordinateurs, il faudra un serveur commun (voir « Idées pour la suite »).

## Se déplacer

En haut : **Orbite** (la vue d'ensemble), **Survol** (caméra libre : ZQSD / WASD, Espace monte, C descend, Maj accélère) et **POV** (ton bonhomme, avec ta photo Google). Touche **B** pour changer de mode, **E** pour entrer dans le bâtiment visé.

**Intérieurs** : en POV, **E** devant un bâtiment fait entrer dedans (si ton compte y a accès ; sinon la fiche verrouillée s'ouvre). Chaque lieu a sa déco : console et cabine au studio, disques d'or au label, guichets et salle des coffres à la banque, salle du conseil à la mairie, scène et bar à la salle de concert, camion à la caserne, écrans au FBI, cerveau de Claude à la bibliothèque, salle de classe à l'école… Vise l'écran / le comptoir et appuie sur **E** pour ouvrir la fiche du lieu ; la porte **SORTIE** ramène dans la ville. Pendant la visite, la ville est masquée : c'est très léger.

**Étage de la direction** (ascenseur au fond du hall de la tour RED STUDIO, ou bouton « 🔐 Bureau privé » de la fiche de la tour) : un palier et deux bureaux côte à côte, celui de **Vincent** et celui d'**Ivane**, avec à l'entrée une **plaque dorée** gravée du nom et des fonctions. Chacun n'ouvre que le sien, avec son **code à 8 chiffres** (0000 au départ, à changer dans coffre-fort → Code). Dedans : un **coffre-fort** de documents chiffrés et des notes privées, et un **poste Claude admin** : modèle le plus puissant (Claude Fable 5.1), effort élevé, et outils d'administration (comptes, accès, journal, registres, tâches, coffre) ; ses actions sensibles demandent ta validation, sauf si tu coches « Valider automatiquement ».

En POV : clic pour prendre la souris, **0-6** pour les armes (mains, pistolet, fusil à pompe, fusil d'assaut, sniper avec zoom au clic droit, lance-roquettes, pistolet à eau), **R** recharger, **V** 1re / 3e personne, Espace pour sauter. 100 points de vie : les voitures, les chutes et tes propres roquettes font mal ; à 0, réapparition au hasard dans la ville. Des ballons-cibles flottent pour s'entraîner. Les tirs ne touchent pas les habitants. Code secret du **god mode** : taper `!godfdpivane` (dans la ville ou dans la console Claude) : invincible, munitions infinies, vol.

**Pause obligatoire** : toutes les 2 h d'utilisation, 5 minutes de pause (« pause joint obligatoire »), même si on relance l'appli.

## Les lieux de la ville

| Lieu | Ce qu'on y trouve |
|---|---|
| 🏛️ **Mairie** (T1-2) | habitants, **recensement**, **conseil & AG** (ordre du jour, PV, signature à l'écran pour les tiers 1 et 2), **calendrier administratif**, statuts & PV, comptes & accès et journal (T1) |
| 🏦 **Banque** (T1 + clé) | **structure comptable** (écritures rangées dans le plan comptable associatif, pièces justificatives), tableau de bord (recettes / dépenses, par compte), **graphiques des Sheets** du dossier budget au choix (le tableau de bord par défaut), **subventions** (déplacées de l'école), documents ; le résumé flotte en hologramme au-dessus de la banque |
| 🏫 **École** (tous) | **défis du jour** : une question par thème (son, vie de l'asso, compta, automatisations & IA, sécurité, événementiel, culture), 10 points la bonne réponse, classement ; formations ; documents d'info |
| 🧠 **Bibliothèque — cerveau** (T1 + IA) | les **mémoires** de Claude (relues à chaque conversation, « Compresser la conversation »), ses compétences, les extensions, les archives |
| 🎓 **Université** (T1 + IA) | les **agents spécialisés** (administratif, trésorerie, com, événementiel, TRS Radio, formation, veille), chacun avec ses outils ; l'orchestrateur (la tour RED STUDIO) leur confie des tâches |
| 🔔 **Clocher** (T1-2) | **Google Agenda RED STUDIO** (lecture + ajout), rappels & deadlines |
| ✊ **CGT** (T1 + clé) | actions, **zone d'écriture partagée** (versions et notes), documentaires, **actualités des luttes** + sorties de films et livres, **guide avant la manif** (équipement, sécurité, droits) |
| 🎸 **Magasin** (T1-2 + sélection) | chaque appareil relié à sa **facture / preuve d'obtention** (PDF du Drive ou fichier déposé) ; sans preuve → « en attente de validation » ; liste d'achats |
| 💿 **Label** (T1) | fiches des artistes : présentation, résumé de carrière, projets avec le studio, photo, réseaux |
| 🎛️ **Beatmakers** | un FL d'or par beatmaker, même fiche que les artistes |
| 📻 **Radio Spotify** (tous) | relier son compte Spotify (titres en entier), importer ses playlists (avec un Client ID) |
| 📣 **SoundCloud / YouTube / Instagram TRS** | lien du compte ; les dernières vidéos YouTube |
| 🍏 **Maison Gapple** | lien vers drive.gappleprod.com et la fiche de Gapple |

Les autres lieux (concerts à Paris, kebab, skate park, FBI, presse, caserne, résidences, facteur…) sont décrits plus bas.

## Autres lieux

| Lieu | Ce qu'on y trouve |
|---|---|
| 🏛️ **Mairie** 🔒 | statuts, licences, assurances, fiches artistes, stratégie… et les **habitants** : on y change le titre (maire, adjoint, conseiller, habitant) et le rôle de chaque membre, et on lui rattache des documents |
| 🎟️ **Tableau des concerts** (devant la mairie) | concerts **rap, rock indé et pop** de la semaine à Paris : qui passe, salle, date, heure, prix. Bouton « Mettre à jour la semaine » : Claude cherche sur le web et remplace l'affiche |
| 🥙 **Kebab** | le prix moyen d'un menu kebab à Paris (≈ 12 €, entre 10 et 15 €) ; Claude peut vérifier les prix du moment |
| 🛹 **Skate park** | les skateurs suivis (Nyjah Huston, Tony Hawk, Aurélien Giraud, Vincent Milou, Leticia Bufoni, Yuto Horigome, Rayssa Leal, Sky Brown…) : quand l'un d'eux sort une vidéo (moins de 21 jours), il vient rider au skate park. Onglet magazines : Thrasher, Jenkem, Quartersnacks, Free Skate Mag, Sugar, The Berrics |
| 🕵️ **FBI** | protégé par sa propre clé d'activation (choisie à la première visite, chiffrée, demandée à chaque lancement) : emplacement pour le code de recherche et dossiers d'enquête chiffrés |
| 💿 **Label** 🔒 | nos artistes et leur niveau : signé, membre du studio, adhérent, client, de passage |
| ✊ **CGT** 🔒 | nos actions (date, lieu, statut), nos documentaires (de l'idée à la diffusion) et les documents |
| 🚒 **Caserne des pompiers** 🔒 | les antivirus de chaque poste (fin de licence rappelée par le clocher) et un coffre chiffré pour les codes de sécurité, auquel Claude n'a pas accès |
| 🏠 **Résidences des pôles** 🔒 | les membres de l'asso (selon leur rôle) et les contacts de chaque pôle. La maison grandit avec l'effectif : 1-5 pavillon, 6-10 grande maison, 11-20 villa, 21-50 immeuble, 51-100 grand immeuble, plus de 100 gratte-ciel |
| 🏦 **Banque** 🔒 | BUDGET ASSO, gestion des budgets, tableau de bord des dépenses… |
| 🔴 **Tour RED STUDIO** | le dossier racine : business plan, tâches générales |
| 📻 **Radio (Spotify)** | tes playlists Spotify ; le lecteur reste en bas de l'écran pendant que tu te balades (extraits de 30 s sans compte connecté, bouton ↗ pour écouter dans l'appli Spotify) |
| 🎙️ **Studio** | un disque d'or par artiste avec ses sons et maquettes |
| 🎸 **Magasin de musique** | matériel qu'on a / qu'on veut acheter |
| 🎤 **Salle de concert** | affiches des événements de l'asso, à venir et terminés |
| 🏫 **École** | **formations** quotidiennes et hebdomadaires (lues sur ton API, cf. réglages), **subventions** (modèles FSDIE, calendrier, dossiers 2027…) et **documents d'information** pour lancer un projet |
| 📰 **Bureau de journaliste** | les derniers articles et vidéos de Radio Nova, l'actualité du jour (franceinfo), Alternatives Économiques, Off Investigation, Clément Viktorovitch, Thinkerview, Diable Positif, Vakita, Blast, Slash, Fakir, Mediapart, le Canard enchaîné et ARTE. Les titres défilent sur le bandeau du bâtiment ; « Revue de presse » demande à Claude un résumé du jour. On peut ajouter un média (flux RSS, site ou chaîne YouTube) |
| 📚 **Bibliothèque** | archives, compétences de Claude, extensions connectées |
| 🔔 **Clocher** + 🗓️ **tableau** | rappels et deadlines (la cloche sonne et Windows notifie), emploi du temps de la semaine |
| 📬 **Facteur** | il fait la tournée ; clique dessus pour le courrier du jour (dernières modifs du Drive) |

**Clé d'accès 🔑** : en plus du tier, la banque et la CGT demandent le code d'accès (`0000` pour l'instant, 4 à 8 chiffres, pavé avec ✓ ou Entrée) (à changer dans Réglages → « Code des zones sensibles »). Le post-it derrière l'école est flouté : clique dessus et réponds à la question pour le lire. Une fois entrée, la clé reste valable 10 minutes ; le cadenas en haut à droite referme tout de suite. Les autres lieux protégés (🔒 sur leur étiquette) dépendent uniquement du tier du compte connecté.

**Menu « Affichage »** (en haut à droite) : on y masque ou réaffiche les noms des quartiers, des lieux, des maisons, des personnes, les compteurs, les noms des parcs, les voitures et passants, les oiseaux, les avions, les skateurs et les drones n8n, et la **qualité** (Auto / Haute / Normale / Éco ; en Auto, l'appli baisse d'un cran toute seule si la ville rame). Le choix est mémorisé. Les étiquettes ne se chevauchent plus : les quartiers et les lieux passent devant, les autres s'effacent tant qu'elles seraient cachées.

**Les habitants** sont les membres de l'asso : Vincent (président) est le **maire**, Ivane (vice-président, trésorier) son **adjoint** ; ils portent l'écharpe tricolore et restent autour de la mairie. Les techniciens, photographes et vidéastes se promènent près des lieux de musique, l'organisation dans le quartier administratif, les autres partout. Quand on ouvre un événement, son équipe part à la salle de concert.

## Ce que fait l'application

- **Tâches partout** : chaque maison a un « hall » (tâches du projet) et chaque chambre sa propre liste. Les badges au-dessus des maisons montrent les tâches ouvertes (rouge = urgent).
- **Conseiller « projet complet »** : pour chaque événement, l'appli vérifie ce qui existe dans le dossier (présentation, budget prévisionnel, équipe, artistes, matériel, com, SACEM, captation, bilan) et affiche un score + ce qui manque, avec un bouton « + tâche ». Pour ADMINISTRATIF, COMMUNICATION et MUSIQUE, l'évaluation se fait à l'échelle du quartier.
- **Feuille de route BP** : les 3 pôles du *Plan de développement 2026-2028* (Musique, Événementiel, Radio/Média) avec les besoins humains et matériels à cocher, et l'état du business plan (sections présentes / manquantes).
- **Claude dans la ville** : une console pour donner des consignes à Claude. L'agent (bonhomme orange) marche jusqu'à la maison sur laquelle il travaille. Il peut lire les docs/sheets, faire le point, créer et cocher des tâches, **créer des dossiers et des Google Docs**, et **lancer des workflows n8n**. Toute écriture dans le Drive ou vers n8n demande ton accord.
- **Routines** : des agents Claude (violets) qui travaillent tout seuls à intervalle régulier (point hebdo, détection des dossiers vides, relances partenaires…).
- **Connexions (invisibles)** : l'appli repère qui travaille avec qui (un fichier « Roxas - prod Gapple » relie l'artiste et le beatmaker, un artiste cité dans un projet, un budget prévisionnel → banque, un contrat / la SACEM → mairie) et Claude reçoit ces liens comme mémoire de travail (outil `list_links`, registre `collabs` pour en ajouter). Rien n'est affiché dans la ville.
- **Anciens projets** : les projets terminés ou abandonnés (Afev'tival, 33 Mesures, Red Festival, RedCat X RedStudio…) ne sont plus construits dans la ville ; ils sont rangés dans les **archives de la bibliothèque**, d'où on peut les faire revenir.
- **Automatisations** : dans le bâtiment du même nom, on crée des routines Claude confiées à un agent de l'université (avec sa fréquence) et on lance les workflows n8n. Quand une routine démarre, son agent passe d'abord par la bibliothèque, puis va travailler à l'atelier.
- **Check-up sécurité** (caserne des pompiers) : chiffrement, codes restés à 0000, comptes du Bureau, tentatives refusées, antivirus et licences, clé Claude, sauvegarde, version d'Electron.
- **n8n** : tes workflows apparaissent comme des drones roses au-dessus du quartier correspondant à leur tag. Bouton ▶ pour les déclencher via leur webhook. C'est la porte d'entrée vers Slack, Discord, Gmail, Agenda, Notion, Instagram…

Sans aucune connexion, l'application fonctionne déjà avec un **instantané du Drive au 12/10/2026** et des tâches de départ tirées des vrais documents (référencement Google de la feuille « Stratégie communication », 32 associations à contacter, budget 93Mesures vide, etc.).

## Lancer l'application (Windows)

1. Installe **Node.js LTS** depuis [nodejs.org](https://nodejs.org/fr) (une seule fois, « Suivant » partout).
2. Sur GitHub, ouvre la branche du projet → bouton vert **Code** → **Download ZIP**, puis décompresse le dossier.
3. Double-clique sur **`Lancer Map TRS.bat`**. La première fois, l'installation télécharge environ 150 Mo (2 à 5 minutes), puis la ville s'ouvre. Ensuite le lancement est direct : le lanceur ne réinstalle que si les composants ont changé, ne reconstruit l'interface que si le code a changé, passe par un serveur miroir si GitHub ne répond pas, et demande la carte graphique la plus rapide du PC.

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
3. **Google Agenda** — activer aussi « Google Calendar API » ; si le Drive était déjà connecté, cliquer sur « Reconnecter ». L'agenda « RED STUDIO » est choisi tout seul (ou colle son ID dans les réglages).
4. **Spotify** — « Relier mon compte » à la radio suffit pour écouter en entier. Pour importer ses playlists : appli sur developer.spotify.com, Redirect URI `http://127.0.0.1:43821/callback`, Client ID dans les réglages.
5. **Formations** — l'adresse de ton API (elle doit renvoyer du JSON : une liste d'objets avec titre, fréquence, jour, heure, lien… en français ou en anglais ; un webhook n8n convient). Jeton facultatif, envoyé en `Authorization: Bearer`.
6. **n8n** — dans n8n : *Settings → n8n API → Create API key*. Renseigne l'URL de l'instance et la clé. Pour qu'un workflow soit déclenchable, ajoute-lui un nœud **Webhook** (ou colle l'URL du webhook dans *Agents & automatisations*). Mets-lui un tag du nom d'un quartier pour que son drone vole au-dessus.

Les clés et jetons sont stockés **chiffrés** (Windows DPAPI via Electron `safeStorage`) dans `%APPDATA%/Map TRS/map-trs.json`, avec les tâches et les routines.

## Architecture

```
electron/
  main.cjs      fenêtre, IPC, tâches, routines planifiées, outils exécutés pour Claude
  claude.cjs    boucle d'agent (API Messages + outils) avec validation humaine des écritures
  google.cjs    OAuth bureau (PKCE, boucle locale) + Drive v3 : arborescence, lecture, création
  n8n.cjs       liste des workflows (API v1) et déclenchement par webhook
  accounts.cjs  comptes, tiers, journal, fichiers déposés, défis de l'école, pause obligatoire
  spotify.cjs   connexion Spotify (lecteur + API)
  office.cjs    bureaux privés de Vincent et d'Ivane : codes, coffre-fort chiffré, notes
  store.cjs     stockage JSON local (écriture atomique + copie de secours) + secrets chiffrés
  preload.cjs   pont sécurisé vers l'interface
shared/
  access.mjs    tiers et règles d'accès des lieux
  quiz.mjs      questions des défis quotidiens
  advisor.mjs   règles de complétude par type de projet + feuille de route BP
  links.mjs     connexions invisibles (artistes, beatmakers, projets, banque, mairie)
  seed.mjs      tâches de départ
  drive-snapshot.json  instantané de l'arborescence du Drive
src/
  city.js       scène Three.js (quartiers, maisons, chambres, agents, drones, bloom)
  landmarks2.js cerveau, université, réseaux sociaux, beatmakers, Gapple, statues, salles partenaires
  pov.js        modes de déplacement, POV, armes, points de vie, entrée dans les pièces
  rooms.js      boîte à outils des intérieurs (murs, portes, mobilier, collisions)
  interiors3d.js intérieurs 3D de tous les bâtiments
  office.js / office-ui.js  étage de la direction (bureaux, plaques, coffre, poste Claude admin)
  town.js       routes, parcs, quartiers à la française, circulation
  bake.js       fusion des objets immobiles (fluidité)
  interiors2.js mairie, banque, cerveau, université, CGT, magasin, label, clocher…
  main.js       interface : panneaux, tâches, console Claude, modales
  api.js        accès au processus principal (+ mode démo dans un navigateur)
scripts/
  launch.cjs    lanceur rapide (installe / reconstruit seulement si besoin)
```

## Idées pour la suite
- Animer les intérieurs (personnages au travail, machines, lumières de scène) ;
- Passer Electron à une version récente lors d'un prochain build (correctifs de sécurité) ;
- Une base partagée (serveur) pour que les comptes, le journal et les tâches soient les mêmes sur tous les PC ;
- Préciser les accréditations de chaque pôle (matrice à la mairie) ;
- Synchroniser les tâches dans une Google Sheet partagée (pour que toute l'équipe voie les mêmes tâches) ;
- Agenda des événements (Google Calendar) affiché sur la place du QG ;
- Avatars de l'équipe dans la ville (qui travaille sur quoi) ;
- Modèles 3D personnalisés (studio, salle de concert, radio) à la place des maisons génériques.
