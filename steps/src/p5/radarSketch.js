import {
    appState
} from '../state.js';
import {
    RADAR_X_MAX,
    RADAR_X_MIN,
    RADAR_Y_MAX,
    RADAR_Y_MIN
} from '../constants.js';
import {
    canvasContainer,
    toggleSnrColor,
    toggleTracks
} from '../dom.js';
import {
    drawStaticRegionsToBuffer,
    drawAxes,
    drawPointCloud,
    drawTrajectories,
    drawTrackMarkers,
    snrColors,
    handleCloseUpDisplay // BUG FIX 1: Import the close-up handler
} from '../drawUtils.js';

export const radarSketch = function(p) {
    let plotScales = {
        plotScaleX: 1,
        plotScaleY: 1
    };
    let staticBackgroundBuffer, snrLegendBuffer;

    function calculatePlotScales() {
        const hPad = 0.05,
            vPad = 0.05,
            bOff = 0.05;
        const aW = p.width * (1 - 2 * hPad);
        const aH = p.height * (1 - bOff - vPad);
        plotScales.plotScaleX = aW / (RADAR_X_MAX - RADAR_X_MIN);
        plotScales.plotScaleY = aH / (RADAR_Y_MAX - RADAR_Y_MIN);
    }

    p.setup = function() {
        let canvas = p.createCanvas(canvasContainer.offsetWidth, canvasContainer.offsetHeight);
        canvas.parent('canvas-container');
        staticBackgroundBuffer = p.createGraphics(p.width, p.height);
        snrLegendBuffer = p.createGraphics(100, 450);

        calculatePlotScales();
        p.drawSnrLegendToBuffer(appState.globalMinSnr, appState.globalMaxSnr);
        drawStaticRegionsToBuffer(p, staticBackgroundBuffer, plotScales);
        p.noLoop();
    };

    p.draw = function() {
        p.background(document.documentElement.classList.contains('dark') ? p.color(55, 65, 81) : 255);
        if (!appState.vizData) return;

        p.image(staticBackgroundBuffer, 0, 0);

        p.push();
        p.translate(p.width / 2, p.height * 0.95);
        p.scale(1, -1);

        calculatePlotScales();
        drawAxes(p, plotScales);

        const frameData = appState.vizData.radarFrames[appState.currentFrame];
        if (frameData) {
            if (toggleTracks.checked) {
                drawTrajectories(p, plotScales);
                drawTrackMarkers(p, plotScales);
            }
            drawPointCloud(p, frameData.pointCloud, plotScales);
        }
        p.pop();

        // BUG FIX 1: Call the close-up handler if the mode is active
        if (appState.isCloseUpMode) {
            handleCloseUpDisplay(p, plotScales);
        }

        if (toggleSnrColor.checked) {
            p.image(snrLegendBuffer, 10, p.height - snrLegendBuffer.height - 10);
        }
    };

    p.drawSnrLegendToBuffer = function(minV, maxV) {
        const b = snrLegendBuffer;
        const localSnrColors = snrColors(p);
        b.clear();
        b.push();
        const lx = 10,
            ly = 20,
            lw = 15,
            lh = 400;
        for (let i = 0; i < lh; i++) {
            const amt = b.map(i, 0, lh, 1, 0);
            let c;
            if (amt < 0.25) c = b.lerpColor(localSnrColors.c1, localSnrColors.c2, amt / 0.25);
            else if (amt < 0.5) c = b.lerpColor(localSnrColors.c2, localSnrColors.c3, (amt - 0.25) / 0.25);
            else if (amt < 0.75) c = b.lerpColor(localSnrColors.c3, localSnrColors.c4, (amt - 0.5) / 0.25);
            else c = b.lerpColor(localSnrColors.c4, localSnrColors.c5, (amt - 0.75) / 0.25);
            b.stroke(c);
            b.line(lx, ly + i, lx + lw, ly + i);
        }
        b.fill(document.documentElement.classList.contains('dark') ? 255 : 0);
        b.noStroke();
        b.textSize(10);
        b.textAlign(b.LEFT, b.CENTER);
        b.text(maxV.toFixed(1), lx + lw + 5, ly);
        b.text(minV.toFixed(1), lx + lw + 5, ly + lh);
        b.text("SNR", lx, ly - 10);
        b.pop();
    };


    p.windowResized = function() {
        p.resizeCanvas(canvasContainer.offsetWidth, canvasContainer.offsetHeight);
        // BUG FIX 2: Re-create the buffer instead of resizing it
        staticBackgroundBuffer = p.createGraphics(p.width, p.height);
        calculatePlotScales();
        // Re-draw the static content to the new buffer
        drawStaticRegionsToBuffer(p, staticBackgroundBuffer, plotScales);
        if (appState.vizData) p.redraw();
    };
};
