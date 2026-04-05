/**
 * Retry Handler for Sol Trade SDK
 * Implements retry strategies with circuit breaker pattern.
 */

import { TradeError } from '../../index';

// ===== Types =====

/**
 * Retry strategy types
 */
export enum RetryStrategy {
  /** No retry - fail immediately */
  None = 'None',
  /** Fixed delay between retries */
  Fixed = 'Fixed',
  /** Linear increasing delay */
  Linear = 'Linear',
  /** Exponential backoff */
  Exponential = 'Exponential',
  /** Exponential backoff with jitter */
  ExponentialJitter = 'ExponentialJitter',
  /** Custom retry strategy */
  Custom = 'Custom',
}

/**
 * Configuration for retry behavior
 */
export interface RetryConfig {
  /** Maximum number of retry attempts */
  maxAttempts: number;
  /** Initial delay between retries in milliseconds */
  initialDelayMs: number;
  /** Maximum delay between retries in milliseconds */
  maxDelayMs: number;
  /** Multiplier for exponential backoff */
  backoffMultiplier: number;
  /** Retry strategy to use */
  strategy: RetryStrategy;
  /** Whether to retry on all errors or specific ones */
  retryAllErrors: boolean;
  /** Specific error codes to retry on */
  retryableErrorCodes: number[];
  /** Specific error messages to retry on */
  retryableErrorMessages: string[];
  /** Whether to retry on timeout */
  retryOnTimeout: boolean;
  /** Timeout for each attempt in milliseconds */
  attemptTimeoutMs: number;
  /** Callback before each retry attempt */
  onRetry?: (attempt: number, error: Error, nextDelayMs: number) => void;
  /** Callback when all attempts exhausted */
  onExhausted?: (lastError: Error, attempts: number) => void;
}

/**
 * Result of a retry operation
 */
export interface RetryResult<T> {
  /** Whether the operation succeeded */
  success: boolean;
  /** Result value if succeeded */
  value?: T;
  /** Error if failed */
  error?: Error;
  /** Number of attempts made */
  attempts: number;
  /** Total time elapsed in milliseconds */
  totalTimeMs: number;
  /** Whether the result was from cache */
  fromCache?: boolean;
}

/**
 * Circuit breaker states
 */
export enum CircuitState {
  /** Normal operation - requests allowed */
  Closed = 'Closed',
  /** Failure threshold reached - requests blocked */
  Open = 'Open',
  /** Testing if service has recovered */
  HalfOpen = 'HalfOpen',
}

/**
 * Circuit breaker configuration
 */
export interface CircuitBreakerConfig {
  /** Number of failures before opening circuit */
  failureThreshold: number;
  /** Time to wait before attempting reset in milliseconds */
  resetTimeoutMs: number;
  /** Number of successes required to close circuit from half-open */
  successThreshold: number;
  /** Time window for counting failures in milliseconds */
  failureWindowMs: number;
  /** Half-open request probability (0-1) */
  halfOpenProbability: number;
  /** Callback when circuit opens */
  onOpen?: () => void;
  /** Callback when circuit closes */
  onClose?: () => void;
  /** Callback when circuit enters half-open */
  onHalfOpen?: () => void;
}

/**
 * Circuit breaker statistics
 */
export interface CircuitStats {
  /** Current circuit state */
  state: CircuitState;
  /** Total requests made */
  totalRequests: number;
  /** Total successful requests */
  successfulRequests: number;
  /** Total failed requests */
  failedRequests: number;
  /** Current consecutive failures */
  consecutiveFailures: number;
  /** Last failure timestamp */
  lastFailureTime?: number;
  /** Last success timestamp */
  lastSuccessTime?: number;
  /** Circuit open timestamp */
  circuitOpenTime?: number;
  /** Current failure rate (0-1) */
  failureRate: number;
}

// ===== Default Configurations =====

/**
 * Get default retry configuration
 */
export function defaultRetryConfig(): RetryConfig {
  return {
    maxAttempts: 3,
    initialDelayMs: 100,
    maxDelayMs: 10000,
    backoffMultiplier: 2,
    strategy: RetryStrategy.Exponential,
    retryAllErrors: false,
    retryableErrorCodes: [429, 500, 502, 503, 504],
    retryableErrorMessages: ['timeout', 'rate limit', 'temporarily unavailable'],
    retryOnTimeout: true,
    attemptTimeoutMs: 30000,
  };
}

/**
 * Get aggressive retry configuration
 */
export function aggressiveRetryConfig(): RetryConfig {
  return {
    maxAttempts: 5,
    initialDelayMs: 50,
    maxDelayMs: 5000,
    backoffMultiplier: 1.5,
    strategy: RetryStrategy.ExponentialJitter,
    retryAllErrors: true,
    retryableErrorCodes: [],
    retryableErrorMessages: [],
    retryOnTimeout: true,
    attemptTimeoutMs: 15000,
  };
}

/**
 * Get conservative retry configuration
 */
export function conservativeRetryConfig(): RetryConfig {
  return {
    maxAttempts: 2,
    initialDelayMs: 500,
    maxDelayMs: 30000,
    backoffMultiplier: 2,
    strategy: RetryStrategy.Exponential,
    retryAllErrors: false,
    retryableErrorCodes: [503, 504],
    retryableErrorMessages: ['service unavailable'],
    retryOnTimeout: false,
    attemptTimeoutMs: 60000,
  };
}

/**
 * Get default circuit breaker configuration
 */
export function defaultCircuitBreakerConfig(): CircuitBreakerConfig {
  return {
    failureThreshold: 5,
    resetTimeoutMs: 30000,
    successThreshold: 2,
    failureWindowMs: 60000,
    halfOpenProbability: 0.5,
  };
}

// ===== Exponential Backoff =====

/**
 * Calculates delays for exponential backoff strategies
 */
export class ExponentialBackoff {
  constructor(private config: RetryConfig) {}

  /**
   * Calculate delay for a specific attempt
   */
  calculateDelay(attempt: number): number {
    switch (this.config.strategy) {
      case RetryStrategy.None:
        return 0;
      case RetryStrategy.Fixed:
        return this.config.initialDelayMs;
      case RetryStrategy.Linear:
        return Math.min(
          this.config.initialDelayMs * attempt,
          this.config.maxDelayMs
        );
      case RetryStrategy.Exponential:
        return Math.min(
          this.config.initialDelayMs * Math.pow(this.config.backoffMultiplier, attempt - 1),
          this.config.maxDelayMs
        );
      case RetryStrategy.ExponentialJitter:
        const baseDelay = Math.min(
          this.config.initialDelayMs * Math.pow(this.config.backoffMultiplier, attempt - 1),
          this.config.maxDelayMs
        );
        // Add random jitter (±25%)
        const jitter = baseDelay * 0.25 * (Math.random() * 2 - 1);
        return Math.max(0, baseDelay + jitter);
      default:
        return this.config.initialDelayMs;
    }
  }

  /**
   * Calculate all delays for all attempts
   */
  calculateAllDelays(): number[] {
    const delays: number[] = [];
    for (let i = 1; i <= this.config.maxAttempts; i++) {
      delays.push(this.calculateDelay(i));
    }
    return delays;
  }

  /**
   * Get total estimated time for all retries
   */
  getTotalEstimatedTime(): number {
    const delays = this.calculateAllDelays();
    return delays.reduce((sum, delay) => sum + delay, 0);
  }
}

// ===== Circuit Breaker =====

/**
 * Circuit breaker implementation for fault tolerance
 */
export class CircuitBreaker {
  private state: CircuitState = CircuitState.Closed;
  private stats: CircuitStats;
  private failureTimes: number[] = [];
  private consecutiveSuccesses: number = 0;
  private halfOpenAttempts: number = 0;

  constructor(private config: CircuitBreakerConfig = defaultCircuitBreakerConfig()) {
    this.stats = this.initializeStats();
  }

  /**
   * Execute a function with circuit breaker protection
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (!this.canExecute()) {
      throw new TradeError(503, 'Circuit breaker is open');
    }

    try {
      const result = await fn();
      this.recordSuccess();
      return result;
    } catch (error) {
      this.recordFailure();
      throw error;
    }
  }

  /**
   * Check if execution is allowed
   */
  canExecute(): boolean {
    this.updateState();

    switch (this.state) {
      case CircuitState.Closed:
        return true;
      case CircuitState.Open:
        return false;
      case CircuitState.HalfOpen:
        // Allow some requests through in half-open state
        return Math.random() < this.config.halfOpenProbability;
      default:
        return false;
    }
  }

  /**
   * Force open the circuit
   */
  forceOpen(): void {
    this.transitionTo(CircuitState.Open);
  }

  /**
   * Force close the circuit
   */
  forceClose(): void {
    this.transitionTo(CircuitState.Closed);
  }

  /**
   * Get current circuit state
   */
  getState(): CircuitState {
    this.updateState();
    return this.state;
  }

  /**
   * Get circuit statistics
   */
  getStats(): CircuitStats {
    this.updateStats();
    return { ...this.stats };
  }

  /**
   * Reset circuit statistics
   */
  reset(): void {
    this.state = CircuitState.Closed;
    this.stats = this.initializeStats();
    this.failureTimes = [];
    this.consecutiveSuccesses = 0;
    this.halfOpenAttempts = 0;
  }

  private recordSuccess(): void {
    this.stats.totalRequests++;
    this.stats.successfulRequests++;
    this.stats.lastSuccessTime = Date.now();
    this.consecutiveSuccesses++;

    if (this.state === CircuitState.HalfOpen) {
      if (this.consecutiveSuccesses >= this.config.successThreshold) {
        this.transitionTo(CircuitState.Closed);
      }
    } else {
      this.stats.consecutiveFailures = 0;
    }

    this.updateStats();
  }

  private recordFailure(): void {
    const now = Date.now();
    this.stats.totalRequests++;
    this.stats.failedRequests++;
    this.stats.consecutiveFailures++;
    this.stats.lastFailureTime = now;
    this.consecutiveSuccesses = 0;

    this.failureTimes.push(now);
    this.cleanupOldFailures();

    if (this.state === CircuitState.HalfOpen) {
      this.transitionTo(CircuitState.Open);
    } else if (this.failureTimes.length >= this.config.failureThreshold) {
      this.transitionTo(CircuitState.Open);
    }

    this.updateStats();
  }

  private updateState(): void {
    if (this.state === CircuitState.Open) {
      const timeSinceOpen = Date.now() - (this.stats.circuitOpenTime || 0);
      if (timeSinceOpen >= this.config.resetTimeoutMs) {
        this.transitionTo(CircuitState.HalfOpen);
      }
    }
  }

  private transitionTo(newState: CircuitState): void {
    const oldState = this.state;
    this.state = newState;

    if (newState === CircuitState.Open) {
      this.stats.circuitOpenTime = Date.now();
      if (this.config.onOpen) this.config.onOpen();
    } else if (newState === CircuitState.Closed) {
      this.consecutiveSuccesses = 0;
      this.failureTimes = [];
      this.stats.consecutiveFailures = 0;
      if (this.config.onClose) this.config.onClose();
    } else if (newState === CircuitState.HalfOpen) {
      this.halfOpenAttempts = 0;
      if (this.config.onHalfOpen) this.config.onHalfOpen();
    }
  }

  private cleanupOldFailures(): void {
    const cutoff = Date.now() - this.config.failureWindowMs;
    this.failureTimes = this.failureTimes.filter(time => time > cutoff);
  }

  private updateStats(): void {
    const totalRequests = this.stats.totalRequests;
    this.stats.failureRate = totalRequests > 0
      ? this.stats.failedRequests / totalRequests
      : 0;
  }

  private initializeStats(): CircuitStats {
    return {
      state: CircuitState.Closed,
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      consecutiveFailures: 0,
      failureRate: 0,
    };
  }
}

// ===== Retry Handler =====

/**
 * Handles retry logic with configurable strategies
 */
export class RetryHandler {
  private backoff: ExponentialBackoff;
  private circuitBreaker?: CircuitBreaker;

  constructor(
    private config: RetryConfig = defaultRetryConfig(),
    circuitBreakerConfig?: CircuitBreakerConfig
  ) {
    this.backoff = new ExponentialBackoff(config);
    if (circuitBreakerConfig) {
      this.circuitBreaker = new CircuitBreaker(circuitBreakerConfig);
    }
  }

  /**
   * Execute a function with retry logic
   */
  async execute<T>(fn: () => Promise<T>): Promise<RetryResult<T>> {
    const startTime = Date.now();

    // Check circuit breaker
    if (this.circuitBreaker && !this.circuitBreaker.canExecute()) {
      return {
        success: false,
        error: new TradeError(503, 'Circuit breaker is open'),
        attempts: 0,
        totalTimeMs: Date.now() - startTime,
      };
    }

    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= this.config.maxAttempts; attempt++) {
      try {
        let result: T;

        if (this.circuitBreaker) {
          result = await this.circuitBreaker.execute(fn);
        } else {
          result = await fn();
        }

        return {
          success: true,
          value: result,
          attempts: attempt,
          totalTimeMs: Date.now() - startTime,
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Check if we should retry this error
        if (!this.shouldRetry(lastError, attempt)) {
          break;
        }

        // Calculate delay for next attempt
        if (attempt < this.config.maxAttempts) {
          const delayMs = this.backoff.calculateDelay(attempt);

          if (this.config.onRetry) {
            this.config.onRetry(attempt, lastError, delayMs);
          }

          await this.sleep(delayMs);
        }
      }
    }

    // All attempts exhausted
    if (this.config.onExhausted && lastError) {
      this.config.onExhausted(lastError, this.config.maxAttempts);
    }

    return {
      success: false,
      error: lastError,
      attempts: this.config.maxAttempts,
      totalTimeMs: Date.now() - startTime,
    };
  }

  /**
   * Execute with timeout for each attempt
   */
  async executeWithTimeout<T>(fn: () => Promise<T>, timeoutMs?: number): Promise<RetryResult<T>> {
    const actualTimeout = timeoutMs ?? this.config.attemptTimeoutMs;

    return this.execute(async () => {
      return Promise.race([
        fn(),
        new Promise<T>((_, reject) => {
          setTimeout(() => {
            reject(new TradeError(408, `Operation timed out after ${actualTimeout}ms`));
          }, actualTimeout);
        }),
      ]);
    });
  }

  /**
   * Get current retry configuration
   */
  getConfig(): RetryConfig {
    return { ...this.config };
  }

  /**
   * Update retry configuration
   */
  updateConfig(config: Partial<RetryConfig>): void {
    this.config = { ...this.config, ...config };
    this.backoff = new ExponentialBackoff(this.config);
  }

  /**
   * Get circuit breaker stats if available
   */
  getCircuitStats(): CircuitStats | undefined {
    return this.circuitBreaker?.getStats();
  }

  /**
   * Reset circuit breaker if available
   */
  resetCircuit(): void {
    this.circuitBreaker?.reset();
  }

  private shouldRetry(error: Error, attempt: number): boolean {
    // Don't retry if we've reached max attempts
    if (attempt >= this.config.maxAttempts) {
      return false;
    }

    // Check if retrying all errors
    if (this.config.retryAllErrors) {
      return true;
    }

    // Check error code
    const tradeError = error as TradeError;
    if (tradeError.code !== undefined &&
        this.config.retryableErrorCodes.includes(tradeError.code)) {
      return true;
    }

    // Check error message
    const errorMessage = error.message.toLowerCase();
    for (const retryableMessage of this.config.retryableErrorMessages) {
      if (errorMessage.includes(retryableMessage.toLowerCase())) {
        return true;
      }
    }

    // Check for timeout
    if (this.config.retryOnTimeout &&
        (errorMessage.includes('timeout') || errorMessage.includes('timed out'))) {
      return true;
    }

    return false;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ===== Convenience Functions =====

/**
 * Create a new retry handler
 */
export function createRetryHandler(
  config?: Partial<RetryConfig>,
  circuitBreakerConfig?: Partial<CircuitBreakerConfig>
): RetryHandler {
  return new RetryHandler(
    { ...defaultRetryConfig(), ...config },
    circuitBreakerConfig ? { ...defaultCircuitBreakerConfig(), ...circuitBreakerConfig } : undefined
  );
}

/**
 * Execute a function with retry logic
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  config?: Partial<RetryConfig>
): Promise<T> {
  const handler = new RetryHandler({ ...defaultRetryConfig(), ...config });
  const result = await handler.execute(fn);

  if (!result.success) {
    throw result.error || new TradeError(500, 'Operation failed after retries');
  }

  return result.value as T;
}

/**
 * Execute a function with circuit breaker protection
 */
export async function withCircuitBreaker<T>(
  fn: () => Promise<T>,
  circuitBreakerConfig?: Partial<CircuitBreakerConfig>
): Promise<T> {
  const config = { ...defaultCircuitBreakerConfig(), ...circuitBreakerConfig };
  const breaker = new CircuitBreaker(config);
  return breaker.execute(fn);
}

/**
 * Calculate exponential backoff delay
 */
export function calculateBackoff(
  attempt: number,
  initialDelayMs: number = 100,
  multiplier: number = 2,
  maxDelayMs: number = 10000,
  jitter: boolean = false
): number {
  let delay = Math.min(
    initialDelayMs * Math.pow(multiplier, attempt - 1),
    maxDelayMs
  );

  if (jitter) {
    delay += delay * 0.25 * (Math.random() * 2 - 1);
  }

  return Math.max(0, delay);
}
