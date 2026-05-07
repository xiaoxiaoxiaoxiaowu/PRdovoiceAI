"""
VoiceLab TTS Engine — 最终修正版
"""
import json
import re
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
        self.voices = {v["id"]: v for v in lib["voices"]}
        self.expressions = lib.get("expressions", {})

    def get_voice(self, voice_id: str) -> dict:
        v = self.voices.get(voice_id)
        if not v:
            raise ValueError(f"音色 '{voice_id}' 不存在")
        return v

    def _resource_id(self, version: str) -> str:
        return "seed-tts-2.0" if version == "2.0" else "seed-tts-1.0"

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

    # ============ 核心 ============
    def synthesize(
        self, text: str, voice_id: str, *,
        emotion: str = "neutral", emotion_scale: int = 4,
        speech_rate: int = 0, silence_duration: int = 0,
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
                for seg in segments:
                    if not seg["text"]:
                        continue
                    result = self._call_api(
                        text=seg["text"],
                        voice_type=voice["voice_type"],
                        resource_id="seed-tts-2.0",
                        caps=caps,
                        emotion=emotion,
                        emotion_scale=emotion_scale,
                        speech_rate=speech_rate,
                        silence_duration=silence_duration,
                        expression=expression,
                        context_texts=seg.get("context_texts", []),
                        fmt=format,
                        sample_rate=sample_rate,
                    )
                    all_audio.append(result["audio_bytes"])
                full_audio = b"".join(all_audio)
                return {
                    "audio_bytes": full_audio,
                    "audio_base64": base64.b64encode(full_audio).decode(),
                    "logid": "(segmented)",
                    "size": len(full_audio),
                }

        # 单段
        context_texts = []
        if version == "2.0":
            text, context_texts = self._parse_20_instructions(text)

        return self._call_api(
            text=text,
            voice_type=voice["voice_type"],
            resource_id=self._resource_id(version),
            caps=caps,
            emotion=emotion,
            emotion_scale=emotion_scale,
            speech_rate=speech_rate,
            silence_duration=silence_duration,
            expression=expression,
            context_texts=context_texts,
            fmt=format,
            sample_rate=sample_rate,
        )

    def _call_api(
        self, text: str, voice_type: str, resource_id: str, caps: dict,
        emotion: str, emotion_scale: int, speech_rate: int, silence_duration: int,
        expression: str | None, context_texts: list[str],
        fmt: str, sample_rate: int,
    ) -> dict:
        payload = {
            "user": {"uid": "voicelab_pr"},
            "req_params": {
                "text": text,
                "speaker": voice_type,
                "audio_params": {"format": fmt, "sample_rate": sample_rate},
            },
        }

        ap = payload["req_params"]["audio_params"]
        additions_dict = {}

        if speech_rate != 0:
            ap["speech_rate"] = speech_rate

        # silence_duration → additions (official spec: req_params.additions.silence_duration)
        if silence_duration > 0:
            additions_dict["silence_duration"] = silence_duration

        if emotion and emotion != "neutral":
            ap["emotion"] = emotion
            if caps.get("emotion_scale", False):
                ap["emotion_scale"] = emotion_scale

        if expression and expression in self.expressions:
            if caps.get("context_texts"):
                context_texts = list(context_texts) + [self.expressions[expression]]

        if context_texts and caps.get("context_texts"):
            additions_dict["context_texts"] = context_texts

        if additions_dict:
            payload["req_params"]["additions"] = json.dumps(additions_dict, ensure_ascii=False)

        headers = {
            "X-Api-Key": self.api_key,
            "X-Api-Resource-Id": resource_id,
            "Content-Type": "application/json",
        }

        resp = self._session.post(
            self.base_url, headers=headers, json=payload, stream=True, timeout=60
        )
        logid = resp.headers.get("X-Tt-Logid", "")

        audio_chunks = []
        for line in resp.iter_lines(decode_unicode=True):
            if not line:
                continue
            try:
                chunk = json.loads(line)
            except json.JSONDecodeError:
                continue
            code = chunk.get("code", -1)
            if code == 20000000:
                break
            if code != 0:
                raise RuntimeError(
                    f"TTS 错误 [code={code}]: {chunk.get('message','')} | logid={logid}"
                )
            if data := chunk.get("data"):
                audio_chunks.append(base64.b64decode(data))

        if not audio_chunks:
            raise RuntimeError(f"未收到音频数据 | logid={logid}")

        full = b"".join(audio_chunks)
        return {
            "audio_bytes": full,
            "audio_base64": base64.b64encode(full).decode(),
            "logid": logid,
            "size": len(full),
        }
