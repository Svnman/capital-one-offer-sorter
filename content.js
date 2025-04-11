// content.js

let originalWrappers = []; // For Offers tab
let isSortingEnabled = true;
let isSortingInProgress = false;
let preferMultiplierMiles = false;

let shoppingSortingEnabled = true;
let preferPercentBack = false;
let lastShoppingCount = 0;

const isShoppingPage = window.location.href.includes("shopping") || document.querySelector('[data-testid="first-deals-container"]');

if (isShoppingPage) {
    waitForShoppingOffersAndSort();
} else {
    waitForOffersAndSort();
}
// --- Offers Tab Sorting Logic ---

function waitForOffersAndSort() {
    showWaitMessage();

    browser.runtime.sendMessage({ action: "getToggleState" }, (response) => {
        isSortingEnabled = response.isSortingEnabled;
        preferMultiplierMiles = response.preferMultiplierMiles || false;

        setTimeout(showWaitMessage, 100);
        setTimeout(fadeWaitMessage, 300);

        startSorting();
    });

    browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.action === "toggleStateChanged") {
            isSortingEnabled = message.value;
            if (isSortingEnabled) {
                showWaitMessage();
                startSorting();
            } else {
                revertOffers();
                fadeWaitMessage();
            }
        } else if (message.action === "toggleSortPreference") {
            preferMultiplierMiles = message.value;
            if (isSortingEnabled && !isSortingInProgress) {
                startSorting();
            }
        }
    });
}

function startSorting() {
    if (isSortingInProgress) return;
    isSortingInProgress = true;

    const MAX_ATTEMPTS = 10;
    let attempts = 0;

    function trySort() {
        const offersContainer = document.querySelector('.app-page.offers');

        if (!offersContainer) {
            if (attempts < MAX_ATTEMPTS) {
                attempts++;
                setTimeout(trySort, 1000);
            } else {
                isSortingInProgress = false;
                fadeWaitMessage();
            }
            return;
        }

        // 👇 Hide the slider
        const topSlider = offersContainer.querySelector('div.relative.flex.items-center.justify-center');
        if (topSlider) {
            topSlider.style.display = 'none';
        }

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
                sortOffers(container);
            } else {
                revertOffers();
            }
            setTimeout(() => {
                if (isSortingEnabled) sortOffers(container);
                else revertOffers();
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
            const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true });
            loadMoreButton.dispatchEvent(clickEvent);
            await new Promise(resolve => setTimeout(resolve, 2000));
            return;
        }
        attempts++;
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    observer.disconnect();
    updateOriginalWrappers(container);
    if (isSortingEnabled) sortOffers(container);
    else revertOffers();

    setTimeout(() => {
        if (isSortingEnabled) sortOffers(container);
        else revertOffers();
    }, 2000);
    isSortingInProgress = false;
    fadeWaitMessage();
}

function updateOriginalWrappers(container) {
    const gridContainer = container.querySelector('.grid');
    if (!gridContainer) return;

    const offerWrappers = Array.from(gridContainer.children).filter(child =>
        child.classList.contains('flex') &&
        child.classList.contains('w-full') &&
        child.classList.contains('h-full') &&
        child.classList.contains('cursor-pointer') &&
        (child.querySelector('.standard-tile') || child.textContent.toLowerCase().includes('miles'))
    );

    originalWrappers = offerWrappers.map(wrapper => wrapper.cloneNode(true));
}

function sortOffers(container) {
    try {
        const gridContainer = container.querySelector('.grid');
        if (!gridContainer) return;

        const offerWrappers = Array.from(gridContainer.children).filter(child =>
            child.classList.contains('flex') &&
            child.classList.contains('w-full') &&
            child.classList.contains('h-full') &&
            child.classList.contains('cursor-pointer') &&
            (child.querySelector('.standard-tile') || child.textContent.toLowerCase().includes('miles'))
        );

        const sortedWrappers = offerWrappers
            .map(wrapper => {
                const tile = wrapper.querySelector('.standard-tile') || wrapper;
                const { value, type } = extractMiles(tile);
                return { element: wrapper, value, type };
            })
            .sort((a, b) => {
                const priorityOrder = preferMultiplierMiles ? [1, 0, 2] : [0, 1, 2];
                const typeA = priorityOrder.indexOf(a.type);
                const typeB = priorityOrder.indexOf(b.type);
                if (typeA !== typeB) return typeA - typeB;
                return b.value - a.value;
            });

        requestAnimationFrame(() => {
            offerWrappers.forEach(wrapper => gridContainer.removeChild(wrapper));
            sortedWrappers.forEach(item => gridContainer.appendChild(item.element));
        });
    } catch (error) {
        console.error("Error sorting offers:", error);
    }
}

function revertOffers() {
    const offersContainer = document.querySelector('.app-page.offers');
    if (!offersContainer) return;
    const gridContainer = offersContainer.querySelector('.grid');
    if (!gridContainer) return;

    const offerWrappers = Array.from(gridContainer.children).filter(child =>
        child.classList.contains('flex') &&
        child.classList.contains('w-full') &&
        child.classList.contains('h-full') &&
        child.classList.contains('cursor-pointer') &&
        (child.querySelector('.standard-tile') || child.textContent.toLowerCase().includes('miles'))
    );

    if (originalWrappers.length === 0) return;

    requestAnimationFrame(() => {
        offerWrappers.forEach(wrapper => gridContainer.removeChild(wrapper));
        originalWrappers.forEach(wrapper => gridContainer.appendChild(wrapper.cloneNode(true)));
    });
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

    if (text.includes('% back')) return { value: 0, type: 2 };
    return { value: 0, type: 2 };
}

// --- Shopping Tab Sorting Logic ---

function waitForShoppingOffersAndSort() {
    showWaitMessage();

    browser.runtime.sendMessage({ action: "getToggleState" }, (response) => {
        shoppingSortingEnabled = response.shoppingSortingEnabled;
        preferPercentBack = response.preferPercentBack || false;

        if (shoppingSortingEnabled) {
            waitForShoppingPageReady(() => {
                loadAllShoppingOffers().then(() => {
                    observeShoppingContainer();
                    sortShoppingOffers(preferPercentBack); // ✅ pass preference
                });
            });
        }
    });

    browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.action === "shoppingToggleChanged") {
            shoppingSortingEnabled = message.value;
            if (shoppingSortingEnabled) {
                showWaitMessage();
                waitForShoppingPageReady(() => {
                    loadAllShoppingOffers().then(() => {
                        observeShoppingContainer();
                        sortShoppingOffers(preferPercentBack); // ✅ pass again
                    });
                });
            }
        } else if (message.action === "shoppingPreferenceChanged") {
            preferPercentBack = message.value;
            if (shoppingSortingEnabled) {
                sortShoppingOffers(preferPercentBack); // ✅ pass here too
            }
        }
    });
}


function waitForShoppingPageReady(callback) {
    const checkInterval = 500;
    const maxChecks = 30;
    let tries = 0;

    function checkReady() {
        const loadingIndicator = document.querySelector('[data-testid="first-deals-container"] .deal-list-item');
        if (loadingIndicator || tries >= maxChecks) {
            callback();
        } else {
            tries++;
            setTimeout(checkReady, checkInterval);
        }
    }

    checkReady();
}

async function loadAllShoppingOffers() {
    const scrollPause = 200; // reduce pause
    const maxIdleTries = 10;  // fewer idle checks = faster end
    let idleTries = 0;
    let lastCount = 0;

    const scrollTarget = document.querySelector('[data-testid="wb-shopping-tab-content"]') || document.scrollingElement;

    const pageDown = () => {
        const event = new KeyboardEvent('keydown', {
            key: 'PageDown',
            code: 'PageDown',
            keyCode: 34,
            which: 34,
            bubbles: true,
            cancelable: true
        });

        (scrollTarget || document).dispatchEvent(event);

        if (scrollTarget && typeof scrollTarget.scrollBy === 'function') {
            scrollTarget.scrollBy({ top: 1000, behavior: 'auto' }); // faster jump
        } else {
            window.scrollBy({ top: 1000, behavior: 'auto' });
        }
    };

    console.log("🚀 Ultra-fast scrolling to load offers...");

    while (idleTries < maxIdleTries) {
        pageDown();
        await new Promise(resolve => setTimeout(resolve, scrollPause));

        const currentCount = document.querySelectorAll('.deal-list-item').length;
        console.log("🌀 Scroll check:", currentCount, "(last:", lastCount, ")");

        if (currentCount > lastCount) {
            lastCount = currentCount;
            idleTries = 0;
        } else {
            idleTries++;
        }
    }

    console.log("✅ Finished loading all offers. Running sort...");
    sortShoppingOffers();
}




function observeShoppingContainer() {
    const target = document.querySelector('[data-testid="wb-shopping-tab-content"]') || document.body;

    const observer = new MutationObserver((mutations, obs) => {
        const offers = document.querySelectorAll('.styled__ItemContainer-sc-1bcs4xb-1.deal-list-item');

        // If enough offers are loaded, sort them and stop observing
        if (offers.length > 5) {
            console.log("👀 Observer: Offers loaded, triggering sort...");
            sortShoppingOffers();
            fadeWaitMessage(); // ✅ Remove wait message after sort
            obs.disconnect();
        }
    });

    observer.observe(target, {
        childList: true,
        subtree: true,
    });

    console.log("🔭 Now observing shopping container for loaded offers...");
}

function sortShoppingOffers(preferPercentBack = false) {
    const sortGroup = (offers, containerLabel = '') => {
        const sorted = offers
            .map(el => {
                const text = el.textContent.toLowerCase();
                const dollarMatch = text.match(/\$(\d+[.,]?\d*)\s*back/);
                const percentMatch = text.match(/(\d+[.,]?\d*)%\s*back/);
                let value = 0, type = 2;
                if (dollarMatch) {
                    value = parseFloat(dollarMatch[1].replace(/,/g, ''));
                    type = 0;
                } else if (percentMatch) {
                    value = parseFloat(percentMatch[1]);
                    type = 1;
                }
                return { el, value, type };
            })
            .sort((a, b) => {
                const priority = preferPercentBack ? [1, 0, 2] : [0, 1, 2];
                const aType = priority.indexOf(a.type);
                const bType = priority.indexOf(b.type);
                return aType !== bType ? aType - bType : b.value - a.value;
            });
    
        const parent = offers[0]?.parentElement;
        if (!parent) return;
    
        console.log(`⏳ Reordering ${offers.length} in ${containerLabel}...`);
    
        let index = 0;
        const chunkSize = 25;
    
        const reorderChunk = (deadline) => {
            while (index < sorted.length && deadline.timeRemaining() > 0) {
                const { el } = sorted[index];
                parent.appendChild(el); // move real node
                index++;
            }
    
            if (index < sorted.length) {
                requestIdleCallback(reorderChunk);
            } else {
                console.log(`✅ ${containerLabel}: Finished reordering`);
            }
        };
    
        requestIdleCallback(reorderChunk);
    };
    
    // 0. First-deals-container direct children
    const firstDealsContainer = document.querySelector('[data-testid="first-deals-container"]');
    if (firstDealsContainer) {
        const directOffers = Array.from(firstDealsContainer.querySelectorAll(':scope > .deal-list-item'));
        if (directOffers.length > 1) {
            sortGroup(directOffers, 'first-deals-container');
        }
    }

    // 1. Top-level offers not inside slider
    const topOffers = Array.from(
        document.querySelectorAll('.styled__ItemContainer-sc-1bcs4xb-1.deal-list-item')
    ).filter(item =>
        !item.closest('.styled__SliderContainer-sc-zg9xdm-0, .slick-slide, .personalized-item-wrapper')
    );

    if (topOffers.length > 1) {
        sortGroup(topOffers, 'Top-level offers');
    }

    // 2. Section-by-section
    const allSections = document.querySelectorAll(
        '.styled__DealsContainer-sc-wsuq8n-17, .styled__SliderContainer-sc-zg9xdm-0, .personalized-item-wrapper'
    );

    allSections.forEach((section, i) => {
        const isSlider = section.classList.contains('styled__SliderContainer-sc-zg9xdm-0') ||
                         section.querySelector('.slick-track') ||
                         section.classList.contains('personalized-item-wrapper');
        if (isSlider) {
            section.style.display = 'none'; // hide sliders
            return;
        }

        const offers = Array.from(
            section.querySelectorAll('.styled__ItemContainer-sc-1bcs4xb-1.deal-list-item')
        ).filter(item => !item.closest('.slick-slide'));

        if (offers.length > 1) {
            sortGroup(offers, `Section #${i + 1}`);
        }
    });

    // ✅ Done — fade message
    setTimeout(fadeWaitMessage, 150);
}



     


// --- UI Helpers ---

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