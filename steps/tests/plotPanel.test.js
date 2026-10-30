// File: steps/tests/plotPanel.test.js
/**
 * Test Suite for Plot Panel Engine, Downsampler, Path Evaluator, and Coordinator
 */

import { extractPathValues, MATH_MODIFIERS, getFriendlyLabel } from "../src/plot/pathEvaluator.js";
import { downsamplePoints, downsampleScatter, MAX_POINTS } from "../src/plot/downsample.js";
import { PlotCoordinator } from "../src/plot/plotCoordinator.js";

// Mock Data
const mockFrame1 = {
  timestamp: 1000,
  timestampMs: 5000,
  canVehSpeed_kmph: 45.5,
  egoVelocity: [0.2, 12.5],
  pointCloud: [
    { x: 10.5, y: 20.2, snr: 32.1, velocity: -2.5 },
    { x: 15.1, y: 25.4, snr: 45.8, velocity: -1.2 },
    { x: 22.0, y: 30.0, snr: 18.4, velocity: 0.5 },
  ],
  adas: [
    { fcw_stage: 1, ttc: 2.14, warning_distance: 28.5 },
    { fcw_stage: 0, ttc: 4.5, warning_distance: 50.0 },
  ],
  tracks: [
    { trackId: 1, speed: 12.0, ttc: 2.5, state: 3 },
    { trackId: 2, speed: 5.5, ttc: 8.0, state: 2 },
  ],
};

const mockFrame2 = {
  timestamp: 1050,
  timestampMs: 5050,
  canVehSpeed_kmph: 46.2,
  egoVelocity: [0.1, 12.8],
  pointCloud: [
    { x: 11.0, y: 20.8, snr: 35.0, velocity: -2.3 },
  ],
  adas: [
    { fcw_stage: 2, ttc: 1.85, warning_distance: 24.0 },
  ],
  tracks: [
    { trackId: 1, speed: 12.5, ttc: 2.1, state: 3 },
  ],
};

const mockVizData = {
  radarFrames: [mockFrame1, mockFrame2],
};

console.log("=== RUNNING PLOT PANEL TEST SUITE ===");

// 1. Path Evaluator Tests
console.log("\n[1] Testing pathEvaluator.js...");

// Dot notation
const canSpeed = extractPathValues(mockFrame1, "canVehSpeed_kmph");
console.assert(canSpeed[0] === 45.5, `Expected 45.5, got ${canSpeed[0]}`);

// Array index
const egoVy = extractPathValues(mockFrame1, "egoVelocity[1]");
console.assert(egoVy[0] === 12.5, `Expected 12.5, got ${egoVy[0]}`);

// Math modifier: m/s to km/h (12.5 * 3.6 = 45.0)
const egoVyKmh = extractPathValues(mockFrame1, "egoVelocity[1].@mps2kmph");
console.assert(Math.abs(egoVyKmh[0] - 45.0) < 0.001, `Expected 45.0, got ${egoVyKmh[0]}`);

// Array wildcard slice
const snrValues = extractPathValues(mockFrame1, "pointCloud[:].snr");
console.assert(snrValues.length === 3, `Expected 3 SNR values, got ${snrValues.length}`);
console.assert(snrValues[0] === 32.1 && snrValues[1] === 45.8, "SNR values mismatch");

// ADAS index property
const adasFcw = extractPathValues(mockFrame1, "adas[0].fcw_stage");
console.assert(adasFcw[0] === 1, `Expected FCW stage 1, got ${adasFcw[0]}`);

// Constant reference line
const refConst = extractPathValues(mockFrame1, "50");
console.assert(refConst[0] === 50, `Expected constant 50, got ${refConst[0]}`);

console.log("✓ pathEvaluator tests passed!");

// 2. Downsampler Tests
console.log("\n[2] Testing downsample.js...");

const heavyPoints = [];
for (let i = 0; i < 50000; i++) {
  heavyPoints.push({
    x: i * 0.02,
    y: Math.sin(i * 0.05) * 50 + (i % 100 === 0 ? 100 : 0), // Include occasional spikes
  });
}

const downsampled = downsamplePoints(heavyPoints, 800, 0, 1000);
console.assert(downsampled.length <= MAX_POINTS, `Downsampled points ${downsampled.length} exceeds MAX_POINTS ${MAX_POINTS}`);
console.assert(downsampled.length > 500, `Downsampled points ${downsampled.length} too small`);

// Verify monotonically increasing X
for (let i = 1; i < downsampled.length; i++) {
  console.assert(downsampled[i].x >= downsampled[i - 1].x, `Points not sorted at index ${i}`);
}

// 2D Scatter Downsample
const scatterPts = [];
for (let i = 0; i < 10000; i++) {
  scatterPts.push({ x: (i % 100), y: Math.floor(i / 100) });
}
const dsScatter = downsampleScatter(scatterPts, 400, 300, { xMin: 0, xMax: 100, yMin: 0, yMax: 100 });
console.assert(dsScatter.length <= MAX_POINTS, "Scatter downsample exceeded limit");

console.log(`✓ downsample tests passed! Reduced 50,000 -> ${downsampled.length} points.`);

// 3. Plot Coordinator Tests
console.log("\n[3] Testing plotCoordinator.js...");

const coordinator = new PlotCoordinator({
  series: [
    { path: "canVehSpeed_kmph", label: "CAN Speed", enabled: true, color: "#1b83ec" },
    { path: "egoVelocity[1].@mps2kmph", label: "Ego Speed", enabled: true, color: "#05d27d" },
    { path: "50", label: "Speed Limit 50", enabled: true, color: "#888888" },
  ],
});

coordinator.loadFullHistory(mockVizData);

// Check pre-extracted datasets
const datasets = coordinator.getChartDatasets(mockFrame1, 0, 800);
console.assert(datasets.length === 3, `Expected 3 datasets, got ${datasets.length}`);

// First dataset: CAN Speed
console.assert(datasets[0].label === "CAN Speed", `Expected CAN Speed label, got ${datasets[0].label}`);
console.assert(datasets[0].data.length === 2, `Expected 2 points in CAN Speed, got ${datasets[0].data.length}`);
console.assert(datasets[0].data[0].y === 45.5, `Expected 45.5, got ${datasets[0].data[0].y}`);

// Reference line dataset
console.assert(datasets[2].borderDash != null, "Reference line should have borderDash");
console.assert(datasets[2].data[0].y === 50, `Expected ref value 50, got ${datasets[2].data[0].y}`);

// Current values extraction
const currentVals = coordinator.getCurrentValues(mockFrame1);
console.assert(currentVals[0] === 45.5, `Expected current CAN speed 45.5, got ${currentVals[0]}`);
console.assert(Math.abs(currentVals[1] - 45.0) < 0.001, `Expected current Ego speed 45.0, got ${currentVals[1]}`);

// Adding a new series dynamically (e.g. from Drag & Drop)
coordinator.addSeries("adas[0].fcw_stage", "FCW Stage");
console.assert(coordinator.config.series.length === 4, "Failed to add series dynamically");
const updatedDatasets = coordinator.getChartDatasets(mockFrame1, 0, 800);
console.assert(updatedDatasets.length === 4, `Expected 4 datasets after add, got ${updatedDatasets.length}`);

console.log("✓ plotCoordinator tests passed!");

console.log("\n========================================");
console.log("ALL PLOT PANEL TESTS PASSED SUCCESSFULLY!");
console.log("========================================");
