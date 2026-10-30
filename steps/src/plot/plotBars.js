// File: steps/src/plot/plotBars.js
/**
 * Zero-Latency Playback & Hover Bar Overlay
 * Replicated from Foxglove Studio (VerticalBars.tsx).
 *
 * Uses hardware-accelerated CSS `transform: translateX(...)` on an overlay div,
 * allowing 60-144 FPS smooth playback line tracking without re-rendering Chart.js.
 */

export class PlotBars {
  /**
   * @param {HTMLElement} parentContainer - Relative positioned canvas wrapper
   */
  constructor(parentContainer) {
    this.container = document.createElement("div");
    this.container.className = "plot-bars-overlay absolute inset-0 pointer-events-none overflow-hidden z-10";

    // 1. Playback indicator bar (Red line for current video/radar time)
    this.playbackBar = document.createElement("div");
    this.playbackBar.className =
      "plot-playback-bar absolute top-0 bottom-0 w-[1.5px] bg-red-500 shadow-[0_0_4px_rgba(239,68,68,0.7)] hidden will-change-transform";

    // Playback head marker (small triangle or dot at top)
    this.playbackHead = document.createElement("div");
    this.playbackHead.className =
      "absolute -top-0 -left-[4px] w-[9px] h-[5px] bg-red-500 rounded-b-sm";
    this.playbackBar.appendChild(this.playbackHead);

    // 2. Hover tracking bar (Cyan/yellow guide line following cursor)
    this.hoverBar = document.createElement("div");
    this.hoverBar.className =
      "plot-hover-bar absolute top-0 bottom-0 w-[1px] bg-amber-400 opacity-80 border-r border-dashed border-amber-400 hidden will-change-transform";

    this.container.appendChild(this.playbackBar);
    this.container.appendChild(this.hoverBar);
    parentContainer.appendChild(this.container);
  }

  /**
   * Updates the playback bar position using CSS transform translateX.
   *
   * @param {number} currentSec - Current playback time in seconds
   * @param {{min: number, max: number, left: number, right: number}|null} scale - Chart.js X scale bounds
   */
  updatePlaybackTime(currentSec, scale) {
    if (!scale || currentSec == null || isNaN(currentSec)) {
      this.playbackBar.style.display = "none";
      return;
    }

    // Check if within visible viewport bounds
    if (currentSec < scale.min || currentSec > scale.max) {
      this.playbackBar.style.display = "none";
      return;
    }

    const pixelRange = scale.right - scale.left;
    if (pixelRange <= 0) {
      this.playbackBar.style.display = "none";
      return;
    }

    const ratio = (currentSec - scale.min) / (scale.max - scale.min);
    const pixelX = scale.left + ratio * pixelRange;

    this.playbackBar.style.display = "block";
    this.playbackBar.style.transform = `translateX(${pixelX}px)`;
  }

  /**
   * Updates the hover guide bar position.
   *
   * @param {number} hoverSec - Hover timestamp in seconds
   * @param {{min: number, max: number, left: number, right: number}|null} scale - Chart.js X scale bounds
   */
  updateHoverTime(hoverSec, scale) {
    if (!scale || hoverSec == null || isNaN(hoverSec)) {
      this.hoverBar.style.display = "none";
      return;
    }

    if (hoverSec < scale.min || hoverSec > scale.max) {
      this.hoverBar.style.display = "none";
      return;
    }

    const pixelRange = scale.right - scale.left;
    if (pixelRange <= 0) {
      this.hoverBar.style.display = "none";
      return;
    }

    const ratio = (hoverSec - scale.min) / (scale.max - scale.min);
    const pixelX = scale.left + ratio * pixelRange;

    this.hoverBar.style.display = "block";
    this.hoverBar.style.transform = `translateX(${pixelX}px)`;
  }

  hideHover() {
    this.hoverBar.style.display = "none";
  }

  hidePlayback() {
    this.playbackBar.style.display = "none";
  }

  destroy() {
    if (this.container && this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
  }
}

