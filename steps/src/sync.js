import { appState } from "./state.js";
import {
  timelineSlider,
  offsetInput,
  stopBtn,
  playPauseBtn,
  updateDebugOverlay,
  updatePersistentOverlays,
  videoPlayer,
  videoSeekingBadge,
  frameCounter,
  canvasContainer,
  toggleEgoSpeed,
  egoSpeedDisplay,
  canSpeedDisplay,
  autoOffsetIndicator,
  speedGraphContainer,
  setOffsetToggleMode,
} from "./dom.js";
import { VIDEO_FPS } from "./constants.js";
import { findRadarFrameIndexForTime, precomputeRadarVideoSync } from "./utils.js";
import { throttledUpdateExplorer, isExplorerOpen } from "./dataExplorer.js";
import { debugFlags } from "./debug.js";
import { saveManualOffset } from "./db.js";

// --- [START] MOVED FROM DOM.JS ---


//----------------------RESET VISUALIZATION Function----------------------//
// Resets the visualization to its initial state.
export function resetVisualization() {
  appState.isPlaying = false;
  playPauseBtn.textContent = "Play";
  
  if (appState.vizData) {
    const numFrames = appState.vizData.radarFrames.length;
    timelineSlider.max = numFrames > 0 ? numFrames - 1 : 0;
    updateFrame(0, true); // Update to the first frame and force video seek
  } else {
    timelineSlider.max = 0;
    timelineSlider.value = 0;
    if (videoPlayer.src) {
      videoPlayer.currentTime = 0;
    }
  }
}

// --- NEW Playback Control Functions ---

export function startPlayback() {
  hideSeekingBadge();
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

export function forceResyncWithOffset(saveToDb = true) {
  // Make sure visualization data is loaded before proceeding
  if (!appState.vizData) return;

  const newOffset = parseFloat(offsetInput.value) || 0;
  appState.offset = newOffset; // Update the central state

  // If user explicitly saves/applies a manual offset, disable frame map hard lock
  if (saveToDb && appState.hasFrameMapping) {
    appState.hasFrameMapping = false;
    console.log("Switched from frame_mapping sync to Manual offset mode.");
  }
  
  // Persist the manual offset to IndexedDB for this specific file
  if (saveToDb && appState.jsonFilename) {
      saveManualOffset(appState.jsonFilename, newOffset);
  }

  // Re-Bake: Overwrite the pre-calculated sync times with the new offset.
  precomputeRadarVideoSync(appState.vizData, appState.offset);

  // Update UI toggle switch to Manual mode only when a manual override is active
  if (saveToDb || !appState.hasFrameMapping) {
    setOffsetToggleMode("manual");
  }
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
export function updateFrame(frame, forceVideoSeek = false, overrideTime = null) {
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
  
  // --- Optimization: Guarded Text Updates ---
  const newFrameText = `Frame: ${appState.currentFrame + 1} / ${appState.vizData.radarFrames.length}`;
  if (frameCounter.textContent !== newFrameText) {
      frameCounter.textContent = newFrameText;
  }

  const frameData = appState.vizData.radarFrames[appState.currentFrame];
  if (toggleEgoSpeed.checked && frameData) {
    // Update ego speed display if enabled.
    const egoVy_kmh = (frameData.egoVelocity[1] * 3.6).toFixed(1); // Convert m/s to km/h and format
    const newEgoText = `Ego: ${egoVy_kmh} km/h`;
    
    if (egoSpeedDisplay.textContent !== newEgoText) {
        egoSpeedDisplay.textContent = newEgoText;
    }
    if (egoSpeedDisplay.classList.contains("hidden")) {
        egoSpeedDisplay.classList.remove("hidden");
    }
  } else {
    if (!egoSpeedDisplay.classList.contains("hidden")) {
        egoSpeedDisplay.classList.add("hidden"); // Hide ego speed display.
    }
  }

  // --- ADD THIS NEW BLOCK ---
  if (
    frameData &&
    frameData.canVehSpeed_kmph !== null &&
    !isNaN(frameData.canVehSpeed_kmph)
  ) {
    const newCanText = `CAN: ${frameData.canVehSpeed_kmph.toFixed(1)} km/h`;
    if (canSpeedDisplay.textContent !== newCanText) {
        canSpeedDisplay.textContent = newCanText;
    }
    if (canSpeedDisplay.classList.contains("hidden")) {
        canSpeedDisplay.classList.remove("hidden");
    }
  } else {
    if (!canSpeedDisplay.classList.contains("hidden")) {
        canSpeedDisplay.classList.add("hidden");
    }
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
        showSeekingBadge();
        videoPlayer.currentTime = targetVideoTimeSec; // Seek video if drift is significant
      } else {
        checkAndClearSeekingState();
      }
      // MODIFIED: Use the calculated target time for our updates, not the stale videoPlayer.currentTime
    }
  } // End of forceVideoSeek block

  // The animationLoop is now responsible for all redraws.
  // We no longer call redraw() from here.

  // --- NEW: Centralized Explorer Update ---
  if (isExplorerOpen) {
      throttledUpdateExplorer();
  }
  // --- END: Centralized Explorer Update ---
  const endTime = performance.now();
  appState.lastFrameRenderTime = endTime - startTime; // <-- End timer and update state

  // --- START: FIX for Overlay Visibility During Scrubbing ---
  // Update overlays here to ensure they refresh when scrubbing while paused.
  // If an overrideTime is provided (e.g., from a scroll-seek), use it.
  // Otherwise, use the video player's current time.
  const displayTime = overrideTime !== null ? overrideTime : videoPlayer.currentTime;
  updatePersistentOverlays(displayTime);
  updateDebugOverlay(displayTime);
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

let isVideoSeeking = false;
let pendingPlayRequest = false;
let lastFastSeekTime = 0;
let timelineDebounceTimer = null;
let seekDebounceTimer = null;
let videoSeekDebounceTimer = null;
let safetyHideTimer = null;

export function isVideoSeekingPending() {
  return (
    isVideoSeeking ||
    (videoPlayer && videoPlayer.seeking) ||
    !!timelineDebounceTimer ||
    !!seekDebounceTimer ||
    !!videoSeekDebounceTimer
  );
}

export function setPendingPlayRequest(val) {
  pendingPlayRequest = val;
}

export function showSeekingBadge() {
  if (videoSeekingBadge && videoPlayer && videoPlayer.src && !appState.videoMissing) {
    videoSeekingBadge.classList.remove("hidden");

    // Safety fallback: auto-clear if seeked event is skipped or delayed beyond 800ms
    if (safetyHideTimer) clearTimeout(safetyHideTimer);
    safetyHideTimer = setTimeout(() => {
      safetyHideTimer = null;
      checkAndClearSeekingState();
    }, 800);
  }
}

export function hideSeekingBadge() {
  if (safetyHideTimer) {
    clearTimeout(safetyHideTimer);
    safetyHideTimer = null;
  }
  if (videoSeekingBadge) {
    videoSeekingBadge.classList.add("hidden");
  }
}

export function checkAndClearSeekingState() {
  if (!timelineDebounceTimer && !seekDebounceTimer && !videoSeekDebounceTimer) {
    if (!videoPlayer || !videoPlayer.seeking || appState.isPlaying) {
      isVideoSeeking = false;
      hideSeekingBadge();
    }
  }
}

export function performFastVideoSeek(targetTimeSec) {
  if (
    !videoPlayer ||
    !videoPlayer.src ||
    appState.videoMissing ||
    videoPlayer.readyState <= 1 ||
    isNaN(targetTimeSec)
  )
    return;

  const now = performance.now();
  if (!videoPlayer.seeking && now - lastFastSeekTime >= 60) {
    lastFastSeekTime = now;
    showSeekingBadge();
    if (typeof videoPlayer.fastSeek === "function") {
      videoPlayer.fastSeek(targetTimeSec);
    } else {
      videoPlayer.currentTime = targetTimeSec;
    }
  }
}

function handleVideoSeeking() {
  isVideoSeeking = true;
  showSeekingBadge();
}

function handleVideoSeeked() {
  isVideoSeeking = false;
  checkAndClearSeekingState();

  if (pendingPlayRequest) {
    pendingPlayRequest = false;
    if (!appState.isPlaying) {
      appState.isPlaying = true;
      playPauseBtn.textContent = "Pause";
      startPlayback();
    }
  }
}

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

  // 3. Update UI immediately for responsiveness.
  updateFrame(frame, false);
  if (appState.p5_instance) appState.p5_instance.redraw();
  if (appState.speedGraphInstance) appState.speedGraphInstance.redraw();

  // 4. Show visual seeking cue & attempt intermediate fast seek while scrubbing.
  showSeekingBadge();
  const frameData = appState.vizData.radarFrames[frame];
  if (frameData && typeof frameData.videoSyncedTime === "number") {
    performFastVideoSeek(frameData.videoSyncedTime);
  }

  // 5. Use a reduced debouncer (100ms) to perform final precise video seek after dragging stops.
  clearTimeout(timelineDebounceTimer);
  timelineDebounceTimer = setTimeout(() => {
    timelineDebounceTimer = null;
    updateFrame(appState.currentFrame, true); // Perform final, precise video seek.
    checkAndClearSeekingState();
  }, 100);
}

let lastScrollTime = 0;
let scrollSpeed = 0;

let lastVideoScrollTime = 0;
let videoScrollSpeed = 0;
let targetVideoTime = null; // State variable to track target time during scroll

function handleTimelineWheel(event) {
  // If no data, or if close-up mode is active, do not seek.
  if (!appState.vizData || (appState.isCloseUpMode && !event.shiftKey)) {
    return;
  }

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
  const speedMultiplier = 1 + Math.floor(scrollSpeed / 4);
  const seekAmount = Math.max(1, speedMultiplier);

  // 4. Calculate the new frame index.
  const direction = Math.sign(event.deltaY);
  let newFrame = appState.currentFrame + direction * seekAmount;

  // 5. Clamp the new frame to the valid range.
  const totalFrames = appState.vizData.radarFrames.length - 1;
  newFrame = Math.max(0, Math.min(newFrame, totalFrames));

  // 6. Update the UI immediately for responsive feedback.
  updateFrame(newFrame, false);
  if (appState.p5_instance) appState.p5_instance.redraw();
  if (appState.speedGraphInstance) appState.speedGraphInstance.redraw();

  // 7. Show seeking badge & perform intermediate fast seek during wheel scroll
  showSeekingBadge();
  const frameData = appState.vizData.radarFrames[newFrame];
  if (frameData && typeof frameData.videoSyncedTime === "number") {
    performFastVideoSeek(frameData.videoSyncedTime);
  }

  // 8. Reduced debouncer (100ms) for final precise seek.
  clearTimeout(seekDebounceTimer);
  seekDebounceTimer = setTimeout(() => {
    seekDebounceTimer = null;
    updateFrame(appState.currentFrame, true);
    checkAndClearSeekingState();
  }, 100);
}

function handleVideoPanelWheel(event) {
  if (!appState.vizData || !videoPlayer.src || videoPlayer.duration <= 0) return;
  event.preventDefault();

  if (appState.isPlaying) {
    pausePlayback();
    appState.isPlaying = false;
    playPauseBtn.textContent = "Play";
  }
  if (targetVideoTime === null) {
    targetVideoTime = videoPlayer.currentTime;
  }

  const now = performance.now();
  const timeDelta = now - (lastVideoScrollTime || now);
  lastVideoScrollTime = now;
  videoScrollSpeed = timeDelta > 0 ? 1000 / timeDelta : videoScrollSpeed;

  const speedMultiplier = Math.floor(videoScrollSpeed / 8);
  const seekAmount = Math.max(1, speedMultiplier);

  const direction = Math.sign(event.deltaY);
  const timeIncrement = (direction * seekAmount) / VIDEO_FPS;
  targetVideoTime += timeIncrement;

  targetVideoTime = Math.max(0, Math.min(targetVideoTime, videoPlayer.duration));

  const newRadarFrame = findRadarFrameIndexForTime(targetVideoTime, appState.vizData);

  updateFrame(newRadarFrame, false, targetVideoTime);
  if (appState.p5_instance) appState.p5_instance.redraw();
  if (appState.speedGraphInstance) appState.speedGraphInstance.redraw();

  showSeekingBadge();
  performFastVideoSeek(targetVideoTime);

  clearTimeout(videoSeekDebounceTimer);
  videoSeekDebounceTimer = setTimeout(() => {
    videoSeekDebounceTimer = null;
    videoPlayer.currentTime = targetVideoTime;
    targetVideoTime = null;
    lastVideoScrollTime = 0;
    videoScrollSpeed = 0;
    checkAndClearSeekingState();
  }, 100);
}

export function initSyncUIHandlers() {
  timelineSlider.addEventListener("input", handleTimelineInput);
  timelineSlider.addEventListener("wheel", handleTimelineWheel, {
    passive: false,
  });
  canvasContainer.addEventListener("wheel", handleTimelineWheel, {
    passive: false,
  });
  videoPlayer.addEventListener("wheel", handleVideoPanelWheel, {
    passive: false,
  });
  speedGraphContainer.addEventListener("wheel", handleTimelineWheel, {
    passive: false,
  });

  videoPlayer.addEventListener("seeking", handleVideoSeeking);
  videoPlayer.addEventListener("seeked", handleVideoSeeked);
}
