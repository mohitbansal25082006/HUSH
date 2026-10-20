<script lang="ts">
  import { Tween } from 'svelte/motion';
  import { cubicOut } from 'svelte/easing';
  import { reducedMotion } from '../theme';

  interface Props {
    value: number;
    /** compact = 1.2k style, full = 1,234 */
    format?: 'compact' | 'full';
    duration?: number;
  }
  let { value, format = 'full', duration = 900 }: Props = $props();

  const tween = new Tween(0, { duration: () => (reducedMotion() ? 0 : duration), easing: cubicOut });
  $effect(() => {
    tween.target = value;
  });

  const nf = new Intl.NumberFormat();
  const cf = new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 });
  let text = $derived(format === 'compact' ? cf.format(Math.round(tween.current)) : nf.format(Math.round(tween.current)));
</script>

<span class="num">{text}</span>
