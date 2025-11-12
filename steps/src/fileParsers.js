export function parseJsonWithOboe(fileURL, onComplete, onError, onProgress) {
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
    // Add the progress listener
    .on("progress", (progress) => {
      // Oboe.js provides a progress object with a 'percent' property
      if (onProgress) {
        onProgress(progress.percent);
      }
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
