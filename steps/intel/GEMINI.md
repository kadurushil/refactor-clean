# ARAS Radar and Video Synchronizer

High-precision, browser-based tool for visualizing radar point cloud data, object tracks, and CAN bus speed data, synchronized with a corresponding video file.

## Project Overview

This project is a modular ES6 JavaScript application refactored from a monolithic codebase. It provides a sophisticated interface for multi-sensor data playback and analysis.

### Core Technologies
- **Rendering**: [p5.js](https://p5js.org/) for main radar and speed graph visualizations.
- **Parsing**: Web Workers using [Clarinet.js](https://github.com/dscape/clarinet) for non-blocking, streaming JSON parsing of large datasets.
- **Storage**: IndexedDB for persistent caching of radar and video files to avoid repeated uploads.
- **Styling**: Tailwind CSS for a responsive, modern UI.
- **Data Exploration**: [AG Grid](https://www.ag-grid.com/) and [Chart.js](https://www.chartjs.org/) for detailed data inspection.

### Architecture
- **State Management**: Centralized in `src/state.js` via the `appState` object.
- **Synchronization**: `src/sync.js` uses a high-resolution master clock (`performance.now()`) to align radar frames with video playback, correcting for drift and user-defined offsets.
- **Modular Design**: Separated into functional modules for DOM references, file parsing, drawing utilities, keyboard handling, and UI components.

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
  - `p5/`: p5.js sketches for Radar, Speed Graph, and Zoom ("GOD MODE").
  - `sync.js`: High-precision synchronization logic.
  - `parser.worker.js`: Off-thread streaming JSON parser.
- `vendor/`: Local copies of 3rd party libraries to ensure offline/local functionality.
- `Data_structs/`: Documentation of expected JSON and ROS2 data structures.
- `Improvements.txt`: Roadmap of features and completed refactors.

## Development Conventions

### Coding Style
- **Modularization**: Follow the established pattern of separating logic into `src/` modules. Avoid adding logic to `index.html`.
- **State Access**: Always use `appState` for reactive data.
- **Drawing**: Use `src/drawUtils.js` for reusable drawing functions shared between `radarSketch` and `zoomSketch`.

### Naming
- Use camelCase for variables and functions.
- Use PascalCase for class-like structures (though the project primarily uses objects and functions).

### Documentation
- Maintain `readme.md` and `context.md` with significant architectural changes.
- Use `Improvements.txt` to track progress on the refactor and new feature requests.
