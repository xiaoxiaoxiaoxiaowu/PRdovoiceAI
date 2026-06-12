// ==================== 配置 ====================
let AUDIO_OUTPUT_DIR = "D:/voice_cache";
let activePanelClipId = null;
let isBatchMode = false;

// ==================== 安全：HTML 转义 ====================
function escapeHtml(str) {
  if (!str) return "";
  const div = document.createElement("div");
  div.appendChild(document.createTextNode(str));
  return div.innerHTML;
}

// ==================== 全局状态 ====================
var csInterface = new CSInterface();
let backendUrl = "http://127.0.0.1:9527";
let voiceLibrary = [];
let clips = [];
let selectedClips = new Set();
let generating = false;

// ==================== 连接 ====================
async function connect(ipInputId = "ip-input", portInputId = "port-input") {
  const ip = document.getElementById(ipInputId).value.trim();
  const port = document.getElementById(portInputId).value.trim();

  document.getElementById("ip-input").value = ip;
  document.getElementById("port-input").value = port;
  document.getElementById("set-ip").value = ip;
  document.getElementById("set-port").value = port;
  backendUrl = `http://${ip}:${port}`;

  const statusEl = document.getElementById("status-indicator");
  statusEl.textContent = "● 连接中...";
  statusEl.className = "status-connecting";

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5000);
    const resp = await fetch(`${backendUrl}/health`, { signal: ctrl.signal });
    clearTimeout(timer);
    const data = await resp.json();
    statusEl.textContent = `● 已连接 | v${data.version} | ${data.voice_count} 音色`;
    statusEl.className = "status-online";
    await loadVoices();
  } catch (e) {
    statusEl.textContent = "● 连接失败";
    statusEl.className = "status-offline";
  }
}

async function loadVoices() {
  try {
    const resp = await fetch(`${backendUrl}/voices`);
    const data = await resp.json();
    voiceLibrary = data.voices;
    renderVoiceList();
    updateDefaultVoiceSelect();
    renderClipList();
  } catch (e) {
    console.error("加载音色失败:", e);
  }
}

async function clearCache() {
  const button = document.getElementById("btn-clear-cache");
  const info = document.getElementById("cache-info");

  button.disabled = true;
  info.textContent = "清理中...";
  info.className = "status-connecting";

  try {
    const resp = await fetch(`${backendUrl}/cache`, { method: "DELETE" });
    const data = await resp.json();
    if (!resp.ok) {
      throw new Error(data.detail || data.message || `HTTP ${resp.status}`);
    }
    info.textContent = data.message || "缓存已清空";
    info.className = "status-online";
  } catch (e) {
    info.textContent = `清理失败: ${e.message}`;
    info.className = "status-offline";
  } finally {
    button.disabled = false;
  }
}

function getVoiceCapabilitySummary(voice) {
  const caps = voice.capabilities || {};
  const emotions = caps.emotions || ["neutral"];
  const parts = [
    emotions.length > 1 ? `${emotions.length} 种情感` : emotions[0],
  ];

  if (caps.context_texts) parts.push("引用上文");
  if (caps.voice_instruction) parts.push("语音指令");
  if (caps.voice_tag) parts.push("语音标签");
  if (caps.asmr) parts.push("ASMR");

  return parts.filter(Boolean).join(" · ");
}

// ==================== 音色库渲染 ====================
function renderVoiceList() {
  const container = document.getElementById("voice-list");
  const versionFilter = document.getElementById("filter-version").value;
  const genderFilter = document.getElementById("filter-gender").value;
  const capFilter = document.getElementById("filter-capability").value;
  const search = document.getElementById("voice-search").value.toLowerCase();

  let filtered = voiceLibrary.filter(v => {
    if (versionFilter !== "all" && v.category !== versionFilter && v.version !== versionFilter) return false;
    if (genderFilter !== "all" && v.gender !== genderFilter) return false;
    if (capFilter !== "all") {
      const caps = v.capabilities;
      if (capFilter === "emotion" && (!caps.emotions || caps.emotions.length <= 1)) return false;
      if (capFilter === "context_texts" && !caps.context_texts) return false;
      if (capFilter === "voice_instruction" && !caps.voice_instruction) return false;
      if (capFilter === "voice_tag" && !caps.voice_tag) return false;
      if (capFilter === "asmr" && !caps.asmr) return false;
    }
    if (search && !v.name.toLowerCase().includes(search) && !v.voice_type.toLowerCase().includes(search)) return false;
    return true;
  });

  container.innerHTML = filtered.map(v => {
    const caps = v.capabilities || {};
    const emotions = caps.emotions || ["neutral"];
    const rateMin = caps.speech_rate_range?.[0] ?? -50;
    const rateMax = caps.speech_rate_range?.[1] ?? 100;

    return `
      <div class="voice-card ${v.version === '2.0' ? 'v20' : 'v10'}">
        <div class="voice-card-header">
          <span class="voice-name">${escapeHtml(v.name)}</span>
          <span class="voice-badge gender">${v.gender === 'female' ? '女' : '男'}</span>
          <span class="voice-badge version">${escapeHtml(v.category || v.version)}</span>
          <button class="btn btn-xs btn-set-default" data-voice-id="${escapeHtml(v.id)}">设为默认</button>
        </div>
        <details class="voice-card-details">
          <summary>
            <code class="voice-type">${escapeHtml(v.voice_type)}</code>
            <span class="voice-capability-summary">${escapeHtml(getVoiceCapabilitySummary(v))}</span>
          </summary>
          <div class="voice-card-meta">
            <div>情感: ${emotions.map(escapeHtml).join(" ")}</div>
            <div>
              ${caps.context_texts ? '✅ 引用上文 ' : ''}
              ${caps.voice_instruction ? '✅ 语音指令 ' : ''}
              ${caps.voice_tag ? '✅ 语音标签 ' : ''}
              ${caps.asmr ? '✅ ASMR ' : ''}
            </div>
            <div>语速: ${rateMin} ~ ${rateMax}</div>
          </div>
        </details>
      </div>
    `;
  }).join("");

  container.querySelectorAll(".btn-set-default").forEach(btn => {
    btn.addEventListener("click", () => {
      const voiceId = btn.dataset.voiceId;
      const voice = voiceLibrary.find(v => v.id === voiceId);
      document.getElementById("set-default-voice").value = voiceId;
      const nameSpan = document.getElementById("default-voice-name");
      if (nameSpan) nameSpan.textContent = voice ? voice.name : voiceId;
    });
  });
}

document.getElementById("filter-version").addEventListener("change", renderVoiceList);
document.getElementById("filter-gender").addEventListener("change", renderVoiceList);
document.getElementById("filter-capability").addEventListener("change", renderVoiceList);
document.getElementById("voice-search").addEventListener("input", renderVoiceList);

// ==================== 侧边音色面板 ====================
function openVoicePanel(clipId) {
  if (!voiceLibrary.length) {
    alert("请先连接后端并加载音色库");
    return;
  }
  isBatchMode = false;
  activePanelClipId = clipId;
  document.getElementById("overlay").classList.remove("hidden");
  document.getElementById("voice-panel").classList.remove("hidden");
  document.getElementById("voice-panel-title").textContent =
    clipId === "__default__" ? "设置默认音色" : "选择音色";
  document.getElementById("panel-voice-search").value = "";
  document.getElementById("panel-filter-version").value = "all";
  document.getElementById("panel-filter-gender").value = "all";
  document.getElementById("panel-filter-capability").value = "all";
  renderPanelVoiceList();
}

function closeVoicePanel() {
  isBatchMode = false;
  activePanelClipId = null;
  document.getElementById("overlay").classList.add("hidden");
  document.getElementById("voice-panel").classList.add("hidden");
}

function renderPanelVoiceList() {
  const container = document.getElementById("voice-panel-list");
  const versionFilter = document.getElementById("panel-filter-version").value;
  const genderFilter = document.getElementById("panel-filter-gender").value;
  const capFilter = document.getElementById("panel-filter-capability").value;
  const search = document.getElementById("panel-voice-search").value.toLowerCase();
  const clip = clips.find(c => c.id === activePanelClipId);
  const currentVoiceId = activePanelClipId === "__default__"
    ? document.getElementById("set-default-voice").value
    : (clip ? clip.voice_id : null);

  let filtered = voiceLibrary.filter(v => {
    if (versionFilter !== "all" && v.category !== versionFilter && v.version !== versionFilter) return false;
    if (genderFilter !== "all" && v.gender !== genderFilter) return false;
    if (capFilter !== "all") {
      const caps = v.capabilities;
      if (capFilter === "emotion" && (!caps.emotions || caps.emotions.length <= 1)) return false;
      if (capFilter === "context_texts" && !caps.context_texts) return false;
      if (capFilter === "voice_instruction" && !caps.voice_instruction) return false;
      if (capFilter === "voice_tag" && !caps.voice_tag) return false;
      if (capFilter === "asmr" && !caps.asmr) return false;
    }
    if (search && !v.name.toLowerCase().includes(search) && !v.voice_type.toLowerCase().includes(search)) return false;
    return true;
  });

  container.innerHTML = filtered.map(v => `
    <div class="voice-card ${v.version === '2.0' ? 'v20' : 'v10'} ${v.id === currentVoiceId ? 'selected' : ''}"
         onclick="selectPanelVoice('${v.id}')">
      <div class="voice-card-header">
        <span class="voice-name">${escapeHtml(v.name)}</span>
        <span class="voice-badge gender">${v.gender === 'female' ? '女' : '男'}</span>
        <span class="voice-badge version">${v.category || v.version}</span>
      </div>
    </div>
  `).join("");
}

function selectPanelVoice(voiceId) {
  if (activePanelClipId === "__default__") {
    const voice = voiceLibrary.find(v => v.id === voiceId);
    document.getElementById("set-default-voice").value = voiceId;
    const nameSpan = document.getElementById("default-voice-name");
    if (nameSpan) nameSpan.textContent = voice ? voice.name : voiceId;
    closeVoicePanel();
    return;
  }
  if (isBatchMode) {
    selectedClips.forEach(cid => {
      const clip = clips.find(c => c.id === cid);
      if (clip) clip.voice_id = voiceId;
    });
    isBatchMode = false;
  } else {
    const clip = clips.find(c => c.id === activePanelClipId);
    if (!clip) return;
    clip.voice_id = voiceId;
    const voice = voiceLibrary.find(v => v.id === voiceId);
    if (voice && !voice.capabilities.emotions.includes(clip.emotion)) {
      clip.emotion = voice.capabilities.emotions[0] || "neutral";
    }
  }
  document.getElementById("voice-panel-title").textContent = "选择音色";
  activePanelClipId = null;
  closeVoicePanel();
  renderClipList();
}

// 面板内过滤器事件
document.getElementById("panel-voice-search").addEventListener("input", renderPanelVoiceList);
document.getElementById("panel-filter-version").addEventListener("change", renderPanelVoiceList);
document.getElementById("panel-filter-gender").addEventListener("change", renderPanelVoiceList);
document.getElementById("panel-filter-capability").addEventListener("change", renderPanelVoiceList);

// Esc 关闭面板
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && activePanelClipId) { closeVoicePanel(); }
});

// ==================== 浮动批量操作 ====================
function updateBatchButtons() {
  const count = selectedClips.size;
  const total = clips.length;
  const btnSelectAll = document.getElementById("btn-select-all");
  const btnBatchDelete = document.getElementById("btn-batch-delete");

  if (btnSelectAll) {
    btnSelectAll.textContent = (count === total && total > 0) ? "取消全选" : "全选";
  }
  if (btnBatchDelete) {
    btnBatchDelete.disabled = count === 0;
    btnBatchDelete.textContent = count > 0 ? `🗑 批量删除 (${count})` : "🗑 批量删除";
  }

  // 兼容旧的浮动按钮
  const floatBtn = document.getElementById("batch-float");
  const floatSpan = document.getElementById("batch-count");
  if (floatBtn && floatSpan) {
    if (count > 0) {
      floatBtn.classList.remove("hidden");
      floatSpan.textContent = `${count} 个已选`;
    } else {
      floatBtn.classList.add("hidden");
    }
  }
}

function toggleSelectAll() {
  if (selectedClips.size === clips.length && clips.length > 0) {
    selectedClips.clear();
  } else {
    clips.forEach(c => selectedClips.add(c.id));
  }
  renderClipList();
  updateBatchButtons();
}

function openDeleteModal() {
  const count = selectedClips.size;
  if (count === 0) return;
  document.getElementById("delete-count").textContent = count;
  document.getElementById("delete-overlay").classList.remove("hidden");
  document.getElementById("delete-modal").classList.remove("hidden");
}

function closeDeleteModal() {
  document.getElementById("delete-overlay").classList.add("hidden");
  document.getElementById("delete-modal").classList.add("hidden");
}

function confirmBatchDelete() {
  const ids = [...selectedClips];
  clips = clips.filter(c => !selectedClips.has(c.id));
  ids.forEach(id => selectedClips.delete(id));
  closeDeleteModal();
  renderClipList();
  updateBatchButtons();
}

// 覆盖原有 toggleSelectClip，接入更新工具栏按钮
const _origToggleSelect = toggleSelectClip;
toggleSelectClip = function(clipId) {
  _origToggleSelect(clipId);
  updateBatchButtons();
};

document.body.addEventListener("click", function(event) {
  if (!event.target.matches("#btn-batch-voice")) return;
  if (selectedClips.size === 0) return;
  isBatchMode = true;
  activePanelClipId = "__batch__";
  document.getElementById("overlay").classList.remove("hidden");
  document.getElementById("voice-panel").classList.remove("hidden");
  document.getElementById("voice-panel-title").textContent = `批量修改音色 (${selectedClips.size} 个)`;
  document.getElementById("panel-voice-search").value = "";
  document.getElementById("panel-filter-version").value = "all";
  document.getElementById("panel-filter-gender").value = "all";
  document.getElementById("panel-filter-capability").value = "all";
  renderPanelVoiceList();
});

function updateDefaultVoiceSelect() {
  const voiceId = document.getElementById("set-default-voice").value;
  const voice = voiceLibrary.find(v => v.id === voiceId);
  const nameSpan = document.getElementById("default-voice-name");
  if (nameSpan) {
    nameSpan.textContent = voice ? voice.name : "未设置";
    nameSpan.style.cursor = "pointer";
  }
  const btn = document.getElementById("btn-set-default-voice");
  if (btn) btn.addEventListener("click", () => openVoicePanel("__default__"));
}

// ==================== 剪辑列表 ====================
let clipCounter = 1;

const SPEECH_MODE_LABELS = {
  voice_instruction: "语音指令",
  reference_text: "引用上文",
  voice_tag: "语音标签",
};

function getSupportedSpeechModes(voice) {
  const caps = voice?.capabilities || {};
  return Object.keys(SPEECH_MODE_LABELS).filter(mode => {
    if (mode === "reference_text") return caps.context_texts;
    return caps[mode];
  });
}

function getClipSpeechMode(clip, voice) {
  const supported = getSupportedSpeechModes(voice);
  if (supported.includes(clip.speech_mode)) return clip.speech_mode;
  if (clip.reference_text?.trim() && supported.includes("reference_text")) return "reference_text";
  if (
    (clip.voice_instruction || clip.cot_text || /\[#([^\]]+)\]/.test(clip.text || "")) &&
    supported.includes("voice_instruction")
  ) {
    return "voice_instruction";
  }
  if (
    /\[([^#\]][^\]]*)\]|【([^】]+)】/.test(clip.text || "") &&
    supported.includes("voice_tag")
  ) {
    return "voice_tag";
  }
  return supported[0] || null;
}

function addClip(initialText = "", initialVoice = null, initialEmotion = "neutral") {
  const defaultVoice = initialVoice || document.getElementById("set-default-voice").value || (voiceLibrary[0]?.id);
  const defaultEmotion = initialEmotion || document.getElementById("set-default-emotion").value;
  const defaultRate = parseInt(document.getElementById("set-default-rate").value) || 0;
  const defaultSilence = parseInt(document.getElementById("set-default-silence").value) || 300;

  const clip = {
    id: `clip_${String(clipCounter).padStart(3, '0')}`,
    text: initialText,
    voice_id: defaultVoice,
    emotion: defaultEmotion,
    emotion_scale: 4,
    expression: "none",
    speech_rate: defaultRate,
    silence_duration: defaultSilence,
    loudness_rate: 0,
    bit_rate: null,
    model: null,
    enable_subtitle: false,
    speech_mode: null,
    voice_instruction: null,
    reference_text: "",
    status: "pending",
    audio_url: null,
    duration_ms: null,
    file_size: null,
    subtitles: null,
    usage: null,
  };
  clips.push(clip);
  clipCounter++;
  renderClipList();
}

function renderClipList() {
  const container = document.getElementById("clip-list");
  container.innerHTML = clips.map((clip, idx) => {
    const voice = voiceLibrary.find(v => v.id === clip.voice_id);
    const version = voice?.version || "2.0";
    const category = voice?.category || version;
    const is20 = category === "2.0";
    const is10Multi = category === "1.0多感情";
    const hasEmotion = is20 || is10Multi;
    const emotions = voice?.capabilities?.emotions || ["neutral"];
    const hasContextTexts = voice?.capabilities?.context_texts || false;
    const speechModes = getSupportedSpeechModes(voice);
    const speechMode = getClipSpeechMode(clip, voice);
    clip.speech_mode = speechMode;
    const isCollapsed = clip._collapsed !== false;

    return `
      <div class="clip-item ${clip.status} ${selectedClips.has(clip.id) ? 'selected' : ''}">
        <div class="clip-header" onclick="toggleClip('${clip.id}')">
          <input type="checkbox" class="clip-checkbox" data-clip-id="${clip.id}"
                 ${selectedClips.has(clip.id) ? 'checked' : ''}>
          <span class="clip-id">#${clip.id}</span>
          <span class="clip-preview">${escapeHtml(clip.text.substring(0, 40))}${clip.text.length > 40 ? '...' : ''}</span>
          <span class="clip-status-icon">${statusIcon(clip.status)}</span>
          <span class="clip-toggle">${isCollapsed ? '▶' : '▼'}</span>
        </div>
        <div class="clip-body" style="display:${isCollapsed ? 'none' : 'block'}">
          <div class="clip-field">
            <label>音色:</label>
            <span class="clip-voice-name" onclick="openVoicePanel('${clip.id}')"
                  title="点击切换音色">${escapeHtml(voice?.name || '未选择')}</span>
          </div>

          <div class="clip-field">
            <label>文本:</label>
            <textarea class="clip-text" data-clip-id="${clip.id}" rows="2">${escapeHtml(clip.text)}</textarea>
          </div>

          <div class="clip-tools">
            ${is20 ? `
            <button class="btn btn-xs btn-insert-json20" data-clip-id="${clip.id}">{{2.0}}</button>` : ''}
          </div>

          ${is20 ? `
          <div class="clip-field">
            <label>模型:</label>
            <select class="clip-model" data-clip-id="${clip.id}">
              <option value="" ${!clip.model ? 'selected' : ''}>默认</option>
              <option value="seed-tts-2.0-expressive" ${clip.model === 'seed-tts-2.0-expressive' ? 'selected' : ''}>2.0 表现力增强</option>
              <option value="seed-tts-2.0-standard" ${clip.model === 'seed-tts-2.0-standard' ? 'selected' : ''}>2.0 标准稳定</option>
            </select>
          </div>

          ${speechModes.length ? `
          <div class="clip-field">
            <label>模式:</label>
            <select class="clip-speech-mode" data-clip-id="${clip.id}">
              ${speechModes.map(mode => `
                <option value="${mode}" ${speechMode === mode ? 'selected' : ''}>${SPEECH_MODE_LABELS[mode]}</option>
              `).join("")}
            </select>
          </div>

          <div class="clip-mode-panel">
            ${speechMode === "voice_instruction" ? `
              <div class="clip-field">
                <label>语音指令:</label>
                <input type="text" class="clip-voice-instruction" data-clip-id="${clip.id}"
                       value="${escapeHtml(clip.voice_instruction || clip.cot_text || '')}"
                       placeholder="控制整段情绪、方言、语气、语速或音调">
              </div>
            ` : ''}

            ${speechMode === "reference_text" ? `
              <div class="clip-field">
              <label>引用上文:</label>
              <textarea class="clip-reference-text" data-clip-id="${clip.id}" rows="2"
                        placeholder="提供不会被合成的上文，帮助当前文本衔接语境">${escapeHtml(clip.reference_text || '')}</textarea>
              </div>
            ` : ''}

            ${speechMode === "voice_tag" ? `
              <div class="clip-mode-help">语音标签直接写入正文，用来描述下一句的心理、表情、动作或语气。</div>
              <button class="btn btn-xs btn-insert-voice-tag" data-clip-id="${clip.id}">
                插入 [语音标签]
              </button>
            ` : ''}
          </div>
          ` : ''}
          ` : ''}

          ${hasEmotion ? `
          <div class="clip-field">
            <label>情感:</label>
            <select class="clip-emotion" data-clip-id="${clip.id}">
              ${emotions.map(e => `<option value="${e}" ${e === clip.emotion ? 'selected' : ''}>${e}</option>`).join("")}
            </select>
            ${is20 ? `
              <label>强度:</label>
              <input type="range" class="clip-emotion-scale" data-clip-id="${clip.id}"
                     min="1" max="5" value="${clip.emotion_scale}">
              <span class="scale-val">${clip.emotion_scale}</span>
            ` : ''}
          </div>
          ` : ''}

          ${hasContextTexts ? `
            <div class="clip-field">
              <label>特殊表达:</label>
              <select class="clip-expression" data-clip-id="${clip.id}">
                <option value="none" ${clip.expression === 'none' ? 'selected' : ''}>无</option>
                <option value="crying" ${clip.expression === 'crying' ? 'selected' : ''}>哭泣</option>
                <option value="gasping" ${clip.expression === 'gasping' ? 'selected' : ''}>喘息</option>
                <option value="whispering" ${clip.expression === 'whispering' ? 'selected' : ''}>耳语</option>
                <option value="shouting" ${clip.expression === 'shouting' ? 'selected' : ''}>呐喊</option>
                <option value="cold" ${clip.expression === 'cold' ? 'selected' : ''}>冰冷</option>
                <option value="fearful_expr" ${clip.expression === 'fearful_expr' ? 'selected' : ''}>恐惧</option>
              </select>
            </div>
          ` : ''}

          <div class="clip-field">
            <label>语速:</label>
            <input type="range" class="clip-rate" data-clip-id="${clip.id}"
                   min="-50" max="100" value="${clip.speech_rate}">
            <span class="rate-val">${clip.speech_rate}</span>
          </div>

          <div class="clip-field">
            <label>尾停 (ms):</label>
            <input type="number" class="clip-silence" data-clip-id="${clip.id}"
                   value="${clip.silence_duration}" min="0" max="30000" style="width:80px">
          </div>

          <div class="clip-field">
            <label>音量:</label>
            <input type="range" class="clip-loudness" data-clip-id="${clip.id}"
                   min="-50" max="100" value="${clip.loudness_rate}">
            <span class="loudness-val">${clip.loudness_rate}</span>
          </div>

          <div class="clip-field">
            <label><input type="checkbox" class="clip-subtitle" data-clip-id="${clip.id}"
                   ${clip.enable_subtitle ? 'checked' : ''}> 字幕</label>
          </div>

          <div class="clip-actions-row">
            <button class="btn btn-sm btn-preview" data-clip-id="${clip.id}"
                    ${clip.status !== 'done' ? 'disabled' : ''}>▶ 试听</button>
            <button class="btn btn-sm btn-regenerate" data-clip-id="${clip.id}">🔄 重新生成</button>
            <button class="btn btn-sm btn-duplicate" data-clip-id="${clip.id}">📋 复制</button>
            <button class="btn btn-sm btn-delete" data-clip-id="${clip.id}">🗑 删除</button>
          </div>

          <div class="clip-status">
            ${clip.status === 'done' ? `✅ 已生成 | ${clip.duration_ms ? (clip.duration_ms/1000).toFixed(1) + 's' : ''} | ${clip.file_size ? formatBytes(clip.file_size) : ''}${clip.usage ? ' | 用量:' + clip.usage + '字' : ''}${clip.subtitles ? ' | 📝字幕' : ''}` :
              clip.status === 'error' ? `❌ 合成失败` :
              clip.status === 'generating' ? `⏳ 生成中...` : `⏳ 待生成`}
          </div>
        </div>
      </div>
    `;
  }).join("");

  bindClipEvents();
  updateBatchButtons();
}

function statusIcon(s) {
  return { pending: "⏳", generating: "🔄", done: "✅", error: "❌" }[s] || "⏳";
}

function formatBytes(bytes) {
  if (!bytes) return "";
  if (bytes < 1024) return bytes + "B";
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + "KB";
  return (bytes / 1048576).toFixed(1) + "MB";
}

function toggleClip(clipId) {
  const clip = clips.find(c => c.id === clipId);
  if (clip) { clip._collapsed = clip._collapsed !== false ? false : true; renderClipList(); }
}

function toggleSelectClip(clipId) {
  selectedClips.has(clipId) ? selectedClips.delete(clipId) : selectedClips.add(clipId);
  renderClipList();
}

function bindClipEvents() {
  document.querySelectorAll(".clip-checkbox").forEach(cb => {
    cb.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleSelectClip(cb.dataset.clipId);
    });
  });

  // 音色名点击 → 侧边面板（已通过 onclick 绑定，无需额外处理）

  document.querySelectorAll(".clip-text").forEach(ta => {
    ta.addEventListener("input", () => {
      const clip = clips.find(c => c.id === ta.dataset.clipId);
      if (clip) clip.text = ta.value;
    });
  });

  document.querySelectorAll(".clip-emotion").forEach(sel => {
    sel.addEventListener("change", () => {
      const clip = clips.find(c => c.id === sel.dataset.clipId);
      if (clip) clip.emotion = sel.value;
    });
  });

  document.querySelectorAll(".clip-emotion-scale").forEach(inp => {
    inp.addEventListener("input", () => {
      const clip = clips.find(c => c.id === inp.dataset.clipId);
      if (clip) { clip.emotion_scale = parseInt(inp.value); inp.nextElementSibling.textContent = inp.value; }
    });
  });

  document.querySelectorAll(".clip-expression").forEach(sel => {
    sel.addEventListener("change", () => {
      const clip = clips.find(c => c.id === sel.dataset.clipId);
      if (clip) clip.expression = sel.value;
    });
  });

  document.querySelectorAll(".clip-rate").forEach(inp => {
    inp.addEventListener("input", () => {
      const clip = clips.find(c => c.id === inp.dataset.clipId);
      if (clip) { clip.speech_rate = parseInt(inp.value); inp.nextElementSibling.textContent = inp.value; }
    });
  });

  document.querySelectorAll(".clip-silence").forEach(inp => {
    inp.addEventListener("change", () => {
      const clip = clips.find(c => c.id === inp.dataset.clipId);
      if (clip) clip.silence_duration = parseInt(inp.value) || 0;
    });
  });

  document.querySelectorAll(".clip-loudness").forEach(inp => {
    inp.addEventListener("input", () => {
      const clip = clips.find(c => c.id === inp.dataset.clipId);
      if (clip) { clip.loudness_rate = parseInt(inp.value); inp.nextElementSibling.textContent = inp.value; }
    });
  });

  document.querySelectorAll(".clip-subtitle").forEach(cb => {
    cb.addEventListener("change", () => {
      const clip = clips.find(c => c.id === cb.dataset.clipId);
      if (clip) clip.enable_subtitle = cb.checked;
    });
  });

  document.querySelectorAll(".clip-model").forEach(sel => {
    sel.addEventListener("change", () => {
      const clip = clips.find(c => c.id === sel.dataset.clipId);
      if (clip) clip.model = sel.value || null;
    });
  });

  document.querySelectorAll(".clip-speech-mode").forEach(sel => {
    sel.addEventListener("change", () => {
      const clip = clips.find(c => c.id === sel.dataset.clipId);
      if (clip) {
        clip.speech_mode = sel.value;
        renderClipList();
      }
    });
  });

  document.querySelectorAll(".clip-voice-instruction").forEach(inp => {
    inp.addEventListener("input", () => {
      const clip = clips.find(c => c.id === inp.dataset.clipId);
      if (clip) clip.voice_instruction = inp.value || null;
    });
  });

  document.querySelectorAll(".clip-reference-text").forEach(inp => {
    inp.addEventListener("input", () => {
      const clip = clips.find(c => c.id === inp.dataset.clipId);
      if (clip) clip.reference_text = inp.value;
    });
  });

  document.querySelectorAll(".btn-insert-voice-tag").forEach(btn => {
    btn.addEventListener("click", () => insertVoiceTag(btn.dataset.clipId));
  });
  document.querySelectorAll(".btn-insert-json20").forEach(btn => {
    btn.addEventListener("click", () => insertJson20(btn.dataset.clipId));
  });
  document.querySelectorAll(".btn-insert-json10").forEach(btn => {
    btn.addEventListener("click", () => insertJson10(btn.dataset.clipId));
  });

  document.querySelectorAll(".btn-preview").forEach(btn => {
    btn.addEventListener("click", () => previewClip(btn.dataset.clipId));
  });
  document.querySelectorAll(".btn-regenerate").forEach(btn => {
    btn.addEventListener("click", () => regenerateClip(btn.dataset.clipId));
  });
  document.querySelectorAll(".btn-duplicate").forEach(btn => {
    btn.addEventListener("click", () => duplicateClip(btn.dataset.clipId));
  });
  document.querySelectorAll(".btn-delete").forEach(btn => {
    btn.addEventListener("click", () => deleteClip(btn.dataset.clipId));
  });
}

// ==================== 文本工具 ====================
function insertVoiceTag(clipId) {
  const description = prompt(
    "输入句前语音标签（心理、表情、动作或语气描写，不含方括号）:",
    "平稳叙述，音量适中，语速自然，咬字清楚；只表现文字本身，不额外煽情"
  );
  if (description) {
    const ta = document.querySelector(`.clip-text[data-clip-id="${clipId}"]`);
    if (ta) {
      const pos = ta.selectionStart;
      ta.value = ta.value.substring(0, pos) + `[${description}]` + ta.value.substring(pos);
      const clip = clips.find(c => c.id === clipId);
      if (clip) clip.text = ta.value;
    }
  }
}

function insertJson20(clipId) {
  const ctx = prompt("输入 context_texts 指令:", "语气变得非常兴奋，充满期待");
  if (ctx) {
    const ta = document.querySelector(`.clip-text[data-clip-id="${clipId}"]`);
    if (ta) {
      const pos = ta.selectionStart;
      ta.value = ta.value.substring(0, pos) + `{{"additions":{"context_texts":["${ctx}"]} }}` + ta.value.substring(pos);
      const clip = clips.find(c => c.id === clipId);
      if (clip) clip.text = ta.value;
    }
  }
}

function insertJson10(clipId) {
  const emotion = prompt("情感 (happy/sad/angry/neutral...):", "happy");
  const scale = parseInt(prompt("强度 (1-5):", "4"));
  if (emotion && scale) {
    const ta = document.querySelector(`.clip-text[data-clip-id="${clipId}"]`);
    if (ta) {
      const pos = ta.selectionStart;
      ta.value = ta.value.substring(0, pos) + `{{"audio_params":{"emotion":"${emotion}","emotion_scale":${scale}} }}` + ta.value.substring(pos);
      const clip = clips.find(c => c.id === clipId);
      if (clip) clip.text = ta.value;
    }
  }
}

function duplicateClip(clipId) {
  const clip = clips.find(c => c.id === clipId);
  if (clip) {
    const newClip = { ...clip, id: `clip_${String(clipCounter).padStart(3, '0')}`, status: "pending", audio_url: null };
    clips.push(newClip);
    clipCounter++;
    renderClipList();
  }
}

function deleteClip(clipId) {
  clips = clips.filter(c => c.id !== clipId);
  selectedClips.delete(clipId);
  renderClipList();
}

// ==================== 生成 ====================
async function generateAll() {
  if (generating) return;
  generating = true;
  // 重置卡死在 generating 状态的剪辑，防止永久跳过
  clips.forEach(c => { if (c.status === "generating") c.status = "pending"; });
  const pending = clips.filter(c => c.status !== "done");
  const total = pending.length;
  let completed = 0;

  document.getElementById("progress-fill").style.width = "0%";
  document.getElementById("progress-text").textContent = `0/${total}`;

  for (const clip of pending) {
    clip.status = "generating";
    renderClipList();
    await generateClip(clip);
    completed++;
    document.getElementById("progress-fill").style.width = `${(completed/total)*100}%`;
    document.getElementById("progress-text").textContent = `${completed}/${total}`;
  }
  generating = false;
}

async function generateSelected() {
  if (generating) return;
  generating = true;
  const selected = clips.filter(c => selectedClips.has(c.id) && c.status !== "done");
  for (const clip of selected) {
    clip.status = "generating";
    renderClipList();
    await generateClip(clip);
  }
  generating = false;
}

async function generateClip(clip) {
  const voice = voiceLibrary.find(v => v.id === clip.voice_id);
  const speechMode = getClipSpeechMode(clip, voice);
  const payload = {
    id: clip.id,
    text: clip.text,
    voice_id: clip.voice_id,
    emotion: clip.emotion,
    emotion_scale: clip.emotion_scale,
    speech_rate: clip.speech_rate,
    silence_duration: clip.silence_duration,
    loudness_rate: clip.loudness_rate || 0,
    bit_rate: clip.bit_rate || null,
    model: clip.model || null,
    enable_subtitle: clip.enable_subtitle || false,
    speech_mode: speechMode,
    // V3 HTTP 使用同一个 context_texts 字段承载语音指令和引用上文。
    context_texts: speechMode === "voice_instruction"
      ? [clip.voice_instruction || clip.cot_text || ""].filter(Boolean)
      : speechMode === "reference_text" && clip.reference_text?.trim()
        ? [clip.reference_text.trim()]
        : [],
    expression: clip.expression !== "none" ? clip.expression : null,
  };

  try {
    const resp = await fetch(`${backendUrl}/synthesize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await resp.json();
    if (result.id) {
      clip.status = "done";
      clip.audio_url = result.download_url;
      clip.duration_ms = result.duration_ms;
      clip.file_size = result.size;
      clip.subtitles = result.subtitles || null;
      clip.usage = result.usage || null;
    } else {
      clip.status = "error";
    }
  } catch (e) {
    clip.status = "error";
  }
  renderClipList();
}

async function regenerateClip(clipId) {
  const clip = clips.find(c => c.id === clipId);
  if (clip) { clip.status = "pending"; renderClipList(); await generateClip(clip); }
}

async function previewClip(clipId) {
  const clip = clips.find(c => c.id === clipId);
  if (clip && clip.audio_url) {
    new Audio(`${backendUrl}${clip.audio_url}`).play();
  }
}

// ==================== PR 导入 ====================
async function importToPR() {
  AUDIO_OUTPUT_DIR = document.getElementById("set-output-dir").value || "D:/voice_cache";
  const doneClips = clips.filter(c => c.status === "done");
  if (doneClips.length === 0) {
    alert("没有已生成的音频可导入");
    return;
  }

  // 按剪辑 id 的数字部分从小到大排序
  doneClips.sort((a, b) => {
    const numA = parseInt(a.id.replace(/^clip_/, '')) || 0;
    const numB = parseInt(b.id.replace(/^clip_/, '')) || 0;
    return numA - numB;
});

  const importAtPlayhead = document.getElementById("set-import-at-playhead")?.checked ?? true;
  const autoFade = document.getElementById("set-auto-fade")?.checked ?? true;

  // 使用正斜杠，避免转义问题
  const dir = AUDIO_OUTPUT_DIR.replace(/\\/g, "/").replace(/\/+$/, "");
  const items = doneClips.map(c => ({
    id: c.id,
    path: `${dir}/${c.id}.mp3`,
    duration_ms: c.duration_ms || 0,
  }));

  // 🔁 将计就计：后端插入逻辑是倒序的，我们先反序，最终得到正序
  items.reverse();

  if (typeof csInterface !== "undefined") {
    const jsonStr = JSON.stringify(items);
    csInterface.evalScript(
      `importAudioToTimeline('${jsonStr.replace(/'/g, "\\'")}', ${importAtPlayhead}, ${autoFade})`,
      (result) => {
        console.log("PR 返回:", result);
        try {
          const parsed = JSON.parse(result);
          const ok = parsed.filter(r => r.inserted).length;
          const errs = parsed.filter(r => r.error);
          const timings = parsed.filter(r => r.at_sec != null)
            .map(r => `${r.id} @${r.at_sec}s`)
            .join("\n");
          if (errs.length > 0) {
            alert(`⚠ ${ok}/${parsed.length} 导入成功\n失败: ${errs.map(e => e.id + ": " + e.error).join(", ")}\n\n顺序:\n${timings}`);
          } else {
            alert(`✅ 已导入 ${ok} 条\n\n顺序:\n${timings}`);
          }
        } catch (e) {
          console.log("PR 返回:", result);
        }
      }
    );
  } else {
    console.log("模拟导入:", items);
    alert(`[调试模式] 将导入 ${items.length} 条音频\n路径: ${AUDIO_OUTPUT_DIR}/`);
  }
}

// ==================== 文本导入 ====================
async function importSRT() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".srt,.txt";
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    let text = await file.text();
    // Normalize line endings: CRLF / CR → LF
    text = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    const blocks = text.split(/\n\n+/).filter(b => b.trim());
    const defaultVoice = document.getElementById("set-default-voice").value || voiceLibrary[0]?.id;
    for (const block of blocks) {
      const lines = block.trim().split("\n");
      if (lines.length < 1) continue;
      // Skip SRT timecode lines, extract text
      let textLine;
      if (lines.length >= 3) {
        // SRT format: number / timecode / text
        textLine = lines.slice(2).join(" ").replace(/\d{2}:\d{2}:\d{2}[.,]\d{3} --> \d{2}:\d{2}:\d{2}[.,]\d{3}/, "").trim();
      } else if (lines.length === 2) {
        // Numbered TXT: number / text — skip number line
        textLine = /^\d+$/.test(lines[0]) ? lines[1] : lines.join(" ");
      } else {
        // Single line: just text
        textLine = lines[0];
      }
      if (textLine) addClip(textLine, defaultVoice);
    }
  };
  input.click();
}

// ==================== 项目存取 ====================
function saveProject() {
  const data = {
    clipCounter: clipCounter,
    clips: clips.map(c => ({
      id: c.id,
      text: c.text,
      voice_id: c.voice_id,
      emotion: c.emotion,
      emotion_scale: c.emotion_scale,
      expression: c.expression,
      speech_rate: c.speech_rate,
      silence_duration: c.silence_duration,
      loudness_rate: c.loudness_rate || 0,
      bit_rate: c.bit_rate || null,
      model: c.model || null,
      enable_subtitle: c.enable_subtitle || false,
      speech_mode: c.speech_mode || null,
      voice_instruction: c.voice_instruction || c.cot_text || null,
      reference_text: c.reference_text || "",
      _collapsed: c._collapsed,
      status: "pending",
    })),
  };
  const jsonStr = JSON.stringify(data);
  csInterface.evalScript(`saveProjectFile('${jsonStr.replace(/'/g, "\\'")}')`, (result) => {
    if (result && result.startsWith("OK:")) {
      const name = result.substring(3).split(/[\\/]/).pop();
      document.getElementById("project-name").textContent = name;
    } else if (result !== "CANCELLED") {
      console.log("保存失败:", result);
    }
  });
}

function openProject() {
  csInterface.evalScript("loadProjectFile()", (result) => {
    if (!result || result === "CANCELLED") return;
    try {
      const data = JSON.parse(result);
      clips = (data.clips || []).map(c => ({
        ...c,
        speech_mode: c.speech_mode || null,
        voice_instruction: c.voice_instruction || c.cot_text || null,
        reference_text: c.reference_text || "",
        status: c.status || "pending",
        audio_url: null,
        duration_ms: null,
        file_size: null,
      }));
      clipCounter = data.clipCounter || clips.length + 1;
      selectedClips.clear();
      renderClipList();
      document.getElementById("project-name").textContent = "已加载项目";
    } catch (e) {
      alert("项目文件格式错误: " + e.message);
    }
  });
}

function newProject() {
  if (clips.length === 0 || confirm("确定要新建项目？当前内容将丢失。")) {
    clips = [];
    clipCounter = 1;
    selectedClips.clear();
    renderClipList();
    document.getElementById("project-name").textContent = "未命名项目";
  }
}

// ==================== 设置事件 ====================
document.getElementById("set-default-rate").addEventListener("input", function() {
  document.getElementById("rate-val").textContent = this.value;
});

// ==================== 主事件绑定 ====================
document.getElementById("btn-connect").addEventListener("click", () => connect());
document.getElementById("btn-new-project").addEventListener("click", newProject);
document.getElementById("btn-save-project").addEventListener("click", saveProject);
document.getElementById("btn-load-project").addEventListener("click", openProject);
document.getElementById("btn-add-clip").addEventListener("click", () => addClip());
document.getElementById("btn-import-srt").addEventListener("click", importSRT);
document.getElementById("btn-select-all").addEventListener("click", toggleSelectAll);
document.getElementById("btn-batch-delete").addEventListener("click", openDeleteModal);
document.getElementById("btn-delete-cancel").addEventListener("click", closeDeleteModal);
document.getElementById("btn-delete-confirm").addEventListener("click", confirmBatchDelete);
document.getElementById("btn-generate-all").addEventListener("click", generateAll);
document.getElementById("btn-generate-selected").addEventListener("click", generateSelected);
document.getElementById("btn-import-pr").addEventListener("click", importToPR);
document.getElementById("btn-test-conn").addEventListener("click", () => connect("set-ip", "set-port"));
document.getElementById("btn-clear-cache").addEventListener("click", clearCache);

document.querySelectorAll(".tab").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
    tab.classList.add("active");
    document.getElementById(`tab-${tab.dataset.tab}`).classList.add("active");
  });
});

// 快捷键
document.addEventListener("keydown", (e) => {
  if (e.ctrlKey && e.shiftKey && e.key === "G") { e.preventDefault(); generateAll(); }
  if (e.ctrlKey && !e.shiftKey && e.key === "g") { e.preventDefault(); generateSelected(); }
});

// 自动连接
try {
  const saved = localStorage.getItem("voicelab_state");
  if (saved) {
    const state = JSON.parse(saved);
    document.getElementById("ip-input").value = state.ip || "127.0.0.1";
    document.getElementById("port-input").value = state.port || "9527";
    document.getElementById("set-ip").value = state.ip || "127.0.0.1";
    document.getElementById("set-port").value = state.port || "9527";
    if (state.output_dir) {
      AUDIO_OUTPUT_DIR = state.output_dir;
      document.getElementById("set-output-dir").value = state.output_dir;
    }
    setTimeout(connect, 300);
  }
} catch (e) {}

window.addEventListener("beforeunload", () => {
  AUDIO_OUTPUT_DIR = document.getElementById("set-output-dir").value || "D:/voice_cache";
  localStorage.setItem("voicelab_state", JSON.stringify({
    ip: document.getElementById("ip-input").value,
    port: document.getElementById("port-input").value,
    output_dir: AUDIO_OUTPUT_DIR,
  }));
});
