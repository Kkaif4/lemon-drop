(() => {
const shortCodeInput = document.getElementById('shortCodeInput');
const joinBtn = document.getElementById('joinBtn');
const statusDiv = document.getElementById('statusReceiver');
const statsReceiver = document.getElementById('statsReceiver');

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


let signaling = null;

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

joinBtn.addEventListener('click', () => {
  const code = shortCodeInput.value.trim();
  if (code.length !== 6) {
    statusDiv.innerText = "Please enter a valid 6-character code.";
    return;
  }
  
  requestWakeLock();
  statusDiv.innerText = "Connecting to signaling server...";
  signaling = new SignalingChannel(handleSignalingMessage);
  
  // Create a fun anonymous device name for the receiver
  const randomNum = Math.floor(1000 + Math.random() * 9000);
  const deviceName = `Anonymous-${randomNum}`;
  
  signaling.joinRoom(code, null, deviceName);
});

let pc = null;
let e2ee = new E2EE();
const HEADER_SIZE = 14;

let fileHandle = null;
let writableStream = null;
let expectedSequence = 0n;
let totalReceivedBytes = 0;
let incomingFileSize = 0;
let incomingFileName = 'received_file';
const progressEl = document.getElementById('receiveProgress');

async function initOPFS() {
  try {
    const root = await navigator.storage.getDirectory();
    fileHandle = await root.getFileHandle(`download_${Date.now()}.part`, { create: true });
    writableStream = await fileHandle.createWritable();
  } catch (err) {
    console.error("OPFS init failed:", err);
    statusDiv.innerText = "Error: Storage access denied or unsupported.";
  }
}

async function handleIncomingChunk(data) {
  const view = new DataView(data);
  const ver = view.getUint8(0);
  const type = view.getUint8(1);
  const seq = view.getBigUint64(2, true);
  const crc = view.getUint32(10, true);
  
  if (type === 2) { // EOF
    statusDiv.innerText = "File received successfully! Saving...";
    statsReceiver.innerText = "Complete";
    progressEl.value = 100;
    await finishFile();
    return;
  }
  
  if (type === 3) { // Metadata
    const headerBytes = new Uint8Array(data, 0, HEADER_SIZE);
    const cipherText = new Uint8Array(data, HEADER_SIZE);
    try {
      // Seq is 0 for metadata
      const plainText = await e2ee.decryptChunk(cipherText, headerBytes, 0);
      const metaStr = new TextDecoder().decode(plainText);
      const meta = JSON.parse(metaStr);
      incomingFileSize = meta.size;
      incomingFileName = meta.name;
      progressEl.style.display = 'block';
      startTime = performance.now();
      lastUpdateTime = startTime;
      lastUpdateOffset = 0;
      expectedSequence = 1n; // Next expected is 1
      statusDiv.innerText = `Receiving ${incomingFileName}...`;
    } catch (e) {
      console.error("Failed to parse metadata", e);
    }
    return;
  }
  
  if (type === 1) { // Data
    if (seq !== expectedSequence) {
      console.error(`Sequence mismatch! Expected ${expectedSequence}, got ${seq}`);
      return;
    }
    
    const headerBytes = new Uint8Array(data, 0, HEADER_SIZE);
    const cipherText = new Uint8Array(data, HEADER_SIZE);
    
    try {
      const plainText = await e2ee.decryptChunk(cipherText, headerBytes, Number(seq));
      
      const expectedCrc = crc32(plainText);
      if (crc !== expectedCrc) {
        console.error(`CRC mismatch on seq ${seq}`);
        return;
      }
      
      if (writableStream) {
        await writableStream.write(plainText);
      }
      totalReceivedBytes += plainText.length;
      expectedSequence++;
      
      if (incomingFileSize > 0) {
        progressEl.value = (totalReceivedBytes / incomingFileSize) * 100;
        statusDiv.innerText = `Receiving... ${((totalReceivedBytes / incomingFileSize) * 100).toFixed(1)}%`;
        const now = performance.now();
        if (now - lastUpdateTime > 500) {
          const elapsedSinceLast = (now - lastUpdateTime) / 1000;
          const bytesSinceLast = totalReceivedBytes - lastUpdateOffset;
          const speed = bytesSinceLast / elapsedSinceLast;
          
          const remainingBytes = incomingFileSize - totalReceivedBytes;
          const etaSeconds = speed > 0 ? remainingBytes / speed : Infinity;
          
          statsReceiver.innerText = `${formatBytes(totalReceivedBytes)} / ${formatBytes(incomingFileSize)} - Speed: ${formatBytes(speed)}/s - ETA: ${formatTime(etaSeconds)}`;
          
          lastUpdateTime = now;
          lastUpdateOffset = totalReceivedBytes;
        }
      } else {
        statusDiv.innerText = `Receiving... ${(totalReceivedBytes / 1024 / 1024).toFixed(2)} MB`;
      }
    } catch (e) {
      console.error("Decryption failed for seq", seq, e);
    }
  }
}

async function finishFile() {
  if (writableStream) {
    await writableStream.close();
    const file = await fileHandle.getFile();
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = incomingFileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }
}

async function handleSignalingMessage(msg) {
  if (msg.type === 'joined') {
    statusDiv.innerText = "Joined room successfully! Negotiating E2EE keys...";
    await initOPFS();
    pc = new PeerConnection(signaling, false);
    pc.onReady = () => {
      statusDiv.innerText = "Connection established! Receiving file...";
    };
    pc.onMessage = handleIncomingChunk;
    
    const myPubKey = await e2ee.generateKeyPair();
    signaling.sendPubKey(myPubKey);
    
  } else if (msg.type === 'pubkey') {
    statusDiv.innerText = "Received sender's public key. Deriving session key...";
    const pubKeyUint8 = new Uint8Array(atob(msg.key).split('').map(c => c.charCodeAt(0)));
    await e2ee.setPeerPublicKey(pubKeyUint8);
    await e2ee.deriveSessionKey();
  } else if (msg.type === 'offer') {
    if (pc) pc.handleOffer(msg.sdp);
  } else if (msg.type === 'ice') {
    if (pc) pc.handleIceCandidate(msg.candidate);
  } else if (msg.type === 'peer_disconnected') {
    statusDiv.innerText = "Sender disconnected.";
  } else if (msg.type === 'error') {
    statusDiv.innerText = "Error: " + msg.message;
  }
}

})();
