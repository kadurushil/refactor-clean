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
import { findRadarFrameIndexForTime, precomputeRadarVideoSync } from "./utils.js";
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

  // Re-Bake: Overwrite the pre-calculated sync times with the new offset.
  precomputeRadarVideoSync(appState.vizData, appState.offset);

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
    const targetVideoTimeSec = frameData.videoSyncedTime;

    if (targetVideoTimeSec >= 0 && videoPlayer.duration && targetVideoTimeSec <= videoPlayer.duration) {
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

  // --- START: FIX for Overlay Visibility During Scrubbing ---
  // Update overlays here to ensure they refresh when scrubbing while paused.
  updatePersistentOverlays(videoPlayer.currentTime);
  updateDebugOverlay(videoPlayer.currentTime);
  // --- END: FIX for Overlay Visibility During Scrubbing ---
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
  if (debugFlags.sync) {
    console.log(`[${performance.now().toFixed(3)}] vfc_DEBUG: videoFrameCallback running.`);
  }

  if (!appState.isPlaying || videoPlayer.paused || !appState.vizData) {
    return;
  }

  // 1. Get the video's current time directly from the callback metadata.
  const videoCurrentTime = metadata.mediaTime;

  // 2. Find the corresponding radar frame index.
  const frameIndex = findRadarFrameIndexForTime(videoCurrentTime, appState.vizData);

  // 3. Update the application state if the frame has changed.
  if (frameIndex !== appState.currentFrame) {
    appState.currentFrame = frameIndex;
    // This is the ONLY state this function should change. All UI updates are in animationLoop.
  }

  // Re-register the callback for the next frame to create a loop
  videoPlayer.requestVideoFrameCallback(videoFrameCallback);
}

/**
 * RENDER LOOP: Runs on the monitor's refresh rate (~60+ FPS).
 * Its ONLY job is to draw the current state. It does NO data calculation.
 */
export function animationLoop() {
  if (debugFlags.sync) {
    console.log(`[${performance.now().toFixed(3)}] anim_DEBUG: animationLoop running.`);
  }

  // The render loop is responsible for ALL UI updates, ensuring perfect sync.
  updateFrame(appState.currentFrame);

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

let timelineDebounceTimer;
export function handleTimelineInput(event) {
  if (!appState.vizData) return;

  // 1. If playing, pause playback to allow scrubbing.
  if (appState.isPlaying) {
    pausePlayback();
    appState.isPlaying = false;
    playPauseBtn.textContent = "Play";
  }

  // 2. Get the target frame from the slider.
  const frame = parseInt(event.target.value, 10);

  // 3. Update UI immediately for responsiveness, but WITHOUT forcing a video seek.
  updateFrame(frame, false);
  if (appState.p5_instance) appState.p5_instance.redraw();
  if (appState.speedGraphInstance) appState.speedGraphInstance.redraw();

  // 4. Use a debouncer to perform the expensive video seek after the user stops dragging.
  clearTimeout(timelineDebounceTimer);
  timelineDebounceTimer = setTimeout(() => {
    updateFrame(appState.currentFrame, true); // Perform final, precise video seek.
  }, 300); // 300ms delay after last input event.
}

let lastScrollTime = 0;
let scrollSpeed = 0;
let seekDebounceTimer;

function handleTimelineWheel(event) {
  if (!appState.vizData) return;
  event.preventDefault(); // Prevent default page scroll

  // 1. Pause playback if the user starts scrubbing.
  if (appState.isPlaying) {
    pausePlayback();
    appState.isPlaying = false;
    playPauseBtn.textContent = "Play";
  }

  // 2. Calculate scroll speed to create a dynamic seek amount.
  const now = performance.now();
  const timeDelta = now - (lastScrollTime || now);
  lastScrollTime = now;
  scrollSpeed = timeDelta > 0 ? 1000 / timeDelta : scrollSpeed;

  // 3. Map scroll speed to an acceleration curve.
  // The sensitivity value (e.g., 4) can be adjusted for more/less acceleration.
  const speedMultiplier = 1 + Math.floor(scrollSpeed / 4);
  const seekAmount = Math.max(1, speedMultiplier); // Ensure we always move at least 1 frame.

  // 4. Calculate the new frame index.
  const direction = Math.sign(event.deltaY);
  // FIX: Invert the direction. Scrolling down (positive deltaY) should advance the frame.
  let newFrame = appState.currentFrame - direction * seekAmount;

  // 5. Clamp the new frame to the valid range.
  const totalFrames = appState.vizData.radarFrames.length - 1;
  newFrame = Math.max(0, Math.min(newFrame, totalFrames));

  // 6. Update the UI immediately for responsive feedback, but WITHOUT forcing a video seek.
  // This makes the slider feel fast without causing video stutter.
  updateFrame(newFrame, false);
  // --- START: Immediate Redraw for Responsiveness ---
  // Manually trigger redraws here so the radar visualization updates as the user scrolls.
  if (appState.p5_instance) appState.p5_instance.redraw();
  if (appState.speedGraphInstance) appState.speedGraphInstance.redraw();
  // --- END: Immediate Redraw for Responsiveness ---

  // 7. Use a debouncer for the expensive video seek. This will only run once
  // after the user has finished scrolling, ensuring a final, precise sync.
  clearTimeout(seekDebounceTimer);
  seekDebounceTimer = setTimeout(() => {
    // Perform the final, expensive video seek.
    updateFrame(appState.currentFrame, true);
  }, 300); // 300ms delay after the last scroll event.
}

export function initSyncUIHandlers() {
  timelineSlider.addEventListener("input", handleTimelineInput);
  timelineSlider.addEventListener("wheel", handleTimelineWheel, { passive: false });
}
