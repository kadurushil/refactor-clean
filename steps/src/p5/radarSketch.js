import { appState } from "../state.js";
import {
  RADAR_X_MAX,
  // Define radar plot boundaries
  RADAR_X_MIN,
  RADAR_Y_MAX,
  RADAR_Y_MIN,
} from "../constants.js";
import { canvasContainer, toggleSnrColor, toggleTracks } from "../dom.js";
import {
  drawStaticRegionsToBuffer,
  drawAxes,
  drawPointCloud,
  // Import drawing utility functions
  drawTrajectories,
  drawTrackMarkers,
  snrColors,
  handleCloseUpDisplay, // BUG FIX 1: Import the close-up handler
} from "../drawUtils.js";

export const radarSketch = function (p) {
  // Object to store calculated plot scales
  let plotScales = {
    plotScaleX: 1,
    plotScaleY: 1,
  };
  // p5.Graphics buffers for static elements to optimize drawing
  let staticBackgroundBuffer, snrLegendBuffer;

  // Function to calculate scaling factors for radar coordinates to canvas pixels
  function calculatePlotScales() {
    // Padding and offset values for the plot area
    const hPad = 0.05,
      vPad = 0.05,
      bOff = 0.05;
    // Calculate available width and height for the plot
    const aW = p.width * (1 - 2 * hPad);
    const aH = p.height * (1 - bOff - vPad);
    // Determine plot scales based on radar boundaries and available canvas space
    plotScales.plotScaleX = aW / (RADAR_X_MAX - RADAR_X_MIN);
    plotScales.plotScaleY = aH / (RADAR_Y_MAX - RADAR_Y_MIN);
  }

  p.setup = function () {
    // Create the p5.js canvas and attach it to the specified DOM element
    let canvas = p.createCanvas(
      canvasContainer.offsetWidth,
      canvasContainer.offsetHeight
    );
    canvas.parent("canvas-container");
    // Initialize graphics buffers
    staticBackgroundBuffer = p.createGraphics(p.width, p.height);
    snrLegendBuffer = p.createGraphics(100, 450);

    calculatePlotScales();
    p.drawSnrLegendToBuffer(appState.globalMinSnr, appState.globalMaxSnr);
    drawStaticRegionsToBuffer(p, staticBackgroundBuffer, plotScales);
    p.noLoop();
    // Disable continuous looping, redraw will be called manually
  };

  p.draw = function () {
    // Set background color based on current theme (dark/light)
    p.background(
      document.documentElement.classList.contains("dark")
        ? p.color(55, 65, 81)
        : 255
    );
    // If no visualization data is loaded, stop drawing
    if (!appState.vizData) return;

    // Draw the pre-rendered static background elements
    p.image(staticBackgroundBuffer, 0, 0);

    // Apply transformations for radar coordinate system (origin at bottom-center, Y-axis inverted)
    p.push();
    p.translate(p.width / 2, p.height * 0.95);
    p.scale(1, -1);

    // Recalculate plot scales (important for window resizing)
    calculatePlotScales();
    // Draw coordinate axes
    drawAxes(p, plotScales);

    // Get current frame data
    const frameData = appState.vizData.radarFrames[appState.currentFrame];
    if (frameData) {
      // Draw object trajectories and markers if enabled
      if (toggleTracks.checked) {
        drawTrajectories(p, plotScales);
        drawTrackMarkers(p, plotScales);
      }
      // Draw the point cloud for the current frame
      drawPointCloud(p, frameData.pointCloud, plotScales);
    }
    p.pop();

    // BUG FIX 1: Call the close-up handler if the mode is active
    if (appState.isCloseUpMode) {
      handleCloseUpDisplay(p, plotScales);
    }

    // Draw the SNR legend if enabled
    if (toggleSnrColor.checked) {
      p.image(snrLegendBuffer, 10, p.height - snrLegendBuffer.height - 10);
    }
  };

  // Function to draw the SNR legend to its buffer
  p.drawSnrLegendToBuffer = function (minV, maxV) {
    // Reference to the SNR legend buffer
    const b = snrLegendBuffer;
    const localSnrColors = snrColors(p);
    b.clear();
    b.push();
    const lx = 10,
      ly = 20,
      lw = 15,
      // Dimensions for the color bar
      lh = 400;
    for (let i = 0; i < lh; i++) {
      const amt = b.map(i, 0, lh, 1, 0);
      let c;
      if (amt < 0.25)
        c = b.lerpColor(localSnrColors.c1, localSnrColors.c2, amt / 0.25);
      else if (amt < 0.5)
        c = b.lerpColor(
          localSnrColors.c2,
          localSnrColors.c3,
          (amt - 0.25) / 0.25
        );
      else if (amt < 0.75)
        c = b.lerpColor(
          localSnrColors.c3,
          localSnrColors.c4,
          (amt - 0.5) / 0.25
        );
      else
        c = b.lerpColor(
          localSnrColors.c4,
          localSnrColors.c5,
          // Interpolate colors based on position
          (amt - 0.75) / 0.25
        );
      b.stroke(c);
      b.line(lx, ly + i, lx + lw, ly + i);
    }
    // Set text color based on theme
    b.fill(document.documentElement.classList.contains("dark") ? 255 : 0);
    b.noStroke();
    b.textSize(10);
    b.textAlign(b.LEFT, b.CENTER);
    // Draw min/max SNR values and label
    b.text(maxV.toFixed(1), lx + lw + 5, ly);
    b.text(minV.toFixed(1), lx + lw + 5, ly + lh);
    b.text("SNR", lx, ly - 10);
    b.pop();
  };

  // Handle window resizing event
  p.windowResized = function () {
    p.resizeCanvas(canvasContainer.offsetWidth, canvasContainer.offsetHeight);
    // BUG FIX 2: Re-create the buffer instead of resizing it
    staticBackgroundBuffer = p.createGraphics(p.width, p.height);
    calculatePlotScales();
    // Re-draw the static content to the new buffer
    drawStaticRegionsToBuffer(p, staticBackgroundBuffer, plotScales);
    if (appState.vizData) p.redraw();
  };
};
