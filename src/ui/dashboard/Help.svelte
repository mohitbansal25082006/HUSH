<script lang="ts">
  import { onMount } from 'svelte';
  import Icon from '../components/Icon.svelte';
  import { getAllowlist, getUserFilters, isAllowlisted, setAllowlist, setUserFilters } from '../../shared/storage';
  import { app, toast } from './store.svelte';

  interface Props {
    host?: string;
  }
  let { host: initial = '' }: Props = $props();
  let host = $state('');
  let paused = $state(false);
  let lenient = $state(false);
  let copied = $state(false);

  const relaxFilters = (h: string) => [`@@||${h}^$elemhide`, `${h}#@#+js()`];

  async function refresh() {
    if (!host) return;
    paused = isAllowlisted(host, await getAllowlist());
    const text = await getUserFilters();
    lenient = relaxFilters(host).every((l) => text.split('\n').includes(l));
  }

  onMount(() => {
    host = initial.replace(/^www\./, '');
    void refresh();
  });

  async function togglePause() {
    const list = await getAllowlist();
    await setAllowlist(paused ? list.filter((h) => h !== host) : [...list, host]);
    paused = !paused;
    toast(paused ? `Paused on ${host}. Reload the site to see it without HUSH.` : `HUSH protects ${host} again`);
  }

  async function toggleLenient() {
    const lines = relaxFilters(host);
    let text = await getUserFilters();
    if (lenient) text = text.split('\n').filter((l) => !lines.includes(l)).join('\n');
    else text = `${text.replace(/\n*$/, '')}\n${lines.join('\n')}\n`.replace(/^\n/, '');
    await setUserFilters(text);
    await chrome.runtime.sendMessage({ type: 'userFiltersChanged' });
    lenient = !lenient;
    toast(lenient ? `Only network blocking on ${host} now. Reload the site.` : `Full protection restored on ${host}`);
  }

  async function copyReport() {
    const info = await chrome.runtime.sendMessage({ type: 'getBuildInfo' });
    const enabled = Object.entries(app.settings.rulesets).filter(([, v]) => v).map(([k]) => k).join(', ');
    const report = [
      `Site: ${host}`,
      `HUSH ${info?.version} (filters ${info?.build?.built ?? '?'})`,
      `Browser: ${navigator.userAgent}`,
      `Level: ${app.settings.level}`,
      `Lists: ${enabled}`,
      `Paused here: ${paused}  Relaxed here: ${lenient}`,
      'What is broken:',
    ].join('\n');
    await navigator.clipboard.writeText(report);
    copied = true;
    setTimeout(() => (copied = false), 2000);
  }
</script>

<header class="page-head">
  <h2>Fix a site</h2>
  <p>Ad blocking occasionally breaks a feature on a site. Try these steps in order; each one is easy to undo.</p>
</header>

<form class="site" onsubmit={(e) => { e.preventDefault(); void refresh(); }}>
  <input class="input" bind:value={host} placeholder="example.com" aria-label="Site" />
  <button class="btn" type="submit">Check</button>
</form>

{#if host}
  <ol class="steps">
    <li>
      <div class="text">
        <div class="name">Relax HUSH on {host}</div>
        <div class="desc">Keeps ad and tracker requests blocked, but stops hiding page elements and stops in-page scripts. This fixes most broken layouts and logins.</div>
      </div>
      <button class="btn" onclick={toggleLenient}>{lenient ? 'Restore full protection' : 'Relax on this site'}</button>
    </li>
    <li>
      <div class="text">
        <div class="name">Pause HUSH on {host}</div>
        <div class="desc">Turns HUSH off entirely on this site. Ads will show again here.</div>
      </div>
      <button class="btn" onclick={togglePause}>{paused ? 'Resume protection' : 'Pause on this site'}</button>
    </li>
    <li>
      <div class="text">
        <div class="name">Still broken, or an ad got through?</div>
        <div class="desc">Copy a short report with your HUSH version and settings, and send it to the filter maintainers along with what you saw.</div>
      </div>
      <button class="btn" onclick={copyReport}><Icon name={copied ? 'check' : 'link'} size={15} /> {copied ? 'Copied' : 'Copy report'}</button>
    </li>
  </ol>
{:else}
  <p class="empty">Enter a site above, or open this page from the HUSH popup while you’re on the site.</p>
{/if}

<style>
  .site {
    display: flex;
    gap: 10px;
    max-width: 520px;
    margin-bottom: 20px;
  }
  .site .input {
    flex: 1;
  }
  .steps {
    margin: 0;
    padding: 0;
    list-style: none;
    counter-reset: step;
    border-top: 1px solid var(--line);
  }
  .steps li {
    counter-increment: step;
    display: flex;
    align-items: center;
    gap: 18px;
    padding: 18px 2px;
    border-bottom: 1px solid var(--line);
  }
  .steps li::before {
    content: counter(step);
    flex: none;
    width: 32px;
    height: 32px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    font-family: var(--display);
    font-weight: 700;
    background: var(--surface-2);
    color: var(--lilac);
  }
  .text {
    flex: 1;
  }
  .name {
    font-weight: 650;
  }
  .desc {
    color: var(--text-2);
    font-size: 13px;
    max-width: 60ch;
  }
</style>
