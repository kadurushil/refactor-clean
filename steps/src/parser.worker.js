// In src/parser.worker.js

// Import the lightweight and worker-safe Clarinet library
importScripts('../vendor/clarinet.min.js'); //importing the clarinet.min.js (ver. 0.12.5) from the vendor folder.  

self.onmessage = async function(event) {
    const file = event.data.file;
    if (!file) {
        self.postMessage({ type: 'error', message: 'No file received in worker.' });
        return;
    }

    try {
        const fileSize = file.size;
        let bytesRead = 0;
        let lastReportedProgress = -1;

        const parser = clarinet.parser();

        // --- START: New Robust Parsing Logic ---
        // This logic correctly builds a complete object tree from the stream.
        let result; // This will hold the final, fully parsed object.
        const stack = []; // A stack to keep track of current object/array.
        let key = null;   // The current object key.

        const getParent = () => stack.length > 0 ? stack[stack.length - 1] : null;

        const assign = (value) => {
            const parent = getParent();
            if (parent) {
                if (Array.isArray(parent)) {
                    parent.push(value);
                } else {
                    parent[key] = value;
                }
            } else {
                result = value;
            }
        };

        parser.onopenobject = (k) => {
            key = k;
            const newObject = {};
            assign(newObject);
            stack.push(newObject);
        };
        
        parser.onkey = (k) => {
            key = k;
        };
        
        parser.onopenarray = () => {
            const newArray = [];
            assign(newArray);
            stack.push(newArray);
        };

        parser.onvalue = (value) => {
            assign(value);
        };

        parser.oncloseobject = () => stack.pop();
        parser.onclosearray = () => stack.pop();
        // --- END: New Robust Parsing Logic ---

        parser.onend = () => {
            self.postMessage({ type: 'progress', percent: 100 });
            // Send the fully constructed 'result' object back to the main thread.
            self.postMessage({ type: 'complete', data: result });
        };

        parser.onerror = (err) => {
            console.error("Worker: Clarinet parsing error:", err);
            self.postMessage({ type: 'error', message: 'Failed to parse JSON structure.' });
        };

        // --- Stream Reading Logic (this part remains the same) ---
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