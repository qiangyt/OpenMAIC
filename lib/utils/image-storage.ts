/**
 * 图片存储工具
 *
 * 将 PDF 图片存储到 IndexedDB 以避免 sessionStorage 5MB 限制。
 * 图片以 Blob 形式存储以提高效率。
 */

import { db, type ImageFileRecord } from './database';
import { nanoid } from 'nanoid';
import { createLogger } from '@/lib/logger';

const log = createLogger('ImageStorage');

/**
 * 将 base64 数据 URL 转换为 Blob
 */
function base64ToBlob(base64DataUrl: string): Blob {
  const parts = base64DataUrl.split(',');
  const mimeMatch = parts[0].match(/:(.*?);/);
  const mimeType = mimeMatch ? mimeMatch[1] : 'image/png';
  const base64Data = parts[1];
  const byteString = atob(base64Data);
  const arrayBuffer = new ArrayBuffer(byteString.length);
  const uint8Array = new Uint8Array(arrayBuffer);

  for (let i = 0; i < byteString.length; i++) {
    uint8Array[i] = byteString.charCodeAt(i);
  }

  return new Blob([uint8Array], { type: mimeType });
}

/**
 * 将 Blob 转换为 base64 数据 URL
 */
async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * 将图片存储到 IndexedDB
 * 返回已存储的图片 ID 数组
 */
export async function storeImages(
  images: Array<{ id: string; src: string; pageNumber?: number }>,
): Promise<string[]> {
  const sessionId = nanoid(10);
  const storedIds: string[] = [];

  for (const img of images) {
    try {
      const blob = base64ToBlob(img.src);
      const mimeMatch = img.src.match(/data:(.*?);/);
      const mimeType = mimeMatch ? mimeMatch[1] : 'image/png';

      // 使用会话前缀的 ID 以便清理
      const storageId = `session_${sessionId}_${img.id}`;

      const record: ImageFileRecord = {
        id: storageId,
        blob,
        filename: `${img.id}.png`,
        mimeType,
        size: blob.size,
        createdAt: Date.now(),
      };

      await db.imageFiles.put(record);
      storedIds.push(storageId);
    } catch (error) {
      log.error(`Failed to store image ${img.id}:`, error);
    }
  }

  return storedIds;
}

/**
 * 从 IndexedDB 加载图片并返回 imageMapping
 * @param imageIds - 存储 ID 数组（session_xxx_img_1 格式）
 * @returns ImageMapping { img_1: "data:image/png;base64,..." }
 */
export async function loadImageMapping(imageIds: string[]): Promise<Record<string, string>> {
  const mapping: Record<string, string> = {};

  for (const storageId of imageIds) {
    try {
      const record = await db.imageFiles.get(storageId);
      if (record) {
        const base64 = await blobToBase64(record.blob);
        // 从存储 ID（session_xxx_img_1）中提取原始 ID（img_1）
        const originalId = storageId.replace(/^session_[^_]+_/, '');
        mapping[originalId] = base64;
      }
    } catch (error) {
      log.error(`Failed to load image ${storageId}:`, error);
    }
  }

  return mapping;
}

/**
 * 按会话前缀清理图片
 */
export async function cleanupSessionImages(sessionId: string): Promise<void> {
  try {
    const prefix = `session_${sessionId}_`;
    const allImages = await db.imageFiles.toArray();
    const toDelete = allImages.filter((img) => img.id.startsWith(prefix));

    for (const img of toDelete) {
      await db.imageFiles.delete(img.id);
    }

    log.info(`Cleaned up ${toDelete.length} images for session ${sessionId}`);
  } catch (error) {
    log.error('Failed to cleanup session images:', error);
  }
}

/**
 * 清理旧图片（超过指定小时数）
 */
export async function cleanupOldImages(hoursOld: number = 24): Promise<void> {
  try {
    const cutoff = Date.now() - hoursOld * 60 * 60 * 1000;
    await db.imageFiles.where('createdAt').below(cutoff).delete();
    log.info(`Cleaned up images older than ${hoursOld} hours`);
  } catch (error) {
    log.error('Failed to cleanup old images:', error);
  }
}

/**
 * 获取已存储图片的总大小
 */
export async function getImageStorageSize(): Promise<number> {
  const images = await db.imageFiles.toArray();
  return images.reduce((total, img) => total + img.size, 0);
}

/**
 * 将 PDF 文件作为 Blob 存储到 IndexedDB。
 * 返回可用于稍后检索 blob 的存储键。
 */
export async function storePdfBlob(file: File): Promise<string> {
  const storageKey = `pdf_${nanoid(10)}`;
  const blob = new Blob([await file.arrayBuffer()], {
    type: file.type || 'application/pdf',
  });

  const record: ImageFileRecord = {
    id: storageKey,
    blob,
    filename: file.name,
    mimeType: file.type || 'application/pdf',
    size: blob.size,
    createdAt: Date.now(),
  };

  await db.imageFiles.put(record);
  return storageKey;
}

/**
 * 通过存储键从 IndexedDB 加载 PDF Blob。
 */
export async function loadPdfBlob(key: string): Promise<Blob | null> {
  const record = await db.imageFiles.get(key);
  return record?.blob ?? null;
}
