// Helper to read boolean flag from localStorage (defaulting to false)
function getSavedFlag(key, defaultValue = false) {
  const saved = localStorage.getItem(`debug_${key}`);
  if (saved === null) return defaultValue;
  return saved === "true";
}

export const debugFlags = {
  // Logs from videoFrameCallback and animationLoop in sync.js
  sync: getSavedFlag("sync", false),

  // Logs from the main p5.js draw() functions (e.g., radarSketch.js)
  drawing: getSavedFlag("drawing", false),

  // Logs related to file loading, parsing, frame mapping, and video FPS
  fileLoading: getSavedFlag("fileLoading", true),

  // Logs from the SpeedGraph p5 sketch (density info, etc.)
  speedGraph: getSavedFlag("speedGraph", false),

  // Logs related to UI layout, panel movement, and reset operations
  ui: getSavedFlag("ui", false),

  // Logs related to IndexedDB database initialization and file caching
  database: getSavedFlag("database", true),

  // Logs related to session initialization and auto-reload checking
  session: getSavedFlag("session", true),

  // If true, file caching blocks the main thread for debugging.
  CACHE_BLOCKING: false,

  VIDEO_LOAD_TIMEOUT: 10000, // 10 seconds
  VIDEO_LOAD_RETRIES: 1, // Number of retries if loading fails
};

// Helper function to update a debug flag dynamically and save to localStorage
export function setDebugFlag(flagName, value) {
  debugFlags[flagName] = value;
  localStorage.setItem(`debug_${flagName}`, value);
}