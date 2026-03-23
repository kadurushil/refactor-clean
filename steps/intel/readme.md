Radar and Video Synchronizer (Refactored)

Version: Based on commit f426eee3 (Inferred)

Overview

This is a high-precision, browser-based tool for visualizing radar point cloud data, object tracks, and CAN bus speed data, synchronized with a corresponding video file. Originally a monolithic HTML application (V14_inliner_Stationary.html), it has been refactored into a modern, modular JavaScript application using ES6 Modules. This structure enhances maintainability, performance (especially with large datasets), and extensibility.

The application leverages p5.js for rendering visualizations, a Web Worker with the Clarinet.js streaming parser for efficient background JSON processing, IndexedDB for persistent file caching, Tailwind CSS for styling, and introduces a Data Explorer panel using AG Grid and Chart.js for in-depth data inspection.

Core Features Detailed

Synchronized Playback (sync.js):

Utilizes performance.now() for a high-resolution master clock, independent of potentially imprecise video events.

Calculates the target media time based on playback speed (speedSlider.value) and elapsed real time.

Maps the target media time (adjusted by the user-defined offsetInput.value) to the corresponding radar frame timestamp (timestampMs).

Uses a binary search (utils.js::findRadarFrameIndexForTime) to efficiently find the correct radar frame index for the calculated timestamp.

Periodically checks for drift (>150ms) between the master clock's calculated time and videoPlayer.currentTime, forcing a video seek if needed to maintain sync.

Unified File Loading (fileLoader.js):

Handles loading JSON (radar data) and Video files through both button clicks (loadJsonBtn, loadVideoBtn) and drag-and-drop onto the main content area (<main>).

The handleFiles function identifies file types (.json, video/*) and triggers the processFilePipeline.

Note: Dedicated CAN log loading (loadCanBtn, canFileInput) has been removed. CAN speed data (canVehSpeed_kmph) is now expected within the JSON structure, associated with each radarFrame.

Efficient JSON Parsing (parser.worker.js, fileLoader.js, fileParsers.js):

The processFilePipeline function initiates a Web Worker (parser.worker.js).

The worker receives the JSON File object.

It uses the File.stream() API and TextDecoder to read the file chunk by chunk.

Clarinet.js (clarinet.min.js loaded locally via importScripts in the worker) parses the incoming JSON stream event-by-event (onopenobject, onkey, onvalue, etc.), reconstructing the full JavaScript object in memory off the main thread.

Progress updates (percent) are sent back to the main thread via postMessage.

On completion, the fully parsed object (data) is sent back.

The main thread receives the parsed data and passes it to fileParsers.js::parseVisualizationJson for post-processing (calculating relative timestampMs, determining global SNR range).

Interactive Visualization (p5/, drawUtils.js, ui.js):

radarSketch.js: The primary p5 sketch.
- Master timer for God Mode auto-visibility (5s delay).
- Hardened with guards against 0-width container crashes during layout shifts.
- "Mouse Out of Bounds" safety indicators for high-speed tracking.

speedGraphSketch.js: The secondary p5 sketch for the speed graph.
- Refined with initialization guards to handle rapid GridStack resizing.

zoomSketch.js: p5 sketch for the magnified "GOD MODE" view.
- **Floating Overlay**: Now a standalone window decoupled from the dashboard grid.
- **Auto-Hide UX**: 5s analysis period + 3s visual countdown before fading.
- **Safety**: Includes "Out of Bounds" warning and "Closing in..." countdown labels.

UI & Workspace Engine (ui.js, index.html):

- **Hybrid Dashboard**: Combines a GridStack-based fixed background with standalone floating modules.
- **makeDraggableAndResizable**: A unified utility that transforms static UI elements into interactive windows.
- **Persistent Memory**: Automatically saves and restores panel coordinates and GridStack geometry using `localStorage`.
- **Soft-Restore**: Loads layout updates by ID without destroying inner DOM content (preserving p5 canvases and video players).
- **Viewport Rescue**: Automatically pulls off-screen panels back into the viewing area during window resize events.
- **Auto-Focus**: Clicking any floating panel dynamically increases its z-index (bringing it to the front).

Startup Guide, Shortcuts, & Changelog:
- Includes a "First Run" experience with a loading screen and Quick Start Guide modal (ui.js).
- A **Changelog** modal ("What's New?") provides a history of updates and refactors (ui.js).
- The **"Clear Cache and Reload"** button acts as a full factory reset, wiping all UI memory and cached data.


Session Management (session.js, main.js, db.js):

Files are cached in IndexedDB using db.js::saveFileWithMetadata upon loading. Metadata (filename, size) is stored alongside the blob.

On DOMContentLoaded, main.js retrieves expected filenames from localStorage and attempts to load corresponding blobs using db.js::loadFreshFileFromDB. This function verifies filename and size match before returning the blob, ensuring cache validity.

saveSessionBtn (handled in session.js) gathers current state (appState filenames, offsetInput.value, toggle states) into a JSON object and triggers a browser download.

loadSessionBtn (handled in session.js) reads a chosen session JSON file. It verifies that the files mentioned in the session currently exist and are valid in IndexedDB using loadFreshFileFromDB before applying settings to localStorage and reloading the page.

Keyboard Shortcuts (keyboard.js):

A comprehensive keydown listener intercepts keys (Space, Arrows, 1-4, S, T, D, G, P, A, M, Q, R, C, I).

It programmatically triggers .click() events on corresponding buttons or directly updates appState/calls functions (like showExplorer/hideExplorer).

Note: <kbd>K</kbd> (Shortcuts) and <kbd>Esc</kbd> (Close Modals) are handled globally in `ui.js`.

Includes a check to prevent shortcuts firing when focus is on text/number inputs (offsetInput, snrMinInput, etc.).

How to Run Locally

(Instructions remain the same - requires Python 3 and running python -m http.server 8000 or the provided .bat script in the steps directory).

Check Python Installation: Run python_check.bat or python --version. Need Python 3.x in PATH.

Navigate to Project Directory: cd to the steps directory containing index.html.

Start Local Server: Run Visualization_Start.bat or python -m http.server 8000. Keep terminal open.

Open in Browser: Navigate to http://localhost:8000.

Project Structure

├── index.html                       # Main HTML shell
├── Visualization_Start.bat      # Script to start the local server
├── python_check.bat             # Script to check Python installation
├── favicon.png                      # Browser tab icon
├── package-lock.json                # NPM lockfile
├── annex/                       # Supplementary documentation and reference files
│   ├── User_Manual.html         # Content for the Quick Start Guide (loaded via iframe)
│   ├── code-base-overview.html  # Technical overview of the codebase (infographic style)
│   ├── Changelog_3.3.0.html     # Current version release notes (loaded via iframe)
│   ├── Changelog.html           # Legacy change archive
│   └── shortcuts.html           # Reference for keyboard shortcuts (legacy/static)
├── intel/                       # Project documentation and AI context
│   ├── readme.md                # This documentation
│   ├── context.md               # Detailed technical overview for AI assistance
│   └── GEMINI.md                # High-level project overview for AI
├── src/
    ├── constants.js                 # Shared constants (radar bounds, FPS)
    ├── dataExplorer.js              # Logic for the Data Explorer panel (AG Grid, Chart.js)
    ├── db.js                        # IndexedDB logic for caching files
    ├── debug.js                     # Debug logging flags and console exposure
    ├── dom.js                       # Centralized DOM element references
    ├── drawUtils.js                 # p5.js drawing helpers (points, tracks, axes, legends)
    ├── fileLoader.js                # File handling pipeline (Dropzone, Inputs, Worker trigger)
    ├── fileParsers.js               # Post-processing logic for parsed JSON
    ├── keyboard.js                  # Keyboard shortcut handler
    ├── main.js                      # Main application entry point, initialization logic
    ├── modal.js                     # Logic for pop-up modal dialogs & progress bar
    ├── parser.worker.js             # Web Worker for background JSON parsing (uses Clarinet.js)
    ├── session.js                   # NEW: Logic for saving and loading session state
    ├── state.js                     # Centralized application state management object (appState)
    ├── sync.js                      # Core animation loop and playback synchronization logic
    ├── theme.js                     # Dark/Light mode theme switching logic
    ├── ui.js                        # NEW: General UI event listeners (menus, modals, toggles)
    ├── utils.js                     # General utility functions (binary search, formatting)
    └── p5/
        ├── radarSketch.js           # p5.js sketch for the main radar visualization
        ├── speedGraphSketch.js      # p5.js sketch for the speed graph
        └── zoomSketch.js            # p5.js sketch for the magnified zoom window ("GOD MODE")
├── vendor/                          # Local copies of external libraries
│   ├── ag-grid-community.min.js
│   ├── chart.min.js
│   ├── clarinet.min.js
│   ├── oboe.min.js
│   ├── p5.js
│   └── tailwind-cdn.js
├── tests/                           # Unit tests
│   ├── fileLoader.test.js
│   ├── fileParsers.test.js
│   ├── test-runner.html
│   └── utils.test.js
├── Data_structs/                    # Documentation of JSON and ROS2 data structures
└── Console_logs/                    # Example logs for debugging synchronization


How to Use the Application

(Usage instructions remain largely similar, with additions for the Data Explorer)

Load Files: Use "Load JSON"/"Load Video" buttons or Drag & Drop. Offset calculated automatically from filenames (fHist_...json, WIN_...mp4).

Playback: Use UI buttons (<kbd>Space</kbd>), timeline slider (drag, hover, scroll wheel), or arrow keys (←/→).

Adjust Offset: Manually enter offset (ms, +ve if radar lags) and press Enter.

Adjust Speed: Use the "Speed" slider.

Use Header Buttons: Access "Quick-Start Guide", "Codebase Overview", "Keyboard Shortcuts", and "What's New?".

Use Sidebar (<kbd>M</kbd>): Access toggles (Color modes <kbd>1-4</kbd>/<kbd>S</kbd>, Tracks <kbd>T</kbd>, Details <kbd>D</kbd>, Zoom <kbd>G</kbd>, Predicted Pos <kbd>P</kbd>, Debug <kbd>A</kbd>, Raw Only <kbd>C</kbd>, Confirmed Only), SNR range, TTC customization.

Data Explorer (<kbd>I</kbd> / Canvas Click):

Press <kbd>I</kbd> or click the main radar canvas to open/close the panel.

View current frame data structure in the Tree View.

If applicable data is sent (e.g., pointCloud via canvas click), view it in the Grid View. Sort/filter columns.

In Grid View, click a column header, then click "Plot Selected Column" to see a line graph in the Plot View.

Session Management: Use "Save/Load Session", "Clear Cache". Load requires files in cache.

Other Shortcuts: Theme <kbd>Q</kbd>, Reset <kbd>R</kbd>, Shortcuts List <kbd>K</kbd>.