// In src/db.js, replace the entire file content with this:

let db;

// Initializes the IndexedDB database.
// Opens or creates the 'visualizerDB' database.
export function initDB(callback) {
  const request = indexedDB.open("visualizerDB", 1);

  request.onupgradeneeded = function (event) {
    const db = event.target.result;
    if (!db.objectStoreNames.contains("files")) {
      db.createObjectStore("files");
 // Creates an object store named 'files' if it doesn't exist.
    }
  };

  request.onsuccess = function (event) {
    db = event.target.result;
    console.log("Database initialized");
 // Assigns the opened database to the 'db' variable.
    if (callback) callback();
  };

  request.onerror = function (event) {
    console.error("IndexedDB error:", event.target.errorCode);
    // Even if DB fails, call the callback so the app doesn't hang
 // Logs any errors during database operations.
 // Calls the callback even if there's an error to prevent the app from hanging.
    if (callback) callback(); 
  };
}

/**
 * Saves a file and its metadata to IndexedDB for versioning and integrity checks.
 * @param {string} key The key to store the file under (e.g., 'json', 'video').
 * @param {File} file The file object to be cached.
 */
// Saves a file (Blob) along with its metadata into the IndexedDB.
export function saveFileWithMetadata(key, file) {
  if (!db) return;

  const transaction = db.transaction(["files"], "readwrite");
  const store = transaction.objectStore("files");
  
 // Creates a read-write transaction and gets the 'files' object store.
  // Store an object containing the blob and its metadata
  const dataToStore = {
    filename: file.name,
    size: file.size,
    type: file.type,
    blob: file 
 // Prepares the data object to be stored, including filename, size, type, and the file itself (as a Blob).
  };

  const request = store.put(dataToStore, key);

  request.onsuccess = () => console.log(`File '${file.name}' saved to DB with metadata.`);
  
  // Gracefully handle errors, especially quota limits
  transaction.onerror = (event) => {
    if (event.target.error.name === 'QuotaExceededError') {
        alert("Could not cache file: Browser storage quota exceeded. The app will still work for this session.");
    } else {
 // Handles potential errors during the save operation, such as QuotaExceededError.
        console.error(`Error saving file '${key}':`, event.target.error);
    }
  };
}

/**
 * Loads a file from IndexedDB only if its filename and size match expected values.
 * @param {string} key The key of the file to load.
 * @param {string} expectedFilename The filename we expect to find.
 * @returns {Promise<Blob|null>} A Promise that resolves with the Blob if it's fresh, otherwise null.
 */
// Loads a file from IndexedDB, performing checks for filename and size to ensure data integrity.
export function loadFreshFileFromDB(key, expectedFilename) {
    return new Promise((resolve) => {
        if (!db || !expectedFilename) {
            resolve(null);
            return;
        }

        const transaction = db.transaction(["files"], "readonly");
 // Creates a read-only transaction.
        const store = transaction.objectStore("files");
        const request = store.get(key);

        request.onsuccess = function () {
            const cachedData = request.result;
            if (!cachedData) {
                console.log(`Cache miss for key '${key}': No data found.`);
 // If no data is found for the key, resolve with null.
                resolve(null);
                return;
            }

            // 1. Versioning Check: Do the filenames match?
            if (cachedData.filename !== expectedFilename) {
 // Checks if the cached filename matches the expected filename.
                console.warn(`Cache miss for key '${key}': Stale data found (Filename mismatch).`);
                resolve(null);
                return;
            }

            // 2. Integrity Check: Do the sizes match?
 // Checks if the cached file size matches the stored size metadata.
            if (cachedData.blob.size !== cachedData.size) {
                console.error(`Cache miss for key '${key}': Corrupted data found (Size mismatch).`);
                resolve(null);
                return;
            }

            // All checks passed!
 // If all checks pass, resolve with the cached Blob.
            console.log(`Cache hit for '${expectedFilename}'`);
            resolve(cachedData.blob);
        };

        request.onerror = (event) => {
            console.error(`Error loading file '${key}' from DB:`, event.target.error);
 // Logs any errors during the load operation.
            resolve(null);
        };
    });
}