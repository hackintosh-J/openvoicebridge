
# OpenVoiceBridge

**离线、隐私优先的同声字幕（Live Captions）与 SRT 字幕生成器** —— 完全运行在浏览器端，基于 [transformers.js](https://github.com/xenova/transformers.js) 的 Whisper 推理。适合教室、会议、直播、播客剪辑与无障碍场景。

> 📦 **GitHub Pages 一键部署**：本工程无需服务器与后端。将仓库设置为 Pages（`/` 根目录）或使用自带的 GitHub Actions 工作流，即可发布到 `https://<你的用户名>.github.io/<仓库名>/`。

## ✨ 功能特性

- 🎙️ **实时麦克风字幕**：边说边出字；可选择 Tiny/Base/Small 等多种模型。
- 📁 **音/视频文件转写**：支持本地文件，生成带时间戳的逐句片段。
- ⤓ **导出 SRT**：一键导出标准 `.srt` 字幕文件。
- 🌐 **多语言识别**：Whisper 多语种模型，支持自动检测（也可手动指定）。
- 📦 **真 · 本地推理**：所有计算在你的设备完成；模型文件首次联网加载，随后缓存离线可用。
- 🧩 **PWA**：可“安装”为 App，离线访问与自动缓存核心资源。
- ♿ **无障碍友好**：高对比度、大字字幕、键盘快捷键（`K` 开始/停止）。
- 🔒 **零服务器**：不依赖任何私钥或第三方云 API；无需注册。

## 🧠 技术栈

- 推理引擎：`@xenova/transformers`（浏览器端 ONNX/WebGPU 推理）
- UI：纯原生 Web（HTML/CSS/JS），无需打包构建
- PWA：`manifest.webmanifest` + `sw.js`（缓存核心资源、模型运行时缓存）
- 部署：GitHub Pages（自带 Actions 工作流）

> 受限于 GitHub Pages 的默认安全策略（无跨源隔离），WASM 多线程不可用，首轮加载与推理速度可能低于原生；推荐在具备 WebGPU 的浏览器/设备上体验更佳。

## 🚀 快速开始（本地）

1. 克隆仓库后，使用任何静态服务器在本地启动：
   ```bash
   npx http-server -p 8080 .
   # 或者
   python3 -m http.server 8080
   ```
2. 打开 `http://localhost:8080/`。首次会自动加载模型文件（联网）。完成后可离线使用。

## ☁️ 部署到 GitHub Pages

1. 新建一个 **Public** 仓库（建议命名 `openvoicebridge`）。
2. 把本项目所有文件推送上去。
3. 确保启用 **Actions** 权限。仓库中新建 `Settings → Pages`，选择 **GitHub Actions** 作为发布来源。
4. 保持 `.github/workflows/pages.yml` 不变，首次触发后将自动部署成功。
5. 访问 `https://<你的用户名>.github.io/<仓库名>/` 即可。

> 你也可以直接在仓库 `Settings → Pages` 里选择 `Deploy from a branch`，把根目录 `/` 作为 Pages 来源，无需 Actions。

## 📁 目录结构

```
.
├── assets/                 # 图标与徽标
├── app.js                  # 主应用逻辑
├── index.html              # 页面骨架
├── styles.css              # 页面样式
├── srt.js                  # SRT 导出工具
├── utils.js                # 重采样、简单 VAD、小工具
├── sw.js                   # Service Worker
├── manifest.webmanifest    # PWA 清单
└── .github/workflows/pages.yml  # GitHub Pages 部署工作流
```

## 📌 使用建议

- **模型选择**：`whisper-tiny` 最快，适用于会议记录/辅助阅读；更高精度可使用 `base/small`（更耗内存/时间）。
- **离线使用**：第一次联网加载后，模型文件将被浏览器缓存。将网站“安装”为 PWA 后，断网也能继续使用。
- **硬件建议**：Apple Silicon 或支持 WebGPU 的设备效果更好；内存越大越稳。

## ⚠️ 重要声明

- 本项目旨在辅助沟通和无障碍，不构成医疗或法律意见。
- 识别与翻译结果可能存在错误；务必在关键场景中人工核对。

---

# OpenVoiceBridge (EN)

**Privacy-first, offline-capable live captions and SRT subtitle maker** — runs entirely in the browser using Whisper via [transformers.js](https://github.com/xenova/transformers.js). Ideal for classrooms, meetings, live events, podcast editing, and accessibility.

## Features
- Live microphone captions (Tiny/Base/Small models)
- Transcribe local audio/video files with timestamps
- Export standard `.srt`
- Multilingual recognition (auto/force language)
- 100% local inference (models cached after first use)
- Installable PWA, works offline
- Zero server & zero API keys

## Deploy to GitHub Pages
- Push this repo, enable Actions, keep `.github/workflows/pages.yml` as is.
- Or select "Deploy from a branch" → root `/` as Pages source.

## Disclaimer
Results are AI-generated and can contain mistakes. Always verify for critical uses.
