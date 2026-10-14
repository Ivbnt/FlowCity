// Pont sécurisé entre l'interface de Flowcity et le processus principal.
const { contextBridge, ipcRenderer } = require('electron');

const invoke = (ch) => (...args) => ipcRenderer.invoke(ch, ...args);
const on = (ch) => (cb) => {
  const fn = (_e, payload) => cb(payload);
  ipcRenderer.on(ch, fn);
  return () => ipcRenderer.removeListener(ch, fn);
};

contextBridge.exposeInMainWorld('flow', {
  isElectron: true,
  status: invoke('app:status'),
  auth: { google: invoke('auth:google'), guest: invoke('auth:guest'), logout: invoke('auth:logout'), disconnectGoogle: invoke('auth:disconnectGoogle'), setClient: invoke('google:setClient'), onChange: on('session:changed') },
  city: { get: invoke('city:get'), list: invoke('city:list'), switch: invoke('city:switch'), act: invoke('city:act'), export: invoke('city:export'), import: invoke('city:import'), onChange: on('city:changed'), onMissions: on('missions:done') },
  cred: { save: invoke('cred:save'), test: invoke('cred:test'), remove: invoke('cred:remove') },
  wf: { run: invoke('wf:run'), stop: invoke('wf:stop'), onStart: on('run:start'), onStep: on('run:step'), onEnd: on('run:end') },
  approval: { respond: invoke('approval:respond'), onRequest: on('approval:request') },
  assistant: { send: invoke('assistant:send'), reset: invoke('assistant:reset'), onEvent: on('assistant:event') },
  settings: { set: invoke('settings:set') },
  openUrl: invoke('open:url'),
  onToast: on('toast'),
});
