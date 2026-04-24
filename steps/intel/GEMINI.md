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
2.  **Start Server**: Run `Visualization_Start.bat`. This executes `python -m http.server 8000`.
3.  **Access App**: Open your browser and navigate to `http://localhost:8000`.

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
