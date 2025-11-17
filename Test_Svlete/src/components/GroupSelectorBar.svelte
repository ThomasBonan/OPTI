<script>
  import { onMount, onDestroy } from 'svelte';
  import { selected, groupCatalog, searchFilters } from '../lib/stores.js';

  const clearAll = () => selected.set(new Set());

  $: selectionCount = ($selected && $selected.size) || 0;
  $: catalog = Array.isArray($groupCatalog) ? $groupCatalog : [];
  $: groupOptions = catalog.map((meta) => meta.name);
  $: selectedGroup = $searchFilters.group;
  $: pendingCount = catalog.filter((meta) => !meta.ready).length;

  function handleGroupChange(event) {
    const value = event?.currentTarget?.value;
    if (!value) return;
    searchFilters.update((current) => ({ ...current, group: value }));
  }

  function handleKeydown(event) {
    if (event.key === 'Escape') clearAll();
  }

  onMount(() => window.addEventListener('keydown', handleKeydown));
  onDestroy(() => window.removeEventListener('keydown', handleKeydown));
</script>

<div class="group-bar">
  <div class="group-info">
    <label class="group-label" for="group-switcher">Groupe affiche</label>
    <p class="group-hint">
      {#if pendingCount > 0}
        Chargement des autres groupes en arrière-plan...
      {:else}
        Un seul groupe est rendu en configurateur.
      {/if}
    </p>
  </div>

  {#if groupOptions.length > 0}
    <div class="group-controls">
      <select
        id="group-switcher"
        class="group-select"
        value={groupOptions.includes(selectedGroup) ? selectedGroup : groupOptions[0]}
        on:change={handleGroupChange}
      >
        {#each catalog as meta}
          <option value={meta.name}>
            {meta.name}{!meta.ready ? ' (chargement...)' : ''}
          </option>
        {/each}
      </select>
      <button
        class="btn-deselect"
        type="button"
        on:click={clearAll}
        disabled={selectionCount === 0}
        title="Echap pour tout désélectionner"
      >
        Tout désélectionner {selectionCount ? `(${selectionCount})` : ''}
      </button>
    </div>
  {:else}
    <span class="group-empty">Aucun groupe disponible.</span>
  {/if}
</div>

<style>
  .group-bar {
    flex: 1 1 420px;
    min-width: 240px;
    display: flex;
    gap: 12px;
    align-items: center;
    background: var(--c-box-bg, var(--panel-bg, #f7f8fa));
    border: 1px solid var(--c-stroke, var(--border-color, #dfe3ea));
    border-radius: 10px;
    padding: 10px 14px;
  }
  .group-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
    flex: 1 1 auto;
    min-width: 0;
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
  .group-controls {
    display: flex;
    gap: 8px;
    align-items: center;
    flex-wrap: wrap;
    justify-content: flex-end;
  }
  .group-select {
    min-width: 200px;
    max-width: 320px;
    width: min(320px, 100%);
    border: 1px solid var(--c-stroke, #dfe3ea);
    border-radius: 8px;
    padding: 6px 10px;
    background: var(--c-bg, #fff);
    color: var(--c-text, #0f172a);
  }
  .btn-deselect {
    border: 1px solid var(--c-stroke, #dfe3ea);
    background: var(--c-bg, #fff);
    color: var(--c-text, #0f172a);
    border-radius: 8px;
    padding: 6px 12px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.12s ease;
  }
  .btn-deselect:hover:not([disabled]) {
    background: rgba(37, 99, 235, 0.08);
  }
  .btn-deselect[disabled] {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .group-empty {
    font-size: 13px;
    color: var(--c-text-muted, #64748b);
  }
  @media (max-width: 720px) {
    .group-bar {
      flex-basis: 100%;
      flex-wrap: wrap;
    }
    .group-controls {
      width: 100%;
      flex-direction: column;
      align-items: stretch;
    }
    .group-select {
      width: 100%;
      flex: 1 1 auto;
    }
    .btn-deselect {
      width: 100%;
    }
  }
</style>
