<script lang="ts">
  import { onMount } from 'svelte';
  import { fly, fade } from 'svelte/transition';
  import { cubicOut, backOut } from 'svelte/easing';
  import gsap from 'gsap';
  import Hushy, { type HushyMood } from '../components/Hushy.svelte';
  import Waveform from '../components/Waveform.svelte';
  import Toggle from '../components/Toggle.svelte';
  import Burst from '../components/Burst.svelte';
  import { applyTheme, reducedMotion } from '../theme';
  import { getSettings, saveSettings } from '../../shared/storage';
  import { RULESETS, rulesetsForLevel, DEFAULT_SETTINGS, type ProtectionLevel, type Settings } from '../../shared/constants';

  let step = $state(0);
  let mood = $state<HushyMood>('idle');
  let loud = $state(true);
  let settings = $state<Settings>({ ...DEFAULT_SETTINGS });
  let isBrave = $state(false);
  let burst: Burst;
  let hero: HTMLElement;

  onMount(async () => {
    settings = await getSettings();
    applyTheme(settings);
    const nav = navigator as Navigator & { brave?: { isBrave(): Promise<boolean> } };
    isBrave = !!(nav.brave && (await nav.brave.isBrave().catch(() => false)));
    if (!reducedMotion()) gsap.from(hero, { scale: 0.2, opacity: 0, y: 40, duration: 1.1, ease: 'elastic.out(1, 0.55)', delay: 0.2 });
  });

  function quiet() {
    loud = false;
    mood = 'shh';
    setTimeout(() => (step = 1), reducedMotion() ? 0 : 1100);
  }

  async function chooseLevel(level: ProtectionLevel) {
    const on = new Set(rulesetsForLevel(level));
    for (const r of RULESETS) if (r.group !== 'regional') settings.rulesets[r.id] = on.has(r.id);
    settings.level = level;
    settings.strictPopups = level !== 'balanced';
  }

  async function finish() {
    settings.onboarded = true;
    await saveSettings($state.snapshot(settings));
    await chrome.runtime.sendMessage({ type: 'settingsChanged' });
    step = 3;
    mood = 'celebrate';
    setTimeout(() => burst.fire(innerWidth / 2, innerHeight * 0.35, 120), 250);
    setTimeout(() => (mood = 'shh'), 1800);
  }

  const LEVELS: Array<{ id: ProtectionLevel; name: string; desc: string }> = [
    { id: 'balanced', name: 'Balanced', desc: 'Blocks ads, trackers, malware and annoyances. Works everywhere.' },
    { id: 'strict', name: 'Strict', desc: 'Also blocks whole ad-server domains and mobile ad networks.' },
    { id: 'ninja', name: 'Ninja', desc: 'Strict, plus the most aggressive popup hunting.' },
  ];
  const regional = RULESETS.filter((r) => r.group === 'regional');
</script>

<Burst bind:this={burst} />

<main>
  <div class="steps" aria-label="Setup progress">
    {#each [0, 1, 2, 3] as i}
      <span class:done={step >= i}></span>
    {/each}
  </div>

  <div class="hero" bind:this={hero}>
    <Hushy {mood} size={step === 0 ? 220 : 150} />
  </div>
  <div class="wave"><Waveform height={90} {loud} intro={false} /></div>

  {#key step}
    <section in:fly={{ y: 24, duration: 520, easing: cubicOut, delay: 120 }} out:fade={{ duration: 120 }}>
      {#if step === 0}
        <h1>The web is loud.</h1>
        <p class="lede">Ads, popups, trackers, autoplaying noise. Hushy is here to quiet all of it, on every site, from the very first page load.</p>
        <button class="cta" onclick={quiet} disabled={!loud}>Make it quiet</button>
      {:else if step === 1}
        <h1>How strict should Hushy be?</h1>
        <p class="lede">You can change this any time from the dashboard.</p>
        <div class="levels">
          {#each LEVELS as l, i (l.id)}
            <button class="level" class:on={settings.level === l.id} onclick={() => chooseLevel(l.id)} in:fly={{ y: 20, delay: 200 + i * 80, easing: backOut }}>
              <span class="lname">{l.name}</span>
              <span class="ldesc">{l.desc}</span>
            </button>
          {/each}
        </div>
        <button class="cta" onclick={() => (step = 2)}>Continue</button>
      {:else if step === 2}
        <h1>A few extra quiet things</h1>
        <div class="opts">
          <label class="opt"><span><b>Reject cookie banners</b>Click “reject” for you, and hide the rest.</span><Toggle label="Reject cookie banners" bind:checked={settings.cookieAutoReject} /></label>
          <label class="opt"><span><b>Silence notification prompts</b>No more “Allow notifications?” on every news site.</span><Toggle label="Silence notification prompts" bind:checked={settings.blockNotificationPrompts} /></label>
          <label class="opt"><span><b>Skip YouTube & Twitch ads</b>Including the ones stitched into the video itself.</span><Toggle label="Skip YouTube and Twitch ads" checked={settings.youtube && settings.twitch} onchange={(v) => { settings.youtube = v; settings.twitch = v; }} /></label>
          <label class="opt"><span><b>Strip tracking from links</b>Removes utm_, fbclid and friends from addresses.</span><Toggle label="Strip tracking from links" bind:checked={settings.stripTracking} /></label>
        </div>
        <p class="lede small">Regional lists for sites in your language:</p>
        <div class="regions">
          {#each regional as r (r.id)}
            <button class="region" class:on={settings.rulesets[r.id]} onclick={() => (settings.rulesets[r.id] = !settings.rulesets[r.id])} aria-pressed={!!settings.rulesets[r.id]}>{r.name}</button>
          {/each}
        </div>
        <button class="cta" onclick={finish}>Finish setup</button>
      {:else}
        <h1>Shh. You’re all set.</h1>
        <p class="lede">Pin HUSH so Hushy is always one click away: open the puzzle-piece menu in your toolbar and press the pin next to HUSH.</p>
        <div class="pin" aria-hidden="true">
          <span class="bar"><span class="omni"></span><span class="puzzle">⧉</span><span class="mini">🤫</span></span>
        </div>
        {#if isBrave}
          <p class="tip">You’re using Brave. Shields and HUSH work together. If a site ever breaks, set Shields to Standard on that site or pause HUSH there.</p>
        {/if}
        <div class="end">
          <button class="cta" onclick={() => window.close()}>Start browsing</button>
          <button class="ghost" onclick={() => (location.href = chrome.runtime.getURL('/options.html'))}>Open the dashboard</button>
        </div>
      {/if}
    </section>
  {/key}
</main>

<style>
  main {
    min-height: 100vh;
    display: grid;
    justify-items: center;
    align-content: start;
    padding: 48px 20px 60px;
    text-align: center;
    background:
      radial-gradient(70% 50% at 50% 30%, color-mix(in srgb, var(--lilac-deep) 26%, transparent), transparent 70%),
      var(--ink);
    overflow-x: hidden;
  }
  .steps {
    display: flex;
    gap: 8px;
    margin-bottom: 20px;
  }
  .steps span {
    width: 34px;
    height: 4px;
    border-radius: 4px;
    background: var(--line-strong);
    transition: background 0.5s var(--ease);
  }
  .steps span.done {
    background: var(--lilac);
  }
  .hero {
    display: grid;
    place-items: center;
    min-height: 150px;
  }
  .wave {
    width: min(720px, 100%);
    margin-top: -40px;
  }
  section {
    max-width: 640px;
    display: grid;
    justify-items: center;
    gap: 14px;
  }
  h1 {
    margin: 10px 0 0;
    font-family: var(--display);
    font-size: clamp(36px, 6vw, 60px);
    font-weight: 800;
    letter-spacing: -0.04em;
    line-height: 1.02;
  }
  .lede {
    margin: 0;
    color: var(--text-2);
    font-size: 17px;
    max-width: 48ch;
    text-wrap: balance;
  }
  .lede.small {
    font-size: 14px;
    margin-top: 6px;
  }
  .cta {
    margin-top: 10px;
    height: 52px;
    padding: 0 30px;
    border-radius: 16px;
    border: 0;
    background: var(--moon);
    color: #2a2050;
    font-weight: 800;
    font-size: 16px;
    cursor: pointer;
    box-shadow: 0 12px 40px var(--moon-glow);
    transition: transform 0.35s var(--spring), box-shadow 0.3s;
  }
  .cta:hover:not(:disabled) {
    transform: translateY(-2px) scale(1.02);
  }
  .cta:active:not(:disabled) {
    transform: scale(0.97);
  }
  .cta:disabled {
    opacity: 0.6;
  }
  .ghost {
    height: 52px;
    padding: 0 22px;
    border-radius: 16px;
    border: 1px solid var(--line-strong);
    background: transparent;
    color: var(--text);
    font-weight: 700;
    cursor: pointer;
  }
  .levels {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 12px;
    width: min(720px, 92vw);
    margin-top: 8px;
  }
  .level {
    display: grid;
    align-content: start;
    gap: 6px;
    text-align: left;
    padding: 18px;
    border-radius: var(--radius-lg);
    border: 1px solid var(--line);
    background: var(--ink-2);
    cursor: pointer;
    transition: border-color 0.25s, background 0.25s, transform 0.35s var(--spring);
  }
  .level.on {
    border-color: var(--lilac);
    background: color-mix(in srgb, var(--lilac-deep) 16%, var(--ink-2));
    transform: translateY(-3px);
  }
  .lname {
    font-family: var(--display);
    font-weight: 700;
    font-size: 20px;
  }
  .ldesc {
    color: var(--text-2);
    font-size: 13.5px;
  }
  .opts {
    width: min(560px, 92vw);
    display: grid;
    border-top: 1px solid var(--line);
    text-align: left;
  }
  .opt {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 14px 4px;
    border-bottom: 1px solid var(--line);
  }
  .opt span {
    flex: 1;
    display: grid;
    color: var(--text-2);
    font-size: 13px;
  }
  .opt b {
    color: var(--text);
    font-size: 15px;
  }
  .regions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    justify-content: center;
  }
  .region {
    height: 34px;
    padding: 0 14px;
    border-radius: 99px;
    border: 1px solid var(--line-strong);
    background: transparent;
    color: var(--text-2);
    font-weight: 600;
    cursor: pointer;
    transition: all 0.25s var(--spring);
  }
  .region.on {
    background: var(--lilac-deep);
    color: #fff;
    border-color: transparent;
  }
  .pin {
    margin: 8px 0;
  }
  .bar {
    display: inline-flex;
    align-items: center;
    gap: 14px;
    height: 44px;
    padding: 0 14px;
    border-radius: 14px;
    background: var(--surface);
    border: 1px solid var(--line-strong);
  }
  .omni {
    width: 220px;
    height: 22px;
    border-radius: 11px;
    background: var(--ink-2);
  }
  .puzzle {
    color: var(--text-2);
    font-size: 18px;
  }
  .mini {
    font-size: 20px;
    animation: pop 1.6s var(--spring) 0.6s both;
  }
  @keyframes pop {
    0% {
      transform: scale(0);
    }
    60% {
      transform: scale(1.3);
    }
    100% {
      transform: scale(1);
    }
  }
  .tip {
    max-width: 52ch;
    padding: 12px 16px;
    border-radius: var(--radius);
    background: color-mix(in srgb, var(--amber) 12%, var(--surface));
    color: var(--text-2);
    font-size: 14px;
    margin: 0;
  }
  .end {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
    justify-content: center;
  }
  @media (max-width: 700px) {
    .levels {
      grid-template-columns: 1fr;
    }
  }
</style>
