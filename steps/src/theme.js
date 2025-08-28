import { appState } from "./state.js";
import { videoPlayer } from "./dom.js";
const themeToggleBtn = document.getElementById("theme-toggle");
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
  if (appState.p5_instance) appState.p5_instance.redraw();

  // Redraw the speed graph to apply theme changes
  if (appState.speedGraphInstance) {
    // Check if there's data available to draw on the speed graph
    if (
      (appState.canData.length > 0 || appState.vizData) &&
      videoPlayer.duration
    ) {
      // If data exists, redraw the static parts of the graph to a buffer
      // This ensures the background and static elements reflect the new theme
      appState.speedGraphInstance.drawStaticGraphToBuffer(
        appState.canData,
        appState.vizData
      );
    }
    // Request a redraw of the speed graph to display the updated buffer
    appState.speedGraphInstance.redraw();
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
