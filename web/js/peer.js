const RTC_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    // TURN will be added here in Milestone 6
  ]
};

class PeerConnection {
  constructor(signaling, isSender = false) {
    this.signaling = signaling;
    this.isSender = isSender;
    this.pc = new RTCPeerConnection(RTC_CONFIG);
    this.dataChannel = null;

    this.pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.signaling.sendIceCandidate(event.candidate);
      }
    };

    
    this.pc.oniceconnectionstatechange = () => {
      console.log('ICE Connection State:', this.pc.iceConnectionState);
      if (this.onStatusChange) this.onStatusChange('ICE: ' + this.pc.iceConnectionState);
    };

    if (this.isSender) {
      this.dataChannel = this.pc.createDataChannel('transfer', {
        ordered: true
      });
      this.dataChannel.binaryType = 'arraybuffer';
      this.dataChannel.bufferedAmountLowThreshold = 65536; // 64KB
      this.setupDataChannel(this.dataChannel);
    } else {
      this.pc.ondatachannel = (event) => {
        this.dataChannel = event.channel;
        this.dataChannel.binaryType = 'arraybuffer';
        this.setupDataChannel(this.dataChannel);
      };
    }
  }

  setupDataChannel(channel) {
    channel.onopen = () => {
      console.log('Data channel opened');
      if (this.onReady) this.onReady();
    };
    channel.onclose = () => console.log('Data channel closed');
    channel.onerror = (err) => console.error('Data channel error:', err);
    channel.onmessage = (event) => {
      if (this.onMessage) this.onMessage(event.data);
    };
  }

  async createOffer() {
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    this.signaling.sendOffer(offer.sdp);
  }

  async handleOffer(sdp) {
    await this.pc.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp }));
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    this.signaling.sendAnswer(answer.sdp);
  }

  async handleAnswer(sdp) {
    await this.pc.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp }));
  }

  async handleIceCandidate(candidate) {
    try {
      await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (e) {
      console.error('Error adding received ice candidate', e);
    }
  }
}
