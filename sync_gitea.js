const fs = require('fs');
const path = require('path');

// --------------------------------------------------------------------------
// Configuration
// --------------------------------------------------------------------------
// Source: path to your local original refactor repository
const SOURCE_DIR = 'D:/Work/Repo/refactor';
// Destination: root of your Gitea repository
const DEST_DIR = __dirname; 

// Files/folders to ignore from the source/destination sync
const IGNORE_LIST = [
    '.git',
    '.vscode',
    '.idea',
    'node_modules',
    'package.json',
    'package-lock.json',
    'sync_gitea.js' // Ignore this sync script itself
];

/**
 * Performs a one-time recursive sync.
 * Overwrites existing files but does NOT delete files that exist only in destination.
 */
function fullSync() {
    console.log(`\x1b[36m[Sync] Starting sync from ${SOURCE_DIR} to ${DEST_DIR}...\x1b[0m`);
    
    if (!fs.existsSync(SOURCE_DIR)) {
        console.error(`\x1b[31m[Error] Source directory not found: ${SOURCE_DIR}\x1b[0m`);
        return;
    }

    try {
        const items = fs.readdirSync(SOURCE_DIR);
        
        items.forEach(item => {
            if (IGNORE_LIST.includes(item)) return;
            
            const srcPath = path.join(SOURCE_DIR, item);
            const destPath = path.join(DEST_DIR, item);
            
            // For destination sync, we copy recursively
            fs.cpSync(srcPath, destPath, { 
                recursive: true, 
                overwrite: true,
                filter: (src) => {
                    const basename = path.basename(src);
                    return !IGNORE_LIST.includes(basename);
                }
            });
        });
        
        console.log(`\x1b[32m[Sync] Sync completed successfully.\x1b[0m`);
    } catch (err) {
        console.error(`\x1b[31m[Error] Sync failed: ${err.message}\x1b[0m`);
    }
}

/**
 * Real-time watcher
 */
function watchSync() {
    console.log(`\x1b[35m[Watch] Watching for changes in ${SOURCE_DIR}...\x1b[0m`);
    
    fullSync(); // Initial sync

    fs.watch(SOURCE_DIR, { recursive: true }, (eventType, filename) => {
        if (!filename) return;
        
        const parts = filename.split(path.sep);
        if (parts.some(p => IGNORE_LIST.includes(p))) return;

        debounceSync();
    });
}

let syncTimeout = null;
function debounceSync() {
    if (syncTimeout) clearTimeout(syncTimeout);
    syncTimeout = setTimeout(() => {
        console.log(`\x1b[33m[Watch] Change detected, re-syncing...\x1b[0m`);
        fullSync();
    }, 500);
}

// Handle command line arguments
const args = process.argv.slice(2);
if (args.includes('--watch')) {
    watchSync();
} else {
    fullSync();
}
