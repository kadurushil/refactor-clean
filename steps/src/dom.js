// TODO(sync-refactor): move sync logic into src/sync.js
import { appState } from "./state.js";
import { formatUTCTime } from "./utils.js";
import { VIDEO_FPS } from "./constants.js";

function getTimingColor(diffMs) {
  if (diffMs >= 48 && diffMs <= 52) {
    return "#00FF00"; // Bright Green (Perfect)
  } else if (diffMs >= 40 && diffMs <= 60) {
    return "#98FB98"; // Pale Green (Good)
  } else if ((diffMs >= 30 && diffMs < 40) || (diffMs > 60 && diffMs <= 70)) {
    return "#FFEB3B"; // Yellow (Noticeable)
  } else if ((diffMs >= 20 && diffMs < 30) || (diffMs > 70 && diffMs <= 100)) {
    return "#FFA500"; // Orange (Warning)
  } else if (diffMs > 300) {
    return "#c339ffff"; // Dark Violet (Extreme > 300ms)
  } else if (diffMs > 150) {
    return "#8B0000"; // Dark Red (Severe > 150ms)
  } else {
    return "#FF4500"; // Red (Critical 100-150ms or < 20ms)
  }
}

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
// @param {boolean} isNewVideo - If true, the video player will be reset. If false, existing video is preserved.
export function resetUIForNewLoad(isNewVideo = true) {
    console.log(`Resetting UI for new file load. New Video: ${isNewVideo}`);

    // Hide feature toggles
    featureToggles.classList.add("hidden");

    // Reset the FPS counter state to prevent incorrect calculations on reload
    appState.fps = 0;

    // --- Conditional Video Reset ---
    if (isNewVideo || !videoPlayer.src) {
        // Reset video UI: Show placeholder, hide player, clear source
        videoPlaceholder.classList.remove('hidden');
        videoPlayer.classList.add('hidden');
        videoPlayer.src = ''; // Clear the video source
        videoInfoOverlay.classList.add('hidden');
    } else {
        // Preserve video UI: Ensure player is visible, placeholder hidden
        videoPlaceholder.classList.add('hidden');
        videoPlayer.classList.remove('hidden');
        // Do NOT clear videoPlayer.src
        videoInfoOverlay.classList.remove('hidden');
    }

    // Show canvas placeholder (will be hidden later if data loads)
    canvasPlaceholder.style.display = 'flex';
    
    // Always hide radar overlay initially
    radarInfoOverlay.classList.add('hidden');
    
    // Reset offset indicator state
    autoOffsetIndicator.classList.add("hidden");
    autoOffsetIndicator.textContent = "";
    autoOffsetIndicator.className = "text-xs font-bold ml-2 hidden"; // Reset classes

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
      
      let timeString = `Media Time (s): ${currentMediaTime.toFixed(2)}`; // Two decimal places
      if (videoPlayer && !isNaN(videoPlayer.duration) && videoPlayer.duration > 0) {
          timeString += ` / ${videoPlayer.duration.toFixed(2)}`; // Add total duration with two decimal places
      }
      content.push(timeString);

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
      content.push(`Target Sync Time (s): ${currentRadarFrame.videoSyncedTime.toFixed(3)}`);
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
  if (toggleClusterColor.checked) return "Cluster Mode (2)";
  if (toggleInlierColor.checked) return "Color by Inlier (3)";
  if (toggleStationaryColor.checked) return "Color by Stationary (4)";
  return "Default"; // The default mode when no specific color toggle is checked
}

// Cache for DOM elements to avoid querySelector/getElementById every frame
let overlayCache = null;
let videoOverlayCache = null;

// Cache for conditional rendering
let lastDrawnFrame = -1;
let lastDrawnScale = -1;

export function updatePersistentOverlays(currentMediaTime) {
  // If the advanced debug overlay is visible, hide the persistent overlays and exit.
  if (toggleDebug2Overlay.checked) {
    radarInfoOverlay.classList.add("hidden");
    videoInfoOverlay.classList.add("hidden");
    return;
  }

  // If we don't have the necessary data, hide the overlays and exit.
  if (!appState.vizData || !appState.videoStartDate) {
    radarInfoOverlay.classList.add("hidden");
    videoInfoOverlay.classList.add("hidden");
    return;
  }
  // Otherwise, make sure they are visible.
  radarInfoOverlay.classList.remove("hidden");
  videoInfoOverlay.classList.remove("hidden");

  // --- Update Radar Persistent Overlay ---
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

    const interFrameTime = currentRadarFrame.interFrameTime;
    const iftColor = getTimingColor(interFrameTime);

    // --- OPTIMIZATION: One-time DOM Setup & Caching ---
    if (!overlayCache) {
        radarInfoOverlay.innerHTML = `
            <div id="radar-text-content" style="line-height: 1.5;">
                Frame: <span id="ov-frame"></span>
                | Motion State: <span id="ov-motion"></span>
                | FPS: <b id="ov-fps"></b>
                | Color Mode: <b id="ov-mode"></b>
                | Drift: <b id="ov-drift"></b>
                | Δt: <b id="ov-ift"></b>
                | Scale: <b id="ov-scale"></b>
            </div>
            <canvas id="ift-dot-matrix" width="700" height="40" style="display:block; margin-top:5px; background:rgba(0,0,0,0.5); border:1px solid #555;"></canvas>
        `;
        
        overlayCache = {
            frame: document.getElementById("ov-frame"),
            motion: document.getElementById("ov-motion"),
            fps: document.getElementById("ov-fps"),
            mode: document.getElementById("ov-mode"),
            drift: document.getElementById("ov-drift"),
            ift: document.getElementById("ov-ift"),
            scale: document.getElementById("ov-scale"),
            dotCanvas: document.getElementById("ift-dot-matrix") // Cache canvas too
        };
    }

    // --- 1. Smart Smooth Zoom Logic ---
    // Use pre-calculated maxWindowIFT (computed in fileParsers.js) for O(1) performance.
    const maxWindowIFT = currentRadarFrame.maxWindowIFT || 0;
    
    // Calculate Target Scale
    // Base: 10ms. If max > 100ms, scale up.
    // Cap: 40ms (3-4x zoom).
    let targetMsPerBlock = 10;
    if (maxWindowIFT > 100) {
       // Example: 900ms spike -> 900/10 = 90. Clamped to 40.
       targetMsPerBlock = Math.min(40, Math.max(10, maxWindowIFT / 10));
    }

    // Smooth Interpolation (Lerp)
    // Move current scale 10% of the way to the target per frame.
    const smoothingFactor = 0.1;
    appState.currentGraphScale += (targetMsPerBlock - appState.currentGraphScale) * smoothingFactor;
    
    // Use the smoothed value for drawing
    const msPerBlock = appState.currentGraphScale;

    // --- Update Text Content Efficiently (Zero Garbage) ---
    if (overlayCache) {
        overlayCache.frame.textContent = appState.currentFrame + 1;
        overlayCache.motion.textContent = motionState;
        
        overlayCache.fps.textContent = fps.toFixed(1);
        overlayCache.fps.style.color = fpsColor;
        
        overlayCache.mode.textContent = colorMode;
        
        overlayCache.drift.textContent = driftMs.toFixed(0) + "ms";
        overlayCache.drift.style.color = driftColor;
        
        overlayCache.ift.textContent = interFrameTime.toFixed(0) + "ms";
        overlayCache.ift.style.color = iftColor;
        
        overlayCache.scale.textContent = "1:" + msPerBlock.toFixed(1) + "ms";
    }

    // --- Draw Optimized Square Block Matrix Graph ---
    // CONDITIONAL RENDER: Only redraw if frame changed or scale changed significantly
    if (appState.currentFrame !== lastDrawnFrame || Math.abs(msPerBlock - lastDrawnScale) > 0.01) {
      
      const dotCanvas = overlayCache.dotCanvas; // Use cached reference
      if (dotCanvas) {
        const ctx = dotCanvas.getContext("2d");
        const w = dotCanvas.width;
        const h = dotCanvas.height;
        
        const blockSize = 3;
        const vGap = 1;
        const hGap = 2;
        const stride = blockSize + hGap;
        // msPerBlock is already set above
        
        // Calculate columns: 600px / 5px = 120 columns.
        const totalCols = 140;
        const centerCol = 70;

        ctx.clearRect(0, 0, w, h);

        // --- Optimization: Immediate Mode Drawing (No Allocations) ---
        // Instead of batching into objects, we draw directly.
        // We iterate through columns. To minimize state changes, we could pre-sort, 
        // but simply drawing column-by-column is fast enough and avoids GC.

        for (let offset = -centerCol; offset < centerCol; offset++) {
          const targetFrameIndex = appState.currentFrame + offset;
          const colIndex = offset + centerCol; 
          const x = colIndex * stride + 2; 

          if (targetFrameIndex >= 0 && targetFrameIndex < appState.vizData.radarFrames.length) {
             const ift = appState.vizData.radarFrames[targetFrameIndex].interFrameTime || 0;
             
             // Use the SMOOTHED dynamic scale here
             const numBlocks = Math.min(10, Math.max(1, Math.round(ift / msPerBlock))); 
             const color = getTimingColor(ift);

             ctx.fillStyle = color;
             ctx.beginPath();
             
             for (let d = 0; d < numBlocks; d++) {
               const y = h - (d * (blockSize + vGap)) - 3; 
               ctx.rect(x, y, blockSize, blockSize);
             }
             ctx.fill();
          } else {
             // Placeholder blocks
             ctx.fillStyle = "rgba(255, 255, 255, 0.1)";
             ctx.beginPath();
             const y = h - 3;
             ctx.rect(x, y, blockSize, blockSize);
             ctx.fill();
          }
        }

        // Draw Center Indicator (Triangle at column 60)
        const centerX = centerCol * stride + 2;
        ctx.fillStyle = "#FFFFFF";
        ctx.beginPath();
        ctx.moveTo(centerX - 4, h);
        ctx.lineTo(centerX + 4, h);
        ctx.lineTo(centerX, h - 6);
        ctx.fill();
      }
      
      // Update cache
      lastDrawnFrame = appState.currentFrame;
      lastDrawnScale = msPerBlock;
    }
  }

  // --- Update Video Persistent Overlay ---
  const absVideoTime = new Date(appState.videoStartDate.getTime() + currentMediaTime * 1000);
  const videoFrame = Math.floor(currentMediaTime * VIDEO_FPS);
  
  let timeDisplay = `Elapsed Time: ${currentMediaTime.toFixed(2)}s`;
  if (videoPlayer && !isNaN(videoPlayer.duration) && videoPlayer.duration > 0) {
      timeDisplay += ` / ${videoPlayer.duration.toFixed(2)}s`;
  }

  // --- OPTIMIZATION: Video Overlay Caching ---
  if (!videoOverlayCache) {
      videoInfoOverlay.innerHTML = `
          Frame: <span id="ov-vid-frame"></span>
          | <span id="ov-vid-time"></span>
          | Abs Time: <span id="ov-vid-abs"></span>
      `;
      videoOverlayCache = {
          frame: document.getElementById("ov-vid-frame"),
          time: document.getElementById("ov-vid-time"),
          abs: document.getElementById("ov-vid-abs")
      };
  }

  if (videoOverlayCache) {
      videoOverlayCache.frame.textContent = videoFrame;
      videoOverlayCache.time.textContent = timeDisplay;
      videoOverlayCache.abs.textContent = formatUTCTime(absVideoTime);
  }
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
