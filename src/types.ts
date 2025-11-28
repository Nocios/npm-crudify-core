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
 */
export type CrudifyResponse = {
  success: boolean;
  data?: any;
  errors?: CrudifyFieldErrors;
  fieldsWarning?: any;
  errorCode?: NociosError;
};

/**
 * Internal representation of a response within Crudify, potentially more detailed.
 */
export type InternalCrudifyResponseType = {
  success: boolean;
  data?: any;
  errors?: CrudifyFieldErrors | any;
  fieldsWarning?: any;
  errorCode?: NociosError;
};

export interface RawGraphQLResponse {
  data?: any;
  errors?: any[];
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
  readItem: (moduleKey: string, filter: { _id: string } | object, options?: CrudifyRequestOptions) => Promise<CrudifyResponse>;
  readItems: (moduleKey: string, filter: object, options?: CrudifyRequestOptions) => Promise<CrudifyResponse>;
  updateItem: (moduleKey: string, data: object, options?: CrudifyRequestOptions) => Promise<CrudifyResponse>;
  deleteItem: (moduleKey: string, id: string, options?: CrudifyRequestOptions) => Promise<CrudifyResponse>;
  transaction: (data: any, options?: CrudifyRequestOptions) => Promise<CrudifyResponse>;
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
