/**
 * Unified Logger for Crudify Projects
 *
 * Environment-based logging:
 * - dev/stg: All logs (error, warn, info, debug)
 * - prod: Only errors (default)
 *
 * IMPORTANT: This logger does NOT read environment variables.
 * The parent application must explicitly set the environment via setEnvironment().
 *
 * Usage:
 *   import { logger } from './logger';
 *
 *   // Set environment from parent app
 *   logger.setEnvironment('dev'); // or 'stg', 'prod'
 *
 *   logger.error('Something failed', { userId: '123' });
 *   logger.warn('Deprecated feature used');
 *   logger.info('User logged in', { email: 'user@example.com' });
 *   logger.debug('Processing request', { payload: data });
 */

export type LogLevel = "error" | "warn" | "info" | "debug";
export type CrudifyLogLevel = "none" | "debug" | "info" | "warn" | "error";

export interface LogContext {
  [key: string]: any;
}

// ============================================
// Sensitive Data Patterns (for sanitization)
// ============================================
const SENSITIVE_PATTERNS = [
  /password[^:]*[:=]\s*[^\s,}]+/gi,
  /token[^:]*[:=]\s*[^\s,}]+/gi,
  /key[^:]*[:=]\s*["']?[^\s,}"']+/gi,
  /secret[^:]*[:=]\s*[^\s,}]+/gi,
  /authorization[^:]*[:=]\s*[^\s,}]+/gi,
  /mongodb(\+srv)?:\/\/[^\s]+/gi,
  /postgres:\/\/[^\s]+/gi,
  /mysql:\/\/[^\s]+/gi,
];

// ============================================
// Logger Class
// ============================================
// Default to "prod" - parent app must call setEnvironment() to enable verbose logging
let ENVIRONMENT = "prod";
const PREFIX = "CrudifyCore";

// Log level hierarchy (none = disabled)
const LOG_LEVEL_PRIORITY: Record<CrudifyLogLevel, number> = {
  none: 0,
  error: 1,
  warn: 2,
  info: 3,
  debug: 4,
};

class Logger {
  private env: string;
  private prefix: string;
  private logLevel: CrudifyLogLevel = "none";

  constructor() {
    this.env = ENVIRONMENT;
    this.prefix = PREFIX;
  }

  /**
   * Set config (environment and log level) - called by crudify.config()
   */
  setConfig(env: string, logLevel?: CrudifyLogLevel): void {
    this.env = env;
    ENVIRONMENT = env;
    if (logLevel) {
      this.logLevel = logLevel;
    }
  }

  /**
   * Set log level - called by crudify.init()
   */
  setLogLevel(logLevel: CrudifyLogLevel): void {
    this.logLevel = logLevel;
  }

  /**
   * Check if a specific log level should be logged based on configured level
   */
  private isLevelEnabled(level: LogLevel): boolean {
    if (this.logLevel === "none") return false;
    const levelPriority = LOG_LEVEL_PRIORITY[level];
    const configuredPriority = LOG_LEVEL_PRIORITY[this.logLevel];
    return levelPriority <= configuredPriority;
  }

  /**
   * Sanitize sensitive data from strings
   */
  private sanitize(str: string): string {
    let sanitized = str;
    for (const pattern of SENSITIVE_PATTERNS) {
      sanitized = sanitized.replace(pattern, "[REDACTED]");
    }
    return sanitized;
  }

  /**
   * Sanitize context object
   */
  private sanitizeContext(context: LogContext): LogContext {
    const sanitized: LogContext = {};

    for (const [key, value] of Object.entries(context)) {
      if (value === undefined || value === null) continue;

      // Partial sanitization for user identifiers
      if (key === "userId" && typeof value === "string") {
        sanitized[key] = value.length > 8 ? `${value.substring(0, 8)}***` : value;
      } else if (key === "email" && typeof value === "string") {
        const [local, domain] = value.split("@");
        sanitized[key] = local && domain ? `${local.substring(0, 3)}***@${domain}` : "[REDACTED]";
      } else if (typeof value === "string") {
        sanitized[key] = this.sanitize(value);
      } else if (typeof value === "object" && value !== null) {
        sanitized[key] = this.sanitizeContext(value);
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  /**
   * Check if a log level should be displayed based on logLevel setting
   * When logLevel is set (via setLogLevel/setConfig), it takes precedence
   * Otherwise falls back to environment-based logging
   */
  private shouldLog(level: LogLevel): boolean {
    // If logLevel is set, use it
    if (this.logLevel !== "none") {
      return this.isLevelEnabled(level);
    }

    // Fallback to environment-based logging
    const isProduction = this.env === "prod" || this.env === "production" || this.env === "api";
    if (isProduction && level !== "error") {
      return false;
    }

    return true;
  }

  /**
   * Format and output log entry
   */
  private log(level: LogLevel, message: string, context?: LogContext): void {
    if (!this.shouldLog(level)) return;

    const sanitizedMessage = this.sanitize(message);
    const sanitizedContext = context ? this.sanitizeContext(context) : undefined;

    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      environment: this.env,
      service: this.prefix,
      message: sanitizedMessage,
      ...(sanitizedContext && Object.keys(sanitizedContext).length > 0 && { context: sanitizedContext }),
    };

    const output = JSON.stringify(logEntry);

    switch (level) {
      case "error":
        console.error(output);
        break;
      case "warn":
        console.warn(output);
        break;
      case "info":
        console.info(output);
        break;
      case "debug":
        console.log(output);
        break;
    }
  }

  /**
   * Convert any value to LogContext for logging
   */
  private toLogContext(...args: unknown[]): LogContext | undefined {
    if (args.length === 0) return undefined;

    // Single Error argument
    if (args.length === 1 && args[0] instanceof Error) {
      const error = args[0];
      return {
        errorName: error.name,
        errorMessage: error.message,
        stack: error.stack,
      };
    }

    // Single LogContext object
    if (args.length === 1 && typeof args[0] === "object" && args[0] !== null && !(args[0] instanceof Error)) {
      return args[0] as LogContext;
    }

    // Single primitive value
    if (args.length === 1) {
      return { value: args[0] };
    }

    // Multiple arguments - convert to array context
    return { args: args.map((arg, i) => (arg instanceof Error ? { error: arg.message, stack: arg.stack } : arg)) };
  }

  /**
   * Log an error - Always logged in all environments
   */
  error(message: string, ...args: unknown[]): void {
    this.log("error", message, this.toLogContext(...args));
  }

  /**
   * Log a warning - Only in dev/stg
   */
  warn(message: string, ...args: unknown[]): void {
    this.log("warn", message, this.toLogContext(...args));
  }

  /**
   * Log info - Only in dev/stg
   */
  info(message: string, ...args: unknown[]): void {
    this.log("info", message, this.toLogContext(...args));
  }

  /**
   * Log debug information - Only in dev/stg
   */
  debug(message: string, ...args: unknown[]): void {
    this.log("debug", message, this.toLogContext(...args));
  }

  /**
   * Get current environment
   */
  getEnvironment(): string {
    return this.env;
  }

  /**
   * Manually set environment (useful for libraries that receive env from parent app)
   */
  setEnvironment(env: string): void {
    this.env = env;
    ENVIRONMENT = env;
  }
}

export const logger = new Logger();
