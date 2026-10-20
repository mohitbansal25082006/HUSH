<script lang="ts">
  import Hushy from '../components/Hushy.svelte';
  import Burst from '../components/Burst.svelte';

  let burst: Burst;
  let mood = $state<'shh' | 'celebrate'>('shh');
  const version = chrome.runtime.getManifest().version;
  const repo = (chrome.runtime.getManifest().homepage_url ?? '').replace(/#.*$/, '');
  const LINKS = [
    ['Source code', repo],
    ['Report a problem', `${repo}/issues/new/choose`],
    ['Privacy policy', `${repo}/blob/main/PRIVACY.md`],
    ['What’s new', `${repo}/blob/main/CHANGELOG.md`],
  ];

  function poke(e: MouseEvent) {
    mood = 'celebrate';
    burst.fire(e.clientX, e.clientY, 60);
    setTimeout(() => (mood = 'shh'), 1200);
  }

  const CREDITS = [
    ['EasyList & EasyPrivacy', 'The EasyList authors', 'GPLv3 / CC BY-SA 3.0'],
    ['uBlock filters & uAssets', 'Raymond Hill and the uBlock Origin volunteers', 'GPLv3'],
    ['AdGuard filters', 'AdGuard Software', 'GPLv3'],
    ['Peter Lowe’s blocklist', 'Peter Lowe', 'Free use with credit'],
    ['URLhaus filter', 'abuse.ch, curated by malware-filter', 'CC0 / MIT'],
    ['Regional lists', 'IndianList, EasyList Germany, Liste FR, EasyList Spanish, RU AdList, EasyList China, AdGuard Japanese maintainers', 'GPLv3 / CC BY-SA'],
    ['Bricolage Grotesque & Figtree', 'Mathieu Triay; Erik Kennedy', 'SIL Open Font License'],
    ['GSAP', 'GreenSock / Webflow', 'Standard “no charge” license'],
  ];
</script>

<Burst bind:this={burst} />

<section class="about">
  <button class="mascot" onclick={poke} aria-label="Say hello to Hushy">
    <Hushy size={170} {mood} />
  </button>
  <div>
    <h2>HUSH {version}</h2>
    <p>A quiet web. HUSH blocks ads, popups, trackers and the tricks that bring them back, without collecting anything about you. Nothing you browse ever leaves your browser.</p>
    <p class="small">Free software under the GNU General Public License v3.0 or later.</p>
    {#if repo}
      <nav class="links">
        {#each LINKS as [label, href] (label)}
          <a {href} target="_blank" rel="noopener">{label}</a>
        {/each}
      </nav>
    {/if}
  </div>
</section>

<h3 class="section">Standing on the shoulders of</h3>
<div class="rows">
  {#each CREDITS as [what, who, license] (what)}
    <div class="row">
      <div class="text"><div class="name">{what}</div><div class="desc">{who}</div></div>
      <span class="meta">{license}</span>
    </div>
  {/each}
</div>

<style>
  .about {
    display: flex;
    gap: 28px;
    align-items: center;
  }
  .mascot {
    border: 0;
    background: none;
    padding: 0;
    cursor: pointer;
  }
  h2 {
    margin: 0 0 8px;
    font-family: var(--display);
    font-size: 40px;
    letter-spacing: -0.03em;
  }
  p {
    margin: 0 0 8px;
    color: var(--text-2);
    max-width: 58ch;
    font-size: 15px;
  }
  .links {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 14px;
  }
  .links a {
    padding: 7px 14px;
    border-radius: 999px;
    border: 1px solid var(--line);
    color: var(--text);
    font-size: 13px;
    font-weight: 600;
    text-decoration: none;
    transition: background 0.15s, border-color 0.15s;
  }
  .links a:hover,
  .links a:focus-visible {
    background: var(--surface-2);
    border-color: var(--lilac-deep);
  }
  .small {
    font-size: 13px;
    color: var(--text-3);
  }
</style>
