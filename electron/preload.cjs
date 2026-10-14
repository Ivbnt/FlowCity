// Pont sécurisé entre l'interface (renderer) et le processus principal.
const { contextBridge, ipcRenderer } = require('electron');

const invoke = (ch) => (...args) => ipcRenderer.invoke(ch, ...args);
const on = (ch) => (cb) => {
  const fn = (_e, payload) => cb(payload);
  ipcRenderer.on(ch, fn);
  return () => ipcRenderer.removeListener(ch, fn);
};

contextBridge.exposeInMainWorld('trs', {
  isElectron: true,
  status: invoke('app:status'),
  tree: { get: invoke('tree:get'), refresh: invoke('tree:refresh'), onChange: on('tree:changed'), onProgress: on('tree:progress') },
  tasks: {
    get: invoke('tasks:get'),
    add: invoke('tasks:add'),
    update: invoke('tasks:update'),
    remove: invoke('tasks:delete'),
    onChange: on('tasks:changed'),
  },
  settings: { set: invoke('settings:set'), secret: invoke('secret:set') },
  google: { connect: invoke('google:connect'), disconnect: invoke('google:disconnect') },
  agent: {
    run: invoke('agent:run'),
    stop: invoke('agent:stop'),
    reset: invoke('agent:reset'),
    onEvent: on('agent:event'),
    onApproval: on('approval:request'),
    respond: invoke('approval:respond'),
  },
  routines: { get: invoke('routines:get'), save: invoke('routines:save'), runNow: invoke('routines:runNow'), onChange: on('routines:changed') },
  n8n: { list: invoke('n8n:list'), setKey: invoke('n8n:setKey'), setHook: invoke('n8n:setHook'), trigger: invoke('n8n:trigger'), onFired: on('n8n:fired') },
  openUrl: invoke('open:url'),
  openFile: invoke('open:file'),
  registry: { get: invoke('registry:get'), upsert: invoke('registry:upsert'), remove: invoke('registry:remove'), replace: invoke('registry:replace'), onChange: on('registry:changed') },
  tools: invoke('agent:tools'),
  lock: { check: invoke('lock:check'), status: invoke('lock:status'), lock: invoke('lock:lock'), setCode: invoke('lock:setCode') },
  postit: { question: invoke('postit:question'), check: invoke('postit:check') },
  fbi: { status: invoke('fbi:status'), activate: invoke('fbi:activate'), setKey: invoke('fbi:setKey'), lock: invoke('fbi:lock'), get: invoke('fbi:get'), save: invoke('fbi:save') },
  vault: { get: invoke('vault:get'), save: invoke('vault:save') },
  news: { get: invoke('news:get'), cached: invoke('news:cached'), sources: invoke('news:sources'), saveSources: invoke('news:saveSources'), defaults: invoke('news:defaults') },
  formations: { fetch: invoke('formations:fetch'), cached: invoke('formations:cached') },
  onToast: on('toast'),
});
