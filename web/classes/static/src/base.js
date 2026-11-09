/**
 * @fileoverview Initializes shared page theme state and responsive help content.
 * @version      1.0.0
 * @package      CrimsonScheduler
 * @author       NinjaO9
 */

(function() {
    const MOBILE_BREAKPOINT = 760;

    /**
     * Modifies the site to reflect the active theme.
     *
     * @param {string} theme - Theme to be reflected by the site.
     * @returns {void}
     * @see {@link initializeTheme}
     */
    function reflectTheme(theme) {
        const normalizedTheme = theme === 'dark' ? 'dark' : 'light';
        document.documentElement.dataset.theme = normalizedTheme;
        document.documentElement.dataset.bsTheme = normalizedTheme;

        const themeToggle = document.getElementById('themeToggle');
        if (themeToggle) {
            themeToggle.checked = normalizedTheme === 'dark';
        }
    }

    /**
     * Defaults the theme on application startup.
     *
     * @returns {void}
     * @see {@link reflectTheme}
     */
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

    /**
     * Starts the help sheet, and determines what mode it should take based on the viewport.
     *
     * @returns {void}
     * @see {@link initializeHelpMode}
     */
    function setHelpMode() {
        const isMobile = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`).matches;
        const activeMode = isMobile ? 'mobile' : 'desktop';

        document.querySelectorAll('[data-help-mode]').forEach(section => {
            const isActive = section.getAttribute('data-help-mode') === activeMode;
            section.hidden = !isActive;
            section.setAttribute('aria-hidden', String(!isActive));
        });
    }

    /**
     * Initalizes the help trigger to supply the help sheet.
     *
     * @returns {void}
     * @see {@link setHelpMode}
     */
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
