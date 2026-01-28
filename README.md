# 医疗智能体演示系统（Medical Agent）

这是一个面向“医生助理/医生/患者”三种角色的医疗智能体演示项目，核心目标是把“对话、患者画像、记忆（可检索事实）、知识库、医生会诊（演示版支付）”串成一条可跑通的闭环。

## 一句话看懂它能做什么
- 患者端：用微信风格界面与“医生助理”对话，系统会自动追问关键信息，并把对话要点沉淀为可检索的记忆
- 医生助理端：维护患者档案、导入病历文本、维护知识库、查看患者画像/记忆、生成医生回复建议
- 医生端：只展示“已支付会诊”的患者会话，医生可直接发消息并结束会话
- 支付（演示版）：患者点击支付链接即视为支付成功，并自动跳转回会话

## 技术栈与运行形态
- 前端/服务端：Next.js 16（App Router）+ React 19
- 数据：SQLite（better-sqlite3，本地文件持久化）
- 模型：智谱 AI（ZhipuAI SDK）
- 样式：Tailwind CSS
- 构建：Next.js standalone（便于 Docker/服务器部署）

## 快速开始（Windows）

### 1）准备环境变量
本项目最少需要配置智谱 API Key：
- ZHIPU_API_KEY：智谱 API Key（必填，否则模型相关能力不可用）

可选环境变量：
- NEXT_PUBLIC_DOCTOR_NAME：页面展示的医生名称（不填默认“张医生”）
- DOCTOR_NAME：服务端使用的医生名称（不填默认“张医生”）
- DB_PATH：SQLite 数据库文件路径（不填默认 data/local.db）

PowerShell 示例（只对当前终端生效）：
```powershell
$env:ZHIPU_API_KEY="你的Key"
$env:NEXT_PUBLIC_DOCTOR_NAME="张医生"
```

### 2）安装依赖并启动
```powershell
npm install
npm run dev
```

浏览器访问：
- http://localhost:3000

### 3）可选：生成演示数据
项目内置了一个简单的种子脚本，会清空 data/local.db 并写入 3 个演示患者：
```powershell
node scripts/seed-demo.js
```

## 入口页面与角色说明
首页：[page.tsx](file:///e:/web/yiban2/medical-agent/src/app/page.tsx)
- /patient：患者端入口（微信风格“会话列表” + 进入单个会话）
- /assistant：医生助理端入口（患者管理/导入/知识库/辅助建议等）
- /doctor：医生端入口（仅已支付会诊患者可见）

对应路由文件：
- 患者端列表：[page.tsx](file:///e:/web/yiban2/medical-agent/src/app/patient/page.tsx)
- 患者端会话页：[page.tsx](file:///e:/web/yiban2/medical-agent/src/app/patient/chat/%5BpatientId%5D/page.tsx)
- 医生助理页：[page.tsx](file:///e:/web/yiban2/medical-agent/src/app/assistant/page.tsx)
- 医生页：[page.tsx](file:///e:/web/yiban2/medical-agent/src/app/doctor/page.tsx)

## 数据存储（SQLite 表设计）
数据库初始化逻辑集中在：[db.ts](file:///e:/web/yiban2/medical-agent/src/lib/db.ts)

### patients（患者档案）
- id：文本主键
- name/age/gender/condition：基础信息
- persona：患者画像（模型根据对话/导入内容更新）
- created_at：创建时间

### chat_messages（完整聊天记录，用于界面展示）
- id：自增主键
- patient_id：关联患者
- role：user / ai / assistant / doctor
- content：消息内容
- created_at：创建时间

### memories（记忆库：用于检索的“要点/事实”）
- id：自增主键
- patient_id：关联患者
- content：抽取后的要点
- embedding：向量（JSON 字符串）
- source：patient / doctor / ai / import 等来源
- created_at：创建时间

### knowledge_base（知识库：用于行政/闲聊类问答）
- id：自增主键
- content：知识条目
- embedding：向量（JSON 字符串）
- category：分类（默认 general）
- created_at：创建时间

### doctor_consultations（医生会诊状态机）
- id：自增主键
- patient_id：关联患者
- status：pending / paid / ended
- fee_cents：费用（分）
- token：支付 token（唯一）
- trigger：ai / manual（触发来源）
- created_at / paid_at / ended_at：时间字段

## 核心业务流程（当前演示版实现）

### 1）患者发消息 → 医生助理追问采集 → 记忆沉淀
入口组件：[PatientWeChatChat.tsx](file:///e:/web/yiban2/medical-agent/src/components/patient/PatientWeChatChat.tsx)
- 患者输入消息后，会调用服务端动作 processUserMessage
- 系统会根据意图做分流：
  - 病情咨询：生成“问诊信息采集式回复”（追问 3~6 个关键问题）
  - 行政/闲聊：从知识库检索并生成回复
- 无论哪种分支，都会把“对话要点”抽取为记忆写入 memories，便于后续检索与医生辅助

对应服务端逻辑：[actions.ts](file:///e:/web/yiban2/medical-agent/src/app/actions.ts)
- processUserMessage：对话主入口（意图识别、写入 chat_messages、写入 memories、生成回复）
- extractKeywords / getEmbedding / updatePersona 等模型调用封装在：[ai.ts](file:///e:/web/yiban2/medical-agent/src/lib/ai.ts)

### 2）知识库问答（行政/闲聊分支）
实现要点（位于 actions.ts）：
- 从 knowledge_base 全量取出后，基于用户消息向量做相似度排序
- 做阈值过滤（避免无关匹配）后取 Top 条目拼接上下文
- 调用模型生成最终回答并写回 chat_messages

### 3）医生会诊（演示版“点击即支付”）
触发方式（位于 actions.ts）：
- 当患者消息命中“请求医生/会诊”等特征时，系统会生成支付链接 /patient/pay/{token}
- 支付链接会作为一条系统消息写入 chat_messages（患者端可点击）

支付回调（演示版自动支付）：
- 路由处理：[route.ts](file:///e:/web/yiban2/medical-agent/src/app/patient/pay/%5Btoken%5D/route.ts)
- 行为：
  - 根据 token 把 doctor_consultations 状态更新为 paid
  - 写入“支付成功，已接入医生会诊”消息到 chat_messages
  - 刷新相关页面缓存并重定向回患者会话页（带时间戳参数，避免旧内容停留）

医生端可见性：
- 医生端页面只查询 status=paid 的会诊记录：[getPaidDoctorConsultPatients](file:///e:/web/yiban2/medical-agent/src/app/actions.ts)
- 医生端 UI：[DoctorPortal.tsx](file:///e:/web/yiban2/medical-agent/src/components/doctor/DoctorPortal.tsx)
  - 轮询刷新会话与记忆（便于演示“支付后自动出现”与“对话实时更新”）
  - 支持发送医生消息与结束会话

### 4）导入病历 → 画像更新 → 记忆沉淀
医生助理端导入入口在 DoctorDashboard 内（患者详情/导入标签页）：
- UI：[DoctorDashboard.tsx](file:///e:/web/yiban2/medical-agent/src/components/doctor/DoctorDashboard.tsx)
- 动作：[importPatientData](file:///e:/web/yiban2/medical-agent/src/app/actions.ts)
  - 抽取要点写入 memories
  - 更新 patients.persona

## 本次对话改动梳理（与演示支付链路相关）
- 演示支付策略：患者点击 /patient/pay/{token} 即视为支付成功并自动跳转回会话
- 为避免“渲染阶段触发页面刷新”的 Next.js 限制，支付确认逻辑使用 Route Handler 执行，并在此处统一刷新页面缓存
- 为避免支付后仍显示旧聊天记录，患者会话页做了“初始历史同步到本地消息状态”的处理，并在部分页面增加轮询刷新
- 为避免开发环境出现 0.0.0.0 的跳转地址，支付回调里对 origin 做了安全兜底替换

## 目录结构（按职责划分）
- src/app：路由与服务端动作（核心业务入口）
- src/components：页面 UI 组件（患者端/医生助理端/医生端）
- src/lib：底层能力（数据库、模型、工具函数）
- data：SQLite 数据目录（默认会生成 data/local.db 以及 WAL 相关文件）
- scripts：本地脚本（例如种子数据）

## 部署说明
- Docker/服务器部署可参考：[DEPLOY.md](file:///e:/web/yiban2/medical-agent/DEPLOY.md)
- 本项目启用了 standalone 输出：[next.config.ts](file:///e:/web/yiban2/medical-agent/next.config.ts)

## 扩展设想（企业微信视角）
项目内还有一份偏“企业微信集成方案/工程化蓝图”的技术文档，更多用于规划与说明边界：
- [TECHNICAL_DOCS.md](file:///e:/web/yiban2/medical-agent/TECHNICAL_DOCS.md)
