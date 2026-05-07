# PRdovoiceAI — 语音合成插件

Premiere Pro CEP 面板，调用火山引擎豆包语音合成大模型，在 PR 时间线上直接生成并导入 AI 配音。

## 声明

本项目代码主要由 AI 辅助生成，可能存在非最优实现或令人困惑的逻辑。创作者仅因自身需求而创建此 Premiere Pro 配音工具，欢迎 PR 和 Issue，但请保持预期合理。

## 环境要求

- **Premiere Pro** 2026 (26.x) / 2024 (24.x)
- **Python** 3.10+
- **pip** 依赖：`fastapi` `uvicorn` `requests` `pydantic`
- **火山引擎 API Key**（[控制台获取](https://console.volcengine.com/speech/new)）

## 快速开始

### 1. 安装 Python 依赖

```powershell
pip install fastapi uvicorn requests pydantic
```

### 2. 配置 API Key

```powershell
# 从模板创建配置文件
copy server\config.example.json server\config.json
```

打开 `server/config.json`，填入你的 API Key：

```json
{
  "api_key": "YOUR_API_KEY_HERE",
  "output_dir": "D:/voice_cache"
}
```

| 字段 | 说明 |
|------|------|
| `api_key` | 火山引擎 TTS API Key，从 [火山引擎控制台](https://console.volcengine.com/speech/new) 获取 |
| `output_dir` | 音频缓存目录，需与 PR 插件设置页中的「共享文件夹」一致 |

#### 如何获取 API Key

1. 打开 [火山引擎语音技术控制台](https://console.volcengine.com/speech/new)
2. 注册/登录火山引擎账号
3. 在「语音技术」→「应用管理」中创建应用，记录 **AppID** 和 **Token**
4. 在「语音技术」→「API密钥」中生成 API Key

> `config.json` 已加入 `.gitignore`，不会被提交到 Git 仓库。

### 3. 启动后端

```powershell
cd D:\PRdovoiceAI_PR\server
uvicorn tts_server:app --host 0.0.0.0 --port 9527
```

看到 `Uvicorn running on http://0.0.0.0:9527` 表示后端就绪。

### 4. 安装插件到 PR

将 `PRdovoiceAI_PR` 整个文件夹放到：

```
C:\Program Files (x86)\Common Files\Adobe\CEP\extensions\PRdovoiceAI_PR
```

> 目录结构必须为 `PRdovoiceAI_PR/CSXS/manifest.xml`，否则 CEP 无法加载。

### 5. 打开 Premiere Pro

Window → Extensions → **PRdovoiceAI**

## 使用说明

### 连接后端

面板顶部输入 IP `127.0.0.1` 和端口 `9527`，点击 **连接**。

连接成功后显示音色数量，音色库列表自动加载。

### 添加剪辑

点击 **+ 添加一句话** 创建一个新剪辑。每个剪辑包含：

| 控件 | 说明 |
|------|------|
| 音色 | 从音色库中选择，切换后控件自动适配版本 |
| 文本 | 需要合成的文本内容 |
| `[#指令]` | 仅 **2.0** 音色。插入自然语言情感指令，如 `[#用悲伤的语气说]` |
| `{{2.0}}` | 仅 **2.0** 音色。插入 JSON additions（context_texts） |
| `{{1.0}}` | 仅 **1.0** 音色。插入 JSON audio_params（emotion + scale） |
| 情感 | 多情感音色可选；仅 neutral 的音色不显示此栏 |
| 强度 | 仅 **2.0** 音色。情感强度 1~5 |
| 特殊表达 | 仅支持 context_texts 的音色。预设哭泣/喘息/耳语等 |
| 语速 | -50（0.5x）~ 100（2.0x） |
| 尾停 | 句尾静音时长 0~30000ms |

### 1.0 与 2.0 音色的区别

| 能力 | 1.0 | 2.0 |
|------|:--:|:--:|
| 基础情感 | ✅ | ✅ |
| 情感强度 1~5 | ❌ | ✅ |
| `[#指令]` 自然语言指令 | ❌ | ✅ |
| 特殊表达（哭泣/喘息等） | ❌ | ✅ |
| 语速调节 | ✅ | ✅ |
| 尾停控制 | ✅ | ✅ |
| 情感注入方式 | `audio_params.emotion` | `audio_params.emotion` + `emotion_scale` |

> 面板会根据所选音色的 `version` 和 `capabilities` 自动显隐对应控件。

### 生成音频

- **🎬 生成全部**：生成所有待生成剪辑
- **▶ 生成选中**：只生成勾选了 checkbox 的剪辑
- **🔄 重新生成**：重新生成单个剪辑

### 导入 PR 时间线

生成完成的剪辑点击 **📥 导入PR时间线**，音频会自动插入到当前序列的音频轨上。

> 需要当前有激活的序列，且序列中有至少一条音频轨。

### 项目保存 / 打开

- **保存**：将当前所有剪辑（文本、音色、情感、语速等）存为 `.voicelab` 文件
- **打开**：恢复之前保存的项目，所有剪辑状态重置为"待生成"
- **新建**：清空当前项目

### 设置

| 设置项 | 说明 |
|--------|------|
| 共享文件夹 | 后端音频输出目录，需与 `config.json` 中 `output_dir` 一致 |
| 导入到播放头位置 | 勾选后从 CTI 位置开始插入；不勾选从时间线起点开始 |
| 默认音色 / 情感 / 语速 / 尾停 | 新建剪辑时的默认值 |

### 从 SRT/TXT 导入

点击 **从SRT/TXT导入**，选择 SRT 字幕或 TXT 文本文件，自动按行/段落拆分为多个剪辑。

## 故障排查

### 面板不出现

1. 确认目录结构为 `CSXS/manifest.xml`
2. 确认 `manifest.xml` 中 Host Version 为 `"14.0"`，RequiredRuntime 为 `"12.0"`
3. 完全退出 PR 后重新启动

### 连接失败

- 确认后端已启动：浏览器访问 `http://127.0.0.1:9527/health`
- 检查端口是否被占用

### 生成失败

- 检查 `config.json` 中的 `api_key` 是否正确
- 检查火山引擎控制台是否有余额
- 查看后端终端输出的错误信息

### 导入时间线无反应

- 确认有激活的序列
- 确认序列中有音频轨
- 确认 `D:/voice_cache` 中有生成的 `.mp3` 文件
- 打开 Chrome 访问 `http://localhost:8088` 查看 CEP 控制台错误

## 项目结构

```
PRdovoiceAI_PR/
├── LICENSE                  # MIT 开源协议
├── .debug                   # CEP 调试配置
├── CSXS/
│   └── manifest.xml         # CEP 扩展清单
├── client/
│   ├── index.html           # 面板 UI
│   ├── main.js              # 面板逻辑
│   ├── style.css            # 样式
│   └── CSInterface.js       # CEP 桥接库
├── host/
│   └── host.jsx             # ExtendScript（PR 文件操作）
└── server/
    ├── tts_server.py        # FastAPI 后端
    ├── tts_engine.py        # TTS 引擎（火山 API）
    ├── voice_library.json   # 音色数据库
    ├── config.example.json  # 配置文件模板（不含真实密钥）
    └── config.json          # API Key + 输出目录配置（不纳入版本控制）
```

## 许可

本项目基于 [MIT License](LICENSE) 开源。
