// ==================== 配置 ====================
let AUDIO_OUTPUT_DIR = "D:/voice_cache";

// ==================== 全局状态 ====================
var csInterface = new CSInterface();
let backendUrl = "http://127.0.0.1:9527";
let voiceLibrary = [];
let clips = [];
let selectedClips = new Set();
let generating = false;

// ==================== 连接 ====================
async function connect() {
  const ip = document.getElementById("ip-input").value;
  const port = document.getElementById("port-input").value;
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

// ==================== 音色库渲染 ====================
function renderVoiceList() {
  const container = document.getElementById("voice-list");
  const versionFilter = document.getElementById("filter-version").value;
  const genderFilter = document.getElementById("filter-gender").value;
  const capFilter = document.getElementById("filter-capability").value;
  const search = document.getElementById("voice-search").value.toLowerCase();

  let filtered = voiceLibrary.filter(v => {
    if (versionFilter !== "all" && v.version !== versionFilter) return false;
    if (genderFilter !== "all" && v.gender !== genderFilter) return false;
    if (capFilter !== "all") {
      const caps = v.capabilities;
      if (capFilter === "emotion" && (!caps.emotions || caps.emotions.length <= 1)) return false;
      if (capFilter === "context_texts" && !caps.context_texts) return false;
      if (capFilter === "asmr" && !caps.asmr) return false;
    }
    if (search && !v.name.toLowerCase().includes(search) && !v.voice_type.toLowerCase().includes(search)) return false;
    return true;
  });

  container.innerHTML = filtered.map(v => `
    <div class="voice-card ${v.version === '2.0' ? 'v20' : 'v10'}">
      <div class="voice-card-header">
        <span class="voice-name">${v.name}</span>
        <span class="voice-badge gender">${v.gender === 'female' ? '女' : '男'}</span>
        <span class="voice-badge version">${v.version}</span>
        ${v.version === '2.0' ? '<span class="voice-badge recommend">⭐推荐</span>' : ''}
      </div>
      <div class="voice-card-meta">
        <div>voice_type: <code>${v.voice_type}</code></div>
        <div>情感: ${(v.capabilities.emotions || ['neutral']).join(' ')}</div>
        <div>
          ${v.capabilities.context_texts ? '✅ 指令遵循 ' : ''}
          ${v.capabilities.voice_instruction ? '✅ [#指令] ' : ''}
          ${v.capabilities.asmr ? '✅ ASMR ' : ''}
        </div>
        <div>语速: ${v.capabilities.speech_rate_range?.[0] || -50} ~ ${v.capabilities.speech_rate_range?.[1] || 100}</div>
      </div>
      <button class="btn btn-sm btn-set-default" data-voice-id="${v.id}">设为默认</button>
    </div>
  `).join("");

  container.querySelectorAll(".btn-set-default").forEach(btn => {
    btn.addEventListener("click", () => {
      document.getElementById("set-default-voice").value = btn.dataset.voiceId;
    });
  });
}

document.getElementById("filter-version").addEventListener("change", renderVoiceList);
document.getElementById("filter-gender").addEventListener("change", renderVoiceList);
document.getElementById("filter-capability").addEventListener("change", renderVoiceList);
document.getElementById("voice-search").addEventListener("input", renderVoiceList);

function updateDefaultVoiceSelect() {
  const sel = document.getElementById("set-default-voice");
  sel.innerHTML = voiceLibrary.map(v =>
    `<option value="${v.id}">${v.name} [${v.version}]</option>`
  ).join("");
}

// ==================== 剪辑列表 ====================
let clipCounter = 1;

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
    status: "pending",
    audio_url: null,
    duration_ms: null,
    file_size: null,
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
    const emotions = voice?.capabilities?.emotions || ["neutral"];
    const hasContextTexts = voice?.capabilities?.context_texts || false;
    const isCollapsed = clip._collapsed !== false;

    return `
      <div class="clip-item ${clip.status} ${selectedClips.has(clip.id) ? 'selected' : ''}">
        <div class="clip-header" onclick="toggleClip('${clip.id}')">
          <input type="checkbox" class="clip-checkbox" data-clip-id="${clip.id}"
                 ${selectedClips.has(clip.id) ? 'checked' : ''}>
          <span class="clip-id">#${clip.id}</span>
          <span class="clip-preview">${clip.text.substring(0, 40)}${clip.text.length > 40 ? '...' : ''}</span>
          <span class="clip-status-icon">${statusIcon(clip.status)}</span>
          <span class="clip-toggle">${isCollapsed ? '▶' : '▼'}</span>
        </div>
        <div class="clip-body" style="display:${isCollapsed ? 'none' : 'block'}">
          <div class="clip-field">
            <label>音色:</label>
            <select class="clip-voice-select" data-clip-id="${clip.id}">
              ${voiceLibrary.map(v => `<option value="${v.id}" ${v.id === clip.voice_id ? 'selected' : ''}>${v.name}</option>`).join("")}
            </select>
          </div>

          <div class="clip-field">
            <label>文本:</label>
            <textarea class="clip-text" data-clip-id="${clip.id}" rows="2">${clip.text}</textarea>
          </div>

          <div class="clip-tools">
            ${version === '2.0' && voice?.capabilities?.voice_instruction ? `
            <button class="btn btn-xs btn-insert-instruction" data-clip-id="${clip.id}">[#指令]</button>` : ''}
            ${version === '2.0' ? `
            <button class="btn btn-xs btn-insert-json20" data-clip-id="${clip.id}">{{2.0}}</button>` : ''}
            ${version === '1.0' ? `
            <button class="btn btn-xs btn-insert-json10" data-clip-id="${clip.id}">{{1.0}}</button>` : ''}
          </div>

          ${emotions.length > 1 ? `
          <div class="clip-field">
            <label>情感:</label>
            <select class="clip-emotion" data-clip-id="${clip.id}">
              ${emotions.map(e => `<option value="${e}" ${e === clip.emotion ? 'selected' : ''}>${e}</option>`).join("")}
            </select>
            ${version === '2.0' ? `
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

          <div class="clip-actions-row">
            <button class="btn btn-sm btn-preview" data-clip-id="${clip.id}"
                    ${clip.status !== 'done' ? 'disabled' : ''}>▶ 试听</button>
            <button class="btn btn-sm btn-regenerate" data-clip-id="${clip.id}">🔄 重新生成</button>
            <button class="btn btn-sm btn-duplicate" data-clip-id="${clip.id}">📋 复制</button>
            <button class="btn btn-sm btn-delete" data-clip-id="${clip.id}">🗑 删除</button>
          </div>

          <div class="clip-status">
            ${clip.status === 'done' ? `✅ 已生成 | ${clip.duration_ms ? (clip.duration_ms/1000).toFixed(1) + 's' : ''} | ${clip.file_size ? formatBytes(clip.file_size) : ''}` :
              clip.status === 'error' ? `❌ 合成失败` :
              clip.status === 'generating' ? `⏳ 生成中...` : `⏳ 待生成`}
          </div>
        </div>
      </div>
    `;
  }).join("");

  bindClipEvents();
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

  document.querySelectorAll(".clip-voice-select").forEach(sel => {
    sel.addEventListener("change", () => {
      const clip = clips.find(c => c.id === sel.dataset.clipId);
      if (clip) {
        clip.voice_id = sel.value;
        const voice = voiceLibrary.find(v => v.id === clip.voice_id);
        if (voice && !voice.capabilities.emotions.includes(clip.emotion)) {
          clip.emotion = voice.capabilities.emotions[0] || "neutral";
        }
        renderClipList();
      }
    });
  });

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

  document.querySelectorAll(".btn-insert-instruction").forEach(btn => {
    btn.addEventListener("click", () => insertInstruction(btn.dataset.clipId));
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
function insertInstruction(clipId) {
  const instruction = prompt("输入语音指令 (不含方括号):", "用颤抖沙哑、带着崩溃与绝望的哭腔说");
  if (instruction) {
    const ta = document.querySelector(`.clip-text[data-clip-id="${clipId}"]`);
    if (ta) {
      const pos = ta.selectionStart;
      ta.value = ta.value.substring(0, pos) + `[#${instruction}]` + ta.value.substring(pos);
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
  const payload = {
    id: clip.id,
    text: clip.text,
    voice_id: clip.voice_id,
    emotion: clip.emotion,
    emotion_scale: clip.emotion_scale,
    speech_rate: clip.speech_rate,
    silence_duration: clip.silence_duration,
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

  const importAtPlayhead = document.getElementById("set-import-at-playhead")?.checked ?? true;
  const autoFade = document.getElementById("set-auto-fade")?.checked ?? true;

  const items = doneClips.map(c => ({
    id: c.id,
    path: `${AUDIO_OUTPUT_DIR}/${c.id}.mp3`.replace(/\\/g, "\\\\"),
    duration_ms: c.duration_ms || 0,
  }));

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
document.getElementById("btn-connect").addEventListener("click", connect);
document.getElementById("btn-new-project").addEventListener("click", newProject);
document.getElementById("btn-save-project").addEventListener("click", saveProject);
document.getElementById("btn-load-project").addEventListener("click", openProject);
document.getElementById("btn-add-clip").addEventListener("click", () => addClip());
document.getElementById("btn-import-srt").addEventListener("click", importSRT);
document.getElementById("btn-generate-all").addEventListener("click", generateAll);
document.getElementById("btn-generate-selected").addEventListener("click", generateSelected);
document.getElementById("btn-import-pr").addEventListener("click", importToPR);
document.getElementById("btn-test-conn").addEventListener("click", connect);

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
