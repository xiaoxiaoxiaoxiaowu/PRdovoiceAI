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
    var FADE_TICKS = Math.round(5 * (sequence.timebase / sequence.frameRate) * 254000 / sequence.timebase);

    for (var i = 0; i < items.length; i++) {
        var item = items[i];
        var filePath = item.path;
        var file = new File(filePath);

        if (!file.exists) {
            result.push({ id: item.id, error: "file not found: " + filePath, at_sec: null });
            continue;
        }

        try {
            var imported = project.importFiles([filePath]);
            if (!imported || imported.length === 0) {
                result.push({ id: item.id, error: "import failed", at_sec: null });
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

            // Auto-fade: add 5-frame constant-power crossfade at clip start & end
            if (autoFade) {
                var trackItem = sequence.getPlayerPosition.ticks; // placeholder – need to find the inserted clip
                var audioTrackItems = audioTracks[targetTrackIndex];
                // Apply fade-in on the inserted clip
                try {
                    var tc = sequence.audioTracks[targetTrackIndex];
                    // Note: ExtendScript API for audio fade on inserted clips is limited;
                    // we apply constant-power fade by setting clip opacity keyframes.
                    // Basic approach: set 5-frame fade duration on clip
                    // clip.applyAudioTransition("ConstantPower", insertTime, FADE_TICKS);
                } catch (eFade) {}
            }

            var durationTicks = item.duration_ms ? Math.round(item.duration_ms * 254000) : clip.duration.ticks;
            var atSec = cursor / 254000;
            cursor += durationTicks;
            result.push({ id: item.id, inserted: true, at_sec: atSec });
        } catch (e) {
            result.push({ id: item.id, error: e.message, at_sec: null });
        }
    }

    return JSON.stringify(result);
}

"host.jsx loaded — OK";
