import { createApp } from 'vue';
import App from './App.vue';
import { lang, loadLanguage } from './lib/i18n';
import './style.css';

// Installed app (PWA): the manifest cannot know whose blog to open, so a launch from the icon goes to the last blog that was viewed.
const standalone = matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
const params = new URLSearchParams(location.search);
let last = ''; try { last = localStorage.getItem('bd-last-user') ?? ''; } catch { /* ignore */ }
if (standalone && !params.get('user') && !params.get('view') && last) location.replace('?user=' + encodeURIComponent(last));
else {
  void loadLanguage(lang.value).finally(() => createApp(App).mount('#app'));
  // service worker: production builds served over https (or localhost) only; relative path so it works under a GitHub Pages sub-path
  if (import.meta.env.PROD && 'serviceWorker' in navigator) window.addEventListener('load', () => { void navigator.serviceWorker.register('./sw.js').catch((e) => console.warn('service worker', e)); });
}
