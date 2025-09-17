import { appState } from "../state.js";
import {
  RADAR_X_MAX,
  // Define radar plot boundaries
  RADAR_X_MIN,
  RADAR_Y_MAX,
  RADAR_Y_MIN,
} from "../constants.js";
import {
  canvasContainer,
  toggleSnrColor,
  toggleTracks,
  togglePredictedPos,
  toggleCovariance,
  toggleVelocity,
  toggleClusterColor,
} from "../dom.js";
import {
  drawStaticRegionsToBuffer,
  drawAxes,
  drawPointCloud,
  drawTrajectories,
  drawEgoVehicle,
  drawTrackMarkers,
  snrColors,
  handleCloseUpDisplay,
  drawCovarianceEllipse,
  ttcColors,
  drawRegionsOfInterest,
  drawClusterCentroids
} from "../drawUtils.js";

export const radarSketch = function (p) {
  // Object to store calculated plot scales
  let plotScales = {
    plotScaleX: 1,
    plotScaleY: 1,
  };
  // p5.Graphics buffers for static elements to optimize drawing
  let staticBackgroundBuffer, snrLegendBuffer, trackLegendBuffer;

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
    trackLegendBuffer = p.createGraphics(120, 120); // create track legend

    calculatePlotScales();
    p.drawSnrLegendToBuffer(appState.globalMinSnr, appState.globalMaxSnr);
    p.drawTrackLegendToBuffer(); // Call the new function to draw the legend

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
    drawEgoVehicle(p, plotScales);
    // Get current frame data
    const frameData = appState.vizData.radarFrames[appState.currentFrame];
    if (frameData) {
      drawRegionsOfInterest(p, frameData, plotScales);
      drawTrackMarkers(p, plotScales);

      // Draw object trajectories and markers if enabled
      // if (toggleVelocity.checked) {
      //   drawTrackMarkers(p, plotScales);
      // }
      if (togglePredictedPos.checked) {
        for (const track of appState.vizData.tracks) {
          const log = track.historyLog.find(
            (log) => log.frameIdx === appState.currentFrame + 1
          );
          if (
            log &&
            log.predictedPosition &&
            log.predictedPosition[0] !== null
          ) {
            const pos = log.predictedPosition;
            const x = pos[0] * plotScales.plotScaleX;
            const y = pos[1] * plotScales.plotScaleY;

            p.push();
            p.stroke(255, 0, 0); // Red for predicted
            p.strokeWeight(2);
            p.line(x - 4, y - 4, x + 4, y + 4);
            p.line(x + 4, y - 4, x - 4, y + 4);
            p.pop();
          }
        }
      }

      if (toggleTracks.checked) {
        drawTrajectories(p, plotScales);
        if (toggleCovariance.checked) {
          for (const track of appState.vizData.tracks) {
            const log = track.historyLog.find(
              (log) => log.frameIdx === appState.currentFrame + 1
            );
            if (
              log &&
              log.ellipseRadii &&
              typeof log.ellipseAngle !== "undefined"
            ) {
              const pos = log.predictedPosition;
              if (pos && pos[0] !== null) {
                drawCovarianceEllipse(
                  p,
                  pos,
                  log.ellipseRadii,
                  log.ellipseAngle,
                  plotScales,
                  log.isStationary
                );
              }
            }
          }
        }
      }
      // Draw the point cloud for the current frame
      drawPointCloud(p, frameData.pointCloud, plotScales);
      // Draw cluster centroids if enabled
      if(toggleClusterColor.checked){

      drawClusterCentroids(p, frameData.clusters, plotScales);
      }
    }
    p.pop();

    // 4. Draw the new legend buffer onto the main canvas
    // This is placed at the bottom-right corner.
    if (toggleTracks.checked) {
      p.image(
        trackLegendBuffer,
        p.width - trackLegendBuffer.width - 0,
        p.height - trackLegendBuffer.height - 20
      );
    }

    // BUG FIX 1: Call the close-up handler if the mode is active
    if (appState.isCloseUpMode) {
      handleCloseUpDisplay(p, plotScales);
    }

    // Draw the SNR legend if enabled
    if (toggleSnrColor.checked) {
      p.image(snrLegendBuffer, 10, p.height - snrLegendBuffer.height - 10);
    }
  };

  // 5. Create the new function to draw the track legend's content
  p.drawTrackLegendToBuffer = function () {
    const b = trackLegendBuffer;
    const localTtcColors = ttcColors(p);
    const isDark = document.documentElement.classList.contains("dark");

    b.clear();
    b.push();

    // Set styles based on theme
    const textColor = isDark ? 255 : 0;
    const bgColor = isDark
      ? p.color(55, 65, 81, 100)
      : p.color(255, 255, 255, 100);

    // Draw semi-transparent background for the legend
    b.fill(bgColor);
    b.stroke(1);
    b.strokeWeight(0.25);
    b.rect(0, 0, b.width, b.height, 8); // Rounded corners

    b.fill(textColor);
    b.textSize(12);
    b.textStyle(b.BOLD);
    b.text("Track Legend", 10, 20);

    b.textSize(10);
    b.textStyle(b.NORMAL);
    b.strokeWeight(3);
    let yPos = 40;

    // Legend items
    const legendItems = [
      { label: "Critical Risk", color: localTtcColors.critical },
      { label: "High Risk", color: localTtcColors.high },
      { label: "Medium Risk", color: localTtcColors.medium },
      { label: "Low Risk", color: localTtcColors.low },
      { label: "Moving Away", color: localTtcColors.away },
      { label: "Stationary", color: p.color(34, 139, 34), dashed: true },
    ];
    for (const item of legendItems) {
      b.stroke(item.color);
      if (item.dashed) {
        b.drawingContext.setLineDash([3, 3]);
      }
      b.line(15, yPos, 45, yPos);
      b.drawingContext.setLineDash([]); // Reset dash for next items
      b.noStroke();
      b.text(item.label, 55, yPos + 4);
      yPos += 18;
    }

    b.pop();
  };


  // Handle window resizing event
  p.windowResized = function () {
    p.resizeCanvas(canvasContainer.offsetWidth, canvasContainer.offsetHeight);
    // BUG FIX 2: Re-create the buffer instead of resizing it
    staticBackgroundBuffer = p.createGraphics(p.width, p.height);
    
    // 6. Re-create and re-draw the track legend buffer on resize
    trackLegendBuffer = p.createGraphics(100, 100);
    p.drawTrackLegendToBuffer();
    
    calculatePlotScales();
    drawStaticRegionsToBuffer(p, staticBackgroundBuffer, plotScales);
    if (appState.vizData) {p.redraw()

    };
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
