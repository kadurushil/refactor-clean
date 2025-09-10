import {
  RADAR_X_MAX,
  RADAR_X_MIN,
  RADAR_Y_MAX,
  RADAR_Y_MIN,
  MAX_TRAJECTORY_LENGTH,
} from "./constants.js";
import { appState } from "./state.js";
import {
  toggleSnrColor,
  toggleClusterColor,
  toggleInlierColor,
  toggleFrameNorm,
  toggleVelocity,
  toggleStationaryColor,
  toggleConfirmedOnly,
} from "./dom.js";

// Defines a set of SNR (Signal-to-Noise Ratio) colors.
export const snrColors = (p) => ({
  c1: p.color(0, 0, 255), // Blue
  c2: p.color(0, 255, 255), // Cyan
  c3: p.color(0, 255, 0), // Green
  c4: p.color(186, 142, 35), // Dark Yellow
  c5: p.color(255, 0, 0), // Red
});

// In src/drawUtils.js, add this near the other color constants

export const ttcColors = (p) => ({
  critical: p.color(255, 0, 0), // Red for TTC <= 5s
  high: p.color(255, 165, 0), // Orange for 5s < TTC <= 10s
  medium: p.color(255, 255, 0), // Yellow for 10s < TTC <= 30s
  low: p.color(0, 255, 0), // Green for TTC > 30s
  away: p.color(0, 191, 255), // Deep Sky Blue for moving away
  default: p.color(128, 128, 128), // Gray for unknown/default
});

// Defines a palette of colors for different clusters.
export const clusterColors = (p) => [
  p.color(230, 25, 75), // Red
  p.color(60, 180, 75), // Green
  p.color(0, 130, 200), // Blue
  p.color(245, 130, 48), // Orange
  p.color(145, 30, 180), // Purple
  p.color(70, 240, 240), // Cyan
  p.color(240, 50, 230), // Magenta
  p.color(210, 245, 60), // Lime Green
  p.color(128, 0, 0), // Maroon
  p.color(0, 128, 128), // Teal
];

// Defines colors for stationary and moving objects.
export const stationaryColor = (p) => p.color(218, 165, 32); // Goldenrod
export const movingColor = (p) => p.color(255, 0, 255); // Magenta

/**
 * Draws the static radar region lines to a buffer.
 * @param {p5.Graphics} b - The p5.Graphics buffer to draw on.
 * @param {object} plotScales - The calculated scales for plotting.
 */
export function drawStaticRegionsToBuffer(p, b, plotScales) {
  b.clear();
  b.push();
  // Translate to the bottom center of the buffer.
  b.translate(b.width / 2, b.height * 0.95);
  // Flip the Y-axis to match radar coordinates (Y increases upwards).
  b.scale(1, -1);
  // Set stroke properties for the static region lines.
  b.stroke(100, 100, 100, 150);
  b.strokeWeight(1);
  // Set dashed line pattern.
  b.drawingContext.setLineDash([8, 8]);
  // Define angles for the radar beams.
  const a1 = p.radians(30),
    a2 = p.radians(150);
  const len = 70;
  // Draw the first static region line.
  b.line(
    0,
    0,
    len * p.cos(a1) * plotScales.plotScaleX,
    len * p.sin(a1) * plotScales.plotScaleY
  );
  // Draw the second static region line.
  b.line(
    0,
    0,
    len * p.cos(a2) * plotScales.plotScaleX,
    len * p.sin(a2) * plotScales.plotScaleY
  );
  // Reset line dash pattern.
  b.drawingContext.setLineDash([]);
  b.pop();
}

/**
 * Draws the grid and axes for the radar plot.
 * @param {p5} p - The p5 instance.
 * @param {object} plotScales - The calculated scales for plotting.
 */
export function drawAxes(p, plotScales) {
  p.push();
  // Determine axis and text colors based on the current theme (dark/light mode).
  const axisColor = document.documentElement.classList.contains("dark")
    ? p.color(100)
    : p.color(220);
  const mainAxisColor = document.documentElement.classList.contains("dark")
    ? p.color(150)
    : p.color(180);
  const textColor = document.documentElement.classList.contains("dark")
    ? p.color(200)
    : p.color(150);
  // Draw horizontal grid lines.
  p.stroke(axisColor);
  p.strokeWeight(1);
  for (let y = 5; y <= RADAR_Y_MAX; y += 5)
    p.line(
      RADAR_X_MIN * plotScales.plotScaleX,
      y * plotScales.plotScaleY,
      RADAR_X_MAX * plotScales.plotScaleX,
      y * plotScales.plotScaleY
    );
  // Draw vertical grid lines.
  const xGridStep = 5;
  for (
    let x = Math.ceil(RADAR_X_MIN / xGridStep) * xGridStep;
    x <= RADAR_X_MAX;
    x += xGridStep
  ) {
    if (x === 0) continue;
    p.line(
      x * plotScales.plotScaleX,
      RADAR_Y_MIN * plotScales.plotScaleY,
      x * plotScales.plotScaleX,
      RADAR_Y_MAX * plotScales.plotScaleY
    );
  }
  p.stroke(mainAxisColor);
  p.line(
    RADAR_X_MIN * plotScales.plotScaleX,
    0,
    RADAR_X_MAX * plotScales.plotScaleX,
    0
  );
  p.line(
    0,
    RADAR_Y_MIN * plotScales.plotScaleY,
    0,
    RADAR_Y_MAX * plotScales.plotScaleY
  );
  // Draw Y-axis labels.
  p.fill(textColor);
  p.noStroke();
  p.textSize(10);
  for (let y = 5; y <= RADAR_Y_MAX; y += 5) {
    p.push();
    p.translate(5, y * plotScales.plotScaleY);
    // Flip text vertically to align with flipped Y-axis.
    p.scale(1, -1);
    p.text(y, 0, 4);
    p.pop();
  }
  // Draw X-axis labels.
  for (
    let x = Math.ceil(RADAR_X_MIN / xGridStep) * xGridStep;
    x <= RADAR_X_MAX;
    x += xGridStep
  ) {
    if (x === 0) continue;
    p.push();
    p.translate(x * plotScales.plotScaleX, -10);
    p.scale(1, -1);
    p.textAlign(p.CENTER);
    p.text(x, 0, 0);
    p.pop();
  }
  p.pop();
}

/**
 * Draws the point cloud on the radar canvas.
 * @param {p5} p - The p5 instance.
 * @param {Array} points - The array of point cloud data.
 * @param {object} plotScales - The calculated scales for plotting.
 */
export function drawPointCloud(p, points, plotScales) {
  // Set stroke weight for points.
  p.strokeWeight(4);
  // Get state of various toggles from the DOM.
  const useSnr = toggleSnrColor.checked;
  const useCluster = toggleClusterColor.checked;
  const useInlier = toggleInlierColor.checked;
  const useFrameNorm = toggleFrameNorm.checked;
  let minSnr = appState.globalMinSnr, // Initialize with global SNR range.
    maxSnr = appState.globalMaxSnr;

  if (useSnr && useFrameNorm && points.length > 0) {
    const snrVals = points.map((p) => p.snr).filter((snr) => snr !== null);
    if (snrVals.length > 1) {
      minSnr = Math.min(...snrVals);
      maxSnr = Math.max(...snrVals);
    } else if (snrVals.length === 1) {
      minSnr = snrVals[0] - 1;
      maxSnr = snrVals[0] + 1;
    }
  }
  // Draw SNR legend if enabled and p5 instance is ready.
  if (useSnr && p.drawSnrLegendToBuffer)
    p.drawSnrLegendToBuffer(minSnr, maxSnr);

  // Get local color instances for cluster and SNR.
  const localClusterColors = clusterColors(p);
  const localSnrColors = snrColors(p);

  // Iterate through each point in the point cloud.
  for (const pt of points) {
    if (pt && pt.x !== null && pt.y !== null) {
      // Apply cluster coloring if enabled.
      if (useCluster && pt.clusterNumber !== null) {
        p.stroke(
          pt.clusterNumber > 0
            ? localClusterColors[
                (pt.clusterNumber - 1) % localClusterColors.length
              ]
            : 128
          // Default to gray if cluster number is 0 or invalid.
        );
      } else if (useInlier) {
        p.stroke(
          pt.isOutlier === false
            ? p.color(0, 255, 0)
            : pt.isOutlier === true
            ? p.color(255, 0, 0)
            : 128
          // Default to gray if inlier status is unknown.
        );
      } else if (useSnr && pt.snr !== null) {
        const amt = p.map(pt.snr, minSnr, maxSnr, 0, 1, true);
        let c;
        if (amt < 0.25)
          c = p.lerpColor(localSnrColors.c1, localSnrColors.c2, amt / 0.25);
        else if (amt < 0.5)
          c = p.lerpColor(
            localSnrColors.c2,
            localSnrColors.c3,
            (amt - 0.25) / 0.25
          );
        else if (amt < 0.75)
          c = p.lerpColor(
            localSnrColors.c3,
            localSnrColors.c4,
            (amt - 0.5) / 0.25
          );
        else
          c = p.lerpColor(
            localSnrColors.c4,
            localSnrColors.c5,
            (amt - 0.75) / 0.25
            // Interpolate color based on SNR value.
          );
        p.stroke(c);
        // Default point color if no specific coloring is applied.
      } else {
        p.stroke(0, 150, 255);
      }
      p.point(pt.x * plotScales.plotScaleX, pt.y * plotScales.plotScaleY);
    }
  }
}

/**
 * Draws the historical trajectories of tracked objects.
 * @param {p5} p - The p5 instance.
 * @param {object} plotScales - The calculated scales for plotting.
 */
export function drawTrajectories(p, plotScales) {
  const localTtcColors = ttcColors(p);

  for (const track of appState.vizData.tracks) {
    if (toggleConfirmedOnly.checked && track.isConfirmed === false) {
      continue;
    }
    if (!track || !track.historyLog || !Array.isArray(track.historyLog)) {
      const trackId = track ? track.id : "Unknown ID";
      console.warn(
        `Skipping malformed track in frame ${appState.currentFrame}. Track ID: ${trackId}`,
        track // We also log the entire track object for detailed inspection.
      ); // Safeguard for malformed data
      continue;
    }

    const logs = track.historyLog.filter(
      (log) => log.frameIdx <= appState.currentFrame + 1
    );
    if (logs.length < 2) continue;

    const lastLog = logs[logs.length - 1];
    if (appState.currentFrame + 1 - lastLog.frameIdx > MAX_TRAJECTORY_LENGTH)
      continue;

    const isCurrentlyStationary = lastLog.isStationary;

    // ... (trajectory point calculation logic remains the same)
    let maxLen = isCurrentlyStationary
      ? Math.floor(MAX_TRAJECTORY_LENGTH / 4)
      : MAX_TRAJECTORY_LENGTH;
    let trajPts = logs
      .filter(
        (log) => log.correctedPosition && log.correctedPosition[0] !== null
      )
      .map((log) => log.correctedPosition);
    if (trajPts.length > maxLen) {
      trajPts = trajPts.slice(trajPts.length - maxLen);
    }

    p.push();
    p.noFill();

    if (isCurrentlyStationary) {
      // Stationary tracks are always green and dashed
      p.stroke(34, 139, 34, 220);
      p.strokeWeight(1);
      p.drawingContext.setLineDash([3, 3]);
      for (let i = 1; i < trajPts.length; i++) {
        // ... (draw fading stationary trajectory logic)
      }
    } else {
      // --- START: New Dynamic Coloring Logic ---
      let trajectoryColor;

      if (appState.useCustomTtcScheme) {
        // MODE 1: CUSTOM TTC SCHEME (Calculate color on the fly)
        const ttc = lastLog.ttc;
        const scheme = appState.customTtcScheme;
        if (ttc === null || isNaN(ttc) || ttc < 0) {
          trajectoryColor = p.color(localTtcColors.default); // Gray for unknown
        } else if (ttc <= scheme.critical.time) {
          trajectoryColor = p.color(scheme.critical.color);
        } else if (ttc <= scheme.high.time) {
          trajectoryColor = p.color(scheme.high.color);
        } else if (ttc <= scheme.medium.time) {
          trajectoryColor = p.color(scheme.medium.color);
        } else {
          trajectoryColor = p.color(scheme.low.color); // Use custom color for low risk
        }
      } else {
        // MODE 2: DEFAULT TTC SCHEME (Use pre-calculated category from JSON)
        
        // FIND the TTC category from the new timeline
        const ttcEntry = track.ttcCategoryTimeline.find((entry) => entry.frameIdx === lastLog.frameIdx);
        const ttcCategory = ttcEntry ? ttcEntry.ttcCategory : null; // Get the category if found

        switch (ttcCategory) {
          case 3:
            trajectoryColor = p.color(localTtcColors.critical);
            break;
          case 2:
            trajectoryColor = p.color(localTtcColors.high);
            break;
          case 1:
            trajectoryColor = p.color(localTtcColors.medium);
            break;
          case 0:
            trajectoryColor = p.color(localTtcColors.low);
            break;
          case -1:
            trajectoryColor = p.color(localTtcColors.away);
            break;
          default:
            trajectoryColor = p.color(localTtcColors.default);
            break;
        }
      }

      p.strokeWeight(1.5);
      p.drawingContext.setLineDash([]);

      // Fading trajectory logic (works for both modes)
      for (let i = 1; i < trajPts.length; i++) {
        const alpha = p.map(i, 0, trajPts.length, 50, 255);
        trajectoryColor.setAlpha(alpha);
        p.stroke(trajectoryColor);

        const prevPt = trajPts[i - 1];
        const currPt = trajPts[i];
        p.line(
          prevPt[0] * plotScales.plotScaleX,
          prevPt[1] * plotScales.plotScaleY,
          currPt[0] * plotScales.plotScaleX,
          currPt[1] * plotScales.plotScaleY
        );
      }
      // --- END: New Dynamic Coloring Logic ---
    }

    p.drawingContext.setLineDash([]);
    p.pop();
  }
}

/**
 * Draws markers for the current position of tracked objects.
 * @param {p5} p - The p5 instance.
 * @param {object} plotScales - The calculated scales for plotting.
 */
// In src/drawUtils.js

export function drawTrackMarkers(p, plotScales) {
  const showDetails = toggleVelocity.checked;
  const useStationary = toggleStationaryColor.checked;
  const textColor = document.documentElement.classList.contains("dark")
    ? p.color(255)
    : p.color(0);
  const localStationaryColor = stationaryColor(p);
  const localMovingColor = movingColor(p);

  for (const track of appState.vizData.tracks) {
    // --- START: Add the Same Safeguard Here ---
    // This robust check ensures the track and its historyLog are valid before use.
    if (toggleConfirmedOnly.checked && track.isConfirmed === false) {
      continue;
    }
    if (!track || !track.historyLog || !Array.isArray(track.historyLog)) {
      // We don't need to log a warning here again, as drawTrajectories already did.
      // We can just safely skip this malformed track.
      continue;
    }
    // --- END: Add the Same Safeguard Here ---

    const log = track.historyLog.find(
      (log) => log.frameIdx === appState.currentFrame + 1
    );

    if (log) {
      const pos = log.correctedPosition;
      if (pos && pos.length === 2 && pos[0] !== null && pos[1] !== null) {
        const size = 5;
        const x = pos[0] * plotScales.plotScaleX;
        const y = pos[1] * plotScales.plotScaleY;
        let velocityColor = p.color(255, 0, 255, 200);

        p.push();
        p.strokeWeight(2);
        if (useStationary && log.isStationary === true) {
          p.stroke(localStationaryColor);
          p.noFill();
          p.rectMode(p.CENTER);
          p.square(x, y, size * 1.5);
          velocityColor = localStationaryColor;
        } else {
          let markerColor = p.color(0, 0, 255);
          if (useStationary && log.isStationary === false) {
            markerColor = localMovingColor;
            velocityColor = localMovingColor;
          }
          p.stroke(markerColor);
          p.line(x - size, y, x + size, y);
          p.line(x, y - size, x, y + size);
        }
        p.pop();

        if (
          showDetails &&
          log.predictedVelocity &&
          log.predictedVelocity[0] !== null
        ) {
          const [vx, vy] = log.predictedVelocity;
          if (log.isStationary === false) {
            p.push();
            p.stroke(velocityColor);
            p.strokeWeight(2);
            p.line(
              x,
              y,
              (pos[0] + vx) * plotScales.plotScaleX,
              (pos[1] + vy) * plotScales.plotScaleY
            );
            p.pop();
          }
          const speed = (p.sqrt(vx * vx + vy * vy) * 3.6).toFixed(1);
          const ttc =
            log.ttc !== null && isFinite(log.ttc) && log.ttc < 100
              ? `TTC: ${log.ttc.toFixed(1)}s`
              : "";
          const text = `ID: ${track.id} | ${speed} km/h\n${ttc}`;
          p.push();
          p.fill(textColor);
          p.noStroke();
          p.scale(1, -1);
          p.textSize(12);
          p.text(text, x + 10, -y);
          p.pop();
        }
      }
    }
  }
}

/**
 * Handles the display of detailed info for points under the mouse cursor.
 * @param {p5} p - The p5 instance.
 * @param {object} plotScales - The calculated scales for plotting.
 */
export function handleCloseUpDisplay(p, plotScales) {
  // Get current frame data.
  const frameData = appState.vizData.radarFrames[appState.currentFrame];
  if (!frameData || !frameData.pointCloud) return;

  const hoveredPoints = [];
  const radius = 10;

  // Iterate through point cloud to find hovered points.
  for (const pt of frameData.pointCloud) {
    if (pt.x === null || pt.y === null) continue;
    // Convert radar coordinates to screen coordinates.
    const screenX = pt.x * plotScales.plotScaleX + p.width / 2;
    const screenY = p.height * 0.95 - pt.y * plotScales.plotScaleY; // Y-axis is inverted for drawing.
    const d = p.dist(p.mouseX, p.mouseY, screenX, screenY);
    if (d < radius) {
      hoveredPoints.push({
        point: pt,
        screenX: screenX,
        screenY: screenY,
      });
    }
  }

  // If points are hovered, display detailed info.
  if (hoveredPoints.length > 0) {
    // Sort points by Y-coordinate for consistent display.
    hoveredPoints.sort((a, b) => a.screenY - b.screenY);

    p.push();
    p.textSize(12);
    const lineHeight = 15; // Line height for text in the info box.
    const boxPadding = 8;
    let boxWidth = 0;
    const infoStrings = [];

    for (const hovered of hoveredPoints) {
      const pt = hovered.point;
      const vel = pt.velocity !== null ? pt.velocity.toFixed(2) : "N/A";
      const snr = pt.snr !== null ? pt.snr.toFixed(1) : "N/A";
      const infoText = `X:${pt.x.toFixed(2)}, Y:${pt.y.toFixed(
        2
      )} | V:${vel}, SNR:${snr}`;
      infoStrings.push(infoText);
      boxWidth = Math.max(boxWidth, p.textWidth(infoText));
    } // Calculate box dimensions.
    const boxHeight = infoStrings.length * lineHeight + boxPadding * 2;
    boxWidth += boxPadding * 2;

    // Position the info box relative to the mouse.
    const xOffset = 20;
    let boxX = p.mouseX + xOffset;
    let boxY = p.mouseY - boxHeight / 2;

    // Adjust box position to stay within canvas bounds.
    if (boxX + boxWidth > p.width) {
      boxX = p.mouseX - boxWidth - xOffset;
    }
    boxY = p.constrain(boxY, 0, p.height - boxHeight);

    // Highlight hovered points and draw connecting lines to the info box.
    const highlightColor = p.color(46, 204, 113);

    for (let i = 0; i < hoveredPoints.length; i++) {
      const hovered = hoveredPoints[i];
      p.noFill();
      p.stroke(highlightColor);
      p.strokeWeight(2);
      p.ellipse(hovered.screenX, hovered.screenY, 15, 15);
      p.strokeWeight(1);
      p.line(
        boxX + boxPadding,
        boxY + boxPadding + i * lineHeight + lineHeight / 2,
        hovered.screenX,
        hovered.screenY
      );
    }

    // Draw the info box background and border.
    const bgColor = document.documentElement.classList.contains("dark")
      ? p.color(20, 20, 30, 255)
      : p.color(245, 245, 245, 255);
    p.fill(bgColor);
    p.stroke(highlightColor);
    p.strokeWeight(1);
    p.rect(boxX, boxY, boxWidth, boxHeight, 4);
    // Draw the text content inside the info box.
    const textColor = document.documentElement.classList.contains("dark")
      ? p.color(230)
      : p.color(20);
    p.fill(textColor);
    p.noStroke();
    p.textAlign(p.LEFT, p.TOP);
    for (let i = 0; i < infoStrings.length; i++) {
      p.text(
        infoStrings[i],
        boxX + boxPadding,
        boxY + boxPadding + i * lineHeight
      );
    }

    p.pop();
  }
}

export function drawCovarianceEllipse(
  p,
  position,
  radii,
  angle,
  plotScales,
  isStationary
) {
  // Only draw the ellipse for tracks that are not stationary.
  if (isStationary) return;
  const [radiusA, radiusB] = radii;
  const angledegrees = 90 + angle;
  p.push();
  p.noFill();
  p.stroke(255, 0, 0, 150);
  p.strokeWeight(1);
  p.translate(
    position[0] * plotScales.plotScaleX,
    position[1] * plotScales.plotScaleY
  );
  p.rotate(p.radians(angledegrees));
  p.ellipse(
    0,
    0,
    radiusA * 2 * plotScales.plotScaleX, // multiplied by 2 because ellipse function
    radiusB * 2 * plotScales.plotScaleY //  in p5 library expect
  );
  p.pop();

  //---old ellipse logic using covariance from data directly//
  // const pPos = [
  //   [covarianceP[0][0], covarianceP[0][1]],
  //   [covarianceP[1][0], covarianceP[1][1]],
  // ];

  // const a = pPos[0][0];
  // const b = pPos[0][1];
  // const d = pPos[1][1];
  // const trace = a + d;
  // const determinant = a * d - b * b;

  //const lambda1 = trace / 2 + Math.sqrt(Math.pow(trace, 2) / 4 - determinant);
  //const lambda2 = trace / 2 - Math.sqrt(Math.pow(trace, 2) / 4 - determinant);
  // --- START: New robust calculation with logging ---
  // let sqrtTermVal = Math.pow(trace, 2) / 4 - determinant;

  // Check for a negative value, which causes NaN errors
  // if (sqrtTermVal < 0) {
  //   // Log a warning so we know it happened, as you suggested
  //   console.warn(
  //     `Clamping negative sqrtTermVal in frame ${appState.currentFrame} to prevent NaN. Original value: ${sqrtTermVal}`
  //   );
  //   // Clamp the value to 0. This allows drawing to continue instead of breaking.
  //   sqrtTermVal = 0;
  // }

  // const sqrtTerm = Math.sqrt(sqrtTermVal);
  // const lambda1 = trace / 2 + sqrtTerm;
  // const lambda2 = trace / 2 - sqrtTerm;
  // // --- END: New robust calculation with logging ---
  // const chi2 = 5.991;
  // const majorAxis = Math.sqrt(chi2 * lambda1);
  // const minorAxis = Math.sqrt(chi2 * lambda2);

  // let eigenvector = [1, 0];
  // if (b !== 0) {
  //   eigenvector = [lambda1 - d, b];
  // }
  // const angle = Math.atan2(eigenvector[1], eigenvector[0]);
  //---old ellipse logic using covariance from data directly//
}

// In src/drawUtils.js

/**
 * Draws a simple representation of the ego vehicle at the origin (0,0).
 * @param {p5.Graphics} b - The p5.Graphics buffer to draw on.
 */
export function drawEgoVehicle(p, plotScales) {
  const isDark = document.documentElement.classList.contains("dark");
  const carColor = isDark ? p.color(150, 150, 220) : p.color(151, 151, 220);

  p.push();
  p.fill(carColor);
  p.noStroke();
  p.rectMode(p.CENTER);

  const carWidthMeters = 1.5;
  const carLengthMeters = 3.5;

  const carWidthPixels = carWidthMeters * plotScales.plotScaleX;
  const carLengthPixels = carLengthMeters * plotScales.plotScaleY;

  p.rect(0, -10, carWidthPixels, carLengthPixels, 5);
  p.pop();
}
