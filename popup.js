document.addEventListener("DOMContentLoaded", () => {
    const resetButton = document.getElementById("resetButton");
    const timeListDiv = document.getElementById("timeList");
    const totalTimeDiv = document.getElementById("totalTime");
    const historyDiv = document.getElementById("history");
  
    // Fetch and display session data
    chrome.storage.local.get('history', (data) => {
      if (chrome.runtime.lastError) {
        console.error(chrome.runtime.lastError);
        return;
      }
      const history = data.history || {};
      const currentDate = new Date().toISOString().split('T')[0];
      const todayData = history[currentDate] || {};
      let totalTimeSpent = 0;
  
      timeListDiv.innerHTML = '';
      for (const [domain, timeSpent] of Object.entries(todayData)) {
        const element = document.createElement('div');
        element.textContent = `${domain}: ${timeSpent} seconds`;
        timeListDiv.appendChild(element);
        totalTimeSpent += timeSpent;
      }
  
      totalTimeDiv.textContent = `Today's Total Time: ${totalTimeSpent} seconds`;
    });
  
    // Fetch and display history
    chrome.runtime.sendMessage({ action: 'getHistory' }, (response) => {
      if (response.status === 'success') {
        const history = response.history || {};
        historyDiv.innerHTML = '<h3>History</h3>';
  
        for (const [date, domains] of Object.entries(history)) {
          const dateDiv = document.createElement('div');
          dateDiv.textContent = date;
          const domainList = document.createElement('ul');
  
          for (const [domain, timeSpent] of Object.entries(domains)) {
            const domainItem = document.createElement('li');
            domainItem.textContent = `${domain}: ${timeSpent} seconds`;
            domainList.appendChild(domainItem);
          }
  
          dateDiv.appendChild(domainList);
          historyDiv.appendChild(dateDiv);
        }
      }
    });
  
    // Handle reset button
    resetButton.addEventListener("click", () => {
      chrome.runtime.sendMessage({ action: 'resetTimers' }, (response) => {
        alert(response.message);
        window.location.reload();
      });
    });
  });