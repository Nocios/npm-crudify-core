import { _fetch, shutdownNodeSpecifics } from "./fetch-impl";
import pako from "pako";
import {
  CrudifyEnvType,
  CrudifyIssue,
  CrudifyLogLevel,
  CrudifyPublicAPI,
  CrudifyResponse,
  InternalCrudifyResponseType,
  CrudifyRequestOptions,
  CrudifyResponseInterceptor,
  RawGraphQLResponse,
  NociosError,
  CrudifyTokenConfig,
  CrudifyTokenData,
} from "./types";

const queryInit = `
query Init($apiKey: String!) {
  response:init(apiKey: $apiKey) {
    apiEndpoint
    apiKeyEndpoint
    apiEndpointAdmin
    apiKeyEndpointAdmin
  }
}`;

const mutationLogin = `
mutation MyMutation($username: String, $email: String, $password: String!) {
  response:login(username: $username, email: $email, password: $password) {
    data
    status
    fieldsWarning
  }
}
`;

const mutationRefreshToken = `
mutation MyMutation($refreshToken: String!) {
  response:refreshToken(refreshToken: $refreshToken) {
    data
    status
    fieldsWarning
  }
}
`;

const queryGetPermissions = `
query MyQuery {
  response:getPermissions {
    data
    status
    fieldsWarning
  }
}
`;

const queryGetStructure = `
query MyQuery {
  response:getStructure {
    data
    status
    fieldsWarning
  }
}
`;

const mutationCreateItem = `
mutation MyMutation($moduleKey: String!, $data: AWSJSON) {
  response:createItem(moduleKey: $moduleKey, data: $data) {
    data
    status
    fieldsWarning
  }
}
`;

const queryReadItem = `
query MyQuery($moduleKey: String!, $data: AWSJSON) {
  response:readItem(moduleKey: $moduleKey, data: $data) {
    data
    status
    fieldsWarning
  }
}
`;

const queryReadItems = `
query MyQuery($moduleKey: String!, $data: AWSJSON) {
  response:readItems(moduleKey: $moduleKey, data: $data) {
    data
    status
    fieldsWarning
  }
}
`;

const mutationUpdateItem = `
mutation MyMutation($moduleKey: String!, $data: AWSJSON) {
  response:updateItem(moduleKey: $moduleKey, data: $data) {
    data
    status
    fieldsWarning
  }
}
`;

const mutationDeleteItem = `
mutation MyMutation($moduleKey: String!, $data: AWSJSON) {
  response:deleteItem(moduleKey: $moduleKey, data: $data) {
    data
    status
    fieldsWarning
  }
}
`;

const mutationTransaction = `
mutation MyMutation($data: AWSJSON) {
  response:transaction(data: $data) {
    data
    status
    fieldsWarning
  }
}
`;

const mutationGenerateSignedUrl = `
mutation MyMutation($data: AWSJSON) {
  response:generateSignedUrl(data: $data) {
    data
    status
    fieldsWarning
  }
}
`;

const queryGetTranslation = `
query MyQuery($data: AWSJSON) {
  response:getTranslation(data: $data) {
    data
    status
    fieldsWarning
  }
}
`;

const queryGetNextSequence = `
query MyQuery($data: AWSJSON) {
  response:getNextSequence(data: $data) {
    data
    status
    fieldsWarning
  }
}
`;

const mutationDisableFile = `
mutation MyMutation($data: AWSJSON) {
  response:disableFile(data: $data) {
    data
    status
    fieldsWarning
  }
}
`;

const queryGetFileUrl = `
query MyQuery($data: AWSJSON) {
  response:getFileUrl(data: $data) {
    data
    status
    fieldsWarning
  }
}
`;

const dataMasters = {
  dev: { ApiMetadata: "https://auth.dev.crudify.io", ApiKeyMetadata: "da2-pl3xidupjnfwjiykpbp75gx344" },
  stg: { ApiMetadata: "https://auth.stg.crudify.io", ApiKeyMetadata: "da2-hooybwpxirfozegx3v4f3kaelq" },
  api: { ApiMetadata: "https://auth.api.crudify.io", ApiKeyMetadata: "da2-5hhytgms6nfxnlvcowd6crsvea" },
  prod: { ApiMetadata: "https://auth.api.crudify.io", ApiKeyMetadata: "da2-5hhytgms6nfxnlvcowd6crsvea" },
};

class Crudify implements CrudifyPublicAPI {
  private static instance: Crudify;
  private static ApiMetadata = dataMasters.api.ApiMetadata;
  private static ApiKeyMetadata = dataMasters.api.ApiKeyMetadata;

  private publicApiKey: string = "";
  private token: string = "";
  private refreshToken: string = "";
  private tokenExpiresAt: number = 0;
  private refreshExpiresAt: number = 0;

  private logLevel: CrudifyLogLevel = "none";
  private apiKey: string = "";
  private endpoint: string = "";
  private apiEndpointAdmin: string = "";
  private apiKeyEndpointAdmin: string = "";
  private responseInterceptor: CrudifyResponseInterceptor | null = null;

  // Race condition prevention
  private refreshPromise: Promise<CrudifyResponse> | null = null;
  private isRefreshing: boolean = false;

  // Initialization guard to prevent multiple init() calls
  private isInitialized: boolean = false;
  private initPromise: Promise<{ apiEndpointAdmin?: string; apiKeyEndpointAdmin?: string }> | null = null;

  // Callback to notify when tokens are invalidated
  private onTokensInvalidated: (() => void) | null = null;

  private constructor() {}

  public getLogLevel = (): CrudifyLogLevel => {
    return this.logLevel;
  };

  public config = (env: CrudifyEnvType): void => {
    const selectedEnv = env || "api";
    Crudify.ApiMetadata = dataMasters[selectedEnv]?.ApiMetadata || dataMasters.api.ApiMetadata;
    Crudify.ApiKeyMetadata = dataMasters[selectedEnv]?.ApiKeyMetadata || dataMasters.api.ApiKeyMetadata;
  };

  public init = async (
    publicApiKey: string,
    logLevel?: CrudifyLogLevel
  ): Promise<{ apiEndpointAdmin?: string; apiKeyEndpointAdmin?: string }> => {
    // Guard: Already initialized
    if (this.isInitialized) {
      if ((logLevel || this.logLevel) === "debug") {
        console.log("Crudify: Already initialized, skipping duplicate init() call");
      }
      return { apiEndpointAdmin: this.apiEndpointAdmin, apiKeyEndpointAdmin: this.apiKeyEndpointAdmin };
    }

    // Guard: Initialization in progress
    if (this.initPromise) {
      if ((logLevel || this.logLevel) === "debug") console.log("Crudify: Initialization in progress, waiting for existing promise...");
      return this.initPromise;
    }

    // Create initialization promise
    this.initPromise = this.performInit(publicApiKey, logLevel);

    try {
      const result = await this.initPromise;
      this.isInitialized = true;
      if (this.logLevel === "debug") console.log("Crudify: Initialization completed successfully");
      return result;
    } catch (error) {
      // Reset state on error so init can be retried
      this.isInitialized = false;
      throw error;
    } finally {
      this.initPromise = null;
    }
  };

  // Extracted actual initialization logic
  private performInit = async (
    publicApiKey: string,
    logLevel?: CrudifyLogLevel
  ): Promise<{ apiEndpointAdmin?: string; apiKeyEndpointAdmin?: string }> => {
    this.logLevel = logLevel || "none";
    this.publicApiKey = publicApiKey;
    this.token = "";
    this.refreshToken = "";
    this.tokenExpiresAt = 0;
    this.refreshExpiresAt = 0;

    const response = await _fetch(Crudify.ApiMetadata, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": Crudify.ApiKeyMetadata },
      body: JSON.stringify({ query: queryInit, variables: { apiKey: publicApiKey } }),
    });

    const data: any = await response.json();

    if (this.logLevel === "debug") {
      console.log("Crudify Init Response:", this.sanitizeForLogging(data));
      console.log("Crudify Metadata URL:", Crudify.ApiMetadata);
    }

    if (data?.data?.response) {
      const { response: initResponse } = data.data;
      this.endpoint = initResponse.apiEndpoint;
      this.apiKey = initResponse.apiKeyEndpoint;
      this.apiEndpointAdmin = initResponse.apiEndpointAdmin || "";
      this.apiKeyEndpointAdmin = initResponse.apiKeyEndpointAdmin || "";

      return {
        apiEndpointAdmin: this.apiEndpointAdmin,
        apiKeyEndpointAdmin: this.apiKeyEndpointAdmin,
      };
    } else {
      console.error("Crudify Init Error:", this.sanitizeForLogging(data.errors || data));
      throw new Error("Failed to initialize Crudify. Check API key or network.");
    }
  };

  private formatErrorsInternal = (issues: CrudifyIssue[]): Record<string, string[]> => {
    if (this.logLevel === "debug") console.log("Crudify FormatErrors Issues:", this.sanitizeForLogging(issues));
    return issues.reduce((acc, issue) => {
      const key = String(issue.path[0] ?? "_error");
      if (!acc[key]) acc[key] = [];
      acc[key].push(issue.message);
      return acc;
    }, {} as Record<string, string[]>);
  };

  private containsDangerousProperties = (obj: any, depth = 0): boolean => {
    if (depth > 10) return false;

    if (!obj || typeof obj !== "object") return false;

    const dangerousKeys = [
      "__proto__",
      "constructor",
      "prototype",
      "eval",
      "function",
      "setTimeout",
      "setInterval",
      "require",
      "module",
      "exports",
      "global",
      "process",
    ];

    for (const key in obj) {
      if (dangerousKeys.includes(key.toLowerCase())) {
        return true;
      }

      // Recursively check nested objects
      if (obj[key] && typeof obj[key] === "object") if (this.containsDangerousProperties(obj[key], depth + 1)) return true;
    }

    return false;
  };

  private sanitizeForLogging = (data: any): any => {
    if (!data || typeof data !== "object") {
      // Mask strings that look like tokens or API keys
      if (typeof data === "string") {
        if (data.length > 20 && (data.includes("da2-") || data.includes("ey") || data.match(/^[a-zA-Z0-9_-]{20,}$/))) {
          return data.substring(0, 6) + "******";
        }
      }
      return data;
    }

    if (Array.isArray(data)) return data.map((item) => this.sanitizeForLogging(item));

    const sanitized: any = {};
    const sensitiveKeys = [
      "apikey",
      "apiKey",
      "api_key",
      "token",
      "accessToken",
      "access_token",
      "refreshToken",
      "refresh_token",
      "authorization",
      "auth",
      "password",
      "secret",
      "key",
      "credential",
      "jwt",
      "bearer",
    ];

    for (const [key, value] of Object.entries(data)) {
      const keyLower = key.toLowerCase();
      const isSensitive = sensitiveKeys.some((sensitiveKey) => keyLower.includes(sensitiveKey));

      if (isSensitive && typeof value === "string" && value.length > 6) sanitized[key] = value.substring(0, 6) + "******";
      else if (value && typeof value === "object") sanitized[key] = this.sanitizeForLogging(value);
      else sanitized[key] = value;
    }

    return sanitized;
  };

  private formatResponseInternal = (response: any): InternalCrudifyResponseType => {
    if (response.errors) {
      const errorMessages = response.errors.map((err: any) => String(err.message || "UNKNOWN_GRAPHQL_ERROR"));
      return {
        success: false,
        errors: { _graphql: errorMessages.map((x: string) => x.toUpperCase().replace(/ /g, "_").replace(/\./g, "")) },
      };
    }

    if (!response.data || !response.data.response) {
      if (this.logLevel === "debug") console.error("Crudify FormatResponse: Invalid response structure", this.sanitizeForLogging(response));
      return { success: false, errors: { _error: ["INVALID_RESPONSE_STRUCTURE"] } };
    }

    const apiResponse = response.data.response;
    const status = apiResponse.status ?? "Unknown";
    const errorCode = apiResponse.errorCode as NociosError | undefined;
    let dataResponse;

    try {
      if (!apiResponse.data) {
        dataResponse = null;
      } else {
        // Handle GZIP compressed responses (object wrapper format: { _gzip: "base64..." })
        const COMPRESSION_KEY = "_gzip";
        let rawData: string;

        // AWSJSON always returns a string - parse it first to check for compression
        let parsedData: any = apiResponse.data;
        if (typeof apiResponse.data === "string") {
          try {
            parsedData = JSON.parse(apiResponse.data);
          } catch {
            // Not valid JSON, use as-is
            parsedData = null;
          }
        }

        // Check if data is a compressed object wrapper
        if (parsedData && typeof parsedData === "object" && COMPRESSION_KEY in parsedData) {
          try {
            const base64Data = parsedData[COMPRESSION_KEY];
            const binaryString = atob(base64Data);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
              bytes[i] = binaryString.charCodeAt(i);
            }
            const decompressed = pako.inflate(bytes, { to: "string" });
            rawData = decompressed;
            if (this.logLevel === "debug") {
              console.log("Crudify: Decompressed GZIP response", {
                compressedSize: base64Data.length,
                decompressedSize: rawData.length,
              });
            }
          } catch (decompressionError) {
            if (this.logLevel === "debug") {
              console.error("Crudify: Failed to decompress GZIP response", decompressionError);
            }
            // On decompression failure, use original string
            rawData = String(apiResponse.data);
          }
        } else {
          // Normal uncompressed data - use original string
          rawData = String(apiResponse.data);
        }

        // Verificar que no sea excesivamente largo (DoS protection)
        if (rawData.length > 10 * 1024 * 1024) {
          // 10MB limit
          throw new Error("Response data too large");
        }

        // Verificar que comience con caracteres válidos de JSON
        const trimmed = rawData.trim();
        if (
          !trimmed.startsWith("{") &&
          !trimmed.startsWith("[") &&
          !trimmed.startsWith('"') &&
          trimmed !== "null" &&
          trimmed !== "true" &&
          trimmed !== "false" &&
          !/^\d+(\.\d+)?$/.test(trimmed)
        ) {
          throw new Error("Invalid JSON format");
        }

        dataResponse = JSON.parse(rawData);

        // Validación post-parsing para objetos
        if (dataResponse && typeof dataResponse === "object") {
          // Verificar que no tenga propiedades peligrosas
          if (this.containsDangerousProperties(dataResponse)) {
            if (this.logLevel === "debug") console.warn("Crudify FormatResponse: Potentially dangerous properties detected");
          }
        }
      }
    } catch (e) {
      if (this.logLevel === "debug")
        console.error(
          "Crudify FormatResponse: Failed to parse data",
          this.sanitizeForLogging(apiResponse.data),
          this.sanitizeForLogging(e)
        );
      if (status === "OK" || status === "WARNING") {
        return { success: false, errors: { _error: ["INVALID_DATA_FORMAT_IN_SUCCESSFUL_RESPONSE"] } };
      }
      dataResponse = { _raw: apiResponse.data, _parsingError: (e as Error).message };
    }

    if (this.logLevel === "debug") {
      console.log("Crudify FormatResponse Status:", status);
      console.log("Crudify FormatResponse Parsed Data (dataResponse):", this.sanitizeForLogging(dataResponse));
      console.log("Crudify FormatResponse ErrorCode:", errorCode);
    }

    switch (status) {
      case "OK":
      case "WARNING":
        return { success: true, data: dataResponse, fieldsWarning: apiResponse.fieldsWarning, errorCode };
      case "FIELD_ERROR":
        return { success: false, errors: this.formatErrorsInternal(dataResponse as CrudifyIssue[]), errorCode };
      case "ITEM_NOT_FOUND":
        return { success: false, errors: { _id: ["ITEM_NOT_FOUND"] }, errorCode: errorCode || NociosError.ItemNotFound };
      case "ERROR":
        if (Array.isArray(dataResponse))
          return { success: false, data: dataResponse, errors: { _transaction: ["ONE_OR_MORE_OPERATIONS_FAILED"] }, errorCode };
        // if (Array.isArray(dataResponse)) {
        //   const formattedTransaction = dataResponse.map(({ action, response: opRes }) => {
        //     let opData = null;
        //     let opErrors: any = opRes.errors;
        //     try {
        //       opData = opRes.data ? JSON.parse(opRes.data) : null;
        //     } catch (e) {
        //       opData = { _raw: opRes.data, _parsingError: (e as Error).message };
        //     }
        //     if (opRes.status === "FIELD_ERROR" && opRes.errors) {
        //       opErrors = this.formatErrorsInternal(opRes.errors as CrudifyIssue[]);
        //     }
        //     return { action, status: opRes.status, data: opData, errors: opErrors, fieldsWarning: opRes.fieldsWarning };
        //   });
        //   return { success: false, data: formattedTransaction, errors: { _transaction: ["ONE_OR_MORE_OPERATIONS_FAILED"] } };
        // }

        const finalErrors =
          typeof dataResponse === "object" && dataResponse !== null && !Array.isArray(dataResponse)
            ? dataResponse
            : { _error: [String(dataResponse || "UNKNOWN_ERROR")] };
        return { success: false, errors: finalErrors, errorCode: errorCode || NociosError.InternalServerError };
      default:
        return {
          success: false,
          errors: { _error: [status || "UNKNOWN_ERROR_STATUS"] },
          errorCode: errorCode || NociosError.InternalServerError,
        };
    }
  };

  private adaptToPublicResponse = (internalResp: InternalCrudifyResponseType): CrudifyResponse => {
    if (internalResp.errors && typeof internalResp.errors === "object" && !Array.isArray(internalResp.errors)) {
      return {
        success: internalResp.success,
        data: internalResp.data,
        errors: internalResp.errors,
        fieldsWarning: internalResp.fieldsWarning,
        errorCode: internalResp.errorCode,
      };
    }

    return {
      success: internalResp.success,
      data: internalResp.data,
      fieldsWarning: internalResp.fieldsWarning,
      errorCode: internalResp.errorCode,
    };
  };

  private async performCrudOperation(query: string, variables: object, options?: CrudifyRequestOptions): Promise<CrudifyResponse> {
    if (!this.endpoint || !this.apiKey) throw new Error("Crudify: Not initialized. Call init() first.");

    // Auto-refresh tokens with critical buffer before important operation
    if (this.token && this.isTokenExpired("critical") && this.refreshToken && !this.isRefreshTokenExpired()) {
      if (this.logLevel === "debug") {
        console.info("Crudify: Access token expiring critically, refreshing before operation...");
      }

      const refreshResult = await this.refreshAccessToken();
      if (!refreshResult.success) {
        if (this.logLevel === "debug") console.warn("Crudify: Token refresh failed, clearing tokens");

        // If refresh failed, clear tokens to force re-login
        this.clearTokensAndRefreshState();

        const refreshFailedResponse = {
          success: false,
          errors: { _auth: ["TOKEN_REFRESH_FAILED_PLEASE_LOGIN"] },
          errorCode: NociosError.Unauthorized,
        };

        // Log para debug - este error viene directamente de performCrudOperation, no de GraphQL
        if (this.logLevel === "debug") {
          console.log(
            "🔴 Crudify performCrudOperation - TOKEN_REFRESH_FAILED detected, returning directly:",
            this.sanitizeForLogging(refreshFailedResponse)
          );
        }

        // IMPORTANT: Don't show alert() here, let SessionManager handle the expired session
        console.warn("Crudify: Token refresh failed - session should be handled by SessionManager");

        return refreshFailedResponse;
      }
    }

    let rawResponse: RawGraphQLResponse = await this.executeQuery(
      query,
      variables,
      {
        ...(!this.token ? { "x-api-key": this.apiKey } : { Authorization: `Bearer ${this.token}` }),
      },
      options?.signal
    );

    // Handle authentication errors
    if (rawResponse.errors) {
      const hasAuthError = rawResponse.errors.some(
        (error: any) =>
          error.message?.includes("Unauthorized") ||
          error.message?.includes("Invalid token") ||
          error.message?.includes("NOT_AUTHORIZED_TO_ACCESS") ||
          error.extensions?.code === "UNAUTHENTICATED"
      );

      if (hasAuthError) {
        console.warn(
          "Crudify: Authorization error detected",
          this.sanitizeForLogging({
            errors: rawResponse.errors,
            hasRefreshToken: !!this.refreshToken,
            isRefreshExpired: this.isRefreshTokenExpired(),
          })
        );
      }

      if (hasAuthError && this.refreshToken && !this.isRefreshTokenExpired()) {
        if (this.logLevel === "debug") {
          console.info("Crudify: Received auth error, attempting token refresh...");
        }

        const refreshResult = await this.refreshAccessToken();
        if (refreshResult.success) {
          // Retry the operation with the new token
          rawResponse = await this.executeQuery(query, variables, { Authorization: `Bearer ${this.token}` }, options?.signal);
        } else {
          // If refresh failed, clear tokens
          this.clearTokensAndRefreshState();
        }
      }
    }

    if (this.logLevel === "debug") console.log("Crudify Raw Response:", this.sanitizeForLogging(rawResponse));

    if (this.responseInterceptor) rawResponse = await Promise.resolve(this.responseInterceptor(rawResponse));

    return this.adaptToPublicResponse(this.formatResponseInternal(rawResponse));
  }

  private async performCrudOperationPublic(query: string, variables: object, options?: CrudifyRequestOptions): Promise<CrudifyResponse> {
    if (!this.endpoint || !this.apiKey) throw new Error("Crudify: Not initialized. Call init() first.");

    let rawResponse: RawGraphQLResponse = await this.executeQuery(query, variables, { "x-api-key": this.apiKey }, options?.signal);

    if (this.logLevel === "debug") console.log("Crudify Raw Response:", this.sanitizeForLogging(rawResponse));

    if (this.responseInterceptor) rawResponse = await Promise.resolve(this.responseInterceptor(rawResponse));

    return this.adaptToPublicResponse(this.formatResponseInternal(rawResponse));
  }

  private executeQuery = async (
    query: string,
    variables: object = {},
    extraHeaders: { [key: string]: string } = {},
    signal?: AbortSignal
  ) => {
    if (!this.endpoint) {
      throw new Error("Crudify: Not properly initialized or endpoint missing. Call init() method first.");
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "x-subscriber-key": this.publicApiKey,
      ...extraHeaders,
    };

    if (this.logLevel === "debug") {
      console.log("Crudify Request URL:", this.sanitizeForLogging(this.endpoint));
      console.log("Crudify Request Headers:", this.sanitizeForLogging(headers));
      console.log("Crudify Request Query:", this.sanitizeForLogging(query));
      console.log("Crudify Request Variables:", this.sanitizeForLogging(variables));
    }

    const response = await _fetch(this.endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({ query, variables }),
      signal,
    });

    const responseBody = await response.json();

    if (this.logLevel === "debug") {
      console.log("Crudify Response Status:", response.status);
      console.log("Crudify Response Body:", this.sanitizeForLogging(responseBody));
    }

    return responseBody;
  };

  public login = async (identifier: string, password: string): Promise<CrudifyResponse> => {
    if (!this.endpoint || !this.apiKey) throw new Error("Crudify: Not initialized. Call init() first.");

    const email: string | undefined = identifier.includes("@") ? identifier : undefined;
    const username: string | undefined = identifier.includes("@") ? undefined : identifier;

    const rawResponse = await this.executeQuery(mutationLogin, { username, email, password }, { "x-api-key": this.apiKey });
    const internalResponse = this.formatResponseInternal(rawResponse);

    if (internalResponse.success && internalResponse.data?.token) {
      // Support for refresh tokens
      this.token = internalResponse.data.token;

      if (internalResponse.data.refreshToken) {
        this.refreshToken = internalResponse.data.refreshToken;

        // Calculate expiration time
        const now = Date.now();
        this.tokenExpiresAt = now + (internalResponse.data.expiresIn || 900) * 1000; // Default 15 min
        this.refreshExpiresAt = now + (internalResponse.data.refreshExpiresIn || 604800) * 1000; // Default 7 days

        if (this.logLevel === "debug") {
          console.info("Crudify Login - Refresh token enabled", {
            accessExpires: new Date(this.tokenExpiresAt),
            refreshExpires: new Date(this.refreshExpiresAt),
          });
        }
      }

      if (this.logLevel === "debug" && internalResponse.data?.version) {
        console.info("Crudify Login Version:", internalResponse.data.version);
      }
    }
    const publicResponse = this.adaptToPublicResponse(internalResponse);
    if (publicResponse.success) {
      publicResponse.data = {
        loginStatus: "successful",
        token: this.token,
        refreshToken: this.refreshToken,
        expiresAt: this.tokenExpiresAt,
        refreshExpiresAt: this.refreshExpiresAt,
      };
    }
    return publicResponse;
  };

  /**
   * Refresh access token using refresh token
   */
  public refreshAccessToken = async (): Promise<CrudifyResponse> => {
    // If a refresh is already in progress, return the same promise
    if (this.refreshPromise) {
      if (this.logLevel === "debug") {
        console.log("Crudify: Token refresh already in progress, waiting for existing request");
      }
      return this.refreshPromise;
    }

    // Initial validations
    if (!this.refreshToken) return { success: false, errors: { _refresh: ["NO_REFRESH_TOKEN_AVAILABLE"] } };

    if (!this.endpoint || !this.apiKey) throw new Error("Crudify: Not initialized. Call init() first.");

    // If token is not actually expired, do nothing
    if (!this.isTokenExpired()) {
      if (this.logLevel === "debug") console.log("Crudify: Token is not expired, skipping refresh");

      return {
        success: true,
        data: {
          token: this.token,
          refreshToken: this.refreshToken,
          expiresAt: this.tokenExpiresAt,
          refreshExpiresAt: this.refreshExpiresAt,
        },
      };
    }

    // Create refresh promise and mark as in progress
    this.isRefreshing = true;

    this.refreshPromise = this.performTokenRefresh().finally(() => {
      // Clean up state regardless of result
      this.isRefreshing = false;
      this.refreshPromise = null;
    });

    return this.refreshPromise;
  };

  private async performTokenRefresh(): Promise<CrudifyResponse> {
    try {
      if (this.logLevel === "debug") console.log("Crudify: Starting token refresh process");

      const rawResponse = await this.executeQuery(mutationRefreshToken, { refreshToken: this.refreshToken }, { "x-api-key": this.apiKey });

      const internalResponse = this.formatResponseInternal(rawResponse);

      if (internalResponse.success && internalResponse.data?.token) {
        // Update tokens atomically
        const newToken = internalResponse.data.token;
        const newRefreshToken = internalResponse.data.refreshToken || this.refreshToken;

        // Update expiration times
        const now = Date.now();
        const newTokenExpiresAt = now + (internalResponse.data.expiresIn || 900) * 1000;
        const newRefreshExpiresAt = now + (internalResponse.data.refreshExpiresIn || 604800) * 1000;

        // Update all properties at once to avoid inconsistent states
        this.token = newToken;
        this.refreshToken = newRefreshToken;
        this.tokenExpiresAt = newTokenExpiresAt;
        this.refreshExpiresAt = newRefreshExpiresAt;

        if (this.logLevel === "debug")
          console.info("Crudify Token refreshed successfully", {
            accessExpires: new Date(this.tokenExpiresAt),
            refreshExpires: new Date(this.refreshExpiresAt),
          });

        return {
          success: true,
          data: {
            token: this.token,
            refreshToken: this.refreshToken,
            expiresAt: this.tokenExpiresAt,
            refreshExpiresAt: this.refreshExpiresAt,
          },
        };
      }

      // If not successful, clear tokens to force re-login
      this.clearTokensAndRefreshState();

      return this.adaptToPublicResponse(internalResponse);
    } catch (error) {
      if (this.logLevel === "debug") console.error("Crudify Token refresh failed:", this.sanitizeForLogging(error));

      // On error, clear tokens
      this.clearTokensAndRefreshState();

      return { success: false, errors: { _refresh: ["TOKEN_REFRESH_FAILED"] } };
    }
  }

  /**
   * Check if access token needs renewal with dynamic buffer
   * @param urgencyLevel - 'critical' (30s), 'high' (2min), 'normal' (5min)
   */
  private isTokenExpired = (urgencyLevel: "critical" | "high" | "normal" = "high"): boolean => {
    if (!this.tokenExpiresAt) return false;

    const bufferTimes = {
      critical: 30 * 1000, // 30 seconds - for critical operations
      high: 2 * 60 * 1000, // 2 minutes - default check
      normal: 5 * 60 * 1000, // 5 minutes - preventive renewal
    };

    const bufferTime = bufferTimes[urgencyLevel];
    return Date.now() >= this.tokenExpiresAt - bufferTime;
  };

  /**
   * Check if the refresh token is expired
   */
  private isRefreshTokenExpired = (): boolean => {
    if (!this.refreshExpiresAt) return false;
    return Date.now() >= this.refreshExpiresAt;
  };

  public setToken = (token: string): void => {
    if (typeof token === "string" && token) this.token = token;
  };

  /**
   * Configure tokens manually (to restore session)
   * Validates the access token before setting it
   */
  public setTokens = (tokens: CrudifyTokenConfig): void => {
    // First, set all fields temporarily
    if (tokens.accessToken) this.token = tokens.accessToken;
    if (tokens.refreshToken) this.refreshToken = tokens.refreshToken;
    if (tokens.expiresAt) this.tokenExpiresAt = tokens.expiresAt;
    if (tokens.refreshExpiresAt) this.refreshExpiresAt = tokens.refreshExpiresAt;

    // Validate the access token after setting it
    if (this.token && !this.isAccessTokenValid()) {
      if (this.logLevel === "debug") console.warn("Crudify: Attempted to set invalid access token, clearing tokens");

      // If token is invalid, clear everything
      this.clearTokensAndRefreshState();
    }
  };

  /**
   * Get current token information with validation
   */
  public getTokenData = () => {
    const isValid = this.isAccessTokenValid();
    const timeUntilExpiry = this.tokenExpiresAt ? this.tokenExpiresAt - Date.now() : 0;

    return {
      accessToken: this.token || "",
      refreshToken: this.refreshToken || "",
      expiresAt: this.tokenExpiresAt || 0,
      refreshExpiresAt: this.refreshExpiresAt || 0,
      isExpired: this.isTokenExpired("high"), // 2 min buffer
      isRefreshExpired: this.isRefreshTokenExpired(),
      isValid,
      expiresIn: timeUntilExpiry,
      willExpireSoon: this.isTokenExpired("normal"), // 5 min buffer for preventive renewal
    };
  };

  public logout = async (): Promise<CrudifyResponse> => {
    this.clearTokensAndRefreshState();

    if (this.logLevel === "debug") {
      console.log("Crudify: Logout completed");
    }

    return { success: true };
  };

  /**
   * Validate if the access token is valid (JWT structure and expiration)
   * @private
   */
  private isAccessTokenValid = (): boolean => {
    if (!this.token) return false;

    try {
      // Decode JWT without verifying signature (to avoid depending on secret in client)
      const parts = this.token.split(".");
      if (parts.length !== 3) {
        if (this.logLevel === "debug") {
          console.warn("Crudify: Invalid JWT format - token must have 3 parts");
        }
        return false;
      }

      // Decode payload (middle part of JWT)
      const payload = JSON.parse(atob(parts[1]));

      // Verify required JWT fields
      if (!payload.sub || !payload.exp) {
        if (this.logLevel === "debug") console.warn("Crudify: Invalid JWT - missing required fields (sub or exp)");

        return false;
      }

      // Verify it's an access token (not refresh token)
      if (payload.type && payload.type !== "access") {
        if (this.logLevel === "debug") console.warn("Crudify: Invalid token type - expected 'access', got:", payload.type);
        return false;
      }

      // Verify expiration (no buffer, actual expiration)
      const now = Math.floor(Date.now() / 1000);
      if (payload.exp <= now) {
        if (this.logLevel === "debug") {
          const expiredAgo = now - payload.exp;
          console.warn(`Crudify: Token expired ${expiredAgo} seconds ago`);
        }
        return false;
      }

      return true;
    } catch (error) {
      if (this.logLevel === "debug") console.warn("Crudify: Failed to validate token", this.sanitizeForLogging(error));
      return false;
    }
  };

  /**
   * Check if there is a valid session
   * Validates JWT structure and expiration, not just existence
   */
  public isLogin = (): boolean => this.isAccessTokenValid();

  /**
   * Check if a token refresh is in progress
   */
  public isTokenRefreshInProgress = (): boolean => this.isRefreshing;

  /**
   * Configure token invalidation callback
   */
  public setTokenInvalidationCallback = (callback: (() => void) | null): void => {
    this.onTokensInvalidated = callback;
  };

  /**
   * Clear tokens and refresh state safely
   */
  private clearTokensAndRefreshState = (): void => {
    this.token = "";
    this.refreshToken = "";
    this.tokenExpiresAt = 0;
    this.refreshExpiresAt = 0;

    // Also clear refresh state to avoid race conditions
    this.isRefreshing = false;
    this.refreshPromise = null;

    if (this.logLevel === "debug") console.log("Crudify: Tokens and refresh state cleared");

    // Notify that tokens were invalidated
    if (this.onTokensInvalidated) {
      this.onTokensInvalidated();
    }
  };

  public getPermissions = async (options?: CrudifyRequestOptions): Promise<CrudifyResponse> => {
    return this.performCrudOperation(queryGetPermissions, {}, options);
  };

  public getStructure = async (options?: CrudifyRequestOptions): Promise<CrudifyResponse> => {
    return this.performCrudOperation(queryGetStructure, {}, options);
  };

  public getStructurePublic = async (options?: CrudifyRequestOptions): Promise<CrudifyResponse> => {
    return this.performCrudOperationPublic(queryGetStructure, {}, options);
  };

  public getTranslation = async (featureKeys?: string[], options?: CrudifyRequestOptions): Promise<CrudifyResponse> => {
    const data = featureKeys ? { featureKeys } : {};
    return this.performCrudOperationPublic(queryGetTranslation, { data: JSON.stringify(data) }, options);
  };

  public createItem = async (moduleKey: string, data: object, options?: CrudifyRequestOptions): Promise<CrudifyResponse> => {
    return this.performCrudOperation(mutationCreateItem, { moduleKey, data: JSON.stringify(data) }, options);
  };

  public createItemPublic = async (moduleKey: string, data: object, options?: CrudifyRequestOptions): Promise<CrudifyResponse> => {
    return this.performCrudOperationPublic(mutationCreateItem, { moduleKey, data: JSON.stringify(data) }, options);
  };

  /**
   * Generate a pre-signed URL for uploading a file to S3
   * @param data.fileName - Name of the file to upload
   * @param data.contentType - MIME type of the file
   * @param data.visibility - "public" | "private" (default: "private")
   * @param options - Optional request configuration (AbortSignal)
   * @returns Promise<CrudifyResponse> with data: { uploadUrl, s3Key, visibility, publicUrl }
   */
  public generateSignedUrl = async (
    data: { fileName: string; contentType: string; visibility?: "public" | "private" },
    options?: CrudifyRequestOptions
  ): Promise<CrudifyResponse> => {
    if (!this.endpoint || !this.token) throw new Error("Crudify: Not initialized. Call init() first.");

    // Ensure visibility has a default value
    const requestData = {
      fileName: data.fileName,
      contentType: data.contentType,
      visibility: data.visibility || "private",
    };

    const rawResponse = await this.executeQuery(
      mutationGenerateSignedUrl,
      { data: JSON.stringify(requestData) },
      { Authorization: `Bearer ${this.token}` },
      options?.signal
    );
    const internalResponse = this.formatResponseInternal(rawResponse);

    // Return the full response data including uploadUrl, s3Key, visibility, publicUrl
    return this.adaptToPublicResponse(internalResponse);
  };

  /**
   * Disable (soft-delete) a file in S3
   * This allows for recovery if needed and prevents accidental data loss
   * @param data - Object containing filePath (relative path without subscriberKey)
   * @param options - Optional request configuration (AbortSignal)
   * @returns Promise<CrudifyResponse> with data: { filePath, disabled: true }
   */
  public disableFile = async (data: { filePath: string }, options?: CrudifyRequestOptions): Promise<CrudifyResponse> => {
    return this.performCrudOperation(mutationDisableFile, { data: JSON.stringify(data) }, options);
  };

  /**
   * Get URL for accessing a file
   * - Public files: Returns direct CloudFront URL (cached globally)
   * - Private files: Returns signed URL with expiration
   * @param data.filePath - Path of the file (e.g., "public/avatar.jpg" or "private/doc.pdf")
   * @param data.expiresIn - Expiration time in seconds for private files (default: 3600)
   * @param options - Optional request configuration (AbortSignal)
   * @returns Promise<CrudifyResponse> with data: { url, isPublic, expiresAt }
   */
  public getFileUrl = async (data: { filePath: string; expiresIn?: number }, options?: CrudifyRequestOptions): Promise<CrudifyResponse> => {
    return this.performCrudOperation(queryGetFileUrl, { data: JSON.stringify(data) }, options);
  };

  public readItem = async (
    moduleKey: string,
    filter: { _id: string } | object,
    options?: CrudifyRequestOptions
  ): Promise<CrudifyResponse> => {
    return this.performCrudOperation(queryReadItem, { moduleKey, data: JSON.stringify(filter) }, options);
  };

  public readItems = async (moduleKey: string, filter: object, options?: CrudifyRequestOptions): Promise<CrudifyResponse> => {
    return this.performCrudOperation(queryReadItems, { moduleKey, data: JSON.stringify(filter) }, options);
  };

  public updateItem = async (moduleKey: string, data: object, options?: CrudifyRequestOptions): Promise<CrudifyResponse> => {
    return this.performCrudOperation(mutationUpdateItem, { moduleKey, data: JSON.stringify(data) }, options);
  };

  public deleteItem = async (moduleKey: string, id: string, options?: CrudifyRequestOptions): Promise<CrudifyResponse> => {
    return this.performCrudOperation(mutationDeleteItem, { moduleKey, data: JSON.stringify({ _id: id }) }, options);
  };

  public transaction = async (data: any, options?: CrudifyRequestOptions): Promise<CrudifyResponse> => {
    return this.performCrudOperation(mutationTransaction, { data: JSON.stringify(data) }, options);
  };

  /**
   * Get next sequence value for auto-generated codes
   * @param prefix - The prefix/counterKey for the sequence (e.g., "PROD-", "USER-")
   * @param options - Optional request configuration (AbortSignal)
   * @returns Promise<CrudifyResponse> with data: { value: number }
   *
   * @example
   * ```typescript
   * const result = await crudify.getNextSequence("PROD-");
   * if (result.success) {
   *   const sequenceNumber = result.data.value;
   *   const barCode = `PROD-${String(sequenceNumber).padStart(7, '0')}`;
   *   console.log(barCode); // "PROD-0013671"
   * }
   * ```
   */
  public getNextSequence = async (prefix: string, options?: CrudifyRequestOptions): Promise<CrudifyResponse> => {
    if (!prefix || typeof prefix !== "string") {
      return {
        success: false,
        errors: { _validation: ["PREFIX_REQUIRED"] },
      };
    }

    return this.performCrudOperation(queryGetNextSequence, { data: JSON.stringify({ prefix }) }, options);
  };

  public static getInstance(): Crudify {
    if (!Crudify.instance) Crudify.instance = new Crudify();
    return Crudify.instance;
  }

  public setResponseInterceptor = (interceptor: CrudifyResponseInterceptor | null): void => {
    if (this.logLevel === "debug") console.log("Crudify: setResponseInterceptor called");
    this.responseInterceptor = interceptor;
  };

  public async shutdown() {
    if (this.logLevel === "debug") console.log("Crudify: Initiating shutdown...");
    await shutdownNodeSpecifics(this.logLevel);
  }
}

export default Crudify.getInstance();
