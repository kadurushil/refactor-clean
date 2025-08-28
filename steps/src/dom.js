import { appState } from "./state.js";
import { findLastCanIndexBefore } from "./utils.js";
import { VIDEO_FPS } from "./constants.js"; // Import VIDEO_FPS for debug overlay calculations

// --- DOM Element References --- //

export const canvasContainer = document.getElementById("canvas-container");
export const canvasPlaceholder = document.getElementById("canvas-placeholder");
export const videoPlayer = document.getElementById("video-player");
export const videoPlaceholder = document.getElementById("video-placeholder");
export const loadJsonBtn = document.getElementById("load-json-btn");
export const loadVideoBtn = document.getElementById("load-video-btn");
export const loadCanBtn = document.getElementById("load-can-btn");
export const jsonFileInput = document.getElementById("json-file-input");
export const videoFileInput = document.getElementById("video-file-input");
export const canFileInput = document.getElementById("can-file-input");
export const playPauseBtn = document.getElementById("play-pause-btn");
export const stopBtn = document.getElementById("stop-btn");
export const timelineSlider = document.getElementById("timeline-slider");
export const frameCounter = document.getElementById("frame-counter");
export const offsetInput = document.getElementById("offset-input");
export const speedSlider = document.getElementById("speed-slider");
export const speedDisplay = document.getElementById("speed-display");
export const featureToggles = document.getElementById("feature-toggles");
export const toggleSnrColor = document.getElementById("toggle-snr-color");
export const toggleClusterColor = document.getElementById(
  "toggle-cluster-color"
);
export const toggleInlierColor = document.getElementById("toggle-inlier-color");
export const toggleStationaryColor = document.getElementById(
  "toggle-stationary-color"
);
export const toggleVelocity = document.getElementById("toggle-velocity");
export const toggleTracks = document.getElementById("toggle-tracks");
export const toggleEgoSpeed = document.getElementById("toggle-ego-speed");
export const toggleFrameNorm = document.getElementById("toggle-frame-norm");
export const toggleDebugOverlay = document.getElementById(
  "toggle-debug-overlay"
);
export const egoSpeedDisplay = document.getElementById("ego-speed-display");
export const canSpeedDisplay = document.getElementById("can-speed-display");
export const debugOverlay = document.getElementById("debug-overlay");
export const toggleDebug2Overlay = document.getElementById(
  "toggle-debug2-overlay"
);
export const snrMinInput = document.getElementById("snr-min-input");
export const snrMaxInput = document.getElementById("snr-max-input");
export const applySnrBtn = document.getElementById("apply-snr-btn");
export const autoOffsetIndicator = document.getElementById(
  "auto-offset-indicator"
);
export const clearCacheBtn = document.getElementById("clear-cache-btn");
export const speedGraphContainer = document.getElementById(
  "speed-graph-container"
);
export const speedGraphPlaceholder = document.getElementById(
  "speed-graph-placeholder"
);
export const modalContainer = document.getElementById("modal-container");
export const modalOverlay = document.getElementById("modal-overlay");
export const modalContent = document.getElementById("modal-content");
export const modalText = document.getElementById("modal-text");
export const modalOkBtn = document.getElementById("modal-ok-btn");
export const modalCancelBtn = document.getElementById("modal-cancel-btn");
export const toggleCloseUp = document.getElementById("toggle-close-up");

//----------------------UPDATE FRAME Function----------------------//
// Updates the UI to reflect the current radar frame and synchronizes video playback.
export function updateFrame(frame, forceVideoSeek) {
  if (
    !appState.vizData ||
    frame < 0 ||
    frame >= appState.vizData.radarFrames.length
  ) // Exit if no visualization data or invalid frame.
    return; // Exit if no visualization data or invalid frame
  appState.currentFrame = frame;
  timelineSlider.value = appState.currentFrame;
  frameCounter.textContent = `Frame: ${appState.currentFrame + 1} / ${
    appState.vizData.radarFrames.length
  }`;
  const frameData = appState.vizData.radarFrames[appState.currentFrame];
  if (toggleEgoSpeed.checked && frameData) { // Update ego speed display if enabled.
    const egoVy_kmh = (frameData.egoVelocity[1] * 3.6).toFixed(1); // Convert m/s to km/h and format
    egoSpeedDisplay.textContent = `Ego: ${egoVy_kmh} km/h`;
    egoSpeedDisplay.classList.remove("hidden");
  } else {
    egoSpeedDisplay.classList.add("hidden"); // Hide ego speed display.
  }

  // --- Start of fix ---
  let timeForUpdates = videoPlayer.currentTime; // NEW: Default to the video's current time

  if (
    forceVideoSeek &&
    videoPlayer.src &&
    videoPlayer.readyState > 1 &&
    appState.videoStartDate &&
    frameData
  ) {
    const offsetMs = parseFloat(offsetInput.value) || 0;
    const targetRadarTimeMs = frameData.timestampMs;
    const targetVideoTimeSec = (targetRadarTimeMs - offsetMs) / 1000;
    if (targetVideoTimeSec >= 0 && targetVideoTimeSec <= videoPlayer.duration) { // Ensure target time is within video duration
      if (Math.abs(videoPlayer.currentTime - targetVideoTimeSec) > 0.05) { // Check for significant drift
        videoPlayer.currentTime = targetVideoTimeSec; // Seek video if drift is significant
      }
      // MODIFIED: Use the calculated target time for our updates, not the stale videoPlayer.currentTime
      timeForUpdates = targetVideoTimeSec; // Update time for subsequent UI updates
    }
  } // End of forceVideoSeek block

  if (!appState.isPlaying) {
    // MODIFIED: Use our new synchronized time variable
    updateCanDisplay(timeForUpdates);
    updateDebugOverlay(timeForUpdates);
  }
  // --- End of fix ---

  if (appState.p5_instance) appState.p5_instance.redraw(); // Redraw radar sketch
  if (appState.speedGraphInstance && !appState.isPlaying) // Redraw speed graph if not playing.
    appState.speedGraphInstance.redraw();
}

//----------------------RESET VISUALIZATION Function----------------------//
// Resets the visualization to its initial state.
export function resetVisualization() {
  appState.isPlaying = false;
  playPauseBtn.textContent = "Play";
  const numFrames = appState.vizData.radarFrames.length;
  timelineSlider.max = numFrames > 0 ? numFrames - 1 : 0;
  updateFrame(0, true); // Update to the first frame and force video seek
}

//----------------------CAN DISPLAY UPDATE Function----------------------//
// Updates the CAN speed display based on the current media time.
export function updateCanDisplay(currentMediaTime) {
  if (
    appState.canData.length > 0 &&
    videoPlayer.src &&
    appState.videoStartDate
  ) {
    const videoAbsoluteTimeMs =
      appState.videoStartDate.getTime() + currentMediaTime * 1000;
    const canIndex = findLastCanIndexBefore(
      videoAbsoluteTimeMs,
      appState.canData
    );
    if (canIndex !== -1) {
      const currentCanMessage = appState.canData[canIndex]; // Get the CAN message at the found index
      canSpeedDisplay.textContent = `CAN: ${currentCanMessage.speed} km/h`; // Display CAN speed
      canSpeedDisplay.classList.remove("hidden");
    } else {
      canSpeedDisplay.classList.add("hidden"); // Hide CAN speed display
    }
  } else {
    canSpeedDisplay.classList.add("hidden"); // Hide CAN speed display.
  }
}

//----------------------DEBUG OVERLAY UPDATE Function----------------------//
// Updates the debug overlay with various synchronization and time information.
export function updateDebugOverlay(currentMediaTime) {
  // Check the state of both debug toggles
  const isDebug1Visible = toggleDebugOverlay.checked;
  const isDebug2Visible = toggleDebug2Overlay.checked;

  // If neither is checked, hide the overlay and stop
  if (!isDebug1Visible && !isDebug2Visible) {
    debugOverlay.classList.add("hidden"); // Hide debug overlay
    return;
  }
  // If at least one is checked, show the overlay
  debugOverlay.classList.remove("hidden"); // Show debug overlay.
  let content = [];
 
  // --- Logic for the original debug overlay ---
  if (isDebug1Visible) {
    content.push(`--- Basic Info ---`);
    if (appState.videoStartDate) {
      const videoAbsoluteTimeMs =
        appState.videoStartDate.getTime() + currentMediaTime * 1000;
      content.push(`Media Time (s): ${currentMediaTime.toFixed(3)}`);
      content.push(`Video Frame: ${Math.floor(currentMediaTime * VIDEO_FPS)}`);
      content.push(
        `Vid Abs Time: ${new Date(videoAbsoluteTimeMs)
          .toISOString()
          .split("T")[1]
          .replace("Z", "")}`
      ); // Format and display video absolute time
    } else {
      content.push("Video not loaded..."); // Indicate video not loaded.
    }
    if (
      appState.vizData &&
      appState.vizData.radarFrames[appState.currentFrame]
    ) {
      content.push(`Radar Frame: ${appState.currentFrame + 1}`);
      const frameTime =
        appState.vizData.radarFrames[appState.currentFrame].timestampMs;
      content.push(
        `Radar Abs Time: ${new Date(
          appState.videoStartDate.getTime() + frameTime
        )
          .toISOString()
          .split("T")[1]
          .replace("Z", "")}`
      ); // Format and display radar absolute time
    }
  } 

  // --- Logic for the new advanced debug overlay ---
  if (isDebug2Visible) {
    content.push(`--- Sync Diagnostics ---`);
    if (
      appState.videoStartDate &&
      appState.vizData &&
      appState.vizData.radarFrames[appState.currentFrame]
    ) {
      const currentRadarFrame =
        appState.vizData.radarFrames[appState.currentFrame];
      const targetRadarTimeMs = currentRadarFrame.timestampMs;
      const driftMs = currentMediaTime * 1000 - targetRadarTimeMs;

      // Style the drift value to be green if sync is good, and red if it's off.
      const driftColor = Math.abs(driftMs) > 40 ? "#FF6347" : "#98FB98"; // Tomato red or Pale green

      content.push(`Video Time (s): ${currentMediaTime.toFixed(3)}`); // Display current video time
      content.push(`Target Radar Time (ms): ${targetRadarTimeMs.toFixed(0)}`);
      content.push(
        `Drift (ms): <b style="color: ${driftColor};">${driftMs.toFixed(0)}</b>`
      );
      content.push(
        `Video Start Time: ${appState.videoStartDate.toISOString()}`
      );
      content.push(
        `Radar Start Time: ${new Date(appState.radarStartTimeMs).toISOString()}`
      );
      content.push(`Calculated Offset (ms): ${offsetInput.value}`); // Display calculated offset.
    } else {
      content.push("Load video and radar data to see sync info."); // Prompt to load data.
    }
  }

  debugOverlay.innerHTML = content.join("<br>"); // Update debug overlay content.
}
