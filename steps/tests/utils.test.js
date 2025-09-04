// tests/utils.test.js

import {
    extractTimestampInfo,
    parseTimestamp,
    findRadarFrameIndexForTime
} from '../src/utils.js';

const resultsEl = document.getElementById('results');

// A simple function to run a test and report the result
function test(description, testFunction) {
    try {
        testFunction();
        console.log(`✅ PASS: ${description}`);
        resultsEl.innerHTML += `<p class="pass"><b>PASS:</b> ${description}</p>`;
    } catch (error) {
        console.error(`❌ FAIL: ${description}`, error);
        resultsEl.innerHTML += `<p class="fail"><b>FAIL:</b> ${description}<br><pre>${error}</pre></p>`;
    }
}

// --- Test Cases for Timestamp Functions ---

test("utils.js: should extract timestamp info from a new JSON filename format", () => {
    const info = extractTimestampInfo('fHist_04092025_123000.123.json');
    if (!info || info.format !== 'json' || info.timestampStr !== '04092025_123000.123') {
        throw new Error(`Expected 'json' format and correct timestamp, but got ${JSON.stringify(info)}`);
    }
});

test("utils.js: should extract timestamp info from a video filename", () => {
    const info = extractTimestampInfo('WIN_20250904_12_30_00_Pro.mp4');
    if (!info || info.format !== 'video' || info.timestampStr !== '20250904_123000') {
        throw new Error(`Expected 'video' format and correct timestamp, but got ${JSON.stringify(info)}`);
    }
});

test("utils.js: should correctly parse a video timestamp string into a Date object", () => {
    const timestampStr = '20250904_123000'; // 4th Sept 2025, 12:30:00
    const date = parseTimestamp(timestampStr, 'video');
    const expectedDate = new Date(Date.UTC(2025, 8, 4, 12, 30, 0)); // Month is 0-indexed (8 = September)
    
    if (date.getTime() !== expectedDate.getTime()) {
        throw new Error(`Date mismatch. Expected ${expectedDate.toISOString()} but got ${date.toISOString()}`);
    }
});


// --- Test Cases for findRadarFrameIndexForTime ---

const mockVizData = {
    radarFrames: [
        { timestampMs: 100 }, // index 0
        { timestampMs: 200 }, // index 1
        { timestampMs: 300 }, // index 2
        { timestampMs: 400 }, // index 3
    ]
};

test("utils.js: should find the correct frame for a time that is between two frames", () => {
    const index = findRadarFrameIndexForTime(250, mockVizData); // Should find the frame at 200ms
    if (index !== 1) {
        throw new Error(`Expected index 1 but got ${index}`);
    }
});

test("utils.js: should find the correct frame for a time that exactly matches a frame", () => {
    const index = findRadarFrameIndexForTime(300, mockVizData);
    if (index !== 2) {
        throw new Error(`Expected index 2 but got ${index}`);
    }
});

test("utils.js: should return the last frame for a time after the end of the data", () => {
    const index = findRadarFrameIndexForTime(500, mockVizData);
    if (index !== 3) {
        throw new Error(`Expected index 3 but got ${index}`);
    }
});

test("utils.js: should return the first frame for a time before the start of the data", () => {
    const index = findRadarFrameIndexForTime(50, mockVizData);
    if (index !== 0) {
        throw new Error(`Expected index 0 but got ${index}`);
    }
});

test("utils.js: should return -1 if radarFrames array is empty", () => {
    const index = findRadarFrameIndexForTime(100, { radarFrames: [] });
    if (index !== -1) {
        throw new Error(`Expected index -1 for empty data but got ${index}`);
    }
});