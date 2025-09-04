// tests/fileParsers.test.js

import { parseVisualizationJson } from '../src/fileParsers.js';

const resultsEl = document.getElementById('results');

// A simple function to run an async test and report the result
async function testAsync(description, testFunction) {
    try {
        await testFunction();
        console.log(`✅ PASS: ${description}`);
        resultsEl.innerHTML += `<p class="pass"><b>PASS:</b> ${description}</p>`;
    } catch (error) {
        console.error(`❌ FAIL: ${description}`, error);
        resultsEl.innerHTML += `<p class="fail"><b>FAIL:</b> ${description}<br><pre>${error}</pre></p>`;
    }
}


// --- Test Cases for parseVisualizationJson ---

const mockRawData = {
    radarFrames: [
        { timestamp: 50, pointCloud: [{ snr: 10 }, { snr: 15 }] },
        { timestamp: 100, pointCloud: [{ snr: 5 }, { snr: 20 }] }
    ]
};

const radarStartTimeMs = 1725440400000; // Sept 4, 2025 12:30:00 PM GMT
const videoStartDate = new Date(radarStartTimeMs - 1000); // Video starts 1 second earlier

testAsync("fileParsers.js: should correctly calculate timestampMs for each frame", async () => {
    const result = await parseVisualizationJson(mockRawData, radarStartTimeMs, videoStartDate);
    const expectedTimestamp1 = radarStartTimeMs + 50 - videoStartDate.getTime(); // 1000 + 50 = 1050
    const expectedTimestamp2 = radarStartTimeMs + 100 - videoStartDate.getTime(); // 1000 + 100 = 1100

    if (result.data.radarFrames[0].timestampMs !== expectedTimestamp1) {
        throw new Error(`Expected first frame timestamp to be ${expectedTimestamp1} but got ${result.data.radarFrames[0].timestampMs}`);
    }
    if (result.data.radarFrames[1].timestampMs !== expectedTimestamp2) {
        throw new Error(`Expected second frame timestamp to be ${expectedTimestamp2} but got ${result.data.radarFrames[1].timestampMs}`);
    }
});

testAsync("fileParsers.js: should correctly calculate global min and max SNR", async () => {
    const result = await parseVisualizationJson(mockRawData, radarStartTimeMs, videoStartDate);
    
    if (result.minSnr !== 5) {
        throw new Error(`Expected minSnr to be 5 but got ${result.minSnr}`);
    }
    if (result.maxSnr !== 20) {
        throw new Error(`Expected maxSnr to be 20 but got ${result.maxSnr}`);
    }
});

testAsync("fileParsers.js: should return an error if radarFrames are missing", async () => {
    const badData = { tracks: [] }; // Missing radarFrames
    const result = await parseVisualizationJson(badData, radarStartTimeMs, videoStartDate);

    if (!result.error) {
        throw new Error("Expected an error for missing radarFrames, but none was returned.");
    }
});