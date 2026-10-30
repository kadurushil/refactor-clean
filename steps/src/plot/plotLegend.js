// File: steps/src/plot/plotLegend.js
/**
 * Interactive Series Legend for Plot Panel
 * Replicated from Foxglove Studio (PlotLegend.tsx & PlotLegendRow.tsx).
 * Supports floating overlay, series toggling, color pills, live numeric value readouts,
 * series deletion, and collapsible layout.
 *
 * Isolated pointer/mouse/wheel layer: All interactions inside the legend box
 * are stopped from propagating to the canvas/chart underneath.
 */

export const DEFAULT_LINE_COLORS = [
  "#1b83ec", // Foxglove Blue
  "#05d27d", // Foxglove Green
  "#ea531f", // Foxglove Orange
  "#EDCC28", // Foxglove Yellow
  "#22b5ff", // Foxglove Cyan
  "#6E51EE", // Foxglove Purple
  "#B4CC00", // Foxglove Pale Green
  "#ff3535", // Red
  "#a855f7", // Purple
  "#ec4899", // Pink
];

export class PlotLegend {
  /**
   * @param {HTMLElement} parentContainer - Relative parent container
   * @param {Function} onSeriesChange - Callback when series state (visibility, color, removal) changes
   * @param {Function} onAddSeries - Callback when user clicks "+ Add"
   */
  constructor(parentContainer, onSeriesChange, onAddSeries) {
    this.parent = parentContainer;
    this.onSeriesChange = onSeriesChange;
    this.onAddSeries = onAddSeries;
    this.isCollapsed = false;

    // Cache map for in-place numeric value updates without recreating DOM
    this.valueSpans = new Map();
    this.lastRenderKey = null;

    this.domElement = document.createElement("div");
    this.domElement.className =
      "plot-legend absolute top-2 right-2 z-20 pointer-events-auto bg-slate-900/90 dark:bg-gray-900/90 backdrop-blur-md border border-slate-700/80 dark:border-gray-700/80 rounded-md p-2 text-xs text-white max-h-[75%] overflow-y-auto shadow-xl select-none min-w-[210px] max-w-[340px] transition-all";

    // Strictly prevent all mouse, pointer, and wheel events inside the legend from propagating to canvas
    const stopPropagationHandler = (e) => {
      e.stopPropagation();
    };
    [
      "pointerdown",
      "pointerup",
      "pointermove",
      "pointercancel",
      "mousedown",
      "mouseup",
      "mousemove",
      "click",
      "dblclick",
      "wheel",
      "contextmenu",
    ].forEach((evt) => {
      this.domElement.addEventListener(evt, stopPropagationHandler);
    });

    this.parent.appendChild(this.domElement);
  }

  /**
   * Re-renders the legend rows and updates live values.
   * Uses smart keying so that if series structure hasn't changed,
   * only the value text is updated in-place without touching DOM nodes.
   *
   * @param {Array<Object>} seriesList - Configured series array
   * @param {Object} currentValues - Map of seriesIndex -> current playback scalar
   * @param {Object} hoveredValues - Map of seriesIndex -> hovered scalar
   */
  render(seriesList = [], currentValues = {}, hoveredValues = {}) {
    const renderKey = `${this.isCollapsed}:${seriesList
      .map((s) => `${s.path}|${s.label}|${s.color}|${s.enabled !== false}`)
      .join(";")}`;

    // If structure is identical, only update numeric text in-place (prevents DOM thrashing)
    if (renderKey === this.lastRenderKey) {
      this.updateValues(currentValues, hoveredValues);
      return;
    }

    this.lastRenderKey = renderKey;
    this.valueSpans.clear();
    this.domElement.innerHTML = "";

    // Header container
    const header = document.createElement("div");
    header.className =
      "flex items-center justify-between gap-2 mb-1.5 pb-1 border-b border-slate-700/60 dark:border-gray-700/60 font-semibold text-[11px] tracking-wide text-slate-300";

    const titleWrap = document.createElement("div");
    titleWrap.className = "flex items-center gap-1.5 cursor-pointer hover:text-white transition-colors";
    titleWrap.title = "Click to collapse/expand legend";
    titleWrap.onclick = (e) => {
      e.stopPropagation();
      e.preventDefault();
      this.isCollapsed = !this.isCollapsed;
      this.lastRenderKey = null; // force re-render
      this.render(seriesList, currentValues, hoveredValues);
    };

    const chevron = document.createElement("span");
    chevron.className =
      "text-[10px] transition-transform inline-block " + (this.isCollapsed ? "-rotate-90" : "");
    chevron.innerHTML = "&#9660;";

    const titleText = document.createElement("span");
    titleText.textContent = `Series (${seriesList.length})`;

    titleWrap.appendChild(chevron);
    titleWrap.appendChild(titleText);
    header.appendChild(titleWrap);

    // Actions in header
    const actionsWrap = document.createElement("div");
    actionsWrap.className = "flex items-center gap-2";

    const addBtn = document.createElement("button");
    addBtn.className =
      "text-blue-400 hover:text-blue-300 font-bold px-1.5 py-0.5 rounded bg-blue-950/60 hover:bg-blue-900/80 border border-blue-700/50 transition-colors text-[10px]";
    addBtn.textContent = "+ Add";
    addBtn.title = "Add a new telemetry signal or reference line";
    addBtn.onclick = (e) => {
      e.stopPropagation();
      e.preventDefault();
      if (this.onAddSeries) this.onAddSeries();
    };

    actionsWrap.appendChild(addBtn);
    header.appendChild(actionsWrap);
    this.domElement.appendChild(header);

    // If collapsed, only show the header
    if (this.isCollapsed) {
      return;
    }

    if (!seriesList || seriesList.length === 0) {
      const emptyNote = document.createElement("div");
      emptyNote.className =
        "text-slate-400 dark:text-gray-400 italic text-[11px] py-1.5 text-center";
      emptyNote.textContent = "No series active. Click + Add or drag a signal.";
      this.domElement.appendChild(emptyNote);
      return;
    }

    // Series items list
    const listWrap = document.createElement("div");
    listWrap.className = "space-y-1";

    seriesList.forEach((s, idx) => {
      const row = document.createElement("div");
      row.className =
        "flex items-center gap-1.5 py-1 px-1 rounded hover:bg-slate-800/70 dark:hover:bg-gray-800/70 transition-colors group cursor-default";
      row.onclick = (e) => e.stopPropagation();

      // Visibility Checkbox
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = s.enabled !== false;
      checkbox.className =
        "rounded border-slate-600 text-blue-600 focus:ring-0 focus:ring-offset-0 cursor-pointer w-3.5 h-3.5 flex-shrink-0";
      checkbox.title = s.enabled !== false ? "Hide series" : "Show series";
      checkbox.onclick = (e) => e.stopPropagation();
      checkbox.onchange = (e) => {
        e.stopPropagation();
        s.enabled = e.target.checked;
        this.lastRenderKey = null; // force re-render for strikethrough styling
        this.onSeriesChange();
      };

      // Color pill / swatch
      const colorPill = document.createElement("span");
      colorPill.className =
        "w-2.5 h-2.5 rounded-full flex-shrink-0 cursor-pointer shadow-sm hover:scale-110 transition-transform";
      const assignedColor = s.color || DEFAULT_LINE_COLORS[idx % DEFAULT_LINE_COLORS.length];
      colorPill.style.backgroundColor = assignedColor;
      colorPill.title = "Click to cycle series color";
      colorPill.onclick = (e) => {
        e.stopPropagation();
        e.preventDefault();
        const currentIdx = DEFAULT_LINE_COLORS.indexOf(s.color);
        const nextColor = DEFAULT_LINE_COLORS[(currentIdx + 1) % DEFAULT_LINE_COLORS.length];
        s.color = nextColor;
        this.lastRenderKey = null; // force re-render for color
        this.onSeriesChange();
      };

      // Series label / path
      const label = document.createElement("span");
      label.className = `truncate flex-1 text-[11px] font-mono cursor-pointer select-none ${
        s.enabled === false ? "opacity-40 line-through text-slate-400" : "text-slate-200"
      }`;
      label.textContent = s.label || s.path;
      label.title = `Path: ${s.path}\nLabel: ${s.label || s.path}`;
      label.onclick = (e) => {
        e.stopPropagation();
        e.preventDefault();
        checkbox.checked = !checkbox.checked;
        s.enabled = checkbox.checked;
        this.lastRenderKey = null; // force re-render
        this.onSeriesChange();
      };

      // Numeric value display (prioritizes hover value if hovering, otherwise current playback value)
      const valDisplay = document.createElement("span");
      valDisplay.className =
        "font-mono text-[11px] text-right min-w-[50px] font-medium text-cyan-300 flex-shrink-0";
      this.valueSpans.set(idx, valDisplay);

      // Delete button
      const delBtn = document.createElement("button");
      delBtn.className =
        "text-slate-500 hover:text-red-400 opacity-60 hover:opacity-100 px-1 text-sm leading-none transition-opacity flex-shrink-0";
      delBtn.innerHTML = "&times;";
      delBtn.title = "Remove series";
      delBtn.onclick = (e) => {
        e.stopPropagation();
        e.preventDefault();
        seriesList.splice(idx, 1);
        this.lastRenderKey = null; // force re-render
        this.onSeriesChange();
      };

      row.appendChild(checkbox);
      row.appendChild(colorPill);
      row.appendChild(label);
      row.appendChild(valDisplay);
      row.appendChild(delBtn);
      listWrap.appendChild(row);
    });

    this.domElement.appendChild(listWrap);
    this.updateValues(currentValues, hoveredValues);
  }

  /**
   * High-performance in-place update for live scalar values.
   * Does NOT touch, recreate, or re-render DOM nodes.
   *
   * @param {Object} currentValues - Map of seriesIndex -> current playback scalar
   * @param {Object} hoveredValues - Map of seriesIndex -> hovered scalar
   */
  updateValues(currentValues = {}, hoveredValues = {}) {
    if (this.isCollapsed) return;

    this.valueSpans.forEach((valDisplay, idx) => {
      const rawVal =
        hoveredValues[idx] !== undefined ? hoveredValues[idx] : currentValues[idx];
      let formattedVal = "-";
      if (typeof rawVal === "number" && !isNaN(rawVal)) {
        formattedVal = Number.isInteger(rawVal) ? rawVal.toString() : rawVal.toFixed(2);
      } else if (rawVal !== undefined && rawVal !== null) {
        formattedVal = String(rawVal);
      }
      if (valDisplay.textContent !== formattedVal) {
        valDisplay.textContent = formattedVal;
      }
    });
  }

  destroy() {
    if (this.domElement && this.domElement.parentNode) {
      this.domElement.parentNode.removeChild(this.domElement);
    }
  }
}
