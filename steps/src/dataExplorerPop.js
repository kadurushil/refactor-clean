/**
 * dataExplorerPop.js — Pop-out / Dock lifecycle for the Data Explorer panel.
 *
 * Manages transferring the #data-explorer-panel DOM node into a standalone
 * OS window (via Document Picture-in-Picture or window.open fallback) and
 * docking it back into the main window with full state preservation.
 */

import {
    getPanel,
    getGridApis,
    resetColumnKeyCaches,
    showExplorer,
    updateExplorer,
    restoreMainPanelLayout,
    setExplorerOpen,
} from './dataExplorer.js';

// --- Module-Local State ---
let popoutWindow = null;
let originalPanelParent = null;

// --- Column State Restoration (for dock-back) ---

function restoreGridColumnStates() {
    const { gridApi, trackGridApi } = getGridApis();

    const savedPointCloudState = localStorage.getItem('dataExplorer_pointCloudColumnState');
    if (savedPointCloudState && gridApi) {
        try {
            gridApi.applyColumnState({ state: JSON.parse(savedPointCloudState), applyOrder: true });
        } catch (e) {}
    }

    const savedTrackState = localStorage.getItem('dataExplorer_trackGridColumnState');
    if (savedTrackState && trackGridApi) {
        try {
            trackGridApi.applyColumnState({ state: JSON.parse(savedTrackState), applyOrder: true });
        } catch (e) {}
    }
}

// --- Pop-Out Engine ---

/**
 * Opens the Data Explorer panel in a standalone OS window on Monitor 2.
 *
 * Uses the Document Picture-in-Picture API when available, with a
 * window.open() fallback. The actual #data-explorer-panel DOM node is
 * physically transferred (not cloned), so all AG-Grid instances, event
 * listeners, and state are preserved with zero re-initialization.
 */
export async function popoutDataExplorer() {
    const panel = getPanel();
    if (!panel) return;

    if (popoutWindow && !popoutWindow.closed) {
        popoutWindow.focus();
        return;
    }

    if (!originalPanelParent) {
        originalPanelParent = panel.parentElement;
    }

    if ('documentPictureInPicture' in window) {
        try {
            popoutWindow = await window.documentPictureInPicture.requestWindow({
                width: panel.offsetWidth || 920,
                height: panel.offsetHeight || 620,
            });
        } catch (e) {
            console.warn('Document Picture-in-Picture request failed, falling back to window.open:', e);
            popoutWindow = window.open('', 'DataExplorerPopoutWindow', 'width=920,height=620,resizable=yes');
        }
    } else {
        popoutWindow = window.open('', 'DataExplorerPopoutWindow', 'width=920,height=620,resizable=yes');
    }

    if (!popoutWindow) {
        alert('Popout window blocked by browser popup blocker. Please allow popups for this site.');
        return;
    }

    // Copy stylesheet references to the new popout window and wait for load
    const stylePromises = [];
    [...document.querySelectorAll('link[rel="stylesheet"], style')].forEach((node) => {
        const clone = node.cloneNode(true);
        if (clone.tagName === 'LINK') {
            const p = new Promise((resolve) => {
                clone.onload = resolve;
                clone.onerror = resolve;
            });
            stylePromises.push(p);
        }
        popoutWindow.document.head.appendChild(clone);
    });

    popoutWindow.document.title = 'Data Explorer — Secondary Monitor';

    // Complete the height chain so tab panels can scroll:
    // html (100%) → body (100%, flex-col) → panel (100%, flex-col) → content wrapper (flex-grow, min-h-0)
    popoutWindow.document.documentElement.style.height = '100%';
    popoutWindow.document.documentElement.style.margin = '0';
    popoutWindow.document.body.style.height = '100%';
    popoutWindow.document.body.className = 'bg-gray-900 text-gray-100 font-sans h-full w-full m-0 p-0 overflow-hidden flex flex-col';

    // Move the DOM element to the new window!
    popoutWindow.document.body.appendChild(panel);

    panel.style.position = 'relative';
    panel.style.width = '100%';
    panel.style.height = '100%';
    panel.style.top = '0';
    panel.style.left = '0';
    panel.style.zIndex = 'auto';
    panel.style.display = 'flex';
    panel.style.flexDirection = 'column';
    panel.classList.remove('hidden');
    setExplorerOpen(true);

    const handleClose = () => {
        dockDataExplorer();
    };

    popoutWindow.addEventListener('pagehide', handleClose);
    popoutWindow.addEventListener('unload', handleClose);

    // Wait for CSS to load before rendering AG-Grid
    await Promise.race([
        Promise.all(stylePromises),
        new Promise(resolve => setTimeout(resolve, 300))
    ]);

    resetColumnKeyCaches();
    updateExplorer();

    const { gridApi, trackGridApi, currentGridData } = getGridApis();

    const triggerGridRefresh = () => {
        if (gridApi) {
            if (currentGridData && currentGridData.length > 0) {
                gridApi.setGridOption('rowData', currentGridData);
            }
            // Guard: AG-Grid warns (#29) if the grid has zero width (e.g. CSS not loaded yet)
            const gridEl = document.getElementById('data-grid');
            if (gridEl && gridEl.offsetWidth > 0) {
                gridApi.sizeColumnsToFit();
            }
            try { gridApi.redrawRows(); } catch (e) {}
        }
        if (trackGridApi) {
            const trackEl = document.getElementById('track-data-grid');
            if (trackEl && trackEl.offsetWidth > 0) {
                trackGridApi.sizeColumnsToFit();
            }
            try { trackGridApi.redrawRows(); } catch (e) {}
        }
        try { popoutWindow.dispatchEvent(new Event('resize')); } catch (e) {}
    };

    setTimeout(triggerGridRefresh, 100);
    setTimeout(triggerGridRefresh, 350);
}

// --- Dock Engine ---

/**
 * Returns the Data Explorer panel from the pop-out window back to the main
 * application window, restoring its position, layout, and column widths.
 */
export function dockDataExplorer() {
    const panel = getPanel();
    if (!panel || !originalPanelParent) return;

    if (popoutWindow && !popoutWindow.closed) {
        try {
            popoutWindow.close();
        } catch (e) {
            // Ignore
        }
    }
    popoutWindow = null;

    originalPanelParent.appendChild(panel);
    restoreMainPanelLayout(panel);
    showExplorer();

    resetColumnKeyCaches();
    updateExplorer();

    const { gridApi, trackGridApi, currentGridData } = getGridApis();

    setTimeout(() => {
        restoreGridColumnStates();
        if (gridApi && currentGridData && currentGridData.length > 0) {
            gridApi.setGridOption('rowData', currentGridData);
            try { gridApi.redrawRows(); } catch (e) {}
        }
        if (trackGridApi) {
            try { trackGridApi.redrawRows(); } catch (e) {}
        }
    }, 150);
    console.log('Data Explorer docked back to main window with restored layout & z-index.');
}
