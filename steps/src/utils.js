export function findRadarFrameIndexForTime(targetTimeMs, vizData) {
  if (!vizData || vizData.radarFrames.length === 0) return -1;
  // Initialize low, high, and answer variables for binary search
  // 'ans' will store the index of the closest frame found so far
  // 'low' and 'high' define the search range
  let low = 0,
    high = vizData.radarFrames.length - 1,
    ans = 0;
  // Perform binary search to find the radar frame whose timestamp is closest to, but not exceeding, the target time
  while (low <= high) {
    let mid = Math.floor((low + high) / 2);
    // If the current frame's timestamp is less than or equal to the target time,
    // it's a potential answer, and we try to find a more recent one in the right half.
    if (vizData.radarFrames[mid].timestampMs <= targetTimeMs) {
      ans = mid;
      low = mid + 1;
    } else {
      // If the current frame's timestamp is greater than the target time,
      // we need to look in the left half.
      high = mid - 1;
    }
  }
  // Return the index of the found radar frame.
  return ans;
}

export function findLastCanIndexBefore(targetTime, canData) {
  // Check for empty or invalid CAN data
  if (!canData || canData.length === 0) return -1;

  // Initialize low, high, and answer variables for binary search
  // 'ans' will store the index of the last CAN data point found before the target time
  // 'low' and 'high' define the search range
  let low = 0,
    high = canData.length - 1,
    ans = -1; // Initialize ans to -1, indicating no suitable frame found yet.
  while (low <= high) {
    let mid = Math.floor((low + high) / 2);
    if (canData[mid].time <= targetTime) {
      ans = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  // Return the index of the found CAN data point.
  return ans;
}

export function extractTimestampInfo(filename) {
  // Return null if filename is not provided
  if (!filename) return null;
  // Try to match JSON filename pattern: "Tracks_YYYYMMDD_HHMMSS.ms"
  // Example: Tracks_20231027_103000.123
  let match = filename.match(/Tracks_(\d{8}_\d{6}\.\d{3})/);
  if (match) return { timestampStr: match[1], format: "json" };
  // Try to match video filename pattern (e.g., from GoPro): "WIN_YYYYMMDD_HH_MM_SS"
  // Example: WIN_20231027_10_30_00
  match = filename.match(/WIN_(\d{8})_(\d{2})_(\d{2})_(\d{2})/);
  if (match) {
    const timestamp = `${match[1]}_${match[2]}${match[3]}${match[4]}`;
    return { timestampStr: timestamp, format: "video" };
  }
  // Try to match another common video filename pattern: "video_YYYYMMDD_HHMMSS"
  // Example: video_20231027_103000
  match = filename.match(/video_(\d{8}_\d{6})/);
  if (match)
    return {
      timestampStr: match[1],
      format: "video",
    };
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

/**
 * Creates a throttled function that only invokes the provided function
 * at most once per every `delay` milliseconds.
 * @param {Function} func The function to throttle.
 * @param {number} delay The number of milliseconds to throttle invocations to.
 * @returns {Function} Returns the new throttled function.
 */
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
