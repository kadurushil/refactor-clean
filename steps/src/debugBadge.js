import { getCacheStats } from "./db.js";
import { appState } from "./state.js";
import { changelogBtn } from "./dom.js";
import { debugFlags, setDebugFlag } from "./debug.js";

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

let appVersion = "3.4.0"; // Default static fallback version

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

// Injects the markup for the badge and the popover.
export function initDebugBadge() {
  // Create a container element
  const container = document.createElement("div");
  container.id = "debug-badge-root";
  container.className = "contents";

  container.innerHTML = `
    <!-- Floating Version & Debug Badge -->
    <div id="debug-version-badge" 
         class="fixed bottom-[86px] right-4 z-[51] bg-white/70 dark:bg-gray-800/70 backdrop-blur-md border border-gray-200 dark:border-gray-700 rounded-full px-3 py-1.5 shadow-lg flex items-center gap-2 text-xs font-mono select-none cursor-pointer transition-all hover:scale-105 active:scale-95 hover:bg-white dark:hover:bg-gray-800 group"
         title="Click to view version info & cache statistics">
      <span class="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></span>
      <span id="badge-version-text" class="font-bold text-gray-700 dark:text-gray-300">v3.4.0</span>
    </div>

    <!-- Version & Debug Popover Card -->
    <div id="debug-version-popover" 
         class="hidden fixed bottom-[136px] right-4 z-[52] w-80 bg-white/95 dark:bg-gray-900/95 backdrop-blur-md border border-gray-200 dark:border-gray-800 rounded-xl shadow-2xl p-4 font-sans text-xs transition-all duration-200 select-none">
      <div class="flex items-center justify-between border-b dark:border-gray-800 pb-2 mb-3">
        <span class="font-bold text-sm text-gray-900 dark:text-white">ARAS Visualizer</span>
        <button id="popover-changelog-btn" class="text-blue-600 dark:text-blue-400 hover:underline font-medium focus:outline-none">Changelog</button>
      </div>
      <div class="space-y-2 text-gray-600 dark:text-gray-400 font-mono">
        <div class="flex justify-between">
          <span class="text-gray-400">Version:</span> 
          <span id="popover-version-text" class="text-gray-800 dark:text-gray-200 font-bold">3.4.0</span>
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
            <span id="popover-cache-stats" class="text-gray-800 dark:text-gray-200 font-semibold">Checking...</span>
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

  const badge = document.getElementById("debug-version-badge");
  const popover = document.getElementById("debug-version-popover");
  const popoverChangelogBtn = document.getElementById("popover-changelog-btn");

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

  // Click on badge to toggle popover
  badge.addEventListener("click", (e) => {
    e.stopPropagation();
    const isHidden = popover.classList.contains("hidden");
    if (isHidden) {
      // Update data immediately before showing
      updateDebugBadge();
      popover.classList.remove("hidden");
    } else {
      popover.classList.add("hidden");
    }
  });

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
}
