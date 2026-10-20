/**
 * HUSH Twitch shield (MAIN world, registered at runtime when Twitch protection is on).
 *
 * Twitch stitches ads into the HLS stream on the server, so they cannot be blocked by URL. The
 * player fetches playlists from inside a Web Worker; we wrap that worker and rewrite media
 * playlists on the fly:
 *   1. ad segments (non-"live" EXTINF titles / stitched-ad date ranges) are dropped;
 *   2. if a whole playlist is an ad break, a backup ad-free playlist is requested with a different
 *      player type and served instead (same resolution when possible).
 * When nothing else works the isolated script mutes and covers the ad.
 */
export default defineContentScript({
  matches: ['*://*.twitch.tv/*'],
  registration: 'runtime',
  world: 'MAIN',
  runAt: 'document_start',
  main() {
    installWorkerHook();
    installAdCurtain();
  },
});

/** Code evaluated inside the player's worker (stringified — must be self-contained). */
function workerPatch() {
  const CLIENT_ID = 'kimne78kx3ncx6brgo4mv6wki5h1ko';
  const BACKUP_TYPES = ['embed', 'popout', 'autoplay', 'picture-by-picture'];
  const variants = new Map<string, { channel: string; resolution: string; frameRate: string }>();
  const backupCache = new Map<string, { url: string; t: number }>();
  const nativeFetch = self.fetch.bind(self);

  const isAdPlaylist = (text: string) => /stitched-ad|X-TV-TWITCH-AD|EXT-X-DATERANGE:.*CLASS="twitch-stitched-ad"/.test(text);

  function stripAds(text: string): string {
    const lines = text.split('\n');
    const out: string[] = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.startsWith('#EXTINF') && !/,live\s*$/.test(line) && i + 1 < lines.length) {
        i++; // drop the segment URI too
        continue;
      }
      if (line.startsWith('#EXT-X-DATERANGE') && /stitched-ad|twitch-ad/i.test(line)) continue;
      out.push(line);
    }
    return out.join('\n');
  }

  async function accessToken(channel: string, playerType: string) {
    const body = {
      operationName: 'PlaybackAccessToken_Template',
      query:
        'query PlaybackAccessToken_Template($login: String!, $isLive: Boolean!, $vodID: ID!, $isVod: Boolean!, $playerType: String!) {  streamPlaybackAccessToken(channelName: $login, params: {platform: "web", playerBackend: "mediaplayer", playerType: $playerType}) @include(if: $isLive) {    value    signature   authorization { isForbidden forbiddenReasonCode }   __typename  }  videoPlaybackAccessToken(id: $vodID, params: {platform: "web", playerBackend: "mediaplayer", playerType: $playerType}) @include(if: $isVod) {    value    signature   __typename  }}',
      variables: { isLive: true, login: channel, isVod: false, vodID: '', playerType },
    };
    const res = await nativeFetch('https://gql.twitch.tv/gql', {
      method: 'POST',
      headers: { 'Client-ID': CLIENT_ID, 'Content-Type': 'text/plain;charset=UTF-8' },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    return json?.data?.streamPlaybackAccessToken as { value: string; signature: string } | undefined;
  }

  async function backupPlaylist(channel: string, resolution: string): Promise<string | null> {
    for (const type of BACKUP_TYPES) {
      try {
        const key = `${channel}|${type}|${resolution}`;
        const cached = backupCache.get(key);
        let mediaUrl = cached && Date.now() - cached.t < 60_000 ? cached.url : '';
        if (!mediaUrl) {
          const tok = await accessToken(channel, type);
          if (!tok) continue;
          const u = new URL(`https://usher.ttvnw.net/api/channel/hls/${channel}.m3u8`);
          u.searchParams.set('sig', tok.signature);
          u.searchParams.set('token', tok.value);
          u.searchParams.set('allow_source', 'true');
          u.searchParams.set('fast_bread', 'true');
          u.searchParams.set('player_type', type);
          u.searchParams.set('p', String(Math.floor(Math.random() * 9_999_999)));
          const master = await (await nativeFetch(u.href)).text();
          const lines = master.split('\n');
          let best = '';
          let fallback = '';
          for (let i = 0; i < lines.length; i++) {
            if (!lines[i].startsWith('#EXT-X-STREAM-INF')) continue;
            const uri = lines[i + 1];
            if (!fallback) fallback = uri;
            const res = /RESOLUTION=(\d+x\d+)/.exec(lines[i])?.[1] ?? '';
            if (res === resolution) {
              best = uri;
              break;
            }
          }
          mediaUrl = best || fallback;
          if (!mediaUrl) continue;
          backupCache.set(key, { url: mediaUrl, t: Date.now() });
        }
        const text = await (await nativeFetch(mediaUrl)).text();
        if (!isAdPlaylist(text)) return text;
      } catch {
        /* try the next player type */
      }
    }
    return null;
  }

  self.fetch = async function (input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const url = input instanceof Request ? input.url : String(input);
    // Master playlist: remember which media playlist URL is which resolution of which channel.
    const master = /usher\.ttvnw\.net\/api\/(?:v2\/)?channel\/hls\/([^/.]+)\.m3u8/.exec(url);
    if (master) {
      const res = await nativeFetch(input, init);
      const text = await res.clone().text();
      const lines = text.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (!lines[i].startsWith('#EXT-X-STREAM-INF')) continue;
        const resolution = /RESOLUTION=(\d+x\d+)/.exec(lines[i])?.[1] ?? '';
        const frameRate = /FRAME-RATE=([\d.]+)/.exec(lines[i])?.[1] ?? '';
        variants.set(lines[i + 1]?.trim(), { channel: master[1].toLowerCase(), resolution, frameRate });
      }
      return res;
    }
    if (/\.m3u8(\?|$)/.test(url) && /hls\.ttvnw\.net|playlist\.ttvnw\.net|video-weaver/.test(url)) {
      const res = await nativeFetch(input, init);
      const text = await res.text();
      if (!isAdPlaylist(text)) return new Response(text, { status: res.status, headers: res.headers });
      (self as unknown as { postMessage: (m: unknown) => void }).postMessage({ hush: 'twitch-ad' });
      const info = variants.get(url);
      if (info) {
        const backup = await backupPlaylist(info.channel, info.resolution);
        if (backup) return new Response(backup, { status: 200, headers: res.headers });
      }
      return new Response(stripAds(text), { status: res.status, headers: res.headers });
    }
    return nativeFetch(input, init);
  } as typeof fetch;
}

function installWorkerHook() {
  const NativeWorker = window.Worker;
  const fetchSync = (url: string): string | null => {
    try {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', url, false);
      xhr.send();
      return xhr.status >= 200 && xhr.status < 300 ? xhr.responseText : null;
    } catch {
      return null;
    }
  };
  class HushWorker extends NativeWorker {
    constructor(scriptURL: string | URL, options?: WorkerOptions) {
      const url = String(scriptURL);
      const isPlayer = /twitch|ttvnw|amazon-ivs|wasmworker/i.test(url) || url.startsWith('blob:');
      let finalUrl: string | URL = scriptURL;
      if (isPlayer) {
        const original = fetchSync(url);
        if (original && /importScripts|wasmworker|amazon-ivs/i.test(original)) {
          const code = `(${workerPatch.toString()})();\n${original}`;
          finalUrl = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
        }
      }
      super(finalUrl, options);
      this.addEventListener('message', (e: MessageEvent) => {
        if (e.data?.hush === 'twitch-ad') document.dispatchEvent(new CustomEvent('hush:twitch-ad'));
      });
    }
  }
  try {
    Object.defineProperty(window, 'Worker', { value: HushWorker, configurable: true, writable: true });
  } catch {
    (window as unknown as { Worker: typeof Worker }).Worker = HushWorker;
  }
}

/** Last line of defence: if an ad still plays, mute it and show a calm curtain. */
function installAdCurtain() {
  let curtain: HTMLElement | null = null;
  let mutedByUs = false;
  const check = () => {
    const label = document.querySelector('[data-a-target="video-ad-label"], [data-a-target="video-ad-countdown"], [data-test-selector="ad-banner-default-text"]');
    const video = document.querySelector<HTMLVideoElement>('video');
    const container = document.querySelector<HTMLElement>('.video-player__container, [data-a-target="video-player"]');
    if (label && video && container) {
      if (!video.muted) {
        video.muted = true;
        mutedByUs = true;
      }
      if (!curtain) {
        curtain = document.createElement('div');
        curtain.setAttribute('style', 'position:absolute;inset:0;z-index:2147483646;display:grid;place-items:center;background:radial-gradient(circle at 50% 40%,#2a1f5c,#0b0a18 70%);color:#e9e6ff;font:600 15px/1.4 system-ui,sans-serif;letter-spacing:.02em;pointer-events:none');
        curtain.textContent = '🤫 HUSH is silencing a Twitch ad…';
        container.style.position ||= 'relative';
        container.appendChild(curtain);
      }
    } else {
      if (curtain) {
        curtain.remove();
        curtain = null;
      }
      if (mutedByUs && video) {
        video.muted = false;
        mutedByUs = false;
      }
    }
  };
  setInterval(check, 700);
}
