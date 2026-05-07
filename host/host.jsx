// host.jsx — ExtendScript for Premiere Pro 2024 (24.x)

function importAudioToTimeline(jsonStr, atPlayhead, autoFade) {
    var items;
    try { items = JSON.parse(jsonStr); }
    catch (e) { return "ERROR: invalid JSON - " + e.message; }

    var project = app.project;
    var sequence = project.activeSequence;
    if (!sequence) return "ERROR: no active sequence. Open a sequence first.";

    var playheadTicks = 0;
    try { playheadTicks = sequence.getPlayerPosition().ticks; } catch (e) {}

    var cursor = atPlayhead ? playheadTicks : 0;
    var result = [];

    for (var i = 0; i < items.length; i++) {
        var item = items[i];
        var filePath = item.path;
        var file = new File(filePath);

        if (!file.exists) {
            result.push({ id: item.id, error: "file not found: " + filePath });
            continue;
        }

        try {
            var imported = project.importFiles([filePath]);
            if (!imported || imported.length === 0) {
                result.push({ id: item.id, error: "import failed" });
                continue;
            }
            var clip = imported[0];

            var audioTracks = sequence.audioTracks;
            var targetTrackIndex = 0;
            for (var t = 0; t < audioTracks.numTracks; t++) {
                if (audioTracks[t].type === 1) { targetTrackIndex = t; break; }
            }

            var insertTime = sequence.createTime(cursor);
            sequence.insertClip(clip, targetTrackIndex, insertTime);

            var durationTicks = item.duration_ms ? (item.duration_ms * 254000) : clip.duration.ticks;
            cursor += durationTicks;
            result.push({ id: item.id, inserted: true });
        } catch (e) {
            result.push({ id: item.id, error: e.message });
        }
    }

    return JSON.stringify(result);
}

"host.jsx loaded — OK";
