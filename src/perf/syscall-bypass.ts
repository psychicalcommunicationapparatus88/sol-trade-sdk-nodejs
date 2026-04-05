/**
 * Syscall Bypass Module for Sol Trade SDK
 * Provides high-performance time and system call optimizations.
 */

// ===== Types =====

/**
 * Configuration for syscall bypass optimizations
 */
export interface SyscallBypassConfig {
  /** Enable fast time provider using cached time */
  enableFastTime: boolean;
  /** Time cache interval in microseconds */
  timeCacheIntervalUs: number;
  /** Enable syscall batching */
  enableBatching: boolean;
  /** Maximum batch size for syscalls */
  maxBatchSize: number;
  /** Enable vDSO (virtual dynamic shared object) time */
  useVdsoTime: boolean;
}

/**
 * Default syscall bypass configuration
 */
export function defaultSyscallBypassConfig(): SyscallBypassConfig {
  return {
    enableFastTime: true,
    timeCacheIntervalUs: 1000, // 1ms
    enableBatching: true,
    maxBatchSize: 64,
    useVdsoTime: true,
  };
}

// ===== Fast Time Provider =====

/**
 * High-performance time provider with caching to reduce syscalls.
 * Uses a background update mechanism to cache current time.
 */
export class FastTimeProvider {
  private cachedTimeNs: bigint = BigInt(0);
  private cachedTimeMs: number = 0;
  private lastUpdateNs: bigint = BigInt(0);
  private updateIntervalNs: bigint;
  private running: boolean = false;
  private updateTimer: NodeJS.Timeout | null = null;
  private useHighRes: boolean;

  constructor(updateIntervalUs: number = 1000, useHighRes: boolean = true) {
    this.updateIntervalNs = BigInt(updateIntervalUs * 1000);
    this.useHighRes = useHighRes;
    this.updateTime();
  }

  /**
   * Start the background time update loop
   */
  start(): void {
    if (this.running) return;
    this.running = true;

    // Update time periodically
    const intervalMs = Number(this.updateIntervalNs) / 1_000_000;
    this.updateTimer = setInterval(() => {
      this.updateTime();
    }, Math.max(1, intervalMs));
  }

  /**
   * Stop the background time update loop
   */
  stop(): void {
    this.running = false;
    if (this.updateTimer) {
      clearInterval(this.updateTimer);
      this.updateTimer = null;
    }
  }

  /**
   * Get cached time in nanoseconds (fast, no syscall)
   */
  nowNs(): bigint {
    return this.cachedTimeNs;
  }

  /**
   * Get cached time in microseconds (fast, no syscall)
   */
  nowUs(): bigint {
    return this.cachedTimeNs / BigInt(1000);
  }

  /**
   * Get cached time in milliseconds (fast, no syscall)
   */
  nowMs(): number {
    return this.cachedTimeMs;
  }

  /**
   * Get precise time (may involve syscall)
   */
  preciseNowNs(): bigint {
    if (this.useHighRes && typeof process !== 'undefined' && process.hrtime) {
      const [seconds, nanoseconds] = process.hrtime();
      return BigInt(seconds) * BigInt(1e9) + BigInt(nanoseconds);
    }
    return BigInt(Date.now()) * BigInt(1e6);
  }

  /**
   * Get precise time in microseconds
   */
  preciseNowUs(): bigint {
    return this.preciseNowNs() / BigInt(1000);
  }

  private updateTime(): void {
    this.cachedTimeNs = this.preciseNowNs();
    this.cachedTimeMs = Date.now();
    this.lastUpdateNs = this.cachedTimeNs;
  }
}

// ===== Syscall Bypass Manager =====

/**
 * Manages syscall bypass optimizations for high-frequency trading.
 * Reduces system call overhead through caching and batching.
 */
export class SyscallBypassManager {
  private config: SyscallBypassConfig;
  private timeProvider: FastTimeProvider;
  private syscallQueue: Array<() => void> = [];
  private batchTimer: NodeJS.Timeout | null = null;
  private stats: SyscallStats;

  constructor(config: SyscallBypassConfig = defaultSyscallBypassConfig()) {
    this.config = config;
    this.timeProvider = new FastTimeProvider(config.timeCacheIntervalUs);
    this.stats = {
      totalCalls: 0,
      bypassedCalls: 0,
      batchedCalls: 0,
      timeSavedNs: BigInt(0),
    };
  }

  /**
   * Initialize the syscall bypass manager
   */
  initialize(): void {
    if (this.config.enableFastTime) {
      this.timeProvider.start();
    }

    if (this.config.enableBatching) {
      this.startBatching();
    }
  }

  /**
   * Shutdown the syscall bypass manager
   */
  shutdown(): void {
    this.timeProvider.stop();

    if (this.batchTimer) {
      clearInterval(this.batchTimer);
      this.batchTimer = null;
    }

    // Flush remaining batched syscalls
    this.flushBatch();
  }

  /**
   * Get fast cached time in nanoseconds
   */
  fastTimeNs(): bigint {
    this.stats.totalCalls++;
    this.stats.bypassedCalls++;
    return this.timeProvider.nowNs();
  }

  /**
   * Get fast cached time in microseconds
   */
  fastTimeUs(): bigint {
    return this.timeProvider.nowUs();
  }

  /**
   * Get fast cached time in milliseconds
   */
  fastTimeMs(): number {
    return this.timeProvider.nowMs();
  }

  /**
   * Queue a syscall for batching
   */
  queueSyscall(syscall: () => void): void {
    if (!this.config.enableBatching) {
      syscall();
      return;
    }

    this.syscallQueue.push(syscall);
    this.stats.batchedCalls++;

    if (this.syscallQueue.length >= this.config.maxBatchSize) {
      this.flushBatch();
    }
  }

  /**
   * Execute a function with syscall bypass timing
   */
  measure<T>(fn: () => T): { result: T; elapsedNs: bigint } {
    const start = this.timeProvider.preciseNowNs();
    const result = fn();
    const elapsed = this.timeProvider.preciseNowNs() - start;
    return { result, elapsedNs: elapsed };
  }

  /**
   * Get syscall bypass statistics
   */
  getStats(): SyscallStats {
    const bypassRate = this.stats.totalCalls > 0
      ? this.stats.bypassedCalls / this.stats.totalCalls
      : 0;

    return {
      ...this.stats,
      bypassRate,
    };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {
      totalCalls: 0,
      bypassedCalls: 0,
      batchedCalls: 0,
      timeSavedNs: BigInt(0),
    };
  }

  private startBatching(): void {
    // Flush batch periodically
    this.batchTimer = setInterval(() => {
      this.flushBatch();
    }, 1); // 1ms batch window
  }

  private flushBatch(): void {
    while (this.syscallQueue.length > 0) {
      const syscall = this.syscallQueue.shift();
      if (syscall) {
        try {
          syscall();
        } catch (error) {
          // Log but don't throw to prevent batch disruption
          console.error('Batched syscall error:', error);
        }
      }
    }
  }
}

/**
 * Syscall bypass statistics
 */
interface SyscallStats {
  totalCalls: number;
  bypassedCalls: number;
  batchedCalls: number;
  timeSavedNs: bigint;
  bypassRate?: number;
}

// ===== Convenience Functions =====

/**
 * Create a new syscall bypass manager with default configuration
 */
export function createSyscallBypassManager(
  config?: Partial<SyscallBypassConfig>
): SyscallBypassManager {
  const fullConfig = { ...defaultSyscallBypassConfig(), ...config };
  return new SyscallBypassManager(fullConfig);
}

/**
 * Global fast time provider instance
 */
let globalTimeProvider: FastTimeProvider | null = null;

/**
 * Get the global fast time provider (creates if needed)
 */
export function getGlobalTimeProvider(): FastTimeProvider {
  if (!globalTimeProvider) {
    globalTimeProvider = new FastTimeProvider();
    globalTimeProvider.start();
  }
  return globalTimeProvider;
}

/**
 * Fast time access using global provider
 */
export function fastNowNs(): bigint {
  return getGlobalTimeProvider().nowNs();
}

export function fastNowUs(): bigint {
  return getGlobalTimeProvider().nowUs();
}

export function fastNowMs(): number {
  return getGlobalTimeProvider().nowMs();
}
