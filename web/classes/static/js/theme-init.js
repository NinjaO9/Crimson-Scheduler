/**
 * @fileoverview Initializes and persists the application's light and dark themes. 
 *                 It is separate from schedule/preferences.js to prevent a weird flash due to difference in load time.
 *                 (this is leaded before the style sheet, preferences.js is loaded after)
 * @version      1.0.0
 * @package      CrimsonScheduler
 * @author       NinjaO9
 */

(function () {
    const STORAGE_KEY = 'crimson-theme';

    function readStoredTheme() {
        try {
            const storedTheme = window.localStorage.getItem(STORAGE_KEY);
            return storedTheme === 'dark' || storedTheme === 'light' ? storedTheme : null;
        } catch (error) {
            return null;
        }
    }

    function getSystemTheme() {
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }

    function applyTheme(theme, persist = false) {
        const normalizedTheme = theme === 'dark' ? 'dark' : 'light';
        document.documentElement.dataset.theme = normalizedTheme;
        document.documentElement.dataset.bsTheme = normalizedTheme;

        if (persist) {
            try {
                window.localStorage.setItem(STORAGE_KEY, normalizedTheme);
            } catch (error) {
                // Continue without persistence when storage is unavailable.
            }
        }

        return normalizedTheme;
    }

    let currentTheme = applyTheme(readStoredTheme() || getSystemTheme());

    window.CrimsonTheme = {
        get() {
            return currentTheme;
        },
        set(theme) {
            currentTheme = applyTheme(theme, true);
            return currentTheme;
        },
    };
})();
