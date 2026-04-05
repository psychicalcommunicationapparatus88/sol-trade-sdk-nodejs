/**
 * Confirmation Monitor for Sol Trade SDK
 * Monitors transaction confirmations with configurable strategies.
 */

import { Connection, Commitment, PublicKey } from '@solana/web3.js';
import { TradeError } from '../../index';

// ===== Types =====

/**
 * Confirmation status levels
 */
export enum ConfirmationStatus {
  /** Transaction not found */
  NotFound = 'NotFound',
  /** Transaction processed but not confirmed */
  Processed = 'Processed',
  /** Transaction confirmed by cluster */
  Confirmed = 'Confirmed',
  /** Transaction finalized (rooted) */
  Finalized = 'Finalized',
  /** Transaction failed with error */
  Failed = 'Failed',
  /** Confirmation timed out */
  TimedOut = 'TimedOut',
}

/**
 * Configuration for confirmation monitoring
 */
export interface ConfirmationConfig {
  /** Target commitment level */
  commitment: Commitment;
  /** Polling interval in milliseconds */
  pollIntervalMs: number;
  /** Maximum time to wait for confirmation */
  timeoutMs: number;
  /** Maximum retry attempts */
  maxRetries: number;
  /** Whether to use WebSocket subscription */
  useWebSocket: boolean;
  /** Whether to enable signature caching */
  enableCache: boolean;
  /** Cache TTL in milliseconds */
  cacheTtlMs: number;
  /** Callback for status updates */
  onStatusUpdate?: (signature: string, status: ConfirmationStatus, result?: ConfirmationResult) => void;
  /** Callback for progress updates */
  onProgress?: (signature: string, progress: ConfirmationProgress) => void;
}

/**
 * Confirmation progress information
 */
export interface ConfirmationProgress {
  /** Current status */
  status: ConfirmationStatus;
  /** Number of confirmations received */
  confirmations: number;
  /** Slot when transaction was processed */
  slot?: number;
  /** Current slot */
  currentSlot?: number;
  /** Elapsed time in milliseconds */
  elapsedMs: number;
  /** Estimated time remaining in milliseconds */
  estimatedRemainingMs?: number;
  /** Retry attempt number */
  retryAttempt: number;
}

/**
 * Result of confirmation monitoring
 */
export interface ConfirmationResult {
  /** Transaction signature */
  signature: string;
  /** Final confirmation status */
  status: ConfirmationStatus;
  /** Slot when transaction was processed */
  slot?: number;
  /** Blockhash of the block containing the transaction */
  blockhash?: string;
  /** Error information if transaction failed */
  error?: TransactionError;
  /** Total time to confirm in milliseconds */
  confirmationTimeMs: number;
  /** Number of retry attempts made */
  retryAttempts: number;
  /** Timestamp when monitoring started */
  startedAt: number;
  /** Timestamp when monitoring completed */
  completedAt: number;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Transaction error information
 */
export interface TransactionError {
  /** Error code */
  code: number;
  /** Error message */
  message: string;
  /** Program that caused the error (if applicable) */
  programId?: string;
  /** Error logs */
  logs?: string[];
}

/**
 * Monitored signature information
 */
interface MonitoredSignature {
  signature: string;
  startTime: number;
  config: ConfirmationConfig;
  status: ConfirmationStatus;
  slot?: number;
  blockhash?: string;
  error?: TransactionError;
  retryAttempts: number;
  lastPollTime: number;
  abortController: AbortController;
  callbacks: Set<(result: ConfirmationResult) => void>;
}

// ===== Default Configurations =====

/**
 * Get default confirmation configuration
 */
export function defaultConfirmationConfig(): ConfirmationConfig {
  return {
    commitment: 'confirmed',
    pollIntervalMs: 500,
    timeoutMs: 60000,
    maxRetries: 3,
    useWebSocket: false,
    enableCache: true,
    cacheTtlMs: 300000, // 5 minutes
  };
}

/**
 * Get fast confirmation configuration
 */
export function fastConfirmationConfig(): ConfirmationConfig {
  return {
    commitment: 'processed',
    pollIntervalMs: 200,
    timeoutMs: 10000,
    maxRetries: 1,
    useWebSocket: true,
    enableCache: false,
    cacheTtlMs: 60000,
  };
}

/**
 * Get reliable confirmation configuration
 */
export function reliableConfirmationConfig(): ConfirmationConfig {
  return {
    commitment: 'finalized',
    pollIntervalMs: 1000,
    timeoutMs: 120000,
    maxRetries: 5,
    useWebSocket: true,
    enableCache: true,
    cacheTtlMs: 600000, // 10 minutes
  };
}

// ===== Confirmation Monitor =====

/**
 * Monitors transaction confirmations with configurable strategies
 */
export class ConfirmationMonitor {
  private connection: Connection;
  private monitored: Map<string, MonitoredSignature> = new Map();
  private cache: Map<string, ConfirmationResult> = new Map();
  private pollInterval?: NodeJS.Timeout;
  private isRunning: boolean = false;
  private wsSubscription?: number;

  constructor(
    rpcUrl: string,
    private defaultConfig: ConfirmationConfig = defaultConfirmationConfig()
  ) {
    this.connection = new Connection(rpcUrl, defaultConfig.commitment);
  }

  /**
   * Start the confirmation monitor
   */
  start(): void {
    if (this.isRunning) return;

    this.isRunning = true;
    this.pollInterval = setInterval(() => {
      this.pollAll();
    }, this.defaultConfig.pollIntervalMs);

    if (this.defaultConfig.useWebSocket) {
      this.setupWebSocket();
    }
  }

  /**
   * Stop the confirmation monitor
   */
  stop(): void {
    this.isRunning = false;

    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = undefined;
    }

    if (this.wsSubscription !== undefined) {
      this.connection.removeSignatureListener(this.wsSubscription);
      this.wsSubscription = undefined;
    }

    // Abort all monitored signatures
    for (const monitored of this.monitored.values()) {
      monitored.abortController.abort();
    }
    this.monitored.clear();
  }

  /**
   * Monitor a transaction signature for confirmation
   */
  async monitor(
    signature: string,
    config?: Partial<ConfirmationConfig>
  ): Promise<ConfirmationResult> {
    const fullConfig = { ...this.defaultConfig, ...config };

    // Check cache first
    if (fullConfig.enableCache) {
      const cached = this.getCachedResult(signature);
      if (cached) {
        return cached;
      }
    }

    // Check if already being monitored
    const existing = this.monitored.get(signature);
    if (existing) {
      return this.waitForResult(existing);
    }

    // Start monitoring
    const monitored: MonitoredSignature = {
      signature,
      startTime: Date.now(),
      config: fullConfig,
      status: ConfirmationStatus.NotFound,
      retryAttempts: 0,
      lastPollTime: 0,
      abortController: new AbortController(),
      callbacks: new Set(),
    };

    this.monitored.set(signature, monitored);

    if (!this.isRunning) {
      this.start();
    }

    // Set up timeout
    this.setupTimeout(monitored);

    return this.waitForResult(monitored);
  }

  /**
   * Monitor multiple signatures
   */
  async monitorMultiple(
    signatures: string[],
    config?: Partial<ConfirmationConfig>
  ): Promise<ConfirmationResult[]> {
    return Promise.all(
      signatures.map(sig => this.monitor(sig, config))
    );
  }

  /**
   * Cancel monitoring for a signature
   */
  cancel(signature: string): boolean {
    const monitored = this.monitored.get(signature);
    if (monitored) {
      monitored.abortController.abort();
      this.monitored.delete(signature);
      return true;
    }
    return false;
  }

  /**
   * Get the current status of a monitored signature
   */
  getStatus(signature: string): ConfirmationStatus | undefined {
    const monitored = this.monitored.get(signature);
    if (monitored) {
      return monitored.status;
    }

    const cached = this.cache.get(signature);
    if (cached) {
      return cached.status;
    }

    return undefined;
  }

  /**
   * Get cached result if available and not expired
   */
  getCachedResult(signature: string): ConfirmationResult | undefined {
    const cached = this.cache.get(signature);
    if (!cached) return undefined;

    const age = Date.now() - cached.completedAt;
    if (age > this.defaultConfig.cacheTtlMs) {
      this.cache.delete(signature);
      return undefined;
    }

    return cached;
  }

  /**
   * Clear expired cache entries
   */
  clearExpiredCache(): number {
    const now = Date.now();
    let cleared = 0;

    for (const [signature, result] of this.cache) {
      if (now - result.completedAt > this.defaultConfig.cacheTtlMs) {
        this.cache.delete(signature);
        cleared++;
      }
    }

    return cleared;
  }

  /**
   * Get count of actively monitored signatures
   */
  getActiveCount(): number {
    return this.monitored.size;
  }

  /**
   * Get all actively monitored signatures
   */
  getActiveSignatures(): string[] {
    return Array.from(this.monitored.keys());
  }

  private async waitForResult(monitored: MonitoredSignature): Promise<ConfirmationResult> {
    return new Promise((resolve, reject) => {
      // Add callback to be called when monitoring completes
      const callback = (result: ConfirmationResult) => {
        if (result.status === ConfirmationStatus.Failed ||
            result.status === ConfirmationStatus.TimedOut) {
          reject(new TradeError(500, result.error?.message || 'Confirmation failed'));
        } else {
          resolve(result);
        }
      };

      monitored.callbacks.add(callback);

      // Check if already completed
      if (this.isTerminalStatus(monitored.status)) {
        const result = this.createResult(monitored);
        this.completeMonitoring(monitored, result);
      }
    });
  }

  private async pollAll(): Promise<void> {
    const promises: Promise<void>[] = [];

    for (const monitored of this.monitored.values()) {
      // Skip if recently polled
      const timeSinceLastPoll = Date.now() - monitored.lastPollTime;
      if (timeSinceLastPoll < monitored.config.pollIntervalMs) {
        continue;
      }

      promises.push(this.pollSignature(monitored));
    }

    await Promise.all(promises);

    // Clean up completed monitors
    this.cleanupCompleted();
  }

  private async pollSignature(monitored: MonitoredSignature): Promise<void> {
    if (monitored.abortController.signal.aborted) {
      return;
    }

    monitored.lastPollTime = Date.now();

    try {
      const status = await this.connection.getSignatureStatus(monitored.signature);

      if (!status.value) {
        // Transaction not found yet
        this.updateStatus(monitored, ConfirmationStatus.NotFound);
        return;
      }

      // Update slot information
      if (status.value.slot) {
        monitored.slot = status.value.slot;
      }

      // Check for errors
      if (status.value.err) {
        const error: TransactionError = {
          code: -32002,
          message: typeof status.value.err === 'string'
            ? status.value.err
            : JSON.stringify(status.value.err),
        };
        monitored.error = error;
        this.updateStatus(monitored, ConfirmationStatus.Failed);

        const result = this.createResult(monitored);
        this.completeMonitoring(monitored, result);
        return;
      }

      // Determine confirmation status
      const confirmationStatus = status.value.confirmationStatus;
      let newStatus = ConfirmationStatus.Processed;

      if (confirmationStatus === 'finalized') {
        newStatus = ConfirmationStatus.Finalized;
      } else if (confirmationStatus === 'confirmed') {
        newStatus = ConfirmationStatus.Confirmed;
      } else if (confirmationStatus === 'processed') {
        newStatus = ConfirmationStatus.Processed;
      }

      this.updateStatus(monitored, newStatus);

      // Check if target commitment reached
      if (this.isTargetReached(newStatus, monitored.config.commitment)) {
        const result = this.createResult(monitored);
        this.completeMonitoring(monitored, result);
      }
    } catch (error) {
      // Retry on error
      monitored.retryAttempts++;

      if (monitored.retryAttempts >= monitored.config.maxRetries) {
        monitored.error = {
          code: -32003,
          message: error instanceof Error ? error.message : 'Polling error',
        };
        this.updateStatus(monitored, ConfirmationStatus.Failed);

        const result = this.createResult(monitored);
        this.completeMonitoring(monitored, result);
      }
    }

    this.reportProgress(monitored);
  }

  private setupWebSocket(): void {
    // Note: Full WebSocket implementation would require signatureSubscribe
    // This is a simplified version
    try {
      // WebSocket setup would go here
      // this.wsSubscription = this.connection.onSignature(...);
    } catch {
      // Fall back to polling
    }
  }

  private setupTimeout(monitored: MonitoredSignature): void {
    setTimeout(() => {
      if (this.monitored.has(monitored.signature) &&
          !this.isTerminalStatus(monitored.status)) {
        this.updateStatus(monitored, ConfirmationStatus.TimedOut);

        const result = this.createResult(monitored);
        this.completeMonitoring(monitored, result);
      }
    }, monitored.config.timeoutMs);
  }

  private updateStatus(monitored: MonitoredSignature, status: ConfirmationStatus): void {
    monitored.status = status;

    if (monitored.config.onStatusUpdate) {
      const result = this.isTerminalStatus(status) ? this.createResult(monitored) : undefined;
      monitored.config.onStatusUpdate(monitored.signature, status, result);
    }
  }

  private reportProgress(monitored: MonitoredSignature): void {
    if (monitored.config.onProgress) {
      const elapsedMs = Date.now() - monitored.startTime;
      const progress: ConfirmationProgress = {
        status: monitored.status,
        confirmations: this.getConfirmationsCount(monitored.status),
        slot: monitored.slot,
        elapsedMs,
        estimatedRemainingMs: this.estimateRemainingTime(monitored),
        retryAttempt: monitored.retryAttempts,
      };
      monitored.config.onProgress(monitored.signature, progress);
    }
  }

  private getConfirmationsCount(status: ConfirmationStatus): number {
    switch (status) {
      case ConfirmationStatus.NotFound:
        return 0;
      case ConfirmationStatus.Processed:
        return 1;
      case ConfirmationStatus.Confirmed:
        return 2;
      case ConfirmationStatus.Finalized:
        return 3;
      default:
        return 0;
    }
  }

  private estimateRemainingTime(monitored: MonitoredSignature): number | undefined {
    const targetConfirmations = this.getConfirmationsCount(
      this.commitmentToStatus(monitored.config.commitment)
    );
    const currentConfirmations = this.getConfirmationsCount(monitored.status);

    if (currentConfirmations >= targetConfirmations) {
      return 0;
    }

    const elapsedMs = Date.now() - monitored.startTime;
    const avgTimePerConfirmation = elapsedMs / Math.max(currentConfirmations, 1);
    const remainingConfirmations = targetConfirmations - currentConfirmations;

    return Math.round(avgTimePerConfirmation * remainingConfirmations);
  }

  private commitmentToStatus(commitment: Commitment): ConfirmationStatus {
    switch (commitment) {
      case 'processed':
        return ConfirmationStatus.Processed;
      case 'confirmed':
        return ConfirmationStatus.Confirmed;
      case 'finalized':
        return ConfirmationStatus.Finalized;
      default:
        return ConfirmationStatus.Confirmed;
    }
  }

  private isTargetReached(current: ConfirmationStatus, target: Commitment): boolean {
    const levels = {
      [ConfirmationStatus.NotFound]: 0,
      [ConfirmationStatus.Processed]: 1,
      [ConfirmationStatus.Confirmed]: 2,
      [ConfirmationStatus.Finalized]: 3,
      [ConfirmationStatus.Failed]: 4,
      [ConfirmationStatus.TimedOut]: 4,
    };

    const currentLevel = levels[current];
    const targetLevel = this.getConfirmationsCount(this.commitmentToStatus(target));

    return currentLevel >= targetLevel;
  }

  private isTerminalStatus(status: ConfirmationStatus): boolean {
    return [
      ConfirmationStatus.Finalized,
      ConfirmationStatus.Failed,
      ConfirmationStatus.TimedOut,
    ].includes(status);
  }

  private createResult(monitored: MonitoredSignature): ConfirmationResult {
    const completedAt = Date.now();

    return {
      signature: monitored.signature,
      status: monitored.status,
      slot: monitored.slot,
      blockhash: monitored.blockhash,
      error: monitored.error,
      confirmationTimeMs: completedAt - monitored.startTime,
      retryAttempts: monitored.retryAttempts,
      startedAt: monitored.startTime,
      completedAt,
    };
  }

  private completeMonitoring(monitored: MonitoredSignature, result: ConfirmationResult): void {
    // Cache the result
    if (monitored.config.enableCache) {
      this.cache.set(monitored.signature, result);
    }

    // Notify callbacks
    for (const callback of monitored.callbacks) {
      try {
        callback(result);
      } catch {
        // Ignore callback errors
      }
    }

    // Clean up
    monitored.callbacks.clear();
    this.monitored.delete(monitored.signature);
  }

  private cleanupCompleted(): void {
    const now = Date.now();
    const maxAge = 300000; // 5 minutes

    for (const [signature, monitored] of this.monitored) {
      if (this.isTerminalStatus(monitored.status)) {
        const age = now - monitored.startTime;
        if (age > maxAge) {
          this.monitored.delete(signature);
        }
      }
    }
  }
}

// ===== Convenience Functions =====

/**
 * Create a new confirmation monitor
 */
export function createConfirmationMonitor(
  rpcUrl: string,
  config?: Partial<ConfirmationConfig>
): ConfirmationMonitor {
  return new ConfirmationMonitor(rpcUrl, { ...defaultConfirmationConfig(), ...config });
}

/**
 * Wait for a single transaction confirmation
 */
export async function waitForConfirmation(
  connection: Connection,
  signature: string,
  commitment: Commitment = 'confirmed',
  timeoutMs: number = 60000
): Promise<ConfirmationResult> {
  const monitor = new ConfirmationMonitor(connection.rpcEndpoint, {
    ...defaultConfirmationConfig(),
    commitment,
    timeoutMs,
  });

  monitor.start();

  try {
    return await monitor.monitor(signature);
  } finally {
    monitor.stop();
  }
}

/**
 * Check if a transaction is confirmed
 */
export async function isConfirmed(
  connection: Connection,
  signature: string,
  commitment: Commitment = 'confirmed'
): Promise<boolean> {
  try {
    const status = await connection.getSignatureStatus(signature);
    if (!status.value) return false;

    const levels = ['processed', 'confirmed', 'finalized'];
    const targetIndex = levels.indexOf(commitment);
    const currentIndex = levels.indexOf(status.value.confirmationStatus || 'processed');

    return currentIndex >= targetIndex && !status.value.err;
  } catch {
    return false;
  }
}
