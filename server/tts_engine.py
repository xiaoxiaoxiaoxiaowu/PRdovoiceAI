"""
PRdovoiceAI TTS Engine — 完整 API 对齐版
Aligns with Volcengine OpenSpeech API v3 (2026.05)
Docs: https://www.volcengine.com/docs/6561/1598757
"""
import json
import re
import uuid
import base64
import requests
from pathlib import Path

LIB_PATH = Path(__file__).parent / "voice_library.json"

RE_VOICE_INSTRUCTION = re.compile(r'\[#([^\]]+)\]')
RE_VOICE_TAG = re.compile(r'【([^】]+)】')
RE_ADDITIONS_TAG = re.compile(r'\{\{"additions":[^}]+\}\s*\}\}')

# 1.0: 清理面板可能误塞的内联 JSON 标记（预防性移除，防止被 TTS 念出来）
RE_JSON_TAG = re.compile(r'\{\{.*?\}\s*\}\}')


class TTSEngine:
    def __init__(self, api_key: str, library_path: Path | None = None):
        self.api_key = api_key
        self.base_url = "https://openspeech.bytedance.com/api/v3/tts/unidirectional"
        self._session = requests.Session()

        lib_path = library_path or LIB_PATH
        with open(lib_path, encoding="utf-8") as f:
            lib = json.load(f)
        self.voices = {}
        for v in lib["voices"]:
            if "category" not in v:
                v["category"] = self.detect_category(v)
            self.voices[v["id"]] = v
        self.expressions = lib.get("expressions", {})

    # ============ 资源/模型映射 ============

    def _resource_id(self, version: str) -> str:
        if version == "2.0":
            return "seed-tts-2.0"
        return "seed-tts-1.0"

    def _model(self, version: str, caps: dict) -> str | None:
        """
        根据音色版本和能力推荐模型。
        v2.0 → seed-tts-2.0-expressive（更强表现力 / 支持 QA+Cot）
        v1.0 → seed-tts-1.1（音质提升 + 延迟优化）
        """
        if version == "2.0":
            return "seed-tts-2.0-expressive"
        elif version == "1.0":
            return "seed-tts-1.1"
        return None

    @staticmethod
    def detect_category(voice: dict) -> str:
        """
        从 voice_type 后缀自动检测音色分类。
        - _uranus_bigtts / saturn_ → 2.0
        - _mars_bigtts / _moon_bigtts / _conversation_wvae_bigtts → 1.0
        - ICL_ → 声音复刻，按 capabilities 判断

        1.0 中根据 emotions 数量进一步分：
        - emotions 数量 > 1 → 1.0多感情
        - emotions 数量 <= 1 → 1.0
        """
        vt = voice.get("voice_type", "")
        caps = voice.get("capabilities", {})

        # 2.0: uranus 后缀 或 saturn_ 前缀
        if vt.endswith("_uranus_bigtts") or vt.startswith("saturn_"):
            return "2.0"

        # 1.0: mars / moon / conversation_wvae 后缀
        if vt.endswith(("_mars_bigtts", "_moon_bigtts", "_conversation_wvae_bigtts")):
            emotions = caps.get("emotions", ["neutral"])
            # 多感情判定：emotions 列表 > 1 个值
            if len(emotions) > 1:
                return "1.0多感情"
            return "1.0"

        # ICL 声音复刻：有 context_texts 但底层走 seed-tts-1.0 → 1.0多感情
        if vt.startswith("ICL_") or vt.endswith("_tob"):
            if caps.get("context_texts"):
                # version 字段由 rebuild_voices.py 标记，1.0 的 ICL 归多感情
                if voice.get("version") == "1.0":
                    return "1.0多感情"
                return "2.0"
            emotions = caps.get("emotions", ["neutral"])
            return "1.0多感情" if len(emotions) > 1 else "1.0"

        # 兜底：按 version 字段
        return voice.get("version", "2.0")

    def get_voice(self, voice_id: str) -> dict:
        v = self.voices.get(voice_id)
        if not v:
            raise ValueError(f"音色 '{voice_id}' 不存在")
        return v

    # ============ 2.0: 提取 [#指令] / 【标签】/ {{"additions":...}} → context_texts ============
    def _parse_20_instructions(self, text: str) -> tuple[str, list[str]]:
        context_texts: list[str] = []

        for m in RE_VOICE_INSTRUCTION.finditer(text):
            context_texts.append(m.group(1).strip())
        text = RE_VOICE_INSTRUCTION.sub('', text)

        for m in RE_VOICE_TAG.finditer(text):
            context_texts.append(m.group(1).strip())
        text = RE_VOICE_TAG.sub('', text)

        for m in RE_ADDITIONS_TAG.finditer(text):
            try:
                obj = json.loads(m.group())
                ctx = obj.get("additions", {}).get("context_texts", [])
                context_texts.extend(ctx if isinstance(ctx, list) else [ctx])
            except json.JSONDecodeError:
                pass
        text = RE_ADDITIONS_TAG.sub('', text)

        return re.sub(r'\s+', ' ', text).strip(), context_texts

    def _split_20_segments(self, text: str) -> list[dict]:
        """按 [#指令]/【标签】/{{"additions"}} 拆分文本"""
        markers = []
        for m in RE_VOICE_INSTRUCTION.finditer(text):
            markers.append({"pos": m.start(), "end": m.end(), "ctx": [m.group(1).strip()]})
        for m in RE_VOICE_TAG.finditer(text):
            markers.append({"pos": m.start(), "end": m.end(), "ctx": [m.group(1).strip()]})
        for m in RE_ADDITIONS_TAG.finditer(text):
            try:
                obj = json.loads(m.group())
                ctx = obj.get("additions", {}).get("context_texts", [])
                markers.append({"pos": m.start(), "end": m.end(),
                                "ctx": ctx if isinstance(ctx, list) else [ctx]})
            except json.JSONDecodeError:
                pass

        if not markers:
            return [{"text": text.strip(), "context_texts": []}]

        markers.sort(key=lambda x: x["pos"])
        segments = []
        current_ctx = []
        pos = 0
        for mk in markers:
            seg_text = text[pos:mk["pos"]].strip()
            if seg_text:
                segments.append({"text": seg_text, "context_texts": list(current_ctx)})
            current_ctx = mk["ctx"]
            pos = mk["end"]
        remaining = text[pos:].strip()
        if remaining:
            segments.append({"text": remaining, "context_texts": list(current_ctx)})
        return segments or [{"text": text.strip(), "context_texts": []}]

    # ============ 1.0: 移除误塞的 JSON 标记 ============
    def _clean_json_tags(self, text: str) -> str:
        """预防性清理：移除面板可能误插入的 {{...}} 标记，防止被 TTS 念出来"""
        return re.sub(r'\s+', ' ', RE_JSON_TAG.sub('', text)).strip()

    # ============ 核心合成接口 ============
    def synthesize(
        self, text: str, voice_id: str, *,
        emotion: str = "neutral", emotion_scale: int = 4,
        speech_rate: int = 0, silence_duration: int = 0,
        loudness_rate: int = 0,
        bit_rate: int | None = None,
        model: str | None = None,
        enable_subtitle: bool = False,
        cot_text: str | None = None,
        expression: str | None = None,
        format: str = "mp3", sample_rate: int = 24000,
    ) -> dict:
        voice = self.get_voice(voice_id)
        version = voice["version"]
        caps = voice.get("capabilities", {})

        # 1.0: 清理杂标，文本原样发，情感走请求参数
        if version == "1.0":
            text = self._clean_json_tags(text)

        # 2.0: 解析 [#指令] 分段
        if version == "2.0":
            segments = self._split_20_segments(text)
            if len(segments) > 1 or (segments and segments[0].get("context_texts")):
                all_audio = []
                all_subtitles = []
                total_usage = 0
                for seg in segments:
                    if not seg["text"]:
                        continue
                    result = self._call_api(
                        text=seg["text"],
                        voice_type=voice["voice_type"],
                        resource_id="seed-tts-2.0",
                        caps=caps,
                        category=voice.get("category", ""),
                        model=model or self._model(version, caps),
                        emotion=emotion,
                        emotion_scale=emotion_scale,
                        speech_rate=speech_rate,
                        silence_duration=silence_duration,
                        loudness_rate=loudness_rate,
                        bit_rate=bit_rate,
                        enable_subtitle=enable_subtitle,
                        cot_text=cot_text if seg == segments[0] else None,
                        expression=expression,
                        context_texts=seg.get("context_texts", []),
                        fmt=format,
                        sample_rate=sample_rate,
                    )
                    all_audio.append(result["audio_bytes"])
                    if result.get("subtitles"):
                        all_subtitles.extend(result["subtitles"])
                    if result.get("usage", 0) > 0:
                        total_usage += result["usage"]
                full_audio = b"".join(all_audio)
                out = {
                    "audio_bytes": full_audio,
                    "audio_base64": base64.b64encode(full_audio).decode(),
                    "logid": "(segmented)",
                    "size": len(full_audio),
                    "subtitles": all_subtitles if all_subtitles else None,
                    "usage": total_usage if total_usage > 0 else None,
                }
                return out

        # 单段
        context_texts = []
        if version == "2.0":
            text, context_texts = self._parse_20_instructions(text)

        return self._call_api(
            text=text,
            voice_type=voice["voice_type"],
            resource_id=self._resource_id(version),
            caps=caps,
            category=voice.get("category", ""),
            model=model or self._model(version, caps),
            emotion=emotion,
            emotion_scale=emotion_scale,
            speech_rate=speech_rate,
            silence_duration=silence_duration,
            loudness_rate=loudness_rate,
            bit_rate=bit_rate,
            enable_subtitle=enable_subtitle,
            cot_text=cot_text,
            expression=expression,
            context_texts=context_texts,
            fmt=format,
            sample_rate=sample_rate,
        )

    # ============ 底层 API 调用（对齐最新文档）============
    def _call_api(
        self, text: str, voice_type: str, resource_id: str, caps: dict,
        model: str | None,
        emotion: str, emotion_scale: int, speech_rate: int, silence_duration: int,
        loudness_rate: int, bit_rate: int | None, enable_subtitle: bool,
        cot_text: str | None,
        expression: str | None, context_texts: list[str],
        fmt: str, sample_rate: int,
        category: str = "", 
    ) -> dict:
        payload = {
            "user": {"uid": "voicelab_pr"},
            "req_params": {
                "text": text,
                "speaker": voice_type,
                "audio_params": {"format": fmt, "sample_rate": sample_rate},
            },
        }

        # --- model（对齐文档：默认不传 = seed-tts-2.0-standard）---
        if model:
            payload["req_params"]["model"] = model

        ap = payload["req_params"]["audio_params"]
        additions_dict = {}

        # --- 语速 ---
        if speech_rate != 0:
            ap["speech_rate"] = speech_rate

        # --- 音量 ---
        if loudness_rate != 0:
            ap["loudness_rate"] = loudness_rate

        # --- 比特率 ---
        if bit_rate is not None and bit_rate > 0:
            ap["bit_rate"] = bit_rate
            additions_dict["disable_default_bit_rate"] = True

        # --- 情感（仅 1.0/1.0多感情；2.0 走 context_texts） ---
        if emotion and emotion != "neutral" and category != "2.0":
            ap["emotion"] = emotion
            if caps.get("emotion_scale", False):
                ap["emotion_scale"] = emotion_scale

        # --- 特殊表达 → context_texts ---
        if expression and expression in self.expressions:
            if caps.get("context_texts"):
                context_texts = list(context_texts) + [self.expressions[expression]]

        # --- 字幕/时间戳 ---
        if enable_subtitle:
            ap["enable_subtitle"] = True

        # --- context_texts → additions ---
        if context_texts and caps.get("context_texts"):
            additions_dict["context_texts"] = context_texts

        # --- silence_duration → additions ---
        if silence_duration > 0:
            additions_dict["silence_duration"] = silence_duration

        # --- additions ---
        if additions_dict:
            payload["req_params"]["additions"] = json.dumps(additions_dict, ensure_ascii=False)

        # --- CoT (Chain of Thought) — 仅 expressive 模型支持 ---
        if cot_text and model == "seed-tts-2.0-expressive":
            payload["req_params"]["cot"] = {"text": cot_text}

        # --- 请求头 ---
        request_id = str(uuid.uuid4())
        headers = {
            "X-Api-Key": self.api_key,
            "X-Api-Resource-Id": resource_id,
            "X-Api-Request-Id": request_id,
            "X-Control-Require-Usage-Tokens-Return": "*",
            "Content-Type": "application/json",
        }

        # ============ LOG: 完整请求 ============
        print(f"\n{'='*60}")
        print(f"[API REQUEST] POST {self.base_url}")
        print(f"  logid(pre): {request_id}")
        print(f"  resource_id: {resource_id}")
        print(f"  model: {model}")
        safe_headers = {k: (f"***({len(v)}chars)" if k == 'X-Api-Key' else v) for k, v in headers.items()}
        print(f"  headers: {json.dumps(safe_headers, ensure_ascii=False)}")
        print(f"  body: {json.dumps(payload, ensure_ascii=False)}")
        print(f"{'='*60}")
        # ========================================

        resp = self._session.post(
            self.base_url, headers=headers, json=payload, stream=True, timeout=60
        )
        logid = resp.headers.get("X-Tt-Logid", "")

        # ============ LOG: 完整响应 ============
        print(f"\n[API RESPONSE] status={resp.status_code} logid={logid}")
        # ======================================

        audio_chunks = []
        subtitles = []
        usage = 0

        for line in resp.iter_lines(decode_unicode=True):
            if not line:
                continue
            try:
                chunk = json.loads(line)
            except json.JSONDecodeError:
                continue

            # ============ LOG: 每帧响应 ============
            code = chunk.get("code", -1)
            if code == 20000000 or code != 0:
                print(f"  frame: {json.dumps(chunk, ensure_ascii=False)}")
            # ====================================

            # --- 合成结束（成功）---
            if code == 20000000:
                if "usage" in chunk:
                    usage = chunk["usage"].get("text_words", 0)
                break

            # --- 错误 ---
            if code != 0:
                raise RuntimeError(
                    f"TTS 错误 [code={code}]: {chunk.get('message','')} | logid={logid}"
                )

            # --- 音频数据 ---
            if data := chunk.get("data"):
                audio_chunks.append(base64.b64decode(data))

            # --- 字幕/时间戳 ---
            if sentence := chunk.get("sentence"):
                subtitles.append(sentence)

        if not audio_chunks:
            raise RuntimeError(f"未收到音频数据 | logid={logid}")

        full = b"".join(audio_chunks)

        # ============ LOG: 结果摘要 ============
        print(f"[API RESULT] audio_bytes={len(full)} usage={usage} subtitles={len(subtitles)}")
        print(f"{'='*60}\n")
        # ======================================

        result = {
            "audio_bytes": full,
            "audio_base64": base64.b64encode(full).decode(),
            "logid": logid,
            "size": len(full),
        }
        if subtitles:
            result["subtitles"] = subtitles
        if usage > 0:
            result["usage"] = usage

        return result
