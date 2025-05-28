document.addEventListener("DOMContentLoaded", () => {
  console.log("DOM fully loaded and parsed. Initializing Tab Time Tracker popup...");

  // Cache DOM elements
  const tabButtons = document.querySelectorAll('.tab');
  const contentDivs = document.querySelectorAll('.content');
  const resetButton = document.getElementById("resetButton");
  const exportButton = document.getElementById("exportButton");
  const timeListDiv = document.getElementById("timeList");
  const totalTimeDiv = document.getElementById("totalTime");
  const todayChartCanvas = document.getElementById('todayChart');
  const historyDiv = document.getElementById("history");
  const historyChartCanvas = document.getElementById('historyChart');
  const darkModeToggle = document.getElementById("darkModeToggle");
  const showSecondsToggle = document.getElementById("showSecondsToggle");
  const timeRangeSelect = document.getElementById("timeRangeSelect");
  const siteSearch = document.getElementById("siteSearch");
  const exportDataButton = document.getElementById("exportDataButton");
  const importDataButton = document.getElementById("importDataButton");
  const clearDataButton = document.getElementById("clearDataButton");
  const timeLimitsToggle = document.getElementById("timeLimitsToggle");
  const customDateRangeDiv = document.getElementById("customDateRange");
  const applyRangeButton = document.getElementById("applyRange");
  const notificationDiv = document.getElementById("notification");
  const addCategoryButton = document.getElementById('addCategoryButton');
  const addSiteLimitButton = document.getElementById('addSiteLimitButton');
  const categoriesListDiv = document.getElementById('categoriesList');
  const siteLimitsDiv = document.getElementById('siteLimits');
  const productivityInsightsDiv = document.getElementById('productivityInsights');
  const startDateInput = document.getElementById("startDate");
  const endDateInput = document.getElementById("endDate");

  // Charts
  let todayChartInstance = null;
  let historyChartInstance = null;

  // Track current data
  let currentData = {};
  let siteCategories = {
    "google.com": "work", "youtube.com": "entertainment", "facebook.com": "social",
    "instagram.com": "social", "github.com": "work", "netflix.com": "entertainment",
    "twitter.com": "social", "linkedin.com": "work", "reddit.com": "entertainment",
    "amazon.com": "other", "wikipedia.org": "work"
  };
  let appSettings = { enableTimeLimits: false };
  let appLimits = {};

  // --- Initialization Functions ---
  function initializeApp() {
    console.log("initializeApp: Starting.");
    initializeTabNavigation();
    initializeEventListeners();
    
    // For testing: Use this to test with mock data
    const useTestData = true; // Set to false for production
    
    if (useTestData) {
      currentData = generateMockData();
      console.log("Using mock data for testing:", currentData);
      renderAllComponents();
    } else {
      initializeUserPreferencesAndFetchData();
    }
    
    addDebugPanel();
    injectSampleDataForToday(); // Inject sample data on app initialization
    console.log("initializeApp: Completed.");
  }

  function initializeTabNavigation() {
    if (!tabButtons.length || !contentDivs.length) {
      console.warn("initializeTabNavigation: Tab buttons or content divs not found.");
      return;
    }
    tabButtons.forEach(button => {
      button.addEventListener('click', () => {
        tabButtons.forEach(btn => btn.classList.remove('active'));
        button.classList.add('active');
        const tabName = button.getAttribute('data-tab');
        console.log(`Tab switched to: ${tabName}`);
        contentDivs.forEach(div => {
          div.classList.toggle('active', div.id === tabName);
        });
        if (tabName === 'analytics' && timeRangeSelect && startDateInput && endDateInput) {
          console.log("Analytics tab opened, refreshing analytics view.");
          updateAnalytics(timeRangeSelect.value, startDateInput.value, endDateInput.value);
        }
      });
    });
  }

  function initializeEventListeners() {
    console.log("initializeEventListeners: Setting up event listeners.");
    if (resetButton) resetButton.addEventListener("click", handleResetTimers);
    else console.warn("Reset button not found");

    if (exportButton) exportButton.addEventListener("click", exportCurrentDayData);
    else console.warn("Export button not found");

    if (siteSearch) siteSearch.addEventListener("input", () => filterSites(siteSearch.value.toLowerCase()));
    else console.warn("Site search input not found");

    if (timeRangeSelect) timeRangeSelect.addEventListener("change", handleTimeRangeChange);
    else console.warn("Time range select not found");

    if (applyRangeButton) applyRangeButton.addEventListener("click", handleApplyCustomDateRange);
    else console.warn("Apply range button not found");

    if (exportDataButton) exportDataButton.addEventListener("click", exportAllTrackedData);
    else console.warn("Export all data button not found");

    if (importDataButton) importDataButton.addEventListener("click", importTrackedData);
    else console.warn("Import data button not found");

    if (clearDataButton) clearDataButton.addEventListener("click", handleClearAllData);
    else console.warn("Clear all data button not found");

    if (addCategoryButton) addCategoryButton.addEventListener('click', handleAddCategory);
    else console.warn("Add category button not found");

    if (addSiteLimitButton) addSiteLimitButton.addEventListener('click', handleAddSiteLimit);
    else console.warn("Add site limit button not found");

    if (darkModeToggle) darkModeToggle.addEventListener("change", handleDarkModeToggle);
    else console.warn("Dark mode toggle not found");

    if (showSecondsToggle) showSecondsToggle.addEventListener("change", handleShowSecondsToggle);
    else console.warn("Show seconds toggle not found");

    if (timeLimitsToggle) timeLimitsToggle.addEventListener("change", handleTimeLimitsToggle);
    else console.warn("Time limits toggle not found");
    console.log("initializeEventListeners: Listeners setup process completed.");
  }

  function initializeUserPreferencesAndFetchData() {
    console.log("initializeUserPreferencesAndFetchData: Fetching initial data and preferences.");
    chrome.storage.local.get(['preferences', 'history', 'categories', 'settings', 'limits'], (data) => {
      if (chrome.runtime.lastError) {
        handleError(chrome.runtime.lastError, 'storage.get initial load');
        return;
      }
      console.log("initializeUserPreferencesAndFetchData: Data received from storage:", data);

      const prefs = data.preferences || {};
      if (darkModeToggle) {
        darkModeToggle.checked = prefs.darkMode || false;
        document.body.classList.toggle("dark-mode", darkModeToggle.checked);
        console.log(`Dark mode initialized to: ${darkModeToggle.checked}`);
      }
      if (showSecondsToggle) {
        showSecondsToggle.checked = prefs.showSeconds !== false;
        console.log(`Show seconds initialized to: ${showSecondsToggle.checked}`);
      }

      currentData = data.history || {};
      siteCategories = data.categories || siteCategories; // Use default if nothing in storage
      appSettings = data.settings || { enableTimeLimits: false };
      appLimits = data.limits || {};

      if (timeLimitsToggle) {
        timeLimitsToggle.checked = appSettings.enableTimeLimits;
        console.log(`Time limits enabled initialized to: ${timeLimitsToggle.checked}`);
      }
      
      // Check if we have any data at all - if not, use test data
      if (Object.keys(currentData).length === 0) {
        console.log("No tracking data found in storage. Using sample data for preview.");
        currentData = generateMockData();
        showNotification('No data found. Using sample data for preview.', 'info');
      }
      
      console.log("initializeUserPreferencesAndFetchData: Initial state set. Rendering all components.");
      renderAllComponents();
    });
  }
  
  function renderAllComponents() {
    console.log("renderAllComponents: Starting full UI refresh with current data:", {currentDataCount: Object.keys(currentData).length, siteCategoriesCount: Object.keys(siteCategories).length});
    renderData(); // Uses global currentData
    if (timeRangeSelect && startDateInput && endDateInput) {
         updateAnalytics(timeRangeSelect.value, startDateInput.value, endDateInput.value);
    } else {
        console.warn("renderAllComponents: Analytics filter elements not found, skipping analytics update.");
    }
    renderCategories();
    renderSiteLimits();
    console.log("renderAllComponents: Full UI refresh completed.");
  }

  // --- Event Handlers ---
  function handleResetTimers() {
    console.log("handleResetTimers: Clicked.");
    chrome.runtime.sendMessage({ action: 'resetTimers' }, (response) => {
      console.log("handleResetTimers: Response from background:", response);
      if (response && response.status === 'success') {
        showNotification(response.message, 'success');
        fetchDataAndRender(); // Re-fetch and re-render
      } else {
        handleError(response || { message: 'Error resetting timers.' }, 'handleResetTimers');
      }
    });
  }

  function handleTimeRangeChange() {
    console.log(`handleTimeRangeChange: New range selected: ${timeRangeSelect.value}`);
    if (customDateRangeDiv) {
      customDateRangeDiv.style.display = timeRangeSelect.value === "custom" ? "flex" : "none";
    }
    if (timeRangeSelect.value !== "custom") {
      updateAnalytics(timeRangeSelect.value);
    }
  }

  function handleApplyCustomDateRange() {
    console.log("handleApplyCustomDateRange: Clicked.");
    if (startDateInput && endDateInput) {
      updateAnalytics("custom", startDateInput.value, endDateInput.value);
    } else {
        console.warn("handleApplyCustomDateRange: Start or end date input not found.");
    }
  }

  function handleClearAllData() {
    console.log("handleClearAllData: Clicked.");
    if (confirm("Are you sure you want to clear all tracking data? This cannot be undone.")) {
      chrome.runtime.sendMessage({ action: 'clearAllData' }, (response) => {
        console.log("handleClearAllData: Response from background:", response);
        if (response && response.status === 'success') {
          showNotification(response.message, 'success');
          currentData = {}; 
          siteCategories = { /* Keep defaults or clear? For now, keep defaults. */
            "google.com": "work", "youtube.com": "entertainment", "facebook.com": "social",
            "instagram.com": "social", "github.com": "work", "netflix.com": "entertainment",
            "twitter.com": "social", "linkedin.com": "work", "reddit.com": "entertainment",
            "amazon.com": "other", "wikipedia.org": "work"
          };
          appLimits = {};
          appSettings = { enableTimeLimits: false }; // Reset settings too
          fetchDataAndRender(); 
        } else {
          handleError(response || { message: 'Error clearing data.' }, 'handleClearAllData');
        }
      });
    }
  }

  function handleDarkModeToggle() {
    if (!darkModeToggle) return;
    console.log(`handleDarkModeToggle: Changed to ${darkModeToggle.checked}`);
    document.body.classList.toggle("dark-mode", darkModeToggle.checked);
    saveUserPreferences();
  }

  function handleShowSecondsToggle() {
    if(!showSecondsToggle) return;
    console.log(`handleShowSecondsToggle: Changed to ${showSecondsToggle.checked}`);
    saveUserPreferences();
    renderData(); // Re-render data that uses time formatting
  }

  function handleTimeLimitsToggle() {
    if (!timeLimitsToggle) return;
    console.log(`handleTimeLimitsToggle: Changed to ${timeLimitsToggle.checked}`);
    appSettings.enableTimeLimits = timeLimitsToggle.checked;
    chrome.runtime.sendMessage({ action: 'updateSettings', settings: { enableTimeLimits: appSettings.enableTimeLimits } }, (response) => {
      console.log("handleTimeLimitsToggle: Response from background:", response);
        if (response && response.status === 'success') {
            showNotification('Time limits setting updated.', 'success');
            chrome.storage.local.set({ settings: appSettings }, () => {
                console.log("Time limits setting saved to storage.");
            });
        } else {
            handleError(response || {message: 'Error updating time limit settings'}, 'handleTimeLimitsToggle');
        }
    });
  }

  function handleAddCategory() {
    console.log("handleAddCategory: Clicked.");
    const domain = prompt('Enter domain to categorize (e.g., example.com):');
    if (!domain || domain.trim() === '') return;
    const category = prompt('Enter category (work, social, entertainment, other):')?.toLowerCase();
    if (!category || !['work', 'social', 'entertainment', 'other'].includes(category)) {
      showNotification('Invalid category. Use work, social, entertainment, or other.', 'error');
      return;
    }
    siteCategories[domain.trim()] = category;
    chrome.storage.local.set({ categories: siteCategories }, () => {
      showNotification('Category added!', 'success');
      console.log(`Category for ${domain.trim()} set to ${category}. Re-rendering all components.`);
      renderAllComponents(); 
    });
  }

  function handleAddSiteLimit() {
    console.log("handleAddSiteLimit: Clicked.");
    const domain = prompt('Enter domain to limit (e.g., facebook.com):');
    if (!domain || domain.trim() === '') return;
    const limitMinutesStr = prompt('Enter time limit in minutes:');
    const limitMinutes = parseInt(limitMinutesStr);
    if (isNaN(limitMinutes) || limitMinutes <= 0) {
      showNotification('Please enter a valid positive number for minutes.', 'error');
      return;
    }
    appLimits[domain.trim()] = limitMinutes;
    chrome.storage.local.set({ limits: appLimits }, () => {
      showNotification('Site limit added!', 'success');
      console.log(`Site limit for ${domain.trim()} set to ${limitMinutes} mins. Re-rendering site limits.`);
      renderSiteLimits(); // Only this section needs update
    });
  }

  // --- Data Fetching and Rendering ---
  function fetchDataAndRender() { 
    console.log("fetchDataAndRender: Explicitly fetching all data and re-rendering.");
    initializeUserPreferencesAndFetchData(); // This re-fetches and calls renderAllComponents
  }
  
  function renderData() { 
    if (!timeListDiv || !totalTimeDiv) {
        console.warn("renderData: timeListDiv or totalTimeDiv not found.");
        return;
    }
    console.log("renderData: Rendering 'Today' tab data.");
    try {
      const currentDateStr = getCurrentDate();
      const todayData = currentData[currentDateStr] || {};
      console.log(`renderData: Data for today (${currentDateStr}):`, todayData);
      const sortedDomains = Object.entries(todayData).sort(([, a], [, b]) => b - a);
      let totalTimeSpent = Object.values(todayData).reduce((sum, time) => sum + time, 0);

      timeListDiv.innerHTML = '';
      if (sortedDomains.length === 0) {
        timeListDiv.innerHTML = '<div class="empty-state">No tracking data for today yet.</div>';
      } else {
        sortedDomains.forEach(([domain, timeSpent]) => {
          const element = document.createElement('div');
          element.className = 'site-item';
          const category = siteCategories[domain] || 'other';
          element.innerHTML = `
            <img class="site-icon" src="https://www.google.com/s2/favicons?domain=${domain}" alt="${domain} icon" onerror="this.style.display='none'; this.onerror=null; this.src='logo.png';">
            <div class="site-name">${domain}</div>
            <div class="site-time">${formatTime(timeSpent)}</div>
            <span class="category ${category.toLowerCase()}">${category.charAt(0).toUpperCase() + category.slice(1)}</span>`;
          timeListDiv.appendChild(element);
        });
      }
      totalTimeDiv.textContent = `Total Time: ${formatTime(totalTimeSpent)}`;
      console.log(`renderData: Total time today: ${formatTime(totalTimeSpent)}`);
      updateTodayChart(sortedDomains);
    } catch (error) {
      handleError(error, 'renderData');
    }
  }

  function ensureChartJsLoaded() {
    return new Promise((resolve) => {
      if (typeof Chart !== 'undefined') {
        resolve();
        return;
      }
      
      console.log("Chart.js not loaded yet, waiting...");
      const maxAttempts = 10;
      let attempts = 0;
      
      const checkInterval = setInterval(() => {
        attempts++;
        if (typeof Chart !== 'undefined') {
          clearInterval(checkInterval);
          console.log("Chart.js loaded successfully");
          resolve();
        } else if (attempts >= maxAttempts) {
          clearInterval(checkInterval);
          console.error("Failed to load Chart.js after multiple attempts");
          showNotification("Chart visualization failed to load. Please reload.", "error");
        }
      }, 300);
    });
  }

  function updateTodayChart(domainData) {
    if (!todayChartCanvas) {
        console.warn("updateTodayChart: Canvas element not found.");
        return;
    }
    
    ensureChartJsLoaded().then(() => {
      console.log("updateTodayChart: Updating chart with domain data:", domainData);
      try {
        const ctx = todayChartCanvas.getContext('2d');
        const labels = [], dataValues = [], backgroundColors = [];
        const topDomains = domainData.slice(0, 5);

        topDomains.forEach(([domain, time]) => {
          labels.push(domain); dataValues.push(time);
          backgroundColors.push(getCategoryColor(siteCategories[domain] || 'other'));
        });
        if (domainData.length > 5) {
          labels.push('Others');
          dataValues.push(domainData.slice(5).reduce((sum, [, time]) => sum + time, 0));
          backgroundColors.push(getCategoryColor('other'));
        }
        if (labels.length === 0) { labels.push('No Data'); dataValues.push(1); backgroundColors.push('#cccccc'); }

        const chartLegendColor = (darkModeToggle && darkModeToggle.checked) ? 'white' : '#333';

        if (todayChartInstance) {
          console.log("updateTodayChart: Updating existing chart instance.");
          todayChartInstance.data.labels = labels;
          todayChartInstance.data.datasets[0].data = dataValues;
          todayChartInstance.data.datasets[0].backgroundColor = backgroundColors;
          todayChartInstance.options.plugins.legend.labels.color = chartLegendColor;
          todayChartInstance.update();
        } else {
          console.log("updateTodayChart: Creating new chart instance.");
          todayChartInstance = new Chart(ctx, {
            type: 'doughnut',
            data: { labels, datasets: [{ data: dataValues, backgroundColor: backgroundColors, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' }] },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { color: chartLegendColor, font: {size: 10}, boxWidth:12 } }, tooltip: { callbacks: { label: c => `${c.label || ''}: ${formatTime(c.raw || 0)}` } } } }
          });
        }
      } catch (error) { handleError(error, 'updateTodayChart'); }
    }).catch(err => {
      handleError(err, 'updateTodayChart - Chart.js loading');
    });
  }
  
  function updateAnalytics(timeRange, startDateStr, endDateStr) {
    if (!historyDiv && !historyChartCanvas && !productivityInsightsDiv) {
        console.warn("updateAnalytics: One or more analytics DOM elements not found.");
        return;
    }
    console.log(`updateAnalytics: Updating for range: ${timeRange}, Start: ${startDateStr}, End: ${endDateStr}`);
    try {
      let filteredHistory = {};
      const today = new Date();
      const todayDate = new Date(today.getFullYear(), today.getMonth(), today.getDate()); 

      switch (timeRange) {
        case 'day':
          const todayDateString = getCurrentDate();
          filteredHistory[todayDateString] = currentData[todayDateString] || {};
          break;

        case 'week':
          for (let i = 0; i < 7; i++) {
            const date = new Date(todayDate);
            date.setDate(todayDate.getDate() - i);
            const dateStr = formatDate(date);
            if (currentData[dateStr]) {
              filteredHistory[dateStr] = currentData[dateStr];
            }
          }
          break;

        case 'month':
          const firstDayOfMonth = new Date(todayDate.getFullYear(), todayDate.getMonth(), 1);
          const lastDayOfMonth = new Date(todayDate.getFullYear(), todayDate.getMonth() + 1, 0);
          for (let d = new Date(firstDayOfMonth); d <= lastDayOfMonth; d.setDate(d.getDate() + 1)) {
            const dateStr = formatDate(new Date(d)); 
            if (currentData[dateStr]) {
              filteredHistory[dateStr] = currentData[dateStr];
            }
          }
          break;

        case 'custom':
          if (!startDateStr || !endDateStr) { showNotification('Please select start and end dates.', 'error'); return; }
          const start = new Date(startDateStr + "T00:00:00"); // Ensure parsing as local date
          const end = new Date(endDateStr + "T00:00:00");
          if (isNaN(start.getTime()) || isNaN(end.getTime())) { showNotification('Invalid date format.', 'error'); return; }
          if (start > end) { showNotification('Start date must be before end date.', 'error'); return; }
          for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
            const dateStr = formatDate(new Date(d)); 
            if (currentData[dateStr]) filteredHistory[dateStr] = currentData[dateStr];
          }
          break;
        default:
          console.warn("updateAnalytics: Unknown time range:", timeRange);
          return;
      }
      console.log("updateAnalytics: Filtered history data for analytics:", filteredHistory);
      renderHistoryData(filteredHistory);
      updateHistoryChart(filteredHistory);
      updateProductivityInsights(filteredHistory);
    } catch (error) { handleError(error, 'updateAnalytics'); }
  }

  function renderHistoryData(historyDataToRender) {
    if (!historyDiv) { console.warn("renderHistoryData: historyDiv not found."); return; }
    console.log("renderHistoryData: Rendering history list.");
    historyDiv.innerHTML = '';
    const sortedDates = Object.keys(historyDataToRender).sort((a, b) => new Date(b) - new Date(a));
    if (sortedDates.length === 0) {
      historyDiv.innerHTML = '<div class="empty-state">No data available for this period.</div>'; return;
    }
    sortedDates.forEach(dateStr => {
      const dayData = historyDataToRender[dateStr];
      if (Object.keys(dayData).length === 0) return; 

      const dateCard = document.createElement('div'); dateCard.className = 'glass-card date-card';
      const dateObj = new Date(dateStr + 'T00:00:00'); // Ensure consistent parsing
      const formattedDate = dateObj.toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
      dateCard.innerHTML = `<h4>${formattedDate}</h4>`;
      const siteList = document.createElement('div');
      Object.entries(dayData).sort(([, a], [, b]) => b - a).forEach(([domain, time]) => {
        const item = document.createElement('div'); item.className = 'site-item';
        const category = siteCategories[domain] || 'other';
        item.innerHTML = `
          <img class="site-icon" src="https://www.google.com/s2/favicons?domain=${domain}" alt="${domain} icon" onerror="this.style.display='none'; this.onerror=null; this.src='logo.png';">
          <div class="site-name">${domain}</div><div class="site-time">${formatTime(time)}</div>
          <span class="category ${category.toLowerCase()}">${category.charAt(0).toUpperCase() + category.slice(1)}</span>`;
        siteList.appendChild(item);
      });
      dateCard.appendChild(siteList);
      historyDiv.appendChild(dateCard);
    });
  }

  function updateHistoryChart(dataForChart) {
    if (!historyChartCanvas) { 
      console.warn("updateHistoryChart: Canvas element not found."); 
      return; 
    }
    
    ensureChartJsLoaded().then(() => {
      console.log("updateHistoryChart: Updating chart with data:", dataForChart);
      try {
        const ctx = historyChartCanvas.getContext('2d');
        const categoryTimes = {};
        Object.values(dataForChart).forEach(dayData => Object.entries(dayData).forEach(([domain, time]) => {
          const cat = siteCategories[domain] || 'other';
          categoryTimes[cat] = (categoryTimes[cat] || 0) + time;
        }));
        const labels = Object.keys(categoryTimes), times = Object.values(categoryTimes);
        const backgroundColors = labels.map(cat => getCategoryColor(cat));
        if (labels.length === 0) { labels.push('No Data'); times.push(0); backgroundColors.push('#cccccc'); }

        const chartTextColor = (darkModeToggle && darkModeToggle.checked) ? 'white' : '#333';

        if (historyChartInstance) {
          console.log("updateHistoryChart: Updating existing instance.");
          historyChartInstance.data.labels = labels; historyChartInstance.data.datasets[0].data = times;
          historyChartInstance.data.datasets[0].backgroundColor = backgroundColors; 
          historyChartInstance.options.scales.y.ticks.color = chartTextColor;
          historyChartInstance.options.scales.x.ticks.color = chartTextColor;
          historyChartInstance.update();
        } else {
          console.log("updateHistoryChart: Creating new instance.");
          historyChartInstance = new Chart(ctx, {
            type: 'bar', data: { labels, datasets: [{ label: 'Time by Category', data: times, backgroundColor: backgroundColors, borderColor: 'rgba(255,255,255,0.2)', borderWidth:1 }] },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => formatTime(c.raw || 0) } } }, scales: { y: { beginAtZero: true, ticks: { color: chartTextColor, callback: v => formatTime(v, true) }, grid: { color: 'rgba(255,255,255,0.1)' } }, x: { ticks: { color: chartTextColor }, grid: { color: 'rgba(255,255,255,0.1)' } } } }
          });
        }
      } catch (error) { handleError(error, 'updateHistoryChart'); }
    }).catch(err => {
      handleError(err, 'updateHistoryChart - Chart.js loading');
    });
  }

  function updateProductivityInsights(dataForInsights) {
    if (!productivityInsightsDiv) { 
      console.warn("updateProductivityInsights: Div not found."); 
      return; 
    }
    
    console.log("updateProductivityInsights: Updating with data:", dataForInsights);
    productivityInsightsDiv.innerHTML = '';
    
    let totalTime = 0, workTime = 0, socialTime = 0, entertainmentTime = 0, otherTime = 0;
    
    Object.values(dataForInsights).forEach(domains => 
      Object.entries(domains).forEach(([domain, time]) => {
        totalTime += time;
        const cat = siteCategories[domain] || 'other';
        if (cat === 'work') workTime += time; 
        else if (cat === 'social') socialTime += time;
        else if (cat === 'entertainment') entertainmentTime += time;
        else otherTime += time;
      })
    );
    
    if (totalTime === 0) { 
      productivityInsightsDiv.innerHTML = '<div class="empty-state">No data available for insights.</div>'; 
      return; 
    }
    
    const workPct = totalTime > 0 ? Math.round((workTime / totalTime) * 100) : 0;
    const socialPct = totalTime > 0 ? Math.round((socialTime / totalTime) * 100) : 0;
    const entPct = totalTime > 0 ? Math.round((entertainmentTime / totalTime) * 100) : 0;
    const otherPct = totalTime > 0 ? Math.round((otherTime / totalTime) * 100) : 0;
    
    // Adjusted scoring: more weight to work, less to non-productive
    const score = Math.round((workPct * 1.2) - (socialPct * 0.2) - (entPct * 0.5) + (otherPct * 0.3));
    const clampedScore = Math.max(0, Math.min(100, score));

    productivityInsightsDiv.innerHTML = `
      <div class="productivity-score">
        <h4>Productivity Score</h4>
        <div class="score">${clampedScore}/100</div>
      </div>
      <div class="category-breakdown">
        <h4>Time Breakdown</h4>
        ${createProgressBar('Work', workPct, getCategoryColor('work'))}
        ${createProgressBar('Social', socialPct, getCategoryColor('social'))}
        ${createProgressBar('Entertainment', entPct, getCategoryColor('entertainment'))}
        ${createProgressBar('Other', otherPct, getCategoryColor('other'))}
      </div>
      <div class="recommendations">
        <h4>Recommendations</h4>
        <p>${getRecommendation(workPct, entPct, clampedScore)}</p>
      </div>`;
  }
  function createProgressBar(label, percentage, color) {
    return `<div class="category-item"><span>${label}</span><div class="progress-bar"><div class="progress" style="width: ${percentage}%; background-color: ${color};"></div></div><span>${percentage}%</span></div>`;
  }
  function getRecommendation(workPct, entPct, score) {
    if (score > 75) return 'Excellent focus and balance! Keep up the great work.';
    if (score < 40 && entPct > 40) return 'High entertainment usage. Consider reducing it to improve focus.';
    if (score < 50 && workPct < 30) return 'Try to allocate more time to productive, work-related sites.';
    if (entPct > 60) return 'Entertainment sites are taking a significant portion of your time. Setting limits might be helpful.';
    if (workPct > 60 && score > 70) return 'Great dedication to work! Ensure you take breaks.';
    return 'Strive for a healthy balance in your online activities.';
  }

  function renderCategories() {
    if (!categoriesListDiv) { console.warn("renderCategories: Div not found."); return; }
    console.log("renderCategories: Rendering category list.");
    categoriesListDiv.innerHTML = '';
    const uniqueDomains = new Set();
    Object.values(currentData).forEach(day => Object.keys(day).forEach(domain => uniqueDomains.add(domain)));
    Object.keys(siteCategories).forEach(domain => uniqueDomains.add(domain)); 

    if (uniqueDomains.size === 0) {
        categoriesListDiv.innerHTML = '<div class="empty-state">No sites tracked yet to categorize.</div>';
        return;
    }

    Array.from(uniqueDomains).sort().forEach(domain => {
      const currentCategory = siteCategories[domain] || 'other';
      const item = document.createElement('div'); item.className = 'settings-row';
      item.innerHTML = `<span>${domain}</span>
        <select class="category-select" data-domain="${domain}">
          ${['work', 'social', 'entertainment', 'other'].map(cat => `<option value="${cat}" ${currentCategory === cat ? 'selected' : ''}>${cat.charAt(0).toUpperCase() + cat.slice(1)}</option>`).join('')}
        </select>`;
      categoriesListDiv.appendChild(item);
      const selectEl = item.querySelector('.category-select');
      if (selectEl) {
        selectEl.addEventListener('change', (e) => {
          const selectedDomain = e.target.dataset.domain;
          const newCategory = e.target.value;
          console.log(`Category change: Domain ${selectedDomain} to ${newCategory}`);
          siteCategories[selectedDomain] = newCategory;
          chrome.storage.local.set({ categories: siteCategories }, () => {
            showNotification(`Category for ${selectedDomain} updated.`, 'success');
            renderAllComponents(); 
          });
        });
      }
    });
  }

  function renderSiteLimits() {
    if (!siteLimitsDiv) { console.warn("renderSiteLimits: Div not found."); return; }
    console.log("renderSiteLimits: Rendering site limits list.");
    siteLimitsDiv.innerHTML = '';
    if (Object.keys(appLimits).length === 0) {
      siteLimitsDiv.innerHTML = '<div class="empty-state">No site limits are currently set.</div>'; return;
    }
    Object.entries(appLimits).sort(([a], [b]) => a.localeCompare(b)).forEach(([domain, limitMins]) => {
      const item = document.createElement('div'); item.className = 'site-limit-row';
      item.innerHTML = `<span>${domain}</span><span>${limitMins} min</span>
        <button class="remove-limit" data-domain="${domain}" aria-label="Remove limit for ${domain}"><i class="fas fa-trash"></i></button>`;
      siteLimitsDiv.appendChild(item);
      const removeBtn = item.querySelector('.remove-limit');
      if (removeBtn) {
        removeBtn.addEventListener('click', (e) => {
          const domainToRemove = e.currentTarget.dataset.domain;
           console.log(`Removing limit for domain: ${domainToRemove}`);
          delete appLimits[domainToRemove];
          chrome.storage.local.set({ limits: appLimits }, () => {
            showNotification(`Limit for ${domainToRemove} removed.`, 'success');
            renderSiteLimits(); 
          });
        });
      }
    });
  }

  // --- Utility Functions ---
  function saveUserPreferences() {
    const preferences = {
      darkMode: darkModeToggle ? darkModeToggle.checked : false,
      showSeconds: showSecondsToggle ? showSecondsToggle.checked : true,
    };
    chrome.storage.local.set({ preferences }, () => console.log("Preferences saved:", preferences));
    
    const chartTextColor = preferences.darkMode ? 'white' : '#333';
    if (todayChartInstance) {
        todayChartInstance.options.plugins.legend.labels.color = chartTextColor;
        todayChartInstance.update();
    }
    if (historyChartInstance) {
        historyChartInstance.options.scales.y.ticks.color = chartTextColor;
        historyChartInstance.options.scales.x.ticks.color = chartTextColor;
        historyChartInstance.options.plugins.legend.labels.color = chartTextColor; // If legend is used
        historyChartInstance.update();
    }
  }

  function filterSites(query) {
    if (!timeListDiv) return;
    console.log(`Filtering sites with query: "${query}"`);
    timeListDiv.querySelectorAll('.site-item').forEach(item => {
      const nameElement = item.querySelector('.site-name');
      if (nameElement) {
        const name = nameElement.textContent.toLowerCase();
        item.style.display = name.includes(query) ? 'flex' : 'none';
      }
    });
  }

  function exportCurrentDayData() {
    console.log("exportCurrentDayData: Exporting today's data.");
    const todayStr = getCurrentDate();
    const dataToExport = { date: todayStr, sites: currentData[todayStr] || {} };
    downloadJSON(dataToExport, `tab-tracker-today-${todayStr}.json`);
    showNotification('Today\'s data exported!', 'success');
  }
  function exportAllTrackedData() {
    console.log("exportAllTrackedData: Exporting all data.");
    const dataToExport = { history: currentData, categories: siteCategories, settings: appSettings, limits: appLimits, preferences: {darkMode: darkModeToggle.checked, showSeconds: showSecondsToggle.checked} };
    downloadJSON(dataToExport, 'tab-tracker-all-data.json');
    showNotification('All data exported!', 'success');
  }
  function importTrackedData() {
    console.log("importTrackedData: Initiating import.");
    const input = document.createElement('input'); input.type = 'file'; input.accept = '.json';
    input.onchange = e => {
      const file = e.target.files[0]; if (!file) return;
      console.log(`importTrackedData: File selected: ${file.name}`);
      const reader = new FileReader();
      reader.onload = re => {
        try {
          const imported = JSON.parse(re.target.result);
          console.log("importTrackedData: Parsed imported data:", imported);
          let changesMade = false;
          const updateTasks = [];

          if (imported.history && typeof imported.history === 'object') { 
            currentData = {...currentData, ...imported.history}; 
            updateTasks.push(chrome.storage.local.set({ history: currentData }));
            changesMade = true; 
          }
          if (imported.categories && typeof imported.categories === 'object') { 
            siteCategories = {...siteCategories, ...imported.categories}; 
            updateTasks.push(chrome.storage.local.set({ categories: siteCategories }));
            changesMade = true; 
          }
          if (imported.settings && typeof imported.settings === 'object') { 
            appSettings = {...appSettings, ...imported.settings}; 
            updateTasks.push(chrome.storage.local.set({ settings: appSettings }));
            changesMade = true; 
          }
          if (imported.limits && typeof imported.limits === 'object') { 
            appLimits = {...appLimits, ...imported.limits}; 
            updateTasks.push(chrome.storage.local.set({ limits: appLimits }));
            changesMade = true; 
          }
           if (imported.preferences && typeof imported.preferences === 'object') { 
            const prefsToSet = {
                darkMode: imported.preferences.darkMode === true, // ensure boolean
                showSeconds: imported.preferences.showSeconds !== false // ensure boolean, default true
            };
            updateTasks.push(chrome.storage.local.set({ preferences: prefsToSet }));
            changesMade = true; 
          }
          
          if (changesMade) {
            Promise.all(updateTasks).then(() => {
                showNotification('Data imported successfully!', 'success');
                console.log("importTrackedData: All data saved to storage. Refreshing UI.");
                fetchDataAndRender(); 
            }).catch(err => handleError(err, 'importTrackedData - saving to storage'));
          } else {
            showNotification('No new data found in file or file format incorrect.', 'info');
          }
        } catch (err) { handleError(err, 'importTrackedData - JSON parsing/processing'); }
      };
      reader.readAsText(file);
    };
    input.click();
  }
  function downloadJSON(data, filename) {
    try {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = filename;
        document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
    } catch(error) { handleError(error, 'downloadJSON'); }
  }
  
  function showNotification(message, type = 'info') { 
    if (!notificationDiv) { console.warn("showNotification: notificationDiv not found."); return; }
    notificationDiv.textContent = message;
    notificationDiv.className = `notification ${type.toLowerCase()}`; 
    notificationDiv.classList.add('show');
    setTimeout(() => notificationDiv.classList.remove('show'), 3000);
  }
  function handleError(error, context) {
    const errorMessage = error.message || (typeof error === 'string' ? error : 'Unknown error');
    console.error(`Error in ${context}:`, errorMessage, error.stack || error);
    showNotification(`Error in ${context}: ${errorMessage.substring(0,100)}`, 'error'); // Keep notification short
  }
  function getCurrentDate() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
  function formatDate(d) { 
      if (!(d instanceof Date) || isNaN(d.getTime())) {
          console.warn("formatDate: Invalid date object received", d);
          // Attempt to parse if it's a string that might be a date
          if (typeof d === 'string') d = new Date(d + "T00:00:00"); // Add time to avoid timezone issues with YYYY-MM-DD
          if (!(d instanceof Date) || isNaN(d.getTime())) return getCurrentDate(); // Fallback
      }
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; 
  }
  
  function formatTime(totalSeconds, short = false) {
    if (isNaN(totalSeconds) || totalSeconds < 0) totalSeconds = 0;
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = Math.floor(totalSeconds % 60);
    if (short) return h > 0 ? `${h}h` : m > 0 ? `${m}m` : `${s}s`;
    
    const showSec = (showSecondsToggle && typeof showSecondsToggle.checked !== 'undefined') ? 
      showSecondsToggle.checked : true;
    let parts = [];
    if (h > 0) parts.push(`${h}h`);
    if (m > 0 || (h > 0 && (s > 0 || parts.length === 0))) parts.push(`${m}m`);
    if (showSec || (parts.length === 0 && s > 0) || (parts.length === 0 && totalSeconds === 0)) {
      parts.push(`${s}s`);
    }
    return parts.join(' ') || '0s';
  }
  function getCategoryColor(category) {
    const colors = { work: 'rgba(50, 205, 50, 0.8)', social: 'rgba(30, 144, 255, 0.8)', entertainment: 'rgba(255, 99, 132, 0.8)', other: 'rgba(150, 150, 150, 0.8)' };
    return colors[(category || 'other').toLowerCase()] || colors.other;
  }

  // --- Debug Panel ---
  function addDebugPanel() {
    const settingsContent = document.getElementById('settings');
    if (!settingsContent) { console.warn("addDebugPanel: Settings content div not found."); return; }
    const card = document.createElement('div'); card.className = 'glass-card';
    card.innerHTML = `<h3>Troubleshooting</h3>
      <div class="settings-row"><span>Show Debug Info</span><label class="toggle-switch"><input type="checkbox" id="debugToggle"><span class="toggle-slider"></span></label></div>
      <div id="debugInfo" style="display:none; font-size:11px; background:rgba(0,0,0,0.2); padding:8px; border-radius:4px; max-height:150px; overflow-y:auto; word-break:break-all; color: #eee;"></div>
      <div style="margin-top:10px; display:flex; flex-wrap:wrap; gap:10px;">
        <button id="refreshDataDebug">Refresh Data</button>
        <button id="repairStorageDebug">Repair Storage</button>
        <button id="generateMockDataDebug" style="background: rgba(76, 175, 80, 0.7);">Generate Test Data</button>
        <button id="injectTodayDataDebug" style="background: rgba(255, 152, 0, 0.7);">Add Sample Data</button>
      </div>`;
    settingsContent.appendChild(card);

    const debugToggleEl = document.getElementById('debugToggle');
    const debugInfoDivEl = document.getElementById('debugInfo');
    if (debugToggleEl && debugInfoDivEl) {
      debugToggleEl.addEventListener('change', () => {
        debugInfoDivEl.style.display = debugToggleEl.checked ? 'block' : 'none';
        if (debugToggleEl.checked) updateDebugInfo(debugInfoDivEl);
      });
    }
    
    const refreshBtn = document.getElementById('refreshDataDebug');
    if (refreshBtn) refreshBtn.addEventListener('click', () => { 
      console.log("Debug: Refresh Data button clicked."); 
      fetchDataAndRender(); 
      showNotification('Data refreshed via debug.', 'info'); 
      if(debugToggleEl && debugToggleEl.checked && debugInfoDivEl) updateDebugInfo(debugInfoDivEl); 
    });
    
    const repairBtn = document.getElementById('repairStorageDebug');
    if(repairBtn) repairBtn.addEventListener('click', () => {
      console.log("Debug: Repair Storage button clicked.");
      chrome.storage.local.get(null, (data) => {
        const repairedData = {
          history: data.history || {},
          categories: data.categories || siteCategories,
          settings: data.settings || { enableTimeLimits: false },
          limits: data.limits || {},
          preferences: data.preferences || { darkMode: darkModeToggle.checked, showSeconds: true }
        };
        chrome.storage.local.set(repairedData, () => {
          showNotification('Storage integrity check/repair attempted.', 'success');
          fetchDataAndRender(); 
          if(debugToggleEl && debugToggleEl.checked && debugInfoDivEl) updateDebugInfo(debugInfoDivEl);
        });
      });
    });
    
    // Add mock data generator button
    const generateMockBtn = document.getElementById('generateMockDataDebug');
    if(generateMockBtn) generateMockBtn.addEventListener('click', () => {
      console.log("Debug: Generate Mock Data button clicked.");
      currentData = generateMockData();
      showNotification('Test data generated! Note: This is not saved to storage.', 'success');
      renderAllComponents();
      if(debugToggleEl && debugToggleEl.checked && debugInfoDivEl) updateDebugInfo(debugInfoDivEl);
    });
    
    // Add sample data injection button
    const injectTodayBtn = document.getElementById('injectTodayDataDebug');
    if(injectTodayBtn) injectTodayBtn.addEventListener('click', injectSampleDataForToday);
  }
  function updateDebugInfo(debugInfoDivElement) {
    if (!debugInfoDivElement) return;
    chrome.storage.local.get(null, (data) => {
      const manifest = chrome.runtime.getManifest();
      const info = {
        Version: manifest.version,
        Name: manifest.name,
        Timestamp: new Date().toLocaleTimeString(),
        HistoryKeys: Object.keys(data.history || {}).length,
        CategoriesKeys: Object.keys(data.categories || {}).length,
        LimitsKeys: Object.keys(data.limits || {}).length,
        Settings: JSON.stringify(data.settings),
        Preferences: JSON.stringify(data.preferences),
        UserAgent: navigator.userAgent.substring(0, 70) + "..."
      };
      debugInfoDivElement.innerHTML = Object.entries(info).map(([k, v]) => `<div><strong>${k}:</strong> ${v}</div>`).join('');
    });
  }

  // Add this function to generate test data
  function generateMockData() {
    console.log("Generating mock data for testing...");
    
    // Get current date and recent dates
    const today = getCurrentDate();
    const yesterday = formatDate(new Date(Date.now() - 86400000));
    const twoDaysAgo = formatDate(new Date(Date.now() - 172800000));
    
    // Create test data structure
    const testData = {
      [today]: {
        "google.com": 3600, // 1 hour
        "youtube.com": 1800, // 30 mins
        "github.com": 2700, // 45 mins
        "facebook.com": 900, // 15 mins
        "stackoverflow.com": 1200 // 20 mins
      },
      [yesterday]: {
        "google.com": 2400, // 40 mins
        "youtube.com": 3600, // 1 hour
        "github.com": 1500 // 25 mins
      },
      [twoDaysAgo]: {
        "netflix.com": 5400, // 1.5 hours
        "facebook.com": 1800 // 30 mins
      }
    };
    
    return testData;
  }

  // Start the application
  initializeApp();
  function testBackgroundConnection() {
    console.log("Testing connection to background script...");
    chrome.runtime.sendMessage({ action: 'ping' }, (response) => {
      if (chrome.runtime.lastError) {
        console.error("Background connection error:", chrome.runtime.lastError);
        showNotification('Error connecting to background script: ' + chrome.runtime.lastError.message, 'error');
        return;
      }
      
      if (response && response.status === 'success') {
        console.log("Background connection successful!");
        showNotification('Background script connection OK', 'success');
      } else {
        console.warn("Background returned unexpected response:", response);
        showNotification('Unexpected background script response', 'error');
      }
    });
  }

  // Call this after initApp
  setTimeout(testBackgroundConnection, 1000);

  function createFallbackChart(canvasElement, data, type = 'today') {
    if (!canvasElement) return;
    
    // Clear the canvas
    const ctx = canvasElement.getContext('2d');
    ctx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    
    // Create a div to replace the canvas
    const fallbackDiv = document.createElement('div');
    fallbackDiv.className = 'fallback-chart';
    fallbackDiv.style.height = '100%';
    fallbackDiv.style.overflowY = 'auto';
    fallbackDiv.style.padding = '10px';
    
    // Add fallback content based on chart type
    if (type === 'today') {
      const domains = Array.isArray(data) ? data : [];
      if (domains.length === 0) {
        fallbackDiv.innerHTML = '<div class="empty-state">No data available for visualization</div>';
      } else {
        const content = domains.map(([domain, time]) => {
          const category = siteCategories[domain] || 'other';
          const color = getCategoryColor(category);
          return `<div class="fallback-item">
            <div class="color-dot" style="background-color: ${color}"></div>
            <div class="domain-name">${domain}</div>
            <div class="domain-time">${formatTime(time)}</div>
          </div>`;
        }).join('');
        fallbackDiv.innerHTML = `<h4>Today's Stats</h4>${content}`;
      }
    } else {
      // Handle history chart fallback
      const categories = Object.entries(data || {}).filter(([_, time]) => time > 0);
      if (categories.length === 0) {
        fallbackDiv.innerHTML = '<div class="empty-state">No category data available</div>';
      } else {
        const content = categories.map(([category, time]) => {
          const color = getCategoryColor(category);
          return `<div class="fallback-item">
            <div class="color-dot" style="background-color: ${color}"></div>
            <div class="domain-name">${category}</div>
            <div class="domain-time">${formatTime(time)}</div>
          </div>`;
        }).join('');
        fallbackDiv.innerHTML = `<h4>Category Breakdown</h4>${content}`;
      }
    }
    
    // Add the fallback div
    canvasElement.parentNode.insertBefore(fallbackDiv, canvasElement);
    canvasElement.style.display = 'none';
    
    // Add some styling
    const style = document.createElement('style');
    style.textContent = `
      .fallback-chart {
        font-size: 12px;
        background: rgba(255,255,255,0.1);
        border-radius: 8px;
      }
      .fallback-item {
        display: flex;
        align-items: center;
        padding: 5px 0;
        border-bottom: 1px solid rgba(255,255,255,0.1);
      }
      .color-dot {
        width: 12px;
        height: 12px;
        border-radius: 50%;
        margin-right: 8px;
      }
      .domain-name {
        flex: 1;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .domain-time {
        margin-left: 8px;
        font-weight: 500;
      }
    `;
    document.head.appendChild(style);
  }
});
