# Radar and Video Synchronizer (Refactored)

**Version**: 3.3.0 (Synchronized Workspace Update)

## 🎯 Overview

This is a high-precision, browser-based tool for visualizing radar point cloud data, object tracks, and CAN bus speed data, synchronized with a corresponding video file. Originally a monolithic HTML application, it has been refactored into a modern, modular JavaScript application using ES6 Modules.

The application leverages **p5.js** for rendering, **Web Workers** for background streaming JSON parsing, **IndexedDB** for persistent file caching, and **Tailwind CSS** for a professional, responsive UI.

---

## ⚙️ Core Architecture

### `sync.js` (Synchronized Playback)
- **Master Clock**: Utilizes `performance.now()` for a high-resolution timer independent of imprecise video events.
- **Dynamic Mapping**: Maps the target media time (adjusted by user offsets) to the corresponding radar frame via binary search (`utils.js::findRadarFrameIndexForTime`).
- **Drift Correction**: Periodically checks for sync drift (>150ms) and forces video seeks to maintain frame-perfect alignment.

### `fileLoader.js` (Unified File Loading)
- **Multi-Input**: Supports both button-based selection and global Drag & Drop.
- **Pipeline Processing**: Identifies file types and triggers the appropriate caching and parsing workers.
- **Auto-Offset**: Automatically calculates time offsets based on standardized filenames (e.g., `fHist_...json` and `WIN_...mp4`).

### `parser.worker.js` (Streaming JSON Parser)
- **Off-Thread Processing**: Uses a Web Worker to keep the UI responsive during large file loads.
- **Streaming Logic**: Utilizes the `Clarinet.js` event-driven parser to reconstruct large datasets in memory without blocking the main thread.
- **Progress Reporting**: Sends real-time percentage updates back to the UI.

---

## 🎨 Visualizations (p5.js)

### `radarSketch.js` (Primary Radar Canvas)
- **Radar Rendering**: Draws point clouds, tracks, ego-vehicle representation, and cluster centroids.
- **Interactive Layers**: Manages toggleable overlays for SNR, TTC, predicted positions, and covariance ellipses.
- **Hardening**: Features **Triple-Buffer Protection** against 0-width crashes and a master timer for God Mode auto-visibility.

### `speedGraphSketch.js` (Telemetry Graph)
- **Time-Series Analysis**: Renders Ego Speed and CAN Speed lines synchronized with the video playback.
- **Visual Indicators**: Draws a vertical tracking line aligned with the current active frame.

### `zoomSketch.js` (Magnified "GOD MODE")
- **Standalone Window [NEW]**: A decoupled, floating overlay that provides high-fidelity zoom.
- **Auto-Hide UX [NEW]**: 8-second sequence (5s analysis period + 3s visual countdown) before fading.
- **Safety Indicators**: Includes "Out of Bounds" warnings and "Closing in..." countdown status labels.

---

## 🖥️ User Interface & Workspace

### `ui.js` (Workspace & Window Engine) [NEW]
- **Hybrid Dashboard**: Manages the mix of GridStack-based fixed panels and independent floating modules.
- **Layout Persistence**: Automatically saves/restores coordinates and GridStack geometry to `localStorage`.
- **Soft-Restore**: Updates layout positions by ID, preserving canvases and video players without destructive DOM replacement.
- **Viewport Rescue**: Automatically pulls off-screen panels back into view during window resize events.
- **Auto-Focus**: Clicking any floating panel dynamically increases its z-index (bringing it to the front).

### `dataExplorer.js` (Data Inspector)
- **Deep Inspection**: Provides Tree View, AG-Grid View, and Chart.js Plotting for raw numerical frame data.
- **Persistent Memory [NEW]**: Remembers its last position, size, and display state across page reloads.

### `keyboard.js` (Shortcuts)
- **Centralized Handler**: Manages all keyboard interactions (Space, 1-4, S, T, D, G, P, etc.).
- **Smart Focus**: Prevents shortcuts from firing when the user is typing in number or text inputs.

---

## 📂 Project Structure

```text
├── index.html                       # Main HTML shell
├── Visualization_Start.bat          # Script to start the local server
├── python_check.bat                 # Script to check Python installation
├── favicon.png                      # Browser tab icon
├── package-lock.json                # NPM lockfile
├── annex/                           # Supplementary documentation and reference files
│   ├── User_Manual.html             # Content for the Quick Start Guide (loaded via iframe)
│   ├── code-base-overview.html      # Technical overview of the codebase (infographic style)
│   ├── Changelog_3.3.0.html         # Current version release notes (loaded via iframe)
│   ├── Changelog.html               # Legacy change archive
│   └── shortcuts.html               # Reference for keyboard shortcuts (legacy/static)
├── intel/                           # Project documentation and AI context
│   ├── readme.md                    # This documentation
│   ├── context.md                   # Detailed technical overview for AI assistance
│   ├── GEMINI.md                    # High-level project overview for AI
├── src/
│   ├── constants.js                 # Shared constants (radar bounds, FPS)
│   ├── dataExplorer.js              # Logic for the Data Explorer panel (AG Grid, Chart.js)
│   ├── db.js                        # IndexedDB logic for caching files
│   ├── debug.js                     # Debug logging flags and console exposure
│   ├── dom.js                       # Centralized DOM element references
│   ├── drawUtils.js                 # p5.js drawing helpers (points, tracks, axes, legends)
│   ├── fileLoader.js                # File handling pipeline (Dropzone, Inputs, Worker trigger)
│   ├── fileParsers.js               # Post-processing logic for parsed JSON
│   ├── keyboard.js                  # Keyboard shortcut handler
│   ├── main.js                      # Main application entry point, initialization logic
│   ├── modal.js                     # Logic for pop-up modal dialogs & progress bar
│   ├── parser.worker.js             # Web Worker for background JSON parsing (uses Clarinet.js)
│   ├── session.js                   # NEW: Logic for saving and loading session state
│   ├── state.js                     # Centralized application state management object (appState)
│   ├── sync.js                      # Core animation loop and playback synchronization logic
│   ├── theme.js                     # Dark/Light mode theme switching logic
│   ├── ui.js                        # NEW: General UI event listeners (menus, modals, toggles)
│   ├── utils.js                     # General utility functions (binary search, formatting)
│   └── p5/
│       ├── radarSketch.js           # p5.js sketch for the main radar visualization
│       ├── speedGraphSketch.js      # p5.js sketch for the speed graph
│       └── zoomSketch.js            # p5.js sketch for the magnified zoom window ("GOD MODE")
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
```

---

## 🚀 How to Use

1.  **Load Files**: Use "Load JSON"/"Load Video" buttons or **Drag & Drop**.
2.  **Playback**: Control via Spacebar, timeline slider (drag/scroll), or Arrow keys.
3.  **Inspect**: Click the Radar canvas or press `I` to open the **Data Explorer**.
4.  **Workspace**: Reorganize panels. Your layout is automatically saved to local storage.
5.  **Soft-Reset**: Use the "Clear Cache and Reload" button to perform a complete factory reset.

---

## 🛠️ Technical Setup

The project is designed to run as a static application but requires a local server for Web Workers and File API access.

- **Check Environment**: Run `python_check.bat`.
- **Start Server**: Run `Visualization_Start.bat`.
- **Access**: Open `http://localhost:8000` in any modern browser.