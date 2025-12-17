import { describe, it, expect, beforeEach } from "vitest";
import { NociosError } from "../../src/types";
import CrudifyInstance from "../../src/crudify";
import pako from "pako";

describe("Response Formatting", () => {
  let crudifyPrivateMethods: any;

  beforeEach(() => {
    // Access the Crudify instance to test private methods through type assertion
    crudifyPrivateMethods = CrudifyInstance;
  });

  describe("formatErrorsInternal", () => {
    it("should format field errors correctly", () => {
      const issues = [
        { path: ["email"], message: "Invalid email format" },
        { path: ["password"], message: "Password too short" },
        { path: ["password"], message: "Password must contain numbers" },
      ];

      const formatted = (crudifyPrivateMethods as any).formatErrorsInternal(issues);

      expect(formatted).toEqual({
        email: ["Invalid email format"],
        password: ["Password too short", "Password must contain numbers"],
      });
    });

    it("should handle errors without path", () => {
      const issues = [{ path: [], message: "General error" }];

      const formatted = (crudifyPrivateMethods as any).formatErrorsInternal(issues);

      expect(formatted).toEqual({
        _error: ["General error"],
      });
    });

    it("should handle empty issues array", () => {
      const issues: any[] = [];

      const formatted = (crudifyPrivateMethods as any).formatErrorsInternal(issues);

      expect(formatted).toEqual({});
    });
  });

  describe("sanitizeForLogging", () => {
    it("should mask sensitive API keys", () => {
      const data = {
        apiKey: "da2-verylongapikeythatshouldbehidden",
        normalField: "visible",
      };

      const sanitized = (crudifyPrivateMethods as any).sanitizeForLogging(data);

      expect(sanitized.apiKey).toBe("da2-ve******");
      expect(sanitized.normalField).toBe("visible");
    });

    it("should mask token fields", () => {
      const data = {
        token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.longtokenhere",
        refreshToken: "refresh-token-value",
        password: "secretpassword",
      };

      const sanitized = (crudifyPrivateMethods as any).sanitizeForLogging(data);

      expect(sanitized.token).toContain("******");
      expect(sanitized.refreshToken).toContain("******");
      expect(sanitized.password).toContain("******");
    });

    it("should handle nested objects", () => {
      const data = {
        user: {
          apiKey: "da2-secretkey",
          name: "John",
        },
        config: {
          token: "verylongtokenstring",
        },
      };

      const sanitized = (crudifyPrivateMethods as any).sanitizeForLogging(data);

      expect(sanitized.user.apiKey).toContain("******");
      expect(sanitized.user.name).toBe("John");
      expect(sanitized.config.token).toContain("******");
    });

    it("should handle arrays", () => {
      const data = [{ apiKey: "da2-secret1" }, { apiKey: "da2-secret2" }, { normalField: "visible" }];

      const sanitized = (crudifyPrivateMethods as any).sanitizeForLogging(data);

      expect(sanitized[0].apiKey).toContain("******");
      expect(sanitized[1].apiKey).toContain("******");
      expect(sanitized[2].normalField).toBe("visible");
    });
  });

  describe("containsDangerousProperties", () => {
    it("should detect dangerous property names", () => {
      // Test with eval property (which is dangerous)
      const maliciousData: any = {
        normal: "data",
        eval: "dangerous code",
      };

      const result = (crudifyPrivateMethods as any).containsDangerousProperties(maliciousData);

      expect(result).toBe(true);
    });

    it("should detect constructor manipulation", () => {
      const maliciousData = {
        constructor: { prototype: {} },
      };

      const result = (crudifyPrivateMethods as any).containsDangerousProperties(maliciousData);

      expect(result).toBe(true);
    });

    it("should accept normal objects", () => {
      const normalData = {
        name: "John",
        email: "john@example.com",
        nested: {
          field: "value",
        },
      };

      const result = (crudifyPrivateMethods as any).containsDangerousProperties(normalData);

      expect(result).toBe(false);
    });

    it("should handle deep nesting", () => {
      const deepData = {
        level1: {
          level2: {
            level3: {
              level4: {
                level5: {
                  normal: "data",
                },
              },
            },
          },
        },
      };

      const result = (crudifyPrivateMethods as any).containsDangerousProperties(deepData);

      expect(result).toBe(false);
    });

    it("should stop at depth limit", () => {
      // Create object deeper than 10 levels
      let deepObj: any = { value: "deep" };
      for (let i = 0; i < 15; i++) {
        deepObj = { nested: deepObj };
      }

      const result = (crudifyPrivateMethods as any).containsDangerousProperties(deepObj);

      expect(result).toBe(false); // Should not crash, returns false at depth limit
    });
  });

  describe("formatResponseInternal", () => {
    it("should handle successful response with data", () => {
      const response = {
        data: {
          response: {
            status: "OK",
            data: JSON.stringify({ id: "123", name: "Test" }),
            fieldsWarning: null,
          },
        },
      };

      const formatted = (crudifyPrivateMethods as any).formatResponseInternal(response);

      expect(formatted.success).toBe(true);
      expect(formatted.data).toEqual({ id: "123", name: "Test" });
    });

    it("should handle GraphQL errors", () => {
      const response = {
        errors: [{ message: "Not authorized" }, { message: "Invalid input" }],
      };

      const formatted = (crudifyPrivateMethods as any).formatResponseInternal(response);

      expect(formatted.success).toBe(false);
      expect(formatted.errors?._graphql).toContain("NOT_AUTHORIZED");
      expect(formatted.errors?._graphql).toContain("INVALID_INPUT");
    });

    it("should handle FIELD_ERROR status", () => {
      const issues = [{ path: ["email"], message: "Invalid email" }];

      const response = {
        data: {
          response: {
            status: "FIELD_ERROR",
            data: JSON.stringify(issues),
          },
        },
      };

      const formatted = (crudifyPrivateMethods as any).formatResponseInternal(response);

      expect(formatted.success).toBe(false);
      expect(formatted.errors?.email).toContain("Invalid email");
    });

    it("should handle ITEM_NOT_FOUND status", () => {
      const response = {
        data: {
          response: {
            status: "ITEM_NOT_FOUND",
            data: null,
          },
        },
      };

      const formatted = (crudifyPrivateMethods as any).formatResponseInternal(response);

      expect(formatted.success).toBe(false);
      expect(formatted.errors?._id).toContain("ITEM_NOT_FOUND");
      expect(formatted.errorCode).toBe(NociosError.ItemNotFound);
    });

    it("should handle WARNING status", () => {
      const response = {
        data: {
          response: {
            status: "WARNING",
            data: JSON.stringify({ result: "partial" }),
            fieldsWarning: ["field1"],
          },
        },
      };

      const formatted = (crudifyPrivateMethods as any).formatResponseInternal(response);

      expect(formatted.success).toBe(true);
      expect(formatted.data).toEqual({ result: "partial" });
      expect(formatted.fieldsWarning).toEqual(["field1"]);
    });

    it("should handle ERROR status with transaction array", () => {
      const transactionData = [
        { action: "create", response: { status: "OK" } },
        { action: "update", response: { status: "ERROR" } },
      ];

      const response = {
        data: {
          response: {
            status: "ERROR",
            data: JSON.stringify(transactionData),
          },
        },
      };

      const formatted = (crudifyPrivateMethods as any).formatResponseInternal(response);

      expect(formatted.success).toBe(false);
      expect(formatted.errors?._transaction).toContain("ONE_OR_MORE_OPERATIONS_FAILED");
    });

    it("should handle invalid JSON in data", () => {
      const response = {
        data: {
          response: {
            status: "OK",
            data: "invalid json {{{",
          },
        },
      };

      const formatted = (crudifyPrivateMethods as any).formatResponseInternal(response);

      expect(formatted.success).toBe(false);
      expect(formatted.errors?._error).toContain("INVALID_DATA_FORMAT_IN_SUCCESSFUL_RESPONSE");
    });

    it("should handle data exceeding size limit", () => {
      // Create a very large string (> 10MB)
      const largeData = "x".repeat(11 * 1024 * 1024);

      const response = {
        data: {
          response: {
            status: "OK",
            data: largeData,
          },
        },
      };

      const formatted = (crudifyPrivateMethods as any).formatResponseInternal(response);

      expect(formatted.success).toBe(false);
      expect(formatted.errors?._error).toBeDefined();
    });

    it("should handle invalid response structure", () => {
      const response = {
        data: {},
      };

      const formatted = (crudifyPrivateMethods as any).formatResponseInternal(response);

      expect(formatted.success).toBe(false);
      expect(formatted.errors?._error).toContain("INVALID_RESPONSE_STRUCTURE");
    });

    describe("GZIP compression handling", () => {
      const compressToGzipBase64 = (data: string): string => {
        const compressed = pako.gzip(data);
        // Convert Uint8Array to base64
        let binary = "";
        for (let i = 0; i < compressed.length; i++) {
          binary += String.fromCharCode(compressed[i]);
        }
        return btoa(binary);
      };

      it("should decompress GZIP:prefixed data successfully", () => {
        const originalData = { id: "123", name: "Test Item", items: [1, 2, 3] };
        const jsonString = JSON.stringify(originalData);
        const compressedBase64 = compressToGzipBase64(jsonString);

        const response = {
          data: {
            response: {
              status: "OK",
              data: `GZIP:${compressedBase64}`,
              fieldsWarning: null,
            },
          },
        };

        const formatted = (crudifyPrivateMethods as any).formatResponseInternal(response);

        expect(formatted.success).toBe(true);
        expect(formatted.data).toEqual(originalData);
      });

      it("should handle large compressed payloads", () => {
        // Create a large array of items
        const largeData = {
          items: Array.from({ length: 1000 }, (_, i) => ({
            id: i,
            name: `Item ${i}`,
            description: `This is a description for item ${i} with some extra text to make it larger`,
          })),
        };
        const jsonString = JSON.stringify(largeData);
        const compressedBase64 = compressToGzipBase64(jsonString);

        const response = {
          data: {
            response: {
              status: "OK",
              data: `GZIP:${compressedBase64}`,
              fieldsWarning: null,
            },
          },
        };

        const formatted = (crudifyPrivateMethods as any).formatResponseInternal(response);

        expect(formatted.success).toBe(true);
        expect(formatted.data.items.length).toBe(1000);
        expect(formatted.data.items[500].id).toBe(500);
      });

      it("should handle non-GZIP prefixed data normally", () => {
        const normalData = { id: "456", name: "Normal" };

        const response = {
          data: {
            response: {
              status: "OK",
              data: JSON.stringify(normalData),
              fieldsWarning: null,
            },
          },
        };

        const formatted = (crudifyPrivateMethods as any).formatResponseInternal(response);

        expect(formatted.success).toBe(true);
        expect(formatted.data).toEqual(normalData);
      });

      it("should handle invalid GZIP data gracefully", () => {
        const response = {
          data: {
            response: {
              status: "OK",
              data: "GZIP:invalidbase64!!!",
              fieldsWarning: null,
            },
          },
        };

        const formatted = (crudifyPrivateMethods as any).formatResponseInternal(response);

        // Should fail gracefully when decompression fails
        expect(formatted.success).toBe(false);
      });

      it("should handle compressed arrays", () => {
        const arrayData = [{ id: 1 }, { id: 2 }, { id: 3 }];
        const jsonString = JSON.stringify(arrayData);
        const compressedBase64 = compressToGzipBase64(jsonString);

        const response = {
          data: {
            response: {
              status: "OK",
              data: `GZIP:${compressedBase64}`,
              fieldsWarning: null,
            },
          },
        };

        const formatted = (crudifyPrivateMethods as any).formatResponseInternal(response);

        expect(formatted.success).toBe(true);
        expect(Array.isArray(formatted.data)).toBe(true);
        expect(formatted.data.length).toBe(3);
      });
    });
  });
});
