Context Document: Radar and Video Synchronizer Application
1. High-Level Overview
This document provides a detailed technical overview of the Radar and Video Synchronizer web application. Its purpose is to give an AI assistant a comprehensive understanding of the codebase to facilitate efficient and accurate development assistance.

Core Purpose: The application is a high-precision, browser-based tool for visualizing and synchronizing radar sensor data (from a JSON file) with a corresponding video file. It allows for detailed analysis of object tracks, point clouds, and vehicle dynamics.

Core Technologies:

Frontend: HTML5, Tailwind CSS

Logic: Modular JavaScript (ES6 Modules)

Visualization: p5.js library for rendering the radar plot and speed graph.

Data Handling: Web Workers and the Oboe.js library for non-blocking parsing of large JSON files.

Persistence: IndexedDB for caching session files (JSON, Video) and localStorage for user settings (UI layout, theme, etc.).

Key Features:

Synchronized playback of video and radar data.

Resizable two-panel layout (Radar and Video).

Collapsible sidebar for display settings.

Dynamic coloring of radar points (by SNR, Cluster, etc.).

Visualization of tracked object trajectories, speed, and Time-to-Collision (TTC).

A speed graph showing ego-velocity and CAN bus speed over time.

Robust keyboard shortcuts for power users.

Session management (Save/Load settings and file references).

2. Project Architecture & File Structure
The application follows a modern modular JavaScript architecture. Logic is separated into distinct files, each with a single responsibility. All source code is in the /src/ directory.

index.html: The main HTML file. It's a shell that contains the DOM structure and loads the main JavaScript module (/src/main.js).

/src/

main.js: The Orchestrator. This is the application's entry point. It initializes all other modules, wires up all event listeners (clicks, keydown, etc.), and manages the overall application lifecycle on DOMContentLoaded.

state.js: The Single Source of Truth. Exports a single global appState object that holds all dynamic data (e.g., vizData, isPlaying, currentFrame). All modules import and reference this object to get the current state.

dom.js: The UI Abstraction Layer. Exports constants for every key DOM element (videoPlayer, playPauseBtn, etc.). It also contains functions that directly manipulate the DOM, such as updateFrame() and updatePersistentOverlays(). For any changes to UI text or visibility, this is the primary file to inspect.

sync.js: The Heartbeat/Clock. Contains the animationLoop() function, which is the core of the synchronized playback. It uses performance.now() to create a high-precision clock, calculates the current media time, finds the corresponding radar frame, and handles resynchronization.

fileParsers.js: The Data Processor. Contains the logic for post-processing the raw data from files. parseVisualizationJson() takes the parsed JSON object and enriches it with calculated timestampMs values and determines global SNR ranges.

parser.worker.js: The Heavy Lifter. This Web Worker is responsible for parsing the potentially massive JSON file off the main thread to prevent the UI from freezing. It uses the Clarinet.js streaming parser for efficiency.

db.js: The Caching Layer. Manages all interactions with IndexedDB. It's used to save and load the JSON and video files so that subsequent sessions load almost instantly.

/p5/radarSketch.js: The p5.js sketch responsible for drawing the main radar visualization (point cloud, tracks, axes).

/p5/speedGraphSketch.js: The p5.js sketch for drawing the time-series speed graph.

drawUtils.js: The Artist's Toolkit. Contains pure drawing functions that are called by radarSketch.js. This is where the visual appearance (colors, shapes, lines, text) of the radar objects is defined. To change how tracks or points are drawn, modify this file.

utils.js: A collection of pure, reusable helper functions (e.g., findRadarFrameIndexForTime (binary search), timestamp parsers, throttle).

modal.js: Manages the logic for the pop-up modal dialogs (e.g., for notifications, confirmations, and progress bars).

theme.js: Handles the dark/light mode theme switching and persists the choice to localStorage.

constants.js: Stores shared, static values like VIDEO_FPS and radar plot boundaries.

3. Data Flow & State Management
Data Loading Sequence:
User Action: The user clicks a "Load" button in the UI (index.html).

Event Trigger: The click is handled by an event listener in main.js.

File Selection: The browser's file input is opened.

Caching: Upon file selection, the change event fires. In main.js, the file is immediately sent to db.js to be saved in IndexedDB via saveFileWithMetadata().

Parsing (JSON): The JSON file is passed to the parser.worker.js. The worker streams the file, constructs a complete JavaScript object, and sends it back to main.js.

Processing: main.js receives the parsed object and passes it to fileParsers.js's parseVisualizationJson() function. This function calculates the relative timestamps and other necessary metadata.

State Update: The processed data is stored in the central appState.vizData object in state.js.

UI Update: main.js calls functions in dom.js and creates new p5.js instances (radarSketch, speedGraphSketch) to render the data now available in appState.

State Management (appState):
The appState object in state.js is the central hub. All modules import it and read from it. It is mutated directly by the core logic in main.js and sync.js. Key properties include:

vizData: The large object containing all radar frames and track data.

isPlaying: A boolean that controls the animationLoop.

currentFrame: The integer index of the currently displayed radar frame.

videoStartDate, radarStartTimeMs: Date objects used to calculate the time offset.

p5_instance, speedGraphInstance: References to the active p5.js sketches.

4. Key Logic and Interaction Flows
Playback Synchronization (sync.js): The animationLoop is the core. It does not rely on the video's timeupdate event, which can be imprecise. Instead, it creates its own high-resolution timer with performance.now(). It calculates what the video's currentTime should be and then finds the corresponding radar frame using a binary search (findRadarFrameIndexForTime in utils.js). It periodically checks for drift between its calculated time and the actual video.currentTime and corrects the video if necessary.

UI Updates (dom.js): The updateFrame(frame, forceVideoSeek) function is the primary entry point for changing what's on screen. It updates the frame counter, seeks the video if forceVideoSeek is true, and calls the .redraw() methods on the p5 sketches. It is called both by the animationLoop (for smooth playback) and by UI event listeners like the timeline slider (for seeking).

Session Persistence (main.js & db.js): On DOMContentLoaded, the application first checks localStorage for saved filenames and UI settings. It then calls loadFreshFileFromDB from db.js, which attempts to load the files from IndexedDB. If successful, the application loads the cached data, bypassing the need for the user to re-select the files.

Keyboard Shortcuts (main.js): A single, comprehensive keydown event listener is attached to the document. It checks for various keys and programmatically triggers .click() events on the corresponding DOM elements (e.g., pressing Spacebar clicks the playPauseBtn). It includes a check to prevent shortcuts from firing when the user is typing in an input field.