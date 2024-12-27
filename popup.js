document.addEventListener('DOMContentLoaded', () => {
  chrome.storage.local.get(['tabQueues', 'currentQueue', 'defaultQueueName', 'queueSettings', 'notificationsEnabled', 'shortcutsEnabled'], (data) => {
    let defaultQueueName = data.defaultQueueName || 'Default';
    let tabQueues = data.tabQueues || { defaultQueueName: [] };
    let currentQueue = data.currentQueue || defaultQueueName;
    const queueSettings = data.queueSettings || {};
    const tabList = document.getElementById('tabList');
    const queueSelect = document.getElementById('queueSelect');
    const settingsModal = document.getElementById('settingsModal');
    const settingsButton = document.getElementById('settingsButton');
    const infoModal = document.getElementById('infoModal');
    const infoButton = document.getElementById('infoButton');
    const addQueueButton = document.getElementById('addQueue');
    const secretToggleButton = document.getElementById('secretToggle');
    const clearQueueButton = document.getElementById('clearQueue');
    let isIncognito = false;
    tabList.innerHTML = '';

    function updateTabList() {
      tabList.innerHTML = '';
      const queue = tabQueues[currentQueue] || [];
      queue.forEach((tab, index) => {
        const tabItem = document.createElement('div');
        tabItem.className = 'tab-item';
        tabItem.dataset.index = index;
        tabItem.innerHTML = `
          <img class="tab-icon" src="${tab.favIconUrl}" alt="">
          <span class="tab-title">${tab.title}</span>
          <span class="remove-tab" data-index="${index}">&times;</span>
        `;
        tabItem.querySelector('.remove-tab').addEventListener('click', (event) => {
          event.stopPropagation();
          chrome.runtime.sendMessage({ action: 'removeTab', queueName: currentQueue, tabIndex: index }, (response) => {
            if (response.success) {
              tabQueues[currentQueue].splice(index, 1);
              updateTabList();
            } else {
              alert('Failed to remove tab: ' + response.error);
            }
          });
        });
        tabItem.addEventListener('click', () => {
          chrome.runtime.sendMessage({ action: 'openTab', queueName: currentQueue, index }, (response) => {
            if (response.success) {
              tabQueues[currentQueue].splice(index, 1);
              updateTabList();
            } else {
              alert('Failed to open tab: ' + response.error);
            }
          });
        });
        tabList.appendChild(tabItem);
      });

      new Sortable(tabList, {
        onEnd: (evt) => {
          const oldIndex = evt.oldIndex;
          const newIndex = evt.newIndex;
          if (oldIndex !== newIndex) {
            const movedTab = tabQueues[currentQueue].splice(oldIndex, 1)[0];
            tabQueues[currentQueue].splice(newIndex, 0, movedTab);
            chrome.runtime.sendMessage({ action: 'updateTabQueue', tabQueues }, (response) => {
              if (!response.success) {
                alert('Failed to update tab queue: ' + response.error);
              } else {
                updateTabList();
              }
            });
          }
        }
      });
    }

    function updateQueueSelect() {
      queueSelect.innerHTML = '';
      for (const queueName in tabQueues) {
        const isSecret = queueSettings[queueName]?.secret;
        const isDefault = queueName === defaultQueueName;
        if (!isSecret || (isSecret && isIncognito) || queueName === defaultQueueName) {
          const option = document.createElement('option');
          option.value = queueName;
          option.textContent = queueName + (isDefault ? ' (Default)' : '') + (isSecret ? ' (Secret)' : '');
          queueSelect.appendChild(option);
        }
      }
      if (!tabQueues.hasOwnProperty(currentQueue)) {
        currentQueue = defaultQueueName;
      }
      queueSelect.value = currentQueue;
    }

    queueSelect.addEventListener('change', () => {
      currentQueue = queueSelect.value;
      chrome.runtime.sendMessage({ action: 'changeQueue', queueName: currentQueue }, (response) => {
        if (response.success) {
          updateTabList();
          updateSecretToggleButton();
        } else {
          alert('Failed to change queue: ' + response.error);
        }
      });
    });

    const queueNameInput = document.createElement('input');
    queueNameInput.style.display = 'none';
    queueNameInput.classList.add('editable');
    queueSelect.parentNode.insertBefore(queueNameInput, queueSelect.nextSibling);

    queueSelect.addEventListener('dblclick', () => {
      const currentQueueName = queueSelect.value;
      queueNameInput.value = currentQueueName;
      queueNameInput.style.display = 'block';
      queueNameInput.focus();
      queueSelect.style.display = 'none';
    });

    queueNameInput.addEventListener('blur', () => {
      const newQueueName = queueNameInput.value.trim();
      const currentQueueName = queueSelect.value;

      if (newQueueName && newQueueName !== currentQueueName) {
        if (tabQueues[newQueueName]) {
          alert('A queue with this name already exists. Please choose a different name.');
        } else {
          chrome.runtime.sendMessage({ action: 'renameQueue', oldName: currentQueueName, newName: newQueueName }, (response) => {
            if (response.success) {
              tabQueues[newQueueName] = tabQueues[currentQueueName];
              delete tabQueues[currentQueueName];

              if (currentQueue == defaultQueueName)
                defaultQueueName = newQueueName;

              currentQueue = newQueueName;
              updateQueueSelect();
              updateTabList();
            } else {
              alert('Failed to rename queue: ' + response.error);
            }
          });
        }
      }
      queueNameInput.style.display = 'none';
      queueSelect.style.display = 'block';
    });

    queueNameInput.addEventListener('keypress', (event) => {
      if (event.key === 'Enter') {
        queueNameInput.blur();
      }
    });

    addQueueButton.addEventListener('click', () => {
      const newQueueName = prompt('Enter new queue name:');
      if (newQueueName) {
        if (tabQueues[newQueueName]) {
          alert('A queue with this name already exists. Please choose a different name.');
        } else {
          chrome.runtime.sendMessage({ action: 'createQueue', queueName: newQueueName }, (response) => {
            if (response.success) {
              currentQueue = newQueueName;
              tabQueues[newQueueName] = [];
              updateQueueSelect();
              updateTabList();
              queueSelect.value = newQueueName;
              updateSecretToggleButton();
            } else {
              alert('Failed to create queue: ' + response.error);
            }
          });
        }
      }
    });

    secretToggleButton.addEventListener('click', () => {
      if (currentQueue !== defaultQueueName) {
        chrome.runtime.sendMessage({ action: 'toggleQueueSecret', queueName: currentQueue }, (response) => {
          if (response.success) {
            queueSettings[currentQueue] = queueSettings[currentQueue] || {};
            queueSettings[currentQueue].secret = !queueSettings[currentQueue].secret;
            updateQueueSelect();
            updateSecretToggleButton();
          } else {
            alert('Failed to toggle secret: ' + response.error);
          }
        });
      }
    });

    clearQueueButton.addEventListener('click', () => {
      if (currentQueue !== defaultQueueName && confirm('Are you sure you want to delete the current queue?')) {
        chrome.runtime.sendMessage({ action: 'deleteQueue' }, (response) => {
          if (response.success) {
            delete tabQueues[currentQueue];
            currentQueue = defaultQueueName;
            updateQueueSelect();
            updateTabList();
            updateSecretToggleButton();
          } else {
            alert('Failed to delete queue: ' + response.error);
          }
        });
      }
    });

    function checkSecretToggleVisibility() {
      chrome.windows.getCurrent((win) => {
        if (win.incognito) {
          isIncognito = true;
          secretToggleButton.style.display = 'block';
        } else {
          isIncognito = false;
          secretToggleButton.style.display = 'none';
        }
        if (!isIncognito && queueSettings[currentQueue]?.secret) {
          currentQueue = defaultQueueName;
          chrome.runtime.sendMessage({ action: 'changeQueue', queueName: currentQueue }, (response) => {
            if (response.success) {
              updateTabList();
              updateQueueSelect();
              updateSecretToggleButton();
            }
          });
        } else {
          updateQueueSelect();
        }
      });
    }

    function updateSecretToggleButton() {
      if (queueSettings[currentQueue]?.secret) {
        secretToggleButton.querySelector('img').src = 'icons/secret-on-icon.png';
      } else {
        secretToggleButton.querySelector('img').src = 'icons/secret-off-icon.png';
      }
    }

    updateQueueSelect();
    updateTabList();
    updateSecretToggleButton();
    checkSecretToggleVisibility();

    const notificationToggle = document.getElementById('notificationToggle');
    notificationToggle.checked = data.notificationsEnabled;
    notificationToggle.addEventListener('change', (event) => {
      chrome.runtime.sendMessage({ action: 'toggleNotifications', value: event.target.checked }, (response) => {
        if (!response.success) {
          alert('Failed to toggle notifications: ' + response.error);
          notificationToggle.checked = !event.target.checked;
        }
      });
    });

    const shortcutToggle = document.getElementById('shortcutToggle');
    shortcutToggle.checked = data.shortcutsEnabled;
    shortcutToggle.addEventListener('change', (event) => {
      chrome.runtime.sendMessage({ action: 'toggleShortcuts', value: event.target.checked }, (response) => {
        if (!response.success) {
          alert('Failed to toggle shortcuts: ' + response.error);
          shortcutToggle.checked = !event.target.checked;
        }
      });
    });

    settingsButton.addEventListener('click', () => {
      settingsModal.style.display = 'block';
    });

    infoButton.addEventListener('click', () => {
      infoModal.style.display = 'block';
    });

    window.addEventListener('click', (event) => {
      if (event.target == settingsModal || event.target == infoModal) {
        settingsModal.style.display = 'none';
        infoModal.style.display = 'none';
      }
    });
  });
});
