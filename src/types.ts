/**
 * Defines the logging level for Crudify operations.
 * 'none': No logs will be output.
 * 'debug': Detailed logs for requests, responses, and internal processes will be output.
 */
export type CrudifyLogLevel = "none" | "debug";

/**
 * Enum for standardized error codes from crudify-core
 */
export enum NociosError {
  // Authentication errors
  InvalidCredentials = "INVALID_CREDENTIALS",
  InvalidApiKey = "INVALID_API_KEY",
  Unauthorized = "UNAUTHORIZED",

  // User/Subscriber errors
  SubscriberNotFound = "SUBSCRIBER_NOT_FOUND",
  SubscriberNotActive = "SUBSCRIBER_NOT_ACTIVE",
  UserNotFound = "USER_NOT_FOUND",
  UserNotActive = "USER_NOT_ACTIVE",
  ProfileNotFound = "PROFILE_NOT_FOUND",
  ProfileNotActive = "PROFILE_NOT_ACTIVE",

  // Configuration errors
  InvalidConfiguration = "INVALID_CONFIGURATION",

  // Request errors
  BadRequest = "BAD_REQUEST",
  NotFound = "NOT_FOUND",
  InUse = "IN_USE",
  NoPermission = "NO_PERMISSION",

  // System errors
  InternalServerError = "INTERNAL_SERVER_ERROR",
  DatabaseConnectionError = "DATABASE_CONNECTION_ERROR",

  // Validation errors
  FieldError = "FIELD_ERROR",

  // Operation errors
  UnknownOperation = "UNKNOWN_OPERATION",
  NotExecuted = "NOT_EXECUTED",
  NoActive = "NO_ACTIVE",
  ItemNotFound = "ITEM_NOT_FOUND",
}

/**
 * Represents the structure of an issue or error, typically for field-level errors.
 */
export type CrudifyIssue = {
  path: Array<string | number>;
  message: string;
};

/**
 * Specifies the Crudify environment to connect to.
 * 'dev': Development environment.
 * 'stg': Staging environment.
 * 'api': Production environment (or a general API endpoint).
 * 'prod': Production environment (or a general API endpoint).
 */
export type CrudifyEnvType = "dev" | "stg" | "api" | "prod";

/**
 * Represents a JSON string, typically used for data payloads in AWS services or GraphQL.
 */
export type CrudifyAWSJSON = string;

/**
 * A type representing a structured object of field-level validation errors.
 * The key is the field name, and the value is an array of error messages for that field.
 * @example { "email": ["INVALID_EMAIL"], "password": ["MIN_8_CHARACTERS"] }
 */
export type CrudifyFieldErrors = {
  [key: string]: string[];
};

/**
 * Defines the structure of the public-facing response from Crudify SDK methods.
 * @template T - The type of the data payload. Defaults to unknown for type safety.
 */
export type CrudifyResponse<T = unknown> = {
  success: boolean;
  data?: T;
  errors?: CrudifyFieldErrors;
  fieldsWarning?: Record<string, string[]> | null;
  errorCode?: NociosError;
};

/**
 * Internal representation of a response within Crudify, potentially more detailed.
 * @internal
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Internal type needs flexibility for varying API response structures
export type InternalCrudifyResponseType = {
  success: boolean;
  data?: any;
  errors?: CrudifyFieldErrors;
  fieldsWarning?: Record<string, string[]> | null;
  errorCode?: NociosError;
};

/**
 * Represents a GraphQL error from the API response.
 */
export interface GraphQLError {
  message: string;
  path?: (string | number)[];
  extensions?: {
    code?: string;
    errorType?: string;
    [key: string]: unknown;
  };
  locations?: { line: number; column: number }[];
}

/**
 * Raw response structure from the GraphQL API.
 * @template T - The type of the data payload. Defaults to Record<string, unknown>.
 */
export interface RawGraphQLResponse<T = Record<string, unknown>> {
  data?: T;
  errors?: GraphQLError[];
}

export type CrudifyResponseInterceptor = (response: RawGraphQLResponse) => RawGraphQLResponse | Promise<RawGraphQLResponse>;

/**
 * Describes the public interface of the Crudify client instance.
 * This is for documentation and understanding; tsup will generate the actual
 * module interface from the Crudify class implementation.
 */
/**
 * ✅ MEJORADO: Información de tokens para refresh token pattern con validación
 */
export type CrudifyTokenData = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  refreshExpiresAt: number;
  isExpired: boolean;
  isRefreshExpired: boolean;
  // ✅ NUEVO: Campos de validación
  isValid: boolean;
  expiresIn: number;
  willExpireSoon: boolean;
};

/**
 * ✅ NUEVO: Parámetros para configurar tokens manualmente
 */
export type CrudifyTokenConfig = {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  refreshExpiresAt?: number;
};

export interface CrudifyPublicAPI {
  getLogLevel: () => CrudifyLogLevel;
  config: (env: CrudifyEnvType) => void;
  init: (publicApiKey: string, logLevel?: CrudifyLogLevel) => Promise<{ apiEndpointAdmin?: string; apiKeyEndpointAdmin?: string }>;
  login: (identifier: string, password: string) => Promise<CrudifyResponse>;
  logout: () => Promise<CrudifyResponse>;
  isLogin: () => boolean;

  // ✅ NUEVO: Métodos para refresh token pattern
  refreshAccessToken: () => Promise<CrudifyResponse>;
  setTokens: (tokens: CrudifyTokenConfig) => void;
  getTokenData: () => CrudifyTokenData;

  getPermissions: (options?: CrudifyRequestOptions) => Promise<CrudifyResponse>;
  getStructure: (options?: CrudifyRequestOptions) => Promise<CrudifyResponse>;
  getStructurePublic: (options?: CrudifyRequestOptions) => Promise<CrudifyResponse>;
  getTranslation: (sections?: string[], options?: CrudifyRequestOptions) => Promise<CrudifyResponse>;
  createItem: (moduleKey: string, data: object, options?: CrudifyRequestOptions) => Promise<CrudifyResponse>;
  createItemPublic: (moduleKey: string, data: object, options?: CrudifyRequestOptions) => Promise<CrudifyResponse>;
  readItem: (moduleKey: string, filter: ReadItemFilter | object, options?: CrudifyRequestOptions) => Promise<CrudifyResponse>;
  readItems: (moduleKey: string, filter: object, options?: CrudifyRequestOptions) => Promise<CrudifyResponse>;
  updateItem: (moduleKey: string, data: object, options?: CrudifyRequestOptions) => Promise<CrudifyResponse>;
  deleteItem: (moduleKey: string, id: string, options?: CrudifyRequestOptions) => Promise<CrudifyResponse>;
  transaction: (data: TransactionInput, options?: CrudifyRequestOptions) => Promise<CrudifyResponse>;
  getNextSequence: (prefix: string, options?: CrudifyRequestOptions) => Promise<CrudifyResponse>;
  generateSignedUrl: (
    data: { fileName: string; contentType: string; visibility?: "public" | "private" },
    options?: CrudifyRequestOptions
  ) => Promise<CrudifyResponse>;
  getFileUrl: (data: { filePath: string; expiresIn?: number }, options?: CrudifyRequestOptions) => Promise<CrudifyResponse>;
  disableFile: (data: { filePath: string }, options?: CrudifyRequestOptions) => Promise<CrudifyResponse>;
  setResponseInterceptor: (interceptor: CrudifyResponseInterceptor | null) => void;
  shutdown: () => Promise<void>;
}

export type CrudifyRequestOptions = {
  signal?: AbortSignal;
};

/**
 * Represents a single operation within a transaction.
 */
export interface TransactionOperation {
  operation: "create" | "update" | "delete" | string;
  moduleKey: string;
  data?: Record<string, unknown>;
  _id?: string;
  [key: string]: unknown;
}

/**
 * Input for transaction operations. Can be a single operation or an array of operations.
 */
export type TransactionInput = TransactionOperation | TransactionOperation[] | Record<string, unknown>;

/**
 * Configuration for populating referenced documents in read operations.
 * Supports both simple paths and nested paths within arrays.
 *
 * @example Simple path
 * ```typescript
 * { path: "customer", moduleKey: "customers", select: ["name", "email"] }
 * ```
 *
 * @example Nested path (for arrays)
 * ```typescript
 * { path: "saleItems.owner", moduleKey: "users", select: ["name", "lastName"] }
 * ```
 */
export interface PopulateOption {
  /** Field path to populate. Supports nested paths like "arrayField.nestedRef" */
  path: string;
  /** Module key of the referenced collection */
  moduleKey: string;
  /** Fields to select from the populated document. If omitted, all allowed fields are returned */
  select?: string[] | string;
}

/**
 * Filter options for readItem operation.
 * Extends the basic _id filter with optional populate configuration.
 */
export interface ReadItemFilter {
  /** Document ID to retrieve */
  _id: string;
  /** Optional populate configuration for loading referenced documents */
  populate?: PopulateOption[];
}
