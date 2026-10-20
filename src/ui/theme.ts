import type { Settings } from '../shared/constants';

/** Apply the theme / motion preferences to <html>. */
export function applyTheme(settings: Pick<Settings, 'theme' | 'motion'>): void {
  const root = document.documentElement;
  const dark = settings.theme === 'dark' || (settings.theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  root.dataset.theme = dark ? 'dark' : 'light';
  root.dataset.motion = settings.motion === 'reduced' || matchMedia('(prefers-reduced-motion: reduce)').matches ? 'reduced' : 'full';
}

export const reducedMotion = () => document.documentElement.dataset.motion === 'reduced';
