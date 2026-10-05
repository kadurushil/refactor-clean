import { getCacheStats, purgeFullAppCache } from "./db.js";
import { appState } from "./state.js";
import { changelogBtn } from "./dom.js";
import { debugFlags, setDebugFlag } from "./debug.js";
import { APP_VERSION } from "./constants.js";
import { extractVersionInfo } from "./fileParsers.js";

// Helper to detect browser and OS information.
function getBrowserInfo() {
  const ua = navigator.userAgent;
  let browser = "Unknown";
  let os = "Unknown";

  if (ua.indexOf("Win") !== -1) os = "Windows";
  else if (ua.indexOf("Mac") !== -1) os = "macOS";
  else if (ua.indexOf("X11") !== -1) os = "UNIX";
  else if (ua.indexOf("Linux") !== -1) os = "Linux";

  if (ua.indexOf("Chrome") !== -1 && ua.indexOf("Chromium") === -1 && ua.indexOf("Edg") === -1) browser = "Chrome";
  else if (ua.indexOf("Safari") !== -1 && ua.indexOf("Chrome") === -1) browser = "Safari";
  else if (ua.indexOf("Firefox") !== -1) browser = "Firefox";
  else if (ua.indexOf("Edg") !== -1) browser = "Edge";
  else if (ua.indexOf("MSIE") !== -1 || !!document.documentMode) browser = "IE";

  return `${browser} (${os})`;
}

let appVersion = APP_VERSION; // Default static fallback version

// Helper to safely escape HTML attributes and text
function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Helper to format raw component version keys (e.g., "python_tracking_version" -> "Python Tracking")
function formatComponentLabel(key) {
  if (typeof key !== "string" || !key.trim()) return "Component";
  const known = {
    python_tracking_version: "Python Tracking",
    python_utils_version: "Python Utils",
    dss_version: "DSS",
    mss_version: "MSS",
    tracking_version: "Tracking Core",
  };
  if (known[key]) return known[key];

  return key
    .replace(/_version$/i, "")
    .split("_")
    .filter(Boolean)
    .map((word) => {
      if (["dss", "mss", "can", "imu", "radar", "adas", "roi", "poi"].includes(word.toLowerCase())) {
        return word.toUpperCase();
      }
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(" ") || key;
}

// Asynchronously queries the server to retrieve the compiled application version.
function fetchVersionInfo() {
  if (location.protocol.startsWith("http") && location.pathname.startsWith("/app")) {
    fetch("/api/version")
      .then((response) => {
        if (!response.ok) throw new Error("HTTP error " + response.status);
        return response.json();
      })
      .then((data) => {
        if (data && data.version) {
          appVersion = data.version;
          
          // Update DOM elements immediately with the correct version
          const badgeText = document.getElementById("badge-version-text");
          const popoverText = document.getElementById("popover-version-text");
          if (badgeText) badgeText.textContent = `v${appVersion}`;
          if (popoverText) popoverText.textContent = appVersion;
        }
      })
      .catch(() => {
        // Silently fall back to default version in static mode
      });
  }
}

// Injects the markup for the popover card and binds top bar debug toggle buttons.
export function initDebugBadge() {
  // Create a container element
  const container = document.createElement("div");
  container.id = "debug-badge-root";
  container.className = "contents";

  container.innerHTML = `
    <!-- Version & Debug Popover Card -->
    <div id="debug-version-popover" 
         class="hidden fixed top-16 right-4 z-50 w-80 bg-white/95 dark:bg-gray-900/95 backdrop-blur-md border border-gray-200 dark:border-gray-800 rounded-xl shadow-2xl p-4 font-sans text-xs select-none">
      <div id="popover-header" class="flex items-center justify-between border-b dark:border-gray-800 pb-2 mb-3 cursor-grab active:cursor-grabbing select-none" title="Drag to reposition">
        <div class="flex items-center gap-1.5">
          <svg class="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8h16M4 16h16" />
          </svg>
          <span class="font-bold text-sm text-gray-900 dark:text-white">ARAS Visualizer</span>
        </div>
        <div class="flex items-center gap-2">
          <button id="popover-changelog-btn" class="text-blue-600 dark:text-blue-400 hover:underline font-medium focus:outline-none">Changelog</button>
          <button id="popover-close-btn" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-sm font-bold leading-none px-1 py-0.5 rounded" title="Close debug card">&times;</button>
        </div>
      </div>
      <div class="space-y-2 text-gray-600 dark:text-gray-400 font-mono">
        <div class="flex justify-between items-center">
          <span class="text-gray-400">App Version:</span> 
          <span id="popover-version-text" class="text-gray-800 dark:text-gray-200 font-bold">${APP_VERSION}</span>
        </div>

        <!-- Build & Component Versions -->
        <div id="popover-components-section" class="bg-gray-50/80 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700/60 rounded-lg p-2.5 my-1.5">
          <div class="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1.5 pb-1 border-b border-gray-200/60 dark:border-gray-700/50">
            <span>Build Component</span>
            <span>Version</span>
          </div>
          <div id="popover-version-info-list" class="space-y-1 font-mono">
            <div class="text-[11px] text-gray-400 dark:text-gray-500 italic py-0.5 text-center">Load JSON to view build versions</div>
          </div>
        </div>

        <div class="border-t border-gray-100 dark:border-gray-800/50 my-1"></div>
        <div>
          <span class="text-gray-400 block mb-0.5">Source Folder:</span> 
          <span id="popover-folder-name" class="text-gray-800 dark:text-gray-200 break-all block truncate bg-gray-50 dark:bg-gray-800/50 p-1 rounded font-bold" title="Direct File">Direct File</span>
        </div>
        <div>
          <span class="text-gray-400 block mb-0.5">JSON Dataset:</span> 
          <span id="popover-json-file" class="text-gray-800 dark:text-gray-200 break-all block truncate bg-gray-50 dark:bg-gray-800/50 p-1 rounded" title="No JSON file loaded">None Loaded</span>
        </div>
        <div>
          <span class="text-gray-400 block mb-0.5">Video Resource:</span> 
          <span id="popover-video-file" class="text-gray-800 dark:text-gray-200 break-all block truncate bg-gray-50 dark:bg-gray-800/50 p-1 rounded" title="No Video file loaded">None Loaded</span>
        </div>
        <div class="border-t border-gray-100 dark:border-gray-800/50 my-1"></div>
        <div class="space-y-1 mt-2">
          <div class="flex items-center justify-between">
            <span class="text-gray-400">Cache Stats:</span>
            <div class="flex items-center gap-2">
              <span id="popover-cache-stats" class="text-gray-800 dark:text-gray-200 font-semibold">Checking...</span>
              <button id="popover-purge-cache-btn" class="text-[10px] bg-red-100 hover:bg-red-200 text-red-700 dark:bg-red-900/50 dark:hover:bg-red-800/80 dark:text-red-300 font-sans px-1.5 py-0.5 rounded transition-all font-bold" title="Purge cached binary files from IndexedDB and clear session storage keys">Purge</button>
            </div>
          </div>
          <div class="flex items-center justify-between">
            <span class="text-gray-400">Platform:</span>
            <span id="popover-browser-info" class="text-gray-800 dark:text-gray-200 truncate max-w-[170px]" title="">Detecting...</span>
          </div>
        </div>

        <!-- Console Logging Toggles Section -->
        <div class="border-t border-gray-200 dark:border-gray-800 pt-2.5 mt-2.5">
          <div class="flex items-center justify-between mb-2">
            <span class="font-bold text-gray-900 dark:text-white text-xs">Console Debug Log Toggles</span>
            <span class="text-[10px] text-gray-400 font-normal">Toggle log categories</span>
          </div>
          <div class="grid grid-cols-2 gap-1.5 text-[11px] font-sans">
            <label class="flex items-center gap-1.5 cursor-pointer hover:text-gray-900 dark:hover:text-white" title="Logs from file loader, tracker parser & video FPS">
              <input type="checkbox" id="dbg-toggle-fileLoading" class="rounded border-gray-300 dark:border-gray-700 text-blue-600 focus:ring-blue-500" ${debugFlags.fileLoading ? "checked" : ""}>
              <span>File Loader</span>
            </label>
            <label class="flex items-center gap-1.5 cursor-pointer hover:text-gray-900 dark:hover:text-white" title="Logs from IndexedDB database operations">
              <input type="checkbox" id="dbg-toggle-database" class="rounded border-gray-300 dark:border-gray-700 text-blue-600 focus:ring-blue-500" ${debugFlags.database ? "checked" : ""}>
              <span>Database</span>
            </label>
            <label class="flex items-center gap-1.5 cursor-pointer hover:text-gray-900 dark:hover:text-white" title="Logs from UI layout and panel position saves/loads">
              <input type="checkbox" id="dbg-toggle-ui" class="rounded border-gray-300 dark:border-gray-700 text-blue-600 focus:ring-blue-500" ${debugFlags.ui ? "checked" : ""}>
              <span>UI & Panels</span>
            </label>
            <label class="flex items-center gap-1.5 cursor-pointer hover:text-gray-900 dark:hover:text-white" title="Logs from Radar sketch canvas drawing & resize events">
              <input type="checkbox" id="dbg-toggle-drawing" class="rounded border-gray-300 dark:border-gray-700 text-blue-600 focus:ring-blue-500" ${debugFlags.drawing ? "checked" : ""}>
              <span>Radar Draw</span>
            </label>
            <label class="flex items-center gap-1.5 cursor-pointer hover:text-gray-900 dark:hover:text-white" title="Logs from Speed Graph density and normalization info">
              <input type="checkbox" id="dbg-toggle-speedGraph" class="rounded border-gray-300 dark:border-gray-700 text-blue-600 focus:ring-blue-500" ${debugFlags.speedGraph ? "checked" : ""}>
              <span>Speed Graph</span>
            </label>
            <label class="flex items-center gap-1.5 cursor-pointer hover:text-gray-900 dark:hover:text-white" title="Logs from Video & Radar timestamp synchronization">
              <input type="checkbox" id="dbg-toggle-sync" class="rounded border-gray-300 dark:border-gray-700 text-blue-600 focus:ring-blue-500" ${debugFlags.sync ? "checked" : ""}>
              <span>Video Sync</span>
            </label>
            <label class="flex items-center gap-1.5 cursor-pointer hover:text-gray-900 dark:hover:text-white col-span-2" title="Logs from startup initialization & cached session reloads">
              <input type="checkbox" id="dbg-toggle-session" class="rounded border-gray-300 dark:border-gray-700 text-blue-600 focus:ring-blue-500" ${debugFlags.session ? "checked" : ""}>
              <span>Startup & Session</span>
            </label>
          </div>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(container);

  const popover = document.getElementById("debug-version-popover");
  const popoverHeader = document.getElementById("popover-header");
  const popoverCloseBtn = document.getElementById("popover-close-btn");
  const popoverChangelogBtn = document.getElementById("popover-changelog-btn");
  const debugToggleBtn = document.getElementById("debug-toggle-btn");
  const startDebugToggleBtn = document.getElementById("start-debug-toggle-btn");

  // Make popover card free-floating & draggable via its header
  makeElementDraggable(popover, popoverHeader, "debug_popover");

  if (popoverCloseBtn) {
    popoverCloseBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      popover.classList.add("hidden");
    });
  }

  const purgeBtn = document.getElementById("popover-purge-cache-btn");
  if (purgeBtn) {
    purgeBtn.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      purgeBtn.disabled = true;
      purgeBtn.textContent = "Purging...";
      const newStats = await purgeFullAppCache();
      appState.versionInfo = null;
      const cacheEl = document.getElementById("popover-cache-stats");
      if (cacheEl) {
        cacheEl.textContent = `${newStats.count} files (${newStats.sizeStr})`;
      }
      purgeBtn.textContent = "Purged!";
      setTimeout(() => {
        purgeBtn.textContent = "Purge";
        purgeBtn.disabled = false;
      }, 1500);
      updateDebugBadge();
    });
  }

  // Populate browser info
  const browserInfo = getBrowserInfo();
  const browserEl = document.getElementById("popover-browser-info");
  if (browserEl) {
    browserEl.textContent = browserInfo;
    browserEl.title = navigator.userAgent;
  }

  // Bind Debug Toggle Checkboxes
  const toggleKeys = ["fileLoading", "database", "ui", "drawing", "speedGraph", "sync", "session"];
  toggleKeys.forEach((key) => {
    const cb = document.getElementById(`dbg-toggle-${key}`);
    if (cb) {
      cb.addEventListener("change", (e) => {
        setDebugFlag(key, e.target.checked);
      });
    }
  });

  // Toggle popover visibility when clicking top bar buttons
  const togglePopover = (e) => {
    e.stopPropagation();
    const isHidden = popover.classList.contains("hidden");
    if (isHidden) {
      updateDebugBadge();
      popover.classList.remove("hidden");
    } else {
      popover.classList.add("hidden");
    }
  };

  if (debugToggleBtn) debugToggleBtn.addEventListener("click", togglePopover);
  if (startDebugToggleBtn) startDebugToggleBtn.addEventListener("click", togglePopover);

  // Keep popover open if clicking inside it
  popover.addEventListener("click", (e) => {
    e.stopPropagation();
  });

  // Clicking outside popover closes it
  document.addEventListener("click", () => {
    popover.classList.add("hidden");
  });

  // Click changelog in popover
  if (popoverChangelogBtn && changelogBtn) {
    popoverChangelogBtn.addEventListener("click", (e) => {
      e.preventDefault();
      popover.classList.add("hidden");
      changelogBtn.click(); // Trigger the normal modal display trigger in ui.js
    });
  }

  // Fetch server version dynamically if available
  fetchVersionInfo();

  // Initial update
  updateDebugBadge();
}

// Helper to make popover card free floating and draggable with storage key
function makeElementDraggable(element, handleElement, storageKeyPrefix = "debug_popover") {
  if (!element || !handleElement) return;

  // Restore saved position if available
  const savedTop = localStorage.getItem(`${storageKeyPrefix}_top`);
  const savedLeft = localStorage.getItem(`${storageKeyPrefix}_left`);
  if (savedTop && savedLeft) {
    element.style.bottom = "auto";
    element.style.right = "auto";
    element.style.top = savedTop;
    element.style.left = savedLeft;
  }

  handleElement.addEventListener("mousedown", (e) => {
    if (e.target.tagName === "BUTTON" || e.target.closest("button")) return;

    // Capture element's current screen position at drag start
    const rect = element.getBoundingClientRect();
    const startMouseX = e.clientX;
    const startMouseY = e.clientY;
    const startElemLeft = rect.left;
    const startElemTop = rect.top;
    let hasMoved = false;

    const onMouseMove = (moveEvt) => {
      const dx = moveEvt.clientX - startMouseX;
      const dy = moveEvt.clientY - startMouseY;

      // Disable CSS transitions while dragging so top/left update instantaneously without lag
      if (!hasMoved) {
        hasMoved = true;
        element.style.transition = "none";
      }

      moveEvt.preventDefault();

      let newLeft = startElemLeft + dx;
      let newTop = startElemTop + dy;

      // Clamp within viewport
      const w = element.offsetWidth;
      const h = element.offsetHeight;
      newLeft = Math.max(10, Math.min(newLeft, window.innerWidth - w - 10));
      newTop = Math.max(10, Math.min(newTop, window.innerHeight - h - 10));

      element.style.bottom = "auto";
      element.style.right = "auto";
      element.style.top = `${newTop}px`;
      element.style.left = `${newLeft}px`;
    };

    const onMouseUp = () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);

      // Restore original CSS transition behavior
      element.style.transition = "";

      if (hasMoved) {
        // Save final position once on release
        localStorage.setItem(`${storageKeyPrefix}_top`, element.style.top);
        localStorage.setItem(`${storageKeyPrefix}_left`, element.style.left);
      }
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  });
}

// Updates the badge/popover contents with the current filenames and cache statistics.
export function updateDebugBadge(jsonName = null, videoName = null) {
  const folderEl = document.getElementById("popover-folder-name");
  const jsonEl = document.getElementById("popover-json-file");
  const videoEl = document.getElementById("popover-video-file");
  const cacheEl = document.getElementById("popover-cache-stats");

  if (!jsonEl || !videoEl || !cacheEl) return;

  const finalFolder = appState.sourceFolderName || localStorage.getItem("sourceFolderName") || "Direct File";
  if (folderEl) {
    folderEl.textContent = finalFolder;
    folderEl.title = finalFolder;
  }

  // Use passed parameters or fall back to state/storage values
  const finalJson = jsonName || appState.jsonFilename || localStorage.getItem("jsonFilename");
  const finalVideo = videoName || appState.videoFilename || localStorage.getItem("videoFilename");
  const relPath = appState.jsonRelativePath || localStorage.getItem("jsonRelativePath") || "";

  if (finalJson) {
    let subfolder = "";
    if (relPath && relPath.includes("/")) {
      const parts = relPath.split("/").filter(Boolean);
      // Remove root folder name if present at start
      if (finalFolder && parts[0] === finalFolder) {
        parts.shift();
      }
      if (parts.length > 1) {
        subfolder = parts.slice(0, -1).join("/");
      }
    }
    const labelTag = subfolder ? ` (${subfolder})` : (relPath ? " (Root)" : "");
    jsonEl.textContent = `${finalJson}${labelTag}`;
    jsonEl.title = relPath ? `Full Path: ${relPath}` : finalJson;
  } else {
    jsonEl.textContent = "None Loaded";
    jsonEl.title = "No JSON file loaded";
  }

  if (finalVideo) {
    videoEl.textContent = finalVideo;
    videoEl.title = finalVideo;
  } else {
    videoEl.textContent = "None Loaded";
    videoEl.title = "No Video file loaded";
  }

  // Query IndexedDB stats asynchronously
  getCacheStats().then((stats) => {
    if (stats.count > 0) {
      cacheEl.textContent = `${stats.count} files (${stats.sizeStr})`;
    } else {
      cacheEl.textContent = "Empty";
    }
  });

  // Update Build & Component Versions
  const versionInfoContainer = document.getElementById("popover-version-info-list");
  if (versionInfoContainer) {
    let vInfo = appState.versionInfo || extractVersionInfo(appState.vizData);
    if (!vInfo) {
      try {
        vInfo = JSON.parse(localStorage.getItem("versionInfo") || "null");
      } catch (e) {
        vInfo = null;
      }
    }
    if (!vInfo && appState.vizData) {
      vInfo = extractVersionInfo(appState.vizData);
    }

    if (vInfo && typeof vInfo === "object" && !Array.isArray(vInfo) && Object.keys(vInfo).length > 0) {
      versionInfoContainer.innerHTML = Object.entries(vInfo)
        .map(([rawKey, val]) => {
          const label = formatComponentLabel(rawKey);
          let displayVal = "N/A";
          if (val !== null && val !== undefined) {
            displayVal = typeof val === "object" ? JSON.stringify(val) : String(val).trim();
            if (!displayVal) displayVal = "N/A";
          }
          const safeKey = escapeHtml(rawKey);
          const safeLabel = escapeHtml(label);
          const safeVal = escapeHtml(displayVal);
          return `
            <div class="flex justify-between items-center text-[11px] py-0.5" title="${safeKey}: ${safeVal}">
              <span class="text-gray-600 dark:text-gray-400 font-sans font-medium truncate max-w-[170px]">${safeLabel}</span>
              <span class="font-bold text-blue-600 dark:text-blue-400 font-mono text-[11px] bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 px-1.5 py-0.5 rounded shadow-2xs">${safeVal}</span>
            </div>
          `;
        })
        .join("");
    } else {
      const isJsonLoaded = Boolean(finalJson && finalJson !== "None Loaded");
      versionInfoContainer.innerHTML = `
        <div class="text-[11px] text-gray-400 dark:text-gray-500 italic py-0.5 text-center">
          ${isJsonLoaded ? "No version_info in dataset" : "Load JSON to view build versions"}
        </div>
      `;
    }
  }
}
