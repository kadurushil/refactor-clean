export const appState = {
  // Stores the parsed visualization data (radar frames, tracks, etc.)
  vizData: null,
  // Stores the processed CAN bus data (speed, time)
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
  // new flag for seek finished
  needsPostSeekUpdate: false, 
};
