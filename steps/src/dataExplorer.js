// In src/dataExplorer.js

import { appState } from './state.js';

// --- DOM Elements ---
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

let gridApi = null; // This will hold the grid's API
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
    // The onGridReady callback is no longer needed with the new createGrid method.
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

export function showExplorer() {
    panel.classList.remove('hidden');
    updateExplorer();
}

export function hideExplorer() {
    panel.classList.add('hidden');
}

export function updateExplorer() {
    if (panel.classList.contains('hidden')) return;
    const frame = appState.vizData?.radarFrames[appState.currentFrame];
    if (!frame) return;
    tabs.tree.panel.innerHTML = '';
    tabs.tree.panel.appendChild(createTreeView({
        currentFrame: appState.currentFrame,
        frameData: frame
    }));
}

export function displayInGrid(data, title) {
    if (!data || data.length === 0 || !gridApi) return;

    currentGridData = data;
    const columns = Object.keys(data[0]).map(key => ({ field: key }));
    
    gridApi.setGridOption('columnDefs', columns);
    gridApi.setGridOption('rowData', data);
    
    tabs.grid.btn.textContent = `Grid View: ${title}`;
    switchTab('grid');
}

// --- Event Listeners ---
closeBtn.addEventListener('click', hideExplorer);

Object.keys(tabs).forEach(key => {
    tabs[key].btn.addEventListener('click', () => switchTab(key));
});

plotBtn.addEventListener('click', () => {
    // --- START: MODIFIED LOGIC ---
    const focusedCell = gridApi.getFocusedCell();
    if (!focusedCell) {
        alert("Please click a column header to select it for plotting.");
        return;
    }
    
    const colId = focusedCell.column.getColId();
    // --- END: MODIFIED LOGIC ---

    const plotData = currentGridData.map(row => row[colId]).filter(val => typeof val === 'number');

    if (plotData.length > 0) {
        createChart(plotData, colId);
        switchTab('plot');
    } else {
        alert("The selected column contains no numeric data to plot.");
    }
});

// --- START: THIS IS THE MAIN FIX ---
// Initialize the grid using the new createGrid method and store its API.
gridApi = agGrid.createGrid(gridDiv, gridOptions);
// --- END: THIS IS THE MAIN FIX ---