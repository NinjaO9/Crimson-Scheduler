(function() {
    const MOBILE_BREAKPOINT = 760;

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

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeHelpMode);
    } else {
        initializeHelpMode();
    }
})();
