<script lang="ts" module>
  export type HushyMood = 'idle' | 'shh' | 'sleep' | 'celebrate' | 'alert';
</script>

<script lang="ts">
  import { onMount } from 'svelte';
  import gsap from 'gsap';
  import { reducedMotion } from '../theme';

  interface Props {
    mood?: HushyMood;
    size?: number;
    /** Eyes follow the pointer. */
    follow?: boolean;
  }
  let { mood = 'idle', size = 140, follow = true }: Props = $props();

  let svg: SVGSVGElement;
  let body: SVGGElement;
  let hand: SVGGElement;
  let eyes: SVGGElement;
  let pupils: SVGGElement;
  let lids: SVGGElement;
  let mouth: SVGPathElement;
  let shhText: SVGGElement;
  let zzz: SVGGElement;
  let sparks: SVGGElement;
  let shield: SVGGElement;

  const uid = Math.random().toString(36).slice(2, 8);

  /** Quick squash-and-swat used whenever something gets blocked. */
  export function swat() {
    if (reducedMotion() || mood === 'sleep') return;
    const tl = gsap.timeline();
    tl.to(body, { scaleX: 1.08, scaleY: 0.92, duration: 0.08, transformOrigin: '50% 100%', ease: 'power2.out' })
      .to(body, { scaleX: 0.96, scaleY: 1.05, duration: 0.12, ease: 'power2.out' })
      .to(body, { scaleX: 1, scaleY: 1, duration: 0.5, ease: 'elastic.out(1, 0.4)' });
    gsap.fromTo(
      sparks.children,
      { scale: 0, opacity: 1, transformOrigin: '50% 50%' },
      { scale: 1.4, opacity: 0, duration: 0.55, stagger: 0.03, ease: 'power2.out' },
    );
  }

  export function celebrate() {
    if (reducedMotion()) return;
    gsap.timeline()
      .to(svg, { y: -18, duration: 0.25, ease: 'power2.out' })
      .to(svg, { rotation: 360, duration: 0.6, ease: 'back.out(1.6)', transformOrigin: '50% 60%' }, '<')
      .to(svg, { y: 0, duration: 0.5, ease: 'bounce.out' })
      .set(svg, { rotation: 0 });
  }

  function applyMood(m: HushyMood) {
    if (!hand) return;
    const instant = reducedMotion();
    const d = instant ? 0 : 1;
    gsap.killTweensOf([hand, mouth, shhText, zzz, lids, shield]);
    // Finger to the lips for "shh", resting otherwise.
    gsap.to(hand, {
      x: m === 'shh' ? -35 : 16,
      y: m === 'shh' ? -10 : m === 'sleep' ? 10 : 4,
      rotation: m === 'shh' ? -6 : 22,
      opacity: m === 'alert' ? 0 : 1,
      duration: 0.55 * d,
      ease: 'back.out(1.8)',
      transformOrigin: '50% 100%',
    });
    gsap.to(lids, { scaleY: m === 'sleep' ? 1 : 0, duration: 0.4 * d, transformOrigin: '50% 0%', ease: 'power2.inOut' });
    gsap.to(mouth, {
      attr: { d: m === 'shh' ? 'M94 124 q6 4 12 0 q-6 5 -12 0' : m === 'celebrate' ? 'M88 120 q12 14 24 0' : m === 'alert' ? 'M92 126 q8 -5 16 0' : 'M92 121 q8 7 16 0' },
      duration: 0.35 * d,
    });
    gsap.to(shhText, { opacity: m === 'shh' ? 1 : 0, duration: 0.3 * d });
    gsap.to(zzz, { opacity: m === 'sleep' ? 1 : 0, duration: 0.4 * d });
    gsap.to(shield, { opacity: m === 'alert' ? 1 : 0, scale: m === 'alert' ? 1 : 0.6, transformOrigin: '50% 50%', duration: 0.45 * d, ease: 'back.out(2)' });
    if (m === 'celebrate') celebrate();
  }

  $effect(() => {
    applyMood(mood);
  });

  onMount(() => {
    applyMood(mood);
    if (reducedMotion()) return;

    // Blink every few seconds.
    let blinkTimer: ReturnType<typeof setTimeout>;
    const blink = () => {
      if (mood !== 'sleep') {
        gsap.timeline()
          .to(lids, { scaleY: 1, duration: 0.07, transformOrigin: '50% 0%' })
          .to(lids, { scaleY: 0, duration: 0.12, delay: 0.05 });
      }
      blinkTimer = setTimeout(blink, 2600 + Math.random() * 3200);
    };
    blinkTimer = setTimeout(blink, 1800);

    // Eyes follow the pointer, with a little lag.
    let tx = 0;
    let ty = 0;
    let cx = 0;
    let cy = 0;
    let raf = 0;
    const onMove = (e: PointerEvent) => {
      if (!follow || mood === 'sleep') return;
      const r = svg.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2);
      const dy = e.clientY - (r.top + r.height * 0.45);
      const len = Math.hypot(dx, dy) || 1;
      const k = Math.min(1, len / 160);
      tx = (dx / len) * 4.5 * k;
      ty = (dy / len) * 3.5 * k;
      if (!raf) raf = requestAnimationFrame(step);
    };
    const step = () => {
      cx += (tx - cx) * 0.18;
      cy += (ty - cy) * 0.18;
      pupils.setAttribute('transform', `translate(${cx.toFixed(2)} ${cy.toFixed(2)})`);
      raf = Math.abs(tx - cx) + Math.abs(ty - cy) > 0.05 ? requestAnimationFrame(step) : 0;
    };
    window.addEventListener('pointermove', onMove);
    return () => {
      clearTimeout(blinkTimer);
      cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', onMove);
    };
  });
</script>

<svg
  bind:this={svg}
  class="hushy"
  class:sleep={mood === 'sleep'}
  width={size}
  height={size}
  viewBox="0 0 200 200"
  role="img"
  aria-label={mood === 'sleep' ? 'Hushy is asleep — HUSH is paused here' : 'Hushy, the HUSH mascot'}
>
  <defs>
    <radialGradient id="glow-{uid}" cx="50%" cy="48%" r="50%">
      <stop offset="0%" stop-color="var(--moon-glow)" />
      <stop offset="70%" stop-color="var(--moon-glow)" stop-opacity="0.08" />
      <stop offset="100%" stop-color="var(--moon-glow)" stop-opacity="0" />
    </radialGradient>
    <linearGradient id="body-{uid}" x1="0.2" y1="0" x2="0.8" y2="1">
      <stop offset="0%" stop-color="#fffaf0" />
      <stop offset="55%" stop-color="#fff0cc" />
      <stop offset="100%" stop-color="#ffd98f" />
    </linearGradient>
    <linearGradient id="shade-{uid}" x1="0" y1="0" x2="1" y2="0">
      <stop offset="60%" stop-color="#d9a64a" stop-opacity="0" />
      <stop offset="100%" stop-color="#d9a64a" stop-opacity="0.35" />
    </linearGradient>
  </defs>

  <circle class="aura" cx="100" cy="98" r="96" fill="url(#glow-{uid})" />

  <g class="float">
    <g bind:this={body}>
      <path
        d="M42 112 C42 64 68 34 100 34 C132 34 158 64 158 112 L158 150 Q149 168 137 153 Q125 168 113 153 Q100 170 87 153 Q75 168 63 153 Q51 168 42 150 Z"
        fill="url(#body-{uid})"
      />
      <path
        d="M42 112 C42 64 68 34 100 34 C132 34 158 64 158 112 L158 150 Q149 168 137 153 Q125 168 113 153 Q100 170 87 153 Q75 168 63 153 Q51 168 42 150 Z"
        fill="url(#shade-{uid})"
      />
      <!-- moon craters -->
      <circle cx="132" cy="70" r="7" fill="#f2cf8a" opacity="0.45" />
      <circle cx="143" cy="88" r="3.5" fill="#f2cf8a" opacity="0.4" />
      <circle cx="62" cy="76" r="4" fill="#f2cf8a" opacity="0.3" />
      <!-- cheeks -->
      <ellipse cx="70" cy="118" rx="9" ry="5.5" fill="#ff9db5" opacity="0.55" />
      <ellipse cx="130" cy="118" rx="9" ry="5.5" fill="#ff9db5" opacity="0.55" />

      <g bind:this={eyes}>
        <g bind:this={pupils}>
          <ellipse cx="80" cy="100" rx="8" ry="10" fill="#2a2050" />
          <ellipse cx="120" cy="100" rx="8" ry="10" fill="#2a2050" />
          <circle cx="83" cy="96" r="3" fill="#fff" />
          <circle cx="123" cy="96" r="3" fill="#fff" />
        </g>
        <!-- eyelids (scaled from 0 to 1 to blink / sleep) -->
        <g bind:this={lids} style="transform: scaleY(0)">
          <path d="M70 89 h20 v13 q-10 6 -20 0 z" fill="#ffefc6" />
          <path d="M110 89 h20 v13 q-10 6 -20 0 z" fill="#ffefc6" />
          <path d="M71 101 q9 6 18 0" stroke="#2a2050" stroke-width="2.5" fill="none" stroke-linecap="round" />
          <path d="M111 101 q9 6 18 0" stroke="#2a2050" stroke-width="2.5" fill="none" stroke-linecap="round" />
        </g>
      </g>

      <path bind:this={mouth} d="M92 121 q8 7 16 0" stroke="#2a2050" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round" />
    </g>

    <!-- hand with raised finger -->
    <g bind:this={hand}>
      <path d="M128 160 q-4 -14 2 -22 q6 -6 12 0 q5 8 0 22 z" fill="#ffe6ae" />
      <rect x="131" y="116" width="8.5" height="28" rx="4.25" fill="#fff3d6" />
      <path d="M128 160 q-4 -14 2 -22 q6 -6 12 0 q5 8 0 22 z" fill="url(#shade-{uid})" />
    </g>

    <g bind:this={shhText} opacity="0" class="shh">
      <text x="150" y="58" font-family="var(--display)" font-weight="700" font-size="17" fill="var(--lilac)">shh</text>
      <circle cx="146" cy="66" r="2" fill="var(--lilac)" />
    </g>

    <g bind:this={zzz} opacity="0" class="zzz">
      <text x="146" y="62" font-family="var(--display)" font-weight="700" font-size="16" fill="var(--lilac)">z</text>
      <text x="158" y="48" font-family="var(--display)" font-weight="700" font-size="12" fill="var(--lilac)">z</text>
      <text x="167" y="37" font-family="var(--display)" font-weight="700" font-size="9" fill="var(--lilac)">z</text>
    </g>

    <g bind:this={shield} opacity="0">
      <path d="M100 128 l24 9 v14 c0 14 -10 22 -24 28 c-14 -6 -24 -14 -24 -28 v-14 z" fill="var(--coral)" />
      <path d="M100 145 v12 M100 163 v1" stroke="#fff" stroke-width="4" stroke-linecap="round" />
    </g>

    <g bind:this={sparks}>
      <path d="M170 104 l6 0 M173 101 l0 6" stroke="var(--coral)" stroke-width="3" stroke-linecap="round" opacity="0" />
      <path d="M28 96 l6 0 M31 93 l0 6" stroke="var(--lilac)" stroke-width="3" stroke-linecap="round" opacity="0" />
      <circle cx="160" cy="70" r="3" fill="var(--mint)" opacity="0" />
      <circle cx="38" cy="132" r="3" fill="var(--coral)" opacity="0" />
    </g>
  </g>
</svg>

<style>
  .hushy {
    display: block;
    overflow: visible;
  }
  .float {
    animation: float 4.6s ease-in-out infinite;
    transform-origin: 50% 60%;
  }
  .sleep .float {
    animation-duration: 7s;
  }
  .aura {
    animation: breathe 4.6s ease-in-out infinite;
    transform-origin: 50% 50%;
  }
  .sleep .aura {
    opacity: 0.45;
  }
  .zzz text {
    animation: drift 2.8s ease-in-out infinite;
  }
  .zzz text:nth-child(2) {
    animation-delay: 0.4s;
  }
  .zzz text:nth-child(3) {
    animation-delay: 0.8s;
  }
  @keyframes float {
    50% {
      transform: translateY(-5px) rotate(-1deg);
    }
  }
  @keyframes breathe {
    50% {
      transform: scale(1.06);
      opacity: 0.85;
    }
  }
  @keyframes drift {
    50% {
      transform: translate(3px, -4px);
      opacity: 0.6;
    }
  }
</style>
