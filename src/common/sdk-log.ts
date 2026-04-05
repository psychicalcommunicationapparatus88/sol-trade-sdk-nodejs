/**
 * SDK Logging module for Sol Trade SDK
 * Provides structured logging with multiple log levels and output formats.
 */

// ===== Log Level Enum =====

/**
 * Log level severity
 */
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  FATAL = 4,
  NONE = 5,
}

/**
 * Get log level name
 */
export function getLogLevelName(level: LogLevel): string {
  switch (level) {
    case LogLevel.DEBUG:
      return 'DEBUG';
    case LogLevel.INFO:
      return 'INFO';
    case LogLevel.WARN:
      return 'WARN';
    case LogLevel.ERROR:
      return 'ERROR';
    case LogLevel.FATAL:
      return 'FATAL';
    case LogLevel.NONE:
      return 'NONE';
    default:
      return 'UNKNOWN';
  }
}

/**
 * Parse log level from string
 */
export function parseLogLevel(level: string): LogLevel {
  switch (level.toUpperCase()) {
    case 'DEBUG':
      return LogLevel.DEBUG;
    case 'INFO':
      return LogLevel.INFO;
    case 'WARN':
    case 'WARNING':
      return LogLevel.WARN;
    case 'ERROR':
      return LogLevel.ERROR;
    case 'FATAL':
      return LogLevel.FATAL;
    case 'NONE':
      return LogLevel.NONE;
    default:
      return LogLevel.INFO;
  }
}

// ===== Log Entry Types =====

/**
 * Log entry metadata
 */
export interface LogMetadata {
  [key: string]: unknown;
}

/**
 * Log entry structure
 */
export interface LogEntry {
  timestamp: Date;
  level: LogLevel;
  levelName: string;
  message: string;
  context?: string;
  metadata?: LogMetadata;
  error?: Error;
}

/**
 * Log formatter type
 */
export type LogFormatter = (entry: LogEntry) => string;

// ===== Default Formatters =====

/**
 * Simple text formatter
 */
export function simpleFormatter(entry: LogEntry): string {
  const timestamp = entry.timestamp.toISOString();
  const context = entry.context ? `[${entry.context}] ` : '';
  return `${timestamp} [${entry.levelName}] ${context}${entry.message}`;
}

/**
 * Colored formatter for terminal output
 */
export function coloredFormatter(entry: LogEntry): string {
  const timestamp = entry.timestamp.toISOString();
  const context = entry.context ? `[${entry.context}] ` : '';

  const colors: Record<LogLevel, string> = {
    [LogLevel.DEBUG]: '\x1b[36m', // Cyan
    [LogLevel.INFO]: '\x1b[32m',  // Green
    [LogLevel.WARN]: '\x1b[33m',  // Yellow
    [LogLevel.ERROR]: '\x1b[31m', // Red
    [LogLevel.FATAL]: '\x1b[35m', // Magenta
    [LogLevel.NONE]: '\x1b[0m',   // Reset
  };

  const reset = '\x1b[0m';
  const color = colors[entry.level] || '';

  return `${timestamp} ${color}[${entry.levelName}]${reset} ${context}${entry.message}`;
}

/**
 * JSON formatter for structured logging
 */
export function jsonFormatter(entry: LogEntry): string {
  const logObj: Record<string, unknown> = {
    timestamp: entry.timestamp.toISOString(),
    level: entry.levelName,
    message: entry.message,
  };

  if (entry.context) {
    logObj.context = entry.context;
  }

  if (entry.metadata) {
    logObj.metadata = entry.metadata;
  }

  if (entry.error) {
    logObj.error = {
      name: entry.error.name,
      message: entry.error.message,
      stack: entry.error.stack,
    };
  }

  return JSON.stringify(logObj);
}

// ===== Log Output Interface =====

/**
 * Log output destination
 */
export interface LogOutput {
  write(entry: LogEntry, formatted: string): void;
  flush?(): void;
}

/**
 * Console log output
 */
export class ConsoleOutput implements LogOutput {
  private useStderr: boolean;

  constructor(useStderr: boolean = false) {
    this.useStderr = useStderr;
  }

  write(entry: LogEntry, formatted: string): void {
    if (this.useStderr && entry.level >= LogLevel.ERROR) {
      console.error(formatted);
    } else {
      console.log(formatted);
    }
  }
}

/**
 * Memory buffer output (for testing)
 */
export class MemoryOutput implements LogOutput {
  private entries: LogEntry[] = [];

  write(entry: LogEntry): void {
    this.entries.push(entry);
  }

  getEntries(): LogEntry[] {
    return [...this.entries];
  }

  clear(): void {
    this.entries = [];
  }
}

/**
 * Callback output for custom handling
 */
export class CallbackOutput implements LogOutput {
  constructor(private callback: (entry: LogEntry) => void) {}

  write(entry: LogEntry): void {
    this.callback(entry);
  }
}

// ===== SDK Logger =====

/**
 * SDK Logger configuration
 */
export interface SDKLoggerConfig {
  level: LogLevel;
  formatter: LogFormatter;
  outputs: LogOutput[];
  context?: string;
  includeTimestamp?: boolean;
}

/**
 * SDK Logger class
 */
export class SDKLogger {
  private config: SDKLoggerConfig;

  constructor(config: Partial<SDKLoggerConfig> = {}) {
    this.config = {
      level: LogLevel.INFO,
      formatter: simpleFormatter,
      outputs: [new ConsoleOutput()],
      context: undefined,
      includeTimestamp: true,
      ...config,
    };
  }

  /**
   * Check if a log level is enabled
   */
  isEnabled(level: LogLevel): boolean {
    return level >= this.config.level;
  }

  /**
   * Log a message at the specified level
   */
  log(level: LogLevel, message: string, metadata?: LogMetadata, error?: Error): void {
    if (!this.isEnabled(level)) {
      return;
    }

    const entry: LogEntry = {
      timestamp: new Date(),
      level,
      levelName: getLogLevelName(level),
      message,
      context: this.config.context,
      metadata,
      error,
    };

    const formatted = this.config.formatter(entry);

    for (const output of this.config.outputs) {
      output.write(entry, formatted);
    }
  }

  /**
   * Log debug message
   */
  debug(message: string, metadata?: LogMetadata): void {
    this.log(LogLevel.DEBUG, message, metadata);
  }

  /**
   * Log info message
   */
  info(message: string, metadata?: LogMetadata): void {
    this.log(LogLevel.INFO, message, metadata);
  }

  /**
   * Log warning message
   */
  warn(message: string, metadata?: LogMetadata, error?: Error): void {
    this.log(LogLevel.WARN, message, metadata, error);
  }

  /**
   * Log error message
   */
  error(message: string, metadata?: LogMetadata, error?: Error): void {
    this.log(LogLevel.ERROR, message, metadata, error);
  }

  /**
   * Log fatal message
   */
  fatal(message: string, metadata?: LogMetadata, error?: Error): void {
    this.log(LogLevel.FATAL, message, metadata, error);
  }

  /**
   * Create a child logger with a specific context
   */
  child(context: string): SDKLogger {
    return new SDKLogger({
      ...this.config,
      context: this.config.context ? `${this.config.context}.${context}` : context,
    });
  }

  /**
   * Update logger configuration
   */
  setConfig(config: Partial<SDKLoggerConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Set log level
   */
  setLevel(level: LogLevel): void {
    this.config.level = level;
  }

  /**
   * Get current log level
   */
  getLevel(): LogLevel {
    return this.config.level;
  }

  /**
   * Add an output destination
   */
  addOutput(output: LogOutput): void {
    this.config.outputs.push(output);
  }

  /**
   * Remove all outputs
   */
  clearOutputs(): void {
    this.config.outputs = [];
  }
}

// ===== Global Logger Instance =====

let globalLogger: SDKLogger | null = null;

/**
 * Get the global logger instance
 */
export function getLogger(): SDKLogger {
  if (!globalLogger) {
    globalLogger = new SDKLogger();
  }
  return globalLogger;
}

/**
 * Set the global logger instance
 */
export function setLogger(logger: SDKLogger): void {
  globalLogger = logger;
}

// ===== Setup Functions =====

/**
 * Setup logging configuration
 */
export interface LoggingSetup {
  level?: LogLevel | string;
  format?: 'simple' | 'colored' | 'json';
  outputs?: LogOutput[];
  context?: string;
}

/**
 * Setup logging with the specified configuration
 */
export function setupLogging(setup: LoggingSetup = {}): SDKLogger {
  const level = typeof setup.level === 'string' ? parseLogLevel(setup.level) : (setup.level ?? LogLevel.INFO);

  let formatter: LogFormatter;
  switch (setup.format) {
    case 'json':
      formatter = jsonFormatter;
      break;
    case 'colored':
      formatter = coloredFormatter;
      break;
    case 'simple':
    default:
      formatter = simpleFormatter;
      break;
  }

  const logger = new SDKLogger({
    level,
    formatter,
    outputs: setup.outputs ?? [new ConsoleOutput()],
    context: setup.context,
  });

  setLogger(logger);
  return logger;
}

/**
 * Setup development logging (colored, verbose)
 */
export function setupDevLogging(): SDKLogger {
  return setupLogging({
    level: LogLevel.DEBUG,
    format: 'colored',
  });
}

/**
 * Setup production logging (JSON, info level)
 */
export function setupProdLogging(): SDKLogger {
  return setupLogging({
    level: LogLevel.INFO,
    format: 'json',
  });
}

/**
 * Disable all logging
 */
export function disableLogging(): void {
  setupLogging({
    level: LogLevel.NONE,
  });
}

// ===== Convenience Exports =====

/**
 * Quick log functions using global logger
 */
export const log = {
  debug: (message: string, metadata?: LogMetadata) => getLogger().debug(message, metadata),
  info: (message: string, metadata?: LogMetadata) => getLogger().info(message, metadata),
  warn: (message: string, metadata?: LogMetadata, error?: Error) => getLogger().warn(message, metadata, error),
  error: (message: string, metadata?: LogMetadata, error?: Error) => getLogger().error(message, metadata, error),
  fatal: (message: string, metadata?: LogMetadata, error?: Error) => getLogger().fatal(message, metadata, error),
};
