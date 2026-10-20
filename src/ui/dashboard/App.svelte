<script lang="ts">
  import { onMount } from 'svelte';
  import { fly, fade } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import Hushy from '../components/Hushy.svelte';
  import Icon from '../components/Icon.svelte';
  import Overview from './Overview.svelte';
  import Protection from './Protection.svelte';
  import Lists from './Lists.svelte';
  import MyFilters from './MyFilters.svelte';
  import Paused from './Paused.svelte';
  import Logger from './Logger.svelte';
  import Help from './Help.svelte';
  import SettingsPage from './Settings.svelte';
  import About from './About.svelte';
  import { app, loadApp } from './store.svelte';

  const PAGES = [
    { id: 'overview', label: 'Overview', icon: 'chart' },
    { id: 'protection', label: 'Protection', icon: 'shield' },
    { id: 'lists', label: 'Filter lists', icon: 'filter' },
    { id: 'filters', label: 'My filters', icon: 'pen' },
    { id: 'paused', label: 'Paused sites', icon: 'pause' },
    { id: 'logger', label: 'Request log', icon: 'radar' },
    { id: 'help', label: 'Fix a site', icon: 'flag' },
    { id: 'settings', label: 'Settings', icon: 'sliders' },
    { id: 'about', label: 'About', icon: 'info' },
  ] as const;
  type PageId = (typeof PAGES)[number]['id'];

  let page = $state<PageId>('overview');
  let arg = $state('');
  let navEl: HTMLElement;
  let pill = $state({ top: 0, height: 0 });

  function readHash() {
    const [p, ...rest] = location.hash.replace(/^#/, '').split('/');
    page = (PAGES.some((x) => x.id === p) ? p : 'overview') as PageId;
    arg = decodeURIComponent(rest.join('/'));
  }

  function go(id: PageId) {
    location.hash = id;
  }

  $effect(() => {
    // Move the active pill under the selected item.
    void page;
    queueMicrotask(() => {
      const el = navEl?.querySelector<HTMLElement>(`[data-id="${page}"]`);
      if (el) pill = { top: el.offsetTop, height: el.offsetHeight };
    });
  });

  onMount(() => {
    readHash();
    addEventListener('hashchange', readHash);
    void loadApp();
    return () => removeEventListener('hashchange', readHash);
  });
</script>

<div class="shell">
  <aside class="rail">
    <a class="brand" href="#overview" aria-label="HUSH overview">
      <Hushy size={44} mood={app.settings.enabled ? 'idle' : 'sleep'} follow={false} />
      <span class="word">hush</span>
    </a>
    <nav bind:this={navEl} aria-label="Sections">
      <span class="pill" style="transform: translateY({pill.top}px); height: {pill.height}px"></span>
      {#each PAGES as p (p.id)}
        <button data-id={p.id} class:active={page === p.id} aria-current={page === p.id ? 'page' : undefined} onclick={() => go(p.id)}>
          <Icon name={p.icon} />
          <span>{p.label}</span>
        </button>
      {/each}
    </nav>
    <div class="rail-foot" class:off={!app.settings.enabled}>
      <span class="dot"></span>
      {app.settings.enabled ? 'Protection is on' : 'HUSH is switched off'}
    </div>
  </aside>

  <main>
    {#if app.ready}
      {#key page}
        <div class="page" in:fly={{ y: 14, duration: 380, easing: cubicOut }}>
          {#if page === 'overview'}<Overview />
          {:else if page === 'protection'}<Protection />
          {:else if page === 'lists'}<Lists />
          {:else if page === 'filters'}<MyFilters />
          {:else if page === 'paused'}<Paused />
          {:else if page === 'logger'}<Logger />
          {:else if page === 'help'}<Help host={arg} />
          {:else if page === 'settings'}<SettingsPage />
          {:else if page === 'about'}<About />
          {/if}
        </div>
      {/key}
    {/if}
  </main>

  {#if app.toast}
    <div class="toast" role="status" transition:fly={{ y: 20, duration: 320 }}>{app.toast}</div>
  {/if}
  {#if app.saving}
    <div class="saving" transition:fade={{ duration: 150 }} aria-hidden="true"></div>
  {/if}
</div>

<style>
  .shell {
    display: grid;
    grid-template-columns: 232px 1fr;
    min-height: 100vh;
    background:
      radial-gradient(60% 40% at 80% -10%, color-mix(in srgb, var(--lilac-deep) 18%, transparent), transparent 70%),
      var(--ink);
  }
  .rail {
    position: sticky;
    top: 0;
    height: 100vh;
    display: flex;
    flex-direction: column;
    padding: 20px 14px;
    border-right: 1px solid var(--line);
    background: color-mix(in srgb, var(--ink-2) 70%, transparent);
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 6px 22px;
    color: var(--text);
    text-decoration: none;
  }
  .word {
    font-family: var(--display);
    font-weight: 800;
    font-size: 24px;
    letter-spacing: -0.04em;
  }
  nav {
    position: relative;
    display: grid;
    gap: 2px;
  }
  .pill {
    position: absolute;
    left: 0;
    right: 0;
    top: 0;
    border-radius: 12px;
    background: var(--surface-2);
    box-shadow: inset 3px 0 0 var(--lilac);
    transition: transform 0.45s var(--spring), height 0.3s var(--ease);
  }
  nav button {
    position: relative;
    display: flex;
    align-items: center;
    gap: 11px;
    height: 40px;
    padding: 0 12px;
    border: 0;
    background: none;
    color: var(--text-2);
    font-weight: 600;
    font-size: 14px;
    border-radius: 12px;
    cursor: pointer;
    text-align: left;
    transition: color 0.2s;
  }
  nav button:hover {
    color: var(--text);
  }
  nav button.active {
    color: var(--text);
  }
  nav button.active :global(svg) {
    color: var(--lilac);
  }
  .rail-foot {
    margin-top: auto;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 12px;
    font-size: 12.5px;
    color: var(--text-2);
  }
  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--mint);
    box-shadow: 0 0 10px var(--mint);
  }
  .off .dot {
    background: var(--coral);
    box-shadow: 0 0 10px var(--coral);
  }
  main {
    padding: 40px 48px 80px;
    min-width: 0;
  }
  .page {
    max-width: 920px;
  }
  .toast {
    position: fixed;
    left: 50%;
    bottom: 28px;
    translate: -50% 0;
    padding: 12px 18px;
    border-radius: 14px;
    background: var(--surface-2);
    border: 1px solid var(--line-strong);
    box-shadow: var(--shadow);
    font-weight: 600;
    z-index: 30;
  }
  .saving {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    height: 2px;
    background: linear-gradient(90deg, transparent, var(--lilac), transparent);
    background-size: 50% 100%;
    animation: sweep 0.9s linear infinite;
  }
  @keyframes sweep {
    from {
      background-position: -50% 0;
    }
    to {
      background-position: 150% 0;
    }
  }
  @media (max-width: 760px) {
    .shell {
      grid-template-columns: 1fr;
    }
    .rail {
      position: static;
      height: auto;
      border-right: 0;
      border-bottom: 1px solid var(--line);
    }
    nav {
      grid-auto-flow: column;
      overflow-x: auto;
    }
    .pill,
    .rail-foot {
      display: none;
    }
    nav button.active {
      background: var(--surface-2);
    }
    main {
      padding: 24px 16px 60px;
    }
  }
</style>
