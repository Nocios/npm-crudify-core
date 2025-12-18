/**
 * Unified Logger for Crudify Projects
 *
 * Environment-based logging:
 * - dev/stg: All logs (error, warn, info, debug)
 * - prod: Only errors
 *
 * Usage:
 *   import { logger } from './logger';
 *
 *   logger.error('Something failed', { userId: '123' });
 *   logger.warn('Deprecated feature used');
 *   logger.info('User logged in', { email: 'user@example.com' });
 *   logger.debug('Processing request', { payload: data });
 */

export type LogLevel = "error" | "warn" | "info" | "debug";

export interface LogContext {
  [key: string]: any;
}

// ============================================
// Environment Detection
// ============================================
const getEnvironment = (): string => {
  // Node.js environment
  if (typeof process !== "undefined" && process.env) {
    return process.env.ENVIRONMENT || process.env.NODE_ENV || "prod";
  }
  // Browser environment (Vite)
  if (typeof window !== "undefined") {
    const w = window as any;
    if (w.__VITE_ENV__) return w.__VITE_ENV__;
    if (w.__CRUDIFY_ENV__) return w.__CRUDIFY_ENV__;
  }
  return "prod";
};

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
let ENVIRONMENT = getEnvironment();
const PREFIX = "CrudifyCore";

class Logger {
  private env: string;
  private prefix: string;

  constructor() {
    this.env = ENVIRONMENT;
    this.prefix = PREFIX;
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
   * Check if a log level should be displayed based on environment
   * - dev/stg: show all logs
   * - prod: show only errors
   */
  private shouldLog(level: LogLevel): boolean {
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
   * Log an error - Always logged in all environments
   */
  error(message: string, context?: LogContext | Error): void {
    let logContext: LogContext | undefined;

    if (context instanceof Error) {
      logContext = {
        errorName: context.name,
        errorMessage: context.message,
        stack: context.stack,
      };
    } else {
      logContext = context;
    }

    this.log("error", message, logContext);
  }

  /**
   * Log a warning - Only in dev/stg
   */
  warn(message: string, context?: LogContext): void {
    this.log("warn", message, context);
  }

  /**
   * Log info - Only in dev/stg
   */
  info(message: string, context?: LogContext): void {
    this.log("info", message, context);
  }

  /**
   * Log debug information - Only in dev/stg
   */
  debug(message: string, context?: LogContext): void {
    this.log("debug", message, context);
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
