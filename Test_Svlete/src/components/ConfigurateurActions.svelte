<script>
  import { onMount, onDestroy } from 'svelte';
  import { selected } from '../lib/stores.js';

  const clearAll = () => selected.set(new Set());
  $: count = ($selected && $selected.size) || 0;

  function handleKey(e) {
    if (e.key === 'Escape') clearAll();
  }

  onMount(() => window.addEventListener('keydown', handleKey));
  onDestroy(() => window.removeEventListener('keydown', handleKey));
</script>

<div class="actions">
  <div class="primary-tools">
    <button
      class="btn"
      on:click={clearAll}
      disabled={count === 0}
      title="Echap pour tout deselectionner"
      aria-label="Tout deselectionner"
    >
      Tout deselectionner {count ? `(${count})` : ''}
    </button>
  </div>
</div>

<style>
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 12px;
    align-items: center;
    justify-content: flex-start;
    margin: 0 12px 8px;
  }
  .primary-tools {
    display: flex;
    gap: 8px;
    align-items: center;
    flex-wrap: wrap;
  }
  .btn {
    border: 1px solid var(--c-stroke);
    background: var(--c-box-bg);
    color: var(--c-text);
    border-radius: 8px;
    padding: 6px 10px;
    cursor: pointer;
  }
  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  @media (max-width: 720px) {
    .actions {
      flex-direction: column;
      align-items: stretch;
      margin: 0 8px 8px;
    }
    .primary-tools {
      justify-content: space-between;
      width: 100%;
    }
  }
</style>
