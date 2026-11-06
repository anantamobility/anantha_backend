export interface StorageProvider {
  readonly driver: string;
  put(key: string, data: Buffer, contentType?: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
}
