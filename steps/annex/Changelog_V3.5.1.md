# ARAS Visualizer Version 3.5.1 - Technical Memory & Changelog

## Executive Overview
Version 3.5.1 is a targeted patch release that resolves critical UI visibility and folder traversal issues encountered during multi-dataset session ingestion (simulated tracks, GTrack, and calibration files). 

Following the Tier 3 optimization in V3.5.0 (which detached Tailwind CDN's runtime `MutationObserver` to prevent 60 FPS playback churn), dynamically generated modal elements for alternative dataset pairs rendered with uncompiled utility classes. Combined with Tailwind's button CSS reset (`background-color: transparent`), buttons for secondary dataset pairs became completely invisible (white text on a white card). Furthermore, large session directories containing $>100$ files were subject to Chromium's single-batch folder reader limits.

Version 3.5.1 eliminates these issues with bulletproof independent CSS, full-card interactive containers, directory batch pagination, and calibrated JSON scoring rules.

---

## 1. Problem Diagnostics & Root Cause Analysis

### Invisible Action Buttons on Alternative Pairs
* **Root Cause**: In V3.5.0, Tailwind's `MutationObserver` was disconnected 500ms post-boot (`window.tailwind.disconnect()`) for 60 FPS rendering stability.
* **Failure Chain**:
  1. User drops a folder with multiple datasets minutes later.
  2. `load_folder.js` generates alternative pair cards with classes `bg-gray-700` and `px-3.5`.
  3. Because `bg-gray-700` was never present in the initial static HTML (in light mode), Tailwind never compiled a `.bg-gray-700` CSS rule.
  4. Tailwind Preflight resets `button` elements to `background-color: transparent`.
  5. The button computed with `backgroundColor: rgba(0, 0, 0, 0)` and `color: rgb(255, 255, 255)` (white).
  6. Sits on a white card (`bg-white` `#ffffff`), rendering the button completely invisible to the human eye.

### Truncated Folder Scanning on Large Datasets
* **Root Cause**: The HTML5 File and Directory Entries API method `dirReader.readEntries()` is specified in Chromium to return entries in batches of $\le 100$.
* **Failure Chain**: Calling `dirReader.readEntries()` only once caused session directories with $>100$ files (e.g. frame dumps, long-run slices) to prematurely stop reading after entry 100, leaving subsequent JSON and video pairs undetected.

### JSON Priority Ordering Misclassification
* **Root Cause**: Regex rule `/simulations\/.*\.json$/i` required a `simulations/` directory prefix, failing to match `simulated.json` placed at the root level of a session folder. Meanwhile, auxiliary files (`radar_camera_calib.json`, `session_metadata.json`) had no negative scoring and competed with actual tracking datasets.

---

## 2. Technical Fixes Implemented

### 2.1 Independent High-Contrast CSS Rule (`.load-pair-btn`)
Added explicit styles to `steps/index.html` with `!important` declarations, completely bypassing Tailwind JIT dependency:
```css
.load-pair-btn {
  background-color: #1e293b !important;
  color: #ffffff !important;
  border: 1px solid #334155 !important;
}
.load-pair-btn:hover {
  background-color: #0f172a !important;
  border-color: #2563eb !important;
}
.dark .load-pair-btn {
  background-color: #374151 !important;
  color: #ffffff !important;
  border: 1px solid #4b5563 !important;
}
.dark .load-pair-btn:hover {
  background-color: #4b5563 !important;
  border-color: #60a5fa !important;
}
```

### 2.2 Full-Card Clickable Container & Anti-Squash Layout
* Transformed the entire dataset card into an active interactive trigger (`cursor-pointer`, `hover:border-blue-500`, `hover:shadow-md`).
* Wrapped file information in `flex-1 min-w-0` with responsive flex layouts (`flex-col sm:flex-row`), ensuring long file paths truncate smoothly without squashing action buttons.
* Handled clicks on either the card body or the button smoothly without event collision.

### 2.3 Directory Reader Pagination Loop
Replaced single-call `readEntries()` with a recursive batching loop in `steps/src/load_folder.js`:
```javascript
let entries = [];
const readBatch = () =>
  new Promise((resolve) => {
    dirReader.readEntries((results) => resolve(results || []));
  });
let batch;
do {
  batch = await readBatch();
  if (batch && batch.length > 0) {
    entries = entries.concat(batch);
  }
} while (batch && batch.length > 0);
```

### 2.4 Calibrated JSON Scoring Hierarchy
Updated `JSON_PRIORITY_RULES` in `steps/src/load_folder.js`:
```javascript
export const JSON_PRIORITY_RULES = [
  { pattern: /^track_history(_playback)?\.json$/i, score: 100 },
  { pattern: /^fHist_.*\.json$/i, score: 95 },
  { pattern: /simulat.*\.json$/i, score: 85 },
  { pattern: /gtrack.*\.json$/i, score: 75 },
  { pattern: /^radar_log\.json$/i, score: 60 },
  { pattern: /^radar_raw\.json$/i, score: 50 },
  { pattern: /(metadata|calib|camera_calib|extrinsics|intrinsics).*\.json$/i, score: 15 },
  { pattern: /^frame_mapping\.json$/i, score: 10 },
  { pattern: /^config\.json$/i, score: 10 },
  { pattern: /^settings\.json$/i, score: 10 },
];
```

---

## 3. Verification & Automated Test Results

* **Automated Unit Tests**: 34/34 tests passing with zero failures in `test-runner.html`.
* **JS Syntax**: All 32 JavaScript source files in `steps/src` pass `node -c` with zero errors.
* **Visual Validation**: Verified via browser headless inspection in both Light Mode and Dark Mode:
  * Light Mode: `#1e293b` dark slate button with white text and clean border.
  * Dark Mode: `#374151` medium slate button with white text and `#4b5563` border.
  * Interactive selection works on both card container click and button click.

