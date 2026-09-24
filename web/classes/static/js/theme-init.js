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
