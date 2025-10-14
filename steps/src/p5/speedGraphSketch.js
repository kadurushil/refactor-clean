import { appState } from "../state.js";
import { videoPlayer, speedGraphContainer } from "../dom.js";

export const speedGraphSketch = function (p) {
  let staticBuffer, minSpeed, maxSpeed, videoDuration;
  const pad = { top: 20, right: 130, bottom: 30, left: 50 };

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
    b.line(pad.left, pad.top, pad.left, b.height - pad.bottom);
    b.line(
      pad.left,
      b.height - pad.bottom,
      b.width - pad.right,
      b.height - pad.bottom
    );
    b.textAlign(b.RIGHT, b.CENTER);
    b.noStroke();
    b.fill(textColor);
    b.textSize(10);
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
    b.fill(textColor);
    b.text("km/h", pad.left - 8, pad.top - 8);
    b.textAlign(b.CENTER, b.TOP);
    b.noStroke();
    b.fill(isDark ? 180 : 150);
    const tInt = Math.max(1, Math.floor(videoDuration / 10));
    for (let t = 0; t <= videoDuration; t += tInt) {
      const x = b.map(t, 0, videoDuration, pad.left, b.width - pad.right);
      b.text(Math.round(t), x, b.height - pad.bottom + 5);
    }
    b.fill(textColor);
    b.text("Time (s)", b.width / 2, b.height - pad.bottom + 18);
    b.pop();

    if (radarData && radarData.radarFrames) {
      b.noFill();
      b.stroke(0, 150, 255); // Blue for CAN speed
      b.strokeWeight(1.5);
      b.beginShape();
      for (const frame of radarData.radarFrames) {
        if (frame.canVehSpeed_kmph === null || isNaN(frame.canVehSpeed_kmph)) {
          continue;
        }
        const relTime = frame.timestampMs / 1000;
        if (relTime >= 0 && relTime <= videoDuration) {
          const x = b.map(
            relTime,
            0,
            videoDuration,
            pad.left,
            b.width - pad.right
          );
          const y = b.map(
            frame.canVehSpeed_kmph,
            minSpeed,
            maxSpeed,
            b.height - pad.bottom,
            pad.top
          );
          b.vertex(x, y);
        }
      }
      b.endShape();
    }

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
      b.drawingContext.setLineDash([]);
    }

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

  p.setup = function () {
    let canvas = p.createCanvas(
      speedGraphContainer.offsetWidth,
      speedGraphContainer.offsetHeight
    );
    canvas.parent("speed-graph-container");
    staticBuffer = p.createGraphics(p.width, p.height);
    p.noLoop();
  };

  p.setData = function (radarData, duration) {

    if (!radarData || !radarData.radarFrames) return;
    videoDuration = duration; // Accept duration, even if it's 0 or NaN initially

    let speeds = [];
    if (radarData && radarData.radarFrames) {
      const egoSpeeds = radarData.radarFrames.map(
        (frame) => frame.egoVelocity[1] * 3.6
      );
      speeds.push(...egoSpeeds);

      const canSpeeds = radarData.radarFrames
        .map((frame) => frame.canVehSpeed_kmph)
        .filter((speed) => speed !== null && !isNaN(speed));
      speeds.push(...canSpeeds);
    }

    minSpeed =
      speeds.length > 0 ? Math.floor(Math.min(...speeds) / 10) * 10 : 0;
    maxSpeed =
      speeds.length > 0 ? Math.ceil(Math.max(...speeds) / 10) * 10 : 10;
    if (maxSpeed <= 0) maxSpeed = 10;
    if (minSpeed >= 0) minSpeed = 0;

    // *** KEY CHANGE ***
    // Only try to draw the static graph if the duration is valid.
    if (videoDuration > 0) {
      p.drawStaticGraphToBuffer(radarData);
    }
    //p.redraw();
  };

  p.draw = function () {
    // *** KEY CHANGE ***
    // If duration is not ready, show a waiting message and stop
    if (!videoDuration || videoDuration <= 0) {
      const isDark = document.documentElement.classList.contains("dark");
      p.background(isDark ? [55, 65, 81] : 255);
      p.fill(isDark ? 200 : 100);
      p.textAlign(p.CENTER, p.CENTER);
      p.text("Waiting for video duration...", p.width / 2, p.height / 2);
      return;
    }
    p.image(staticBuffer, 0, 0);
    drawTimeIndicator();
  };

  function drawTimeIndicator() {
    // This new, more robust check is the fix. It ensures that the video duration is valid AND
    // the main application has initialized the currentFrame before attempting to draw.
    if (
      !videoDuration ||
      videoDuration <= 0 ||
      appState.currentFrame === null ||
      appState.currentFrame === undefined
    ) {
      return; // Stop here if the state is not ready
    }

    // Get the current frame's data as the single source of truth
    const frameData = appState.vizData.radarFrames[appState.currentFrame];
    if (!frameData) return; // Exit if data for the specific frame isn't ready

    // Calculate the X position from the current frame's precise timestamp
    const currentTimeSec = frameData.timestampMs / 1000.0;
    const x = p.map(
      currentTimeSec,
      0,
      videoDuration,
      pad.left,
      p.width - pad.right
    );

    // Draw the red time indicator line at the accurate X position
    p.stroke(255, 0, 0, 150);
    p.strokeWeight(1.5);
    p.line(x, pad.top, x, p.height - pad.bottom);

    // Now, draw the circle using the same frame data
    if (frameData.canVehSpeed_kmph !== null && !isNaN(frameData.canVehSpeed_kmph)) {
        const canSpeed = frameData.canVehSpeed_kmph;
        const y = p.map(canSpeed, minSpeed, maxSpeed, p.height - pad.bottom, pad.top);
        p.fill(255, 0, 0);
        p.noStroke();
        p.ellipse(x, y, 8, 8);
    }
}

  p.windowResized = function () {
    p.resizeCanvas(
      speedGraphContainer.offsetWidth,
      speedGraphContainer.offsetHeight
    );
    staticBuffer = p.createGraphics(p.width, p.height);
    if (appState.vizData && videoDuration > 0) {
      p.drawStaticGraphToBuffer(appState.vizData);
    }
    p.redraw();
  };
};
