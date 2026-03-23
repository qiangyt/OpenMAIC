import type { StorageProvider, StorageType } from '../types';

/** 未配置外部存储时使用的空操作提供者。 */
export class NoopStorageProvider implements StorageProvider {
  async upload(): Promise<string> {
    return '';
  }
  async exists(): Promise<boolean> {
    return false;
  }
  getUrl(): string {
    return '';
  }
  async batchExists(_hashes: string[], _type: StorageType): Promise<Set<string>> {
    return new Set();
  }
}
