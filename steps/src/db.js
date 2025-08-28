// -------------------------- IndexedDB for Caching ----------------- //
let db;

//---------------------------Initialize DB----------------------------//

// Initializes the IndexedDB database.
// @param {function} callback - A function to be called once the database is initialized.
export function initDB(callback) {
  // Open the database with the name "visualizerDB" and version 1.
  const request = indexedDB.open("visualizerDB", 1);

  // Event handler for when the database needs to be upgraded (e.g., first time creation or version change).
  request.onupgradeneeded = function (event) {
    const db = event.target.result;
    // Create an object store named "files" if it doesn't already exist.
    if (!db.objectStoreNames.contains("files")) {
      db.createObjectStore("files");
    }
  };

  // Event handler for a successful database opening.
  request.onsuccess = function (event) {
    db = event.target.result;
    console.log("Database initialized");
    // Call the provided callback function.
    if (callback) callback();
  };

  // Event handler for an error during database opening.
  request.onerror = function (event) {
    console.error("IndexedDB error:", event.target.errorCode);
  };
}

//---------------------------save file------------------------------//

// Saves a file (or any value) to the IndexedDB.
// @param {string} key - The key to store the value under.
// @param {*} value - The value to be stored.
export function saveFileToDB(key, value) {
  // If the database is not initialized, return.
  if (!db) return;
  // Start a read-write transaction on the "files" object store.
  const transaction = db.transaction(["files"], "readwrite");
  const store = transaction.objectStore("files");
  // Put (add or update) the value with the given key.
  const request = store.put(value, key);
  // Event handler for a successful save operation.
  request.onsuccess = () => console.log(`File '${key}' saved to DB.`);
  // Event handler for an error during saving.
  request.onerror = (event) =>
    console.error(`Error saving file '${key}':`, event.target.error);
}

//---------------------------load file--------------------------------//

export function loadFileFromDB(key, callback) {
  // If the database is not initialized, return.
  if (!db) return;
  // Start a read-only transaction on the "files" object store.
  const transaction = db.transaction(["files"], "readonly");
  const store = transaction.objectStore("files");
  // Get the value associated with the given key.
  const request = store.get(key);
  // Event handler for a successful retrieval.
  request.onsuccess = function () {
    // If a result is found, call the callback with the result.
    if (request.result) {
      callback(request.result);
    } else {
      console.log(`File '${key}' not found in DB.`);
      callback(null);
    }
  }; // Event handler for an error during loading.
  request.onerror = (event) => {
    console.error(`Error loading file '${key}':`, event.target.error);
    callback(null);
  };
}
