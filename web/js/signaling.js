// WebRTC Signaling Wrapper
// Set this to your Railway backend URL once it's deployed (e.g., 'wss://lemon-drop-production.up.railway.app/ws')
const PRODUCTION_BACKEND_URL = 'lemon-drop-production.up.railway.app';

const WS_URL = "wss://lemon-drop-production.up.railway.app/ws";

class SignalingChannel {
  constructor(onMessage) {
    this.ws = new WebSocket(WS_URL);
    this.onMessage = onMessage;
    
    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        this.onMessage(msg);
      } catch (err) {
        console.error('Failed to parse signaling message', err);
      }
    };
    
    this.ws.onerror = (err) => console.error('WebSocket Error:', err);
    this.ws.onclose = () => console.log('WebSocket Connection Closed');
  }

  send(msg) {
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    } else {
      this.ws.addEventListener('open', () => {
        this.ws.send(JSON.stringify(msg));
      }, { once: true });
    }
  }

  createRoom(password = undefined) {
    this.send({ type: 'create_room', password });
  }

  joinRoom(shortCode, password = undefined, deviceName = undefined) {
    this.send({ type: 'join_room', shortCode: shortCode.toUpperCase(), password, deviceName });
  }

  sendPubKey(pubKeyArray) {
    // send pubkey as base64 string
    const base64 = btoa(String.fromCharCode(...pubKeyArray));
    this.send({ type: 'pubkey', key: base64 });
  }

  sendOffer(sdp) {
    this.send({ type: 'offer', sdp });
  }

  sendAnswer(sdp) {
    this.send({ type: 'answer', sdp });
  }

  sendIceCandidate(candidate) {
    this.send({ type: 'ice', candidate });
  }
}
