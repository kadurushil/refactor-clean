// ===========================================================================================================
// REFACTOR PLAN: This monolithic script will be broken down into
// the following modules in the '/src' directory:
//
// - constants.js:      Shared constants (VIDEO_FPS, RADAR_X_MAX)
// - utils.js:          Pure helper functions (findRadarFrameIndexForTime)
// - state.js:          Central application state management
// - dom.js:            DOM element references and UI updaters
// - modal.js:          Modal dialog logic
// - theme.js:          Dark/Light mode theme switcher
// - db.js:             IndexedDB caching logic
// - fileParsers.js:    JSON and CAN log parsing logic
// - p5/radarSketch.js: The main p5.js radar visualization
// - p5/speedGraph.js:  The p5.js speed graph visualization
// - sync.js:           Playback and synchronization loop
// - main.js:           The main application entry point that wires everything
// ===========================================================================================================

// import animation loop from './src/sync.js';

import { animationLoop } from "./sync.js";
// import radar sketch from './src/p5/radarSketch.js';
import { radarSketch } from "./p5/radarSketch.js";
// import speed graph sketch from './src/p5/speedGraphSketch.js';
import { speedGraphSketch } from "./p5/speedGraphSketch.js";
// import JSON parser, can log procesor from './src/fileParsers.js';
import { processCanLog, parseVisualizationJson } from "./fileParsers.js";
// import constants from './constants.js';
import {
  MAX_TRAJECTORY_LENGTH,
  VIDEO_FPS,
  RADAR_X_MIN,
  RADAR_X_MAX,
  RADAR_Y_MIN,
  RADAR_Y_MAX,
} from "./constants.js";
// import utils and helpers from './src/utils.js';
import {
  findRadarFrameIndexForTime,
  findLastCanIndexBefore,
  extractTimestampInfo,
  parseTimestamp,
} from "./utils.js";
// import state machine from './src/state.js';
import { appState } from "./state.js";
// import DOM elements and UI updaters from './src/dom.js';
import {
  //---DOM Elements---//
  canvasContainer,
  canvasPlaceholder,
  videoPlayer,
  videoPlaceholder,
  loadJsonBtn,
  loadVideoBtn,
  loadCanBtn,
  jsonFileInput,
  videoFileInput,
  canFileInput,
  playPauseBtn,
  stopBtn,
  timelineSlider,
  frameCounter,
  offsetInput,
  speedSlider,
  speedDisplay,
  featureToggles,
  toggleSnrColor,
  toggleClusterColor,
  toggleInlierColor,
  toggleStationaryColor,
  toggleVelocity,
  toggleTracks,
  toggleEgoSpeed,
  toggleFrameNorm,
  toggleDebugOverlay,
  egoSpeedDisplay,
  canSpeedDisplay,
  debugOverlay,
  snrMinInput,
  snrMaxInput,
  applySnrBtn,
  autoOffsetIndicator,
  clearCacheBtn,
  speedGraphContainer,
  speedGraphPlaceholder,
  toggleCloseUp,
  //---UI Updaters---//
  updateFrame,
  resetVisualization,
  updateCanDisplay,
  updateDebugOverlay,
} from "./dom.js";
// import modal dialog logic from './src/modal.js';
import { showModal } from "./modal.js";
// import initialize theme from './src/theme.js';
import { initializeTheme } from "./theme.js";
// import caching logic from './src/db.js';
import { initDB, saveFileToDB, loadFileFromDB } from "./db.js";

function setupVideoPlayer(fileURL) {
  videoPlayer.src = fileURL;
  videoPlayer.classList.remove("hidden");
  videoPlaceholder.classList.add("hidden");
  videoPlayer.playbackRate = parseFloat(speedSlider.value);
}
loadJsonBtn.addEventListener("click", () => jsonFileInput.click());
loadVideoBtn.addEventListener("click", () => videoFileInput.click());
loadCanBtn.addEventListener("click", () => canFileInput.click());
clearCacheBtn.addEventListener("click", async () => {
  const confirmed = await showModal("Clear all cached data and reload?", true);
  if (confirmed) {
    indexedDB.deleteDatabase("visualizerDB");
    localStorage.clear();
    window.location.reload();
  }
});
jsonFileInput.addEventListener("change", (event) => {
  const file = event.target.files[0];
  if (!file) return;
  appState.jsonFilename = file.name;
  localStorage.setItem("jsonFilename", appState.jsonFilename);
  calculateAndSetOffset(); // This function now correctly sets appState variables

  const reader = new FileReader();
  reader.onload = (e) => {
    const jsonString = e.target.result;
    saveFileToDB("json", jsonString);

    // 1. Give the raw ingredients to our new JSON "chef"
    const result = parseVisualizationJson(
      jsonString,
      appState.radarStartTimeMs,
      appState.videoStartDate
    );

    // 2. Check the result
    if (result.error) {
      showModal(result.error);
      return;
    }

    // 3. Update the application's central state with the prepared data
    appState.vizData = result.data;
    appState.globalMinSnr = result.minSnr;
    appState.globalMaxSnr = result.maxSnr;

    // 4. Now, the "waiter" updates the UI
    snrMinInput.value = appState.globalMinSnr.toFixed(1);
    snrMaxInput.value = appState.globalMaxSnr.toFixed(1);
    resetVisualization(); // This UI function is in dom.js
    canvasPlaceholder.style.display = "none";
    featureToggles.classList.remove("hidden");

    if (!appState.p5_instance) {
      appState.p5_instance = new p5(radarSketch);
    }

    if (appState.speedGraphInstance) {
      appState.speedGraphInstance.setData(
        appState.canData,
        appState.vizData,
        videoPlayer.duration
      );
    } else {
      // Redraw p5 instance with new data
      appState.p5_instance.drawSnrLegendToBuffer(
        appState.globalMinSnr,
        appState.globalMaxSnr
      );
      appState.p5_instance.redraw();
    }
  };
  reader.readAsText(file);
});
videoFileInput.addEventListener("change", (event) => {
  const file = event.target.files[0];
  if (!file) return;
  appState.videoFilename = file.name;
  localStorage.setItem("videoFilename", appState.videoFilename);
  saveFileToDB("video", file);

  // This is the key moment: we now have a video start date.
  calculateAndSetOffset();

  // Now, check if we have pending data that needs this date.
  if (appState.rawCanLogText) {
    const result = processCanLog(
      appState.rawCanLogText,
      appState.videoStartDate
    );
    if (!result.error) {
      appState.canData = result.data;
      appState.rawCanLogText = null;
    }
  }

  // NEW: Re-process vizData if it was loaded before the video.
  if (appState.vizData) {
    console.log("DEBUG: Video loaded after JSON. Re-calculating timestamps.");
    appState.vizData.radarFrames.forEach((frame) => {
      frame.timestampMs =
        appState.radarStartTimeMs +
        frame.timestamp -
        appState.videoStartDate.getTime();
    });
    resetVisualization(); // Reset UI to reflect new timestamps
  }

  const fileURL = URL.createObjectURL(file);
  setupVideoPlayer(fileURL);

  // When the video is ready, update the speed graph
  videoPlayer.onloadedmetadata = () => {
    if (appState.speedGraphInstance) {
      appState.speedGraphInstance.setData(
        appState.canData,
        appState.vizData,
        videoPlayer.duration
      );
    }
  };
});

canFileInput.addEventListener("change", (event) => {
  const file = event.target.files[0];
  if (!file) return;
  appState.canLogFilename = file.name;
  localStorage.setItem("canLogFilename", appState.canLogFilename);

  const reader = new FileReader();
  reader.onload = (e) => {
    const logContent = e.target.result;
    saveFileToDB("canLogText", logContent);

    // 1. Give the raw ingredients to the chef (our parser)
    const result = processCanLog(logContent, appState.videoStartDate);

    // 2. Check what the chef gave back
    if (result.error) {
      // If there was an error, show it and save the raw text for later.
      showModal(result.error);
      appState.rawCanLogText = result.rawCanLogText;
      return;
    }

    // 3. If successful, update the application's central state
    appState.canData = result.data;
    appState.rawCanLogText = null;

    // 4. Now, the waiter updates the UI based on the new state
    if (appState.canData.length > 0 || appState.vizData) {
      speedGraphPlaceholder.classList.add("hidden");
      if (!appState.speedGraphInstance) {
        // We need to pass the speedGraphSketch function definition here
        appState.speedGraphInstance = new p5(speedGraphSketch);
      }
      if (videoPlayer.duration) {
        appState.speedGraphInstance.setData(
          appState.canData,
          appState.vizData,
          videoPlayer.duration
        );
      }
    } else {
      showModal(`No CAN messages with ID 0x30F found.`);
    }
  };
  reader.readAsText(file);
});
offsetInput.addEventListener("input", () => {
  autoOffsetIndicator.classList.add("hidden");
  localStorage.setItem("visualizerOffset", offsetInput.value);
});
applySnrBtn.addEventListener("click", () => {
  const newMin = parseFloat(snrMinInput.value),
    newMax = parseFloat(snrMaxInput.value);
  if (isNaN(newMin) || isNaN(newMax) || newMin >= newMax) {
    showModal("Invalid SNR range.");
    return;
  }
  appState.globalMinSnr = newMin;
  appState.globalMaxSnr = newMax;
  toggleFrameNorm.checked = false;
  if (appState.p5_instance) {
    appState.p5_instance.drawSnrLegendToBuffer(
      appState.globalMinSnr,
      appState.globalMaxSnr
    );
    appState.p5_instance.redraw();
  }
});
playPauseBtn.addEventListener("click", () => {
  if (!appState.vizData && !videoPlayer.src) return;
  appState.isPlaying = !appState.isPlaying;
  playPauseBtn.textContent = appState.isPlaying ? "Pause" : "Play";
  if (appState.isPlaying) {
    if (videoPlayer.src && videoPlayer.readyState > 1) {
      appState.masterClockStart = performance.now();
      appState.mediaTimeStart = videoPlayer.currentTime;
      appState.lastSyncTime = appState.masterClockStart;
      videoPlayer.play();
    }
    requestAnimationFrame(animationLoop);
  } else {
    if (videoPlayer.src) videoPlayer.pause();
  }
});
stopBtn.addEventListener("click", () => {
  videoPlayer.pause();
  appState.isPlaying = false;
  playPauseBtn.textContent = "Play";
  if (appState.vizData) {
    updateFrame(0, true);
  } else if (videoPlayer.src) {
    videoPlayer.currentTime = 0;
  }
  if (appState.speedGraphInstance) appState.speedGraphInstance.redraw();
});
timelineSlider.addEventListener("input", (event) => {
  if (!appState.vizData) return;
  if (appState.isPlaying) {
    videoPlayer.pause();
    appState.isPlaying = false;
    playPauseBtn.textContent = "Play";
  }
  const frame = parseInt(event.target.value, 10);
  updateFrame(frame, true);
  appState.mediaTimeStart = videoPlayer.currentTime;
  appState.masterClockStart = performance.now();
});
speedSlider.addEventListener("input", (event) => {
  const speed = parseFloat(event.target.value);
  videoPlayer.playbackRate = speed;
  speedDisplay.textContent = `${speed.toFixed(1)}x`;
});

// ADD THE NEW TOGGLE TO THE ARRAY
const colorToggles = [
  toggleSnrColor,
  toggleClusterColor,
  toggleInlierColor,
  toggleStationaryColor,
];
colorToggles.forEach((t) => {
  t.addEventListener("change", (e) => {
    if (e.target.checked) {
      colorToggles.forEach((o) => {
        if (o !== e.target) o.checked = false;
      });
    }
    if (appState.p5_instance) appState.p5_instance.redraw();
  });
});

[
  toggleVelocity,
  toggleEgoSpeed,
  toggleFrameNorm,
  toggleTracks,
  toggleDebugOverlay,
].forEach((t) => {
  t.addEventListener("change", () => {
    if (appState.p5_instance) {
      if (t === toggleFrameNorm && !toggleFrameNorm.checked)
        appState.p5_instance.drawSnrLegendToBuffer(
          appState.globalMinSnr,
          appState.globalMaxSnr
        );
      appState.p5_instance.redraw();
    }
    if (t === toggleDebugOverlay) updateDebugOverlay(videoPlayer.currentTime);
  });
});

toggleCloseUp.addEventListener("change", () => {
  appState.isCloseUpMode = toggleCloseUp.checked;
  if (appState.p5_instance) {
    if (appState.isCloseUpMode) {
      if (appState.isPlaying) {
        playPauseBtn.click();
      }
      appState.p5_instance.loop();
    } else {
      appState.p5_instance.noLoop();
      appState.p5_instance.redraw();
    }
  }
});

videoPlayer.addEventListener("ended", () => {
  appState.isPlaying = false;
  playPauseBtn.textContent = "Play";
});
document.addEventListener("keydown", (event) => {
  if (
    !appState.vizData ||
    ["ArrowRight", "ArrowLeft"].indexOf(event.key) === -1
  )
    return;
  event.preventDefault();
  if (appState.isPlaying) {
    appState.isPlaying = false;
    playPauseBtn.textContent = "Play";
    videoPlayer.pause();
  }
  let newFrame = appState.currentFrame;
  if (event.key === "ArrowRight")
    newFrame = Math.min(
      appState.vizData.radarFrames.length - 1,
      appState.currentFrame + 1
    );
  else if (event.key === "ArrowLeft")
    newFrame = Math.max(0, appState.currentFrame - 1);
  if (newFrame !== appState.currentFrame) {
    updateFrame(newFrame, true);
    appState.mediaTimeStart = videoPlayer.currentTime;
    appState.masterClockStart = performance.now();
  }
});
function calculateAndSetOffset() {
  const jsonTimestampInfo = extractTimestampInfo(appState.jsonFilename);
  const videoTimestampInfo = extractTimestampInfo(appState.videoFilename);
  if (videoTimestampInfo) {
    appState.videoStartDate = parseTimestamp(
      videoTimestampInfo.timestampStr,
      videoTimestampInfo.format
    );
    if (appState.videoStartDate)
      console.log(
        `Video start date set to: ${appState.videoStartDate.toISOString()}`
      );
  }
  if (jsonTimestampInfo) {
    const jsonDate = parseTimestamp(
      jsonTimestampInfo.timestampStr,
      jsonTimestampInfo.format
    );
    if (jsonDate) {
      appState.radarStartTimeMs = jsonDate.getTime();
      console.log(`Radar start date set to: ${jsonDate.toISOString()}`);
      if (appState.videoStartDate) {
        const offset =
          appState.radarStartTimeMs - appState.videoStartDate.getTime();
        offsetInput.value = offset;
        localStorage.setItem("visualizerOffset", offset);
        autoOffsetIndicator.classList.remove("hidden");
        console.log(`Auto-calculated offset: ${offset} ms`);
      }
    }
  }
}

// --- Application Initialization ---
document.addEventListener("DOMContentLoaded", () => {
  initializeTheme();
  console.log("DEBUG: DOMContentLoaded fired. Starting session load.");

  initDB(() => {
    console.log("DEBUG: Database initialized.");
    const savedOffset = localStorage.getItem("visualizerOffset");
    if (savedOffset !== null) {
      offsetInput.value = savedOffset;
    }
    appState.videoFilename = localStorage.getItem("videoFilename");
    appState.jsonFilename = localStorage.getItem("jsonFilename");
    appState.canLogFilename = localStorage.getItem("canLogFilename");

    // This is important: it sets videoStartDate if a video filename is cached
    calculateAndSetOffset();

    const videoPromise = new Promise((resolve) =>
      loadFileFromDB("video", resolve)
    );
    const jsonPromise = new Promise((resolve) =>
      loadFileFromDB("json", resolve)
    );
    const canLogPromise = new Promise((resolve) =>
      loadFileFromDB("canLogText", resolve)
    );

    Promise.all([videoPromise, jsonPromise, canLogPromise])
      .then(([videoBlob, jsonString, canLogText]) => {
        console.log("DEBUG: All data fetched from IndexedDB.");

        const processAllData = () => {
          console.log("DEBUG: Processing all loaded data.");

          // 1. Process JSON (only if we have a video date)
          if (jsonString && appState.videoStartDate) {
            const result = parseVisualizationJson(
              jsonString,
              appState.radarStartTimeMs,
              appState.videoStartDate
            );
            if (!result.error) {
              appState.vizData = result.data;
              appState.globalMinSnr = result.minSnr;
              appState.globalMaxSnr = result.maxSnr;
              snrMinInput.value = appState.globalMinSnr.toFixed(1);
              snrMaxInput.value = appState.globalMaxSnr.toFixed(1);
            } else {
              showModal(result.error);
            }
          }

          // 2. Process CAN log (only if we have a video date)
          if (canLogText && appState.videoStartDate) {
            const result = processCanLog(canLogText, appState.videoStartDate);
            if (!result.error) {
              appState.canData = result.data;
            }
          }

          // 3. Update all UI elements now that data is processed
          if (appState.vizData) {
            resetVisualization();
            canvasPlaceholder.style.display = "none";
            featureToggles.classList.remove("hidden");
            if (!appState.p5_instance) {
              appState.p5_instance = new p5(radarSketch);
            }
          }
          if (appState.canData.length > 0 || appState.vizData) {
            speedGraphPlaceholder.classList.add("hidden");
            if (!appState.speedGraphInstance) {
              appState.speedGraphInstance = new p5(speedGraphSketch);
            }
            appState.speedGraphInstance.setData(
              appState.canData,
              appState.vizData,
              videoPlayer.duration
            );
          }
        };

        // This is the main controller
        // --- THIS IS THE CORRECTED CODE ---
        if (videoBlob) {
          const fileURL = URL.createObjectURL(videoBlob);
          setupVideoPlayer(fileURL);
          // This ensures we ONLY process data once the video's duration is known.
          videoPlayer.onloadedmetadata = processAllData;
        } else {
          // If there's no video, we can go ahead and process the other data.
          processAllData();
        }
      })
      .catch((error) => {
        console.error("DEBUG: Error during Promise.all data loading:", error);
      });
  });
});
