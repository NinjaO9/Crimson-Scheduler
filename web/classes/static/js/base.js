(function() {
    const MOBILE_BREAKPOINT = 760;

    function reflectTheme(theme) {
        const normalizedTheme = theme === 'dark' ? 'dark' : 'light';
        document.documentElement.dataset.theme = normalizedTheme;
        document.documentElement.dataset.bsTheme = normalizedTheme;

        const themeToggle = document.getElementById('themeToggle');
        if (themeToggle) {
            themeToggle.checked = normalizedTheme === 'dark';
        }
    }

    function initializeTheme() {
        const themeController = window.CrimsonTheme;
        const theme = themeController ? themeController.get() : 'light';
        reflectTheme(theme);

        const themeToggle = document.getElementById('themeToggle');
        themeToggle?.addEventListener('change', () => {
            const nextTheme = themeToggle.checked ? 'dark' : 'light';
            if (themeController) {
                reflectTheme(themeController.set(nextTheme));
            } else {
                reflectTheme(nextTheme);
            }
        });
    }

    function setHelpMode() {
        const isMobile = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`).matches;
        const activeMode = isMobile ? 'mobile' : 'desktop';

        document.querySelectorAll('[data-help-mode]').forEach(section => {
            const isActive = section.getAttribute('data-help-mode') === activeMode;
            section.hidden = !isActive;
            section.setAttribute('aria-hidden', String(!isActive));
        });
    }

    function initializeHelpMode() {
        setHelpMode();

        const helpModal = document.getElementById('helpModal');
        if (helpModal) {
            helpModal.addEventListener('show.bs.modal', setHelpMode);
        }

        window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`).addEventListener('change', setHelpMode);
    }

    initializeTheme();

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeHelpMode);
    } else {
        initializeHelpMode();
    }
})();
