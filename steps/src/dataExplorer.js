// In src/dataExplorer.js

import { appState } from './state.js';
import { 
    canvasContainer, 
    explorerBtn 
} from './dom.js'; // Import the DOM elements we need to listen to

// --- DOM Elements (Internal to this module) ---
const panel = document.getElementById('data-explorer-panel');
const closeBtn = document.getElementById('close-explorer-btn');
const footer = document.getElementById('explorer-footer');
const plotBtn = document.getElementById('plot-selected-btn');

const tabs = {
    tree: { btn: document.getElementById('tab-btn-tree'), panel: document.getElementById('tab-panel-tree') },
    grid: { btn: document.getElementById('tab-btn-grid'), panel: document.getElementById('tab-panel-grid') },
    plot: { btn: document.getElementById('tab-btn-plot'), panel: document.getElementById('tab-panel-plot') },
};

const gridDiv = document.getElementById('data-grid');
const chartCanvas = document.getElementById('data-chart');

// --- Module-Local State ---
let gridApi = null;
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
    },
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
        tab.btn.classList.remove('border-blue-500');
        tab.btn.classList.add('text-gray-500', 'dark:text-gray-400');
    });

    tabs[targetTab].panel.classList.remove('hidden');
    tabs[targetTab].btn.classList.add('border-blue-500');
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
    
    tabs.tree.panel.innerHTML = '';
    tabs.tree.panel.appendChild(createTreeView({
        currentFrame: appState.currentFrame,
        frameData: frame
    }));
}

function displayInGrid(data, title) {
    if (!data || data.length === 0 || !gridApi) return;

    currentGridData = data;
    // Auto-generate columns from the first data object
    const columns = Object.keys(data[0]).map(key => ({ 
        field: key,
        headerName: key, // Set header name
        sortable: true,   // Ensure all generated columns are sortable
        filter: true,     // Ensure all generated columns are filterable
    }));
    
    gridApi.setGridOption('columnDefs', columns);
    gridApi.setGridOption('rowData', data);
    
    tabs.grid.btn.textContent = `Grid View: ${title}`;
    switchTab('grid');
}

// --- Initialization Function (The file's only export) ---

export function initializeDataExplorer() {
    // Initialize the grid
    if (!gridApi) {
        gridApi = agGrid.createGrid(gridDiv, gridOptions);
    }

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

    // Main canvas click listener
    canvasContainer.addEventListener('click', () => {
        if (!appState.vizData) return;

        const currentFrameData = appState.vizData.radarFrames[appState.currentFrame];
        if (currentFrameData && currentFrameData.pointCloud) {
            // Send point cloud data to the grid
            displayInGrid(currentFrameData.pointCloud, `Frame ${appState.currentFrame} - Point Cloud`);
            // Show the explorer if it's hidden
            if (panel.classList.contains('hidden')) {
                showExplorer();
            }
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