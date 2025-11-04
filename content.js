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
// Intercept fetch calls to capture the API URL and cursor pattern
const originalFetch = window.fetch;
window._capitalOneApiInfo = null;

window.fetch = function(...args) {
    const url = args[0];
    const urlStr = typeof url === 'string' ? url : (url && url.url ? url.url : url);
    
    // Check if this looks like the Capital One offers API call
    if (urlStr && typeof urlStr === 'string' && 
        (urlStr.includes('/feed/') || urlStr.includes('cursor')) && 
        (urlStr.includes('numberOfColumnsInGrid') || urlStr.includes('viewInstanceId') || urlStr.includes('contentSlug'))) {
        
        console.log("💳 Capital One Sorter: Intercepted fetch API call:", urlStr);
        
        // Extract cursor from URL
        try {
            // Handle relative URLs
            const fullUrl = urlStr.startsWith('http') ? urlStr : new URL(urlStr, window.location.origin).href;
            const urlObj = new URL(fullUrl);
            const cursor = urlObj.searchParams.get('cursor');
            
            if (cursor) {
                window._capitalOneApiInfo = {
                    url: fullUrl,
                    cursor: cursor,
                    baseUrl: fullUrl.split('?')[0],
                    params: Object.fromEntries(urlObj.searchParams)
                };
                console.log("💳 Capital One Sorter: Captured API info from fetch:", {
                    baseUrl: window._capitalOneApiInfo.baseUrl,
                    params: Object.keys(window._capitalOneApiInfo.params),
                    cursor: cursor.substring(0, 50) + '...'
                });
                
                // AUTO-LOAD: After capturing the first cursor, automatically trigger more loads
                if (!window._capitalOneApiInfo._autoLoadTriggered) {
                    window._capitalOneApiInfo._autoLoadTriggered = true;
                    console.log("💳 Capital One Sorter: Starting auto-load of additional offers...");
                    
                    // Wait for React to process this fetch, then start auto-loading
                    setTimeout(() => {
                        autoLoadMoreOffers(cursor, urlObj);
                    }, 1000);
                }
            } else {
                console.log("💳 Capital One Sorter: Found API URL but no cursor parameter");
            }
            
            // Intercept the response to capture React's handler
            const fetchPromise = originalFetch.apply(this, args);
            return fetchPromise.then(response => {
                // Clone the response so we can read it without consuming it
                const clonedResponse = response.clone();
                
                // Read the response to see what React expects
                clonedResponse.json().then(data => {
                    console.log("💳 Capital One Sorter: Intercepted fetch response (from React), data keys:", Object.keys(data));
                    // Store the cursor from the response for the next call
                    if (data.cursor) {
                        window._capitalOneApiInfo.cursor = data.cursor;
                        console.log("💳 Capital One Sorter: Updated cursor from response");
                    }
                    
                    // Check if React processed this (offer count should increase)
                    setTimeout(() => {
                        const offerCount = document.querySelectorAll('div[role="button"][data-testid^="feed-tile-"]').length;
                        console.log("💳 Capital One Sorter: Offer count after intercepted fetch (React):", offerCount);
                    }, 500);
                }).catch(e => {
                    // Response might not be JSON
                });
                
                return response;
            });
        } catch (e) {
            console.log("💳 Capital One Sorter: Error parsing fetch URL:", e, "URL was:", urlStr);
        }
    }
    
    return originalFetch.apply(this, args);
};

// Function to automatically load more offers using page context injection
async function autoLoadMoreOffers(initialCursor, initialUrlObj) {
    console.log("💳 Capital One Sorter: autoLoadMoreOffers started");
    
    // Try to inject code into page context to create trusted events
    try {
        const script = document.createElement('script');
        script.textContent = `
            (async function() {
                console.log("💳 Capital One Sorter: Injected page-context script running");
                const maxClicks = 10;
                const delayMs = 2000;
                let clickCount = 0;
                
                for (let i = 0; i < maxClicks; i++) {
                    await new Promise(resolve => setTimeout(resolve, delayMs));
                    
                    const button = document.querySelector('button.text-base.justify-center.w-full.font-semibold.cursor-pointer');
                    if (button && button.offsetParent !== null) {
                        console.log('💳 Capital One Sorter: Auto-click ' + (i + 1) + '/' + maxClicks);
                        button.click();
                        clickCount++;
                    } else {
                        console.log('💳 Capital One Sorter: Button not found, stopping');
                        break;
                    }
                }
                
                console.log('💳 Capital One Sorter: Auto-click completed (' + clickCount + ' clicks)');
            })();
        `;
        document.documentElement.appendChild(script);
        script.remove();
        
        console.log("💳 Capital One Sorter: Injected page-context auto-click script");
        
    } catch (e) {
        console.log("💳 Capital One Sorter: Error injecting page-context code:", e);
    }
    
    window._capitalOneAutoLoadInProgress = false;
}

// Also intercept XMLHttpRequest (in case they use that instead of fetch)
const originalXHROpen = XMLHttpRequest.prototype.open;
const originalXHRSend = XMLHttpRequest.prototype.send;
XMLHttpRequest.prototype.open = function(method, url, ...rest) {
    this._capitalOneUrl = url;
    this._capitalOneMethod = method;
    return originalXHROpen.apply(this, [method, url, ...rest]);
};

XMLHttpRequest.prototype.send = function(...args) {
    if (this._capitalOneUrl && typeof this._capitalOneUrl === 'string' && 
        (this._capitalOneUrl.includes('/feed/') || this._capitalOneUrl.includes('cursor')) && 
        (this._capitalOneUrl.includes('numberOfColumnsInGrid') || this._capitalOneUrl.includes('viewInstanceId') || this._capitalOneUrl.includes('contentSlug'))) {
        console.log("💳 Capital One Sorter: Intercepted XMLHttpRequest API call:", this._capitalOneMethod, this._capitalOneUrl);
        
        try {
            const fullUrl = this._capitalOneUrl.startsWith('http') ? this._capitalOneUrl : new URL(this._capitalOneUrl, window.location.origin).href;
            const urlObj = new URL(fullUrl);
            const cursor = urlObj.searchParams.get('cursor');
            
            if (cursor) {
                window._capitalOneApiInfo = {
                    url: fullUrl,
                    cursor: cursor,
                    baseUrl: fullUrl.split('?')[0],
                    params: Object.fromEntries(urlObj.searchParams)
                };
                console.log("💳 Capital One Sorter: Captured API info from XMLHttpRequest:", {
                    baseUrl: window._capitalOneApiInfo.baseUrl,
                    params: Object.keys(window._capitalOneApiInfo.params),
                    cursor: cursor.substring(0, 50) + '...'
                });
            } else {
                console.log("💳 Capital One Sorter: Found API URL but no cursor parameter");
            }
        } catch (e) {
            console.log("💳 Capital One Sorter: Error parsing XMLHttpRequest URL:", e, "URL was:", this._capitalOneUrl);
        }
    }
    
    return originalXHRSend.apply(this, args);
};

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
        
        // Look for "View More Offers" button with comprehensive selectors
        let loadMoreButton = null;
        
        // Try multiple button selectors in order of specificity
        const buttonSelectors = [
            // New button structure - exact match for the new HTML
            'button.text-base.justify-center.w-full.font-semibold.cursor-pointer',
            'button.text-base.justify-center.w-full.font-semibold',
            // Partial class matches (more flexible)
            'button[class*="text-base"][class*="justify-center"][class*="w-full"][class*="font-semibold"]',
            // Generic selectors
            'button[data-testid*="load-more"]',
            'button[data-testid*="view-more"]',
            'button[aria-label*="more offers"]',
            'button[aria-label*="load more"]',
            'button[class*="load-more"]',
            'button[class*="view-more"]'
        ];
        
        for (const selector of buttonSelectors) {
            loadMoreButton = document.querySelector(selector);
            if (loadMoreButton && !loadMoreButton.disabled && loadMoreButton.offsetParent !== null) {
                // Check if button is visible (offsetParent is null if hidden)
                break;
            }
        }
        
        // If no button found with selectors, search by text content
        if (!loadMoreButton || loadMoreButton.disabled || loadMoreButton.offsetParent === null) {
            const allButtons = document.querySelectorAll('button');
            loadMoreButton = Array.from(allButtons).find(btn => {
                const text = btn.textContent.toLowerCase().trim();
                return (text.includes('view more offers') || 
                        text.includes('view more') || 
                        text.includes('load more') ||
                        text.includes('show more') ||
                        text.includes('see more')) && 
                       !btn.disabled && 
                       btn.offsetParent !== null; // Button must be visible
            });
        }
        
        if (!loadMoreButton || loadMoreButton.disabled || loadMoreButton.offsetParent === null) {
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
    isLoadingMoreOffers = true;
    console.log("💳 Capital One Sorter: Starting to load more offers...");
    
    // Inject page-context auto-click script immediately
    console.log("💳 Capital One Sorter: Injecting page-context auto-click script...");
    
    try {
        // Set flag to indicate auto-click is in progress
        window._capitalOneAutoClickInProgress = true;
        window._capitalOneAutoClickComplete = false;
        
        const script = document.createElement('script');
        script.textContent = `
            (async function() {
                console.log("💳 Capital One Sorter: Page-context auto-click started");
                const maxClicks = 100;
                const delayMs = 500; // Fast loading - 0.5 seconds between clicks
                let clickCount = 0;
                let consecutiveNotFound = 0;
                
                function findReactHandler(element) {
                    const fiberKeys = Object.keys(element).filter(k => 
                        k.startsWith('__reactFiber') || 
                        k.startsWith('__reactInternalInstance') ||
                        k.startsWith('__reactProps')
                    );
                    
                    for (const key of fiberKeys) {
                        const fiber = element[key];
                        if (fiber) {
                            if (fiber.memoizedProps && fiber.memoizedProps.onClick) {
                                return fiber.memoizedProps.onClick;
                            }
                            if (fiber.pendingProps && fiber.pendingProps.onClick) {
                                return fiber.pendingProps.onClick;
                            }
                            if (fiber.return && fiber.return.memoizedProps && fiber.return.memoizedProps.onClick) {
                                return fiber.return.memoizedProps.onClick;
                            }
                        }
                    }
                    return null;
                }
                
                for (let i = 0; i < maxClicks; i++) {
                    await new Promise(resolve => setTimeout(resolve, delayMs));
                    
                    const button = document.querySelector('button.text-base.justify-center.w-full.font-semibold.cursor-pointer');
                    if (button && button.offsetParent !== null && !button.disabled) {
                        // Only log every 10 clicks to reduce console spam
                        if ((i + 1) % 10 === 0 || i === 0) {
                            console.log('💳 Capital One Sorter: Loading more offers... (' + (i + 1) + '/' + maxClicks + ')');
                        }
                        
                        const reactHandler = findReactHandler(button);
                        if (reactHandler) {
                            try {
                                reactHandler({ target: button, currentTarget: button });
                                clickCount++;
                                consecutiveNotFound = 0;
                                continue;
                            } catch (e) {
                                console.log('💳 Capital One Sorter: React handler call failed:', e);
                            }
                        }
                        
                        try {
                            const rect = button.getBoundingClientRect();
                            const x = rect.left + rect.width / 2;
                            const y = rect.top + rect.height / 2;
                            
                            button.dispatchEvent(new PointerEvent('pointerover', { bubbles: true, clientX: x, clientY: y }));
                            button.dispatchEvent(new PointerEvent('pointerenter', { bubbles: true, clientX: x, clientY: y }));
                            button.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, clientX: x, clientY: y }));
                            button.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true, clientX: x, clientY: y }));
                            button.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: x, clientY: y }));
                            button.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: x, clientY: y }));
                            button.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: x, clientY: y, button: 0 }));
                            button.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: x, clientY: y, button: 0 }));
                            button.focus();
                            button.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: x, clientY: y, button: 0 }));
                            button.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: x, clientY: y, button: 0 }));
                            button.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: x, clientY: y, button: 0 }));
                            button.click();
                            
                            clickCount++;
                            consecutiveNotFound = 0;
                        } catch (e) {
                            console.log('💳 Capital One Sorter: Event sequence failed:', e);
                        }
                    } else {
                        consecutiveNotFound++;
                        if (consecutiveNotFound >= 3) {
                            console.log('💳 Capital One Sorter: All offers loaded! Button disappeared after ' + clickCount + ' clicks');
                            break;
                        }
                    }
                }
                
                console.log('💳 Capital One Sorter: ✅ Finished loading offers (' + clickCount + ' successful clicks)');
                
                // Signal completion to content script via DOM event
                document.dispatchEvent(new CustomEvent('capitalOneAutoClickComplete', { 
                    detail: { clickCount: clickCount } 
                }));
            })();
        `;
        document.documentElement.appendChild(script);
        script.remove();
        
        console.log("💳 Capital One Sorter: Page-context auto-click script injected and running");
        
        // Wait for completion event from page context
        console.log("💳 Capital One Sorter: Waiting for auto-click to complete...");
        
        await new Promise((resolve) => {
            const maxWaitTime = 120000; // 2 minutes max
            const timeoutId = setTimeout(() => {
                console.log("💳 Capital One Sorter: Auto-click timeout reached");
                document.removeEventListener('capitalOneAutoClickComplete', completionHandler);
                resolve();
            }, maxWaitTime);
            
            const completionHandler = (event) => {
                clearTimeout(timeoutId);
                console.log("💳 Capital One Sorter: Auto-click completed! Starting sort immediately...");
                document.removeEventListener('capitalOneAutoClickComplete', completionHandler);
                resolve();
            };
            
            document.addEventListener('capitalOneAutoClickComplete', completionHandler);
        });
        
    } catch (e) {
        console.log("💳 Capital One Sorter: Error injecting page-context script:", e);
    }
    
    // Finish up and sort
    console.log("💳 Capital One Sorter: Starting sort...");
    
    observer.disconnect();
    updateOriginalWrappers(container);
    if (isSortingEnabled) {
        sortOffers(container);
        console.log("💳 Capital One Sorter: ✅ Sort complete! All offers sorted by rewards.");
    } else {
        revertOffers();
        fadeWaitMessage();
        console.log("💳 Capital One Sorter: ✅ Complete! Sorting was disabled.");
    }
    isSortingInProgress = false;
    isLoadingMoreOffers = false;
}

// Old manual approach (backup)
async function loadMoreOffersManual(container, observer) {
    isLoadingMoreOffers = true;
    console.log("💳 Capital One Sorter: Starting manual load approach...");
    
    let loadMoreAttempts = 0;
    const maxLoadMoreAttempts = 50;
    let consecutiveNotFound = 0;
    const maxConsecutiveNotFound = 5

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
        // Look for "View More Offers" button with multiple comprehensive selectors
        let loadMoreButton = null;
        
        // Try multiple button selectors in order of specificity
        const buttonSelectors = [
            // New button structure - exact match for the new HTML
            'button.text-base.justify-center.w-full.font-semibold.cursor-pointer',
            'button.text-base.justify-center.w-full.font-semibold',
            // Partial class matches (more flexible)
            'button[class*="text-base"][class*="justify-center"][class*="w-full"][class*="font-semibold"]',
            // Generic selectors
            'button[data-testid*="load-more"]',
            'button[data-testid*="view-more"]',
            'button[aria-label*="more offers"]',
            'button[aria-label*="load more"]',
            'button[class*="load-more"]',
            'button[class*="view-more"]'
        ];
        
        for (const selector of buttonSelectors) {
            loadMoreButton = document.querySelector(selector);
            if (loadMoreButton && !loadMoreButton.disabled && loadMoreButton.offsetParent !== null) {
                // Check if button is visible (offsetParent is null if hidden)
                console.log("💳 Capital One Sorter: Found button with selector:", selector);
                break;
            }
        }
        
        // If no button found with selectors, search by text content
        if (!loadMoreButton || loadMoreButton.disabled || loadMoreButton.offsetParent === null) {
            const allButtons = document.querySelectorAll('button');
            loadMoreButton = Array.from(allButtons).find(btn => {
                const text = btn.textContent.toLowerCase().trim();
                return (text.includes('view more offers') || 
                        text.includes('view more') || 
                        text.includes('load more') ||
                        text.includes('show more') ||
                        text.includes('see more')) && 
                       !btn.disabled && 
                       btn.offsetParent !== null; // Button must be visible
            });
        }
        
        if (loadMoreButton && !loadMoreButton.disabled && loadMoreButton.offsetParent !== null) {
            console.log("💳 Capital One Sorter: Found load more button:", loadMoreButton.textContent.trim(), "- clicking to load more offers (attempt", loadMoreAttempts + 1, ")");
            
            // Debug: Inspect the button to understand what's happening
            console.log("💳 Capital One Sorter: Button debug info:", {
                hasOnclick: !!loadMoreButton.onclick,
                onclickType: typeof loadMoreButton.onclick,
                onclickValue: loadMoreButton.onclick ? loadMoreButton.onclick.toString().substring(0, 200) : null,
                hasEventListeners: typeof getEventListeners === 'function' ? getEventListeners(loadMoreButton) : 'N/A (getEventListeners not available)',
                allKeys: Object.keys(loadMoreButton).filter(k => k.startsWith('__react') || k.startsWith('on')),
                parentKeys: loadMoreButton.parentElement ? Object.keys(loadMoreButton.parentElement).filter(k => k.startsWith('__react') || k.startsWith('on')) : [],
                attributes: Array.from(loadMoreButton.attributes).map(a => `${a.name}="${a.value.substring(0, 50)}"`).join(', ')
            });
            
            // Set up manual click capture - this will help us see what React does
            if (loadMoreAttempts === 1) {
                // Only set up once on first attempt
                const manualClickCapture = (e) => {
                    if (e.target === loadMoreButton || loadMoreButton.contains(e.target)) {
                        const allProps = Object.keys(e);
                        console.log("💳 Capital One Sorter: MANUAL CLICK CAPTURED!");
                        console.log("💳 Capital One Sorter: Full event object:", e);
                        console.log("💳 Capital One Sorter: All event properties:", allProps);
                        console.log("💳 Capital One Sorter: React-related properties:", allProps.filter(k => k.includes('react') || k.includes('React') || k.startsWith('_')));
                        console.log("💳 Capital One Sorter: Event details:", {
                            target: e.target,
                            currentTarget: e.currentTarget,
                            isTrusted: e.isTrusted,
                            type: e.type,
                            bubbles: e.bubbles,
                            cancelable: e.cancelable,
                            defaultPrevented: e.defaultPrevented,
                            timeStamp: e.timeStamp
                        });
                        
                        // Try to access React properties that might exist
                        const reactProps = ['_reactName', '_targetInst', '_dispatchListeners', '_dispatchInstances', 
                                           'nativeEvent', '_reactInternalFiber', '_reactInternalInstance'];
                        reactProps.forEach(prop => {
                            if (e[prop] !== undefined) {
                                console.log(`💳 Capital One Sorter: Found React property ${prop}:`, e[prop]);
                            }
                        });
                        
                        // Try to find React Fiber from the event target
                        const reactKey = Object.keys(e.target).find(k => k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance'));
                        if (reactKey) {
                            console.log("💳 Capital One Sorter: Found React key from manual click:", reactKey, e.target[reactKey]);
                            
                            // Try to traverse the Fiber tree to find the handler
                            let fiber = e.target[reactKey];
                            let depth = 0;
                            while (fiber && depth < 20) {
                                if (fiber.memoizedProps && fiber.memoizedProps.onClick) {
                                    console.log("💳 Capital One Sorter: Found onClick handler in Fiber at depth", depth, fiber.memoizedProps.onClick);
                                    // Store the handler for later use
                                    window._capitalOneClickHandler = fiber.memoizedProps.onClick;
                                    window._capitalOneClickFiber = fiber;
                                }
                                fiber = fiber.return || fiber._owner;
                                depth++;
                            }
                        } else {
                            // If we didn't find it immediately, check after a delay
                            if (window._checkReactAfterClick) {
                                window._checkReactAfterClick();
                            }
                        }
                        
                        // Try to find the handler function that React will call
                        if (e._dispatchListeners && e._dispatchListeners.length > 0) {
                            console.log("💳 Capital One Sorter: Found dispatch listeners:", e._dispatchListeners);
                            window._capitalOneDispatchListeners = e._dispatchListeners;
                        }
                        
                        if (e._dispatchInstances && e._dispatchInstances.length > 0) {
                            console.log("💳 Capital One Sorter: Found dispatch instances:", e._dispatchInstances);
                            window._capitalOneDispatchInstances = e._dispatchInstances;
                        }
                        
                        // Also try to find React Fiber by checking all parent elements
                        let parent = e.target.parentElement;
                        let parentDepth = 0;
                        while (parent && parentDepth < 10) {
                            const parentReactKey = Object.keys(parent).find(k => k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance'));
                            if (parentReactKey) {
                                console.log("💳 Capital One Sorter: Found React on parent at depth", parentDepth, parentReactKey);
                                let parentFiber = parent[parentReactKey];
                                let fiberDepth = 0;
                                while (parentFiber && fiberDepth < 20) {
                                    if (parentFiber.memoizedProps && parentFiber.memoizedProps.onClick) {
                                        console.log("💳 Capital One Sorter: Found onClick on parent Fiber at depth", fiberDepth);
                                        window._capitalOneClickHandler = parentFiber.memoizedProps.onClick;
                                        window._capitalOneClickFiber = parentFiber;
                                    }
                                    parentFiber = parentFiber.return || parentFiber._owner;
                                    fiberDepth++;
                                }
                                break;
                            }
                            parent = parent.parentElement;
                            parentDepth++;
                        }
                    }
                };
                
                // Listen at capture phase to catch before React
                document.addEventListener('click', manualClickCapture, true);
                document.addEventListener('mousedown', manualClickCapture, true);
                
                // Also listen at bubble phase
                loadMoreButton.addEventListener('click', (e) => {
                    console.log("💳 Capital One Sorter: Manual click on button (bubble phase):", {
                        isTrusted: e.isTrusted,
                        defaultPrevented: e.defaultPrevented,
                        allKeys: Object.keys(e)
                    });
                }, false);
                
                // Try to intercept React's event processing by watching for React's event listener
                // React attaches listeners to document, so let's check after a manual click
                const checkReactAfterClick = () => {
                    // Wait a bit for React to process
                    setTimeout(() => {
                        // Try to find React Fiber now that it might be attached
                        const reactKey = Object.keys(loadMoreButton).find(k => k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance'));
                        if (reactKey) {
                            console.log("💳 Capital One Sorter: Found React key after manual click:", reactKey);
                            let fiber = loadMoreButton[reactKey];
                            let depth = 0;
                            while (fiber && depth < 20) {
                                if (fiber.memoizedProps && fiber.memoizedProps.onClick) {
                                    console.log("💳 Capital One Sorter: Found onClick handler after manual click at depth", depth);
                                    window._capitalOneClickHandler = fiber.memoizedProps.onClick;
                                    window._capitalOneClickFiber = fiber;
                                }
                                fiber = fiber.return || fiber._owner;
                                depth++;
                            }
                        }
                    }, 100);
                };
                
                // Store the function to call after manual click
                window._checkReactAfterClick = checkReactAfterClick;
            }
            
            // Try multiple click methods for better compatibility
            let clickSuccess = false;
            
            // Method 0: Try calling the API directly (bypass React entirely)
            if (!clickSuccess) {
                try {
                    console.log("💳 Capital One Sorter: Attempting to call API directly to load more offers...");
                    
                    // Try to get cursor from intercepted fetch calls first
                    let cursor = null;
                    if (window._capitalOneApiInfo && window._capitalOneApiInfo.cursor) {
                        cursor = window._capitalOneApiInfo.cursor;
                        console.log("💳 Capital One Sorter: Using cursor from intercepted fetch call");
                    }
                    
                    // Fallback: Try to extract cursor from Performance API
                    if (!cursor) {
                        try {
                            const perfEntries = performance.getEntriesByType('resource');
                            for (let i = perfEntries.length - 1; i >= 0; i--) {
                                const entry = perfEntries[i];
                                if (entry.name && entry.name.includes('/feed/') && entry.name.includes('cursor')) {
                                    try {
                                        const urlObj = new URL(entry.name);
                                        const foundCursor = urlObj.searchParams.get('cursor');
                                        if (foundCursor) {
                                            cursor = foundCursor;
                                            console.log("💳 Capital One Sorter: Found cursor from Performance API");
                                            break;
                                        }
                                    } catch (e) {
                                        // Continue
                                    }
                                }
                            }
                        } catch (e) {
                            console.log("💳 Capital One Sorter: Performance API check failed:", e);
                        }
                    }
                    
                    // If we have a cursor, make the API call
                    if (cursor) {
                        console.log("💳 Capital One Sorter: Found cursor, making API call...");
                        
                        // Decode the cursor to update it
                        try {
                            const decoded = JSON.parse(atob(cursor));
                            console.log("💳 Capital One Sorter: Decoded cursor:", decoded);
                            
                            // Update the cursor (increment gridRow or update tilesShown)
                            decoded.tilesShown = (decoded.tilesShown || 0) + 20;
                            decoded.gridRow = (decoded.gridRow || 0) + 1;
                            
                            const newCursor = btoa(JSON.stringify(decoded));
                            
                            // Make the API call using captured API info
                            let apiUrl;
                            if (window._capitalOneApiInfo && window._capitalOneApiInfo.baseUrl) {
                                const params = new URLSearchParams(window._capitalOneApiInfo.params);
                                params.set('cursor', newCursor);
                                apiUrl = window._capitalOneApiInfo.baseUrl + '?' + params.toString();
                                console.log("💳 Capital One Sorter: Using captured API URL pattern");
                            } else {
                                // Fallback: construct from current URL pattern
                                // Pattern: /feed/{hash}?numberOfColumnsInGrid=5&viewInstanceId={id}&contentSlug={slug}&cursor={cursor}
                                const urlParams = new URLSearchParams(window.location.search);
                                const viewInstanceId = urlParams.get('viewInstanceId') || '07366aa0-ee02-4e2f-bb9d-4a7e2592c395';
                                const numberOfColumns = urlParams.get('numberOfColumnsInGrid') || '5';
                                const contentSlug = urlParams.get('contentSlug') || 'ease-web-l1';
                                
                                // The hash appears to be URL encoded: 0TrcMwIchicBXdq7Oc6YvyeE%2FGaZ7h20enHvHkE1KfU%3D
                                const hash = '0TrcMwIchicBXdq7Oc6YvyeE/GaZ7h20enHvHkE1KfU=';
                                const encodedHash = encodeURIComponent(hash);
                                // Make sure it's an absolute URL
                                apiUrl = `${window.location.origin}/feed/${encodedHash}?numberOfColumnsInGrid=${numberOfColumns}&viewInstanceId=${viewInstanceId}&contentSlug=${contentSlug}&cursor=${encodeURIComponent(newCursor)}`;
                                console.log("💳 Capital One Sorter: Constructed API URL from current page");
                            }
                            
                            console.log("💳 Capital One Sorter: Making API call to:", apiUrl.substring(0, 150) + '...');
                            
                            fetch(apiUrl, {
                                method: 'GET',
                                credentials: 'include',
                                headers: {
                                    'Accept': '*/*',
                                    'Accept-Language': 'en-US,en;q=0.9',
                                    'Sec-Fetch-Dest': 'empty',
                                    'Sec-Fetch-Mode': 'cors',
                                    'Sec-Fetch-Site': 'same-origin',
                                }
                            }).then(response => {
                                if (response.ok) {
                                    console.log("💳 Capital One Sorter: API call successful!");
                                    clickSuccess = true;
                                    return response.json().then(data => {
                                        console.log("💳 Capital One Sorter: API response received, data length:", JSON.stringify(data).length);
                                        console.log("💳 Capital One Sorter: Response keys:", Object.keys(data));
                                        console.log("💳 Capital One Sorter: Response preview:", JSON.stringify(data).substring(0, 500));
                                        
                                        // Store the response for potential manual processing
                                        window._capitalOneLastApiResponse = data;
                                        
                                        // Try to trigger React to process the response
                                        try {
                                            // Dispatch a storage event
                                            window.dispatchEvent(new StorageEvent('storage', {
                                                key: 'capitalone-offers-update',
                                                newValue: JSON.stringify({ timestamp: Date.now() })
                                            }));
                                            
                                            // Trigger a mutation on the container
                                            const container = document.querySelector('[data-testid="feed-grid"]') || 
                                                             document.querySelector('[class*="grid"]') ||
                                                             document.querySelector('main');
                                            if (container) {
                                                const tempDiv = document.createElement('div');
                                                tempDiv.style.display = 'none';
                                                container.appendChild(tempDiv);
                                                setTimeout(() => {
                                                    container.removeChild(tempDiv);
                                                }, 100);
                                            }
                                            
                                            // Wait and check if offers updated
                                            setTimeout(() => {
                                                const beforeCount = document.querySelectorAll('div[role="button"][data-testid^="feed-tile-"]').length;
                                                console.log("💳 Capital One Sorter: Offer count before API call:", beforeCount);
                                                
                                                setTimeout(() => {
                                                    const afterCount = document.querySelectorAll('div[role="button"][data-testid^="feed-tile-"]').length;
                                                    console.log("💳 Capital One Sorter: Offer count after API call:", afterCount);
                                                    
                                                    if (afterCount > beforeCount) {
                                                        console.log("💳 Capital One Sorter: Offers updated successfully! (+" + (afterCount - beforeCount) + " offers)");
                                                    } else if (afterCount === beforeCount && data.data && data.data.length > 0) {
                                                        console.log("💳 Capital One Sorter: API returned", data.data.length, "offers but React didn't process them");
                                                        console.log("💳 Capital One Sorter: Attempting to trigger button click after API response...");
                                                        setTimeout(() => {
                                                            if (loadMoreButton && loadMoreButton.offsetParent !== null) {
                                                                loadMoreButton.click();
                                                            }
                                                        }, 200);
                                                    }
                                                }, 1500);
                                            }, 500);
                                        } catch (e) {
                                            console.log("💳 Capital One Sorter: Error triggering update:", e);
                                        }
                                        
                                        return data;
                                    });
                                } else {
                                    console.log("💳 Capital One Sorter: API call failed:", response.status, response.statusText);
                                    return response.text().then(text => {
                                        console.log("💳 Capital One Sorter: Error response:", text.substring(0, 200));
                                    });
                                }
                            }).catch(error => {
                                console.log("💳 Capital One Sorter: API call error:", error);
                            });
                        } catch (e) {
                            console.log("💳 Capital One Sorter: Error processing cursor:", e);
                        }
                    } else {
                        console.log("💳 Capital One Sorter: No cursor found, will wait for manual click to capture it");
                        
                        // Try to extract cursor from localStorage or URL hash as fallback
                        try {
                            if (window.location.hash) {
                                const hashParams = new URLSearchParams(window.location.hash.substring(1));
                                const hashCursor = hashParams.get('cursor');
                                if (hashCursor) {
                                    cursor = hashCursor;
                                    console.log("💳 Capital One Sorter: Found cursor in URL hash");
                                }
                            }
                            
                            if (!cursor) {
                                for (let i = 0; i < localStorage.length; i++) {
                                    const key = localStorage.key(i);
                                    const value = localStorage.getItem(key);
                                    if (value && value.includes('cursor') && value.includes('gridRow')) {
                                        try {
                                            const parsed = JSON.parse(value);
                                            if (parsed.cursor) {
                                                cursor = parsed.cursor;
                                                console.log("💳 Capital One Sorter: Found cursor in localStorage");
                                                break;
                                            }
                                        } catch (e) {
                                            const cursorMatch = value.match(/"cursor"\s*:\s*"([^"]+)"/);
                                            if (cursorMatch) {
                                                cursor = cursorMatch[1];
                                                console.log("💳 Capital One Sorter: Extracted cursor from localStorage");
                                                break;
                                            }
                                        }
                                    }
                                }
                            }
                            
                            // If found, make API call
                            if (cursor) {
                                try {
                                    const decoded = JSON.parse(atob(cursor));
                                    decoded.tilesShown = (decoded.tilesShown || 0) + 20;
                                    decoded.gridRow = (decoded.gridRow || 0) + 1;
                                    const newCursor = btoa(JSON.stringify(decoded));
                                    
                                    const urlParams = new URLSearchParams(window.location.search);
                                    const viewInstanceId = urlParams.get('viewInstanceId') || '07366aa0-ee02-4e2f-bb9d-4a7e2592c395';
                                    const numberOfColumns = urlParams.get('numberOfColumnsInGrid') || '5';
                                    const contentSlug = urlParams.get('contentSlug') || 'ease-web-l1';
                                    const hash = '0TrcMwIchicBXdq7Oc6YvyeE/GaZ7h20enHvHkE1KfU=';
                                    const encodedHash = encodeURIComponent(hash);
                                    // Make sure it's an absolute URL
                                    const apiUrl = `${window.location.origin}/feed/${encodedHash}?numberOfColumnsInGrid=${numberOfColumns}&viewInstanceId=${viewInstanceId}&contentSlug=${contentSlug}&cursor=${encodeURIComponent(newCursor)}`;
                                    
                                    fetch(apiUrl, {
                                        method: 'GET',
                                        credentials: 'include',
                                        headers: { 'Accept': '*/*' }
                                    }).then(response => {
                                        if (response.ok) {
                                            console.log("💳 Capital One Sorter: API call successful!");
                                            clickSuccess = true;
                                            return response.json();
                                        }
                                    }).catch(error => {
                                        console.log("💳 Capital One Sorter: API call error:", error);
                                    });
                                } catch (e) {
                                    console.log("💳 Capital One Sorter: Error processing cursor:", e);
                                }
                            }
                        } catch (e) {
                            console.log("💳 Capital One Sorter: Error searching for cursor:", e);
                        }
                    }
                } catch (e) {
                    console.log("💳 Capital One Sorter: Direct API call failed:", e);
                }
            }
            
            // Method 0.1: Try using the handler we captured from manual click
            if (!clickSuccess && window._capitalOneClickHandler) {
                try {
                    console.log("💳 Capital One Sorter: Using captured click handler from manual click");
                    const syntheticEvent = {
                        nativeEvent: new MouseEvent('click', { bubbles: true, cancelable: true }),
                        currentTarget: loadMoreButton,
                        target: loadMoreButton,
                        preventDefault: () => {},
                        stopPropagation: () => {},
                        isDefaultPrevented: () => false,
                        isPropagationStopped: () => false
                    };
                    window._capitalOneClickHandler(syntheticEvent);
                    clickSuccess = true;
                    console.log("💳 Capital One Sorter: Captured handler executed");
                } catch (e) {
                    console.log("💳 Capital One Sorter: Captured handler failed:", e);
                }
            }
            
            // Method 0.25: Try to find and call the handler by searching the DOM tree more thoroughly
            if (!clickSuccess) {
                try {
                    console.log("💳 Capital One Sorter: Searching for React handler in DOM tree...");
                    
                    // Check all parent elements and siblings for React Fiber
                    let element = loadMoreButton;
                    let depth = 0;
                    let foundAnyReactKeys = false;
                    
                    while (element && depth < 15) {
                        // Check all possible React Fiber property names - try both Object.keys and Object.getOwnPropertyNames
                        const allKeys = [...Object.keys(element), ...Object.getOwnPropertyNames(element)];
                        const reactKeys = allKeys.filter(k => 
                            k.startsWith('__reactFiber') || 
                            k.startsWith('__reactInternalInstance') ||
                            k.startsWith('__reactContainer') ||
                            (k.includes('react') && !k.startsWith('__'))
                        );
                        
                        if (reactKeys.length > 0) {
                            foundAnyReactKeys = true;
                            console.log("💳 Capital One Sorter: Found React keys on element:", element.tagName, reactKeys);
                            
                            for (const reactKey of reactKeys) {
                                try {
                                    let fiber = element[reactKey];
                                    let fiberDepth = 0;
                                    
                                    // Traverse fiber tree looking for onClick
                                    while (fiber && fiberDepth < 25) {
                                        // Check multiple possible locations for onClick
                                        if (fiber.memoizedProps?.onClick) {
                                            console.log("💳 Capital One Sorter: Found onClick in memoizedProps!");
                                            try {
                                                fiber.memoizedProps.onClick({
                                                    nativeEvent: new MouseEvent('click'),
                                                    currentTarget: loadMoreButton,
                                                    target: loadMoreButton
                                                });
                                                clickSuccess = true;
                                                console.log("💳 Capital One Sorter: onClick handler called successfully!");
                                                break;
                                            } catch (e) {
                                                console.log("💳 Capital One Sorter: onClick call failed:", e);
                                            }
                                        }
                                        
                                        if (fiber.pendingProps?.onClick) {
                                            console.log("💳 Capital One Sorter: Found onClick in pendingProps!");
                                            try {
                                                fiber.pendingProps.onClick({
                                                    nativeEvent: new MouseEvent('click'),
                                                    currentTarget: loadMoreButton,
                                                    target: loadMoreButton
                                                });
                                                clickSuccess = true;
                                                console.log("💳 Capital One Sorter: onClick handler called successfully!");
                                                break;
                                            } catch (e) {
                                                console.log("💳 Capital One Sorter: onClick call failed:", e);
                                            }
                                        }
                                        
                                        // Check child fibers
                                        if (fiber.child) {
                                            fiber = fiber.child;
                                        } else if (fiber.sibling) {
                                            fiber = fiber.sibling;
                                        } else {
                                            fiber = fiber.return;
                                        }
                                        fiberDepth++;
                                    }
                                    
                                    if (clickSuccess) break;
                                } catch (e) {
                                    console.log("💳 Capital One Sorter: Error accessing React key:", reactKey, e);
                                }
                            }
                            
                            if (clickSuccess) break;
                        }
                        
                        element = element.parentElement;
                        depth++;
                    }
                    
                    if (!foundAnyReactKeys) {
                        console.log("💳 Capital One Sorter: No React keys found on button or any parent elements");
                    }
                } catch (e) {
                    console.log("💳 Capital One Sorter: DOM tree search failed:", e);
                }
            }
            
            // Method 0.5: Try to intercept and bypass React's isTrusted check
            if (!clickSuccess) {
                try {
                    // Try to create an event that appears more trusted by using Object.defineProperty
                    // This might work in some browsers
                    const clickEvent = new MouseEvent('click', {
                        bubbles: true,
                        cancelable: true,
                        view: window,
                        composed: true,
                        detail: 1
                    });
                    
                    // Try to override isTrusted (this usually doesn't work, but worth trying)
                    try {
                        Object.defineProperty(clickEvent, 'isTrusted', {
                            value: true,
                            writable: false,
                            configurable: false
                        });
                        console.log("💳 Capital One Sorter: Attempted to set isTrusted to true");
                    } catch (e) {
                        // Can't set isTrusted - that's expected
                    }
                    
                    // Dispatch from button and let it bubble
            loadMoreButton.dispatchEvent(clickEvent);
                    clickSuccess = true;
                    console.log("💳 Capital One Sorter: Dispatched event with isTrusted override attempt");
                } catch (e) {
                    console.log("💳 Capital One Sorter: isTrusted override failed:", e);
                }
            }
            
            // Method 0.6: Try to access React's event system by finding and calling its document listener
            if (!clickSuccess) {
                try {
                    // React uses event delegation - find its listener on document
                    // We need to access the actual event listener function
                    // Try multiple approaches to find React's handler
                    
                    // Approach 1: Use getEventListeners if available (Chrome DevTools)
                    if (typeof getEventListeners === 'function') {
                        const docListeners = getEventListeners(document);
                        if (docListeners && docListeners.click) {
                            console.log("💳 Capital One Sorter: Found document click listeners:", docListeners.click.length);
                            // React's listener is usually the first one or has specific characteristics
                            for (let i = 0; i < docListeners.click.length; i++) {
                                const listener = docListeners.click[i];
                                const listenerStr = listener.listener.toString();
                                // React's listener often contains specific patterns
                                if (listenerStr.includes('react') || listenerStr.includes('React') || 
                                    listenerStr.includes('dispatchEvent') || listenerStr.length > 1000) {
                                    console.log("💳 Capital One Sorter: Found potential React listener, trying to trigger...");
                                    const clickEvent = new MouseEvent('click', {
                                        bubbles: true,
                                        cancelable: true,
                                        view: window,
                                        target: loadMoreButton,
                                        currentTarget: document
                                    });
                                    try {
                                        listener.listener.call(document, clickEvent);
                                        clickSuccess = true;
                                        console.log("💳 Capital One Sorter: React listener executed via getEventListeners");
                                        break;
                                    } catch (e) {
                                        console.log("💳 Capital One Sorter: Listener call failed:", e);
                                    }
                                }
                            }
                        }
                    }
                    
                    // Approach 2: Dispatch event from button and let it bubble to document (React's way)
                    if (!clickSuccess) {
                        // Create event at button level and let it bubble naturally
                        const clickEvent = new MouseEvent('click', {
                            bubbles: true,
                            cancelable: true,
                            view: window,
                            composed: true,
                            detail: 1,
                            button: 0,
                            buttons: 0
                        });
                        
                        // Dispatch from button - it will bubble to document where React listens
                        loadMoreButton.dispatchEvent(clickEvent);
                        clickSuccess = true;
                        console.log("💳 Capital One Sorter: Dispatched click event from button (bubbling to document)");
                    }
                    
                    // Approach 3: Also try native click() which should trigger all handlers
                    if (!clickSuccess) {
                        try {
                            loadMoreButton.click();
                            clickSuccess = true;
                            console.log("💳 Capital One Sorter: Used native .click() method");
                        } catch (e) {
                            console.log("💳 Capital One Sorter: Native .click() failed:", e);
                        }
                    }
                } catch (e) {
                    console.log("💳 Capital One Sorter: React event system access failed:", e);
                }
            }
            
            // Method 1: Try React's event system - check button and all parents
            try {
                // Check button and all parent elements for React Fiber
                let elementToCheck = loadMoreButton;
                let foundReactFiber = false;
                
                while (elementToCheck && !foundReactFiber) {
                    const reactKey = Object.keys(elementToCheck).find(key => key.startsWith('__reactFiber') || key.startsWith('__reactInternalInstance'));
                    if (reactKey) {
                        const fiber = elementToCheck[reactKey];
                        console.log("💳 Capital One Sorter: Found React Fiber key:", reactKey, "on element:", elementToCheck.tagName);
                        foundReactFiber = true;
                        
                        // Traverse React Fiber tree to find onClick handler
                        let currentFiber = fiber;
                        let depth = 0;
                        const maxDepth = 15; // Increased depth
                        
                        while (currentFiber && depth < maxDepth && !clickSuccess) {
                            // Try memoizedProps
                            if (currentFiber.memoizedProps && currentFiber.memoizedProps.onClick) {
                                const handler = currentFiber.memoizedProps.onClick;
                                console.log("💳 Capital One Sorter: Found onClick in memoizedProps at depth", depth);
                                try {
                                    handler({ nativeEvent: {}, currentTarget: loadMoreButton, target: loadMoreButton });
                                    clickSuccess = true;
                                    console.log("💳 Capital One Sorter: React memoizedProps.onClick executed");
                                } catch (e) {
                                    console.log("💳 Capital One Sorter: Error calling memoizedProps.onClick:", e);
                                }
                            }
                            
                            // Try pendingProps
                            if (!clickSuccess && currentFiber.pendingProps && currentFiber.pendingProps.onClick) {
                                const handler = currentFiber.pendingProps.onClick;
                                console.log("💳 Capital One Sorter: Found onClick in pendingProps at depth", depth);
                                try {
                                    handler({ nativeEvent: {}, currentTarget: loadMoreButton, target: loadMoreButton });
                                    clickSuccess = true;
                                    console.log("💳 Capital One Sorter: React pendingProps.onClick executed");
                                } catch (e) {
                                    console.log("💳 Capital One Sorter: Error calling pendingProps.onClick:", e);
                                }
                            }
                            
                            // Try stateNode
                            if (!clickSuccess && currentFiber.stateNode) {
                                if (typeof currentFiber.stateNode.onClick === 'function') {
                                    const handler = currentFiber.stateNode.onClick;
                                    console.log("💳 Capital One Sorter: Found onClick in stateNode at depth", depth);
                                    try {
                                        handler();
                                        clickSuccess = true;
                                        console.log("💳 Capital One Sorter: React stateNode.onClick executed");
                                    } catch (e) {
                                        console.log("💳 Capital One Sorter: Error calling stateNode.onClick:", e);
                                    }
                                }
                                // Also check props on stateNode
                                if (!clickSuccess && currentFiber.stateNode.props && currentFiber.stateNode.props.onClick) {
                                    const handler = currentFiber.stateNode.props.onClick;
                                    console.log("💳 Capital One Sorter: Found onClick in stateNode.props at depth", depth);
                                    try {
                                        handler({ nativeEvent: {}, currentTarget: loadMoreButton, target: loadMoreButton });
                                        clickSuccess = true;
                                        console.log("💳 Capital One Sorter: React stateNode.props.onClick executed");
                                    } catch (e) {
                                        console.log("💳 Capital One Sorter: Error calling stateNode.props.onClick:", e);
                                    }
                                }
                            }
                            
                            // Move up the tree
                            if (!clickSuccess) {
                                currentFiber = currentFiber.return || currentFiber._owner || currentFiber.owner;
                                depth++;
                            }
                        }
                    }
                    elementToCheck = elementToCheck.parentElement;
                }
                
                if (!foundReactFiber) {
                    console.log("💳 Capital One Sorter: No React Fiber key found on button or parents");
                }
            } catch (e) {
                console.log("💳 Capital One Sorter: React event failed:", e, e.stack);
            }
            
            // Method 2: Try direct onclick handler if it exists
            if (!clickSuccess && loadMoreButton.onclick) {
                try {
                    console.log("💳 Capital One Sorter: Attempting to call onclick handler...");
                    const result = loadMoreButton.onclick();
                    clickSuccess = true;
                    console.log("💳 Capital One Sorter: Direct onclick() executed, result:", result);
                } catch (e) {
                    console.log("💳 Capital One Sorter: Direct onclick() failed:", e, e.stack);
                }
            }
            
            // Debug: Monitor if events are reaching document level (where React listens)
            if (loadMoreAttempts <= 3) {
                // Only add debug listeners for first few attempts to avoid spam
                const docDebugListener = (e) => {
                    if (e.target === loadMoreButton || loadMoreButton.contains(e.target)) {
                        console.log("💳 Capital One Sorter: DEBUG - Click event reached document level!", {
                            type: e.type,
                            isTrusted: e.isTrusted,
                            target: e.target.tagName,
                            bubbles: e.bubbles,
                            defaultPrevented: e.defaultPrevented
                        });
                    }
                };
                
                // Listen at capture phase (before React processes it)
                document.addEventListener('click', docDebugListener, true);
                
                // Remove after a delay
                setTimeout(() => {
                    document.removeEventListener('click', docDebugListener, true);
                }, 2000);
            }
            
            // Method 3: Create a full user interaction sequence (mousedown -> mouseup -> click)
            if (!clickSuccess) {
                try {
                    const rect = loadMoreButton.getBoundingClientRect();
                    const x = rect.left + rect.width / 2;
                    const y = rect.top + rect.height / 2;
                    
                    // Create a full sequence of events like a real user would generate
                    const mouseDown = new MouseEvent('mousedown', {
                        view: window,
                        bubbles: true,
                        cancelable: true,
                        buttons: 1,
                        button: 0,
                        clientX: x,
                        clientY: y,
                        screenX: window.screenX + x,
                        screenY: window.screenY + y
                    });
                    
                    const mouseUp = new MouseEvent('mouseup', {
                        view: window,
                        bubbles: true,
                        cancelable: true,
                        buttons: 0,
                        button: 0,
                        clientX: x,
                        clientY: y,
                        screenX: window.screenX + x,
                        screenY: window.screenY + y
                    });
                    
                    const clickEvent = new MouseEvent('click', {
                        view: window,
                        bubbles: true,
                        cancelable: true,
                        buttons: 0,
                        button: 0,
                        detail: 1,
                        clientX: x,
                        clientY: y,
                        screenX: window.screenX + x,
                        screenY: window.screenY + y
                    });
                    
                    // Dispatch in the correct sequence
                    loadMoreButton.dispatchEvent(mouseDown);
                    setTimeout(() => {
                        loadMoreButton.dispatchEvent(mouseUp);
                        setTimeout(() => {
                            loadMoreButton.dispatchEvent(clickEvent);
                            console.log("💳 Capital One Sorter: Full interaction sequence dispatched (mousedown -> mouseup -> click)");
                        }, 10);
                    }, 10);
                    
                    clickSuccess = true;
                } catch (e) {
                    console.log("💳 Capital One Sorter: Full interaction sequence failed:", e);
                }
            }
            
            // Method 4: Direct click (fallback)
            if (!clickSuccess) {
                try {
                    loadMoreButton.click();
                    clickSuccess = true;
                    console.log("💳 Capital One Sorter: Direct click() executed");
                } catch (e) {
                    console.log("💳 Capital One Sorter: Direct click() failed:", e);
                }
            }
            
            // Method 5: PointerEvent (works better with touch-manipulation)
            if (!clickSuccess) {
                try {
                    const pointerDown = new PointerEvent('pointerdown', { 
                        bubbles: true, 
                        cancelable: true,
                        view: window,
                        pointerId: 1,
                        pointerType: 'mouse',
                        isPrimary: true
                    });
                    const pointerUp = new PointerEvent('pointerup', { 
                        bubbles: true, 
                        cancelable: true,
                        view: window,
                        pointerId: 1,
                        pointerType: 'mouse',
                        isPrimary: true
                    });
                    const clickEvent = new PointerEvent('click', { 
                        bubbles: true, 
                        cancelable: true,
                        view: window,
                        pointerId: 1,
                        pointerType: 'mouse',
                        isPrimary: true
                    });
                    loadMoreButton.dispatchEvent(pointerDown);
                    loadMoreButton.dispatchEvent(pointerUp);
                    loadMoreButton.dispatchEvent(clickEvent);
                    clickSuccess = true;
                    console.log("💳 Capital One Sorter: PointerEvent sequence executed");
                } catch (e) {
                    console.log("💳 Capital One Sorter: PointerEvent sequence failed:", e);
                }
            }
            
            // Method 6: MouseEvent with mousedown and mouseup
            if (!clickSuccess) {
                try {
                    const mouseDown = new MouseEvent('mousedown', { 
                        bubbles: true, 
                        cancelable: true,
                        view: window,
                        buttons: 1
                    });
                    const mouseUp = new MouseEvent('mouseup', { 
                        bubbles: true, 
                        cancelable: true,
                        view: window,
                        buttons: 1
                    });
                    const clickEvent = new MouseEvent('click', { 
                        bubbles: true, 
                        cancelable: true,
                        view: window,
                        buttons: 1
                    });
                    loadMoreButton.dispatchEvent(mouseDown);
                    loadMoreButton.dispatchEvent(mouseUp);
                    loadMoreButton.dispatchEvent(clickEvent);
                    clickSuccess = true;
                    console.log("💳 Capital One Sorter: MouseEvent sequence executed");
                } catch (e) {
                    console.log("💳 Capital One Sorter: MouseEvent sequence failed:", e);
                }
            }
            
            // Method 7: Try clicking parent if it exists and is clickable
            if (!clickSuccess) {
                const parent = loadMoreButton.parentElement;
                if (parent && (parent.onclick || parent.getAttribute('onclick'))) {
                    try {
                        parent.click();
                        console.log("💳 Capital One Sorter: Clicked parent element");
                    } catch (e) {
                        console.log("💳 Capital One Sorter: Parent click failed:", e);
                    }
                }
            }
            
            consecutiveNotFound = 0; // Reset counter since we found and clicked button
            
            // Add a small delay after clicking to allow the page to process
            setTimeout(() => {
                console.log("💳 Capital One Sorter: Click processed, continuing to look for more buttons...");
            }, 300);
        } else {
            consecutiveNotFound++;
            console.log("💳 Capital One Sorter: Load more button not found or disabled (attempt", loadMoreAttempts + 1, ", consecutive not found:", consecutiveNotFound, "of", maxConsecutiveNotFound, ")");
        }
        
        loadMoreAttempts++;
        
        // Check if we should stop
        if (loadMoreAttempts >= maxLoadMoreAttempts || consecutiveNotFound >= maxConsecutiveNotFound) {
            console.log("💳 Capital One Sorter: Stopping load more attempts. Total attempts:", loadMoreAttempts, "Consecutive not found:", consecutiveNotFound);
            clearInterval(loadInterval);
            finishOffersLoading();
        }
    }, 500); // Increased to 500ms between attempts to allow more time for loading
    
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