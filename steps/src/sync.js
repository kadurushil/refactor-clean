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
  canvasContainer,
  toggleEgoSpeed,
  egoSpeedDisplay,
  canSpeedDisplay,
  autoOffsetIndicator,
  speedGraphContainer
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

export function forceResyncWithOffset(saveToDb = true) {
  // Make sure visualization data is loaded before proceeding
  if (!appState.vizData) return;

  const newOffset = parseFloat(offsetInput.value) || 0;
  appState.offset = newOffset; // Update the central state
  
  // Persist the manual offset to IndexedDB for this specific file
  if (saveToDb && appState.jsonFilename) {
      saveManualOffset(appState.jsonFilename, newOffset);
  }

  // Re-Bake: Overwrite the pre-calculated sync times with the new offset.
  precomputeRadarVideoSync(appState.vizData, appState.offset);

  // --- START: Manual Offset UI Update ---
  // When the user manually sets an offset, we need to update the UI immediately.
  autoOffsetIndicator.textContent = "Manual"; // Set text
  autoOffsetIndicator.className = "text-xs font-bold ml-2 text-gray-500"; // Use consistent gray styling
  // --- END: Manual Offset UI Update ---
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
        videoPlayer.currentTime = targetVideoTimeSec; // Seek video if drift is significant
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

let lastVideoScrollTime = 0;
let videoScrollSpeed = 0;
let videoSeekDebounceTimer;
let targetVideoTime = null; // NEW: State variable to track target time during scroll


function handleTimelineWheel(event) {
  // If no data, or if close-up mode is active, do not seek.
  // The wheel event is used for zooming in close-up mode, unless Shift is held.
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
  // The sensitivity value (e.g., 4) can be adjusted for more/less acceleration.
  const speedMultiplier = 1 + Math.floor(scrollSpeed / 4);
  const seekAmount = Math.max(1, speedMultiplier); // Ensure we always move at least 1 frame.

  // 4. Calculate the new frame index.
  const direction = Math.sign(event.deltaY);
  // Scrolling down (positive deltaY) should advance the frame (increase index).
  let newFrame = appState.currentFrame + direction * seekAmount;

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

function handleVideoPanelWheel(event) {
  if (!appState.vizData || !videoPlayer.src || videoPlayer.duration <= 0) return;
  event.preventDefault(); // Prevent default page scroll

  // 1. On the first scroll event, pause playback and initialize our target time.
  if (appState.isPlaying) {
    pausePlayback();
    appState.isPlaying = false;
    playPauseBtn.textContent = "Play";
  }
  if (targetVideoTime === null) {
    targetVideoTime = videoPlayer.currentTime;
  }

  // 2. Calculate scroll speed for acceleration.
  const now = performance.now();
  const timeDelta = now - (lastVideoScrollTime || now);
  lastVideoScrollTime = now;
  videoScrollSpeed = timeDelta > 0 ? 1000 / timeDelta : videoScrollSpeed;

  // 3. Map scroll speed to an acceleration curve.
  const speedMultiplier = Math.floor(videoScrollSpeed / 8);
  const seekAmount = Math.max(1, speedMultiplier); // Always move at least 1 frame.

  // 4. Calculate the new target time based on our stateful variable.
  const direction = Math.sign(event.deltaY);
  const timeIncrement = (direction * seekAmount) / VIDEO_FPS;
  targetVideoTime += timeIncrement;

  // 5. Clamp the new time to the video's bounds.
  targetVideoTime = Math.max(0, Math.min(targetVideoTime, videoPlayer.duration));

  // 6. Find the corresponding radar frame for the new target time.
  const newRadarFrame = findRadarFrameIndexForTime(targetVideoTime, appState.vizData);

  console.log('--- Video Wheel Debug ---');
  console.log(`Scroll Speed: ${videoScrollSpeed.toFixed(2)}`);
  console.log(`Seek Amount (frames): ${seekAmount}`);
  console.log(`Time Increment (s): ${timeIncrement.toFixed(4)}`);
  console.log(`New Target Time (s): ${targetVideoTime.toFixed(4)}`);
  console.log(`New Radar Frame: ${newRadarFrame}`);

  // 7. Update the UI immediately for responsive feedback, but WITHOUT forcing a video seek.
  updateFrame(newRadarFrame, false, targetVideoTime);
  if (appState.p5_instance) appState.p5_instance.redraw();
  if (appState.speedGraphInstance) appState.speedGraphInstance.redraw();

  // 8. Use a debouncer for the expensive video seek.
  clearTimeout(videoSeekDebounceTimer);
  videoSeekDebounceTimer = setTimeout(() => {
    console.log(`--- Debounced Seek Fired ---`);
    console.log(`Final Seek Time (s): ${targetVideoTime.toFixed(4)}`);
    // Perform the final, expensive video seek.
    videoPlayer.currentTime = targetVideoTime;
    // Reset the state variable, so the next scroll interaction starts fresh.
    targetVideoTime = null;
    lastVideoScrollTime = 0; // Also reset scroll time to prevent huge initial jump
    videoScrollSpeed = 0; // FIX: Reset scroll speed to prevent "sticky" acceleration.
  }, 150);
}


export function initSyncUIHandlers() {
  timelineSlider.addEventListener("input", handleTimelineInput);
  timelineSlider.addEventListener("wheel", handleTimelineWheel, {
    passive: false,
  });
  // Use the canvas container for radar frame seeking
  canvasContainer.addEventListener("wheel", handleTimelineWheel, {
    passive: false,
  });
  // Use the video player for video frame seeking
  videoPlayer.addEventListener("wheel", handleVideoPanelWheel, {
    passive: false,
  });
  // Use the speed graph container for radar frame seeking
  speedGraphContainer.addEventListener("wheel", handleTimelineWheel, {
    passive: false,
  });
}
