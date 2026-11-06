import envConfig from "../config/env.js";
import { LocalStorageProvider } from "./local.js";
import type { StorageProvider } from "./types.js";

export type { StorageProvider } from "./types.js";

function createStorageProvider(): StorageProvider {
  switch (envConfig.storageDriver) {
    case "local":
      return new LocalStorageProvider(envConfig.storageLocalDir);
    case "s3":
      throw new Error(
        "STORAGE_DRIVER=s3 requires a private S3-compatible adapter. " +
          "Configure STORAGE_DRIVER=local for development, or provide an S3 " +
          "adapter using S3_BUCKET, S3_REGION, S3_ENDPOINT, " +
          "S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY."
      );
    default:
      throw new Error(
        `Unsupported STORAGE_DRIVER "${envConfig.storageDriver}". ` +
          "Supported values: local, s3."
      );
  }
}

export const storage: StorageProvider = createStorageProvider();
export { envConfig };
