"""
OptiShift Engine — FastAPI Wrapper
Railway veya herhangi bir PaaS üzerinde çalışır.

Kurulum:
    pip install -r requirements.txt

Çalıştırma (local):
    uvicorn main:app --host 0.0.0.0 --port 8000

Ortam Değişkeni:
    PORT (Railway otomatik atar, varsayılan 8000)
"""

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Any
import os
import sys
import json
import hmac

# optishift_engine.py aynı klasörde
sys.path.insert(0, os.path.dirname(__file__))
import optishift_engine as engine

app = FastAPI(title="OptiShift Engine", version="1.0.0")

# İzin verilen origin'ler ENGINE_ALLOWED_ORIGINS ile (virgülle ayrılmış) kısıtlanabilir;
# tanımlanmazsa geliştirme kolaylığı için "*" kalır (credentials kapalı, zaten header tabanlı auth var).
_allowed_origins_env = os.environ.get("ENGINE_ALLOWED_ORIGINS", "").strip()
_allowed_origins = (
    [o.strip() for o in _allowed_origins_env.split(",") if o.strip()]
    if _allowed_origins_env
    else ["*"]
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=False,
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)

# Motor sadece Next.js backend'inden çağrılmalı — paylaşılan sır ile korunur.
# ENGINE_SHARED_SECRET tanımlı değilse (yerel geliştirme) kontrol devre dışı kalır.
ENGINE_SHARED_SECRET = os.environ.get("ENGINE_SHARED_SECRET", "")


@app.middleware("http")
async def verify_shared_secret(request: Request, call_next):
    if ENGINE_SHARED_SECRET and request.url.path not in ("/health",):
        provided = request.headers.get("x-engine-secret", "")
        if not hmac.compare_digest(provided, ENGINE_SHARED_SECRET):
            from fastapi.responses import JSONResponse

            return JSONResponse(status_code=403, content={"detail": "Yetkisiz istemci"})
    return await call_next(request)


class GenerateRequest(BaseModel):
    model_config = {"extra": "allow"}  # Bilinmeyen alanlar kabul edilsin

    personnel: list[dict[str, Any]] = []
    availability: dict[str, Any] = {}
    shifts: list[dict[str, Any]] = []
    rules: dict[str, Any] = {}
    zone_quotas: dict[str, Any] = {}
    demand_matrix: dict[str, Any] = {}
    department_demand_matrix: dict[str, Any] = {}
    branchId: str = "L-001"
    orgId: str = ""
    week_start: str = ""
    prevScores: dict[str, Any] = {}
    ensure_senior_per_shift: bool = False
    max_consecutive_days: int = 6
    no_night_to_morning: bool = False
    preferred_not_multiplier: float = 1.5
    crew_rotation: dict[str, Any] = {}
    personnel_crews: dict[str, Any] = {}
    crew_same_shift_hard: bool = False


@app.get("/health")
def health():
    return {"status": "ok", "service": "optishift-engine"}


@app.post("/generate")
def generate(req: GenerateRequest):
    """
    OR-Tools optimizasyon motorunu çalıştır ve sonucu döndür.
    Next.js /api/generate route'u bu endpoint'i çağırır.
    """
    payload = req.model_dump()

    # Stdout'u yakala (api_mode json.dumps yapar)
    import io
    from contextlib import redirect_stdout

    buf = io.StringIO()
    try:
        with redirect_stdout(buf):
            engine.api_mode(payload)
        output = buf.getvalue()
        if not output.strip():
            raise HTTPException(
                status_code=500,
                detail="Motor boş yanıt döndürdü"
            )
        result = json.loads(output)
        if "error" in result:
            raise HTTPException(status_code=422, detail=result["error"])
        return result
    except HTTPException:
        raise
    except json.JSONDecodeError as e:
        raise HTTPException(
            status_code=500,
            detail=f"Motor çıktısı JSON değil: {output[:200]}"
        ) from e
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=False)
