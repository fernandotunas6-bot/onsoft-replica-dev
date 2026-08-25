"""
SIGA — FastAPI Import Engine Service
Serviço Python de alta performance para processamento de ficheiros Excel/CSV.
"""

from fastapi import FastAPI, HTTPException, UploadFile, File
from pydantic import BaseModel
from typing import Any, Dict, List, Optional
import io

from services.import_engine.engine import ImportEngine, normalize_string_for_comparison

app = FastAPI(title="SIGA Import Engine", version="1.0.0")


class InferModuleRequest(BaseModel):
    headers: List[str]


class FuzzyMatchRequest(BaseModel):
    candidate: Dict[str, Any]
    existing_records: List[Dict[str, Any]]


@app.get("/health")
def health_check():
    return {"status": "ok", "service": "SIGA Import Engine Python"}


@app.post("/infer-module")
def infer_module(payload: InferModuleRequest):
    module, confidence = ImportEngine.infer_module_from_headers(payload.headers)
    return {"suggested_module": module, "confidence": confidence}


@app.post("/fuzzy-match")
def fuzzy_match(payload: FuzzyMatchRequest):
    best_score = 0.0
    best_match = None

    for existing in payload.existing_records:
        score = ImportEngine.calculate_person_match_score(payload.candidate, existing)
        if score > best_score:
            best_score = score
            best_match = existing

    return {
        "best_score": best_score,
        "best_match": best_match,
        "is_duplicate": best_score >= 0.85,
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
