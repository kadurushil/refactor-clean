import { appState } from "./state.js";
import { formatTime } from "./utils.js";
import { showModal } from "./modal.js";
import { pausePlayback } from "./sync.js";
import {
  videoPlayer,
  timelineSlider,
  speedSlider,
  speedDisplay,
  toggleSnrColor,
  toggleClusterColor,
  toggleInlierColor,
  toggleStationaryColor,
  toggleVelocity,
  toggleEgoSpeed,
  toggleFrameNorm,
  toggleTracks,
  toggleDebugOverlay,
  toggleDebug2Overlay,
  toggleCloseUp,
  snrMinInput,
  snrMaxInput,
  applySnrBtn,
  timelineTooltip,
  playPauseBtn,
  updatePersistentOverlays,
  updateDebugOverlay,
  collapsibleMenu,
  toggleMenuBtn,
  closeMenuBtn,
  menuScrim,
  fullscreenBtn,
  toggleConfirmedOnly,
  shortcutsBtn,
  shortcutsModal,
  shortcutsModalCloseBtn,
  userManualBtn,
  guideModal,
  guideModalCloseBtn,
} from "./dom.js";

function toggleMenu(show) {
  if (show) {
    collapsibleMenu.classList.remove("-translate-x-full");
    menuScrim.classList.remove("hidden");
  } else {
    collapsibleMenu.classList.add("-translate-x-full");
    menuScrim.classList.add("hidden");
  }
}

function toggleShortcutsModal(show) {
  if (show) {
    shortcutsModal.classList.remove("hidden");
  } else {
    shortcutsModal.classList.add("hidden");
  }
}

function toggleGuideModal(show) {
  if (show) {
    guideModal.classList.remove("hidden");
  } else {
    guideModal.classList.add("hidden");
  }
}

function handleColorToggles(e) {
  const colorToggles = [
    toggleSnrColor,
    toggleClusterColor,
    toggleInlierColor,
    toggleStationaryColor,
  ];
  if (e.target.checked) {
    colorToggles.forEach((o) => {
      if (o !== e.target) o.checked = false;
    });
  }
  if (appState.p5_instance) appState.p5_instance.redraw();
  updatePersistentOverlays(videoPlayer.currentTime);
}

export function initUIEventListeners() {
  // --- Shortcuts Modal ---
  shortcutsBtn.addEventListener("click", (e) => {
      e.preventDefault();
      toggleShortcutsModal(true);
  });
  shortcutsModalCloseBtn.addEventListener("click", () => toggleShortcutsModal(false));
  shortcutsModal.addEventListener("click", (e) => {
      // Close if clicking the background overlay (self), but not children
      if (e.target === shortcutsModal) {
          toggleShortcutsModal(false);
      }
  });

  // --- Guide Modal ---
  userManualBtn.addEventListener("click", (e) => {
    e.preventDefault();
    toggleGuideModal(true);
  });
  guideModalCloseBtn.addEventListener("click", () => toggleGuideModal(false));
  guideModal.addEventListener("click", (e) => {
    if (e.target === guideModal) {
        toggleGuideModal(false);
    }
  });
  
  // Global Key Listener for 'k' and 'ESC'
  document.addEventListener("keydown", (e) => {
    if (e.key.toLowerCase() === "k") {
      // Toggle visibility
      const isHidden = shortcutsModal.classList.contains("hidden");
      toggleShortcutsModal(isHidden);
    }
    // Prioritize closing the guide modal if open, then shortcuts modal
    if (e.key === "Escape") {
        if (!guideModal.classList.contains("hidden")) {
            toggleGuideModal(false);
        } else if (!shortcutsModal.classList.contains("hidden")) {
            toggleShortcutsModal(false);
        }
    }
  });

  // --- Menu and Fullscreen ---
  toggleMenuBtn.addEventListener("click", () => toggleMenu(true));
  closeMenuBtn.addEventListener("click", () => toggleMenu(false));
  menuScrim.addEventListener("click", () => toggleMenu(false));
  fullscreenBtn.addEventListener("click", () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
    } else if (document.exitFullscreen) {
      document.exitFullscreen();
    }
  });

  // --- Timeline Tooltip ---
  timelineSlider.addEventListener("mouseover", () => {
    if (appState.vizData) timelineTooltip.classList.remove("hidden");
  });
  timelineSlider.addEventListener("mouseout", () => {
    timelineTooltip.classList.add("hidden");
  });
  timelineSlider.addEventListener("mousemove", (event) => {
    if (!appState.vizData) return;
    const rect = timelineSlider.getBoundingClientRect();
    const hoverFraction = (event.clientX - rect.left) / rect.width;
    const sliderMax = parseInt(timelineSlider.max, 10) || appState.vizData.radarFrames.length - 1;
    let frameIndex = Math.max(0, Math.min(Math.round(hoverFraction * sliderMax), sliderMax));
    const frameData = appState.vizData.radarFrames[frameIndex];
    if (!frameData) return;
    const formattedTime = formatTime(frameData.relativeTimeSec * 1000);
    timelineTooltip.innerHTML = `Frame: ${frameIndex + 1}<br>Time: ${formattedTime}`;
    const tooltipX = event.clientX - rect.left;
    timelineTooltip.style.left = `${tooltipX}px`;
  });

  // --- Speed Slider ---
  speedSlider.addEventListener("input", (event) => {
    const speed = parseFloat(event.target.value);
    videoPlayer.playbackRate = speed;
    speedDisplay.textContent = `${speed.toFixed(1)}x`;
  });

  // --- SNR Controls ---
  applySnrBtn.addEventListener("click", () => {
    const newMin = parseFloat(snrMinInput.value), newMax = parseFloat(snrMaxInput.value);
    if (isNaN(newMin) || isNaN(newMax) || newMin >= newMax) {
      showModal("Invalid SNR range.");
      return;
    }
    appState.globalMinSnr = newMin;
    appState.globalMaxSnr = newMax;
    toggleFrameNorm.checked = false;
    if (appState.p5_instance) {
      appState.p5_instance.drawSnrLegendToBuffer(appState.globalMinSnr, appState.globalMaxSnr);
      appState.p5_instance.redraw();
    }
  });

  // --- Feature Toggles ---
  [toggleSnrColor, toggleClusterColor, toggleInlierColor, toggleStationaryColor].forEach((t) => {
    t.addEventListener("change", handleColorToggles);
  });

  [toggleVelocity, toggleEgoSpeed, toggleFrameNorm, toggleTracks, toggleDebugOverlay, toggleDebug2Overlay].forEach((t) => {
    t.addEventListener("change", () => {
      if (appState.p5_instance) appState.p5_instance.redraw();
      if (t === toggleDebugOverlay || t === toggleDebug2Overlay) {
        updateDebugOverlay(videoPlayer.currentTime);
        updatePersistentOverlays(videoPlayer.currentTime);
      }
    });
  });

  toggleCloseUp.addEventListener("change", () => {
    appState.isCloseUpMode = toggleCloseUp.checked;
    if (appState.isCloseUpMode && appState.isPlaying) {
      // If entering close-up mode while playing, automatically pause.
      pausePlayback();
      appState.isPlaying = false;
      playPauseBtn.textContent = "Play";
    }
    if (appState.p5_instance) { // Handle p5 loop state
      if (appState.isCloseUpMode) {
        appState.p5_instance.loop(); // Start looping for mouse interaction.
      } else {
        appState.p5_instance.noLoop(); // Stop looping when exiting.
        appState.p5_instance.redraw(); // Redraw one last time.
      }
    }
  });

  toggleConfirmedOnly.addEventListener("change", () => {
    if (appState.p5_instance) appState.p5_instance.redraw();
  });
}