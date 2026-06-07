const toggle = document.getElementById('enableToggle');
const statusMsg = document.getElementById('statusMsg');
const openLocalPdf = document.getElementById('openLocalPdf');
const fileInput = document.getElementById('fileInput');

function updateUI(enabled) {
  toggle.checked = enabled;
  statusMsg.textContent = enabled
    ? 'All PDFs will open in BluePrint'
    : 'PDF interception is disabled';
  statusMsg.className = 'status ' + (enabled ? 'on' : 'off');
}

// Load current state
chrome.storage.local.get(['extEnabled'], (result) => {
  updateUI(result.extEnabled !== false);
});

// Handle toggle
toggle.addEventListener('change', () => {
  const enabled = toggle.checked;
  chrome.storage.local.set({ extEnabled: enabled });
  chrome.runtime.sendMessage({ action: 'SET_ENABLED', enabled });
  updateUI(enabled);
});

// Handle local file picker
openLocalPdf.addEventListener('click', () => {
  fileInput.click();
});

fileInput.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  try {
    const buffer = await file.arrayBuffer();
    const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
    const dataUrl = `data:application/pdf;base64,${base64}`;
    chrome.tabs.create({ url: `https://blueprintpdf.web.app?data=${encodeURIComponent(dataUrl)}` });
  } catch (err) {
    console.error('Failed to load PDF:', err);
    alert('Failed to load PDF file');
  }
  fileInput.value = '';
});
