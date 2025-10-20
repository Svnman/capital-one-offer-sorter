// content.js

console.log("🚀 Capital One Sorter: Content script loaded on", window.location.href);

// Debug function to inspect current DOM structure

let originalWrappers = []; // For Offers tab
let originalShoppingWrappers = []; // For Shopping tab
let isSortingEnabled = true; // Default to enabled
let isSortingInProgress = false;
let isLoadingMoreOffers = false; // Track when we're actively loading more offers
let preferMultiplierMiles = false; // Default to fixed miles first

let shoppingSortingEnabled = true; // Default to enabled
let preferPercentBack = false; // Default to dollar back first
let lastShoppingCount = 0;

// Track when the message was first shown to ensure minimum display time
let messageShownTime = null;
let messageObserver = null;
let messageCheckInterval = null;

const isShoppingPage = window.location.href.includes("shopping") || document.querySelector('[data-testid="first-deals-container"]');

console.log("🔍 Capital One Sorter: Page type detection - isShoppingPage:", isShoppingPage);
console.log("🔍 Capital One Sorter: URL contains 'shopping':", window.location.href.includes("shopping"));
console.log("🔍 Capital One Sorter: Found first-deals-container:", !!document.querySelector('[data-testid="first-deals-container"]'));
console.log("🔍 Capital One Sorter: Initial settings - isSortingEnabled:", isSortingEnabled, "shoppingSortingEnabled:", shoppingSortingEnabled);

if (isShoppingPage) {
    console.log("🛒 Capital One Sorter: Starting shopping page sorting...");
    waitForShoppingOffersAndSort();
} else {
    console.log("💳 Capital One Sorter: Starting offers page sorting...");
    waitForOffersAndSort();
}
// --- Offers Tab Sorting Logic ---

function waitForOffersAndSort() {
    console.log("💳 Capital One Sorter: waitForOffersAndSort() called");

    // Use browser API (Firefox) or chrome API (Chrome) for compatibility
    // Load state from localStorage immediately (new approach)
    loadStateFromStorage();
    
    // Set up message listener
    setupMessageListener();
}

function loadStateFromStorage() {
    console.log("💳 Capital One Sorter: Loading state from localStorage");
    
    // Get state from localStorage with defaults
    isSortingEnabled = localStorage.getItem('capitalOneSortingEnabled') !== 'false';
    preferMultiplierMiles = localStorage.getItem('capitalOnePreferMultiplierMiles') !== 'false'; // Default to true (Miles Back)
    shoppingSortingEnabled = localStorage.getItem('capitalOneShoppingSortingEnabled') !== 'false';
    preferPercentBack = localStorage.getItem('capitalOnePreferPercentBack') === 'true';
    
    console.log("💳 Capital One Sorter: Loaded state from localStorage:", {
        isSortingEnabled,
        preferMultiplierMiles,
        shoppingSortingEnabled,
        preferPercentBack
    });
    
    if (isSortingEnabled) {
        console.log("💳 Capital One Sorter: Sorting is enabled, showing wait message and starting sort");
        showWaitMessage();
        startSorting();
    } else {
        console.log("💳 Capital One Sorter: Sorting is disabled, skipping");
        fadeWaitMessage();
    }
}

function setupMessageListener() {
    const runtime = browser?.runtime || chrome?.runtime;
    
    runtime.onMessage.addListener((message, sender, sendResponse) => {
        console.log("💳 Capital One Sorter: Received message:", message, "at", new Date().toISOString());
        if (message.action === "toggleStateChanged") {
            console.log("💳 Capital One Sorter: Toggle state changed to:", message.value);
            isSortingEnabled = message.value;
            localStorage.setItem('capitalOneSortingEnabled', message.value.toString());
            if (isSortingEnabled) {
                console.log("💳 Capital One Sorter: Sorting enabled, starting sort...");
                console.log("💳 Capital One Sorter: isSortingInProgress:", isSortingInProgress);
                showWaitMessage();
                // Update original wrappers before starting sort to ensure we have current state
                const offersContainer = document.querySelector('.grid.justify-between.content-stretch.items-stretch.h-full.w-full.gap-4') || 
                                      document.querySelector('.app-page.offers');
                if (offersContainer) {
                    updateOriginalWrappers(offersContainer);
                }
                startSorting();
            } else {
                console.log("💳 Capital One Sorter: Sorting disabled, reverting offers...");
                console.log("💳 Capital One Sorter: originalWrappers.length:", originalWrappers.length);
                isSortingInProgress = false; // Reset the sorting flag
                revertOffers();
                fadeWaitMessage();
            }
        } else if (message.action === "toggleSortPreference") {
            console.log("💳 Capital One Sorter: Sort preference changed to:", message.value);
            preferMultiplierMiles = message.value;
            localStorage.setItem('capitalOnePreferMultiplierMiles', message.value.toString());
            if (isSortingEnabled && !isSortingInProgress) {
                console.log("💳 Capital One Sorter: Re-sorting existing offers with new preference");
                // Just re-sort existing offers instead of full reload
                const offersContainer = document.querySelector('.grid.justify-between.content-stretch.items-stretch.h-full.w-full.gap-4') || 
                                      document.querySelector('.app-page.offers');
                if (offersContainer) {
                    sortOffers(offersContainer);
                }
            }
        } else if (message.action === "shoppingToggleChanged") {
            console.log("💳 Capital One Sorter: Shopping toggle changed to:", message.value);
            shoppingSortingEnabled = message.value;
            localStorage.setItem('capitalOneShoppingSortingEnabled', message.value.toString());
            if (shoppingSortingEnabled) {
                console.log("🛒 Capital One Sorter: Shopping sorting enabled, starting sort");
                showWaitMessage();
                waitForShoppingPageReady(() => {
                    loadAllShoppingOffers().then(() => {
                        updateOriginalShoppingWrappers();
                        observeShoppingContainer();
                        sortShoppingOffers(preferPercentBack);
                    });
                });
            } else {
                console.log("🛒 Capital One Sorter: Shopping sorting disabled, reverting to original order");
                revertShoppingOffers();
            }
        } else if (message.action === "shoppingPreferenceChanged") {
            console.log("💳 Capital One Sorter: Shopping preference changed to:", message.value);
            preferPercentBack = message.value;
            localStorage.setItem('capitalOnePreferPercentBack', message.value.toString());
            if (shoppingSortingEnabled && !isSortingInProgress) {
                console.log("💳 Capital One Sorter: Re-sorting existing shopping offers with new preference");
                // Just re-sort existing shopping offers instead of full reload
                sortShoppingOffers(preferPercentBack);
            }
        } else {
            console.log("💳 Capital One Sorter: Unknown message action:", message.action);
        }
    });
}

function startSorting() {
    console.log("💳 Capital One Sorter: startSorting() called, isSortingInProgress:", isSortingInProgress);
    if (isSortingInProgress) {
        console.log("💳 Capital One Sorter: Already sorting in progress, skipping");
        return;
    }
    isSortingInProgress = true;

    const MAX_ATTEMPTS = 10;
    let attempts = 0;

    function trySort() {
        
        // Try new selector first, then fallback to old selector
        let offersContainer = document.querySelector('.grid.justify-between.content-stretch.items-stretch.h-full.w-full.gap-4');
        if (!offersContainer) {
            offersContainer = document.querySelector('.app-page.offers');
        }
        if (!offersContainer) {
            offersContainer = document.querySelector('.grid');
        }
        

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

        // Check if we have actual offers (not just skeleton elements)
        const allChildren = Array.from(offersContainer.children);
        const skeletonCount = allChildren.filter(child => {
            const testId = child.getAttribute('data-testid');
            return testId?.includes('skeleton');
        }).length;
        const actualOffersCount = allChildren.filter(child => {
            const testId = child.getAttribute('data-testid');
            return testId?.startsWith('feed-tile-') && !testId.includes('skeleton') && child.querySelector('.standard-tile');
        }).length;
        
        
        // If we only have skeleton elements and no real offers, wait longer
        if (skeletonCount > 0 && actualOffersCount === 0) {
            if (attempts < MAX_ATTEMPTS) {
                attempts++;
                setTimeout(trySort, 1500); // Wait longer for real offers
                return;
            } else {
                isSortingInProgress = false;
                fadeWaitMessage();
                return;
            }
        }
        

        observeAndSort(offersContainer);
    }

    trySort();
}


function observeAndSort(container) {
    const observer = new MutationObserver((mutations, obs) => {
        // Don't trigger sorting while we're actively loading more offers
        if (isLoadingMoreOffers) {
            return; // Skip this mutation event while loading
        }
        
        // Look for "View More Offers" button in the entire document, not just container
        let loadMoreButton = document.querySelector('button.text-base.justify-center.w-full.font-semibold');
        if (!loadMoreButton) {
            loadMoreButton = document.querySelector('button[class*="text-base"][class*="justify-center"][class*="w-full"][class*="font-semibold"]');
        }
        if (!loadMoreButton) {
            // Look for any button containing "View More Offers" text in entire document
            const allButtons = document.querySelectorAll('button');
            loadMoreButton = Array.from(allButtons).find(btn => 
                btn.textContent.toLowerCase().includes('view more offers') || 
                btn.textContent.toLowerCase().includes('view more') || 
                btn.textContent.toLowerCase().includes('load more')
            );
        }
        
        if (!loadMoreButton || loadMoreButton.disabled) {
            // No more offers to load, proceed with sorting
            obs.disconnect();
            updateOriginalWrappers(container);
            if (isSortingEnabled) {
                sortOffers(container);
            } else {
                revertOffers();
                fadeWaitMessage(); // Only fade when reverting
            }
            isSortingInProgress = false;
        } else {
            // More offers available, load them first
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
    isLoadingMoreOffers = true; // Set flag to prevent premature sorting
    console.log("💳 Capital One Sorter: Starting to load more offers...");
    
    let loadMoreAttempts = 0;
    const maxLoadMoreAttempts = 20; // Increased to allow for multiple loads
    let consecutiveNotFound = 0;
    const maxConsecutiveNotFound = 3; // Stop if button not found 3 times in a row

    // Keep the page active even when tab is not active
    let keepAliveInterval;
    let isTabActive = !document.hidden;
    
    // Listen for tab visibility changes
    const handleVisibilityChange = () => {
        isTabActive = !document.hidden;
        if (isTabActive) {
            console.log("🔄 Offers tab became active");
            if (keepAliveInterval) {
                clearInterval(keepAliveInterval);
                keepAliveInterval = null;
            }
        } else {
            console.log("🔄 Offers tab became inactive, starting keep-alive mechanism");
            keepAliveInterval = setInterval(() => {
                if (window.chrome && window.chrome.runtime) {
                    chrome.runtime.sendMessage({ action: "keepAlive" });
                }
            }, 1000);
        }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    // Start keep-alive if tab is already inactive
    if (!isTabActive) {
        console.log("🔄 Offers tab is not active, using keep-alive mechanism");
        keepAliveInterval = setInterval(() => {
            if (window.chrome && window.chrome.runtime) {
                chrome.runtime.sendMessage({ action: "keepAlive" });
            }
        }, 1000);
    }

    // Use setInterval instead of while loop to keep running in inactive tabs
    const loadInterval = setInterval(() => {
        // Look for "View More Offers" button in the entire document, not just container
        let loadMoreButton = document.querySelector('button.text-base.justify-center.w-full.font-semibold');
        if (!loadMoreButton) {
            loadMoreButton = document.querySelector('button[class*="text-base"][class*="justify-center"][class*="w-full"][class*="font-semibold"]');
        }
        if (!loadMoreButton) {
            // Look for any button containing "View More Offers" text in entire document
            const allButtons = document.querySelectorAll('button');
            loadMoreButton = Array.from(allButtons).find(btn => 
                btn.textContent.toLowerCase().includes('view more offers') || 
                btn.textContent.toLowerCase().includes('view more') || 
                btn.textContent.toLowerCase().includes('load more')
            );
        }
        
        if (loadMoreButton && !loadMoreButton.disabled) {
            console.log("💳 Capital One Sorter: Found load more button:", loadMoreButton.textContent, "- clicking to load more offers");
            const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true });
            loadMoreButton.dispatchEvent(clickEvent);
            consecutiveNotFound = 0; // Reset counter since we found and clicked button
        } else {
            consecutiveNotFound++;
            console.log("💳 Capital One Sorter: Load more button not found or disabled (attempt", consecutiveNotFound, "of", maxConsecutiveNotFound, ")");
        }
        
        loadMoreAttempts++;
        
        // Check if we should stop
        if (loadMoreAttempts >= maxLoadMoreAttempts || consecutiveNotFound >= maxConsecutiveNotFound) {
            clearInterval(loadInterval);
            finishOffersLoading();
        }
    }, 200); // 200ms between attempts
    
    // Function to finish loading when interval stops
    function finishOffersLoading() {
        // Clean up keep-alive interval and event listener
        if (keepAliveInterval) {
            clearInterval(keepAliveInterval);
            console.log("🔄 Cleaned up offers keep-alive mechanism");
        }
        
        document.removeEventListener('visibilitychange', handleVisibilityChange);
        console.log("🔄 Cleaned up offers visibility change listener");
        
        console.log("💳 Capital One Sorter: No more offers to load - stopping");

        // All offers loaded, now proceed with sorting
        isLoadingMoreOffers = false; // Clear flag - loading is complete
        console.log("💳 Capital One Sorter: Finished loading all offers, now sorting...");
        
        observer.disconnect();
        updateOriginalWrappers(container);
        if (isSortingEnabled) {
            sortOffers(container);
        } else {
            revertOffers();
            fadeWaitMessage(); // Only fade when reverting
        }
        isSortingInProgress = false;
    }
}

function updateOriginalWrappers(container) {
    // Use the container directly since it's already the main grid container
    let gridContainer = container;
    
    // Only look for a nested grid if the container itself doesn't have the right structure
    if (!container.classList.contains('grid') || !container.querySelector('div[role="button"][data-testid^="feed-tile-"]')) {
        gridContainer = container.querySelector('.grid');
    }
    
    if (!gridContainer) return;
    

    // Look for offer tiles with the new structure
    const offerWrappers = Array.from(gridContainer.children).filter(child => {
        const hasRole = child.getAttribute('role') === 'button';
        const testId = child.getAttribute('data-testid');
        const hasTestId = testId?.startsWith('feed-tile-') && !testId.includes('skeleton');
        const hasStandardTile = child.querySelector('.standard-tile');
        
        
        return hasRole && hasTestId && hasStandardTile;
    });

    // Fallback to old structure if new structure not found
    if (offerWrappers.length === 0) {
        const oldOfferWrappers = Array.from(gridContainer.children).filter(child =>
            child.classList.contains('flex') &&
            child.classList.contains('w-full') &&
            child.classList.contains('h-full') &&
            child.classList.contains('cursor-pointer') &&
            (child.querySelector('.standard-tile') || child.textContent.toLowerCase().includes('miles'))
        );
        originalWrappers = oldOfferWrappers.map(wrapper => {
            const clone = wrapper.cloneNode(true);
            // Preserve grid area information
            clone.style.gridArea = wrapper.style.gridArea;
            return clone;
        });
    } else {
        originalWrappers = offerWrappers.map(wrapper => {
            const clone = wrapper.cloneNode(true);
            // Preserve grid area information
            clone.style.gridArea = wrapper.style.gridArea;
            return clone;
        });
    }
    
    console.log("💳 Capital One Sorter: Found", originalWrappers.length, "offer wrappers to sort");
}

function sortOffers(container) {
    try {
        // Use the container directly since it's already the main grid container
        let gridContainer = container;
        
        // Only look for a nested grid if the container itself doesn't have the right structure
        if (!container.classList.contains('grid') || !container.querySelector('div[role="button"][data-testid^="feed-tile-"]')) {
            gridContainer = container.querySelector('.grid');
        }
        
        if (!gridContainer) {
            return;
        }
        

        // Look for offer tiles with the new structure first
        let offerWrappers = Array.from(gridContainer.children).filter(child => {
            const hasRole = child.getAttribute('role') === 'button';
            const testId = child.getAttribute('data-testid');
            const hasTestId = testId?.startsWith('feed-tile-') && !testId.includes('skeleton');
            const hasStandardTile = child.querySelector('.standard-tile');
            
            
            return hasRole && hasTestId && hasStandardTile;
        });

        // Fallback to old structure if new structure not found
        if (offerWrappers.length === 0) {
            offerWrappers = Array.from(gridContainer.children).filter(child =>
                child.classList.contains('flex') &&
                child.classList.contains('w-full') &&
                child.classList.contains('h-full') &&
                child.classList.contains('cursor-pointer') &&
                (child.querySelector('.standard-tile') || child.textContent.toLowerCase().includes('miles'))
            );
        }

        

        if (offerWrappers.length === 0) {
            return;
        }

        // Hide multi-cell offers and top bar only when visual sorting happens
        hideMultiCellOffers(container);
        hideTopBarSection();

        const sortedWrappers = offerWrappers
            .map((wrapper, index) => {
                const tile = wrapper.querySelector('.standard-tile') || wrapper;
                const { value, type } = extractMiles(tile);
                return { element: wrapper, value, type };
            })
            .sort((a, b) => {
                const priorityOrder = preferMultiplierMiles ? [0, 1, 2] : [1, 0, 2]; // Miles Back = fixed first, Percentage Back = multiplier first
                const typeA = priorityOrder.indexOf(a.type);
                const typeB = priorityOrder.indexOf(b.type);
                
                if (typeA !== typeB) {
                    return typeA - typeB;
                }
                
                return b.value - a.value; // Descending order by value
            });

        
        // Check if order actually changed
        const originalTexts = offerWrappers.map(w => w.querySelector('.standard-tile')?.textContent.substring(0, 30));
        const sortedTexts = sortedWrappers.map(w => w.element.querySelector('.standard-tile')?.textContent.substring(0, 30));
        const orderChanged = JSON.stringify(originalTexts) !== JSON.stringify(sortedTexts);
        
        if (!orderChanged) {
            console.log("💳 Capital One Sorter: ⚠️  WARNING: Order did not change! Capital One may already be showing offers in sorted order.");
        }

        requestAnimationFrame(() => {
            
            // Remove all current children
            offerWrappers.forEach((wrapper, index) => {
                gridContainer.removeChild(wrapper);
            });
            
            
            // Sort ALL offers by value first, regardless of single/multi-cell type
            const allSortedOffers = offerWrappers
                .map((wrapper, index) => {
                    const tile = wrapper.querySelector('.standard-tile') || wrapper;
                    const { value, type } = extractMiles(tile);
                    const gridArea = wrapper.style.gridArea;
                    const isMultiCell = gridArea && gridArea.includes('span');
                    
                    return { wrapper, originalIndex: index, gridArea, value, type, isMultiCell };
                })
                .sort((a, b) => {
                    const priorityOrder = preferMultiplierMiles ? [0, 1, 2] : [1, 0, 2]; // Miles Back = fixed first, Percentage Back = multiplier first
                    const typeA = priorityOrder.indexOf(a.type);
                    const typeB = priorityOrder.indexOf(b.type);
                    
                    if (typeA !== typeB) {
                        return typeA - typeB;
                    }
                    
                    return b.value - a.value;
                });
            
            
            // Add all offers in sorted order - let CSS Grid handle positioning naturally
            allSortedOffers.forEach((item, index) => {
                const isMultiCell = item.isMultiCell;
                
                if (isMultiCell) {
                    // For multi-cell offers, preserve their span properties but let CSS Grid auto-place
                    // Extract the span values from the original grid area
                    const spanMatch = item.gridArea.match(/span (\d+) \/ span (\d+)/);
                    if (spanMatch) {
                        const rowSpan = spanMatch[1];
                        const colSpan = spanMatch[2];
                        item.wrapper.style.gridArea = `span ${rowSpan} / span ${colSpan}`;
                    } else {
                        // Fallback to original grid area if span extraction fails
                        item.wrapper.style.gridArea = item.gridArea;
                    }
                } else {
                    // For single-cell offers, clear grid area to let CSS Grid auto-place
                    item.wrapper.style.gridArea = '';
                }
                
                gridContainer.appendChild(item.wrapper);
            });
            
            
            // Fade the wait message after sorting is completed
            setTimeout(() => {
                fadeWaitMessage();
            }, 500); // Small delay to ensure DOM updates are complete
        });
    } catch (error) {
        console.error("💳 Capital One Sorter: Error sorting offers:", error);
        fadeWaitMessage(); // Fade message on error
    }
}

function revertOffers() {
    // Try to find the offers container with new selectors
    let offersContainer = document.querySelector('.grid.justify-between.content-stretch.items-stretch.h-full.w-full.gap-4');
    if (!offersContainer) {
        offersContainer = document.querySelector('.app-page.offers');
    }
    if (!offersContainer) return;
    
    // Use the container directly since it's already the main grid container
    let gridContainer = offersContainer;
    
    // Only look for a nested grid if the container itself doesn't have the right structure
    if (!offersContainer.classList.contains('grid') || !offersContainer.querySelector('div[role="button"][data-testid^="feed-tile-"]')) {
        gridContainer = offersContainer.querySelector('.grid');
    }
    
    if (!gridContainer) return;
    
    console.log("💳 Capital One Sorter: revertOffers using grid container:", gridContainer.className);

    // Look for offer tiles with the new structure first
    let offerWrappers = Array.from(gridContainer.children).filter(child => {
        const testId = child.getAttribute('data-testid');
        return child.getAttribute('role') === 'button' && 
               testId?.startsWith('feed-tile-') && 
               !testId.includes('skeleton') &&
               child.querySelector('.standard-tile');
    });

    // Fallback to old structure if new structure not found
    if (offerWrappers.length === 0) {
        offerWrappers = Array.from(gridContainer.children).filter(child =>
            child.classList.contains('flex') &&
            child.classList.contains('w-full') &&
            child.classList.contains('h-full') &&
            child.classList.contains('cursor-pointer') &&
            (child.querySelector('.standard-tile') || child.textContent.toLowerCase().includes('miles'))
        );
    }

    if (originalWrappers.length === 0) {
        console.log("💳 Capital One Sorter: No original wrappers found, cannot revert");
        return;
    }

    console.log("💳 Capital One Sorter: Reverting", offerWrappers.length, "offers to original order");
    console.log("💳 Capital One Sorter: originalWrappers.length:", originalWrappers.length);

    requestAnimationFrame(() => {
        offerWrappers.forEach(wrapper => gridContainer.removeChild(wrapper));
        originalWrappers.forEach(wrapper => {
            const clone = wrapper.cloneNode(true);
            // Preserve grid area information when reverting
            clone.style.gridArea = wrapper.style.gridArea;
            gridContainer.appendChild(clone);
        });
    });
}

function extractMiles(element) {
    const text = element.textContent.toLowerCase();
    
    // Check for multipliers first (X miles) to avoid false matches with fixed miles
    let multiplierMatch = text.match(/up to (\d+)x\s*miles/i) || text.match(/(\d+)x\s*miles/i);
    if (multiplierMatch) {
        const value = parseInt(multiplierMatch[1], 10);
        return { value, type: 1 };
    }
    
    // Then check for fixed miles (but exclude cases that have X after the number)
    let fixedMilesMatch = text.match(/up to (\d+,?\d*)\s*miles/i) || text.match(/(\d+,?\d*)\s*miles/i);
    if (fixedMilesMatch) {
        // Double-check that this isn't actually a multiplier by looking for X after the number
        const matchText = text.substring(fixedMilesMatch.index, fixedMilesMatch.index + fixedMilesMatch[0].length + 5);
        if (!matchText.includes('x')) {
            const value = parseInt(fixedMilesMatch[1].replace(',', ''), 10);
            return { value, type: 0 };
        }
    }

    if (text.includes('% back')) {
        return { value: 0, type: 2 };
    }
    
    return { value: 0, type: 2 };
}

// --- Shopping Tab Sorting Logic ---

function waitForShoppingOffersAndSort() {
    console.log("🛒 Capital One Sorter: waitForShoppingOffersAndSort() called");
    
    // Load state from localStorage immediately (new approach)
    loadShoppingStateFromStorage();
    
    // Set up message listener for popup communication
    setupMessageListener();
}

function loadShoppingStateFromStorage() {
    console.log("🛒 Capital One Sorter: Loading shopping state from localStorage");
    
    // Get state from localStorage with defaults
    shoppingSortingEnabled = localStorage.getItem('capitalOneShoppingSortingEnabled') !== 'false';
    preferPercentBack = localStorage.getItem('capitalOnePreferPercentBack') === 'true';
    
    console.log("🛒 Capital One Sorter: Loaded shopping state from localStorage:", {
        shoppingSortingEnabled,
        preferPercentBack
    });
    
    if (shoppingSortingEnabled) {
        console.log("🛒 Capital One Sorter: Shopping sorting is enabled, starting sort");
        showWaitMessage();
        
        // Check if offers are already loaded - if so, start immediately
        const existingOffers = document.querySelectorAll('.deal-list-item, .sc-hTUWRQ.caGeOb.deal-list-item');
        if (existingOffers.length > 0) {
            console.log("🛒 Capital One Sorter: Offers already present, starting scroll immediately");
            loadAllShoppingOffers().then(() => {
                updateOriginalShoppingWrappers();
                observeShoppingContainer();
                sortShoppingOffers(preferPercentBack);
            });
        } else {
            // Wait for page to be ready, but with faster checks
            waitForShoppingPageReady(() => {
                loadAllShoppingOffers().then(() => {
                    updateOriginalShoppingWrappers();
                    observeShoppingContainer();
                    sortShoppingOffers(preferPercentBack);
                });
            });
        }
    } else {
        console.log("🛒 Capital One Sorter: Shopping sorting is disabled, skipping");
        fadeWaitMessage();
    }
}



function waitForShoppingPageReady(callback) {
    const checkInterval = 200; // Much faster initial checks
    const maxChecks = 30;
    let tries = 0;

    function checkReady() {
        const loadingIndicator = document.querySelector('[data-testid="first-deals-container"] .deal-list-item, .sc-hTUWRQ.caGeOb.deal-list-item');
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
    const scrollPause = 150; // Fast timing like original ultra-fast
    const maxIdleTries = 20;  // Even more patience for loading
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
            scrollTarget.scrollBy({ top: 500, behavior: 'auto' }); // smaller jumps for fast timing
        } else {
            window.scrollBy({ top: 500, behavior: 'auto' });
        }
    };

    console.log("🚀 Ultra-fast scrolling with gentle jumps...");

    // Keep the page active even when tab is not active
    let keepAliveInterval;
    let isTabActive = !document.hidden;
    
    // Listen for tab visibility changes
    const handleVisibilityChange = () => {
        isTabActive = !document.hidden;
        if (isTabActive) {
            console.log("🔄 Tab became active");
            if (keepAliveInterval) {
                clearInterval(keepAliveInterval);
                keepAliveInterval = null;
            }
        } else {
            console.log("🔄 Tab became inactive, starting keep-alive mechanism");
            keepAliveInterval = setInterval(() => {
                // Send a small message to keep the tab active
                if (window.chrome && window.chrome.runtime) {
                    chrome.runtime.sendMessage({ action: "keepAlive" });
                }
            }, 1000);
        }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    // Start keep-alive if tab is already inactive
    if (!isTabActive) {
        console.log("🔄 Tab is not active, using keep-alive mechanism");
        keepAliveInterval = setInterval(() => {
            if (window.chrome && window.chrome.runtime) {
                chrome.runtime.sendMessage({ action: "keepAlive" });
            }
        }, 1000);
    }

    // Use setInterval instead of while loop to keep running in inactive tabs
    const scrollInterval = setInterval(() => {
        pageDown();
        
        const currentCount = document.querySelectorAll('.deal-list-item, .sc-hTUWRQ.caGeOb.deal-list-item').length;
        console.log("🌀 Scroll check:", currentCount, "(last:", lastCount, ") idleTries:", idleTries, "/", maxIdleTries);

        if (currentCount > lastCount) {
            lastCount = currentCount;
            idleTries = 0;
            console.log("✅ New offers found! Reset idle counter");
        } else {
            idleTries++;
            console.log("⏳ No new offers, idle counter:", idleTries);
        }
        
        // Check if we should stop
        if (idleTries >= maxIdleTries) {
            clearInterval(scrollInterval);
            finishLoading();
        }
    }, scrollPause);
    
    // Function to finish loading when interval stops
    function finishLoading() {
        // Clean up keep-alive interval and event listener
        if (keepAliveInterval) {
            clearInterval(keepAliveInterval);
            console.log("🔄 Cleaned up keep-alive mechanism");
        }
        
        document.removeEventListener('visibilitychange', handleVisibilityChange);
        console.log("🔄 Cleaned up visibility change listener");
        
        console.log("✅ Finished loading all offers. Running sort...");
        sortShoppingOffers();
    }
}




function observeShoppingContainer() {
    const target = document.querySelector('[data-testid="wb-shopping-tab-content"]') || document.body;

    const observer = new MutationObserver((mutations, obs) => {
        const offers = document.querySelectorAll('.deal-list-item, .sc-hTUWRQ.caGeOb.deal-list-item');

        // If enough offers are loaded, sort them and stop observing
        if (offers.length > 5) {
            console.log("👀 Observer: Offers loaded, triggering sort...");
            updateOriginalShoppingWrappers(); // Store original order before sorting
            sortShoppingOffers();
            // Don't fade here - let sortShoppingOffers handle it
            obs.disconnect();
        }
    });

    observer.observe(target, {
        childList: true,
        subtree: true,
    });

    console.log("🔭 Now observing shopping container for loaded offers...");
}

function updateOriginalShoppingWrappers() {
    console.log("🛒 Capital One Sorter: Storing original shopping offers order");
    originalShoppingWrappers = [];
    
    // Find all shopping offer containers
    const containers = [
        document.querySelector('[data-testid="first-deals-container"]'),
        document.querySelector('[data-testid="wb-shopping-tab-content"]')
    ].filter(Boolean);

    console.log("🛒 Capital One Sorter: Found", containers.length, "shopping containers");

    containers.forEach((container, index) => {
        const offers = container.querySelectorAll('.deal-list-item, .sc-hTUWRQ.caGeOb.deal-list-item');
        console.log("🛒 Capital One Sorter: Container", index, "has", offers.length, "offers");
        offers.forEach(offer => {
            originalShoppingWrappers.push(offer.cloneNode(true));
        });
    });
    
    console.log("🛒 Capital One Sorter: Stored", originalShoppingWrappers.length, "original shopping offers");
}

function revertShoppingOffers() {
    console.log("🛒 Capital One Sorter: Reverting shopping offers to original order");
    
    if (originalShoppingWrappers.length === 0) {
        console.log("🛒 Capital One Sorter: No original shopping offers stored - sorting may not have been applied yet");
        console.log("🛒 Capital One Sorter: Just fading wait message since no revert is needed");
        fadeWaitMessage();
        return;
    }
    
    // Find all shopping offer containers
    const containers = [
        document.querySelector('[data-testid="first-deals-container"]'),
        document.querySelector('[data-testid="wb-shopping-tab-content"]')
    ].filter(Boolean);

    if (containers.length === 0) {
        console.log("🛒 Capital One Sorter: No shopping containers found");
        fadeWaitMessage();
        return;
    }

    containers.forEach(container => {
        const offers = container.querySelectorAll('.deal-list-item, .sc-hTUWRQ.caGeOb.deal-list-item');
        offers.forEach(offer => {
            offer.remove();
        });
        
        // Re-add original offers in original order
        originalShoppingWrappers.forEach(originalOffer => {
            container.appendChild(originalOffer.cloneNode(true));
        });
    });
    
    console.log("🛒 Capital One Sorter: Reverted", originalShoppingWrappers.length, "shopping offers to original order");
    fadeWaitMessage();
}

function sortShoppingOffers(preferPercentBack = false) {
    console.log("🛒 Capital One Sorter: sortShoppingOffers() called with preferPercentBack:", preferPercentBack);
    console.log("🛒 Capital One Sorter: Current originalShoppingWrappers.length:", originalShoppingWrappers.length);
    
    // Ensure we have original offers stored before sorting
    if (originalShoppingWrappers.length === 0) {
        console.log("🛒 Capital One Sorter: No original offers stored, storing them now before sorting");
        updateOriginalShoppingWrappers();
    } else {
        console.log("🛒 Capital One Sorter: Original offers already stored, proceeding with sorting");
    }
    
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
        const directOffers = Array.from(firstDealsContainer.querySelectorAll(':scope > .deal-list-item, :scope > .sc-hTUWRQ.caGeOb.deal-list-item'));
        if (directOffers.length > 1) {
            sortGroup(directOffers, 'first-deals-container');
        }
    }

    // 1. Top-level offers not inside slider
    const topOffers = Array.from(
        document.querySelectorAll('.deal-list-item, .sc-hTUWRQ.caGeOb.deal-list-item')
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

    // ✅ Done — scroll to top and fade message after sorting is complete
    setTimeout(() => {
        scrollToTop();
        fadeWaitMessage();
    }, 500);
}



     


// --- UI Helpers ---

function scrollToTop() {
    console.log("🔄 Capital One Sorter: Scrolling to top of page");
    
    // Try multiple methods to ensure we scroll to the very top
    try {
        // Method 1: Scroll to top of window
        window.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
        
        // Method 2: Also try scrolling the document element
        if (document.documentElement) {
            document.documentElement.scrollTop = 0;
        }
        
        // Method 3: Try scrolling the body element
        if (document.body) {
            document.body.scrollTop = 0;
        }
        
        // Method 4: Try scrolling the main scrolling element
        const scrollTarget = document.querySelector('[data-testid="wb-shopping-tab-content"]') || document.scrollingElement;
        if (scrollTarget && scrollTarget.scrollTo) {
            scrollTarget.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
        }
        
        console.log("🔄 Capital One Sorter: Scroll to top completed");
    } catch (error) {
        console.error("🔄 Capital One Sorter: Error scrolling to top:", error);
    }
}

function hideMultiCellOffers(container) {
    if (!container) return;
    
    // Find all offer elements with grid-area that spans multiple cells
    const allOffers = container.querySelectorAll('div[role="button"][data-testid^="feed-tile-"]');
    
    allOffers.forEach(offer => {
        const gridArea = offer.style.gridArea;
        if (gridArea && gridArea.includes('span')) {
            // Check if it spans more than 1 row or 1 column
            const spanMatch = gridArea.match(/span (\d+) \/ span (\d+)/);
            if (spanMatch) {
                const rowSpan = parseInt(spanMatch[1]);
                const colSpan = parseInt(spanMatch[2]);
                
                // Hide if it spans more than 1 row OR more than 1 column
                if (rowSpan > 1 || colSpan > 1) {
                    offer.style.display = 'none';
                }
            }
        }
    });
}

function hideTopBarSection() {
    // Hide the "Check Back Daily for New Offers" section (top bar)
    let topBarSection = document.querySelector('div.my-5.sm\\:my-10');
    
    // Fallback: search for the section by text content
    if (!topBarSection) {
        const headings = document.querySelectorAll('h3');
        for (const heading of headings) {
            if (heading.textContent.includes('Check Back Daily for New Offers')) {
                topBarSection = heading.closest('div.my-5, div[class*="my-5"]');
                break;
            }
        }
    }
    
    if (topBarSection) {
        topBarSection.style.display = 'none';
    }
}

function createWaitMessage() {
    const waitMessage = document.createElement('div');
    waitMessage.id = 'sorting-wait-msg';
    waitMessage.textContent = 'Sorting offers… please wait.';
    // Center on screen with larger size
    waitMessage.style.cssText = 'position: fixed !important; top: 50% !important; left: 50% !important; transform: translate(-50%, -50%) !important; background: #ff6b6b !important; color: white !important; padding: 20px 30px !important; border-radius: 12px !important; box-shadow: 0 6px 20px rgba(0,0,0,0.4) !important; font-size: 24px !important; z-index: 999999 !important; font-family: sans-serif !important; opacity: 1 !important; transition: opacity 2s ease !important; font-weight: bold !important; min-width: 300px !important; text-align: center !important;';
    
    // Add to body
    document.body.appendChild(waitMessage);
    return waitMessage;
}

function showWaitMessage() {
    messageShownTime = Date.now(); // Track when message is shown
    
    // Clean up any existing observers/intervals
    if (messageObserver) {
        messageObserver.disconnect();
        messageObserver = null;
    }
    if (messageCheckInterval) {
        clearInterval(messageCheckInterval);
        messageCheckInterval = null;
    }
    
    requestAnimationFrame(() => {
        let waitMessage = document.getElementById('sorting-wait-msg');
        if (!waitMessage) {
            waitMessage = createWaitMessage();
        } else {
            console.log("💳 Capital One Sorter: Updating existing wait message at", new Date().toISOString());
            waitMessage.style.opacity = '1';
        }
        
        // Set up persistent monitoring
        messageObserver = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'childList') {
                    mutation.removedNodes.forEach((node) => {
                        if (node.id === 'sorting-wait-msg') {
                            console.log("💳 Capital One Sorter: WARNING - Wait message was removed by external code at", new Date().toISOString());
                            console.log("💳 Capital One Sorter: Recreating message immediately");
                            setTimeout(() => {
                                if (!document.getElementById('sorting-wait-msg')) {
                                    createWaitMessage();
                                }
                            }, 10);
                        }
                    });
                }
            });
        });
        messageObserver.observe(document.body, { childList: true, subtree: true });
        
        // Periodic check to ensure message stays visible
        messageCheckInterval = setInterval(() => {
            const currentMessage = document.getElementById('sorting-wait-msg');
            if (!currentMessage) {
                createWaitMessage();
            }
        }, 100); // Check every 100ms
        
        // Clean up after 30 seconds
        setTimeout(() => {
            if (messageObserver) {
                messageObserver.disconnect();
                messageObserver = null;
            }
            if (messageCheckInterval) {
                clearInterval(messageCheckInterval);
                messageCheckInterval = null;
            }
        }, 30000);
    });
}

function fadeWaitMessage() {
    
    // Clean up observers and intervals
    if (messageObserver) {
        messageObserver.disconnect();
        messageObserver = null;
    }
    if (messageCheckInterval) {
        clearInterval(messageCheckInterval);
        messageCheckInterval = null;
    }
    
    const waitMessage = document.getElementById('sorting-wait-msg');
    if (!waitMessage) {
        return;
    }
    
    // Ensure message is visible for at least 3 seconds
    const now = Date.now();
    const minDisplayTime = 3000; // 3 seconds
    const timeSinceShown = messageShownTime ? now - messageShownTime : 0;
    const remainingTime = Math.max(0, minDisplayTime - timeSinceShown);
    
    
    setTimeout(() => {
        waitMessage.style.opacity = '0.05';
        setTimeout(() => {
            if (waitMessage && waitMessage.parentNode) {
                waitMessage.remove();
            }
        }, 2000);
    }, remainingTime);
}