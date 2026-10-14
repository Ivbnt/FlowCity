// Lanceur rapide de Flowcity (appelé par « Lancer Flowcity.bat » et « npm start »).
// - installe les composants seulement la première fois, ou quand package-lock.json a changé (npm ci, plus rapide) ;
// - vérifie que le moteur Electron est bien téléchargé (serveur miroir en secours) ;
// - ne reconstruit l'interface que si le code a changé depuis la dernière fois ;
// - lance l'application.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync, spawn } = require('child_process');

const root = path.join(__dirname, '..');
const nm = path.join(root, 'node_modules');
const marker = path.join(nm, '.flowcity-installe');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const say = (s = '') => console.log(`  ${s}`);
// Le shell n'est utilisé que pour npm (npm.cmd sous Windows) : les chemins avec espaces
// (C:\Program Files\nodejs\node.exe) passent ainsi sans problème de guillemets.
const run = (cmd, args, env = {}) => spawnSync(cmd, args, { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' && cmd === npm, env: { ...process.env, ...env } }).status === 0;

function lockHash() {
  const f = fs.existsSync(path.join(root, 'package-lock.json')) ? 'package-lock.json' : 'package.json';
  return crypto.createHash('sha1').update(fs.readFileSync(path.join(root, f))).digest('hex');
}

// 1. Composants
const want = lockHash();
const have = fs.existsSync(marker) ? fs.readFileSync(marker, 'utf8').trim() : '';
if (have !== want) {
  say(have ? 'Mise à jour des composants…' : 'Première utilisation : installation des composants (2 à 5 minutes).');
  const flags = ['--no-audit', '--no-fund', '--loglevel=error'];
  let ok = fs.existsSync(path.join(root, 'package-lock.json')) && run(npm, ['ci', ...flags]);
  if (!ok) ok = run(npm, ['install', ...flags]);
  if (!ok) {
    say('Nouvel essai avec un serveur miroir…');
    ok = run(npm, ['install', ...flags], { ELECTRON_MIRROR: 'https://npmmirror.com/mirrors/electron/' });
  }
  if (!ok) {
    say("L'installation a échoué : vérifie ta connexion internet (ou mets l'antivirus en pause), puis relance.");
    process.exit(1);
  }
  fs.writeFileSync(marker, want);
}

// 2. Moteur Electron
const electronPath = () => {
  try {
    const p = require(path.join(nm, 'electron'));
    return fs.existsSync(p) ? p : null;
  } catch {
    return null;
  }
};
if (!electronPath()) {
  say('Téléchargement du moteur Electron…');
  const install = path.join(nm, 'electron', 'install.js');
  if (!run(process.execPath, [install]) || !electronPath()) run(process.execPath, [install], { ELECTRON_MIRROR: 'https://npmmirror.com/mirrors/electron/' });
  if (!electronPath()) {
    say('Impossible de télécharger Electron. Vérifie ta connexion puis relance.');
    process.exit(1);
  }
}

// 3. Interface : reconstruite seulement si un fichier a changé
function newest(dir) {
  let t = 0;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    t = Math.max(t, e.isDirectory() ? newest(p) : fs.statSync(p).mtimeMs);
  }
  return t;
}
const built = path.join(root, 'dist', 'index.html');
const srcTime = Math.max(newest(path.join(root, 'src')), newest(path.join(root, 'shared')), fs.statSync(path.join(root, 'package.json')).mtimeMs);
if (!fs.existsSync(built) || fs.statSync(built).mtimeMs < srcTime) {
  say("Préparation de l'interface…");
  if (!run(process.execPath, [path.join(nm, 'vite', 'bin', 'vite.js'), 'build', '--logLevel', 'warn'])) {
    say("La préparation de l'interface a échoué (voir le message au-dessus).");
    process.exit(1);
  }
}

// 4. Lancement : l'appli vit sa vie, la fenêtre noire peut se fermer
say('Lancement de Flowcity…');
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(electronPath(), [root], { cwd: root, detached: true, stdio: 'ignore', env });
let exited = false;
child.on('exit', (code) => {
  exited = true;
  if (code) {
    say(`Flowcity s'est arrêté avec une erreur (code ${code}).`);
    process.exit(code);
  }
});
child.unref();
// Si l'appli plante tout de suite, on le dit ; sinon on rend la main.
setTimeout(() => !exited && process.exit(0), 4000);
