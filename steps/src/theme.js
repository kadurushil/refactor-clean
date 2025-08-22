import { appState } from './state.js';




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
    if (appState.p5_instance) appState.p5_instance.redraw();
    if (appState.speedGraphInstance) {
        if ((appState.canData.length > 0 || appState.vizData) && videoPlayer.duration) {
            appState.speedGraphInstance.setData(appState.canData, appState.vizData, videoPlayer.duration);
        }
        appState.speedGraphInstance.redraw();
    }
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
