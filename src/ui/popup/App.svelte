<script lang="ts">
  import { onMount } from 'svelte';
  import { fly, fade } from 'svelte/transition';
  import { backOut } from 'svelte/easing';
  import Hushy, { type HushyMood } from '../components/Hushy.svelte';
  import Waveform from '../components/Waveform.svelte';
  import Counter from '../components/Counter.svelte';
  import Icon from '../components/Icon.svelte';
  import Burst from '../components/Burst.svelte';
  import { applyTheme } from '../theme';
  import { saveSettings, formatBytes } from '../../shared/storage';
  import type { PopupState } from '../../shared/messages';

  let view = $state<PopupState | null>(null);
  let hushy: Hushy;
  let wave: Waveform;
  let burst: Burst;
  let mood = $state<HushyMood>('shh');
  let busy = $state(false);
  let braveTipHidden = $state(true);
  let lastSeen = -1;

  const MILESTONES = [100, 1_000, 10_000, 50_000, 100_000, 500_000, 1_000_000, 5_000_000, 10_000_000];

  const pageTotal = $derived(view ? view.stats.blocked + view.stats.popups + view.stats.cosmetic : 0);

  async function refresh() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;
    const next = (await chrome.runtime.sendMessage({ type: 'getPopupState', tabId: tab.id })) as PopupState | null;
    if (!next) return;
    const prevTotal = view?.totals.total ?? next.totals.total;
    const total = next.stats.blocked + next.stats.popups + next.stats.cosmetic;
    if (lastSeen >= 0 && total > lastSeen) {
      hushy?.swat();
      wave?.spike(Math.min(1, 0.25 + (total - lastSeen) * 0.08));
    }
    lastSeen = total;
    const crossed = MILESTONES.find((m) => prevTotal < m && next.totals.total >= m);
    if (crossed && view) {
      mood = 'celebrate';
      burst?.fire(180, 150, 90);
      setTimeout(() => (mood = 'shh'), 1600);
    }
    view = next;
    if (!view.settings.enabled || view.paused) mood = 'sleep';
    else if (mood === 'sleep') mood = 'shh';
  }

  onMount(() => {
    void refresh().then(() => {
      if (view) applyTheme(view.settings);
      setTimeout(() => mood !== 'sleep' && (mood = 'idle'), 2200);
    });
    try {
      braveTipHidden = localStorage.getItem('hush.braveTip') === '1';
    } catch {
      braveTipHidden = false;
    }
    const t = setInterval(refresh, 1000);
    return () => clearInterval(t);
  });

  async function toggleSite() {
    if (!view?.supported || busy) return;
    busy = true;
    const paused = !view.paused;
    mood = paused ? 'sleep' : 'shh';
    await chrome.runtime.sendMessage({ type: 'toggleSite', host: view.host, paused });
    await chrome.tabs.reload(view.tabId);
    await refresh();
    busy = false;
    if (!paused) setTimeout(() => (mood = 'idle'), 1500);
  }

  async function toggleGlobal() {
    if (!view) return;
    busy = true;
    await saveSettings({ enabled: !view.settings.enabled });
    await chrome.runtime.sendMessage({ type: 'settingsChanged' });
    await chrome.tabs.reload(view.tabId);
    await refresh();
    busy = false;
  }

  async function picker(mode: 'picker' | 'zapper') {
    if (!view?.supported) return;
    await chrome.runtime.sendMessage({ type: 'openPicker', tabId: view.tabId, mode });
    window.close();
  }

  function openDashboard(hash = '') {
    chrome.tabs.create({ url: chrome.runtime.getURL(`/options.html${hash}`) });
    window.close();
  }

  function hideBraveTip() {
    braveTipHidden = true;
    try {
      localStorage.setItem('hush.braveTip', '1');
    } catch {
      /* ignore */
    }
  }

  const statusLine = $derived.by(() => {
    if (!view) return '';
    if (!view.settings.enabled) return 'HUSH is switched off everywhere.';
    if (!view.supported) return 'HUSH works on regular web pages.';
    if (view.paused) return 'Paused here. Ads and trackers can reach you on this site.';
    if (pageTotal === 0) return 'All quiet on this page so far.';
    return `Silenced ${pageTotal.toLocaleString()} ${pageTotal === 1 ? 'thing' : 'things'} on this page.`;
  });
</script>

<Burst bind:this={burst} />

<main class:off={view && (!view.settings.enabled || view.paused)}>
  <header>
    <div class="brand" aria-label="HUSH">
      <span class="word">hush</span>
    </div>
    <div class="head-actions">
      <button class="icon-btn" title={view?.settings.enabled ? 'Turn HUSH off everywhere' : 'Turn HUSH on'} onclick={toggleGlobal} disabled={busy}>
        <Icon name="power" />
      </button>
      <button class="icon-btn" title="Open dashboard" onclick={() => openDashboard()}>
        <Icon name="chart" />
      </button>
    </div>
  </header>

  <section class="stage">
    <button
      class="hushy-btn"
      onclick={toggleSite}
      disabled={!view?.supported || !view?.settings.enabled || busy}
      aria-label={view?.paused ? `Resume HUSH on ${view?.host}` : `Pause HUSH on ${view?.host ?? 'this site'}`}
      title={view?.paused ? 'Resume protection on this site' : 'Pause on this site'}
    >
      <Hushy bind:this={hushy} {mood} size={148} />
    </button>
    <div class="wave">
      <Waveform bind:this={wave} height={54} loud={!!view && (view.paused || !view.settings.enabled)} />
    </div>
  </section>

  {#if view}
    <section class="site" in:fade={{ duration: 300 }}>
      <h1 title={view.host}>{view.host || 'This page'}</h1>
      <p class="status">{statusLine}</p>
      {#if view.supported && view.settings.enabled}
        <button class="site-toggle" class:paused={view.paused} onclick={toggleSite} disabled={busy}>
          {#if view.paused}<Icon name="play" size={15} /> Resume on this site{:else}<Icon name="pause" size={15} /> Pause on this site{/if}
        </button>
      {/if}
    </section>

    <section class="meters" aria-label="Blocked on this page">
      <div class="meter">
        <span class="value"><Counter value={view.stats.ads + view.stats.cosmetic} format="compact" /></span>
        <span class="label">Ads</span>
      </div>
      <div class="meter">
        <span class="value"><Counter value={view.stats.trackers} format="compact" /></span>
        <span class="label">Trackers</span>
      </div>
      <div class="meter">
        <span class="value"><Counter value={view.stats.popups} format="compact" /></span>
        <span class="label">Popups</span>
      </div>
      {#if view.stats.skippedVideoAds}
        <div class="meter" in:fly={{ y: 8, easing: backOut }}>
          <span class="value"><Counter value={view.stats.skippedVideoAds} /></span>
          <span class="label">Video ads</span>
        </div>
      {/if}
    </section>

    <nav class="tools" aria-label="Tools">
      <button onclick={() => picker('picker')} disabled={!view.supported}><Icon name="target" /><span>Block an element</span></button>
      <button onclick={() => picker('zapper')} disabled={!view.supported}><Icon name="zap" /><span>Zap an element</span></button>
      <button onclick={() => openDashboard('#logger')}><Icon name="radar" /><span>Request log</span></button>
      <button onclick={() => openDashboard(`#help/${encodeURIComponent(view?.host ?? '')}`)} disabled={!view.supported}><Icon name="flag" /><span>Site broken?</span></button>
    </nav>

    {#if view.isBrave && !braveTipHidden}
      <aside class="tip" transition:fly={{ y: 10 }}>
        <p>You're on Brave. Shields and HUSH can run together; if a site breaks, set Shields to <b>Standard</b> for it.</p>
        <button class="icon-btn small" onclick={hideBraveTip} aria-label="Dismiss tip"><Icon name="x" size={14} /></button>
      </aside>
    {/if}

    <footer>
      <span><b class="num"><Counter value={view.totals.total} format="compact" /></b> silenced so far</span>
      <span><b class="num">{formatBytes(view.totals.bytes)}</b> of data saved</span>
    </footer>
  {/if}
</main>

<style>
  main {
    width: 360px;
    min-height: 540px;
    padding: 14px 16px 12px;
    background:
      radial-gradient(120% 60% at 50% 0%, color-mix(in srgb, var(--lilac-deep) 22%, transparent), transparent 70%),
      var(--ink);
    display: flex;
    flex-direction: column;
    gap: 10px;
    transition: filter 0.6s var(--ease);
  }
  main.off {
    background:
      radial-gradient(120% 60% at 50% 0%, color-mix(in srgb, var(--coral) 12%, transparent), transparent 70%),
      var(--ink);
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .word {
    font-family: var(--display);
    font-weight: 800;
    font-size: 22px;
    letter-spacing: -0.04em;
    font-stretch: 85%;
  }
  .word::after {
    content: '';
    display: inline-block;
    width: 6px;
    height: 6px;
    margin-left: 3px;
    border-radius: 50%;
    background: var(--moon);
    box-shadow: 0 0 10px var(--moon-glow);
  }
  .head-actions {
    display: flex;
    gap: 6px;
  }
  .icon-btn {
    width: 34px;
    height: 34px;
    border-radius: 11px;
    border: 1px solid var(--line);
    background: color-mix(in srgb, var(--surface) 70%, transparent);
    color: var(--text-2);
    display: grid;
    place-items: center;
    cursor: pointer;
    transition: background 0.2s, color 0.2s, transform 0.2s var(--spring);
  }
  .icon-btn:hover {
    color: var(--text);
    background: var(--surface-2);
  }
  .icon-btn:active {
    transform: scale(0.92);
  }
  .icon-btn.small {
    width: 26px;
    height: 26px;
    border-radius: 8px;
    flex: none;
  }
  .stage {
    position: relative;
    display: grid;
    justify-items: center;
    margin-top: -4px;
  }
  .hushy-btn {
    border: 0;
    background: none;
    padding: 0;
    cursor: pointer;
    border-radius: 50%;
    transition: transform 0.4s var(--spring);
    position: relative;
    z-index: 1;
  }
  .hushy-btn:hover:not(:disabled) {
    transform: scale(1.04);
  }
  .hushy-btn:active:not(:disabled) {
    transform: scale(0.96);
  }
  .hushy-btn:disabled {
    cursor: default;
  }
  .wave {
    width: 100%;
    margin-top: -26px;
  }
  .site {
    text-align: center;
    display: grid;
    justify-items: center;
    gap: 2px;
  }
  h1 {
    margin: 0;
    font-family: var(--display);
    font-size: 21px;
    font-weight: 700;
    letter-spacing: -0.02em;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .status {
    margin: 0;
    color: var(--text-2);
    font-size: 13px;
    max-width: 30ch;
    text-wrap: balance;
  }
  .site-toggle {
    margin-top: 8px;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 32px;
    padding: 0 14px;
    border-radius: 99px;
    border: 1px solid var(--line-strong);
    background: transparent;
    color: var(--text-2);
    font-weight: 600;
    font-size: 12.5px;
    cursor: pointer;
    transition: all 0.25s var(--ease);
  }
  .site-toggle:hover {
    color: var(--text);
    border-color: var(--lilac);
  }
  .site-toggle.paused {
    background: var(--lilac-deep);
    border-color: transparent;
    color: white;
  }
  .meters {
    display: flex;
    justify-content: center;
    margin: 6px 0 2px;
  }
  .meter {
    flex: 1;
    display: grid;
    justify-items: center;
    padding: 4px 0;
  }
  .meter + .meter {
    border-left: 1px solid var(--line);
  }
  .value {
    font-size: 26px;
    font-weight: 700;
    line-height: 1.1;
  }
  .meter:first-child .value {
    color: var(--coral);
  }
  .label {
    font-size: 12px;
    color: var(--text-3);
  }
  .tools {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
  }
  .tools button {
    display: flex;
    align-items: center;
    gap: 9px;
    height: 42px;
    padding: 0 12px;
    border-radius: var(--radius);
    border: 1px solid var(--line);
    background: color-mix(in srgb, var(--surface) 75%, transparent);
    color: var(--text);
    font-weight: 600;
    font-size: 12.5px;
    cursor: pointer;
    text-align: left;
    transition: background 0.2s, border-color 0.2s, transform 0.25s var(--spring);
  }
  .tools button :global(svg) {
    color: var(--lilac);
    flex: none;
  }
  .tools button:hover:not(:disabled) {
    background: var(--surface-2);
    border-color: var(--line-strong);
  }
  .tools button:active:not(:disabled) {
    transform: scale(0.97);
  }
  .tools button:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
  .tip {
    display: flex;
    gap: 10px;
    align-items: flex-start;
    padding: 10px 10px 10px 12px;
    border-radius: var(--radius);
    background: color-mix(in srgb, var(--amber) 12%, var(--surface));
    border: 1px solid color-mix(in srgb, var(--amber) 30%, transparent);
    font-size: 12px;
    color: var(--text-2);
  }
  .tip p {
    margin: 0;
  }
  footer {
    margin-top: auto;
    display: flex;
    justify-content: space-between;
    font-size: 12px;
    color: var(--text-3);
    padding-top: 8px;
    border-top: 1px solid var(--line);
  }
  footer b {
    color: var(--text);
    font-weight: 700;
    font-size: 13px;
  }
</style>
