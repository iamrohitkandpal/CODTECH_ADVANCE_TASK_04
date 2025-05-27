let tabTime = {};
let sessionStartTime = Date.now();
let history = {};
let settings = {
  enableTimeLimits: false
};
let limits = {};
let notifications = {};
let activeTabId = null;

// Initialize data from storage
chrome.storage.local.get(['history', 'settings', 'limits'], (data) => {
  if (data.history) history = data.history;
  if (data.settings) settings = data.settings;
  if (data.limits) limits = data.limits;
});

function getCurrentDate() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
}

// Handle active tab changes
chrome.tabs.onActivated.addListener((activeInfo) => {
  const tabId = activeInfo.tabId;
  activeTabId = tabId;
  
  // Update timing for previously active tab
  updateInactiveTabs(tabId);
  
  // Get information about the newly activated tab
  chrome.tabs.get(tabId, (tab) => {
    if (chrome.runtime.lastError || !tab || !tab.url || tab.url.startsWith('chrome://')) {
      return;
    }
    
    try {
      const url = new URL(tab.url);
      const domain = url.hostname;
      
      // Initialize tab tracking
      if (!tabTime[tabId]) {
        tabTime[tabId] = { 
          domain, 
          startTime: Date.now(), 
          time: 0,
          url: tab.url,
          title: tab.title
        };
      } else {
        // Update tab info
        tabTime[tabId].domain = domain;
        tabTime[tabId].startTime = Date.now();
        tabTime[tabId].url = tab.url;
        tabTime[tabId].title = tab.title;
      }
      
      // Check for time limits if enabled
      if (settings.enableTimeLimits && limits[domain]) {
        checkTimeLimits(domain);
      }
    } catch (error) {
      console.error("Error processing tab URL:", error);
    }
  });
});

// Update tab when URL changes
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && tab.active && tab.url && !tab.url.startsWith('chrome://')) {
    try {
      const url = new URL(tab.url);
      const domain = url.hostname;
      
      // Update tab information
      if (!tabTime[tabId]) {
        tabTime[tabId] = { 
          domain, 
          startTime: Date.now(), 
          time: 0,
          url: tab.url,
          title: tab.title
        };
      } else {
        // Only update if domain has changed
        if (tabTime[tabId].domain !== domain) {
          // Save time for previous domain
          saveTabTime(tabId);
          
          // Reset for new domain
          tabTime[tabId].domain = domain;
          tabTime[tabId].startTime = Date.now();
          tabTime[tabId].url = tab.url;
          tabTime[tabId].title = tab.title;
        }
      }
      
      // Check for time limits if enabled
      if (settings.enableTimeLimits && limits[domain]) {
        checkTimeLimits(domain);
      }
    } catch (error) {
      console.error("Error processing updated tab URL:", error);
    }
  }
});

// Handle tab close
chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
  if (tabTime[tabId]) {
    saveTabTime(tabId);
    delete tabTime[tabId];
  }
});

// Track session data when the extension is suspended
chrome.runtime.onSuspend.addListener(() => {
  saveAllTabData();
});

// Handle messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.action) {
    case 'resetTimers':
      tabTime = {};
      sessionStartTime = Date.now();
      sendResponse({ status: 'success', message: 'Session timers reset.' });
      break;
      
    case 'getHistory':
      updateCurrentTabTime();
      chrome.storage.local.get('history', (data) => {
        if (chrome.runtime.lastError) {
          sendResponse({ status: 'error', message: chrome.runtime.lastError });
          return;
        }
        sendResponse({ status: 'success', history: data.history || history });
      });
      return true; // To indicate asynchronous response
      
    case 'clearAllData':
      tabTime = {};
      history = {};
      chrome.storage.local.set({ history: {} }, () => {
        sendResponse({ status: 'success', message: 'All data cleared.' });
      });
      return true;
      
    case 'updateSettings':
      settings = { ...settings, ...message.settings };
      chrome.storage.local.set({ settings }, () => {
        sendResponse({ status: 'success', message: 'Settings updated.' });
      });
      return true;
  }
});

// Update timing for inactive tabs
function updateInactiveTabs(currentTabId) {
  const now = Date.now();
  
  // Update time for all tabs except the current one
  for (let id in tabTime) {
    if (id !== `${currentTabId}` && tabTime[id].startTime) {
      const elapsedTime = now - tabTime[id].startTime;
      tabTime[id].time += Math.floor(elapsedTime / 1000);
      tabTime[id].startTime = now;
    }
  }
}

// Save tab time data to history
function saveTabTime(tabId) {
  const currentDate = getCurrentDate();
  if (!history[currentDate]) history[currentDate] = {};
  
  const { domain, startTime, time } = tabTime[tabId];
  
  // Calculate final time including time since last start
  const elapsedTime = Math.floor((Date.now() - startTime) / 1000);
  const totalTime = time + elapsedTime;
  
  // Update history
  if (!history[currentDate][domain]) {
    history[currentDate][domain] = totalTime;
  } else {
    history[currentDate][domain] += totalTime;
  }
  
  // Save to storage
  chrome.storage.local.set({ history });
}

// Save all open tab data
function saveAllTabData() {
  const now = Date.now();
  const currentDate = getCurrentDate();
  
  if (!history[currentDate]) history[currentDate] = {};
  
  // Update time for all tabs
  for (let id in tabTime) {
    if (tabTime[id].startTime) {
      const elapsedTime = now - tabTime[id].startTime;
      tabTime[id].time += Math.floor(elapsedTime / 1000);
      tabTime[id].startTime = now;
      
      const { domain, time } = tabTime[id];
      
      // Update history
      if (!history[currentDate][domain]) {
        history[currentDate][domain] = time;
      } else {
        history[currentDate][domain] += time;
      }
    }
  }
  
  // Save to storage
  chrome.storage.local.set({ history });
}

// Update current tab time when needed
function updateCurrentTabTime() {
  if (activeTabId && tabTime[activeTabId]) {
    const now = Date.now();
    const elapsedTime = now - tabTime[activeTabId].startTime;
    
    // Only update if more than 1 second has passed
    if (elapsedTime > 1000) {
      tabTime[activeTabId].time += Math.floor(elapsedTime / 1000);
      tabTime[activeTabId].startTime = now;
    }
    
    // Check limits
    if (settings.enableTimeLimits) {
      const domain = tabTime[activeTabId].domain;
      if (limits[domain]) {
        checkTimeLimits(domain);
      }
    }
  }
}

// Check if a domain has exceeded its time limit
function checkTimeLimits(domain) {
  if (!settings.enableTimeLimits || !limits[domain]) return;
  
  const currentDate = getCurrentDate();
  if (!history[currentDate]) history[currentDate] = {};
  
  let totalTime = history[currentDate][domain] || 0;
  
  // Add time from currently open tabs with this domain
  for (let id in tabTime) {
    if (tabTime[id].domain === domain) {
      const elapsedTime = Math.floor((Date.now() - tabTime[id].startTime) / 1000);
      totalTime += tabTime[id].time + elapsedTime;
    }
  }
  
  // Convert limit to seconds (it's stored in minutes)
  const limitSeconds = limits[domain] * 60;
  
  // Check if limit is exceeded and notification hasn't been shown today
  if (totalTime >= limitSeconds && !notifications[`${currentDate}-${domain}`]) {
    // Create and show notification
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'logo.png',
      title: 'Time Limit Reached',
      message: `You've reached your time limit for ${domain}.`
    });
    
    // Mark as notified
    notifications[`${currentDate}-${domain}`] = true;
  }
}

// Set up alarm for periodic updates
chrome.alarms.create('saveData', { periodInMinutes: 1 });

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'saveData') {
    updateCurrentTabTime();
    chrome.storage.local.set({ history });
  }
});

// Set up alarm for daily reset of notifications
chrome.alarms.create('dailyReset', { 
  when: new Date().setHours(0, 0, 0, 0) + 86400000, // Next midnight
  periodInMinutes: 1440 // 24 hours
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'dailyReset') {
    notifications = {}; // Clear notifications for the new day
  }
});

// Initialize
(() => {
  // Check for currently active tab
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs.length > 0 && tabs[0].id) {
      const tab = tabs[0];
      activeTabId = tab.id;
      
      if (tab.url && !tab.url.startsWith('chrome://')) {
        try {
          const url = new URL(tab.url);
          const domain = url.hostname;
          
          tabTime[tab.id] = { 
            domain, 
            startTime: Date.now(), 
            time: 0,
            url: tab.url,
            title: tab.title
          };
        } catch (error) {
          console.error("Error processing initial tab URL:", error);
        }
      }
    }
  });
})();
