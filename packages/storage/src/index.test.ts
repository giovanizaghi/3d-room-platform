import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { isConfigured, isStorageKey, getPublicUrl } from "./index.js";

describe("isStorageKey", () => {
  it("returns true for a bare relative key", () => {
    expect(isStorageKey("models/abc/model.blend")).toBe(true);
  });

  it("returns true for a nested key without a leading slash", () => {
    expect(isStorageKey("renders/render-id.png")).toBe(true);
  });

  it("returns false for an absolute path", () => {
    expect(isStorageKey("/absolute/path/to/file.blend")).toBe(false);
  });

  it("returns false for an http URL", () => {
    expect(isStorageKey("http://example.com/key")).toBe(false);
  });

  it("returns false for an https URL", () => {
    expect(isStorageKey("https://cdn.example.com/key")).toBe(false);
  });

  it("returns false for an empty string", () => {
    expect(isStorageKey("")).toBe(false);
  });
});

describe("isConfigured", () => {
  const REQUIRED = {
    STORAGE_ENDPOINT: "https://s3.example.com",
    STORAGE_ACCESS_KEY_ID: "key-id",
    STORAGE_SECRET_ACCESS_KEY: "secret",
    STORAGE_BUCKET: "my-bucket",
    STORAGE_PUBLIC_URL: "https://cdn.example.com",
  };

  beforeEach(() => {
    for (const [k, v] of Object.entries(REQUIRED)) {
      process.env[k] = v;
    }
  });

  afterEach(() => {
    for (const k of Object.keys(REQUIRED)) {
      delete process.env[k];
    }
  });

  it("returns true when all env vars are set", () => {
    expect(isConfigured()).toBe(true);
  });

  it("returns false when STORAGE_ENDPOINT is missing", () => {
    delete process.env.STORAGE_ENDPOINT;
    expect(isConfigured()).toBe(false);
  });

  it("returns false when STORAGE_BUCKET is missing", () => {
    delete process.env.STORAGE_BUCKET;
    expect(isConfigured()).toBe(false);
  });

  it("returns false when STORAGE_PUBLIC_URL is missing", () => {
    delete process.env.STORAGE_PUBLIC_URL;
    expect(isConfigured()).toBe(false);
  });
});

describe("getPublicUrl", () => {
  beforeEach(() => {
    process.env.STORAGE_PUBLIC_URL = "https://cdn.example.com";
  });

  afterEach(() => {
    delete process.env.STORAGE_PUBLIC_URL;
  });

  it("returns the full public URL for a key", () => {
    expect(getPublicUrl("models/abc/model.blend")).toBe(
      "https://cdn.example.com/models/abc/model.blend"
    );
  });

  it("strips a trailing slash from STORAGE_PUBLIC_URL", () => {
    process.env.STORAGE_PUBLIC_URL = "https://cdn.example.com/";
    expect(getPublicUrl("renders/foo.png")).toBe(
      "https://cdn.example.com/renders/foo.png"
    );
  });

  it("throws when STORAGE_PUBLIC_URL is not set", () => {
    delete process.env.STORAGE_PUBLIC_URL;
    expect(() => getPublicUrl("key")).toThrow("STORAGE_PUBLIC_URL is not set");
  });
});
