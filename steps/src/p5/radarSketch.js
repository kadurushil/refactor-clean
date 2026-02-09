import { appState } from "../state.js";
import { debugFlags } from "../debug.js";
import {
  RADAR_X_MAX,
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
  toggleVehicleDimensions,
  toggleClusterColor,
  toggleConfirmedOnly,
  rangeSlider,
  rangeValueDisplay,
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
  drawObjectDimensions,
  ttcColors,
  drawRegionsOfInterest,
  drawClusterCentroids,
} from "../drawUtils.js";

export const radarSketch = function (p) {
  // Object to store calculated plot scales
  let plotScales = {
    plotScaleX: 1,
    plotScaleY: 1,
  };
  // p5.Graphics buffers for static elements to optimize drawing
  let staticBackgroundBuffer, snrLegendBuffer, trackLegendBuffer;

  // --- START: Mouse Smoothing Variables ---
  let smoothedMouseX = 0;
  let smoothedMouseY = 0;
  let isFirstFrame = true; // Flag to initialize smoothed position
  // --- END: Mouse Smoothing Variables ---

  // --- START: FPS Calculation Variables ---
  let lastFrameTime = 0;
  let framesDrawn = 0;
  // --- END: FPS Calculation Variables ---

  // Helper function to allow other sketches to access the static background
  p.getStaticBackground = function () {
    return staticBackgroundBuffer;
  };
  // Function to calculate scaling factors for radar coordinates to canvas pixels
  function calculatePlotScales() {
    // --- START: Safety Fallback Logic ---
    // Ensure we have valid numbers; if not, revert to constants from constants.js
    const xMin = typeof appState.radarXMin === 'number' ? appState.radarXMin : RADAR_X_MIN;
    const xMax = typeof appState.radarXMax === 'number' ? appState.radarXMax : RADAR_X_MAX;
    const yMin = typeof appState.radarYMin === 'number' ? appState.radarYMin : RADAR_Y_MIN;
    const yMax = typeof appState.radarYMax === 'number' ? appState.radarYMax : RADAR_Y_MAX;

    const dx = xMax - xMin;
    const dy = yMax - yMin;

    // Final safety: Prevent division by zero if values are somehow identical or inverted
    const safeDx = dx > 0 ? dx : 50; // Default width 50m
    const safeDy = dy > 0 ? dy : 80; // Default height 80m
    // --- END: Safety Fallback Logic ---

    // Padding and offset values for the plot area
    const hPad = 0.05,
      vPad = 0.05,
      bOff = 0.05;
    // Calculate available width and height for the plot
    const aW = p.width * (1 - 2 * hPad);
    const aH = p.height * (1 - bOff - vPad);
    
    // Determine plot scales based on radar boundaries and available canvas space
    plotScales.plotScaleX = aW / safeDx;
    plotScales.plotScaleY = aH / safeDy;
  }

  p.setup = function () {
    // Create the p5.js canvas and attach it to the specified DOM element
    let canvas = p.createCanvas(
      canvasContainer.offsetWidth,
      canvasContainer.offsetHeight
    );
    canvas.parent("canvas-container");

    // --- START: Manual Mouse Wheel Listener for Passive Option ---
    // We attach the listener manually to the canvas element to set the `passive` flag to `false`.
    // This is necessary to allow `event.preventDefault()` and signals to the browser that
    // we are intentionally handling the scroll behavior, resolving the console warning.
    canvas.elt.addEventListener(
      "wheel",
      (event) => {
        // Only run this logic if the close-up mode is active
      // Only allow zooming in god mode if the shift key is NOT pressed.
      // When shift is pressed, the scroll event is used for timeline seeking.
      if (appState.isCloseUpMode && !event.shiftKey) {          event.preventDefault(); // Prevent the page from scrolling

          const zoomSpeed = 0.5;
          const direction = Math.sign(event.deltaY);
          let newZoomFactor = appState.zoomFactor - direction * zoomSpeed;

          // Clamp the zoom factor to a reasonable range
          newZoomFactor = p.constrain(newZoomFactor, 1.5, 30);
          appState.zoomFactor = newZoomFactor;

          // IMPORTANT: We must manually trigger a redraw of the zoom sketch
          // so it immediately updates with the new zoom factor.
          if (
            appState.zoomSketchInstance &&
            appState.zoomSketchInstance.updateAndDraw
          ) {
            const hoveredItems = handleCloseUpDisplay(p, plotScales, p.mouseX, p.mouseY);
            appState.zoomSketchInstance.updateAndDraw(
              p.mouseX,
              p.mouseY,
              hoveredItems,
              plotScales
            );
          }
        }
      },
      { passive: false }
    );
    // --- END: Manual Mouse Wheel Listener ---

    // Initialize graphics buffers
    staticBackgroundBuffer = p.createGraphics(p.width, p.height);
    snrLegendBuffer = p.createGraphics(100, 450);
    trackLegendBuffer = p.createGraphics(120, 120); // create track legend

    calculatePlotScales();
    p.drawSnrLegendToBuffer(appState.globalMinSnr, appState.globalMaxSnr);
    p.drawTrackLegendToBuffer(); // Call the new function to draw the legend

    drawStaticRegionsToBuffer(p, staticBackgroundBuffer, plotScales);
    
    // Reset FPS state to prevent stale values from previous sessions
    appState.fps = 0; 
    
    // --- START: Radar Range Slider Logic ---
    if (rangeSlider && rangeValueDisplay) {
      // Initialize slider value from appState
      rangeSlider.value = appState.radarYMax;
      rangeValueDisplay.textContent = appState.radarYMax + "m";

      // Add listener to handle slider changes
      rangeSlider.addEventListener("input", () => {
        const newMax = parseInt(rangeSlider.value);
        appState.radarYMax = newMax;
        rangeValueDisplay.textContent = newMax + "m";

        // Recalculate scales and redraw static background
        calculatePlotScales();
        drawStaticRegionsToBuffer(p, staticBackgroundBuffer, plotScales);
        
        // Redraw main sketch to reflect new scale immediately
        p.redraw();
      });

      // Reset to default on double-click
      rangeSlider.addEventListener("dblclick", () => {
        appState.radarYMax = RADAR_Y_MAX;
        rangeSlider.value = RADAR_Y_MAX;
        rangeValueDisplay.textContent = RADAR_Y_MAX + "m";
        calculatePlotScales();
        drawStaticRegionsToBuffer(p, staticBackgroundBuffer, plotScales);
        p.redraw();
      });
    }
    // --- END: Radar Range Slider Logic ---

    p.noLoop();
    // Disable continuous looping, redraw will be called manually
  };

  p.draw = function () {
    if (debugFlags.drawing) {
      console.log(`[${performance.now().toFixed(3)}] draw_DEBUG: radarSketch.draw() called.`);
    }

    // --- START: FPS Calculation & Display ---
    framesDrawn++;
    const currentTime = p.millis();
    
    // Skip FPS calculation during the first few frames to avoid initialization spikes.
    // This prevents the "300+ FPS" bug caused by the race between auto-draw and first redraw.
    if (framesDrawn < 10) {
      lastFrameTime = currentTime;
    } else {
      const delta = currentTime - lastFrameTime;
      if (delta > 0) {
        const currentFps = 1000 / delta;
        // On the first valid calculation, snap to the current FPS to avoid slow ramp-up.
        // Otherwise, use exponential moving average for smoothing.
        if (framesDrawn === 10 || appState.fps === 0) {
          appState.fps = currentFps;
        } else {
          const smoothingFactor = 0.95;
          appState.fps = appState.fps * smoothingFactor + currentFps * (1 - smoothingFactor);
        }
      }
      lastFrameTime = currentTime;
    }
    // --- END: FPS Calculation & Display ---

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
    
    // --- OPTIMIZATION: Axes and Ego Vehicle are now in staticBackgroundBuffer ---
    // drawAxes(p, plotScales);
    // drawEgoVehicle(p, plotScales);
    
    // Get current frame data
    const frameData = appState.vizData.radarFrames[appState.currentFrame];
    if (frameData) {
      drawPointCloud(p, frameData.pointCloud, plotScales);
      if (!appState.isRawOnlyMode) {
        drawRegionsOfInterest(p, frameData, plotScales);
        drawTrackMarkers(p, plotScales);

        // Draw object trajectories and markers if enabled
        // if (toggleVelocity.checked) {
        //   drawTrackMarkers(p, plotScales);
        // }
        if (togglePredictedPos.checked) {
          for (const track of appState.vizData.tracks) {
            if (toggleConfirmedOnly.checked && track.isConfirmed === false) {
              continue;
            }
            const log = track.historyLog.find((log) => log.frameIdx === appState.currentFrame);
            if (
              log &&
              log.predictedPosition &&
              log.predictedPosition[0] !== null
            ) {
              const pos = log.predictedPosition;  //using predicted position from data 
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
              if (toggleConfirmedOnly.checked && track.isConfirmed === false) {
                continue;
              }
              const log = track.historyLog.find(
                (log) => log.frameIdx === appState.currentFrame);
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
          if (toggleVehicleDimensions.checked) {
            for (const track of appState.vizData.tracks) {
              if (toggleConfirmedOnly.checked && track.isConfirmed === false) {
                continue;
              }
              const log = track.historyLog.find(
                (log) => log.frameIdx === appState.currentFrame);
              if (
                log &&
                log.objectExtentRadii &&
                typeof log.objectExtentAngle !== "undefined"
              ) {
                const pos = log.correctedPosition;
                if (pos && pos[0] !== null) {
                  drawObjectDimensions(
                    p,
                    pos,
                    log.objectExtentRadii,
                    log.objectExtentAngle,
                    plotScales,
                    log.isStationary
                  );
                }
              }
            }
          }
        }

        // Draw cluster centroids if enabled
        if (toggleClusterColor.checked) {
          drawClusterCentroids(p, frameData.clusters, plotScales);
        }
      }
    }
    p.pop();

    // 4. Draw the new legend buffer onto the main canvas
    // This is placed at the bottom-right corner.
    if (toggleTracks.checked && !appState.isRawOnlyMode) {
      p.image(
        trackLegendBuffer,
        p.width - trackLegendBuffer.width - 10,
        p.height - trackLegendBuffer.height - 20
      );
    }
    // End main radar transformations

    // BUG FIX 1: Call the close-up handler if the mode is active
    // --- Zoom and Tooltip Logic ---
    const COOLING_PERIOD_MS = 2000; // Set to 3 seconds for the countdown
    const zoomPanel = document.getElementById("zoom-panel");
    if (appState.isCloseUpMode) {
      // --- START: Mouse Smoothing Logic ---
      // --- START: Cursor Indicator Logic ---
      // Change the cursor to provide a visual cue for the current scroll behavior.
      if (p.keyIsDown(p.SHIFT)) {
        p.cursor("ew-resize"); // Indicates horizontal seeking (timeline scrub)
      } else {
        p.cursor("crosshair"); // Default for zoom/inspection
      }
      // --- END: Cursor Indicator Logic ---

      // On the first frame of zoom, snap the smoothed position to the real mouse position.
      if (isFirstFrame) {
        smoothedMouseX = p.mouseX;
        smoothedMouseY = p.mouseY;
        isFirstFrame = false;
      }

      // The smoothing factor. A smaller value (e.g., 0.1) means more smoothing.
      // This can be adjusted to feel more or less responsive.
      const smoothingFactor = 0.5;

      // Linearly interpolate the smoothed position towards the actual mouse position.
      smoothedMouseX = p.lerp(smoothedMouseX, p.mouseX, smoothingFactor);
      smoothedMouseY = p.lerp(smoothedMouseY, p.mouseY, smoothingFactor);

      // Use the smoothed coordinates for all subsequent zoom-related calculations.
      const hoveredItems = handleCloseUpDisplay(p, plotScales, smoothedMouseX, smoothedMouseY);
      // --- END: Mouse Smoothing Logic ---

      // --- START: Draw Zoom Area Rectangle & Debug Circle ---
      const zoomWindow = document.getElementById("zoom-canvas-container");
      if (zoomWindow) {
        const zoomWindowWidth = zoomWindow.offsetWidth;
        const zoomWindowHeight = zoomWindow.offsetHeight;

        // Calculate the dimensions of the source rectangle on the main canvas.
        const sourceWidth = zoomWindowWidth / appState.zoomFactor;
        const sourceHeight = zoomWindowHeight / appState.zoomFactor;

        // --- START: THEME-AWARE COLOR LOGIC ---
        const isDark = document.documentElement.classList.contains("dark");
        const rectColor = isDark ? p.color(255, 80, 80, 200) : p.color(220, 20, 60, 180);
        // --- END: THEME-AWARE COLOR LOGIC ---

        p.push();
        p.noFill();
        p.stroke(rectColor);
        p.strokeWeight(1); // Reduced thickness.
        p.drawingContext.setLineDash([5, 3]); // Dashed line.
        p.rectMode(p.CENTER);
        p.rect(smoothedMouseX, smoothedMouseY, sourceWidth, sourceHeight); // Use smoothed values
        p.drawingContext.setLineDash([]); // Reset line dash
        p.pop();
      }

      // Draw a temporary debug circle representing the hover radius.
      // This formula must match the one in drawUtils.js for accurate visualization.
      const hoverRadius = p.constrain(80 / appState.zoomFactor, 5, 25);
      const isDark = document.documentElement.classList.contains("dark");
      const circleColor = isDark ? p.color(50, 205, 50, 200) : p.color(0, 128, 0, 180);

      p.push();
      p.noFill();
      p.stroke(circleColor);
      p.strokeWeight(1);
      p.ellipse(smoothedMouseX, smoothedMouseY, hoverRadius * 2, hoverRadius * 2); // Use smoothed values
      p.pop();
      // --- END: Draw Zoom Area Rectangle & Debug Circle ---

      if (hoveredItems.length > 0) {
        // If we are hovering, cancel any existing countdown.
        clearTimeout(appState.zoomHideDelayTimeout);
        appState.zoomHideDelayTimeout = null;
        clearInterval(appState.zoomCountdownInterval);
        appState.zoomCountdownInterval = null;
        appState.zoomCountdown = null;

        if (zoomPanel.style.display !== "block") {
          zoomPanel.style.display = "block";
        }
        if (
          appState.zoomSketchInstance &&
          appState.zoomSketchInstance.updateAndDraw
        ) {
          appState.zoomSketchInstance.updateAndDraw(
            smoothedMouseX, // Use smoothed values
            smoothedMouseY, // Use smoothed values
            hoveredItems,
            plotScales
          );
        }
      } else if (zoomPanel.style.display === "block") {
        // --- START: FIX for Grace Period Freeze ---
        // If NOT hovering, but the panel is still visible, we must continue
        // to update the zoom sketch so it follows the mouse.
        // We pass an empty array for hoveredItems, so no tooltip is drawn.
        if (
          appState.zoomSketchInstance &&
          appState.zoomSketchInstance.updateAndDraw
        ) {
          appState.zoomSketchInstance.updateAndDraw(
            smoothedMouseX, // Use smoothed values
            smoothedMouseY, // Use smoothed values
            [], // Pass empty array to hide tooltips
            plotScales
          );
        }
        // --- END: FIX for Grace Period Freeze ---
        // 2. If a "hide" timer isn't already running, start one.
        if (!appState.zoomHideDelayTimeout && !appState.zoomCountdownInterval) {
          // Start a 2-second delay before the countdown begins.
          appState.zoomHideDelayTimeout = setTimeout(() => {
            appState.zoomHideDelayTimeout = null; // Clear the delay timer ID
            // Now, start the actual 3-second countdown interval.
            appState.zoomCountdown = Math.floor(COOLING_PERIOD_MS / 1000);
            appState.zoomCountdownInterval = setInterval(() => {
              appState.zoomCountdown--;
              if (appState.zoomCountdown <= 0) {
                // When countdown finishes, hide panel and clear interval.
                clearInterval(appState.zoomCountdownInterval);
                appState.zoomCountdownInterval = null;
                appState.zoomCountdown = null;
                zoomPanel.style.display = "none";
              } else {
                // Force a redraw of the zoom sketch to show the new countdown value.
                // This call is still needed inside the interval to update the countdown text.
                if (appState.zoomSketchInstance && appState.zoomSketchInstance.updateAndDraw) {
                  // Pass empty hoveredItems to show the countdown text.
                  appState.zoomSketchInstance.updateAndDraw(
                    smoothedMouseX,
                    smoothedMouseY,
                    [],
                    plotScales);
                }
              }
            }, 1000);
          }, 1000); // 1000ms = 1 second delay
        }
      }
    } else {
      // --- START: Cleanup Logic ---
      // When zoom mode is turned off, ensure all timers are cleared.
      if (appState.zoomHideDelayTimeout) {
        clearTimeout(appState.zoomHideDelayTimeout);
        appState.zoomHideDelayTimeout = null;
      }
      if (appState.zoomCountdownInterval) {
        clearInterval(appState.zoomCountdownInterval);
        appState.zoomCountdownInterval = null;
      }
      // --- END: Cleanup Logic ---
      p.cursor(p.AUTO); // Reset cursor when exiting god mode
      zoomPanel.style.display = "none";
      isFirstFrame = true; // Reset for the next time zoom mode is enabled
    }
    // --- Legend Drawing ---
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



  p.windowResized = function () {
    console.log("radarSketch: windowResized triggered!");

    // Immediately resize the elements that we know are stable.
    p.resizeCanvas(canvasContainer.offsetWidth, canvasContainer.offsetHeight);
    staticBackgroundBuffer = p.createGraphics(p.width, p.height);
    trackLegendBuffer = p.createGraphics(120, 120);
    p.drawTrackLegendToBuffer();
    calculatePlotScales();
    drawStaticRegionsToBuffer(p, staticBackgroundBuffer, plotScales);

    // Defer the call to destroy the zoom canvas.
    if (appState.zoomSketchInstance && appState.isCloseUpMode) {
      setTimeout(() => {
        console.log(
          "radarSketch: Executing deferred call to zoomSketch.handleResize()."
        );
        appState.zoomSketchInstance.handleResize();
      }, 10); // A 10ms delay is slightly more robust than 0.
    }

    if (appState.vizData) {
      p.redraw();
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
};
