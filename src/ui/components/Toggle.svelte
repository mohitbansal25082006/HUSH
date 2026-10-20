<script lang="ts">
  interface Props {
    checked: boolean;
    label: string;
    onchange?: (v: boolean) => void;
    disabled?: boolean;
  }
  let { checked = $bindable(), label, onchange, disabled = false }: Props = $props();
</script>

<button
  class="toggle"
  class:on={checked}
  role="switch"
  aria-checked={checked}
  aria-label={label}
  {disabled}
  onclick={() => {
    checked = !checked;
    onchange?.(checked);
  }}
>
  <span class="knob"></span>
</button>

<style>
  .toggle {
    position: relative;
    flex: none;
    width: 42px;
    height: 24px;
    border-radius: 99px;
    border: 1px solid var(--line-strong);
    background: var(--surface-2);
    cursor: pointer;
    padding: 0;
    transition: background 0.25s var(--ease), border-color 0.25s;
  }
  .toggle:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
  .toggle.on {
    background: var(--lilac-deep);
    border-color: transparent;
  }
  .knob {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: var(--text-2);
    transition: transform 0.4s var(--spring), width 0.2s var(--ease), background 0.25s;
  }
  .toggle:active .knob {
    width: 23px;
  }
  .on .knob {
    transform: translateX(18px);
    background: var(--moon);
    box-shadow: 0 0 12px var(--moon-glow);
  }
  .on:active .knob {
    transform: translateX(13px);
  }
</style>
