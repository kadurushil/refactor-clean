import { appState } from './state.js';
import { findLastCanIndexBefore } from './utils.js';
import { VIDEO_FPS } from './constants.js';

// --- DOM Element References --- //


export const canvasContainer = document.getElementById('canvas-container');
export const canvasPlaceholder = document.getElementById('canvas-placeholder');
export const videoPlayer = document.getElementById('video-player');
export const videoPlaceholder = document.getElementById('video-placeholder');
export const loadJsonBtn = document.getElementById('load-json-btn');
export const loadVideoBtn = document.getElementById('load-video-btn');
export const loadCanBtn = document.getElementById('load-can-btn');
export const jsonFileInput = document.getElementById('json-file-input');
export const videoFileInput = document.getElementById('video-file-input');
export const canFileInput = document.getElementById('can-file-input');
export const playPauseBtn = document.getElementById('play-pause-btn');
export const stopBtn = document.getElementById('stop-btn');
export const timelineSlider = document.getElementById('timeline-slider');
export const frameCounter = document.getElementById('frame-counter');
export const offsetInput = document.getElementById('offset-input');
export const speedSlider = document.getElementById('speed-slider');
export const speedDisplay = document.getElementById('speed-display');
export const featureToggles = document.getElementById('feature-toggles');
export const toggleSnrColor = document.getElementById('toggle-snr-color');
export const toggleClusterColor = document.getElementById('toggle-cluster-color');
export const toggleInlierColor = document.getElementById('toggle-inlier-color');
export const toggleStationaryColor = document.getElementById('toggle-stationary-color');
export const toggleVelocity = document.getElementById('toggle-velocity');
export const toggleTracks = document.getElementById('toggle-tracks');
export const toggleEgoSpeed = document.getElementById('toggle-ego-speed');
export const toggleFrameNorm = document.getElementById('toggle-frame-norm');
export const toggleDebugOverlay = document.getElementById('toggle-debug-overlay');
export const egoSpeedDisplay = document.getElementById('ego-speed-display');
export const canSpeedDisplay = document.getElementById('can-speed-display');
export const debugOverlay = document.getElementById('debug-overlay');
export const snrMinInput = document.getElementById('snr-min-input');
export const snrMaxInput = document.getElementById('snr-max-input');
export const applySnrBtn = document.getElementById('apply-snr-btn');
export const autoOffsetIndicator = document.getElementById('auto-offset-indicator');
export const clearCacheBtn = document.getElementById('clear-cache-btn');
export const speedGraphContainer = document.getElementById('speed-graph-container');
export const speedGraphPlaceholder = document.getElementById('speed-graph-placeholder');
export const modalContainer = document.getElementById('modal-container');
export const modalOverlay = document.getElementById('modal-overlay');
export const modalContent = document.getElementById('modal-content');
export const modalText = document.getElementById('modal-text');
export const modalOkBtn = document.getElementById('modal-ok-btn');
export const modalCancelBtn = document.getElementById('modal-cancel-btn');
export const toggleCloseUp = document.getElementById('toggle-close-up');

//----------------------UPDATE FRAME Function----------------------//

export function updateFrame(frame, forceVideoSeek) {
    if (!appState.vizData || frame < 0 || frame >= appState.vizData.radarFrames.length) return;
    appState.currentFrame = frame;
    timelineSlider.value = appState.currentFrame;
    frameCounter.textContent = `Frame: ${appState.currentFrame + 1} / ${appState.vizData.radarFrames.length}`;
    const frameData = appState.vizData.radarFrames[appState.currentFrame];
    if (toggleEgoSpeed.checked && frameData) {
        const egoVy_kmh = (frameData.egoVelocity[1] * 3.6).toFixed(1);
        egoSpeedDisplay.textContent = `Ego: ${egoVy_kmh} km/h`;
        egoSpeedDisplay.classList.remove('hidden');
    } else {
        egoSpeedDisplay.classList.add('hidden');
    }
    if (forceVideoSeek && videoPlayer.src && videoPlayer.readyState > 1 && appState.videoStartDate && frameData) {
        const offsetMs = parseFloat(offsetInput.value) || 0;
        const targetRadarTimeMs = frameData.timestampMs;
        const targetVideoTimeSec = (targetRadarTimeMs - offsetMs) / 1000;
        if (targetVideoTimeSec >= 0 && targetVideoTimeSec <= videoPlayer.duration) {
            if (Math.abs(videoPlayer.currentTime - targetVideoTimeSec) > 0.05) {
                videoPlayer.currentTime = targetVideoTimeSec;
            }
        }
    }
    if (!appState.isPlaying) {
        updateCanDisplay(videoPlayer.currentTime);
        updateDebugOverlay(videoPlayer.currentTime);
    }
    if (appState.p5_instance) appState.p5_instance.redraw();
    if (appState.speedGraphInstance && !appState.isPlaying) appState.speedGraphInstance.redraw();
}

//----------------------RESET VISUALIZATION Function----------------------//


export function resetVisualization() {
    appState.isPlaying = false;
    playPauseBtn.textContent = 'Play';
    const numFrames = appState.vizData.radarFrames.length;
    timelineSlider.max = numFrames > 0 ? numFrames - 1 : 0;
    updateFrame(0, true);
}


//----------------------CAN DISPLAY UPDATE Function----------------------//



export function updateCanDisplay(currentMediaTime) {
    if (appState.canData.length > 0 && videoPlayer.src && appState.videoStartDate) {
        const videoAbsoluteTimeMs = appState.videoStartDate.getTime() + (currentMediaTime * 1000);
        const canIndex = findLastCanIndexBefore(videoAbsoluteTimeMs, appState.canData);
        if (canIndex !== -1) {
            const currentCanMessage = appState.canData[canIndex];
            canSpeedDisplay.textContent = `CAN: ${currentCanMessage.speed} km/h`;
            canSpeedDisplay.classList.remove('hidden');
        }
        else {
            canSpeedDisplay.classList.add('hidden');
        }
    }
    else {
        canSpeedDisplay.classList.add('hidden');
    }
}


//----------------------DEBUG OVERLAY UPDATE Function----------------------//



export function updateDebugOverlay(currentMediaTime) {
            if (!toggleDebugOverlay.checked) {
                debugOverlay.classList.add('hidden');
                return;
            } debugOverlay.classList.remove('hidden');
            let content = [];
            if (appState.videoStartDate) {
                const videoAbsoluteTimeMs = appState.videoStartDate.getTime() + (currentMediaTime * 1000);
                content.push(`Media Time (s): ${currentMediaTime.toFixed(3)}`);
                const videoFrame = Math.floor(currentMediaTime * VIDEO_FPS);
                content.push(`Video Frame: ${videoFrame}`);
                content.push(`Vid Abs Time: ${new Date(videoAbsoluteTimeMs).toISOString().split('T')[1].replace('Z', '')}`);
                if (appState.canData.length > 0) {
                    const canIndex = findLastCanIndexBefore(videoAbsoluteTimeMs, appState.canData);
                    if (canIndex !== -1) {
                        const currentCanMessage = appState.canData[canIndex];
                        content.push(`CAN Abs Time: ${new Date(currentCanMessage.time).toISOString().split('T')[1].replace('Z', '')}`);
                        content.push(`CAN Speed: ${currentCanMessage.speed} km/h`);
                    }
                    else {
                        content.push('CAN: No data for time');

                    }
                }
            }
            else {
                content.push('Video not loaded...');

            } if (appState.vizData) {
                content.push(`Radar Frame: ${appState.currentFrame + 1}`);
                if (appState.vizData.radarFrames[appState.currentFrame])
                    content.push(`Radar Abs Time: ${new Date(appState.vizData.radarFrames[appState.currentFrame].timestampMs).toISOString().split('T')[1].replace('Z', '')}`);
            } debugOverlay.innerHTML = content.join('<br>');
        }