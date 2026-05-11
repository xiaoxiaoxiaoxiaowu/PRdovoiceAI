#!/usr/bin/env python3
"""
重建 voice_library.json — 完全按火山引擎官方音色表分类
https://www.volcengine.com/docs/6561/1257544

分类规则（来自官方文档实际标注）：
  2.0        — voice_type 以 _uranus_bigtts 结尾，或 saturn_ 开头
  1.0多感情  — 1.0 系音色（mars/moon/conversation_wvae）中官方标注"情感变化"的
  1.0        — 其余 1.0 系音色，仅支持 neutral
  ICL       — voice_type 以 ICL_ 开头或以 _tob 结尾，声音复刻独立体系
"""
import json
from pathlib import Path

LIB_PATH = Path(__file__).parent / "voice_library.json"

# ============ 能力模板 ============

CAPS_20 = {
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

# ============ 按官方表标记的 1.0多感情 voice_type 白名单 ============
# 来自官方文档 1.0 区段中标注"情感变化"的 mars/moon/conversation 音色
MULTI_EMOTION_VOICE_TYPES = {
    # mars_bigtts — 官方标注有情感变化
    "zh_female_kefunvsheng_mars_bigtts",       # 暖阳女声 2.0
    "zh_male_M100_conversation_wvae_bigtts",   # 悠悠君子 2.0
    "zh_female_maomao_conversation_wvae_bigtts", # 文静毛毛 2.0
    "zh_female_wenrouxiaoya_moon_bigtts",      # 温柔小雅 2.0
    "zh_male_tiancaitongsheng_mars_bigtts",    # 天才童声 2.0
    "zh_male_sunwukong_mars_bigtts",           # 猴哥 2.0
    "zh_male_xionger_mars_bigtts",             # 熊二 2.0
    "zh_female_peiqi_mars_bigtts",             # 佩奇猪 2.0
    "zh_female_wuzetian_mars_bigtts",          # 武则天 2.0
    "zh_female_gujie_mars_bigtts",             # 顾姐 2.0
    "zh_female_yingtaowanzi_mars_bigtts",      # 樱桃丸子 2.0
    "zh_male_chunhui_mars_bigtts",             # 广告解说 2.0
    "zh_female_shaoergushi_mars_bigtts",       # 少儿故事 2.0
    "zh_male_silang_mars_bigtts",              # 四郎 2.0
    "zh_female_qiaopinvsheng_mars_bigtts",     # 俏皮女声 2.0
    "zh_male_lanxiaoyang_mars_bigtts",         # 懒音绵宝 2.0
    "zh_male_dongmanhaimian_mars_bigtts",      # 亮嗓萌仔 2.0
    "zh_male_jieshuonansheng_mars_bigtts",     # 磁性解说男声/Morgan 2.0
    "zh_female_jitangmeimei_mars_bigtts",      # 鸡汤妹妹/Hope 2.0
    "zh_female_tiexinnvsheng_mars_bigtts",     # 贴心女声/Candy 2.0
    "zh_female_mengyatou_mars_bigtts",         # 萌丫头/Cutey 2.0
    "zh_male_changtianyi_mars_bigtts",         # 悬疑解说 2.0
    "zh_male_ruyaqingnian_mars_bigtts",        # 儒雅青年 2.0
    "zh_male_baqiqingshu_mars_bigtts",         # 霸气青叔 2.0
    "zh_male_qingcang_mars_bigtts",            # 擎苍 2.0
    "zh_male_yangguangqingnian_mars_bigtts",   # 活力小哥 2.0
    "zh_female_gufengshaoyu_mars_bigtts",      # 古风少御 2.0
    "zh_female_wenroushunv_mars_bigtts",       # 温柔淑女 2.0
    "zh_male_fanjuanqingnian_mars_bigtts",     # 反卷青年 2.0
    "zh_female_jiaochuan_mars_bigtts",         # 娇喘女声 2.0
    "zh_male_livelybro_mars_bigtts",           # 开朗弟弟 2.0
    "zh_female_flattery_mars_bigtts",          # 谄媚女声 2.0
    # moon_bigtts — 官方标注有情感变化
    "zh_female_gaolengyujie_moon_bigtts",      # 高冷御姐 2.0
    "zh_male_aojiaobazong_moon_bigtts",        # 傲娇霸总 2.0
    "zh_female_meilinvyou_moon_bigtts",        # 魅力女友 2.0
    "zh_male_shenyeboke_moon_bigtts",          # 深夜播客 2.0
    "zh_female_sajiaonvyou_moon_bigtts",       # 柔美女友 2.0
    "zh_female_yuanqinvyou_moon_bigtts",       # 撒娇学妹 2.0
    "zh_male_dongfanghaoran_moon_bigtts",      # 东方浩然 2.0
    "zh_female_wenrouxiaoya_moon_bigtts",      # 温柔小雅 2.0
    # conversation_wvae_bigtts — 官方标注有情感变化
    "zh_male_M100_conversation_wvae_bigtts",   # 悠悠君子 2.0 (conv)
    "zh_female_maomao_conversation_wvae_bigtts", # 文静毛毛 2.0 (conv)
    "zh_female_sophie_conversation_wvae_bigtts", # Sophie
    "zh_male_xudong_conversation_wvae_bigtts", # Daniel
    "en_female_dacey_conversation_wvae_bigtts", # Daisy
    "en_male_charlie_conversation_wvae_bigtts", # Owen
}


def classify(v: dict) -> tuple[str, dict]:
    """返回 (category, capabilities)"""
    vt = v.get("voice_type", "")

    # 2.0: uranus
    if vt.endswith("_uranus_bigtts"):
        return ("2.0", dict(CAPS_20))

    # 2.0: saturn_
    if vt.startswith("saturn_"):
        return ("2.0", dict(CAPS_20))

    # 1.0多感情: 白名单中的 mars/moon/conversation
    if vt in MULTI_EMOTION_VOICE_TYPES:
        return ("1.0多感情", dict(CAPS_10_MULTI))

    # ICL / tob
    if vt.startswith("ICL_") or vt.endswith("_tob"):
        return ("1.0", dict(CAPS_ICL))

    # 纯 1.0
    return ("1.0", dict(CAPS_10_BASIC))


def main():
    with open(LIB_PATH, encoding="utf-8") as f:
        lib = json.load(f)

    for v in lib["voices"]:
        cat, caps = classify(v)
        v["category"] = cat
        v["version"] = "2.0" if cat == "2.0" else "1.0"
        # 保存原始能力字段供参考
        old_caps = v.get("capabilities", {})
        v["capabilities"] = caps
        # 保留原语种字段
        if "language" not in v and old_caps.get("language"):
            pass  # language already handled in schema

    # 更新元数据
    lib["version"] = "2.0.0"
    lib["last_updated"] = "2026-05-11"
    lib["emotions_cn"] = ["neutral", "happy", "sad", "angry", "fearful", "surprised"]
    lib["emotions_en"] = ["neutral", "happy", "angry", "sad", "excited", "chat"]

    with open(LIB_PATH, "w", encoding="utf-8") as f:
        json.dump(lib, f, ensure_ascii=False, indent=2)

    # 统计
    from collections import Counter
    cats = Counter(v["category"] for v in lib["voices"])
    print(f"重建完成: {len(lib['voices'])} 个音色")
    for k in ["2.0", "1.0多感情", "1.0"]:
        print(f"  {k}: {cats.get(k, 0)}")


if __name__ == "__main__":
    main()
