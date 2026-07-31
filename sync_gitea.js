const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// --------------------------------------------------------------------------
// Configuration
// --------------------------------------------------------------------------
// Source: path to your main development repository
const SOURCE_DIR = 'D:/Work/Repo/refactor';
// Destination: root of your Gitea repository folder
const DEST_DIR = __dirname; 

// ONLY sync these specific files/directories (WHITELIST)
const SYNC_WHITELIST = [
    'steps',
    'bSignalizer_guide.md',
    'package.json'
];

// Always ignore these files/patterns even inside whitelisted directories
const EXCLUDE_PATTERNS = [
    '.git',
    '.vscode',
    'node_modules',
    'large_assets',
    'Console_logs',
    'DATA_EXPLORER_BLUEPRINT.md',
    'track_history_playback.json'
];

const EXCLUDE_EXTENSIONS = ['.log', '.mp4', '.mat', '.bag', '.pcap'];

/**
 * Gets the latest commit message from the source dev repository.
 */
function getLatestDevCommitMessage() {
    try {
        const msg = execSync('git log -1 --pretty=%s', { cwd: SOURCE_DIR }).toString().trim();
        return msg || "sync: publish visualizer core update";
    } catch (e) {
        return "sync: publish visualizer core update";
    }
}

/**
 * Checks if a file or directory should be excluded from sync.
 */
function shouldExclude(srcPath) {
    const basename = path.basename(srcPath);
    const ext = path.extname(srcPath).toLowerCase();

    if (EXCLUDE_PATTERNS.includes(basename)) return true;
    if (EXCLUDE_EXTENSIONS.includes(ext)) return true;
    return false;
}

/**
 * Performs a clean whitelist-based sync from dev repo to Gitea repo.
 */
function fullSync() {
    console.log(`\x1b[36m[Sync] Starting selective visualizer sync from ${SOURCE_DIR} to ${DEST_DIR}...\x1b[0m`);
    
    if (!fs.existsSync(SOURCE_DIR)) {
        console.error(`\x1b[31m[Error] Source directory not found: ${SOURCE_DIR}\x1b[0m`);
        return false;
    }

    try {
        SYNC_WHITELIST.forEach(item => {
            const srcPath = path.join(SOURCE_DIR, item);
            const destPath = path.join(DEST_DIR, item);
            
            if (!fs.existsSync(srcPath)) return;

            const stat = fs.statSync(srcPath);
            if (stat.isDirectory()) {
                fs.cpSync(srcPath, destPath, { 
                    recursive: true, 
                    overwrite: true,
                    filter: (src) => !shouldExclude(src)
                });
            } else if (stat.isFile() && !shouldExclude(srcPath)) {
                fs.copyFileSync(srcPath, destPath);
            }
        });
        
        console.log(`\x1b[32m[Sync] Visualizer 'steps' folder sync completed cleanly.\x1b[0m`);
        return true;
    } catch (err) {
        console.error(`\x1b[31m[Error] Sync failed: ${err.message}\x1b[0m`);
        return false;
    }
}

/**
 * Stage, commit, and push synced changes to Gitea remotes.
 */
function publishToGitea(commitMsg) {
    const syncSuccess = fullSync();
    if (!syncSuccess) return;

    const finalMsg = commitMsg || getLatestDevCommitMessage();

    try {
        console.log(`\x1b[35m[Git] Checking for changes in Gitea repository...\x1b[0m`);
        const status = execSync('git status --porcelain', { cwd: DEST_DIR }).toString().trim();
        
        if (!status) {
            console.log(`\x1b[33m[Git] No changes detected. Gitea repository is already up to date.\x1b[0m`);
            return;
        }

        console.log(`\x1b[36m[Git] Staging and committing changes with message:\x1b[0m "${finalMsg}"`);
        execSync('git add .', { cwd: DEST_DIR, stdio: 'inherit' });
        const escapedMsg = finalMsg.replace(/"/g, '\\"');
        execSync(`git commit -m "${escapedMsg}"`, { cwd: DEST_DIR, stdio: 'inherit' });

        console.log(`\x1b[32m[Git] Pushing clean visualizer updates to origin...\x1b[0m`);
        execSync('git push origin refactor/sync-centralize', { cwd: DEST_DIR, stdio: 'inherit' });

        // Push to bal-ev remote if configured
        const remotes = execSync('git remote', { cwd: DEST_DIR }).toString().split(/\r?\n/).map(r => r.trim());
        if (remotes.includes('bal-ev')) {
            console.log(`\x1b[32m[Git] Pushing clean visualizer updates to BAL-EV-ARAS...\x1b[0m`);
            execSync('git push bal-ev refactor/sync-centralize', { cwd: DEST_DIR, stdio: 'inherit' });
        }

        console.log(`\x1b[32m[Success] Gitea repository successfully updated & published to all remotes!\x1b[0m`);
    } catch (err) {
        console.error(`\x1b[31m[Error] Git publish failed: ${err.message}\x1b[0m`);
    }
}

/**
 * Real-time watcher mode.
 */
function watchSync() {
    console.log(`\x1b[35m[Watch] Watching 'steps' folder in ${SOURCE_DIR}...\x1b[0m`);
    fullSync();

    const watchTarget = path.join(SOURCE_DIR, 'steps');
    if (fs.existsSync(watchTarget)) {
        fs.watch(watchTarget, { recursive: true }, (eventType, filename) => {
            if (!filename || shouldExclude(filename)) return;
            debounceSync();
        });
    }
}

let syncTimeout = null;
function debounceSync() {
    if (syncTimeout) clearTimeout(syncTimeout);
    syncTimeout = setTimeout(() => {
        console.log(`\x1b[33m[Watch] Change detected in 'steps', re-syncing...\x1b[0m`);
        fullSync();
    }, 500);
}

// Command Line Handler
const args = process.argv.slice(2);
if (args.includes('--publish') || args.includes('--push')) {
    let customMsg = null;
    const pubIndex = Math.max(args.indexOf('--publish'), args.indexOf('--push'));
    if (pubIndex !== -1 && args[pubIndex + 1] && !args[pubIndex + 1].startsWith('--')) {
        customMsg = args[pubIndex + 1];
    }
    publishToGitea(customMsg);
} else if (args.includes('--watch')) {
    watchSync();
} else {
    fullSync();
}
