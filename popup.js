document.addEventListener('DOMContentLoaded', () => {
    // 🔸 Automatically select the appropriate tab based on current URL
    browser.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const url = tabs[0]?.url || "";
        const isShopping = url.includes("capitaloneshopping.com");
        const activeTabId = isShopping ? "shoppingTab" : "offersTab";

        // Activate the appropriate tab button and content
        document.querySelectorAll('.tab-button').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === activeTabId);
        });
        document.querySelectorAll('.tab-content').forEach(tab => {
            tab.classList.toggle('active', tab.id === activeTabId);
        });

        // Start pulsing the correct note
        const noteId = isShopping ? 'shopping-wait-msg' : 'offers-wait-msg';
        pulseNote(document.getElementById(noteId));
    });

    // 🔸 Tab switching logic
    document.querySelectorAll('.tab-button').forEach(button => {
        button.addEventListener('click', () => {
            const tabId = button.dataset.tab;

            document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));

            button.classList.add('active');
            document.getElementById(tabId).classList.add('active');

            // Pulse the correct tab's note
            const noteId = (tabId === 'shoppingTab') ? 'shopping-wait-msg' : 'offers-wait-msg';
            pulseNote(document.getElementById(noteId));
        });
    });

    const toggle = document.getElementById('toggle');
    const preferenceToggle = document.getElementById('sortPreference');
    const shoppingToggle = document.getElementById('shoppingToggle');
    const shoppingPreference = document.getElementById('shoppingPreference');
    const sliderToggles = document.querySelectorAll('.slider');

    // Load saved toggle states
    browser.runtime.sendMessage({ action: "getToggleState" }, (response) => {
        toggle.checked = response.isSortingEnabled;

        // Set Offers dropdown (Miles/Percentage)
        if (response.preferMultiplierMiles !== undefined) {
            preferenceToggle.value = response.preferMultiplierMiles ? 'miles' : 'percent';
        }

        // Set Shopping sorting toggle
        if (response.shoppingSortingEnabled !== undefined) {
            shoppingToggle.checked = response.shoppingSortingEnabled;
        }

        // Set Shopping dropdown ($/% back)
        if (response.preferPercentBack !== undefined) {
            shoppingPreference.value = response.preferPercentBack ? 'percent' : 'dollar';
        }
    });


    // Handle Offers tab main toggle
    toggle.addEventListener('change', () => {
        browser.runtime.sendMessage({ action: "setToggleState", value: toggle.checked }, (response) => {
            if (response.success) {
                console.log("Offers sorting toggle updated:", toggle.checked);
            }
        });
    });

    // Handle Offers tab sort preference toggle
    preferenceToggle.addEventListener('change', () => {
        browser.runtime.sendMessage({ action: "setSortPreference", value: preferenceToggle.checked }, (response) => {
            if (response.success) {
                console.log("Offers preference toggle updated:", preferenceToggle.checked);
            }
        });
    });

    // Handle Shopping tab toggle
    preferenceToggle.addEventListener('change', () => {
        const isMiles = preferenceToggle.value === 'miles';
        browser.runtime.sendMessage({ action: "setSortPreference", value: isMiles }, (response) => {
            if (response.success) {
                console.log("Offers preference updated (Miles?):", isMiles);
            }
        });
    });

    // Handle Shopping tab preference toggle
    shoppingPreference.addEventListener('change', () => {
        const isPercent = shoppingPreference.value === 'percent';
        browser.runtime.sendMessage({ action: "setShoppingPreference", value: isPercent }, (response) => {
            if (response.success) {
                console.log("Shopping preference updated (%?):", isPercent);
            }
        });
    });

    // Fallback: make slider span clickable to toggle input
    sliderToggles.forEach(slider => {
        slider.addEventListener('click', () => {
            const input = slider.previousElementSibling;
            if (input && input.type === 'checkbox') {
                input.checked = !input.checked;
                input.dispatchEvent(new Event('change'));
            }
        });
    });
});

function pulseNote(msgElement) {
    if (!msgElement) return;
    msgElement.style.animation = 'pulseZoom 1.2s ease-in-out infinite';
    setTimeout(() => {
        msgElement.style.animation = 'none';
    }, 10000);
}

console.log("Popup loaded. Tabs should work.");
