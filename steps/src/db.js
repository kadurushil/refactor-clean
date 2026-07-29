let db;
let dbReadyPromise;
let dbReadyResolve;
import { showModal } from "./modal.js";

// Initialize the promise that tracks DB readiness
dbReadyPromise = new Promise((resolve) => {
    dbReadyResolve = resolve;
});

// Initializes the IndexedDB database.
export function initDB() {
  const request = indexedDB.open("visualizerDB", 2);

  request.onupgradeneeded = function (event) {
    const db = event.target.result;
    if (!db.objectStoreNames.contains("files")) {
      db.createObjectStore("files");
    }
    // Create the new store for manual offsets
    if (!db.objectStoreNames.contains("manualOffsets")) {
      db.createObjectStore("manualOffsets");
    }
  };

  request.onsuccess = function (event) {
    db = event.target.result;
    console.log("Database initialized");
    dbReadyResolve(db); // Signal that DB is ready
  };

  request.onerror = function (event) {
    console.error("IndexedDB error:", event.target.errorCode);
    // If DB fails, we resolve with null so operations can proceed (gracefully failing to cache)
    dbReadyResolve(null);
  };

  return dbReadyPromise;
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
            showModal("Could not cache file: Browser storage quota exceeded. The app will still work for this session, but files won't be saved for next time.");
            resolve(); // Resolve anyway to let the app continue without caching
        } else {
            console.error(`Error saving file '${key}':`, event.target.error);
            reject(event.target.error);
        }
    };
  });
}


// Saves a manual offset for a specific filename.
export function saveManualOffset(filename, offset) {
  return new Promise(async (resolve, reject) => {
    const database = await getDB();
    if (!database || !filename) {
      resolve(); // Fail silently if DB is not available or filename is missing
      return;
    }
    const transaction = database.transaction(["manualOffsets"], "readwrite");
    const store = transaction.objectStore("manualOffsets");
    const request = store.put(offset, filename); // Key is filename, value is offset

    request.onsuccess = () => {
      console.log(`Manual offset ${offset}ms saved for '${filename}'.`);
      resolve();
    };
    request.onerror = (e) => {
      console.warn("Failed to save manual offset:", e);
      resolve(); // Resolve anyway to prevent blocking
    };
  });
}

// Loads a manual offset for a specific filename.
export function loadManualOffset(filename) {
  return new Promise(async (resolve) => {
    const database = await getDB();
    if (!database || !filename) {
      resolve(null);
      return;
    }
    const transaction = database.transaction(["manualOffsets"], "readonly");
    const store = transaction.objectStore("manualOffsets");
    const request = store.get(filename);

    request.onsuccess = () => {
      const result = request.result;
      if (result !== undefined) {
        console.log(`Found saved manual offset for '${filename}': ${result}ms`);
        resolve(result);
      } else {
        resolve(null);
      }
    };
    request.onerror = () => {
      resolve(null);
    };
  });
}

// Deletes a manual offset for a specific filename.
export function deleteManualOffset(filename) {
  return new Promise(async (resolve) => {
    const database = await getDB();
    if (!database || !filename) {
      resolve();
      return;
    }
    const transaction = database.transaction(["manualOffsets"], "readwrite");
    const store = transaction.objectStore("manualOffsets");
    const request = store.delete(filename);

    request.onsuccess = () => {
      console.log(`Manual offset for '${filename}' deleted.`);
      resolve();
    };
    request.onerror = (e) => {
      console.warn("Failed to delete manual offset:", e);
      resolve();
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

// Queries IndexedDB for cached files, returning the file count and total size formatted.
export function getCacheStats() {
  return new Promise(async (resolve) => {
    const database = await getDB();
    if (!database) {
      resolve({ count: 0, sizeStr: "0.00 KB" });
      return;
    }
    try {
      const transaction = database.transaction(["files"], "readonly");
      const store = transaction.objectStore("files");
      const request = store.openCursor();
      let count = 0;
      let totalBytes = 0;

      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          count++;
          if (cursor.value && cursor.value.size) {
            totalBytes += cursor.value.size;
          }
          cursor.continue();
        } else {
          // Format size
          let sizeStr = "0.00 KB";
          if (totalBytes >= 1024 * 1024) {
            sizeStr = `${(totalBytes / (1024 * 1024)).toFixed(2)} MB`;
          } else if (totalBytes >= 1024) {
            sizeStr = `${(totalBytes / 1024).toFixed(2)} KB`;
          } else if (totalBytes > 0) {
            sizeStr = `${totalBytes} Bytes`;
          }
          resolve({ count, sizeStr });
        }
      };

      request.onerror = (event) => {
        console.warn("Error checking cache stats:", event.target.error);
        resolve({ count: 0, sizeStr: "0.00 KB" });
      };
    } catch (e) {
      console.warn("Exception during cache stats check:", e);
      resolve({ count: 0, sizeStr: "0.00 KB" });
    }
  });
}

