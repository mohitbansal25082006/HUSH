<script lang="ts">
  /**
   * The web's "noise", drawn as a sound wave. Each blocked thing makes it spike, and HUSH
   * flattens it again. When protection is paused the wave stays loud.
   */
  import { onMount } from 'svelte';
  import { reducedMotion } from '../theme';

  interface Props {
    height?: number;
    loud?: boolean;
    /** Start noisy and settle — the popup's opening moment. */
    intro?: boolean;
  }
  let { height = 56, loud = false, intro = true }: Props = $props();

  let canvas: HTMLCanvasElement;
  let energy = 0;
  let target = 0;

  export function spike(amount = 0.6) {
    energy = Math.min(1.6, energy + amount);
  }

  onMount(() => {
    const ctx = canvas.getContext('2d')!;
    let w = 0;
    let h = 0;
    const dpr = Math.min(2, devicePixelRatio || 1);
    const resize = () => {
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const css = getComputedStyle(document.documentElement);
    const lilac = css.getPropertyValue('--lilac').trim() || '#c9b8ff';
    const coral = css.getPropertyValue('--coral').trim() || '#ff7a9c';
    const mint = css.getPropertyValue('--mint').trim() || '#7ef0c8';

    if (intro && !reducedMotion()) energy = 1.4;
    let t = 0;
    let raf = 0;
    let last = performance.now();

    const draw = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      t += dt;
      target = loud ? 0.9 : 0;
      energy += (target - energy) * Math.min(1, dt * (loud ? 1.5 : 2.2));
      ctx.clearRect(0, 0, w, h);
      const mid = h / 2;
      const layers = [
        { amp: 0.16, freq: 1.6, speed: 0.9, color: lilac, alpha: 0.9, width: 2.2 },
        { amp: 0.1, freq: 2.7, speed: -1.3, color: mint, alpha: 0.45, width: 1.4 },
        { amp: 0.07, freq: 4.1, speed: 1.9, color: lilac, alpha: 0.3, width: 1.1 },
      ];
      for (const L of layers) {
        ctx.beginPath();
        for (let x = 0; x <= w; x += 3) {
          const p = x / w;
          // Taper at both ends so the wave feels contained.
          const env = Math.sin(Math.PI * p) ** 1.4;
          const calm = Math.sin(p * Math.PI * 2 * L.freq + t * L.speed) * L.amp * 0.35;
          const noise =
            (Math.sin(p * 61 + t * 9.3) * 0.5 + Math.sin(p * 23 - t * 7.1) * 0.35 + Math.sin(p * 131 + t * 13) * 0.25) * energy * 0.42;
          const y = mid + (calm + noise * L.amp * 4) * h * env;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = energy > 0.25 && L.color === lilac ? coral : L.color;
        ctx.globalAlpha = L.alpha * (energy > 0.25 && L.color === lilac ? Math.min(1, 0.5 + energy * 0.5) : 1);
        ctx.lineWidth = L.width;
        ctx.lineCap = 'round';
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      raf = document.hidden ? 0 : requestAnimationFrame(draw);
    };

    if (reducedMotion()) {
      energy = loud ? 0.9 : 0;
      draw(performance.now());
      cancelAnimationFrame(raf);
    } else {
      raf = requestAnimationFrame(draw);
    }
    const onVis = () => {
      if (!document.hidden && !raf && !reducedMotion()) {
        last = performance.now();
        raf = requestAnimationFrame(draw);
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      document.removeEventListener('visibilitychange', onVis);
    };
  });
</script>

<canvas bind:this={canvas} style="height:{height}px" aria-hidden="true"></canvas>

<style>
  canvas {
    display: block;
    width: 100%;
  }
</style>
