"""
AI Insights router — endpoints for the "Explain This Chart" feature.

All endpoints accept a chart context payload and return a structured AI
response. The heavy lifting lives in services/ai_insights.py.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import APIRouter
from pydantic import BaseModel

from services.ai_insights import AIInsightsService, MODES


router = APIRouter(prefix="/api/ai", tags=["ai-insights"])


class ChartContext(BaseModel):
    chartType: Optional[str] = "bar"
    title: Optional[str] = ""
    dimensions: List[Any] = []
    measures: List[Any] = []
    filters: List[Any] = []
    aggregation: Optional[str] = "sum"
    data: List[Dict[str, Any]] = []
    columns: Optional[List[Any]] = None
    rows: Optional[List[Any]] = None
    pageName: Optional[str] = None

    class Config:
        extra = "allow"


class InsightRequest(BaseModel):
    context: ChartContext
    mode: Optional[str] = "ceo"


class AskRequest(BaseModel):
    context: ChartContext
    question: str
    mode: Optional[str] = "simple"
    history: Optional[List[Dict[str, str]]] = None


@router.get("/modes")
def list_modes():
    """Return available persona modes for the UI dropdown."""
    return {
        "modes": [
            {"id": key, "label": val["label"], "tone": val["tone"]}
            for key, val in MODES.items()
        ]
    }


@router.post("/explain-chart")
def explain_chart(body: InsightRequest):
    return AIInsightsService.explain_chart(body.context.model_dump(), body.mode)


@router.post("/explain-trend")
def explain_trend(body: InsightRequest):
    return AIInsightsService.explain_trend(body.context.model_dump(), body.mode)


@router.post("/anomaly-detection")
def anomaly_detection(body: InsightRequest):
    return AIInsightsService.detect_anomalies(body.context.model_dump(), body.mode)


@router.post("/root-cause")
def root_cause(body: InsightRequest):
    return AIInsightsService.root_cause(body.context.model_dump(), body.mode)


@router.post("/generate-summary")
def generate_summary(body: InsightRequest):
    return AIInsightsService.generate_summary(body.context.model_dump(), body.mode)


@router.post("/next-steps")
def next_steps(body: InsightRequest):
    return AIInsightsService.next_steps(body.context.model_dump(), body.mode)


@router.post("/story")
def story_mode(body: InsightRequest):
    return AIInsightsService.story_mode(body.context.model_dump(), body.mode)


@router.post("/ask")
def ask_visual(body: AskRequest):
    return AIInsightsService.ask(
        body.context.model_dump(),
        body.question,
        body.mode,
        body.history or [],
    )
