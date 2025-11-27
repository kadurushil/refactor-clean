import { appState } from "./state.js";
import { videoPlayer, themeToggleBtn} from "./dom.js";
const darkIcon = document.getElementById("theme-toggle-dark-icon");
const lightIcon = document.getElementById("theme-toggle-light-icon");

function setTheme(theme) {
  if (theme === "dark") {
    document.documentElement.classList.add("dark");
    lightIcon.classList.remove("hidden");
    darkIcon.classList.add("hidden");
    localStorage.setItem("color-theme", "dark");
  } else {
    document.documentElement.classList.remove("dark");
    darkIcon.classList.remove("hidden");
    lightIcon.classList.add("hidden");
    localStorage.setItem("color-theme", "light");
  }

  // Redraw the main radar plot to apply theme changes
  if (appState.p5_instance) {
    if (appState.p5_instance.drawTrackLegendToBuffer) {
      appState.p5_instance.drawTrackLegendToBuffer();
    }
    appState.p5_instance.redraw()

  };

  // Redraw the speed graph to apply theme changes
  if (appState.speedGraphInstance) {
    // Redraw the static background buffer with the new theme colors and then redraw the canvas.
    // This avoids calling setData, which can have unintended side effects.
    if (appState.vizData) {
      appState.speedGraphInstance.drawStaticGraphToBuffer(appState.vizData);
      appState.speedGraphInstance.redraw();
    }
  }
}

export function initializeTheme() {
  const savedTheme = localStorage.getItem("color-theme");
  if (savedTheme) {
    setTheme(savedTheme);
  } else {
    // Default to light mode if no theme is saved
    setTheme("light");
  }

  themeToggleBtn.addEventListener("click", () => {
    if (document.documentElement.classList.contains("dark")) {
      setTheme("light");
    } else {
      setTheme("dark");
    }
  });
}
