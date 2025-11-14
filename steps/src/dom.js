// TODO(sync-refactor): move sync logic into src/sync.js
import { appState } from "./state.js";
import { formatUTCTime } from "./utils.js";
import { VIDEO_FPS } from "./constants.js";
// --- DOM Element References --- //

export const themeToggleBtn = document.getElementById("theme-toggle");
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
export const toggleClusterColor = document.getElementById("toggle-cluster-color");
export const toggleInlierColor = document.getElementById("toggle-inlier-color");
export const toggleStationaryColor = document.getElementById("toggle-stationary-color");
export const toggleVelocity = document.getElementById("toggle-velocity");
export const toggleTracks = document.getElementById("toggle-tracks");
export const toggleEgoSpeed = document.getElementById("toggle-ego-speed");
export const toggleFrameNorm = document.getElementById("toggle-frame-norm");
export const toggleDebugOverlay = document.getElementById("toggle-debug-overlay");
export const egoSpeedDisplay = document.getElementById("ego-speed-display");
export const canSpeedDisplay = document.getElementById("can-speed-display");
export const debugOverlay = document.getElementById("debug-overlay");
export const toggleDebug2Overlay = document.getElementById("toggle-debug2-overlay");
export const snrMinInput = document.getElementById("snr-min-input");
export const snrMaxInput = document.getElementById("snr-max-input");
export const applySnrBtn = document.getElementById("apply-snr-btn");
export const autoOffsetIndicator = document.getElementById("auto-offset-indicator");
export const clearCacheBtn = document.getElementById("clear-cache-btn");
export const speedGraphContainer = document.getElementById("speed-graph-container");
export const speedGraphPlaceholder = document.getElementById("speed-graph-placeholder");
export const modalContainer = document.getElementById("modal-container");
export const modalOverlay = document.getElementById("modal-overlay");
export const modalContent = document.getElementById("modal-content");
export const modalText = document.getElementById("modal-text");
export const modalOkBtn = document.getElementById("modal-ok-btn");
export const modalCancelBtn = document.getElementById("modal-cancel-btn");
export const toggleCloseUp = document.getElementById("toggle-close-up");
export const togglePredictedPos = document.getElementById("toggle-predicted-pos");
export const toggleCovariance = document.getElementById("toggle-covariance");
export const modalProgressContainer = document.getElementById("modal-progress-container");
export const modalProgressBar = document.getElementById("modal-progress-bar");
export const modalProgressText = document.getElementById("modal-progress-text");
export const timelineTooltip = document.getElementById("timeline-tooltip");
export const radarInfoOverlay = document.getElementById("radar-info-overlay");
export const videoInfoOverlay = document.getElementById("video-info-overlay");
export const saveSessionBtn = document.getElementById("save-session-btn");
export const loadSessionBtn = document.getElementById("load-session-btn");
export const sessionFileInput = document.getElementById("session-file-input");
export const ttcModeDefault = document.getElementById("ttc-mode-default");
export const ttcModeCustom = document.getElementById("ttc-mode-custom");
export const customTtcPanel = document.getElementById("custom-ttc-panel");
export const ttcColorCritical = document.getElementById("ttc-color-critical");
export const ttcTimeCritical = document.getElementById("ttc-time-critical");
export const ttcColorHigh = document.getElementById("ttc-color-high");
export const ttcTimeHigh = document.getElementById("ttc-time-high");
export const ttcColorMedium = document.getElementById("ttc-color-medium");
export const ttcTimeMedium = document.getElementById("ttc-time-medium");
export const ttcColorLow = document.getElementById("ttc-color-low");
export const collapsibleMenu = document.getElementById("collapsible-menu");
export const toggleMenuBtn = document.getElementById("toggle-menu-btn");
export const fullscreenBtn = document.getElementById("fullscreen-btn");
export const mainContent = document.querySelector("main");
export const closeMenuBtn = document.getElementById("close-menu-btn");
export const fullscreenEnterIcon = document.getElementById("fullscreen-enter-icon");
export const fullscreenExitIcon = document.getElementById("fullscreen-exit-icon");
export const menuScrim = document.getElementById("menu-scrim");
export const toggleConfirmedOnly = document.getElementById("toggle-confirmed-only");
export const explorerBtn = document.getElementById("explorer-btn");


//----------------------Reset UI for New file Load----------------------//
// Resets the UI to make sure everything is clean before new files load. 
export function resetUIForNewLoad() {
    console.log("Resetting UI for new file load.");

    // Hide feature toggles
    featureToggles.classList.add("hidden");

    // Show placeholders
    canvasPlaceholder.style.display = 'flex';
    videoPlaceholder.classList.remove('hidden');

    // Hide video player and overlays
    videoPlayer.classList.add('hidden');
    videoPlayer.src = ''; // Clear the video source
    radarInfoOverlay.classList.add('hidden');
    videoInfoOverlay.classList.add('hidden');
    
    // Remove the p5 sketches completely
    if (appState.p5_instance) {
        appState.p5_instance.remove();
        appState.p5_instance = null;
    }
    if (appState.rawP5_instance) {
        appState.rawP5_instance.remove();
        appState.rawP5_instance = null;
    }
    if (appState.zoomSketchInstance) {
        appState.zoomSketchInstance.remove();
        appState.zoomSketchInstance = null;
    }
    if (appState.speedGraphInstance) {
        appState.speedGraphInstance.remove();
        appState.speedGraphInstance = null;
    }

    // Reset the speed graph container
    speedGraphPlaceholder.classList.remove('hidden');
}

//----------------------CAN DISPLAY UPDATE Function----------------------//
// Updates the CAN speed display based on the current media time.

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
      
      // The correct drift is the difference between the video's actual time and the pre-calculated "baked-in" sync time for the current radar frame.
      const driftMs = (currentMediaTime - currentRadarFrame.videoSyncedTime) * 1000;

      // Style the drift value to be green if sync is good, and red if it's off.
      const driftColor = Math.abs(driftMs) > 50 ? "#FF6347" : "#98FB98"; // Tomato red or Pale green

      content.push(`Video Time (s): ${currentMediaTime.toFixed(3)}`); // Display current video time
      content.push(`Target Radar Time (ms): ${targetRadarTimeMs.toFixed(0)}`);
      content.push(`Drift (ms): <b style="color: ${driftColor};">${driftMs.toFixed(0)}</b>`);
      content.push(`Video Start Time: ${appState.videoStartDate.toISOString()}`);
      content.push(`Radar Start Time: ${new Date(appState.radarStartTimeMs).toISOString()}`);
      content.push(`Calculated Offset (ms): ${offsetInput.value}`); // Display calculated offset.
      const renderTime = appState.lastFrameRenderTime;
      // Color is green if render time is under 33ms (~30fps budget), otherwise red
      const renderTimeColor = renderTime > 33 ? "#FF6347" : "#98FB98";
      content.push(`Frame Render Time: <b style="color: ${renderTimeColor};">${renderTime.toFixed(1)}ms</b>`);
      const videoRenderTime = appState.videoFrameRenderTime;
      // Color is green if render time is under 34ms (~30fps), otherwise red
      const videoRenderTimeColor = videoRenderTime > 34 ? "#FF6347" : "#98FB98";
      content.push(`Video Frame Time: <b style="color: ${videoRenderTimeColor};">${videoRenderTime.toFixed(1)}ms</b>`);
    } else {
      content.push("Load video and radar data to see sync info."); // Prompt to load data.
    }
  }

  debugOverlay.innerHTML = content.join("<br>"); // Update debug overlay content.
}

// This function checks the state of the color toggles and returns the active mode.
function getCurrentColorMode() {
  if (toggleSnrColor.checked) return "Color by SNR (1)";
  if (toggleClusterColor.checked) return "Color by Cluster (2)";
  if (toggleInlierColor.checked) return "Color by Inlier (3)";
  if (toggleStationaryColor.checked) return "Color by Stationary (4)";
  return "Default"; // The default mode when no specific color toggle is checked
}

export function updatePersistentOverlays(currentMediaTime) {
  // If we don't have the necessary data, hide the overlays and exit.
  const isDebug1Visible = toggleDebugOverlay.checked;
  const isDebug2Visible = toggleDebug2Overlay.checked;

  if (!appState.vizData || !appState.videoStartDate) {
    radarInfoOverlay.classList.add("hidden");
    videoInfoOverlay.classList.add("hidden");
    return;
  }
  if (isDebug1Visible && isDebug2Visible) {
    radarInfoOverlay.classList.add("hidden");
    videoInfoOverlay.classList.add("hidden");
    return;
  }
  if(isDebug1Visible || isDebug2Visible){
    videoInfoOverlay.classList.add("hidden");
    return;
  }
  // Otherwise, make sure they are visible.
  radarInfoOverlay.classList.remove("hidden");
  videoInfoOverlay.classList.remove("hidden");

  // --- Update Radar Overlay ---
  const currentRadarFrame = appState.vizData.radarFrames[appState.currentFrame];
  const frameData = appState.vizData.radarFrames[appState.currentFrame];
  const motionState = frameData.motionState;
  if (currentRadarFrame) {
    const absRadarTime = new Date(
      appState.radarStartTimeMs + currentRadarFrame.timestamp
    );
    const driftMs = (currentMediaTime - currentRadarFrame.videoSyncedTime) * 1000;
    const driftColor = Math.abs(driftMs) > 50 ? "#FF6347" : "#98FB98"; // Tomato or Pale Green
    const colorMode = getCurrentColorMode();
    const fps = appState.fps;
    const fpsColor = fps >= 58 && fps <= 62 ? "#98FB98" : "#FF6347"; // Pale Green or Tomato

    radarInfoOverlay.innerHTML = `
            Frame: ${appState.currentFrame + 1}
            Motion State: ${motionState}
            | FPS: <b style="color: ${fpsColor};">${fps.toFixed(1)}</b>
            | Abs Time: ${formatUTCTime(absRadarTime)}
            | Color Mode: <b>${colorMode}</b>
            | Drift: <b style="color: ${driftColor};">${driftMs.toFixed(
      0
    )}ms  </b>
        `;
  }

  // --- Update Video Overlay ---
  const absVideoTime = new Date(
    appState.videoStartDate.getTime() + currentMediaTime * 1000
  );
  const videoFrame = Math.floor(currentMediaTime * VIDEO_FPS);
  //console.warn('Could not load radarframes ', appState.vizData.radarFrames) console warning for reference

  videoInfoOverlay.innerHTML = `
        Frame: ${videoFrame}
        | Abs Time: ${formatUTCTime(absVideoTime)}
    `;
}

const customTtcInputs = [
  ttcColorCritical,
  ttcTimeCritical,
  ttcColorHigh,
  ttcTimeHigh,
  ttcColorMedium,
  ttcTimeMedium,
];

function updateCustomTtcScheme() {
  appState.customTtcScheme.critical.time = parseFloat(ttcTimeCritical.value);
  appState.customTtcScheme.critical.color = ttcColorCritical.value;
  appState.customTtcScheme.high.time = parseFloat(ttcTimeHigh.value);
  appState.customTtcScheme.high.color = ttcColorHigh.value;
  appState.customTtcScheme.medium.time = parseFloat(ttcTimeMedium.value);
  appState.customTtcScheme.medium.color = ttcColorMedium.value;

  if (appState.p5_instance) {
    appState.p5_instance.redraw();
  }
}

ttcModeDefault.addEventListener("change", () => {
  if (ttcModeDefault.checked) {
    appState.useCustomTtcScheme = false;
    customTtcPanel.classList.add("hidden");
    if (appState.p5_instance) appState.p5_instance.redraw();
  }
});

ttcModeCustom.addEventListener("change", () => {
  if (ttcModeCustom.checked) {
    appState.useCustomTtcScheme = true;
    customTtcPanel.classList.remove("hidden");
    updateCustomTtcScheme(); // Apply current custom values immediately
  }
});

// Add listeners to all custom inputs to update the scheme on the fly
customTtcInputs.forEach((input) => {
  input.addEventListener("input", updateCustomTtcScheme);
});
