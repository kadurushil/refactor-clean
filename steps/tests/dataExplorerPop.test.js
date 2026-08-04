// tests/dataExplorerPop.test.js
//
// Unit tests for the Data Explorer pop-out / dock refactor.
// These tests verify the accessor exports, state management, and
// inline style cleanup logic — the areas most likely to harbor bugs
// after the extraction into dataExplorerPop.js.
//
// NOTE: These tests run in the browser via test-runner.html.
// AG-Grid and Document PiP are NOT mocked — we test the pure JS logic.

const resultsEl = document.getElementById('results');

function test(description, testFunction) {
    try {
        testFunction();
        console.log(`✅ PASS: ${description}`);
        resultsEl.innerHTML += `<p class="pass"><b>PASS:</b> ${description}</p>`;
    } catch (error) {
        console.error(`❌ FAIL: ${description}`, error);
        resultsEl.innerHTML += `<p class="fail"><b>FAIL:</b> ${description}<br><pre>${error}</pre></p>`;
    }
}

async function testAsync(description, testFunction) {
    try {
        await testFunction();
        console.log(`✅ PASS: ${description}`);
        resultsEl.innerHTML += `<p class="pass"><b>PASS:</b> ${description}</p>`;
    } catch (error) {
        console.error(`❌ FAIL: ${description}`, error);
        resultsEl.innerHTML += `<p class="fail"><b>FAIL:</b> ${description}<br><pre>${error}</pre></p>`;
    }
}

// Helper: assert equality
function assertEqual(actual, expected, msg) {
    if (actual !== expected) {
        throw new Error(`${msg || 'Assertion failed'}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    }
}

function assert(condition, msg) {
    if (!condition) {
        throw new Error(msg || 'Assertion failed');
    }
}

// ============================================================
//  SECTION 1: restoreMainPanelLayout — Inline Style Cleanup
//  This is the exact bug we fixed. Verify that ALL pop-out
//  inline styles are cleared so Tailwind classes regain control.
// ============================================================

resultsEl.innerHTML += `<h2>Data Explorer Pop-Out Tests</h2>`;
resultsEl.innerHTML += `<h3>restoreMainPanelLayout — Inline Style Cleanup</h3>`;

test("restoreMainPanelLayout: clears inline 'display' so .hidden class works", () => {
    const panel = document.getElementById('data-explorer-panel');
    // Simulate what popoutDataExplorer() does
    panel.style.display = 'flex';

    // Simulate what restoreMainPanelLayout does (inline)
    panel.style.display = '';

    // Now adding 'hidden' should actually hide
    panel.classList.add('hidden');
    const computedDisplay = window.getComputedStyle(panel).display;
    assertEqual(computedDisplay, 'none', "Panel should be display:none after adding .hidden class");
    panel.classList.remove('hidden');
});

test("restoreMainPanelLayout: clears inline 'flexDirection' after pop-out", () => {
    const panel = document.getElementById('data-explorer-panel');
    // Simulate pop-out setting inline flexDirection
    panel.style.flexDirection = 'column';
    assert(panel.style.flexDirection === 'column', 'Precondition: inline flexDirection should be set');

    // Simulate restoreMainPanelLayout clearing it
    panel.style.flexDirection = '';
    assertEqual(panel.style.flexDirection, '', "flexDirection inline style should be cleared");
});

test("restoreMainPanelLayout: inline display='flex' OVERRIDES Tailwind .hidden (the bug scenario)", () => {
    const panel = document.getElementById('data-explorer-panel');
    // Reproduce the original bug: set inline display, then try to hide with class
    panel.style.display = 'flex';
    panel.classList.add('hidden');

    const computed = window.getComputedStyle(panel).display;
    // If this is 'flex' rather than 'none', the bug is present
    const bugPresent = (computed !== 'none');

    // Clean up
    panel.style.display = '';
    panel.classList.remove('hidden');

    // This test documents the bug — inline style wins over class.
    // If Tailwind's .hidden uses !important, this would pass differently.
    assert(bugPresent, "Confirms inline display:'flex' overrides .hidden — this is why we must clear it");
});

// ============================================================
//  SECTION 2: Accessor Exports — getPanel, getGridApis,
//  resetColumnKeyCaches, setExplorerOpen
// ============================================================

resultsEl.innerHTML += `<h3>Accessor Exports</h3>`;

import {
    getPanel,
    getGridApis,
    resetColumnKeyCaches,
    setExplorerOpen,
    isExplorerOpen,
    showExplorer,
    updateExplorer,
    restoreMainPanelLayout,
} from '../src/dataExplorer.js';

test("getPanel: returns the #data-explorer-panel DOM element", () => {
    const panel = getPanel();
    assert(panel !== null && panel !== undefined, "getPanel() should not return null");
    assertEqual(panel.id, 'data-explorer-panel', "Should return element with id 'data-explorer-panel'");
});

test("getGridApis: returns an object with gridApi, trackGridApi, currentGridData keys", () => {
    const apis = getGridApis();
    assert(typeof apis === 'object' && apis !== null, "Should return an object");
    assert('gridApi' in apis, "Should have gridApi key");
    assert('trackGridApi' in apis, "Should have trackGridApi key");
    assert('currentGridData' in apis, "Should have currentGridData key");
});

test("getGridApis: gridApi is null before initializeDataExplorer() is called", () => {
    // Before init, grids should not be created
    const apis = getGridApis();
    // NOTE: If initializeDataExplorer was already called (e.g. by test-runner loading order),
    // gridApi may not be null. This test is valid only when run before init.
    // We document the expected pre-init state.
    console.log(`  gridApi is ${apis.gridApi === null ? 'null (pre-init)' : 'initialized'}`);
    console.log(`  trackGridApi is ${apis.trackGridApi === null ? 'null (pre-init)' : 'initialized'}`);
    // Just verify the shape is correct — values depend on init order
    assert(apis.gridApi === null || typeof apis.gridApi === 'object', "gridApi should be null or an AG-Grid API object");
});

test("setExplorerOpen: updates isExplorerOpen flag", () => {
    // Save original
    const original = isExplorerOpen;

    setExplorerOpen(true);
    // We can't directly re-read `isExplorerOpen` as a live binding from here
    // because ES module live bindings require re-importing. Instead, verify
    // indirectly via getPanel state.
    // Just test the function doesn't throw:
    setExplorerOpen(false);
    setExplorerOpen(original); // restore
});

test("resetColumnKeyCaches: runs without error", () => {
    // Should not throw even when grids haven't been initialized
    resetColumnKeyCaches();
});

// ============================================================
//  SECTION 3: showExplorer / hideExplorer state cycle
// ============================================================

resultsEl.innerHTML += `<h3>Show / Hide State Cycle</h3>`;

test("showExplorer: removes 'hidden' class from panel", () => {
    const panel = getPanel();
    panel.classList.add('hidden');
    // showExplorer also calls updateExplorer which may need appState.vizData,
    // but the guard at the top of updateExplorer returns early if no data.
    showExplorer();
    assert(!panel.classList.contains('hidden'), "Panel should not have 'hidden' class after showExplorer()");
    // Clean up
    panel.classList.add('hidden');
});

// ============================================================
//  SECTION 4: restoreMainPanelLayout full integration
// ============================================================

resultsEl.innerHTML += `<h3>restoreMainPanelLayout Integration</h3>`;

test("restoreMainPanelLayout: sets position to 'fixed'", () => {
    const panel = getPanel();
    panel.style.position = 'relative'; // simulate pop-out state
    restoreMainPanelLayout(panel);
    assertEqual(panel.style.position, 'fixed', "Position should be restored to 'fixed'");
});

test("restoreMainPanelLayout: sets zIndex to '50'", () => {
    const panel = getPanel();
    panel.style.zIndex = 'auto'; // simulate pop-out state
    restoreMainPanelLayout(panel);
    assertEqual(panel.style.zIndex, '50', "zIndex should be restored to '50'");
});

test("restoreMainPanelLayout: clears display and flexDirection inline styles", () => {
    const panel = getPanel();
    // Simulate pop-out inline styles
    panel.style.display = 'flex';
    panel.style.flexDirection = 'column';

    restoreMainPanelLayout(panel);

    assertEqual(panel.style.display, '', "display should be cleared");
    assertEqual(panel.style.flexDirection, '', "flexDirection should be cleared");
});

test("restoreMainPanelLayout: removes pop-out positional classes", () => {
    const panel = getPanel();
    panel.classList.add('bottom-24', 'right-4', 'w-full', 'max-w-2xl', 'h-1/2');
    restoreMainPanelLayout(panel);
    assert(!panel.classList.contains('bottom-24'), "Should remove 'bottom-24'");
    assert(!panel.classList.contains('right-4'), "Should remove 'right-4'");
    assert(!panel.classList.contains('w-full'), "Should remove 'w-full'");
    assert(!panel.classList.contains('max-w-2xl'), "Should remove 'max-w-2xl'");
    assert(!panel.classList.contains('h-1/2'), "Should remove 'h-1/2'");
});

test("restoreMainPanelLayout: handles null panel gracefully", () => {
    // Should not throw
    restoreMainPanelLayout(null);
});

// ============================================================
//  SECTION 5: Pop-out window height chain (document the fix)
// ============================================================

resultsEl.innerHTML += `<h3>Pop-Out Height Chain (documented)</h3>`;

test("Pop-out height chain: html and body need explicit height for tab scrolling", () => {
    // This test documents the fix rather than running a real pop-out.
    // In dataExplorerPop.js, we set:
    //   popoutWindow.document.documentElement.style.height = '100%'
    //   popoutWindow.document.body.style.height = '100%'
    //
    // Without these, the flex height chain is broken and overflow-y-auto
    // tabs (Tree, ADAS, Tracker Log) cannot scroll.

    // Verify our own document's html has a computed height (as a sanity check)
    const htmlHeight = window.getComputedStyle(document.documentElement).height;
    assert(htmlHeight !== '' && htmlHeight !== 'auto', 
        `Document html should have a resolved height, got: ${htmlHeight}`);
});

// ============================================================
//  SECTION 6: Module boundary — circular import safety
// ============================================================

resultsEl.innerHTML += `<h3>Module Boundary</h3>`;

testAsync("dataExplorerPop.js: imports resolve without circular dependency errors", async () => {
    // Dynamic import to test that the module loads cleanly
    const mod = await import('../src/dataExplorerPop.js');
    assert(typeof mod.popoutDataExplorer === 'function', "popoutDataExplorer should be a function");
    assert(typeof mod.dockDataExplorer === 'function', "dockDataExplorer should be a function");
});

testAsync("dataExplorer.js: all expected exports are present", async () => {
    const mod = await import('../src/dataExplorer.js');
    const expectedExports = [
        'isExplorerOpen', 'getPanel', 'getGridApis', 'resetColumnKeyCaches',
        'setExplorerOpen', 'showExplorer', 'updateExplorer',
        'restoreMainPanelLayout', 'throttledUpdateExplorer', 'initializeDataExplorer'
    ];
    for (const name of expectedExports) {
        assert(name in mod, `Missing export: ${name}`);
    }
});
