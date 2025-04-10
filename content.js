let originalWrappers = []; // Store the original offer wrappers
let isSortingEnabled = true; // Track the toggle state
let isSortingInProgress = false; // Prevent multiple sorting processes
let preferMultiplierMiles = false; // New toggle for sorting preference

function showWaitMessage() {
    requestAnimationFrame(() => {
        let waitMessage = document.getElementById('sorting-wait-msg');
        if (!waitMessage) {
            waitMessage = document.createElement('div');
            waitMessage.id = 'sorting-wait-msg';
            waitMessage.textContent = 'Sorting offers… please wait.';
            waitMessage.style.cssText = 'position: fixed; bottom: 10px; left: 50%; transform: translateX(-50%); background: #fff4c4; color: #555; padding: 6px 12px; border-radius: 5px; box-shadow: 0 1px 3px rgba(0,0,0,0.2); font-size: 13px; z-index: 9999; font-family: sans-serif; opacity: 1; transition: opacity 2s ease;';
            document.body.appendChild(waitMessage);
        } else {
            waitMessage.style.opacity = '1';
        }
    });
}

function fadeWaitMessage() {
    const waitMessage = document.getElementById('sorting-wait-msg');
    if (!waitMessage) return;
    waitMessage.style.opacity = '0.05';
    setTimeout(() => {
        if (waitMessage && waitMessage.parentNode) {
            waitMessage.remove();
        }
    }, 2000);
}

function waitForOffersAndSort() {
    showWaitMessage();

    browser.runtime.sendMessage({ action: "getToggleState" }, (response) => {
        isSortingEnabled = response.isSortingEnabled;
        preferMultiplierMiles = response.preferMultiplierMiles || false;
        console.log("Initial sorting state:", isSortingEnabled ? "Enabled" : "Disabled");

        setTimeout(showWaitMessage, 100);
        setTimeout(showWaitMessage, 300);

        startSorting();
    });

    browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.action === "toggleStateChanged") {
            isSortingEnabled = message.value;
            console.log("Toggle state changed:", isSortingEnabled ? "Enabled" : "Disabled");
            if (isSortingInProgress) {
                console.log("Sorting in progress, waiting to apply new state...");
                return;
            }
            if (isSortingEnabled) {
                console.log("Starting sorting process...");
                showWaitMessage();
                startSorting();
            } else {
                console.log("Reverting offers to original order...");
                revertOffers();
                fadeWaitMessage();
            }
        } else if (message.action === "toggleSortPreference") {
            preferMultiplierMiles = message.value;
            console.log("Sort preference set to:", preferMultiplierMiles ? "Xmiles first" : "#miles first");
            if (isSortingEnabled && !isSortingInProgress) {
                startSorting();
            }
        }
    });
}

function startSorting() {
    if (isSortingInProgress) {
        console.log("Sorting already in progress, skipping...");
        return;
    }
    isSortingInProgress = true;

    const MAX_ATTEMPTS = 10;
    let attempts = 0;

    function trySort() {
        const offersContainer = document.querySelector('.app-page.offers');

        if (!offersContainer) {
            if (attempts < MAX_ATTEMPTS) {
                attempts++;
                console.log(`Waiting for offers to load (attempt ${attempts}/${MAX_ATTEMPTS})...`);
                setTimeout(trySort, 1000);
            } else {
                console.error("Timeout: Could not find offers container");
                isSortingInProgress = false;
                fadeWaitMessage();
            }
            return;
        }

        console.log("Offers container found. Starting sort process...");
        observeAndSort(offersContainer);
    }

    trySort();
}

function observeAndSort(container) {
    const observer = new MutationObserver((mutations, obs) => {
        const loadMoreButton = container.querySelector('button.text-base.justify-center.w-full.font-semibold');
        if (!loadMoreButton || loadMoreButton.disabled) {
            obs.disconnect();
            updateOriginalWrappers(container);
            if (isSortingEnabled) {
                console.log("All offers loaded, sorting...");
                sortOffers(container);
            } else {
                console.log("All offers loaded, reverting to original order...");
                revertOffers();
            }
            setTimeout(() => {
                if (isSortingEnabled) {
                    console.log("Reapplying sorting state after delay...");
                    sortOffers(container);
                } else {
                    console.log("Reapplying revert state after delay...");
                    revertOffers();
                }
            }, 2000);
            isSortingInProgress = false;
            fadeWaitMessage();
        } else {
            loadMoreOffers(container, obs);
        }
    });

    observer.observe(container, {
        childList: true,
        subtree: true
    });

    loadMoreOffers(container, observer);
}

async function loadMoreOffers(container, observer) {
    let attempts = 0;
    const maxAttempts = 10;

    while (attempts < maxAttempts) {
        const loadMoreButton = container.querySelector('button.text-base.justify-center.w-full.font-semibold');
        if (loadMoreButton && !loadMoreButton.disabled) {
            console.log("Clicking View More Offers...");
            const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true });
            loadMoreButton.dispatchEvent(clickEvent);
            await new Promise(resolve => setTimeout(resolve, 2000));
            return;
        }
        attempts++;
        console.log(`View More Offers button not found, retrying (attempt ${attempts}/${maxAttempts})...`);
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    console.log("Could not find View More Offers button after multiple attempts, proceeding to sort...");
    observer.disconnect();
    updateOriginalWrappers(container);
    if (isSortingEnabled) {
        console.log("All offers loaded, sorting...");
        sortOffers(container);
    } else {
        console.log("All offers loaded, reverting to original order...");
        revertOffers();
    }
    setTimeout(() => {
        if (isSortingEnabled) {
            console.log("Reapplying sorting state after delay...");
            sortOffers(container);
        } else {
            console.log("Reapplying revert state after delay...");
            revertOffers();
        }
    }, 2000);
    isSortingInProgress = false;
    fadeWaitMessage();
}

function updateOriginalWrappers(container) {
    const gridContainer = container.querySelector('.grid');
    if (!gridContainer) {
        console.error("Could not find grid container to update original wrappers");
        return;
    }

    const offerWrappers = Array.from(gridContainer.children).filter(child =>
        child.classList.contains('flex') &&
        child.classList.contains('w-full') &&
        child.classList.contains('h-full') &&
        child.classList.contains('cursor-pointer') &&
        (child.querySelector('.standard-tile') || child.textContent.toLowerCase().includes('miles'))
    );

    if (offerWrappers.length > 0) {
        originalWrappers = offerWrappers.map(wrapper => wrapper.cloneNode(true));
        console.log(`Updated originalWrappers with ${originalWrappers.length} offers`);
    } else {
        console.warn("No offer wrappers found to update originalWrappers");
    }
}

function sortOffers(container) {
    try {
        const gridContainer = container.querySelector('.grid');
        if (!gridContainer) {
            console.error("Could not find grid container for offers");
            return;
        }

        const offerWrappers = Array.from(gridContainer.children).filter(child =>
            child.classList.contains('flex') &&
            child.classList.contains('w-full') &&
            child.classList.contains('h-full') &&
            child.classList.contains('cursor-pointer') &&
            (child.querySelector('.standard-tile') || child.textContent.toLowerCase().includes('miles'))
        );

        if (!offerWrappers.length) {
            console.log("No offer wrappers found to sort");
            return;
        }

        const sortedWrappers = offerWrappers
            .map(wrapper => {
                const tile = wrapper.querySelector('.standard-tile') || wrapper;
                const { value, type } = extractMiles(tile);
                return { element: wrapper, value, type };
            })
            .sort((a, b) => {
                // Set dynamic priority based on toggle
                const priorityOrder = preferMultiplierMiles
                    ? [1, 0, 2] // Xmiles first
                    : [0, 1, 2]; // #miles first

                const typeA = priorityOrder.indexOf(a.type);
                const typeB = priorityOrder.indexOf(b.type);

                if (typeA !== typeB) {
                    return typeA - typeB;
                }

                // Within same type, sort by value descending
                return b.value - a.value;
            });

        requestAnimationFrame(() => {
            offerWrappers.forEach(wrapper => gridContainer.removeChild(wrapper));
            sortedWrappers.forEach(item => gridContainer.appendChild(item.element));
            console.log(`Sorted ${sortedWrappers.length} offers successfully with ${preferMultiplierMiles ? 'Xmiles' : '#miles'} priority.`);
        });
    } catch (error) {
        console.error("Error sorting offers:", error);
    }
}


function revertOffers() {
    try {
        const offersContainer = document.querySelector('.app-page.offers');
        if (!offersContainer) {
            console.error("Offers container not found for reverting");
            return;
        }

        const gridContainer = offersContainer.querySelector('.grid');
        if (!gridContainer) {
            console.error("Could not find grid container for reverting");
            return;
        }

        const offerWrappers = Array.from(gridContainer.children).filter(child =>
            child.classList.contains('flex') &&
            child.classList.contains('w-full') &&
            child.classList.contains('h-full') &&
            child.classList.contains('cursor-pointer') &&
            (child.querySelector('.standard-tile') || child.textContent.toLowerCase().includes('miles'))
        );

        if (!offerWrappers.length) {
            console.log("No offer wrappers found to revert");
            return;
        }

        if (originalWrappers.length === 0) {
            console.warn("No original wrappers stored to revert to");
            return;
        }

        requestAnimationFrame(() => {
            offerWrappers.forEach(wrapper => gridContainer.removeChild(wrapper));
            originalWrappers.forEach(wrapper => gridContainer.appendChild(wrapper.cloneNode(true)));
            console.log("Reverted offers to original order");
        });
    } catch (error) {
        console.error("Error reverting offers:", error);
    }
}

function extractMiles(element) {
    const text = element.textContent.toLowerCase();
    let fixedMilesMatch = text.match(/up to (\d+,?\d*)\s*miles/i) || text.match(/(\d+,?\d*)\s*miles/i);
    if (fixedMilesMatch) {
        const value = parseInt(fixedMilesMatch[1].replace(',', ''), 10);
        return { value, type: 0 };
    }

    let multiplierMatch = text.match(/up to (\d+)x\s*miles/i) || text.match(/(\d+)x\s*miles/i);
    if (multiplierMatch) {
        const value = parseInt(multiplierMatch[1], 10);
        return { value, type: 1 };
    }

    if (text.includes('% back')) {
        return { value: 0, type: 2 };
    }

    return { value: 0, type: 2 };
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', waitForOffersAndSort);
} else {
    waitForOffersAndSort();
}