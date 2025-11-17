<!--
  app.svelte
  ----------------------------------------------------------------------------
  Point d'entree UI: monte la topbar, les toasts et route entre mode editeur
  et configurateur. Les layouts specifiques sont charges dynamiquement.
-->
<script>
  import { onMount } from 'svelte';
  import { mode, theme } from './lib/stores.js';

  /* UI communes */
  import TopBar from './components/TopBar.svelte';
  import GraphPane from './components/GraphPane.svelte';
  import ToastContainer from './components/ToastContainer.svelte';
  import HelpOverlay from './components/HelpOverlay.svelte';
  import AuditPanel from './components/AuditPanel.svelte';
  import SystemHealthPanel from './components/SystemHealthPanel.svelte';

  /* Vue configurateur */
  import Summary from './components/Summary.svelte';
  import ExportBar from './components/ExportBar.svelte'; // export SVG/PNG/PDF
  import GroupSelectorBar from './components/GroupSelectorBar.svelte';

  /* Vue éditeur (lazy-load) */
  let EditorLayoutComponent = null;
  let editorLoading = false;

  const pageTitle = 'Vue Éditeur';

  const MIN_SUMMARY_WIDTH = 260;
  const MAX_SUMMARY_WIDTH = 520;
  let summaryWidth = 340;
  let resizing = false;
  let resizeStartX = 0;
  let resizeStartWidth = summaryWidth;
  let activePointerId = null;
  let resizeHandleEl = null;

  function clampWidth(value) {
    return Math.max(MIN_SUMMARY_WIDTH, Math.min(MAX_SUMMARY_WIDTH, value));
  }

  function onResizePointerDown(event) {
    event.preventDefault();
    resizing = true;
    resizeStartX = event.clientX;
    resizeStartWidth = summaryWidth;
    activePointerId = event.pointerId;
    resizeHandleEl = event.currentTarget;
    resizeHandleEl?.setPointerCapture?.(activePointerId);
    window.addEventListener('pointermove', onResizePointerMove);
    window.addEventListener('pointerup', onResizePointerUp);
  }

  function onResizePointerMove(event) {
    if (!resizing) return;
    const delta = event.clientX - resizeStartX;
    summaryWidth = clampWidth(resizeStartWidth + delta);
  }

  function onResizePointerUp(event) {
    if (event.pointerId !== activePointerId) return;
    resizing = false;
    resizeHandleEl?.releasePointerCapture?.(activePointerId);
    resizeHandleEl = null;
    activePointerId = null;
    window.removeEventListener('pointermove', onResizePointerMove);
    window.removeEventListener('pointerup', onResizePointerUp);
  }

  // Applique le thème via data-theme sur <html>
  let unsubTheme;
  onMount(() => {
    document.documentElement.setAttribute('data-theme', $theme || 'light');
    unsubTheme = theme.subscribe(t => {
      document.documentElement.setAttribute('data-theme', t || 'light');
    });
    return () => unsubTheme && unsubTheme();
  });

  // Charge dynamique du layout éditeur quand on passe en mode 'editor'
  $: if ($mode === 'editor' && !EditorLayoutComponent && !editorLoading) {
    editorLoading = true;
    import('./components/EditorLayout.svelte')
      .then(m => { EditorLayoutComponent = m.default; })
      .finally(() => { editorLoading = false; });
  }
</script>

<!-- Topbar : Import/Export JSON + switch configurateur/Éditeur + thème -->
<TopBar />
<ToastContainer />
<HelpOverlay />
<AuditPanel />
<SystemHealthPanel />

{#if $mode === 'editor'}
  <div class="toolbar" style="margin: 8px 12px 0;">
    <h2 class="title">{pageTitle}</h2>
  </div>

  {#if EditorLayoutComponent}
    <svelte:component this={EditorLayoutComponent} />
  {:else}
    <div class="loading"><div class="spinner" /> Chargement de l’éditeur…</div>
  {/if}
{:else}
  <!-- === VUE configurateur === -->
  <div class="layout layout--single">
    <div class="mainpane">
      <!-- Outils de ligne (EXPORT GRAPHE) -->
      <div class="rowtools">
        <GroupSelectorBar />
        <div class="rowtools-export">
          <ExportBar />
        </div>
      </div>

      <div class="mainrow" style={`--summary-width: ${summaryWidth}px`}>
        <div class="graph-wrap">
          <GraphPane />
        </div>
        <div
          class="split-handle"
          role="separator"
          aria-label="Redimensionner le résumé"
          aria-orientation="vertical"
          tabindex="-1"
          on:pointerdown={onResizePointerDown}
          on:pointerup={onResizePointerUp}
        />
        <aside class="summary-pane" style={`width: ${summaryWidth}px`}>
          <Summary />
        </aside>
      </div>
    </div>
  </div>
{/if}

<style>
  .title {
    font-size: 16px; margin: 0; font-weight: 600;
    color: var(--c-text, var(--text-color, #0f172a));
  }
  .toolbar { display: flex; align-items: center; gap: 8px; }

  .loading {
    display: grid; place-items: center;
    height: calc(100% - 52px);
    color: var(--c-text-muted, var(--text-muted, #8b93a7));
  }
  .spinner {
    width: 16px; height: 16px; border-radius: 50%;
    border: 2px solid color-mix(in srgb, var(--c-text, #0f172a) 25%, transparent);
    border-top-color: var(--c-text, var(--text-color, #0f172a));
    animation: spin .8s linear infinite; margin-right: 8px;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  /* ====== Mise en page configurateur avec Résumé à droite ====== */
  .mainpane { display: flex; flex-direction: column; min-height: 0; }
  .rowtools {
    display: flex;
    align-items: stretch;
    gap: 12px;
    flex-wrap: wrap;
    justify-content: space-between;
    padding: 8px 12px 0;
  }
  .rowtools-export {
    flex: 1 1 360px;
    min-width: 280px;
    display: flex;
    justify-content: flex-end;
  }
  .rowtools-export :global(.exportbar) {
    flex: 0 0 auto;
    width: auto;
  }

  .mainrow {
    display: flex;
    align-items: stretch;
    gap: 0;
    padding: 8px 12px 12px;
    flex: 1;
    min-height: 0;
  }
  .graph-wrap {
    min-width: 0;
    min-height: 0;
    height: 100%;
    display: flex;
    background: var(--c-bg, var(--bg, #fff));
    border: 1px solid var(--c-stroke, var(--border-color, #dfe3ea));
    border-right: none;
    border-radius: 8px;
    overflow: hidden;
  }
  .graph-wrap :global(svg),
  .graph-wrap :global(canvas) { flex: 1; min-height: 0; }

  .split-handle {
    width: 10px;
    cursor: col-resize;
    display: flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(to right, transparent, rgba(148,163,184,.35), transparent);
  }
  .split-handle::after {
    content: '';
    width: 2px;
    height: 40px;
    border-radius: 999px;
    background: var(--c-stroke, rgba(148,163,184,.8));
  }

  .summary-pane {
    flex: 0 0 auto;
    min-width: 260px;
    height: 100%;
    display: flex;
    flex-direction: column;
    background: var(--c-box-bg, var(--panel-bg, #f7f8fa));
    border: 1px solid var(--c-stroke, var(--border-color, #dfe3ea));
    border-radius: 0 8px 8px 0;
    overflow: auto;
    padding: 8px;
  }

  @media (max-width: 1200px) {
    .mainrow {
      flex-direction: column;
    }
    .split-handle {
      display: none;
    }
    .graph-wrap {
      border-right: 1px solid var(--c-stroke, var(--border-color, #dfe3ea));
      border-radius: 8px;
      margin-top: 12px;
    }
    .summary-pane {
      width: 100%;
      min-width: 0;
      border-radius: 8px;
      margin-top: 12px;
      order: 2;
      max-height: none;
    }
  }

  @media (max-width: 900px) {
    .rowtools {
      justify-content: center;
    }
    .rowtools-export {
      justify-content: flex-start;
    }
    .mainrow {
      padding: 8px;
    }
    .summary-pane {
      min-width: 0;
      width: 100%;
      margin-top: 12px;
    }
  }

  @media (max-width: 640px) {
    .graph-wrap {
      min-height: 320px;
    }
    .rowtools {
      padding: 8px 8px 0;
    }
  }
</style>







