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

//--------------------JSON PARSER------------------------//

export function parseVisualizationJson(
  jsonString,
  radarStartTimeMs,
  videoStartDate
) {
  try {
    // Replace Infinity, NaN, and -Infinity with "null" to prevent JSON.parse errors.
    const cleanJsonString = jsonString.replace(
      /\b(Infinity|NaN|-Infinity)\b/gi,
      "null"
    );
    // Parse the cleaned JSON string into a JavaScript object.
    const vizData = JSON.parse(cleanJsonString);

    // Validate if the parsed data contains radar frames.
    if (!vizData.radarFrames || vizData.radarFrames.length === 0) {
      return {
        error: "Error: The JSON file does not contain any radar frames.",
      };
    }

    // Perform timestamp calculations for each radar frame.
    // The `timestampMs` for each frame is calculated relative to the video's start time,
    // taking into account the `radarStartTimeMs` (extracted from JSON filename)
    // and the `videoStartDate` (extracted from video filename).
    // This ensures synchronization between radar data and video.
    vizData.radarFrames.forEach((frame) => {
      frame.timestampMs =
        radarStartTimeMs + frame.timestamp - videoStartDate.getTime();
    });

    // Calculate SNR range from the data
    let snrValues = [],
      totalPoints = 0; // Counter for total points across all frames.
    vizData.radarFrames.forEach((frame) => {
      if (frame.pointCloud && frame.pointCloud.length > 0) {
        totalPoints += frame.pointCloud.length;
        frame.pointCloud.forEach((p) => {
          // Collect SNR values, ignoring nulls.
          if (p.snr !== null) snrValues.push(p.snr);
        });
      }
    });

    // Warn if no point cloud data was found in the loaded frames.
    if (totalPoints === 0) {
      console.warn("Warning: Loaded frames contain no point cloud data.");
    }

    // Determine the global minimum and maximum SNR values from the collected data.
    // These values are used for scaling the SNR color legend.
    // Default to 0 and 1 if no SNR values are found to prevent errors.
    const minSnr = snrValues.length > 0 ? Math.min(...snrValues) : 0;
    const maxSnr = snrValues.length > 0 ? Math.max(...snrValues) : 1;

    // Return the finished data package
    // This object contains the processed visualization data, and the calculated min/max SNR.
    return { data: vizData, minSnr: minSnr, maxSnr: maxSnr };
  } catch (error) {
    console.error("JSON Parsing Error:", error);
    return {
      error:
        "Error parsing JSON file. Please check file format. Error: " +
        error.message,
    };
  }
}
