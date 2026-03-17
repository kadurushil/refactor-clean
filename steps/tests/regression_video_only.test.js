import { handleFiles } from "../src/fileLoader.js";
import { appState } from "../src/state.js";
import { initDB } from "../src/db.js";

const resultsEl = document.getElementById('results');

function test(description, testFunction) {
    (async () => {
        try {
            await testFunction();
            console.log(`✅ PASS: ${description}`);
            resultsEl.innerHTML += `<p class="pass"><b>PASS:</b> ${description}</p>`;
        } catch (error) {
            console.error(`❌ FAIL: ${description}`, error);
            resultsEl.innerHTML += `<p class="fail"><b>FAIL:</b> ${description}<br><pre>${error.stack || error}</pre></p>`;
        }
    })();
}

// Mocking dependencies for regression test
async function setupMocks() {
    return new Promise((resolve) => {
        initDB(() => {
            console.log("Test DB initialized");
            resolve();
        });
    });
}

URL.createObjectURL = () => "blob:mock-video-url";
URL.revokeObjectURL = () => {};

window.p5 = class MockP5 {
    constructor(sketch) { sketch(this); }
    createCanvas() { return { parent: () => {} }; }
    noLoop() {}
    redraw() {}
};

test("Regression: handleFiles should not crash when loading only a video", async () => {
    // 1. Setup - clear vizData
    appState.vizData = null;
    appState.videoFilename = "";
    
    const videoPlayer = document.getElementById('video-player');
    const mockVideoFile = new File(['fake video'], "test.mp4", { type: "video/mp4" });

    // Mock video events
    const triggerEvents = () => {
        setTimeout(() => {
            videoPlayer.dispatchEvent(new Event('loadedmetadata'));
            videoPlayer.dispatchEvent(new Event('canplaythrough'));
        }, 10);
    };

    const observer = new MutationObserver(triggerEvents);
    observer.observe(videoPlayer, { attributes: true, attributeFilter: ['src'] });

    // 2. Execution
    try {
        await handleFiles([mockVideoFile]);
    } catch (e) {
        throw new Error(`Crash detected during video-only load: ${e.message}`);
    }

    // 3. Verification
    await new Promise(resolve => setTimeout(resolve, 100));
    observer.disconnect();

    if (appState.videoFilename !== "test.mp4") {
        throw new Error("Video filename not set correctly in appState");
    }
});
