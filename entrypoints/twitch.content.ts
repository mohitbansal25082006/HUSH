/** Mutes and covers ads identified by the Twitch player UI. */
export default defineContentScript({
  matches: ['*://*.twitch.tv/*'],
  registration: 'runtime',
  world: 'ISOLATED',
  runAt: 'document_start',
  main() {
    installAdCurtain();
  },
});

function installAdCurtain() {
  let curtain: HTMLElement | null = null;
  let mutedByUs: HTMLVideoElement | null = null;
  const check = () => {
    const label = document.querySelector('[data-a-target="video-ad-label"], [data-a-target="video-ad-countdown"], [data-test-selector="ad-banner-default-text"]');
    const video = document.querySelector<HTMLVideoElement>('video');
    const container = document.querySelector<HTMLElement>('.video-player__container, [data-a-target="video-player"]');
    if (mutedByUs && (!label || !container || mutedByUs !== video)) {
      mutedByUs.muted = false;
      mutedByUs = null;
    }
    if (label && video && container) {
      if (!video.muted) {
        video.muted = true;
        mutedByUs = video;
      }
      if (!curtain) {
        curtain = document.createElement('div');
        curtain.setAttribute('style', 'position:absolute;inset:0;z-index:2147483646;display:grid;place-items:center;background:radial-gradient(circle at 50% 40%,#2a1f5c,#0b0a18 70%);color:#e9e6ff;font:600 15px/1.4 system-ui,sans-serif;letter-spacing:.02em;pointer-events:none');
        curtain.textContent = '🤫 HUSH is silencing a Twitch ad…';
        document.dispatchEvent(new CustomEvent('hush:twitch-ad'));
      }
      if (curtain.parentElement !== container) {
        container.style.position ||= 'relative';
        container.appendChild(curtain);
      }
    } else if (curtain) {
      curtain.remove();
      curtain = null;
    }
  };
  setInterval(check, 700);
}
