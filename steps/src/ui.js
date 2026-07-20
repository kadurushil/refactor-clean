import { appState } from "./state.js";
import { formatTime } from "./utils.js";
import { showModal } from "./modal.js";
import { pausePlayback } from "./sync.js";
import {
  videoPlayer,
  timelineSlider,
  speedSlider,
  speedDisplay,
  toggleSnrColor,
  toggleClusterColor,
  toggleInlierColor,
  toggleStationaryColor,
  toggleVelocity,
  toggleEgoSpeed,
  toggleFrameNorm,
  toggleTracks,
  toggleDebugOverlay,
  toggleDebug2Overlay,
  toggleCloseUp,
  toggleCovariance,
  toggleVehicleDimensions,
  snrMinInput,
  snrMaxInput,
  applySnrBtn,
  timelineTooltip,
  playPauseBtn,
  updatePersistentOverlays,
  updateDebugOverlay,
  collapsibleMenu,
  toggleMenuBtn,
  closeMenuBtn,
  menuScrim,
  fullscreenBtn,
  toggleConfirmedOnly,
  shortcutsBtn,
  shortcutsModal,
  shortcutsModalCloseBtn,
  userManualBtn,
  guideModal,
  guideModalCloseBtn,
  codebaseBtn,
  codebaseModal,
  codebaseModalCloseBtn,
  changelogBtn,
  changelogModal,
  changelogModalCloseBtn,
  startUserManualBtn,
  startCodebaseBtn,
  startChangelogBtn,
  fcwWarningOverlay,
} from "./dom.js";

// --- START: Resizable and Draggable Panel Logic ---
export function makeDraggableAndResizable(panel, header, minWidth = 400, minHeight = 300) {
    if (!panel || !header) return;
    const resizers = panel.querySelectorAll('.resizer');

    let original_width = 0;
    let original_height = 0;
    let original_x = 0;
    let original_y = 0;
    let original_mouse_x = 0;
    let original_mouse_y = 0;

    // --- Persistence Logic ---
    const storageKey = `panel_pos_${panel.id}`;

    function savePosition() {
        if (!panel.id) return;
        const state = {
            left: panel.style.left,
            top: panel.style.top,
            width: panel.style.width,
            height: panel.style.height
        };
        console.log(`Saving position for ${panel.id}`, state);
        localStorage.setItem(storageKey, JSON.stringify(state));
    }

    function loadPosition() {
        if (!panel.id) return;
        const saved = localStorage.getItem(storageKey);
        if (saved) {
            try {
                const state = JSON.parse(saved);
                console.log(`Loading position for ${panel.id}`, state);
                if (state.left) panel.style.left = state.left;
                if (state.top) panel.style.top = state.top;
                if (state.width) panel.style.width = state.width;
                if (state.height) panel.style.height = state.height;
                // Ensure it's still in view
                requestAnimationFrame(() => constrainToViewport());
            } catch (e) { console.error(`Failed to load position for ${panel.id}`, e); }
        } else {
            console.log(`No saved position found for ${panel.id}`);
        }
    }

    // --- Auto-Focus (Bring to Front) ---
    panel.addEventListener('mousedown', () => {
        document.querySelectorAll('#zoom-panel, #data-explorer-panel').forEach(p => {
            p.style.zIndex = "30"; 
        });
        panel.style.zIndex = "40"; 
    });

    loadPosition();

    // --- Dragging Logic ---
    header.addEventListener('mousedown', (e) => {
        // Prevent drag if clicking buttons
        if (e.target.tagName === 'BUTTON' || e.target.closest('button')) return;
        e.preventDefault();
        
        // Ensure panel floats on top
        panel.style.zIndex = 100;
        
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
        savePosition();
    }

    // --- Resizing Logic ---
    resizers.forEach(resizer => {
        resizer.addEventListener('mousedown', (e) => {
            e.preventDefault();
            panel.style.zIndex = 100;
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
                savePosition();
                if (panel.id === 'zoom-panel' && appState.zoomSketchInstance) {
                    appState.zoomSketchInstance.handleContainerResize();
                }
            });
        });
    });

    function resizePanel(e, direction) {
        if (direction.toString().includes('r')) {
            const width = original_width + (e.pageX - original_mouse_x);
            if (width > minWidth) panel.style.width = `${width}px`;
        }
        if (direction.toString().includes('b')) {
            const height = original_height + (e.pageY - original_mouse_y);
            if (height > minHeight) panel.style.height = `${height}px`;
        }
        if (direction.toString().includes('l')) {
            const newWidth = original_width - (e.pageX - original_mouse_x);
            if (newWidth > minWidth) {
                panel.style.width = `${newWidth}px`;
                panel.style.left = `${original_x + (e.pageX - original_mouse_x)}px`;
            }
        }
        if (direction.toString().includes('t')) {
            const newHeight = original_height - (e.pageY - original_mouse_y);
            if (newHeight > minHeight) {
                panel.style.height = `${newHeight}px`;
                panel.style.top = `${original_y + (e.pageY - original_mouse_y)}px`;
            }
        }
    }

    // --- Viewport Constraint Logic ---
    // This ensures that if the user resizes their browser, the panel doesn't get "lost" off-screen.
    function constrainToViewport() {
        const rect = panel.getBoundingClientRect();
        const margin = 10; // Extra padding
        
        // Horizontal constraint
        if (rect.right > window.innerWidth) {
            panel.style.left = `${Math.max(margin, window.innerWidth - rect.width - margin)}px`;
        }
        if (rect.left < 0) {
            panel.style.left = `${margin}px`;
        }
        
        // Vertical constraint
        if (rect.bottom > window.innerHeight) {
            panel.style.top = `${Math.max(margin, window.innerHeight - rect.height - margin)}px`;
        }
        if (rect.top < 0) {
            panel.style.top = `${margin}px`;
        }
    }

    window.addEventListener('resize', constrainToViewport);
}
// --- END: Resizable and Draggable Panel Logic ---

function toggleMenu(show) {
  if (show) {
    collapsibleMenu.classList.remove("-translate-x-full");
    menuScrim.classList.remove("hidden");
  } else {
    collapsibleMenu.classList.add("-translate-x-full");
    menuScrim.classList.add("hidden");
  }
}

function toggleShortcutsModal(show) {
  if (show) {
    shortcutsModal.classList.remove("hidden");
  } else {
    shortcutsModal.classList.add("hidden");
  }
}

function toggleGuideModal(show) {
  if (show) {
    guideModal.classList.remove("hidden");
  } else {
    guideModal.classList.add("hidden");
  }
}

function toggleCodebaseModal(show) {
  if (show) {
    codebaseModal.classList.remove("hidden");
    // Reset iframe to ensure it starts at the top
    const iframe = codebaseModal.querySelector("iframe");
    if (iframe) {
        iframe.src = iframe.src;
    }
  } else {
    codebaseModal.classList.add("hidden");
  }
}

function toggleChangelogModal(show) {
  if (show) {
    changelogModal.classList.remove("hidden");
    // Reset iframe to ensure it starts at the top
    const iframe = changelogModal.querySelector("iframe");
    if (iframe) {
        iframe.src = iframe.src;
    }
  } else {
    changelogModal.classList.add("hidden");
  }
}

function handleColorToggles(e) {
  const colorToggles = [
    toggleSnrColor,
    toggleClusterColor,
    toggleInlierColor,
    toggleStationaryColor,
  ];
  if (e.target.checked) {
    colorToggles.forEach((o) => {
      if (o !== e.target) o.checked = false;
    });
  }
  if (appState.p5_instance) appState.p5_instance.redraw();
  updatePersistentOverlays(videoPlayer.currentTime);
}

export function initUIEventListeners() {
  // --- Initialize GridStack ---
  if (typeof GridStack !== 'undefined') {
    appState.gridStackInstance = GridStack.init({
      margin: 10,
      cellHeight: '6vh',
      disableOneColumnMode: true,
      animate: true,
      handle: '.grid-stack-item-content > .cursor-grab',
    });

    // Load saved layout with a small delay to ensure DOM is ready
    let isInitialLoad = true;
    setTimeout(() => {
        const savedLayout = localStorage.getItem('gridstack_layout');
        if (savedLayout) {
            try {
                const layout = JSON.parse(savedLayout);
                console.log("Restoring GridStack positions", layout);
                // Use "soft load" to updates positions by id without replacing DOM
                layout.forEach(item => {
                    const id = item.id || item.gsId;
                    if (id) {
                        const el = document.querySelector(`.grid-stack-item[gs-id="${id}"]`);
                        if (el) appState.gridStackInstance.update(el, { x: item.x, y: item.y, w: item.w, h: item.h });
                    }
                });
            } catch (e) { }
        }
        isInitialLoad = false;
    }, 100);

    // Save layout on changes
    const saveGrid = () => {
        if (isInitialLoad) return; // Don't save while loading
        // save(true, false) saves all items with their current positions/sizes
        const layout = appState.gridStackInstance.save(true, false);
        console.log("Saving GridStack layout", layout);
        localStorage.setItem('gridstack_layout', JSON.stringify(layout));
    };
    appState.gridStackInstance.on('change', saveGrid);
    appState.gridStackInstance.on('dragstop', saveGrid);
    appState.gridStackInstance.on('resizestop', saveGrid);
  }

  // --- Initialize Floating Zoom Panel ---
  const zoomPanel = document.getElementById("zoom-panel");
  const zoomHeader = document.getElementById("zoom-panel-header");
  const closeZoomBtn = document.getElementById("close-zoom-btn");
  
  if (zoomPanel && zoomHeader) {
      makeDraggableAndResizable(zoomPanel, zoomHeader, 300, 200);
      
      if (closeZoomBtn) {
          closeZoomBtn.addEventListener("click", () => {
              zoomPanel.classList.add("hidden");
              appState.zoomPanelExplicitlyClosed = true;
          });
      }
  }

  // --- Shortcuts Modal ---
  shortcutsBtn.addEventListener("click", (e) => {
      e.preventDefault();
      toggleShortcutsModal(true);
  });
  shortcutsModalCloseBtn.addEventListener("click", () => toggleShortcutsModal(false));
  shortcutsModal.addEventListener("click", (e) => {
      // Close if clicking the background overlay (self), but not children
      if (e.target === shortcutsModal) {
          toggleShortcutsModal(false);
      }
  });

  // --- Guide Modal ---
  userManualBtn.addEventListener("click", (e) => {
    e.preventDefault();
    toggleGuideModal(true);
  });
  startUserManualBtn.addEventListener("click", (e) => {
    e.preventDefault();
    toggleGuideModal(true);
  });
  guideModalCloseBtn.addEventListener("click", () => toggleGuideModal(false));
  guideModal.addEventListener("click", (e) => {
    if (e.target === guideModal) {
        toggleGuideModal(false);
    }
  });

  // --- Codebase Modal ---
  codebaseBtn.addEventListener("click", (e) => {
    e.preventDefault();
    toggleCodebaseModal(true);
  });
  startCodebaseBtn.addEventListener("click", (e) => {
    e.preventDefault();
    toggleCodebaseModal(true);
  });
  codebaseModalCloseBtn.addEventListener("click", () => toggleCodebaseModal(false));
  codebaseModal.addEventListener("click", (e) => {
    if (e.target === codebaseModal) {
        toggleCodebaseModal(false);
    }
  });

  // --- Changelog Modal ---
  changelogBtn.addEventListener("click", (e) => {
    e.preventDefault();
    toggleChangelogModal(true);
  });
  startChangelogBtn.addEventListener("click", (e) => {
    e.preventDefault();
    toggleChangelogModal(true);
  });
  changelogModalCloseBtn.addEventListener("click", () => toggleChangelogModal(false));
  changelogModal.addEventListener("click", (e) => {
    if (e.target === changelogModal) {
        toggleChangelogModal(false);
    }
  });
  
  // Global Key Listener for 'k' and 'ESC'
  document.addEventListener("keydown", (e) => {
    if (e.key.toLowerCase() === "k") {
      // Toggle visibility
      const isHidden = shortcutsModal.classList.contains("hidden");
      toggleShortcutsModal(isHidden);
    }
    // Prioritize closing open modals
    if (e.key === "Escape") {
        if (!guideModal.classList.contains("hidden")) {
            toggleGuideModal(false);
        } else if (!codebaseModal.classList.contains("hidden")) {
            toggleCodebaseModal(false);
        } else if (!changelogModal.classList.contains("hidden")) {
            toggleChangelogModal(false);
        } else if (!shortcutsModal.classList.contains("hidden")) {
            toggleShortcutsModal(false);
        }
    }
  });

  // --- Menu and Fullscreen ---
  toggleMenuBtn.addEventListener("click", () => toggleMenu(true));
  closeMenuBtn.addEventListener("click", () => toggleMenu(false));
  menuScrim.addEventListener("click", () => toggleMenu(false));
  fullscreenBtn.addEventListener("click", () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
    } else if (document.exitFullscreen) {
      document.exitFullscreen();
    }
  });

  // --- Timeline Tooltip ---
  timelineSlider.addEventListener("mouseover", () => {
    if (appState.vizData) timelineTooltip.classList.remove("hidden");
  });
  timelineSlider.addEventListener("mouseout", () => {
    timelineTooltip.classList.add("hidden");
  });
  timelineSlider.addEventListener("mousemove", (event) => {
    if (!appState.vizData) return;
    const rect = timelineSlider.getBoundingClientRect();
    const hoverFraction = (event.clientX - rect.left) / rect.width;
    const sliderMax = parseInt(timelineSlider.max, 10) || appState.vizData.radarFrames.length - 1;
    let frameIndex = Math.max(0, Math.min(Math.round(hoverFraction * sliderMax), sliderMax));
    const frameData = appState.vizData.radarFrames[frameIndex];
    if (!frameData) return;
    const formattedTime = formatTime(frameData.relativeTimeSec * 1000);
    timelineTooltip.innerHTML = `Frame: ${frameIndex + 1}<br>Time: ${formattedTime}`;
    const tooltipX = event.clientX - rect.left;
    timelineTooltip.style.left = `${tooltipX}px`;
  });

  // --- Speed Slider ---
  speedSlider.addEventListener("input", (event) => {
    const speed = parseFloat(event.target.value);
    videoPlayer.playbackRate = speed;
    speedDisplay.textContent = `${speed.toFixed(1)}x`;
  });

  // --- SNR Controls ---
  applySnrBtn.addEventListener("click", () => {
    const newMin = parseFloat(snrMinInput.value), newMax = parseFloat(snrMaxInput.value);
    if (isNaN(newMin) || isNaN(newMax) || newMin >= newMax) {
      showModal("Invalid SNR range.");
      return;
    }
    appState.globalMinSnr = newMin;
    appState.globalMaxSnr = newMax;
    toggleFrameNorm.checked = false;
    if (appState.p5_instance) {
      appState.p5_instance.drawSnrLegendToBuffer(appState.globalMinSnr, appState.globalMaxSnr);
      appState.p5_instance.redraw();
    }
  });

  // --- Feature Toggles ---
  [toggleSnrColor, toggleClusterColor, toggleInlierColor, toggleStationaryColor].forEach((t) => {
    t.addEventListener("change", handleColorToggles);
  });

  [toggleVelocity, toggleEgoSpeed, toggleFrameNorm, toggleTracks, toggleDebugOverlay, toggleDebug2Overlay, toggleCovariance, toggleVehicleDimensions].forEach((t) => {
    t.addEventListener("change", () => {
      if (appState.p5_instance) appState.p5_instance.redraw();
      if (t === toggleDebugOverlay || t === toggleDebug2Overlay) {
        updateDebugOverlay(videoPlayer.currentTime);
        updatePersistentOverlays(videoPlayer.currentTime);
      }
    });
  });

  toggleCloseUp.addEventListener("change", () => {
    appState.isCloseUpMode = toggleCloseUp.checked;
    appState.zoomPanelExplicitlyClosed = false; // Reset the close flag so it can reappear
    
    // Auto-hide the panel when the user disables Close-Up mode (e.g. by pressing 'g')
    if (!appState.isCloseUpMode) {
        const zoomPanel = document.getElementById("zoom-panel");
        if (zoomPanel && !zoomPanel.classList.contains("hidden")) {
            zoomPanel.classList.add("hidden");
        }
    }
    if (appState.isCloseUpMode && appState.isPlaying) {
      // If entering close-up mode while playing, automatically pause.
      pausePlayback();
      appState.isPlaying = false;
      playPauseBtn.textContent = "Play";
    }
    if (appState.p5_instance) { // Handle p5 loop state
      if (appState.isCloseUpMode) {
        appState.p5_instance.loop(); // Start looping for mouse interaction.
      } else {
        appState.p5_instance.noLoop(); // Stop looping when exiting.
        appState.p5_instance.redraw(); // Redraw one last time.
      }
    }
  });

  toggleConfirmedOnly.addEventListener("change", () => {
    if (appState.p5_instance) appState.p5_instance.redraw();
  });

  // --- Initialize FCW Draggable Overlay ---
  if (fcwWarningOverlay) {
    makeElementDraggable(fcwWarningOverlay);
  }
}

/**
 * Utility to make an absolute-positioned HTML element draggable within its offset parent.
 */
export function makeElementDraggable(element) {
  if (!element) return;

  let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;

  element.addEventListener("mousedown", dragMouseDown);

  function dragMouseDown(e) {
    e = e || window.event;
    // Don't drag if clicking buttons or inputs inside the overlay
    if (e.target.tagName === 'BUTTON' || e.target.closest('button')) return;
    
    e.preventDefault();

    // Get the element's current computed coordinates relative to its offsetParent
    const rect = element.getBoundingClientRect();
    const parentRect = element.offsetParent ? element.offsetParent.getBoundingClientRect() : { left: 0, top: 0 };

    // Explicitly lock position using computed px offsets (instead of center-translating CSS classes)
    element.style.left = `${rect.left - parentRect.left}px`;
    element.style.top = `${rect.top - parentRect.top}px`;
    element.style.transform = "none";
    element.style.right = "auto";
    element.style.bottom = "auto";
    element.style.margin = "0";

    pos3 = e.clientX;
    pos4 = e.clientY;

    document.addEventListener("mouseup", closeDragElement);
    document.addEventListener("mousemove", elementDrag);
  }

  function elementDrag(e) {
    e = e || window.event;
    e.preventDefault();

    // Calculate position delta
    pos1 = pos3 - e.clientX;
    pos2 = pos4 - e.clientY;
    pos3 = e.clientX;
    pos4 = e.clientY;

    // Apply new style position coordinates
    element.style.top = `${element.offsetTop - pos2}px`;
    element.style.left = `${element.offsetLeft - pos1}px`;
  }

  function closeDragElement() {
    document.removeEventListener("mouseup", closeDragElement);
    document.removeEventListener("mousemove", elementDrag);
  }
}