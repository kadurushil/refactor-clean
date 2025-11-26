// TODO(sync-refactor): move sync logic into src/sync.js
// ===========================================================================================================
// REFACTOR PLAN: This monolithic script will be broken down into
// the following modules in the '/src' directory:
//
// - constants.js:      Shared constants (VIDEO_FPS, RADAR_X_MAX)
// - utils.js:          Pure helper functions (findRadarFrameIndexForTime)
// - state.js:          Central application state management
// - dom.js:            DOM element references and UI updaters
// - modal.js:          Modal dialog logic
// - theme.js:          Dark/Light mode theme switcher
// - db.js:             IndexedDB caching logic
// - fileParsers.js:    JSON and CAN log parsing logic
// - p5/radarSketch.js: The main p5.js radar visualization
// - p5/speedGraph.js:  The p5.js speed graph visualization
// - sync.js:           Playback and synchronization loop
// - main.js:           The main application entry point that wires everything
// ===========================================================================================================

//import { showExplorer, hideExplorer, displayInGrid } from "./dataExplorer.js";
import { initializeDataExplorer } from "./dataExplorer.js"; 
import {
  showModal,
  hideModal,
} from "./modal.js"; 
import {
  initSyncUIHandlers,
  startPlayback,
  pausePlayback,
  stopPlayback,
  forceResyncWithOffset,
} from "./sync.js";
import { formatTime } from "./utils.js";
import { appState } from "./state.js";
import { debugFlags } from "./debug.js"; // Import the new debug flags
window.appState = appState; // exposing the appState to console
window.debugFlags = debugFlags; // Expose debug flags to the console for runtime toggling
import {
  canvasPlaceholder,
  videoPlayer,
  videoPlaceholder,
  loadJsonBtn,
  loadVideoBtn,
  jsonFileInput,
  videoFileInput,
  playPauseBtn,
  stopBtn,
  timelineSlider,
  offsetInput,
  speedSlider,
  speedDisplay,
  featureToggles,
  toggleSnrColor,
  toggleClusterColor,
  toggleInlierColor,
  toggleStationaryColor,
  toggleVelocity,
  toggleTracks,
  toggleEgoSpeed,
  toggleFrameNorm,
  toggleDebugOverlay,
  toggleDebug2Overlay,
  debugOverlay,
  snrMinInput,
  snrMaxInput,
  applySnrBtn,
  autoOffsetIndicator,
  clearCacheBtn,
  toggleCloseUp,
  updateDebugOverlay,
  timelineTooltip,
  saveSessionBtn,
  loadSessionBtn,
  sessionFileInput,
  togglePredictedPos,
  toggleCovariance,
  updatePersistentOverlays,
  collapsibleMenu,
  toggleMenuBtn,
  fullscreenBtn,
  closeMenuBtn,
  menuScrim,
  toggleConfirmedOnly,
  resetUIForNewLoad,
} from "./dom.js";

import { initializeTheme } from "./theme.js";

import { initDB, loadFreshFileFromDB } from "./db.js";
import { initKeyboardShortcuts } from "./keyboard.js";
import { handleFiles } from "./fileLoader.js";

// Wire up the manual file inputs to the new handler
jsonFileInput.addEventListener("change", (event) =>
  handleFiles(event.target.files)
);
videoFileInput.addEventListener("change", (event) =>
  handleFiles(event.target.files)
);

// Wire up the drag-and-drop functionality
const dropZone = document.querySelector("main");
dropZone.addEventListener("dragover", (event) => {
  event.preventDefault();
  dropZone.style.border = "2px dashed #3b82f6";
});
dropZone.addEventListener("dragleave", () => {
  dropZone.style.border = "none";
});
dropZone.addEventListener("drop", (event) => {
  event.preventDefault();
  dropZone.style.border = "none";
  handleFiles(event.dataTransfer.files);
});


// Event listener for loading JSON file.
loadJsonBtn.addEventListener("click", () => jsonFileInput.click());
loadVideoBtn.addEventListener("click", () => videoFileInput.click());

clearCacheBtn.addEventListener("click", async () => {
  const confirmed = await showModal("Clear all cached data and reload?", true);
  if (confirmed) {
    indexedDB.deleteDatabase("visualizerDB");
    localStorage.clear();
    window.location.reload();
  }
});
// Event listener for saving the session
saveSessionBtn.addEventListener("click", () => {
  // We can only save a session if at least one data file has been loaded.
  if (!appState.jsonFilename && !appState.videoFilename) {
    showModal("Nothing to save. Please load data files first.");
    return;
  }

  // Collect all relevant state into a single object.
  const sessionState = {
    version: 1,
    jsonFilename: appState.jsonFilename,
    videoFilename: appState.videoFilename,
    offset: offsetInput.value,
    playbackSpeed: speedSlider.value,
    snrMin: snrMinInput.value,
    snrMax: snrMaxInput.value,
    toggles: {
      snrColor: toggleSnrColor.checked,
      clusterColor: toggleClusterColor.checked,
      inlierColor: toggleInlierColor.checked,
      stationaryColor: toggleStationaryColor.checked,
      velocity: toggleVelocity.checked,
      tracks: toggleTracks.checked,
      egoSpeed: toggleEgoSpeed.checked,
      frameNorm: toggleFrameNorm.checked,
      debugOverlay: toggleDebugOverlay.checked,
      debug2Overlay: toggleDebug2Overlay.checked,
      closeUp: toggleCloseUp.checked,
      predictedPos: togglePredictedPos.checked,
      covariance: toggleCovariance.checked,
    },
  };

  const sessionString = JSON.stringify(sessionState, null, 2);
  const blob = new Blob([sessionString], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  // --- Dynamic Filename Logic ---
  const now = new Date();
  const pad = (num) => String(num).padStart(2, "0");
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(
    now.getDate()
  )}`;
  const time = `${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(
    now.getSeconds()
  )}`;
  const timestamp = `${date}_${time}`;
  const defaultFilename = `visualizer-session_${timestamp}.json`;

  // --- Trigger "Save As" Dialog ---
  const a = document.createElement("a");
  a.href = url;

  // This is the key instruction for the browser. It suggests a filename
  // and signals that this should open a "Save As" dialog.
  a.download = defaultFilename;

  document.body.appendChild(a);
  a.click(); // Programmatically clicking the link triggers the download/save dialog.

  document.body.removeChild(a);
  URL.revokeObjectURL(url);
});

//videoframecallback exported from sync.js

// When "Load Session" is clicked, it triggers the hidden file input.
loadSessionBtn.addEventListener("click", () => {
  sessionFileInput.click();
});

// This listener handles the selected session file.

sessionFileInput.addEventListener("change", (event) => {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (e) => {
    // Make the function async to use 'await'
    try {
      const sessionState = JSON.parse(e.target.result);

      // Basic validation to ensure it's a valid session file.
      if (sessionState.version !== 1 || !sessionState.jsonFilename) {
        showModal("Error: Invalid or corrupted session file.");
        return;
      }

      // --- START: New Robust Session Check ---

      // 1. Before doing anything else, check if the required files exist in the cache.
      // We use the same 'loadFreshFileFromDB' function that the startup process uses.
      const videoBlob = await loadFreshFileFromDB(
        "video",
        sessionState.videoFilename
      );
      const jsonBlob = await loadFreshFileFromDB(
        "json",
        sessionState.jsonFilename
      );

      // 2. If either file is missing from the cache, show an informative error and stop.
      if (!jsonBlob || !videoBlob) {
        showModal(`Session load failed: The required data files are not in the application's cache. 
                
                Please manually load '${sessionState.jsonFilename}' and '${sessionState.videoFilename}' before loading this session.`);

        event.target.value = ""; // Reset file input
        return;
      }

      // 3. If we get here, it means the files ARE in the cache and match the session!
      // It is now safe to set localStorage and reload the page.

      localStorage.setItem("jsonFilename", sessionState.jsonFilename || "");
      localStorage.setItem("videoFilename", sessionState.videoFilename || "");
      localStorage.setItem("visualizerOffset", sessionState.offset || "0");
      localStorage.setItem("playbackSpeed", sessionState.playbackSpeed || "1");
      localStorage.setItem("snrMin", sessionState.snrMin || "");
      localStorage.setItem("snrMax", sessionState.snrMax || "");
      if (sessionState.toggles) {
        localStorage.setItem(
          "togglesState",
          JSON.stringify(sessionState.toggles)
        );
      }

      // Inform the user and then reload the page to apply the session.
      showModal(
        "Session files found in cache. The application will now reload."
      ).then(() => {
        window.location.reload();
      });
      // --- END: New Robust Session Check ---
    } catch (error) {
      showModal("Error: Could not parse the session file. It may be invalid.");
      console.error("Session load error:", error);
    }
  };
  reader.readAsText(file);
  event.target.value = ""; // Clear the input for future loads.
});

// --- END: Add Session Management Logic ---

// --- Collapsible Menu Logic (Overlay Version) ---
function toggleMenu(show) {
  if (show) {
    collapsibleMenu.classList.remove("-translate-x-full");
    menuScrim.classList.remove("hidden"); // Show the scrim
    // The line that pushed the content has been REMOVED.
  } else {
    collapsibleMenu.classList.add("-translate-x-full");
    menuScrim.classList.add("hidden"); // Hide the scrim
  }
}

toggleConfirmedOnly.addEventListener("change", () => {
  if (appState.p5_instance) {
    appState.p5_instance.redraw();
  }
});

// Open the menu
toggleMenuBtn.addEventListener("click", () => toggleMenu(true));

// Close the menu with the 'X' button
closeMenuBtn.addEventListener("click", () => toggleMenu(false));

// NEW: Close the menu by clicking on the scrim
menuScrim.addEventListener("click", () => toggleMenu(false));

// --- Fullscreen Logic ---
fullscreenBtn.addEventListener("click", () => {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen();
  } else if (document.exitFullscreen) {
    document.exitFullscreen();
  }
});

// Event listener for offset input change.
offsetInput.addEventListener("input", () => {
  autoOffsetIndicator.classList.add("hidden");
  // The value is now saved to localStorage only when 'Enter' is pressed.
});

// Event listener for apply SNR button click.
applySnrBtn.addEventListener("click", () => {
  const newMin = parseFloat(snrMinInput.value),
    newMax = parseFloat(snrMaxInput.value);
  if (isNaN(newMin) || isNaN(newMax) || newMin >= newMax) {
    showModal("Invalid SNR range.");
    return;
  }
  appState.globalMinSnr = newMin;
  appState.globalMaxSnr = newMax;
  toggleFrameNorm.checked = false;
  if (appState.p5_instance) {
    appState.p5_instance.drawSnrLegendToBuffer(
      appState.globalMinSnr,
      appState.globalMaxSnr
    );
    appState.p5_instance.redraw();
  }
});

// Event listener for play/pause button click.
playPauseBtn.addEventListener("click", () => {
  if (!appState.vizData && !videoPlayer.src) return;

  appState.isPlaying = !appState.isPlaying;

  if (appState.isPlaying) {
    playPauseBtn.textContent = "Pause";
    startPlayback();
  } else {
    playPauseBtn.textContent = "Play";
    pausePlayback();
  }
});

// Event listener for stop button click.
stopBtn.addEventListener("click", () => {
  if (!appState.vizData && !videoPlayer.src) return;
  stopPlayback();
  appState.isPlaying = false;
  playPauseBtn.textContent = "Play";
  if (appState.speedGraphInstance) appState.speedGraphInstance.redraw();
});

// Event listener for timeline slider input.
// --- Timeline Scroll-to-Seek Logic ---

// In src/main.js, add this new block of event listeners
// --- Timeline Scrub-to-Seek Preview Logic ---

timelineSlider.addEventListener("mouseover", () => {
  if (appState.vizData) {
    timelineTooltip.classList.remove("hidden");
  }
});

timelineSlider.addEventListener("mouseout", () => {
  timelineTooltip.classList.add("hidden");
});

timelineSlider.addEventListener("mousemove", (event) => {
  if (!appState.vizData) return;

  // 1. Calculate the hover position as a fraction (0.0 to 1.0)
  const rect = timelineSlider.getBoundingClientRect();
  const hoverFraction = (event.clientX - rect.left) / rect.width;

  // 2. Calculate the corresponding frame index
  const sliderMax =
    parseInt(timelineSlider.max, 10) || appState.vizData.radarFrames.length - 1;
  let frameIndex = Math.round(hoverFraction * sliderMax);
  // The value is already clamped by this calculation, but an extra check is safe
  frameIndex = Math.max(0, Math.min(frameIndex, sliderMax));

  const frameData = appState.vizData.radarFrames[frameIndex];
  if (!frameData) return;

  // 3. Update the tooltip's content
  const formattedTime = formatTime(frameData.relativeTimeSec * 1000);
  timelineTooltip.innerHTML = `Frame: ${
    frameIndex + 1
  }<br>Time: ${formattedTime}`;

  // 4. Position the tooltip horizontally above the cursor
  // The horizontal position is the mouse's X relative to the slider's start
  const tooltipX = event.clientX - rect.left;
  timelineTooltip.style.left = `${tooltipX}px`;
});

// Event listener for speed slider input.
speedSlider.addEventListener("input", (event) => {
  const speed = parseFloat(event.target.value);
  videoPlayer.playbackRate = speed;
  speedDisplay.textContent = `${speed.toFixed(1)}x`;
});

const colorToggles = [
  toggleSnrColor,
  toggleClusterColor,
  toggleInlierColor,
  toggleStationaryColor,
];
colorToggles.forEach((t) => {
  t.addEventListener("change", (e) => {
    if (e.target.checked) {
      colorToggles.forEach((o) => {
        if (o !== e.target) o.checked = false;
      });
    }
    if (appState.p5_instance) appState.p5_instance.redraw();
    updatePersistentOverlays(videoPlayer.currentTime);
  });
});

[
  toggleVelocity,
  toggleEgoSpeed,
  toggleFrameNorm,
  toggleTracks,
  toggleDebugOverlay,
  toggleDebug2Overlay,
].forEach((t) => {
  t.addEventListener("change", () => {
    if (appState.p5_instance) {
      if (t === toggleFrameNorm && !toggleFrameNorm.checked)
        appState.p5_instance.drawSnrLegendToBuffer(
          appState.globalMinSnr,
          appState.globalMaxSnr
        );
      appState.p5_instance.redraw();
    }
    if (t === toggleDebugOverlay || t === toggleDebug2Overlay) {
      updateDebugOverlay(videoPlayer.currentTime);
      updatePersistentOverlays(videoPlayer.currentTime);
    }
  });
});

toggleCloseUp.addEventListener("change", () => {
  appState.isCloseUpMode = toggleCloseUp.checked;
  if (appState.p5_instance) {
    if (appState.isCloseUpMode) {
      if (appState.isPlaying) {
        playPauseBtn.click();
      }
      appState.p5_instance.loop();
    } else {
      appState.p5_instance.noLoop();
      appState.p5_instance.redraw();
    }
  }
});

videoPlayer.addEventListener("ended", () => {
  appState.isPlaying = false;
  playPauseBtn.textContent = "Play";
});

offsetInput.addEventListener("keydown", (event) => {
  // Check if the key pressed was 'Enter'
  if (event.key === "Enter") {
    event.preventDefault();
    forceResyncWithOffset();
  }
});

// --- [START] CORRECTED INITIALIZATION LOGIC ---
document.addEventListener("DOMContentLoaded", () => {
  initializeTheme();
  initializeDataExplorer(); 
  initKeyboardShortcuts();
  initSyncUIHandlers();
  initDB(async () => {
    console.log("Database initialized. Checking for cached session...");

    // Load filenames and the last known offset from localStorage
    appState.jsonFilename = localStorage.getItem("jsonFilename");
    appState.videoFilename = localStorage.getItem("videoFilename");
    appState.offset = parseFloat(localStorage.getItem("visualizerOffset")) || 0;

    if (appState.jsonFilename) {
      // --- START: FIX FOR AUTO-RELOAD ---
      const jsonBlob = await loadFreshFileFromDB("json", appState.jsonFilename); // This is a Blob
      const videoBlob = await loadFreshFileFromDB("video", appState.videoFilename); // This is a Blob

      if (jsonBlob) {
        console.log("Cached session found. Starting auto-reload...");

        // The handleFiles function expects File objects with a .name property.
        // Blobs from IndexedDB don't have a name. We must reconstruct File objects.
        const filesToLoad = [];

        // Recreate the JSON file with its original name.
        filesToLoad.push(new File([jsonBlob], appState.jsonFilename, { type: "application/json" }));

        // If a video exists, recreate it with its original name.
        if (videoBlob && appState.videoFilename) {
          filesToLoad.push(new File([videoBlob], appState.videoFilename, { type: videoBlob.type }));
        }

        // Now, pass the array of proper File objects to the handler.
        handleFiles(filesToLoad);
        // --- END: FIX FOR AUTO-RELOAD ---
      } else {
        console.log(
          "Cached session is stale or missing files. Ready for manual load."
        );
      }
    } else {
      console.log("No previous session found. Ready for manual file load.");
    }
  });
});
// --- [END] CORRECTED INITIALIZATION LOGIC ---