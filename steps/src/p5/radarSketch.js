//---Import APPSTATE, Constatns, DOM---//

import { appState 

} from '../state.js';

import { RADAR_X_MAX, RADAR_X_MIN, RADAR_Y_MAX, RADAR_Y_MIN, MAX_TRAJECTORY_LENGTH 

} from '../constants.js';

import { canvasContainer, toggleFrameNorm,  toggleSnrColor, toggleClusterColor, toggleInlierColor, toggleStationaryColor, toggleTracks, toggleVelocity 
} from '../dom.js';


export const radarSketch = function (p) {

            let plotScaleX, plotScaleY, staticBackgroundBuffer, snrLegendBuffer, snrColors, clusterColors;
            // ADD COLOR DEFINITIONS FOR STATIONARY/MOVING OBJECTS
            let stationaryColor, movingColor;

            p.setup = function () {
                let canvas = p.createCanvas(canvasContainer.offsetWidth, canvasContainer.offsetHeight);
                canvas.parent('canvas-container');
                staticBackgroundBuffer = p.createGraphics(p.width, p.height);
                snrLegendBuffer = p.createGraphics(100, 450);
                snrColors = { c1: p.color(0, 0, 255), c2: p.color(0, 255, 255), c3: p.color(0, 255, 0), c4: p.color(255, 255, 0), c5: p.color(255, 0, 0) };
                clusterColors = [p.color(230, 25, 75), p.color(60, 180, 75), p.color(0, 130, 200), p.color(245, 130, 48), p.color(145, 30, 180), p.color(70, 240, 240), p.color(240, 50, 230), p.color(210, 245, 60), p.color(128, 0, 0), p.color(0, 128, 128)];

                // INITIALIZE STATIONARY/MOVING COLORS
                stationaryColor = p.color(218, 165, 32); // Golden ROD Yellow
                movingColor = p.color(255, 0, 255); // Magenta

                calculatePlotScales();
                p.drawSnrLegendToBuffer(appState.globalMinSnr, appState.globalMaxSnr);
                drawStaticRegionsToBuffer();
                p.noLoop();
            };
            function calculatePlotScales() { const hPad = 0.05, vPad = 0.05, bOff = 0.05; const aW = p.width * (1 - 2 * hPad); const aH = p.height * (1 - bOff - vPad); plotScaleX = aW / (RADAR_X_MAX - RADAR_X_MIN); plotScaleY = aH / (RADAR_Y_MAX - RADAR_Y_MIN); }
            p.draw = function () {
                if (document.documentElement.classList.contains('dark')) {
                    p.background(55, 65, 81);
                } else {
                    p.background(255);
                }
                if (!appState.vizData) return;
                p.image(staticBackgroundBuffer, 0, 0);
                p.push();
                p.translate(p.width / 2, p.height * 0.95);
                p.scale(1, -1);
                calculatePlotScales();
                drawAxes();
                if (toggleTracks.checked) {
                    drawTrajectories();
                    drawTrackMarkers();
                }
                const frameData = appState.vizData.radarFrames[appState.currentFrame];
                if (frameData) drawPointCloud(frameData.pointCloud);
                p.pop();

                if (appState.isCloseUpMode) {
                    handleCloseUpDisplay();
                }

                if (toggleSnrColor.checked) p.image(snrLegendBuffer, 10, p.height - snrLegendBuffer.height - 10);
            };


            function drawStaticRegionsToBuffer() { const b = staticBackgroundBuffer; b.clear(); b.push(); b.translate(b.width / 2, b.height * 0.95); b.scale(1, -1); const hPad = 0.05, vPad = 0.05, bOff = 0.05; const bAW = b.width * (1 - 2 * hPad); const bAH = b.height * (1 - bOff - vPad); const bPSX = bAW / (RADAR_X_MAX - RADAR_X_MIN); const bPSY = bAH / (RADAR_Y_MAX - RADAR_Y_MIN); b.stroke(100, 100, 100, 150); b.strokeWeight(1); b.drawingContext.setLineDash([8, 8]); const a1 = p.radians(30), a2 = p.radians(150); const len = 70; b.line(0, 0, len * p.cos(a1) * bPSX, len * p.sin(a1) * bPSY); b.line(0, 0, len * p.cos(a2) * bPSX, len * p.sin(a2) * bPSY); b.drawingContext.setLineDash([]); b.pop(); }
            function drawAxes() {
                p.push();
                const axisColor = document.documentElement.classList.contains('dark') ? p.color(100) : p.color(220);
                const mainAxisColor = document.documentElement.classList.contains('dark') ? p.color(150) : p.color(180);
                const textColor = document.documentElement.classList.contains('dark') ? p.color(200) : p.color(150);
                p.stroke(axisColor);
                p.strokeWeight(1);
                for (let y = 5; y <= RADAR_Y_MAX; y += 5) p.line(RADAR_X_MIN * plotScaleX, y * plotScaleY, RADAR_X_MAX * plotScaleX, y * plotScaleY);
                for (let x = -15; x <= 15; x += 5) { if (x === 0) continue; p.line(x * plotScaleX, RADAR_Y_MIN * plotScaleY, x * plotScaleX, RADAR_Y_MAX * plotScaleY); }
                p.stroke(mainAxisColor);
                p.line(RADAR_X_MIN * plotScaleX, 0, RADAR_X_MAX * plotScaleX, 0);
                p.line(0, RADAR_Y_MIN * plotScaleY, 0, RADAR_Y_MAX * plotScaleY);
                p.fill(textColor);
                p.noStroke();
                p.textSize(10);
                for (let y = 5; y <= RADAR_Y_MAX; y += 5) { p.push(); p.translate(5, y * plotScaleY); p.scale(1, -1); p.text(y, 0, 4); p.pop(); }
                for (let x = -15; x <= 15; x += 5) { if (x === 0) continue; p.push(); p.translate(x * plotScaleX, -10); p.scale(1, -1); p.textAlign(p.CENTER); p.text(x, 0, 0); p.pop(); }
                p.pop();
            }
            function drawPointCloud(points) {
                p.strokeWeight(4);
                const useSnr = toggleSnrColor.checked;
                const useCluster = toggleClusterColor.checked;
                const useInlier = toggleInlierColor.checked;
                const useFrameNorm = toggleFrameNorm.checked;
                let minSnr = appState.globalMinSnr, maxSnr = appState.globalMaxSnr;

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
                if (useSnr) p.drawSnrLegendToBuffer(minSnr, maxSnr);

                for (const pt of points) {
                    if (pt && pt.x !== null && pt.y !== null) {
                        if (useCluster && pt.clusterNumber !== null) {
                            if (pt.clusterNumber > 0) {
                                p.stroke(clusterColors[(pt.clusterNumber - 1) % clusterColors.length]);
                            } else {
                                p.stroke(128);
                            }
                        } else if (useInlier) {
                            if (pt.isOutlier === false) {
                                p.stroke(0, 255, 0);
                            } else if (pt.isOutlier === true) {
                                p.stroke(255, 0, 0);
                            } else {
                                p.stroke(128);
                            }
                        } else if (useSnr && pt.snr !== null) {
                            const amt = p.map(pt.snr, minSnr, maxSnr, 0, 1, true);
                            let c;
                            if (amt < 0.25) c = p.lerpColor(snrColors.c1, snrColors.c2, amt / 0.25);
                            else if (amt < 0.5) c = p.lerpColor(snrColors.c2, snrColors.c3, (amt - 0.25) / 0.25);
                            else if (amt < 0.75) c = p.lerpColor(snrColors.c3, snrColors.c4, (amt - 0.5) / 0.25);
                            else c = p.lerpColor(snrColors.c4, snrColors.c5, (amt - 0.75) / 0.25);
                            p.stroke(c);
                        } else {
                            p.stroke(0, 150, 255);
                        }
                        p.point(pt.x * plotScaleX, pt.y * plotScaleY);
                    }
                }
            }
            function drawTrajectories() {
                for (const track of appState.vizData.tracks) {
                    const logs = track.historyLog.filter(log => log.frameIdx <= appState.currentFrame + 1);
                    if (logs.length < 2) continue;

                    const lastLog = logs[logs.length - 1];
                    if (appState.currentFrame + 1 - lastLog.frameIdx > MAX_TRAJECTORY_LENGTH) continue;

                    // Determine the state from the most recent log entry
                    const isCurrentlyStationary = lastLog.isStationary;

                    // Set max trajectory length based on state
                    let maxLen = MAX_TRAJECTORY_LENGTH;
                    if (isCurrentlyStationary) {
                        maxLen = Math.floor(MAX_TRAJECTORY_LENGTH / 4);
                    }

                    let trajPts = logs.filter(log => log.correctedPosition && log.correctedPosition[0] !== null).map(log => log.correctedPosition);
                    if (trajPts.length > maxLen) {
                        trajPts = trajPts.slice(trajPts.length - maxLen);
                    }

                    p.push();
                    p.noFill();

                    // Apply different styles based on the stationary state
                    if (isCurrentlyStationary) {
                        // Style for STATIONARY tracks: thin, dashed, green
                        p.stroke(34, 139, 34, 220); // A darker, forest green
                        p.strokeWeight(1);
                        p.drawingContext.setLineDash([3, 3]); // Small dashes
                    } else {
                        // Style for MOVING tracks: default blue
                        const isDark = document.documentElement.classList.contains('dark');
                        if (isDark) {
                            p.stroke(10, 170, 255, 250);
                        } else {
                            p.stroke(0, 50, 255, 250);
                        }
                        p.strokeWeight(1.5);
                        // No dash for solid line
                    }

                    p.beginShape();
                    for (const pos of trajPts) p.vertex(pos[0] * plotScaleX, pos[1] * plotScaleY);
                    p.endShape();

                    // IMPORTANT: Reset the drawing context to avoid affecting other elements
                    p.drawingContext.setLineDash([]);
                    p.pop();
                }
            }
            function drawTrackMarkers() {
                const showDetails = toggleVelocity.checked;
                const useStationary = toggleStationaryColor.checked;
                const textColor = document.documentElement.classList.contains('dark') ? p.color(255) : p.color(0);

                for (const track of appState.vizData.tracks) {
                    const log = track.historyLog.find(log => log.frameIdx === appState.currentFrame + 1);
                    if (log) {
                        const pos = (log.correctedPosition && log.correctedPosition[0] !== null) ? log.correctedPosition : log.predictedPosition;
                        if (pos && pos.length === 2 && pos[0] !== null && pos[1] !== null) {

                            // --- START OF CORRECTED LOGIC ---

                            const size = 5, x = pos[0] * plotScaleX, y = pos[1] * plotScaleY;
                            let velocityColor = p.color(255, 0, 255, 200); // Default velocity color

                            p.push();
                            p.strokeWeight(2);

                            // Check conditions and draw the correct marker
                            if (useStationary && log.isStationary === true) {
                                // 1. Stationary object with toggle ON
                                p.stroke(stationaryColor); // Use yellow
                                p.noFill();
                                p.rectMode(p.CENTER);
                                p.square(x, y, size * 1.5);
                                velocityColor = stationaryColor;
                            } else {
                                // 2. Moving object OR toggle OFF
                                let markerColor = p.color(0, 0, 255); // Default blue
                                if (useStationary && log.isStationary === false) {
                                    markerColor = movingColor; // Magenta if toggle is on
                                    velocityColor = movingColor;
                                }
                                p.stroke(markerColor);
                                p.line(x - size, y, x + size, y);
                                p.line(x, y - size, x, y + size);
                            }
                            p.pop();

                            // --- END OF CORRECTED LOGIC ---

                            if (showDetails && log.predictedVelocity && log.predictedVelocity[0] !== null) {
                                const [vx, vy] = log.predictedVelocity;

                                // Only draw velocity line if object is NOT stationary
                                if (log.isStationary === false) {
                                    p.push();
                                    p.stroke(velocityColor);
                                    p.strokeWeight(2);
                                    p.line(pos[0] * plotScaleX, pos[1] * plotScaleY, (pos[0] + vx) * plotScaleX, (pos[1] + vy) * plotScaleY);
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
                                p.text(text, pos[0] * plotScaleX + 10, -pos[1] * plotScaleY);
                                p.pop();
                            }
                        }
                    }
                }
            }

            function handleCloseUpDisplay() {
                const frameData = appState.vizData.radarFrames[appState.currentFrame];
                if (!frameData || !frameData.pointCloud) return;

                const hoveredPoints = [];
                const radius = 10;

                for (const pt of frameData.pointCloud) {
                    if (pt.x === null || pt.y === null) continue;
                    const screenX = (pt.x * plotScaleX) + p.width / 2;
                    const screenY = p.height * 0.95 - (pt.y * plotScaleY);
                    const d = p.dist(p.mouseX, p.mouseY, screenX, screenY);
                    if (d < radius) {
                        hoveredPoints.push({ point: pt, screenX: screenX, screenY: screenY });
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

            p.drawSnrLegendToBuffer = function (minV, maxV) { const b = snrLegendBuffer; b.clear(); b.push(); const lx = 10, ly = 20, lw = 15, lh = 400; for (let i = 0; i < lh; i++) { const amt = b.map(i, 0, lh, 1, 0); let c; if (amt < 0.25) c = b.lerpColor(snrColors.c1, snrColors.c2, amt / 0.25); else if (amt < 0.5) c = b.lerpColor(snrColors.c2, snrColors.c3, (amt - 0.25) / 0.25); else if (amt < 0.75) c = b.lerpColor(snrColors.c3, snrColors.c4, (amt - 0.5) / 0.25); else c = b.lerpColor(snrColors.c4, snrColors.c5, (amt - 0.75) / 0.25); b.stroke(c); b.line(lx, ly + i, lx + lw, ly + i); } b.fill(0); b.noStroke(); b.textSize(10); b.textAlign(b.LEFT, b.CENTER); b.text(maxV.toFixed(1), lx + lw + 5, ly); b.text(minV.toFixed(1), lx + lw + 5, ly + lh); b.text("SNR", lx, ly - 10); b.pop(); };
            p.windowResized = function () {
                p.resizeCanvas(canvasContainer.offsetWidth, canvasContainer.offsetHeight);
                // Instead of resizing the buffer, we re-create it
                staticBackgroundBuffer = p.createGraphics(p.width, p.height);
                // And we must re-draw the static content to the new buffer
                calculatePlotScales();
                drawStaticRegionsToBuffer();
                if (appState.vizData) p.redraw();
            };
        };