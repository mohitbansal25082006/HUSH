<script lang="ts">
  import { onMount } from 'svelte';
  import type { LogEntry } from '../../shared/messages';

  let tabs = $state<chrome.tabs.Tab[]>([]);
  let tabId = $state<number | 'all'>('all');
  let entries = $state<LogEntry[]>([]);
  let query = $state('');
  let kinds = $state<Record<string, boolean>>({ ad: true, tracker: true, popup: true, redirect: true, malware: true, video: true });
  let paused = $state(false);
  const MAX = 600;

  async function loadTabs() {
    tabs = (await chrome.tabs.query({})).filter((t) => t.url?.startsWith('http'));
  }

  async function loadLog() {
    entries = ((await chrome.runtime.sendMessage({ type: 'getLog', tabId: tabId === 'all' ? undefined : tabId })) as LogEntry[]) ?? [];
  }

  onMount(() => {
    void loadTabs().then(loadLog);
    const port = chrome.runtime.connect({ name: 'logger' });
    port.onMessage.addListener((m: { type: string; entry: LogEntry }) => {
      if (paused || m.type !== 'log') return;
      if (tabId !== 'all' && m.entry.tabId !== tabId) return;
      entries = [...entries.slice(-(MAX - 1)), m.entry];
    });
    return () => port.disconnect();
  });

  const shown = $derived(
    entries
      .filter((e) => kinds[e.kind] !== false && (!query || e.url.toLowerCase().includes(query.toLowerCase())))
      .slice(-300)
      .reverse(),
  );
  const time = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const LABEL: Record<string, string> = { ad: 'Ad', tracker: 'Tracker', popup: 'Popup', redirect: 'Neutered', malware: 'Malware', video: 'Video ad' };
  const split = (u: string) => {
    try {
      const x = new URL(u);
      return { host: x.hostname, rest: x.pathname + x.search };
    } catch {
      return { host: u, rest: '' };
    }
  };
</script>

<header class="page-head with-radar">
  <div>
    <h2>Request log</h2>
    <p>Everything HUSH blocks, live. Open a site in another tab and watch it arrive.</p>
  </div>
  <div class="radar" class:still={paused} aria-hidden="true"><span></span></div>
</header>

<div class="controls">
  <select class="input" bind:value={tabId} onchange={loadLog} aria-label="Tab">
    <option value="all">All tabs</option>
    {#each tabs as t (t.id)}
      <option value={t.id}>{t.title?.slice(0, 50) || t.url}</option>
    {/each}
  </select>
  <input class="input grow" placeholder="Filter by URL" bind:value={query} aria-label="Filter by URL" />
  <button class="btn" onclick={() => (paused = !paused)}>{paused ? 'Resume' : 'Pause'}</button>
  <button class="btn" onclick={() => (entries = [])}>Clear</button>
</div>
<div class="kinds">
  {#each Object.keys(kinds) as k}
    <label class="chip {k}" class:offk={!kinds[k]}>
      <input type="checkbox" bind:checked={kinds[k]} />
      {LABEL[k]}
    </label>
  {/each}
</div>

{#if shown.length}
  <ol class="log">
    {#each shown as e (e.t + e.url + e.tabId)}
      {@const u = split(e.url)}
      <li>
        <time class="mono">{time.format(e.t)}</time>
        <span class="chip {e.kind}">{LABEL[e.kind]}</span>
        <span class="type">{e.type.replace('_', ' ')}</span>
        <span class="url" title={e.url}><b>{u.host}</b>{u.rest}</span>
      </li>
    {/each}
  </ol>
{:else}
  <p class="empty">Nothing yet. HUSH is listening.</p>
{/if}

<style>
  .with-radar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 20px;
  }
  .radar {
    position: relative;
    width: 72px;
    height: 72px;
    flex: none;
    border-radius: 50%;
    border: 1px solid var(--line-strong);
    background:
      radial-gradient(circle, transparent 30%, var(--line) 31%, transparent 32%),
      radial-gradient(circle, transparent 60%, var(--line) 61%, transparent 62%);
    overflow: hidden;
  }
  .radar span {
    position: absolute;
    inset: 0;
    border-radius: 50%;
    background: conic-gradient(from 0deg, transparent 70%, color-mix(in srgb, var(--mint) 60%, transparent));
    animation: sweep 2.4s linear infinite;
  }
  .still span {
    animation-play-state: paused;
    opacity: 0.4;
  }
  @keyframes sweep {
    to {
      transform: rotate(360deg);
    }
  }
  .controls {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
  }
  .grow {
    flex: 1;
    min-width: 180px;
  }
  select.input {
    max-width: 260px;
  }
  .kinds {
    display: flex;
    gap: 6px;
    margin: 12px 0 16px;
    flex-wrap: wrap;
  }
  .kinds label {
    cursor: pointer;
    user-select: none;
  }
  .kinds input {
    display: none;
  }
  .offk {
    opacity: 0.35;
  }
  .log {
    list-style: none;
    margin: 0;
    padding: 0;
    border-top: 1px solid var(--line);
  }
  .log li {
    display: grid;
    grid-template-columns: 76px 78px 92px 1fr;
    align-items: center;
    gap: 10px;
    padding: 8px 2px;
    border-bottom: 1px solid var(--line);
    font-size: 13px;
    animation: enter 0.35s var(--ease);
  }
  .log li:first-child {
    animation: enter 0.35s var(--ease), flash 1.2s var(--ease);
  }
  @keyframes enter {
    from {
      opacity: 0;
      transform: translateY(-6px);
    }
  }
  @keyframes flash {
    from {
      background: color-mix(in srgb, var(--lilac) 12%, transparent);
    }
  }
  time {
    color: var(--text-3);
  }
  .type {
    color: var(--text-2);
    text-transform: capitalize;
  }
  .url {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--text-3);
  }
  .url b {
    color: var(--text);
    font-weight: 600;
  }
</style>
