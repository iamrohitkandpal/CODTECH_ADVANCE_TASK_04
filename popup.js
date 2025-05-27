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

  function fetchDataAndRender() {
    chrome.storage.local.get(['history', 'categories', 'settings'], (data) => {
      if (chrome.runtime.lastError) {
        console.error(chrome.runtime.lastError);
        return;
      }
      
      currentData = data.history || {};
      siteCategories = data.categories || siteCategories;
      renderData(currentData);
      updateAnalytics(timeRangeSelect.value);
      renderCategories();
      renderSiteLimits();
    });
  }
  
  function renderData(data) {
    const currentDate = getCurrentDate();
    const todayData = data[currentDate] || {};
    
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
    totalTimeDiv.textContent = `Total Time: ${formatTime(totalTimeSpent)}`;
    
    // Update chart
    updateTodayChart(sortedDomains);
  }
  
  function updateTodayChart(domainData) {
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
    
    // Create or update the chart
    const ctx = document.getElementById('todayChart').getContext('2d');
    
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
            borderWidth: 1
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
                }
              }
            }
          }
        }
      });
    }
  }
  
  function updateAnalytics(timeRange, startDate, endDate) {
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
        
        for (let d = firstDay; d <= lastDay; d.setDate(d.getDate() + 1)) {
          const dateStr = formatDate(d);
          if (currentData[dateStr]) {
            filteredData[dateStr] = currentData[dateStr];
          }
        }
        break;
      
      case 'custom':
        // Parse custom date range
        const start = new Date(startDate);
        const end = new Date(endDate);
        
        for (let d = start; d <= end; d.setDate(d.getDate() + 1)) {
          const dateStr = formatDate(d);
          if (currentData[dateStr]) {
            filteredData[dateStr] = currentData[dateStr];
          }
        }
        break;
    }
    
    renderHistoryData(filteredData);
    updateHistoryChart(filteredData);
    updateProductivityInsights(filteredData);
  }
  
  function renderHistoryData(data) {
    historyDiv.innerHTML = '';
    
    if (Object.keys(data).length === 0) {
      historyDiv.innerHTML = '<div class="empty-state">No data available for this time period.</div>';
      return;
    }
    
    // Sort dates from newest to oldest
    const sortedDates = Object.keys(data).sort((a, b) => new Date(b) - new Date(a));
    
    sortedDates.forEach(date => {
      const dateDiv = document.createElement('div');
      dateDiv.className = 'glass-card date-card';
      
      const formattedDate = new Date(date).toLocaleDateString('en-US', {
        weekday: 'short',
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
      
      dateDiv.innerHTML = `<h4>${formattedDate}</h4>`;
      
      const domains = Object.entries(data[date])
        .sort(([, timeA], [, timeB]) => timeB - timeA);
      
      const siteList = document.createElement('div');
      
      domains.forEach(([domain, time]) => {
        const siteItem = document.createElement('div');
        siteItem.className = 'site-item';
        
        const category = siteCategories[domain] || 'other';
        
        siteItem.innerHTML = `
          <img class="site-icon" src="https://www.google.com/s2/favicons?domain=${domain}" onerror="this.src='icon-fallback.png'">
          <div class="site-name">${domain}</div>
          <div class="site-time">${formatTime(time)}</div>
          <span class="category ${category}">${category}</span>
        `;
        siteList.appendChild(siteItem);
      });
      
      dateDiv.appendChild(siteList);
      historyDiv.appendChild(dateDiv);
    });
  }

  function updateHistoryChart(data) {
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
    
    // Create or update the chart
    const ctx = document.getElementById('historyChart').getContext('2d');
    
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
            backgroundColor: backgroundColors
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
              ticks: {
                color: 'white',
                callback: function(value) {
                  return formatTime(value, true);
                }
              }
            },
            x: {
              ticks: {
                color: 'white'
              }
            }
          }
        }
      });
    }
  }
  
  function updateProductivityInsights(data) {
    const insightsDiv = document.getElementById('productivityInsights');
    insightsDiv.innerHTML = '';
    
    // Calculate total time
    let totalTime = 0;
    let workTime = 0;
    let socialTime = 0;
    let entertainmentTime = 0;
    
    Object.values(data).forEach(domains => {
      Object.entries(domains).forEach(([domain, time]) => {
        totalTime += time;
        const category = siteCategories[domain] || 'other';
        if (category === 'work') workTime += time;
        if (category === 'social') socialTime += time;
        if (category === 'entertainment') entertainmentTime += time;
      });
    });
    
    // If no data, show a message
    if (totalTime === 0) {
      insightsDiv.innerHTML = '<div class="empty-state">No data available for insights.</div>';
      return;
    }
    
    // Calculate percentages
    const workPercent = Math.round((workTime / totalTime) * 100);
    const socialPercent = Math.round((socialTime / totalTime) * 100);
    const entertainmentPercent = Math.round((entertainmentTime / totalTime) * 100);
    
    // Add productivity score (simple calculation - higher work percentage = higher score)
    const productivityScore = Math.round(workPercent * 0.8 + (100 - entertainmentPercent - socialPercent) * 0.2);
    
    const scoreElement = document.createElement('div');
    scoreElement.className = 'productivity-score';
    scoreElement.innerHTML = `
      <h4>Productivity Score</h4>
      <div class="score">${productivityScore}/100</div>
    `;
    insightsDiv.appendChild(scoreElement);
    
    const breakdownElement = document.createElement('div');
    breakdownElement.className = 'category-breakdown';
    breakdownElement.innerHTML = `
      <h4>Time Breakdown</h4>
      <div class="category-item">
        <span>Work</span>
        <div class="progress-bar">
          <div class="progress" style="width: ${workPercent}%; background-color: rgba(50, 205, 50, 0.7);"></div>
        </div>
        <span>${workPercent}%</span>
      </div>
      <div class="category-item">
        <span>Social</span>
        <div class="progress-bar">
          <div class="progress" style="width: ${socialPercent}%; background-color: rgba(30, 144, 255, 0.7);"></div>
        </div>
        <span>${socialPercent}%</span>
      </div>
      <div class="category-item">
        <span>Entertainment</span>
        <div class="progress-bar">
          <div class="progress" style="width: ${entertainmentPercent}%; background-color: rgba(255, 69, 0, 0.7);"></div>
        </div>
        <span>${entertainmentPercent}%</span>
      </div>
    `;
    insightsDiv.appendChild(breakdownElement);
    
    // Add recommendations
    const recommendationsElement = document.createElement('div');
    recommendationsElement.className = 'recommendations';
    
    let recommendation = '';
    if (workPercent < 30) {
      recommendation = 'Try to increase your work-related browsing time.';
    } else if (entertainmentPercent > 50) {
      recommendation = 'Consider reducing time spent on entertainment websites.';
    } else if (productivityScore > 70) {
      recommendation = 'Great job maintaining a productive browsing balance!';
    } else {
      recommendation = 'Your browsing habits are balanced. Keep it up!';
    }
    
    recommendationsElement.innerHTML = `
      <h4>Recommendations</h4>
      <p>${recommendation}</p>
    `;
    insightsDiv.appendChild(recommendationsElement);
  }
  
  function renderCategories() {
    const categoriesList = document.getElementById('categoriesList');
    categoriesList.innerHTML = '';
    
    // Get unique domains from history
    const domains = new Set();
    
    Object.values(currentData).forEach(dayData => {
      Object.keys(dayData).forEach(domain => domains.add(domain));
    });
    
    // Create category elements
    domains.forEach(domain => {
      const category = siteCategories[domain] || 'other';
      
      const categoryItem = document.createElement('div');
      categoryItem.className = 'settings-row';
      categoryItem.innerHTML = `
        <span>${domain}</span>
        <select class="category-select" data-domain="${domain}">
          <option value="work" ${category === 'work' ? 'selected' : ''}>Work</option>
          <option value="social" ${category === 'social' ? 'selected' : ''}>Social</option>
          <option value="entertainment" ${category === 'entertainment' ? 'selected' : ''}>Entertainment</option>
          <option value="other" ${category === 'other' ? 'selected' : ''}>Other</option>
        </select>
      `;
      
      categoriesList.appendChild(categoryItem);
      
      // Add event listener to select
      const select = categoryItem.querySelector('.category-select');
      select.addEventListener('change', () => {
        siteCategories[domain] = select.value;
        chrome.storage.local.set({ categories: siteCategories }, () => {
          showNotification('Category updated!');
          renderData(currentData);
          updateAnalytics(timeRangeSelect.value);
        });
      });
    });
  }
  
  function renderSiteLimits() {
    const siteLimits = document.getElementById('siteLimits');
    siteLimits.innerHTML = '';
    
    // Get saved limits
    chrome.storage.local.get('limits', (data) => {
      const limits = data.limits || {};
      
      // Get unique domains
      const domains = new Set();
      Object.values(currentData).forEach(dayData => {
        Object.keys(dayData).forEach(domain => domains.add(domain));
      });
      
      if (Object.keys(limits).length === 0) {
        siteLimits.innerHTML = '<div class="empty-state">No site limits set. Add some below.</div>';
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
        removeButton.addEventListener('click', () => {
          delete limits[domain];
          chrome.storage.local.set({ limits }, () => {
            showNotification('Limit removed!');
            renderSiteLimits();
          });
        });
      });
    });
    
    // Add button to add new limits
    document.getElementById('addSiteLimitButton').addEventListener('click', () => {
      const domain = prompt('Enter domain to limit (e.g., facebook.com):');
      if (!domain) return;
      
      const limitMinutes = parseInt(prompt('Enter time limit in minutes:'));
      if (isNaN(limitMinutes) || limitMinutes <= 0) {
        alert('Please enter a valid time limit');
        return;
      }
      
      chrome.storage.local.get('limits', (data) => {
        const limits = data.limits || {};
        limits[domain] = limitMinutes;
        
        chrome.storage.local.set({ limits }, () => {
          showNotification('Limit added!');
          renderSiteLimits();
        });
      });
    });
    
    // Add event listener for the toggle
    chrome.storage.local.get('settings', (data) => {
      const settings = data.settings || {};
      timeLimitsToggle.checked = settings.enableTimeLimits || false;
    });
  }
  
  function filterSites(query) {
    const siteItems = timeListDiv.querySelectorAll('.site-item');
    
    siteItems.forEach(item => {
      const siteName = item.querySelector('.site-name').textContent.toLowerCase();
      if (siteName.includes(query)) {
        item.style.display = 'flex';
      } else {
        item.style.display = 'none';
      }
    });
  }
  
  function exportCurrentData() {
    const currentDate = getCurrentDate();
    const dataToExport = {
      date: currentDate,
      data: currentData[currentDate] || {}
    };
    
    const blob = new Blob([JSON.stringify(dataToExport, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `tab-tracker-${currentDate}.json`;
    a.click();
    
    showNotification('Data exported!');
  }
  
  function exportAllData() {
    const dataToExport = {
      history: currentData,
      categories: siteCategories
    };
    
    const blob = new Blob([JSON.stringify(dataToExport, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = 'tab-tracker-all-data.json';
    a.click();
    
    showNotification('All data exported!');
  }
  
  function importData() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    
    input.addEventListener('change', (event) => {
      const file = event.target.files[0];
      if (!file) return;
      
      const reader = new FileReader();
      
      reader.onload = (e) => {
        try {
          const importedData = JSON.parse(e.target.result);
          
          // Validate imported data
          if (!importedData.history || typeof importedData.history !== 'object') {
            throw new Error('Invalid data format');
          }
          
          // Merge with existing data
          chrome.storage.local.get(['history', 'categories'], (data) => {
            const mergedHistory = { ...data.history, ...importedData.history };
            const mergedCategories = { ...data.categories, ...importedData.categories };
            
            chrome.storage.local.set({ 
              history: mergedHistory, 
              categories: mergedCategories 
            }, () => {
              showNotification('Data imported successfully!');
              fetchDataAndRender();
            });
          });
          
        } catch (error) {
          showNotification('Error importing data: ' + error.message);
        }
      };
      
      reader.readAsText(file);
    });
    
    input.click();
  }
  
  function initializeUserPreferences() {
    chrome.storage.local.get('preferences', (data) => {
      const prefs = data.preferences || {};
      
      // Dark mode
      if (prefs.darkMode) {
        darkModeToggle.checked = true;
        document.body.classList.add('dark-mode');
      }
      
      // Show seconds
      showSecondsToggle.checked = prefs.showSeconds !== false; // Default to true
    });
  }
  
  function saveUserPreferences() {
    const preferences = {
      darkMode: darkModeToggle.checked,
      showSeconds: showSecondsToggle.checked
    };
    
    chrome.storage.local.set({ preferences });
  }
  
  function showNotification(message) {
    notification.textContent = message;
    notification.classList.add('show');
    
    setTimeout(() => {
      notification.classList.remove('show');
    }, 3000);
  }
  
  // Helper functions
  function getCurrentDate() {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  }
  
  function formatDate(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }
  
  function formatTime(seconds, shortFormat = false) {
    if (seconds === 0) return '0s';
    
    const showSeconds = document.getElementById('showSecondsToggle').checked;
    
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = seconds % 60;
    
    if (shortFormat) {
      if (hours > 0) return `${hours}h`;
      if (minutes > 0) return `${minutes}m`;
      return `${remainingSeconds}s`;
    }
    
    let timeString = '';
    
    if (hours > 0) {
      timeString += `${hours}h `;
    }
    
    if (minutes > 0 || hours > 0) {
      timeString += `${minutes}m `;
    }
    
    if (showSeconds && remainingSeconds > 0) {
      timeString += `${remainingSeconds}s`;
    }
    
    return timeString.trim();
  }
  
  function getCategoryColor(category) {
    switch (category) {
      case 'work':
        return 'rgba(50, 205, 50, 0.7)';
      case 'social':
        return 'rgba(30, 144, 255, 0.7)';
      case 'entertainment':
        return 'rgba(255, 69, 0, 0.7)';
      default:
        return 'rgba(128, 128, 128, 0.7)';
    }
  }
});