<script>
  import { grouped, searchFilters } from '../lib/stores.js';

  $: groupOptions = Object.keys($grouped || {})
    .sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' }));
  $: selectedGroup = $searchFilters.group;

  function handleGroupChange(event) {
    const value = event?.currentTarget?.value;
    if (!value) return;
    searchFilters.update((current) => {
      if (current.group === value) return current;
      return { ...current, group: value };
    });
  }
</script>

<div class="group-bar">
  <div class="group-info">
    <label class="group-label" for="group-switcher">Groupe affiche</label>
    <p class="group-hint">Un seul groupe est rendu en configurateur.</p>
  </div>
  {#if groupOptions.length > 0}
    <select
      id="group-switcher"
      class="group-select"
      value={groupOptions.includes(selectedGroup) ? selectedGroup : groupOptions[0]}
      on:change={handleGroupChange}
    >
      {#each groupOptions as group}
        <option value={group}>{group}</option>
      {/each}
    </select>
  {:else}
    <span class="group-empty">Aucun groupe disponible.</span>
  {/if}
</div>

<style>
  .group-bar {
    flex: 1 1 320px;
    min-width: 220px;
    max-width: 520px;
    display: flex;
    align-items: center;
    gap: 12px;
    background: var(--c-box-bg, var(--panel-bg, #f7f8fa));
    border: 1px solid var(--c-stroke, var(--border-color, #dfe3ea));
    border-radius: 10px;
    padding: 8px 12px;
  }
  .group-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
    flex: 1 1 auto;
  }
  .group-label {
    font-size: 13px;
    font-weight: 600;
    color: var(--c-text, #0f172a);
  }
  .group-hint {
    font-size: 12px;
    color: var(--c-text-muted, #64748b);
    margin: 0;
  }
  .group-select {
    flex: 0 0 auto;
    min-width: 180px;
    max-width: 320px;
    width: min(320px, 100%);
    border: 1px solid var(--c-stroke, #dfe3ea);
    border-radius: 8px;
    padding: 6px 10px;
    background: var(--c-bg, #fff);
    color: var(--c-text, #0f172a);
  }
  .group-empty {
    font-size: 13px;
    color: var(--c-text-muted, #64748b);
  }
  @media (max-width: 720px) {
    .group-bar {
      flex-basis: 100%;
      width: 100%;
      flex-wrap: wrap;
      gap: 8px;
    }
    .group-select {
      flex: 1 1 100%;
      width: 100%;
    }
  }
</style>
