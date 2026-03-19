# 迁移到后端数据库的难度分析

> 讨论日期：2026-03-19

## 背景

OpenMAIC 当前采用**纯前端存储架构**，所有用户数据都保存在浏览器的 IndexedDB 中。本文档探讨将数据迁移到后端数据库的可行性、难度和实施方案。

## 现状分析

### 当前存储架构

项目采用**混合存储架构**的雏形：

| 存储位置 | 数据 | 用途 |
|----------|------|------|
| IndexedDB (前端) | stages, scenes, mediaFiles, chats 等 | 本地编辑、播放 |
| 文件系统 JSON (后端) | classroom, generation-job | 分享链接、异步生成任务 |

相关文件：
- `lib/utils/database.ts` - IndexedDB 定义
- `lib/utils/stage-storage.ts` - 课程数据存取
- `lib/server/classroom-storage.ts` - 后端文件存储
- `lib/server/classroom-job-store.ts` - 任务队列存储

### 已有后端存储

后端已实现基于文件系统的存储：

```
data/
├── classrooms/          # 分享的课堂数据
│   └── {id}.json
└── classroom-jobs/      # 异步生成任务
    └── {jobId}.json
```

这意味着迁移不是从零开始，而是**统一和扩展**现有后端存储。

## 目标架构

```
┌─────────────────┐     API      ┌──────────────────┐
│   前端 Zustand  │ ◄────────► │   PostgreSQL     │
│   (内存缓存)    │             │   (结构化数据)   │
└─────────────────┘             └──────────────────┘
        │                               │
        │                               ▼
        │                        ┌──────────────────┐
        │                        │     MinIO        │
        │                        │  (对象存储 S3)   │
        │                        │  媒体 Blob 文件  │
        │                        └──────────────────┘
        ▼
   离线可用 (可选)
   IndexedDB 缓存
```

### 技术选型

| 组件 | 方案 | 说明 |
|------|------|------|
| **数据库** | PostgreSQL | 结构化数据存储（课程、场景、聊天等） |
| **对象存储** | MinIO | S3 兼容，存储媒体 Blob（图片、视频、音频） |
| **认证** | 简单认证 | Email/Password 或第三方 OAuth（如 GitHub） |
| **ORM** | Prisma / Drizzle | 类型安全的数据库操作 |

### 架构优势

- **MinIO**：自托管、S3 兼容、无云服务商锁定
- **PostgreSQL**：成熟稳定、JSONB 支持灵活存储
- **简单认证**：轻量级，可根据需要扩展

## 迁移难度评估

### 1. 数据访问层抽象 — 中等难度

**当前问题**：前端直接操作 IndexedDB

```typescript
// 当前：直接导入 db
import { db } from '@/lib/utils/database';
await db.stages.put({ ... });
```

**解决方案**：创建统一的数据访问接口

```typescript
// 新增：抽象层
interface DataStore {
  saveStage(stage: Stage): Promise<void>;
  loadStage(id: string): Promise<Stage | null>;
  // ...
}

// 前端实现
class IndexedDBStore implements DataStore { ... }

// 后端实现
class APIStore implements DataStore {
  async saveStage(stage) {
    await fetch('/api/stages', { method: 'POST', body: JSON.stringify(stage) });
  }
}
```

**工作量**：约 3-5 天

### 2. API 设计 — 中等难度

已有部分 API（`/api/classroom`），需要扩展：

| 需要新增的 API | 说明 |
|---------------|------|
| `POST /api/stages` | 创建/更新课程 |
| `GET /api/stages/:id` | 获取课程 |
| `GET /api/stages/:id/scenes` | 获取场景列表 |
| `POST /api/media` | 上传媒体文件 |
| `GET /api/media/:id` | 获取媒体文件 |

**工作量**：约 5-7 天

### 3. 媒体文件存储 — 中等难度

**问题**：当前 Blob 存储在 IndexedDB 中（可能几百 MB）

**选定方案**：MinIO（S3 兼容对象存储）

```typescript
// MinIO 客户端示例
import { Client } from 'minio';

const minioClient = new Client({
  endPoint: process.env.MINIO_ENDPOINT!,
  port: parseInt(process.env.MINIO_PORT || '9000'),
  useSSL: true,
  accessKey: process.env.MINIO_ACCESS_KEY!,
  secretKey: process.env.MINIO_SECRET_KEY!,
});

// 上传媒体文件
await minioClient.putObject('media', `${stageId}/${fileId}`, blob);

// 获取预签名 URL（用于前端下载）
const url = await minioClient.presignedGetObject('media', `${stageId}/${fileId}`, 3600);
```

**MinIO 优势**：
- S3 兼容 API，可与 AWS SDK 互操作
- 自托管，无云服务商锁定
- 支持分布式部署

**工作量**：约 3-5 天

### 4. 认证与授权 — 必选，中等难度

当前无用户系统，需要：

- [ ] 用户注册/登录（Email/Password 或 OAuth）
- [ ] Session/JWT 管理
- [ ] 数据权限控制（我的 vs 别人的课程）

**推荐方案**：简单认证

```typescript
// 方案 1: 基于 Session 的认证（使用 iron-session 或类似库）
// 方案 2: 基于 JWT 的认证（使用 jose 库）
// 方案 3: 第三方 OAuth（GitHub/Google 登录）
```

由于是自托管部署，推荐使用轻量级方案，避免依赖外部服务。

**工作量**：约 3-5 天

### 5. 实时同步与冲突处理 — 可选，高难度

如果需要多设备实时同步：

```
设备 A 编辑 ──► 服务器 ──► 推送到设备 B
                    │
                    ▼
              冲突解决策略
```

**技术选型**：
- WebSocket / Server-Sent Events
- CRDT / OT 算法

**工作量**：约 10-15 天

## 总体工作量估算

| 阶段 | 任务 | 工作量 |
|------|------|--------|
| **Phase 1** | 数据访问层抽象 + 基础 API | 1 周 |
| **Phase 2** | 用户认证系统 | 1 周 |
| **Phase 3** | 媒体文件迁移到对象存储 | 1 周 |
| **Phase 4** | 前端改造（使用 API 而非 IndexedDB） | 1 周 |
| **Phase 5** | 数据迁移工具（IndexedDB → 后端） | 3 天 |
| **可选** | 离线支持（Service Worker） | 1 周 |
| **可选** | 实时同步（WebSocket + CRDT） | 2 周 |

**总计**：约 **4-6 周**（核心功能）

## 推荐技术栈

| 层面 | 方案 | 说明 |
|------|------|------|
| **数据库** | PostgreSQL | 可使用 Docker 部署或云服务（Neon、Supabase） |
| **ORM** | Prisma 或 Drizzle | Prisma 成熟、Drizzle 更轻量 |
| **对象存储** | MinIO | S3 兼容，自托管 |
| **认证** | 简单认证 | iron-session / jose + OAuth（可选） |
| **API** | Next.js API Routes | 复用现有架构 |

### Docker Compose 部署示例

```yaml
version: '3.8'
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: maic
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: maic
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"

  minio:
    image: minio/minio
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: ${MINIO_ACCESS_KEY}
      MINIO_ROOT_PASSWORD: ${MINIO_SECRET_KEY}
    volumes:
      - minio_data:/data
    ports:
      - "9000:9000"
      - "9001:9001"

volumes:
  postgres_data:
  minio_data:
```

## 主要风险

1. **用户体验变化**：从"即时响应"变为"网络延迟"
2. **离线能力丧失**：除非实现 Service Worker + 同步队列
3. **数据迁移**：现有用户数据如何迁移？
4. **成本增加**：数据库 + 对象存储 + 认证服务

## 渐进式迁移建议

推荐采用**混合模式**，逐步迁移：

```
Phase 1: 保持 IndexedDB，但增加云端备份功能
    ↓
Phase 2: 用户登录后，数据同步到云端
    ↓
Phase 3: 新用户默认使用云端存储
    ↓
Phase 4: 完全迁移，IndexedDB 作为离线缓存
```

这样既能保持现有用户体验，又能逐步实现后端存储。

## 数据库表设计草案

### users

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(100),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### stages (课程)

```sql
CREATE TABLE stages (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  language VARCHAR(10),
  style VARCHAR(50),
  current_scene_id UUID,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### scenes (场景)

```sql
CREATE TABLE scenes (
  id UUID PRIMARY KEY,
  stage_id UUID REFERENCES stages(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL,
  title VARCHAR(255),
  order_index INT NOT NULL,
  content JSONB,
  actions JSONB,
  whiteboard JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_scenes_stage_id ON scenes(stage_id);
```

### media_files (媒体文件)

```sql
CREATE TABLE media_files (
  id UUID PRIMARY KEY,
  stage_id UUID REFERENCES stages(id) ON DELETE CASCADE,
  type VARCHAR(10) CHECK (type IN ('image', 'video', 'audio')),
  storage_key VARCHAR(500) NOT NULL,  -- MinIO key: {stageId}/{fileId}
  mime_type VARCHAR(100),
  size BIGINT,
  poster_key VARCHAR(500),  -- 视频缩略图 key
  prompt TEXT,              -- 生成提示词（AI 生成时）
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_media_stage_id ON media_files(stage_id);
CREATE INDEX idx_media_type ON media_files(type);
```

### chat_sessions (聊天会话)

```sql
CREATE TABLE chat_sessions (
  id UUID PRIMARY KEY,
  stage_id UUID REFERENCES stages(id) ON DELETE CASCADE,
  scene_id UUID,
  type VARCHAR(50),
  title VARCHAR(255),
  status VARCHAR(20),
  messages JSONB,
  config JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_chat_stage_id ON chat_sessions(stage_id);
```

## 下一步行动

1. [x] 确定技术栈：PostgreSQL + MinIO + 简单认证
2. [ ] 搭建本地开发环境（Docker Compose）
3. [ ] 设计数据库 Schema（Prisma/Drizzle）
4. [ ] 实现用户认证 API
5. [ ] 实现阶段管理 API
6. [ ] 实现 MinIO 媒体上传/下载
7. [ ] 前端数据访问层抽象
8. [ ] 数据迁移工具（IndexedDB → 后端）

## 环境变量配置

```bash
# PostgreSQL
DATABASE_URL="postgresql://maic:password@localhost:5432/maic"

# MinIO
MINIO_ENDPOINT="localhost"
MINIO_PORT="9000"
MINIO_ACCESS_KEY="minioadmin"
MINIO_SECRET_KEY="minioadmin"
MINIO_USE_SSL="false"
MINIO_BUCKET="media"

# Auth (iron-session)
SESSION_SECRET="your-secret-key-at-least-32-characters"
```
