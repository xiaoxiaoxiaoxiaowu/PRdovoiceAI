# PRdovoiceAI — Premiere Pro 语音合成插件

调用火山引擎豆包语音合成大模型，在 Premiere Pro 时间线上直接生成并导入 AI 配音。  
**前后端分离**：面板负责交互，后端负责合成。API Key 由用户自行提供，安全可控。

## 声明

- 本项目代码主要由 AI 辅助生成，可能存在非最优实现。创作者因自身需求开发，欢迎 PR 和 Issue，但请保持合理预期。
- **AI 生成标识**：合成音频由火山引擎豆包语音合成模型生成，用户使用生成内容时应遵守火山引擎相关服务条款。
- **API Key**：本工具**不内置任何 API Key**。使用者必须自行前往 [火山引擎控制台](https://console.volcengine.com/speech/new) 开通服务并获取密钥。任何因密钥泄露导致的费用需自行承担。
- **关于分发与商用**：本项目采用 [PRdovoiceAI 公共许可证 v1.0](LICENSE)。简而言之：
  - ✅ 允许自由使用、修改代码、分发。
  - ✅ 允许基于**实质性修改**或**个性化界面设计**后商用。
  - ✅ 允许收取人工技术支持、安装指导、定制配置等**真实人力服务费**（“血压钱”）。
  - ❌ **禁止**未经实质性修改，将软件原样或简单封装后直接在应用商店、下载站、电商平台、知识付费平台等渠道**标价出售**或作为“资源”收费。
  - ❌ **禁止**以“知识付费”“资源下载”名义提供本软件源代码/二进制包的下载权限并收费，但未提供等值人工知识服务。
  完整条款见仓库内 [LICENSE](LICENSE) 文件。

## 架构特点

```
┌──────────────────┐     HTTP (localhost:9527)     ┌─────────────────┐
│  PR CEP 面板      │  ──────────────────────────>  │  FastAPI 后端    │
│  (纯 HTML/JS)     │  <────────────────────────── │  (Python)        │
└──────────────────┘     JSON 响应                 └────────┬────────┘
                                                           │
                                                   火山引擎 TTS API
                                                   (需自行申请密钥)
```

- **CEP 面板**：运行在 Premiere Pro 中，提供操作界面。
- **FastAPI 后端**：本地运行的服务，接收面板请求，调用火山引擎 OpenSpeech API 并返回音频。

你可以：
- 在 PR 中安装面板后，**手动启动后端**并填写自己的 API Key。
- 将后端部署在局域网某台机器上，多人通过在面板中修改 IP 地址共享使用。

## 环境要求

- **Premiere Pro** 2026 (v26.0.1) 或更高
- **Python** 3.10+（已添加环境变量）
- **pip 依赖**：`fastapi` `uvicorn` `requests` `pydantic`
- **火山引擎 API Key**（[获取方法见下文](#获取-api-key)）

## 快速开始

### 1. 获取 API Key

1. 打开 [火山引擎语音技术控制台](https://console.volcengine.com/speech/new)
2. 注册/登录火山引擎账号
3. 在「API Key管理」→「创建API Key」中创建应用
4. 在「API Key管理」→「你刚刚创建的API Key」→「旁边的小眼睛」→「复制你的API Key」（注意这个密钥要保护好，暴露之后可能会被滥用）

### 2. 下载项目

```powershell
git clone https://github.com/xiaoxiaoxiaoxiaowu/PRdovoiceAI.git
```

### 3. 安装 Python 依赖

```powershell
pip install fastapi uvicorn requests pydantic
```

### 4. 配置 API Key

进入项目的 `server/` 目录，将 `config.example.json` 复制为 `config.json`，并用文本编辑器打开，填入你的 API Key：

```json
{
  "api_key": "你的火山引擎 API Key",
  "output_dir": "D:/voice_cache"
}
```

| 字段 | 说明 |
|------|------|
| `api_key` | 火山引擎 TTS API Key，**必填** |
| `output_dir` | 音频缓存目录，需与 PR 插件设置页中的「共享文件夹」一致（默认 `D:/voice_cache`） |

### 5. 启动后端

进入 `server/` 文件夹，在该目录下打开终端：

- **Windows 11**：在文件夹空白处右键 → “在终端中打开”
- **Windows 10**：在文件夹地址栏输入 `cmd` 并回车

执行：

```powershell
uvicorn tts_server:app --host 0.0.0.0 --port 9527
```

看到 `Uvicorn running on http://0.0.0.0:9527` 即表示后端就绪。

> 如需多人共享后端，可将 `--host` 设为局域网 IP，并在防火墙中放行 9527 端口。

### 6. 安装面板到 Premiere Pro

将项目根目录下**除 `server/` 文件夹以外**的所有内容（`CSXS/`、`client/`、`host/`、`index.html` 等）复制到：

```
C:\Program Files (x86)\Common Files\Adobe\CEP\extensions\PRdovoiceAI_PR
```

**务必确保** `PRdovoiceAI_PR/CSXS/manifest.xml` 路径存在，否则 PR 无法加载扩展。

#### 开启开发者模式（手动安装必需）

由于面板未经过 Adobe 官方签名，需要开启调试模式才能加载：

- 按 `Win + R`，输入 `regedit` 打开注册表编辑器。
- 定位到 `HKEY_CURRENT_USER\Software\Adobe\CSXS.12`
  （若没有 `CSXS.12` 项，右键 `Adobe` 新建 → 项，命名为 `CSXS.12`）
- 在右侧空白处右键 → 新建 → **字符串值**，命名为 `PlayerDebugMode`，数值设为 `1`。

> 对应关系：PR 2026 使用 CSXS.12；PR 2025 使用 CSXS.12；PR 2024 使用 CSXS.11。建议在 `CSXS.9` 至 `CSXS.14` 下均创建该键值以保证兼容性。

### 7. 打开 Premiere Pro

菜单栏：Window（窗口） → Extensions（扩展） → **PRdovoiceAI**

## 使用说明

### 连接后端

在面板顶部输入后端所在设备的 IP 地址（本机为 `127.0.0.1`）和端口 `9527`，点击 **连接**。  
连接成功后，面板会显示音色库信息。

### 添加剪辑

点击 **+ 添加一句话** 创建一条新剪辑。每个剪辑包含以下可调参数：

| 控件 | 说明 |
|------|------|
| 音色 | 从音色库中选择，切换后控件自动适配版本 |
| 文本 | 需要合成的文本内容（1~5000 字） |
| `[#指令]` | 仅 **2.0** 音色。插入自然语言情感指令，如 `[#用悲伤的语气说]` |
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
- **🔄 重新生成**：重新生成单个剪辑（若音频未更新，参见[故障排查](#重新生成后音频未更新)）

### 导入 PR 时间线

生成完成的剪辑点击 **📥 导入PR时间线**，音频会自动插入到当前序列的音频轨上。

> 需要当前已打开并激活一个序列，且序列中包含至少一条音频轨。

### 项目保存 / 打开

- **保存**：将当前所有剪辑（文本、音色、情感、语速等）存为 `.voicelab` 文件
- **打开**：恢复之前保存的项目，所有剪辑状态重置为“待生成”
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

1. 确认目录结构为 `PRdovoiceAI_PR/CSXS/manifest.xml`
2. 确认 `manifest.xml` 中 `Host Version` 与你的 PR 版本匹配，且 `RequiredRuntime` 版本为 `12.0`
3. 完全退出 PR 后重新启动
4. 确保已按照上文步骤开启 `PlayerDebugMode`

### 连接失败

- 确认后端已启动：浏览器访问 `http://127.0.0.1:9527/health` 应返回 JSON
- 检查端口是否被占用

### 生成失败（500 错误）

- 检查 `server/config.json` 中的 `api_key` 是否正确
- 确认火山引擎账户余额充足
- 查看后端终端输出的完整错误堆栈

### 导入时间线无反应

- 确认 PR 中有激活的序列，且序列包含音频轨
- 检查 `D:/voice_cache` 中是否已生成 `.mp3` 文件
- 打开 Chrome 浏览器访问 `http://localhost:8088` 查看 CEP 调试控制台

### 重新生成后音频未更新

这是由于浏览器/前端缓存导致。后端已采取强制不缓存策略，若问题仍存在：
- 关闭并重新打开面板
- 重启后端服务
- 若仍使用旧音频，可能是前端自身缓存了音频数据，可尝试在面板中刷新或重启 PR

## 项目结构

```
PRdovoiceAI_PR/
├── LICENSE                  # PRdovoiceAI 公共许可证 v1.0
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

本项目基于自定的 [PRdovoiceAI 公共许可证 v1.0](LICENSE) 发布。  
简单概括：

- ✅ **自由使用、修改、分发**
- ✅ **修改后商用**（含皮肤/主题）
- ✅ **人力服务收费**（如安装指导、技术支持）
- ❌ **原样倒卖**（商店、下载站、知识付费平台）
- ❌ **无人工知识内容的“资源”收费**

完整条款请阅读仓库内的 `LICENSE` 文件。使用本软件即表示你同意上述条款。