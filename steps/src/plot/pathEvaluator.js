// File: steps/src/plot/pathEvaluator.js
/**
 * Path Evaluator & Math Utility for the Telemetry Plot Panel
 * Replicated from Foxglove Studio message path syntax and mathFunctions.
 * Supports dot-notation, array indexing, wildcards, and math modifiers.
 */

export const MATH_MODIFIERS = {
  abs: Math.abs,
  acos: Math.acos,
  asin: Math.asin,
  atan: Math.atan,
  ceil: Math.ceil,
  cos: Math.cos,
  log: Math.log,
  log1p: Math.log1p,
  log2: Math.log2,
  log10: Math.log10,
  round: Math.round,
  sign: Math.sign,
  sin: Math.sin,
  sqrt: Math.sqrt,
  tan: Math.tan,
  trunc: Math.trunc,
  negative: (val) => -val,
  deg2rad: (deg) => deg * (Math.PI / 180),
  rad2deg: (rad) => rad * (180 / Math.PI),
  // Unit conversion helpers frequently used in automotive telemetry
  mps2kmph: (mps) => mps * 3.6,
  kmph2mps: (kmph) => kmph / 3.6,
  rad2rpm: (rad) => (rad * 60) / (2 * Math.PI),
};

/**
 * Common human-friendly labels for well-known radar and vehicle telemetry paths
 */
export const WELL_KNOWN_LABELS = {
  "canVehSpeed_kmph": "CAN Speed (km/h)",
  "egoVelocity[1]": "Ego Speed Vy (m/s)",
  "egoVelocity[0]": "Ego Speed Vx (m/s)",
  "egoVelocity[1].@mps2kmph": "Ego Speed Vy (km/h)",
  "correctedEgoSpeed_mps": "Corrected Ego Speed (m/s)",
  "correctedEgoSpeed_mps.@mps2kmph": "Corrected Ego Speed (km/h)",
  "estimatedAcceleration_mps2": "Estimated Accel (m/s²)",
  "shaftTorque_Nm": "Shaft Torque (Nm)",
  "engagedGear": "Engaged Gear",
  "iirFilteredVx_ransac": "Filtered Vx RANSAC (m/s)",
  "iirFilteredVy_ransac": "Filtered Vy RANSAC (m/s)",
  "pointCloud[:].snr": "Point Cloud SNR",
  "pointCloud[:].velocity": "Point Cloud Doppler (m/s)",
  "pointCloud[:].x": "Point Cloud X (m)",
  "pointCloud[:].y": "Point Cloud Y (m)",
  "pointCloud[:].z": "Point Cloud Z (m)",
  "tracks[:].speed": "Track Speed (m/s)",
  "tracks[:].ttc": "Track TTC (s)",
};

/**
 * Returns a human-readable display label for a signal path.
 */
export function getFriendlyLabel(pathStr) {
  if (!pathStr) return "";
  if (WELL_KNOWN_LABELS[pathStr]) {
    return WELL_KNOWN_LABELS[pathStr];
  }
  // Check if reference line constant
  if (!isNaN(Number(pathStr))) {
    return `Ref: ${pathStr}`;
  }
  // Shorten path for readability if long
  const parts = pathStr.split(".");
  return parts[parts.length - 1];
}

/**
 * Extracts values from an object using a path like:
 * - "canVehSpeed_kmph"
 * - "egoVelocity[1]"
 * - "egoVelocity[1].@mps2kmph"
 * - "pointCloud[:].snr"
 * - "pointCloud[:].x.@deg2rad"
 * - "egoState.speedKmph"
 * - "vehicleData.shaftTorqueNm"
 *
 * @param {Object} targetObj - Target JavaScript object (e.g., radarFrame)
 * @param {string} pathStr - Path expression string
 * @returns {Array<any>} Extracted values (flattened array)
 */
export function extractPathValues(targetObj, pathStr) {
  if (!targetObj || !pathStr || typeof pathStr !== "string") return [];

  const trimmed = pathStr.trim();
  if (trimmed === "") return [];

  // Check if the path is a constant number (reference line)
  if (!isNaN(Number(trimmed))) {
    return [Number(trimmed)];
  }

  // 1. Check for modifier suffix (e.g. .@deg2rad or .@mps2kmph)
  let modifier = null;
  const modifierMatch = trimmed.match(/\.@([a-zA-Z0-9_]+)$/);
  let cleanPath = trimmed;
  if (modifierMatch) {
    modifier = modifierMatch[1];
    cleanPath = trimmed.slice(0, modifierMatch.index);
  }

  // 2. Tokenize path into segment tokens
  // Normalize array access like foo[0] -> foo.0 and foo[:] -> foo.:
  const normalized = cleanPath
    .replace(/\[(\w+)\]/g, ".$1")
    .replace(/\[:\]/g, ".:")
    .replace(/\[\*\]/g, ".:")
    .replace(/^\./, "");

  const parts = normalized.split(".").filter(Boolean);

  let current = [targetObj];

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const next = [];

    if (part === ":" || part === "*") {
      // Wildcard / array slice
      for (const item of current) {
        if (Array.isArray(item)) {
          next.push(...item);
        } else if (item && typeof item === "object") {
          next.push(...Object.values(item));
        }
      }
    } else {
      for (const item of current) {
        if (item != null && item[part] !== undefined) {
          next.push(item[part]);
        }
      }
    }

    current = next;
    if (current.length === 0) break;
  }

  // 3. Apply math modifier if requested and defined
  if (modifier && MATH_MODIFIERS[modifier]) {
    const fn = MATH_MODIFIERS[modifier];
    return current.map((v) => (typeof v === "number" && !isNaN(v) ? fn(v) : v));
  }

  return current;
}

