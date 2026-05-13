// host.js - UXP 主进程，处理需要宿主 API 的操作
console.log("=== host.js loaded ===");
const ppro = require("premierepro");
const { localFileSystem } = require("uxp").storage;

// 导入音频到时间线
async function importAudioToTimeline(args) {
    const { items, importAtPlayhead } = args;
    const project = ppro.Project.getActiveProject();
    const sequence = project.activeSequence;
    if (!sequence) {
        return { error: "没有激活的序列" };
    }

    let cursor = importAtPlayhead ? sequence.CTI.timecode.seconds : 0;

    // 确保有音频轨
    const audioTracks = sequence.audioTracks;
    if (audioTracks.numTracks === 0) {
        // 创建轨道（可能需要具体 API 调整）
        audioTracks.createTrack();
    }
    const targetTrack = audioTracks[0];
    const results = [];

    for (const item of items) {
        try {
            const imported = await project.importFiles([item.path]);
            if (imported && imported.length > 0) {
                const media = imported[0];
                await targetTrack.insertClip(media, cursor);
                const atSec = cursor;
                cursor += item.duration_ms / 1000;
                results.push({ id: item.id, inserted: true, at_sec: atSec });
            } else {
                results.push({ id: item.id, error: "导入文件失败" });
            }
        } catch (e) {
            results.push({ id: item.id, error: e.message });
        }
    }
    return results;
}

// 保存项目
async function saveProject(jsonStr) {
    const file = await localFileSystem.getFileForSaving("项目.voicelab", { types: ["voicelab"] });
    if (!file) return { cancelled: true };
    await file.write(jsonStr);
    return { path: file.nativePath, name: file.name };
}

// 加载项目
async function loadProject() {
    const file = await localFileSystem.getFileForOpening({ types: ["voicelab"] });
    if (!file) return { cancelled: true };
    const content = await file.read();
    return { content };
}

// 消息监听
window.addEventListener("message", async (event) => {
    const msg = event.data;
    let result = null;
    try {
        switch (msg.action) {
            case "importToTimeline":
                result = await importAudioToTimeline(msg.payload);
                break;
            case "saveProject":
                result = await saveProject(msg.payload);
                break;
            case "loadProject":
                result = await loadProject();
                break;
            default:
                return;
        }
    } catch (e) {
        result = { error: e.message };
    }
    event.source.postMessage({ id: msg.id, action: msg.action + "Result", result: result });
});

console.log("Host process ready");