<script lang="ts">
  import { onMount } from 'svelte';
  import { slide } from 'svelte/transition';
  import { getUserFilters, setUserFilters } from '../../shared/storage';
  import { toast } from './store.svelte';

  let text = $state('');
  let saved = $state('');
  let result = $state<{ errors: Array<{ line: number; text: string; reason: string }>; counts?: { network: number; cosmetic: number; scriptlets: number; popups: number } } | null>(null);
  let saving = $state(false);
  let showHelp = $state(false);
  let gutter: HTMLElement;
  let area: HTMLTextAreaElement;

  onMount(async () => {
    text = saved = await getUserFilters();
  });

  const lines = $derived(text.split('\n'));
  const dirty = $derived(text !== saved);
  const errorLines = $derived(new Set(result?.errors.map((e) => e.line) ?? []));

  function kind(line: string): string {
    const l = line.trim();
    if (!l) return '';
    if (l.startsWith('!')) return 'comment';
    if (l.startsWith('@@')) return 'allow';
    if (/#@?[#?$]#/.test(l)) return l.includes('+js(') ? 'script' : 'cosmetic';
    return 'network';
  }

  async function save() {
    saving = true;
    await setUserFilters(text);
    saved = text;
    result = (await chrome.runtime.sendMessage({ type: 'userFiltersChanged' })) as typeof result;
    saving = false;
    toast(result?.errors.length ? `Saved. ${result.errors.length} line(s) could not be used.` : 'Your filters are active');
  }

  function onKey(e: KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      if (dirty) void save();
    }
  }
</script>

<header class="page-head">
  <h2>My filters</h2>
  <p>Write your own rules in the same syntax as uBlock Origin and Adblock Plus. Elements you block with the picker land here too.</p>
</header>

<div class="editor" class:dirty>
  <div class="gutter" bind:this={gutter} aria-hidden="true">
    {#each lines as l, i}
      <div class="ln {kind(l)}" class:bad={errorLines.has(i + 1)}>{i + 1}</div>
    {/each}
  </div>
  <textarea
    bind:this={area}
    bind:value={text}
    spellcheck="false"
    aria-label="Your filters"
    placeholder={'! One filter per line, for example:\n||ads.example.com^\nexample.com##.sponsored-banner\nexample.com##+js(set-constant, adsEnabled, false)'}
    onscroll={() => (gutter.scrollTop = area.scrollTop)}
    onkeydown={onKey}
  ></textarea>
</div>

<div class="bar">
  <button class="btn primary" onclick={save} disabled={!dirty || saving}>{saving ? 'Saving' : 'Save filters'}</button>
  <button class="btn" onclick={() => (text = saved)} disabled={!dirty}>Discard changes</button>
  {#if result?.counts}
    <span class="counts">
      {result.counts.network} network, {result.counts.cosmetic} cosmetic, {result.counts.scriptlets} scriptlet{result.counts.popups ? `, ${result.counts.popups} popup` : ''} rules active
    </span>
  {/if}
  <button class="btn small help-btn" onclick={() => (showHelp = !showHelp)} aria-expanded={showHelp}>Syntax help</button>
</div>

{#if result?.errors.length}
  <ul class="errors" transition:slide>
    {#each result.errors.slice(0, 30) as e (e.line)}
      <li><span class="mono">Line {e.line}</span> <code>{e.text}</code> <span class="why">{e.reason.replace(/:/g, ' ')}</span></li>
    {/each}
  </ul>
{/if}

{#if showHelp}
  <div class="help" transition:slide>
    <dl>
      <dt><code>||ads.example.com^</code></dt><dd>Block every request to a domain and its subdomains.</dd>
      <dt><code>||example.com/banner/*$image,3p</code></dt><dd>Block third-party images under a path.</dd>
      <dt><code>@@||cdn.example.com^$script</code></dt><dd>Allow something a list blocks.</dd>
      <dt><code>||popads.net^$popup</code></dt><dd>Close popups and new tabs that open this domain.</dd>
      <dt><code>example.com##.promo-box</code></dt><dd>Hide elements on one site.</dd>
      <dt><code>##.global-ad-class</code></dt><dd>Hide elements on every site.</dd>
      <dt><code>example.com##article:has-text(Sponsored)</code></dt><dd>Hide by text (procedural filters such as :has-text, :upward, :xpath).</dd>
      <dt><code>example.com##+js(set-constant, showAds, false)</code></dt><dd>Run a scriptlet to defuse page code.</dd>
      <dt><code>example.com#@#.promo-box</code></dt><dd>Stop hiding something a list hides.</dd>
    </dl>
  </div>
{/if}

<style>
  .editor {
    display: flex;
    height: 440px;
    border-radius: var(--radius-lg);
    border: 1px solid var(--line-strong);
    background: var(--ink-2);
    overflow: hidden;
    transition: border-color 0.2s;
  }
  .editor:focus-within {
    border-color: var(--lilac);
  }
  .gutter {
    flex: none;
    width: 52px;
    padding: 14px 0;
    overflow: hidden;
    border-right: 1px solid var(--line);
    font: 12.5px/22px ui-monospace, Consolas, monospace;
    color: var(--text-3);
    text-align: right;
  }
  .ln {
    padding-right: 10px;
    border-left: 3px solid transparent;
  }
  .ln.network {
    border-left-color: var(--coral);
  }
  .ln.cosmetic {
    border-left-color: var(--lilac);
  }
  .ln.script {
    border-left-color: var(--mint);
  }
  .ln.allow {
    border-left-color: var(--amber);
  }
  .ln.bad {
    color: var(--coral);
    background: color-mix(in srgb, var(--coral) 14%, transparent);
  }
  textarea {
    flex: 1;
    resize: none;
    border: 0;
    outline: none;
    background: transparent;
    color: var(--text);
    padding: 14px 16px;
    font: 13px/22px ui-monospace, 'Cascadia Code', Consolas, monospace;
    white-space: pre;
    overflow: auto;
    tab-size: 2;
  }
  textarea::placeholder {
    color: var(--text-3);
  }
  .bar {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-top: 14px;
    flex-wrap: wrap;
  }
  .counts {
    color: var(--text-2);
    font-size: 13px;
  }
  .help-btn {
    margin-left: auto;
  }
  .errors {
    list-style: none;
    padding: 12px 14px;
    margin: 16px 0 0;
    border-radius: var(--radius);
    background: color-mix(in srgb, var(--coral) 8%, var(--ink-2));
    border: 1px solid color-mix(in srgb, var(--coral) 25%, transparent);
    display: grid;
    gap: 6px;
    font-size: 13px;
  }
  .errors code {
    color: var(--text);
    word-break: break-all;
  }
  .why {
    color: var(--coral);
  }
  .help {
    margin-top: 16px;
    padding: 6px 18px;
    border-radius: var(--radius);
    background: var(--ink-2);
    border: 1px solid var(--line);
  }
  dl {
    display: grid;
    grid-template-columns: minmax(0, 1.1fr) 1fr;
    gap: 0 20px;
    margin: 0;
  }
  dt,
  dd {
    margin: 0;
    padding: 9px 0;
    border-bottom: 1px solid var(--line);
    font-size: 13px;
  }
  dt code {
    color: var(--lilac);
    font-size: 12.5px;
    word-break: break-all;
  }
  dd {
    color: var(--text-2);
  }
</style>
