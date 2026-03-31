const DEFAULT_DATA = {
  folders: [
    {
      id: "default",
      name: "Tous mes repos",
      collapsed: false,
      repos: []
    }
  ]
};

const DEFAULT_PREFERENCES = {
  startCollapsed: false,
  filterByOrg: false
};

chrome.runtime.onInstalled.addListener(async () => {
  try {
    const existing = await chrome.storage.local.get(["folders", "preferences"]);
    if (!existing.folders) {
      await chrome.storage.local.set({ folders: DEFAULT_DATA.folders });
    }
    if (!existing.preferences) {
      await chrome.storage.local.set({ preferences: DEFAULT_PREFERENCES });
    }
  } catch (e) {
    console.error("[GSO] onInstalled error:", e);
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === "GET_DATA") {
    chrome.storage.local.get(["folders", "preferences"])
      .then(data => sendResponse({ success: true, data }))
      .catch(e => sendResponse({ success: false, error: e.message }));
    return true;
  }

  if (message.action === "SAVE_DATA") {
    chrome.storage.local.set({ folders: message.folders })
      .then(() => sendResponse({ success: true }))
      .catch(e => sendResponse({ success: false, error: e.message }));
    return true;
  }

  if (message.action === "SAVE_PREFERENCES") {
    chrome.storage.local.set({ preferences: message.preferences })
      .then(() => sendResponse({ success: true }))
      .catch(e => sendResponse({ success: false, error: e.message }));
    return true;
  }

  if (message.action === "GET_CURRENT_REPO") {
    sendResponse({ success: true });
    return true;
  }
});
