import { appState } from "./state.js";
import { showModal } from "./modal.js";
import { loadFreshFileFromDB } from "./db.js";
import {
  offsetInput,
  speedSlider,
  snrMinInput,
  snrMaxInput,
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
  toggleCloseUp,
  togglePredictedPos,
  toggleCovariance,
  toggleConfirmedOnly,
  saveSessionBtn,
  loadSessionBtn,
  sessionFileInput,
} from "./dom.js";

function saveSession() {
  if (!appState.jsonFilename && !appState.videoFilename) {
    showModal("Nothing to save. Please load data files first.");
    return;
  }

  const sessionState = {
    version: 1,
    jsonFilename: appState.jsonFilename,
    videoFilename: appState.videoFilename,
    offset: offsetInput.value,
    playbackSpeed: speedSlider.value,
    snrMin: snrMinInput.value,
    snrMax: snrMaxInput.value,
    toggles: {
      snrColor: toggleSnrColor.checked,
      clusterColor: toggleClusterColor.checked,
      inlierColor: toggleInlierColor.checked,
      stationaryColor: toggleStationaryColor.checked,
      velocity: toggleVelocity.checked,
      tracks: toggleTracks.checked,
      egoSpeed: toggleEgoSpeed.checked,
      frameNorm: toggleFrameNorm.checked,
      debugOverlay: toggleDebugOverlay.checked,
      debug2Overlay: toggleDebug2Overlay.checked,
      closeUp: toggleCloseUp.checked,
      predictedPos: togglePredictedPos.checked,
      covariance: toggleCovariance.checked,
      confirmedOnly: toggleConfirmedOnly.checked,
    },
  };

  const sessionString = JSON.stringify(sessionState, null, 2);
  const blob = new Blob([sessionString], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const now = new Date();
  const pad = (num) => String(num).padStart(2, "0");
  const timestamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(
    now.getDate()
  )}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
  const defaultFilename = `visualizer-session_${timestamp}.json`;

  const a = document.createElement("a");
  a.href = url;
  a.download = defaultFilename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

async function loadSession(file) {
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const sessionState = JSON.parse(e.target.result);

      if (sessionState.version !== 1 || !sessionState.jsonFilename) {
        showModal("Error: Invalid or corrupted session file.");
        return;
      }

      const videoBlob = await loadFreshFileFromDB("video", sessionState.videoFilename);
      const jsonBlob = await loadFreshFileFromDB("json", sessionState.jsonFilename);

      if (!jsonBlob || (sessionState.videoFilename && !videoBlob)) {
        showModal(`Session load failed: The required data files are not in the application's cache. 
                
                Please manually load '${sessionState.jsonFilename}' and '${sessionState.videoFilename}' before loading this session.`);
        return;
      }

      localStorage.setItem("jsonFilename", sessionState.jsonFilename || "");
      localStorage.setItem("videoFilename", sessionState.videoFilename || "");
      localStorage.setItem("visualizerOffset", sessionState.offset || "0");
      localStorage.setItem("playbackSpeed", sessionState.playbackSpeed || "1");
      localStorage.setItem("snrMin", sessionState.snrMin || "");
      localStorage.setItem("snrMax", sessionState.snrMax || "");
      if (sessionState.toggles) {
        localStorage.setItem("togglesState", JSON.stringify(sessionState.toggles));
      }

      showModal("Session files found in cache. The application will now reload.").then(() => {
        window.location.reload();
      });
    } catch (error) {
      showModal("Error: Could not parse the session file. It may be invalid.");
      console.error("Session load error:", error);
    }
  };
  reader.readAsText(file);
}

export function initSessionManagement() {
  saveSessionBtn.addEventListener("click", saveSession);
  loadSessionBtn.addEventListener("click", () => sessionFileInput.click());
  sessionFileInput.addEventListener("change", (event) => {
    loadSession(event.target.files[0]);
    event.target.value = ""; // Clear the input for future loads.
  });
}