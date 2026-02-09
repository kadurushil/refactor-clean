// File: src/speedGraphSketch.js
import { appState } from "../state.js";
import { videoPlayer, speedGraphContainer, playPauseBtn } from "../dom.js";
import { updateFrame, pausePlayback } from "../sync.js";
import { ttcColors } from "../drawUtils.js";

export const speedGraphSketch = function (p) {
  let staticBuffer, minSpeed, maxSpeed, videoDuration;
  // Reserve more top space for legend and reduce the right padding so the plot can use more width.
  const pad = { top: 48, right: 20, bottom: 30, left: 50 };

  // Hover state
  let hoverX = null;
  let hoverTimeSec = null;
  let hoverFrameIndex = null;
  let hoverCanSpeed = null;
  let hoverEgoSpeed = null;
  const tooltipPadding = 8;
  let hoverTimeout = null; // To manage the hover-off delay
  let isMouseOver = false; // To track if the mouse is on the canvas

  function findNearestFrameIndexByTime(ms) {
    if (!appState.vizData || !appState.vizData.radarFrames) return null;
    const frames = appState.vizData.radarFrames;
    let lo = 0, hi = frames.length - 1;
    if (frames.length === 0) return null;
    if (ms <= frames[0].timestamp) return 0;
    if (ms >= frames[hi].timestamp) return hi;
    while (lo <= hi) {
      const mid = Math.floor((lo + hi) / 2);
      const t = frames[mid].timestamp;
      if (t === ms) return mid;
      if (t < ms) lo = mid + 1; else hi = mid - 1;
    }
    // after loop, lo is the first index greater than ms; choose nearest of lo and lo-1
    const idxA = Math.max(0, lo - 1);
    const idxB = Math.min(frames.length - 1, lo);
    return (Math.abs(frames[idxA].timestamp - ms) <= Math.abs(frames[idxB].timestamp - ms)) ? idxA : idxB;
  }

  p.drawStaticGraphToBuffer = function (radarData) {
    const b = staticBuffer;
    b.clear();
    const isDark = document.documentElement.classList.contains("dark");
    b.background(isDark ? [55, 65, 81] : 255);
    const gridColor = isDark ? 100 : 200;
    const textColor = isDark ? 200 : 100;
    
    // --- Step 1: Define Spectral Color Scheme (MATLAB Style) ---
    // Anchors: Blue (0%) -> Cyan (25%) -> Green (50%) -> Yellow (75%) -> Red (100%)
    const spectralAnchors = [
      p.color(0, 0, 255),   // Blue
      p.color(0, 255, 255), // Cyan
      p.color(0, 255, 0),   // Green
      p.color(255, 255, 0), // Yellow
      p.color(255, 0, 0)    // Red
    ];

    function getSpectralColor(ratio) {
      const amt = p.constrain(ratio, 0, 1);
      if (amt <= 0.25) return p.lerpColor(spectralAnchors[0], spectralAnchors[1], amt / 0.25);
      if (amt <= 0.50) return p.lerpColor(spectralAnchors[1], spectralAnchors[2], (amt - 0.25) / 0.25);
      if (amt <= 0.75) return p.lerpColor(spectralAnchors[2], spectralAnchors[3], (amt - 0.50) / 0.25);
      return p.lerpColor(spectralAnchors[3], spectralAnchors[4], (amt - 0.75) / 0.25);
    }

    // --- Step 2: Pre-calculate Track Density ---
    const numFrames = radarData && radarData.radarFrames ? radarData.radarFrames.length : 0;
    const trackCounts = new Uint16Array(numFrames).fill(0);
    const confirmedOnly = document.getElementById("toggleConfirmedOnly")?.checked ?? true;

    if (radarData && radarData.tracks && numFrames > 0) {
      for (const track of radarData.tracks) {
        // Only count tracks that would actually be visible in the confirmed view
        if (confirmedOnly && track.isConfirmed === false) continue;
        
        if (track.historyLog) {
          for (const log of track.historyLog) {
            if (log.frameIdx >= 0 && log.frameIdx < numFrames) {
              trackCounts[log.frameIdx]++;
            }
          }
        }
      }
    }

    // Determine normalization factor using a robust metric (95th percentile)
    // This prevents a single frame with 100 tracks (noise) from making the rest of the graph blue.
    let normTracks = 1;
    if (numFrames > 0) {
      const sortedCounts = [...trackCounts].sort((a, b) => a - b);
      // Use 95th percentile as the "High" anchor
      const p95Index = Math.floor(numFrames * 0.95);
      const p95Value = sortedCounts[p95Index];
      const maxValue = sortedCounts[numFrames - 1];
      
      // We'll normalize against p95, but ensure it's at least a reasonable number.
      normTracks = Math.max(1, p95Value);
      
      console.log(`[SpeedGraph] Density Info (Confirmed Only: ${confirmedOnly}):`);
      console.log(` - Max tracks: ${maxValue}, 95th Percentile: ${p95Value}`);
      console.log(` - Normalizing against: ${normTracks}`);
    }

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

    // --- Density Legend Bar (Left Side) ---
    // Smooth gradient representation of track density
    const lx = 10;
    const lw = 6;
    const ly = pad.top;
    const lh = b.height - pad.bottom - pad.top;

    b.push();
    b.noFill();
    for (let i = 0; i < lh; i++) {
      const ratio = b.map(i, 0, lh, 1, 0); // 1 at top (red), 0 at bottom (blue)
      b.stroke(getSpectralColor(ratio));
      b.line(lx, ly + i, lx + lw, ly + i);
    }
    b.pop();

    // Legend Labels for the vertical bar
    b.fill(textColor);
    b.textSize(9);
    
    b.textAlign(b.LEFT, b.TOP);
    b.text(normTracks, lx + lw + 3, ly);
    
    b.textAlign(b.LEFT, b.BOTTOM);
    b.text("0", lx + lw + 3, ly + lh);

    b.textAlign(b.LEFT, b.TOP);
    b.text("Tracks", lx, ly + lh + 4);

    // Draw CAN speed (Colored by Track Density)
    if (radarData && radarData.radarFrames) {
      b.strokeWeight(2.5); // Slightly thicker for better color visibility
      b.noFill();
      
      let prevX = null;
      let prevY = null;

      for (let i = 0; i < radarData.radarFrames.length; i++) {
        const frame = radarData.radarFrames[i];
        
        if (frame.canVehSpeed_kmph === null || isNaN(frame.canVehSpeed_kmph)) {
          prevX = null; 
          continue;
        }
        
        const relTime = frame.timestamp / 1000;
        if (relTime < 0 || relTime > videoDuration) continue;

        const x = b.map(relTime, 0, videoDuration, pad.left, b.width - pad.right);
        const speed = frame.canVehSpeed_kmph;
        const y = b.map(speed, minSpeed, maxSpeed, b.height - pad.bottom, pad.top);

        if (prevX !== null) {
          // Robust normalization: Ratio based on 95th percentile
          const ratio = trackCounts[i] / normTracks;
          b.stroke(getSpectralColor(ratio));
          b.line(prevX, prevY, x, y);
        }

        prevX = x;
        prevY = y;
      }
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

    const canLabel = "CAN Speed (Color: Tracks Density)";
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

    // Draw CAN legend item (Gradient Line to represent density range)
    // We draw small segments of different colors to show the range
    b.strokeWeight(2);
    const step = segLen / 5;
    // Use spectralAnchors for the horizontal legend line
    b.stroke(spectralAnchors[0]); b.line(legendStartX, legendY + 6, legendStartX + step, legendY + 6);
    b.stroke(spectralAnchors[1]); b.line(legendStartX + step, legendY + 6, legendStartX + step*2, legendY + 6);
    b.stroke(spectralAnchors[2]); b.line(legendStartX + step*2, legendY + 6, legendStartX + step*3, legendY + 6);
    b.stroke(spectralAnchors[3]); b.line(legendStartX + step*3, legendY + 6, legendStartX + step*4, legendY + 6);
    b.stroke(spectralAnchors[4]); b.line(legendStartX + step*4, legendY + 6, legendStartX + segLen, legendY + 6);

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

  let isDragging = false;

  function updateHoverState(x) {
    if (!appState.vizData || !appState.vizData.radarFrames || videoDuration === undefined) {
      hoverX = null;
      return;
    }

    // Clamp x to the valid plotting width for calculation
    hoverX = Math.max(pad.left, Math.min(p.width - pad.right, x));

    // map hoverX to time in seconds inside [0, videoDuration]
    const dur = videoDuration > 0 ? videoDuration : Math.max(1, (appState.vizData.radarFrames[appState.vizData.radarFrames.length - 1].timestamp / 1000));
    hoverTimeSec = p.map(hoverX, pad.left, p.width - pad.right, 0, dur);
    
    // Clamp time to [0, duration]
    hoverTimeSec = Math.max(0, Math.min(dur, hoverTimeSec));
    
    const hoverTimeMs = Math.round(hoverTimeSec * 1000);
    hoverFrameIndex = findNearestFrameIndexByTime(hoverTimeMs);
    
    if (hoverFrameIndex !== null) {
      const f = appState.vizData.radarFrames[hoverFrameIndex];
      hoverCanSpeed = (f.canVehSpeed_kmph !== null && !isNaN(f.canVehSpeed_kmph)) ? f.canVehSpeed_kmph : null;
      hoverEgoSpeed = f.egoVelocity ? (f.egoVelocity[1] * 3.6) : null; // convert m/s to km/h
    } else {
      hoverCanSpeed = null;
      hoverEgoSpeed = null;
    }
  }

  p.setup = function () {
    let canvas = p.createCanvas(speedGraphContainer.offsetWidth, speedGraphContainer.offsetHeight);
    canvas.parent("speed-graph-container");

    // --- Pointer Events for Drag & Click ---
    
    canvas.elt.addEventListener('pointerdown', (e) => {
      if (!appState.vizData) return;
      isDragging = true;
      canvas.elt.setPointerCapture(e.pointerId);
      
      if (appState.isPlaying) {
        pausePlayback();
        appState.isPlaying = false;
        playPauseBtn.textContent = "Play";
      }

      // Instant seek on click
      updateHoverState(e.offsetX);
      if (hoverFrameIndex !== null) {
        updateFrame(hoverFrameIndex, false);
        if (appState.p5_instance) appState.p5_instance.redraw();
        p.redraw();
      }
    });

    canvas.elt.addEventListener('pointermove', (e) => {
      if (!appState.vizData) return;
      
      if (isDragging) {
        // When dragging, clamp X to canvas bounds and seek
        const rect = canvas.elt.getBoundingClientRect();
        // Calculate offsetX manually if needed, or trust e.offsetX with capture
        // With setPointerCapture, e.offsetX is relative to the target (canvas).
        updateHoverState(e.offsetX);
        
        if (hoverFrameIndex !== null) {
           updateFrame(hoverFrameIndex, false);
           if (appState.p5_instance) appState.p5_instance.redraw();
        }
        p.redraw();
      } else {
        // Normal Hover Behavior
        if (hoverTimeout) {
            clearTimeout(hoverTimeout);
            hoverTimeout = null;
        }
        
        // If we are hovering, e.offsetX is correct. 
        updateHoverState(e.offsetX);
        p.redraw();
      }
    });

    canvas.elt.addEventListener('pointerup', (e) => {
      if (isDragging) {
        isDragging = false;
        canvas.elt.releasePointerCapture(e.pointerId);
        // Final precise seek (forces video sync)
        updateFrame(appState.currentFrame, true);
      }
    });

    // Clear hover state when mouse leaves the canvas (only if not dragging)
    canvas.mouseOut(() => {
      if (isDragging) return;
      hoverTimeout = setTimeout(() => {
        hoverX = null;
        hoverFrameIndex = null;
        hoverCanSpeed = null;
        hoverEgoSpeed = null;
        p.redraw();
      }, 100);
    });

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

    // draw hover vertical line and tooltip if applicable
    if (hoverX !== null && hoverFrameIndex !== null) {
      p.push();
      // Draw dashed vertical line
      p.stroke(255, 0, 255, 200); // Fuschia
      p.strokeWeight(1.2);
      p.drawingContext.setLineDash([4, 4]);
      p.line(hoverX, pad.top, hoverX, p.height - pad.bottom);
      p.drawingContext.setLineDash([]); // Reset to solid
      p.noStroke();

      // Draw blue circle for CAN speed at hover point
      if (hoverCanSpeed !== null) {
        const y = p.map(hoverCanSpeed, minSpeed, maxSpeed, p.height - pad.bottom, pad.top);
        p.fill(255, 0, 255); // Same blue color
        p.noStroke();
        p.ellipse(hoverX, y, 8, 8);
      }

      // Tooltip content
      const canText = hoverCanSpeed !== null ? `CAN: ${hoverCanSpeed.toFixed(1)} km/h` : `CAN: N/A`;
      const egoText = hoverEgoSpeed !== null ? `Ego: ${hoverEgoSpeed.toFixed(1)} km/h` : `Ego: N/A`;
      const timeText = `t=${hoverTimeSec !== null ? hoverTimeSec.toFixed(2) + ' s' : ''}`;

      const tooltipLines = [timeText, canText, egoText];
      const textWidthMax = Math.max(...tooltipLines.map((t) => p.textWidth(t)));
      const boxW = textWidthMax + tooltipPadding * 2;
      const boxH = (tooltipLines.length * 14) + tooltipPadding * 2;

      // compute box position (avoid overflowing right edge)
      let boxX = hoverX + 12;
      if (boxX + boxW > p.width) boxX = hoverX - 12 - boxW;
      const boxY = pad.top + 6;

      // Draw background box
      p.fill(document.documentElement.classList.contains("dark") ? 40 : 255);
      p.stroke(document.documentElement.classList.contains("dark") ? 180 : 80);
      p.rect(boxX, boxY, boxW, boxH, 6);

      p.noStroke();
      p.fill(document.documentElement.classList.contains("dark") ? 220 : 30);
      p.textSize(12);
      p.textAlign(p.LEFT, p.TOP);
      for (let i = 0; i < tooltipLines.length; i++) {
        p.text(tooltipLines[i], boxX + tooltipPadding, boxY + tooltipPadding + i * 14);
      }

      p.pop();
    }
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
    hoverX = null; // reset hover on resize
    if (appState.vizData && videoDuration > 0) {
      p.drawStaticGraphToBuffer(appState.vizData);
    }
    p.redraw();
  };
};
