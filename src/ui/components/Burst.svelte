<script lang="ts">
  /** Celebration burst of little moons and stars (milestones, onboarding finish). */
  import { onMount } from 'svelte';
  import { reducedMotion } from '../theme';

  let canvas: HTMLCanvasElement;
  let ctx: CanvasRenderingContext2D;
  interface P {
    x: number;
    y: number;
    vx: number;
    vy: number;
    r: number;
    rot: number;
    vr: number;
    life: number;
    color: string;
    shape: 0 | 1 | 2;
  }
  let parts: P[] = [];
  let raf = 0;
  let colors: string[] = [];

  export function fire(x = innerWidth / 2, y = innerHeight / 2, count = 70) {
    if (reducedMotion()) return;
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 3 + Math.random() * 7;
      parts.push({
        x, y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s - 3,
        r: 3 + Math.random() * 5,
        rot: Math.random() * 6,
        vr: (Math.random() - 0.5) * 0.3,
        life: 1,
        color: colors[i % colors.length],
        shape: (i % 3) as 0 | 1 | 2,
      });
    }
    if (!raf) raf = requestAnimationFrame(step);
  }

  function star(r: number) {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const rr = i % 2 ? r * 0.45 : r;
      const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
      ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fill();
  }

  function step() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const p of parts) {
      p.vy += 0.22;
      p.vx *= 0.985;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      p.life -= 0.012;
      ctx.save();
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      if (p.shape === 0) star(p.r);
      else if (p.shape === 1) {
        ctx.beginPath();
        ctx.arc(0, 0, p.r, 0.6, Math.PI * 2 - 0.6);
        ctx.arc(p.r * 0.45, 0, p.r * 0.75, Math.PI * 2 - 0.9, 0.9, true);
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.arc(0, 0, p.r * 0.55, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
    parts = parts.filter((p) => p.life > 0 && p.y < canvas.height + 40);
    raf = parts.length ? requestAnimationFrame(step) : 0;
  }

  onMount(() => {
    ctx = canvas.getContext('2d')!;
    const css = getComputedStyle(document.documentElement);
    colors = ['--moon', '--lilac', '--coral', '--mint', '--amber'].map((v) => css.getPropertyValue(v).trim());
    const resize = () => {
      canvas.width = innerWidth;
      canvas.height = innerHeight;
    };
    resize();
    addEventListener('resize', resize);
    return () => {
      removeEventListener('resize', resize);
      cancelAnimationFrame(raf);
    };
  });
</script>

<canvas bind:this={canvas} aria-hidden="true"></canvas>

<style>
  canvas {
    position: fixed;
    inset: 0;
    pointer-events: none;
    z-index: 50;
  }
</style>
