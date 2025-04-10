document.addEventListener('DOMContentLoaded', () => {
    const toggle = document.getElementById('toggle');
    const preferenceToggle = document.getElementById('sortPreference');
    const waitMsg = document.getElementById('popup-wait-msg');
    const sliderToggles = document.querySelectorAll('.slider');

    // Set consistent visible state
    waitMsg.style.opacity = 1;
    waitMsg.style.color = '#444';

    // Load saved toggle states
    browser.runtime.sendMessage({ action: "getToggleState" }, (response) => {
        toggle.checked = response.isSortingEnabled;
        preferenceToggle.checked = response.preferMultiplierMiles || false;
    });

    // Handle main sorting toggle
    toggle.addEventListener('change', () => {
        browser.runtime.sendMessage({ action: "setToggleState", value: toggle.checked }, (response) => {
            if (response.success) {
                console.log("Sorting toggle updated:", toggle.checked);
                pulseNote();
            }
        });
    });

    // Handle Xmiles sorting preference toggle
    preferenceToggle.addEventListener('change', () => {
        browser.runtime.sendMessage({ action: "setSortPreference", value: preferenceToggle.checked }, (response) => {
            if (response.success) {
                console.log("Preference toggle updated:", preferenceToggle.checked);
                pulseNote();
            }
        });
    });

    // Fallback: clicking slider span toggles the checkbox
    sliderToggles.forEach(slider => {
        slider.addEventListener('click', () => {
            const input = slider.previousElementSibling;
            if (input && input.type === 'checkbox') {
                input.checked = !input.checked;
                input.dispatchEvent(new Event('change'));
            }
        });
    });

    // Animate note briefly to show activity
    function pulseNote() {
        waitMsg.style.animation = 'pulseZoom 1.2s ease-in-out infinite';
        setTimeout(() => {
            waitMsg.style.animation = 'none';
        }, 10000); // Stop after 10s
    }
});
