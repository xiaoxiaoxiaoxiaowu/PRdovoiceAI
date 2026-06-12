"""
PRdovoiceAI FastAPI 后端
启动: uvicorn tts_server:app --host 0.0.0.0 --port 9527
"""
import logging
import traceback
import json
import sys
from pathlib import Path
from typing import Literal
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel, Field
from tts_engine import TTSEngine

# 建议定义一个 logger，方便统一管理
logger = logging.getLogger("tts_server")
logger.setLevel(logging.DEBUG)  # 或 INFO，看需要
# 如果想让日志也输出到控制台（uvicorn 通常会配置，但这样确保一下）
if not logger.handlers:
    handler = logging.StreamHandler()
    handler.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(name)s: %(message)s"))
    logger.addHandler(handler)

# ==================== 配置文件加载 ====================
CONFIG_PATH = Path(__file__).parent / "config.json"

if not CONFIG_PATH.exists():
    CONFIG_PATH.write_text(
        json.dumps({"api_key": "请填写你的API密钥", "output_dir": "D:/voice_cache"},
                   ensure_ascii=False, indent=2),
        encoding="utf-8"
    )
    print(f"[PRdovoiceAI] 已生成配置文件: {CONFIG_PATH}")
    print(f"[PRdovoiceAI] 请编辑此文件填入 api_key 后重启服务")
    sys.exit(1)

with open(CONFIG_PATH, encoding="utf-8") as f:
    _cfg = json.load(f)

API_KEY = _cfg.get("api_key", "")
OUTPUT_DIR = Path(_cfg.get("output_dir", "D:/voice_cache"))
# =====================================================

if not API_KEY or "请填写" in API_KEY:
    print("[PRdovoiceAI] 请在 config.json 中填写正确的 api_key")
    sys.exit(1)

OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
LIB_PATH = Path(__file__).parent / "voice_library.json"
engine = TTSEngine(api_key=API_KEY, library_path=LIB_PATH)

app = FastAPI(title="PRdovoiceAI TTS Backend", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

class SynthesizeRequest(BaseModel):
    id: str
    text: str = Field(..., min_length=1, max_length=5000, description="合成文本 1~5000 字")
    voice_id: str
    emotion: str = Field("neutral", max_length=50)
    emotion_scale: int = Field(4, ge=1, le=5, description="情感强度 1~5")
    speech_rate: int = Field(0, ge=-50, le=100, description="语速 -50~100")
    silence_duration: int = Field(0, ge=0, le=30000, description="尾停 0~30000ms")
    loudness_rate: int = Field(0, ge=-50, le=100, description="音量 -50~100")
    bit_rate: int | None = None
    model: str | None = None
    enable_subtitle: bool = False
    speech_mode: Literal["voice_instruction", "reference_text", "voice_tag"] | None = None
    cot_text: str | None = None
    context_texts: list[str] = Field(default_factory=list)
    expression: str | None = None

@app.get("/health")
def health():
    return {"status": "ok", "version": "1.0.0", "voice_count": len(engine.voices)}

@app.get("/voices")
def list_voices():
    with open(LIB_PATH, encoding="utf-8") as f:
        lib = json.load(f)
    return {
        "voices": lib["voices"],
        "emotions_cn": lib.get("emotions_cn", []),
        "emotions_en": lib.get("emotions_en", []),
        "expressions": list(lib.get("expressions", {}).keys()),
    }

@app.post("/synthesize")
def synthesize(req: SynthesizeRequest):
    try:
        result = engine.synthesize(
            text=req.text, voice_id=req.voice_id,
            emotion=req.emotion, emotion_scale=req.emotion_scale,
            speech_rate=req.speech_rate, silence_duration=req.silence_duration,
            loudness_rate=req.loudness_rate, bit_rate=req.bit_rate,
            model=req.model, enable_subtitle=req.enable_subtitle,
            speech_mode=req.speech_mode,
            context_texts=req.context_texts,
            cot_text=req.cot_text,
            expression=req.expression,
        )
    except Exception:
        # 这行会把完整的错误堆栈打印到控制台
        logger.exception("合成失败")  
        raise HTTPException(status_code=500, detail="Internal server error")

    fname = f"{req.id}.mp3"
    path = OUTPUT_DIR / fname
    path.write_bytes(result["audio_bytes"])

    return {
        "id": req.id,
        "download_url": f"/audio/{fname}",
        "duration_ms": None,
        "size": result["size"],
        "logid": result.get("logid", ""),
        "subtitles": result.get("subtitles"),
        "usage": result.get("usage"),
    }

@app.get("/audio/{filename}")
def serve_audio(filename: str):
    path = OUTPUT_DIR / filename
    if not path.exists():
        raise HTTPException(status_code=404, detail="音频文件不存在")
    
    # 直接读取完整文件，忽略任何 Range 请求头
    audio_bytes = path.read_bytes()
    
    return Response(
        content=audio_bytes,
        media_type="audio/mpeg",
        headers={
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Pragma": "no-cache",
            "Expires": "0"
        }
    )

@app.delete("/cache")
def clear_cache():
    for f in OUTPUT_DIR.glob("*.mp3"):
        f.unlink()
    return {"status": "ok", "message": "缓存已清空"}
