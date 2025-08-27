import { appState } from './state.js';
import { videoPlayer, speedSlider, offsetInput, stopBtn, updateFrame, updateCanDisplay, updateDebugOverlay } from './dom.js';
import { findRadarFrameIndexForTime } from './utils.js';

/**
 * The main animation loop that drives the synchronized playback.
 * It calculates the current media time based on performance.now() for a smooth clock,
 * finds the corresponding radar frame, and handles resynchronization with the video element.
 */
export function animationLoop() {
    if (!appState.isPlaying) return;

    const playbackSpeed = parseFloat(speedSlider.value);
    const elapsedRealTime = performance.now() - appState.masterClockStart;
    const currentMediaTime = appState.mediaTimeStart + (elapsedRealTime / 1000) * playbackSpeed;

    // Update radar frame based on the master clock
    if (appState.vizData && appState.videoStartDate) {
        const offsetMs = parseFloat(offsetInput.value) || 0;
        const targetRadarTimeMs = (currentMediaTime * 1000);
        const targetFrame = findRadarFrameIndexForTime(targetRadarTimeMs, appState.vizData);
        if (targetFrame !== appState.currentFrame) {
            updateFrame(targetFrame, false);
        }
    }

    // Periodically check for drift between master clock and video element
    const now = performance.now();
    if (now - appState.lastSyncTime > 500) {
        const videoTime = videoPlayer.currentTime;
        const drift = Math.abs(currentMediaTime - videoTime);
        if (drift > 0.15) { // Resync if drift is > 150ms
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

    // Update other UI elements
    updateCanDisplay(currentMediaTime);
    updateDebugOverlay(currentMediaTime);
    if (appState.speedGraphInstance) appState.speedGraphInstance.redraw();

    // Request the next frame
    requestAnimationFrame(animationLoop);
}
