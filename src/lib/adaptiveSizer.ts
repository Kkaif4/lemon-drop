// ─── Adaptive Packet Sizer (AIMD Controller) ─────────────────────────
// Dynamically adjusts chunk payload sizes between 16 KB and 256 KB
// based on network socket drain velocity, RTT, and receiver write latency.

import {
  CHUNK_TIERS,
  MIN_CHUNK_SIZE,
  MAX_CHUNK_SIZE,
  type TransferDiagnostics,
  type TelemetryAckPayload,
} from '@/types/transfer';

export const TIER_NAMES = ['Safe', 'Standard', 'Fast', 'Ultra'] as const;

export class AdaptivePacketSizer {
  private tierIndex: number = 0; // Starts at Tier 0 (16 KB safe baseline)
  private consecutiveSuccesses: number = 0;
  private smoothedRttMs: number = 0;
  private lastAckTime: number = 0;
  private lastBufferPressure: 'low' | 'medium' | 'high' = 'low';
  private currentBottleneck: 'network' | 'disk' | 'cpu' | 'optimal' = 'optimal';
  private lastDrainVelocity: number = 0; // bytes/sec

  constructor() {
    this.reset();
  }

  public reset(): void {
    this.tierIndex = 0;
    this.consecutiveSuccesses = 0;
    this.smoothedRttMs = 0;
    this.lastAckTime = performance.now();
    this.lastBufferPressure = 'low';
    this.currentBottleneck = 'optimal';
    this.lastDrainVelocity = 0;
  }

  /** Current active plaintext chunk size */
  public getChunkSize(): number {
    return CHUNK_TIERS[this.tierIndex] || MIN_CHUNK_SIZE;
  }

  /** Current tier index (0 to 3) */
  public getTierIndex(): number {
    return this.tierIndex;
  }

  /**
   * Called by the sender whenever an ACK is received from the receiver.
   */
  public onAckReceived(ack: TelemetryAckPayload): void {
    const now = performance.now();
    this.lastBufferPressure = ack.bufferPressure;

    // Calculate sample RTT if receiver echoed timestamp
    if (ack.timestamp > 0) {
      const sampleRtt = Math.max(1, now - ack.timestamp);
      if (this.smoothedRttMs === 0) {
        this.smoothedRttMs = sampleRtt;
      } else {
        this.smoothedRttMs = 0.875 * this.smoothedRttMs + 0.125 * sampleRtt;
      }
    }

    // Evaluate bottleneck indicators
    if (ack.writeLatencyMs > 35 || ack.bufferPressure === 'high') {
      this.currentBottleneck = 'disk';
      this.stepDown('Receiver disk write latency high');
      return;
    }

    if (this.smoothedRttMs > 100) {
      this.currentBottleneck = 'network';
    } else {
      this.currentBottleneck = 'optimal';
    }

    // If receiver pressure is low and write latency is fast (<15ms), evaluate scaling up
    if (ack.bufferPressure === 'low' && ack.writeLatencyMs < 20) {
      this.consecutiveSuccesses += 4;
      if (this.consecutiveSuccesses >= 12) {
        this.stepUp();
      }
    } else if (ack.bufferPressure === 'medium') {
      // Hold steady
      this.consecutiveSuccesses = 0;
    }
  }

  /**
   * Called by the sender loop after monitoring `bufferedAmount` drain.
   * @param drainTimeMs Duration it took to drain the buffer window
   * @param drainedBytes Bytes drained in that window
   */
  public onBufferDrain(drainTimeMs: number, drainedBytes: number): void {
    if (drainTimeMs > 0) {
      this.lastDrainVelocity = (drainedBytes / drainTimeMs) * 1000;
    }

    // If the SCTP buffer drained fast (<20ms) and no high receiver pressure
    if (drainTimeMs < 25 && this.lastBufferPressure === 'low') {
      this.consecutiveSuccesses++;
      if (this.consecutiveSuccesses >= 8) {
        this.stepUp();
      }
    } else if (drainTimeMs > 60) {
      // SCTP network queue is draining slowly
      this.currentBottleneck = 'network';
      this.stepDown('Network socket buffer drain slow');
    }
  }

  /**
   * Scale up to the next chunk size tier (Additive Increase)
   */
  public stepUp(): boolean {
    if (this.tierIndex < CHUNK_TIERS.length - 1) {
      this.tierIndex++;
      this.consecutiveSuccesses = 0;
      return true;
    }
    return false;
  }

  /**
   * Scale down to a lower chunk size tier (Multiplicative Decrease)
   */
  public stepDown(reason?: string): boolean {
    this.consecutiveSuccesses = 0;
    if (this.tierIndex > 0) {
      this.tierIndex = Math.max(0, this.tierIndex - 1);
      return true;
    }
    return false;
  }

  /**
   * Snapshot of current telemetry for UI observation
   */
  public getDiagnostics(): TransferDiagnostics {
    return {
      chunkSize: this.getChunkSize(),
      tierIndex: this.tierIndex,
      tierName: TIER_NAMES[this.tierIndex] || 'Safe',
      rttMs: Math.round(this.smoothedRttMs),
      bottleneck: this.currentBottleneck,
      bufferPressure: this.lastBufferPressure,
    };
  }
}
