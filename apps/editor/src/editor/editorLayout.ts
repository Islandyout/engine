// The editor's page layout (0.77.0, out of main.ts): toolbar, hierarchy and
// problems, viewport, inspector, and the project/console dock. Static
// markup only; main.ts wires the behaviour by element id.
import { iconHtml } from "./dom";

export function editorLayoutHtml({
  editorVersion,
  catalogCategories,
  modelCount,
}: {
  editorVersion: string;
  catalogCategories: readonly string[];
  modelCount: number;
}) {
  return `<header>
  <span class="brand"><span class="brand-mark" aria-hidden="true"></span><b>GAME ENGINE</b></span>
  <span class="brand-sub">BTAI Editor <span class="version">${editorVersion}</span></span>
  <a class="link-external" href="https://github.com/Islandyout/engine">View source${iconHtml("external")}</a>
</header>
<nav>
  <div class="btn-group">
    <button id="new" class="btn" title="New scene">${iconHtml("plus")}<span>New</span></button>
    <button id="save" class="btn" title="Save JSON">${iconHtml("save")}<span>Save</span></button>
    <label class="btn" title="Open JSON">${iconHtml("open")}<span>Open</span><input id="open" type="file" accept=".json" hidden></label>
  </div>
  <div class="btn-group">
    <button id="games" class="btn" title="Games library: engine games, your games folder, scenes saved in this browser">${iconHtml("cube")}<span>Games</span></button>
  </div>
  <div class="btn-group">
    <button id="undo" class="btn btn-icon" title="Undo" aria-label="Undo">${iconHtml("undo")}</button>
    <button id="redo" class="btn btn-icon" title="Redo" aria-label="Redo">${iconHtml("redo")}</button>
  </div>
  <div class="btn-group btn-group-transport">
    <button id="play" class="btn btn-icon btn-play" title="Play" aria-label="Play">${iconHtml("play")}</button>
    <button id="pause" class="btn btn-icon btn-pause" title="Pause" aria-label="Pause">${iconHtml("pause")}</button>
    <button id="stop" class="btn btn-icon btn-stop" title="Stop" aria-label="Stop">${iconHtml("stop")}</button>
  </div>
  <span id="document" class="doc-badge"></span>
</nav>
<main id="workspace">
  <aside id="panel-hierarchy" class="panel">
    <div class="panel-header">${iconHtml("cube")}<h2>Scene Hierarchy</h2></div>
    <div class="panel-body">
      <div class="search-box">${iconHtml("search")}<input id="search" placeholder="Search entities"></div>
      <div class="tools">
        <button id="add" class="btn btn-sm">${iconHtml("plus")}<span>Entity</span></button>
        <button id="duplicate" class="btn btn-sm">${iconHtml("copy")}<span>Duplicate</span></button>
        <button id="delete" class="btn btn-sm btn-danger-hover">${iconHtml("trash")}<span>Delete</span></button>
      </div>
      <div id="tree" class="tree" role="tree"></div>
    </div>
    <div class="panel-header panel-header-secondary"><h2>Problems</h2><button id="check" class="btn btn-sm btn-ghost" title="Look through the scene for authoring mistakes">Check</button></div>
    <div class="panel-body panel-body-secondary"><ul id="problems" class="problems" aria-label="Problems"><li class="hint">No problems found.</li></ul></div>
    <div class="panel-header panel-header-secondary"><h2>Runtime</h2></div>
    <div class="panel-body panel-body-secondary">
      <p id="runtime" class="status-line">Loading C++ WebAssembly…</p>
      <p class="hint">Editor: BTAI authoring<br>Preview: Three.js<br>Simulation: C++ World / FixedSystems</p>
    </div>
  </aside>
  <div class="resizer resizer-v" id="resize-left" role="separator" aria-orientation="vertical" aria-label="Resize hierarchy panel"></div>
  <section class="panel panel-viewport" id="panel-viewport">
    <div class="viewport-toolbar">
      <div class="btn-group" role="group" aria-label="Transform tool">
        <button id="translate" class="btn btn-sm" aria-pressed="true">${iconHtml("target")}<span>Move</span></button>
        <button id="rotate" class="btn btn-sm" aria-pressed="false"><span>Rotate</span></button>
        <button id="scale" class="btn btn-sm" aria-pressed="false"><span>Scale</span></button>
      </div>
      <select id="space" class="select-sm" aria-label="Transform space"><option value="world">World</option><option value="local">Local</option></select>
      <label class="snap-toggle"><input type="checkbox" id="snap"> Snap</label>
      <select id="snap-size" class="select-sm" aria-label="Move snap distance"><option value="0.25">0.25 m</option><option value="0.5">0.5 m</option><option value="1" selected>1 m</option></select>
      <button id="frame" class="btn btn-sm btn-ghost">${iconHtml("target")}<span>Frame selected</span></button>
      <button id="grid" class="btn btn-sm btn-ghost">${iconHtml("grid")}<span>Grid</span></button>
      <button id="stats" class="btn btn-sm btn-ghost" aria-pressed="false">${iconHtml("target")}<span>Stats</span></button>
      <select id="site-view" class="select-sm" aria-label="Show site" hidden></select>
      <span id="sculpt-bar" class="sculpt-bar" hidden>
        <select id="sculpt" class="select-sm" aria-label="Terrain sculpt tool">
          <option value="off">Sculpt: off</option><option value="raise">Raise</option><option value="lower">Lower</option><option value="smooth">Smooth</option><option value="flatten">Flatten</option>
        </select>
        <label class="sculpt-slider">Radius <input id="sculpt-radius" type="range" min="1" max="30" step="0.5" value="6" aria-label="Brush radius"></label>
        <label class="sculpt-slider">Strength <input id="sculpt-strength" type="range" min="0.05" max="2" step="0.05" value="0.5" aria-label="Brush strength"></label>
      </span>
      <span class="viewport-hint">Drag to orbit · right-drag to pan · scroll to zoom</span>
    </div>
    <div id="viewport"></div>
  </section>
  <div class="resizer resizer-v" id="resize-right" role="separator" aria-orientation="vertical" aria-label="Resize inspector panel"></div>
  <aside id="panel-inspector" class="panel">
    <div class="panel-header">${iconHtml("target")}<h2>Inspector</h2></div>
    <div id="inspector" class="panel-body">Select an entity.</div>
  </aside>
</main>
<div class="resizer resizer-h" id="resize-bottom" role="separator" aria-orientation="horizontal" aria-label="Resize bottom panel"></div>
<section class="dock" id="dock">
  <div class="dock-panel" id="dock-project">
    <div class="panel-header"><h2>Project / Content</h2></div>
    <div class="panel-body">
      <label class="field-row"><span>Project</span><input id="project" value="Untitled project" aria-label="Project name"></label>
      <div class="field-row">
        <select id="catalog-category" aria-label="Model category">
          ${catalogCategories.map((c) => `<option value="${c}">${c.charAt(0).toUpperCase()}${c.slice(1)}</option>`).join("")}
        </select>
        <select id="catalog-model" aria-label="Model"></select>
      </div>
      <button id="catalog-add" class="btn btn-sm">${iconHtml("cube")}<span>Add from catalog</span></button>
      <p class="hint">${modelCount} bundled CC0 models · Aether kit + Quaternius</p>
      <a class="link-external" href="./ASSET-CREDITS.txt">Asset credits</a>
      <label class="btn btn-sm" id="import-label">${iconHtml("open")}<span>Import asset…</span>
        <input id="import-asset" type="file" multiple hidden aria-label="Import asset"
          accept=".glb,.png,.jpg,.jpeg,.webp,.gif,.ogg,.mp3,.wav,.m4a">
      </label>
      <p class="hint" id="import-hint">.glb models, images and audio · kept in this browser</p>
      <div class="field-row">
        <select id="prefab-select" aria-label="Prefab"></select>
      </div>
      <button id="prefab-place" class="btn btn-sm">${iconHtml("copy")}<span>Place instance</span></button>
      <p class="hint" id="prefab-hint">No prefabs yet — select an entity and use "Make prefab…" in the Inspector.</p>
    </div>
  </div>
  <div class="resizer resizer-v" id="resize-dock" role="separator" aria-orientation="vertical" aria-label="Resize console panel"></div>
  <div class="dock-panel" id="dock-console">
    <div class="panel-header"><h2>Authoring Console</h2></div>
    <div class="panel-body">
      <form id="command" class="command-row"><input id="json" aria-label="JSON command" placeholder='{"command":"list_entities"}'><button class="btn btn-sm">Execute</button></form>
      <pre id="log" role="log"></pre>
    </div>
  </div>
</section>
<footer id="status" data-mode="edit">Starting editor…</footer>`;
}
