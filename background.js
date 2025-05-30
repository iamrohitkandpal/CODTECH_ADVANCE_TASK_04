const TrackerBackground = {
  state: {
    tabTime: new Map(),
    history: {},
    settings: {
      enableTimeLimits: false,
      enableIdleDetection: true,
      idleTimeout: 300,
    },
    limits: {},
    categories: {},
    notifications: new Map(),
    activeTabId: null,
    sessionStartTime: Date.now(),
    analytics: { totalTimeToday: 0 },
    isIdle: false,
  },

  async init() {
    await this.loadStorage();
    this.bindListeners();
    this.startPeriodicTasks();
    await this.checkActiveTabs();
    await this.setInitialIdleState();
    console.log("[TimeTab] Background initialized");
  },

  async setInitialIdleState() {
    try {
      const state = await new Promise((resolve) =>
        chrome.idle.queryState(this.state.settings.idleTimeout, resolve)
      );
      this.state.isIdle = state !== "active";
      console.log("[TimeTab] Initial idle state:", this.state.isIdle);
    } catch (err) {
      console.error("[TimeTab] Error setting initial idle state:", err);
      this.state.isIdle = false;
    }
  },

  async loadStorage() {
    try {
      const data = await new Promise((resolve) =>
        chrome.storage.local.get(
          ["history", "settings", "limits", "categories"],
          resolve
        )
      );
      this.state.history = data.history || {};
      this.state.settings = { ...this.state.settings, ...data.settings };
      this.state.limits = data.limits || {};
      this.state.categories = data.categories || {};
    } catch (err) {
      console.error("[TimeTab] Load storage error:", err);
    }
  },

  bindListeners() {
    chrome.tabs.onActivated.addListener((info) =>
      this.handleTabActivation(info)
    );
    chrome.tabs.onUpdated.addListener((id, info, tab) =>
      this.handleTabUpdate(id, info, tab)
    );
    chrome.tabs.onRemoved.addListener((id) => this.handleTab(id));
    chrome.runtime.onMessage.addListener((msg, sender, callback) =>
      this.handleMessage(msg, sender, callback)
    );
    chrome.idle.onStateChanged.addListener(
      (state) => {
        this.state.isIdle = state !== "active";
        console.log("[TimeTab] Idle state changed:", this.state.isIdle);
      }
    );
  },

  async handleTabActivation(info) {
    const { tabId } = info;
    const prevTabId = this.state.activeTabId;
    this.state.activeTabId = tabId;

    if (prevTabId && prevTabId !== tabId) await this.updateTabTime(prevTabId);

    try {
      const tab = await new Promise((resolve) =>
        chrome.tabs.get(tabId, resolve)
      );
      if (!tab?.url) return;

      const domain = this.extractDomain(tab.url);
      if (!domain) return;

      this.state.tabTime.set(tabId, {
        domain,
        startTime: Date.now(),
        time: this.state.tabTime.get(tabId)?.time || 0,
        url: tab.url,
        title: tab.title || domain,
        category: this.getCategory(domain),
        favIconUrl: tab.favIconUrl || null, // Store favicon URL
      });
    } catch (err) {
      console.error("[TimeTab] Tab activation error:", err);
    }
  },

  async handleTabUpdate(tabId, changeInfo, tab) {
    if (changeInfo.status !== "complete" || !tab.active || !tab.url) return;

    const domain = this.extractDomain(tab.url);
    if (!domain) return;

    const current = this.state.tabTime.get(tabId);
    if (current && current.domain !== domain) {
      await this.updateTabTime(tabId);
      this.state.tabTime.set(tabId, {
        domain,
        startTime: Date.now(),
        time: 0,
        url: tab.url,
        title: tab.title || domain,
        category: this.getCategory(domain),
        favIconUrl: tab.favIconUrl || null,
      });
    } else if (!current) {
      this.state.tabTime.set(tabId, {
        domain,
        startTime: Date.now(),
        time: 0,
        url: tab.url,
        title: tab.title || domain,
        category: this.getCategory(domain),
        favIconUrl: tab.favIconUrl || null,
      });
    }
  },

  async handleTab(id) {
    if (this.state.tabTime.has(id)) {
      await this.updateTabTime(id);
      this.state.tabTime.delete(id);
    }
  },

  async updateTabTime(tabId) {
    if (this.state.isIdle || !this.state.tabTime.has(tabId)) return;

    const tab = this.state.tabTime.get(tabId);
    if (!tab.startTime || !tab.domain) return;

    const now = Date.now();
    const elapsed = Math.floor((now - tab.startTime) / 1000);
    if (elapsed < 15) return;

    tab.time += elapsed;
    tab.startTime = now;

    const date = this.getCurrentDate();
    if (!this.state.history[date]) this.state.history[date] = {};
    this.state.history[date][tab.domain] = (this.state.history[date][tab.domain] || 0) + elapsed;

    if (this.state.settings.enableTimeLimits && this.state.limits[tab.domain]) {
      const limit = this.state.limits[tab.domain];
      if (this.state.history[date][tab.domain] >= limit && !this.state.notifications.has(tab.domain)) {
        chrome.notifications.create({
          type: "basic",
          iconUrl: "icons/icon128.png",
          title: "Time Limit Reached",
          message: `You've reached your ${Math.floor(limit / 60)}m limit for ${tab.domain}.`
        });
        this.state.notifications.set(tab.domain, true);
      }
    }

    this.updateAnalytics(date);
    await this.saveState();
  },

  updateAnalytics(date) {
    const today = this.getCurrentDate();
    if (date !== today) return;

    let total = 0;
    for (const domain in this.state.history[today]) {
      total += this.state.history[today][domain] || 0;
    }
    this.state.analytics.totalTimeToday = total;
  },

  async saveState() {
    try {
      await new Promise((resolve) =>
        chrome.storage.local.set(
          {
            history: this.state.history,
            settings: this.state.settings,
            limits: this.state.limits,
            categories: this.state.categories,
          },
          resolve
        )
      );
    } catch (err) {
      console.error("[TimeTab] Save state error:", err);
    }
  },

  startPeriodicTasks() {
    setInterval(() => {
      if (!this.state.isIdle) this.saveAllTabs();
    }, 5000);
  },

  async saveAllTabs() {
    for (const id of this.state.tabTime.keys()) {
      await this.updateTabTime(id);
    }
    await this.saveState();
  },

  handleMessage(message, sender, sendResponse) {
    switch (message.action) {
      case "resetTimers":
        this.state.tabTime.clear();
        this.state.sessionStartTime = Date.now();
        this.state.notifications.clear();
        sendResponse({ status: "success", message: "Session timers reset." });
        break;
      case "getHistory":
        this.saveAllTabs().then(() => {
          sendResponse({
            status: "success",
            history: this.state.history,
            analytics: this.state.analytics,
          });
        });
        return true;
      case "clearAllData":
        this.state.tabTime.clear();
        this.state.history = {};
        this.state.notifications.clear();
        this.saveState().then(() => {
          sendResponse({ status: "success", message: "All data cleared." });
        });
        return true;
      case "updateSettings":
        this.state.settings = { ...this.state.settings, ...message.settings };
        this.saveState().then(() => {
          sendResponse({ status: "success", message: "Settings updated." });
        });
        return true;
      case "ping":
        this.saveAllTabs().then(() => {
          sendResponse({
            status: "success",
            message: "Background script active",
            activeTabId: this.state.activeTabId,
            tabCount: this.state.tabTime.size,
            currentDate: this.getCurrentDate(),
            analytics: this.state.analytics,
          });
        });
        return true;
      case "getFavicons":
        const favicons = {};
        for (const domain of message.domains) {
          const tabEntry = Array.from(this.state.tabTime.values()).find(
            (tab) => tab.domain === domain
          );
          favicons[domain] = tabEntry?.favIconUrl || "icons/fallback.ico";
        }
        sendResponse({ status: "success", favicons });
        break;
      default:
        sendResponse({ status: "error", message: "Unknown action" });
    }
  },

  extractDomain(url) {
    try {
      if (
        !url ||
        /^(chrome|edge|about|chrome-extension|moz-extension):\/\//.test(url)
      )
        return null;
      const urlObj = new URL(url);
      return urlObj.hostname.replace(/^www\./, "");
    } catch (err) {
      console.error("[TimeTab] Extract domain error:", err);
      return null;
    }
  },

  getCategory(domain) {
    return this.state.categories[domain] || "other";
  },

  getCurrentDate(d = new Date()) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
      2,
      "0"
    )}-${String(d.getDate()).padStart(2, "0")}`;
  },

  async checkActiveTabs() {
    try {
      const tabs = await new Promise((resolve) =>
        chrome.tabs.query({ active: true, currentWindow: true }, resolve)
      );
      if (tabs.length > 0) {
        const tab = tabs[0];
        this.state.activeTabId = tab.id;
        const domain = this.extractDomain(tab.url);
        if (domain) {
          this.state.tabTime.set(tab.id, {
            domain,
            startTime: Date.now(),
            time: 0,
            url: tab.url,
            title: tab.title || domain,
            category: this.getCategory(domain),
            favIconUrl: tab.favIconUrl || null,
          });
        }
      }
    } catch (err) {
      console.error("[TimeTab] Check active tabs error:", err);
    }
  },
};

TrackerBackground.init();