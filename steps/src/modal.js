import {
  modalCancelBtn,
  modalContainer,
  modalOverlay,
  modalContent,
  modalText,
  modalOkBtn,
  modalProgressContainer,
  modalProgressBar,
  modalProgressText,
  startScreenModal,
  startProgressContainer,
  startProgressBar,
  startProgressText,
  startDropZone,
  startLoadJsonBtn,
  startLoadVideoBtn,
} from "./dom.js";

let modalResolve = null;
export function showModal(
  message,
  isConfirm = false,
  buttonLabels = { ok: "OK", cancel: "Cancel" }
) {
  return new Promise((resolve) => {
    modalText.textContent = message;
    modalOkBtn.textContent = buttonLabels.ok || "OK";
    modalCancelBtn.textContent = buttonLabels.cancel || "Cancel";

    modalCancelBtn.classList.toggle("hidden", !isConfirm);
    
    // This ensures the "OK" button is always visible for this modal.
    modalOkBtn.classList.remove("hidden"); 
    
    modalProgressContainer.classList.add("hidden"); 

    modalContainer.classList.remove("hidden");
    setTimeout(() => {
      modalOverlay.classList.remove("opacity-0");
      modalContent.classList.remove("scale-95");
    }, 10);
    modalResolve = resolve;
  });
}

// A new function specifically for the loading modal
export function showLoadingModal(message, forcePopup = false) {
    if (!startScreenModal.classList.contains('hidden') && !forcePopup) {
      // Integrated start screen flow
      startProgressContainer.classList.remove('hidden');
      startProgressBar.style.width = '0%';
      startProgressText.textContent = message;
      
      // Optionally disable the interactive elements so users don't multi-click
      startDropZone.classList.add('opacity-50', 'pointer-events-none');
      startLoadJsonBtn.classList.add('opacity-50', 'pointer-events-none');
      startLoadVideoBtn.classList.add('opacity-50', 'pointer-events-none');
    } else {
      // Fallback generic popup modal flow
      modalText.textContent = message;
      modalOkBtn.classList.add('hidden'); // Hide OK button for loading
      modalCancelBtn.classList.add('hidden'); // Initially hide cancel button
      modalProgressContainer.classList.remove('hidden');
      modalProgressBar.style.width = '0%';
      modalProgressText.textContent = 'Initializing...';
      
      modalContainer.classList.remove("hidden");
      setTimeout(() => {
        modalOverlay.classList.remove("opacity-0");
        modalContent.classList.remove("scale-95");
      }, 10);
    }
}

// A new function to update the progress bar and text
export function updateLoadingModal(percent, message) {
  const p = Math.max(0, Math.min(100, Math.round(percent))); // Clamp between 0-100
  
  // Update integrated start screen loader if active
  if (!startProgressContainer.classList.contains('hidden')) {
    startProgressBar.style.width = `${p}%`;
    startProgressText.textContent = message;
  }
  
  // Update generic modal loader if active
  if (!modalProgressContainer.classList.contains('hidden')) {
    modalProgressBar.style.width = `${p}%`;
    modalProgressText.textContent = message;
  }
}

export function runStartupLoader(durationMs = 10000) {
    return new Promise((resolve, reject) => {
        showLoadingModal("Opening Quick Start Guide...", true);
        modalCancelBtn.textContent = "Skip Guide";
        modalCancelBtn.classList.remove("hidden"); // Show cancel button for startup loader

        const startTime = Date.now();
        const intervalMs = 100; // Update frequency
        let timerId = null;

        const cleanup = () => {
            clearInterval(timerId);
            hideModal(false); // Use hideModal to clear the progress bar and hide the modal
        };

        const onCancel = () => {
            cleanup();
            reject('cancelled');
        };

        modalCancelBtn.onclick = onCancel; // Use the existing modalCancelBtn

        timerId = setInterval(() => {
            const elapsed = Date.now() - startTime;
            const remaining = Math.max(0, durationMs - elapsed);
            const percent = Math.min(100, (elapsed / durationMs) * 100);

            updateLoadingModal(percent, `${(remaining / 1000).toFixed(1)}s remaining`);

            if (elapsed >= durationMs) {
                cleanup();
                resolve();
            }
        }, intervalMs);
    });
}


// The hideModal function now also resets the progress bar
export function hideModal(value) { // This now returns a promise
  return new Promise(resolve => {
    // Hide the Integrated Loading elements if active
    if (!startProgressContainer.classList.contains('hidden')) {
        startProgressContainer.classList.add('hidden');
        startProgressBar.style.width = '0%';
        startProgressText.textContent = '';
        
        startDropZone.classList.remove('opacity-50', 'pointer-events-none');
        startLoadJsonBtn.classList.remove('opacity-50', 'pointer-events-none');
        startLoadVideoBtn.classList.remove('opacity-50', 'pointer-events-none');
    }

    modalOverlay.classList.add("opacity-0");
    modalContent.classList.add("scale-95");
    setTimeout(() => {
      modalContainer.classList.add("hidden");
      if (modalProgressContainer && modalProgressBar && modalProgressText) {
        modalProgressContainer.classList.add("hidden");
        modalProgressBar.style.width = "0%";
        modalProgressText.textContent = "";
      }
      if (modalResolve) modalResolve(value);
      resolve(); // Resolve the promise returned by hideModal itself
    }, 200);
  });
}

// Event listeners remain the same
modalOkBtn.addEventListener("click", () => hideModal(true));
modalCancelBtn.addEventListener("click", () => hideModal(false));
modalOverlay.addEventListener("click", () => hideModal(false));