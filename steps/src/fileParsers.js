import { debugFlags } from "./debug.js";

export function parseJsonWithOboe(fileURL, onComplete, onError, onProgress) {
  const vizData = {
    radarFrames: [],
    tracks: [],
    version_info: null,
  };

  oboe(fileURL)
    .node("version_info", (info) => {
      vizData.version_info = info;
      return oboe.drop;
    })
    .node("radarFrames[*]", (frame) => {
      vizData.radarFrames.push(frame);
      return oboe.drop;
    })
    .node("tracks[*]", (track) => {
      vizData.tracks.push(track);
      return oboe.drop;
    })
    // Add the progress listener
    .on("progress", (progress) => {
      // Oboe.js provides a progress object with a 'percent' property
      if (onProgress) {
        onProgress(progress.percent);
      }
    })
    .done(() => {
      if (debugFlags.fileLoading) console.log("Oboe.js parsing complete.");
      onComplete(vizData);
    })
    .fail((err) => {
      console.error("Oboe.js parsing failed:", err);
      onError(
        "Error parsing JSON stream. Please check file format and console."
      );
    });
}

//--------------------JSON POST-PROCESSOR (ASYNCHRONOUS & SAFE)------------------------//

// Helper function to process large arrays in chunks without blocking
async function processArrayInChunks(array, chunkSize, processingFn) {
  for (let i = 0; i < array.length; i += chunkSize) {
    const chunk = array.slice(i, i + chunkSize);
    processingFn(chunk);
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

// Helper to extract version metadata across varying structures:
// 1. vizData.version_info (canonical schema)
// 2. vizData.python_tracking_version (when nested as an object containing build info)
// 3. Flat version keys directly on vizData (e.g., vizData.python_tracking_version as string)
export function extractVersionInfo(data) {
  if (!data || typeof data !== "object") return null;

  // Case 1: Standard "version_info" object
  if (data.version_info && typeof data.version_info === "object" && !Array.isArray(data.version_info)) {
    return data.version_info;
  }

  // Case 2: Nested under python_tracking_version (e.g. from previous parser state or alternate layout)
  if (
    data.python_tracking_version &&
    typeof data.python_tracking_version === "object" &&
    !Array.isArray(data.python_tracking_version)
  ) {
    return data.python_tracking_version;
  }

  // Case 3: Flat version properties directly on data
  const versionKeys = [
    "python_tracking_version",
    "python_utils_version",
    "dss_version",
    "mss_version",
    "tracking_version",
  ];
  const flatVersions = {};
  for (const k of Object.keys(data)) {
    if (k.endsWith("_version") || versionKeys.includes(k)) {
      if (typeof data[k] === "string" || typeof data[k] === "number") {
        flatVersions[k] = data[k];
      }
    }
  }
  if (Object.keys(flatVersions).length > 0) {
    return flatVersions;
  }

  return null;
}

export async function parseVisualizationJson(
  vizData,
  radarStartTimeMs,
  videoStartDate
) {
  try {
    if (!vizData.radarFrames || vizData.radarFrames.length === 0) {
      return {
        error: "Error: The JSON file does not contain any radar frames.",
      };
    }

    // Normalize version_info onto vizData
    if (!vizData.version_info) {
      const extracted = extractVersionInfo(vizData);
      if (extracted) {
        vizData.version_info = extracted;
      }
    }

    // Calculate offset: (Radar Start - Video Start). Defaults to 0 if Video Start is unknown.
    let offset = 0;
    if (videoStartDate && radarStartTimeMs) {
        offset = radarStartTimeMs - videoStartDate.getTime();
    }

    // Always populate timestampMs (Time relative to video start, in ms)
    await processArrayInChunks(vizData.radarFrames, 5000, (chunk) => {
    chunk.forEach((frame) => {
        // frame.timestamp is assumed to be ms from the radar log start.
        // We add the offset to align it with the video timeline.
        frame.timestampMs = frame.timestamp + offset;
    });
    });

    // Calculate interFrameTime for each frame
    const radarFrames = vizData.radarFrames;
    for (let i = 0; i < radarFrames.length; i++) {
        if (i < radarFrames.length - 1) {
            radarFrames[i].interFrameTime = radarFrames[i + 1].timestampMs - radarFrames[i].timestampMs;
        } else {
            // Last frame edge case: set its interFrameTime equal to the previous frame's interFrameTime
            if (radarFrames.length > 1) {
                radarFrames[i].interFrameTime = radarFrames[i - 1].interFrameTime;
            } else {
                radarFrames[i].interFrameTime = 0; // Only one frame, so interFrameTime is 0
            }
        }
    }

    // --- Pre-calculate Max Window IFT for Smart Zoom (Sliding Window) ---
    // This eliminates the need for real-time lookahead scanning in the render loop.
    const lookahead = 80; 
    for (let i = 0; i < radarFrames.length; i++) {
        let localMax = 0;
        const start = Math.max(0, i - lookahead);
        const end = Math.min(radarFrames.length - 1, i + lookahead);
        
        for (let j = start; j <= end; j++) {
             const val = radarFrames[j].interFrameTime || 0;
             if (val > localMax) localMax = val;
        }
        radarFrames[i].maxWindowIFT = localMax;
    }

    let snrValues = [];
    let totalPoints = 0;
    await processArrayInChunks(vizData.radarFrames, 5000, (chunk) => {
      chunk.forEach((frame) => {
        if (frame.pointCloud && frame.pointCloud.length > 0) {
          totalPoints += frame.pointCloud.length;
          frame.pointCloud.forEach((p) => {
            if (p.snr !== null) snrValues.push(p.snr);
          });
        }
      });
    });

    if (totalPoints === 0) {
      console.warn("Warning: Loaded frames contain no point cloud data.");
    }

    // --- FINAL FIX IS HERE ---
    // Manually calculate min and max to avoid stack overflow
    let minSnr = 0;
    let maxSnr = 1;
    if (snrValues.length > 0) {
      minSnr = snrValues[0];
      maxSnr = snrValues[0];
      for (let i = 1; i < snrValues.length; i++) {
        if (snrValues[i] < minSnr) minSnr = snrValues[i];
        if (snrValues[i] > maxSnr) maxSnr = snrValues[i];
      }
    }
    // --- END OF FIX ---

    return { data: vizData, minSnr: minSnr, maxSnr: maxSnr };
  } catch (error) {
    console.error("JSON Processing Error:", error);
    return { error: "Error processing the JSON data. Error: " + error.message };
  }
}
