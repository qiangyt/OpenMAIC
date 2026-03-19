# 技能目录 (skills/)

> OpenClaw / ClawHub 技能定义

## 概览

本目录包含 OpenMAIC 的 OpenClaw 技能定义，用于在 OpenClaw Agent 中自动化 OpenMAIC 的设置和使用流程。

```
skills/
└── openmaic/
    ├── SKILL.md                    # 技能主文件
    └── references/
        ├── hosted-mode.md          # 托管模式指南
        ├── provider-keys.md        # 提供者密钥配置
        ├── startup-modes.md        # 启动模式选择
        ├── generate-flow.md        # 课堂生成流程
        └── clone.md                # 仓库克隆指南
```

## OpenMAIC 技能

### SKILL.md - 技能主文件

定义 OpenMAIC 技能的元数据和 SOP（标准操作流程）。

**前置数据 (Frontmatter)**:
```yaml
name: openmaic
description: Guided SOP for setting up and using OpenMAIC from OpenClaw
user-invocable: true
metadata: { "openclaw": { "emoji": "🏫" } }
```

**核心规则**:
- 一次只执行一个阶段
- 状态变更前必须确认
- 不假设 Agent 的模型/API 密钥会被 OpenMAIC 复用
- 不要求用户在聊天中粘贴 API 密钥
- 引导用户自己编辑本地配置文件

### SOP 阶段

| 阶段 | 说明 |
|------|------|
| 0. Choose Mode | 选择托管模式或本地模式 |
| 1. Clone Or Reuse | 克隆或复用现有仓库 |
| 2. Choose Startup | 选择启动模式 |
| 3. Configure Keys | 配置提供者密钥 |
| 4. Start And Verify | 启动并验证服务 |
| 5. Generate Classroom | 生成课堂 |

## 参考文档

### hosted-mode.md - 托管模式

适用于从 open.maic.chat 获取访问码的用户。

**特点**:
- 无需本地设置
- 使用 `Authorization: Bearer <access-code>` 认证
- 基础 URL: `https://open.maic.chat`
- 每日配额: 10 次生成

**流程**:
1. 从配置读取 `accessCode`
2. 验证连接 (`GET /api/health`)
3. 按标准流程生成课堂

### provider-keys.md - 提供者密钥配置

**关键边界**: OpenMAIC 生成不自动复用 OpenClaw Agent 的模型或 API 密钥。

**推荐配置路径**:

1. **最低门槛设置**:
   ```env
   ANTHROPIC_API_KEY=sk-ant-...
   ```

2. **更好的速度/成本平衡**:
   ```env
   GOOGLE_API_KEY=...
   DEFAULT_MODEL=google:gemini-3-flash-preview
   ```

3. **复用现有提供者**:
   ```env
   OPENAI_API_KEY=sk-...
   DEFAULT_MODEL=openai:gpt-4o-mini
   ```

**可选功能**:

| 功能 | 环境变量 |
|------|---------|
| 网络搜索 | `TAVILY_API_KEY` |
| 图片生成 | `IMAGE_SEEDREAM_API_KEY` 等 |
| 视频生成 | `VIDEO_SEEDANCE_API_KEY` 等 |
| TTS | `TTS_OPENAI_API_KEY` 等 |

### startup-modes.md - 启动模式

**推荐顺序**:

1. **开发模式** (推荐首选):
   ```bash
   pnpm dev
   ```
   - 最快反馈循环
   - 适合验证配置变更

2. **类生产模式**:
   ```bash
   pnpm build && pnpm start
   ```
   - 更接近生产环境
   - 启动较慢

3. **Docker Compose**:
   ```bash
   docker compose up --build
   ```
   - 更好的隔离
   - 最重、最慢

**健康检查**:
```bash
curl -fsS http://localhost:3000/api/health
```

### generate-flow.md - 课堂生成流程

**前置条件**:
- 仓库路径已确认
- 启动模式已选择
- OpenMAIC 服务健康
- 提供者密钥已配置

**生成请求**:
```json
POST {url}/api/generate-classroom
{
  "requirement": "Create an introductory classroom on quantum mechanics",
  "pdfContent": "...", // 可选
  "enableWebSearch": true, // 可选
  "enableImageGeneration": false, // 可选
  "agentMode": "default" // 可选
}
```

**轮询规则**:
- 保存 `jobId`、`pollUrl`、`pollIntervalMs`
- 不在任务进行中提交新任务
- 轮询间隔约 60 秒
- 状态变为 `succeeded` 或 `failed` 时停止

**可靠性规则**:
- 单次网络错误不重启任务
- 5xx 错误等待 60 秒后重试
- 单轮最多轮询 10 分钟
- 状态变化时才报告进度

### clone.md - 仓库克隆

**流程**:
1. 检查本地是否已存在 OpenMAIC
2. 存在则显示路径并询问是否复用
3. 不存在则确认后克隆

**命令**:
```bash
git clone https://github.com/THU-MAIC/OpenMAIC.git
cd OpenMAIC
pnpm install
```

## 技能配置

技能配置位于 `~/.openclaw/openclaw.json`:

```json
{
  "skills": {
    "entries": {
      "openmaic": {
        "enabled": true,
        "config": {
          "accessCode": "sk-xxx",     // 托管模式访问码
          "repoDir": "/path/to/OpenMAIC", // 本地仓库路径
          "url": "http://localhost:3000"  // 服务 URL
        }
      }
    }
  }
}
```

## 设计原则

1. **确认优先**: 状态变更前总是请求用户确认
2. **安全处理**: 不在聊天中请求或存储 API 密钥
3. **服务端配置**: 所有提供者配置在 OpenMAIC 服务端完成
4. **向后兼容**: 通过 `capabilities` 检测功能支持
