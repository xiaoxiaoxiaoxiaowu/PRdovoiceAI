#!/usr/bin/env python3
"""清洗 voice_library.json — 根据 voice_type 后缀修正 version 和 capabilities"""
import json
from pathlib import Path

LIB_PATH = Path(__file__).parent / "voice_library.json"

# 2.0 全能力音色 (uranus_bigtts / saturn_)
CAPS_20_FULL = {
    "emotions": ["neutral", "happy", "sad", "angry", "fearful", "surprised"],
    "emotion_scale": True,
    "context_texts": True,
    "voice_instruction": True,
    "voice_tag": True,
    "reference_text": True,
    "asmr": True,
    "speech_rate_range": [-50, 100],
    "silence_duration_range": [0, 30000],
}

# 1.0 基础能力 (mars_bigtts / moon_bigtts)
CAPS_10_BASIC = {
    "emotions": ["neutral"],
    "emotion_scale": False,
    "context_texts": False,
    "voice_instruction": False,
    "voice_tag": False,
    "reference_text": False,
    "asmr": True,
    "speech_rate_range": [-50, 100],
    "silence_duration_range": [0, 30000],
}

# 1.0多感情 (mars/moon 但有情感参数支持)
CAPS_10_MULTI = {
    "emotions": ["neutral", "happy", "sad", "angry", "fearful"],
    "emotion_scale": False,
    "context_texts": False,
    "voice_instruction": False,
    "voice_tag": False,
    "reference_text": False,
    "asmr": True,
    "speech_rate_range": [-50, 100],
    "silence_duration_range": [0, 30000],
}

# ICL 声音复刻
CAPS_ICL = {
    "emotions": ["neutral"],
    "emotion_scale": False,
    "context_texts": True,
    "voice_instruction": True,
    "voice_tag": False,
    "reference_text": False,
    "asmr": False,
    "speech_rate_range": [-50, 100],
    "silence_duration_range": [0, 30000],
}

# conversation_wvae 流式对话音色
CAPS_CONV = {
    "emotions": ["neutral"],
    "emotion_scale": False,
    "context_texts": False,
    "voice_instruction": False,
    "voice_tag": False,
    "reference_text": False,
    "asmr": False,
    "speech_rate_range": [-50, 100],
    "silence_duration_range": [0, 30000],
}


def detect_and_fix(voice: dict) -> dict:
    vt = voice.get("voice_type", "")

    # 2.0: uranus_bigtts
    if vt.endswith("_uranus_bigtts"):
        voice["version"] = "2.0"
        voice["capabilities"] = dict(CAPS_20_FULL)
        return voice

    # 2.0: saturn_ prefix (COT/QA capable)
    if vt.startswith("saturn_"):
        caps = dict(CAPS_20_FULL)
        caps["emotions"] = ["neutral", "happy", "sad", "angry", "fearful", "surprised"]
        voice["version"] = "2.0"
        voice["capabilities"] = caps
        return voice

    # ICL / tob 声音复刻
    if vt.startswith("ICL_") or vt.endswith("_tob"):
        caps = dict(CAPS_ICL)
        voice["version"] = "1.0"
        voice["capabilities"] = caps
        return voice

    # conversation_wvae 流式对话
    if vt.endswith("_conversation_wvae_bigtts"):
        caps = dict(CAPS_CONV)
        voice["version"] = "1.0"
        voice["capabilities"] = caps
        return voice

    # mars_bigtts — 部分支持多感情（根据 name 中是否有 "2.0" 标记判断）
    if vt.endswith("_mars_bigtts"):
        name = voice.get("name", "")
        # 官方表里 mars 后缀但标注了 "2.0" 的音色→多感情
        if "2.0" in name:
            caps = dict(CAPS_10_MULTI)
        else:
            caps = dict(CAPS_10_BASIC)
        voice["version"] = "1.0"
        voice["capabilities"] = caps
        return voice

    # moon_bigtts
    if vt.endswith("_moon_bigtts"):
        name = voice.get("name", "")
        if "2.0" in name:
            caps = dict(CAPS_10_MULTI)
        else:
            caps = dict(CAPS_10_BASIC)
        voice["version"] = "1.0"
        voice["capabilities"] = caps
        return voice

    # 兜底：保留原值但加 category
    return voice


def main():
    with open(LIB_PATH, encoding="utf-8") as f:
        lib = json.load(f)

    fixed = 0
    for v in lib["voices"]:
        old_ver = v.get("version")
        detect_and_fix(v)
        if v.get("version") != old_ver:
            fixed += 1

    with open(LIB_PATH, "w", encoding="utf-8") as f:
        json.dump(lib, f, ensure_ascii=False, indent=2)

    stats = {}
    for v in lib["voices"]:
        cat = v.get("version", "?")
        stats[cat] = stats.get(cat, 0) + 1

    print(f"清洗完成: {len(lib['voices'])} 个音色, {fixed} 个修正")
    for k, v in sorted(stats.items()):
        print(f"  {k}: {v}")


if __name__ == "__main__":
    main()
