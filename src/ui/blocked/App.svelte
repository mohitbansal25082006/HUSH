<script lang="ts">
  import { onMount } from 'svelte';
  import { fly } from 'svelte/transition';
  import Hushy from '../components/Hushy.svelte';
  import { applyTheme } from '../theme';
  import { getSettings, hostOf } from '../../shared/storage';

  let url = $state('');
  const host = $derived(hostOf(url) || 'this site');
  let proceeding = $state(false);

  onMount(async () => {
    applyTheme(await getSettings());
    url = ((await chrome.runtime.sendMessage({ type: 'getBlockedUrl' })) as string) || '';
  });

  function back() {
    if (history.length > 1) history.back();
    else location.href = 'about:blank';
  }

  async function proceed() {
    if (!url) return;
    proceeding = true;
    await chrome.runtime.sendMessage({ type: 'allowOnce', host: hostOf(url) });
    location.replace(url);
  }
</script>

<main>
  <div in:fly={{ y: -20, duration: 600 }}>
    <Hushy mood="alert" size={190} />
  </div>
  <section in:fly={{ y: 24, duration: 600, delay: 150 }}>
    <h1>Hushy stopped this page.</h1>
    <p><b>{host}</b> is on a list of sites known for malware, scams or phishing. HUSH blocked it before anything could load.</p>
    <div class="actions">
      <button class="primary" onclick={back}>Take me back</button>
      <button class="link" onclick={proceed} disabled={!url || proceeding}>I understand the risk, continue</button>
    </div>
    {#if url}<p class="url" title={url}>{url}</p>{/if}
  </section>
</main>

<style>
  main {
    min-height: 100vh;
    display: grid;
    place-content: center;
    justify-items: center;
    gap: 10px;
    padding: 24px 16px;
    text-align: center;
    background:
      radial-gradient(60% 45% at 50% 30%, color-mix(in srgb, var(--coral) 20%, transparent), transparent 70%),
      var(--ink);
  }
  section {
    max-width: 560px;
  }
  h1 {
    margin: 0 0 10px;
    font-family: var(--display);
    font-size: clamp(30px, 5vw, 46px);
    letter-spacing: -0.035em;
  }
  p {
    margin: 0;
    color: var(--text-2);
    font-size: 16px;
  }
  b {
    color: var(--text);
  }
  .actions {
    display: flex;
    gap: 12px;
    justify-content: center;
    flex-wrap: wrap;
    margin: 26px 0 18px;
  }
  .primary {
    height: 48px;
    padding: 0 26px;
    border-radius: 14px;
    border: 0;
    background: var(--moon);
    color: #2a2050;
    font-weight: 800;
    font-size: 15px;
    cursor: pointer;
    box-shadow: 0 10px 34px var(--moon-glow);
  }
  .link {
    height: 48px;
    padding: 0 12px;
    border: 0;
    background: none;
    color: var(--text-3);
    text-decoration: underline;
    cursor: pointer;
  }
  .url {
    font-size: 12px;
    color: var(--text-3);
    word-break: break-all;
  }
</style>
