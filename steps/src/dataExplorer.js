import { appState } from './state.js';
import { throttle } from './utils.js';
import { makeDraggableAndResizable } from './ui.js';
import { 
    canvasContainer, 
    explorerBtn,
    mainContent
} from './dom.js'; // Import the DOM elements we need to listen to
import { popoutDataExplorer } from './dataExplorerPop.js';

// --- DOM Elements (Internal to this module) ---
const panel = document.getElementById('data-explorer-panel');
const closeBtn = document.getElementById('close-explorer-btn');
const popoutBtn = document.getElementById('popout-explorer-btn');
const footer = document.getElementById('explorer-footer');
const plotBtn = document.getElementById('plot-selected-btn');

const tabs = {
    tree: { btn: document.getElementById('tab-btn-tree'), panel: document.getElementById('tab-panel-tree') },
    grid: { btn: document.getElementById('tab-btn-grid'), panel: document.getElementById('tab-panel-grid') },
    trackGrid: { btn: document.getElementById('tab-btn-track-grid'), panel: document.getElementById('tab-panel-track-grid') },
    adas: { btn: document.getElementById('tab-btn-adas'), panel: document.getElementById('tab-panel-adas') },
    trackerLog: { btn: document.getElementById('tab-btn-tracker-log'), panel: document.getElementById('tab-panel-tracker-log') },
    plot: { btn: document.getElementById('tab-btn-plot'), panel: document.getElementById('tab-panel-plot') },
};

const gridDiv = document.getElementById('data-grid');
const trackGridDiv = document.getElementById('track-data-grid');
const adasContainer = document.getElementById('adas-vertical-view');
const trackerLogContainer = document.getElementById('tracker-log-view');
const chartCanvas = document.getElementById('data-chart');

// Dual View Mode DOM References for Track Grid
const btnCardsView = document.getElementById('track-view-mode-cards');
const btnTableView = document.getElementById('track-view-mode-table');
const trackCardsContainer = document.getElementById('track-cards-view');
const trackTableView = document.getElementById('track-table-view');
const trackSearchInput = document.getElementById('track-search-input');
const pointcloudSearchInput = document.getElementById('pointcloud-search-input');
const autoFitPointCloudBtn = document.getElementById('autofit-pointcloud-btn');
const autoFitTracksBtn = document.getElementById('autofit-tracks-btn');

// --- Module-Local State ---
let gridApi = null;
let trackGridApi = null;
let chartInstance = null;
let currentGridData = null;
let isDiagnosticsCollapsed = localStorage.getItem('dataExplorer_diagnosticsCollapsed') === 'true';
let trackGridViewMode = localStorage.getItem('dataExplorer_trackGridViewMode') || 'cards';
let currentTrackFilter = '';
let currentPointCloudFilter = '';
let lastPointCloudColKeys = '';
let lastTrackGridColKeys = '';

// --- EXPORTED STATE for Optimization ---
export let isExplorerOpen = false;

// --- Accessor Exports for Pop-Out Module ---
/** Returns the #data-explorer-panel DOM element. */
export function getPanel() { return panel; }

/** Returns live references to the AG-Grid API instances and cached row data. */
export function getGridApis() {
    return { gridApi, trackGridApi, currentGridData };
}

/** Forces AG-Grid to re-derive column definitions on next update. */
export function resetColumnKeyCaches() {
    lastPointCloudColKeys = null;
    lastTrackGridColKeys = null;
}

/** Sets the isExplorerOpen flag (used by pop-out module). */
export function setExplorerOpen(val) {
    isExplorerOpen = val;
}

// --- State & Risk Badge Formatting Helpers ---
function getStateBadgeHtml(stateVal) {
    switch (stateVal) {
        case 0:
            return '<span class="px-2 py-0.5 rounded text-[10px] font-semibold bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400 border border-gray-300 dark:border-gray-600">FREE (0)</span>';
        case 1:
            return '<span class="px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 border border-blue-300 dark:border-blue-800">INIT (1)</span>';
        case 2:
            return '<span class="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border border-amber-300 dark:border-amber-800">TENTATIVE (2)</span>';
        case 3:
            return '<span class="px-2 py-0.5 rounded text-[10px] font-semibold bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300 border border-green-300 dark:border-green-800">CONFIRMED (3)</span>';
        case 4:
            return '<span class="px-2 py-0.5 rounded text-[10px] font-semibold bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300 border border-orange-300 dark:border-orange-800">COASTING (4)</span>';
        case 5:
            return '<span class="px-2 py-0.5 rounded text-[10px] font-semibold bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300 border border-red-300 dark:border-red-800">LOST (5)</span>';
        default:
            return `<span class="px-2 py-0.5 rounded text-[10px] font-semibold bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300">State ${stateVal ?? 'N/A'}</span>`;
    }
}

function getRiskBadgeHtml(riskVal) {
    switch (riskVal) {
        case 0:
            return '<span class="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400">Low (0)</span>';
        case 1:
            return '<span class="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300">Low (1)</span>';
        case 2:
            return '<span class="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">Medium (2)</span>';
        case 3:
            return '<span class="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300">High (3)</span>';
        default:
            return `<span class="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400">${riskVal ?? '0'}</span>`;
    }
}

const COLUMN_HEADER_MAP = {
    trackId: 'Track ID',
    frameIdx: 'Frame',
    state: 'State',
    predictedPos: 'Predicted Pos (m)',
    predictedPosition: 'Predicted Pos (m)',
    predictedVel: 'Predicted Vel (m/s)',
    predictedVelocity: 'Predicted Vel (m/s)',
    correctedPos: 'Corrected Pos (m)',
    correctedPosition: 'Corrected Pos (m)',
    correctedVel: 'Corrected Vel (m/s)',
    correctedVelocity: 'Corrected Vel (m/s)',
    ttc: 'TTC (s)',
    tti: 'TTI (s)',
    risk: 'Risk',
    histCount: 'Age (Frames)',
    isStationary: 'Stationary',
    modelProbabilities: 'Model Probs (CV/CT/CA)',
    accel: 'Accel [Ax, Ay]',
    omega: 'Yaw Rate (rad/s)',
    ellipseAngle: 'Ellipse Angle (°)',
    ellipseRadii: 'Ellipse Radii',
    objectExtentAngle: 'Extent Angle (°)',
    objectExtentRadii: 'Extent Radii',
    covarianceP: 'Covariance Matrix P',
};

// --- Column State Persistence Functions ---
function savePointCloudColumnState() {
    if (gridApi) {
        try {
            const state = gridApi.getColumnState();
            localStorage.setItem('dataExplorer_pointCloudColumnState', JSON.stringify(state));
        } catch (e) {
            console.warn('Failed to save point cloud column state:', e);
        }
    }
}

function saveTrackGridColumnState() {
    if (trackGridApi) {
        try {
            const state = trackGridApi.getColumnState();
            localStorage.setItem('dataExplorer_trackGridColumnState', JSON.stringify(state));
        } catch (e) {
            console.warn('Failed to save track grid column state:', e);
        }
    }
}

// --- AG Grid Configuration ---
const gridOptions = {
    rowData: [],
    columnDefs: [],
    defaultColDef: {
        sortable: true,
        filter: true,
        resizable: true,
        width: 100,
    },
    onColumnResized: savePointCloudColumnState,
    onColumnMoved: savePointCloudColumnState,
    onSortChanged: savePointCloudColumnState,
    onColumnVisible: savePointCloudColumnState,
    columnTypes: {
        numberColumn: {
            valueFormatter: params => {
                const { value, colDef } = params;
                if (typeof value !== 'number' || value === null || Number.isInteger(value)) {
                    return value;
                }
                switch (colDef.field) {
                    case 'snr':
                        return value.toFixed(2);
                    default:
                        return value.toFixed(4);
                }
            }
        }
    }
};

const trackGridOptions = {
    ...gridOptions,
    onColumnResized: saveTrackGridColumnState,
    onColumnMoved: saveTrackGridColumnState,
    onSortChanged: saveTrackGridColumnState,
    onColumnVisible: saveTrackGridColumnState,
};


// --- Chart.js Configuration ---
function createChart(data, label) {
    if (chartInstance) {
        chartInstance.destroy();
    }
    chartInstance = new Chart(chartCanvas, {
        type: 'line',
        data: {
            labels: data.map((_, i) => i),
            datasets: [{
                label: label,
                data: data,
                borderColor: 'rgba(75, 192, 192, 1)',
                tension: 0.1,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
        }
    });
}

// --- Core Functions ---

export function showExplorer() {
    panel.classList.remove('hidden');
    isExplorerOpen = true; // Update state
    updateExplorer();
}

function hideExplorer() {
    panel.classList.add('hidden');
    isExplorerOpen = false; // Update state
}

function switchTab(targetTab) {
    Object.values(tabs).forEach(tab => {
        tab.panel.classList.add('hidden');
        // Remove active classes (border and color)
        tab.btn.classList.remove('border-b-2', 'border-blue-500');
        // Add inactive classes (gray text)
        tab.btn.classList.add('text-gray-500', 'dark:text-gray-400');
    });

    tabs[targetTab].panel.classList.remove('hidden');
    // Add active classes (border and color)
    tabs[targetTab].btn.classList.add('border-b-2', 'border-blue-500');
    // Remove inactive classes (gray text)
    tabs[targetTab].btn.classList.remove('text-gray-500', 'dark:text-gray-400');

    footer.classList.toggle('hidden', targetTab !== 'grid');
    localStorage.setItem('dataExplorer_activeTab', targetTab);

    if (targetTab === 'grid' && gridApi) {
        lastPointCloudColKeys = null; // Force column definition re-binding
        updateExplorer();
        setTimeout(() => {
            // Guard: AG-Grid warns (#29) if grid has zero width (tab may still be rendering)
            if (gridDiv && gridDiv.offsetWidth > 0) {
                try { gridApi.sizeColumnsToFit(); } catch (e) {}
            }
        }, 50);
    } else if (targetTab === 'trackGrid') {
        lastTrackGridColKeys = null;
        updateExplorer();
        if (trackGridApi) {
            setTimeout(() => {
                const savedTrackState = localStorage.getItem('dataExplorer_trackGridColumnState');
                if (savedTrackState) {
                    try { trackGridApi.applyColumnState({ state: JSON.parse(savedTrackState), applyOrder: true }); } catch (e) {}
                }
                try { trackGridApi.redrawRows(); } catch (e) {}
            }, 50);
        }
    }
}

function createTreeView(data) {
    const pre = document.createElement('pre');
    pre.textContent = JSON.stringify(data, (key, value) => {
        if (key.startsWith('_')) return undefined;
        return value;
    }, 2);
    return pre;
}

export function updateExplorer() {
    if (panel.classList.contains('hidden') || !appState.vizData) return;
    
    const frame = appState.vizData.radarFrames[appState.currentFrame];
    if (!frame) return;

    const frameIdx = frame.frameIdx || (appState.currentFrame + 1);
    const trackerLogFrame = appState.trackerLogData?.frames?.get(frameIdx) || null;

    // --- START: Correctly gather track data for the current frame ---
    // We iterate through all tracks and find the history log entry for the current frame.
    const tracksForCurrentFrame = appState.vizData.tracks
        .map(track => {
            const log = track.historyLog.find(log => log.frameIdx === frame.frameIdx);
            // Return a new object combining track ID with its log for this frame, if it exists.
            return log ? { trackId: track.id, ...log } : null;
        })
        .filter(Boolean); // Filter out any null entries for tracks not present in this frame.
    // --- END: Correctly gather track data for the current frame ---
    
    tabs.tree.panel.innerHTML = '';
    tabs.tree.panel.appendChild(createTreeView({
        currentFrame: frameIdx,
        frameData: frame,
        trackData: tracksForCurrentFrame,
        trackerLog: trackerLogFrame
    }));

    // --- START: Auto-update Point Cloud Grid ---
    const pointCloudData = frame.pointCloud || frame.point_cloud || frame.detections || frame.rawPoints || frame.points || [];
    displayInGrid(pointCloudData, `${frameIdx}`);
    // --- END: Auto-update Point Cloud Grid ---
    displayTracksInGrid(tracksForCurrentFrame);
    displayAdasData(frame.adas);
    displayTrackerLogData(trackerLogFrame, frameIdx);
}

function displayInGrid(data, title) {
    if (!gridApi) return;

    if (!Array.isArray(data) || data.length === 0) {
        gridApi.setGridOption('rowData', []);
        tabs.grid.btn.textContent = `Point Cloud: Frame ${title} (0 points)`;
        currentGridData = [];
        return;
    }

    const indexedData = data.map((row, index) => ({
        index: index,
        ...row
    }));
    currentGridData = indexedData;

    // Only update column definitions if the column schema actually changes
    const currentColKeys = Object.keys(indexedData[0]).join(',');
    if (currentColKeys !== lastPointCloudColKeys) {
        lastPointCloudColKeys = currentColKeys;

        const columns = Object.keys(indexedData[0]).map(key => ({
            field: key,
            headerName: COLUMN_HEADER_MAP[key] || key,
            type: typeof indexedData[0][key] === 'number' ? 'numberColumn' : undefined
        }));

        gridApi.setGridOption('columnDefs', columns);

        const savedState = localStorage.getItem('dataExplorer_pointCloudColumnState');
        if (savedState) {
            try {
                gridApi.applyColumnState({ state: JSON.parse(savedState), applyOrder: true });
            } catch (e) {
                gridApi.applyColumnState({ state: [{ colId: 'index', sort: 'asc' }] });
            }
        } else {
            gridApi.applyColumnState({ state: [{ colId: 'index', sort: 'asc' }] });
        }
    }

    // Update row data cleanly without re-calculating column widths
    gridApi.setGridOption('rowData', indexedData);
    tabs.grid.btn.textContent = `Point Cloud: Frame ${title} (${data.length} points)`;
}

function displayTracksAsCards(trackData) {
    if (!trackCardsContainer) return;
    trackCardsContainer.innerHTML = '';

    const filtered = currentTrackFilter
        ? trackData.filter(t => {
            const str = JSON.stringify(t).toLowerCase();
            return str.includes(currentTrackFilter);
        })
        : trackData;

    if (!Array.isArray(filtered) || filtered.length === 0) {
        const emptyMsg = document.createElement('div');
        emptyMsg.className = 'text-gray-500 text-center p-6 italic';
        emptyMsg.textContent = currentTrackFilter
            ? `No tracks matching "${currentTrackFilter}"`
            : 'No track data for this frame';
        trackCardsContainer.appendChild(emptyMsg);
        return;
    }

    filtered.forEach((track) => {
        const card = document.createElement('div');
        card.className = 'bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600 p-3 space-y-3 shadow-sm hover:border-blue-400 transition-colors';

        // Retrieve Position & Velocity using all property key variations
        const predPos = track.predictedPosition ?? track.predictedPos;
        const predVel = track.predictedVelocity ?? track.predictedVel;
        const corrPos = track.correctedPosition ?? track.correctedPos;
        const corrVel = track.correctedVelocity ?? track.correctedVel;

        // Header: Track ID + Badges (State on Left, Risk, Stationary, TTI, TTC on Right)
        const header = document.createElement('div');
        header.className = 'flex flex-wrap items-center justify-between gap-2 border-b pb-2 border-gray-200 dark:border-gray-600';

        let statBadge = '';
        if (track.isStationary !== undefined && track.isStationary !== null) {
            statBadge = track.isStationary
                ? '<span class="px-2 py-0.5 rounded text-[10px] font-semibold bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-200 border border-gray-300 dark:border-gray-600">🛑 Stationary</span>'
                : '<span class="px-2 py-0.5 rounded text-[10px] font-semibold bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300 border border-indigo-300 dark:border-indigo-800">🚗 Moving</span>';
        }

        const ttiBadge = (track.tti !== undefined && track.tti !== null)
            ? `<span class="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500 text-white">TTI: ${typeof track.tti === 'number' ? track.tti.toFixed(2) : track.tti}s</span>`
            : '';

        const ttcBadge = (track.ttc !== undefined && track.ttc !== null)
            ? `<span class="px-2 py-0.5 rounded text-[10px] font-mono font-bold ${track.ttc < 2.0 ? 'bg-red-500 text-white' : 'bg-blue-600 text-white'}">TTC: ${typeof track.ttc === 'number' ? track.ttc.toFixed(2) : track.ttc}s</span>`
            : '';

        header.innerHTML = `
            <div class="flex items-center gap-2">
                <span class="font-extrabold text-sm text-gray-900 dark:text-white">Track #${track.trackId}</span>
                ${getStateBadgeHtml(track.state)}
            </div>
            <div class="flex flex-wrap items-center gap-1.5">
                ${statBadge}
                <span class="text-[10px] text-gray-400">Risk: ${getRiskBadgeHtml(track.risk)}</span>
                ${ttiBadge}
                ${ttcBadge}
            </div>
        `;
        card.appendChild(header);

        // Compact Kinematics Box (Predicted vs Corrected in 1-2 lines max)
        const grid = document.createElement('div');
        grid.className = 'grid grid-cols-1 md:grid-cols-2 gap-2 text-[10px] font-mono';

        const fmtVec = (vec) => Array.isArray(vec) ? `[${vec.map(v => typeof v === 'number' ? v.toFixed(3) : v).join(', ')}]` : (vec ?? 'N/A');

        grid.innerHTML = `
            <div class="bg-white dark:bg-gray-800 px-2 py-1.5 rounded border border-gray-200 dark:border-gray-700 flex flex-wrap items-center justify-between gap-x-2">
                <span class="text-[9px] font-sans uppercase font-bold text-blue-500">Predicted</span>
                <span class="text-gray-700 dark:text-gray-300"><span class="text-gray-400 font-sans font-medium">Pos:</span> ${fmtVec(predPos)}</span>
                <span class="text-gray-700 dark:text-gray-300"><span class="text-gray-400 font-sans font-medium">Vel:</span> ${fmtVec(predVel)}</span>
            </div>
            <div class="bg-white dark:bg-gray-800 px-2 py-1.5 rounded border border-gray-200 dark:border-gray-700 flex flex-wrap items-center justify-between gap-x-2">
                <span class="text-[9px] font-sans uppercase font-bold text-green-500">Corrected</span>
                <span class="text-gray-700 dark:text-gray-300"><span class="text-gray-400 font-sans font-medium">Pos:</span> ${fmtVec(corrPos)}</span>
                <span class="text-gray-700 dark:text-gray-300"><span class="text-gray-400 font-sans font-medium">Vel:</span> ${fmtVec(corrVel)}</span>
            </div>
        `;
        card.appendChild(grid);

        // Extra Keys Footer (Separates concise fields vs large matrices like covarianceP)
        const knownKeys = [
            'trackId', 'frameIdx', 'state',
            'predictedPos', 'predictedPosition',
            'predictedVel', 'predictedVelocity',
            'correctedPos', 'correctedPosition',
            'correctedVel', 'correctedVelocity',
            'ttc', 'tti', 'risk', 'isStationary'
        ];
        const extraKeys = Object.keys(track).filter(k => !knownKeys.includes(k));
        if (extraKeys.length > 0) {
            const extraContainer = document.createElement('div');
            extraContainer.className = 'border-t pt-2 border-gray-200 dark:border-gray-700 space-y-1.5';

            const inlineFields = [];
            const collapsibleFields = [];

            extraKeys.forEach(k => {
                const val = track[k];
                const label = COLUMN_HEADER_MAP[k] || k;
                if (Array.isArray(val) && val.length > 6) {
                    collapsibleFields.push({ key: k, label, val });
                } else {
                    inlineFields.push({ key: k, label, val });
                }
            });

            if (inlineFields.length > 0) {
                const inlineDiv = document.createElement('div');
                inlineDiv.className = 'flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-gray-600 dark:text-gray-300 font-mono';
                inlineFields.forEach(item => {
                    const formattedVal = Array.isArray(item.val) ? fmtVec(item.val) : item.val;
                    inlineDiv.innerHTML += `<div><span class="font-sans font-semibold text-gray-400">${item.label}:</span> ${formattedVal}</div>`;
                });
                extraContainer.appendChild(inlineDiv);
            }

            if (collapsibleFields.length > 0) {
                collapsibleFields.forEach(item => {
                    const details = document.createElement('details');
                    details.className = 'text-[10px] text-gray-600 dark:text-gray-300 bg-white dark:bg-gray-800 p-1.5 rounded border border-gray-200 dark:border-gray-700';
                    const summary = document.createElement('summary');
                    summary.className = 'cursor-pointer font-sans font-bold text-[9px] uppercase text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 select-none';
                    summary.textContent = `${item.label} (${item.val.length} values)`;
                    details.appendChild(summary);

                    const pre = document.createElement('pre');
                    pre.className = 'mt-1 font-mono text-[9px] whitespace-pre-wrap max-h-32 overflow-y-auto text-gray-700 dark:text-gray-300 p-1 bg-gray-50 dark:bg-gray-900 rounded';
                    pre.textContent = JSON.stringify(item.val);
                    details.appendChild(pre);

                    extraContainer.appendChild(details);
                });
            }

            card.appendChild(extraContainer);
        }

        trackCardsContainer.appendChild(card);
    });
}

function displayTracksInGrid(trackData) {
    if (!Array.isArray(trackData) || trackData.length === 0) {
        if (trackGridApi) trackGridApi.setGridOption('rowData', []);
        displayTracksAsCards([]);
        return;
    }

    tabs.trackGrid.btn.textContent = `Track Grid: Frame ${appState.currentFrame + 1}`;

    // Render Cards View
    displayTracksAsCards(trackData);

    // Only update AG-Grid column definitions if column schema changes
    const allKeys = new Set();
    trackData.forEach(track => {
        Object.keys(track).forEach(key => allKeys.add(key));
    });
    const colKeysArray = Array.from(allKeys).sort();
    const currentColKeys = colKeysArray.join(',');

    if (currentColKeys !== lastTrackGridColKeys && trackGridApi) {
        lastTrackGridColKeys = currentColKeys;

        const columns = colKeysArray.map(key => ({
            field: key,
            headerName: COLUMN_HEADER_MAP[key] || key,
            type: typeof trackData.find(t => t[key] !== null && t[key] !== undefined)?.[key] === 'number' ? 'numberColumn' : undefined,
            cellRenderer: params => {
                if (key === 'state') return getStateBadgeHtml(params.value);
                if (key === 'risk') return getRiskBadgeHtml(params.value);
                if (Array.isArray(params.value)) {
                    return `<span class="font-mono text-[10px]">[${params.value.map(v => (typeof v === 'number' && v !== null) ? v.toFixed(3) : JSON.stringify(v)).join(', ')}]</span>`;
                }
                return params.value;
            }
        }));

        trackGridApi.setGridOption('columnDefs', columns);

        const savedTrackState = localStorage.getItem('dataExplorer_trackGridColumnState');
        if (savedTrackState) {
            try {
                trackGridApi.applyColumnState({ state: JSON.parse(savedTrackState), applyOrder: true });
            } catch (e) {
                console.warn('Failed to apply track grid column state:', e);
            }
        }
    }

    // Update row data cleanly without re-calculating column widths
    if (trackGridApi) {
        trackGridApi.setGridOption('rowData', trackData);
    }
}

/**
 * Renders ADAS data as a vertical property list (cards).
 * Rationale: ADAS objects have many properties but few entries per frame.
 * A vertical layout is much more readable than a wide horizontal grid.
 */
function displayAdasData(adasData) {
    if (!adasContainer) return;
    adasContainer.innerHTML = '';

    if (!Array.isArray(adasData) || adasData.length === 0) {
        const emptyMsg = document.createElement('div');
        emptyMsg.className = 'text-gray-500 text-center p-4';
        emptyMsg.textContent = 'No ADAS data for this frame';
        adasContainer.appendChild(emptyMsg);
        return;
    }

    tabs.adas.btn.textContent = `ADAS Data: Frame ${appState.currentFrame + 1}`;

    adasData.forEach((item, index) => {
        const card = document.createElement('div');
        card.className = 'bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600 overflow-hidden';
        
        const table = document.createElement('div');
        table.className = 'grid grid-cols-[1fr_auto] gap-px bg-gray-200 dark:bg-gray-600';

        // Add Table Headers
        const keyHeader = document.createElement('div');
        keyHeader.className = 'bg-gray-100 dark:bg-gray-700 px-2 py-1 text-[10px] font-bold uppercase text-gray-400 border-b border-gray-200 dark:border-gray-600';
        keyHeader.textContent = 'Key';
        const valHeader = document.createElement('div');
        valHeader.className = 'bg-gray-100 dark:bg-gray-700 px-2 py-1 text-[10px] font-bold uppercase text-gray-400 border-b border-gray-200 dark:border-gray-600 text-right min-w-[80px]';
        valHeader.textContent = 'Value';
        table.appendChild(keyHeader);
        table.appendChild(valHeader);

        Object.entries(item).forEach(([key, value]) => {
            const keyEl = document.createElement('div');
            keyEl.className = 'bg-white dark:bg-gray-800 px-2 py-1 text-[11px] font-medium text-gray-500 dark:text-gray-400 truncate';
            keyEl.textContent = key;

            const valEl = document.createElement('div');
            valEl.className = 'bg-white dark:bg-gray-800 px-2 py-1 text-[11px] font-mono text-gray-900 dark:text-gray-100 text-right';
            
            // Apply formatting
            if (typeof value === 'number') {
                if (Number.isInteger(value)) {
                    valEl.textContent = value;
                } else if (key === 'snr') {
                    valEl.textContent = value.toFixed(2);
                } else {
                    valEl.textContent = value.toFixed(4);
                }
            } else if (Array.isArray(value)) {
                valEl.textContent = `[${value.map(v => typeof v === 'number' ? v.toFixed(3) : v).join(', ')}]`;
            } else {
                valEl.textContent = value;
            }

            table.appendChild(keyEl);
            table.appendChild(valEl);
        });

        card.appendChild(table);
        adasContainer.appendChild(card);
    });
}

/**
 * Renders Diagnostics and Track Management log data for the current frame.
 */
function displayTrackerLogData(trackerLogFrame, frameIdx) {
    if (!trackerLogContainer) return;
    trackerLogContainer.innerHTML = '';

    if (!trackerLogFrame) {
        tabs.trackerLog.btn.textContent = `Tracker Log`;
        const emptyMsg = document.createElement('div');
        emptyMsg.className = 'text-gray-500 text-center p-4';
        emptyMsg.textContent = appState.trackerLogData
            ? `No log data found for Frame ${frameIdx}`
            : 'No tracker log loaded. Include tracking.log in folder upload.';
        trackerLogContainer.appendChild(emptyMsg);
        return;
    }

    tabs.trackerLog.btn.textContent = `Tracker Log: Frame ${frameIdx}`;

    // --- Section 1: DIAGNOSTICS Card (Collapsible) ---
    const diagCard = document.createElement('details');
    diagCard.className = 'bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600 p-3 space-y-2 group transition-all';
    if (!isDiagnosticsCollapsed) {
        diagCard.open = true;
    }

    diagCard.addEventListener('toggle', () => {
        isDiagnosticsCollapsed = !diagCard.open;
    });

    const diagHeader = document.createElement('summary');
    diagHeader.className = 'font-bold text-xs uppercase tracking-wider text-blue-600 dark:text-blue-400 border-b pb-1 border-gray-200 dark:border-gray-600 flex items-center justify-between cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden';
    diagHeader.innerHTML = `
        <div class="flex items-center gap-1.5">
            <span class="text-[10px] transition-transform duration-200 inline-block transform group-open:rotate-90">▶</span>
            <span>MASTER FRAME ${frameIdx}: DIAGNOSTICS</span>
        </div>
        <span class="text-[10px] text-gray-400 font-normal">Delta_t: ${trackerLogFrame.diagnostics.deltaT ?? 'N/A'}s</span>
    `;
    diagCard.appendChild(diagHeader);

    // Diagnostics Metrics Grid
    const diagGrid = document.createElement('div');
    diagGrid.className = 'grid grid-cols-2 gap-2 text-[11px]';
    
    const diagMetrics = [
        { label: 'Radar Points', val: trackerLogFrame.diagnostics.radarPoints ?? 'N/A' },
        { label: 'Ego Velocity (Long / Lat)', val: `${trackerLogFrame.diagnostics.egoVx ?? 'N/A'} / ${trackerLogFrame.diagnostics.egoVy ?? 'N/A'} m/s` },
        { label: 'Ego Accel', val: `${trackerLogFrame.diagnostics.accel ?? 'N/A'} m/s²` },
        { label: 'RANSAC (In/Out/Ratio)', val: `${trackerLogFrame.diagnostics.ransacInliers ?? 'N/A'} / ${trackerLogFrame.diagnostics.ransacOutliers ?? 'N/A'} (${trackerLogFrame.diagnostics.ransacRatio ?? 'N/A'})` },
        { label: 'DBSCAN Raw Clusters', val: trackerLogFrame.diagnostics.dbscanClusters ?? 'N/A' },
        { label: 'Tracking Eligible', val: trackerLogFrame.diagnostics.trackingClusters ?? 'N/A' }
    ];

    diagMetrics.forEach(m => {
        const item = document.createElement('div');
        item.className = 'bg-white dark:bg-gray-800 p-1.5 rounded border border-gray-200 dark:border-gray-700';
        item.innerHTML = `<div class="text-[10px] font-medium text-gray-400 uppercase">${m.label}</div><div class="font-semibold text-gray-800 dark:text-gray-200">${m.val}</div>`;
        diagGrid.appendChild(item);
    });
    diagCard.appendChild(diagGrid);

    // Diagnostics Raw Lines (collapsible details)
    if (trackerLogFrame.diagnostics.rawLines.length > 0) {
        const rawDiagDetails = document.createElement('details');
        rawDiagDetails.className = 'text-[11px] text-gray-600 dark:text-gray-300 mt-2 bg-gray-100 dark:bg-gray-800 p-2 rounded border border-gray-200 dark:border-gray-700';
        const summary = document.createElement('summary');
        summary.className = 'cursor-pointer font-semibold text-[10px] uppercase text-gray-500 hover:text-gray-700 dark:hover:text-gray-200';
        summary.textContent = `Raw Diagnostics Console Lines (${trackerLogFrame.diagnostics.rawLines.length})`;
        rawDiagDetails.appendChild(summary);

        const rawPre = document.createElement('pre');
        rawPre.className = 'mt-1.5 whitespace-pre-wrap font-mono text-[10px] overflow-x-auto text-gray-700 dark:text-gray-300 max-h-48 overflow-y-auto p-1 bg-white dark:bg-gray-900 rounded border border-gray-200 dark:border-gray-800';
        rawPre.textContent = trackerLogFrame.diagnostics.rawLines.join('\n');
        rawDiagDetails.appendChild(rawPre);

        diagCard.appendChild(rawDiagDetails);
    }
    trackerLogContainer.appendChild(diagCard);

    // --- Section 2: TRACK MANAGEMENT Card ---
    const tmCard = document.createElement('div');
    tmCard.className = 'bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600 p-3 space-y-2';

    const tmHeader = document.createElement('div');
    tmHeader.className = 'font-bold text-xs uppercase tracking-wider text-purple-600 dark:text-purple-400 border-b pb-1 border-gray-200 dark:border-gray-600 flex items-center justify-between';
    tmHeader.innerHTML = `<span>MASTER FRAME ${frameIdx}: TRACK MANAGEMENT</span>`;
    tmCard.appendChild(tmHeader);

    // Lifecycle Badges
    const lc = trackerLogFrame.trackManagement.lifecycle;
    const badgeContainer = document.createElement('div');
    badgeContainer.className = 'flex flex-wrap gap-2 text-[10px] font-semibold';
    badgeContainer.innerHTML = `
        <span class="px-2 py-0.5 rounded bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300 border border-green-300 dark:border-green-800">Confirmed: ${lc.confirmed}</span>
        <span class="px-2 py-0.5 rounded bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300 border border-yellow-300 dark:border-yellow-800">Tentative: ${lc.tentative}</span>
        <span class="px-2 py-0.5 rounded bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300 border border-red-300 dark:border-red-800">Lost: ${lc.lost}</span>
        <span class="px-2 py-0.5 rounded bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 border border-blue-300 dark:border-blue-800">Final Confirmed: ${trackerLogFrame.trackManagement.finalConfirmed ?? lc.confirmed}</span>
    `;
    tmCard.appendChild(badgeContainer);

    // Categorized Steps List
    if (trackerLogFrame.trackManagement.steps.length > 0) {
        const stepsContainer = document.createElement('div');
        stepsContainer.className = 'space-y-1 mt-2';

        trackerLogFrame.trackManagement.steps.forEach(step => {
            const stepRow = document.createElement('div');
            stepRow.className = 'flex items-start gap-2 text-[11px] p-1.5 rounded bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700';

            let catBadge = '';
            switch (step.category) {
                case 'ASSIGN':
                    catBadge = '<span class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-green-600 text-white flex-shrink-0">ASSIGN</span>';
                    break;
                case 'PREDICT':
                    catBadge = '<span class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-blue-600 text-white flex-shrink-0">PREDICT</span>';
                    break;
                case 'TENTATIVE':
                    catBadge = '<span class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-600 text-white flex-shrink-0">TENTATIVE</span>';
                    break;
                case 'REASSIGN':
                    catBadge = '<span class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-purple-600 text-white flex-shrink-0">REASSIGN</span>';
                    break;
                case 'DELETE':
                    catBadge = '<span class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-red-600 text-white flex-shrink-0">DELETE</span>';
                    break;
                default:
                    catBadge = '<span class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-gray-500 text-white flex-shrink-0">INFO</span>';
            }

            stepRow.innerHTML = `${catBadge}<div class="font-mono text-[10px] text-gray-700 dark:text-gray-300 break-all leading-snug">${step.line}</div>`;
            stepsContainer.appendChild(stepRow);
        });

        tmCard.appendChild(stepsContainer);
    }
    trackerLogContainer.appendChild(tmCard);
}


// --- START: New Robust Update Logic ---
let throttleTimer = null;
let debounceTimer = null;
export function throttledUpdateExplorer() {
    // Clear any pending final update, as a new call has come in.
    clearTimeout(debounceTimer);

    // If we are not currently in a "cool-down" period from a throttled call...
    if (!throttleTimer) {
        updateExplorer(); // ...execute the update immediately.
        // Then, set a cool-down timer to prevent another immediate execution.
        throttleTimer = setTimeout(() => { throttleTimer = null; }, 100); // 100ms throttle for snappy display
    }

    // Schedule a final, debounced update for after the interactions stop.
    debounceTimer = setTimeout(() => { updateExplorer(); }, 500); // 500ms debounce
}
// --- END: New Robust Update Logic ---

export function restoreMainPanelLayout(panel) {
    if (!panel) return;
    panel.style.position = 'fixed';
    panel.style.zIndex = '50';
    panel.style.display = '';          // Clear inline display so Tailwind .hidden class works
    panel.style.flexDirection = '';     // Clear inline flex-direction (set during pop-out)

    panel.classList.remove('bottom-24', 'right-4', 'w-full', 'max-w-2xl', 'h-1/2');

    const savedPos = localStorage.getItem(`panel_pos_${panel.id}`);
    if (savedPos) {
        try {
            const state = JSON.parse(savedPos);
            if (state.left) panel.style.left = state.left;
            if (state.top) panel.style.top = state.top;
            if (state.width) panel.style.width = state.width;
            if (state.height) panel.style.height = state.height;
        } catch (e) {
            applyDefaultPanelPosition(panel);
        }
    } else {
        applyDefaultPanelPosition(panel);
    }
}

function applyDefaultPanelPosition(panel) {
    const initialWidth = Math.min(896, window.innerWidth - 32);
    const initialHeight = Math.min(500, window.innerHeight / 2);
    
    panel.style.width = `${initialWidth}px`;
    panel.style.height = `${initialHeight}px`;
    panel.style.top = `${window.innerHeight - initialHeight - 96}px`;
    panel.style.left = `${window.innerWidth - initialWidth - 16}px`;
}

function initializePanelPosition(panel) {
    restoreMainPanelLayout(panel);
}
// --- END: Resizable and Draggable Panel Logic ---

function setTrackGridViewMode(mode) {
    trackGridViewMode = mode;
    localStorage.setItem('dataExplorer_trackGridViewMode', mode);

    if (!btnCardsView || !btnTableView || !trackCardsContainer || !trackTableView) return;

    if (mode === 'cards') {
        trackCardsContainer.classList.remove('hidden');
        trackTableView.classList.add('hidden');
        btnCardsView.className = 'px-2.5 py-1 rounded-md transition-all duration-150 text-white bg-blue-600 shadow-sm font-bold flex items-center gap-1';
        btnTableView.className = 'px-2.5 py-1 rounded-md transition-all duration-150 text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 flex items-center gap-1';
    } else {
        trackCardsContainer.classList.add('hidden');
        trackTableView.classList.remove('hidden');
        btnCardsView.className = 'px-2.5 py-1 rounded-md transition-all duration-150 text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 flex items-center gap-1';
        btnTableView.className = 'px-2.5 py-1 rounded-md transition-all duration-150 text-white bg-blue-600 shadow-sm font-bold flex items-center gap-1';
        
        lastTrackGridColKeys = null; // Force column definitions re-binding
        updateExplorer();

        if (trackGridApi) {
            setTimeout(() => {
                const savedTrackState = localStorage.getItem('dataExplorer_trackGridColumnState');
                if (savedTrackState) {
                    try {
                        trackGridApi.applyColumnState({ state: JSON.parse(savedTrackState), applyOrder: true });
                    } catch (e) {}
                } else {
                    const allCols = trackGridApi.getAllDisplayedColumns().map(c => c.getColId());
                    trackGridApi.autoSizeColumns(allCols);
                }
                try { trackGridApi.redrawRows(); } catch (e) {}
            }, 100);
        }
    }
}

// --- Initialization Function ---

export function initializeDataExplorer() {
    // Initialize the grid
    if (!gridApi) {
        gridApi = agGrid.createGrid(gridDiv, gridOptions);
        gridApi.addEventListener('columnResized', savePointCloudColumnState);
        gridApi.addEventListener('columnMoved', savePointCloudColumnState);
    }

    if (!trackGridApi) {
        trackGridApi = agGrid.createGrid(trackGridDiv, trackGridOptions);
        trackGridApi.addEventListener('columnResized', saveTrackGridColumnState);
        trackGridApi.addEventListener('columnMoved', saveTrackGridColumnState);
    }

    // --- START: Make panel interactive ---
    initializePanelPosition(panel);
    makeDraggableAndResizable(panel, document.getElementById('data-explorer-header'), 250, 200);
    // --- END: Make panel interactive ---

    // Restore user's saved active tab preference
    const savedTab = localStorage.getItem('dataExplorer_activeTab');
    if (savedTab && tabs[savedTab]) {
        switchTab(savedTab);
    }

    // Wire up Track Grid View Mode Switchers
    if (btnCardsView) btnCardsView.addEventListener('click', () => setTrackGridViewMode('cards'));
    if (btnTableView) btnTableView.addEventListener('click', () => setTrackGridViewMode('table'));
    setTrackGridViewMode(trackGridViewMode);

    // Wire up Auto-fit Buttons
    if (autoFitTracksBtn) {
        autoFitTracksBtn.addEventListener('click', () => {
            if (trackGridApi) {
                const allCols = trackGridApi.getAllDisplayedColumns().map(c => c.getColId());
                trackGridApi.autoSizeColumns(allCols);
            }
        });
    }

    if (autoFitPointCloudBtn) {
        autoFitPointCloudBtn.addEventListener('click', () => {
            if (gridApi) {
                const allCols = gridApi.getAllDisplayedColumns().map(c => c.getColId());
                gridApi.autoSizeColumns(allCols);
            }
        });
    }

    // Wire up Search / Filter Inputs
    if (trackSearchInput) {
        trackSearchInput.addEventListener('input', (e) => {
            currentTrackFilter = e.target.value.toLowerCase();
            if (trackGridApi) trackGridApi.setGridOption('quickFilterText', currentTrackFilter);
            updateExplorer();
        });
    }

    if (pointcloudSearchInput) {
        pointcloudSearchInput.addEventListener('input', (e) => {
            currentPointCloudFilter = e.target.value.toLowerCase();
            if (gridApi) gridApi.setGridOption('quickFilterText', currentPointCloudFilter);
        });
    }

    // Toggle panel visibility
    explorerBtn.addEventListener('click', () => {
        if (panel.classList.contains('hidden')) {
            showExplorer();
        } else {
            hideExplorer();
        }
    });
    closeBtn.addEventListener('click', hideExplorer);

    if (popoutBtn) {
        popoutBtn.addEventListener('click', popoutDataExplorer);
    }

    // Tab switching
    Object.keys(tabs).forEach(key => {
        tabs[key].btn.addEventListener('click', () => switchTab(key));
    });

    // Plot button
    plotBtn.addEventListener('click', () => {
        // Fix: Use onColumnHeaderClicked or get column from focused cell
        const focusedCell = gridApi.getFocusedCell();
        if (!focusedCell) {
            alert("Please click a cell in the column you wish to plot.");
            return;
        }
        
        const colId = focusedCell.column.getColId();
        const plotData = currentGridData.map(row => row[colId]).filter(val => typeof val === 'number');

        if (plotData.length > 0) {
            createChart(plotData, colId);
            switchTab('plot');
        } else {
            alert("The selected column contains no numeric data to plot.");
        }
    });

    // Keyboard shortcut listener
    document.addEventListener("keydown", (event) => {
        // Ignore if typing in an input
        const isTextInputFocused =
            event.target.tagName === "INPUT" &&
            (event.target.type === "text" || event.target.type === "number");
        if (isTextInputFocused) {
            return;
        }

        // Toggle explorer with 'i' key
        if (event.key === "i") {
            event.preventDefault();
            if (panel.classList.contains("hidden")) {
                showExplorer();
            } else {
                hideExplorer();
            }
        }
    });
}