<script lang="ts">
  import Toggle from '../components/Toggle.svelte';
  import Icon from '../components/Icon.svelte';
  import { app, refreshStats, toast, updateSettings } from './store.svelte';
  import { DEFAULT_SETTINGS, type Settings } from '../../shared/constants';
  import { getAllowlist, getUserFilters, setAllowlist, setUserFilters } from '../../shared/storage';

  let confirmReset = $state(false);
  let fileInput: HTMLInputElement;

  async function exportAll() {
    const data = {
      app: 'HUSH',
      version: chrome.runtime.getManifest().version,
      exported: new Date().toISOString(),
      settings: app.settings,
      allowlist: await getAllowlist(),
      userFilters: await getUserFilters(),
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `hush-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast('Backup downloaded');
  }

  async function importAll(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (data.app !== 'HUSH') throw new Error('not a HUSH backup');
      if (Array.isArray(data.allowlist)) await setAllowlist(data.allowlist.filter((h: unknown) => typeof h === 'string'));
      if (typeof data.userFilters === 'string') await setUserFilters(data.userFilters);
      if (data.settings && typeof data.settings === 'object') {
        const clean: Partial<Settings> = {};
        for (const k of Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]) {
          if (k in data.settings && typeof data.settings[k] === typeof DEFAULT_SETTINGS[k]) (clean as Record<string, unknown>)[k] = data.settings[k];
        }
        await updateSettings(clean);
      }
      toast('Backup restored');
    } catch (err) {
      toast(`Could not restore: ${(err as Error).message}`);
    }
    fileInput.value = '';
  }

  async function resetStats() {
    if (!confirmReset) {
      confirmReset = true;
      setTimeout(() => (confirmReset = false), 4000);
      return;
    }
    await chrome.runtime.sendMessage({ type: 'resetStats' });
    await refreshStats();
    confirmReset = false;
    toast('Statistics cleared');
  }

</script>

<header class="page-head">
  <h2>Settings</h2>
  <p>How HUSH looks and behaves.</p>
</header>

<div class="rows">
  <div class="row">
    <div class="text"><div class="name">Theme</div><div class="desc">Auto follows your system.</div></div>
    <div class="seg" role="radiogroup" aria-label="Theme">
      {#each [['auto', 'Auto'], ['dark', 'Night'], ['light', 'Day']] as [v, l]}
        <button class:on={app.settings.theme === v} role="radio" aria-checked={app.settings.theme === v} onclick={() => updateSettings({ theme: v as Settings['theme'] })}>{l}</button>
      {/each}
    </div>
  </div>
  <div class="row">
    <div class="text"><div class="name">Animations</div><div class="desc">Reduced keeps Hushy still and turns transitions off.</div></div>
    <div class="seg" role="radiogroup" aria-label="Animations">
      {#each [['full', 'Full'], ['reduced', 'Reduced']] as [v, l]}
        <button class:on={app.settings.motion === v} role="radio" aria-checked={app.settings.motion === v} onclick={() => updateSettings({ motion: v as Settings['motion'] })}>{l}</button>
      {/each}
    </div>
  </div>
  <div class="row">
    <div class="text"><div class="name">Count on the toolbar icon</div><div class="desc">Shows how many things were blocked on the current page.</div></div>
    <Toggle label="Count on the toolbar icon" checked={app.settings.badge} onchange={(v) => updateSettings({ badge: v })} />
  </div>
  <div class="row">
    <div class="text"><div class="name">HUSH is on</div><div class="desc">Switches all protection off or on everywhere.</div></div>
    <Toggle label="HUSH is on" checked={app.settings.enabled} onchange={(v) => updateSettings({ enabled: v }, v ? 'HUSH is on' : 'HUSH is off everywhere')} />
  </div>
</div>

<h3 class="section">Backup</h3>
<div class="rows">
  <div class="row">
    <div class="text"><div class="name">Export or restore</div><div class="desc">Settings, paused sites and your own filters, in one file. Statistics are not included.</div></div>
    <button class="btn small" onclick={exportAll}><Icon name="download" size={15} /> Export</button>
    <button class="btn small" onclick={() => fileInput.click()}><Icon name="upload" size={15} /> Restore</button>
    <input bind:this={fileInput} type="file" accept="application/json,.json" hidden onchange={importAll} />
  </div>
  <div class="row">
    <div class="text"><div class="name">Clear statistics</div><div class="desc">Resets every counter and the 30-day history.</div></div>
    <button class="btn small danger" onclick={resetStats}><Icon name="trash" size={15} /> {confirmReset ? 'Click again to clear' : 'Clear statistics'}</button>
  </div>
</div>

<h3 class="section">Keyboard shortcuts</h3>
<div class="rows">
  <div class="row"><div class="text"><div class="name">Block an element</div></div><kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>H</kbd></div>
  <div class="row"><div class="text"><div class="name">Zap an element</div></div><kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>Z</kbd></div>
  <div class="row">
    <div class="text"><div class="desc">Change shortcuts on the browser’s extension shortcuts page.</div></div>
    <button class="btn small" onclick={() => chrome.tabs.create({ url: 'chrome://extensions/shortcuts' })}>Open shortcuts</button>
  </div>
</div>

<style>
  kbd {
    display: inline-grid;
    place-items: center;
    min-width: 28px;
    height: 26px;
    padding: 0 7px;
    border-radius: 7px;
    background: var(--surface-2);
    border: 1px solid var(--line-strong);
    border-bottom-width: 2px;
    font: 600 12px var(--ui);
  }
</style>
