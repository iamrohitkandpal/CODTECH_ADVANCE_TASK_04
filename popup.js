const Tracker = {
  state: {
    history: {},
    settings: { darkMode: false, showSeconds: true, enableTimeLimits: false },
    limits: {},
    categoryLimits: {},
    categories: {
      "google.com": "work",
      "youtube.com": "entertainment",
      "facebook.com": "social",
      "instagram.com": "social",
      "github.com": "work",
    },
    charts: { todayChart: null, historyChart: null, categoryChart: null },
    currentTab: "today",
    timeRange: "day",
    customRange: { start: null, end: null },
    analytics: { totalTimeToday: 0 },
    quote: null,
    prevSites: {},
    prevTotalTime: 0,
  },

  localQuotes: [
    { content: "The only way to do great work is to love what you do.", author: "Steve Jobs" },
    { content: "You miss 100% of the shots you don’t take.", author: "Wayne Gretzky" },
    { content: "Success is the sum of small efforts, repeated day in and day out.", author: "Robert Collier" },
    { content: "Don’t watch the clock; do what it does. Keep going.", author: "Sam Levenson" },
    { content: "The future depends on what you do today.", author: "Mahatma Gandhi" }
  ],

  async init() {
    try {
      await this.loadSettings();
      this.bindEvents();
      this.switchTab("today");
      this.updateUI();
      this.startPolling();
      this.fetchQuote();
      this.log("Popup initialized");
    } catch (err) {
      this.showNotification("Error initializing popup", "error");
      this.logError(err, "init");
    }
  },

  async loadSettings() {
    try {
      const data = await new Promise((resolve) =>
        chrome.storage.local.get(
          ["settings", "limits", "categoryLimits", "categories"],
          resolve
        )
      );
      this.state.settings = { ...this.state.settings, ...data.settings };
      this.state.limits = data.limits || {};
      this.state.categoryLimits = data.categoryLimits || {};
      this.state.categories = { ...this.state.categories, ...data.categories };
      document.body.classList.toggle("dark-mode", this.state.settings.darkMode);
      document.querySelector("#darkModeToggle").checked =
        this.state.settings.darkMode;
      document.querySelector("#showSecondsToggle").checked =
        this.state.settings.showSeconds;
      document.querySelector("#timeLimitsToggle").checked =
        this.state.settings.enableTimeLimits;
      this.updateSettings();
    } catch (err) {
      this.logError(err, "loadSettings");
    }
  },

  bindEvents() {
    document.querySelector(".tabs")?.addEventListener("click", (e) => {
      const tab = e.target.closest(".tab");
      if (tab) {
        const tabId = tab.dataset.tab;
        if (tabId) this.switchTab(tabId);
      }
    });

    document
      .querySelector("#resetButton")
      ?.addEventListener("click", () => this.resetTimers());
    document
      .querySelector("#exportButton")
      ?.addEventListener("click", () => this.exportData());
    document
      .querySelector("#exportDataButton")
      ?.addEventListener("click", () => this.exportData());
    document
      .querySelector("#importDataButton")
      ?.addEventListener("click", () => this.importData());
    document
      .querySelector("#clearDataButton")
      ?.addEventListener("click", () => this.clearData());

    document
      .querySelector("#darkModeToggle")
      ?.addEventListener("change", (e) => {
        this.state.settings.darkMode = e.target.checked;
        document.body.classList.toggle("dark-mode", e.target.checked);
        this.saveSettings();
      });
    document
      .querySelector("#showSecondsToggle")
      ?.addEventListener("change", (e) => {
        this.state.settings.showSeconds = e.target.checked;
        this.saveSettings();
        this.updateTimeList();
      });
    document
      .querySelector("#timeLimitsToggle")
      ?.addEventListener("change", (e) => {
        this.state.settings.enableTimeLimits = e.target.checked;
        this.saveSettings();
      });

    document
      .querySelector("#siteSearch")
      ?.addEventListener("input", (e) => this.updateTimeList(e.target.value));
    document
      .querySelector("#timeRangeSelect")
      ?.addEventListener("change", (e) => {
        this.state.timeRange = e.target.value;
        document.querySelector("#customDateRange").style.display =
          e.target.value === "custom" ? "flex" : "none";
        this.updateAnalytics();
      });
    document.querySelector("#applyRange")?.addEventListener("click", () => {
      const start = document.querySelector("#startDate").value;
      const end = document.querySelector("#endDate").value;
      if (start && end) {
        this.state.customRange = { start, end };
        this.updateAnalytics();
      }
    });

    document
      .querySelector("#addCategoryButton")
      ?.addEventListener("click", () => this.addCategory());
    document
      .querySelector("#addSiteLimitButton")
      ?.addEventListener("click", () => this.addSiteLimit());
  },

  switchTab(tabId) {
    if (this.state.currentTab === tabId) return;
    this.state.currentTab = tabId;

    document.querySelectorAll(".tab").forEach((tab) => {
      tab.classList.toggle("active", tab.dataset.tab === tabId);
    });

    document.querySelectorAll(".content").forEach((content) => {
      content.classList.toggle("active", content.id === tabId);
    });

    if (tabId === "today") {
      this.updateTimeList();
      this.updateTodayChart();
      this.updateTotalTime();
    } else if (tabId === "analytics") {
      this.updateAnalytics();
    } else if (tabId === "settings") {
      this.updateSettings();
    }
    this.log(`Switched to tab: ${tabId}`);
  },

  startPolling() {
    this.updateUI();
    setInterval(() => this.updateUI(), 1000);
  },

  async updateUI() {
    try {
      const response = await new Promise((resolve) =>
        chrome.runtime.sendMessage({ action: "getHistory" }, resolve)
      );
      if (response.status === "success") {
        this.state.history = response.history;
        this.state.analytics = response.analytics || { totalTimeToday: 0 };
        if (this.state.currentTab === "today") {
          this.updateTimeList();
          this.updateTodayChart();
          this.updateTotalTime();
        } else if (this.state.currentTab === "analytics") {
          this.updateAnalytics();
        }
      } else {
        this.showNotification("Failed to fetch data", "error");
      }
    } catch (err) {
      this.logError(err, "updateUI");
    }
  },

  updateTimeList(search = "") {
    const list = document.querySelector("#timeList");
    if (!list) return;

    const today = this.getCurrentDate();
    const sites = this.state.history[today] || {};
    const filtered = Object.entries(sites)
      .filter(([domain]) => domain.toLowerCase().includes(search.toLowerCase()))
      .sort(([, a], [, b]) => b - a);

    const currentSites = {};
    filtered.forEach(([domain, time]) => {
      currentSites[domain] = time;
    });

    Object.keys(this.state.prevSites).forEach((domain) => {
      if (!currentSites[domain]) {
        const item = list.querySelector(`[data-domain="${domain}"]`);
        if (item) item.remove();
      }
    });

    if (filtered.length) {
      filtered.forEach(([domain, time]) => {
        const existingItem = list.querySelector(`[data-domain="${domain}"]`);
        const category = this.getCategory(domain);
        const timeText = this.formatTime(time);

        if (existingItem) {
          const timeElement = existingItem.querySelector(".site-time");
          if (timeElement.textContent !== timeText) {
            timeElement.textContent = timeText;
          }
        } else {
          const item = document.createElement("div");
          item.className = "site-item";
          item.dataset.domain = domain;
          item.innerHTML = `
            <img class="site-icon" src="icons/fallback.ico" data-domain="${domain}" alt="${domain} icon">
            <span class="category ${category}">${category}</span>
            <span class="site-time">${timeText}</span>
          `;
          list.appendChild(item);
        }
      });

      // Fetch favicons from background script
      this.fetchFavicons(filtered.map(([domain]) => domain));
    } else {
      list.innerHTML = '<div class="empty-state">No sites tracked today</div>';
    }

    this.state.prevSites = currentSites;
  },

  async fetchFavicons(domains) {
    try {
      const response = await new Promise((resolve) =>
        chrome.runtime.sendMessage({ action: "getFavicons", domains }, resolve)
      );
      if (response.status === "success" && response.favicons) {
        for (const [domain, favicon] of Object.entries(response.favicons)) {
          const img = document.querySelector(`.site-icon[data-domain="${domain}"]`);
          if (img && favicon) {
            img.src = favicon;
          }
        }
      }
    } catch (err) {
      this.logError(err, "fetchFavicons");
    }
  },

  updateTotalTime() {
    const total = document.querySelector("#totalTime");
    if (!total) return;

    const newTotalTime = this.state.analytics.totalTimeToday;
    if (newTotalTime !== this.state.prevTotalTime) {
      total.textContent = `Total: ${this.formatTime(newTotalTime)}`;
      this.state.prevTotalTime = newTotalTime;
    }
  },

  updateTodayChart() {
    if (!window.Chart) {
      console.error("[TimeTab] Chart.js not loaded");
      return;
    }
    const ctx = document.querySelector("#todayChart")?.getContext("2d");
    if (!ctx) return;

    const today = this.state.history[this.getCurrentDate()] || {};
    const data = Object.entries(today).map(([domain, time]) => ({
      label: domain,
      data: time,
      backgroundColor: this.getColor(this.getCategory(domain)),
    }));

    const isDarkMode = document.body.classList.contains("dark-mode");
    const tickColor = isDarkMode ? "#F9FAFB" : "#1F2937";

    if (!this.state.charts.todayChart) {
      this.state.charts.todayChart = new Chart(ctx, {
        type: "bar",
        data: {
          labels: data.map((d) => d.label),
          datasets: [
            {
              data: data.map((d) => d.data),
              backgroundColor: data.map((d) => d.backgroundColor),
            },
          ],
        },
        options: {
          responsive: true,
          plugins: { legend: { display: false } },
          scales: {
            y: { beginAtZero: true, ticks: { color: tickColor } },
            x: { ticks: { color: tickColor } },
          },
        },
      });
    } else {
      this.state.charts.todayChart.data.labels = data.map((d) => d.label);
      this.state.charts.todayChart.data.datasets[0].data = data.map((d) => d.data);
      this.state.charts.todayChart.data.datasets[0].backgroundColor = data.map((d) => d.backgroundColor);
      this.state.charts.todayChart.options.scales.y.ticks.color = tickColor;
      this.state.charts.todayChart.options.scales.x.ticks.color = tickColor;
      this.state.charts.todayChart.update('none');
    }
  },

  async updateAnalytics() {
    const insights = document.querySelector("#productivityInsights");
    const history = document.querySelector("#history");
    if (!insights || !history) return;

    insights.innerHTML = `
      <div class="productivity-score">
        <div class="score">85</div>
        <div>Productivity Score</div>
      </div>
    `;

    const data = this.getRangeData();
    history.innerHTML = data.length
      ? data
          .map(
            ([date, domains]) => `
      <div class="history-item">
        <strong>${date}</strong>
        <div>${Object.entries(domains)
          .map(([d, t]) => `${d}: ${this.formatTime(t)}`)
          .join("<br>")}</div>
      </div>
    `
          )
          .join("")
      : '<div class="empty-state">No history available</div>';

    this.updateHistoryChart();
    this.updateCategoryChart();
  },

  updateHistoryChart() {
    if (!window.Chart) return;
    const ctx = document.querySelector("#historyChart")?.getContext("2d");
    if (!ctx) return;

    const data = this.getRangeData();
    const labels = data.map(([date]) => date);
    const datasets = Object.keys(this.state.categories).map((domain) => ({
      label: domain,
      data: data.map(([, domains]) => domains[domain] || 0),
      backgroundColor: this.getColor(this.getCategory(domain)),
    }));

    const isDarkMode = document.body.classList.contains("dark-mode");
    const tickColor = isDarkMode ? "#F9FAFB" : "#1F2937";

    if (!this.state.charts.historyChart) {
      this.state.charts.historyChart = new Chart(ctx, {
        type: "bar",
        data: { labels, datasets },
        options: {
          responsive: true,
          scales: {
            y: { beginAtZero: true, ticks: { color: tickColor } },
            x: { ticks: { color: tickColor } },
          },
          plugins: { legend: { labels: { color: tickColor } } },
        },
      });
    } else {
      this.state.charts.historyChart.data.labels = labels;
      this.state.charts.historyChart.data.datasets = datasets;
      this.state.charts.historyChart.options.scales.y.ticks.color = tickColor;
      this.state.charts.historyChart.options.scales.x.ticks.color = tickColor;
      this.state.charts.historyChart.options.plugins.legend.labels.color = tickColor;
      this.state.charts.historyChart.update('none');
    }
  },

  updateCategoryChart() {
    if (!window.Chart) return;
    const ctx = document.querySelector("#categoryChart")?.getContext("2d");
    if (!ctx) return;

    const today = this.state.history[this.getCurrentDate()] || {};
    const categoryData = {};
    for (const [domain, time] of Object.entries(today)) {
      const cat = this.getCategory(domain);
      categoryData[cat] = (categoryData[cat] || 0) + time;
    }

    const data = Object.entries(categoryData).map(([cat, time]) => ({
      label: cat,
      data: time,
      backgroundColor: this.getColor(cat),
    }));

    const isDarkMode = document.body.classList.contains("dark-mode");
    const tickColor = isDarkMode ? "#F9FAFB" : "#1F2937";

    if (!this.state.charts.categoryChart) {
      this.state.charts.categoryChart = new Chart(ctx, {
        type: "pie",
        data: {
          labels: data.map((d) => d.label),
          datasets: [
            {
              data: data.map((d) => d.data),
              backgroundColor: data.map((d) => d.backgroundColor),
            },
          ],
        },
        options: {
          responsive: true,
          plugins: {
            legend: { position: "bottom", labels: { color: tickColor } },
          },
        },
      });
    } else {
      this.state.charts.categoryChart.data.labels = data.map((d) => d.label);
      this.state.charts.categoryChart.data.datasets[0].data = data.map((d) => d.data);
      this.state.charts.categoryChart.data.datasets[0].backgroundColor = data.map((d) => d.backgroundColor);
      this.state.charts.categoryChart.options.plugins.legend.labels.color = tickColor;
      this.state.charts.categoryChart.update('none');
    }
  },

  getRangeData() {
    const { timeRange, customRange } = this.state;
    const data = [];
    const today = new Date();
    const todayStr = this.getCurrentDate();

    if (timeRange === "day") {
      if (this.state.history[todayStr])
        data.push([todayStr, this.state.history[todayStr]]);
    } else if (timeRange === "week") {
      const start = new Date(today);
      start.setDate(today.getDate() - 7);
      let d = start;
      while (d <= today) {
        const dateStr = this.getCurrentDate(d);
        if (this.state.history[dateStr])
          data.push([dateStr, this.state.history[dateStr]]);
        d.setDate(d.getDate() + 1);
      }
    } else if (timeRange === "month") {
      const start = new Date(today);
      start.setDate(today.getDate() - 30);
      let d = start;
      while (d <= today) {
        const dateStr = this.getCurrentDate(d);
        if (this.state.history[dateStr])
          data.push([dateStr, this.state.history[dateStr]]);
        d.setDate(d.getDate() + 1);
      }
    } else if (timeRange === "custom" && customRange.start && customRange.end) {
      let d = new Date(customRange.start);
      const end = new Date(customRange.end);
      while (d <= end) {
        const dateStr = this.getCurrentDate(d);
        if (this.state.history[dateStr])
          data.push([dateStr, this.state.history[dateStr]]);
        d.setDate(d.getDate() + 1);
      }
    }
    return data.sort((a, b) => a[0].localeCompare(b[0]));
  },

  async resetTimers() {
    try {
      await new Promise((resolve) =>
        chrome.runtime.sendMessage({ action: "resetTimers" }, resolve)
      );
      this.showNotification("Timers reset successfully", "success");
      this.updateUI();
    } catch (err) {
      this.showNotification("Error resetting timers", "error");
      this.logError(err, "resetTimers");
    }
  },

  async exportData() {
    try {
      const blob = new Blob([JSON.stringify(this.state.history)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "timetab_history.json";
      a.click();
      URL.revokeObjectURL(url);
      this.showNotification("Data exported successfully", "success");
    } catch (err) {
      this.logError(err, "exportData");
      this.showNotification("Failed to export data", "error");
    }
  },

  async importData() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = async (e) => {
      try {
        const file = e.target.files[0];
        if (!file) return;
        const text = await file.text();
        const data = JSON.parse(text);
        this.state.history = { ...this.state.history, ...data };
        await chrome.storage.local.set({ history: this.state.history });
        this.showNotification("Data imported successfully", "success");
        this.updateUI();
      } catch (err) {
        this.showNotification("Error importing data", "error");
        this.logError(err, "importData");
      }
    };
    input.click();
  },

  async clearData() {
    try {
      await new Promise((resolve) =>
        chrome.runtime.sendMessage({ action: "clearAllData" }, resolve)
      );
      this.showNotification("Data cleared successfully", "success");
      this.updateUI();
    } catch (err) {
      this.showNotification("Error clearing data", "error");
      this.logError(err, "clearData");
    }
  },

  async addCategory() {
    const domain = prompt("Enter domain (e.g., example.com):");
    const category = prompt(
      "Enter category (work, social, entertainment, other):"
    );
    if (
      domain &&
      category &&
      ["work", "social", "entertainment", "other"].includes(category)
    ) {
      this.state.categories[domain] = category;
      await chrome.storage.local.set({ categories: this.state.categories });
      this.updateSettings();
      this.showNotification(
        `Added ${category} category for ${domain}`,
        "success"
      );
    } else {
      this.showNotification("Invalid domain or category", "error");
    }
  },

  async addSiteLimit() {
    const domain = prompt("Enter domain (e.g., example.com):");
    const time = prompt("Enter time limit in minutes (e.g., 60):");
    const minutes = parseInt(time, 10);
    if (domain && minutes && !isNaN(minutes) && minutes > 0) {
      this.state.limits[domain] = minutes * 60;
      await chrome.storage.local.set({ limits: this.state.limits });
      this.updateSettings();
      this.showNotification(`Set ${minutes}m limit for ${domain}`, "success");
    } else {
      this.showNotification("Invalid domain or time limit", "error");
    }
  },

  async updateSettings() {
    const categoriesList = document.querySelector("#categoriesList");
    const siteLimits = document.querySelector("#siteLimits");
    if (!categoriesList || !siteLimits) return;

    categoriesList.innerHTML = Object.entries(this.state.categories).length
      ? Object.entries(this.state.categories)
          .map(
            ([domain, cat]) => `
          <div class="settings-row">
            <span>${domain}</span>
            <span class="category ${cat}">${cat}</span>
          </div>
        `
          )
          .join("")
      : '<div class="empty-state">No custom categories</div>';

    siteLimits.innerHTML = Object.entries(this.state.limits).length
      ? Object.entries(this.state.limits)
          .map(
            ([domain, seconds]) => `
          <div class="site-limit-row">
            <span>${domain}</span>
            <span>${Math.floor(seconds / 60)}m</span>
            <button class="remove-limit" data-domain="${domain}" aria-label="Remove limit for ${domain}"><i class="fas fa-trash"></i></button>
          </div>
        `
          )
          .join("")
      : '<div class="empty-state">No site limits</div>';

    document.querySelectorAll(".remove-limit").forEach((btn) => {
      btn.addEventListener("click", () => {
        const domain = btn.dataset.domain;
        delete this.state.limits[domain];
        chrome.storage.local.set({ limits: this.state.limits }).then(() => {
          this.updateSettings();
          this.showNotification(`Removed limit for ${domain}`, "success");
        });
      });
    });
  },

  async fetchQuote() {
    const quoteElement = document.querySelector("#quoteContent");
    if (!quoteElement) return;

    quoteElement.innerHTML = '<div class="loading-spinner">Loading quote...</div>';
    try {
      const response = await fetch("https://api.quotable.io/random");
      if (!response.ok) throw new Error("API request failed");
      const data = await response.json();
      this.state.quote = data;
      quoteElement.innerHTML = `
        <blockquote>${data.content}</blockquote>
        <div class="quote-author">— ${data.author}</div>
      `;
    } catch (err) {
      this.logError(err, "fetchQuote");
      // Fallback to local quotes
      const randomQuote = this.localQuotes[Math.floor(Math.random() * this.localQuotes.length)];
      this.state.quote = randomQuote;
      quoteElement.innerHTML = `
        <blockquote>${randomQuote.content}</blockquote>
        <div class="quote-author">— ${randomQuote.author}</div>
      `;
    }
  },

  saveSettings() {
    chrome.runtime.sendMessage({
      action: "updateSettings",
      settings: this.state.settings,
    });
  },

  getCategory(domain) {
    return this.state.categories[domain] || "other";
  },

  getColor(category) {
    const colors = {
      work: "#60A5FA",
      social: "#EC4899",
      entertainment: "#FB7185",
      other: "#9CA3AF",
    };
    return colors[category] || "#9CA3AF";
  },

  formatTime(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return this.state.settings.showSeconds
      ? `${h}h ${m}m ${s}s`
      : `${h}h ${m}m`;
  },

  getCurrentDate(d = new Date()) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
      2,
      "0"
    )}-${String(d.getDate()).padStart(2, "0")}`;
  },

  showNotification(message, type) {
    const notification = document.querySelector("#notification");
    if (!notification) return;
    notification.textContent = message;
    notification.className = `notification ${type}`;
    notification.classList.add("show");
    setTimeout(() => notification.classList.remove("show"), 3000);
  },

  log(message) {
    console.log(`[TimeTab] ${message}`);
  },

  logError(err, context) {
    console.error(`[TimeTab ${context}] ${err.message}`, err);
  },
};

document.addEventListener("DOMContentLoaded", () => Tracker.init());