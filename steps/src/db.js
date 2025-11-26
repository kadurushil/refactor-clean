let db;
let dbReadyPromise;
let dbReadyResolve;

// Initialize the promise that tracks DB readiness
dbReadyPromise = new Promise((resolve) => {
    dbReadyResolve = resolve;
});

// Initializes the IndexedDB database.
export function initDB(callback) {
  const request = indexedDB.open("visualizerDB", 1);

  request.onupgradeneeded = function (event) {
    const db = event.target.result;
    if (!db.objectStoreNames.contains("files")) {
      db.createObjectStore("files");
    }
  };

  request.onsuccess = function (event) {
    db = event.target.result;
    console.log("Database initialized");
    dbReadyResolve(db); // Signal that DB is ready
    if (callback) callback();
  };

  request.onerror = function (event) {
    console.error("IndexedDB error:", event.target.errorCode);
    // If DB fails, we resolve with null so operations can proceed (gracefully failing to cache)
    dbReadyResolve(null);
    if (callback) callback(); 
  };
}

// Ensure DB is ready before returning it
async function getDB() {
    if (db) return db;
    return await dbReadyPromise;
}

// Saves a file (Blob) along with its metadata into the IndexedDB.
export function saveFileWithMetadata(key, file) {
  return new Promise(async (resolve, reject) => {
    const database = await getDB();
    
    if (!database) {
        // If DB failed to initialize, just warn and skip caching
        console.warn("Database not available. Skipping cache save.");
        resolve(); 
        return;
    }

    const transaction = database.transaction(["files"], "readwrite");
    const store = transaction.objectStore("files");
    
    // Store an object containing the blob and its metadata
    const dataToStore = {
        filename: file.name,
        size: file.size,
        type: file.type,
        blob: file 
    };

    const request = store.put(dataToStore, key);

    request.onsuccess = () => {
        console.log(`File '${file.name}' saved to DB with metadata.`);
        resolve();
    };
    
    // Gracefully handle errors, especially quota limits
    transaction.onerror = (event) => {
        if (event.target.error.name === 'QuotaExceededError') {
            alert("Could not cache file: Browser storage quota exceeded. The app will still work for this session.");
            resolve(); // Resolve anyway to let the app continue without caching
        } else {
            console.error(`Error saving file '${key}':`, event.target.error);
            reject(event.target.error);
        }
    };
  });
}


// Loads a file from IndexedDB, performing checks for filename and size to ensure data integrity.
export function loadFreshFileFromDB(key, expectedFilename) {
    return new Promise(async (resolve) => {
        const database = await getDB();

        if (!database || !expectedFilename) {
            resolve(null);
            return;
        }

        const transaction = database.transaction(["files"], "readonly");
        const store = transaction.objectStore("files");
        const request = store.get(key);

        request.onsuccess = function () {
            const cachedData = request.result;
            if (!cachedData) {
                console.log(`Cache miss for key '${key}': No data found.`);
                resolve(null);
                return;
            }

            // 1. Versioning Check: Do the filenames match?
            if (cachedData.filename !== expectedFilename) {
                console.warn(`Cache miss for key '${key}': Stale data found (Filename mismatch).`);
                resolve(null);
                return;
            }

            // 2. Integrity Check: Do the sizes match?
            if (cachedData.blob.size !== cachedData.size) {
                console.error(`Cache miss for key '${key}': Corrupted data found (Size mismatch).`);
                resolve(null);
                return;
            }

            // All checks passed!
            console.log(`Cache hit for '${expectedFilename}'`);
            resolve(cachedData.blob);
        };

        request.onerror = (event) => {
            console.error(`Error loading file '${key}' from DB:`, event.target.error);
            resolve(null);
        };
    });
}
