
import { modalText, modalCancelBtn, modalContainer, modalOverlay, modalContent, modalOkBtn } from './dom.js';

// --- Custom Modal Logic --- //
        let modalResolve = null;
        export function showModal(message, isConfirm = false) {
            return new Promise(resolve => {
                modalText.textContent = message;
                modalCancelBtn.classList.toggle('hidden', !isConfirm);
                modalContainer.classList.remove('hidden');
                setTimeout(() => {
                    modalOverlay.classList.remove('opacity-0');
                    modalContent.classList.remove('scale-95');
                }
                    , 10);
                modalResolve = resolve;
            });
        }
        function hideModal(value) {
            modalOverlay.classList.add('opacity-0');
            modalContent.classList.add('scale-95');
            setTimeout(() => {
                modalContainer.classList.add('hidden');
                if (modalResolve) modalResolve(value);
            }, 200);
        }


        //----------------------Modal Event Listeners----------------------//

        modalOkBtn.addEventListener('click', () => hideModal(true));
        modalCancelBtn.addEventListener('click', () => hideModal(false));
        modalOverlay.addEventListener('click', () => hideModal(false));