const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const controls = document.getElementById('controls');
const startBtn = document.getElementById('startBtn');
const result = document.getElementById('result');
const progressContainer = document.getElementById('progressContainer');
const progressFill = document.getElementById('progressFill');
const percentageTxt = document.getElementById('percentage');

let selectedFile = null;
let worker = null;

dropZone.addEventListener('click', () => fileInput.click());
dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('dragover'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('dragover');
  if (e.dataTransfer.files.length) {
    handleFileSelect(e.dataTransfer.files[0]);
  }
});

fileInput.addEventListener('change', (e) => {
  if (e.target.files.length) {
    handleFileSelect(e.target.files[0]);
  }
});

async function generateFingerprint(file) {
  const msgUint8 = new TextEncoder().encode(`${file.name}-${file.size}-${file.lastModified}`);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

function handleFileSelect(file) {
  selectedFile = file;
  dropZone.innerHTML = `<p>Selected: <strong>${file.name}</strong> (${(file.size / 1024 / 1024).toFixed(2)} MB)</p>`;
  controls.style.display = 'block';
  result.innerText = '';
}

startBtn.addEventListener('click', async () => {
  if (!selectedFile) return;
  startBtn.disabled = true;
  result.innerText = 'Initializing...';
  
  try {
    const fingerprint = await generateFingerprint(selectedFile);
    const ttlHours = parseInt(document.getElementById('ttlHours').value) || 24;

    const initData = await api.initUpload({
      name: selectedFile.name,
      size: selectedFile.size,
      mime: selectedFile.type || 'application/octet-stream',
      fingerprint,
      ttlHours
    });

    result.innerText = 'Starting upload via Worker...';
    progressContainer.style.display = 'block';

    worker = new Worker('js/upload.worker.js');
    worker.postMessage({
      type: 'START',
      file: selectedFile,
      initData,
      apiBase: API_BASE,
      token: getAuthToken()
    });

    worker.onmessage = (e) => {
      const { type, payload } = e.data;
      if (type === 'PROGRESS') {
        const percent = Math.round((payload.uploaded / selectedFile.size) * 100);
        progressFill.style.width = `${percent}%`;
        percentageTxt.innerText = `${percent}%`;
      } else if (type === 'COMPLETE') {
        result.innerHTML = `Upload complete! Status: <span style="color:green">Waiting for Scan</span>`;
        startBtn.disabled = false;
      } else if (type === 'ERROR') {
        result.innerHTML = `<span style="color:red">Error: ${payload}</span>`;
        startBtn.disabled = false;
      }
    };

  } catch (err) {
    result.innerHTML = `<span style="color:red">Init Error: ${err.message}</span>`;
    startBtn.disabled = false;
  }
});
