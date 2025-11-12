// In src/dataExplorer.js

import { appState } from './state.js';
import { throttle } from './utils.js';
import { 
    canvasContainer, 
    explorerBtn,
    mainContent
} from './dom.js'; // Import the DOM elements we need to listen to

// --- DOM Elements (Internal to this module) ---
const panel = document.getElementById('data-explorer-panel');
const closeBtn = document.getElementById('close-explorer-btn');
const footer = document.getElementById('explorer-footer');
const plotBtn = document.getElementById('plot-selected-btn');

const tabs = {
    tree: { btn: document.getElementById('tab-btn-tree'), panel: document.getElementById('tab-panel-tree') },
    grid: { btn: document.getElementById('tab-btn-grid'), panel: document.getElementById('tab-panel-grid') },
    trackGrid: { btn: document.getElementById('tab-btn-track-grid'), panel: document.getElementById('tab-panel-track-grid') },
    plot: { btn: document.getElementById('tab-btn-plot'), panel: document.getElementById('tab-panel-plot') },
};

const gridDiv = document.getElementById('data-grid');
const trackGridDiv = document.getElementById('track-data-grid');
const chartCanvas = document.getElementById('data-chart');

// --- Module-Local State ---
let gridApi = null;
let trackGridApi = null;
let chartInstance = null;
let currentGridData = null;

// --- AG Grid Configuration ---
const gridOptions = {
    rowData: [],
    columnDefs: [],
    defaultColDef: {
        sortable: true,
        filter: true,
        resizable: true,
        // --- START: Set a default width for all columns ---
        width: 100, // Keep width at 100 as requested
        // --- END: Set a default width ---
    },
    // --- START: Define a specific column type for numbers ---
    // This allows us to apply special formatting only to numeric columns.
    columnTypes: {
        numberColumn: {
            // --- START: Add column-specific number formatting ---
            // This formatter checks the column ID and applies the correct precision.
            valueFormatter: params => {
                const { value, colDef } = params;
                // Do nothing if value is not a number or is an integer (like 'index')
                if (typeof value !== 'number' || value === null || Number.isInteger(value)) {
                    return value;
                }

                // Apply formatting based on the column's field name
                switch (colDef.field) {
                    case 'snr':
                        return value.toFixed(2); // SNR gets 2 decimal places
                    default:
                        return value.toFixed(4); // All other numbers get 4 decimal places
                }
            }
            // --- END: Add column-specific number formatting ---
        }
    }
    // --- END: Define a specific column type for numbers ---
};

const trackGridOptions = {
    ...gridOptions
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

// --- Core Functions (Internal) ---

function showExplorer() {
    panel.classList.remove('hidden');
    updateExplorer();
}

function hideExplorer() {
    panel.classList.add('hidden');
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
}

function createTreeView(data) {
    const pre = document.createElement('pre');
    pre.textContent = JSON.stringify(data, (key, value) => {
        if (key.startsWith('_')) return undefined;
        return value;
    }, 2);
    return pre;
}

function updateExplorer() {
    if (panel.classList.contains('hidden') || !appState.vizData) return;
    
    const frame = appState.vizData.radarFrames[appState.currentFrame];
    if (!frame) return;

    // --- START: Correctly gather track data for the current frame ---
    // We iterate through all tracks and find the history log entry for the current frame.
    const tracksForCurrentFrame = appState.vizData.tracks
        .map(track => {
            const log = track.historyLog.find(log => log.frameIdx === appState.currentFrame);
            // Return a new object combining track ID with its log for this frame, if it exists.
            return log ? { trackId: track.id, ...log } : null;
        })
        .filter(Boolean); // Filter out any null entries for tracks not present in this frame.
    // --- END: Correctly gather track data for the current frame ---
    
    tabs.tree.panel.innerHTML = '';
    tabs.tree.panel.appendChild(createTreeView({
        currentFrame: appState.currentFrame + 1,
        frameData: frame,
        trackData: tracksForCurrentFrame // Use the newly created array
    }));

    // --- START: Auto-update Point Cloud Grid ---
    displayInGrid(frame.pointCloud, `${appState.currentFrame + 1}`);
    // --- END: Auto-update Point Cloud Grid ---
    displayTracksInGrid(tracksForCurrentFrame);

}

function displayInGrid(data, title) {
    if (!Array.isArray(data) || data.length === 0 || !gridApi) return;

    // --- START: Add index and prepare data ---
    // We map the original data to a new array, adding an 'index' property to each object.
    const indexedData = data.map((row, index) => ({
        index: index,
        ...row
    }));
    currentGridData = indexedData; // Store the new indexed data
    // --- END: Add index and prepare data ---

    // --- START: More robust column generation ---
    // Auto-generate columns, and assign a 'type' if the data is numeric.
    const columns = Object.keys(indexedData[0]).map(key => ({
        field: key,
        headerName: key, // Set header name
        // If the first row's value for this key is a number, assign our custom number type.
        type: typeof indexedData[0][key] === 'number' ? 'numberColumn' : undefined
    }));
    // --- END: More robust column generation ---

    gridApi.setGridOption('columnDefs', columns);
    gridApi.setGridOption('rowData', indexedData);

    // --- START: Apply default sort ---
    // After setting the data, apply a sort model to sort by the 'index' column ascending.
    gridApi.applyColumnState({ state: [{ colId: 'index', sort: 'asc' }] });
    // --- END: Apply default sort ---

    tabs.grid.btn.textContent = `Point Cloud: Frame ${title}`;
}

function displayTracksInGrid(trackData) {
    if (!trackGridApi || !Array.isArray(trackData) || trackData.length === 0) {
        if (trackGridApi) trackGridApi.setGridOption('rowData', []);
        return;
    }

    // --- START: Update Track Grid Title ---
    tabs.trackGrid.btn.textContent = `Track Grid: Frame ${appState.currentFrame + 1}`;
    // --- END: Update Track Grid Title ---

    // --- START: Build a complete set of columns from ALL tracks ---
    // Create a Set of all unique keys from all track objects in the current frame.
    // This prevents missing columns if the first track has fewer properties than others.
    const allKeys = new Set();
    trackData.forEach(track => {
        Object.keys(track).forEach(key => allKeys.add(key));
    });

    // --- START: Fix for column type detection ---
    const columns = Array.from(allKeys).map(key => ({
        field: key,
        headerName: key,
        // Find the first track that has a non-null value for this key to determine its type.
        // This is much more reliable than only checking the first track in the list.
        type: typeof trackData.find(t => t[key] !== null && t[key] !== undefined)?.[key] === 'number' ? 'numberColumn' : undefined,
        valueFormatter: params => {
            if (Array.isArray(params.value)) {
                // --- START: Robust Array Formatting ---
                // Check if the item 'v' is a number before calling toFixed.
                // If it's not a number (e.g., it's another array), stringify it.
                return `[${params.value.map(v => (typeof v === 'number' && v !== null) ? v.toFixed(3) : JSON.stringify(v)).join(', ')}]`;
                // --- END: Robust Array Formatting ---
            }
            return params.value;
        }
    }));
    // --- END: Fix for column type detection ---
    // --- END: Build a complete set of columns from ALL tracks ---

    trackGridApi.setGridOption('columnDefs', columns);
    trackGridApi.setGridOption('rowData', trackData);
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

// --- START: Resizable and Draggable Panel Logic ---
function makePanelInteractive(panel) {
    const header = document.getElementById('data-explorer-header');
    const resizers = panel.querySelectorAll('.resizer');
    const minWidth = 400;
    const minHeight = 300;

    let original_width = 0;
    let original_height = 0;
    let original_x = 0;
    let original_y = 0;
    let original_mouse_x = 0;
    let original_mouse_y = 0;

    // --- Dragging Logic ---
    header.addEventListener('mousedown', (e) => {
        e.preventDefault();
        original_x = panel.offsetLeft;
        original_y = panel.offsetTop;
        original_mouse_x = e.pageX;
        original_mouse_y = e.pageY;
        document.body.classList.add('dragging');
        window.addEventListener('mousemove', dragPanel);
        window.addEventListener('mouseup', stopDrag);
    });

    function dragPanel(e) {
        const dx = e.pageX - original_mouse_x;
        const dy = e.pageY - original_mouse_y;
        panel.style.left = `${original_x + dx}px`;
        panel.style.top = `${original_y + dy}px`;
    }

    function stopDrag() {
        document.body.classList.remove('dragging');
        window.removeEventListener('mousemove', dragPanel);
        window.removeEventListener('mouseup', stopDrag);
    }

    // --- Resizing Logic ---
    resizers.forEach(resizer => {
        resizer.addEventListener('mousedown', (e) => {
            e.preventDefault();
            original_width = parseFloat(getComputedStyle(panel, null).getPropertyValue('width').replace('px', ''));
            original_height = parseFloat(getComputedStyle(panel, null).getPropertyValue('height').replace('px', ''));
            original_x = panel.getBoundingClientRect().left;
            original_y = panel.getBoundingClientRect().top;
            original_mouse_x = e.pageX;
            original_mouse_y = e.pageY;
            
            const resizeFunc = (event) => resizePanel(event, resizer.classList);
            
            document.body.classList.add('resizing');
            window.addEventListener('mousemove', resizeFunc);
            window.addEventListener('mouseup', () => {
                document.body.classList.remove('resizing');
                window.removeEventListener('mousemove', resizeFunc);
            });
        });
    });

    function resizePanel(e, direction) {
        // --- START: Fix for Resizing Logic ---
        // The logic is updated to handle corners correctly by checking for 't', 'b', 'l', 'r' substrings.
        // This allows a corner like 'resizer-br' to trigger both bottom and right resizing logic.
        if (direction.toString().includes('r')) { // Check for right edge
            const width = original_width + (e.pageX - original_mouse_x);
            if (width > minWidth) panel.style.width = `${width}px`;
        }
        if (direction.toString().includes('b')) { // Check for bottom edge
            const height = original_height + (e.pageY - original_mouse_y);
            if (height > minHeight) panel.style.height = `${height}px`;
        }
        if (direction.toString().includes('l')) { // Check for left edge
            const newWidth = original_width - (e.pageX - original_mouse_x);
            if (newWidth > minWidth) {
                panel.style.width = `${newWidth}px`;
                panel.style.left = `${original_x + (e.pageX - original_mouse_x)}px`;
            }
        }
        if (direction.toString().includes('t')) { // Check for top edge
            const newHeight = original_height - (e.pageY - original_mouse_y);
            if (newHeight > minHeight) {
                panel.style.height = `${newHeight}px`;
                panel.style.top = `${original_y + (e.pageY - original_mouse_y)}px`;
            }
        }
        // --- END: Fix for Resizing Logic ---
    }
}

function initializePanelPosition(panel) {
    // Remove Tailwind classes that conflict with dynamic positioning/sizing
    panel.classList.remove('bottom-24', 'right-4', 'w-full', 'max-w-2xl', 'h-1/2');

    // Set initial size and position with inline styles
    const initialWidth = 896; // Corresponds to max-w-2xl
    const initialHeight = window.innerHeight / 2;
    
    panel.style.width = `${initialWidth}px`;
    panel.style.height = `${initialHeight}px`;
    panel.style.top = `${window.innerHeight - initialHeight - 96}px`; // 96px is roughly bottom-24
    panel.style.left = `${window.innerWidth - initialWidth - 16}px`; // 16px is right-4
}
// --- END: Resizable and Draggable Panel Logic ---

// --- Initialization Function (The file's only export) ---

export function initializeDataExplorer() {
    // Initialize the grid
    if (!gridApi) {
        gridApi = agGrid.createGrid(gridDiv, gridOptions);
    }

    if (!trackGridApi) {
        trackGridApi = agGrid.createGrid(trackGridDiv, trackGridOptions);
    }

    // --- START: Make panel interactive ---
    initializePanelPosition(panel);
    makePanelInteractive(panel);
    // --- END: Make panel interactive ---
    // --- Wire up all event listeners ---

    // Toggle panel visibility
    explorerBtn.addEventListener('click', () => {
        if (panel.classList.contains('hidden')) {
            showExplorer();
        } else {
            hideExplorer();
        }
    });
    closeBtn.addEventListener('click', hideExplorer);

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