/**
 * 聊天存储 - 将聊天会话持久化到 IndexedDB
 *
 * 独立于课程/场景存储周期。
 * 处理序列化、截断和批量写入。
 */

import type { ChatSession, ChatMessageMetadata, SessionStatus } from '@/lib/types/chat';
import type { UIMessage } from 'ai';
import { db, type ChatSessionRecord } from './database';

/** 每个会话的最大消息数，避免 IndexedDB 膨胀 */
const MAX_MESSAGES_PER_SESSION = 200;

/**
 * 将课程的聊天会话保存到 IndexedDB。
 * - 活动会话保存为 'interrupted' 状态（刷新后流式上下文丢失）
 * - pendingToolCalls 被清除（仅运行时状态）
 * - 消息截断到 MAX_MESSAGES_PER_SESSION
 */
export async function saveChatSessions(stageId: string, sessions: ChatSession[]): Promise<void> {
  if (!sessions || sessions.length === 0) {
    // 如果为空，删除此课程的所有会话
    await db.chatSessions.where('stageId').equals(stageId).delete();
    return;
  }

  const records: ChatSessionRecord[] = sessions.map((session) => ({
    id: session.id,
    stageId,
    type: session.type,
    title: session.title,
    // 将活动会话标记为 interrupted（刷新后流式上下文丢失）
    status: (session.status === 'active' ? 'interrupted' : session.status) as SessionStatus,
    // 截断消息并移除不可序列化的数据
    messages: session.messages.slice(-MAX_MESSAGES_PER_SESSION),
    config: session.config,
    toolCalls: session.toolCalls,
    pendingToolCalls: [], // 清除运行时状态
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    sceneId: session.sceneId,
    lastActionIndex: session.lastActionIndex,
  }));

  await db.transaction('rw', db.chatSessions, async () => {
    // 删除此课程的旧会话，然后批量插入新会话
    await db.chatSessions.where('stageId').equals(stageId).delete();
    await db.chatSessions.bulkPut(records);
  });
}

/**
 * 从 IndexedDB 加载课程的聊天会话。
 * 返回按 createdAt 排序的会话。
 */
export async function loadChatSessions(stageId: string): Promise<ChatSession[]> {
  const records = await db.chatSessions.where('stageId').equals(stageId).sortBy('createdAt');

  return records.map((record) => ({
    id: record.id,
    type: record.type,
    title: record.title,
    status: record.status,
    messages: record.messages as UIMessage<ChatMessageMetadata>[],
    config: record.config,
    toolCalls: record.toolCalls,
    pendingToolCalls: record.pendingToolCalls,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    sceneId: record.sceneId,
    lastActionIndex: record.lastActionIndex,
  }));
}

/**
 * 删除课程的所有聊天会话。
 */
export async function deleteChatSessions(stageId: string): Promise<void> {
  await db.chatSessions.where('stageId').equals(stageId).delete();
}
