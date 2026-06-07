// ── Minimal ZIP builder (store-only, no compression) ─────────────────
function buildZip(files: { name: string; content: string }[]): Blob {
  const te = new TextEncoder();
  const entries = files.map((f) => ({ name: te.encode(f.name), data: te.encode(f.content) }));
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const e of entries) {
    const header = localHeader(e.name, e.data);
    parts.push(header, e.data);
    central.push(centralHeader(e.name, e.data, offset));
    offset += header.length + e.data.length;
  }
  const centralBuf = concat(central);
  parts.push(centralBuf);
  parts.push(endRecord(entries.length, centralBuf.length, offset));
  return new Blob(parts as BlobPart[], { type: 'application/zip' });
}
function localHeader(name: Uint8Array, data: Uint8Array) {
  const b = new ArrayBuffer(30 + name.length); const v = new DataView(b); const u = new Uint8Array(b);
  v.setUint32(0, 0x04034b50, true); v.setUint16(4, 20, true);
  v.setUint32(18, data.length, true); v.setUint32(22, data.length, true);
  v.setUint16(26, name.length, true); u.set(name, 30);
  return u;
}
function centralHeader(name: Uint8Array, data: Uint8Array, offset: number) {
  const b = new ArrayBuffer(46 + name.length); const v = new DataView(b); const u = new Uint8Array(b);
  v.setUint32(0, 0x02014b50, true); v.setUint16(4, 20, true); v.setUint16(6, 20, true);
  v.setUint32(20, data.length, true); v.setUint32(24, data.length, true);
  v.setUint16(28, name.length, true); v.setUint32(42, offset, true); u.set(name, 46);
  return u;
}
function endRecord(count: number, centralSize: number, centralOffset: number) {
  const b = new ArrayBuffer(22); const v = new DataView(b);
  v.setUint32(0, 0x06054b50, true); v.setUint16(8, count, true); v.setUint16(10, count, true);
  v.setUint32(12, centralSize, true); v.setUint32(16, centralOffset, true);
  return new Uint8Array(b);
}
function concat(arrays: Uint8Array[]) {
  const total = arrays.reduce((s, a) => s + a.length, 0);
  const r = new Uint8Array(total); let off = 0;
  for (const a of arrays) { r.set(a, off); off += a.length; }
  return r;
}

// ── Extension file contents ─────────────────────────────────────────
const EXT_MANIFEST = `{
  "manifest_version": 3,
  "name": "BluePrint PDF Viewer",
  "version": "1.0.0",
  "description": "Open all PDF files in BluePrint PDF Editor",
  "permissions": ["webNavigation", "webRequest", "tabs", "storage"],
  "host_permissions": ["<all_urls>"],
  "background": { "service_worker": "background.js" },
  "content_scripts": [{
    "matches": ["https://blueprintpdf.web.app/*", "http://localhost:*/*"],
    "js": ["content.js"],
    "run_at": "document_idle"
  }]
}`;

const EXT_BACKGROUND = `const APP = 'https://blueprintpdf.web.app';
let enabled = true;
chrome.storage.local.get(['extEnabled'], (r) => { enabled = r.extEnabled !== false; });
chrome.webNavigation.onBeforeNavigate.addListener((d) => {
  if (!enabled || d.frameId !== 0 || d.url.startsWith(APP)) return;
  try { if (new URL(d.url).pathname.toLowerCase().endsWith('.pdf'))
    chrome.tabs.update(d.tabId, { url: APP + '?url=' + encodeURIComponent(d.url) });
  } catch {}
});
chrome.webRequest.onHeadersReceived.addListener((d) => {
  if (!enabled || d.type !== 'main_frame' || d.url.startsWith(APP)) return;
  const ct = d.responseHeaders?.find(h => h.name.toLowerCase() === 'content-type');
  if (ct?.value?.includes('application/pdf'))
    return { redirectUrl: APP + '?url=' + encodeURIComponent(d.url) };
}, { urls: ['<all_urls>'] }, ['responseHeaders']);
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || !msg.action) return;
  if (msg.action === 'STORE_API_KEY') {
    chrome.storage.local.set({ apiKey: msg.apiKey, storedAt: Date.now() }, () => sendResponse({ success: true }));
    return true;
  }
  if (msg.action === 'GET_API_KEY') {
    chrome.storage.local.get(['apiKey', 'storedAt'], (r) => {
      if (r.apiKey && Date.now() - (r.storedAt||0) < 3600000) sendResponse({ apiKey: r.apiKey });
      else sendResponse({ apiKey: null });
    });
    return true;
  }
  if (msg.action === 'CLEAR_API_KEY') {
    chrome.storage.local.remove(['apiKey', 'storedAt'], () => sendResponse({ success: true }));
    return true;
  }
  if (msg.action === 'SET_ENABLED') {
    enabled = !!msg.enabled;
    chrome.storage.local.set({ extEnabled: enabled }, () => sendResponse({ enabled }));
    return true;
  }
  if (msg.action === 'GET_ENABLED') {
    sendResponse({ enabled });
    return true;
  }
});`;

const EXT_CONTENT = `window.addEventListener('message', (event) => {
  if (event.source !== window || event.data?.type !== 'BLUEPRINT_TO_EXT') return;
  chrome.runtime.sendMessage(event.data.payload, (response) => {
    window.postMessage({ type: 'BLUEPRINT_FROM_EXT', payload: response }, '*');
  });
});
window.postMessage({ type: 'BLUEPRINT_EXT_INSTALLED', version: chrome.runtime.getManifest().version }, '*');`;

export function downloadExtensionZip() {
  const zip = buildZip([
    { name: 'BluePrint-PDF-Extension/manifest.json', content: EXT_MANIFEST },
    { name: 'BluePrint-PDF-Extension/background.js', content: EXT_BACKGROUND },
    { name: 'BluePrint-PDF-Extension/content.js', content: EXT_CONTENT },
  ]);
  const url = URL.createObjectURL(zip);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'BluePrint-PDF-Extension.zip';
  a.click();
  URL.revokeObjectURL(url);
}
