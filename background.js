let isSortingEnabled = true;
let preferMultiplierMiles = false;

let shoppingSortingEnabled = true;
let preferPercentBack = false;

browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message.action) {
        case "getToggleState":
            sendResponse({ 
                isSortingEnabled, 
                preferMultiplierMiles,
                shoppingSortingEnabled,
                preferPercentBack
            });
            break;

        case "setToggleState":
            isSortingEnabled = message.value;
            broadcastToTabs({ action: "toggleStateChanged", value: isSortingEnabled });
            sendResponse({ success: true });
            break;

        case "setSortPreference":
            preferMultiplierMiles = message.value;
            broadcastToTabs({ action: "toggleSortPreference", value: preferMultiplierMiles });
            sendResponse({ success: true });
            break;

        case "setShoppingToggle":
            shoppingSortingEnabled = message.value;
            broadcastToTabs({ action: "shoppingToggleChanged", value: shoppingSortingEnabled });
            sendResponse({ success: true });
            break;

        case "setShoppingPreference":
            preferPercentBack = message.value;
            broadcastToTabs({ action: "shoppingPreferenceChanged", value: preferPercentBack });
            sendResponse({ success: true });
            break;

        default:
            console.warn("Unknown message action:", message.action);
            break;
    }

    return true;
});

function broadcastToTabs(payload) {
    browser.tabs.query({}, (tabs) => {
        tabs.forEach(tab => {
            if (tab.id) {
                browser.tabs.sendMessage(tab.id, payload).catch(() => {
                    // Content script might not be loaded on this tab; safe to ignore
                });
            }
        });
    });
}
