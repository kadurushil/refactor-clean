// This file centralizes all debug logging flags for the application.
// To enable a specific set of logs, set the corresponding flag to `true`.
// These flags can also be modified at runtime via the browser console
// by accessing the global `debugFlags` object (e.g., `debugFlags.sync = true`).

export const debugFlags = {
  // Logs from videoFrameCallback and animationLoop in sync.js
  sync: false,

  // Logs from the main p5.js draw() functions (e.g., radarSketch.js)
  drawing: false,

  // Logs related to file loading, parsing, and caching
  fileLoading: false,

  // If true, file caching blocks the main thread for debugging.
  CACHE_BLOCKING: false,

  VIDEO_LOAD_TIMEOUT: 10000, // 10 seconds
  VIDEO_LOAD_RETRIES: 1, // Number of retries if loading fails
};