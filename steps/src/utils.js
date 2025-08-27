export function findRadarFrameIndexForTime(targetTimeMs, vizData) {
    if (!vizData || vizData.radarFrames.length === 0) return -1;
    let low = 0, high = vizData.radarFrames.length - 1, ans = 0;
    while (low <= high) {
        let mid = Math.floor((low + high) / 2);
        if (vizData.radarFrames[mid].timestampMs <= targetTimeMs) {
            ans = mid; low = mid + 1;
        }
        else {
            high = mid - 1;
        }
    }
    return ans;
}

export function findLastCanIndexBefore(targetTime, canData) {
    if (!canData || canData.length === 0) return -1;
    let low = 0, high = canData.length - 1, ans = -1;
    while (low <= high) {
        let mid = Math.floor((low + high) / 2);
        if (canData[mid].time <= targetTime) {
            ans = mid; low = mid + 1;
        } else {
            high = mid - 1;

        }
    }
    return ans;
}

export function extractTimestampInfo(filename) {
    if (!filename) return null;
    let match = filename.match(/Tracks_(\d{8}_\d{6}\.\d{3})/);
    if (match) return { timestampStr: match[1], format: 'json' };
    match = filename.match(/WIN_(\d{8})_(\d{2})_(\d{2})_(\d{2})/);
    if (match) {
        const timestamp = `${match[1]}_${match[2]}${match[3]}${match[4]}`;
        return { timestampStr: timestamp, format: 'video' };
    } match = filename.match(/video_(\d{8}_\d{6})/);
    if (match) return {
        timestampStr: match[1], format: 'video'
    };

    return null;
}

export function parseTimestamp(timestampStr, format) {
    if (!timestampStr || !format) return null;
    let day, month, year, hour, minute, second, millisecond = 0;
    if (format === 'video') {
        [year, month, day] = [timestampStr.substring(0, 4), timestampStr.substring(4, 6), timestampStr.substring(6, 8)];
        [hour, minute, second] = [timestampStr.substring(9, 11), timestampStr.substring(11, 13), timestampStr.substring(13, 15)];
    }
    else if (format === 'json') {
        [day, month, year] = [timestampStr.substring(0, 2), timestampStr.substring(2, 4), timestampStr.substring(4, 8)];
        [hour, minute, second, millisecond] = [timestampStr.substring(9, 11), timestampStr.substring(11, 13), timestampStr.substring(13, 15), parseInt(timestampStr.substring(16, 19))];
    }
    else {
        return null;
    }
    const date = new Date(Date.UTC(year, month - 1, day, hour, minute, second, millisecond));
    return isNaN(date.getTime()) ? null : date;
}

/**
 * Creates a throttled function that only invokes the provided function
 * at most once per every `delay` milliseconds.
 * @param {Function} func The function to throttle.
 * @param {number} delay The number of milliseconds to throttle invocations to.
 * @returns {Function} Returns the new throttled function.
 */
export function throttle(func, delay) {
    let lastCall = 0;
    return function(...args) {
        const now = new Date().getTime();
        if (now - lastCall < delay) {
            return;
        }
        lastCall = now;
        return func(...args);
    };
}