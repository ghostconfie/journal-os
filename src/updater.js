// Automatic updates. Each time a new version is published, the installed app finds it (on open,
// when you come back to it, and every 30 minutes) and switches to it as soon as no form is open.
import { registerSW } from 'virtual:pwa-register';

export function startUpdater() {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  let ready = false;
  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh() { ready = true; tryApply(); },
    onRegisteredSW(_url, reg) {
      if (!reg) return;
      const check = () => reg.update().catch(() => {});
      setInterval(check, 30 * 60 * 1000);
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
    },
  });
  function tryApply() {
    if (!ready) return;
    if (window.__jBusy) { setTimeout(tryApply, 3000); return; }
    updateSW(true);
  }
}
