import { appState } from "./state.js";
import {
  datasetSelectModal,
  datasetModalCloseBtn,
  datasetAutoPairsContainer,
  datasetCustomJsonSelect,
  datasetCustomVideoSelect,
  datasetCustomLoadBtn,
  toggleCustomSelectBtn,
  customSelectDrawer,
  customDrawerIcon,
} from "./dom.js";

// Module-scoped AbortController for cleaning up custom load button listeners
let _customBtnAbort = null;

/**
 * Configurable JSON Priority Scoring Rules
 */
export const JSON_PRIORITY_RULES = [
  { pattern: /^track_history(_playback)?\.json$/i, score: 100 },
  { pattern: /^fHist_.*\.json$/i, score: 95 },
  { pattern: /simulations\/.*\.json$/i, score: 85 },
  { pattern: /^gTrack(_aligned)?\.json$/i, score: 75 },
  { pattern: /^radar_log\.json$/i, score: 60 },
  { pattern: /^radar_raw\.json$/i, score: 50 },
  { pattern: /^frame_mapping\.json$/i, score: 10 },
  { pattern: /^config\.json$/i, score: 10 },
  { pattern: /^settings\.json$/i, score: 10 },
];

/**
 * Calculates priority score for a JSON file based on naming conventions.
 */
export function getJsonPriorityScore(file) {
  const fileName = file.name;
  const relPath = file.relativePath || file.webkitRelativePath || fileName;

  if (/^track_history(_playback)?\.json$/i.test(fileName)) return 100;
  if (/^fHist_.*\.json$/i.test(fileName)) return 95;

  for (const rule of JSON_PRIORITY_RULES) {
    if (rule.pattern.test(fileName) || rule.pattern.test(relPath)) {
      return rule.score;
    }
  }
  return 70;
}

/**
 * Cross-Directory Video Matcher
 * Finds the best matching video file for a given JSON dataset.
 */
export function findBestVideoMatch(jFile, videoFiles) {
  if (!videoFiles || videoFiles.length === 0) return null;
  if (videoFiles.length === 1) return videoFiles[0]; // Single Video Rule

  const jPath = jFile.relativePath || jFile.name;
  const jDir = jPath.includes("/") ? jPath.substring(0, jPath.lastIndexOf("/")) : "";
  const jBase = jFile.name.replace(/\.[^/.]+$/, "");

  // 1. Same Directory Match
  const sameDirVideo = videoFiles.find((vFile) => {
    const vPath = vFile.relativePath || vFile.name;
    const vDir = vPath.includes("/") ? vPath.substring(0, vPath.lastIndexOf("/")) : "";
    return vDir === jDir;
  });
  if (sameDirVideo) return sameDirVideo;

  // 2. Base Name Substring Match
  const nameMatchVideo = videoFiles.find((vFile) => vFile.name.includes(jBase));
  if (nameMatchVideo) return nameMatchVideo;

  // 3. Parent / Root Directory Match (e.g. cam_*.mp4 in root folder)
  const rootVideo = videoFiles.find((vFile) => {
    const vPath = vFile.relativePath || vFile.name;
    return !vPath.includes("/");
  });
  if (rootVideo) return rootVideo;

  return videoFiles[0];
}

/**
 * Recursively flattens directory entries from Drag & Drop or file inputs.
 */
export async function extractAllFiles(filesInput) {
  const fileList = [];
  if (!filesInput) return fileList;

  // Drag & Drop DataTransferItemList with webkitGetAsEntry support
  if (filesInput[0] && typeof filesInput[0].webkitGetAsEntry === "function") {
    const entries = [];
    for (let i = 0; i < filesInput.length; i++) {
      const entry = filesInput[i].webkitGetAsEntry();
      if (entry) entries.push(entry);
    }
    for (const entry of entries) {
      await traverseEntry(entry, "", fileList);
    }
  } else {
    // Standard FileList or Array of File objects (e.g., from folder input)
    for (const file of Array.from(filesInput)) {
      if (!file.relativePath && file.webkitRelativePath) {
        file.relativePath = file.webkitRelativePath;
      }
      fileList.push(file);
    }
  }
  return fileList;
}

async function traverseEntry(entry, pathPrefix, fileList) {
  if (entry.isFile) {
    const file = await new Promise((resolve) => entry.file(resolve));
    const fullPath = pathPrefix ? `${pathPrefix}/${file.name}` : file.name;
    file.relativePath = fullPath;
    fileList.push(file);
  } else if (entry.isDirectory) {
    const dirReader = entry.createReader();
    const entries = await new Promise((resolve) => {
      dirReader.readEntries((results) => resolve(results || []));
    });
    const currentPath = pathPrefix ? `${pathPrefix}/${entry.name}` : entry.name;
    for (const childEntry of entries) {
      await traverseEntry(childEntry, currentPath, fileList);
    }
  }
}

/**
 * Manages Case C (Multiple Datasets / Folder Uploads) by auto-detecting pairs
 * and presenting the user with an interactive modal to pick the target dataset.
 */
export function triggerCaseCSelectionModal(
  jsonFiles,
  videoFiles,
  rootFolderName,
  fromCache,
  processFilePipelineCallback,
  allFiles = []
) {
  const autoPairs = [];

  // Check if frame_mapping.json exists anywhere in the scanned files
  const frameMapFile = (allFiles.length > 0 ? allFiles : jsonFiles).find(
    (f) => f.name.toLowerCase() === "frame_mapping.json"
  );
  if (frameMapFile) {
    appState.frameMapFile = frameMapFile;
  }

  // Filter out frame_mapping.json from visualization datasets list
  const vizJsonFiles = jsonFiles.filter(
    (f) => f.name.toLowerCase() !== "frame_mapping.json"
  );

  // Build candidate pairs for every visualization JSON dataset
  vizJsonFiles.forEach((jFile) => {
    const score = getJsonPriorityScore(jFile);
    const matchedVideo = findBestVideoMatch(jFile, videoFiles);
    const relPath = jFile.relativePath || jFile.name;
    const label = relPath.includes("/")
      ? relPath.substring(0, relPath.lastIndexOf("/"))
      : rootFolderName || jFile.name;

    autoPairs.push({
      score,
      label,
      jsonFile: jFile,
      videoFile: matchedVideo,
    });
  });

  // Sort pairs by JSON priority score (highest first)
  autoPairs.sort((a, b) => b.score - a.score);

  // Populate Auto-Pairs Cards
  datasetAutoPairsContainer.innerHTML = "";

  // Render Frame Mapping Info Banner if detected
  if (frameMapFile) {
    const banner = document.createElement("div");
    banner.className =
      "bg-green-50 dark:bg-green-950/40 p-2.5 rounded-lg border border-green-200 dark:border-green-800 flex items-center gap-2 text-xs text-green-700 dark:text-green-300 font-medium mb-3 shadow-sm";
    banner.innerHTML = `<span>ℹ️</span> <span>Detected <b>frame_mapping.json</b> — Per-frame radar & video alignment will be enabled automatically.</span>`;
    datasetAutoPairsContainer.appendChild(banner);
  }
  if (autoPairs.length > 0) {
    autoPairs.forEach((pair, idx) => {
      const isRecommended = idx === 0;
      const card = document.createElement("div");

      if (isRecommended) {
        card.className =
          "bg-blue-50/80 dark:bg-blue-950/40 p-4 rounded-xl border-2 border-blue-500 flex flex-col md:flex-row items-start md:items-center justify-between shadow-md gap-3 mb-2";
        card.innerHTML = `
          <div class="overflow-hidden">
            <div class="flex items-center gap-2 mb-1.5">
              <span class="bg-blue-600 text-white text-[10px] uppercase tracking-wider font-extrabold px-2 py-0.5 rounded-full shadow-sm flex items-center gap-1">
                <span>⭐</span> Primary Recommended Dataset
              </span>
              <span class="text-xs font-bold text-gray-800 dark:text-gray-200 truncate">📁 ${pair.label}</span>
            </div>
            <div class="text-xs font-mono text-gray-700 dark:text-gray-300 space-y-1">
              <div>JSON: <span class="font-bold text-blue-600 dark:text-blue-400">${pair.jsonFile ? pair.jsonFile.name : "None"}</span></div>
              ${pair.videoFile ? `<div>Video: <span class="font-bold text-green-600 dark:text-green-400">${pair.videoFile.name}</span></div>` : ""}
            </div>
          </div>
          <button class="w-full md:w-auto bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs px-5 py-2.5 rounded-lg shadow-md active:scale-95 transition-all flex-shrink-0">
            Load Recommended Pair
          </button>
        `;
      } else {
        card.className =
          "bg-white dark:bg-gray-800 p-3 rounded-lg border border-gray-200 dark:border-gray-700 flex items-center justify-between shadow-sm hover:border-gray-400 transition-colors";
        card.innerHTML = `
          <div class="overflow-hidden mr-3">
            <div class="font-bold text-xs text-gray-900 dark:text-white truncate">📁 ${pair.label}</div>
            <div class="text-[11px] font-mono text-gray-500 dark:text-gray-400 truncate">
              JSON: <span class="text-blue-600 dark:text-blue-400">${pair.jsonFile ? pair.jsonFile.name : "None"}</span>
              ${pair.videoFile ? ` | Video: <span class="text-green-600 dark:text-green-400">${pair.videoFile.name}</span>` : ""}
            </div>
          </div>
          <button class="bg-gray-700 hover:bg-gray-800 dark:bg-gray-700 dark:hover:bg-gray-600 text-white font-semibold text-xs px-3.5 py-1.5 rounded-lg active:scale-95 transition-all flex-shrink-0">
            Load Pair
          </button>
        `;
      }

      card.querySelector("button").addEventListener("click", () => {
        datasetSelectModal.classList.add("hidden");
        const finalFolder = pair.label.includes("/")
          ? pair.label.split("/")[0]
          : rootFolderName || "Direct File";
        appState.sourceFolderName = finalFolder;
        localStorage.setItem("sourceFolderName", finalFolder);
        processFilePipelineCallback(pair.jsonFile, pair.videoFile, fromCache);
      });
      datasetAutoPairsContainer.appendChild(card);
    });
  } else {
    datasetAutoPairsContainer.innerHTML = `<div class="text-xs text-gray-500 italic p-2">No automatic pairs found. Use custom selection below.</div>`;
  }

  // Handle Collapsible Custom Drawer Toggle
  if (toggleCustomSelectBtn && customSelectDrawer) {
    customSelectDrawer.classList.add("hidden");
    if (customDrawerIcon) customDrawerIcon.textContent = "▸";

    toggleCustomSelectBtn.onclick = () => {
      const isHidden = customSelectDrawer.classList.contains("hidden");
      if (isHidden) {
        customSelectDrawer.classList.remove("hidden");
        if (customDrawerIcon) customDrawerIcon.textContent = "▾";
      } else {
        customSelectDrawer.classList.add("hidden");
        if (customDrawerIcon) customDrawerIcon.textContent = "▸";
      }
    };
  }

  // Populate Custom Dropdowns
  datasetCustomJsonSelect.innerHTML = `<option value="">-- Select JSON File --</option>`;
  jsonFiles.forEach((jFile, i) => {
    const opt = document.createElement("option");
    opt.value = i;
    opt.textContent = jFile.relativePath || jFile.name;
    datasetCustomJsonSelect.appendChild(opt);
  });

  datasetCustomVideoSelect.innerHTML = `<option value="">-- None (JSON Only) --</option>`;
  videoFiles.forEach((vFile, i) => {
    const opt = document.createElement("option");
    opt.value = i;
    opt.textContent = vFile.relativePath || vFile.name;
    datasetCustomVideoSelect.appendChild(opt);
  });

  // Pre-select Top Recommended items in custom dropdowns for convenience
  if (autoPairs.length > 0) {
    const topPair = autoPairs[0];
    const topJsonIdx = jsonFiles.indexOf(topPair.jsonFile);
    if (topJsonIdx !== -1) datasetCustomJsonSelect.value = topJsonIdx;

    if (topPair.videoFile) {
      const topVidIdx = videoFiles.indexOf(topPair.videoFile);
      if (topVidIdx !== -1) datasetCustomVideoSelect.value = topVidIdx;
    }
  }

  // Custom Pair Load Button Handler — use AbortController to cleanly remove
  // previous listeners on repeated modal invocations (avoids stale DOM refs).
  if (_customBtnAbort) _customBtnAbort.abort();
  _customBtnAbort = new AbortController();

  datasetCustomLoadBtn.addEventListener("click", () => {
    const jIdx = datasetCustomJsonSelect.value;
    const vIdx = datasetCustomVideoSelect.value;
    const selectedJson = jIdx !== "" ? jsonFiles[parseInt(jIdx, 10)] : null;
    const selectedVideo = vIdx !== "" ? videoFiles[parseInt(vIdx, 10)] : null;

    if (!selectedJson && !selectedVideo) return;

    datasetSelectModal.classList.add("hidden");

    const selectedPath = selectedJson
      ? selectedJson.relativePath || selectedJson.name
      : selectedVideo.relativePath || selectedVideo.name;
    const finalFolder = selectedPath.includes("/")
      ? selectedPath.split("/")[0]
      : rootFolderName || "Direct File";
    appState.sourceFolderName = finalFolder;
    localStorage.setItem("sourceFolderName", finalFolder);

    processFilePipelineCallback(selectedJson, selectedVideo, fromCache);
  }, { signal: _customBtnAbort.signal });

  // Modal Close Handlers
  datasetModalCloseBtn.onclick = () => datasetSelectModal.classList.add("hidden");
  datasetSelectModal.onclick = (e) => {
    if (e.target === datasetSelectModal) datasetSelectModal.classList.add("hidden");
  };

  // Reveal Modal and scroll to top so recommended pair is always visible first
  datasetAutoPairsContainer.scrollTop = 0;
  datasetSelectModal.classList.remove("hidden");
}
