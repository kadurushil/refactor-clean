//---Import APPSTATE VIDEOPLAYER and FindLastCanIndex---//

import { appState } from "../state.js";
import { videoPlayer, speedGraphContainer } from "../dom.js";
import { findLastCanIndexBefore } from "../utils.js";

export const speedGraphSketch = function (p) {
  // Declare variables for the static buffer, min/max speed for scaling, and video duration.
  let staticBuffer, minSpeed, maxSpeed, videoDuration;
  // Define padding for the graph to ensure elements are not drawn at the edges.
  const pad = { top: 20, right: 130, bottom: 30, left: 50 };

  /**
   * Draws the static elements of the speed graph (axes, grid, labels, and data lines)
   * to an off-screen buffer. This optimizes performance by not redrawing these elements
   * every frame.
   * @param {Array} canSpeedData - Array of CAN speed data points.
   * @param {Object} radarData - Object containing radar frames with ego velocity.
   */
  // This function is now attached to the p5 instance, making it public
  // It's responsible for drawing the static background and data lines
  p.drawStaticGraphToBuffer = function (canSpeedData, radarData) {
    const b = staticBuffer;
    b.clear();
    const isDark = document.documentElement.classList.contains("dark");
    b.background(isDark ? [55, 65, 81] : 255);
    const gridColor = isDark ? 100 : 200;
    const textColor = isDark ? 200 : 100; // Determine text color based on theme.

    // Push current drawing style settings onto a stack.
    b.push();
    // Set stroke for grid lines.
    b.stroke(gridColor);
    // Set stroke weight for grid lines.
    b.strokeWeight(1);
    b.line(pad.left, pad.top, pad.left, b.height - pad.bottom);
    b.line(
      pad.left,
      b.height - pad.bottom,
      b.width - pad.right,
      b.height - pad.bottom
    ); // Draw Y and X axes.
    // Set text alignment for Y-axis labels.
    b.textAlign(b.RIGHT, b.CENTER);
    b.noStroke();
    b.fill(textColor);
    // Set text size for labels.
    b.textSize(10);
    // Draw horizontal grid lines and speed labels.
    for (let s = minSpeed; s <= maxSpeed; s += 10) {
      const y = b.map(s, minSpeed, maxSpeed, b.height - pad.bottom, pad.top);
      b.text(s, pad.left - 8, y);
      if (s === 0) {
        b.strokeWeight(1.5);
        b.stroke(isDark ? 150 : 180);
      } else {
        b.strokeWeight(1);
        b.stroke(isDark ? 80 : 230);
      }
      b.line(pad.left + 1, y, b.width - pad.right, y);
      b.noStroke();
    }
    // Draw Y-axis unit label.
    b.fill(textColor);
    b.text("km/h", pad.left - 8, pad.top - 8);
    // Set text alignment for X-axis labels.
    b.textAlign(b.CENTER, b.TOP);
    b.noStroke();
    b.fill(isDark ? 180 : 150);
    // Calculate time interval for X-axis labels.
    const tInt = Math.max(1, Math.floor(videoDuration / 10));
    for (let t = 0; t <= videoDuration; t += tInt) {
      const x = b.map(t, 0, videoDuration, pad.left, b.width - pad.right);
      b.text(Math.round(t), x, b.height - pad.bottom + 5);
    }
    b.fill(textColor);
    b.text("Time (s)", b.width / 2, b.height - pad.bottom + 18);
    // Restore previous drawing style settings.
    b.pop();

    // Draw CAN speed data line if available.
    if (canSpeedData && canSpeedData.length > 0) {
      b.noFill(); // Do not fill the shape.
      b.stroke(0, 150, 255);
      b.strokeWeight(1.5);
      b.beginShape();
      for (const d of canSpeedData) {
        const relTime = (d.time - appState.videoStartDate.getTime()) / 1000;
        if (relTime >= 0 && relTime <= videoDuration) {
          const x = b.map(
            relTime,
            0,
            videoDuration,
            pad.left,
            b.width - pad.right
          );
          const y = b.map(
            d.speed,
            minSpeed,
            maxSpeed,
            b.height - pad.bottom,
            pad.top
          );
          b.vertex(x, y);
        }
      }
      b.endShape();
    } // End of CAN speed data drawing.

    // Draw radar ego speed data line if available.
    if (radarData && radarData.radarFrames) {
      b.stroke(0, 200, 100);
      b.drawingContext.setLineDash([5, 5]);
      b.beginShape();
      for (const frame of radarData.radarFrames) {
        const relTime = frame.timestampMs / 1000;
        if (relTime >= 0 && relTime <= videoDuration) {
          const x = b.map(
            relTime,
            0,
            videoDuration,
            pad.left,
            b.width - pad.right
          );
          const egoSpeedKmh = frame.egoVelocity[1] * 3.6;
          const y = b.map(
            egoSpeedKmh,
            minSpeed,
            maxSpeed,
            b.height - pad.bottom,
            pad.top
          );
          b.vertex(x, y);
        }
      }
      b.endShape();
      b.drawingContext.setLineDash([]); // Reset line dash to solid.
    } // End of radar ego speed data drawing.

    // Draw legend for the graph lines.
    b.push();
    b.strokeWeight(2);
    b.noStroke();
    b.fill(textColor);
    b.textAlign(b.LEFT, b.CENTER);
    b.stroke(0, 150, 255);
    b.line(b.width - 120, pad.top + 10, b.width - 100, pad.top + 10);
    b.noStroke();
    b.text("CAN Speed", b.width - 95, pad.top + 10);
    b.stroke(0, 200, 100);
    b.drawingContext.setLineDash([3, 3]);
    b.line(b.width - 120, pad.top + 30, b.width - 100, pad.top + 30);
    b.drawingContext.setLineDash([]);
    b.noStroke();
    b.text("Ego Speed", b.width - 95, pad.top + 30);
    b.pop();
  };
  /**
   * p5.js setup function. Initializes the canvas and static buffer.
   */
  p.setup = function () {
    let canvas = p.createCanvas(
      speedGraphContainer.offsetWidth,
      speedGraphContainer.offsetHeight
    );
    canvas.parent("speed-graph-container");
    // Create an off-screen graphics buffer for static elements.
    staticBuffer = p.createGraphics(p.width, p.height);
    // Disable continuous looping; draw will be called manually.
    p.noLoop();
  };
  /**
   * Sets the data for the speed graph and recalculates min/max speed for scaling.
   * @param {Array} canSpeedData - Array of CAN speed data points.
   * @param {Object} radarData - Object containing radar frames with ego velocity.
   * @param {number} duration - The total duration of the video in seconds.
   */
  p.setData = function (canSpeedData, radarData, duration) {
    if ((!canSpeedData || canSpeedData.length === 0) && !radarData) return; // Exit if no data.
    videoDuration = duration;

    let speeds = [];
    if (canSpeedData) {
      speeds.push(...canSpeedData.map((d) => parseFloat(d.speed)));
    }
    if (radarData && radarData.radarFrames) {
      const egoSpeeds = radarData.radarFrames.map(
        (frame) => frame.egoVelocity[1] * 3.6
      );
      speeds.push(...egoSpeeds);
    }

    // Calculate min and max speeds for Y-axis scaling, rounding to nearest 10.
    minSpeed =
      speeds.length > 0 ? Math.floor(Math.min(...speeds) / 10) * 10 : 0;
    maxSpeed =
      speeds.length > 0 ? Math.ceil(Math.max(...speeds) / 10) * 10 : 10;
    // Ensure maxSpeed is at least 10 if all speeds are non-positive.
    if (maxSpeed <= 0) maxSpeed = 10;
    // Ensure minSpeed is 0 if all speeds are non-negative.
    if (minSpeed >= 0) minSpeed = 0;

    // Redraw the static graph elements to the buffer with new data.
    p.drawStaticGraphToBuffer(canSpeedData, radarData);
    // Request a redraw of the main canvas.
    p.redraw();
  };
  /**
   * p5.js draw function. Draws the static buffer and the dynamic time indicator.
   */
  p.draw = function () {
    if (!videoDuration) return; // Only draw if video duration is set.
    p.image(staticBuffer, 0, 0);
    drawTimeIndicator();
  };

  function drawTimeIndicator() {
    const currentTime = videoPlayer.currentTime;
    const x = p.map(
      currentTime,
      0,
      videoDuration,
      pad.left,
      p.width - pad.right
    ); // Map current time to X-coordinate.
    // Draw the red time indicator line.
    p.stroke(255, 0, 0, 150);
    p.strokeWeight(1.5);
    p.line(x, pad.top, x, p.height - pad.bottom);

    // Draw a circle on the CAN speed line at the current time.
    const videoAbsTimeMs =
      appState.videoStartDate.getTime() + currentTime * 1000;
    const canIndex = findLastCanIndexBefore(videoAbsTimeMs, appState.canData);
    if (canIndex !== -1) {
      const canMsg = appState.canData[canIndex];
      const y = p.map(
        canMsg.speed,
        minSpeed,
        maxSpeed,
        p.height - pad.bottom,
        pad.top
      );
      p.fill(255, 0, 0);
      p.noStroke(); // No stroke for the ellipse.
      p.ellipse(x, y, 8, 8);
    }
  }
  /**
   * Handles window resizing. Resizes the canvas and recreates/redraws the static buffer.
   */
  p.windowResized = function () {
    p.resizeCanvas(
      speedGraphContainer.offsetWidth,
      speedGraphContainer.offsetHeight
    );
    // Instead of resizing the buffer, we re-create it
    staticBuffer = p.createGraphics(p.width, p.height);
    // And we must re-draw the static content to the new buffer
    if ((appState.canData.length > 0 || appState.vizData) && videoDuration) {
      p.drawStaticGraphToBuffer(appState.canData, appState.vizData);
    }
    p.redraw();
  };
};
