Context Document: Radar and Video Synchronizer Application

### 1. High-Level Overview

**Core Purpose**: A high-precision, browser-based tool for visualizing and synchronizing radar sensor data (JSON) with a corresponding video file. It allows for detailed analysis of object tracks, point clouds, and vehicle dynamics.

**Core Technologies**:
- **Frontend**: HTML5, Tailwind CSS
- **Logic**: Modular JavaScript (ES6 Modules)
- **Visualization**: `p5.js` for the main radar plot, a zoomed-in "god mode" view, and a time-series speed graph.
- **Data Handling**:
  - **Web Workers** (`parser.worker.js`) with the `Clarinet.js` streaming library to parse large JSON files off the main thread, preventing UI freezes.
  - `Oboe.js` is included in vendor files but `Clarinet.js` is the active parser.
- **Data Exploration**: `AG-Grid` for tabular data view and `Chart.js` for plotting data from the grid.
- **Persistence**: `IndexedDB` for caching large files (JSON, Video) and `localStorage` for user settings (UI state, theme, file references).

### 2. Project Architecture & File Structure

The application uses a modular ES6 structure. All source code resides in the `/src` directory.

- **`index.html`**: The main HTML shell. Defines the DOM structure, including the main layout, collapsible sidebar, data explorer panel, and documentation modals (User Manual, Shortcuts, Codebase Overview, Changelog). It loads all necessary CDN libraries and the main JS module.

...

- **`/annex/`**: **Supplementary Documentation**. Contains HTML files for the User Manual, Keyboard Shortcuts, Codebase Overview, and Changelog, as well as the progress log (`Improvements.txt`).

- **`/intel/`**: **Project Intelligence**. Contains documentation and AI-specific context files (`readme.md`, `GEMINI.md`, `context.md`).

- **`/src/main.js`**: **The Orchestrator**. This is the application's entry point. It initializes the database, theme, and data explorer. It sets up the initial event listeners for the UI and delegates specialized tasks to other modules (`fileLoader.js`, `keyboard.js`, `sync.js`, `ui.js`).

- **`/src/state.js`**: **The Single Source of Truth**. Exports a single global `appState` object that holds all dynamic data (e.g., `vizData`, `isPlaying`, `currentFrame`). All modules import from this file.

- **`/src/fileLoader.js`**: **File Management**. Handles the file loading pipeline. It manages drag-and-drop interactions, file input changes, and the unified processing of JSON and Video files. It handles caching logic (saving/loading from `IndexedDB`) and triggers the parsing worker.

- **`/src/keyboard.js`**: **Input Handling**. Manages all keyboard shortcuts. It creates a centralized `keydown` listener that triggers UI actions (play/pause, seeking, toggles) and prevents interference with input fields.

- **`/src/sync.js`**: **The Heartbeat & Controller**. Contains the core logic for playback and synchronization.
  - `animationLoop()`: The main render loop that keeps the UI updated.
  - `videoFrameCallback()`: The high-precision video timing loop.
  - `updateFrame()`: The central function that updates the current frame index, synchronizes the video (handling drift), and updates UI elements (sliders, counters, overlays).
  - `resetVisualization()`: Resets the playback state.
  - Handles timeline interactions (input, scroll wheel) and video panel scrolling.

- **`/src/dom.js`**: **The UI Interface**. Exports constants for every key DOM element. It contains functions to update specific UI components like persistent overlays (`updatePersistentOverlays`), debug overlays (`updateDebugOverlay`), and custom TTC scheme inputs. *Note: Core playback-driven UI updates have moved to `sync.js`.*

- **`/src/fileParsers.js`**: **The Data Processor**. Contains `parseVisualizationJson()`, which takes the raw parsed JSON object and enriches it with calculated `timestampMs` values relative to the video start time and determines global SNR ranges.

- **`/src/parser.worker.js`**: **The Heavy Lifter**. A Web Worker that uses `Clarinet.js` to stream-parse the JSON file, preventing the main thread from freezing. It posts progress updates and the final parsed object back to `main.js` (via `fileLoader.js`).

- **`/src/db.js`**: **The Caching Layer**. Manages all interactions with `IndexedDB` to save and load file blobs and their metadata, enabling fast session reloads.

- **`/src/dataExplorer.js`**: **The Inspector**. Manages the "Data Explorer" panel. It uses AG-Grid to display data in a table and Chart.js to plot selected columns. It includes `throttledUpdateExplorer` to efficiently update the view during playback.

- **`/src/debug.js`**: **Debug Configuration**. Exports `debugFlags` to toggle logging for various subsystems (sync, drawing, file loading) and configure constants like video load timeouts.

- **`/src/utils.js`**: **Toolbox**. A collection of pure, reusable helper functions (e.g., `findRadarFrameIndexForTime` (binary search), timestamp parsers, `throttle`, `precomputeRadarVideoSync`).

- **`/src/modal.js`**: **User Feedback**. Manages the logic for pop-up modal dialogs, including notifications, confirmations, and loading progress bars.

- **`/src/theme.js`**: **Styling**. Handles the dark/light mode theme switching.

- **`/src/constants.js`**: **Configuration**. Stores shared, static values like `VIDEO_FPS` and radar plot boundaries.

- **`/src/p5/`**: **Visualization Modules**.
  - **`radarSketch.js`**: The main radar visualization (point cloud, tracks, axes, ego vehicle).
  - **`speedGraphSketch.js`**: The time-series speed graph.
  - **`zoomSketch.js`**: The "GOD MODE" magnified view.

- **`/src/drawUtils.js`**: **The Artist's Toolkit**. Contains pure drawing functions called by the p5 sketches (e.g., `drawPointCloud`, `drawTrajectories`). This is where the visual appearance of radar objects is defined.

### 3. Data Flow & State Management

**File Loading Pipeline (`fileLoader.js`):**
1.  **Input**: User drops files or clicks load buttons. `handleFiles()` identifies the file types.
2.  **Processing (`processFilePipeline`)**: A loading modal is shown.
3.  **Caching**: Files are saved to `IndexedDB` (non-blocking).
4.  **Offset**: Timestamp offset is calculated from filenames.
5.  **JSON Parsing**: JSON is sent to `parser.worker.js`. The worker streams the file and returns the object.
6.  **Post-Processing**: `parseVisualizationJson()` (in `fileParsers.js`) enriches the data. `precomputeRadarVideoSync()` (in `utils.js`) bakes sync times.
7.  **Video Loading**: The video is loaded into the player.
8.  **Finalization**: `finalizeSetup()` (in `fileLoader.js`) resets the visualization, creates/updates p5 sketches, and updates the UI.

**Playback & Synchronization (`sync.js`):**
-   **Video Master**: The video element's time is the source of truth when playing.
-   **`videoFrameCallback`**: Runs on every video frame, finds the corresponding radar frame index, and updates `appState.currentFrame`.
-   **`animationLoop`**: Runs on `requestAnimationFrame` (~60Hz). It calls `updateFrame()` to reflect the state on the screen.
-   **`updateFrame()`**:
    -   Updates UI (slider, counter).
    -   Updates overlays (Ego speed, CAN speed).
    -   Calls `throttledUpdateExplorer`.
    -   Handles Video Seek: If `forceVideoSeek` is true (e.g., user scrubbed the timeline), it sets `videoPlayer.currentTime`.
-   **Drift Correction**: If the video drifts significantly from the target radar frame time, `updateFrame` forces a seek to resync.

**State Management (`appState`):**
The `appState` object in `state.js` is the central hub. Key properties include:
- `vizData`: The large object containing all radar frames and track data.
- `isPlaying`: Boolean controlling the loop.
- `currentFrame`: Integer index of the currently displayed radar frame.
- `offset`: Manual or auto-calculated time offset (ms).
- `videoStartDate`, `radarStartTimeMs`: Timestamps for absolute time calculation.
- `p5_instance`, `speedGraphInstance`: References to active sketches.
- `videoMissing`: Flag for JSON-only mode.

### 4. Key Interaction Flows

**Timeline Scrubbing (`sync.js`)**:
-   **Drag**: `handleTimelineInput` updates the UI immediately for responsiveness but debounces the expensive video seek until the user stops dragging.
-   **Scroll Wheel**: `handleTimelineWheel` allows frame-by-frame or accelerated seeking. It also updates UI immediately and debounces the video seek.

**Data Explorer (`dataExplorer.js`)**:
-   Activated by `I` key or canvas click.
-   Shows Tree, Grid, and Plot views.
-   Updates are throttled to prevent performance degradation during playback.

**Session Management (`main.js` & `db.js`)**:
-   `saveSessionBtn` saves current filenames, offset, and toggles to a JSON file.
-   `loadSessionBtn` reads the session file. It verifies that the referenced files exist in `IndexedDB` (via `loadFreshFileFromDB`) before applying settings and reloading the page.

**Keyboard Shortcuts (`keyboard.js`)**:
-   Centralized handler for `Play/Pause` (Space), `Seek` (Arrows), `Toggle Views` (1-4, T, D, G, P, C), `Debug` (A), `Theme` (Q).
-   Smartly ignores shortcuts when input fields are focused.