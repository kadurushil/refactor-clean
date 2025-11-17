import { appState } from "./state.js";
import {
  playPauseBtn,
  videoPlayer,
  toggleSnrColor,
  toggleClusterColor,
  toggleInlierColor,
  toggleStationaryColor,
  themeToggleBtn,
  toggleTracks,
  toggleVelocity,
  toggleCloseUp,
  togglePredictedPos,
  toggleDebugOverlay,
  toggleDebug2Overlay,
  collapsibleMenu,
  toggleMenuBtn,
  closeMenuBtn,
  updatePersistentOverlays,
} from "./dom.js";
import { updateFrame, resetVisualization } from "./sync.js";
import { VIDEO_FPS } from "./constants.js";
import { findRadarFrameIndexForTime } from "./utils.js";

function handleKeyDown(event) {
  // --- FIX APPLIED HERE ---
  // We only want to block shortcuts if the user is actively typing in a text or number input.
  // This allows shortcuts to work even when other elements, like the timeline slider, are focused.
  const isTextInputFocused =
    event.target.tagName === "INPUT" &&
    (event.target.type === "text" || event.target.type === "number");
  if (isTextInputFocused) {
    return;
  }
  // --- END OF FIX ---

  const key = event.key;
  // We can add any new shortcut keys to this array.
  const recognizedKeys = [
    "ArrowRight",
    "ArrowLeft",
    "ArrowUp",
    "ArrowDown",
    " ",
    "1",
    "2",
    "3",
    "4",
    "t",
    "d",
    "g",
    "r",
    "p",
    "a",
    "s",
    "m",
    "q",
    "c",
  ];

  if (!appState.vizData || !recognizedKeys.includes(key)) {
    return;
  }

  event.preventDefault();

  // --- Spacebar for Play/Pause ---
  if (key === " ") {
    playPauseBtn.click();
  }

  // --- Arrow keys for frame-by-frame seeking ---
  if (key === "ArrowRight" || key === "ArrowLeft") {
    if (appState.isPlaying) {
      playPauseBtn.click();
    }
    let newFrame = appState.currentFrame;
    if (key === "ArrowRight") {
      newFrame = Math.min(
        appState.vizData.radarFrames.length - 1,
        appState.currentFrame + 1
      );
    } else if (key === "ArrowLeft") {
      newFrame = Math.max(0, appState.currentFrame - 1);
    }
    if (newFrame !== appState.currentFrame) {
      updateFrame(newFrame, true);
      // Manually trigger redraws since the animation loop is paused
      // This is the fix to ensure the radar plot updates on seek.
      if (appState.p5_instance) appState.p5_instance.redraw();
      if (appState.speedGraphInstance) appState.speedGraphInstance.redraw();
    }
  }

  // --- Arrow keys for video frame-by-frame seeking ---
  if (key === "ArrowUp" || key === "ArrowDown") {
    if (appState.isPlaying) {
      playPauseBtn.click(); // Pause playback to allow for precise stepping
    }

    const frameDuration = 1 / VIDEO_FPS;
    let newVideoTime = videoPlayer.currentTime;

    if (key === "ArrowUp") {
      newVideoTime += frameDuration;
    } else if (key === "ArrowDown") {
      newVideoTime -= frameDuration;
    }

    // Clamp the new time to be within the video's bounds
    videoPlayer.currentTime = Math.max(
      0,
      Math.min(newVideoTime, videoPlayer.duration)
    );

    // Find the corresponding radar frame for the new video time
    const newFrameIndex = findRadarFrameIndexForTime(
      videoPlayer.currentTime,
      appState.vizData
    );

    // Update the application state, but don't force another video seek
    updateFrame(newFrameIndex, false);

    // Manually trigger redraws since the animation loop is paused
    if (appState.p5_instance) appState.p5_instance.redraw();
    if (appState.speedGraphInstance) appState.speedGraphInstance.redraw();
  }

  // --- Number keys for color modes ---
  if (key >= "1" && key <= "4") {
    const colorToggles = [
      toggleSnrColor,
      toggleClusterColor,
      toggleInlierColor,
      toggleStationaryColor,
    ];
    const toggleIndex = parseInt(key) - 1;
    if (colorToggles[toggleIndex]) {
      colorToggles[toggleIndex].click();
    }
  }
  if (key === "q") {
    themeToggleBtn.click();
  }
  if (key === "t") {
    toggleTracks.click();
  }
  if (key === "d") {
    toggleVelocity.click();
  }
  if (key === "g") {
    toggleCloseUp.click();
  }
  if (key === "r") {
    resetVisualization();
  }
  if (key === "c") {
    appState.isRawOnlyMode = !appState.isRawOnlyMode;
    if (appState.p5_instance) {
      appState.p5_instance.redraw();
    }
  }
  if (key === "p") {
    togglePredictedPos.click();
    appState.p5_instance.redraw();
  }
  if (key === "s") {
    toggleSnrColor.click();
  }
  if (key === "a") {
    toggleDebugOverlay.click();
    toggleDebug2Overlay.click();
    updatePersistentOverlays(videoPlayer.currentTime);
    // The 'a' key is a shortcut to toggle all debug overlays on/off.
    // The `updateDebugOverlay` and `updatePersistentOverlays` functions,
    // which are called by the toggle's 'change' event listener,
    // already handle the logic for showing/hiding the other overlays.
  }
  if (key === "m") {
    if (collapsibleMenu.classList.contains("-translate-x-full")) {
      // If the menu is hidden (closed), trigger a click on the OPEN button.
      toggleMenuBtn.click();
    } else {
      // If the menu is not hidden (it's open), trigger a click on the CLOSE button.
      closeMenuBtn.click();
    }
  }
}

export function initKeyboardShortcuts() {
  document.addEventListener("keydown", handleKeyDown);
}