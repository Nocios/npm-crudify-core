import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import CrudifyInstance from "../../src/crudify";
import { resetCrudifyState, mockInitSuccess } from "../helpers/testUtils";

describe("Sequence Operations", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(async () => {
    // Reset complete state
    resetCrudifyState();

    // Save original fetch
    originalFetch = globalThis.fetch;

    // Initialize
    globalThis.fetch = vi.fn().mockResolvedValue(mockInitSuccess());
    await CrudifyInstance.init("test-api-key");
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    resetCrudifyState();
  });

  describe("getNextSequence", () => {
    it("should get next sequence value successfully", async () => {
      const mockSequence = { value: 13671 };

      globalThis.fetch = vi.fn().mockResolvedValue({
        json: async () => ({
          data: {
            response: {
              status: "OK",
              data: JSON.stringify(mockSequence),
            },
          },
        }),
      });

      const result = await CrudifyInstance.getNextSequence("PROD-");

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockSequence);
      expect(result.data.value).toBe(13671);
    });

    it("should handle different prefixes", async () => {
      const prefixes = ["PROD-", "USER-", "SALE-", "PAY-", "INV-"];

      for (const prefix of prefixes) {
        const mockValue = Math.floor(Math.random() * 10000);

        globalThis.fetch = vi.fn().mockResolvedValue({
          json: async () => ({
            data: {
              response: {
                status: "OK",
                data: JSON.stringify({ value: mockValue }),
              },
            },
          }),
        });

        const result = await CrudifyInstance.getNextSequence(prefix);

        expect(result.success).toBe(true);
        expect(result.data.value).toBe(mockValue);
      }
    });

    it("should increment sequence on multiple calls", async () => {
      let sequenceValue = 100;

      globalThis.fetch = vi.fn().mockImplementation(async () => ({
        json: async () => ({
          data: {
            response: {
              status: "OK",
              data: JSON.stringify({ value: ++sequenceValue }),
            },
          },
        }),
      }));

      const result1 = await CrudifyInstance.getNextSequence("PROD-");
      expect(result1.success).toBe(true);
      expect(result1.data.value).toBe(101);

      const result2 = await CrudifyInstance.getNextSequence("PROD-");
      expect(result2.success).toBe(true);
      expect(result2.data.value).toBe(102);

      const result3 = await CrudifyInstance.getNextSequence("PROD-");
      expect(result3.success).toBe(true);
      expect(result3.data.value).toBe(103);
    });

    it("should return error when prefix is missing", async () => {
      const result = await CrudifyInstance.getNextSequence("");

      expect(result.success).toBe(false);
      expect(result.errors?._validation).toContain("PREFIX_REQUIRED");
    });

    it("should return error when prefix is invalid type", async () => {
      // @ts-expect-error Testing invalid type
      const result = await CrudifyInstance.getNextSequence(null);

      expect(result.success).toBe(false);
      expect(result.errors?._validation).toContain("PREFIX_REQUIRED");
    });

    it("should handle invalid prefix from backend", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        json: async () => ({
          data: {
            response: {
              status: "ERROR",
              data: JSON.stringify({ message: "Invalid or unauthorized prefix" }),
            },
          },
        }),
      });

      const result = await CrudifyInstance.getNextSequence("INVALID-");

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
    });

    it("should handle rate limit exceeded", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        json: async () => ({
          data: {
            response: {
              status: "TOO_MANY_REQUESTS",
              data: JSON.stringify({ message: "Too many sequence requests. Please wait before trying again." }),
            },
          },
        }),
      });

      const result = await CrudifyInstance.getNextSequence("PROD-");

      expect(result.success).toBe(false);
      expect(result.errors?._error).toContain("TOO_MANY_REQUESTS");
    });

    it("should handle server error", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        json: async () => ({
          data: {
            response: {
              status: "ERROR",
              data: JSON.stringify({ message: "Failed to generate sequence" }),
            },
          },
        }),
      });

      const result = await CrudifyInstance.getNextSequence("PROD-");

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
    });

    it("should throw error when not initialized", async () => {
      (CrudifyInstance as any).endpoint = "";

      await expect(CrudifyInstance.getNextSequence("PROD-")).rejects.toThrow("Not initialized");
    });

    it("should support abort signal", async () => {
      const controller = new AbortController();

      globalThis.fetch = vi.fn().mockResolvedValue({
        json: async () => ({
          data: {
            response: {
              status: "OK",
              data: JSON.stringify({ value: 123 }),
            },
          },
        }),
      });

      const result = await CrudifyInstance.getNextSequence("PROD-", { signal: controller.signal });

      expect(result.success).toBe(true);
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          signal: controller.signal,
        })
      );
    });

    it("should handle aborted request", async () => {
      const controller = new AbortController();

      globalThis.fetch = vi.fn().mockImplementation(() => {
        controller.abort();
        return Promise.reject(new DOMException("Aborted", "AbortError"));
      });

      await expect(CrudifyInstance.getNextSequence("PROD-", { signal: controller.signal })).rejects.toThrow();
    });

    it("should work with public API (no authentication required)", async () => {
      // Remove token to simulate unauthenticated user
      (CrudifyInstance as any).token = "";

      globalThis.fetch = vi.fn().mockResolvedValue({
        json: async () => ({
          data: {
            response: {
              status: "OK",
              data: JSON.stringify({ value: 999 }),
            },
          },
        }),
      });

      const result = await CrudifyInstance.getNextSequence("PROD-");

      expect(result.success).toBe(true);
      expect(result.data.value).toBe(999);
    });
  });

  describe("Integration with formatting", () => {
    it("should allow formatting of generated sequence", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        json: async () => ({
          data: {
            response: {
              status: "OK",
              data: JSON.stringify({ value: 13671 }),
            },
          },
        }),
      });

      const result = await CrudifyInstance.getNextSequence("PROD-");

      expect(result.success).toBe(true);

      // Simulate formatting in application code
      const sequenceNumber = result.data.value;
      const barCode = `PROD-${String(sequenceNumber).padStart(7, "0")}`;

      expect(barCode).toBe("PROD-0013671");
    });

    it("should handle small sequence numbers with padding", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        json: async () => ({
          data: {
            response: {
              status: "OK",
              data: JSON.stringify({ value: 1 }),
            },
          },
        }),
      });

      const result = await CrudifyInstance.getNextSequence("PROD-");

      expect(result.success).toBe(true);

      const sequenceNumber = result.data.value;
      const barCode = `PROD-${String(sequenceNumber).padStart(7, "0")}`;

      expect(barCode).toBe("PROD-0000001");
    });

    it("should handle large sequence numbers", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        json: async () => ({
          data: {
            response: {
              status: "OK",
              data: JSON.stringify({ value: 9999999 }),
            },
          },
        }),
      });

      const result = await CrudifyInstance.getNextSequence("PROD-");

      expect(result.success).toBe(true);

      const sequenceNumber = result.data.value;
      const barCode = `PROD-${String(sequenceNumber).padStart(7, "0")}`;

      expect(barCode).toBe("PROD-9999999");
    });
  });
});
