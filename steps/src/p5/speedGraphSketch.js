// File: src/speedGraphSketch.js
import { appState } from "../state.js";
import { videoPlayer, speedGraphContainer } from "../dom.js";

export const speedGraphSketch = function (p) {
  let staticBuffer, minSpeed, maxSpeed, videoDuration;
  // Reserve more top space for legend and reduce the right padding so the plot can use more width.
  const pad = { top: 48, right: 20, bottom: 30, left: 50 };

  p.drawStaticGraphToBuffer = function (radarData) {
    const b = staticBuffer;
    b.clear();
    const isDark = document.documentElement.classList.contains("dark");
    b.background(isDark ? [55, 65, 81] : 255);
    const gridColor = isDark ? 100 : 200;
    const textColor = isDark ? 200 : 100;

    b.push();
    b.stroke(gridColor);
    b.strokeWeight(1);
    // Y axis
    b.line(pad.left, pad.top, pad.left, b.height - pad.bottom);
    // X axis across the new plotting width
    b.line(pad.left, b.height - pad.bottom, b.width - pad.right, b.height - pad.bottom);

    b.textAlign(b.RIGHT, b.CENTER);
    b.noStroke();
    b.fill(textColor);
    b.textSize(10);

    for (let s = minSpeed; s <= maxSpeed; s += 5) {
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

    b.fill(textColor);
    b.text("km/h", pad.left - 8, pad.top - 12);
    b.textAlign(b.CENTER, b.TOP);
    b.noStroke();
    b.fill(isDark ? 180 : 150);

    const tInt = Math.max(1, Math.floor(videoDuration / 10));
    for (let t = 0; t <= videoDuration; t += tInt) {
      const x = b.map(t, 0, videoDuration, pad.left, b.width - pad.right);
      b.text(Math.round(t), x, b.height - pad.bottom + 5);
    }
    b.fill(textColor);

    // Draw vertical grid lines for time
    b.strokeWeight(1);
    b.stroke(isDark ? 80 : 230);
    for (let t = 10; t <= videoDuration; t += 10) {
      const x = b.map(t, 0, videoDuration, pad.left, b.width - pad.right);
      b.line(x, pad.top, x, b.height - pad.bottom);
    }
    b.noStroke();

    b.text("Time (s)", (pad.left + (b.width - pad.right)) / 2, b.height - pad.bottom + 18);
    b.pop();

    // Draw CAN speed (solid blue)
    if (radarData && radarData.radarFrames) {
      b.noFill();
      b.stroke(0, 150, 255);
      b.strokeWeight(1.5);
      b.beginShape();
      for (const frame of radarData.radarFrames) {
        if (frame.canVehSpeed_kmph === null || isNaN(frame.canVehSpeed_kmph)) continue;
        const relTime = frame.timestamp / 1000;
        if (relTime >= 0 && relTime <= videoDuration) {
          const x = b.map(relTime, 0, videoDuration, pad.left, b.width - pad.right);
          const y = b.map(frame.canVehSpeed_kmph, minSpeed, maxSpeed, b.height - pad.bottom, pad.top);
          b.vertex(x, y);
        }
      }
      b.endShape();
    }

    // Draw Ego speed (dashed green)
    if (radarData && radarData.radarFrames) {
      b.stroke(0, 200, 100);
      b.drawingContext.setLineDash([5, 5]);
      b.beginShape();
      for (const frame of radarData.radarFrames) {
        const relTime = frame.timestamp / 1000;
        if (relTime >= 0 && relTime <= videoDuration) {
          const x = b.map(relTime, 0, videoDuration, pad.left, b.width - pad.right);
          const egoSpeedKmh = frame.egoVelocity[1] * 3.6;
          const y = b.map(egoSpeedKmh, minSpeed, maxSpeed, b.height - pad.bottom, pad.top);
          b.vertex(x, y);
        }
      }
      b.endShape();
      b.drawingContext.setLineDash([]);
    }

    // --- Legend: centered in the top padding area (above the plotting area) ---
    b.push();
    b.noStroke();
    b.fill(textColor);
    b.textSize(12);
    b.textAlign(b.LEFT, b.CENTER);

    const canLabel = "CAN Speed";
    const egoLabel = "Ego Speed";

    const segLen = 18;
    const gapBetweenSegAndLabel = 8;
    const betweenItemsGap = 24;

    // compute widths of each legend item (segment + gap + label)
    const canItemWidth = segLen + gapBetweenSegAndLabel + b.textWidth(canLabel);
    const egoItemWidth = segLen + gapBetweenSegAndLabel + b.textWidth(egoLabel);
    const totalLegendWidth = canItemWidth + betweenItemsGap + egoItemWidth;

    // center the legend across the plotting region (pad.left .. b.width - pad.right)
    const plottingLeft = pad.left;
    const plottingRight = b.width - pad.right;
    const centerX = (plottingLeft + plottingRight) / 2;
    const legendStartX = centerX - totalLegendWidth / 2;
    const legendY = pad.top / 2; // vertically centered inside the top padding

    // Draw CAN legend item
    b.push();
    b.stroke(0, 150, 255);
    b.strokeWeight(2);
    b.line(legendStartX, legendY + 6, legendStartX + segLen, legendY + 6);
    b.noStroke();
    b.fill(textColor);
    b.text(canLabel, legendStartX + segLen + gapBetweenSegAndLabel, legendY + 6);
    b.pop();

    // Draw Ego legend item
    const egoX = legendStartX + canItemWidth + betweenItemsGap;
    b.push();
    b.stroke(0, 200, 100);
    b.strokeWeight(2);
    b.drawingContext.setLineDash([3, 3]);
    b.line(egoX, legendY + 6, egoX + segLen, legendY + 6);
    b.drawingContext.setLineDash([]);
    b.noStroke();
    b.fill(textColor);
    b.text(egoLabel, egoX + segLen + gapBetweenSegAndLabel, legendY + 6);
    b.pop();

    b.pop();
  };

  p.setup = function () {
    let canvas = p.createCanvas(speedGraphContainer.offsetWidth, speedGraphContainer.offsetHeight);
    canvas.parent("speed-graph-container");
    staticBuffer = p.createGraphics(p.width, p.height);
    p.noLoop();
  };

  p.setData = function (radarData, duration) {
    if (!radarData || !radarData.radarFrames) return;

    // Clear the old buffer to prevent showing stale graphs, especially if new data has no duration.
    staticBuffer.clear();
    p.background(document.documentElement.classList.contains("dark") ? [55, 65, 81] : 255);

    videoDuration = duration;

    let speeds = [];
    if (radarData && radarData.radarFrames) {
      const egoSpeeds = radarData.radarFrames.map((frame) => frame.egoVelocity[1] * 3.6);
      speeds.push(...egoSpeeds);

      const canSpeeds = radarData.radarFrames
        .map((frame) => frame.canVehSpeed_kmph)
        .filter((speed) => speed !== null && !isNaN(speed));
      speeds.push(...canSpeeds);
    }

    minSpeed = speeds.length > 0 ? Math.floor(Math.min(...speeds) / 10) * 10 : 0;
    maxSpeed = speeds.length > 0 ? Math.ceil(Math.max(...speeds) / 10) * 10 : 10;
    if (maxSpeed <= 0) maxSpeed = 10;
    if (minSpeed >= 0) minSpeed = 0;

    if (videoDuration >= 0) {
      p.drawStaticGraphToBuffer(radarData);
    }
  };

  p.draw = function () {
    if (!staticBuffer || !videoDuration || videoDuration <= 0) {
      const isDark = document.documentElement.classList.contains("dark");
      p.background(isDark ? [55, 65, 81] : 255);
      p.fill(isDark ? 200 : 100);
      p.textAlign(p.CENTER, p.CENTER);
      p.text("No data to display", p.width / 2, p.height / 2);
      return;
    }
    p.image(staticBuffer, 0, 0);
    drawTimeIndicator();
  };

  function drawTimeIndicator() {
    if (
      !videoDuration ||
      videoDuration <= 0 ||
      appState.currentFrame === null ||
      appState.currentFrame === undefined
    ) {
      return;
    }

    const frameData = appState.vizData.radarFrames[appState.currentFrame];
    if (!frameData) return;

    const currentTimeSec = frameData.timestamp / 1000.0;
    const x = p.map(currentTimeSec, 0, videoDuration, pad.left, p.width - pad.right);

    p.stroke(255, 0, 0, 150);
    p.strokeWeight(1.5);
    p.line(x, pad.top, x, p.height - pad.bottom);

    if (frameData.canVehSpeed_kmph !== null && !isNaN(frameData.canVehSpeed_kmph)) {
      const canSpeed = frameData.canVehSpeed_kmph;
      const y = p.map(canSpeed, minSpeed, maxSpeed, p.height - pad.bottom, pad.top);
      p.fill(255, 0, 0);
      p.noStroke();
      p.ellipse(x, y, 8, 8);
    }
  }

  p.windowResized = function () {
    p.resizeCanvas(speedGraphContainer.offsetWidth, speedGraphContainer.offsetHeight);
    staticBuffer = p.createGraphics(p.width, p.height);
    if (appState.vizData && videoDuration > 0) {
      p.drawStaticGraphToBuffer(appState.vizData);
    }
    p.redraw();
  };
};
