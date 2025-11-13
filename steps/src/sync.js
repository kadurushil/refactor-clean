import { appState } from "./state.js";
import {
  timelineSlider,
  speedSlider,
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

let seekDebounceTimer = null;
let lastScrollTime = 0;
let scrollSpeed = 0;
export function startPlayback() {
  if (videoPlayer.src && videoPlayer.readyState > 1) {
    appState.masterClockStart = performance.now();
    appState.mediaTimeStart = videoPlayer.currentTime;
    appState.lastSyncTime = appState.masterClockStart;
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

  console.log(
    `Forcing resync with new offset: ${offsetInput.value}`
  );

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
export function updateFrame(frame, forceVideoSeek) {
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
    if (targetVideoTimeSec >= 0 && targetVideoTimeSec <= videoPlayer.duration) {
      // Ensure target time is within video duration
      if (Math.abs(videoPlayer.currentTime - targetVideoTimeSec) > 0.05) {
        // Check for significant drift
        videoPlayer.currentTime = targetVideoTimeSec; // Seek video if drift is significant
      }
      // MODIFIED: Use the calculated target time for our updates, not the stale videoPlayer.currentTime
      timeForUpdates = targetVideoTimeSec; // Update time for subsequent UI updates
    }
  } // End of forceVideoSeek block

  if (!appState.isPlaying) {
    // MODIFIED: Use our new synchronized time variable
    updatePersistentOverlays(timeForUpdates);
  }
  // --- End of fix ---
  // --- START: Conditional Redraw Logic ---
  // Only force a redraw from here if the animation loop is NOT running.
  // When playing, the animationLoop is responsible for redrawing.
  if (!appState.isPlaying && appState.p5_instance) appState.p5_instance.redraw();
  if (!appState.isPlaying && appState.speedGraphInstance) appState.speedGraphInstance.redraw();
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

export function videoFrameCallback(now, metadata) {
  // If the video is no longer playing, stop the callback loop.
  if (!appState.isPlaying || videoPlayer.paused) {
    return;
  }

  // This is now the main animation driver during playback.
  // It's perfectly synced with the video's frame presentation.
  const currentTime = metadata.mediaTime;
  const frameIndex = findRadarFrameIndexForTime(currentTime * 1000);

  updateFrame(frameIndex, false); // Update radar, but don't seek video.

  // Re-register the callback for the next frame to create a loop
  videoPlayer.requestVideoFrameCallback(videoFrameCallback);
}

export function animationLoop() {
  if (!appState.isPlaying) return;

  // Get the current playback speed from the slider
  const playbackSpeed = parseFloat(speedSlider.value);
  // Calculate the elapsed real time since the master clock started
  const elapsedRealTime = performance.now() - appState.masterClockStart;
  // Calculate the current media time based on the master clock, initial media time, elapsed real time, and playback speed
  const currentMediaTime =
    appState.mediaTimeStart + (elapsedRealTime / 1000) * playbackSpeed;

  // Update radar frame based on the master clock
  // Check if visualization data and video start date are available
  if (appState.vizData && appState.videoStartDate) {
    // Get the offset from the input field, default to 0 if not a valid number
    // --- START: Corrected Logic ---
    const offsetMs = parseFloat(offsetInput.value) || 0;
    // The master clock represents the VIDEO's timeline.
    // To find the corresponding RADAR time, we must add the offset.
    const targetRadarTimeMs = currentMediaTime * 1000 + offsetMs;

    const targetFrame = findRadarFrameIndexForTime(
      targetRadarTimeMs,
      appState.vizData
    );
    // --- END: Corrected Logic ---
    if (targetFrame !== appState.currentFrame) {
      // Update the displayed frame if it's different from the current one
      updateFrame(targetFrame, false);
    }
  }

  // Periodically check for drift between master clock and video element
  const now = performance.now();
  if (now - appState.lastSyncTime > 150) {
    const videoTime = videoPlayer.currentTime;
    const drift = Math.abs(currentMediaTime - videoTime);
    // Resync if drift is > 150ms
    if (drift > 0.15) {
      // Resync if drift is > 150ms
      console.warn(`Resyncing video. Drift was: ${drift.toFixed(3)}s`);
      videoPlayer.currentTime = currentMediaTime;
    }
    appState.lastSyncTime = now;
  }

  // Stop playback at the end of the video
  if (currentMediaTime >= videoPlayer.duration) {
    stopBtn.click();
    return;
  }

  // Update debug overlay information
  updatePersistentOverlays(currentMediaTime);
  updateDebugOverlay(currentMediaTime); 

  // --- START: Centralized Redraw Logic ---
  // Explicitly redraw all active sketches in sync with the animation frame.
  if (appState.p5_instance) appState.p5_instance.redraw();
  if (appState.speedGraphInstance) appState.speedGraphInstance.redraw();
  // --- END: Centralized Redraw Logic ---

  // Request the next frame
  requestAnimationFrame(animationLoop);
}

export function handleTimelineInput(event) {
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
}

export function handleTimelineWheel(event) {
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
}

export function initSyncUIHandlers() {
  timelineSlider.addEventListener("input", handleTimelineInput);
  timelineSlider.addEventListener("wheel", handleTimelineWheel);
}
