import { appState } from "../state.js";
import {
  drawAxes,
  drawPointCloud,
  drawTrajectories,
  drawEgoVehicle,
  drawTrackMarkers,
  drawClusterCentroids,
  drawRegionsOfInterest,
  drawCovarianceEllipse,
  clusterColors, // We need to import clusterColors for the tooltip
} from "../drawUtils.js";
import {
  toggleTracks,
  toggleClusterColor,
  togglePredictedPos,
  toggleCovariance,
} from "../dom.js";

/**
 * A dedicated tooltip function for the zoom sketch.
 * It draws the tooltip relative to the hovered items and compensates for the zoom factor.
 */
/**
 * A dedicated tooltip function for the zoom sketch with full features.
 * It draws the tooltip in the least cluttered quadrant, has dynamic connectors,
 * highlights items, and compensates for the zoom factor.
 */
/**
 * A dedicated tooltip function for the zoom sketch with smart quadrant positioning.
 */
/**
 * A dedicated tooltip function for the zoom sketch that "pushes" the tooltip
 * 100 pixels away from the hovered items towards the least cluttered corner.
 */
// function drawZoomTooltip(p, hoveredItems) {
//     if (!hoveredItems || hoveredItems.length === 0) return;

//     // 1. Generate text content (this is unchanged)
//     const infoStrings = [];
//     for (const item of hoveredItems) {
//         let infoText = '';
//         const data = item.data;
//         switch (item.type) {
//             case 'point': infoText = `Point | X:${data.x.toFixed(2)}, Y:${data.y.toFixed(2)} | V:${data.velocity?.toFixed(2)}, SNR:${data.snr?.toFixed(1)}`; break;
//             case 'cluster': infoText = `Cluster ${data.id} | X:${data.x.toFixed(2)}, Y:${data.y.toFixed(2)} | rSpeed:${data.radialSpeed?.toFixed(2)}`; break;
//             case 'track': infoText = `Track ${item.trackId} | X:${data.correctedPosition[0].toFixed(2)}, Y:${data.correctedPosition[1].toFixed(2)}`; break;
//             case 'prediction': infoText = `Pred. for ${item.trackId} | X:${data.predictedPosition[0].toFixed(2)}, Y:${data.predictedPosition[1].toFixed(2)}`; break;
//         }
//         if (infoText) infoStrings.push({ text: infoText, color: item.color || null });
//     }

//     // 2. Find the average screen position of hovered items. This is our anchor point.
//     const avgX = hoveredItems.reduce((acc, item) => acc + item.screenX, 0) / hoveredItems.length;
//     const avgY = hoveredItems.reduce((acc, item) => acc + item.screenY, 0) / hoveredItems.length;

//     p.push();

//     // 3. Compensate for zoom factor for all drawing operations (unchanged)
//     const zoomFactor = appState.zoomFactor || 6.0;
//     p.textSize(12 / zoomFactor);
//     p.strokeWeight(1 / zoomFactor);

//     const lineHeight = 15 / zoomFactor;
//     const boxPadding = 8 / zoomFactor;

//     let boxWidth = 0;
//     infoStrings.forEach(info => {
//         boxWidth = Math.max(boxWidth, p.textWidth(info.text));
//     });
//     const boxHeight = (infoStrings.length * lineHeight) + (boxPadding * 2);
//     boxWidth += (boxPadding * 2);

//     // --- START: New "Push" Positioning Logic ---

//     // Line 1: Define the push distance. We scale it by the zoomFactor so it's a consistent
//     //         visual distance on the screen, regardless of zoom level.
//     const pushDistance = 100 / zoomFactor;

//     // Line 2: Determine the horizontal direction. If the items are on the right, our direction is left (-1).
//     //         If they are on the left, our direction is right (1).
//     const dirX = (avgX > appState.p5_instance.width / 2) ? -1 : 1;

//     // Line 3: Determine the vertical direction. If the items are on the bottom, our direction is up (-1).
//     //         If they are on the top, our direction is down (1).
//     const dirY = (avgY > appState.p5_instance.height / 2) ? -1 : 1;

//     // Line 4: Create a p5.Vector object. This is like an arrow representing our direction (e.g., up and to the right).
//     const pushVector = p.createVector(dirX, dirY);

//     // Line 5: Normalize the vector. This makes its length exactly 1, so it only represents a pure direction.
//     pushVector.normalize();

//     // Line 6: Scale the vector. Now it's an arrow that is exactly `pushDistance` pixels long.
//     pushVector.mult(pushDistance);

//     // Line 7: Calculate the tooltip's corner position by adding our push vector to the anchor point.
//     let boxX = avgX + pushVector.x;
//     let boxY = avgY + pushVector.y;

//     // Line 8: Define where the connector line should attach to the box.
//     //         If we pushed right, the connector attaches to the left side of the box.
//     let connectorAnchorX = (dirX > 0) ? boxX : boxX + boxWidth;

//     // Line 9: If we pushed down, the connector attaches to the top side of the box.
//     let connectorAnchorY = (dirY > 0) ? boxY : boxY + boxHeight;

//     // Line 10: Adjust the box's final position to account for its own size, so the *corner*
//     //          of the box is at our calculated position, not its top-left.
//     if (dirX < 0) boxX -= boxWidth;   // If we pushed left, shift the box left by its own width.
//     if (dirY < 0) boxY -= boxHeight;  // If we pushed up, shift the box up by its own height.

//     // --- END: New "Push" Positioning Logic ---

//     // 4. Draw highlights, box, text, and connectors (this logic is now restored and complete)
//     const highlightColor = p.color(46, 204, 113);
//     hoveredItems.forEach(item => {
//         p.noFill(); p.stroke(highlightColor); p.strokeWeight(2 / zoomFactor);
//         p.ellipse(item.screenX, item.screenY, 15 / zoomFactor, 15 / zoomFactor);
//     });

//     const bgColor = document.documentElement.classList.contains('dark') ? p.color(20, 20, 30, 220) : p.color(245, 245, 245, 220);
//     p.fill(bgColor); p.stroke(highlightColor); p.strokeWeight(1 / zoomFactor);
//     p.rect(boxX, boxY, boxWidth, boxHeight, 4 / zoomFactor);

//     const defaultTextColor = document.documentElement.classList.contains('dark') ? p.color(230) : p.color(20);
//     p.noStroke(); p.textAlign(p.LEFT, p.TOP);
//     infoStrings.forEach((info, i) => {
//         p.fill(info.color || defaultTextColor);
//         p.text(info.text, boxX + boxPadding, boxY + boxPadding + (i * lineHeight));
//     });

//     hoveredItems.forEach((item, i) => {
//         p.stroke(highlightColor); p.strokeWeight(1 / zoomFactor);
//         p.line(connectorAnchorX, connectorAnchorY, item.screenX, item.screenY);
//     });

//     p.pop();
// }
/**
 * A dedicated tooltip function for the zoom sketch with smart quadrant positioning,
 * individual dynamic connectors, and item highlighting.
 */
/**
 * A dedicated tooltip function for the zoom sketch with full features and customizations.
 */
function drawZoomTooltip(p, hoveredItems, mainMouseX) {
  if (!hoveredItems || hoveredItems.length === 0) return;

  // 1. Generate text content
  const infoStrings = [];
  for (const item of hoveredItems) {
    let infoText = "";
    const data = item.data;
    switch (item.type) {
      case "point":
        infoText = `Point | X:${data.x.toFixed(2)}, Y:${data.y.toFixed(
          2
        )} | V:${data.velocity?.toFixed(2)}, SNR:${data.snr?.toFixed(1)}`;
        break;
      case "cluster":
        infoText = `Cluster ${data.id} | X:${data.x.toFixed(
          2
        )}, Y:${data.y.toFixed(2)} | rSpeed:${data.radialSpeed?.toFixed(2)}`;
        break;
      case "track":
        infoText = `Track ${
          item.trackId
        } | X:${data.correctedPosition[0].toFixed(
          2
        )}, Y:${data.correctedPosition[1].toFixed(2)}`;
        break;
      case "prediction":
        infoText = `Pred. for ${
          item.trackId
        } | X:${data.predictedPosition[0].toFixed(
          2
        )}, Y:${data.predictedPosition[1].toFixed(2)}`;
        break;
    }
    if (infoText)
      infoStrings.push({ text: infoText, color: item.color || null });
  }

  // 2. Find the average screen position of hovered items
  const avgX =
    hoveredItems.reduce((acc, item) => acc + item.screenX, 0) /
    hoveredItems.length;
  const avgY =
    hoveredItems.reduce((acc, item) => acc + item.screenY, 0) /
    hoveredItems.length;

  p.push();

  // --- Start of Tweakable Parameters ---
  const zoomFactor = appState.zoomFactor || 6;

  // VISUALS: Adjust these numbers to change the tooltip's appearance
  const BASE_FONT_SIZE = 12;
  const BASE_LINE_HEIGHT = 15;
  const BASE_PADDING = 8;
  const BASE_HIGHLIGHT_THICKNESS = 2;
  const BASE_LINE_THICKNESS = 2;
  const BASE_DISTANCE_OFFSET = 65; // <-- How far the tooltip is from the items

  // COLORS
  const highlightColor = p.color(46, 204, 113); // Green for border and lines
  const bgColor = document.documentElement.classList.contains("dark")
    ? p.color(20, 20, 30, 220)
    : p.color(245, 245, 245, 220);
  const defaultTextColor = document.documentElement.classList.contains("dark")
    ? p.color(230)
    : p.color(20);
  // --- End of Tweakable Parameters ---

  // Compensate for zoom factor
  p.textSize(BASE_FONT_SIZE / zoomFactor);
  const lineHeight = BASE_LINE_HEIGHT / zoomFactor;
  const boxPadding = BASE_PADDING / zoomFactor;
  const xOffset = BASE_DISTANCE_OFFSET / zoomFactor;

  let boxWidth = 0;
  infoStrings.forEach((info) => {
    boxWidth = Math.max(boxWidth, p.textWidth(info.text));
  });
  const boxHeight = infoStrings.length * lineHeight + boxPadding * 2;
  boxWidth += boxPadding * 2;

  // Smart Positioning Logic
  let boxX, connectorAnchorX;
  if (mainMouseX > appState.p5_instance.width / 2) {
    boxX = avgX - xOffset - boxWidth;
    connectorAnchorX = boxX + boxWidth;
  } else {
    boxX = avgX + xOffset;
    connectorAnchorX = boxX;
  }
  const boxY = avgY - boxHeight / 2;

  // Draw highlighting circles
  hoveredItems.forEach((item) => {
    p.noFill();
    p.stroke(highlightColor);
    p.strokeWeight(BASE_HIGHLIGHT_THICKNESS / zoomFactor);
    p.ellipse(item.screenX, item.screenY, 15 / zoomFactor, 15 / zoomFactor);
  });

  // Draw the tooltip box
  p.fill(bgColor);
  p.stroke(highlightColor);
  p.strokeWeight(BASE_LINE_THICKNESS / zoomFactor);
  p.rect(boxX, boxY, boxWidth, boxHeight, 4 / zoomFactor);

  // Draw the text (with italics for prediction)
  p.noStroke();
  p.textAlign(p.LEFT, p.TOP);
  infoStrings.forEach((info, i) => {
    p.fill(info.color || defaultTextColor);
    if (hoveredItems[i].type === "prediction") {
      p.textStyle(p.ITALIC);
    }
    p.text(info.text, boxX + boxPadding, boxY + boxPadding + i * lineHeight);
    p.textStyle(p.NORMAL); // Reset to normal for the next line
  });

  // Draw individual connector lines
  hoveredItems.forEach((item, i) => {
    p.stroke(highlightColor);
    p.strokeWeight(BASE_LINE_THICKNESS / zoomFactor);
    const connectorAnchorY =
      boxY + boxPadding + i * lineHeight + lineHeight / 2;
    p.line(connectorAnchorX, connectorAnchorY, item.screenX, item.screenY);
  });

  p.pop();
}

export const zoomSketch = function (p) {
  let plotScales = { plotScaleX: 1, plotScaleY: 1 };
  let lastUpdate = { mainMouseX: 0, mainMouseY: 0, hoveredItems: [] };
  let canvas = null;
  const containerId = "zoom-canvas-container";

  appState.zoomFactor = 4; // Set a default zoom factor in the global state

  p.setup = function () {
    p.noLoop();
  };

  p.updateAndDraw = function (mainMouseX, mainMouseY, hoveredItems, scales) {
    lastUpdate = { mainMouseX, mainMouseY, hoveredItems };
    plotScales = scales;
    if (!canvas) {
      const container = document.getElementById(containerId);
      if (container && container.offsetWidth > 0) {
        canvas = p.createCanvas(container.offsetWidth, container.offsetHeight);
        canvas.parent(containerId);
      } else {
        return;
      }
    }
    p.redraw();
  };

  p.draw = function () {
    if (!appState.vizData || !canvas) return;

    p.background(
      document.documentElement.classList.contains("dark")
        ? p.color(55, 65, 81)
        : 255
    );

    const { mainMouseX, mainMouseY, hoveredItems } = lastUpdate;

    p.push(); // Start zoom transformations
    p.translate(
      p.width / 2 - mainMouseX * appState.zoomFactor,
      p.height / 2 - mainMouseY * appState.zoomFactor
    );
    p.scale(appState.zoomFactor);

    // --- Redraw the scene from scratch ---
    if (appState.p5_instance && appState.p5_instance.getStaticBackground) {
      p.image(
        appState.p5_instance.getStaticBackground(),
        0,
        0,
        appState.p5_instance.width,
        appState.p5_instance.height
      );
    }

    p.push(); // Start radar transformations
    p.translate(
      appState.p5_instance.width / 2,
      appState.p5_instance.height * 0.95
    );
    p.scale(1, -1);

    const frameData = appState.vizData.radarFrames[appState.currentFrame];
    drawAxes(p, plotScales);
    drawEgoVehicle(p, plotScales);
    if (frameData) {
      drawTrackMarkers(p, plotScales);
      drawRegionsOfInterest(p, frameData, plotScales);
      if (toggleTracks.checked) {
        drawTrajectories(p, plotScales);
      }
      drawPointCloud(p, frameData.pointCloud, plotScales);
      if (toggleClusterColor.checked) {
        drawClusterCentroids(p, frameData.clusters, plotScales);
      }
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
    }
    p.pop(); // End radar transformations

    // --- Call the new, self-contained tooltip function ---
    drawZoomTooltip(p, hoveredItems, mainMouseX);

    p.pop(); // End zoom transformations
    // --- START: DRAW TITLE OVERLAY ---
    // This code runs *after* the zoom transformations have been popped,
    // so it draws directly onto the canvas as a fixed UI element.
    p.push();
    const titleLabel = document.getElementById('toggle-close-up').parentElement;
    const titleText = titleLabel ? titleLabel.textContent.trim() : 'Zoom Mode';
    const textColor = document.documentElement.classList.contains("dark") ? 220 : 80;
    p.fill(textColor);
    p.noStroke();
    p.textSize(16);
    p.textAlign(p.LEFT, p.TOP);
    p.textStyle(p.BOLD);
    p.text(titleText, 10, 10);
    p.pop();
    // --- END: DRAW TITLE OVERLAY ---


    // --- Draw Crosshairs ---
    p.stroke(255, 0, 0, 150);
    p.strokeWeight(1.5);
    p.line(p.width / 2 - 15, p.height / 2, p.width / 2 + 15, p.height / 2);
    p.line(p.width / 2, p.height / 2 - 15, p.width / 2, p.height / 2 + 15);
  };

  p.windowResized = function () {
    if (canvas) {
      const container = document.getElementById(containerId);
      if (container) {
        p.resizeCanvas(container.offsetWidth, container.offsetHeight);
      }
    }
  };
};
