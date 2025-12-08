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
import { initSessionManagement } from "./session.js";
import { initUIEventListeners } from "./ui.js";
import { appState } from "./state.js";
import { debugFlags } from "./debug.js"; // Import the new debug flags
window.appState = appState; // exposing the appState to console
window.debugFlags = debugFlags; // Expose debug flags to the console for runtime toggling
import {
  videoPlayer,
  loadJsonBtn,
  loadVideoBtn,
  jsonFileInput,
  videoFileInput,
  playPauseBtn,
  stopBtn,
  offsetInput,
  autoOffsetIndicator,
  clearCacheBtn,
  guideModal,
} from "./dom.js";

import { initializeTheme } from "./theme.js";

import { initDB, loadFreshFileFromDB, saveManualOffset } from "./db.js";
import { initKeyboardShortcuts } from "./keyboard.js";
import { handleFiles, revertToAutoOffset } from "./fileLoader.js";

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

// Event listener for offset input change.
offsetInput.addEventListener("input", () => {
  autoOffsetIndicator.classList.add("hidden");
  // The value is now saved to localStorage only when 'Enter' is pressed.
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

// --- [START] NEW: Revert to Auto-Offset Logic ---
autoOffsetIndicator.addEventListener("click", () => {
  // Only allow reverting if the indicator shows "Manual".
  if (autoOffsetIndicator.textContent === "Manual") {
    revertToAutoOffset();
  }
});
// --- [END] NEW: Revert to Auto-Offset Logic ---

// --- [START] CORRECTED INITIALIZATION LOGIC ---
document.addEventListener("DOMContentLoaded", () => {
  initializeTheme();
  initializeDataExplorer(); 
  initSessionManagement();
  initUIEventListeners();
  initKeyboardShortcuts();
  initSyncUIHandlers();

  // Check if the user has seen the guide
  const isFirstRun = !sessionStorage.getItem("hasSeenUserGuide");
  if (isFirstRun) {
    guideModal.classList.remove("hidden");
    sessionStorage.setItem("hasSeenUserGuide", "true");
  }

  // Await the database initialization before attempting to load any files.
  // This resolves the race condition on initial load.
  initDB().then(async () => {
    // If this is the first run, do not attempt to auto-load files.
    if (isFirstRun) {
      console.log("First run detected. Skipping auto-load of cached session.");
      return;
    }

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
        handleFiles(filesToLoad, true);
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