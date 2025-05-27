document.addEventListener("DOMContentLoaded", () => {
  // Cache DOM elements
  const tabButtons = document.querySelectorAll('.tab');
  const contentDivs = document.querySelectorAll('.content');
  const resetButton = document.getElementById("resetButton");
  const exportButton = document.getElementById("exportButton");
  const timeListDiv = document.getElementById("timeList");
  const totalTimeDiv = document.getElementById("totalTime");
  const historyDiv = document.getElementById("history");
  const darkModeToggle = document.getElementById("darkModeToggle");
  const showSecondsToggle = document.getElementById("showSecondsToggle");
  const timeRangeSelect = document.getElementById("timeRangeSelect");
  const siteSearch = document.getElementById("siteSearch");
  const exportDataButton = document.getElementById("exportDataButton");
  const importDataButton = document.getElementById("importDataButton");
  const clearDataButton = document.getElementById("clearDataButton");
  const timeLimitsToggle = document.getElementById("timeLimitsToggle");
  const customDateRange = document.getElementById("customDateRange");
  const applyRange = document.getElementById("applyRange");
  const notification = document.getElementById("notification");
  
  // Charts
  let todayChart = null;
  let historyChart = null;

  // Track current data
  let currentData = {};
  let categoryData = {};
  let siteCategories = {
    // Default categories
    "google.com": "work",
    "youtube.com": "entertainment",
    "facebook.com": "social",
    "instagram.com": "social",
    "github.com": "work",
    "netflix.com": "entertainment"
  };

  // Initialize tab navigation
  tabButtons.forEach(button => {
    button.addEventListener('click', () => {
      tabButtons.forEach(btn => btn.classList.remove('active'));
      button.classList.add('active');
      
      const tabName = button.getAttribute('data-tab');
      contentDivs.forEach(div => {
        if (div.id === tabName) {
          div.classList.add('active');
        } else {
          div.classList.remove('active');
        }
      });
    });
  });

  // Initialize user preferences
  initializeUserPreferences();

  // Fetch and display session data
  fetchDataAndRender();

  // Event listener for search functionality
  siteSearch.addEventListener("input", () => {
    filterSites(siteSearch.value.toLowerCase());
  });

  // Time range selection
  timeRangeSelect.addEventListener("change", () => {
    if (timeRangeSelect.value === "custom") {
      customDateRange.style.display = "block";
    } else {
      customDateRange.style.display = "none";
      updateAnalytics(timeRangeSelect.value);
    }
  });

  // Apply custom date range
  applyRange.addEventListener("click", () => {
    const startDate = document.getElementById("startDate").value;
    const endDate = document.getElementById("endDate").value;
    updateAnalytics("custom", startDate, endDate);
  });

  // Handle reset button
  resetButton.addEventListener("click", () => {
    chrome.runtime.sendMessage({ action: 'resetTimers' }, (response) => {
      showNotification(response.message);
      fetchDataAndRender();
    });
  });

  // Handle export button
  exportButton.addEventListener("click", () => {
    exportCurrentData();
  });

  // Handle export all data button
  exportDataButton.addEventListener("click", () => {
    exportAllData();
  });

  // Handle import data button
  importDataButton.addEventListener("click", () => {
    importData();
  });

  // Handle clear data button
  clearDataButton.addEventListener("click", () => {
    if (confirm("Are you sure you want to clear all tracking data? This cannot be undone.")) {
      chrome.runtime.sendMessage({ action: 'clearAllData' }, (response) => {
        showNotification(response.message);
        fetchDataAndRender();
      });
    }
  });

  // Dark mode toggle
  darkModeToggle.addEventListener("change", () => {
    document.body.classList.toggle("dark-mode", darkModeToggle.checked);
    saveUserPreferences();
  });

  // Show seconds toggle
  showSecondsToggle.addEventListener("change", () => {
    saveUserPreferences();
    renderData(currentData);
  });

  // Time limits toggle
  timeLimitsToggle.addEventListener("change", () => {
    chrome.runtime.sendMessage({ 
      action: 'updateSettings',
      settings: { enableTimeLimits: timeLimitsToggle.checked } 
    });
    saveUserPreferences();
  });

  // Debug panel for troubleshooting
  function addDebugPanel() {
    const settingsTab = document.getElementById('settings');
    if (!settingsTab) return;
    
    const debugCard = document.createElement('div');
    debugCard.className = 'glass-card';
    debugCard.innerHTML = `
      <h3>Troubleshooting</h3>
      <div class="settings-row">
        <span>Show Debug Info</span>
        <label class="toggle-switch">
          <input type="checkbox" id="debugToggle">
          <span class="toggle-slider"></span>
        </label>
      </div>
      <div id="debugInfo" style="display: none; font-size: 12px; background: rgba(0,0,0,0.3); padding: 10px; border-radius: 4px; max-height: 200px; overflow-y: auto;"></div>
      <button id="refreshDataButton">Refresh Data</button>
      <button id="fixStorageButton">Repair Storage</button>
    `;
    
    settingsTab.appendChild(debugCard);
    
    // Toggle debug info
    const debugToggle = document.getElementById('debugToggle');
    const debugInfo = document.getElementById('debugInfo');
    
    if (debugToggle && debugInfo) {
      debugToggle.addEventListener('change', () => {
        debugInfo.style.display = debugToggle.checked ? 'block' : 'none';
        
        if (debugToggle.checked) {
          updateDebugInfo();
        }
      });
    }
    
    // Refresh data
    const refreshButton = document.getElementById('refreshDataButton');
    if (refreshButton) {
      refreshButton.addEventListener('click', () => {
        fetchDataAndRender();
        showNotification('Data refreshed');
        
        if (debugToggle.checked) {
          updateDebugInfo();
        }
      });
    }
    
    // Fix storage button
    const fixStorageButton = document.getElementById('fixStorageButton');
    if (fixStorageButton) {
      fixStorageButton.addEventListener('click', () => {
        chrome.storage.local.get(null, (data) => {
          // Ensure required objects exist
          if (!data.history) data.history = {};
          if (!data.categories) data.categories = siteCategories;
          if (!data.settings) data.settings = { enableTimeLimits: false };
          if (!data.limits) data.limits = {};
          if (!data.preferences) data.preferences = { darkMode: false, showSeconds: true };
          
          // Save fixed data
          chrome.storage.local.set(data, () => {
            showNotification('Storage repaired');
            fetchDataAndRender();
            
            if (debugToggle.checked) {
              updateDebugInfo();
            }
          });
        });
      });
    }
    
    function updateDebugInfo() {
      chrome.storage.local.get(null, (data) => {
        const info = {
          'Extension Version': '2.0',
          'History Entries': Object.keys(data.history || {}).length,
          'Categories': Object.keys(data.categories || {}).length,
          'Time Limits': Object.keys(data.limits || {}).length,
          'Settings': JSON.stringify(data.settings || {}),
          'Active Tab ID': activeTabId || 'None',
          'Browser': navigator.userAgent
        };
        
        let html = '';
        for (const [key, value] of Object.entries(info)) {
          html += `<div><strong>${key}:</strong> ${value}</div>`;
        }
        
        if (debugInfo) {
          debugInfo.innerHTML = html;
        }
      });
    }
  }

  // Improved error handling
  function handleError(error, context) {
    console.error(`Error in ${context}:`, error);
    showNotification(`Error: ${error.message || 'Unknown error'}`, 'error');
  }

  // Enhanced fetch data function
  function fetchDataAndRender() {
    chrome.storage.local.get(['history', 'categories', 'settings', 'limits'], (data) => {
      try {
        if (chrome.runtime.lastError) {
          throw new chrome.runtime.lastError;
        }
        
        currentData = data.history || {};
        siteCategories = data.categories || siteCategories;
        
        console.log("Fetched data:", { 
          historyEntries: Object.keys(currentData).length,
          categories: Object.keys(siteCategories).length 
        });
        
        renderData(currentData);
        updateAnalytics(timeRangeSelect.value);
        renderCategories();
        renderSiteLimits();
        
        // Update time limits toggle based on settings
        if (data.settings && timeLimitsToggle) {
          timeLimitsToggle.checked = data.settings.enableTimeLimits || false;
        }
      } catch (error) {
        handleError(error, 'fetchDataAndRender');
      }
    });
  }
  
  // Improved render data function with error handling
  function renderData(data) {
    try {
      const currentDate = getCurrentDate();
      const todayData = data[currentDate] || {};
      
      console.log(`Rendering data for ${currentDate}, found ${Object.keys(todayData).length} domains`);
      
      // Sort domains by time spent (descending)
      const sortedDomains = Object.entries(todayData)
        .sort(([, timeA], [, timeB]) => timeB - timeA);
      
      // Calculate total time
      let totalTimeSpent = Object.values(todayData).reduce((total, time) => total + time, 0);
      
      // Render time list
      timeListDiv.innerHTML = '';
      if (sortedDomains.length === 0) {
        timeListDiv.innerHTML = '<div class="empty-state">No tracking data for today yet.</div>';
      } else {
        sortedDomains.forEach(([domain, timeSpent]) => {
          const element = document.createElement('div');
          element.className = 'site-item';
          
          const category = siteCategories[domain] || 'other';
          
          element.innerHTML = `
            <img class="site-icon" src="https://www.google.com/s2/favicons?domain=${domain}" onerror="this.src='icon-fallback.png'">
            <div class="site-name">${domain}</div>
            <div class="site-time">${formatTime(timeSpent)}</div>
            <span class="category ${category}">${category}</span>
          `;
          timeListDiv.appendChild(element);
        });
      }
      
      // Update total time display
      if (totalTimeDiv) {
        totalTimeDiv.textContent = `Total Time: ${formatTime(totalTimeSpent)}`;
      }
      
      // Update chart
      updateTodayChart(sortedDomains);
    } catch (error) {
      handleError(error, 'renderData');
    }
  }
  
  // Fixed update today chart function
  function updateTodayChart(domainData) {
    try {
      // Check if chart container exists
      const chartCanvas = document.getElementById('todayChart');
      if (!chartCanvas) {
        console.error("Chart canvas element not found");
        return;
      }
      
      // Process data for the chart
      const labels = [];
      const data = [];
      const backgroundColors = [];
      
      // Limit to top 5 for chart visualization
      const topDomains = domainData.slice(0, 5);
      
      // Add domain data
      topDomains.forEach(([domain, time]) => {
        labels.push(domain);
        data.push(time);
        
        // Assign color based on category
        const category = siteCategories[domain] || 'other';
        const color = getCategoryColor(category);
        backgroundColors.push(color);
      });
      
      // If there are more than 5 domains, add an "Others" category
      if (domainData.length > 5) {
        const otherTime = domainData.slice(5).reduce((total, [, time]) => total + time, 0);
        labels.push('Others');
        data.push(otherTime);
        backgroundColors.push('rgba(150, 150, 150, 0.7)');
      }
      
      // If no data, add placeholder
      if (labels.length === 0) {
        labels.push('No Data');
        data.push(1);
        backgroundColors.push('rgba(200, 200, 200, 0.3)');
      }
      
      console.log("Chart data:", { labels, data });
      
      // Create or update the chart
      const ctx = chartCanvas.getContext('2d');
      
      if (todayChart) {
        todayChart.data.labels = labels;
        todayChart.data.datasets[0].data = data;
        todayChart.data.datasets[0].backgroundColor = backgroundColors;
        todayChart.update();
      } else {
        todayChart = new Chart(ctx, {
          type: 'doughnut',
          data: {
            labels: labels,
            datasets: [{
              data: data,
              backgroundColor: backgroundColors,
              borderWidth: 1,
              borderColor: 'rgba(255, 255, 255, 0.5)'
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: {
                position: 'bottom',
                labels: {
                  color: 'white',
                  font: {
                    size: 10
                  },
                  boxWidth: 12
                }
              },
              tooltip: {
                callbacks: {
                  label: function(context) {
                    const label = context.label || '';
                    const value = context.raw || 0;
                    return `${label}: ${formatTime(value)}`;
                  }
                }
              }
            }
          }
        });
      }
    } catch (error) {
      handleError(error, 'updateTodayChart');
    }
  }
  
  // Fixed update analytics function
  function updateAnalytics(timeRange, startDate, endDate) {
    try {
      console.log(`Updating analytics for range: ${timeRange}`);
      
      let filteredData = {};
      const currentDate = new Date();
      
      switch (timeRange) {
        case 'day':
          const todayStr = getCurrentDate();
          filteredData[todayStr] = currentData[todayStr] || {};
          break;
        
        case 'week':
          // Get data for the last 7 days
          for (let i = 0; i < 7; i++) {
            const date = new Date(currentDate);
            date.setDate(date.getDate() - i);
            const dateStr = formatDate(date);
            if (currentData[dateStr]) {
              filteredData[dateStr] = currentData[dateStr];
            }
          }
          break;
        
        case 'month':
          // Get data for the current month
          const firstDay = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
          const lastDay = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
          
          for (let d = new Date(firstDay); d <= lastDay; d.setDate(d.getDate() + 1)) {
            const dateStr = formatDate(new Date(d));
            if (currentData[dateStr]) {
              filteredData[dateStr] = currentData[dateStr];
            }
          }
          break;
        
        case 'custom':
          if (!startDate || !endDate) {
            showNotification('Please select both start and end dates', 'error');
            return;
          }
          
          // Parse custom date range
          const start = new Date(startDate);
          const end = new Date(endDate);
          
          if (isNaN(start.getTime()) || isNaN(end.getTime())) {
            showNotification('Invalid date range', 'error');
            return;
          }
          
          if (start > end) {
            showNotification('Start date must be before end date', 'error');
            return;
          }
          
          for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
            const dateStr = formatDate(new Date(d));
            if (currentData[dateStr]) {
              filteredData[dateStr] = currentData[dateStr];
            }
          }
          break;
      }
      
      console.log(`Filtered data has ${Object.keys(filteredData).length} days`);
      
      renderHistoryData(filteredData);
      updateHistoryChart(filteredData);
      updateProductivityInsights(filteredData);
    } catch (error) {
      handleError(error, 'updateAnalytics');
    }
  }
  
  // Fix update history chart
  function updateHistoryChart(data) {
    try {
      // Check if chart container exists
      const chartCanvas = document.getElementById('historyChart');
      if (!chartCanvas) {
        console.error("History chart canvas element not found");
        return;
      }
      
      // Aggregate data by category
      const categoryTimes = {};
      
      Object.values(data).forEach(domains => {
        Object.entries(domains).forEach(([domain, time]) => {
          const category = siteCategories[domain] || 'other';
          
          if (!categoryTimes[category]) {
            categoryTimes[category] = 0;
          }
          
          categoryTimes[category] += time;
        });
      });
      
      // Prepare chart data
      const labels = Object.keys(categoryTimes);
      const times = Object.values(categoryTimes);
      const backgroundColors = labels.map(category => getCategoryColor(category));
      
      console.log("History chart data:", { categories: labels, times });
      
      // If no data, add placeholder
      if (labels.length === 0) {
        labels.push('No Data');
        times.push(0);
        backgroundColors.push('rgba(200, 200, 200, 0.3)');
      }
      
      // Create or update the chart
      const ctx = chartCanvas.getContext('2d');
      
      if (historyChart) {
        historyChart.data.labels = labels;
        historyChart.data.datasets[0].data = times;
        historyChart.data.datasets[0].backgroundColor = backgroundColors;
        historyChart.update();
      } else {
        historyChart = new Chart(ctx, {
          type: 'bar',
          data: {
            labels: labels,
            datasets: [{
              label: 'Time by Category',
              data: times,
              backgroundColor: backgroundColors,
              borderColor: 'rgba(255, 255, 255, 0.3)',
              borderWidth: 1
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: {
                display: false
              },
              tooltip: {
                callbacks: {
                  label: function(context) {
                    return formatTime(context.raw);
                  }
                }
              }
            },
            scales: {
              y: {
                beginAtZero: true,
                ticks: {
                  color: 'white',
                  callback: function(value) {
                    return formatTime(value, true);
                  }
                },
                grid: {
                  color: 'rgba(255, 255, 255, 0.1)'
                }
              },
              x: {
                ticks: {
                  color: 'white'
                },
                grid: {
                  color: 'rgba(255, 255, 255, 0.1)'
                }
              }
            }
          }
        });
      }
    } catch (error) {
      handleError(error, 'updateHistoryChart');
    }
  }
  
  // Improved notification system
  function showNotification(message, type = 'info') {
    if (!notification) return;
    
    notification.textContent = message;
    notification.className = `notification ${type}`;
    notification.classList.add('show');
    
    setTimeout(() => {
      notification.classList.remove('show');
    }, 3000);
  }
  
  // Initialize the extension with better error handling
  try {
    initializeUserPreferences();
    fetchDataAndRender();
    console.log("Extension initialized successfully");
  } catch (error) {
    handleError(error, 'initialization');
  }
  
  // Add category button functionality
  const addCategoryButton = document.getElementById('addCategoryButton');
  if (addCategoryButton) {
    addCategoryButton.addEventListener('click', () => {
      const domain = prompt('Enter domain to categorize (e.g., example.com):');
      if (!domain) return;
      
      const category = prompt('Enter category (work, social, entertainment, other):');
      if (!['work', 'social', 'entertainment', 'other'].includes(category)) {
        showNotification('Invalid category. Please use work, social, entertainment, or other.', 'error');
        return;
      }
      
      siteCategories[domain] = category;
      chrome.storage.local.set({ categories: siteCategories }, () => {
        showNotification('Category added!');
        renderCategories();
        renderData(currentData);
        updateAnalytics(timeRangeSelect.value);
      });
    });
  }
  
  // Add or update this function in your popup.js file

  function renderSiteLimits() {
    try {
      const siteLimits = document.getElementById('siteLimits');
      if (!siteLimits) {
        console.error("Site limits element not found");
        return;
      }
      
      siteLimits.innerHTML = '';
      
      // Get saved limits
      chrome.storage.local.get('limits', (data) => {
        const limits = data.limits || {};
        
        console.log("Site limits:", limits);
        
        if (Object.keys(limits).length === 0) {
          siteLimits.innerHTML = '<div class="empty-state">No site limits set. Add some below.</div>';
          return;
        }
        
        // Create limit elements
        Object.entries(limits).forEach(([domain, limit]) => {
          const limitItem = document.createElement('div');
          limitItem.className = 'site-limit-row';
          limitItem.innerHTML = `
            <span>${domain}</span>
            <span>${limit} minutes</span>
            <button class="remove-limit" data-domain="${domain}"><i class="fas fa-trash"></i></button>
          `;
          
          siteLimits.appendChild(limitItem);
          
          // Add event listener to remove button
          const removeButton = limitItem.querySelector('.remove-limit');
          if (removeButton) {
            removeButton.addEventListener('click', () => {
              delete limits[domain];
              chrome.storage.local.set({ limits }, () => {
                showNotification('Limit removed!');
                renderSiteLimits();
              });
            });
          }
        });
      });
    } catch (error) {
      console.error("Error in renderSiteLimits:", error);
      showNotification("Error rendering site limits", "error");
    }
  }

  // Add the debug panel
  addDebugPanel();
});