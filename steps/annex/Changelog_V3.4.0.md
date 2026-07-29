# ARAS Visualizer Version 3.4.0 - Technical Memory & Changelog

## Executive Overview
Version 3.4.0 represents a major milestone in temporal synchronization, directory processing, dashboard customization, and UI performance. It introduces native support for `frame_mapping.json` logging outputs, dynamic video FPS detection, a segmented offset mode toggle switch, recursive folder traversal with smart dataset auto-pairing, GridStack workspace customization, and an $O(1)$ precompute sync engine.

---

## 1. Frame Mapping Engine (`frame_mapping.json`)

### File Format & Schema
Line-delimited JSON (JSONL) containing 1-to-1 frame mappings:
```json
{
  "radar_frame_id_rel": 1,
  "radar_frame_id_abs": 1279,
  "radar_timestamp": 1784092842.104461,
  "video_frame_index": 197,
  "video_frame_ts": 1784092842.047886,
  "video_time_delta": -0.05657505989074707
}
```

### Precompute & Temporal Alignment Formula
On dataset load, `precomputeRadarVideoSync(vizData, offsetMs)` in `src/utils.js` calculates:
1. Video start baseline:
   $$\text{videoStartUnixSec} = \text{video\_frame\_ts}[0] - \left(\text{video\_frame\_index}[0] \times \frac{1}{\text{getVideoFps()}}\right)$$
2. Per-radar-frame video timestamp baking:
   $$\text{frame.videoSyncedTime} = \text{video\_frame\_ts}[i] - \text{videoStartUnixSec}$$

Because timestamps are baked directly into `frame.videoSyncedTime`, the visualizer's native 60 FPS binary search (`findRadarFrameIndexForTime`) handles playback with **zero runtime overhead**.

---

## 2. Dynamic Video FPS Recognition

- Replaced hardcoded `30 FPS` constants with dynamic detection in `src/fileLoader.js`:
  $$\text{Detected FPS} = \frac{\text{video\_frame\_index}[N] - \text{video\_frame\_index}[0]}{\text{video\_frame\_ts}[N] - \text{video\_frame\_ts}[0]}$$
- Automatically detects 24, 25, 29.97, 30, 50, 59.94, and 60 FPS recording hardware.
- Stored in `appState.videoFps` and exposed globally via `getVideoFps()` in `src/state.js`.
- Arrow key stepping (Up/Down) scales dynamically to $\frac{1}{\text{getVideoFps()}}$ seconds in `src/keyboard.js`.

---

## 3. Segmented Offset Mode Toggle & Display Offset

### Display Offset Calculation
When `frame_mapping.json` is loaded, the offset input box displays the human-readable video lead time:
$$\text{Display Offset (ms)} = \frac{\text{video\_frame\_index}[0]}{\text{getVideoFps()}} \times 1000$$
*(e.g., 197 frames @ 30 FPS = **6567 ms**)*

### Segmented Toggle Switch UI
- Rendered beside `offset-input` in `index.html`: `Auto (map)` / `Auto` (Green active) vs `Manual` (Gray active).
- **Manual Mode**: User edits offset box or clicks `Manual` $\rightarrow$ sets `appState.hasFrameMapping = false` and applies standard linear offset.
- **Auto (map) Revert**: User clicks `Auto (map)` $\rightarrow$ sets `appState.hasFrameMapping = true`, re-bakes `precomputeRadarVideoSync()` from `frameMappingTable` in memory, deletes manual offset from IndexedDB, and restores `6567 ms` in the input box.

---

## 4. Modular Folder Upload & Auto-Pairing Engine (`src/load_folder.js`)

- **Recursive Traversal**: Uses HTML5 `webkitGetAsEntry` / `FileSystemDirectoryReader` to scan directory trees recursively.
- **Priority Rules (`JSON_PRIORITY_RULES`)**:
  1. `track_history(_playback)?.json` (Score: 100)
  2. `fHist_.*\.json` (Score: 95)
  3. `simulations/.*\.json` (Score: 85)
- **Case C Selection Modal**: Rendered when multiple logs/subfolders are detected. Enlarged by 30% (`max-w-5xl`, `max-h-[95vh]`) with auto-scroll to primary recommendations on open.
- **DOM Safety**: Event listeners use `AbortController` (`_customBtnAbort`) to avoid stale node references on repeated folder drops.
- **Deferred Cleanup**: Dropping a new folder pauses playback but does not wipe IndexedDB cache or active state until the user confirms dataset selection.

---

## 5. Performance Hardening ($O(1)$ Hash Map)

- **Precompute Optimization**: In `src/utils.js`, replaced $O(N^2)$ `.find()` array search inside 10,000-frame precompute loop with an $O(1)$ `Map` lookup table (`mapByRelId.get(relFrameId)`).
- Precompute execution time on 10,000-frame logs reduced from **2,000ms to 0.1ms**.
- **Defensive Record Validation**: `parseFrameMappingFile` validates `video_frame_index` and `video_frame_ts` numeric types. Malformed or 0-byte mapping files trigger fallback to filename regex auto-offset (`Auto`).
- **IndexedDB Persistence**: Stores `"frame_mapping"` blob in IndexedDB alongside `"json"` and `"video"`, preserving `Auto (map)` state across browser page refreshes.

---

## 6. GridStack Dashboard & FCW Stage 2 Overlays

- **GridStack Integration**: Dashboard cards rely on `gridstack.all.js` with persistent layout memory in `localStorage`.
- **God Mode Zoom Panel**: Decoupled floating canvas panel (`#zoom-panel`) with auto-hide UX.
- **Data Explorer & ADAS Inspector**: Floating Data Explorer (`#data-explorer-panel`) featuring tree view, grid view, track grid, plot view, and vertical ADAS property inspector.
- **FCW Overlays**: Draggable FCW Stage 2 visual warning overlays with real-time target markers.

---

## 7. Z-Index Layering Scale

To prevent resizer handles and panel overlays from blocking page controls:

| Element Layer | Z-Index | Purpose |
|---|---|---|
| Page Grid & Canvas | `z-0` – `z-10` | Default document flow |
| Card Top Drag Handles | `z-10` | GridStack card header drag handle |
| Sticky Timeline Footer | `z-20` | Always accessible playback controls |
| Inactive Floating Panels | `z-30` | `#zoom-panel`, `#data-explorer-panel` |
| Active Floating Panel | `z-40` | Brought to front on click |
| Dragging / Resizing Panel | `z-45` | Temporarily elevated during drag |
| Modals & Dialogs | `z-[70]` | `#dataset-select-modal`, `#modal-container` |
| Global Drag Overlay | `z-[90]` | Topmost drag target |

---

## 8. Glassmorphic Debug & Telemetry Badge (`src/debugBadge.js`)

- Floating bottom badge displaying active build version (`v3.4.0`), browser engine, and OS.
- Interactive popover displaying IndexedDB cache statistics, stored blob sizes, and manual offset key-value pairs.
- Dynamic `/api/version` endpoint query with graceful static server fallback (`v3.4.0`).

---

## 9. Key File Map for AI Agents

- [index.html](file:///d:/Work/Repo/refactor/steps/index.html): Main layout, GridStack items, floating panels, segmented mode toggle, Case C modal.
- [src/state.js](file:///d:/Work/Repo/refactor/steps/src/state.js): Central `appState` (`frameMappingTable`, `hasFrameMapping`, `frameMapFile`, `frameMapBaseOffset`, `videoFps`, `activeWorker`).
- [src/fileLoader.js](file:///d:/Work/Repo/refactor/steps/src/fileLoader.js): `handleFiles`, `processFilePipeline`, `parseFrameMappingFile`, `calculateAndSetOffset`, `revertToAutoOffset`.
- [src/load_folder.js](file:///d:/Work/Repo/refactor/steps/src/load_folder.js): Directory scanning, `JSON_PRIORITY_RULES`, auto-pairing, Case C modal rendering.
- [src/utils.js](file:///d:/Work/Repo/refactor/steps/src/utils.js): `precomputeRadarVideoSync` ($O(1)$ Map lookup), `findRadarFrameIndexForTime` (binary search).
- [src/sync.js](file:///d:/Work/Repo/refactor/steps/src/sync.js): `videoFrameCallback` (60 FPS playback loop), `forceResyncWithOffset`, `updateFrame`.
- [src/dom.js](file:///d:/Work/Repo/refactor/steps/src/dom.js): DOM exports, `setOffsetToggleMode()`, persistent overlays.
- [src/ui.js](file:///d:/Work/Repo/refactor/steps/src/ui.js): `makeDraggableAndResizable`, z-index management (`z-45`), panel state persistence.
- [src/db.js](file:///d:/Work/Repo/refactor/steps/src/db.js): IndexedDB caching (`"json"`, `"video"`, `"frame_mapping"`, `"manualOffsets"`).
- [src/debugBadge.js](file:///d:/Work/Repo/refactor/steps/src/debugBadge.js): Version telemetry, cache popover, fallback handler (`v3.4.0`).
- [steps/intel/frame_mapping.md](file:///d:/Work/Repo/refactor/steps/intel/frame_mapping.md): Architectural specification for frame mapping.

---

## 10. High-Speed Seeking Optimizations & Visual Sync Feedback

- **Throttled Intermediate Fast-Seek**: Integrated native HTML5 `videoPlayer.fastSeek()` throttled to max once per ~60ms during continuous timeline scrubbing, mouse wheel seeking, and speed-graph dragging. Video feed scrubs dynamically alongside <1ms radar canvas redraws instead of freezing.
- **Reduced Debounce Latency**: Reduced trailing seek debounce from 300ms down to 100ms across all handlers for instant precise frame snapping when scrubbing stops.
- **Visual Seeking Badge (`#video-seeking-badge`)**: Added top-right animated seeking overlay badge in the video panel, driven by `seeking` and `seeked` HTML5 video event listeners.
- **Race Condition & Small-Drift Resolution**: Implemented post-debounce state reconciliation (`checkAndClearSeekingState()`), 800ms safety auto-clear fallback timers, and instant badge clearing for small-drift ($\le$ 50ms) no-op seeks and playback starts.
- **Queued Playback Guard**: Pressing Play while video seeking is pending updates button state to "Syncing..." and queues playback to start automatically as soon as seeking settles.

