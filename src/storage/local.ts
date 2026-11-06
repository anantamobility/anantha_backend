import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve, sep } from "node:path";
import type { StorageProvider } from "./types.js";

/**
 * Development/local storage adapter. Files are written outside the database and
 * outside the web root. Production should use a private S3-compatible adapter
 * implementing the same interface.
 */
export class LocalStorageProvider implements StorageProvider {
  readonly driver = "local";
  private readonly baseDir: string;

  constructor(baseDir: string) {
    this.baseDir = resolve(baseDir);
  }

  private resolveKey(key: string): string {
    if (!key || isAbsolute(key)) {
      throw new Error("Invalid storage key");
    }

    const fullPath = resolve(join(this.baseDir, key));
    if (fullPath !== this.baseDir && !fullPath.startsWith(this.baseDir + sep)) {
      throw new Error("Invalid storage key");
    }

    return fullPath;
  }

  async put(key: string, data: Buffer): Promise<void> {
    const fullPath = this.resolveKey(key);
    await mkdir(dirname(fullPath), { recursive: true });
    await writeFile(fullPath, data, { flag: "wx" });
  }

  async get(key: string): Promise<Buffer> {
    return readFile(this.resolveKey(key));
  }

  async delete(key: string): Promise<void> {
    try {
      await unlink(this.resolveKey(key));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    }
  }
}
