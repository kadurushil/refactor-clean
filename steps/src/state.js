export const appState = {
  zoomHideDelayTimeout: null, // Timeout before the hide countdown begins
  zoomCountdown: null, // Holds the number of seconds left before zoom hides
  zoomCountdownInterval: null, // The interval timer for the countdown
  fps: 0, // To store the calculated FPS for performance monitoring
  isRawOnlyMode: false, // <-- ADD THIS LINE
  videoReadyByFallback: false, // True if video resolved via loadedmetadata timeout
  videoMissing: false, // True if user opts to continue without a video


  // Stores the parsed visualization data (radar frames, tracks, etc.)
  vizData: null,
  zoomSketchInstance: null, // Add this line
  // Stores the processed CAN bus data (speed, time)
  offset: 0, // The calculated or manually set offset in milliseconds.

  videoStartDate: null,
  // The timestamp (in milliseconds) of the first radar frame, extracted from the JSON filename
  radarStartTimeMs: 0,
  // Boolean indicating if the playback is currently active
  isPlaying: false,
  // The index of the currently displayed radar frame
  currentFrame: 0,
  // The global minimum SNR value across all radar frames, used for color scaling
  globalMinSnr: 0,
  // The global maximum SNR value across all radar frames, used for color scaling
  globalMaxSnr: 1,
  // Reference to the p5.js instance for the radar visualization
  p5_instance: null,
  // Reference to the p5.js instance for the speed graph visualization
  speedGraphInstance: null,
  // The filename of the loaded JSON file
  jsonFilename: "",
  // The filename of the loaded video file
  videoFilename: "",
  // The filename of the loaded CAN log file
  isCloseUpMode: false,
  // Timestamp (from performance.now()) when the master clock started for synchronized playback
  masterClockStart: 0,
  // The media time (in seconds) of the video when the master clock started
  mediaTimeStart: 0,
  // Timestamp (from performance.now()) of the last synchronization check
  lastSyncTime: 0,
  lastFrameRenderTime: 0,
  lastVideoFrameTime: 0,
  videoFrameRenderTime: 0,
  useCustomTtcScheme: false, // Flag to switch between default and custom
  customTtcScheme: {
    // Default values match the UI
    critical: { time: 1, color: "#ff0000" },
    high: { time: 2, color: "#ffa500" },
    medium: { time: 3, color: "#BA8E23" },
    low: { color: "#00ff00" }, // Add this new line
  },
  // --- Resync Storm "Circuit Breaker" ---
  isResyncLockdownEnabled: true, // Feature is enabled by default
  lastResyncTimestamp: 0, // Timestamp of the last resync event
  consecutiveResyncs: 0, // Counter for consecutive resyncs
  isInLockdown: false, // Flag to prevent nested lockdown triggers

};
