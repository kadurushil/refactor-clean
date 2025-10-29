Context Document: Radar and Video Synchronizer Application

### 1. High-Level Overview

**Core Purpose**: A high-precision, browser-based tool for visualizing and synchronizing radar sensor data (JSON) with a corresponding video file. It allows for detailed analysis of object tracks, point clouds, and vehicle dynamics.

**Core Technologies**:
- **Frontend**: HTML5, Tailwind CSS
- **Logic**: Modular JavaScript (ES6 Modules)
- **Visualization**: `p5.js` for the main radar plot, a zoomed-in "god mode" view, and a time-series speed graph.
- **Data Handling**:
  - **Web Workers** (`parser.worker.js`) with the `Clarinet.js` streaming library to parse large JSON files off the main thread, preventing UI freezes.
  - `Oboe.js` is also loaded but the primary implementation uses the worker.
- **Data Exploration**: `AG-Grid` for tabular data view and `Chart.js` for plotting data from the grid.
- **Persistence**: `IndexedDB` for caching large files (JSON, Video) and `localStorage` for user settings (UI state, theme, file references).

### 2. Project Architecture & File Structure

The application uses a modular ES6 structure. All source code resides in the `/src` directory.

- **`index.html`**: The main HTML shell. Defines the DOM structure, including the main layout, collapsible sidebar, data explorer panel, and modal dialogs. It loads all necessary CDN libraries and the main JS module.

- **`/src/main.js`**: **The Orchestrator**. This is the application's entry point. It initializes all modules, wires up all event listeners (clicks, drag-drop, keydown), and manages the file loading pipeline and application lifecycle.

- **`/src/state.js`**: **The Single Source of Truth**. Exports a single global `appState` object that holds all dynamic data (e.g., `vizData`, `isPlaying`, `currentFrame`). All modules import from this file.

- **`/src/dom.js`**: **The UI Abstraction Layer**. Exports constants for every key DOM element and contains functions that directly manipulate the DOM, such as `updateFrame()`, `resetUIForNewLoad()`, and `updatePersistentOverlays()`.

- **`/src/sync.js`**: **The Heartbeat/Clock**. Contains the `animationLoop()` function. It uses `performance.now()` to create a high-precision clock, calculates the current media time, finds the corresponding radar frame, and handles resynchronization with the video element.

- **`/src/fileParsers.js`**: **The Data Processor**. Contains `parseVisualizationJson()`, which takes the raw parsed JSON object and enriches it with calculated `timestampMs` values relative to the video start time and determines global SNR ranges.

- **`/src/parser.worker.js`**: **The Heavy Lifter**. A Web Worker that uses `Clarinet.js` to stream-parse the JSON file, preventing the main thread from freezing. It posts progress updates and the final parsed object back to `main.js`.

- **`/src/db.js`**: **The Caching Layer**. Manages all interactions with `IndexedDB` to save and load file blobs and their metadata, enabling fast session reloads.

- **`/src/dataExplorer.js`**: **The Inspector**. Manages the "Data Explorer" panel. It uses AG-Grid to display data in a table and Chart.js to plot selected columns.

- **`/src/p5/radarSketch.js`**: The p5.js sketch for the main radar visualization (point cloud, tracks, axes, ego vehicle).

- **`/src/p5/speedGraphSketch.js`**: The p5.js sketch for the time-series speed graph.

- **`/src/p5/zoomSketch.js`**: The p5.js sketch for the "GOD MODE" magnified view that follows the mouse.

- **`/src/drawUtils.js`**: **The Artist's Toolkit**. Contains pure drawing functions called by the p5 sketches (e.g., `drawPointCloud`, `drawTrajectories`). This is where the visual appearance of radar objects is defined.

- **`/src/utils.js`**: A collection of pure, reusable helper functions (e.g., `findRadarFrameIndexForTime` (binary search), timestamp parsers, `throttle`).

- **`/src/modal.js`**: Manages the logic for pop-up modal dialogs, including notifications, confirmations, and loading progress bars.

- **`/src/theme.js`**: Handles the dark/light mode theme switching.

- **`/src/constants.js`**: Stores shared, static values like `VIDEO_FPS` and radar plot boundaries.

### 3. Data Flow & State Management

**File Loading Pipeline (`main.js`):**
1.  **User Action**: User drops files or uses "Load" buttons. The `handleFiles()` function is triggered.
2.  **UI Reset**: `resetUIForNewLoad()` is called to clear the previous state.
3.  **Pipeline Start**: `processFilePipeline()` begins. A loading modal is shown.
4.  **JSON Parsing**: If a JSON file exists, it's sent to `parser.worker.js`. The worker streams the file, posts progress updates, and finally returns the complete parsed object.
5.  **JSON Processing**: The parsed object is processed by `parseVisualizationJson()` to calculate relative timestamps and SNR ranges. The result is stored in `appState.vizData`.
6.  **Video Loading (Two-Stage)**:
    - **Stage A (Metadata)**: An event listener waits for `loadedmetadata`. When this fires, the video's `duration` is known. The `finalizeSetup()` function is called, which creates the p5 sketches and sets up the speed graph.
    - **Stage B (Buffering)**: A separate listener waits for `canplaythrough`. When this fires, it signals that the video is ready for smooth playback, and the loading modal is hidden.
7.  **Finalization**: `finalizeSetup()` creates the p5 instances and `resetVisualization()` is called to display the first frame.

**State Management (`appState`):**
The `appState` object in `state.js` is the central hub. Key properties include:
- `vizData`: The large object containing all radar frames and track data.
- `isPlaying`: A boolean that controls the `animationLoop`.
- `currentFrame`: The integer index of the currently displayed radar frame.
- `videoStartDate`, `radarStartTimeMs`: Date objects used to calculate the time offset.
- `p5_instance`, `speedGraphInstance`, `zoomSketchInstance`: References to the active p5.js sketches.

### 4. Key Logic and Interaction Flows

**Playback Synchronization (`sync.js`)**: The `animationLoop` is the core. It uses `performance.now()` to create a high-resolution timer independent of the video's `timeupdate` event. It calculates what the video's `currentTime` *should* be, finds the corresponding radar frame using a binary search (`findRadarFrameIndexForTime` in `utils.js`), and periodically corrects the video's `currentTime` if it drifts.

**UI Updates (`dom.js`)**: The `updateFrame(frame, forceVideoSeek)` function is the primary entry point for changing what's on screen. It updates the frame counter, seeks the video if `forceVideoSeek` is true, and calls the `.redraw()` methods on the p5 sketches. It's called by both the `animationLoop` (for smooth playback) and by UI event listeners like the timeline slider (for seeking).

**Session Persistence (`main.js` & `db.js`)**: On `DOMContentLoaded`, the app checks `localStorage` for saved filenames. It then calls `loadFreshFileFromDB()` to attempt to load the corresponding blobs from `IndexedDB`. If successful, `handleFiles()` is called with the cached blobs, bypassing the need for user file selection.

**Keyboard Shortcuts (`main.js`)**: A single `keydown` event listener on the document handles all shortcuts. It programmatically triggers `.click()` events on the corresponding DOM elements (e.g., Spacebar clicks `playPauseBtn`). It includes a check to prevent shortcuts from firing when the user is typing in an input field.