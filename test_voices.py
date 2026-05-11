#!/usr/bin/env python3
"""voice_library.json 数据验证 + detect_category 单元测试"""
import json
import sys
from pathlib import Path

SERVER = Path(__file__).parent / "server"
sys.path.insert(0, str(SERVER))

from tts_engine import TTSEngine

# 假装有 API key 初始化（只测分类，不调 API）
engine = TTSEngine(api_key="test_key")

voices = engine.voices
total = len(voices)

errors = []

# 1. 总量
if total != 457:
    errors.append(f"总量: {total} ≠ 457")

# 2. category 分布
from collections import Counter
cats = Counter(v["category"] for v in voices.values())
print(f"总量: {total}")
for k in ["2.0", "1.0多感情", "1.0"]:
    print(f"  {k}: {cats.get(k, 0)}")

# 3. 每个 voice 必要字段
required = ["id", "name", "voice_type", "version", "category", "capabilities"]
for v in voices.values():
    for f in required:
        if f not in v:
            errors.append(f"{v['id']}: 缺字段 {f}")
    caps = v.get("capabilities", {})
    if "emotions" not in caps:
        errors.append(f"{v['id']}: capabilities 缺 emotions")
    if not isinstance(caps.get("emotions"), list):
        errors.append(f"{v['id']}: emotions 不是 list")

# 4. category vs version vs emotions 一致性
for v in voices.values():
    cat = v["category"]
    ver = v["version"]
    emo = v["capabilities"]["emotions"]
    emo_n = len(emo)
    ctxt = v["capabilities"].get("context_texts", False)

    # 2.0 必须是 version=2.0
    if cat == "2.0" and ver != "2.0":
        errors.append(f"{v['name']}: cat=2.0 但 ver={ver}")

    # 1.0/1.0多感情 必须是 version=1.0
    if cat in ("1.0", "1.0多感情") and ver != "1.0":
        errors.append(f"{v['name']}: cat={cat} 但 ver={ver}")

    # 1.0多感情 必须有多个 emotion
    if cat == "1.0多感情" and emo_n <= 1:
        errors.append(f"{v['name']}: cat=1.0多感情 但 emotions={emo_n}")

    # 1.0 必须只有 neutral
    if cat == "1.0" and emo != ["neutral"]:
        errors.append(f"{v['name']}: cat=1.0 但 emotions={emo}")

    # 2.0 必须有 emotion_scale
    if cat == "2.0" and not v["capabilities"].get("emotion_scale"):
        errors.append(f"{v['name']}: 2.0 缺 emotion_scale")

# 5. ICL 音色全部回 category=1.0（排除 saturn_ 前缀的 tob）
for v in voices.values():
    vt = v["voice_type"]
    if (vt.startswith("ICL_") or vt.endswith("_tob")) and not vt.startswith("saturn_"):
        if v["category"] != "1.0":
            errors.append(f"{v['name']}: ICL/tob 但 category={v['category']}")

# 6. resource_id 逻辑
for v in voices.values():
    rid = engine._resource_id(v["version"])
    if v["version"] == "2.0" and rid != "seed-tts-2.0":
        errors.append(f"{v['name']}: resource_id 错误")
    if v["version"] == "1.0" and rid != "seed-tts-1.0":
        errors.append(f"{v['name']}: resource_id 错误")

# 7. 白名单中的 voice_type 确实存在
from rebuild_voices import MULTI_EMOTION_VOICE_TYPES
voice_type_set = {v["voice_type"] for v in voices.values()}
missing_whitelist = MULTI_EMOTION_VOICE_TYPES - voice_type_set
if missing_whitelist:
    print(f"\nWARN: {len(missing_whitelist)} whitelist voice_types not in library:")
    for vt in sorted(missing_whitelist)[:10]:
        print(f"  {vt}")

# 结论
print(f"\nErrors: {len(errors)}")
for e in errors[:20]:
    print(f"  FAIL {e}")
if not errors:
    print("  PASS all checks")
