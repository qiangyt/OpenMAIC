/**
 * 播放存储 - 将播放引擎状态持久化到 IndexedDB
 *
 * 存储从断点恢复播放所需的最小状态：
 * 位置（sceneIndex + actionIndex）和已消费的讨论。
 */

import { db } from './database';

export interface PlaybackSnapshot {
  sceneIndex: number;
  actionIndex: number;
  consumedDiscussions: string[];
  sceneId?: string; // 此快照所属的场景；不匹配时丢弃
}

/**
 * 保存课程的播放状态。
 * 每个课程最多有一条播放状态记录。
 */
export async function savePlaybackState(
  stageId: string,
  snapshot: PlaybackSnapshot,
): Promise<void> {
  await db.playbackState.put({
    stageId,
    sceneIndex: snapshot.sceneIndex,
    actionIndex: snapshot.actionIndex,
    consumedDiscussions: snapshot.consumedDiscussions,
    sceneId: snapshot.sceneId,
    updatedAt: Date.now(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
}

/**
 * 加载课程的播放状态。
 * 如果没有保存的状态则返回 null。
 */
export async function loadPlaybackState(stageId: string): Promise<PlaybackSnapshot | null> {
  const record = await db.playbackState.get(stageId);
  if (!record) return null;

  return {
    sceneIndex: record.sceneIndex,
    actionIndex: record.actionIndex,
    consumedDiscussions: record.consumedDiscussions,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    sceneId: (record as any).sceneId as string | undefined,
  };
}

/**
 * 清除课程的播放状态（例如播放完成或停止时）。
 */
export async function clearPlaybackState(stageId: string): Promise<void> {
  await db.playbackState.delete(stageId);
}
