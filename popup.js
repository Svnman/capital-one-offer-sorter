document.addEventListener('DOMContentLoaded', () => {
    const toggle = document.getElementById('toggle');
    const slider = document.querySelector('.slider');
    const waitMsg = document.getElementById('popup-wait-msg');

    // Show message on load
    if (waitMsg) {
        waitMsg.style.opacity = 1;
    }

    // Get current toggle state
    browser.runtime.sendMessage({ action: "getToggleState" }, (response) => {
        toggle.checked = response.isSortingEnabled;
    });

    // Update toggle state
    toggle.addEventListener('change', () => {
        browser.runtime.sendMessage({ action: "setToggleState", value: toggle.checked }, (response) => {
            if (response.success) {
                console.log("Toggle state updated:", toggle.checked);
                temporarilyShowPopupWaitMessage();
            }
        });
    });

    // Let slider click also toggle
    slider.addEventListener('click', () => {
        toggle.checked = !toggle.checked;
        toggle.dispatchEvent(new Event('change'));
    });

function temporarilyShowPopupWaitMessage() {
    if (waitMsg) {
        waitMsg.style.transition = 'opacity 0.3s ease';
        waitMsg.style.opacity = 1;
        setTimeout(() => {
            waitMsg.style.opacity = 0.5;
        }, 4000); // after 4 seconds
    }
}

});
