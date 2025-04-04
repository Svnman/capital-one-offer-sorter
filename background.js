let isSortingEnabled = true;

browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "getToggleState") {
        sendResponse({ isSortingEnabled });
    } else if (message.action === "setToggleState") {
        isSortingEnabled = message.value;

        // Notify all content scripts
        browser.tabs.query({}, (tabs) => {
            for (let tab of tabs) {
                browser.tabs.sendMessage(tab.id, {
                    action: "toggleStateChanged",
                    value: isSortingEnabled
                });
            }
        });

        sendResponse({ success: true });
    }
});
