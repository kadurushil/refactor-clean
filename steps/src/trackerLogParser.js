/**
 * trackerLogParser.js
 * Parses tracker console log files (e.g., tracking.log) into structured per-frame
 * diagnostic and track management objects for the Data Explorer panel.
 */

/**
 * Smart Tracker Log File Matcher
 * Finds the correct tracking.log file for a selected JSON dataset.
 * Handles folder layouts containing multiple log files or root/simulations/console_out/tracking.log.
 * @param {File|null} jsonFile - Target JSON dataset file object
 * @param {Array<File>} allFiles - All extracted files from upload/folder
 * @returns {File|null} Best matching log file object
 */
export function findBestTrackerLogMatch(jsonFile, allFiles = []) {
  if (!allFiles || allFiles.length === 0) return null;

  const logFiles = allFiles.filter((f) => f.name.toLowerCase().endsWith(".log"));
  if (logFiles.length === 0) return null;

  const jPath = (jsonFile && (jsonFile.relativePath || jsonFile.webkitRelativePath || jsonFile.name)) || "";
  const normalizedJPath = jPath.replace(/\\/g, "/");
  const jDir = normalizedJPath.includes("/")
    ? normalizedJPath.substring(0, normalizedJPath.lastIndexOf("/"))
    : "";

  // 1. Same Directory or Subdirectory match (e.g., jDir + "/console_out/tracking.log")
  if (jDir) {
    const sameDirLogs = logFiles.filter((f) => {
      const fPath = (f.relativePath || f.webkitRelativePath || f.name).replace(/\\/g, "/");
      return (
        fPath === `${jDir}/console_out/tracking.log` ||
        fPath === `${jDir}/tracking.log` ||
        fPath.endsWith(`${jDir}/console_out/tracking.log`)
      );
    });
    if (sameDirLogs.length > 0) {
      sameDirLogs.sort((a, b) => (b.size || 0) - (a.size || 0));
      return sameDirLogs[0];
    }
  }

  // 2. Prioritize tracking.log in a "simulations/console_out" directory (full simulation frame logs)
  const simConsoleLogs = logFiles.filter((f) => {
    const fPath = (f.relativePath || f.webkitRelativePath || f.name).replace(/\\/g, "/").toLowerCase();
    return fPath.endsWith("simulations/console_out/tracking.log");
  });
  if (simConsoleLogs.length > 0) {
    simConsoleLogs.sort((a, b) => (b.size || 0) - (a.size || 0));
    return simConsoleLogs[0];
  }

  // 3. Exact filename match for tracking.log (largest file preferred)
  const trackingLogs = logFiles.filter((f) => f.name.toLowerCase() === "tracking.log");
  if (trackingLogs.length > 0) {
    trackingLogs.sort((a, b) => (b.size || 0) - (a.size || 0));
    return trackingLogs[0];
  }

  // 4. Filename containing "tracking" ending with .log
  const nameLogs = logFiles.filter((f) => f.name.toLowerCase().includes("tracking"));
  if (nameLogs.length > 0) {
    nameLogs.sort((a, b) => (b.size || 0) - (a.size || 0));
    return nameLogs[0];
  }

  // 5. Fallback to largest log file
  logFiles.sort((a, b) => (b.size || 0) - (a.size || 0));
  return logFiles[0];
}

/**
 * Parses raw text from tracking.log into a map of frame data objects.
 * @param {string} logText - Raw file content of tracking.log
 * @returns {{ frames: Map<number, Object>, frameList: Object[], parameters: string[] }}
 */
export function parseTrackerLog(logText) {
  if (!logText || typeof logText !== "string") {
    return { frames: new Map(), frameList: [], parameters: [] };
  }

  const lines = logText.split(/\r?\n/);
  const framesMap = new Map();
  const frameList = [];
  const parameters = [];

  let currentFrameNum = null;
  let currentSection = null; // 'PRE', 'DIAGNOSTICS', 'TRACK_MANAGEMENT'
  let currentFrameObj = null;

  function initFrame(frameNum) {
    return {
      frameNum,
      preFrameLogs: [],
      diagnostics: {
        rawLines: [],
        deltaT: null,
        radarPoints: null,
        egoVx: null,
        egoVy: null,
        accel: null,
        ransacInliers: null,
        ransacOutliers: null,
        ransacRatio: null,
        dbscanClusters: null,
        trackingClusters: null,
      },
      trackManagement: {
        rawLines: [],
        lifecycle: { confirmed: 0, tentative: 0, lost: 0 },
        finalConfirmed: null,
        steps: [], // Categorized action log items
      },
    };
  }

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const line = rawLine.trim();
    if (!line) continue;

    // Check header parameter lines
    if (line.includes("--- Using the following parameters:") || line.startsWith("[INFO] DBSCAN:") || line.startsWith("[INFO] Tracking:")) {
      parameters.push(line);
      continue;
    }

    // Diagnostics section start: --- MASTER FRAME N: DIAGNOSTICS ---
    const diagMatch = line.match(/--- MASTER FRAME (\d+): DIAGNOSTICS ---/);
    if (diagMatch) {
      currentFrameNum = parseInt(diagMatch[1], 10);
      if (!framesMap.has(currentFrameNum)) {
        currentFrameObj = initFrame(currentFrameNum);
        framesMap.set(currentFrameNum, currentFrameObj);
        frameList.push(currentFrameObj);
      } else {
        currentFrameObj = framesMap.get(currentFrameNum);
      }
      currentSection = "DIAGNOSTICS";
      continue;
    }

    // Track Management section start: --- MASTER FRAME N: TRACK MANAGEMENT ---
    const tmMatch = line.match(/--- MASTER FRAME (\d+): TRACK MANAGEMENT ---/);
    if (tmMatch) {
      currentFrameNum = parseInt(tmMatch[1], 10);
      if (!framesMap.has(currentFrameNum)) {
        currentFrameObj = initFrame(currentFrameNum);
        framesMap.set(currentFrameNum, currentFrameObj);
        frameList.push(currentFrameObj);
      } else {
        currentFrameObj = framesMap.get(currentFrameNum);
      }
      currentSection = "TRACK_MANAGEMENT";
      continue;
    }

    // Frame End: --- END MASTER FRAME N ---
    const endMatch = line.match(/--- END MASTER FRAME (\d+) ---/);
    if (endMatch) {
      currentSection = null;
      currentFrameNum = null;
      currentFrameObj = null;
      continue;
    }

    // If we're inside a frame object
    if (currentFrameObj) {
      if (currentSection === "DIAGNOSTICS") {
        currentFrameObj.diagnostics.rawLines.push(line);

        // Parse diagnostic metrics
        const dtMatch = line.match(/Delta_t:\s*([\d.]+)s/);
        if (dtMatch) currentFrameObj.diagnostics.deltaT = parseFloat(dtMatch[1]);

        const ptsMatch = line.match(/Radar Points:\s*(\d+)/);
        if (ptsMatch) currentFrameObj.diagnostics.radarPoints = parseInt(ptsMatch[1], 10);

        const egoMatch = line.match(/EgoVx \(Longi\):\s*([\d.-]+)\s*m\/s,\s*EgoVy \(Lat\):\s*([\d.-]+)\s*m\/s,\s*Accel:\s*([\d.-]+)\s*m\/s\^2/);
        if (egoMatch) {
          currentFrameObj.diagnostics.egoVx = parseFloat(egoMatch[1]);
          currentFrameObj.diagnostics.egoVy = parseFloat(egoMatch[2]);
          currentFrameObj.diagnostics.accel = parseFloat(egoMatch[3]);
        }

        const ransacMatch = line.match(/RANSAC:\s*Inliers=(\d+),\s*Outliers=(\d+)\s*\(Ratio:\s*([\d.]+)\)/);
        if (ransacMatch) {
          currentFrameObj.diagnostics.ransacInliers = parseInt(ransacMatch[1], 10);
          currentFrameObj.diagnostics.ransacOutliers = parseInt(ransacMatch[2], 10);
          currentFrameObj.diagnostics.ransacRatio = parseFloat(ransacMatch[3]);
        }

        const dbscanMatch = line.match(/DBSCAN:\s*Found\s*(\d+)\s*clusters/);
        if (dbscanMatch) currentFrameObj.diagnostics.dbscanClusters = parseInt(dbscanMatch[1], 10);

        const trackEligMatch = line.match(/Tracking:\s*(\d+)\s*clusters eligible/);
        if (trackEligMatch) currentFrameObj.diagnostics.trackingClusters = parseInt(trackEligMatch[1], 10);

      } else if (currentSection === "TRACK_MANAGEMENT") {
        currentFrameObj.trackManagement.rawLines.push(line);

        // Parse lifecycle metrics
        const lcMatch = line.match(/Lifecycle:\s*(\d+)\s*confirmed,\s*(\d+)\s*tentative,\s*(\d+)\s*lost/);
        if (lcMatch) {
          currentFrameObj.trackManagement.lifecycle = {
            confirmed: parseInt(lcMatch[1], 10),
            tentative: parseInt(lcMatch[2], 10),
            lost: parseInt(lcMatch[3], 10),
          };
        }

        const finalMatch = line.match(/End: Final confirmed tracks:\s*(\d+)/);
        if (finalMatch) {
          currentFrameObj.trackManagement.finalConfirmed = parseInt(finalMatch[1], 10);
        }

        // Categorize steps
        let stepCategory = "GENERAL";
        if (line.includes("ASSIGN")) stepCategory = "ASSIGN";
        else if (line.includes("IMM-PREDICT") || line.includes("Predicting states")) stepCategory = "PREDICT";
        else if (line.includes("TENTATIVE") || line.includes("GATING-REJECT") || line.includes("DYN-GROUP-TENT") || line.includes("STATE-DEBUG")) stepCategory = "TENTATIVE";
        else if (line.includes("REASSIGN")) stepCategory = "REASSIGN";
        else if (line.includes("DELETE") || line.includes("IMM-PROBS")) stepCategory = "DELETE";

        currentFrameObj.trackManagement.steps.push({
          category: stepCategory,
          line: line,
        });
      }
    } else {
      // Pre-frame lines or lines occurring between frame ends and next frame
      if (currentFrameNum !== null && framesMap.has(currentFrameNum)) {
        framesMap.get(currentFrameNum).preFrameLogs.push(line);
      }
    }
  }

  return {
    frames: framesMap,
    frameList: frameList,
    parameters: parameters,
  };
}
