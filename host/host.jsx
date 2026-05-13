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

function importAudioToTimeline(jsonStr, atPlayhead, autoFade) {
    var items;
    try { items = JSON.parse(jsonStr); }
    catch (e) { return "ERROR: invalid JSON - " + e.message; }

    var proj = app.project;
    var seq = proj.activeSequence;
    if (!seq) return "ERROR: no active sequence. Open a sequence first.";

    // 获取播放头位置（秒）
    var playheadSec = 0;
    try { playheadSec = seq.getPlayerPosition().seconds; } catch (e) {}

    var cursorSec = atPlayhead ? playheadSec : 0;
    var result = [];

    // 确保有音频轨道，并获取稳定引用
    var audioTracks = seq.audioTracks;
    if (audioTracks.numTracks === 0) {
        seq.createAudioTrack(1);
    }
    var targetTrack = seq.audioTracks[0];

    for (var i = 0; i < items.length; i++) {
        var item = items[i];
        var filePath = item.path;
        var file = new File(filePath);

        if (!file.exists) {
            result.push({ id: item.id, error: "file not found: " + filePath, at_sec: null });
            continue;
        }

        // ... 前面获取轨道逻辑一致 ...

    try {
    // 1. 执行导入
        var importResult = proj.importFiles([filePath], true, proj.rootItem, false);
    
        var clip = null;
    
    // 2. 类型检查：处理某些版本返回 Boolean，某些版本返回 Array 的情况
        if (importResult === true) {
            // 如果返回布尔值，我们需要从根目录抓取最后加入的那个项
            clip = proj.rootItem.children[proj.rootItem.children.numItems - 1];
        } else if (importResult instanceof Array && importResult.length > 0) {
            // 如果返回数组，直接取第一个
            clip = importResult[0];
    }

    // 3. 安全性二次检查
        if (!clip || clip.type === undefined) { 
        // 如果抓到的不是 ProjectItem，尝试通过名称匹配（最后一道防线）
            for (var k = proj.rootItem.children.numItems - 1; k >= 0; k--) {
                if (proj.rootItem.children[k].name === file.name) {
                    clip = proj.rootItem.children[k];
                    break;
                }
            }
        }

        if (clip) {
            var insertTime = new Time();
            insertTime.seconds = cursorSec;

            // 执行插入
            targetTrack.insertClip(clip, insertTime); 
        
            // 推进 cursor...
        } else {
            result.push({ id: item.id, error: "Failed to resolve ProjectItem object" });
        }
    } catch (e) {
        result.push({ id: item.id, error: "Insert error: " + e.message });
    }
        }

    return JSON.stringify(result);
}

"host.jsx loaded — OK";