<script>
  import { get } from 'svelte/store';
  import { onDestroy } from 'svelte';
  import OptionPicker from './OptionPicker.svelte';
  import {
    grouped,
    optionLabels,
    rulesets,
    currentRulesetName
  } from '../lib/stores';

  // ---------- Aplat options + chemin ----------
  function buildOptions(groupedMap = {}, labels = {}) {
    const out = [];
    for (const [gName, gObj] of Object.entries(groupedMap || {})) {
      const sub = gObj?.subgroups || {};
      for (const [sgName, ids] of Object.entries(sub)) {
        (ids || []).forEach(id => out.push({ id, label: labels?.[id] || id, path: `${gName} > ${sgName}` }));
      }
      (gObj?.root || []).forEach(id => out.push({ id, label: labels?.[id] || id, path: `${gName}` }));
    }
    out.sort((a,b)=> a.label.localeCompare(b.label) || a.path.localeCompare(b.path));
    return out;
  }
  let flat = buildOptions(get(grouped), get(optionLabels));
  const stopG = grouped.subscribe(v => (flat = buildOptions(v, get(optionLabels))));
  const stopL = optionLabels.subscribe(v => (flat = buildOptions(get(grouped), v)));

  const L = (id) => get(optionLabels)?.[id] || id;
  const PATH = (id) => flat.find(o => o.id === id)?.path || '';

  // ---------- ruleset actif (100% rÃ©actif) ----------
  $: activeRules = $rulesets?.[$currentRulesetName]?.rules || {};
  const getSpec    = (id) => activeRules?.[id] || {};
  const ensureSpec = (r, id) => (r[id] = r[id] || {}, r[id]);

  // Ã©tat local
  let src = null;
  let pickMandatory = null;
  let pickIncomp = null;
  let pickDependencyGroup = []; // index par groupe
  let pickIncompatGroup = [];

  // Liste des groupes k/n - dÃ©pend DIRECTEMENT des stores (fix)
  $: dependencyGroups = src ? ($rulesets?.[$currentRulesetName]?.rules?.[src]?.requires_groups || []) : [];
  $: incompatGroups = src ? ($rulesets?.[$currentRulesetName]?.rules?.[src]?.incompatible_groups || []) : [];

  // --- mutation helper ---
  function updateRules(mutator) {
    rulesets.update(rs0 => {
      const name = get(currentRulesetName);
      const payload = rs0[name] || { rules: {} };
      const rulesOld = payload.rules || {};
      const rulesNew = mutator({ ...rulesOld });
      return { ...rs0, [name]: { ...payload, rules: rulesNew } };
    });
    // rien d'autre : on laisse $rulesets/$currentRulesetName déclencher les $: ci-dessus
  }

  // --- Ajouts auto ---
  $: if (src && pickMandatory) {
    updateRules(r => {
      const S = ensureSpec(r, src);
      S.mandatory = Array.from(new Set([...(S.mandatory || []), pickMandatory]));
      r[src] = { ...S }; return r;
    });
    pickMandatory = null;
  }

  $: if (src && pickIncomp) {
    updateRules(r => {
      const S = ensureSpec(r, src);
      const B = ensureSpec(r, pickIncomp);
      S.incompatible_with = Array.from(new Set([...(S.incompatible_with || []), pickIncomp]));
      B.incompatible_with = Array.from(new Set([...(B.incompatible_with || []), src]));
      r[src] = { ...S }; r[pickIncomp] = { ...B }; return r;
    });
    pickIncomp = null;
  }

  $: if (src && Array.isArray(pickDependencyGroup)) {
    pickDependencyGroup.forEach((val, idx) => {
      if (!val) return;
      updateRules(r => {
        const S = ensureSpec(r, src);
        const list = Array.isArray(S.requires_groups) ? S.requires_groups.slice() : [];
        const g = { ...(list[idx] || { min: 1, of: [] }) };
        g.of = Array.from(new Set([...(g.of || []), val]));
        if (!Number.isFinite(+g.min)) g.min = 1;
        g.min = Math.max(0, Math.min(g.min, g.of.length));
        list[idx] = g;
        S.requires_groups = list; S.requires = undefined;
        r[src] = { ...S }; return r;
      });
      // [!] rÃ©assigner le tableau pour rÃ©veiller le bind:value du picker
      pickDependencyGroup[idx] = null;
      pickDependencyGroup = pickDependencyGroup.slice();
    });
  }

  $: if (src && Array.isArray(pickIncompatGroup)) {
    pickIncompatGroup.forEach((val, idx) => {
      if (!val) return;
      updateRules((r) => {
        const S = ensureSpec(r, src);
        const list = Array.isArray(S.incompatible_groups) ? S.incompatible_groups.slice() : [];
        const g = { ...(list[idx] || { min: 2, of: [] }) };
        g.of = Array.from(new Set([...(g.of || []), val]));
        if (!Number.isFinite(+g.min)) g.min = Math.min(2, g.of.length);
        g.min = Math.max(0, Math.min(g.min, g.of.length));
        list[idx] = g;
        S.incompatible_groups = list;
        r[src] = { ...S }; return r;
      });
      pickIncompatGroup[idx] = null;
      pickIncompatGroup = pickIncompatGroup.slice();
    });
  }

  // --- Suppressions & gestion groupes ---
  function removeMandatory(idB) {
    updateRules(r => {
      const S = ensureSpec(r, src);
      S.mandatory = (S.mandatory || []).filter(x => x !== idB);
      r[src] = { ...S }; return r;
    });
  }
  function removeIncompatible(idB) {
    updateRules(r => {
      const S = ensureSpec(r, src);
      const B = ensureSpec(r, idB);
      S.incompatible_with = (S.incompatible_with || []).filter(x => x !== idB);
      B.incompatible_with = (B.incompatible_with || []).filter(x => x !== src);
      r[src] = { ...S }; r[idB] = { ...B }; return r;
    });
  }
  function addDependencyGroup() {
    if (!src) return;
    updateRules(r => {
      const S = ensureSpec(r, src);
      const list = Array.isArray(S.requires_groups) ? S.requires_groups.slice() : [];
      list.push({ min: 1, of: [] });
      S.requires_groups = list; S.requires = undefined;
      r[src] = { ...S }; return r;
    });
    // prÃ©pare un slot pour le nouveau picker
    pickDependencyGroup = [...pickDependencyGroup, null];
  }
  function removeDependencyGroup(idx) {
    updateRules(r => {
      const S = ensureSpec(r, src);
      const list = (S.requires_groups || []).slice();
      list.splice(idx, 1);
      S.requires_groups = list;
      r[src] = { ...S }; return r;
    });
    pickDependencyGroup = pickDependencyGroup.filter((_, i) => i !== idx);
  }
  function setDependencyGroupMin(idx, v) {
    updateRules(r => {
      const S = ensureSpec(r, src);
      const list = (S.requires_groups || []).slice();
      const g = { ...(list[idx] || { min: 1, of: [] }) };
      const max = (g.of || []).length;
      g.min = Math.max(0, Math.min(Number.isFinite(+v) ? +v : 0, max));
      list[idx] = g;
      S.requires_groups = list; S.requires = undefined;
      r[src] = { ...S }; return r;
    });
  }
  function removeFromDependencyGroup(idx, idB) {
    updateRules(r => {
      const S = ensureSpec(r, src);
      const list = (S.requires_groups || []).slice();
      const g = { ...(list[idx] || { min: 1, of: [] }) };
      g.of = (g.of || []).filter(x => x !== idB);
      g.min = Math.max(0, Math.min(g.min ?? 1, g.of.length));
      list[idx] = g;
      S.requires_groups = list;
      r[src] = { ...S }; return r;
    });
  }
  function addIncompatGroup() {
    if (!src) return;
    updateRules((r) => {
      const S = ensureSpec(r, src);
      const list = Array.isArray(S.incompatible_groups) ? S.incompatible_groups.slice() : [];
      list.push({ min: 2, of: [] });
      S.incompatible_groups = list;
      r[src] = { ...S }; return r;
    });
    pickIncompatGroup = [...pickIncompatGroup, null];
  }
  function removeIncompatGroup(idx) {
    updateRules((r) => {
      const S = ensureSpec(r, src);
      const list = (S.incompatible_groups || []).slice();
      list.splice(idx, 1);
      S.incompatible_groups = list;
      r[src] = { ...S }; return r;
    });
    pickIncompatGroup = pickIncompatGroup.filter((_, i) => i !== idx);
  }
  function setIncompatGroupMin(idx, v) {
    updateRules((r) => {
      const S = ensureSpec(r, src);
      const list = (S.incompatible_groups || []).slice();
      const g = { ...(list[idx] || { min: 2, of: [] }) };
      const max = (g.of || []).length;
      g.min = Math.max(0, Math.min(Number.isFinite(+v) ? +v : 0, max));
      list[idx] = g;
      S.incompatible_groups = list;
      r[src] = { ...S }; return r;
    });
  }
  function removeFromIncompatGroup(idx, idB) {
    updateRules((r) => {
      const S = ensureSpec(r, src);
      const list = (S.incompatible_groups || []).slice();
      const g = { ...(list[idx] || { min: 2, of: [] }) };
      g.of = (g.of || []).filter((x) => x !== idB);
      g.min = Math.max(0, Math.min(g.min ?? 2, g.of.length));
      list[idx] = g;
      S.incompatible_groups = list;
      r[src] = { ...S }; return r;
    });
  }

  onDestroy(() => { stopG(); stopL(); });
</script>

<div class="rule-editor">
  <!-- Source -->
  <div class="section">
    <div class="label">Noeuds à modifier</div>
    <div class="row">
      <OptionPicker items={flat} bind:value={src} placeholder="Rechercher / choisir le nœud à modifier..." showPath />
      {#if src}
        <button class="btn" type="button" on:click={() => { src = null; }} title="Effacer">×</button>
      {/if}
    </div>
    {#if src}
      <div class="picked">
        <div class="picked-title">Sélectionné :</div>
        <div class="picked-name">{L(src)}</div>
        <div class="picked-path">{PATH(src)}</div>
      </div>
    {/if}
  </div>



  {#if src}
    <!-- Obligatoire -->
    <div class="section">
      <div class="label">Obligatoire</div>
      <div class="hint">Si <strong>{L(src)}</strong> est choisie, les options ci-dessous sont auto-sélectionnées.</div>

      <OptionPicker
        items={flat.filter(o => o.id !== src && !(getSpec(src).mandatory || []).includes(o.id))}
        bind:value={pickMandatory}
        placeholder="Rechercher et ajouter..."
        showPath
      />

      {#if (getSpec(src).mandatory || []).length === 0}
        <div class="muted">Aucune option.</div>
      {:else}
        <div class="chips">
          {#each (getSpec(src).mandatory || []) as id}
            <span class="chip">
              {L(id)} <small class="path">{PATH(id)}</small>
              <button class="x" type="button" on:click|stopPropagation={() => removeMandatory(id)} title="Retirer">×</button>
            </span>
          {/each}
        </div>
      {/if}
    </div>

    <!-- Groupes k-sur-n -->
    <div class="section">
      <div class="label">Groupes de dépendances (k-sur-n)</div>
      <div class="hint">Chaque groupe définit un minimum <code>k</code> d'options à respecter. <strong>Tous</strong> les groupes doivent être satisfaits.</div>

      <button class="btn primary" type="button" on:click={addDependencyGroup}>+ Ajouter un groupe</button>

      {#each dependencyGroups as g, i (i + '-' + (g.of?.length || 0))}
        <div class="group">
          <div class="group-head">
            <label>min</label>
            <input type="number" min="0" max={g.of?.length || 0} value={g.min} on:change={(e) => setDependencyGroupMin(i, e.currentTarget.value)} />
            <button class="btn" type="button" on:click={() => removeDependencyGroup(i)} title="Supprimer le groupe">❑</button>
          </div>

          <OptionPicker
            items={flat.filter(o => o.id !== src && !((dependencyGroups[i]?.of || []).includes(o.id)))}
            bind:value={pickDependencyGroup[i]}
            placeholder="Rechercher et ajouter au groupe..."
            showPath
          />

          {#if (g.of || []).length === 0}
            <div class="muted">Aucune option dans ce groupe.</div>
          {:else}
            <div class="chips">
              {#each (g.of || []) as id}
                <span class="chip">
                  {L(id)} <small class="path">{PATH(id)}</small>
                  <button class="x" type="button" on:click|stopPropagation={() => removeFromDependencyGroup(i, id)} title="Retirer">Ã</button>
                </span>
              {/each}
            </div>
          {/if}
        </div>
      {/each}
    </div>

    <!-- Groupes d'incompatibilités -->
    <div class="section">
      <div class="label">Groupes d'incompatibilités (k-sur-n)</div>
      <div class="hint">Si <strong>{L(src)}</strong> est présenté en même temps qu'au moins <code>k</code> options d'un groupe, il devient indisponible.</div>

      <button class="btn primary" type="button" on:click={addIncompatGroup}>+ Ajouter un groupe</button>

      {#each incompatGroups as g, i (i + '-inc-' + (g.of?.length || 0))}
        <div class="group">
          <div class="group-head">
            <label>min</label>
            <input type="number" min="0" max={g.of?.length || 0} value={g.min} on:change={(e) => setIncompatGroupMin(i, e.currentTarget.value)} />
            <button class="btn" type="button" on:click={() => removeIncompatGroup(i)} title="Supprimer le groupe">❑</button>
          </div>

          <OptionPicker
            items={flat.filter(o => o.id !== src && !((incompatGroups[i]?.of || []).includes(o.id)))}
            bind:value={pickIncompatGroup[i]}
            placeholder="Rechercher et ajouter au groupe..."
            showPath
          />

          {#if (g.of || []).length === 0}
            <div class="muted">Aucune option dans ce groupe.</div>
          {:else}
            <div class="chips">
              {#each (g.of || []) as id}
                <span class="chip">
                  {L(id)} <small class="path">{PATH(id)}</small>
                  <button class="x" type="button" on:click|stopPropagation={() => removeFromIncompatGroup(i, id)} title="Retirer">Ã</button>
                </span>
              {/each}
            </div>
          {/if}
        </div>
      {/each}
    </div>

    <!-- Incompatible -->
    <div class="section">
      <div class="label">Incompatible</div>

      <OptionPicker
        items={flat.filter(o => o.id !== src && !(getSpec(src).incompatible_with || []).includes(o.id))}
        bind:value={pickIncomp}
        placeholder="Rechercher et ajouter une incompatibilité..."
        showPath
      />

      {#if (getSpec(src).incompatible_with || []).length === 0}
        <div class="muted">Aucune incompatibilité.</div>
      {:else}
        <div class="chips">
          {#each (getSpec(src).incompatible_with || []) as id}
            <span class="chip danger">
              {L(id)} <small class="path">{PATH(id)}</small>
              <button class="x" type="button" on:click|stopPropagation={() => removeIncompatible(id)} title="Retirer">×</button>
            </span>
          {/each}
        </div>
      {/if}
    </div>

  {/if}
</div>

<style>
  .rule-editor { display:flex; flex-direction:column; gap:14px; }
  .section { padding:10px 12px; border:1px solid var(--c-stroke); border-radius:8px; background:var(--c-box-bg); }
  .label { font-weight:700; margin-bottom:6px; }
  .hint { color:var(--c-text-muted); font-size:12px; margin-bottom:8px; }
  .muted { color:var(--c-text-muted); font-size:12px; margin-top:6px; }
  .row { display:flex; gap:8px; align-items:center; }
  .row > :global(*) { flex:1 1 auto; min-width:0; }
  .btn { padding:6px 10px; border-radius:6px; border:1px solid var(--c-stroke); background:var(--c-btn); color:var(--c-btn-text); cursor:pointer; }
  .btn.primary { background:#2563eb; color:#fff; }
  .picked { display:grid; grid-template-columns:auto 1fr; align-items:baseline; gap:4px 8px; margin-top:6px; }
  .picked-title { color:var(--c-text-muted); }
  .picked-name { font-weight:700; }
  .picked-path { color:var(--c-text-muted); font-size:12px; grid-column:2; }
  .chips { display:flex; flex-wrap:wrap; gap:6px; margin-top:8px; }
  .chip { display:inline-flex; align-items:center; gap:6px; padding:4px 8px; border:1px solid var(--c-stroke); border-radius:999px; background:var(--c-box-bg); }
  .chip .path { color: var(--c-text-muted); font-size:11px; }
  .chip.danger { border-color: var(--c-rule-inc-border); background: var(--c-rule-inc-bg); }
  .chip .x { border:0; background:transparent; cursor:pointer; font-weight:700; color: var(--c-text-muted); padding:0 4px; }
  .group { margin-top:10px; padding:10px; border: 1px dashed var(--c-stroke); border-radius:8px; }
  .group-head { display:flex; align-items:center; gap:8px; margin-bottom:8px; }
  .group-head input[type="number"] { width: 80px; }
  code { background: rgba(0,0,0,.06); padding:1px 4px; border-radius:4px; }
  [data-theme="dark"] code { background: rgba(255,255,255,.08); }
</style>
