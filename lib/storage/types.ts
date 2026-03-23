export type StorageType = 'media' | 'poster' | 'audio';

export interface StorageProvider {
  /** 将 blob 上传到存储。返回公开 URL。如已存在则跳过（去重）。 */
  upload(hash: string, blob: Buffer, type: StorageType, mimeType?: string): Promise<string>;
  /** 检查 key 是否已存在于存储中。 */
  exists(hash: string, type: StorageType): Promise<boolean>;
  /** 根据给定 hash 构建公开下载 URL。 */
  getUrl(hash: string, type: StorageType): string;
  /** 批量检查哪些 hash 已存在。返回已存在的 hash 集合。 */
  batchExists(hashes: string[], type: StorageType): Promise<Set<string>>;
}
