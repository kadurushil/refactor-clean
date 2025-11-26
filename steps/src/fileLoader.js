import { appState } from "./state.js";
import { saveFileWithMetadata } from "./db.js";
import { parseVisualizationJson } from "./fileParsers.js";
import {
  showLoadingModal,
  updateLoadingModal,
  hideModal,
  showModal,
} from "./modal.js";
import {
  precomputeRadarVideoSync,
  extractTimestampInfo,
  parseTimestamp,
} from "./utils.js";
import { resetVisualization } from "./sync.js";
import { radarSketch } from "./p5/radarSketch.js";
import { speedGraphSketch } from "./p5/speedGraphSketch.js";
import { zoomSketch } from "./p5/zoomSketch.js";
import {
  videoPlayer,
  videoPlaceholder,
  canvasPlaceholder,
  featureToggles,
  speedGraphPlaceholder,
  snrMinInput,
  snrMaxInput,
  autoOffsetIndicator,
  offsetInput,
  speedSlider,
  updatePersistentOverlays,
  updateDebugOverlay,
} from "./dom.js";

/**
 * This is the main handler for both manual clicks and drag-and-drop.
 * It identifies the files and triggers the unified processing pipeline.
 */
export function handleFiles(files, fromCache = false) {
  // Identify new files from the input
  let incomingJson = null;
  let incomingVideo = null;

  Array.from(files).forEach((file) => {
    if (file.name.endsWith(".json")) {
      incomingJson = file;
    }
    if (file.type.startsWith("video/")) {
      incomingVideo = file;
    }
  });

  // If no valid files were dropped, do nothing
  if (!incomingJson && !incomingVideo) return;

  // Trigger the pipeline with the identified files
  processFilePipeline(incomingJson, incomingVideo, fromCache);
}

async function processFilePipeline(jsonFile, videoFile, fromCache) {
  // 1. Show the unified loading modal.
  showLoadingModal("Processing files...");

  // --- PART A: Setup Filenames & Cache (Moved Up) ---
  if (jsonFile) {
    appState.jsonFilename = jsonFile.name;
    localStorage.setItem("jsonFilename", appState.jsonFilename);
    if (!fromCache) await saveFileWithMetadata("json", jsonFile);
  }

  if (videoFile) {
    appState.videoFilename = videoFile.name;
    localStorage.setItem("videoFilename", appState.videoFilename);
    if (!fromCache) await saveFileWithMetadata("video", videoFile);
  }

  // --- PART B: Calculate Offset (Moved Up) ---
  // Critical: This must run BEFORE JSON parsing so valid start times are available.
  calculateAndSetOffset();

  // --- PART C: Handle JSON Parsing ---
  if (jsonFile) {
    // Reset old visualization data immediately
    appState.vizData = null;
    // Pause P5 loop to prevent errors while data is missing
    if (appState.p5_instance) appState.p5_instance.noLoop();
    
    // Parse JSON
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
      worker.postMessage({ file: jsonFile });
    });
    
    // Post-process JSON with correct dates
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

  // --- PART D: Precompute Sync ---
  // Bake the offset into the data (needs vizData from Part C and offset from Part B)
  if (appState.vizData) {
      precomputeRadarVideoSync(appState.vizData, appState.offset);
  }

  // --- PART E: Load Video (if new) ---
  if (videoFile) {
    await loadVideo(videoFile);
  }

  // --- PART F: Finalize UI ---
  finalizeSetup();

  // Hide modal
  updateLoadingModal(100, "Complete!");
  setTimeout(hideModal, 300);
}


// Encapsulates the specific logic for loading a video file into the player
function loadVideo(file) {
    return new Promise((resolve, reject) => {
        const fileURL = URL.createObjectURL(file);
        
        // Setup cleanup to remove listeners
        const cleanup = () => {
            clearInterval(spinnerInterval);
            videoPlayer.removeEventListener("loadedmetadata", onMetadataLoaded);
            videoPlayer.removeEventListener("canplaythrough", onCanPlayThrough);
            videoPlayer.removeEventListener("error", onError);
        };

        const onMetadataLoaded = () => {
            updateLoadingModal(95, "Finalizing visualization...");
        };

        const onCanPlayThrough = () => {
            cleanup();
            resolve(); 
        };

        const onError = (e) => {
            console.error("Video loading error:", e);
            cleanup();
            reject(e);
        };

        // Attach listeners
        videoPlayer.addEventListener("loadedmetadata", onMetadataLoaded, { once: true });
        videoPlayer.addEventListener("canplaythrough", onCanPlayThrough, { once: true });
        videoPlayer.addEventListener("error", onError, { once: true });

        // Spinner
        const spinnerChars = ["|", "/", "-", "\\"];
        let spinnerIndex = 0;
        const spinnerInterval = setInterval(() => {
            const spinnerText = spinnerChars[spinnerIndex % spinnerChars.length];
            updateLoadingModal(85, `Loading video ${spinnerText}`);
            spinnerIndex++;
        }, 150);

        // Apply source
        setupVideoPlayer(fileURL);
    });
}

function finalizeSetup() {
  // 1. Manage Placeholders & Visibility
  // If we have data (vizData), we show the canvas container.
  if (appState.vizData) {
      canvasPlaceholder.style.display = "none";
      featureToggles.classList.remove("hidden");
  } else {
      // If we don't have data yet (video only), we might keep the placeholder or show an empty canvas?
      // Current behavior: keep placeholder until JSON loads.
  }

  // 2. Initialize/Update P5 Sketches
  // We check if they exist; if not, create them. If they do, they will read the new appState on next draw.
  if (!appState.p5_instance) {
    appState.p5_instance = new p5(radarSketch);
  } else {
    // If it existed, ensure it's looping/active
     appState.p5_instance.loop();
  }

  if (!appState.zoomSketchInstance) {
    appState.zoomSketchInstance = new p5(zoomSketch, "zoom-canvas-container");
  }

  // 3. Setup Speed Graph
  if (appState.vizData) {
    speedGraphPlaceholder.classList.add("hidden");
    
    if (!appState.speedGraphInstance) {
      appState.speedGraphInstance = new p5(speedGraphSketch);
    }
    
    // Important: Reset the visualization timeline to 0
    resetVisualization();
    
    // Update speed graph with new data + video duration
    // Note: videoPlayer.duration might be NaN if video isn't loaded.
    const duration = videoPlayer.duration || 0;
    appState.speedGraphInstance.setData(appState.vizData, duration);
    appState.speedGraphInstance.redraw();
  }
  
  // 4. Update UI Overlays
  // Manually update overlays so they are visible immediately.
  updatePersistentOverlays(videoPlayer.currentTime);
  updateDebugOverlay(videoPlayer.currentTime);

  // 5. Update SNR Inputs
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

function calculateAndSetOffset() {  
  const jsonTimestampInfo = extractTimestampInfo(appState.jsonFilename);
  const videoTimestampInfo = extractTimestampInfo(appState.videoFilename);

  let videoDate = null;
  if (videoTimestampInfo) {
    videoDate = parseTimestamp(
      videoTimestampInfo.timestampStr,
      videoTimestampInfo.format
    );
    appState.videoStartDate = videoDate; // Store for potential future use
  }

  let jsonDate = null;
  if (jsonTimestampInfo) {
    jsonDate = parseTimestamp(
      jsonTimestampInfo.timestampStr,
      jsonTimestampInfo.format
    );
  }

  let calculatedOffset = 0;
  // We need both dates to calculate an offset.
  if (jsonDate && videoDate) {
    appState.radarStartTimeMs = jsonDate.getTime();
    const offset = jsonDate.getTime() - videoDate.getTime();

    if (isNaN(offset) || Math.abs(offset) > 30000) {
      console.warn(`Calculated offset of ${offset}ms is invalid or exceeds 30s threshold. Defaulting to 0.`);
      calculatedOffset = 0;
    } else {
      calculatedOffset = offset;
      autoOffsetIndicator.classList.remove("hidden");
      console.log(`Auto-calculated offset: ${calculatedOffset} ms`);
    }
  } else if (jsonDate) {
      // If we have JSON but no video, we set start time but offset is 0
      appState.radarStartTimeMs = jsonDate.getTime();
  }

  appState.offset = calculatedOffset;
  offsetInput.value = appState.offset;
  localStorage.setItem("visualizerOffset", appState.offset);
}