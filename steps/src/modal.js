import {
  modalText,
  modalCancelBtn,
  modalContainer,
  modalOverlay,
  modalContent,
  modalOkBtn,
} from "./dom.js";

// --- Custom Modal Logic --- //
// Variable to store the resolve function of the Promise, allowing the modal to return a value.
let modalResolve = null; 
export function showModal(message, isConfirm = false) {
  return new Promise((resolve) => {
    // Set the message text for the modal.
    modalText.textContent = message;
    // Show/hide the cancel button based on whether it's a confirmation modal.
    modalCancelBtn.classList.toggle("hidden", !isConfirm);
    // Make the modal container visible.
    modalContainer.classList.remove("hidden");
    // Add a slight delay for CSS transitions to take effect, making the modal appear smoothly.
    setTimeout(() => {
      modalOverlay.classList.remove("opacity-0");
      modalContent.classList.remove("scale-95");
    }, 10);
    // Store the resolve function to be called when the modal is closed.
    modalResolve = resolve;
  });
}
// Hides the modal and resolves the Promise with the given value.
function hideModal(value) {
  modalOverlay.classList.add("opacity-0");
  modalContent.classList.add("scale-95");
  setTimeout(() => {
    modalContainer.classList.add("hidden");
    if (modalResolve) modalResolve(value);
  }, 200);
}

//----------------------Modal Event Listeners----------------------//
// Event listener for the "OK" button. Resolves the modal Promise with 'true'.
modalOkBtn.addEventListener("click", () => hideModal(true));
// Event listener for the "Cancel" button. Resolves the modal Promise with 'false'.
modalCancelBtn.addEventListener("click", () => hideModal(false));
// Event listener for clicking on the modal overlay (outside the content). Resolves the modal Promise with 'false'.
modalOverlay.addEventListener("click", () => hideModal(false));
