# ARAS Radar and Video Synchronizer

High-precision, browser-based tool for visualizing radar point cloud data, object tracks, and CAN bus speed data, synchronized with a corresponding video file.

## Project Overview

This project is a modular ES6 JavaScript application refactored from a monolithic codebase. It provides a sophisticated interface for multi-sensor data playback and analysis.

### Core Technologies
- **Rendering**: [p5.js](https://p5js.org/) for main radar, speed graph, and "GOD MODE" visualizations. Hardened with Triple-Buffer protection.
- **Parsing**: Web Workers using [Clarinet.js](https://github.com/dscape/clarinet) for non-blocking, streaming JSON parsing of large datasets.
- **Storage**: **IndexedDB** for persistent file caching; **localStorage** for user workspace state and layout persistence.
- **Layout Engine**: [GridStack.js](https://gridstackjs.com/) for the modular, resizable dashboard interface.
- **Styling**: Tailwind CSS for a premium, dark-mode-first UI.
- **Data Exploration**: [AG Grid](https://www.ag-grid.com/), **Custom Vertical Property View**, and [Chart.js](https://www.chartjs.org/) for forensic data inspection.

### Architecture
- **State Management**: Centralized in `src/state.js` via the `appState` object.
- **Synchronization**: `src/sync.js` uses high-resolution `performance.now()` to perfectly align radar frames with video playback.
- **Workspace Engine**: `src/ui.js` manages a Hybrid Dashboard (GridStack + Standalone Floating Windows) with auto-focus and viewport rescue logic.
- **Modular Design**: Functional decomposition into specialized modules for Sync, Data, UI, and Visualizations.

## Building and Running

The project is designed to run as a static web application but requires a local server due to security restrictions on file access and Web Workers.

### Prerequisites
- Python 3.x installed on your system.

### Quick Start
1.  **Check Environment**: Run `python_check.bat` to verify Python is in your PATH.
2.  **Start Server**: Run `Visualization_Start.bat`. This starts the threaded Python server `server.py` on `http://127.0.0.1:8000` and automatically launches your default browser.
3.  **Access App**: Ensure the browser URL matches the port printed in the server terminal (`http://127.0.0.1:8000`). **Keep the server window open** while using the application.

### Local Server Architecture & Troubleshooting (`server.py`)
- **Multi-Threaded Serving (`ThreadingHTTPServer`)**:
  The application relies heavily on native ES6 module imports across dozens of files (`main.js`, `fileLoader.js`, `load_folder.js`, `sync.js`, `dom.js`, etc.) loaded simultaneously on page load. Single-threaded HTTP servers (`socketserver.TCPServer` or `python -m http.server`) choke under concurrent connection floods due to a small TCP backlog queue (`request_queue_size = 5`), leading to `net::ERR_CONNECTION_REFUSED` on random modules. Always use `http.server.ThreadingHTTPServer` with `daemon_threads = True`.
- **Immediate Socket Rebinding (`allow_reuse_address = True`)**:
  On Windows, closed sockets linger in `TIME_WAIT` for 30–60 seconds. `allow_reuse_address = True` (`SO_REUSEADDR`) ensures server restarts immediately re-bind to port `8000` instead of drifting to `8001`, which would orphan existing browser tabs and produce `ERR_CONNECTION_REFUSED`.
- **DevTools Probing & Missing Sourcemaps**:
  When Chrome DevTools (F12) is active, Chrome automatically probes `/.well-known/appspecific/com.chrome.devtools.json` and attempts to fetch `.map` files declared by vendor bundles. `server.py` handles these probes cleanly (responding with `204 No Content`) to keep the server console noise-free without disrupting application execution.
- **Root-Cause Analysis of Home Screen Freeze**:
  If any ES module fails to load (e.g., `load_folder.js` connection refused by an offline or drifted port), the entire module graph halts execution before `DOMContentLoaded`. As a result, `main.js` never initializes, `runStartupLoader()` does not execute, and the startup Guide modal never appears. Always verify the server is active on the expected port before diagnosing UI initialization issues.

### Development
Since this is a static project using ES6 modules directly in the browser:
- No build step (e.g., Webpack/Vite) is currently required for basic usage.
- Tests can be run by opening `tests/test-runner.html` in a local server environment.

## Key Directories and Files
- `src/`: Main source code directory.
  - `p5/`: p5.js sketches for Radar, Speed Graph, and Standalone "GOD MODE" Zoom.
  - `dataExplorer.js`: Logic for the Data Explorer panel (AG Grid, Vertical Property View, Chart.js).
  - `ui.js`: Unified UI/Workspace engine with layout memory and resizable panel logic.
  - `sync.js`: High-precision synchronization logic.
  - `parser.worker.js`: Off-thread streaming JSON parser.
- `vendor/`: Local copies of 3rd party libraries ensuring offline functionality.
- `annex/`: Technical guides, shortcuts, and infographics for the dashboard.
- `intel/`: Project documentation and high-level architecture guides (this folder).
- `Data_structs/`: Documentation for JSON and ROS2 sensor streams.

## Development Conventions

### Coding Style
- **Modularization**: Follow the established pattern of separating logic into `src/` modules. Avoid adding logic to `index.html`.
- **State Access**: Always use `appState` for reactive data.
- **Drawing**: Use `src/drawUtils.js` for reusable drawing functions shared between `radarSketch` and `zoomSketch`.

### Naming
- Use camelCase for variables and functions.
- Use PascalCase for class-like structures (though the project primarily uses objects and functions).

### Documentation
- Maintain `readme.md`, `GEMINI.md`, and `context.md` in the `intel/` folder with significant architectural changes.
- Use `Improvements.txt` (in `annex/`) to track progress on the refactor and new feature requests.
- Reference supplementary guides in `annex/` (User Manual, Shortcuts, Changelog).
