let tabQueues = {};
let currentQueue = 'Default';
let defaultQueueName = 'Default';
let notificationsEnabled = true;
let shortcutsEnabled = true;
let queueSettings = {};
let workerAvailable = false;

chrome.runtime.onStartup.addListener(() => loadSettings().then(saveSettings));
chrome.runtime.onInstalled.addListener(() => loadSettings().then(saveSettings));

chrome.commands.onCommand.addListener((command) => {
  if (shortcutsEnabled) {
    if (!workerAvailable) {
      workerAvailable = true;
      loadSettings().then(() => {
        console.log(new Date());
        checkAndHandleCommands(command);
      });
    } else {
      checkAndHandleCommands(command);
    }
  }
});

function checkAndHandleCommands(command) {
  chrome.windows.getCurrent((win) => {
    if (!win.incognito && queueSettings[currentQueue]?.secret)
      currentQueue = defaultQueueName;
    handleCommands(command);
  });
}

function handleCommands(command) {
  if (command === "queue_tab") {
    queueCurrentTab();
  } else if (command === "pop_tab") {
    dequeueAndOpenTab();
  } else if (command === "debug") {
    debugLogStorage();
  }
}

function queueCurrentTab() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs.length > 0) {
      const tab = tabs[0];
      const tabInfo = {
        url: tab.url,
        title: tab.title,
        favIconUrl: tab.favIconUrl
      };
      if (!tabQueues[currentQueue]) {
        tabQueues[currentQueue] = [];
      }
      tabQueues[currentQueue].push(tabInfo);
      chrome.tabs.remove(tab.id);
      saveSettings();
      if (notificationsEnabled) {
        chrome.notifications.create({
          type: 'basic',
          iconUrl: tab.favIconUrl || 'icons/icon48.png',
          title: 'Tab Queued',
          message: `Queued tab ${tab.title} to ${currentQueue}`,
          priority: 0
        });
      }
    }
  });
}

function dequeueAndOpenTab() {
  if (tabQueues[currentQueue] && tabQueues[currentQueue].length > 0) {
    const tab = tabQueues[currentQueue].shift();
    saveSettings();
    chrome.tabs.create({ url: tab.url }, () => {
      if (notificationsEnabled) {
        chrome.notifications.create({
          type: 'basic',
          iconUrl: tab.favIconUrl || 'icons/icon48.png',
          title: 'Tab Reopened',
          message: `Reopened tab: ${tab.title}`,
          priority: 0
        });
      }
    });
  }
}

function saveSettings() {
  chrome.storage.local.set({ tabQueues, currentQueue, defaultQueueName, notificationsEnabled, shortcutsEnabled, queueSettings });
}

function loadSettings() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['tabQueues', 'currentQueue', 'defaultQueueName', 'notificationsEnabled', 'shortcutsEnabled', 'queueSettings'], (data) => {
      defaultQueueName = data.defaultQueueName || 'Default';
      tabQueues = data.tabQueues || {};
      if (!tabQueues[defaultQueueName]) {
        tabQueues[defaultQueueName] = [];
      }
      currentQueue = data.currentQueue || defaultQueueName;
      notificationsEnabled = data.notificationsEnabled !== undefined ? data.notificationsEnabled : true;
      shortcutsEnabled = data.shortcutsEnabled !== undefined ? data.shortcutsEnabled : true;
      queueSettings = data.queueSettings || {};
      resolve();
    });
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  try {
    if (!workerAvailable) {
      workerAvailable = true;
      loadSettings().then(() => {
        console.log(new Date());
        handleMessages(message, sendResponse);
      });
    } else {
      handleMessages(message, sendResponse);
    }
    return true;  // sendResponse will be called asynchronously
  } catch (error) {
    sendResponse({ success: false, error: error.message });
  }
});

function handleMessages(message, sendResponse) {
  if (message.action === 'changeQueue') {
    currentQueue = message.queueName;
    saveSettings();
    sendResponse({ success: true });
  } 
  else if (message.action === 'createQueue') {
    tabQueues[message.queueName] = [];
    currentQueue = message.queueName;
    saveSettings();
    sendResponse({ success: true });
  } 
  else if (message.action === 'deleteQueue') {
    if (currentQueue !== defaultQueueName) {
      delete tabQueues[currentQueue];
      currentQueue = defaultQueueName;
      saveSettings();
      sendResponse({ success: true });
    } else {
      sendResponse({ success: false, error: "Default queue cannot be deleted" });
    }
  } 
  else if (message.action === 'toggleQueueSecret') {
    if (message.queueName !== defaultQueueName) {
      queueSettings[message.queueName] = queueSettings[message.queueName] || {};
      queueSettings[message.queueName].secret = !queueSettings[message.queueName].secret;
      saveSettings();
      sendResponse({ success: true });
    } else {
      sendResponse({ success: false, error: "Default queue cannot be secret" });
    }
  } 
  else if (message.action === 'toggleNotifications') {
    notificationsEnabled = message.value;
    saveSettings();
    sendResponse({ success: true });
  } 
  else if (message.action === 'toggleShortcuts') {
    shortcutsEnabled = message.value;
    saveSettings();
    sendResponse({ success: true });
  } 
  else if (message.action === 'updateTabQueue') {
    tabQueues = message.tabQueues;
    saveSettings();
    sendResponse({ success: true });
  } 
  else if (message.action === 'removeTab') {
    tabQueues[message.queueName].splice(message.tabIndex, 1);
    saveSettings();
    sendResponse({ success: true });
  } 
  else if (message.action === 'openTab') {
    const tab = tabQueues[message.queueName].splice(message.index, 1)[0];
    chrome.tabs.create({ url: tab.url }, () => {
      saveSettings();
      sendResponse({ success: true });
    });
  } 
  else if (message.action === 'renameQueue') {
    const { oldName, newName } = message;
    if (tabQueues[newName]) {
      sendResponse({ success: false, error: "A queue with this name already exists" });
    } 
    else {
      tabQueues[newName] = tabQueues[oldName];
      delete tabQueues[oldName];
      if (oldName === defaultQueueName)
        defaultQueueName = newName;
      if (currentQueue === oldName) {
        currentQueue = newName;
      }
      saveSettings();
      sendResponse({ success: true });
    }
  }
  else {
    sendResponse({ success: false, error: "Unknown action" });
  }
}
