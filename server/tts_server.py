"""
PRdovoiceAI FastAPI 后端
启动: uvicorn tts_server:app --host 0.0.0.0 --port 9527
"""
import json
import sys
from pathlib import Path
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from tts_engine import TTSEngine

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
    text: str
    voice_id: str
    emotion: str = "neutral"
    emotion_scale: int = 4
    speech_rate: int = 0
    silence_duration: int = 0
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
            expression=req.expression,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    fname = f"{req.id}.mp3"
    path = OUTPUT_DIR / fname
    path.write_bytes(result["audio_bytes"])

    return {
        "id": req.id,
        "download_url": f"/audio/{fname}",
        "duration_ms": None,
        "size": result["size"],
    }

@app.get("/audio/{filename}")
def serve_audio(filename: str):
    path = OUTPUT_DIR / filename
    if not path.exists():
        raise HTTPException(status_code=404, detail="音频文件不存在")
    return FileResponse(path, media_type="audio/mpeg")

@app.delete("/cache")
def clear_cache():
    for f in OUTPUT_DIR.glob("*.mp3"):
        f.unlink()
    return {"status": "ok", "message": "缓存已清空"}
