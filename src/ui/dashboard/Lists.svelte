<script lang="ts">
  import { onMount } from 'svelte';
  import Toggle from '../components/Toggle.svelte';
  import Icon from '../components/Icon.svelte';
  import { app, toast, updateSettings } from './store.svelte';
  import { RULESETS } from '../../shared/constants';

  interface BuildInfo {
    build: { built: string; version: string } | null;
    index: Array<{ id: string; rules: number }>;
    enabled: string[];
    hotfix: { version: number; checked: number; error?: string } | null;
    dynamicRules: number;
    availableStatic: number;
    version: string;
  }
  let info = $state<BuildInfo | null>(null);
  let checking = $state(false);

  async function load() {
    info = (await chrome.runtime.sendMessage({ type: 'getBuildInfo' })) as BuildInfo;
  }
  onMount(load);

  const rules = (id: string) => info?.index.find((r) => r.id === id)?.rules ?? 0;
  const fmtDate = (t: number | string) => new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(t));

  async function toggle(id: string, on: boolean) {
    await updateSettings({ rulesets: { ...app.settings.rulesets, [id]: on } }, `${RULESETS.find((r) => r.id === id)?.name} ${on ? 'on' : 'off'}`);
    await load();
    if (on && !info?.enabled.includes(id)) toast('Chrome refused: the extension rule budget is full. Turn another list off first.');
  }

  let url = $state(app.settings.hotfixUrl);

  async function saveUrl(e: SubmitEvent) {
    e.preventDefault();
    const v = url.trim();
    if (v && !/^https?:\/\/\S+$/.test(v)) {
      toast('Enter a full address starting with http:// or https://');
      return;
    }
    await updateSettings({ hotfixUrl: v }, v ? 'Hotfix address saved' : 'Hotfix address removed');
  }

  async function checkNow() {
    checking = true;
    const res = (await chrome.runtime.sendMessage({ type: 'checkHotfix' })) as { updated: boolean; state: { error?: string } | null };
    checking = false;
    await load();
    toast(res?.updated ? 'New hotfix filters applied' : res?.state?.error ? `Hotfix check failed: ${res.state.error}` : 'You already have the latest fixes');
  }

  const GROUPS = [
    { id: 'core', name: 'Core protection' },
    { id: 'extra', name: 'Extra blocking' },
    { id: 'regional', name: 'Regional lists' },
  ] as const;
</script>

<header class="page-head">
  <h2>Filter lists</h2>
  <p>HUSH compiles the best community lists into native browser rules. They run inside the browser’s own network engine, so they cost almost nothing.</p>
</header>

{#each GROUPS as g (g.id)}
  <h3 class="section">{g.name}</h3>
  <div class="rows">
    {#each RULESETS.filter((r) => r.group === g.id) as r (r.id)}
      <div class="row">
        <div class="text">
          <div class="name">{r.name}</div>
          <div class="desc">{r.description}</div>
        </div>
        <span class="meta">{rules(r.id).toLocaleString()} rules</span>
        <Toggle label={r.name} checked={!!app.settings.rulesets[r.id]} onchange={(v) => toggle(r.id, v)} />
      </div>
    {/each}
  </div>
{/each}

<h3 class="section">Fast fixes</h3>
<div class="rows">
  <div class="row">
    <div class="text">
      <div class="name">Hotfix updates</div>
      <div class="desc">
        Signed filter fixes arrive every few hours, so new YouTube or Twitch tricks are handled without waiting for an extension update.
        {#if info?.hotfix?.checked}Last checked {fmtDate(info.hotfix.checked)}.{/if}
        {#if info?.hotfix?.error}<span class="err">Last check failed: {info.hotfix.error}.</span>{/if}
      </div>
    </div>
    <button class="btn small" onclick={checkNow} disabled={checking || !app.settings.hotfixes}>
      <span class:spin={checking}><Icon name="refresh" size={15} /></span>
      {checking ? 'Checking' : 'Check now'}
    </button>
    <Toggle label="Hotfix updates" checked={app.settings.hotfixes} onchange={(v) => updateSettings({ hotfixes: v })} />
  </div>
  <form class="row" onsubmit={saveUrl}>
    <div class="text">
      <div class="name">Hotfix address</div>
      <div class="desc">Where HUSH looks for signed fixes. For local development run <code>npm run hotfix:serve</code> and use <code>http://localhost:8787/hotfix.json</code>.</div>
      <input class="input url" bind:value={url} placeholder="https://example.com/hotfix.json" aria-label="Hotfix address" />
    </div>
    <button class="btn small" type="submit" disabled={url.trim() === app.settings.hotfixUrl}>Save address</button>
  </form>
</div>

{#if info}
  <p class="foot">
    Filters built {info.build ? fmtDate(info.build.built) : 'unknown'}. {info.dynamicRules.toLocaleString()} custom rules active.
    {#if info.availableStatic}Room for {info.availableStatic.toLocaleString()} more list rules.{/if}
  </p>
{/if}

<style>
  .err {
    color: var(--coral);
  }
  .url {
    width: 100%;
    max-width: 520px;
    margin-top: 10px;
  }
  code {
    font-size: 12px;
    color: var(--lilac);
  }
  .foot {
    margin-top: 22px;
    color: var(--text-3);
    font-size: 12.5px;
  }
  .spin {
    display: inline-flex;
    animation: spin 0.9s linear infinite;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>
