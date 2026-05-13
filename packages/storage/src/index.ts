import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { readFile, writeFile } from "node:fs/promises";
import type { Readable } from "node:stream";

// Lazy singleton — created once on first use.
let _client: S3Client | null | undefined;

function getClient(): S3Client | null {
  if (_client !== undefined) return _client;
  const { STORAGE_ENDPOINT, STORAGE_ACCESS_KEY_ID, STORAGE_SECRET_ACCESS_KEY } = process.env;
  if (!STORAGE_ENDPOINT || !STORAGE_ACCESS_KEY_ID || !STORAGE_SECRET_ACCESS_KEY) {
    return (_client = null);
  }
  return (_client = new S3Client({
    endpoint: STORAGE_ENDPOINT,
    region: process.env.STORAGE_REGION ?? "auto",
    credentials: { accessKeyId: STORAGE_ACCESS_KEY_ID, secretAccessKey: STORAGE_SECRET_ACCESS_KEY },
    // Virtual-hosted style is required for Cloudflare R2 and most S3-compatible providers.
    forcePathStyle: false,
  }));
}

/**
 * Returns true when all four required env vars are present.
 * Use this to decide whether to use object storage or local filesystem.
 */
export function isConfigured(): boolean {
  return !!(
    process.env.STORAGE_ENDPOINT &&
    process.env.STORAGE_ACCESS_KEY_ID &&
    process.env.STORAGE_SECRET_ACCESS_KEY &&
    process.env.STORAGE_BUCKET &&
    process.env.STORAGE_PUBLIC_URL
  );
}

/**
 * Returns true if the path/value looks like a storage key (no leading slash, no http scheme).
 * Used to distinguish S3 keys stored in the DB from legacy local absolute paths.
 */
export function isStorageKey(value: string): boolean {
  return !!value && !value.startsWith("/") && !value.startsWith("http");
}

/** Builds the public URL for a storage key using STORAGE_PUBLIC_URL. */
export function getPublicUrl(key: string): string {
  const base = (process.env.STORAGE_PUBLIC_URL ?? "").replace(/\/$/, "");
  if (!base) throw new Error("STORAGE_PUBLIC_URL is not set");
  return `${base}/${key}`;
}

/**
 * Uploads a local file to object storage and returns its public URL.
 * Throws if storage is not configured.
 */
export async function upload(key: string, localPath: string, contentType: string): Promise<string> {
  const client = getClient();
  const bucket = process.env.STORAGE_BUCKET;
  if (!client || !bucket) throw new Error("Object storage is not configured");

  const body = await readFile(localPath);
  await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }));
  return getPublicUrl(key);
}

/**
 * Downloads a storage key to a local destination path.
 * Throws if storage is not configured.
 */
export async function download(key: string, destPath: string): Promise<void> {
  const client = getClient();
  const bucket = process.env.STORAGE_BUCKET;
  if (!client || !bucket) throw new Error("Object storage is not configured");

  const resp = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  if (!resp.Body) throw new Error(`Empty response body for storage key: ${key}`);

  const chunks: Buffer[] = [];
  for await (const chunk of resp.Body as Readable) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as ArrayBuffer));
  }
  await writeFile(destPath, Buffer.concat(chunks));
}
