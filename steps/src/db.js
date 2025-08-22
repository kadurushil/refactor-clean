

// --- IndexedDB for Caching --- //
let db;

//---Initialize DB---//

export function initDB(callback) {
    const request = indexedDB.open('visualizerDB', 1);
    request.onupgradeneeded = function (event) {
        const db = event.target.result;
        if (!db.objectStoreNames.contains('files')) {
            db.createObjectStore('files');
        }
    };
    request.onsuccess = function (event) {
        db = event.target.result;
        console.log("Database initialized");
        if (callback) callback();
    }; request.onerror = function (event) {
        console.error("IndexedDB error:", event.target.errorCode);
    };
}

//---save file---//

export function saveFileToDB(key, value) {
    if (!db) return;
    const transaction = db.transaction(['files'], 'readwrite');
    const store = transaction.objectStore('files');
    const request = store.put(value, key);
    request.onsuccess = () => console.log(`File '${key}' saved to DB.`);
    request.onerror = (event) => console.error(`Error saving file '${key}':`, event.target.error);
}

//---load file---//

export function loadFileFromDB(key, callback) {
    if (!db) return;
    const transaction = db.transaction(['files'], 'readonly');
    const store = transaction.objectStore('files'); const request = store.get(key);
    request.onsuccess = function () {
        if (request.result) {
            callback(request.result);
        }
        else {
            console.log(`File '${key}' not found in DB.`);
            callback(null);
        }
    };
    request.onerror = (event) => {
        console.error(`Error loading file '${key}':`, event.target.error);
        callback(null);
    };
}
