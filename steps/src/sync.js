import { appState } from "./state.js";
import {
  timelineSlider,
  offsetInput,
  stopBtn,
  playPauseBtn,
  updateDebugOverlay,
  updatePersistentOverlays,
  videoPlayer,
  frameCounter,
  toggleEgoSpeed,
  egoSpeedDisplay,
  canSpeedDisplay,
} from "./dom.js";
import { findRadarFrameIndexForTime } from "./utils.js";
import { throttledUpdateExplorer } from "./dataExplorer.js";
import { debugFlags } from "./debug.js";

// --- [START] MOVED FROM DOM.JS ---

//----------------------RESET VISUALIZATION Function----------------------//
// Resets the visualization to its initial state.
export function resetVisualization() {
  appState.isPlaying = false;
  playPauseBtn.textContent = "Play";
  const numFrames = appState.vizData.radarFrames.length;
  timelineSlider.max = numFrames > 0 ? numFrames - 1 : 0;
  updateFrame(0, true); // Update to the first frame and force video seek
}

// --- NEW Playback Control Functions ---

export function startPlayback() {
  if (videoPlayer.src && videoPlayer.readyState > 1) {
    videoPlayer.play();
    videoPlayer.requestVideoFrameCallback(videoFrameCallback); // Start the high-precision loop
  }
  requestAnimationFrame(animationLoop); // Keep rAF for non-video sync (e.g. scrubbing)
}

export function pausePlayback() {
  if (videoPlayer.src) {
    videoPlayer.pause();
  }
}

export function forceResyncWithOffset() {
  // Make sure visualization data is loaded before proceeding
  if (!appState.vizData) return;

  const newOffset = parseFloat(offsetInput.value) || 0;
  appState.offset = newOffset; // Update the central state
  localStorage.setItem("visualizerOffset", newOffset); // Persist it

  console.log(`Forcing resync with new offset: ${appState.offset}ms`);
  
  // If the video is playing, pause it to allow for precise frame tuning.
  if (appState.isPlaying) {
    // Directly pause playback and update state, avoiding a synthetic click.
    pausePlayback();
    appState.isPlaying = false;
    playPauseBtn.textContent = "Play";
  }

  // Call updateFrame, forcing it to resync the video to the current radar frame
  // using the new offset value from the input box.
  updateFrame(appState.currentFrame, true);
}

//----------------------UPDATE FRAME Function----------------------//
// Updates the UI to reflect the current radar frame and synchronizes video playback.
export function updateFrame(frame, forceVideoSeek = false) {
  const startTime = performance.now(); //start emasuring timer of performance.
  if (
    !appState.vizData ||
    frame < 0 ||
    frame >= appState.vizData.radarFrames.length
  )
    // Exit if no visualization data or invalid frame.
    return; // Exit if no visualization data or invalid frame
  appState.currentFrame = frame;
  timelineSlider.value = appState.currentFrame;
  frameCounter.textContent = `Frame: ${appState.currentFrame + 1} / ${
    appState.vizData.radarFrames.length
  }`;
  const frameData = appState.vizData.radarFrames[appState.currentFrame];
  if (toggleEgoSpeed.checked && frameData) {
    // Update ego speed display if enabled.
    const egoVy_kmh = (frameData.egoVelocity[1] * 3.6).toFixed(1); // Convert m/s to km/h and format
    egoSpeedDisplay.textContent = `Ego: ${egoVy_kmh} km/h`;
    egoSpeedDisplay.classList.remove("hidden");
  } else {
    egoSpeedDisplay.classList.add("hidden"); // Hide ego speed display.
  }

  // --- ADD THIS NEW BLOCK ---
  if (
    frameData &&
    frameData.canVehSpeed_kmph !== null &&
    !isNaN(frameData.canVehSpeed_kmph)
  ) {
    canSpeedDisplay.textContent = `CAN: ${frameData.canVehSpeed_kmph.toFixed(
      1
    )} km/h`;
    canSpeedDisplay.classList.remove("hidden");
  } else {
    canSpeedDisplay.classList.add("hidden");
  }
  // --- END OF NEW BLOCK ---
  
  if (
    forceVideoSeek &&
    videoPlayer.src &&
    videoPlayer.readyState > 1 &&
    frameData
  ) {
    // Convert frame's relative time to the video's timeline
    const targetRadarTimeSec = frameData.relativeTimeSec;
    const targetVideoTimeSec = targetRadarTimeSec + (appState.offset / 1000);


    if (targetVideoTimeSec >= 0 && targetVideoTimeSec <= videoPlayer.duration) {
      // Ensure target time is within video duration
      if (Math.abs(videoPlayer.currentTime - targetVideoTimeSec) > 0.05) {
        // Check for significant drift
        videoPlayer.currentTime = targetVideoTimeSec; // Seek video if drift is significant
      }
      // MODIFIED: Use the calculated target time for our updates, not the stale videoPlayer.currentTime
    }
  } // End of forceVideoSeek block

  // The animationLoop is now responsible for all redraws.
  // We no longer call redraw() from here.

  // --- NEW: Centralized Explorer Update ---
  throttledUpdateExplorer();
  // --- END: Centralized Explorer Update ---
  const endTime = performance.now();
  appState.lastFrameRenderTime = endTime - startTime; // <-- End timer and update state
}
// --- [END] MOVED FROM DOM.JS ---

export function stopPlayback() {
  videoPlayer.pause();
  if (appState.vizData) {
    updateFrame(0, true);
  } else if (videoPlayer.src) {
    videoPlayer.currentTime = 0;
  }
}

/**
 * DATA LOOP: Runs on the video's clock (~30 FPS).
 * Its ONLY job is to update appState.currentFrame. It does NO drawing.
 */
export function videoFrameCallback(now, metadata) {
  if (debugFlags.sync) console.log("vfc_DEBUG: videoFrameCallback running.");

  if (!appState.isPlaying || videoPlayer.paused || !appState.vizData) {
    return;
  }

  // 1. Get video time and calculate the target time on the radar's timeline.
  const videoNowSec = metadata.mediaTime;
  const targetRadarTimeSec = videoNowSec - (appState.offset / 1000);

  // 2. Find the corresponding radar frame index.
  const frameIndex = findRadarFrameIndexForTime(targetRadarTimeSec, appState.vizData);

  // 3. Update the application state. This is the ONLY state this function changes.
  if (frameIndex !== appState.currentFrame) {
    appState.currentFrame = frameIndex;
  }

  // Re-register the callback for the next frame to create a loop
  videoPlayer.requestVideoFrameCallback(videoFrameCallback);
}

/**
 * RENDER LOOP: Runs on the monitor's refresh rate (~60+ FPS).
 * Its ONLY job is to draw the current state. It does NO data calculation.
 */
export function animationLoop() {
  if (debugFlags.sync) console.log("anim_DEBUG: animationLoop running.");

  // 1. Update all UI elements based on the current frame.
  updateFrame(appState.currentFrame);

  // Update debug overlay information
  updatePersistentOverlays(videoPlayer.currentTime);
  updateDebugOverlay(videoPlayer.currentTime);

  // --- START: Centralized Redraw Logic ---
  // Explicitly redraw all active sketches in sync with the animation frame.
  if (appState.p5_instance) appState.p5_instance.redraw();
  if (appState.speedGraphInstance) appState.speedGraphInstance.redraw();
  // --- END: Centralized Redraw Logic ---

  // Request the next frame
  if (appState.isPlaying) {
    requestAnimationFrame(animationLoop);
  }
}

export function handleTimelineInput(event) {
  if (!appState.vizData) return;

  if (appState.isPlaying) {
    pausePlayback();
    appState.isPlaying = false;
    playPauseBtn.textContent = "Play";
  }

  const frame = parseInt(event.target.value, 10);
  updateFrame(frame, true); // Seek the video to the new frame
  // Manually trigger redraws since the animation loop is not running
  if (appState.p5_instance) appState.p5_instance.redraw();
  if (appState.speedGraphInstance) appState.speedGraphInstance.redraw();
}

export function initSyncUIHandlers() {
  timelineSlider.addEventListener("input", handleTimelineInput);
}
