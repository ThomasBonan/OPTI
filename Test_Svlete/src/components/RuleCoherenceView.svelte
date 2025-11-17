<script>
  import { onMount } from 'svelte';
  import * as d3 from 'd3';
  import { createEventDispatcher } from 'svelte';
  import {
    rulesets,
    currentRulesetName,
    optionLabels,
    gammes,
    grouped
  } from '../lib/stores.js';

  const NODE_W = 170;
  const NODE_H = 62;
  const NODE_GAP = 150;
  const ROW_GAP = 120;
  const PADDING = 70;

  const legendItems = [
    { key: 'mand', label: 'Obligatoire', stroke: 'var(--c-rule-obl-border, var(--c-rule-mand-border))' },
    { key: 'req', label: 'Requires', stroke: 'var(--c-rule-req-border)' },
    { key: 'inc', label: 'Incompatible', stroke: 'var(--c-rule-inc-border)' },
    { key: 'warning', label: 'Conflit de gamme', stroke: 'var(--c-warning, #f97316)' }
  ];

  const EDGE_COLORS = {
    mandatory: 'var(--c-rule-obl-border, var(--c-rule-mand-border))',
    requires: 'var(--c-rule-req-border)',
    incompatible_with: 'var(--c-rule-inc-border)'
  };

  const MARKERS = {
    mandatory: 'arrow-tip-mand',
    requires: 'arrow-tip-req',
    incompatible_with: 'arrow-tip-inc'
  };

  const dispatch = createEventDispatcher();

  export let title = 'Vue cohÃ©rence';
  let svgEl;
  let contentEl;
  let highlightedNodes = new Set();
  let highlightedEdges = new Set();
  let groupedData = {};

  $: activeRules = ($rulesets?.[$currentRulesetName]?.rules) || {};
  $: groupedData = $grouped || {};
  $: graph = buildGraph(activeRules, $optionLabels || {}, $gammes || {}, groupedData);
  $: cycleCount = graph.cycles.size;
  $: gammeWarningCount = graph.gammeWarnings.length;
  $: statusLabel = (() => {
    const chunks = [];
    if (cycleCount > 0) chunks.push(`${cycleCount} boucle(s) dÃ©tectÃ©e(s)`);
    if (gammeWarningCount > 0) chunks.push(`${gammeWarningCount} conflit(s) de gamme`);
    return chunks.length ? chunks.join(' â€¢ ') : 'Relations cohÃ©rentes';
  })();
  $: statusTone = (cycleCount > 0 || gammeWarningCount > 0) ? 'nok' : 'ok';

  function L(id) {
    return graph.labels[id] || id;
  }

  function wrapLines(text = '', maxChars = 18) {
    const words = String(text ?? '').split(/\s+/).filter(Boolean);
    if (words.length === 0) return [''];
    const lines = [];
    let current = words.shift();
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (candidate.length > maxChars) {
        lines.push(current);
        current = word;
      } else {
        current = candidate;
      }
    }
    if (current) lines.push(current);
    return lines;
  }

  onMount(() => {
    if (!svgEl || !contentEl) return;
    const svg = d3.select(svgEl);
    const zoom = d3.zoom()
      .scaleExtent([0.3, 3])
      .on('zoom', (event) => {
        const { x, y, k } = event.transform;
        contentEl.setAttribute('transform', `translate(${x},${y}) scale(${k})`);
      });
    svg.call(zoom);
    svg.call(zoom.transform, d3.zoomIdentity.translate(PADDING, PADDING));
    return () => svg.on('.zoom', null);
  });

  function clearHighlight() {
    highlightedNodes = new Set();
    highlightedEdges = new Set();
  }

  function handleEdgeClick(edge, event) {
    event?.stopPropagation?.();
    const nodes = collectChain(edge);
    highlightedNodes = nodes;
    highlightedEdges = new Set(
      graph.edges
        .filter((e) => nodes.has(e.from) && nodes.has(e.to))
        .map((e) => edgeKey(e))
    );
  }

  function collectChain(edge) {
    const target = new Set();
    traverse(edge.from, graph.forward, target);
    traverse(edge.from, graph.backward, target);
    traverse(edge.to, graph.forward, target);
    traverse(edge.to, graph.backward, target);
    return target;
  }

  function traverse(start, adjacency, target) {
    const queue = [start];
    const seen = new Set();
    while (queue.length) {
      const node = queue.shift();
      if (seen.has(node)) continue;
      seen.add(node);
      target.add(node);
      for (const next of adjacency.get(node) || []) {
        queue.push(next);
      }
    }
  }

  function edgeKey(edge) {
    return `${edge.from}->${edge.to}->${edge.type}`;
  }

  function buildGraph(rules = {}, labels = {}, gammes = {}, groupedData = {}) {
    const nodesSet = new Set();
    const edges = [];
    const groupMeta = new Map();

    for (const [groupName, groupData] of Object.entries(groupedData || {})) {
      const root = Array.isArray(groupData?.root) ? groupData.root : [];
      root.forEach((id) => groupMeta.set(id, { group: groupName, subgroup: null }));
      for (const [subName, ids] of Object.entries(groupData?.subgroups || {})) {
        (ids || []).forEach((id) => groupMeta.set(id, { group: groupName, subgroup: subName }));
      }
    }

    for (const [from, spec] of Object.entries(rules)) {
      nodesSet.add(from);
      for (const id of spec?.mandatory || []) {
        nodesSet.add(id);
        edges.push({ from, to: id, type: 'mandatory' });
      }
      for (const id of spec?.requires || []) {
        nodesSet.add(id);
        edges.push({ from, to: id, type: 'requires' });
      }
      for (const id of spec?.incompatible_with || []) {
        nodesSet.add(id);
        edges.push({ from, to: id, type: 'incompatible_with' });
      }
    }

    const nodes = Array.from(nodesSet).sort((a, b) =>
      (labels[a] || a).localeCompare(labels[b] || b, 'fr', { sensitivity: 'base' })
    );

    const dependencyEdges = edges.filter((edge) => edge.type !== 'incompatible_with');
    const cycles = detectCycles(nodes, dependencyEdges);

    const undirected = new Map(nodes.map((id) => [id, new Set()]));
    edges.forEach((edge) => {
      undirected.get(edge.from)?.add(edge.to);
      undirected.get(edge.to)?.add(edge.from);
    });

    const components = [];
    const visited = new Set();
    for (const node of nodes) {
      if (visited.has(node)) continue;
      const queue = [node];
      visited.add(node);
      const comp = [];
      while (queue.length) {
        const cur = queue.shift();
        comp.push(cur);
        for (const next of undirected.get(cur) || []) {
          if (!visited.has(next)) {
            visited.add(next);
            queue.push(next);
          }
        }
      }
      comp.sort((a, b) => (labels[a] || a).localeCompare(labels[b] || b, 'fr', { sensitivity: 'base' }));
      components.push(comp);
    }
    if (components.length === 0) components.push([]);

    const positions = new Map();
    let maxRowLength = 0;
    components.forEach((comp, row) => {
      maxRowLength = Math.max(maxRowLength, comp.length);
      comp.forEach((id, col) => {
        positions.set(id, { x: col * (NODE_W + NODE_GAP), y: row * (NODE_H + ROW_GAP) });
      });
    });
    if (maxRowLength === 0) maxRowLength = 1;

    const forward = new Map(nodes.map((id) => [id, new Set()]));
    const backward = new Map(nodes.map((id) => [id, new Set()]));
    dependencyEdges.forEach((edge) => {
      forward.get(edge.from)?.add(edge.to);
      backward.get(edge.to)?.add(edge.from);
    });

    const nodeGammes = computeGammes(nodesSet, gammes);
    const enrichedEdges = edges.map((edge) => {
      const start = positions.get(edge.from) || { x: 0 };
      const end = positions.get(edge.to) || { x: 0 };
      const depth = Math.max(1, Math.abs(end.x - start.x) / (NODE_W + NODE_GAP));
      const conflict =
        edge.type !== 'incompatible_with' &&
        hasGammeConflict(nodeGammes[edge.from], nodeGammes[edge.to]);
      return { ...edge, depth, conflict };
    });

    const gammeWarnings = enrichedEdges
      .filter((edge) => edge.conflict)
      .map((edge) => ({ from: edge.from, to: edge.to }));
    const gammeWarningKeys = new Set(gammeWarnings.map((warn) => `${warn.from}->${warn.to}`));

    const width =
      (Math.max(1, maxRowLength) - 1) * (NODE_W + NODE_GAP) + NODE_W + PADDING * 2;
    const height =
      (Math.max(1, components.length) - 1) * (NODE_H + ROW_GAP) + NODE_H + PADDING * 2;

    const groups = {};
    nodes.forEach((id) => {
      const meta = groupMeta.get(id);
      if (meta) groups[id] = meta;
    });

    return {
      nodes,
      labels,
      edges: enrichedEdges,
      positions,
      width,
      height,
      groups,
      cycles,
      forward,
      backward,
      gammeWarnings,
      gammeWarningKeys,
      cycleEdges: new Set(
        enrichedEdges
          .filter((edge) => cycles.has(edge.from) && cycles.has(edge.to))
          .map((edge) => edgeKey(edge))
      )
    };
  }

  function computeGammes(nodes = new Set(), gammes = {}) {
    const map = {};
    for (const id of nodes) {
      const set = new Set();
      for (const [name, entries] of Object.entries(gammes || {})) {
        const info = entries?.[id];
        if (info?.included || info?.optional) {
          set.add(name);
        }
      }
      map[id] = set;
    }
    return map;
  }

  function hasGammeConflict(fromSet = new Set(), toSet = new Set()) {
    if (!fromSet.size || !toSet.size) return false;
    for (const item of fromSet) {
      if (toSet.has(item)) return false;
    }
    return true;
  }

  function detectCycles(nodes, edges) {
    const cycles = new Set();
    const graph = new Map(nodes.map((node) => [node, []]));
    edges.forEach((edge) => graph.get(edge.from)?.push(edge.to));

    const visited = new Set();
    const stack = new Set();

    function dfs(node) {
      if (stack.has(node)) {
        cycles.add(node);
        return true;
      }
      if (visited.has(node)) return false;
      visited.add(node);
      stack.add(node);
      let found = false;
      for (const next of graph.get(node) || []) {
        if (dfs(next)) {
          cycles.add(node);
          found = true;
        }
      }
      stack.delete(node);
      return found;
    }

    nodes.forEach((node) => dfs(node));
    return cycles;
  }

  function edgePath(edge) {
    const start = graph.positions.get(edge.from);
    const end = graph.positions.get(edge.to);
    if (!start || !end) return '';
    const sx = start.x + NODE_W;
    const sy = start.y + NODE_H / 2;
    const ex = end.x;
    const ey = end.y + NODE_H / 2;
    const distance = Math.max(60, Math.abs(ex - sx));
    const offset = NODE_H + edge.depth * 40;
    const belowY = Math.max(sy, ey) + offset;

    if (ex >= sx) {
      const ctrl = Math.max(80, distance / 2);
      return `M${sx},${sy} C${sx + ctrl},${belowY} ${ex - ctrl},${belowY} ${ex},${ey}`;
    }
    const ctrl = Math.max(80, distance / 2);
    const extra = offset + 90;
    return `M${sx},${sy} C${sx + ctrl},${belowY + extra} ${ex - ctrl},${belowY + extra} ${ex},${ey}`;
  }
</script>

<section class="coherence-view panel">
  <header class="cv-toolbar">
    <div class="cv-left">
      <h2>{title}</h2>
      <span class="status {statusTone}">{statusLabel}</span>
    </div>
    <button class="btn" type="button" on:click={() => dispatch('close')}>
      Retour au graphe
    </button>
  </header>

  <div class="cv-legend">
    {#each legendItems as item}
      <div class="legend-item">
        <span class="legend-dot {item.key}"></span>
        <span>{item.label}</span>
      </div>
    {/each}
  </div>

  {#if graph.gammeWarnings.length}
    <div class="warning-box">
      <strong>Conflits de gamme dÃ©tectÃ©s :</strong>
      <ul>
        {#each graph.gammeWarnings as warn}
          <li>{L(warn.from)} â†’ {L(warn.to)}</li>
        {/each}
      </ul>
    </div>
  {/if}

  {#if graph.nodes.length === 0}
    <div class="empty">Aucune rÃ¨gle Ã  analyser.</div>
  {:else}
    <div class="cv-canvas">
      <svg
        bind:this={svgEl}
        role="img"
        aria-label="Visualisation de cohÃ©rence des rÃ¨gles"
        viewBox={`0 0 ${graph.width} ${graph.height}`}
        preserveAspectRatio="xMidYMid meet"
        on:click={clearHighlight}
      >
        <defs>
          <marker id="arrow-tip-mand" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M0 0 L10 5 L0 10 Z" fill="var(--c-rule-obl-border, var(--c-rule-mand-border))" />
          </marker>
          <marker id="arrow-tip-req" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M0 0 L10 5 L0 10 Z" fill="var(--c-rule-req-border)" />
          </marker>
          <marker id="arrow-tip-inc" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M0 0 L10 5 L0 10 Z" fill="var(--c-rule-inc-border)" />
          </marker>
          <marker id="arrow-tip-warning" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M0 0 L10 5 L0 10 Z" fill="var(--c-warning, #f97316)" />
          </marker>
        </defs>
        <g bind:this={contentEl}>
          {#each graph.edges as edge}
            {@const key = `${edge.from}->${edge.to}`}
            {@const cycleKey = edgeKey(edge)}
            {@const isConflict = graph.gammeWarningKeys.has(key) && (edge.type === 'mandatory' || edge.type === 'requires')}
            <path
              d={edgePath(edge)}
              class={`edge ${edge.type} ${graph.cycleEdges.has(cycleKey) ? 'cycle' : ''} ${isConflict ? 'conflict' : ''} ${highlightedEdges.has(cycleKey) ? 'highlighted' : ''}`}
              stroke={isConflict ? 'var(--c-warning, #f97316)' : EDGE_COLORS[edge.type]}
              marker-end={`url(#${isConflict ? 'arrow-tip-warning' : MARKERS[edge.type]})`}
              on:click|stopPropagation={(event) => handleEdgeClick(edge, event)}
            />
          {/each}

          {#each graph.nodes as id}
            {#if graph.positions.get(id)}
              {@const pos = graph.positions.get(id)}
              {@const meta = graph.groups[id]}
              {@const titleLines = wrapLines(L(id), 18)}
              {@const metaText = meta ? `[${meta.group}${meta.subgroup ? ` / ${meta.subgroup}` : ''}]` : '[Non classé]'}
              {@const metaLines = wrapLines(metaText, 22)}
              {@const titleStartY = NODE_H / 2 - 10 - (titleLines.length - 1) * 7}
              {@const metaStartY = NODE_H / 2 + 18}
              <g transform={`translate(${pos.x}, ${pos.y})`} class={`node ${graph.cycles.has(id) ? 'cycle' : ''} ${highlightedNodes.has(id) ? 'highlighted' : ''}`}>
                <rect width={NODE_W} height={NODE_H} rx="14" ry="14" />
                <text class="label-title" text-anchor="middle">
                  {#each titleLines as line, idx}
                    <tspan x={NODE_W / 2} y={titleStartY + idx * 14} dominant-baseline="middle">{line}</tspan>
                  {/each}
                </text>
                <text class="label-meta" text-anchor="middle">
                  {#each metaLines as line, idx}
                    <tspan x={NODE_W / 2} y={metaStartY + idx * 14} dominant-baseline="middle">{line}</tspan>
                  {/each}
                </text>
              </g>
            {/if}
          {/each}
        </g>
      </svg>
    </div>
  {/if}
</section>

<style>
  .coherence-view {
    display: flex;
    flex-direction: column;
    gap: 12px;
    height: 100%;
  }
  .cv-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }
  .cv-left {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .status {
    padding: 4px 8px;
    border-radius: 999px;
    font-size: 13px;
    font-weight: 600;
  }
  .status.ok { background: rgba(34, 197, 94, 0.15); color: #15803d; }
  .status.nok { background: rgba(239, 68, 68, 0.15); color: #b91c1c; }

  .cv-legend {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    font-size: 13px;
  }
  .legend-item {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .legend-dot {
    width: 12px;
    height: 12px;
    border-radius: 999px;
  }
  .legend-dot.mand { background: var(--c-rule-obl-border, var(--c-rule-mand-border)); }
  .legend-dot.req { background: var(--c-rule-req-border); }
  .legend-dot.inc { background: var(--c-rule-inc-border); }
  .legend-dot.warning { background: var(--c-warning, #f97316); }

  .warning-box {
    border: 1px solid color-mix(in srgb, var(--c-warning, #f97316) 40%, transparent);
    background: color-mix(in srgb, var(--c-warning, #f97316) 12%, transparent);
    border-radius: 10px;
    padding: 8px 12px;
    font-size: 13px;
  }
  .warning-box ul {
    margin: 6px 0 0;
    padding-left: 18px;
  }

  .cv-canvas {
    flex: 1;
    border: 1px solid var(--c-stroke);
    border-radius: 12px;
    background: var(--c-bg);
    overflow: hidden;
  }
  svg {
    width: 100%;
    height: 100%;
    cursor: grab;
  }
  svg:active { cursor: grabbing; }

  .node rect {
    fill: var(--c-box-bg);
    stroke: var(--c-stroke);
    stroke-width: 1.4;
  }
  .node text {
    font-size: 13px;
    fill: var(--c-text);
  }
  .label-title { font-weight: 600; }
  .label-meta { fill: var(--c-text-muted); font-size: 11px; }

  .node.cycle rect {
    stroke: var(--c-rule-inc-border, #dc2626);
    stroke-width: 2;
  }
  .node.highlighted rect {
    stroke: var(--c-highlight, #7c3aed);
    stroke-width: 2.6;
  }

  .edge {
    fill: none;
    stroke-width: 2.5;
    stroke-linecap: round;
    stroke-linejoin: round;
    opacity: 0.9;
    transition: stroke 0.18s ease;
  }
  .edge.inc { stroke-dasharray: 6 4; }
  .edge.conflict { stroke-dasharray: 4 3; }
  .edge.cycle { stroke-width: 3; }
  .edge.highlighted {
    stroke: var(--c-highlight, #7c3aed) !important;
    stroke-width: 3.2;
  }

  .btn {
    border: 1px solid var(--c-stroke);
    background: var(--c-box-bg);
    color: var(--c-text);
    border-radius: 8px;
    padding: 6px 12px;
    cursor: pointer;
  }

  .empty {
    padding: 24px;
    border: 1px dashed var(--c-stroke);
    border-radius: 12px;
    text-align: center;
    color: var(--c-text-muted);
  }
</style>
