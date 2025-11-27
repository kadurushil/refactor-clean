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
    
    // --- THIS IS THE FIX ---
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
export function showLoadingModal(message) {
    modalText.textContent = message;
    modalOkBtn.classList.add('hidden');
    modalCancelBtn.classList.add('hidden');
    modalProgressContainer.classList.remove('hidden');
    modalProgressBar.style.width = '0%';
    modalProgressText.textContent = 'Initializing...';
    
    modalContainer.classList.remove("hidden");
    setTimeout(() => {
      modalOverlay.classList.remove("opacity-0");
      modalContent.classList.remove("scale-95");
    }, 10);
}

// A new function to update the progress bar and text
export function updateLoadingModal(percent, message) {
  if (modalProgressBar && modalProgressText) {
    const p = Math.max(0, Math.min(100, Math.round(percent))); // Clamp between 0-100
    modalProgressBar.style.width = `${p}%`;
    modalProgressText.textContent = message;
  }
}

// The hideModal function now also resets the progress bar
export function hideModal(value) { // This now returns a promise
  return new Promise(resolve => {
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