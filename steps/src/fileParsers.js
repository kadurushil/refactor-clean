/**
 * Parses a JSON file stream using Oboe.js to handle very large files.
 * @param {string} fileURL - A temporary URL created from the file object.
 * @param {function} onProgress - A callback to update the UI on progress.
 * @param {function} onComplete - A callback to run when parsing is complete.
 * @param {function} onError - A callback to run if an error occurs.
 */
// This function can be deleted if it exists: parseJsonStream
// This function can be deleted if it exists: parseJsonWithOboe

// Add this simplified streaming function
export function parseJsonWithOboe(fileURL, onComplete, onError) {
  const vizData = {
    radarFrames: [],
    tracks: [],
  };

  oboe(fileURL)
    .node("radarFrames[*]", (frame) => {
      vizData.radarFrames.push(frame);
      return oboe.drop;
    })
    .node("tracks[*]", (track) => {
      vizData.tracks.push(track);
      return oboe.drop;
    })
    .done(() => {
      console.log("Oboe.js parsing complete.");
      onComplete(vizData);
    })
    .fail((err) => {
      console.error("Oboe.js parsing failed:", err);
      onError(
        "Error parsing JSON stream. Please check file format and console."
      );
    });
}


//--------------------CAN-LOG PARSER------------------------//

export function processCanLog(logContent, videoStartDate) {
  // The function now receives all necessary data (logContent, videoStartDate) as arguments,
  // making it a pure function that doesn't rely on global state.
  if (!videoStartDate) {
    // If videoStartDate is not provided, it means the video file hasn't been loaded yet.
    // The CAN log cannot be synchronized without it, so an error is returned.
    return {
      // Error message to be displayed to the user.
      error: "Please load the video file first to synchronize the CAN log.",
      // The raw log content is returned so it can be stored and processed later
      // once the videoStartDate becomes available.
      rawCanLogText: logContent,
    };
  }

  // This is a NEW, LOCAL variable, only for this function.
  const canData = [];
  const lines = logContent.split("\n");
  // Regular expression to parse CAN log lines.
  // It captures time components (HH:MM:SS:ms), CAN ID, and data bytes.
  const logRegex =
    /(\d{2}):(\d{2}):(\d{2}):(\d{4})\s+Rx\s+\d+\s+0x([0-9a-fA-F]+)\s+s\s+\d+((?:\s+[0-9a-fA-F]{2})+)/;
  // The specific CAN ID (0x30F) we are interested in for speed data.
  const canIdToDecode = "30F";

  for (const line of lines) {
    const match = line.match(logRegex);
    // Check if the line matches the regex and if the CAN ID is the one we want.
    if (match && match[5].toUpperCase() === canIdToDecode) {
      // Extract time components from the regex match.
      const [h, m, s, ms] = [
        parseInt(match[1]),
        parseInt(match[2]),
        parseInt(match[3]),
        parseInt(match[4].substring(0, 3)),
      ];
      // Create a Date object for the CAN message timestamp.
      // It uses the video's start date and then sets the time components from the log.
      const msgDate = new Date(videoStartDate);
      msgDate.setUTCHours(h, m, s, ms);
      // Extract and parse data bytes from the regex match.
      const dataBytes = match[6]
        .trim()
        .split(/\s+/)
        .map((hex) => parseInt(hex, 16));
      // Check if there are enough data bytes to extract speed information.
      if (dataBytes.length >= 2) {
        // Decode the raw speed value from the first two data bytes.
        // This specific decoding logic is based on the CAN message format.
        const rawVal = (dataBytes[0] << 3) | (dataBytes[1] >> 5);
        // Convert the raw value to km/h and format it to one decimal place.
        const speed = (rawVal * 0.1).toFixed(1);
        canData.push({ time: msgDate.getTime(), speed: speed });
      }
    }
  }
  // Sort the processed CAN data points by their timestamp.
  canData.sort((a, b) => a.time - b.time);

  console.log(
    `Processed ${canData.length} CAN messages for ID ${canIdToDecode}.`
  );

  // It returns the finished product in a structured object.
  // The processed CAN data is returned under the 'data' key.
  return { data: canData };
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

    if (videoStartDate && radarStartTimeMs) {
      await processArrayInChunks(vizData.radarFrames, 5000, (chunk) => {
        chunk.forEach((frame) => {
          frame.timestampMs =
            radarStartTimeMs + frame.timestamp - videoStartDate.getTime();
        });
      });
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
