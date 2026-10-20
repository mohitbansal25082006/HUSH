import { DEFAULT_SETTINGS, type Settings } from '../../shared/constants';
import { getSettings, saveSettings } from '../../shared/storage';
import type { GlobalStats } from '../../shared/messages';
import { applyTheme } from '../theme';

export const app = $state({
  settings: { ...DEFAULT_SETTINGS } as Settings,
  stats: null as GlobalStats | null,
  ready: false,
  saving: false,
  toast: '' as string,
});

let toastTimer: ReturnType<typeof setTimeout> | undefined;
export function toast(text: string) {
  app.toast = text;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (app.toast = ''), 2400);
}

export async function loadApp() {
  app.settings = await getSettings();
  app.stats = (await chrome.runtime.sendMessage({ type: 'getStats' })) as GlobalStats;
  applyTheme(app.settings);
  app.ready = true;
}

/** Persist a settings change and let the service worker re-apply configuration. */
export async function updateSettings(patch: Partial<Settings>, message?: string) {
  app.saving = true;
  app.settings = await saveSettings(patch);
  applyTheme(app.settings);
  await chrome.runtime.sendMessage({ type: 'settingsChanged' });
  app.saving = false;
  if (message) toast(message);
}

export async function refreshStats() {
  app.stats = (await chrome.runtime.sendMessage({ type: 'getStats' })) as GlobalStats;
}
