import { mount } from 'svelte';
import '../../src/ui/theme.css';
import App from '../../src/ui/popup/App.svelte';

// Apply the stored theme before first paint to avoid a flash.
chrome.storage.local.get('settings').then((data) => {
  const settings = data.settings as { theme?: string; motion?: string } | undefined;
  const theme = settings?.theme ?? 'auto';
  const dark = theme === 'dark' || (theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  if (settings?.motion === 'reduced') document.documentElement.dataset.motion = 'reduced';
});

mount(App, { target: document.getElementById('app')! });
