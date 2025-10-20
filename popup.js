document.addEventListener('DOMContentLoaded', () => {
    console.log("🔧 Popup: Starting new architecture");
    console.log("🔧 Popup: DOM loaded at:", new Date().toISOString());
    
    // Get elements
    const toggle = document.getElementById('toggle');
    const preferenceToggle = document.getElementById('sortPreference');
    const shoppingToggle = document.getElementById('shoppingToggle');
    const shoppingPreference = document.getElementById('shoppingPreference');
    
    console.log("🔧 Popup: Found elements:", {
        toggle: !!toggle,
        preferenceToggle: !!preferenceToggle,
        shoppingToggle: !!shoppingToggle,
        shoppingPreference: !!shoppingPreference
    });
    
    // Test if we can access browser APIs
    const tabs = browser?.tabs || chrome?.tabs;
    const runtime = browser?.runtime || chrome?.runtime;
    console.log("🔧 Popup: Browser APIs available:", { tabs: !!tabs, runtime: !!runtime });
    
    // Initialize UI state from localStorage immediately
    initializeUI();
    
    // Set up event listeners
    setupEventListeners();
    
    // Auto-select appropriate tab
    selectActiveTab();
});

function initializeUI() {
    console.log("🔧 Popup: Initializing UI from localStorage");
    
    // Get current state from localStorage with defaults
    const isSortingEnabled = localStorage.getItem('capitalOneSortingEnabled') !== 'false';
    const preferMultiplierMiles = localStorage.getItem('capitalOnePreferMultiplierMiles') !== 'false'; // Default to true (Miles Back)
    const shoppingSortingEnabled = localStorage.getItem('capitalOneShoppingSortingEnabled') !== 'false';
    const preferPercentBack = localStorage.getItem('capitalOnePreferPercentBack') === 'true';
    
    console.log("🔧 Popup: Loaded state from localStorage:", {
        isSortingEnabled,
        preferMultiplierMiles,
        shoppingSortingEnabled,
        preferPercentBack
    });
    
    // Set UI elements
    const toggle = document.getElementById('toggle');
    const preferenceToggle = document.getElementById('sortPreference');
    const shoppingToggle = document.getElementById('shoppingToggle');
    const shoppingPreference = document.getElementById('shoppingPreference');
    
    if (toggle) {
        toggle.checked = isSortingEnabled;
        console.log("🔧 Popup: Set toggle.checked to:", toggle.checked);
    }
    
    if (preferenceToggle) {
        preferenceToggle.value = preferMultiplierMiles ? 'miles' : 'percent';
    }
    
    if (shoppingToggle) {
        shoppingToggle.checked = shoppingSortingEnabled;
        console.log("🔧 Popup: Set shoppingToggle.checked to:", shoppingToggle.checked);
    }
    
    if (shoppingPreference) {
        shoppingPreference.value = preferPercentBack ? 'percent' : 'dollar';
    }
}

function setupEventListeners() {
    console.log("🔧 Popup: Setting up event listeners");
    
    const toggle = document.getElementById('toggle');
    const preferenceToggle = document.getElementById('sortPreference');
    const shoppingToggle = document.getElementById('shoppingToggle');
    const shoppingPreference = document.getElementById('shoppingPreference');
    
    // Offers tab main toggle
    if (toggle) {
        toggle.addEventListener('change', () => {
            console.log("🔧 Popup: Offers toggle changed to:", toggle.checked);
            console.log("🔧 Popup: Toggle event fired at:", new Date().toISOString());
            localStorage.setItem('capitalOneSortingEnabled', toggle.checked.toString());
            console.log("🔧 Popup: localStorage updated, calling sendMessageToContentScript");
            sendMessageToContentScript('toggleStateChanged', toggle.checked);
        });
    } else {
        console.error("🔧 Popup: Toggle element not found!");
    }
    
    // Offers tab sort preference
    if (preferenceToggle) {
        preferenceToggle.addEventListener('change', () => {
            const isMiles = preferenceToggle.value === 'miles';
            console.log("🔧 Popup: Offers preference changed to:", isMiles ? 'miles' : 'percent');
            localStorage.setItem('capitalOnePreferMultiplierMiles', isMiles.toString());
            sendMessageToContentScript('toggleSortPreference', isMiles);
        });
    }
    
    // Shopping tab toggle
    if (shoppingToggle) {
        shoppingToggle.addEventListener('change', () => {
            console.log("🔧 Popup: Shopping toggle changed to:", shoppingToggle.checked);
            localStorage.setItem('capitalOneShoppingSortingEnabled', shoppingToggle.checked.toString());
            sendMessageToContentScript('shoppingToggleChanged', shoppingToggle.checked);
        });
    }
    
    // Shopping tab preference
    if (shoppingPreference) {
        shoppingPreference.addEventListener('change', () => {
            const isPercent = shoppingPreference.value === 'percent';
            console.log("🔧 Popup: Shopping preference changed to:", isPercent ? 'percent' : 'dollar');
            localStorage.setItem('capitalOnePreferPercentBack', isPercent.toString());
            sendMessageToContentScript('shoppingPreferenceChanged', isPercent);
        });
    }
    
    // Tab switching
    document.querySelectorAll('.tab-button').forEach(button => {
        button.addEventListener('click', () => {
            const tabId = button.dataset.tab;
            console.log("🔧 Popup: Switching to tab:", tabId);
            
            document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
            
            button.classList.add('active');
            document.getElementById(tabId).classList.add('active');
            
            // Note: Removed redundant "Sorting takes a few seconds.." message
            // The on-screen "Sorting offers... please wait" message is now working properly
        });
    });
    
    // Fallback: make slider span clickable
    document.querySelectorAll('.slider').forEach(slider => {
        slider.addEventListener('click', () => {
            console.log("🔧 Popup: Slider span clicked");
            const input = slider.previousElementSibling;
            if (input && input.type === 'checkbox') {
                console.log("🔧 Popup: Toggling input from", input.checked, "to", !input.checked);
                input.checked = !input.checked;
                input.dispatchEvent(new Event('change'));
            } else {
                console.log("🔧 Popup: No checkbox input found for slider");
            }
        });
    });
}

function sendMessageToContentScript(action, value) {
    console.log("🔧 Popup: sendMessageToContentScript called with:", { action, value });
    
    // Use browser API (Firefox) or chrome API (Chrome) for compatibility
    const runtime = browser?.runtime || chrome?.runtime;
    
    console.log("🔧 Popup: Browser APIs available:", { runtime: !!runtime });
    
    if (!runtime) {
        console.error("🔧 Popup: Browser API not available - runtime:", !!runtime);
        return;
    }
    
    // Send message to background script (which will relay to content scripts)
    console.log("🔧 Popup: Sending message to background script...");
    runtime.sendMessage({ action, value }, (response) => {
        console.log("🔧 Popup: Message send callback executed");
        if (runtime.lastError) {
            console.error("🔧 Popup: Error sending message to background script:", runtime.lastError);
            return;
        }
        console.log("🔧 Popup: Message sent successfully, response:", response);
    });
}

function selectActiveTab() {
    console.log("🔧 Popup: Selecting active tab based on URL");
    
    const tabs = browser?.tabs || chrome?.tabs;
    const runtime = browser?.runtime || chrome?.runtime;
    
    if (!tabs || !runtime) {
        console.error("🔧 Popup: Browser API not available for tab selection");
        return;
    }
    
    tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (runtime.lastError) {
            console.error("🔧 Popup: Error querying tabs for tab selection:", runtime.lastError);
            return;
        }
        
        const url = tabs[0]?.url || "";
        const isShopping = url.includes("capitaloneshopping.com");
        const activeTabId = isShopping ? "shoppingTab" : "offersTab";
        
        console.log("🔧 Popup: URL:", url, "Active tab:", activeTabId);
        
        // Activate the appropriate tab button and content
        document.querySelectorAll('.tab-button').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === activeTabId);
        });
        document.querySelectorAll('.tab-content').forEach(tab => {
            tab.classList.toggle('active', tab.id === activeTabId);
        });
        
        // Note: Removed redundant "Sorting takes a few seconds.." message
        // The on-screen "Sorting offers... please wait" message is now working properly
    });
}


console.log("🔧 Popup: New architecture loaded");