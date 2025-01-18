let tabTime = {};
let sessionStartTime = Date.now();
let history = {};

function getCurrentDate() {
  const today = new Date();
  return `${today.getFullYear()}-${today.getMonth() + 1}-${today.getDate()}`;
}

chrome.tabs.onActivated.addListener((activeInfo) => {
  const tabId = activeInfo.tabId;
  chrome.tabs.get(tabId, (tab) => {
    if (chrome.runtime.lastError || !tab || !tab.url) {
      console.error(chrome.runtime.lastError);
      return;
    }
    const url = new URL(tab.url);
    const domain = url.hostname;

    // Initialize tab tracking
    if (!tabTime[tabId]) {
      tabTime[tabId] = { domain, startTime: Date.now(), time: 0 };
    }

    // Calculate time spent on inactive tabs
    for (let id in tabTime) {
      if (id !== `${tabId}`) {
        const elapsedTime = Date.now() - tabTime[id].startTime;
        tabTime[id].time += Math.floor(elapsedTime / 1000);
        tabTime[id].startTime = Date.now();
      }
    }
  });
});

// Track session data when the extension is suspended
chrome.runtime.onSuspend.addListener(() => {
  const currentDate = getCurrentDate();
  if (!history[currentDate]) history[currentDate] = {};

  // Save session time for each domain
  for (let id in tabTime) {
    const { domain, time } = tabTime[id];
    if (!history[currentDate][domain]) history[currentDate][domain] = 0;
    history[currentDate][domain] += time;
  }

  // Clear the session
  tabTime = {};
  chrome.storage.local.set({ history });
});

// Reset session data
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'resetTimers') {
    tabTime = {};
    sessionStartTime = Date.now();
    sendResponse({ status: 'success', message: 'Session timers reset.' });
  } else if (message.action === 'getHistory') {
    chrome.storage.local.get('history', (data) => {
      if (chrome.runtime.lastError) {
        sendResponse({ status: 'error', message: chrome.runtime.lastError });
        return;
      }
      sendResponse({ status: 'success', history: data.history || {} });
    });
    return true; // To indicate asynchronous response
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === "complete") {
        chrome.storage.local.get(["tabData"], (result) => {
            let tabData = result.tabData || {};
            const hostname = new URL(tab.url).hostname;

            if (!tabData[hostname]) {
                tabData[hostname] = { timeSpent: 0, lastAccess: Date.now() };
            } else {
                const currentTime = Date.now();
                const timeSpent = currentTime - tabData[hostname].lastAccess;
                tabData[hostname].timeSpent += timeSpent;
                tabData[hostname].lastAccess = currentTime;
            }

            chrome.storage.local.set({ tabData }, () => {
                console.log("Data updated:", tabData);
            });
        });
    }
});
