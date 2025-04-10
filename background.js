let isSortingEnabled = true;
let preferMultiplierMiles = false;

// Handle messages from content and popup scripts
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "getToggleState") {
        sendResponse({ 
            isSortingEnabled, 
            preferMultiplierMiles 
        });
    } 
    else if (message.action === "setToggleState") {
        isSortingEnabled = message.value;
        // Notify all tabs of the state change
        broadcastToTabs({ action: "toggleStateChanged", value: isSortingEnabled });
        sendResponse({ success: true });
    }
    else if (message.action === "setSortPreference") {
        preferMultiplierMiles = message.value;
        // Notify all tabs of the preference change
        broadcastToTabs({ action: "toggleSortPreference", value: preferMultiplierMiles });
        sendResponse({ success: true });
    }
    return true;
});

// Function to broadcast a message to all open tabs
function broadcastToTabs(payload) {
    browser.tabs.query({}, (tabs) => {
        for (const tab of tabs) {
            if (tab.id) {
                browser.tabs.sendMessage(tab.id, payload).catch((err) => {
                    // Ignore tabs that don't have the content script injected
                });
            }
        }
    });
}
