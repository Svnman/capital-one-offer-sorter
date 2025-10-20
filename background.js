// Background Script for Firefox Manifest V3 compatibility
// Message relay between popup and content scripts

console.log("🔧 Capital One Sorter: Background script loaded");

// Use browser API (Firefox) or chrome API (Chrome) for compatibility
const runtime = browser?.runtime || chrome?.runtime;
const tabs = browser?.tabs || chrome?.tabs;

// Message listener for Manifest V3
runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log("🔧 Capital One Sorter: Background script received message:", message);
    
    switch (message.action) {
        case "toggleStateChanged":
            console.log("🔧 Capital One Sorter: Broadcasting toggleStateChanged to all tabs");
            broadcastToTabs({ action: "toggleStateChanged", value: message.value });
            sendResponse({ success: true });
            break;
            
        case "toggleSortPreference":
            console.log("🔧 Capital One Sorter: Broadcasting toggleSortPreference to all tabs");
            broadcastToTabs({ action: "toggleSortPreference", value: message.value });
            sendResponse({ success: true });
            break;
            
        case "shoppingToggleChanged":
            console.log("🔧 Capital One Sorter: Broadcasting shoppingToggleChanged to all tabs");
            broadcastToTabs({ action: "shoppingToggleChanged", value: message.value });
            sendResponse({ success: true });
            break;
            
        case "shoppingPreferenceChanged":
            console.log("🔧 Capital One Sorter: Broadcasting shoppingPreferenceChanged to all tabs");
            broadcastToTabs({ action: "shoppingPreferenceChanged", value: message.value });
            sendResponse({ success: true });
            break;
            
        default:
            console.warn("🔧 Capital One Sorter: Unknown message action:", message.action);
            break;
    }
    
    return true; // Keep message channel open for async response
});

async function broadcastToTabs(payload) {
    try {
        console.log("🔧 Capital One Sorter: Broadcasting to tabs:", payload);
        const allTabs = await tabs.query({});
        console.log("🔧 Capital One Sorter: Found", allTabs.length, "tabs");
        
        const promises = allTabs.map(async (tab) => {
            if (tab.id) {
                try {
                    console.log("🔧 Capital One Sorter: Sending message to tab", tab.id, "URL:", tab.url);
                    await tabs.sendMessage(tab.id, payload);
                    console.log("🔧 Capital One Sorter: Successfully sent message to tab", tab.id);
                } catch (error) {
                    // Content script might not be loaded on this tab; safe to ignore
                    console.debug(`Could not send message to tab ${tab.id}:`, error.message);
                }
            }
        });
        
        await Promise.allSettled(promises);
        console.log("🔧 Capital One Sorter: Finished broadcasting to all tabs");
    } catch (error) {
        console.error("Error broadcasting to tabs:", error);
    }
}

// Background script initialization for Firefox
console.log('Capital One Sorter background script loaded');