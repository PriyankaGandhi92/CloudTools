// BluePrint PDF Viewer — Chrome Extension
// Redirects PDFs to BluePrint PDF Editor (toggleable)

const APP = 'https://blueprintpdf.web.app';

// Default: enabled. User can toggle from popup.
let enabled = true;
chrome.storage.local.get(['extEnabled'], (r) => {
  enabled = r.extEnabled !== false; // default true
});

// ─── PDF Interception (respects toggle) ──────────────────────────────

chrome.webNavigation.onBeforeNavigate.addListener((d) => {
  if (!enabled) return;
  if (d.frameId !== 0 || d.url.startsWith(APP)) return;
  if (isPdf(d.url)) {
    // For file:// URLs, we need to read the file and convert to base64
    if (d.url.startsWith('file://')) {
      handleLocalFile(d.tabId, d.url);
    } else {
      chrome.tabs.update(d.tabId, { url: `${APP}?url=${enc(d.url)}` });
    }
  }
});

chrome.webRequest.onHeadersReceived.addListener(
  (d) => {
    if (!enabled) return;
    if (d.type !== 'main_frame' || d.url.startsWith(APP)) return;
    // Skip file:// URLs in webRequest (not supported)
    if (d.url.startsWith('file://')) return;
    const ct = d.responseHeaders?.find(h => h.name.toLowerCase() === 'content-type');
    if (ct?.value?.includes('application/pdf')) {
      return { redirectUrl: `${APP}?url=${enc(d.url)}` };
    }
  },
  { urls: ['<all_urls>'] },
  ['responseHeaders']
);

// ─── Local File Handling ─────────────────────────────────────────────

async function handleLocalFile(tabId, fileUrl) {
  try {
    // Fetch the file content
    const response = await fetch(fileUrl);
    const buffer = await response.arrayBuffer();
    const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
    const dataUrl = `data:application/pdf;base64,${base64}`;
    chrome.tabs.update(tabId, { url: `${APP}?data=${enc(dataUrl)}` });
  } catch (err) {
    console.error('[Extension] Failed to load local PDF:', err);
    // Fallback: open app without PDF, let user pick file
    chrome.tabs.update(tabId, { url: APP });
  }
}

// ─── Extension Toggle (for popup) ─────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || !msg.action) return;

  if (msg.action === 'SET_ENABLED') {
    enabled = !!msg.enabled;
    chrome.storage.local.set({ extEnabled: enabled }, () => {
      sendResponse({ enabled });
    });
    return true;
  }

  if (msg.action === 'GET_ENABLED') {
    sendResponse({ enabled });
  }
});

// ─── Helpers ─────────────────────────────────────────────────────────

function isPdf(url) {
  try { return new URL(url).pathname.toLowerCase().endsWith('.pdf'); }
  catch { return false; }
}
function enc(s) { return encodeURIComponent(s); }
