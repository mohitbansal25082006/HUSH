<script lang="ts">
  import { onMount } from 'svelte';
  import Counter from '../components/Counter.svelte';
  import WaveChart from '../components/WaveChart.svelte';
  import Hushy from '../components/Hushy.svelte';
  import { app, refreshStats } from './store.svelte';
  import { formatBytes } from '../../shared/storage';

  let hushy: Hushy;
  let last = 0;

  onMount(() => {
    last = app.stats?.total ?? 0;
    const t = setInterval(async () => {
      await refreshStats();
      const now = app.stats?.total ?? 0;
      if (now > last) hushy?.swat();
      last = now;
    }, 2000);
    return () => clearInterval(t);
  });

  const s = $derived(app.stats);
  const since = $derived(s ? new Intl.DateTimeFormat(undefined, { month: 'long', day: 'numeric', year: 'numeric' }).format(new Date(s.since)) : '');
  const top = (m: Record<string, number> | undefined, n = 8) => Object.entries(m ?? {}).sort((a, b) => b[1] - a[1]).slice(0, n);
  const domains = $derived(top(s?.domains));
  const sites = $derived(top(s?.sites));
  // A blocked request saves roughly 40 ms of network + script time on average.
  const minutesSaved = $derived(s ? Math.round(((s.ads + s.trackers) * 0.04 + s.popups * 4 + s.videoAds * 15) / 60) : 0);
</script>

{#if s}
  <section class="hero">
    <Hushy bind:this={hushy} size={132} mood={app.settings.enabled ? 'shh' : 'sleep'} />
    <div>
      <h2 class="headline">
        <span class="big"><Counter value={s.total} duration={1400} /></span>
        <span class="rest">things silenced since {since}.</span>
      </h2>
      <p class="sub">That is about <b>{formatBytes(s.bytes)}</b> you didn’t download and <b>{minutesSaved.toLocaleString()} minutes</b> you didn’t spend waiting.</p>
    </div>
  </section>

  <dl class="figures">
    <div><dt>Ads</dt><dd><Counter value={s.ads + s.cosmetic} format="compact" /></dd></div>
    <div><dt>Trackers</dt><dd><Counter value={s.trackers} format="compact" /></dd></div>
    <div><dt>Popups closed</dt><dd><Counter value={s.popups} format="compact" /></dd></div>
    <div><dt>Video ads skipped</dt><dd><Counter value={s.videoAds} format="compact" /></dd></div>
  </dl>

  <h3 class="section">The last 30 days</h3>
  <WaveChart daily={s.daily} />

  <div class="lists">
    <section>
      <h3 class="section">Loudest ad & tracker domains</h3>
      {#if domains.length}
        <ol class="bars">
          {#each domains as [host, n], i (host)}
            <li style="--w:{(n / domains[0][1]) * 100}%; --i:{i}">
              <span class="host" title={host}>{host}</span>
              <span class="n num">{n.toLocaleString()}</span>
            </li>
          {/each}
        </ol>
      {:else}
        <p class="empty">Browse a little and the noisiest domains will show up here.</p>
      {/if}
    </section>
    <section>
      <h3 class="section">Sites HUSH worked hardest on</h3>
      {#if sites.length}
        <ol class="bars sites">
          {#each sites as [host, n], i (host)}
            <li style="--w:{(n / sites[0][1]) * 100}%; --i:{i}">
              <span class="host" title={host}>{host}</span>
              <span class="n num">{n.toLocaleString()}</span>
            </li>
          {/each}
        </ol>
      {:else}
        <p class="empty">No sites yet.</p>
      {/if}
    </section>
  </div>
{/if}

<style>
  .hero {
    display: flex;
    align-items: center;
    gap: 26px;
    margin-bottom: 30px;
  }
  .headline {
    margin: 0;
    font-family: var(--display);
    letter-spacing: -0.035em;
    line-height: 1;
  }
  .big {
    display: block;
    font-size: 76px;
    font-weight: 800;
    font-stretch: 90%;
    background: linear-gradient(180deg, var(--text), color-mix(in srgb, var(--lilac) 70%, var(--text)));
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
  }
  .rest {
    display: block;
    font-size: 26px;
    font-weight: 600;
    margin-top: 6px;
    color: var(--text-2);
    letter-spacing: -0.02em;
  }
  .sub {
    margin: 14px 0 0;
    color: var(--text-2);
    max-width: 56ch;
  }
  .sub b {
    color: var(--text);
  }
  .figures {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    margin: 0;
    border-top: 1px solid var(--line);
    border-bottom: 1px solid var(--line);
  }
  .figures div {
    padding: 16px 18px;
  }
  .figures div + div {
    border-left: 1px solid var(--line);
  }
  dt {
    color: var(--text-3);
    font-size: 13px;
  }
  dd {
    margin: 2px 0 0;
    font-size: 30px;
    font-weight: 700;
  }
  .figures div:first-child dd {
    color: var(--coral);
  }
  .lists {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 40px;
  }
  .bars {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 6px;
  }
  .bars li {
    position: relative;
    display: flex;
    justify-content: space-between;
    gap: 12px;
    padding: 7px 10px;
    border-radius: 9px;
    overflow: hidden;
    font-size: 13.5px;
  }
  .bars li::before {
    content: '';
    position: absolute;
    inset: 0;
    width: var(--w);
    background: color-mix(in srgb, var(--coral) 16%, transparent);
    border-radius: 9px;
    transform-origin: left;
    animation: grow 0.8s var(--ease) calc(var(--i) * 60ms) both;
  }
  .sites li::before {
    background: color-mix(in srgb, var(--lilac) 16%, transparent);
  }
  .host {
    position: relative;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .n {
    position: relative;
    color: var(--text-2);
  }
  @keyframes grow {
    from {
      transform: scaleX(0);
    }
  }
  @media (max-width: 760px) {
    .hero {
      flex-direction: column;
      align-items: flex-start;
    }
    .big {
      font-size: 54px;
    }
    .figures {
      grid-template-columns: 1fr 1fr;
    }
    .figures div:nth-child(3) {
      border-left: 0;
    }
    .lists {
      grid-template-columns: 1fr;
      gap: 0;
    }
  }
</style>
