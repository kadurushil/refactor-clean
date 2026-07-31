// tests/trackerLogParser.test.js

import { parseTrackerLog, findBestTrackerLogMatch } from '../src/trackerLogParser.js';

const resultsEl = document.getElementById('results') || { innerHTML: '' };

function test(description, testFunction) {
    try {
        testFunction();
        console.log(`✅ PASS: ${description}`);
        if (resultsEl.innerHTML !== undefined) {
            resultsEl.innerHTML += `<p class="pass"><b>PASS:</b> ${description}</p>`;
        }
    } catch (error) {
        console.error(`❌ FAIL: ${description}`, error);
        if (resultsEl.innerHTML !== undefined) {
            resultsEl.innerHTML += `<p class="fail"><b>FAIL:</b> ${description}<br><pre>${error.stack || error}</pre></p>`;
        }
    }
}

const sampleLog = `
[INFO] --- Using the following parameters: ---
[INFO] DBSCAN: Epsilon Position = 3.0, Epsilon Velocity = 1.0, MinPts = 3
[INFO] Tracking: Assignment Threshold = 4, Max Misses = 5
[INFO] ------------------------------------
[INFO]   [Barrier] LEFT innovation (2.21m) rejected: Exceeds gate (1.5m).

--- MASTER FRAME 1: DIAGNOSTICS ---
[INFO]   [TRACKER_CORE] Processing Frame: 1, Delta_t: 0.0500s
[INFO]   Radar Points: 39
[INFO]   [TRACKER_CORE] EgoVx (Longi): 10.81 m/s, EgoVy (Lat): 0.15 m/s, Accel: 0.63 m/s^2
[INFO]   RANSAC: Inliers=37, Outliers=2 (Ratio: 0.95)
[INFO]   DBSCAN: Found 1 clusters (raw).
[INFO]   Tracking: 1 clusters eligible for tracking.

--- MASTER FRAME 1: TRACK MANAGEMENT ---
[INFO]   Lifecycle: 0 confirmed, 1 tentative, 0 lost tracks.

[MASTER] -> Calling ASSIGN for new tracks...
[INFO] [ASSIGN] Start Frame 1: Initializing new tracks.
[INFO] [ASSIGN] Found 1 unassigned detections to consider.
[INFO]   [ASSIGN-REJECT] Detection 0 at (-3.04, 9.96) rejected. Reason: Low Mass Stat (2 < 5)
[INFO] [ASSIGN] End Frame 1: nextTrackID is now 1.

[MASTER] End: Final confirmed tracks: 0.
[INFO] --- END MASTER FRAME 1 ---
`;

test("trackerLogParser: should handle empty/invalid input gracefully", () => {
    const result = parseTrackerLog(null);
    if (!result || result.frames.size !== 0) {
        throw new Error("Expected empty frames map for null input");
    }
});

test("trackerLogParser: should parse parameter headers", () => {
    const result = parseTrackerLog(sampleLog);
    if (result.parameters.length === 0) {
        throw new Error("Expected parameters to be parsed");
    }
});

test("trackerLogParser: should parse frame 1 diagnostics correctly", () => {
    const result = parseTrackerLog(sampleLog);
    const f1 = result.frames.get(1);
    if (!f1) throw new Error("Frame 1 not found in parsed output");

    const diag = f1.diagnostics;
    if (diag.deltaT !== 0.05) throw new Error(`Expected deltaT 0.05, got ${diag.deltaT}`);
    if (diag.radarPoints !== 39) throw new Error(`Expected 39 points, got ${diag.radarPoints}`);
    if (diag.egoVx !== 10.81 || diag.egoVy !== 0.15 || diag.accel !== 0.63) {
        throw new Error(`Ego motion mismatch: Vx=${diag.egoVx}, Vy=${diag.egoVy}, Accel=${diag.accel}`);
    }
    if (diag.ransacInliers !== 37 || diag.ransacOutliers !== 2 || diag.ransacRatio !== 0.95) {
        throw new Error(`RANSAC mismatch: inliers=${diag.ransacInliers}, ratio=${diag.ransacRatio}`);
    }
    if (diag.dbscanClusters !== 1 || diag.trackingClusters !== 1) {
        throw new Error(`Cluster count mismatch`);
    }
});

test("trackerLogParser: should parse frame 1 track management correctly", () => {
    const result = parseTrackerLog(sampleLog);
    const f1 = result.frames.get(1);
    if (!f1) throw new Error("Frame 1 not found");

    const tm = f1.trackManagement;
    if (tm.lifecycle.confirmed !== 0 || tm.lifecycle.tentative !== 1 || tm.lifecycle.lost !== 0) {
        throw new Error(`Lifecycle mismatch: ${JSON.stringify(tm.lifecycle)}`);
    }
    if (tm.finalConfirmed !== 0) {
        throw new Error(`Expected finalConfirmed 0, got ${tm.finalConfirmed}`);
    }

    const assignSteps = tm.steps.filter(s => s.category === 'ASSIGN');
    if (assignSteps.length === 0) {
        throw new Error("Expected ASSIGN step entries");
    }
});

test("findBestTrackerLogMatch: should prioritize simulations/console_out/tracking.log over root small logs", () => {
    const files = [
        { name: "can_logger_console.log", relativePath: "root/console_out/can_logger_console.log", size: 45000 },
        { name: "tracking.log", relativePath: "root/console_out/tracking.log", size: 583 },
        { name: "tracking.log", relativePath: "root/simulations/console_out/tracking.log", size: 21000000 },
    ];
    const jFile = { name: "track_history_playback.json", relativePath: "root/simulations/track_history_playback.json" };
    const match = findBestTrackerLogMatch(jFile, files);
    if (!match || match.size !== 21000000) {
        throw new Error(`Expected 21MB simulations tracking.log, got ${JSON.stringify(match)}`);
    }
});
