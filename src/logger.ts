import type { CrudifyEnvType, CrudifyLogLevel } from "./types";

export type LogLevel = "error" | "warn" | "info" | "debug";

class CrudifyLogger {
  private env: CrudifyEnvType = "prod";
  private logLevel: CrudifyLogLevel = "none";
  private prefix = "Crudify";

  setConfig(env: CrudifyEnvType, logLevel: CrudifyLogLevel = "none"): void {
    this.env = env;
    this.logLevel = logLevel;
  }

  setLogLevel(logLevel: CrudifyLogLevel): void {
    this.logLevel = logLevel;
  }

  getEnv(): CrudifyEnvType {
    return this.env;
  }

  private shouldLog(level: LogLevel): boolean {
    const isProduction = this.env === "prod" || this.env === "api";

    // In production: only errors
    if (isProduction && level !== "error") {
      return false;
    }

    // If logLevel is "none", only show errors (regardless of env)
    if (this.logLevel === "none" && level !== "error") {
      return false;
    }

    return true;
  }

  private formatMessage(message: string): string {
    return `${this.prefix}: ${message}`;
  }

  error(message: string, ...args: any[]): void {
    if (this.shouldLog("error")) {
      console.error(this.formatMessage(message), ...args);
    }
  }

  warn(message: string, ...args: any[]): void {
    if (this.shouldLog("warn")) {
      console.warn(this.formatMessage(message), ...args);
    }
  }

  info(message: string, ...args: any[]): void {
    if (this.shouldLog("info")) {
      console.info(this.formatMessage(message), ...args);
    }
  }

  debug(message: string, ...args: any[]): void {
    if (this.shouldLog("debug")) {
      console.log(this.formatMessage(message), ...args);
    }
  }

  log(message: string, ...args: any[]): void {
    this.debug(message, ...args);
  }
}

export const logger = new CrudifyLogger();
