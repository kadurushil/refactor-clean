Radar and Video Timestamp VisualizerThis is a high-precision, browser-based tool for visualizing radar point cloud data, object tracks, and CAN bus speed data, synchronized with a corresponding video file. The application was refactored from a single monolithic HTML file into a modern, modular JavaScript application for improved maintainability, performance, and future extensibility.

Features: 

*Synchronized Playback: Simultaneously plays a video file and visualizes radar data frames based on precise timestamps.

*Multi-File Support: Load and visualize data from three distinct sources:
-JSON: Contains radar point clouds and tracked object data.
-Video: The ground-truth video corresponding to the radar data.
-CAN Log: A text log file containing vehicle speed data over time.

*Interactive Visualization:
-Displays radar point clouds and object trajectories on a 2D plane.
-Overlays object details like ID, speed (km/h), and Time-to-Collision (TTC).
-Visualizes vehicle speed from both CAN logs and radar ego-velocity on a time-series graph.
*Dynamic Filtering & Coloring:
-Colorize radar points based on Signal-to-Noise Ratio (SNR), cluster ID, or inlier/outlier status.
-Distinguish between stationary and moving objects with unique colors and markers.
-Adjustable SNR range for fine-tuning the visualization.

*Playback Controls: Full control over the playback, including play, pause, stop, frame-by-frame stepping (using arrow keys), and a draggable timeline slider.

*Data Caching: Uses IndexedDB to cache loaded files, allowing for instant reloading of the last session.

*Dark/Light Theme: A theme toggle for user comfort that persists across sessions.


How to Run Locally:- 

Because this project uses ES Modules (import/export), you cannot simply open the index.html file directly in your browser from the file system (file:///...). 
You must serve the files using a local web server.The easiest way to do this is with Python or Node.js.

1.) Navigate to the Project Directory: Open your terminal or command prompt and change to the root directory of this project (the one containing index.html).

2.) Start a Local Server:Using Python:

--# For Python 3.x
" python -m http.server "

--# Using Node.js (with serve): 
If you don't have serve, install it first:
" npm install -g serve.serve ".

3.) Open in Browser: Open your web browser and navigate to the URL provided by the server (usually http://localhost:8000 or http://localhost:3000).


Project StructureThe project has been refactored into a modular structure to separate concerns. All JavaScript source code resides in the src/ directory..
├── index.html              # The main HTML shell for the application
├── README.md               # This documentation file
└── src/
    ├── constants.js        # Shared constants (e.g., radar bounds, FPS)
    ├── db.js               # IndexedDB logic for caching files
    ├── dom.js              # DOM element references and UI update functions
    ├── drawUtils.js        # p5.js drawing helper functions for the radar sketch
    ├── fileParsers.js      # Logic for parsing JSON and CAN log files
    ├── main.js             # The main application entry point and event wiring
    ├── modal.js            # Logic for the pop-up modal dialog
    ├── state.js            # Centralized application state management
    ├── sync.js             # The core animation loop and playback synchronization logic
    ├── theme.js            # Dark/Light mode theme switching logic
    ├── utils.js            # General utility functions (e.g., binary search, throttling)
    └── p5/
        ├── radarSketch.js      # The p5.js sketch for the main radar visualization
        └── speedGraphSketch.js # The p5.js sketch for the speed graph

How to Use the Application
- Load Files: Use the "Load JSON", "Load Video", and "Load CAN Log" buttons to select your data files. The application works best when all three are loaded. The application will automatically attempt to calculate the time offset between the JSON and video files based on their filenames.
- Playback: Use the "Play/Pause" and "Stop" buttons to control the timeline. You can also click and drag the main timeline slider or use the Left and Right arrow keys to step through frames.
- Adjust Speed: Use the "Speed" slider to change the playback rate of the video and visualization.
- Use Toggles: Use the checkboxes to toggle various visualization features, such as showing object tracks, coloring points by SNR, or displaying debug information.