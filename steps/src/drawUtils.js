import {
    RADAR_X_MAX,
    RADAR_X_MIN,
    RADAR_Y_MAX,
    RADAR_Y_MIN,
    MAX_TRAJECTORY_LENGTH
} from './constants.js';
import {
    appState
} from './state.js';
import {
    toggleSnrColor,
    toggleClusterColor,
    toggleInlierColor,
    toggleFrameNorm,
    toggleVelocity,
    toggleStationaryColor
} from './dom.js';

// Color definitions moved from the sketch
export const snrColors = (p) => ({
    c1: p.color(0, 0, 255),
    c2: p.color(0, 255, 255),
    c3: p.color(0, 255, 0),
    c4: p.color(255, 255, 0),
    c5: p.color(255, 0, 0)
});

export const clusterColors = (p) => [
    p.color(230, 25, 75), p.color(60, 180, 75), p.color(0, 130, 200),
    p.color(245, 130, 48), p.color(145, 30, 180), p.color(70, 240, 240),
    p.color(240, 50, 230), p.color(210, 245, 60), p.color(128, 0, 0),
    p.color(0, 128, 128)
];

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
    b.translate(b.width / 2, b.height * 0.95);
    b.scale(1, -1);
    b.stroke(100, 100, 100, 150);
    b.strokeWeight(1);
    b.drawingContext.setLineDash([8, 8]);
    const a1 = p.radians(30),
        a2 = p.radians(150);
    const len = 70;
    b.line(0, 0, len * p.cos(a1) * plotScales.plotScaleX, len * p.sin(a1) * plotScales.plotScaleY);
    b.line(0, 0, len * p.cos(a2) * plotScales.plotScaleX, len * p.sin(a2) * plotScales.plotScaleY);
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
    const axisColor = document.documentElement.classList.contains('dark') ? p.color(100) : p.color(220);
    const mainAxisColor = document.documentElement.classList.contains('dark') ? p.color(150) : p.color(180);
    const textColor = document.documentElement.classList.contains('dark') ? p.color(200) : p.color(150);
    p.stroke(axisColor);
    p.strokeWeight(1);
    for (let y = 5; y <= RADAR_Y_MAX; y += 5) p.line(RADAR_X_MIN * plotScales.plotScaleX, y * plotScales.plotScaleY, RADAR_X_MAX * plotScales.plotScaleX, y * plotScales.plotScaleY);
    for (let x = -15; x <= 15; x += 5) {
        if (x === 0) continue;
        p.line(x * plotScales.plotScaleX, RADAR_Y_MIN * plotScales.plotScaleY, x * plotScales.plotScaleX, RADAR_Y_MAX * plotScales.plotScaleY);
    }
    p.stroke(mainAxisColor);
    p.line(RADAR_X_MIN * plotScales.plotScaleX, 0, RADAR_X_MAX * plotScales.plotScaleX, 0);
    p.line(0, RADAR_Y_MIN * plotScales.plotScaleY, 0, RADAR_Y_MAX * plotScales.plotScaleY);
    p.fill(textColor);
    p.noStroke();
    p.textSize(10);
    for (let y = 5; y <= RADAR_Y_MAX; y += 5) {
        p.push();
        p.translate(5, y * plotScales.plotScaleY);
        p.scale(1, -1);
        p.text(y, 0, 4);
        p.pop();
    }
    for (let x = -15; x <= 15; x += 5) {
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
    p.strokeWeight(4);
    const useSnr = toggleSnrColor.checked;
    const useCluster = toggleClusterColor.checked;
    const useInlier = toggleInlierColor.checked;
    const useFrameNorm = toggleFrameNorm.checked;
    let minSnr = appState.globalMinSnr,
        maxSnr = appState.globalMaxSnr;

    if (useSnr && useFrameNorm && points.length > 0) {
        const snrVals = points.map(p => p.snr).filter(snr => snr !== null);
        if (snrVals.length > 1) {
            minSnr = Math.min(...snrVals);
            maxSnr = Math.max(...snrVals);
        } else if (snrVals.length === 1) {
            minSnr = snrVals[0] - 1;
            maxSnr = snrVals[0] + 1;
        }
    }
    // This check is important. The p5_instance might not be fully initialized yet.
    if (useSnr && p.drawSnrLegendToBuffer) p.drawSnrLegendToBuffer(minSnr, maxSnr);

    const localClusterColors = clusterColors(p);
    const localSnrColors = snrColors(p);

    for (const pt of points) {
        if (pt && pt.x !== null && pt.y !== null) {
            if (useCluster && pt.clusterNumber !== null) {
                p.stroke(pt.clusterNumber > 0 ? localClusterColors[(pt.clusterNumber - 1) % localClusterColors.length] : 128);
            } else if (useInlier) {
                p.stroke(pt.isOutlier === false ? p.color(0, 255, 0) : pt.isOutlier === true ? p.color(255, 0, 0) : 128);
            } else if (useSnr && pt.snr !== null) {
                const amt = p.map(pt.snr, minSnr, maxSnr, 0, 1, true);
                let c;
                if (amt < 0.25) c = p.lerpColor(localSnrColors.c1, localSnrColors.c2, amt / 0.25);
                else if (amt < 0.5) c = p.lerpColor(localSnrColors.c2, localSnrColors.c3, (amt - 0.25) / 0.25);
                else if (amt < 0.75) c = p.lerpColor(localSnrColors.c3, localSnrColors.c4, (amt - 0.5) / 0.25);
                else c = p.lerpColor(localSnrColors.c4, localSnrColors.c5, (amt - 0.75) / 0.25);
                p.stroke(c);
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
    for (const track of appState.vizData.tracks) {
        const logs = track.historyLog.filter(log => log.frameIdx <= appState.currentFrame + 1);
        if (logs.length < 2) continue;

        const lastLog = logs[logs.length - 1];
        if (appState.currentFrame + 1 - lastLog.frameIdx > MAX_TRAJECTORY_LENGTH) continue;

        const isCurrentlyStationary = lastLog.isStationary;
        let maxLen = isCurrentlyStationary ? Math.floor(MAX_TRAJECTORY_LENGTH / 4) : MAX_TRAJECTORY_LENGTH;

        let trajPts = logs.filter(log => log.correctedPosition && log.correctedPosition[0] !== null).map(log => log.correctedPosition);
        if (trajPts.length > maxLen) {
            trajPts = trajPts.slice(trajPts.length - maxLen);
        }

        p.push();
        p.noFill();
        if (isCurrentlyStationary) {
            p.stroke(34, 139, 34, 220); // Forest green
            p.strokeWeight(1);
            p.drawingContext.setLineDash([3, 3]);
        } else {
            p.stroke(document.documentElement.classList.contains('dark') ? p.color(10, 170, 255, 250) : p.color(0, 50, 255, 250));
            p.strokeWeight(1.5);
        }
        p.beginShape();
        for (const pos of trajPts) p.vertex(pos[0] * plotScales.plotScaleX, pos[1] * plotScales.plotScaleY);
        p.endShape();
        p.drawingContext.setLineDash([]);
        p.pop();
    }
}

/**
 * Draws markers for the current position of tracked objects.
 * @param {p5} p - The p5 instance.
 * @param {object} plotScales - The calculated scales for plotting.
 */
export function drawTrackMarkers(p, plotScales) {
    const showDetails = toggleVelocity.checked;
    const useStationary = toggleStationaryColor.checked;
    const textColor = document.documentElement.classList.contains('dark') ? p.color(255) : p.color(0);
    const localStationaryColor = stationaryColor(p);
    const localMovingColor = movingColor(p);

    for (const track of appState.vizData.tracks) {
        const log = track.historyLog.find(log => log.frameIdx === appState.currentFrame + 1);
        if (log) {
            const pos = (log.correctedPosition && log.correctedPosition[0] !== null) ? log.correctedPosition : log.predictedPosition;
            if (pos && pos.length === 2 && pos[0] !== null && pos[1] !== null) {
                const size = 5,
                    x = pos[0] * plotScales.plotScaleX,
                    y = pos[1] * plotScales.plotScaleY;
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

                if (showDetails && log.predictedVelocity && log.predictedVelocity[0] !== null) {
                    const [vx, vy] = log.predictedVelocity;
                    if (log.isStationary === false) {
                        p.push();
                        p.stroke(velocityColor);
                        p.strokeWeight(2);
                        p.line(x, y, (pos[0] + vx) * plotScales.plotScaleX, (pos[1] + vy) * plotScales.plotScaleY);
                        p.pop();
                    }
                    const speed = (p.sqrt(vx * vx + vy * vy) * 3.6).toFixed(1);
                    const ttc = (log.ttc !== null && isFinite(log.ttc) && log.ttc < 100) ? `TTC: ${log.ttc.toFixed(1)}s` : '';
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
    const frameData = appState.vizData.radarFrames[appState.currentFrame];
    if (!frameData || !frameData.pointCloud) return;

    const hoveredPoints = [];
    const radius = 10;

    for (const pt of frameData.pointCloud) {
        if (pt.x === null || pt.y === null) continue;
        const screenX = (pt.x * plotScales.plotScaleX) + p.width / 2;
        const screenY = p.height * 0.95 - (pt.y * plotScales.plotScaleY);
        const d = p.dist(p.mouseX, p.mouseY, screenX, screenY);
        if (d < radius) {
            hoveredPoints.push({
                point: pt,
                screenX: screenX,
                screenY: screenY
            });
        }
    }

    if (hoveredPoints.length > 0) {
        hoveredPoints.sort((a, b) => a.screenY - b.screenY);

        p.push();
        p.textSize(12);
        const lineHeight = 15;
        const boxPadding = 8;
        let boxWidth = 0;
        const infoStrings = [];

        for (const hovered of hoveredPoints) {
            const pt = hovered.point;
            const vel = pt.velocity !== null ? pt.velocity.toFixed(2) : 'N/A';
            const snr = pt.snr !== null ? pt.snr.toFixed(1) : 'N/A';
            const infoText = `X:${pt.x.toFixed(2)}, Y:${pt.y.toFixed(2)} | V:${vel}, SNR:${snr}`;
            infoStrings.push(infoText);
            boxWidth = Math.max(boxWidth, p.textWidth(infoText));
        }

        const boxHeight = (infoStrings.length * lineHeight) + (boxPadding * 2);
        boxWidth += (boxPadding * 2);

        const xOffset = 20;
        let boxX = p.mouseX + xOffset;
        let boxY = p.mouseY - (boxHeight / 2);

        if (boxX + boxWidth > p.width) {
            boxX = p.mouseX - boxWidth - xOffset;
        }
        boxY = p.constrain(boxY, 0, p.height - boxHeight);

        const highlightColor = p.color(46, 204, 113);

        for (let i = 0; i < hoveredPoints.length; i++) {
            const hovered = hoveredPoints[i];
            p.noFill();
            p.stroke(highlightColor);
            p.strokeWeight(2);
            p.ellipse(hovered.screenX, hovered.screenY, 15, 15);
            p.strokeWeight(1);
            p.line(boxX + boxPadding, boxY + boxPadding + (i * lineHeight) + (lineHeight / 2), hovered.screenX, hovered.screenY);
        }

        const bgColor = document.documentElement.classList.contains('dark') ? p.color(20, 20, 30, 255) : p.color(245, 245, 245, 255);
        p.fill(bgColor);
        p.stroke(highlightColor);
        p.strokeWeight(1);
        p.rect(boxX, boxY, boxWidth, boxHeight, 4);

        const textColor = document.documentElement.classList.contains('dark') ? p.color(230) : p.color(20);
        p.fill(textColor);
        p.noStroke();
        p.textAlign(p.LEFT, p.TOP);
        for (let i = 0; i < infoStrings.length; i++) {
            p.text(infoStrings[i], boxX + boxPadding, boxY + boxPadding + (i * lineHeight));
        }

        p.pop();
    }
}
