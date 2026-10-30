Context Document: Radar and Video Synchronizer Application (Version 3.5.0)

### 1. High-Level Overview

**Core Purpose**: A high-precision, browser-based tool for visualizing and synchronizing radar sensor data (JSON) with a corresponding video file. It allows for detailed analysis of object tracks, point clouds, and vehicle dynamics.

**Core Technologies & Performance Architecture (V3.5.0)**:
- **Frontend**: HTML5, Tailwind CSS (JIT observer detached post-initialization to eliminate per-frame DOM churn).
- **Logic**: Modular JavaScript (ES6 Modules) with high-performance $O(1)$ indexing.
- **Visualization**: `p5.js` with `pixelDensity(1)` and disabled Friendly Errors System (`disableFriendlyErrors = true`) for maximum fill-rate headroom and zero-overhead draw calls on integrated GPUs.
  - Main radar plot (`radarSketch.js`).
  - Zoomed-in "god mode" inspection view (`zoomSketch.js`).
  - Time-series speed and TTC warning graph (`speedGraphSketch.js`).
- **Data Handling**:
  - **Web Workers** (`parser.worker.js`) with the `Clarinet.js` streaming library to parse large JSON files off the main thread, preventing UI freezes.
  - **O(1) Map Pre-Indexing**: `parseVisualizationJson` pre-indexes `track.logsByFrame` (`Map`) to eliminate $O(N \times M)$ linear scans.
- **Data Exploration**:
  - `AG-Grid` for tabular Point Cloud and Track data.
  - **Vertical Property View** (`dataExplorer.js`) for high-density ADAS data.
  - `Chart.js` for plotting data from the grids.
- **Persistence**: `IndexedDB` for caching large files (JSON, Video) and `localStorage` for user settings (UI state, theme, file references).

### 2. Project Architecture & File Structure

The application uses a modular ES6 structure. All source code resides in the `/src` directory.

- **`index.html`**: The main HTML shell. Defines the DOM structure, including the main layout, collapsible sidebar, data explorer panel, and documentation modals (User Manual, Shortcuts, Codebase Overview, Changelog). It loads all necessary CDN libraries and the main JS module. Suppresses p5 friendly errors upfront.

- **`/annex/`**: **Supplementary Documentation & Release Artifacts**. Contains HTML files for the User Manual, Keyboard Shortcuts, Codebase Overview, Changelogs (`Changelog_3.5.0.html`, `Changelog_V3.5.0.md`), and progress logs (`Improvements.txt`, `GIT_Changes.txt`).

- **`/intel/`**: **Project Intelligence**. Contains documentation and AI-specific context files (`readme.md`, `GEMINI.md`, `context.md`, `sync_and_render_architecture.md`).

- **`/src/main.js`**: **The Orchestrator**. This is the application's entry point. It initializes the database, theme, and data explorer. It sets up the initial event listeners for the UI and delegates specialized tasks to other modules (`fileLoader.js`, `keyboard.js`, `sync.js`, `ui.js`). Disconnects runtime Tailwind MutationObservers 500ms post-boot.

- **`/src/state.js`**: **The Single Source of Truth**. Exports a single global `appState` object that holds all dynamic data (e.g., `vizData`, `isPlaying`, `currentFrame`). All modules import from this file.

- **`/src/fileLoader.js`**: **File Management**. Handles the file loading pipeline. It manages drag-and-drop interactions, file input changes, and the unified processing of JSON and Video files. It handles caching logic (saving/loading from `IndexedDB`) and triggers the parsing worker.

- **`/src/keyboard.js`**: **Input Handling**. Manages all keyboard shortcuts. It creates a centralized `keydown` listener that triggers UI actions (play/pause, seeking, toggles) and prevents interference with input fields.

- **`/src/sync.js`**: **The Heartbeat & Controller**. Contains the core logic for playback and synchronization.
  - `animationLoop()`: The main render loop that keeps the UI updated.
  - `videoFrameCallback()`: The high-precision video timing loop.
  - `updateFrame()`: The central function that updates the current frame index, synchronizes the video (handling drift), and updates UI elements (sliders, counters, overlays) with DOM mutation guards.
  - `resetVisualization()`: Resets the playback state.
  - Handles timeline interactions (input, scroll wheel) and video panel scrolling.

- **`/src/dom.js`**: **The UI Interface**. Exports constants for every key DOM element. Features a passive `ResizeObserver` to cache canvas dimensions and eliminate forced synchronous reflows. Contains functions to update persistent overlays (`updatePersistentOverlays`) with text content caching guards.

- **`/src/fileParsers.js`**: **The Data Processor**. Contains `parseVisualizationJson()`, which enriches raw JSON with `timestampMs` relative to video start time, global SNR ranges, and builds `track.logsByFrame` (`Map`) for $O(1)$ telemetry lookups.

- **`/src/parser.worker.js`**: **The Heavy Lifter**. A Web Worker that uses `Clarinet.js` to stream-parse the JSON file, preventing the main thread from freezing.

- **`/src/db.js`**: **The Caching Layer**. Manages all interactions with `IndexedDB` to save and load file blobs and their metadata, enabling fast session reloads.

- **`/src/dataExplorer.js`**: **The Inspector**. Manages the "Data Explorer" panel (Grid, Tree, Plot views) with throttled updates.

- **`/src/ui.js`**: **The UI Engine**. Manages floating panels, GridStack layouts, persistent window coordinates in `localStorage`, and viewport rescue.

- **`/src/debug.js`**: **Debug Configuration**. Exports `debugFlags` to toggle subsystem logging.

- **`/src/utils.js`**: **Toolbox**. A collection of pure, reusable helper functions (e.g., `findRadarFrameIndexForTime` (binary search), timestamp parsers, `throttle`, `precomputeRadarVideoSync`).

- **`/src/modal.js`**: **User Feedback**. Manages pop-up modal dialogs, confirmations, and progress bars.

- **`/src/theme.js`**: **Styling**. Handles dark/light mode theme switching.

- **`/src/constants.js`**: **Configuration**. Stores shared, static values including `APP_VERSION = "3.5.0"`, `VIDEO_FPS`, and radar plot boundaries.

- **`/src/p5/`**: **Visualization Modules**.
  - **`radarSketch.js`**: Clamped to `pixelDensity(1)` and `p5.disableFriendlyErrors = true`. Renders point cloud, tracks, covariance ellipses, bounding boxes, and staged collision halos.
  - **`zoomSketch.js`**: Clamped to `pixelDensity(1)`. Close-up "GOD MODE" view with 3D elevation hover inspection.
  - **`speedGraphSketch.js`**: Clamped to `pixelDensity(1)`. Renders synchronized speed curves and FCW risk bands.

- **`/src/drawUtils.js`**: **The Artist's Toolkit**. Pure drawing functions called by p5 sketches. Uses `getTrackLogForFrame(track, frameIdx)` for $O(1)$ lookups and binary search + coordinate slicing for trajectories.

### 3. Data Flow & State Management

**File Loading Pipeline (`fileLoader.js`):**
1. **Input**: User drops files or clicks load buttons. `handleFiles()` identifies the file types.
2. **Processing (`processFilePipeline`)**: A loading modal is shown.
3. **Caching**: Files are saved to `IndexedDB` (non-blocking).
4. **Offset**: Timestamp offset is calculated from filenames.
5. **JSON Parsing**: JSON is sent to `parser.worker.js`. The worker streams the file and returns the object.
6. **Post-Processing**: `parseVisualizationJson()` (in `fileParsers.js`) enriches the data and pre-indexes `track.logsByFrame`. `precomputeRadarVideoSync()` (in `utils.js`) bakes sync times.
7. **Video Loading**: The video is loaded into the player.
8. **Finalization**: `finalizeSetup()` (in `fileLoader.js`) resets the visualization, mounts p5 sketches, and updates UI.

**Playback & Synchronization (`sync.js`):**
- **Video Master**: The video element's time is the source of truth when playing.
- **`videoFrameCallback`**: Runs on every video frame, finds the corresponding radar frame index, and updates `appState.currentFrame`.
- **`animationLoop`**: Runs on `requestAnimationFrame` (~60Hz VSync). Calls `updateFrame()` to reflect state on screen.
- **`updateFrame()`**:
  - Updates UI (slider, counter) with minimal DOM churn.
  - Updates overlays with string equality cache guards.
  - Calls `throttledUpdateExplorer`.
  - Handles video seeking with debouncing.
- **Drift Correction**: Corrects drift relative to container video frame indices.

### 4. Key Interaction Flows

**Timeline Scrubbing (`sync.js`)**:
- Drag and scroll wheel interactions use cached canvas dimensions, avoiding layout thrashing. Debounces expensive video seeking until scrubbing pauses.

**Data Explorer (`dataExplorer.js`)**:
- Activated by `I` key or canvas click. Displays Tree, Grid, and Plot views with throttled updates.

**Layout Persistence (`ui.js` & `main.js`)**:
- GridStack and floating panel positions are persisted across sessions in `localStorage`.

**Session Management (`main.js` & `db.js`)**:
- Save/Load session states directly with IndexedDB integration.

**Keyboard Shortcuts (`keyboard.js`)**:
- Centralized handler for playback, seeking, view toggling, and debug overlays.
