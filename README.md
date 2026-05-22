# 🏷️ AI 智能标签分类 — Chrome 扩展

> 自动分析网页内容，调用大模型生成多维度智能标签，帮助高效管理浏览信息。

![version](https://img.shields.io/badge/version-1.0.0-blue)
![manifest](https://img.shields.io/badge/Manifest-V3-brightgreen)
![license](https://img.shields.io/badge/license-MIT-green)

---

## 📸 功能预览

| 弹窗主界面 | AI 标签生成 | 设置页 |
|-----------|------------|-------|
| 显示网页标题/URL | 5 维度标签 chips | API Key / 主题配置 |
| 自动/手动抓取 | 双击编辑 / × 删除 / + 新增 | 加密存储 / 连接测试 |
| 一键保存 + 历史回填 | 自动保存 500ms 防抖 | 深色/浅色/跟随系统 |

---

## ✨ 核心功能

- **网页内容智能抓取** — 自动提取正文核心文本，过滤广告/导航/弹窗
- **AI 多维度标签** — 对接 LLM API，生成 5 个标准化维度标签
  - 📂 内容领域 — 科技、教育、金融……
  - 🎯 用途场景 — 学习参考、工作文档、休闲阅读……
  - 📊 难度等级 — 入门 / 进阶 / 专业
  - 🔑 核心关键词 — AI、机器学习、JavaScript……
  - 🏷️ 内容属性 — 教程、新闻、分析、工具……
- **标签编辑** — 双击编辑、点击删除、手动新增、智能去重
- **自动保存** — 编辑后 500ms 防抖自动写入 `chrome.storage.local`
- **历史管理** — 按时间倒序查看、点击回填、清空全部
- **多模型兼容** — 支持 DeepSeek / OpenAI / 通义千问等兼容格式的 API
- **主题自适应** — 浅色/深色/跟随系统三种模式
- **零外部依赖** — 原生 HTML + CSS3 + JavaScript，即装即用

---

## 🚀 快速开始

### 前提条件

- Chrome 浏览器 ≥ 100 或 Edge ≥ 100
- 一个兼容 OpenAI 格式的 LLM API Key（[DeepSeek](https://platform.deepseek.com/) / [OpenAI](https://platform.openai.com/) / 通义千问等）

### 安装（开发者模式）

```bash
# 1. 下载或克隆本项目
git clone https://github.com/your-username/ai-tag-extension.git
cd ai-tag-extension

# 2. 打开 Chrome 扩展管理页
chrome://extensions

# 3. 开启右上角「开发者模式」

# 4. 点击「加载已解压扩展」，选择项目根目录
```

### 配置 API

1. 右键插件图标 → **选项**
2. 填写：
   - **接口地址** — 例如 `https://api.deepseek.com/chat/completions`
   - **API Key** — 你的密钥（将加密存储在本地）
   - **模型名称** — 例如 `deepseek-chat` / `gpt-4o-mini`
3. 点击 **测试连接** 验证配置
4. 点击 **保存设置**

### 使用

1. 访问任意网页
2. 点击浏览器工具栏的插件图标
3. 弹窗自动抓取网页标题和正文
4. AI 自动分析内容并生成 5 维度标签
5. 可双击编辑标签 / × 删除 / + 新增
6. 标签自动保存 — 下次打开同一网页时直接加载

---

## ⚙️ 配置说明

### 设置页选项

| 选项 | 说明 | 默认值 |
|------|------|--------|
| 接口地址 | LLM API 端点（OpenAI 兼容格式） | — |
| API Key | 你的密钥（加密存储） | — |
| 模型名称 | 使用的模型标识 | deepseek-chat |
| 自动抓取 | 打开弹窗时自动获取网页内容 | ✅ 开启 |
| 自动 AI 生成 | 抓取后自动调用 AI 生成标签 | ✅ 开启 |
| 自定义规则 | 附加 Prompt 规则，追加到 AI 系统提示 | — |
| 外观主题 | 浅色/深色/跟随系统 | 跟随系统 |

### 标签维度

| 维度 | 单/多选 | 示例 |
|------|---------|------|
| 内容领域 | 多选 | 科技、教育、金融、医疗、设计 |
| 用途场景 | 多选 | 学习参考、工作文档、休闲阅读 |
| 难度等级 | **单选** | 入门、进阶、专业 |
| 核心关键词 | 多选 | AI、机器学习、JavaScript |
| 内容属性 | 多选 | 教程、新闻、分析、工具、报告 |

---

## 📁 项目结构

```
ai-tag-extension/
├── manifest.json              # Manifest V3 扩展声明
├── icons/                     # 插件图标（16/48/128）
├── lib/
│   ├── constants.js           # 全局常量与维度定义
│   ├── encrypt.js             # API Key 加解密（XOR + Base64）
│   └── storage.js             # Chrome storage.local 封装
├── popup/
│   ├── popup.html             # 弹窗界面
│   ├── popup.css              # 弹窗样式（含深色/浅色主题）
│   └── popup.js               # 弹窗主逻辑
├── options/
│   ├── options.html           # 设置页界面
│   ├── options.css            # 设置页样式
│   └── options.js             # 配置管理逻辑
├── background/
│   └── service-worker.js      # Service Worker（API 代理 + 内容注入）
├── content/
│   └── content.js             # 内容脚本（正文提取）
├── docs/                      # 文档
└── README.md
```

### 分层说明

| 层 | 文件 | 职责 |
|----|------|------|
| **UI 层** | `popup/`、`options/` | 用户交互界面，纯原生实现 |
| **逻辑层** | `popup/popup.js`、`options/options.js` | 状态管理、事件处理、API 调用编排 |
| **服务层** | `background/service-worker.js` | 跨域请求代理、LLM 调用、内容脚本注入 |
| **数据层** | `lib/storage.js`、`lib/encrypt.js` | Chrome storage 读写、敏感数据加密 |
| **采集层** | `content/content.js` | 网页正文智能提取与净化 |
| **配置层** | `lib/constants.js` | 全局常量集中管理 |

---

## 🔒 安全说明

- **权限最小化** — 仅申请 `storage` / `activeTab` / `scripting` 三个必要权限
- **API Key 加密** — 使用 XOR + Base64 混淆后存储于 `chrome.storage.local`（沙盒隔离）
- **无数据外泄** — 所有数据仅存于本地 Chrome 存储，不经过第三方服务器
- **内容注入** — 仅当用户点击插件时临时注入，不持久驻留

---

## 🧪 本地开发

本项目为零外部依赖的原生应用，无需 `npm install` 或构建步骤。

```bash
# 验证 JavaScript 语法
node --check --input-type=module < popup/popup.js
node --check --input-type=module < background/service-worker.js

# 所有文件语法检查
for f in lib/*.js popup/popup.js options/options.js background/service-worker.js; do
  [ "$f" = "content/content.js" ] && node -e "new Function(require('fs').readFileSync('$f','utf8'))" || node --check --input-type=module < "$f"
done
```

### 打包为 crx

1. Chrome 扩展管理页 → 点击插件 **「打包」**
2. 选择项目根目录作为扩展目录
3. 生成 `.crx` 文件和 `.pem` 私钥文件（妥善保管 `.pem`）
4. 或使用命令行：`chrome --pack-extension=./ai-tag-extension`

---

## 🔄 数据流

```
┌──────────────┐     ┌────────────────┐     ┌──────────────┐
│  用户点击图标  │ ──→ │  Popup 打开     │ ──→ │  background   │
└──────────────┘     └────────────────┘     │  service worker│
                     │ 显示加载动画       │     └──────┬───────┘
                     └────────────────┘            │
                                                   │ chrome.scripting
                                                   │ .executeScript
                                                   ▼
                                            ┌──────────────┐
                                            │  content.js   │
                                            │  注入到当前页  │
                                            └──────┬───────┘
                                                   │ 提取标题/URL/正文
                                                   │
                                                   ▼
                                            ┌──────────────┐
                                            │  Popup 展示   │
                                            │  网页基础信息  │
                                            └──────┬───────┘
                                                   │ autoTag=on?
                                                   ▼
                                            ┌──────────────┐
                                            │  background   │
                                            │  调 LLM API   │
                                            └──────┬───────┘
                                                   │ 返回 5 维度标签
                                                   ▼
                                            ┌──────────────┐
                                            │  渲染标签     │
                                            │  可编辑/保存  │
                                            └──────┬───────┘
                                                   │ auto-save
                                                   ▼
                                            ┌──────────────┐
                                            │  chrome.storage
                                            │  .local       │
                                            └──────────────┘
```

---

## 📄 许可证

MIT License — 可自由使用、修改、分发。

---

*文档部分内容由 AI 辅助生成*
