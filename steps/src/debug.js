// This file centralizes all debug logging flags for the application.
// To enable a specific set of logs, set the corresponding flag to `true`.
// These flags can also be modified at runtime via the browser console
// by accessing the global `debugFlags` object (e.g., `debugFlags.sync = true`).

export const debugFlags = {
  // Logs from videoFrameCallback and animationLoop in sync.js
  sync: true,

  // Logs from the main p5.js draw() functions (e.g., radarSketch.js)
  drawing: true,

  // Logs related to file loading, parsing, and caching
  fileLoading: false,
};