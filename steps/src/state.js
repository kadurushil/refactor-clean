export const appState = {
  // Stores the parsed visualization data (radar frames, tracks, etc.)
  vizData: null,
  // Stores the processed CAN bus data (speed, time)
  canData: [],
  // Temporarily holds raw CAN log text if video start date is not yet available for processing
  rawCanLogText: null,
  // The Date object representing the start time of the video
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
  canLogFilename: "",
  // Boolean indicating if the close-up interaction mode is active
  isCloseUpMode: false,
  // Timestamp (from performance.now()) when the master clock started for synchronized playback
  masterClockStart: 0,
  // The media time (in seconds) of the video when the master clock started
  mediaTimeStart: 0,
  // Timestamp (from performance.now()) of the last synchronization check
  lastSyncTime: 0,
};
