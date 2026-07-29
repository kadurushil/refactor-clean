import { appState, getVideoFps } from "./state.js";
import { VIDEO_FPS } from "./constants.js";

/**
 * Performs a binary search on the radar frames to find the frame index
 * closest to the target video time.
 *
 * @param {number} targetTimeSec - The target time in seconds (from video.currentTime).
 * @param {object} vizData - The visualization data containing radarFrames.
 * @returns {number} The index of the closest radar frame.
 */
export function findRadarFrameIndexForTime(targetTimeSec, vizData) {
  if (!vizData || vizData.radarFrames.length === 0) return -1;
  // Initialize low, high, and answer variables for binary search
  // 'ans' will store the index of the closest frame found so far
  // 'low' and 'high' define the search range
  let low = 0,
    high = vizData.radarFrames.length - 1;

  // Perform binary search to find the radar frame whose timestamp is closest to, but not exceeding, the target time
  while (low <= high) {
    let mid = Math.floor((low + high) / 2);
    const frameTime = vizData.radarFrames[mid].videoSyncedTime;

    if (frameTime < targetTimeSec) {
      low = mid + 1;
    } else if (frameTime > targetTimeSec) {
      high = mid - 1;
    } else {
      // Exact match found
      return mid;
    }
  }
  // No exact match, return the closest index (clamped to bounds)
  return Math.max(0, Math.min(high, vizData.radarFrames.length - 1));
}



export function extractTimestampInfo(filename) {
  // Return null if filename is not provided
  if (!filename) return null;

  // Try to match the old JSON filename pattern: "Tracks_YYYYMMDD_HHMMSS.ms"
  let match = filename.match(/Tracks_(\d{8}_\d{6}\.\d{3})/);
  if (match) return { timestampStr: match[1], format: "json" };

  // NEW: Add this block to match the new filename pattern
  match = filename.match(/fHist_(\d{8}_\d{6}\.\d{3})/);
  if (match) return { timestampStr: match[1], format: "json" };

  // Try to match video filename pattern (e.g., from GoPro): "WIN_YYYYMMDD_HH_MM_SS"
  match = filename.match(/WIN_(\d{8})_(\d{2})_(\d{2})_(\d{2})/);
  if (match) {
    const timestamp = `${match[1]}_${match[2]}${match[3]}${match[4]}`;
    return { timestampStr: timestamp, format: "video" };
  }
  // Try to match generic YYYYMMDD_HHMMSS or similar patterns anywhere in the name
  // Examples: video_20231027_103000, cam_20260312_163310, 20260312163310
  match = filename.match(/((?:19|20)\d{2})(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])[-_]?([01]\d|2[0-3])([0-5]\d)([0-5]\d)/);
  if (match) {
    const timestamp = `${match[1]}${match[2]}${match[3]}_${match[4]}${match[5]}${match[6]}`;
    return { timestampStr: timestamp, format: "video" };
  }

  // Try generic DDMMYYYY_HHMMSS pattern just in case
  match = filename.match(/(0[1-9]|[12]\d|3[01])(0[1-9]|1[0-2])((?:19|20)\d{2})[-_]?([01]\d|2[0-3])([0-5]\d)([0-5]\d)/);
  if (match) {
    const timestamp = `${match[3]}${match[2]}${match[1]}_${match[4]}${match[5]}${match[6]}`;
    return { timestampStr: timestamp, format: "video" };
  }
  // If no pattern matches, return null
  return null;
}

export function parseTimestamp(timestampStr, format) {
  // Return null if timestamp string or format is not provided.
  if (!timestampStr || !format) return null;
  let day,
    month,
    year,
    hour,
    minute,
    second,
    millisecond = 0;
  // Parse video timestamp format: YYYYMMDD_HH_MM_SS
  // Example: 20231027_10_30_00
  if (format === "video") {
    [year, month, day] = [
      timestampStr.substring(0, 4),
      timestampStr.substring(4, 6),
      timestampStr.substring(6, 8),
    ];
    [hour, minute, second] = [
      timestampStr.substring(9, 11),
      timestampStr.substring(11, 13),
      timestampStr.substring(13, 15),
    ];
  }
  else if (format === "json") {
    // Parse JSON timestamp format: DDMMYYYY_HHMMSS.ms
    [day, month, year] = [
      timestampStr.substring(0, 2),
      timestampStr.substring(2, 4),
      timestampStr.substring(4, 8),
    ];
    [hour, minute, second, millisecond] = [
      timestampStr.substring(9, 11),
      timestampStr.substring(11, 13),
      timestampStr.substring(13, 15),
      parseInt(timestampStr.substring(16, 19)),
    ];
  } else {
    // Return null for unsupported formats
    return null;
  } // Create a Date object using UTC to avoid timezone issues
  const date = new Date(
    Date.UTC(year, month - 1, day, hour, minute, second, millisecond)
  );

  // Check if the created Date object is valid.
  // If getTime() returns NaN, the date is invalid.
  return isNaN(date.getTime()) ? null : date;
}
export function throttle(func, delay) {
  // `lastCall` keeps track of the timestamp of the last successful invocation.
  let lastCall = 0;
  // Return a new function that, when called, will throttle the execution of the original function
  return function (...args) {
    // Get the current timestamp.
    const now = new Date().getTime();

    // If the time since the last call is less than the delay, do not execute the function
    if (now - lastCall < delay) {
      return;
    }
    // Otherwise, update the last call time and execute the original function
    lastCall = now;
    return func(...args); // Apply the original function with its arguments.
  };
}

export function formatTime(milliseconds) {
    if (isNaN(milliseconds) || milliseconds < 0) {
        return "00:00.000";
    }
    const totalSeconds = milliseconds / 1000;
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = Math.floor(totalSeconds % 60);
    const ms = Math.round(milliseconds % 1000);

    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
}

export function formatUTCTime(date) {
    if (!date || isNaN(date.getTime())) {
        return "00:00:00.000";
    }
    const hours = String(date.getUTCHours()).padStart(2, '0');
    const minutes = String(date.getUTCMinutes()).padStart(2, '0');
    const seconds = String(date.getUTCSeconds()).padStart(2, '0');
    const milliseconds = String(date.getUTCMilliseconds()).padStart(3, '0');
    return `${hours}:${minutes}:${seconds}.${milliseconds}`;
}

/**
 * Pre-calculates the video-synchronized timestamp for each radar frame.
 * If frame_mapping.json is active, bakes exact per-frame video timestamps.
 *
 * @param {object} vizData - The visualization data containing radarFrames.
 * @param {number} offsetMs - The time offset between radar and video in milliseconds.
 */
export function precomputeRadarVideoSync(vizData, offsetMs) {
  if (!vizData || !vizData.radarFrames) return;

  if (appState.hasFrameMapping && appState.frameMappingTable && appState.frameMappingTable.length > 0) {
    const firstMapRecord = appState.frameMappingTable[0];
    const fps = getVideoFps();
    const videoStartUnixSec = firstMapRecord.video_frame_ts
      ? firstMapRecord.video_frame_ts - (firstMapRecord.video_frame_index * (1 / fps))
      : 0;

    // Build O(1) Map lookup table by relFrameId for 100x precompute performance
    const mapByRelId = new Map();
    appState.frameMappingTable.forEach((record) => {
      if (record && record.radar_frame_id_rel !== undefined) {
        mapByRelId.set(record.radar_frame_id_rel, record);
      }
    });

    vizData.radarFrames.forEach((frame, idx) => {
      const relFrameId = idx + 1;
      const mapRecord = mapByRelId.get(relFrameId);

      if (mapRecord && mapRecord.video_frame_ts && videoStartUnixSec > 0) {
        frame.videoSyncedTime = mapRecord.video_frame_ts - videoStartUnixSec;
      } else if (mapRecord && mapRecord.video_frame_index !== undefined) {
        frame.videoSyncedTime = mapRecord.video_frame_index * (1 / fps);
      } else {
        frame.videoSyncedTime = (frame.timestamp + offsetMs) / 1000;
      }
    });
    console.log("Precomputed per-frame video sync using frame_mapping.json");
    return;
  }

  vizData.radarFrames.forEach((frame) => {
    frame.videoSyncedTime = (frame.timestamp + offsetMs) / 1000;
  });
}
