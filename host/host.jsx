// JSON polyfill for old ExtendScript (Array.isArray 兼容)
if (typeof JSON === "undefined") {
    JSON = {
        parse: function (s) {
            return eval('(' + s + ')');
        },
        stringify: function (obj) {
            var t = typeof obj;
            if (t === "string") {
                return '"' + obj.replace(/"/g, '\\"') + '"';
            }
            if (t === "number" || t === "boolean") {
                return String(obj);
            }
            if (obj === null) {
                return "null";
            }
            // 用 instanceof 代替 Array.isArray
            if (obj instanceof Array) {
                var a = [];
                for (var i = 0; i < obj.length; i++) {
                    a.push(JSON.stringify(obj[i]));
                }
                return "[" + a.join(",") + "]";
            }
            if (t === "object") {
                var p = [];
                for (var k in obj) {
                    if (obj.hasOwnProperty(k)) {
                        p.push('"' + k + '":' + JSON.stringify(obj[k]));
                    }
                }
                return "{" + p.join(",") + "}";
            }
            return "null";
        }
    };
}

// ==================== 保存项目 ====================
function saveProjectFile(jsonStr) {
    try {
        var file = File.saveDialog("保存项目", "*.voicelab");
        if (!file) return "CANCELLED";
        file.encoding = "UTF-8";
        file.open("w");
        file.write(jsonStr);
        file.close();
        return "OK:" + file.fsName;
    } catch (e) {
        return "ERROR: " + e.message;
    }
}

// ==================== 打开项目 ====================
function loadProjectFile() {
    try {
        var file = File.openDialog("打开项目", "*.voicelab");
        if (!file) return "CANCELLED";
        file.encoding = "UTF-8";
        file.open("r");
        var content = file.read();
        file.close();
        return content;
    } catch (e) {
        return "ERROR: " + e.message;
    }
}

// ==================== 导入音频到时间线 ====================
function importAudioToTimeline(jsonStr, atPlayhead, autoFade) {
    try {
        var items = JSON.parse(jsonStr);
    } catch (e) {
        return "ERROR: invalid JSON - " + e.message;
    }

    var proj = app.project;
    var seq = proj.activeSequence;
    if (!seq) return "ERROR: no active sequence. Open a sequence first.";

    var playheadTicks = 0;
    try { playheadTicks = seq.getPlayerPosition().ticks; } catch (e) {}

    var cursor = atPlayhead ? playheadTicks : 0;
    var result = [];

    // 确保有音频轨
    var audioTracks = seq.audioTracks;
    if (audioTracks.numTracks === 0) {
        try {
            seq.createAudioTrack(1); // 1 = 单声道
        } catch (e) {
            return "ERROR: cannot create audio track - " + e.message;
        }
    }
    var targetTrack = audioTracks[0];

    for (var i = 0; i < items.length; i++) {
        var item = items[i];
        var filePath = item.path;
        var file = new File(filePath);

        if (!file.exists) {
            result.push({ id: item.id, error: "file not found: " + filePath, at_sec: null });
            continue;
        }

        try {
            var imported = proj.importFiles([filePath]);
            if (!imported || imported.length === 0) {
                result.push({ id: item.id, error: "import failed", at_sec: null });
                continue;
            }
            var clip = imported[0];

            var insertTime = seq.createTime(cursor);
            targetTrack.insertClip(clip, insertTime);

            var durationTicks = item.duration_ms ? Math.round(item.duration_ms * 254000) : clip.duration.ticks;
            var atSec = cursor / 254000;
            cursor += durationTicks;

            result.push({ id: item.id, inserted: true, at_sec: atSec });
        } catch (e) {
            result.push({ id: item.id, error: e.message, at_sec: null });
        }
    }

    try {
        return JSON.stringify(result);
    } catch (e) {
        return "ERROR: JSON.stringify failed - " + e.message;
    }
}

"host.jsx loaded — OK";