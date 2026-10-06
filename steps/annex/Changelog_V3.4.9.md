# ARAS Visualizer Version 3.4.9 - Technical Memory & Changelog

## Executive Overview
Version 3.4.9 brings significant architectural advancements in radar geometric rendering, ADAS staged collision warnings, multi-component version tracking, 3D spatial inspection, and temporal synchronization. It addresses critical non-isometric aspect-ratio distortions in vehicle dimensions and covariance ellipses, introduces staged FCW warning halos with lead vehicle (POI) isolation, adds detailed build component version reporting under the Info badge, and ensures seamless high-refresh display rendering.

---

## 1. Radar Geometric Engine & Metric Object Dimensions

### The Anisotropic Canvas Problem
The radar visualization canvas operates with non-isometric coordinate scales:
- Lateral range: $-25\text{ m}$ to $+25\text{ m}$ ($50\text{ m}$ width) mapped across canvas width ($\text{plotScaleX} \approx 20\text{--}28\text{ px/m}$).
- Longitudinal range: $0\text{ m}$ to $70\text{ m}$ ($70\text{ m}$ length) mapped to $95\%$ of canvas height ($\text{plotScaleY} \approx 6\text{--}8\text{ px/m}$).
- **The Scale Ratio**: $\frac{\text{plotScaleX}}{\text{plotScaleY}} \approx 3.5\times\text{ to } 4.2\times$.

In prior versions, vehicle bounding boxes and covariance ellipses applied a rigid pixel-space rotation (`p.rotate(90 - angle)`). For forward-facing objects ($\text{angle} \approx 0^\circ$), this rotated the horizontal dimension (`dimA * 2 * plotScaleX`) directly onto the vertical longitudinal screen axis. As a result:
$$\text{Apparent Length} = (\text{dimA} \times 2) \times \frac{\text{plotScaleX}}{\text{plotScaleY}} \approx 6.2\text{ m} \times 4.0 = \mathbf{24.8\text{ meters}}$$
A vehicle of true physical length $6.2\text{ m}$ was visually stretched to $\approx 25\text{ meters}$, while lateral width was shrunk to $\approx 0.5\text{ meters}$.

### Directional Screen Scaling & True Rotated Rectangles
Version 3.4.9 resolves this distortion while guaranteeing clean, orthogonal $90^\circ$ bounding boxes:
1. **Directional Scale Calculation**: Computes the true pixel scale along the vehicle's heading vector $\vec{u}_{\text{heading}} = (\sin\theta, \cos\theta)$ and perpendicular cross-range vector $\vec{u}_{\perp} = (\cos\theta, -\sin\theta)$:
   $$\text{lenScale} = \sqrt{(\sin\theta \cdot \text{plotScaleX})^2 + (\cos\theta \cdot \text{plotScaleY})^2}$$
   $$\text{widthScale} = \sqrt{(\cos\theta \cdot \text{plotScaleX})^2 + (\sin\theta \cdot \text{plotScaleY})^2}$$
2. **Visual Screen Angle**: Computes the exact visual orientation on the anisotropic canvas:
   $$\text{screenAngleRad} = \text{atan2}(\cos\theta \cdot \text{plotScaleY}, \sin\theta \cdot \text{plotScaleX})$$
3. **Rigid Orthogonal Rectangle**: Renders bounding boxes using native `p.rectMode(p.CENTER)` and `p.rect(0, 0, \text{dimA} \cdot 2 \cdot \text{lenScale}, \text{dimB} \cdot 2 \cdot \text{widthScale})$` rotated by `screenAngleRad`.
   - **Result**: Exactly $6.2\text{ m}$ measured against the longitudinal grid and true width on the lateral grid, with zero shearing or parallelogram distortion.
4. **Smooth Covariance Ellipses**: Updated `drawCovarianceEllipse` to use smooth native `p.ellipse(0, 0, r_A \cdot 2 \cdot \text{lenScale}, r_B \cdot 2 \cdot \text{widthScale})` rotated along `screenAngleRad`, eliminating polygon stepping.
5. **Zoom Window Covariance Wiring**: Connected covariance ellipse rendering into `zoomSketch.js` with `scaleFactor` support so ellipses remain visible during close-up track inspection.
6. **Ego Vehicle Bumper Anchoring**: Centered the ego vehicle at $Y = -(\text{carLengthMeters} / 2) \cdot \text{plotScaleY}$, ensuring the front bumper remains permanently anchored to $Y = 0\text{ m}$ across all range slider settings ($40\text{ m}$ to $200\text{ m}$).

---

## 2. ADAS Staged Collision Warnings & POI Lead Vehicle Tracking

### Dual-Stage Visual Warning Halos
Implemented dynamic warning indicators matching automotive ADAS specifications:
- **Stage 1 (Caution)**: Amber/Orange pulsing halo (`rgba(255, 140, 0, ...)`) with a base caution ring indicating an approaching vehicle or reduced Time-to-Collision ($5\text{s} < \text{TTC} \le 10\text{s}$).
- **Stage 2 (Critical Alert)**: High-contrast Red flashing halo (`rgba(230, 40, 40, ...)`) accompanied by an emergency exclamation alert triangle badge positioned above the target vehicle, triggered when collision is imminent ($\text{TTC} \le 5\text{s}$).
- **HTML HUD Warning Overlay**: Active Stage 2 warnings trigger `#fcw-warning-overlay` for high-visibility visual reinforcement.

### Lead Vehicle (POI) Isolation & Clutter Suppression
- **POI Tracking**: Parses `poi_id` from frame ADAS metadata. The designated lead target is highlighted with an Orange tooltip border, leader connector line, and `[LEAD POI]` badge.
- **Stationary Clutter Elimination**: In earlier versions, stationary objects (such as roadside barriers and guardrails) cluttered the display with dimension boxes. Version 3.4.9 restricts stationary dimension boxes exclusively to the active lead vehicle (POI) within the driving corridor/ROI.

### Speed Graph Warning Bands
- Color-coded timeline warning bands (Amber for Stage 1, Red for Stage 2) added to `speedGraphSketch.js` with $5\text{px}$ minimum width and top accent notches.
- Refined FCW indicator line thickness to $1\text{px}$ for clean timeline presentation.

---

## 3. Multi-Source Component Version Reporting

### Component Version Popover
Added the `#popover-components-section` card inside the top-right Info `(i)` badge popover. Displays build component versions as distinct badges:
- `python_tracking_version`
- `python_utils_version`
- `dss_version`
- `mss_version`
- `tracking_version`

### Resilient Schema Resolver (`extractVersionInfo`)
Implemented a robust version resolver in `src/fileParsers.js` that handles diverse log structures:
1. Canonical nested: `{ version_info: { python_tracking_version: "...", ... } }`
2. Sub-module nested: `{ python_tracking_version: { python_tracking_version: "...", ... } }`
3. Flat root keys: `{ python_tracking_version: "...", dss_version: "...", ... }`
4. Graceful fallback for legacy logs without version information.

### Streaming Parser Worker Fix (`src/parser.worker.js`)
Fixed an event ordering bug in Clarinet JSON streaming:
- Clarinet passes the first property name of a new child object into `onopenobject(firstKey)`.
- Inverted handler logic so `assign(newObject)` attaches the child object to the parent using the parent's pending key *before* updating `key = firstKey`.

### State Persistence & Purge Sync
- Cached `versionInfo` in IndexedDB session storage and `localStorage`.
- Synchronized cache purge (`db.js`, `fileLoader.js`) to flush stored version metadata upon clearing session history.

---

## 4. 3D Spatial Point Cloud Inspection

- **Elevation (Z) Display**: Updated hover tooltips in both the main radar sketch (`drawUtils.js`) and the close-up zoom sketch (`zoomSketch.js`) to display the 3D elevation coordinate:
  $$\text{Point ID } | \text{ X: 2.34, Y: 15.60, Z: 0.45 } | \text{ V: -12.3, SNR: 24.1, Cluster: 3}$$
- **Defensive Type Guards**: Added safe fallbacks (`typeof data.z === "number" ? data.z.toFixed(2) : "0.00"`) ensuring full compatibility with older 2D radar datasets that omit elevation data.

---

## 5. Temporal Synchronization & Display Fluidity

### Anti-Drift Container Frame Alignment
- Aligned radar frame playback to container `video_frame_index` to prevent cumulative wall-clock timestamp drift across long playback sequences.
- Updated `precomputeRadarVideoSync` test suites in `tests/utils.test.js`.

### Hard Reload (`Ctrl+Shift+R`) Stability
- Fixed race condition in `speedGraphSketch.js` where `staticBuffer.clear()` threw `TypeError: Cannot read properties of undefined (reading 'clear')` during asynchronous initialization on hard reloads.

### VSync & Smooth Animations
- Increased canvas framerate ceiling to `p.frameRate(240)` to lock rendering to native monitor refresh rates (75Hz, 120Hz, 144Hz).
- Kept continuous animation loop (`p.loop()`) active on `radarSketch` so pulsing halos and live HUD overlays run smoothly even while playback is paused or seeking.
- Replaced noisy instantaneous FPS calculation with a 500ms rolling-window smoothed measurement.

---

## Summary of Changes Across Files

| File | Changes Made |
|---|---|
| `steps/index.html` | Updated `window.APP_VERSION = "3.4.9"`, wired `#changelog-iframe` to `annex/Changelog_3.4.9.html`. |
| `steps/src/constants.js` | Updated static fallback `APP_VERSION` to `"3.4.9"`. |
| `steps/src/drawUtils.js` | Directional scaling for orthogonal rotated bounding boxes (`p.rect`), rotated `p.ellipse` covariance rendering, ego vehicle bumper alignment, Z coordinate in point tooltips. |
| `steps/src/p5/radarSketch.js` | Continuous loop for live animations, rolling-window FPS calculation, staged FCW warning halo integration. |
| `steps/src/p5/zoomSketch.js` | Added Z coordinate to tooltips, wired `toggleCovariance` rendering with `inverseZoom`, fixed unclosed brace syntax. |
| `steps/src/p5/speedGraphSketch.js` | Guarded `staticBuffer` initialization on hard reload, timeline FCW warning bands, 1px indicator line. |
| `steps/src/debugBadge.js` | Component versions card with badges and safe HTML escaping in info popover. |
| `steps/src/fileParsers.js` | `extractVersionInfo()` multi-schema resolver for version metadata. |
| `steps/src/parser.worker.js` | Inverted `onopenobject` assignment sequence for Clarinet streaming. |
| `steps/src/fileLoader.js` | Version metadata caching, container frame alignment, dynamic FPS detection. |
| `steps/src/db.js` | Added `"versionInfo"` to session cache persistence and storage purge routines. |
| `steps/src/state.js` | Added `versionInfo: null` state field. |
| `steps/server.py` | Python development server diagnostic endpoints. |
