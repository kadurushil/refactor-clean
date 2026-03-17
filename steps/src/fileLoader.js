import { appState } from "./state.js";
import { debugFlags } from "./debug.js";
import { saveFileWithMetadata, loadManualOffset, deleteManualOffset } from "./db.js";
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
  resetUIForNewLoad,
  startScreenModal,
} from "./dom.js";

import { forceResyncWithOffset } from "./sync.js";
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
  // 0. Reset the UI to a clean state before processing anything.
  // Pass 'true' if a new video is present, 'false' if we should try to keep the old one.
  const isNewVideo = !!videoFile;
  resetUIForNewLoad(isNewVideo);

  // 1. Show the unified loading modal.
  showLoadingModal("Processing files...");

  const cachePromises = [];

  // --- PART A: Setup Filenames & Cache (Moved Up) ---
  if (jsonFile) {
    appState.jsonFilename = jsonFile.name;
    localStorage.setItem("jsonFilename", appState.jsonFilename);
    if (!fromCache) {
      const savePromise = saveFileWithMetadata("json", jsonFile).catch((e) =>
        console.warn(`Non-blocking cache save failed for JSON:`, e)
      );
      if (debugFlags.CACHE_BLOCKING) {
        await savePromise;
      } else {
        cachePromises.push(savePromise);
      }
    }
  }

  if (videoFile) {
    appState.videoFilename = videoFile.name;
    localStorage.setItem("videoFilename", appState.videoFilename);
    // CRITICAL FIX: Reset the videoMissing flag when a new video is being loaded.
    appState.videoMissing = false;

    if (!fromCache) {
      const savePromise = saveFileWithMetadata("video", videoFile).catch((e) =>
        console.warn(`Non-blocking cache save failed for Video:`, e)
      );
      cachePromises.push(savePromise);
    }
  }

  // --- PART B: Calculate Offset (Moved Up) ---
  // Critical: This must run BEFORE JSON parsing so valid start times are available.
  await calculateAndSetOffset();

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
    const videoLoaded = await loadVideo(videoFile);
    if (!videoLoaded) {
      appState.videoMissing = true;
    }
  }

  // --- PART F: Finalize UI ---
  finalizeSetup();

  if (!appState.videoMissing) {
    updateLoadingModal(100, "Complete!");
    setTimeout(() => {
        hideModal();
        startScreenModal.classList.add("hidden");
    }, 300);
  }

  // Log the results of the non-blocking cache operations once they complete.
  if (cachePromises.length > 0) {
    Promise.allSettled(cachePromises).then((results) => {
      console.log("Non-blocking cache operations finished:", results);
    });
  }
}


// Encapsulates the specific logic for loading a video file into the player
let retries = 0;
function loadVideo(file, isRetry = false) {
  return new Promise(async (resolve) => {
    let metadataLoaded = false;
    let loadTimeout;

    // Before creating a new URL, revoke the old one if it exists.
    if (!isRetry && appState.videoObjectUrl) {
      URL.revokeObjectURL(appState.videoObjectUrl);
      appState.videoObjectUrl = null;
    }

    const fileURL = isRetry ? videoPlayer.src : URL.createObjectURL(file);

    const cleanup = () => {
      clearTimeout(loadTimeout);
      videoPlayer.removeEventListener("loadedmetadata", onMetadataLoaded);
      videoPlayer.removeEventListener("canplaythrough", onCanPlayThrough);
      videoPlayer.removeEventListener("error", onError);
    };

    const onMetadataLoaded = () => {
      metadataLoaded = true;
      updateLoadingModal(95, "Finalizing visualization...");
    };

    const onCanPlayThrough = () => {
      cleanup();
      resolve(true);
    };

    const handleTimeout = async () => {
      if (metadataLoaded) {
        console.warn(
          "Video 'canplaythrough' event timed out, but 'loadedmetadata' fired. Proceeding with playback."
        );
        appState.videoReadyByFallback = true;
        cleanup();
        resolve(true);
      } else {
        // Neither event fired, video is likely broken.
        await hideModal(); // Hide the loading modal first and wait for it to finish.
        const choice = await showModal(
          "Video is taking too long to load. It might be corrupted.",
          true, // isConfirm
          { ok: "Retry", cancel: "Continue without Video" }
        );

        if (choice) { // Retry
          if (retries < debugFlags.VIDEO_LOAD_RETRIES) {
            retries++;
            console.log(`Retrying video load... (Attempt ${retries})`);
            showLoadingModal(`Retrying video load...`);
            videoPlayer.load(); // Tell the video element to re-fetch
            resolve(loadVideo(file, true)); // Recurse
          } else {
            await showModal("Video load failed after multiple retries.");
            resolve(false); // Failed to load
          }
        } else { // Continue without video
          console.warn("User opted to continue without video.");
          cleanup();
          // Revoke URL to free memory if we're giving up on it
          if (videoPlayer.src.startsWith('blob:')) {
            URL.revokeObjectURL(videoPlayer.src);
            appState.videoObjectUrl = null; // Clear from state
          }
          videoPlayer.src = "";
          videoPlayer.classList.add("hidden");
          videoPlaceholder.classList.remove("hidden");
          resolve(false); // Signal that video is not loaded
        }
      }
    };

    const onError = async (e) => {
      console.error("Video loading error:", e);
      cleanup();
      await hideModal(); // Await is CRITICAL to prevent a race condition with the next modal.
      showModal("Error loading video file. It may be an unsupported format or corrupted.");
      resolve(false);
    };

    // Attach listeners
    videoPlayer.addEventListener("loadedmetadata", onMetadataLoaded, { once: true });
    videoPlayer.addEventListener("canplaythrough", onCanPlayThrough, { once: true });
    videoPlayer.addEventListener("error", onError, { once: true });

    // Start the timeout
    loadTimeout = setTimeout(handleTimeout, debugFlags.VIDEO_LOAD_TIMEOUT);

    // Apply source only if it's not a retry
    if (!isRetry) {
      retries = 0; // Reset retry counter for new files
      setupVideoPlayer(fileURL);
    }
  });
}

function finalizeSetup() {
  // CRITICAL FIX: Always reset the visualization state before redrawing.
  // This pauses the video and resets the timeline, ensuring a clean slate for the new data.
  resetVisualization();
  // 1. Manage Placeholders & Visibility
  // If we have data (vizData), we show the canvas container.
  if (appState.vizData) {
      canvasPlaceholder.style.display = "none";
      featureToggles.classList.remove("hidden");
  } else {
      // If there's no viz data (e.g., video-only load), hide the canvas
      canvasPlaceholder.style.display = ""; // Show placeholder
      featureToggles.classList.add("hidden");
      if (appState.p5_instance) {
          appState.p5_instance.noLoop();
      }
      // If we don't have data yet (video only), we might keep the placeholder or show an empty canvas?
      // Current behavior: keep placeholder until JSON loads.
  }

  // 2. Initialize/Update P5 Sketches
  // We check if they exist; if not, create them. If they do, they will read the new appState on next draw.
  if (!appState.p5_instance) {
    appState.p5_instance = new p5(radarSketch);
  } else {
    // If it existed, ensure it's up to date. 
    // CRITICAL: Do NOT call .loop(). The app uses a custom animationLoop in sync.js.
    appState.p5_instance.redraw();
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
    
    // Update speed graph with new data + video duration
    // Determine the most appropriate duration for the graph's X-axis.
    let finalDuration = 0;
    let jsonDuration = 0;

    // 1. Calculate duration from the JSON data itself as a reliable baseline.
    if (appState.vizData.radarFrames && appState.vizData.radarFrames.length > 0) {
      const lastFrame = appState.vizData.radarFrames[appState.vizData.radarFrames.length - 1];
      jsonDuration = lastFrame.timestamp / 1000.0;
    }

    // 2. Get video duration, normalizing invalid values.
    let videoDuration = appState.videoMissing ? 0 : (videoPlayer.duration || 0);
    if (!videoDuration || isNaN(videoDuration) || videoDuration <= 0) {
      videoDuration = 0;
    }

    // 3. Set the graph's duration. Prioritize JSON duration, but clip it
    //    to the video's duration if a video is present and shorter.
    finalDuration = jsonDuration;
    if (videoDuration > 0 && jsonDuration > videoDuration) {
      finalDuration = jsonDuration;
    }

    appState.speedGraphInstance.setData(appState.vizData, finalDuration);
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
  videoPlayer.controls = false;
  videoPlayer.muted = false;

  // Store the new object URL if it's a blob
  if (fileURL.startsWith("blob:")) {
    appState.videoObjectUrl = fileURL;
  }
}

async function calculateAndSetOffset() {  
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

  // 1. Try to load a manually saved offset for this specific file pair.
  // We use the JSON filename as the primary key.
  const savedOffset = appState.jsonFilename ? await loadManualOffset(appState.jsonFilename) : null;

  if (savedOffset !== null) {
    console.log(`Applying saved manual offset: ${savedOffset}ms`);
    appState.offset = savedOffset;
    if (jsonDate) {
         appState.radarStartTimeMs = jsonDate.getTime();
    }
    // Update UI
    offsetInput.value = appState.offset;
    
    // Show "Manual" indicator
    autoOffsetIndicator.textContent = "Manual";
    autoOffsetIndicator.className = "text-xs font-bold ml-2 text-gray-500"; // Gray for manual
    autoOffsetIndicator.classList.remove("hidden");
    
    localStorage.setItem("visualizerOffset", appState.offset);
    return; // Exit early, skipping auto-calc
  }

  let calculatedOffset = 0;
  // We need both dates to calculate an offset.
  if (jsonDate && videoDate) {
    appState.radarStartTimeMs = jsonDate.getTime();
    const offset = jsonDate.getTime() - videoDate.getTime();

    if (isNaN(offset) || Math.abs(offset) > 30000) {
      console.warn(`Calculated offset of ${offset}ms is invalid or exceeds 30s threshold. Defaulting to 0.`);
      calculatedOffset = 0;
      
      // Show "Default" or "Out of Range" indicator
      autoOffsetIndicator.textContent = isNaN(offset) ? "Default" : "Out of Range";
      autoOffsetIndicator.className = "text-xs font-bold ml-2 text-yellow-600"; // Dark Yellow
      autoOffsetIndicator.classList.remove("hidden");
      
    } else {
      calculatedOffset = offset;
      
      // Show "Auto" indicator
      autoOffsetIndicator.textContent = "Auto";
      autoOffsetIndicator.className = "text-xs font-bold ml-2 text-green-500"; // Green
      autoOffsetIndicator.classList.remove("hidden");
      
      console.log(`Auto-calculated offset: ${calculatedOffset} ms`);
    }
  } else if (jsonDate) {
      // If we have JSON but no video, we set start time but offset is 0
      appState.radarStartTimeMs = jsonDate.getTime();
      // No specific indicator needed for JSON-only default 0, or could show "Default"
      autoOffsetIndicator.classList.add("hidden"); 
  }

  appState.offset = calculatedOffset;
  offsetInput.value = appState.offset;
  localStorage.setItem("visualizerOffset", appState.offset);
}

/**
 * Re-calculates and applies the automatic offset based on filenames.
 * This function is triggered by user actions like clicking the 'Manual' indicator
 * or using a keyboard shortcut to revert a manual offset.
 */
export function revertToAutoOffset() {
  // 1. Calculate the automatic offset.
  const jsonTimestampInfo = extractTimestampInfo(appState.jsonFilename);
  const videoTimestampInfo = extractTimestampInfo(appState.videoFilename);

  let calculatedOffset = 0;
  let indicatorText = "Default";
  let indicatorClass = "text-xs font-bold ml-2 text-yellow-600"; // Default to yellow

  if (jsonTimestampInfo && videoTimestampInfo) {
    const jsonDate = parseTimestamp(jsonTimestampInfo.timestampStr, jsonTimestampInfo.format);
    const videoDate = parseTimestamp(videoTimestampInfo.timestampStr, videoTimestampInfo.format);

    if (jsonDate && videoDate) {
      const offset = jsonDate.getTime() - videoDate.getTime();
      if (isNaN(offset) || Math.abs(offset) > 30000) {
        calculatedOffset = 0;
        indicatorText = "Out of Range";
      } else {
        calculatedOffset = offset;
        indicatorText = "Auto";
        indicatorClass = "text-xs font-bold ml-2 text-green-500";
      }
    }
  }

  // 2. Update the input box with the new value.
  offsetInput.value = calculatedOffset;

  // 3. Delete any saved manual offset so future loads default to "Auto" logic.
  if (appState.jsonFilename) {
      deleteManualOffset(appState.jsonFilename);
  }

  // 4. Call the resync function with saveToDb = false.
  forceResyncWithOffset(false);

  // 5. After resyncing, set the correct indicator text and style.
  autoOffsetIndicator.textContent = indicatorText;
  autoOffsetIndicator.className = indicatorClass;
  autoOffsetIndicator.classList.remove("hidden");
}