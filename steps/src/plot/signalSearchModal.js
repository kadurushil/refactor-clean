// File: steps/src/plot/signalSearchModal.js
/**
 * Foxglove-Style Searchable Signal Palette
 *
 * Provides a categorized, searchable modal with real-time fuzzy filtering,
 * live current-frame telemetry value previews, single-click additions,
 * multi-select batch additions, and custom signal/reference line input.
 */

import { extractPathValues, getFriendlyLabel } from "./pathEvaluator.js";
import { appState } from "../state.js";

/**
 * Standard signal catalog grouped by functional automotive categories
 */
const SIGNAL_CATALOG = [
  {
    category: "🚗 Vehicle & CAN Telemetry",
    id: "vehicle",
    signals: [
      { path: "canVehSpeed_kmph", label: "CAN Speed", unit: "km/h" },
      { path: "shaftTorque_Nm", label: "Shaft Torque", unit: "Nm" },
      { path: "engagedGear", label: "Engaged Gear", unit: "" },
      { path: "vehicleData.shaftTorqueNm", label: "Shaft Torque (v2)", unit: "Nm" },
      { path: "vehicleData.engagedGear", label: "Engaged Gear (v2)", unit: "" },
    ],
  },
  {
    category: "🧭 Ego Dynamics & Motion",
    id: "ego",
    signals: [
      { path: "egoVelocity[1].@mps2kmph", label: "Ego Speed Vy", unit: "km/h" },
      { path: "egoVelocity[0]", label: "Ego Lateral Speed Vx", unit: "m/s" },
      { path: "correctedEgoSpeed_mps.@mps2kmph", label: "Corrected Ego Speed", unit: "km/h" },
      { path: "estimatedAcceleration_mps2", label: "Estimated Accel", unit: "m/s²" },
      { path: "iirFilteredVx_ransac", label: "Filtered Vx (RANSAC)", unit: "m/s" },
      { path: "iirFilteredVy_ransac", label: "Filtered Vy (RANSAC)", unit: "m/s" },
      { path: "egoState.speedKmph", label: "Ego Speed (v2)", unit: "km/h" },
      { path: "egoState.accelerationMps2", label: "Ego Accel (v2)", unit: "m/s²" },
      { path: "egoState.yawRate", label: "Yaw Rate (v2)", unit: "rad/s" },
    ],
  },
  {
    category: "⚠️ ADAS & Active Safety",
    id: "adas",
    signals: [
      { path: "adas[0].fcw_stage", label: "FCW Warning Stage", unit: "stage" },
      { path: "adas[0].ttc", label: "Forward Collision TTC", unit: "s" },
      { path: "adas[0].warning_distance", label: "Warning Distance", unit: "m" },
      { path: "adas[0].target_track_id", label: "Target Track ID", unit: "id" },
    ],
  },
  {
    category: "📡 Radar Point Cloud",
    id: "radar",
    signals: [
      { path: "pointCloud[:].snr", label: "Point Cloud SNR", unit: "dB" },
      { path: "pointCloud[:].velocity", label: "Doppler Radial Velocity", unit: "m/s" },
      { path: "pointCloud[:].x", label: "Detection Position X", unit: "m" },
      { path: "pointCloud[:].y", label: "Detection Position Y", unit: "m" },
      { path: "pointCloud[:].z", label: "Detection Position Z", unit: "m" },
    ],
  },
  {
    category: "🎯 Object Tracking",
    id: "tracks",
    signals: [
      { path: "tracks[:].speed", label: "Track Speed", unit: "m/s" },
      { path: "tracks[:].ttc", label: "Track Time To Collision", unit: "s" },
      { path: "tracks[:].tti", label: "Track Time To Intersect", unit: "s" },
      { path: "tracks[:].state", label: "Tracker Lifecycle State", unit: "code" },
    ],
  },
  {
    category: "📏 Reference Lines & Thresholds",
    id: "ref",
    signals: [
      { path: "30", label: "Ref: 30 km/h (School Zone)", unit: "km/h" },
      { path: "50", label: "Ref: 50 km/h (City Limit)", unit: "km/h" },
      { path: "80", label: "Ref: 80 km/h (Highway Limit)", unit: "km/h" },
      { path: "100", label: "Ref: 100 km/h (Expressway Limit)", unit: "km/h" },
      { path: "2.0", label: "Ref: 2.0s Critical TTC Threshold", unit: "s" },
    ],
  },
];

export class SignalSearchModal {
  /**
   * @param {HTMLElement} parentElement
   * @param {Function} onAddSignals - Callback receiving Array<string> of signal paths to add
   */
  constructor(parentElement, onAddSignals) {
    this.parent = parentElement || document.body;
    this.onAddSignals = onAddSignals;

    this.selectedPaths = new Set();
    this.isMultiSelectMode = false;
    this.searchQuery = "";

    this.#initDOM();
  }

  #initDOM() {
    this.backdrop = document.createElement("div");
    this.backdrop.className =
      "signal-search-modal-backdrop fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 hidden flex items-center justify-center p-3 select-none";

    this.modalBox = document.createElement("div");
    this.modalBox.className =
      "bg-slate-900 dark:bg-gray-900 border border-slate-700 dark:border-gray-700 rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col text-slate-200 text-xs overflow-hidden";

    // 1. Header
    const header = document.createElement("div");
    header.className =
      "flex items-center justify-between px-4 py-3 border-b border-slate-700/80 bg-slate-900/90";
    header.innerHTML = `
      <div>
        <h2 class="font-bold text-sm text-white flex items-center gap-2">
          <span>📊</span>
          <span>Add Signal to Plot</span>
        </h2>
        <p class="text-[11px] text-slate-400 mt-0.5">Search or multi-select telemetry signals and reference lines</p>
      </div>
      <button id="sig-modal-close-btn" class="text-slate-400 hover:text-white text-xl leading-none px-2 py-1 rounded hover:bg-slate-800 transition-colors">&times;</button>
    `;
    this.modalBox.appendChild(header);

    // 2. Search Bar & Controls Bar
    const searchBar = document.createElement("div");
    searchBar.className =
      "px-4 py-2.5 bg-slate-850 border-b border-slate-800 space-y-2 bg-slate-900/60";

    searchBar.innerHTML = `
      <div class="relative">
        <span class="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-slate-400">🔍</span>
        <input type="text" id="sig-search-input" placeholder="Search signals (e.g. speed, ego, adas, snr, ttc)..."
          class="w-full pl-9 pr-8 py-2 bg-slate-800 dark:bg-gray-800 border border-slate-700 dark:border-gray-600 rounded-lg text-xs text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono">
        <button id="sig-search-clear-btn" class="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-white hidden text-base">&times;</button>
      </div>

      <div class="flex items-center justify-between text-[11px] pt-1">
        <label class="flex items-center gap-2 cursor-pointer text-slate-300 hover:text-white">
          <input type="checkbox" id="sig-multi-mode-chk" class="rounded border-slate-600 text-blue-600 focus:ring-0">
          <span>Enable multi-select mode</span>
        </label>
        <button id="sig-add-selected-btn" class="bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:hover:bg-blue-600 text-white font-semibold px-3 py-1 rounded transition-colors flex items-center gap-1.5 shadow" disabled>
          <span>Add Selected</span>
          <span id="sig-selected-count-badge" class="bg-blue-800 px-1.5 py-0.2 rounded-full text-[10px]">0</span>
        </button>
      </div>
    `;
    this.modalBox.appendChild(searchBar);

    // 3. Scrollable Signals List
    this.listContainer = document.createElement("div");
    this.listContainer.className =
      "flex-1 overflow-y-auto px-4 py-3 space-y-4 max-h-[48vh] scrollbar-thin scrollbar-thumb-slate-700";
    this.modalBox.appendChild(this.listContainer);

    // 4. Custom Path & Reference Threshold Footer
    const footer = document.createElement("div");
    footer.className =
      "px-4 py-3 bg-slate-950/70 border-t border-slate-800 flex items-center justify-between gap-3 text-xs";
    footer.innerHTML = `
      <div class="flex-1 flex items-center gap-2">
        <span class="text-slate-400 font-semibold whitespace-nowrap">Custom Path / Ref:</span>
        <input type="text" id="sig-custom-input" placeholder="e.g. egoState.speedKmph or 60"
          class="flex-1 bg-slate-800 border border-slate-700 rounded px-2.5 py-1 text-xs text-white font-mono focus:outline-none focus:ring-1 focus:ring-blue-500">
        <button id="sig-custom-add-btn" class="bg-slate-800 hover:bg-blue-600 border border-slate-700 hover:border-blue-500 text-slate-200 hover:text-white px-3 py-1 rounded transition-colors whitespace-nowrap">
          + Add
        </button>
      </div>
    `;
    this.modalBox.appendChild(footer);

    this.backdrop.appendChild(this.modalBox);
    this.parent.appendChild(this.backdrop);

    // Bind event handlers
    this.#bindEvents();
  }

  #bindEvents() {
    // Close on backdrop click or close button
    this.backdrop.addEventListener("click", (e) => {
      if (e.target === this.backdrop) this.close();
    });

    const closeBtn = this.modalBox.querySelector("#sig-modal-close-btn");
    closeBtn.onclick = () => this.close();

    // Close on Esc key
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !this.backdrop.classList.contains("hidden")) {
        this.close();
      }
    });

    // Search input live filtering
    const searchInput = this.modalBox.querySelector("#sig-search-input");
    const clearBtn = this.modalBox.querySelector("#sig-search-clear-btn");

    searchInput.addEventListener("input", (e) => {
      this.searchQuery = e.target.value.trim().toLowerCase();
      if (this.searchQuery) {
        clearBtn.classList.remove("hidden");
      } else {
        clearBtn.classList.add("hidden");
      }
      this.renderCatalog();
    });

    clearBtn.onclick = () => {
      searchInput.value = "";
      this.searchQuery = "";
      clearBtn.classList.add("hidden");
      this.renderCatalog();
      searchInput.focus();
    };

    // Multi-select toggle
    const multiChk = this.modalBox.querySelector("#sig-multi-mode-chk");
    multiChk.onchange = (e) => {
      this.isMultiSelectMode = e.target.checked;
      this.renderCatalog();
    };

    // Add Selected button
    const addSelectedBtn = this.modalBox.querySelector("#sig-add-selected-btn");
    addSelectedBtn.onclick = () => {
      if (this.selectedPaths.size > 0) {
        const paths = Array.from(this.selectedPaths);
        this.onAddSignals(paths);
        this.close();
      }
    };

    // Custom path add
    const customInput = this.modalBox.querySelector("#sig-custom-input");
    const customBtn = this.modalBox.querySelector("#sig-custom-add-btn");

    const handleCustomAdd = () => {
      const val = customInput.value.trim();
      if (!val) return;
      this.onAddSignals([val]);
      customInput.value = "";
      this.close();
    };

    customBtn.onclick = handleCustomAdd;
    customInput.onkeydown = (e) => {
      if (e.key === "Enter") handleCustomAdd();
    };
  }

  /**
   * Opens the search palette and refreshes current telemetry values
   */
  open() {
    this.selectedPaths.clear();
    this.updateSelectedCountBadge();
    this.backdrop.classList.remove("hidden");

    const searchInput = this.modalBox.querySelector("#sig-search-input");
    if (searchInput) {
      searchInput.value = "";
      this.searchQuery = "";
      this.modalBox.querySelector("#sig-search-clear-btn").classList.add("hidden");
      setTimeout(() => searchInput.focus(), 60);
    }

    this.renderCatalog();
  }

  close() {
    this.backdrop.classList.add("hidden");
  }

  updateSelectedCountBadge() {
    const btn = this.modalBox.querySelector("#sig-add-selected-btn");
    const badge = this.modalBox.querySelector("#sig-selected-count-badge");
    const count = this.selectedPaths.size;
    badge.textContent = count;
    btn.disabled = count === 0;
  }

  /**
   * Inspects current frame to dynamically discover any additional ADAS or telemetry fields
   */
  #discoverDynamicSignals(currentFrame) {
    const extra = [];
    if (!currentFrame) return extra;

    // Discover ADAS fields from first ADAS object
    if (Array.isArray(currentFrame.adas) && currentFrame.adas.length > 0) {
      const adasObj = currentFrame.adas[0];
      Object.keys(adasObj).forEach((k) => {
        const path = `adas[0].${k}`;
        if (!SIGNAL_CATALOG.some((c) => c.signals.some((s) => s.path === path))) {
          extra.push({
            category: "⚠️ ADAS & Active Safety",
            signal: { path, label: `ADAS: ${k}`, unit: "" },
          });
        }
      });
    }

    return extra;
  }

  /**
   * Renders the signal catalog items matching the search query
   */
  renderCatalog() {
    this.listContainer.innerHTML = "";

    const currentFrame = appState.vizData?.radarFrames?.[appState.currentFrame] || null;
    let matchCount = 0;

    SIGNAL_CATALOG.forEach((group) => {
      // Filter signals in this group by search query
      const matchingSignals = group.signals.filter((s) => {
        if (!this.searchQuery) return true;
        const q = this.searchQuery;
        return (
          s.label.toLowerCase().includes(q) ||
          s.path.toLowerCase().includes(q) ||
          group.category.toLowerCase().includes(q)
        );
      });

      if (matchingSignals.length === 0) return;
      matchCount += matchingSignals.length;

      // Group Container
      const groupEl = document.createElement("div");
      groupEl.className = "space-y-1.5";

      // Group Title
      const titleEl = document.createElement("div");
      titleEl.className =
        "text-[11px] font-bold tracking-wider uppercase text-slate-400 dark:text-gray-400 flex items-center justify-between border-b border-slate-800 pb-1";
      titleEl.innerHTML = `<span>${group.category}</span><span class="text-[10px] text-slate-500 font-mono">${matchingSignals.length}</span>`;
      groupEl.appendChild(titleEl);

      // Signal Rows
      matchingSignals.forEach((sig) => {
        const row = document.createElement("div");
        row.className =
          "flex items-center justify-between gap-3 px-2.5 py-1.5 rounded-lg bg-slate-800/40 hover:bg-slate-800 border border-slate-700/40 hover:border-slate-600 transition-colors cursor-pointer group";

        // Read real-time value from current frame
        let valFormatted = "-";
        if (currentFrame && isNaN(Number(sig.path))) {
          const vals = extractPathValues(currentFrame, sig.path);
          if (vals.length > 0 && vals[0] != null) {
            const raw = vals[0];
            valFormatted =
              typeof raw === "number"
                ? Number.isInteger(raw)
                  ? raw
                  : raw.toFixed(2)
                : String(raw);
          }
        } else if (!isNaN(Number(sig.path))) {
          valFormatted = sig.path;
        }

        // Left side: Checkbox + Label + Path
        const leftWrap = document.createElement("div");
        leftWrap.className = "flex items-center gap-2.5 min-w-0 flex-1";

        const chk = document.createElement("input");
        chk.type = "checkbox";
        chk.className =
          "rounded border-slate-600 text-blue-600 focus:ring-0 cursor-pointer " +
          (this.isMultiSelectMode ? "inline-block" : "hidden");
        chk.checked = this.selectedPaths.has(sig.path);
        chk.onclick = (e) => e.stopPropagation();
        chk.onchange = (e) => {
          if (e.target.checked) this.selectedPaths.add(sig.path);
          else this.selectedPaths.delete(sig.path);
          this.updateSelectedCountBadge();
        };

        const textWrap = document.createElement("div");
        textWrap.className = "truncate";
        textWrap.innerHTML = `
          <div class="font-semibold text-slate-200 text-[11px] group-hover:text-white truncate">${sig.label}</div>
          <div class="font-mono text-[10px] text-slate-400 truncate">${sig.path}</div>
        `;

        leftWrap.appendChild(chk);
        leftWrap.appendChild(textWrap);
        row.appendChild(leftWrap);

        // Right side: Live Value Preview + Instant Add [+] Button
        const rightWrap = document.createElement("div");
        rightWrap.className = "flex items-center gap-2 flex-shrink-0";

        const valBadge = document.createElement("span");
        valBadge.className =
          "font-mono text-[11px] px-2 py-0.5 rounded bg-slate-900 border border-slate-700/60 text-cyan-300 font-medium min-w-[55px] text-right";
        valBadge.textContent = `${valFormatted} ${sig.unit}`.trim();
        valBadge.title = `Current value in Frame ${appState.currentFrame + 1}`;
        rightWrap.appendChild(valBadge);

        const addBtn = document.createElement("button");
        addBtn.className =
          "bg-blue-600/80 hover:bg-blue-500 text-white font-bold px-2 py-0.5 rounded text-xs transition-colors flex items-center justify-center";
        addBtn.textContent = "+";
        addBtn.title = "Add signal directly to plot";
        addBtn.onclick = (e) => {
          e.stopPropagation();
          this.onAddSignals([sig.path]);
          this.close();
        };
        rightWrap.appendChild(addBtn);

        row.appendChild(rightWrap);

        // Row click toggles checkbox in multi-select, or adds in single-select
        row.onclick = () => {
          if (this.isMultiSelectMode) {
            chk.checked = !chk.checked;
            chk.dispatchEvent(new Event("change"));
          } else {
            this.onAddSignals([sig.path]);
            this.close();
          }
        };

        groupEl.appendChild(row);
      });

      this.listContainer.appendChild(groupEl);
    });

    if (matchCount === 0) {
      const emptyDiv = document.createElement("div");
      emptyDiv.className = "text-center text-slate-400 py-8 italic";
      emptyDiv.innerHTML = `
        <p>No signals matching "${this.searchQuery}"</p>
        <p class="text-[11px] text-slate-500 mt-1">Try searching for "speed", "accel", "snr", or enter a custom path below.</p>
      `;
      this.listContainer.appendChild(emptyDiv);
    }
  }
}

