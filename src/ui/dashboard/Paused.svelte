<script lang="ts">
  import { onMount } from 'svelte';
  import { flip } from 'svelte/animate';
  import { fly } from 'svelte/transition';
  import Icon from '../components/Icon.svelte';
  import { getAllowlist, setAllowlist } from '../../shared/storage';
  import { toast } from './store.svelte';

  let list = $state<string[]>([]);
  let input = $state('');
  let error = $state('');

  onMount(async () => {
    list = await getAllowlist();
  });

  function normalise(v: string): string | null {
    let s = v.trim().toLowerCase();
    if (!s) return null;
    if (!/^[a-z]+:\/\//.test(s)) s = `https://${s}`;
    try {
      const h = new URL(s).hostname.replace(/^www\./, '');
      return /^[a-z0-9.-]+\.[a-z0-9-]+$/.test(h) ? h : null;
    } catch {
      return null;
    }
  }

  async function add(e: SubmitEvent) {
    e.preventDefault();
    const h = normalise(input);
    if (!h) {
      error = 'Enter a site like example.com';
      return;
    }
    error = '';
    if (!list.includes(h)) {
      list = [...list, h].sort();
      await setAllowlist(list);
      toast(`HUSH is paused on ${h}`);
    }
    input = '';
  }

  async function remove(h: string) {
    list = list.filter((x) => x !== h);
    await setAllowlist(list);
    toast(`HUSH protects ${h} again`);
  }
</script>

<header class="page-head">
  <h2>Paused sites</h2>
  <p>HUSH steps aside completely on these sites and their subdomains: no blocking, no hiding, no scripts. Useful for sites you want to support, or ones that break.</p>
</header>

<form class="add" onsubmit={add}>
  <input class="input" placeholder="example.com" bind:value={input} aria-label="Site to pause" aria-invalid={!!error} />
  <button class="btn primary" type="submit"><Icon name="plus" size={16} /> Pause site</button>
</form>
{#if error}<p class="error">{error}</p>{/if}

{#if list.length}
  <ul class="rows list">
    {#each list as h (h)}
      <li class="row" animate:flip={{ duration: 300 }} transition:fly={{ x: -16, duration: 260 }}>
        <span class="fav" aria-hidden="true">{h[0]}</span>
        <div class="text"><div class="name">{h}</div></div>
        <button class="btn small" onclick={() => remove(h)}>Resume protection</button>
      </li>
    {/each}
  </ul>
{:else}
  <p class="empty">No paused sites. Pause one from the popup or add it above.</p>
{/if}

<style>
  .add {
    display: flex;
    gap: 10px;
    max-width: 520px;
  }
  .add .input {
    flex: 1;
  }
  .error {
    color: var(--coral);
    margin: 8px 0 0;
    font-size: 13px;
  }
  .list {
    list-style: none;
    padding: 0;
    margin: 24px 0 0;
  }
  .fav {
    width: 28px;
    height: 28px;
    border-radius: 9px;
    display: grid;
    place-items: center;
    background: var(--surface-2);
    color: var(--lilac);
    font-family: var(--display);
    font-weight: 700;
    text-transform: uppercase;
  }
</style>
