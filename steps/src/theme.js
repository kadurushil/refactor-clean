import { appState } from './state.js';
import { videoPlayer } from './dom.js';
// --- DARK MODE: Step 3 - Add the JavaScript Logic ---
const themeToggleBtn = document.getElementById('theme-toggle');
const darkIcon = document.getElementById('theme-toggle-dark-icon');
const lightIcon = document.getElementById('theme-toggle-light-icon');

function setTheme(theme) {
    if (theme === 'dark') {
        document.documentElement.classList.add('dark');
        lightIcon.classList.remove('hidden');
        darkIcon.classList.add('hidden');
        localStorage.setItem('color-theme', 'dark');
    } else {
        document.documentElement.classList.remove('dark');
        darkIcon.classList.remove('hidden');
        lightIcon.classList.add('hidden');
        localStorage.setItem('color-theme', 'light');
    }
    
    // Redraw the main radar plot
    if (appState.p5_instance) appState.p5_instance.redraw();

    // =================== THE FIX IS HERE ===================
    if (appState.speedGraphInstance) {
        // 1. Check if there's data to draw.
        if ((appState.canData.length > 0 || appState.vizData) && videoPlayer.duration) {
            // 2. Force it to take a new "photograph" with the new theme colors.
            appState.speedGraphInstance.drawStaticGraphToBuffer(appState.canData, appState.vizData);
        }
        // 3. Display the new photograph.
        appState.speedGraphInstance.redraw();
    }
    // ================= END OF FIX =========================
}


export function initializeTheme() {
    const savedTheme = localStorage.getItem('color-theme');
    if (savedTheme) {
        setTheme(savedTheme);
    } else {
        // Default to light mode if no theme is saved
        setTheme('light');
    }

    themeToggleBtn.addEventListener('click', () => {
        if (document.documentElement.classList.contains('dark')) {
            setTheme('light');
        } else {
            setTheme('dark');
        }
    });
}
