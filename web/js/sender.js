(() => {
const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const pairingInfo = document.getElementById('pairingInfo');
const shortCodeDisplay = document.getElementById('shortCodeDisplay');
const statusDiv = document.getElementById('statusSender');
const statsSender = document.getElementById('statsSender');
const sendProgress = document.getElementById('sendProgress');

let startTime = 0;
let lastUpdateOffset = 0;
let lastUpdateTime = 0;


function formatBytes(bytes, decimals = 2) {
    if (!+bytes) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}
function formatTime(seconds) {
    if (seconds === Infinity || isNaN(seconds)) return 'Calculating...';
    if (seconds < 60) return Math.floor(seconds) + 's';
    return Math.floor(seconds / 60) + 'm ' + Math.floor(seconds % 60) + 's';
}


let selectedFile = null;
let signaling = null;
let pc = null;
let e2ee = new E2EE();
const CHUNK_SIZE = 16 * 1024 - 16;
const HEADER_SIZE = 14;

let fileReader = new FileReader();
let currentOffset = 0;
let sequence = 0n;

let wakeLock = null;

async function requestWakeLock() {
  try {
    if ('wakeLock' in navigator) {
      wakeLock = await navigator.wakeLock.request('screen');
      console.log('Wake Lock is active');
    }
  } catch (err) {
    console.error('Wake Lock error:', err);
  }
}

window.initSender = function() {
  requestWakeLock();
  statusDiv.innerText = "Connecting to signaling server...";
  signaling = new SignalingChannel(handleSignalingMessage);
  signaling.createRoom(); 
};

dropZone.addEventListener('click', () => fileInput.click());
dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('dragover'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('dragover');
  if (e.dataTransfer.files.length) handleFileSelect(e.dataTransfer.files[0]);
});

fileInput.addEventListener('change', (e) => {
  if (e.target.files.length) handleFileSelect(e.target.files[0]);
});

function handleFileSelect(file) {
  selectedFile = file;
  dropZone.innerHTML = `<p>Selected: <strong>${file.name}</strong> (${(file.size / 1024 / 1024).toFixed(2)} MB)</p>`;
  
  if (pc && pc.dataChannel && pc.dataChannel.readyState === 'open') {
    startSending();
  } else {
    statusDiv.innerText = "Waiting for connection to fully establish...";
  }
}

async function startSending() {
  if (!selectedFile) return;
  statusDiv.innerText = "Sending metadata...";
  sendProgress.style.display = 'block';
  startTime = performance.now();
  lastUpdateTime = startTime;
  lastUpdateOffset = 0;
  
  const metaStr = JSON.stringify({ name: selectedFile.name, size: selectedFile.size });
  const metaPayload = new TextEncoder().encode(metaStr);
  
  const metaHeader = new ArrayBuffer(HEADER_SIZE);
  const metaView = new DataView(metaHeader);
  metaView.setUint8(0, 1);
  metaView.setUint8(1, 3); // type 3 = metadata
  metaView.setBigUint64(2, 0n, true);
  metaView.setUint32(10, crc32(metaPayload), true);
  
  const metaAad = new Uint8Array(metaHeader);
  const cipherMeta = await e2ee.encryptChunk(metaPayload, metaAad);
  
  const buffer = new ArrayBuffer(HEADER_SIZE + cipherMeta.byteLength);
  const outView = new Uint8Array(buffer);
  outView.set(metaAad, 0);
  outView.set(cipherMeta, HEADER_SIZE);
  
  pc.dataChannel.send(buffer);
  
  currentOffset = 0;
  sequence = 1n; // Start chunks at seq 1
  readNextChunk();
}

async function readNextChunk() {
  if (!selectedFile) return;
  if (currentOffset >= selectedFile.size) {
    statusDiv.innerText = "File sent successfully!";
    sendProgress.value = 100;
    statsSender.innerText = "Complete";
    const buffer = new ArrayBuffer(HEADER_SIZE);
    const view = new DataView(buffer);
    view.setUint8(0, 1);
    view.setUint8(1, 2);
    view.setBigUint64(2, sequence, true);
    view.setUint32(10, 0, true);
    pc.dataChannel.send(buffer);
    return;
  }

  const slice = selectedFile.slice(currentOffset, currentOffset + CHUNK_SIZE);
  fileReader.readAsArrayBuffer(slice);
}

fileReader.onload = async (e) => {
  const payload = e.target.result;
  const payloadUint8 = new Uint8Array(payload);
  
  const headerBuffer = new ArrayBuffer(HEADER_SIZE);
  const view = new DataView(headerBuffer);
  view.setUint8(0, 1); 
  view.setUint8(1, 1); 
  view.setBigUint64(2, sequence, true);
  view.setUint32(10, crc32(payloadUint8), true); 
  
  const aad = new Uint8Array(headerBuffer);
  const cipherText = await e2ee.encryptChunk(payloadUint8, aad);

  const buffer = new ArrayBuffer(HEADER_SIZE + cipherText.byteLength);
  const outView = new Uint8Array(buffer);
  outView.set(aad, 0);
  outView.set(cipherText, HEADER_SIZE);
  
  if (pc.dataChannel.bufferedAmount > 1024 * 1024) { 
    await new Promise(resolve => {
      pc.dataChannel.addEventListener('bufferedamountlow', resolve, { once: true });
    });
  }
  
  pc.dataChannel.send(buffer);
  
  currentOffset += payload.byteLength;
  sequence++;
  
  
  const now = performance.now();
  if (now - lastUpdateTime > 500) {
    const elapsedSinceLast = (now - lastUpdateTime) / 1000;
    const bytesSinceLast = currentOffset - lastUpdateOffset;
    const speed = bytesSinceLast / elapsedSinceLast;
    
    const remainingBytes = selectedFile.size - currentOffset;
    const etaSeconds = speed > 0 ? remainingBytes / speed : Infinity;
    
    sendProgress.value = (currentOffset / selectedFile.size) * 100;
    statusDiv.innerText = `Sending: ${((currentOffset / selectedFile.size) * 100).toFixed(1)}%`;
    statsSender.innerText = `${formatBytes(currentOffset)} / ${formatBytes(selectedFile.size)} - Speed: ${formatBytes(speed)}/s - ETA: ${formatTime(etaSeconds)}`;
    
    lastUpdateTime = now;
    lastUpdateOffset = currentOffset;
  }

  
  readNextChunk();
};

async function handleSignalingMessage(msg) {
  if (msg.type === 'room_created') {
    statusDiv.innerText = "Waiting for receiver...";
    pairingInfo.style.display = 'block';
    shortCodeDisplay.innerText = msg.shortCode;
  } else if (msg.type === 'peer_joined') {
    const peerName = msg.deviceName || "Unknown Device";
    statusDiv.innerText = `Receiver (${peerName}) joined! Negotiating E2EE keys...`;
    pairingInfo.style.display = 'none';
    
    pc = new PeerConnection(signaling, true);
    pc.onReady = async () => {
      document.getElementById('dropZone').style.display = 'block';
      statusDiv.innerText = `Connection established with ${peerName}! Select a file to send.`;
      if (selectedFile) {
        startSending();
      }
    };
    
    const myPubKey = await e2ee.generateKeyPair();
    signaling.sendPubKey(myPubKey);

  } else if (msg.type === 'pubkey') {
    statusDiv.innerText = "Received receiver's public key. Deriving session key...";
    const pubKeyUint8 = new Uint8Array(atob(msg.key).split('').map(c => c.charCodeAt(0)));
    await e2ee.setPeerPublicKey(pubKeyUint8);
    await e2ee.deriveSessionKey();
    pc.createOffer();
  } else if (msg.type === 'answer') {
    if (pc) pc.handleAnswer(msg.sdp);
  } else if (msg.type === 'ice') {
    if (pc) pc.handleIceCandidate(msg.candidate);
  } else if (msg.type === 'error') {
    statusDiv.innerText = "Error: " + msg.message;
  }
}
})();
