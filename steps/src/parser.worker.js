// Import the lightweight and worker-safe Clarinet library
importScripts('https://cdn.jsdelivr.net/npm/clarinet@0.12.5/clarinet.min.js');

self.onmessage = async function(event) {
    const file = event.data.file;
    if (!file) {
        self.postMessage({ type: 'error', message: 'No file received in worker.' });
        return;
    }

    try {
        console.log('Worker: Starting robust parsing with debugging...');

        const fileSize = file.size;
        let bytesRead = 0;
        let lastReportedProgress = -1;

        const parser = clarinet.parser();
        const vizData = { radarFrames: [], tracks: [] };
        
        // A simple state machine to track our location
        let state = {
            inRadarFrames: false,
            inTracks: false,
            currentObject: null,
            currentKey: ''
        };

        parser.onkey = (key) => {
            state.currentKey = key;
            if (key === 'radarFrames') state.inRadarFrames = true;
            if (key === 'tracks') state.inTracks = true;
        };

        parser.onopenobject = () => {
            // We only care about objects inside our target arrays
            if (state.inRadarFrames || state.inTracks) {
                state.currentObject = {};
            }
        };
        
        parser.oncloseobject = () => {
            if (state.currentObject) {
                if (state.inRadarFrames) {
                    vizData.radarFrames.push(state.currentObject);
                } else if (state.inTracks) {
                    vizData.tracks.push(state.currentObject);
                }
                state.currentObject = null; // Reset for the next object
            }
        };

        parser.onclosearray = () => {
            // When we finish an array, update our state
            if (state.inRadarFrames) state.inRadarFrames = false;
            if (state.inTracks) state.inTracks = false;
        };
        
        parser.onvalue = (value) => {
            if (state.currentObject && state.currentKey) {
                state.currentObject[state.currentKey] = value;
            }
        };

        parser.onend = () => {
            // --- DEBUGGING MESSAGES ---
            console.log("Worker: Parsing complete.");
            console.log("Worker: Final vizData structure:", vizData);
            console.log("Worker: Number of radar frames parsed:", vizData.radarFrames ? vizData.radarFrames.length : 'undefined');
            console.log("Worker: Number of tracks parsed:", vizData.tracks ? vizData.tracks.length : 'undefined');
            // --- END DEBUGGING ---

            self.postMessage({ type: 'progress', percent: 100 });
            self.postMessage({ type: 'complete', data: vizData });
        };

        parser.onerror = (err) => {
            console.error("Worker: Clarinet parsing error:", err);
            self.postMessage({ type: 'error', message: 'Failed to parse JSON structure.' });
        };

        // --- Stream Reading Logic (remains the same) ---
        const stream = file.stream();
        const reader = stream.getReader();
        const decoder = new TextDecoder();

        while (true) {
            const { done, value } = await reader.read();
            if (done) {
                parser.close();
                break;
            }
            bytesRead += value.length;
            const percent = Math.round((bytesRead / fileSize) * 100);
            if (percent > lastReportedProgress) {
                self.postMessage({ type: 'progress', percent: percent });
                lastReportedProgress = percent;
            }
            parser.write(decoder.decode(value, { stream: true }));
        }

    } catch (error) {
        console.error("Worker: An error occurred during streaming:", error);
        self.postMessage({ type: 'error', message: 'Failed to read file in worker.' });
    }
};