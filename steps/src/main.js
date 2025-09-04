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

import { showModal, updateModalProgress } from "./modal.js"; // Modify this import
import { animationLoop } from "./sync.js";
import { radarSketch } from "./p5/radarSketch.js";
import { speedGraphSketch } from "./p5/speedGraphSketch.js";
import { parseVisualizationJson, parseJsonWithOboe } from "./fileParsers.js";
import {
  MAX_TRAJECTORY_LENGTH,
  VIDEO_FPS,
  RADAR_X_MIN,
  RADAR_X_MAX,
  RADAR_Y_MIN,
  RADAR_Y_MAX,
} from "./constants.js";
import {
  findRadarFrameIndexForTime,
  extractTimestampInfo,
  parseTimestamp,
  throttle,
} from "./utils.js";
import { appState } from "./state.js";
import {
  canvasContainer,
  canvasPlaceholder,
  videoPlayer,
  videoPlaceholder,
  loadJsonBtn,
  loadVideoBtn,
  jsonFileInput,
  videoFileInput,
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
  toggleDebug2Overlay,
  egoSpeedDisplay,
  debugOverlay,
  snrMinInput,
  snrMaxInput,
  applySnrBtn,
  autoOffsetIndicator,
  clearCacheBtn,
  speedGraphContainer,
  speedGraphPlaceholder,
  toggleCloseUp,
  updateFrame,
  resetVisualization,
  updateDebugOverlay,
} from "./dom.js";
import { initializeTheme } from "./theme.js";
import { initDB, saveFileToDB, loadFileFromDB } from "./db.js";

// Sets up the video player with the given file URL.
function setupVideoPlayer(fileURL) {
  videoPlayer.src = fileURL;
  videoPlayer.classList.remove("hidden");
  videoPlaceholder.classList.add("hidden");
  videoPlayer.playbackRate = parseFloat(speedSlider.value);
}

// Event listener for loading JSON file.
loadJsonBtn.addEventListener("click", () => jsonFileInput.click());
loadVideoBtn.addEventListener("click", () => videoFileInput.click());

clearCacheBtn.addEventListener("click", async () => {
  const confirmed = await showModal("Clear all cached data and reload?", true);
  if (confirmed) {
    indexedDB.deleteDatabase("visualizerDB");
    localStorage.clear();
    window.location.reload();
  }
});

// In src/main.js, REPLACE the jsonFileInput event listener with this:
jsonFileInput.addEventListener("change", (event) => {
    const file = event.target.files[0];
    if (!file) return;

    appState.jsonFilename = file.name;
    localStorage.setItem("jsonFilename", appState.jsonFilename);
    calculateAndSetOffset();
    saveFileToDB("json", file); // We still cache the raw file

    // 1. Show the modal with the progress bar
    showModal("Parsing large JSON file...", false, true);
    updateModalProgress(0);

    // 2. Create a new Worker from our script
    const worker = new Worker('./src/parser.worker.js');

    // 3. Set up listeners for messages FROM the worker
    worker.onmessage = async (e) => {
        const { type, data, message, percent } = e.data;

        if (type === 'progress') {
            // Update the progress bar whenever the worker reports progress
            updateModalProgress(percent);
        } else if (type === 'complete') {
            // Worker is done! Process the data it sent back.
            updateModalProgress(100);
            
            const result = await parseVisualizationJson(
                data, // Use the data object directly from the worker
                appState.radarStartTimeMs,
                appState.videoStartDate
            );

            if (result.error) {
                showModal(result.error);
                return;
            }

            appState.vizData = result.data;
            appState.globalMinSnr = result.minSnr;
            appState.globalMaxSnr = result.maxSnr;
            snrMinInput.value = appState.globalMinSnr.toFixed(1);
            snrMaxInput.value = appState.globalMaxSnr.toFixed(1);

            resetVisualization();
            canvasPlaceholder.style.display = "none";
            featureToggles.classList.remove("hidden");

            if (!appState.p5_instance) {
                appState.p5_instance = new p5(radarSketch);
            }
            if (appState.vizData && videoPlayer.duration) {
                if (!appState.speedGraphInstance) {
                    appState.speedGraphInstance = new p5(speedGraphSketch);
                }
                appState.speedGraphInstance.setData(appState.vizData, videoPlayer.duration);
            }
            
            // Close the modal and terminate the worker
            document.getElementById("modal-ok-btn").click();
            worker.terminate();

        } else if (type === 'error') {
            // The worker ran into an error
            showModal(message);
            worker.terminate();
        }
    };

    // 4. Send the file TO the worker to start the job
    worker.postMessage({ file: file });
});

// Event listener for video file input change.
videoFileInput.addEventListener("change", (event) => {
  const file = event.target.files[0];
  if (!file) return;
  appState.videoFilename = file.name;
  localStorage.setItem("videoFilename", appState.videoFilename);
  saveFileToDB("video", file);

  calculateAndSetOffset();

  if (appState.vizData) {
    console.log("DEBUG: Video loaded after JSON. Re-calculating timestamps.");
    appState.vizData.radarFrames.forEach((frame) => {
      frame.timestampMs =
        appState.radarStartTimeMs +
        frame.timestamp -
        appState.videoStartDate.getTime();
    });
    resetVisualization();
  }

  const fileURL = URL.createObjectURL(file);
  setupVideoPlayer(fileURL);

  videoPlayer.onloadedmetadata = () => {
    if (appState.speedGraphInstance) {
      appState.speedGraphInstance.setData(
        appState.vizData,
        videoPlayer.duration
      );
    }
  };
});

// Event listener for offset input change.
offsetInput.addEventListener("input", () => {
  autoOffsetIndicator.classList.add("hidden");
  localStorage.setItem("visualizerOffset", offsetInput.value);
});

// Event listener for apply SNR button click.
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

// Event listener for play/pause button click.
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

// Event listener for stop button click.
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

// Event listener for timeline slider input.
timelineSlider.addEventListener(
  "input",
  throttle((event) => {
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
  }, 16)
);

// Event listener for speed slider input.
speedSlider.addEventListener("input", (event) => {
  const speed = parseFloat(event.target.value);
  videoPlayer.playbackRate = speed;
  speedDisplay.textContent = `${speed.toFixed(1)}x`;
});

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
  toggleDebug2Overlay,
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
    if (t === toggleDebugOverlay || t === toggleDebug2Overlay) {
      updateDebugOverlay(videoPlayer.currentTime);
    }
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

// In src/main.js, add this new event listener
videoPlayer.addEventListener("seeked", () => {
  // This event fires every time a seek operation completes.
  // We only act if our flag has been set.
  if (appState.needsPostSeekUpdate) {
    console.log(
      "Video has finished seeking. Performing final debug overlay update."
    );
    // Now we can be sure videoPlayer.currentTime is accurate.
    updateDebugOverlay(videoPlayer.currentTime);

    // Reset the flag so this logic doesn't run on every seek
    appState.needsPostSeekUpdate = false;
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

// Application Initialization
// In src/main.js, REPLACE the entire 'DOMContentLoaded' listener with this:

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

    calculateAndSetOffset();

    const videoPromise = new Promise((resolve) => loadFileFromDB("video", resolve));
    const jsonPromise = new Promise((resolve) => loadFileFromDB("json", resolve));

    Promise.all([videoPromise, jsonPromise])
      .then(([videoBlob, jsonBlob]) => {
        console.log("DEBUG: All data fetched from IndexedDB.");

        // This function will be called with the fully parsed JSON data when ready.
        const finalizeSetup = async (parsedJson) => {
          if (parsedJson) {
            const result = await parseVisualizationJson(
              parsedJson,
              appState.radarStartTimeMs,
              appState.videoStartDate
            );

            if (!result.error) {
              appState.vizData = result.data;
              appState.globalMinSnr = result.minSnr;
              appState.globalMaxSnr = result.maxSnr;
              snrMinInput.value = result.minSnr.toFixed(1);
              snrMaxInput.value = result.maxSnr.toFixed(1);
            } else {
              showModal(result.error);
            }
          }

          // Setup video player
          if (videoBlob) {
            const fileURL = URL.createObjectURL(videoBlob);
            setupVideoPlayer(fileURL);
          }
          
          // Final UI updates
          if (appState.vizData) {
            resetVisualization();
            canvasPlaceholder.style.display = "none";
            featureToggles.classList.remove("hidden");
            if (!appState.p5_instance) {
              appState.p5_instance = new p5(radarSketch);
            }
          }
        };

        if (jsonBlob) {
          // --- CACHED JSON FOUND: USE WORKER ---
          showModal("Loading data from cache...", false, true);
          updateModalProgress(0);

          const worker = new Worker('./src/parser.worker.js');

          worker.onmessage = async (e) => {
            const { type, data, message, percent } = e.data;
            if (type === 'progress') {
              updateModalProgress(percent);
            } else if (type === 'complete') {
              updateModalProgress(100);
              await finalizeSetup(data);
              document.getElementById("modal-ok-btn").click();
              worker.terminate();
            } else if (type === 'error') {
              showModal(message);
              worker.terminate();
            }
          };
          
          worker.postMessage({ file: jsonBlob });

        } else {
          // --- NO CACHED JSON ---
          finalizeSetup(null);
        }
      })
      .catch((error) => {
        console.error("DEBUG: Error during Promise.all data loading:", error);
      });
  });
});

// In src/main.js, add this new event listener
offsetInput.addEventListener("keydown", (event) => {
  // Check if the key pressed was 'Enter'
  if (event.key === "Enter") {
    // Prevent the default browser action for the Enter key (like submitting a form)
    event.preventDefault();

    // Make sure visualization data is loaded before proceeding
    if (!appState.vizData) return;

    console.log(
      `Enter pressed. Forcing resync with new offset: ${offsetInput.value}`
    );

    // If the video is playing, pause it to allow for precise frame tuning.
    if (appState.isPlaying) {
      playPauseBtn.click();
    }

    // Call updateFrame, forcing it to resync the video to the current radar frame
    // using the new offset value from the input box.
    updateFrame(appState.currentFrame, true);
  }
});

// In src/main.js, REPLACE the 'change' event listener with this:
timelineSlider.addEventListener("change", () => {
  if (!appState.vizData || appState.isPlaying) return;

  const currentRadarFrame = appState.vizData.radarFrames[appState.currentFrame];
  if (!currentRadarFrame) return;

  const targetRadarTimeMs = currentRadarFrame.timestampMs;
  const offsetMs = parseFloat(offsetInput.value) || 0;
  const currentVideoTimeMs = videoPlayer.currentTime * 1000;
  const driftMs = currentVideoTimeMs + offsetMs - targetRadarTimeMs;

  if (Math.abs(driftMs) > 50) {
    console.log(
      `Setting flag for post-seek update. Initial drift: ${driftMs.toFixed(
        0
      )}ms`
    );
    // 1. Set the flag to true
    appState.needsPostSeekUpdate = true;
    // 2. Initiate the final seek operation
    updateFrame(appState.currentFrame, true);
  }
});
