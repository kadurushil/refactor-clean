// File: steps/src/plot/plotCoordinator.js
/**
 * Master Data Coordinator for Plot Panel
 * Replicated from Foxglove Studio (PlotCoordinator.ts, TimestampDatasetsBuilder.ts, etc.).
 *
 * Coordinates data extraction, downsampling, series configuration,
 * reference lines, viewport scaling, and Chart.js dataset formatting.
 */

import { extractPathValues, getFriendlyLabel } from "./pathEvaluator.js";
import { downsamplePoints, downsampleScatter } from "./downsample.js";
import { DEFAULT_LINE_COLORS } from "./plotLegend.js";

export class PlotCoordinator {
  /**
   * @param {Object} initialConfig
   */
  constructor(initialConfig = {}) {
    this.config = {
      xAxisMode: "timestamp", // "timestamp" | "index" | "currentCustom"
      xAxisPath: "",
      followingViewWidth: null, // null for manual zoom, number in seconds for follow mode
      series: [
        {
          path: "canVehSpeed_kmph",
          label: "CAN Speed (km/h)",
          enabled: true,
          color: DEFAULT_LINE_COLORS[0],
          showLine: true,
          lineSize: 1.5,
          showPoints: false,
        },
        {
          path: "egoVelocity[1].@mps2kmph",
          label: "Ego Speed (km/h)",
          enabled: true,
          color: DEFAULT_LINE_COLORS[1],
          showLine: true,
          lineSize: 1.5,
          showPoints: false,
        },
      ],
      ...initialConfig,
    };

    // Cached raw historical data per series: seriesIndex -> Array<{x: number, y: number}>
    this.accumulatedData = new Map();

    // Data min/max limits
    this.rawBounds = { xMin: 0, xMax: 10, yMin: 0, yMax: 100 };

    // Active user interactive viewport bounds (null when auto-fitting)
    this.viewBounds = { xMin: null, xMax: null, yMin: null, yMax: null };

    // Cached radarFrames reference
    this.cachedFrames = null;
  }

  /**
   * Pre-extracts historical time-series datasets over all frames when a JSON file is loaded.
   *
   * @param {Object} vizData - Parsed JSON root containing radarFrames
   */
  loadFullHistory(vizData) {
    this.accumulatedData.clear();
    if (!vizData || !Array.isArray(vizData.radarFrames) || vizData.radarFrames.length === 0) {
      this.cachedFrames = null;
      return;
    }

    const frames = vizData.radarFrames;
    this.cachedFrames = frames;

    let overallXMin = Infinity;
    let overallXMax = -Infinity;
    let overallYMin = Infinity;
    let overallYMax = -Infinity;

    this.config.series.forEach((s, idx) => {
      // If reference line constant (e.g. path is "50" or "100"), skip timeline iteration
      if (!isNaN(Number(s.path))) {
        return;
      }

      const points = [];
      for (let i = 0; i < frames.length; i++) {
        const frame = frames[i];
        // Time in seconds relative to recording start / video sync
        const timeSec = (frame.timestampMs != null ? frame.timestampMs : (frame.timestamp || 0)) / 1000.0;

        const vals = extractPathValues(frame, s.path);
        if (vals.length > 0 && typeof vals[0] === "number" && !isNaN(vals[0])) {
          const y = vals[0];
          points.push({ x: timeSec, y });

          if (timeSec < overallXMin) overallXMin = timeSec;
          if (timeSec > overallXMax) overallXMax = timeSec;
          if (y < overallYMin) overallYMin = y;
          if (y > overallYMax) overallYMax = y;
        }
      }

      this.accumulatedData.set(idx, points);
    });

    if (overallXMin !== Infinity) {
      this.rawBounds.xMin = Math.max(0, overallXMin);
      this.rawBounds.xMax = overallXMax > overallXMin ? overallXMax : overallXMin + 1;
      this.rawBounds.yMin = overallYMin !== Infinity ? Math.floor(overallYMin) : 0;
      this.rawBounds.yMax = overallYMax !== -Infinity ? Math.ceil(overallYMax) : 100;
    }
  }

  /**
   * Generates datasets formatted for Chart.js.
   *
   * @param {Object} currentFrameData - Current radar frame
   * @param {number} currentFrameIdx - Current frame index
   * @param {number} viewportWidth - Canvas width in CSS pixels
   * @returns {Array<Object>} Chart.js datasets array
   */
  getChartDatasets(currentFrameData, currentFrameIdx, viewportWidth) {
    const datasets = [];
    const { xAxisMode, series } = this.config;

    const activeXMin = this.viewBounds.xMin != null ? this.viewBounds.xMin : this.rawBounds.xMin;
    const activeXMax = this.viewBounds.xMax != null ? this.viewBounds.xMax : this.rawBounds.xMax;

    series.forEach((s, idx) => {
      if (s.enabled === false) return;

      const seriesColor = s.color || DEFAULT_LINE_COLORS[idx % DEFAULT_LINE_COLORS.length];

      // --- Case A: Constant Reference Lines (e.g. path "50") ---
      if (!isNaN(Number(s.path))) {
        const refVal = Number(s.path);
        datasets.push({
          type: "line",
          label: s.label || `Ref: ${refVal}`,
          borderColor: seriesColor,
          backgroundColor: seriesColor,
          borderDash: [6, 4],
          borderWidth: s.lineSize || 1.5,
          pointRadius: 0,
          fill: false,
          tension: 0,
          data: [
            { x: activeXMin, y: refVal },
            { x: activeXMax, y: refVal },
          ],
        });
        return;
      }

      // --- Case B: Time-Series Mode ---
      let pts = [];
      if (xAxisMode === "timestamp") {
        const allPts = this.accumulatedData.get(idx) || [];
        // Apply Foxglove Min-Max-First-Last interval downsampling
        pts = downsamplePoints(allPts, viewportWidth, activeXMin, activeXMax);
      }
      // --- Case C: Index Mode (Array index vs element value for current frame) ---
      else if (xAxisMode === "index") {
        if (currentFrameData) {
          const vals = extractPathValues(currentFrameData, s.path);
          pts = vals
            .map((v, i) => ({ x: i, y: typeof v === "number" ? v : NaN }))
            .filter((p) => !isNaN(p.y));
        }
      }
      // --- Case D: Current Custom Mode (Parametric X vs Y for current frame) ---
      else if (xAxisMode === "currentCustom") {
        if (currentFrameData && this.config.xAxisPath) {
          const xVals = extractPathValues(currentFrameData, this.config.xAxisPath);
          const yVals = extractPathValues(currentFrameData, s.path);
          const len = Math.min(xVals.length, yVals.length);
          for (let i = 0; i < len; i++) {
            if (typeof xVals[i] === "number" && typeof yVals[i] === "number") {
              pts.push({ x: xVals[i], y: yVals[i] });
            }
          }
        }
      }

      const showPoints = s.showPoints || (pts.length < 150 && xAxisMode !== "timestamp");

      datasets.push({
        type: "scatter",
        label: s.label || s.path,
        data: pts,
        borderColor: seriesColor,
        backgroundColor: seriesColor,
        showLine: s.showLine !== false,
        borderWidth: s.lineSize || 1.5,
        pointRadius: showPoints ? (s.pointRadius || 2.5) : 0,
        pointHoverRadius: 4,
        tension: 0, // Sharp lines matching Foxglove
        fill: false,
      });
    });

    return datasets;
  }

  /**
   * Adds a new series and recalculates historical points if data is already loaded.
   *
   * @param {string} path - Telemetry path or constant string
   * @param {string} [customLabel] - Optional custom display label
   * @param {string} [color] - Optional custom hex color
   */
  addSeries(path, customLabel = null, color = null) {
    if (!path) return;
    const cleanPath = path.trim();
    const nextIdx = this.config.series.length;
    const assignedColor = color || DEFAULT_LINE_COLORS[nextIdx % DEFAULT_LINE_COLORS.length];
    const label = customLabel || getFriendlyLabel(cleanPath);

    this.config.series.push({
      path: cleanPath,
      label,
      enabled: true,
      color: assignedColor,
      showLine: true,
      lineSize: 1.5,
      showPoints: false,
    });

    // If frames are already loaded, extract historical data for the new series
    if (this.cachedFrames && !isNaN(Number(cleanPath)) === false) {
      const points = [];
      for (let i = 0; i < this.cachedFrames.length; i++) {
        const frame = this.cachedFrames[i];
        const timeSec = (frame.timestampMs != null ? frame.timestampMs : (frame.timestamp || 0)) / 1000.0;
        const vals = extractPathValues(frame, cleanPath);
        if (vals.length > 0 && typeof vals[0] === "number" && !isNaN(vals[0])) {
          points.push({ x: timeSec, y: vals[0] });
        }
      }
      this.accumulatedData.set(nextIdx, points);
    }
  }

  /**
   * Removes a series by index.
   */
  removeSeries(index) {
    if (index >= 0 && index < this.config.series.length) {
      this.config.series.splice(index, 1);
      // Re-key accumulated data map
      const newMap = new Map();
      this.config.series.forEach((s, idx) => {
        // Find matching series or re-extract
        if (this.cachedFrames) {
          const points = [];
          for (let i = 0; i < this.cachedFrames.length; i++) {
            const frame = this.cachedFrames[i];
            const timeSec = (frame.timestampMs != null ? frame.timestampMs : (frame.timestamp || 0)) / 1000.0;
            const vals = extractPathValues(frame, s.path);
            if (vals.length > 0 && typeof vals[0] === "number" && !isNaN(vals[0])) {
              points.push({ x: timeSec, y: vals[0] });
            }
          }
          newMap.set(idx, points);
        }
      });
      this.accumulatedData = newMap;
    }
  }

  /**
   * Extracts scalar values for each active series at a given frame.
   *
   * @param {Object} frame - Current frame object
   * @returns {Object} seriesIndex -> numeric value
   */
  getCurrentValues(frame) {
    const values = {};
    if (!frame) return values;

    this.config.series.forEach((s, idx) => {
      if (!isNaN(Number(s.path))) {
        values[idx] = Number(s.path);
        return;
      }
      const vals = extractPathValues(frame, s.path);
      if (vals.length > 0 && typeof vals[0] === "number") {
        values[idx] = vals[0];
      } else {
        values[idx] = undefined;
      }
    });

    return values;
  }

  /**
   * Finds the nearest values for all series at a hovered timestamp.
   *
   * @param {number} hoverSec - Timestamp in seconds
   * @returns {Object} seriesIndex -> nearest numeric value
   */
  getHoverValues(hoverSec) {
    const values = {};
    if (hoverSec == null || isNaN(hoverSec) || !this.cachedFrames) return values;

    // Binary search to find nearest frame to hoverSec
    const frames = this.cachedFrames;
    const targetMs = hoverSec * 1000;
    let lo = 0;
    let hi = frames.length - 1;

    while (lo <= hi) {
      const mid = Math.floor((lo + hi) / 2);
      const fTime = frames[mid].timestampMs != null ? frames[mid].timestampMs : (frames[mid].timestamp || 0);
      if (fTime === targetMs) {
        lo = mid;
        break;
      }
      if (fTime < targetMs) lo = mid + 1;
      else hi = mid - 1;
    }

    const nearestIdx = Math.max(0, Math.min(frames.length - 1, lo));
    return this.getCurrentValues(frames[nearestIdx]);
  }

  resetBounds() {
    this.viewBounds.xMin = null;
    this.viewBounds.xMax = null;
    this.viewBounds.yMin = null;
    this.viewBounds.yMax = null;
  }

  clear() {
    this.accumulatedData.clear();
    this.cachedFrames = null;
    this.resetBounds();
  }
}

