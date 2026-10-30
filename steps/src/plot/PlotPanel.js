// File: steps/src/plot/PlotPanel.js
/**
 * Master Plot Panel Component
 * Replicated from Foxglove Studio (Plot.tsx, ChartRenderer.ts, OffscreenCanvasRenderer.ts).
 *
 * Implements high-performance time-series, array index, and 2D scatter plotting
 * with Chart.js, zero-latency CSS playback tracking, interactive legend,
 * wheel zoom, keyboard modifiers, click-to-seek, and drag & drop signal support.
 */

import { PlotCoordinator } from "./plotCoordinator.js";
import { PlotBars } from "./plotBars.js";
import { PlotLegend } from "./plotLegend.js";
import { SignalSearchModal } from "./signalSearchModal.js";
import { extractPathValues, getFriendlyLabel } from "./pathEvaluator.js";
import { appState } from "../state.js";
import { updateFrame, pausePlayback, performFastVideoSeek, showSeekingBadge } from "../sync.js";
import { playPauseBtn } from "../dom.js";

export class PlotPanel {
  /**
   * @param {HTMLElement} containerElement - Parent container for the plot panel
   * @param {Object} [initialConfig={}] - Initial coordinator configuration
   */
  constructor(containerElement, initialConfig = {}) {
    this.container = containerElement;
    this.container.classList.add(
      "relative",
      "w-full",
      "h-full",
      "bg-slate-950",
      "text-white",
      "overflow-hidden",
      "flex",
      "flex-col",
      "select-none"
    );

    this.coordinator = new PlotCoordinator(initialConfig);
    this.zoomMode = "x"; // "x" (default) | "y" (V held) | "xy" (B held)
    this.isDragging = false;
    this.panState = null;
    this.videoDuration = 0;

    this.#initDOM();
    this.#initChart();
    this.#initInteractions();
  }

  // =========================================================================
  // DOM INITIALIZATION
  // =========================================================================

  #initDOM() {
    // 1. Sleek Top Toolbar
    this.toolbar = document.createElement("div");
    this.toolbar.className =
      "plot-toolbar flex items-center justify-between px-3 py-1 bg-slate-900/90 dark:bg-gray-800/90 border-b border-slate-800 dark:border-gray-700 text-xs text-slate-300 z-20 flex-shrink-0 gap-2";

    // Left section: Mode Selector & Axis Controls
    const leftControls = document.createElement("div");
    leftControls.className = "flex items-center gap-2 flex-wrap";

    const modeLabel = document.createElement("span");
    modeLabel.className = "text-[11px] font-semibold text-slate-400";
    modeLabel.textContent = "Mode:";
    leftControls.appendChild(modeLabel);

    this.modeSelect = document.createElement("select");
    this.modeSelect.className =
      "bg-slate-800 dark:bg-gray-700 border border-slate-700 dark:border-gray-600 rounded px-2 py-0.5 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer";
    this.modeSelect.innerHTML = `
      <option value="timestamp">Time-Series (Timestamp)</option>
      <option value="index">Array Spectrum (Index)</option>
      <option value="currentCustom">2D Scatter (X vs Y)</option>
    `;
    this.modeSelect.value = this.coordinator.config.xAxisMode;
    this.modeSelect.onchange = (e) => {
      this.coordinator.config.xAxisMode = e.target.value;
      if (e.target.value === "currentCustom") {
        this.xAxisInputWrap.classList.remove("hidden");
      } else {
        this.xAxisInputWrap.classList.add("hidden");
      }
      this.updateChart(true);
    };
    leftControls.appendChild(this.modeSelect);

    // X-Axis Path Input (Visible only for 2D Scatter Mode)
    this.xAxisInputWrap = document.createElement("div");
    this.xAxisInputWrap.className = "flex items-center gap-1.5 hidden";
    this.xAxisInputWrap.innerHTML = `
      <span class="text-[11px] text-slate-400">X Path:</span>
      <input type="text" placeholder="e.g. pointCloud[:].x" class="bg-slate-800 border border-slate-700 rounded px-1.5 py-0.5 text-xs w-36 text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono">
    `;
    const xAxisInput = this.xAxisInputWrap.querySelector("input");
    xAxisInput.value = this.coordinator.config.xAxisPath || "pointCloud[:].x";
    xAxisInput.onchange = (e) => {
      this.coordinator.config.xAxisPath = e.target.value.trim();
      this.updateChart(true);
    };
    leftControls.appendChild(this.xAxisInputWrap);

    this.toolbar.appendChild(leftControls);

    // Right section: Action Buttons
    const rightControls = document.createElement("div");
    rightControls.className = "flex items-center gap-2";

    // Zoom Mode Badge (indicates V or B key modifier)
    this.zoomBadge = document.createElement("span");
    this.zoomBadge.className =
      "px-1.5 py-0.5 rounded text-[10px] font-mono bg-slate-800 text-slate-400 border border-slate-700 hidden";
    this.zoomBadge.textContent = "Zoom: X";
    rightControls.appendChild(this.zoomBadge);

    // Reset View Button
    this.resetBtn = document.createElement("button");
    this.resetBtn.className =
      "bg-slate-800 hover:bg-slate-700 dark:bg-gray-700 dark:hover:bg-gray-600 text-slate-300 px-2 py-0.5 rounded text-xs border border-slate-700 transition-colors hidden";
    this.resetBtn.textContent = "Reset Zoom";
    this.resetBtn.title = "Reset zoom bounds (or Double-click canvas)";
    this.resetBtn.onclick = () => this.resetView();
    rightControls.appendChild(this.resetBtn);

    // Export CSV Button
    this.exportBtn = document.createElement("button");
    this.exportBtn.className =
      "bg-slate-800 hover:bg-slate-700 dark:bg-gray-700 dark:hover:bg-gray-600 text-slate-300 px-2 py-0.5 rounded text-xs border border-slate-700 transition-colors";
    this.exportBtn.innerHTML = "&#x1F4BE; CSV";
    this.exportBtn.title = "Export active plotted series to CSV";
    this.exportBtn.onclick = () => this.exportCSV();
    rightControls.appendChild(this.exportBtn);

    // + Add Signal Button
    this.addSignalBtn = document.createElement("button");
    this.addSignalBtn.className =
      "bg-blue-600 hover:bg-blue-500 text-white font-semibold px-2.5 py-0.5 rounded text-xs transition-colors flex items-center gap-1 shadow-sm";
    this.addSignalBtn.innerHTML = "<span>+</span><span>Add Signal</span>";
    this.addSignalBtn.title = "Search & add telemetry signals (Foxglove palette)";
    this.addSignalBtn.onclick = () => this.openSignalSearch();
    rightControls.appendChild(this.addSignalBtn);

    this.toolbar.appendChild(rightControls);
    this.container.appendChild(this.toolbar);

    // 2. Main Canvas Wrapper
    this.canvasWrapper = document.createElement("div");
    this.canvasWrapper.className =
      "plot-canvas-wrapper relative w-full flex-1 overflow-hidden cursor-grab bg-slate-950 dark:bg-gray-900";

    this.canvas = document.createElement("canvas");
    this.canvas.className = "w-full h-full block";
    this.canvasWrapper.appendChild(this.canvas);

    // 3. Playback & Hover Bar Overlay
    this.bars = new PlotBars(this.canvasWrapper);

    // 4. Interactive Floating Legend
    this.legend = new PlotLegend(
      this.canvasWrapper,
      () => this.updateChart(true),
      () => this.openSignalSearch()
    );

    // 5. Drag-and-Drop Visual Target Overlay
    this.dropOverlay = document.createElement("div");
    this.dropOverlay.className =
      "plot-drop-overlay absolute inset-0 bg-blue-600/20 border-2 border-dashed border-blue-400 backdrop-blur-[2px] z-30 hidden flex flex-col items-center justify-center pointer-events-none transition-all";
    this.dropOverlay.innerHTML = `
      <div class="bg-slate-900/90 border border-blue-500 rounded-lg p-3 text-center shadow-2xl flex flex-col items-center gap-1.5 animate-bounce">
        <span class="text-2xl">&#x1F4CA;</span>
        <span class="text-sm font-semibold text-blue-200" id="plot-drop-title">Drop signal to plot</span>
        <span class="text-[11px] text-slate-400">Adds time-series channel to the graph</span>
      </div>
    `;
    this.canvasWrapper.appendChild(this.dropOverlay);

    // 6. Signal Search & Multi-Select Modal
    this.searchModal = new SignalSearchModal(document.body, (paths) => {
      paths.forEach((p) => this.coordinator.addSeries(p));
      this.updateChart(true);
    });

    this.container.appendChild(this.canvasWrapper);
  }

  // =========================================================================
  // CHART.JS INITIALIZATION
  // =========================================================================

  #initChart() {
    const isDark = document.documentElement.classList.contains("dark") || true;
    const gridColor = isDark ? "#1e293b" : "#e2e8f0";
    const tickColor = isDark ? "#64748b" : "#94a3b8";

    const ctx = this.canvas.getContext("2d");
    this.chart = new Chart(ctx, {
      type: "scatter",
      data: { datasets: [] },
      options: {
        animation: false, // Mandatory for 60 FPS performance
        responsive: false, // Manual sizing via ResizeObserver prevents loops
        maintainAspectRatio: false,
        elements: {
          line: { tension: 0 }, // Sharp lines matching Foxglove
          point: { radius: 0, hoverRadius: 4 },
        },
        scales: {
          x: {
            type: "linear",
            grid: { color: gridColor },
            ticks: {
              color: tickColor,
              font: { family: "monospace", size: 10 },
            },
          },
          y: {
            type: "linear",
            grid: { color: gridColor },
            ticks: {
              color: tickColor,
              font: { family: "monospace", size: 10 },
            },
          },
        },
        plugins: {
          legend: { display: false },
          tooltip: { enabled: false }, // Fast custom tooltips via legend and hover bar
        },
      },
    });

    // ResizeObserver cleanly updates canvas buffer to match DOM element
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.canvasWrapper);
  }

  // =========================================================================
  // USER INTERACTIONS: ZOOM, KEYBOARD, SEEK, DRAG & DROP
  // =========================================================================

  #initInteractions() {
    // --- 1. Mouse Wheel Zoom ---
    this.canvasWrapper.addEventListener(
      "wheel",
      (e) => {
        // Allow natural scrolling within legend box if it overflows
        if (e.target.closest(".plot-legend")) return;

        e.preventDefault();
        e.stopPropagation(); // Stop window / timeline scrolling

        const factor = e.deltaY > 0 ? 1.15 : 0.85;
        this.#applyZoom(factor, e.clientX, e.clientY);
      },
      { passive: false }
    );

    // --- 2. Keyboard Modifiers (Hold V for Y-zoom, Hold B for XY-zoom) ---
    window.addEventListener("keydown", (e) => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
      if (e.key === "v" || e.key === "V") {
        this.zoomMode = "y";
        this.#updateZoomBadge();
      } else if (e.key === "b" || e.key === "B") {
        this.zoomMode = "xy";
        this.#updateZoomBadge();
      }
    });

    window.addEventListener("keyup", (e) => {
      if (e.key === "v" || e.key === "V" || e.key === "b" || e.key === "B") {
        this.zoomMode = "x";
        this.#updateZoomBadge();
      }
    });

    // --- 3. Pointer Down: Drag-to-Pan or Click-to-Seek ---
    this.canvasWrapper.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return; // Primary click only
      // Guard: Ignore clicks on floating overlays (legend, toolbar, etc.)
      if (e.target.closest(".plot-legend") || e.target.closest(".plot-toolbar")) {
        return;
      }
      if (!appState.vizData || !appState.vizData.radarFrames) return;

      const xScale = this.#getXScale();
      const yScale = this.#getYScale();
      if (!xScale || !yScale) return;

      this.isDragging = true;
      this.canvasWrapper.setPointerCapture(e.pointerId);

      this.panState = {
        startX: e.clientX,
        startY: e.clientY,
        hasMoved: false,
        xMin: xScale.min,
        xMax: xScale.max,
        yMin: yScale.min,
        yMax: yScale.max,
        pixelWidth: Math.max(1, xScale.right - xScale.left),
        pixelHeight: Math.max(1, yScale.bottom - yScale.top),
      };

      this.canvasWrapper.style.cursor = "grabbing";
    });

    // --- 4. Pointer Move: Drag Panning or Hover Bar Tracking ---
    this.canvasWrapper.addEventListener("pointermove", (e) => {
      if (!appState.vizData || !appState.vizData.radarFrames) return;

      // When cursor is over legend or toolbar, hide hover bar and do not pan
      if (e.target.closest(".plot-legend") || e.target.closest(".plot-toolbar")) {
        this.bars.hideHover();
        return;
      }

      if (this.isDragging && this.panState) {
        const deltaPixelX = e.clientX - this.panState.startX;
        const deltaPixelY = e.clientY - this.panState.startY;

        if (Math.abs(deltaPixelX) > 3 || Math.abs(deltaPixelY) > 3) {
          this.panState.hasMoved = true;
        }

        if (this.panState.hasMoved) {
          this.bars.hideHover();

          // Calculate time delta: dragging right moves view left (earlier time)
          const rangeX = this.panState.xMax - this.panState.xMin;
          const deltaDataX = (deltaPixelX / this.panState.pixelWidth) * rangeX;

          let newXMin = this.panState.xMin - deltaDataX;
          let newXMax = this.panState.xMax - deltaDataX;

          // Clamp to data bounds so viewport cannot pan into empty space
          const minLimit = 0;
          const maxLimit = Math.max(1, this.coordinator.rawBounds.xMax || 10);
          const currentSpan = rangeX;

          if (currentSpan >= (maxLimit - minLimit)) {
            newXMin = minLimit;
            newXMax = maxLimit;
          } else {
            if (newXMin < minLimit) {
              newXMin = minLimit;
              newXMax = minLimit + currentSpan;
            } else if (newXMax > maxLimit) {
              newXMax = maxLimit;
              newXMin = maxLimit - currentSpan;
            }
          }

          this.coordinator.viewBounds.xMin = newXMin;
          this.coordinator.viewBounds.xMax = newXMax;
          this.chart.options.scales.x.min = newXMin;
          this.chart.options.scales.x.max = newXMax;

          // Pan Y axis if in y or xy mode, or if Y bounds have been zoomed
          if (
            this.zoomMode === "y" ||
            this.zoomMode === "xy" ||
            this.coordinator.viewBounds.yMin != null
          ) {
            const rangeY = this.panState.yMax - this.panState.yMin;
            // Dragging down (positive deltaPixelY) moves view up
            const deltaDataY = (deltaPixelY / this.panState.pixelHeight) * rangeY;
            const newYMin = this.panState.yMin + deltaDataY;
            const newYMax = this.panState.yMax + deltaDataY;

            this.coordinator.viewBounds.yMin = newYMin;
            this.coordinator.viewBounds.yMax = newYMax;
            this.chart.options.scales.y.min = newYMin;
            this.chart.options.scales.y.max = newYMax;
          }

          this.resetBtn.classList.remove("hidden");
          this.chart.update("none");
          this.#syncPlaybackBar();
        }
      } else {
        // Normal hover tracking
        const rect = this.canvas.getBoundingClientRect();
        const pixelX = e.clientX - rect.left;
        const hoverSec = this.#pixelToXValue(pixelX);

        const scale = this.#getXScale();
        this.bars.updateHoverTime(hoverSec, scale);

        // Update legend with values at hover timestamp without DOM recreation
        const currentVals = this.coordinator.getCurrentValues(
          appState.vizData.radarFrames[appState.currentFrame]
        );
        const hoverVals = this.coordinator.getHoverValues(hoverSec);
        this.legend.updateValues(currentVals, hoverVals);
      }
    });

    // --- 5. Pointer Up: Finalize Pan or Execute Click-to-Seek ---
    this.canvasWrapper.addEventListener("pointerup", (e) => {
      this.canvasWrapper.style.cursor = "grab";

      if (this.isDragging) {
        this.isDragging = false;
        try {
          this.canvasWrapper.releasePointerCapture(e.pointerId);
        } catch (_) {}

        // If pointer moved, finalize pan by re-downsampling for the newly visible window
        if (this.panState && this.panState.hasMoved) {
          this.updateChart(true);
        } else if (this.panState && !this.panState.hasMoved) {
          // Stationary click: execute Click-to-Seek
          if (appState.isPlaying) {
            pausePlayback();
            appState.isPlaying = false;
            if (playPauseBtn) playPauseBtn.textContent = "Play";
          }
          this.#handlePointerSeek(e.clientX, true);
        }

        this.panState = null;
      }
    });

    this.canvasWrapper.addEventListener("pointercancel", () => {
      this.canvasWrapper.style.cursor = "grab";
      this.isDragging = false;
      this.panState = null;
    });

    // --- 6. Pointer Leave: Hide Hover Guides ---
    this.canvasWrapper.addEventListener("pointerleave", () => {
      if (this.isDragging) return;
      this.bars.hideHover();
      // Update legend with playback values only
      const currentVals = this.coordinator.getCurrentValues(
        appState.vizData?.radarFrames?.[appState.currentFrame]
      );
      this.legend.updateValues(currentVals, {});
    });

    // --- 7. Double-Click: Reset View Bounds ---
    this.canvasWrapper.addEventListener("dblclick", (e) => {
      if (e.target.closest(".plot-legend") || e.target.closest(".plot-toolbar")) return;
      this.resetView();
    });

    // --- 8. Drag and Drop Ingestion for Telemetry Signals ---
    this.canvasWrapper.addEventListener("dragenter", (e) => {
      e.preventDefault();
      this.dropOverlay.classList.remove("hidden");
    });

    this.canvasWrapper.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
      this.dropOverlay.classList.remove("hidden");
    });

    this.canvasWrapper.addEventListener("dragleave", (e) => {
      // Only hide if left the wrapper boundary
      if (!this.canvasWrapper.contains(e.relatedTarget)) {
        this.dropOverlay.classList.add("hidden");
      }
    });

    this.canvasWrapper.addEventListener("drop", (e) => {
      e.preventDefault();
      this.dropOverlay.classList.add("hidden");

      let paths = [];
      const jsonPaths = e.dataTransfer.getData("application/x-telemetry-paths");
      if (jsonPaths) {
        try {
          const parsed = JSON.parse(jsonPaths);
          if (Array.isArray(parsed)) paths = parsed;
        } catch (_) {}
      }

      if (paths.length === 0) {
        const textData =
          e.dataTransfer.getData("text/plain") ||
          e.dataTransfer.getData("application/x-telemetry-path");
        if (textData) {
          paths = textData.split(/[\r\n,]+/).map((s) => s.trim()).filter(Boolean);
        }
      }

      if (paths.length > 0) {
        paths.forEach((p) => this.coordinator.addSeries(p));
        this.updateChart(true);
      }
    });
  }

  #handlePointerSeek(clientX, forceSync = false) {
    if (this.coordinator.config.xAxisMode !== "timestamp") return;
    if (!appState.vizData || !appState.vizData.radarFrames) return;

    const rect = this.canvas.getBoundingClientRect();
    const clickX = clientX - rect.left;
    const targetSec = this.#pixelToXValue(clickX);
    const targetMs = targetSec * 1000;

    const frames = appState.vizData.radarFrames;
    const targetIndex = this.#findNearestFrameIndex(targetMs, frames);

    if (targetIndex != null) {
      updateFrame(targetIndex, forceSync);
      showSeekingBadge();

      const frameData = frames[targetIndex];
      if (frameData && typeof frameData.videoSyncedTime === "number") {
        performFastVideoSeek(frameData.videoSyncedTime);
      }
      this.update(appState);
    }
  }

  #syncPlaybackBar() {
    if (!appState || !appState.vizData || !appState.vizData.radarFrames) return;
    const frame = appState.vizData.radarFrames[appState.currentFrame];
    if (!frame) return;
    const currentSec = (frame.timestampMs != null ? frame.timestampMs : (frame.timestamp || 0)) / 1000.0;
    this.bars.updatePlaybackTime(currentSec, this.#getXScale());
  }

  #findNearestFrameIndex(targetMs, frames) {
    if (!frames || frames.length === 0) return null;
    let lo = 0;
    let hi = frames.length - 1;

    while (lo <= hi) {
      const mid = Math.floor((lo + hi) / 2);
      const t = frames[mid].timestampMs != null ? frames[mid].timestampMs : (frames[mid].timestamp || 0);
      if (t === targetMs) return mid;
      if (t < targetMs) lo = mid + 1;
      else hi = mid - 1;
    }

    const idxA = Math.max(0, lo - 1);
    const idxB = Math.min(frames.length - 1, lo);
    const tA = frames[idxA].timestampMs != null ? frames[idxA].timestampMs : (frames[idxA].timestamp || 0);
    const tB = frames[idxB].timestampMs != null ? frames[idxB].timestampMs : (frames[idxB].timestamp || 0);

    return Math.abs(tA - targetMs) <= Math.abs(tB - targetMs) ? idxA : idxB;
  }

  #pixelToXValue(pixelX) {
    const scale = this.#getXScale();
    if (!scale) return 0;
    const range = scale.right - scale.left;
    if (range <= 0) return 0;
    return scale.min + ((pixelX - scale.left) / range) * (scale.max - scale.min);
  }

  #pixelToYValue(pixelY) {
    const scale = this.#getYScale();
    if (!scale) return 0;
    const range = scale.bottom - scale.top;
    if (range <= 0) return 0;
    // Y pixel 0 is top, max pixel is bottom
    return scale.max - ((pixelY - scale.top) / range) * (scale.max - scale.min);
  }

  #getXScale() {
    if (!this.chart || !this.chart.scales.x) return null;
    const x = this.chart.scales.x;
    return { min: x.min, max: x.max, left: x.left, right: x.right };
  }

  #getYScale() {
    if (!this.chart || !this.chart.scales.y) return null;
    const y = this.chart.scales.y;
    return { min: y.min, max: y.max, top: y.top, bottom: y.bottom };
  }

  #applyZoom(factor, clientX, clientY) {
    const xScale = this.#getXScale();
    const yScale = this.#getYScale();
    if (!xScale || !yScale) return;

    const rect = this.canvas.getBoundingClientRect();
    const pivotX = this.#pixelToXValue(clientX - rect.left);
    const pivotY = this.#pixelToYValue(clientY - rect.top);

    // Zoom X axis
    if (this.zoomMode === "x" || this.zoomMode === "xy") {
      const newXMin = pivotX - (pivotX - xScale.min) * factor;
      const newXMax = pivotX + (xScale.max - pivotX) * factor;
      this.coordinator.viewBounds.xMin = newXMin;
      this.coordinator.viewBounds.xMax = newXMax;
      this.chart.options.scales.x.min = newXMin;
      this.chart.options.scales.x.max = newXMax;
    }

    // Zoom Y axis
    if (this.zoomMode === "y" || this.zoomMode === "xy") {
      const newYMin = pivotY - (pivotY - yScale.min) * factor;
      const newYMax = pivotY + (yScale.max - pivotY) * factor;
      this.coordinator.viewBounds.yMin = newYMin;
      this.coordinator.viewBounds.yMax = newYMax;
      this.chart.options.scales.y.min = newYMin;
      this.chart.options.scales.y.max = newYMax;
    }

    this.resetBtn.classList.remove("hidden");
    this.updateChart(true);
    this.#syncPlaybackBar();
  }

  #updateZoomBadge() {
    if (this.zoomMode === "x") {
      this.zoomBadge.classList.add("hidden");
    } else if (this.zoomMode === "y") {
      this.zoomBadge.textContent = "Zoom: Y (V held)";
      this.zoomBadge.classList.remove("hidden");
    } else if (this.zoomMode === "xy") {
      this.zoomBadge.textContent = "Zoom: XY (B held)";
      this.zoomBadge.classList.remove("hidden");
    }
  }

  // =========================================================================
  // PUBLIC CONTROL METHODS
  // =========================================================================

  /**
   * Loads full dataset history when a new JSON file finishes processing.
   */
  loadData(vizData, duration) {
    this.videoDuration = duration || 0;
    this.coordinator.loadFullHistory(vizData);
    this.resetView();
  }

  /**
   * Called on every animation loop tick by sync.js.
   * Updates vertical playback bar via CSS translate (0% chart re-render overhead).
   */
  update(appState) {
    if (!appState || !appState.vizData || !appState.vizData.radarFrames) return;

    const frame = appState.vizData.radarFrames[appState.currentFrame];
    if (!frame) return;

    const currentSec = (frame.timestampMs != null ? frame.timestampMs : (frame.timestamp || 0)) / 1000.0;

    // 1. Fast CSS-based playback bar position update
    this.bars.updatePlaybackTime(currentSec, this.#getXScale());

    // 2. Fast legend readouts update (DOM only, in-place text update)
    const currentVals = this.coordinator.getCurrentValues(frame);
    this.legend.updateValues(currentVals, {});

    // 3. If in non-timestamp mode, chart contents change per frame
    if (this.coordinator.config.xAxisMode !== "timestamp") {
      this.updateChart(false);
    }
  }

  /**
   * Re-evaluates datasets and refreshes Chart.js.
   */
  updateChart(forceRecalculate = false) {
    if (!this.chart) return;

    const currentFrameData = appState.vizData?.radarFrames?.[appState.currentFrame];
    const datasets = this.coordinator.getChartDatasets(
      currentFrameData,
      appState.currentFrame,
      this.canvas.width
    );

    this.chart.data.datasets = datasets;

    // Apply active view bounds to Chart scales
    if (this.coordinator.viewBounds.xMin != null) {
      this.chart.options.scales.x.min = this.coordinator.viewBounds.xMin;
      this.chart.options.scales.x.max = this.coordinator.viewBounds.xMax;
    } else {
      delete this.chart.options.scales.x.min;
      delete this.chart.options.scales.x.max;
    }

    if (this.coordinator.viewBounds.yMin != null) {
      this.chart.options.scales.y.min = this.coordinator.viewBounds.yMin;
      this.chart.options.scales.y.max = this.coordinator.viewBounds.yMax;
    } else {
      delete this.chart.options.scales.y.min;
      delete this.chart.options.scales.y.max;
    }

    this.chart.update("none"); // Update with zero animation delay

    // Keep legend rows synchronized when datasets change
    const currentVals = this.coordinator.getCurrentValues(currentFrameData);
    this.legend.render(this.coordinator.config.series, currentVals);

    // Keep playback marker synchronized to current frame position
    this.#syncPlaybackBar();
  }

  resetView() {
    this.coordinator.resetBounds();
    this.resetBtn.classList.add("hidden");
    this.updateChart(true);
    this.#syncPlaybackBar();
  }

  resize() {
    const rect = this.canvasWrapper.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    this.canvas.width = rect.width;
    this.canvas.height = rect.height;

    if (this.chart) {
      this.chart.resize();
      this.updateChart(true);
      this.#syncPlaybackBar();
    }
  }

  updateTheme(isDark) {
    if (!this.chart) return;
    const gridColor = isDark ? "#1e293b" : "#e2e8f0";
    const tickColor = isDark ? "#64748b" : "#94a3b8";

    this.chart.options.scales.x.grid.color = gridColor;
    this.chart.options.scales.x.ticks.color = tickColor;
    this.chart.options.scales.y.grid.color = gridColor;
    this.chart.options.scales.y.ticks.color = tickColor;

    this.chart.update("none");
  }

  /**
   * Exports all active series to CSV.
   */
  exportCSV() {
    if (!appState.vizData || !appState.vizData.radarFrames) {
      alert("No data loaded to export.");
      return;
    }

    const frames = appState.vizData.radarFrames;
    const activeSeries = this.coordinator.config.series.filter((s) => s.enabled !== false);

    if (activeSeries.length === 0) {
      alert("No active series to export.");
      return;
    }

    let csv = "time_sec," + activeSeries.map((s) => `"${s.label || s.path}"`).join(",") + "\n";

    for (let i = 0; i < frames.length; i++) {
      const frame = frames[i];
      const timeSec = ((frame.timestampMs != null ? frame.timestampMs : frame.timestamp) / 1000).toFixed(3);
      const row = [timeSec];

      for (const s of activeSeries) {
        if (!isNaN(Number(s.path))) {
          row.push(Number(s.path));
        } else {
          const vals = extractPathValues(frame, s.path);
          row.push(vals.length > 0 && vals[0] != null ? vals[0] : "");
        }
      }
      csv += row.join(",") + "\n";
    }

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `telemetry_plot_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // =========================================================================
  // SIGNAL SEARCH & DISCOVERY MODAL
  // =========================================================================

  openSignalSearch() {
    if (this.searchModal) {
      this.searchModal.open();
    }
  }

  destroy() {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }
    if (this.bars) {
      this.bars.destroy();
    }
    if (this.legend) {
      this.legend.destroy();
    }
    if (this.searchModal && this.searchModal.backdrop && this.searchModal.backdrop.parentNode) {
      this.searchModal.backdrop.parentNode.removeChild(this.searchModal.backdrop);
    }
    if (this.chart) {
      this.chart.destroy();
    }
    this.container.innerHTML = "";
  }
}

