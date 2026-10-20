<script lang="ts">
  import Toggle from '../components/Toggle.svelte';
  import { app, updateSettings } from './store.svelte';
  import { RULESETS, rulesetsForLevel, type ProtectionLevel, type Settings } from '../../shared/constants';

  const LEVELS: Array<{ id: ProtectionLevel; name: string; desc: string; waves: number }> = [
    { id: 'balanced', name: 'Balanced', desc: 'Ads, trackers, malware, cookie banners and annoyances. Fast and safe on every site.', waves: 2 },
    { id: 'strict', name: 'Strict', desc: 'Adds whole ad-server domain blocking and extra mobile ad networks.', waves: 3 },
    { id: 'ninja', name: 'Ninja', desc: 'Everything in Strict, plus the most aggressive popup detection. Rarely, a site may need pausing.', waves: 4 },
  ];

  async function setLevel(level: ProtectionLevel) {
    const on = new Set(rulesetsForLevel(level));
    const rulesets = { ...app.settings.rulesets };
    for (const r of RULESETS) if (r.group !== 'regional') rulesets[r.id] = on.has(r.id);
    await updateSettings(
      { level, rulesets, strictPopups: level !== 'balanced' || app.settings.strictPopups, overlayKiller: true },
      `${LEVELS.find((l) => l.id === level)!.name} protection is on`,
    );
  }

  type Key = keyof Settings;
  const FEATURES: Array<{ key: Key; name: string; desc: string }> = [
    { key: 'popupGuard', name: 'Popup & popunder guard', desc: 'Closes ad tabs and windows the moment they open, and stops pages from opening them in the first place.' },
    { key: 'strictPopups', name: 'Catch hijacked clicks', desc: 'Blocks new tabs to other sites when your click was on something unrelated, the classic popunder trick.' },
    { key: 'overlayKiller', name: 'Remove invisible click traps', desc: 'Deletes transparent layers stretched over pages to steal your first click.' },
    { key: 'youtube', name: 'YouTube ad skipper', desc: 'Mutes, fast-forwards and skips any video ad that slips past the filters, and clears the anti-adblock wall.' },
    { key: 'twitch', name: 'Twitch ad shield', desc: 'Swaps stitched-in stream ads for an ad-free feed, or mutes and covers them when that is not possible.' },
    { key: 'cookieAutoReject', name: 'Reject cookie banners', desc: 'Clicks “reject” on common consent banners, so sites record a refusal, not a silent yes.' },
    { key: 'blockNotificationPrompts', name: 'Silence notification prompts', desc: 'Stops sites from asking to send notifications unless you clicked something first.' },
    { key: 'stripTracking', name: 'Strip tracking from links', desc: 'Removes utm_, fbclid, gclid and other tracking parameters when you open a page.' },
    { key: 'cosmetic', name: 'Hide ad leftovers', desc: 'Hides empty ad slots, “sponsored” posts and banners that are part of the page itself.' },
    { key: 'scriptlets', name: 'Defuse ad scripts', desc: 'Neutralises anti-adblock checks and ad code inside pages. Turn off only to troubleshoot.' },
  ];
</script>

<header class="page-head">
  <h2>Protection</h2>
  <p>Pick how hard HUSH should work. You can still fine-tune every feature below.</p>
</header>

<div class="levels" role="radiogroup" aria-label="Protection level">
  {#each LEVELS as l (l.id)}
    <button class="level" class:on={app.settings.level === l.id} role="radio" aria-checked={app.settings.level === l.id} onclick={() => setLevel(l.id)}>
      <svg viewBox="0 0 120 36" aria-hidden="true">
        {#each Array(l.waves) as _, i}
          <path d="M0 18 Q {15 - i * 2} {18 - (i + 1) * 4} 30 18 T 60 18 T 90 18 T 120 18" style="--i:{i}" />
        {/each}
      </svg>
      <span class="lname">{l.name}</span>
      <span class="ldesc">{l.desc}</span>
    </button>
  {/each}
</div>

<h3 class="section">Features</h3>
<div class="rows">
  {#each FEATURES as f (f.key)}
    <div class="row">
      <div class="text">
        <div class="name">{f.name}</div>
        <div class="desc">{f.desc}</div>
      </div>
      <Toggle
        label={f.name}
        checked={app.settings[f.key] as boolean}
        disabled={(f.key === 'strictPopups' || f.key === 'overlayKiller') && !app.settings.popupGuard}
        onchange={(v) => updateSettings({ [f.key]: v } as Partial<Settings>, `${f.name} ${v ? 'on' : 'off'}`)}
      />
    </div>
  {/each}
</div>

<style>
  .levels {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 12px;
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
  .level:hover {
    border-color: var(--line-strong);
  }
  .level:active {
    transform: scale(0.98);
  }
  .level.on {
    border-color: var(--lilac);
    background: color-mix(in srgb, var(--lilac-deep) 14%, var(--ink-2));
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--lilac) 15%, transparent);
  }
  svg {
    width: 120px;
    height: 36px;
    margin-bottom: 4px;
  }
  path {
    fill: none;
    stroke: var(--text-3);
    stroke-width: 2;
    stroke-linecap: round;
    opacity: calc(1 - var(--i) * 0.18);
  }
  .on path {
    stroke: var(--lilac);
    animation: hum 2.4s ease-in-out infinite;
    animation-delay: calc(var(--i) * -0.4s);
  }
  @keyframes hum {
    50% {
      transform: translateY(2px);
    }
  }
  .lname {
    font-family: var(--display);
    font-weight: 700;
    font-size: 19px;
    letter-spacing: -0.02em;
  }
  .ldesc {
    color: var(--text-2);
    font-size: 13px;
  }
  @media (max-width: 760px) {
    .levels {
      grid-template-columns: 1fr;
    }
  }
</style>
