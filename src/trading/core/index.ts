/**
 * Trading Core Module for Sol Trade SDK
 * Core trading infrastructure with async execution, transaction pooling,
 * confirmation monitoring, and retry handling.
 */

// ===== Async Executor =====
export {
  AsyncTradeExecutor,
  SubmitMode,
  ExecutionStatus,
  ExecutionConfig,
  ExecutionProgress,
  ExecutionResult,
  defaultExecutionConfig,
  hftExecutionConfig,
  reliableExecutionConfig,
  createAsyncExecutor,
  executeTrade,
} from './async-executor';

// ===== Transaction Pool =====
export {
  TransactionPool,
  TransactionStatus,
  PriorityLevel,
  PoolConfig,
  PoolStats,
  PendingTransaction,
  PriorityScore,
  PriorityCalculator,
  defaultPoolConfig,
  highThroughputPoolConfig,
  conservativePoolConfig,
  createTransactionPool,
  submitToPool,
} from './transaction-pool';

// ===== Confirmation Monitor =====
export {
  ConfirmationMonitor,
  ConfirmationStatus,
  ConfirmationConfig,
  ConfirmationProgress,
  ConfirmationResult,
  TransactionError,
  defaultConfirmationConfig,
  fastConfirmationConfig,
  reliableConfirmationConfig,
  createConfirmationMonitor,
  waitForConfirmation,
  isConfirmed,
} from './confirmation-monitor';

// ===== Retry Handler =====
export {
  RetryHandler,
  RetryStrategy,
  RetryConfig,
  RetryResult,
  CircuitBreaker,
  CircuitState,
  CircuitBreakerConfig,
  CircuitStats,
  ExponentialBackoff,
  defaultRetryConfig,
  aggressiveRetryConfig,
  conservativeRetryConfig,
  defaultCircuitBreakerConfig,
  createRetryHandler,
  withRetry,
  withCircuitBreaker,
  calculateBackoff,
} from './retry-handler';
