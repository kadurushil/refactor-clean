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

function drawZoomTooltip(p, hoveredItems, mainMouseX) {
  if (!hoveredItems || hoveredItems.length === 0) return;

  // 1. Generate text content
  const infoStrings = [];
  for (const item of hoveredItems) {
    let infoText = "";
    let itemColor = item.color || null; // Initialize with existing item color or null
    const data = item.data;
    switch (item.type) {
      case "point":
        const vel = data.velocity !== null ? data.velocity.toFixed(2) : "N/A";
        const snr = data.snr !== null ? data.snr.toFixed(1) : "N/A";
        infoText = `Point ${item.index} | X:${data.x.toFixed(
          2
        )}, Y:${data.y.toFixed(2)} | V:${vel}, SNR:${snr}, Cluster: ${
          data.clusterNumber
        }`;
        break;
      case "cluster":
        const rs =
          data.radialSpeed !== null ? data.radialSpeed.toFixed(2) : "N/A";
        const vx = data.vx !== null ? data.vx.toFixed(2) : "N/A";
        const vy = data.vy !== null ? data.vy.toFixed(2) : "N/A";
        infoText = `Cluster ${data.id} | X:${data.x.toFixed(
          2
        )}, Y:${data.y.toFixed(2)} | rSpeed:${rs}, vX:${vx}, vY:${vy}`;
        break;
      case "track":
        const trackX = data.correctedPosition[0];
        const trackY = data.correctedPosition[1];
        let trackSpeed = "N/A",
          trackVx = "N/A",
          trackVy = "N/A";
        if (
          data.predictedVelocity &&
          data.predictedVelocity[0] !== null &&
          data.predictedVelocity[1] !== null
        ) {
          const [vx, vy] = data.predictedVelocity;
          trackVx = vx.toFixed(2);
          trackVy = vy.toFixed(2);
          trackSpeed = (p.sqrt(vx * vx + vy * vy) * 3.6).toFixed(1) + " km/h";
        }
        infoText = `Track ${item.trackId} | X:${trackX.toFixed(
          2
        )}, Y:${trackY.toFixed(2)} | Speed: ${trackSpeed}`;
        const isDark = document.documentElement.classList.contains("dark");
        itemColor = isDark
          ? p.color(100, 149, 237) // Lighter blue for dark mode
          : p.color(0, 0, 255); // Original blue for light mode
        break;
      case "prediction":
        const p_vx =
          data.predictedVelocity[0] !== null
            ? data.predictedVelocity[0].toFixed(2)
            : "N/A";
        const p_vy =
          data.predictedVelocity[1] !== null
            ? data.predictedVelocity[1].toFixed(2)
            : "N/A";
        infoText = `Pred. ${
          item.trackId
        } | X:${data.predictedPosition[0].toFixed(
          2
        )}, Y:${data.predictedPosition[1].toFixed(2)} | Vx:${p_vx}, Vy:${p_vy}`;
        itemColor = p.color(255, 0, 0); // Red color for prediction info
        break;
    }
    if (infoText) {
      infoStrings.push({ text: infoText, color: itemColor });
    }
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
        //console.log(`zoomSketch: Canvas CREATED with dimensions ${p.width}x${p.height}`); // debug
      } else {
        console.warn(
          "zoomSketch: updateAndDraw called, but container is not ready. Aborting draw."
        ); //debug
        return;
      }
    }
    p.redraw();
  };

  p.handleResize = function () {
    console.log("zoomSketch: handleResize triggered. Destroying old canvas.");
    if (canvas) {
      canvas.remove(); // p5.js function to properly remove the canvas from the DOM
      canvas = null; // Set the internal reference to null
    }
    // The canvas will be recreated automatically the next time updateAndDraw() is called,
    // at which point the container will have its correct, final dimensions.
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
            (log) => log.frameIdx === appState.currentFrame
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
    const titleLabel = document.getElementById("toggle-close-up").parentElement;
    const titleText = titleLabel ? titleLabel.textContent.trim() : "Zoom Mode";
    const textColor = document.documentElement.classList.contains("dark")
      ? 220
      : 80;
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
};
