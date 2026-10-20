<script lang="ts">
  /** Last N days of blocking, drawn as a mirrored sound wave (louder day = taller bar). */
  import { onMount } from 'svelte';
  import { reducedMotion } from '../theme';

  interface Props {
    daily: Record<string, number>;
    days?: number;
  }
  let { daily, days = 30 }: Props = $props();

  const series = $derived.by(() => {
    const out: Array<{ day: string; n: number }> = [];
    const now = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      out.push({ day: key, n: daily[key] ?? 0 });
    }
    return out;
  });
  const max = $derived(Math.max(1, ...series.map((s) => s.n)));
  let hover = $state<number | null>(null);
  let grown = $state(false);

  const W = 900;
  const H = 180;
  const gap = 4;
  const bw = $derived((W - gap * (days - 1)) / days);
  const fmt = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });

  onMount(() => {
    if (reducedMotion()) grown = true;
    else requestAnimationFrame(() => (grown = true));
  });
</script>

<figure class="chart">
  <svg viewBox="0 0 {W} {H}" preserveAspectRatio="none" role="img" aria-label="Things blocked per day over the last {days} days">
    <line x1="0" x2={W} y1={H / 2} y2={H / 2} class="axis" />
    {#each series as s, i (s.day)}
      {@const h = Math.max(3, (s.n / max) * (H / 2 - 8))}
      <g class="bar" class:hot={hover === i} style="--d:{i * 18}ms">
        <rect
          x={i * (bw + gap)}
          y={H / 2 - h}
          width={bw}
          height={h * 2}
          rx={Math.min(bw / 2, 6)}
          style="transform: scaleY({grown ? 1 : 0.02})"
        />
        <rect
          x={i * (bw + gap) - gap / 2}
          y="0"
          width={bw + gap}
          height={H}
          fill="transparent"
          role="presentation"
          onmouseenter={() => (hover = i)}
          onmouseleave={() => (hover = null)}
        />
      </g>
    {/each}
  </svg>
  <figcaption>
    {#if hover !== null}
      <b class="num">{series[hover].n.toLocaleString()}</b> blocked on {fmt.format(new Date(series[hover].day + 'T12:00'))}
    {:else}
      <span>{fmt.format(new Date(series[0].day + 'T12:00'))}</span><span>Today</span>
    {/if}
  </figcaption>
</figure>

<style>
  .chart {
    margin: 0;
  }
  svg {
    display: block;
    width: 100%;
    height: 180px;
  }
  .axis {
    stroke: var(--line);
    stroke-dasharray: 2 6;
  }
  .bar rect:first-child {
    fill: var(--lilac);
    opacity: 0.75;
    transform-box: fill-box;
    transform-origin: 50% 50%;
    transition: transform 0.9s var(--spring) var(--d), opacity 0.2s, fill 0.2s;
  }
  .bar:last-child rect:first-child {
    fill: var(--moon);
    opacity: 1;
  }
  .bar.hot rect:first-child {
    fill: var(--coral);
    opacity: 1;
  }
  figcaption {
    display: flex;
    justify-content: space-between;
    margin-top: 10px;
    font-size: 12.5px;
    color: var(--text-3);
    min-height: 20px;
  }
  figcaption b {
    color: var(--text);
    margin-right: 4px;
  }
</style>
