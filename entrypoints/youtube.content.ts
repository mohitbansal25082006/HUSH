/**
 * HUSH YouTube shield (isolated world).
 *
 * Scriptlets already strip ad payloads from player responses. This is the safety net for ads
 * that still get through (server-side insertion, A/B experiments): the moment the player enters
 * an ad state, the ad is muted, fast-forwarded and skipped, and the anti-adblock dialog is
 * removed with playback resumed.
 */
import { DEFAULT_SETTINGS, KEYS, type Settings } from '../src/shared/constants';
import { isAllowlisted } from '../src/shared/storage';

export default defineContentScript({
  matches: ['*://*.youtube.com/*', '*://*.youtube-nocookie.com/*'],
  runAt: 'document_start',
  allFrames: true,
  main() {
    void start();
  },
});

const SKIP_BUTTONS = [
  '.ytp-skip-ad-button',
  '.ytp-ad-skip-button',
  '.ytp-ad-skip-button-modern',
  '.ytp-ad-skip-button-slot button',
  'button[id^="skip-button"]',
  '.ytp-ad-overlay-close-button',
];

const ENFORCEMENT = 'ytd-enforcement-message-view-model, tp-yt-paper-dialog:has(ytd-enforcement-message-view-model), #error-screen ytd-enforcement-message-view-model';

async function start() {
  const data = await chrome.storage.local.get([KEYS.settings, KEYS.allowlist]).catch(() => null);
  if (!data) return;
  const settings: Settings = { ...DEFAULT_SETTINGS, ...((data[KEYS.settings] as Partial<Settings>) ?? {}) };
  if (!settings.enabled || !settings.youtube) return;
  if (isAllowlisted(location.hostname, (data[KEYS.allowlist] as string[]) ?? [])) return;

  let inAd = false;
  let saved: { muted: boolean; rate: number } | null = null;
  let lastReport = 0;
  /** Duration of the programme itself, to tell a stitched ad from a separate ad video. */
  let content = { href: '', duration: 0 };

  const player = () => document.querySelector<HTMLElement>('.html5-video-player');

  const tick = () => {
    const p = player();
    const video = p?.querySelector<HTMLVideoElement>('video.html5-main-video, video');
    const adShowing = !!p && (p.classList.contains('ad-showing') || p.classList.contains('ad-interrupting'));

    if (adShowing && video) {
      if (!inAd) {
        inAd = true;
        saved = { muted: video.muted, rate: video.playbackRate };
        if (Date.now() - lastReport > 3000) {
          lastReport = Date.now();
          chrome.runtime.sendMessage({ type: 'videoAdSkipped', site: 'youtube' }).catch(() => {});
        }
      }
      video.muted = true;
      // Server-side inserted ads are stitched into the real stream: the video's duration is the
      // whole programme. Jumping to its end or playing at 16x there skips the content or starves
      // the buffer (endless loading), so only a separate ad video is fast-forwarded.
      const d = video.duration;
      const known = content.href === location.href ? content.duration : 0;
      const separate = Number.isFinite(d) && d > 0 && (known ? Math.abs(d - known) > 1 : d < 90);
      if (separate) {
        try {
          video.playbackRate = 16;
        } catch {
          /* some ads refuse */
        }
        if (video.currentTime < d - 0.25) video.currentTime = d - 0.1;
      }
      for (const sel of SKIP_BUTTONS) {
        const b = document.querySelector<HTMLElement>(sel);
        if (b) b.click();
      }
    } else if (!adShowing && video && Number.isFinite(video.duration) && video.duration > 0 && video.currentTime > 3) {
      // Sampled only once the programme is really playing, never during an ad hand-over.
      content = { href: location.href, duration: video.duration };
    }
    if (!adShowing && inAd) {
      inAd = false;
      if (video && saved) {
        video.muted = saved.muted;
        video.playbackRate = saved.rate === 16 ? 1 : saved.rate;
      }
      saved = null;
    }

    // Anti-adblock wall: remove it and resume playback.
    const wall = document.querySelector(ENFORCEMENT);
    if (wall) {
      (wall.closest('tp-yt-paper-dialog') ?? wall).remove();
      document.querySelector('tp-yt-iron-overlay-backdrop')?.remove();
      document.body?.style.removeProperty('overflow');
      const v = document.querySelector<HTMLVideoElement>('video.html5-main-video');
      if (v?.paused) void v.play().catch(() => {});
    }
  };

  // Cheap: a class observer on the player plus a slow interval as a fallback.
  const attach = () => {
    const p = player();
    if (!p) return false;
    new MutationObserver(tick).observe(p, { attributes: true, attributeFilter: ['class'] });
    tick();
    return true;
  };
  const wait = new MutationObserver(() => {
    if (attach()) wait.disconnect();
  });
  if (!attach()) wait.observe(document, { childList: true, subtree: true });
  setInterval(tick, 500);
}
