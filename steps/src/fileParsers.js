
//--------------------CAN-LOG PARSER------------------------//


export function processCanLog(logContent, videoStartDate) {
    // The function receives everything it needs as arguments.
    // It no longer looks at the global state.

    if (!videoStartDate) {
        // If the video isn't loaded, it can't do its job.
        // It returns an object describing the problem.
        return { error: "Please load the video file first to synchronize the CAN log.", rawCanLogText: logContent };
    }

    // This is a NEW, LOCAL variable, only for this function.
    const canData = [];
    const lines = logContent.split('\n');
    const logRegex = /(\d{2}):(\d{2}):(\d{2}):(\d{4})\s+Rx\s+\d+\s+0x([0-9a-fA-F]+)\s+s\s+\d+((?:\s+[0-9a-fA-F]{2})+)/;
    const canIdToDecode = '30F';

    for (const line of lines) {
        const match = line.match(logRegex);
        if (match && match[5].toUpperCase() === canIdToDecode) {
            const [h, m, s, ms] = [parseInt(match[1]), parseInt(match[2]), parseInt(match[3]), parseInt(match[4].substring(0, 3))];
            const msgDate = new Date(videoStartDate);
            msgDate.setUTCHours(h, m, s, ms);
            const dataBytes = match[6].trim().split(/\s+/).map(hex => parseInt(hex, 16));
            if (dataBytes.length >= 2) {
                const rawVal = (dataBytes[0] << 3) | (dataBytes[1] >> 5);
                const speed = (rawVal * 0.1).toFixed(1);
                canData.push({ time: msgDate.getTime(), speed: speed });
            }
        }
    }
    // It sorts the LOCAL canData array.
    canData.sort((a, b) => a.time - b.time);

    console.log(`Processed ${canData.length} CAN messages for ID ${canIdToDecode}.`);

    // It returns the finished product in a structured object.
    return { data: canData };
}


//--------------------JSON PARSER------------------------//

// Add this new function to src/fileParsers.js

export function parseVisualizationJson(jsonString, radarStartTimeMs, videoStartDate) {
    try {
        const cleanJsonString = jsonString.replace(/\b(Infinity|NaN|-Infinity)\b/gi, 'null');
        const vizData = JSON.parse(cleanJsonString);

        if (!vizData.radarFrames || vizData.radarFrames.length === 0) {
            return { error: 'Error: The JSON file does not contain any radar frames.' };
        }

        // Perform timestamp calculations
        vizData.radarFrames.forEach(frame => {
            frame.timestampMs = (radarStartTimeMs + frame.timestamp) - videoStartDate.getTime();
        });

        // Calculate SNR range from the data
        let snrValues = [], totalPoints = 0;
        vizData.radarFrames.forEach(frame => {
            if (frame.pointCloud && frame.pointCloud.length > 0) {
                totalPoints += frame.pointCloud.length;
                frame.pointCloud.forEach(p => {
                    if (p.snr !== null) snrValues.push(p.snr);
                });
            }
        });

        if (totalPoints === 0) {
             console.warn('Warning: Loaded frames contain no point cloud data.');
        }

        const minSnr = snrValues.length > 0 ? Math.min(...snrValues) : 0;
        const maxSnr = snrValues.length > 0 ? Math.max(...snrValues) : 1;

        // Return the finished data package
        return { data: vizData, minSnr: minSnr, maxSnr: maxSnr };

    } catch (error) {
        console.error("JSON Parsing Error:", error);
        return { error: 'Error parsing JSON file. Please check file format. Error: ' + error.message };
    }
}