?<!--
  GraphPane.svelte
  ------------------------------
  Se charge du rendu D3 du graphe des options et gÃ¨re les rÃ©sumÃ©s des rÃ¨gles
  pour les deux modes. Il observe les stores et dÃ©clenche un nouveau rendu
  dÃ¨s que les donnÃ©es changent.
-->
<script>
  import { onMount } from 'svelte';
  import { renderGraph } from '../lib/d3/graph.js';
  import {
    graphEl, grouped, gammes, optionLabels,
    rulesets, currentRulesetName, selected,
    search, searchFilters, collapsed, toggleSelect, mode, activeSchema
  } from '../lib/stores.js';

  let svgEl;
  let cleanup = () => {};

  // Rendu ÃÂ  la demande Ã¢EUR" on lit les rÃÂ¨gles Ã¢EURoeau moment du renduÃ¢EUR
  function rerender(preserveZoom = true) {
    cleanup();

    const activeRules =
      ($rulesets?.[$currentRulesetName]?.rules) || {};

    cleanup = renderGraph(svgEl, {
      search: $search,
      filters: $searchFilters,
      collapsed: $collapsed,
      grouped: $grouped,
      gammes: $gammes,
      rules: activeRules,
      optionLabels: $optionLabels,
      selected,
      interactive: $mode !== 'editor',
      preserveZoom,
      onToggleGroup: (g) => {
        const clone = structuredClone($collapsed);
        clone[g] = clone[g] || {};
        clone[g].__group = !clone[g].__group;
        collapsed.set(clone);
      },
      onToggleSubgroup: (g, key) => {
        const clone = structuredClone($collapsed);
        clone[g] = clone[g] || {};
        clone[g][key] = !clone[g][key];
        collapsed.set(clone);
      },
      onToggleSelect: (id) => ($mode !== 'editor') && toggleSelect(id)
    });
  }

  onMount(() => {
    graphEl.set(svgEl);
    rerender(false);
    const stop = [
      grouped.subscribe(() => rerender(true)),
      gammes.subscribe(() => rerender(true)),
      optionLabels.subscribe(() => rerender(true)),
      rulesets.subscribe(() => rerender(true)),
      currentRulesetName.subscribe(() => rerender(true)),
      search.subscribe(() => rerender(true)),
      searchFilters.subscribe(() => rerender(true)),
      collapsed.subscribe(() => rerender(true)),
      selected.subscribe(() => rerender(true)),
      mode.subscribe(() => rerender(true)),
      activeSchema.subscribe(() => rerender(false))
    ];
    return () => { stop.forEach(fn => fn && fn()); cleanup(); };
  });

  // ========= RÃÂ©sumÃÂ© des rÃÂ¨gles (affichÃÂ© sous le graphe en mode ÃÂ©diteur) =========
  $: activeRules = ($rulesets?.[$currentRulesetName]?.rules) || {};
  $: flatSummary = (() => {
    const out = [];
    for (const [from, spec] of Object.entries(activeRules)) {
      const mandatory = (spec?.mandatory || []).slice().sort();
      const incompatible = (spec?.incompatible_with || []).slice().sort();
      const deps = dependenciesForDisplay(spec, $optionLabels);
      const incompatGroups = incompatibleGroupsForDisplay(spec, $optionLabels);
      if (!mandatory.length && !incompatible.length && deps.length === 0 && incompatGroups.length === 0) continue;
      out.push({
        from,
        mandatory,
        incompatible_with: incompatible,
        incompatibleGroups: incompatGroups,
        incompatibleGroupCount: incompatGroups.length,
        dependencies: deps,
        dependencyCount: deps.length
      });
    }
    out.sort((a, b) => {
      const la = $optionLabels[a.from] || a.from;
      const lb = $optionLabels[b.from] || b.from;
      return la.localeCompare(lb, 'fr');
    });
    return out;
  })();

  function L(id) { return $optionLabels?.[id] || id; }

  function normalizedDependencyGroups(spec = {}) {
    const groups = Array.isArray(spec?.requires_groups) ? spec.requires_groups : [];
    const normalized = [];
    for (const g of groups) {
      const of = Array.isArray(g?.of) ? Array.from(new Set(g.of)) : [];
      if (of.length === 0) continue;
      const max = of.length;
      let min = Number.isFinite(+g?.min) ? Math.max(0, +g.min) : max;
      min = Math.min(min, max);
      normalized.push({ min, of });
    }
    return normalized;
  }

  function normalizedIncompatibleGroups(spec = {}) {
    const groups = Array.isArray(spec?.incompatible_groups) ? spec.incompatible_groups : [];
    const normalized = [];
    for (const g of groups) {
      const of = Array.isArray(g?.of) ? Array.from(new Set(g.of)) : [];
      if (of.length === 0) continue;
      const max = of.length;
      let min = Number.isFinite(+g?.min) ? Math.max(0, +g.min) : Math.min(2, max);
      min = Math.min(min, max);
      normalized.push({ min, of });
    }
    return normalized;
  }

  function describeGroupLabel(group, labels = {}) {
    const size = (group.of || []).length;
    const min = Number.isFinite(group.min) ? Math.max(0, Math.min(group.min, size)) : size;
    let head;
    if (min >= size) head = 'Tous';
    else if (min <= 0) head = '>=0';
    else head = `>=${min}`;
    const items = (group.of || []).map((id) => labels[id] || id);
    return `${head} parmi (${items.join(', ')})`;
  }

  function dependenciesForDisplay(spec = {}, labels = {}) {
    const entries = [];
    const direct = Array.isArray(spec?.requires) ? spec.requires : [];
    direct.forEach((id) => {
      if (!id) return;
      entries.push({ type: 'direct', id, label: labels[id] || id });
    });
    normalizedDependencyGroups(spec).forEach((group, idx) => {
      entries.push({
        type: 'group',
        id: `dep-group-${idx}`,
        label: describeGroupLabel(group, labels)
      });
    });
    return entries;
  }

  function incompatibleGroupsForDisplay(spec = {}, labels = {}) {
    const groups = normalizedIncompatibleGroups(spec);
    return groups.map((group, idx) => ({
      id: `inc-group-${idx}`,
      label: describeGroupLabel(group, labels)
    }));
  }

  // Suppression ciblÃÂ©e d'un lien de rÃÂ¨gle
  function removeEdge(from, edge, toId) {
    const name = $currentRulesetName;
    const next = structuredClone($rulesets || {});
    next[name] = next[name] || { rules: {} };
    next[name].rules[from] = next[name].rules[from] || { requires: [], incompatible_with: [], mandatory: [] };
    const list = Array.from(new Set(next[name].rules[from][edge] || []));
    next[name].rules[from][edge] = list.filter(x => x !== toId);
    rulesets.set(next);
  }
</script>

<div class="graph-wrap">
  <svg bind:this={svgEl} role="img" aria-label="Graphe des options et rÃÂ¨gles"></svg>

  {#if $mode === 'editor'}
    <section class="rules-summary panel" aria-live="polite">
      <header>
        <strong>RÃÂ©sumÃÂ© des rÃÂ¨gles</strong>
        <span class="counts">
          {flatSummary.length} options -
          {flatSummary.reduce((n,r)=>n+(r.mandatory?.length||0),0)} obligatoires -
          {flatSummary.reduce((n,r)=>n+(r.dependencyCount||0),0)} dÃ©pendances -
          {flatSummary.reduce((n,r)=>n+(r.incompatible_with?.length||0)+(r.incompatibleGroupCount||0),0)} incompatibilitÃ©s
        </span>
      </header>

      {#if flatSummary.length === 0}
        <div class="empty">Aucune rÃÂ¨gle dÃÂ©finie pour lÃ¢EURTMinstant.</div>
      {:else}
        <div class="summary-grid">
          {#each flatSummary as r}
            <div class="rule-row">
              <div class="from">{L(r.from)}</div>

              <div class="col">
                <div class="badge mand">Obligatoire</div>
                {#if r.mandatory.length === 0}
                  <span class="muted">-</span>
                {:else}
                  {#each r.mandatory as id, i}
                    <span class="chip mand" title="Obligatoire">
                      {L(id)}
                      <button
                        class="chip-x"
                        aria-label={"Supprimer l'obligation vers " + L(id)}
                        title="Supprimer"
                        on:click={() => removeEdge(r.from, 'mandatory', id)}
                      >Ã</button>
                    </span>{#if i < r.mandatory.length-1}<span class="sep">, </span>{/if}
                  {/each}
                {/if}
              </div>

              <div class="col">
                <div class="badge req">DÃ©pendances</div>
                {#if !(r.dependencies && r.dependencies.length)}
                  <span class="muted">-</span>
                {:else}
                  {#each r.dependencies as dep, i}
                    {#if dep.type === 'group'}
                      <span class="chip req group" title="Groupe de dÃ©pendances">{dep.label}</span>
                    {:else}
                      <span class="chip req" title="DÃ©pendance">
                        {dep.label}
                        <button
                          class="chip-x"
                          aria-label={"Supprimer la dÃ©pendance vers " + dep.label}
                          title="Supprimer"
                          on:click={() => removeEdge(r.from, 'requires', dep.id)}
                        >Ã</button>
                      </span>
                    {/if}
                    {#if i < r.dependencies.length-1}<span class="sep">, </span>{/if}
                  {/each}
                {/if}
              </div>


              <div class="col">
                <div class="badge inc">Incompatible</div>
                {#if r.incompatible_with.length === 0 && !(r.incompatibleGroups && r.incompatibleGroups.length)}
                  <span class="muted">-</span>
                {:else}
                  {#each r.incompatible_with as id, i}
                    <span class="chip inc" title="Incompatible">
                      {L(id)}
                      <button
                        class="chip-x"
                        aria-label={"Supprimer l'incompatibilitÃ© avec " + L(id)}
                        title="Supprimer"
                        on:click={() => removeEdge(r.from, 'incompatible_with', id)}
                      >Ã</button>
                    </span>{#if i < r.incompatible_with.length-1}<span class="sep">, </span>{/if}
                  {/each}
                  {#if r.incompatibleGroups && r.incompatibleGroups.length}
                    {#each r.incompatibleGroups as group}
                      <span class="chip inc group" title="Groupe d'incompatibilitÃ©s">{group.label}</span>
                    {/each}
                  {/if}
                {/if}
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </section>
  {/if}
</div>

<style>
  .graph-wrap { display:flex; flex-direction:column; gap:10px; height:100%; }
  svg { flex: 1 1 auto; width: 100%; height: 100%; display: block; background: transparent; }

  .rules-summary {
    flex: 0 0 auto;
    max-height: min(45vh, 360px);
    overflow-y: auto;
    padding-right: 8px;
  }
  .rules-summary header {
    display:flex; align-items:center; justify-content:space-between;
    margin-bottom: 8px;
  }
  .rules-summary .counts { color: var(--c-text-muted); font-size: 12px; }
  .rules-summary .empty { color: var(--c-text-muted); }

  .summary-grid { display:grid; grid-template-columns: 240px 1fr 1fr 1fr; gap: 8px 12px; }
  .rule-row { display: contents; }
  .from { font-weight: 600; align-self:center; }

  .col { display:flex; align-items:center; flex-wrap:wrap; gap:6px; }
  .badge { padding: 2px 6px; border-radius: 6px; font-size: 12px; border: 1px solid var(--c-stroke); }
  .badge.mand { border-color: var(--c-rule-mand-border); color: var(--c-rule-mand-border); }
  .badge.req  { border-color: var(--c-rule-req-border);  color: var(--c-rule-req-border); }
  .badge.inc  { border-color: var(--c-rule-inc-border);  color: var(--c-rule-inc-border); }

  .chip {
    display:inline-flex; align-items:center; gap:6px;
    padding:2px 6px; border-radius: 6px; font-size: 12px;
    border: 1px solid var(--c-stroke); background: var(--c-box-bg);
  }
  .chip.mand { border-color: var(--c-rule-mand-border); }
  .chip.req  { border-color: var(--c-rule-req-border); }
  .chip.inc  { border-color: var(--c-rule-inc-border); }
  .chip.req.group {
    border-style: dashed;
    cursor: default;
    background: color-mix(in srgb, var(--c-rule-req-border) 12%, transparent);
  }
  .chip.inc.group {
    border-style: dashed;
    cursor: default;
    background: color-mix(in srgb, var(--c-rule-inc-border) 12%, transparent);
  }

  /* Croix ÃÂ©quivalente ÃÂ  la "croix du rÃÂ©sumÃÂ© des nÃ"uds" (style minimal, discret) */
  .chip-x {
    appearance:none; border:none; background:transparent;
    color: var(--c-text-muted); cursor:pointer; font-size: 14px; line-height: 1;
    padding: 0 2px; border-radius: 4px;
  }
  .chip-x:hover { color: #dc2626; background: color-mix(in oklab, #dc2626 10%, transparent); }
  .chip-x:focus-visible { outline: 2px solid #dc2626; outline-offset: 2px; }

  .muted { color: var(--c-text-muted); }
  .sep { color: var(--c-text-muted); margin: 0 2px; }

  @media (max-width: 1024px) {
    .summary-grid {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .rule-row {
      display: flex;
      flex-direction: column;
      background: var(--c-box-bg);
      border: 1px solid var(--c-stroke);
      border-radius: 6px;
      padding: 10px;
      gap: 6px;
    }
    .from {
      font-size: 14px;
    }
    .col {
      align-items: flex-start;
    }
  }
</style>
