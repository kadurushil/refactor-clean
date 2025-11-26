import { handleFiles } from "../src/fileLoader.js";
import { appState } from "../src/state.js";
import { initDB } from "../src/db.js";

const resultsEl = document.getElementById('results');

function test(description, testFunction) {
    // Simple async test runner wrapper
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

// --- Setup & Mocks ---

// Initialize DB for tests
async function setupTestEnvironment() {
    return new Promise((resolve) => {
        initDB(() => {
            console.log("Test DB initialized");
            resolve();
        });
    });
}

// Mock URL.createObjectURL
URL.createObjectURL = (blob) => {
    return "blob:mock-url-" + Math.random();
};
URL.revokeObjectURL = () => {};

// Mock Worker
class MockWorker {
    constructor(scriptUrl) {
        console.log("MockWorker created for:", scriptUrl);
        this.onmessage = null;
    }
    postMessage(msg) {
        console.log("MockWorker received message:", msg);
        // Simulate success response
        if (this.onmessage) {
            // Simulate parsing delay
            setTimeout(() => {
                 this.onmessage({
                    data: {
                        type: 'complete',
                        data: {
                            // Correct mock parsed data structure
                            radarFrames: [
                                {
                                    timestamp: 1000,
                                    pointCloud: [],
                                    tracks: []
                                }
                            ],
                            tracks: []
                        }
                    }
                });
            }, 50);
        }
    }
    terminate() {}
}
window.Worker = MockWorker;

// Mock p5
window.p5 = class MockP5 {
    constructor(sketch, node) {
        console.log("MockP5 created");
        sketch(this);
    }
    createCanvas() { return { parent: () => {} }; }
    background() {}
    fill() {}
    stroke() {}
    rect() {}
    ellipse() {}
    push() {}
    pop() {}
    translate() {}
    scale() {}
    frameRate() {}
    noLoop() {}
    loop() {}
    redraw() {}
    resizeCanvas() {}
    select() { return { html: () => {}, position: () => {}, style: () => {} }; }
    createGraphics() { return { background: () => {}, clear: () => {}, image: () => {} }; }
    image() {}
    text() {}
    textSize() {}
    textAlign() {}
    noStroke() {}
    color() { return {}; }
    textFont() {}
    drawSnrLegendToBuffer() {}
};

// --- Tests ---

(async function runTests() {
    await setupTestEnvironment();

    test("fileLoader.js: handleFiles should parse JSON and update appState", async () => {
        // 1. Setup
        appState.vizData = null;
        const mockJsonFile = new File(['{"some": "json"}'], "test_data.json", { type: "application/json" });
        
        // 2. Execution
        handleFiles([mockJsonFile]);

        // 3. Verification (Wait for async operations)
        // We need to wait long enough for DB save + Worker + Processing
        await new Promise(resolve => setTimeout(resolve, 500)); 

        if (!appState.vizData) {
            throw new Error("appState.vizData was not populated after loading JSON.");
        }

        if (appState.jsonFilename !== "test_data.json") {
            throw new Error(`Expected jsonFilename to be 'test_data.json', got '${appState.jsonFilename}'`);
        }
    });

    test("fileLoader.js: handleFiles should handle video loading (simulated)", async () => {
        // 1. Setup
        appState.vizData = null;
        appState.videoFilename = "";
        
        const videoPlayer = document.getElementById('video-player');
        
        // Use MutationObserver to watch for src changes
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === "attributes" && mutation.attributeName === "src") {
                    console.log("Video src changed, triggering events...");
                    // Trigger events asynchronously to simulate browser behavior
                    setTimeout(() => {
                        videoPlayer.dispatchEvent(new Event('loadedmetadata'));
                        videoPlayer.dispatchEvent(new Event('canplaythrough'));
                    }, 50);
                }
            });
        });
        
        observer.observe(videoPlayer, { attributes: true });

        const mockVideoFile = new File(['fake video content'], "test_video.mp4", { type: "video/mp4" });

        // 2. Execute
        handleFiles([mockVideoFile]);

        // 3. Verify
        await new Promise(resolve => setTimeout(resolve, 500)); // Wait for events

        observer.disconnect(); // Cleanup

        if (appState.videoFilename !== "test_video.mp4") {
            throw new Error(`Expected videoFilename to be 'test_video.mp4', got '${appState.videoFilename}'`);
        }
    });

})();

