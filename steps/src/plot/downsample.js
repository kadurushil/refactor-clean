// File: steps/src/plot/downsample.js
/**
 * Min-Max-First-Last Interval Downsampler
 * Ported from Foxglove Studio (downsample.ts).
 *
 * Reduces high-frequency time-series datasets of tens or hundreds of thousands
 * of points down to ~4 points per pixel bucket (~5,000 max points total),
 * preserving all peaks, troughs, and transients for 60 FPS Chart.js rendering.
 */

export const MAX_POINTS = 5000;
export const MINIMUM_PIXEL_DISTANCE = 3;

/**
 * Downsamples a time-series dataset of { x, y } points.
 * Points must be ordered monotonically by x (e.g. timestamp).
 *
 * @param {Array<{x: number, y: number}>} points - Sorted array of points
 * @param {number} viewportWidth - Width of the plot canvas in CSS pixels
 * @param {number} xMin - Minimum visible X boundary
 * @param {number} xMax - Maximum visible X boundary
 * @param {number} maxPoints - Maximum total points allowed (defaults to 5000)
 * @returns {Array<{x: number, y: number}>} Downsampled points array
 */
export function downsamplePoints(points, viewportWidth, xMin, xMax, maxPoints = MAX_POINTS) {
  if (!points || points.length === 0) return [];
  if (points.length <= maxPoints) {
    // If entire dataset fits within maxPoints budget, preserve all points so panning in any
    // direction never encounters missing data or empty gaps. Chart.js clips to canvas automatically.
    return points;
  }

  const effectiveWidth = Math.max(10, viewportWidth || 600);
  const numPixelIntervals = Math.max(10, Math.trunc(effectiveWidth / MINIMUM_PIXEL_DISTANCE));
  const allowedPoints = Math.min(maxPoints, numPixelIntervals * 4);
  const numIntervals = Math.max(1, Math.trunc(allowedPoints / 4));

  const firstPtX = points[0].x;
  const lastPtX = points[points.length - 1].x;

  // Include a generous 1.5x buffer around the visible viewport for fluid panning without missing data
  let boundsXMin = firstPtX;
  let boundsXMax = lastPtX;

  if (xMin != null && xMax != null && xMax > xMin) {
    const viewSpan = xMax - xMin;
    const margin = Math.max(1, viewSpan * 1.5);
    boundsXMin = Math.max(firstPtX, xMin - margin);
    boundsXMax = Math.min(lastPtX, xMax + margin);
  }

  const xSpan = boundsXMax - boundsXMin;

  if (xSpan <= 0) return points.slice(0, maxPoints);

  const pixelPerX = numIntervals / xSpan;
  const downsampled = [];

  let currentBucket = -1;
  let first = null;
  let last = null;
  let min = null;
  let max = null;

  function flushBucket() {
    if (!first) return;
    const bucketItems = [first];

    // Include min and max if they are distinct from first and last
    if (min && min !== first && min !== last) {
      bucketItems.push(min);
    }
    if (max && max !== first && max !== last && max !== min) {
      bucketItems.push(max);
    }
    if (last && last !== first) {
      bucketItems.push(last);
    }

    // Preserve strictly increasing temporal sequence within the bucket
    bucketItems.sort((a, b) => a.x - b.x);
    downsampled.push(...bucketItems);

    first = last = min = max = null;
  }

  for (let i = 0; i < points.length; i++) {
    const pt = points[i];

    // Filter out points strictly outside the visible viewport
    if (pt.x < boundsXMin || pt.x > boundsXMax) {
      continue;
    }

    const bucket = Math.trunc((pt.x - boundsXMin) * pixelPerX);

    if (bucket !== currentBucket) {
      flushBucket();
      currentBucket = bucket;
      first = pt;
      last = pt;
      min = pt;
      max = pt;
    } else {
      last = pt;
      if (pt.y < min.y) min = pt;
      if (pt.y > max.y) max = pt;
    }
  }

  flushBucket();
  return downsampled;
}

/**
 * Downsamples 2D scatter plots (e.g. currentCustom mode: X vs Y)
 * by filtering visually overlapping points on an integer pixel grid.
 *
 * @param {Array<{x: number, y: number}>} points
 * @param {number} width - Canvas width in px
 * @param {number} height - Canvas height in px
 * @param {{xMin: number, xMax: number, yMin: number, yMax: number}} bounds
 * @returns {Array<{x: number, y: number}>}
 */
export function downsampleScatter(points, width, height, bounds) {
  if (!points || points.length <= MAX_POINTS) return points;

  const w = Math.max(10, width || 600);
  const h = Math.max(10, height || 300);
  const xSpan = (bounds.xMax - bounds.xMin) || 1;
  const ySpan = (bounds.yMax - bounds.yMin) || 1;

  const pixelPerX = w / xSpan;
  const pixelPerY = h / ySpan;

  const sparse = new Set();
  const downsampled = [];

  for (let i = 0; i < points.length; i++) {
    const pt = points[i];
    if (pt.x < bounds.xMin || pt.x > bounds.xMax || pt.y < bounds.yMin || pt.y > bounds.yMax) {
      continue;
    }

    const px = Math.round((pt.x - bounds.xMin) * pixelPerX);
    const py = Math.round((pt.y - bounds.yMin) * pixelPerY);
    const key = py * w + px;

    if (sparse.has(key)) continue;
    sparse.add(key);
    downsampled.push(pt);

    if (downsampled.length >= MAX_POINTS) break;
  }

  return downsampled;
}

