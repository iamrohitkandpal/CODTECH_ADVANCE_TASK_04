let tabTime = {};
let sessionStartTime = Date.now();
let history = {};
let settings = { enableTimeLimits: false };
let limits = {};
let notifications = {};
let activeTabId = null;

// Initialize data from storage
function initializeData() {
  chrome.storage.local.get(['history', 'settings', 'limits'], (data) => {
    if (data.history) history = data.history;
    if (data.settings) settings = data.settings;
    if (data.limits) limits = data.limits;
    console.log("Data loaded from storage:", {
      historyEntries: Object.keys(history).length,
      settings,
      limitsCount: Object.keys(limits).length
    });
  });
}

initializeData();

function getCurrentDate() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
}

// Extract domain from URL
function extractDomain(url) {
  try {
    if (!url || url.startsWith('chrome://') || url.startsWith('edge://') || 
        url.startsWith('about:') || url.startsWith('chrome-extension://') ||
        url.startsWith('moz-extension://')) {
      return null;
    }
    
    const urlObj = new URL(url);
    let domain = urlObj.hostname;
    
    // Remove www. prefix if present
    if (domain.startsWith('www.')) {
      domain = domain.substring(4);
    }
    
    return domain;
  } catch (e) {
    console.error("Error extracting domain:", e);
    return null;
  }
}

// Handle active tab changes
chrome.tabs.onActivated.addListener((activeInfo) => {
  const tabId = activeInfo.tabId;
  const previousTabId = activeTabId;
  activeTabId = tabId;
  
  // Update timing for previously active tab
  if (previousTabId !== null && previousTabId !== tabId) {
    updateTabTime(previousTabId);
  }
  
  // Get information about the newly activated tab
  chrome.tabs.get(tabId, (tab) => {
    if (chrome.runtime.lastError || !tab || !tab.url) {
      return;
    }
    
    const domain = extractDomain(tab.url);
    if (!domain) return;
    
    // Initialize tab tracking
    tabTime[tabId] = { 
      domain, 
      startTime: Date.now(), 
      time: tabTime[tabId] ? tabTime[tabId].time || 0 : 0,
      url: tab.url,
      title: tab.title || domain
    };
    
    // Check for time limits if enabled
    if (settings.enableTimeLimits && limits[domain]) {
      checkTimeLimits(domain);
    }
  });
});

// Update tab when URL changes
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && tab.active && tab.url) {
    const domain = extractDomain(tab.url);
    if (!domain) return;
    
    // If we already track this tab but domain changed
    if (tabTime[tabId] && tabTime[tabId].domain !== domain) {
      // Save time for previous domain
      updateTabTime(tabId);
      
      // Reset for new domain
      tabTime[tabId] = {
        domain,
        startTime: Date.now(),
        time: 0,
        url: tab.url,
        title: tab.title || domain
      };
    } else if (!tabTime[tabId]) {
      // Initialize new tab tracking
      tabTime[tabId] = { 
        domain, 
        startTime: Date.now(), 
        time: 0,
        url: tab.url,
        title: tab.title || domain
      };
    }
    
    // Check for time limits if enabled
    if (settings.enableTimeLimits && limits[domain]) {
      checkTimeLimits(domain);
    }
  }
});

// Handle tab close
chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabTime[tabId]) {
    updateTabTime(tabId);
    delete tabTime[tabId];
  }
});

// Track session data when the extension is suspended
chrome.runtime.onSuspend.addListener(() => {
  saveAllTabData();
});

// Update time for a specific tab and save it
function updateTabTime(tabId) {
  if (!tabTime[tabId] || !tabTime[tabId].startTime) return;
  
  const { domain, startTime, time } = tabTime[tabId];
  if (!domain) return;
  
  const now = Date.now();
  const elapsedTime = Math.floor((now - startTime) / 1000);
  
  // Only update if meaningful time has passed (more than 1 second)
  if (elapsedTime > 1) {
    const newTotalTime = time + elapsedTime;
    tabTime[tabId].time = newTotalTime;
    tabTime[tabId].startTime = now;
    
    // Update history
    const currentDate = getCurrentDate();
    if (!history[currentDate]) history[currentDate] = {};
    
    history[currentDate][domain] = (history[currentDate][domain] || 0) + elapsedTime;
    
    // Save to storage every time we update (can be optimized with debouncing)
    saveHistoryToStorage();
  }
}

// Save history to storage
function saveHistoryToStorage() {
  chrome.storage.local.set({ history }, () => {
    if (chrome.runtime.lastError) {
      console.error("Error saving history:", chrome.runtime.lastError);
    }
  });
}

// Save all open tab data
function saveAllTabData() {
  const now = Date.now();
  
  // Update time for all tabs
  Object.keys(tabTime).forEach(tabId => {
    updateTabTime(parseInt(tabId));
  });
  
  // Force save to storage
  saveHistoryToStorage();
}

// Check if a domain has exceeded its time limit
function checkTimeLimits(domain) {
  if (!settings.enableTimeLimits || !limits[domain]) return;
  
  const currentDate = getCurrentDate();
  if (!history[currentDate]) history[currentDate] = {};
  
  let totalTime = history[currentDate][domain] || 0;
  
  // Add time from currently open tabs with this domain
  Object.keys(tabTime).forEach(tabId => {
    if (tabTime[tabId].domain === domain) {
      const elapsedTime = Math.floor((Date.now() - tabTime[tabId].startTime) / 1000);
      totalTime += tabTime[tabId].time + elapsedTime;
    }
  });
  
  // Convert limit to seconds (it's stored in minutes)
  const limitSeconds = limits[domain] * 60;
  
  // Check if limit is exceeded and notification hasn't been shown today
  if (totalTime >= limitSeconds && !notifications[`${currentDate}-${domain}`]) {
    // Create and show notification
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'logo.png',
      title: 'Time Limit Reached',
      message: `You've reached your time limit for ${domain}.`,
      priority: 2
    });
    
    // Mark as notified
    notifications[`${currentDate}-${domain}`] = true;
  }
}

// Handle messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  try {
    switch (message.action) {
      case 'resetTimers':
        // Update all tabs first
        saveAllTabData();
        // Then reset
        tabTime = {};
        sessionStartTime = Date.now();
        sendResponse({ status: 'success', message: 'Session timers reset.' });
        break;
        
      case 'getHistory':
        // Make sure we have the latest timing data
        saveAllTabData();
        sendResponse({ status: 'success', history: history });
        break;
        
      case 'clearAllData':
        tabTime = {};
        history = {};
        chrome.storage.local.set({ history: {} }, () => {
          sendResponse({ status: 'success', message: 'All data cleared.' });
        });
        return true; // For async response
        
      case 'updateSettings':
        settings = { ...settings, ...message.settings };
        chrome.storage.local.set({ settings }, () => {
          sendResponse({ status: 'success', message: 'Settings updated.' });
        });
        return true; // For async response
        
      case 'ping':
        // Update data before responding
        saveAllTabData();
        sendResponse({ 
          status: 'success', 
          message: 'Background script is active',
          activeTabId,
          tabCount: Object.keys(tabTime).length,
          currentDate: getCurrentDate()
        });
        break;
        
      default:
        sendResponse({ status: 'error', message: 'Unknown action' });
    }
  } catch (e) {
    console.error("Error processing message:", e);
    sendResponse({ status: 'error', message: e.message });
  }
});

// Periodically save all tab data
setInterval(() => {
  saveAllTabData();
}, 30000); // Every 30 seconds

// Check active tabs on startup
chrome.tabs.query({ active: true }, tabs => {
  if (tabs && tabs.length > 0) {
    const tab = tabs[0];
    activeTabId = tab.id;
    
    const domain = extractDomain(tab.url);
    if (domain) {
      tabTime[tab.id] = { 
        domain, 
        startTime: Date.now(), 
        time: 0,
        url: tab.url,
        title: tab.title || domain
      };
    }
  }
});

console.log("Tab Time Tracker background initialized:", new Date().toLocaleString());
