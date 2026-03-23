import Dexie, { type EntityTable } from 'dexie';
import type { Scene, SceneType, SceneContent, Whiteboard } from '@/lib/types/stage';
import type { Action } from '@/lib/types/action';
import type {
  SessionType,
  SessionStatus,
  SessionConfig,
  ToolCallRecord,
  ToolCallRequest,
} from '@/lib/types/chat';
import type { SceneOutline } from '@/lib/types/generation';
import type { UIMessage } from 'ai';
import { createLogger } from '@/lib/logger';

const log = createLogger('Database');

/**
 * 旧版快照类型，用于撤销/重做功能
 * 由 useSnapshotStore 使用
 */
export interface Snapshot {
  id?: number;
  index: number;
  slides: Scene[];
}

/**
 * MAIC 本地数据库
 *
 * 使用 IndexedDB 将所有用户数据存储在本地
 * - 不删除过期数据；所有数据永久存储
 * - 使用固定的数据库名称
 * - 支持多课程管理
 */

// ==================== 数据库表类型定义 ====================

/**
 * Stage 表 - 课程基本信息
 */
export interface StageRecord {
  id: string; // 主键
  name: string;
  description?: string;
  createdAt: number; // 时间戳
  updatedAt: number; // 时间戳
  language?: string;
  style?: string;
  currentSceneId?: string;
}

/**
 * Scene 表 - 场景/页面数据
 */
export interface SceneRecord {
  id: string; // 主键
  stageId: string; // 外键 -> stages.id
  type: SceneType;
  title: string;
  order: number; // 显示顺序
  content: SceneContent; // 以 JSON 存储
  actions?: Action[]; // 以 JSON 存储
  whiteboard?: Whiteboard[]; // 以 JSON 存储
  createdAt: number;
  updatedAt: number;
}

/**
 * AudioFile 表 - 音频文件（TTS）
 */
export interface AudioFileRecord {
  id: string; // 主键（audioId）
  blob: Blob; // 音频二进制数据
  duration?: number; // 时长（秒）
  format: string; // mp3、wav 等
  text?: string; // 对应的文本内容
  voice?: string; // 使用的语音
  createdAt: number;
  ossKey?: string; // 此音频 blob 的完整 CDN URL
}

/**
 * ImageFile 表 - 图片文件
 */
export interface ImageFileRecord {
  id: string; // 主键
  blob: Blob; // 图片二进制数据
  filename: string; // 原始文件名
  mimeType: string; // image/png、image/jpeg 等
  size: number; // 文件大小（字节）
  createdAt: number;
}

/**
 * ChatSession 表 - 聊天会话数据
 */
export interface ChatSessionRecord {
  id: string; // 主键（会话 ID）
  stageId: string; // 外键 -> stages.id
  type: SessionType;
  title: string;
  status: SessionStatus;
  messages: UIMessage[]; // JSON 安全的序列化消息
  config: SessionConfig;
  toolCalls: ToolCallRecord[];
  pendingToolCalls: ToolCallRequest[];
  createdAt: number;
  updatedAt: number;
  sceneId?: string;
  lastActionIndex?: number;
}

/**
 * PlaybackState 表 - 播放状态快照（每个课程最多一条）
 */
export interface PlaybackStateRecord {
  stageId: string; // 主键
  sceneIndex: number;
  actionIndex: number;
  consumedDiscussions: string[];
  updatedAt: number;
}

/**
 * StageOutlines 表 - 持久化大纲，用于刷新后恢复
 */
export interface StageOutlinesRecord {
  stageId: string; // 主键（外键 -> stages.id）
  outlines: SceneOutline[];
  createdAt: number;
  updatedAt: number;
}

/**
 * MediaFile 表 - AI 生成的媒体文件（图片/视频）
 */
export interface MediaFileRecord {
  id: string; // 复合键：`${stageId}:${elementId}`
  stageId: string; // 外键 → stages.id
  type: 'image' | 'video';
  blob: Blob; // 媒体二进制数据
  mimeType: string; // image/png、video/mp4
  size: number;
  poster?: Blob; // 视频缩略图 blob
  prompt: string; // 原始提示词（用于重试）
  params: string; // JSON 序列化的生成参数
  error?: string; // 如果设置，表示任务失败（blob 为空占位符）
  errorCode?: string; // 结构化错误代码（如 'CONTENT_SENSITIVE'）
  ossKey?: string; // 此媒体 blob 的完整 CDN URL
  posterOssKey?: string; // 海报 blob 的完整 CDN URL
  createdAt: number;
}

/**
 * GeneratedAgent 表 - AI 生成的智能体配置
 */
export interface GeneratedAgentRecord {
  id: string; // 主键：智能体 ID（如 "gen-abc123"）
  stageId: string; // 外键 -> stages.id
  name: string;
  role: string; // 'teacher' | 'assistant' | 'student'
  persona: string;
  avatar: string;
  color: string;
  priority: number;
  createdAt: number;
}

/** 构建 mediaFiles 的复合主键：`${stageId}:${elementId}` */
export function mediaFileKey(stageId: string, elementId: string): string {
  return `${stageId}:${elementId}`;
}

// ==================== 数据库定义 ====================

const DATABASE_NAME = 'MAIC-Database';
const _DATABASE_VERSION = 8;

/**
 * MAIC 数据库实例
 */
class MAICDatabase extends Dexie {
  // 表定义
  stages!: EntityTable<StageRecord, 'id'>;
  scenes!: EntityTable<SceneRecord, 'id'>;
  audioFiles!: EntityTable<AudioFileRecord, 'id'>;
  imageFiles!: EntityTable<ImageFileRecord, 'id'>;
  snapshots!: EntityTable<Snapshot, 'id'>; // 撤销/重做快照（旧版）
  chatSessions!: EntityTable<ChatSessionRecord, 'id'>;
  playbackState!: EntityTable<PlaybackStateRecord, 'stageId'>;
  stageOutlines!: EntityTable<StageOutlinesRecord, 'stageId'>;
  mediaFiles!: EntityTable<MediaFileRecord, 'id'>;
  generatedAgents!: EntityTable<GeneratedAgentRecord, 'id'>;

  constructor() {
    super(DATABASE_NAME);

    // 版本 1：初始模式
    this.version(1).stores({
      stages: 'id, updatedAt',
      scenes: 'id, stageId, order, [stageId+order]',
      audioFiles: 'id, createdAt',
      imageFiles: 'id, createdAt',
      snapshots: '++id',
      // 之前包含：messages, participants, discussions, sceneSnapshots
    });

    // 版本 2：移除未使用的表
    this.version(2).stores({
      stages: 'id, updatedAt',
      scenes: 'id, stageId, order, [stageId+order]',
      audioFiles: 'id, createdAt',
      imageFiles: 'id, createdAt',
      snapshots: '++id',
      // 删除已移除的表
      messages: null,
      participants: null,
      discussions: null,
      sceneSnapshots: null,
    });

    // 版本 3：添加 chatSessions 和 playbackState 表
    this.version(3).stores({
      stages: 'id, updatedAt',
      scenes: 'id, stageId, order, [stageId+order]',
      audioFiles: 'id, createdAt',
      imageFiles: 'id, createdAt',
      snapshots: '++id',
      chatSessions: 'id, stageId, [stageId+createdAt]',
      playbackState: 'stageId',
    });

    // 版本 4：添加 stageOutlines 表用于刷新后恢复
    this.version(4).stores({
      stages: 'id, updatedAt',
      scenes: 'id, stageId, order, [stageId+order]',
      audioFiles: 'id, createdAt',
      imageFiles: 'id, createdAt',
      snapshots: '++id',
      chatSessions: 'id, stageId, [stageId+createdAt]',
      playbackState: 'stageId',
      stageOutlines: 'stageId',
    });

    // 版本 5：添加 mediaFiles 表用于异步媒体生成
    this.version(5).stores({
      stages: 'id, updatedAt',
      scenes: 'id, stageId, order, [stageId+order]',
      audioFiles: 'id, createdAt',
      imageFiles: 'id, createdAt',
      snapshots: '++id',
      chatSessions: 'id, stageId, [stageId+createdAt]',
      playbackState: 'stageId',
      stageOutlines: 'stageId',
      mediaFiles: 'id, stageId, [stageId+type]',
    });

    // 版本 6：修复 mediaFiles 主键 — 使用复合键 stageId:elementId
    // 以防止跨课程冲突（gen_img_1 不是全局唯一的）
    this.version(6)
      .stores({
        stages: 'id, updatedAt',
        scenes: 'id, stageId, order, [stageId+order]',
        audioFiles: 'id, createdAt',
        imageFiles: 'id, createdAt',
        snapshots: '++id',
        chatSessions: 'id, stageId, [stageId+createdAt]',
        playbackState: 'stageId',
        stageOutlines: 'stageId',
        mediaFiles: 'id, stageId, [stageId+type]',
      })
      .upgrade(async (tx) => {
        const table = tx.table('mediaFiles');
        const allRecords = await table.toArray();
        for (const rec of allRecords) {
          const newKey = `${rec.stageId}:${rec.id}`;
          // 如果已迁移则跳过（幂等性）
          if (rec.id.includes(':')) continue;
          await table.delete(rec.id);
          await table.put({ ...rec, id: newKey });
        }
      });

    // 版本 7：为 mediaFiles 和 audioFiles 添加 ossKey 字段以支持 OSS 存储插件
    // 非索引可选字段 — Dexie 会透明处理这些字段。
    this.version(7).stores({
      stages: 'id, updatedAt',
      scenes: 'id, stageId, order, [stageId+order]',
      audioFiles: 'id, createdAt',
      imageFiles: 'id, createdAt',
      snapshots: '++id',
      chatSessions: 'id, stageId, [stageId+createdAt]',
      playbackState: 'stageId',
      stageOutlines: 'stageId',
      mediaFiles: 'id, stageId, [stageId+type]',
    });

    // 版本 8：添加 generatedAgents 表用于 AI 生成的智能体配置
    this.version(8).stores({
      stages: 'id, updatedAt',
      scenes: 'id, stageId, order, [stageId+order]',
      audioFiles: 'id, createdAt',
      imageFiles: 'id, createdAt',
      snapshots: '++id',
      chatSessions: 'id, stageId, [stageId+createdAt]',
      playbackState: 'stageId',
      stageOutlines: 'stageId',
      mediaFiles: 'id, stageId, [stageId+type]',
      generatedAgents: 'id, stageId',
    });
  }
}

// 创建数据库实例
export const db = new MAICDatabase();

// ==================== 辅助函数 ====================

/**
 * 初始化数据库
 * 在应用启动时调用
 */
export async function initDatabase(): Promise<void> {
  try {
    await db.open();
    // 请求持久化存储以防止浏览器在存储压力下清除 IndexedDB
    // （大型媒体 blob 可能触发 LRU 清理）
    void navigator.storage?.persist?.();
    log.info('Database initialized successfully');
  } catch (error) {
    log.error('Failed to initialize database:', error);
    throw error;
  }
}

/**
 * 清空数据库（可选）
 * 谨慎使用：删除所有数据
 */
export async function clearDatabase(): Promise<void> {
  await db.delete();
  log.info('Database cleared');
}

/**
 * 导出数据库内容（用于备份）
 */
export async function exportDatabase(): Promise<{
  stages: StageRecord[];
  scenes: SceneRecord[];
  chatSessions: ChatSessionRecord[];
  playbackState: PlaybackStateRecord[];
}> {
  return {
    stages: await db.stages.toArray(),
    scenes: await db.scenes.toArray(),
    chatSessions: await db.chatSessions.toArray(),
    playbackState: await db.playbackState.toArray(),
  };
}

/**
 * 导入数据库内容（用于恢复备份）
 */
export async function importDatabase(data: {
  stages?: StageRecord[];
  scenes?: SceneRecord[];
  chatSessions?: ChatSessionRecord[];
  playbackState?: PlaybackStateRecord[];
}): Promise<void> {
  await db.transaction(
    'rw',
    [db.stages, db.scenes, db.chatSessions, db.playbackState],
    async () => {
      if (data.stages) await db.stages.bulkPut(data.stages);
      if (data.scenes) await db.scenes.bulkPut(data.scenes);
      if (data.chatSessions) await db.chatSessions.bulkPut(data.chatSessions);
      if (data.playbackState) await db.playbackState.bulkPut(data.playbackState);
    },
  );
  log.info('Database imported successfully');
}

// ==================== 便捷查询函数 ====================

/**
 * 获取课程的所有场景
 */
export async function getScenesByStageId(stageId: string): Promise<SceneRecord[]> {
  return db.scenes.where('stageId').equals(stageId).sortBy('order');
}

/**
 * 删除课程及其所有相关数据
 */
export async function deleteStageWithRelatedData(stageId: string): Promise<void> {
  await db.transaction(
    'rw',
    [
      db.stages,
      db.scenes,
      db.chatSessions,
      db.playbackState,
      db.stageOutlines,
      db.mediaFiles,
      db.generatedAgents,
    ],
    async () => {
      await db.stages.delete(stageId);
      await db.scenes.where('stageId').equals(stageId).delete();
      await db.chatSessions.where('stageId').equals(stageId).delete();
      await db.playbackState.delete(stageId);
      await db.stageOutlines.delete(stageId);
      await db.mediaFiles.where('stageId').equals(stageId).delete();
      await db.generatedAgents.where('stageId').equals(stageId).delete();
    },
  );
}

/**
 * 获取课程的所有生成智能体
 */
export async function getGeneratedAgentsByStageId(
  stageId: string,
): Promise<GeneratedAgentRecord[]> {
  return db.generatedAgents.where('stageId').equals(stageId).toArray();
}

/**
 * 获取数据库统计信息
 */
export async function getDatabaseStats() {
  return {
    stages: await db.stages.count(),
    scenes: await db.scenes.count(),
    audioFiles: await db.audioFiles.count(),
    imageFiles: await db.imageFiles.count(),
    snapshots: await db.snapshots.count(),
    chatSessions: await db.chatSessions.count(),
    playbackState: await db.playbackState.count(),
    stageOutlines: await db.stageOutlines.count(),
    mediaFiles: await db.mediaFiles.count(),
    generatedAgents: await db.generatedAgents.count(),
  };
}
