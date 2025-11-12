import { appState } from "./state.js";
import {
  videoPlayer,
  speedSlider,
  offsetInput,
  stopBtn,
  playPauseBtn,
  updateFrame,
  updateDebugOverlay,
  updatePersistentOverlays,
} from "./dom.js";
import { findRadarFrameIndexForTime } from "./utils.js";


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
