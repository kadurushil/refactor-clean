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

import { zoomSketch } from "./p5/zoomSketch.js";
//import { showExplorer, hideExplorer, displayInGrid } from "./dataExplorer.js";
import { initializeDataExplorer, throttledUpdateExplorer } from "./dataExplorer.js"; // <-- ADD THIS
import {
  showModal,
  hideModal,
  updateLoadingModal,
  showLoadingModal,
} from "./modal.js"; // Modify this import
import {
  animationLoop,
  videoFrameCallback,
  startPlayback,
  pausePlayback,
  stopPlayback,
  forceResyncWithOffset,
} from "./sync.js";
import { radarSketch } from "./p5/radarSketch.js";
import { speedGraphSketch } from "./p5/speedGraphSketch.js";
import { parseVisualizationJson, parseJsonWithOboe } from "./fileParsers.js";
import {
  MAX_TRAJECTORY_LENGTH,
  VIDEO_FPS,
  RADAR_X_MIN,
  RADAR_X_MAX,
  RADAR_Y_MIN,
  RADAR_Y_MAX,
} from "./constants.js";
import {
  findRadarFrameIndexForTime,
  extractTimestampInfo,
  parseTimestamp,
  throttle,
  formatTime,
} from "./utils.js";
import { appState } from "./state.js";
window.appState = appState; // exposing the appState to console
import {
  themeToggleBtn,
  canvasContainer,
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
  frameCounter,
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
  egoSpeedDisplay,
  debugOverlay,
  snrMinInput,
  snrMaxInput,
  applySnrBtn,
  autoOffsetIndicator,
  clearCacheBtn,
  speedGraphContainer,
  speedGraphPlaceholder,
  toggleCloseUp,
  updateFrame,
  resetVisualization,
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
  mainContent,
  closeMenuBtn,
  menuScrim,
  toggleConfirmedOnly,
  resetUIForNewLoad,
  //explorerBtn,
} from "./dom.js";

import { initializeTheme } from "./theme.js";

import { initDB, saveFileWithMetadata, loadFreshFileFromDB } from "./db.js";

let seekDebounceTimer = null; //timeline slider variables.
let lastScrollTime = 0; //timeline slider variables.
let scrollSpeed = 0; //timeline slider variables.

// --- [START] CORRECTED UNIFIED FILE LOADING LOGIC ---

// These variables will hold the file objects during the loading process.
let jsonFileToLoad = null;
let videoFileToLoad = null;

/**
 * This is the main handler for both manual clicks and drag-and-drop.
 * It identifies the files and triggers the unified processing pipeline.
 */
function handleFiles(files) {
  // Reset the UI and clear any old data to prepare for a new session
  resetUIForNewLoad();
  appState.vizData = null;

  // Identify the JSON and Video files from the list of files provided
  // This loop now correctly handles both files without an else-if.
  Array.from(files).forEach((file) => {
    if (file.name.endsWith(".json")) {
      jsonFileToLoad = file;
    }
    if (file.type.startsWith("video/")) {
      videoFileToLoad = file;
    }
  });

  // Start the main loading process if we have at least one valid file.
  if (jsonFileToLoad || videoFileToLoad) {
    processFilePipeline();
  }
}

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

async function processFilePipeline() {
  // 1. Show the unified loading modal.
  showLoadingModal("Starting file load...");
  let _parsedJsonData = null;

  // 2. Handle JSON Parsing FIRST (if a JSON file is present)
  if (jsonFileToLoad) {
    appState.jsonFilename = jsonFileToLoad.name;
    localStorage.setItem("jsonFilename", appState.jsonFilename);
    await saveFileWithMetadata("json", jsonFileToLoad);
    calculateAndSetOffset();

    const worker = new Worker("./src/parser.worker.js");
    const parsedData = await new Promise((resolve, reject) => {
      worker.onmessage = (e) => {
        const { type, data, percent, message } = e.data;
        if (type === "progress") {
          updateLoadingModal(percent * 0.8, `Parsing JSON (${percent}%)...`);
        } else if (type === "complete") {
          worker.terminate();
          resolve(data);
        } else if (type === "error") {
          worker.terminate();
          reject(new Error(message));
        }
      };
      worker.postMessage({ file: jsonFileToLoad });
    });
    _parsedJsonData = parsedData;
    const result = await parseVisualizationJson(
      parsedData,
      appState.radarStartTimeMs,
      appState.videoStartDate
    );
    if (result.error) {
      hideModal();
      showModal(result.error);
      return;
    }
    appState.vizData = result.data;
    appState.globalMinSnr = result.minSnr;
    appState.globalMaxSnr = result.maxSnr;
  }

  // 3. Handle Video Loading SECOND, with two-stage initialization
  if (videoFileToLoad) {
    videoPlayer.addEventListener(
      "durationchange",
      () => {
        if (
          videoPlayer.duration > 0 &&
          appState.speedGraphInstance &&
          appState.vizData
        ) {
          appState.speedGraphInstance.setData(
            appState.vizData,
            videoPlayer.duration
          );
        }
      },
      { once: true }
    );
    let spinnerInterval; // Declare here to be accessible in all scopes

    // This single promise manages the entire video loading lifecycle.
    const videoReadyPromise = new Promise((resolve, reject) => {
      // Define cleanup logic to remove listeners and stop the spinner
      const cleanup = () => {
        clearInterval(spinnerInterval);
        videoPlayer.removeEventListener("loadedmetadata", onMetadataLoaded);
        videoPlayer.removeEventListener("canplaythrough", onCanPlayThrough);
        videoPlayer.removeEventListener("error", onError);
      };

      // STAGE 1: Fired when video duration is known.
      const onMetadataLoaded = () => {
        updateLoadingModal(95, "Finalizing visualization...");
        // This is the key fix: initialize data-dependent sketches immediately.
        finalizeSetup(_parsedJsonData);
      };

      // STAGE 2: Fired when video is buffered enough to play.
      const onCanPlayThrough = () => {
        cleanup();
        resolve(); // Resolve the promise, allowing the pipeline to complete.
      };

      // Handle any loading errors
      const onError = (e) => {
        console.error("Video loading error:", e);
        cleanup();
        reject(e);
      };

      // Attach the event listeners
      videoPlayer.addEventListener("loadedmetadata", onMetadataLoaded, {
        once: true,
      });
      videoPlayer.addEventListener("canplaythrough", onCanPlayThrough, {
        once: true,
      });
      videoPlayer.addEventListener("error", onError, { once: true });
    });

    // Set up file metadata and start the simulated progress spinner
    appState.videoFilename = videoFileToLoad.name;
    localStorage.setItem("videoFilename", appState.videoFilename);
    await saveFileWithMetadata("video", videoFileToLoad);
    calculateAndSetOffset();

    const spinnerChars = ["|", "/", "-", "\\"];
    let spinnerIndex = 0;
    spinnerInterval = setInterval(() => {
      const spinnerText = spinnerChars[spinnerIndex % spinnerChars.length];
      updateLoadingModal(85, `Loading video ${spinnerText}`);
      spinnerIndex++;
    }, 150);

    // Trigger the video loading process
    setupVideoPlayer(URL.createObjectURL(videoFileToLoad));

    // Await the promise, which resolves only after 'canplaythrough' fires.
    await videoReadyPromise;

    // 4. Finalize the UI by hiding the modal
    updateLoadingModal(100, "Complete!");
    setTimeout(hideModal, 300);
  } else {
    // If NO video was loaded, we must still finalize the setup and hide the modal.
    updateLoadingModal(95, "Finalizing visualization...");
    finalizeSetup(_parsedJsonData); // Setup with only JSON data
    setTimeout(() => {
      updateLoadingModal(100, "Complete!");
      setTimeout(hideModal, 300);
    }, 200);
  }
}

function finalizeSetup(_parsedJsonData) {
  // Make sure the canvas placeholder is hidden and toggles are visible
  canvasPlaceholder.style.display = "none";
  featureToggles.classList.remove("hidden");

  // --- START OF THE FIX ---
  // This is the critical step. Before we do anything else, we loop through the
  // radar data and recalculate the relative timestamp for every single frame.
  // This ensures the data is perfectly synced to the video's confirmed timeline.
  if (appState.vizData && appState.videoStartDate) {
    appState.vizData.radarFrames.forEach((frame) => {
      frame.timestampMs =
        appState.radarStartTimeMs +
        frame.timestamp -
        appState.videoStartDate.getTime();
    });
  }
  // --- END OF THE FIX ---

  // Create the p5 instances
  if (!appState.p5_instance) {
    appState.p5_instance = new p5(radarSketch);
  }
  if (!appState.zoomSketchInstance) {
    appState.zoomSketchInstance = new p5(zoomSketch, "zoom-canvas-container");
  }

  // Setup the speed graph if we have the necessary data
  if (appState.vizData) {
    speedGraphPlaceholder.classList.add("hidden");
    if (!appState.speedGraphInstance) {
      appState.speedGraphInstance = new p5(speedGraphSketch);
    }
    // The previous logic for setting the frame and redrawing was correct.
    // It failed because the underlying timestamp data was wrong.
    resetVisualization();
    appState.speedGraphInstance.setData(appState.vizData, videoPlayer.duration);
    appState.speedGraphInstance.redraw();
  }

  // Update SNR inputs now that data is loaded
  if (appState.vizData) {
    snrMinInput.value = appState.globalMinSnr.toFixed(1);
    snrMaxInput.value = appState.globalMaxSnr.toFixed(1);
  }
}
// Sets up the video player with the given file URL.
function setupVideoPlayer(fileURL) {
  videoPlayer.src = fileURL;
  videoPlayer.classList.remove("hidden");
  videoPlaceholder.classList.add("hidden");
  videoPlayer.playbackRate = parseFloat(speedSlider.value);
}

// In src/main.js, add this new function
function loadVideoWithProgress(videoObject) {
  if (!videoObject) return;

  showModal("Loading video...", false, true);
  updateModalProgress(0);

  // Define event handlers so we can add and remove them correctly
  const onProgress = () => {
    if (videoPlayer.duration > 0) {
      // Find the end of the buffered content
      const bufferedEnd =
        videoPlayer.buffered.length > 0 ? videoPlayer.buffered.end(0) : 0;
      const percent = (bufferedEnd / videoPlayer.duration) * 100;
      updateModalProgress(percent);
    }
  };

  const onCanPlayThrough = () => {
    updateModalProgress(100);
    // Give the user a moment to see 100% before closing the modal
    setTimeout(() => {
      document.getElementById("modal-ok-btn").click();
    }, 400);

    // Clean up the event listeners we added
    videoPlayer.removeEventListener("progress", onProgress);
    videoPlayer.removeEventListener("canplaythrough", onCanPlayThrough);
  };

  const onError = () => {
    showModal("Error: Could not load the video file.");
    // Clean up event listeners on error
    videoPlayer.removeEventListener("progress", onProgress);
    videoPlayer.removeEventListener("canplaythrough", onCanPlayThrough);
    videoPlayer.removeEventListener("error", onError);
  };

  // This one-time event is for re-syncing data once the video's metadata is ready

  videoPlayer.addEventListener(
    "loadedmetadata",
    () => {
      // This is the perfect time to re-sync data if needed
      if (appState.vizData) {
        appState.vizData.radarFrames.forEach((frame) => {
          frame.timestampMs =
            appState.radarStartTimeMs +
            frame.timestamp -
            appState.videoStartDate.getTime();
        });
        resetVisualization();
      }

      // --- START: New Speed Graph Logic ---
      // If we have data and the video is ready, create/update the speed graph
      if (appState.vizData && videoPlayer.duration > 0) {
        speedGraphPlaceholder.classList.add("hidden");
        if (!appState.speedGraphInstance) {
          appState.speedGraphInstance = new p5(speedGraphSketch);
        }
        appState.speedGraphInstance.setData(
          appState.vizData,
          videoPlayer.duration
        );
      }
      // --- END: New Speed Graph Logic ---
    },
    { once: true }
  ); // { once: true } makes sure this runs only once per load

  // { once: true } //makes sure this runs only once per load

  // Add the listeners for progress tracking
  videoPlayer.addEventListener("progress", onProgress);
  videoPlayer.addEventListener("canplaythrough", onCanPlayThrough);
  videoPlayer.addEventListener("error", onError);

  // Create the object URL and set the video source to trigger loading
  const fileURL = URL.createObjectURL(videoObject);
  setupVideoPlayer(fileURL);
}

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
  localStorage.setItem("visualizerOffset", offsetInput.value);
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
  playPauseBtn.textContent = appState.isPlaying ? "Pause" : "Play";

  if (appState.isPlaying) {
    startPlayback();
  } else {
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
// In src/main.js, REPLACE the existing timelineSlider 'input' event listener with this:

timelineSlider.addEventListener("input", (event) => {
  if (!appState.vizData) return;
  updateDebugOverlay(videoPlayer.currentTime);
  updatePersistentOverlays(videoPlayer.currentTime);
  // --- 1. Live Seeking (Throttled for performance) ---
  // This part gives you the immediate visual feedback as you drag the slider.
  // We use a simple timestamp check to prevent it from running too often.
  const now = performance.now();
  if (
    !timelineSlider.lastInputTime ||
    now - timelineSlider.lastInputTime > 32
  ) {
    // ~30fps throttle
    if (appState.isPlaying) {
      videoPlayer.pause();
      appState.isPlaying = false;
      playPauseBtn.textContent = "Play";
    }
    const frame = parseInt(event.target.value, 10);
    updateFrame(frame, true);
    appState.mediaTimeStart = videoPlayer.currentTime;
    appState.masterClockStart = now;
  }

  // --- 2. Final, Precise Sync (Debounced for reliability) ---
  // This part ensures a perfect sync only AFTER you stop moving the slider.
  clearTimeout(seekDebounceTimer); // Always cancel the previously scheduled sync

  seekDebounceTimer = setTimeout(() => {
    console.log("Slider movement stopped. Performing final, debounced resync.");
    const finalFrame = parseInt(event.target.value, 10);
    updateFrame(finalFrame, true); // Perform the final, precise seek

    // Also update the debug overlay with the final, settled time
    updateDebugOverlay(videoPlayer.currentTime);
  }, 250); // Wait for 250ms of inactivity before firing
});

// --- Timeline Scroll-to-Seek Logic ---

timelineSlider.addEventListener("wheel", (event) => {
  if (!appState.vizData) return;
  // 1. Prevent the page from scrolling up and down
  event.preventDefault();

  // 2. Calculate scroll speed
  const now = performance.now();
  const timeDelta = now - (lastScrollTime || now); // Handle first scroll
  lastScrollTime = now;
  // Calculate speed as "events per second", giving more weight to recent, fast scrolls
  scrollSpeed = timeDelta > 0 ? 1000 / timeDelta : scrollSpeed;

  // 3. Map scroll speed to a dynamic seek multiplier
  // This creates a nice acceleration curve. The '50' is a sensitivity value you can adjust.
  const speedMultiplier = 1 + Math.floor(scrollSpeed / 4);
  const baseSeekAmount = 1; // Base frames to move on a slow scroll
  let seekAmount = Math.max(baseSeekAmount, speedMultiplier);

  // 4. Calculate the new frame index
  const direction = Math.sign(event.deltaY); // +1 for down/right, -1 for up/left
  const currentFrame = parseInt(timelineSlider.value, 10);
  let newFrame = currentFrame - seekAmount * direction;

  // Clamp the new frame to the valid range
  const totalFrames = appState.vizData.radarFrames.length - 1;
  newFrame = Math.max(0, Math.min(newFrame, totalFrames));

  // 5. Update the UI
  if (appState.isPlaying) {
    playPauseBtn.click(); // Pause if playing
  }
  updateFrame(newFrame, true);

  // 6. Reuse the debouncer for a final, precise sync after scrolling stops
  clearTimeout(seekDebounceTimer);
  seekDebounceTimer = setTimeout(() => {
    console.log("Scrolling stopped. Performing final, debounced resync.");
    updateFrame(newFrame, true);
    updatePersistentOverlays(videoPlayer.currentTime);
    updateDebugOverlay(videoPlayer.currentTime);
  }, 300); // Wait 300ms after the last scroll event
  throttledUpdateExplorer();
});

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
  const formattedTime = formatTime(frameData.timestampMs);
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

document.addEventListener("keydown", (event) => {
  // --- FIX APPLIED HERE ---
  // We only want to block shortcuts if the user is actively typing in a text or number input.
  // This allows shortcuts to work even when other elements, like the timeline slider, are focused.
  const isTextInputFocused =
    event.target.tagName === "INPUT" &&
    (event.target.type === "text" || event.target.type === "number");
  if (isTextInputFocused) {
    return;
  }
  // --- END OF FIX ---

  const key = event.key;
  // We can add any new shortcut keys to this array.
  const recognizedKeys = [
    "ArrowRight",
    "ArrowLeft",
    " ",
    "1",
    "2",
    "3",
    "4",
    "t",
    "d",
    "g",
    "r",
    "p",
    "a",
    "s",
    "m",
    "q",
    "c",
  ];

  if (!appState.vizData || !recognizedKeys.includes(key)) {
    return;
  }

  event.preventDefault();

  // --- Spacebar for Play/Pause ---
  if (key === " ") {
    playPauseBtn.click();
  }

  // --- Arrow keys for frame-by-frame seeking ---
  if (key === "ArrowRight" || key === "ArrowLeft") {
    if (appState.isPlaying) {
      playPauseBtn.click();
    }
    let newFrame = appState.currentFrame;
    if (key === "ArrowRight") {
      newFrame = Math.min(
        appState.vizData.radarFrames.length - 1,
        appState.currentFrame + 1
      );
    } else if (key === "ArrowLeft") {
      newFrame = Math.max(0, appState.currentFrame - 1);
    }
    if (newFrame !== appState.currentFrame) {
      updateFrame(newFrame, true);
    }
  }

  // --- Number keys for color modes ---
  if (key >= "1" && key <= "4") {
    const colorToggles = [
      toggleSnrColor,
      toggleClusterColor,
      toggleInlierColor,
      toggleStationaryColor,
    ];
    const toggleIndex = parseInt(key) - 1;
    if (colorToggles[toggleIndex]) {
      colorToggles[toggleIndex].click();
    }
  }
  if (key === "q") {
    themeToggleBtn.click();
  }
  if (key === "t") {
    toggleTracks.click();
  }
  if (key === "d") {
    toggleVelocity.click();
  }
  if (key === "g") {
    toggleCloseUp.click();
  }
  if (key === "r") {
    resetVisualization();
  }
  if (key === "c") {
    appState.isRawOnlyMode = !appState.isRawOnlyMode;
    if (appState.p5_instance) {
      appState.p5_instance.redraw();
    }
  }
  if (key === "p") {
    togglePredictedPos.click();
    appState.p5_instance.redraw();
  }
  if (key === "s") {
    toggleSnrColor.click();
  }
  if (key === "a") {
    toggleDebugOverlay.click();
    toggleDebug2Overlay.click();
    if (isDebug1Visible && isDebug2Visible) {
      radarInfoOverlay.classList.add("hidden");
      videoInfoOverlay.classList.add("hidden");
      return;
    }
    // Otherwise, make sure they are visible.
    radarInfoOverlay.classList.remove("hidden");
    videoInfoOverlay.classList.remove("hidden");
  }
  if (key === "m") {
    if (collapsibleMenu.classList.contains("-translate-x-full")) {
      // If the menu is hidden (closed), trigger a click on the OPEN button.
      toggleMenuBtn.click();
    } else {
      // If the menu is not hidden (it's open), trigger a click on the CLOSE button.
      closeMenuBtn.click();
    }
  }
});


function calculateAndSetOffset() {
  const jsonTimestampInfo = extractTimestampInfo(appState.jsonFilename);
  const videoTimestampInfo = extractTimestampInfo(appState.videoFilename);
  if (videoTimestampInfo) {
    appState.videoStartDate = parseTimestamp(
      videoTimestampInfo.timestampStr,
      videoTimestampInfo.format
    );
    if (appState.videoStartDate) {
    }
  }

  if (jsonTimestampInfo) {
    const jsonDate = parseTimestamp(
      jsonTimestampInfo.timestampStr,
      jsonTimestampInfo.format
    );
    if (jsonDate) {
      appState.radarStartTimeMs = jsonDate.getTime();
      console.log(`Radar start date set to: ${jsonDate.toISOString()}`);
      if (appState.videoStartDate) {
        const offset =
          appState.radarStartTimeMs - appState.videoStartDate.getTime();
        offsetInput.value = offset;
        localStorage.setItem("visualizerOffset", offset);
        autoOffsetIndicator.classList.remove("hidden");
        console.log(`Auto-calculated offset: ${offset} ms`);
      }
    }
  }
}
offsetInput.addEventListener("keydown", (event) => {
  // Check if the key pressed was 'Enter'
  if (event.key === "Enter") {
    // Prevent the default browser action for the Enter key (like submitting a form)
    event.preventDefault();
    // Call the new centralized function from sync.js
    forceResyncWithOffset();
  }
});

// --- [START] CORRECTED INITIALIZATION LOGIC ---
document.addEventListener("DOMContentLoaded", () => {
  initializeTheme();
  initializeDataExplorer(); // <-- ADD THIS LINE
  initDB(async () => {
    console.log("Database initialized. Checking for cached session...");

    appState.jsonFilename = localStorage.getItem("jsonFilename");
    appState.videoFilename = localStorage.getItem("videoFilename");

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
