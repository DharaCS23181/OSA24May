"""
AI Insights — deterministic chart analysis with optional LLM polish.

Architecture:
    * The deterministic layer is always available; it produces structured
      summary / trends / anomalies / root_cause / recommendations using
      pure-Python statistics over the chart's data points.
    * The LLM layer is opt-in. When OPENAI_API_KEY is set and the `openai`
      package is importable, the structured payload is enhanced with a more
      flowing narrative + persona-tuned headline. If the LLM call fails or
      is unavailable, the deterministic narrative is returned instead.
    * Modes only change tone/vocabulary. The math is identical across modes
      so different stakeholders look at the same numbers.

New AI tasks can be added by:
    1. Adding a method on AIInsightsService.
    2. Exposing it in routers/ai_insights.py.
"""
from __future__ import annotations

import math
import os
import statistics
from typing import Any, Dict, List, Optional, Tuple

try:  # openai>=1.0
    from openai import OpenAI as _OpenAIClient
except Exception:  # pragma: no cover
    _OpenAIClient = None


# ── Personas ─────────────────────────────────────────────────────────────────

MODES: Dict[str, Dict[str, Any]] = {
    "ceo": {
        "label": "Executive Summary",
        "tone": "strategic, concise, business-impact",
        "headline_prefix": "Bottom line:",
        "vocab": "Use boardroom language. Emphasize revenue impact, growth, and priorities.",
    },
    "technical": {
        "label": "Explain Technically",
        "tone": "analytical, precise, statistical",
        "headline_prefix": "Analysis:",
        "vocab": "Use statistical terminology — variance, distribution, outliers, percentiles.",
    },
    "simple": {
        "label": "Explain Simply",
        "tone": "plain language, no jargon",
        "headline_prefix": "In short:",
        "vocab": "Use everyday words. Avoid jargon and percentages where a comparison works.",
    },
    "financial": {
        "label": "Financial View",
        "tone": "finance-focused",
        "headline_prefix": "Financial read:",
        "vocab": "Frame as revenue, cost, margin, cash position; reference variance vs plan.",
    },
    "sales": {
        "label": "Sales View",
        "tone": "pipeline & quota oriented",
        "headline_prefix": "Sales read:",
        "vocab": "Frame around pipeline, conversion, win rate, regions and reps.",
    },
}

DEFAULT_MODE = "ceo"


def _mode(mode: Optional[str]) -> Dict[str, Any]:
    m = (mode or DEFAULT_MODE).lower().strip()
    return MODES.get(m, MODES[DEFAULT_MODE])


# ── Numeric helpers ──────────────────────────────────────────────────────────

def _safe_num(v: Any) -> Optional[float]:
    if v is None:
        return None
    try:
        f = float(v)
        if math.isnan(f) or math.isinf(f):
            return None
        return f
    except Exception:
        return None


def _fmt(v: Any) -> str:
    n = _safe_num(v)
    if n is None:
        return str(v) if v is not None else "N/A"
    a = abs(n)
    if a >= 1_000_000_000:
        return f"{n / 1_000_000_000:.2f}B"
    if a >= 1_000_000:
        return f"{n / 1_000_000:.2f}M"
    if a >= 1_000:
        return f"{n / 1_000:.1f}K"
    if a == 0 or a >= 100:
        return f"{n:,.0f}"
    return f"{n:,.2f}"


def _pct(num: Optional[float], denom: Optional[float]) -> Optional[float]:
    if num is None or denom is None or denom == 0:
        return None
    return (num / denom) * 100.0


def _sign(n: Optional[float]) -> str:
    if n is None:
        return ""
    if n > 0:
        return "+"
    return ""


# ── Series extraction ────────────────────────────────────────────────────────

def _series_from_ctx(ctx: Dict[str, Any]) -> Tuple[List[str], List[float], Optional[str]]:
    """
    Extract a (labels, values, value_field) series from any chart shape.
    Handles:
      data = [{label, value}, ...]
      data = [{<dim>, <measure>}, ...]
      rows + columns
    """
    labels: List[str] = []
    values: List[float] = []
    value_field: Optional[str] = None

    raw = ctx.get("data")
    if isinstance(raw, list) and raw:
        for d in raw:
            if not isinstance(d, dict):
                continue
            lbl = d.get("label") or d.get("category") or d.get("name") or d.get("x")
            val = d.get("value") if "value" in d else d.get("y")
            if val is None:
                # Find first numeric field that isn't the label
                for k, v in d.items():
                    if k in ("label", "category", "name", "x"):
                        continue
                    n = _safe_num(v)
                    if n is not None:
                        val = v
                        value_field = k
                        break
            if lbl is None:
                # First non-numeric value as label
                for k, v in d.items():
                    if _safe_num(v) is None:
                        lbl = v
                        break
                if lbl is None and d:
                    lbl = next(iter(d.values()))
            n = _safe_num(val)
            if n is not None and lbl is not None:
                labels.append(str(lbl))
                values.append(n)

    if labels:
        return labels, values, value_field

    rows = ctx.get("rows")
    cols = ctx.get("columns")
    if isinstance(rows, list) and isinstance(cols, list) and rows:
        col_names: List[str] = []
        for i, c in enumerate(cols):
            if isinstance(c, dict):
                col_names.append(str(c.get("name") or c.get("field") or c.get("label") or f"col{i}"))
            else:
                col_names.append(str(c))
        sample = rows[0] if rows else []
        text_idx = None
        num_idx = None
        for i, val in enumerate(sample):
            if num_idx is None and _safe_num(val) is not None:
                num_idx = i
            elif text_idx is None and _safe_num(val) is None:
                text_idx = i
        if text_idx is None:
            text_idx = 0
        if num_idx is None:
            num_idx = 1 if len(col_names) > 1 else 0
        for r in rows:
            try:
                lbl = r[text_idx] if isinstance(r, list) else r.get(col_names[text_idx])
                vv = r[num_idx] if isinstance(r, list) else r.get(col_names[num_idx])
                n = _safe_num(vv)
                if n is not None and lbl is not None:
                    labels.append(str(lbl))
                    values.append(n)
            except Exception:
                pass
        if num_idx is not None and num_idx < len(col_names):
            value_field = col_names[num_idx]
    return labels, values, value_field


def _is_timeseries(ctx: Dict[str, Any], labels: List[str]) -> bool:
    chart_type = (ctx.get("chartType") or "").lower()
    if chart_type in ("line", "area", "spline", "stream"):
        return True
    if not labels:
        return False
    sample = labels[: min(8, len(labels))]
    keywords = ("jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec",
                "mon", "tue", "wed", "thu", "fri", "sat", "sun",
                "q1", "q2", "q3", "q4", "20", "19")
    hits = 0
    for l in sample:
        s = str(l).lower()
        if any(k in s for k in keywords) or "-" in s or "/" in s:
            hits += 1
    return hits >= max(2, len(sample) // 2)


# ── Core analysers ───────────────────────────────────────────────────────────

def _measure_label(ctx: Dict[str, Any], value_field: Optional[str]) -> str:
    measures = ctx.get("measures") or []
    if measures:
        m = measures[0]
        if isinstance(m, dict):
            return str(m.get("column") or m.get("name") or value_field or "value")
        return str(m)
    return value_field or "value"


def _dimension_label(ctx: Dict[str, Any]) -> str:
    dims = ctx.get("dimensions") or []
    if dims:
        return str(dims[0])
    return "category"


def _basic_stats(values: List[float]) -> Dict[str, Optional[float]]:
    if not values:
        return {"count": 0, "total": None, "avg": None, "min": None, "max": None, "stdev": None, "median": None}
    total = sum(values)
    n = len(values)
    avg = total / n
    try:
        stdev = statistics.pstdev(values) if n > 1 else 0.0
    except statistics.StatisticsError:
        stdev = 0.0
    try:
        median = statistics.median(values)
    except statistics.StatisticsError:
        median = None
    return {
        "count": n,
        "total": total,
        "avg": avg,
        "min": min(values),
        "max": max(values),
        "stdev": stdev,
        "median": median,
    }


def _trend_summary(labels: List[str], values: List[float], dim_label: str, measure_label: str,
                    is_ts: bool) -> List[Dict[str, Any]]:
    """Compute trend: first-half vs second-half + last vs first vs peak comparisons."""
    out: List[Dict[str, Any]] = []
    if len(values) < 2:
        return out

    half = len(values) // 2
    first = values[:half] if half else values[:1]
    second = values[half:] if half else values[1:]
    first_avg = sum(first) / len(first) if first else 0
    second_avg = sum(second) / len(second) if second else 0
    delta = second_avg - first_avg
    pct = _pct(delta, abs(first_avg)) if first_avg else None
    direction = "stable"
    if pct is not None:
        if pct > 5:
            direction = "rising"
        elif pct < -5:
            direction = "falling"

    label = "Trend over time" if is_ts else f"Trend across {dim_label}"
    if pct is not None:
        out.append({
            "label": label,
            "direction": direction,
            "pct_change": round(pct, 2),
            "first_half_avg": first_avg,
            "second_half_avg": second_avg,
            "summary": (
                f"{measure_label.capitalize()} is {direction} "
                f"({_sign(pct)}{pct:.1f}% from the first half to the second half)."
            ),
        })

    # Period-over-period (last vs prev)
    if len(values) >= 2:
        last = values[-1]
        prev = values[-2]
        d2 = last - prev
        p2 = _pct(d2, abs(prev)) if prev else None
        if p2 is not None:
            out.append({
                "label": "Latest vs previous",
                "direction": "up" if d2 > 0 else ("down" if d2 < 0 else "flat"),
                "pct_change": round(p2, 2),
                "from": prev,
                "to": last,
                "summary": (
                    f"Latest {measure_label} {_fmt(last)} vs previous {_fmt(prev)} "
                    f"({_sign(p2)}{p2:.1f}%)."
                ),
            })
    return out


def _top_bottom(labels: List[str], values: List[float], dim_label: str, measure_label: str,
                  top_n: int = 3) -> Dict[str, Any]:
    if not labels:
        return {"top": [], "bottom": [], "leader_share_pct": None}
    pairs = list(zip(labels, values))
    pairs_sorted = sorted(pairs, key=lambda p: p[1], reverse=True)
    total = sum(values) if values else 0
    top = []
    for lbl, v in pairs_sorted[: top_n]:
        share = _pct(v, total) if total else None
        top.append({"label": lbl, "value": v, "share_pct": round(share, 1) if share is not None else None})
    bottom = []
    for lbl, v in pairs_sorted[-top_n:]:
        share = _pct(v, total) if total else None
        bottom.append({"label": lbl, "value": v, "share_pct": round(share, 1) if share is not None else None})
    leader_share = top[0]["share_pct"] if top else None
    return {"top": top, "bottom": bottom, "leader_share_pct": leader_share}


def _detect_anomalies(labels: List[str], values: List[float], measure_label: str,
                       z_threshold: float = 1.7) -> List[Dict[str, Any]]:
    """z-score based outlier detection. Returns up to 5 anomalies."""
    n = len(values)
    if n < 4:
        return []
    avg = sum(values) / n
    try:
        sd = statistics.pstdev(values)
    except statistics.StatisticsError:
        sd = 0.0
    if sd == 0:
        return []
    out = []
    for lbl, v in zip(labels, values):
        z = (v - avg) / sd
        if abs(z) >= z_threshold:
            direction = "spike" if z > 0 else "dip"
            out.append({
                "label": lbl,
                "value": v,
                "z_score": round(z, 2),
                "deviation_pct": round(_pct(v - avg, avg) or 0, 1),
                "direction": direction,
                "summary": (
                    f"Unusual {direction} at {lbl}: {measure_label} = {_fmt(v)} "
                    f"({_sign((v - avg))}{_fmt(v - avg)} vs average {_fmt(avg)})."
                ),
            })
    out.sort(key=lambda x: abs(x["z_score"]), reverse=True)
    return out[:5]


def _root_cause(labels: List[str], values: List[float], dim_label: str,
                  measure_label: str) -> Dict[str, Any]:
    """Identify which dimension member contributes most to the total (or change)."""
    if not labels:
        return {"summary": "Not enough data to attribute a cause.", "drivers": []}
    total = sum(values)
    pairs = sorted(zip(labels, values), key=lambda p: abs(p[1]), reverse=True)
    drivers: List[Dict[str, Any]] = []
    cumulative = 0.0
    for lbl, v in pairs[:5]:
        share = _pct(v, total) if total else None
        cumulative += v
        drivers.append({
            "label": lbl,
            "value": v,
            "share_pct": round(share, 1) if share is not None else None,
            "running_share_pct": round(_pct(cumulative, total) or 0, 1) if total else None,
        })
    leader = drivers[0]
    summary = (
        f"**{leader['label']}** is the largest driver of {measure_label} "
        f"({_fmt(leader['value'])}"
    )
    if leader["share_pct"] is not None:
        summary += f", {leader['share_pct']}% of total"
    summary += ")."
    if len(drivers) >= 2 and drivers[1].get("running_share_pct"):
        summary += (
            f" The top {len(drivers)} contributors together explain "
            f"{drivers[-1]['running_share_pct']}% of the total."
        )
    return {"summary": summary, "drivers": drivers}


def _recommendations(ctx: Dict[str, Any], stats: Dict[str, Optional[float]],
                       trend: List[Dict[str, Any]], anomalies: List[Dict[str, Any]],
                       rc: Dict[str, Any], measure_label: str, dim_label: str,
                       mode_def: Dict[str, Any]) -> List[str]:
    recs: List[str] = []
    mode_id = mode_def.get("label", "")

    # Anomaly recommendations
    if anomalies:
        top_a = anomalies[0]
        if top_a["direction"] == "spike":
            recs.append(
                f"Investigate the {top_a['direction']} at **{top_a['label']}** — "
                f"verify whether the {_sign(top_a['z_score'])}{top_a['z_score']}σ "
                f"deviation is structural (e.g. campaign, seasonal) or a data quality issue."
            )
        else:
            recs.append(
                f"Diagnose the {top_a['direction']} at **{top_a['label']}** — review supply, "
                f"demand, and pipeline health for that segment."
            )

    # Trend recommendations
    for t in trend:
        if t.get("direction") in ("rising", "up"):
            recs.append(
                f"Double-down on what's working: {measure_label} is "
                f"{t.get('direction')} ({_sign(t.get('pct_change'))}{t.get('pct_change')}%) — "
                f"replicate the playbook driving the change to the broader portfolio."
            )
        elif t.get("direction") in ("falling", "down"):
            recs.append(
                f"Counter the decline: {measure_label} is {t.get('direction')} "
                f"({_sign(t.get('pct_change'))}{t.get('pct_change')}%) — "
                f"set a 30-day intervention plan with weekly check-ins."
            )

    # Concentration risk
    if rc.get("drivers"):
        top = rc["drivers"][0]
        if top.get("share_pct") and top["share_pct"] >= 50:
            recs.append(
                f"De-risk concentration: **{top['label']}** carries "
                f"{top['share_pct']}% of {measure_label}. Build secondary drivers to balance exposure."
            )

    # Mode-flavored cap
    if not recs:
        recs.append(
            f"No critical issues detected. Continue monitoring {measure_label} across "
            f"{dim_label} on a weekly cadence."
        )

    # Persona-tune the leading prefix on the first rec
    if mode_id == "Sales View" and recs:
        recs[0] = "Sales action — " + recs[0]
    elif mode_id == "Financial View" and recs:
        recs[0] = "Finance action — " + recs[0]
    elif mode_id == "Executive Summary" and recs:
        recs[0] = "Executive action — " + recs[0]

    return recs[:5]


def _headline(ctx: Dict[str, Any], stats: Dict[str, Optional[float]],
                trend: List[Dict[str, Any]], anomalies: List[Dict[str, Any]],
                rc: Dict[str, Any], measure_label: str, dim_label: str,
                mode_def: Dict[str, Any]) -> str:
    parts: List[str] = []
    prefix = mode_def.get("headline_prefix", "Summary:")
    chart_title = ctx.get("title") or f"{ctx.get('chartType', 'Chart')}"

    if trend:
        t = trend[0]
        parts.append(
            f"{measure_label} is **{t['direction']}** "
            f"({_sign(t.get('pct_change'))}{t.get('pct_change')}%) across {dim_label}"
        )

    if rc.get("drivers"):
        top = rc["drivers"][0]
        share = top.get("share_pct")
        share_str = f" ({share}% of total)" if share is not None else ""
        parts.append(f"**{top['label']}** leads with {_fmt(top['value'])}{share_str}")

    if anomalies:
        a = anomalies[0]
        parts.append(
            f"a notable {a['direction']} at **{a['label']}** "
            f"({_sign(a['deviation_pct'])}{a['deviation_pct']}% vs avg)"
        )

    if not parts:
        if stats.get("total") is not None:
            parts.append(
                f"{chart_title} totals {_fmt(stats['total'])} "
                f"across {stats.get('count', 0)} {dim_label}(s)"
            )
        else:
            parts.append(f"{chart_title} — not enough data to draw conclusions")

    return f"{prefix} " + "; ".join(parts) + "."


# ── LLM polish (optional) ────────────────────────────────────────────────────

def _llm_polish(payload: Dict[str, Any], ctx: Dict[str, Any], mode_def: Dict[str, Any],
                  task: str) -> Optional[str]:
    """Best-effort LLM call to produce a flowing narrative. Returns None on any failure."""
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key or _OpenAIClient is None:
        return None
    try:
        client = _OpenAIClient(api_key=api_key)
        model = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
        sys_prompt = (
            "You are an executive Business Analyst built into a BI tool. "
            "Speak in a {tone} tone. {vocab} "
            "Convert the structured data below into a tight 2–4 sentence narrative for the user. "
            "Never invent numbers; cite only what is in the payload. End with one concrete action."
        ).format(tone=mode_def.get("tone", ""), vocab=mode_def.get("vocab", ""))
        user_prompt = (
            f"Task: {task}\n"
            f"Chart title: {ctx.get('title')}\n"
            f"Chart type: {ctx.get('chartType')}\n"
            f"Dimensions: {ctx.get('dimensions')}\n"
            f"Measures: {ctx.get('measures')}\n"
            f"Headline: {payload.get('headline')}\n"
            f"Summary: {payload.get('summary')}\n"
            f"Trends: {payload.get('trends')}\n"
            f"Anomalies: {payload.get('anomalies')}\n"
            f"Root cause: {payload.get('rootCause')}\n"
            f"Recommendations: {payload.get('recommendations')}\n"
        )
        resp = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": sys_prompt},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.4,
            max_tokens=320,
        )
        return resp.choices[0].message.content.strip()
    except Exception:
        return None


# ── Public service ───────────────────────────────────────────────────────────

class AIInsightsService:
    """Stateless facade. Add new tasks by adding new @classmethod entry points."""

    # — Internal compute used by most tasks —
    @classmethod
    def _compute(cls, ctx: Dict[str, Any], mode: Optional[str]) -> Dict[str, Any]:
        mode_def = _mode(mode)
        labels, values, value_field = _series_from_ctx(ctx)
        measure_label = _measure_label(ctx, value_field)
        dim_label = _dimension_label(ctx)
        is_ts = _is_timeseries(ctx, labels)
        stats = _basic_stats(values)
        trend = _trend_summary(labels, values, dim_label, measure_label, is_ts)
        tb = _top_bottom(labels, values, dim_label, measure_label)
        anomalies = _detect_anomalies(labels, values, measure_label)
        rc = _root_cause(labels, values, dim_label, measure_label)
        recommendations = _recommendations(ctx, stats, trend, anomalies, rc, measure_label, dim_label, mode_def)
        headline = _headline(ctx, stats, trend, anomalies, rc, measure_label, dim_label, mode_def)

        return {
            "ok": True,
            "mode": mode_def.get("label"),
            "modeId": (mode or DEFAULT_MODE).lower(),
            "chartType": ctx.get("chartType"),
            "title": ctx.get("title"),
            "measureLabel": measure_label,
            "dimensionLabel": dim_label,
            "isTimeSeries": is_ts,
            "stats": {
                k: (round(v, 2) if isinstance(v, float) else v)
                for k, v in stats.items()
            },
            "topCategories": tb["top"],
            "bottomCategories": tb["bottom"],
            "trends": trend,
            "anomalies": anomalies,
            "rootCause": rc.get("summary"),
            "rootCauseDrivers": rc.get("drivers"),
            "recommendations": recommendations,
            "headline": headline,
        }

    # — Explain This Chart (full payload) —
    @classmethod
    def explain_chart(cls, ctx: Dict[str, Any], mode: Optional[str]) -> Dict[str, Any]:
        payload = cls._compute(ctx, mode)
        summary_lines: List[str] = []
        summary_lines.append(payload["headline"])
        for t in payload["trends"]:
            summary_lines.append(t["summary"])
        if payload["topCategories"]:
            top = payload["topCategories"][0]
            share = f" ({top['share_pct']}%)" if top.get("share_pct") is not None else ""
            summary_lines.append(
                f"Top {payload['dimensionLabel']}: **{top['label']}** at "
                f"{_fmt(top['value'])}{share}."
            )
        for a in payload["anomalies"][:2]:
            summary_lines.append(a["summary"])
        payload["summary"] = "\n".join(summary_lines)

        narrative = _llm_polish(payload, ctx, _mode(mode), "Explain this chart")
        if narrative:
            payload["narrative"] = narrative
        return payload

    # — Trend only —
    @classmethod
    def explain_trend(cls, ctx: Dict[str, Any], mode: Optional[str]) -> Dict[str, Any]:
        payload = cls._compute(ctx, mode)
        summary = "\n".join([t["summary"] for t in payload["trends"]]) or \
            f"{payload['measureLabel']} shows no clear trend across {payload['dimensionLabel']}."
        return {
            **payload,
            "summary": summary,
            "headline": payload["headline"],
        }

    # — Anomaly detection only —
    @classmethod
    def detect_anomalies(cls, ctx: Dict[str, Any], mode: Optional[str]) -> Dict[str, Any]:
        payload = cls._compute(ctx, mode)
        if payload["anomalies"]:
            summary = "Anomalies detected:\n" + "\n".join([f"• {a['summary']}" for a in payload["anomalies"]])
        else:
            summary = "No statistically significant anomalies detected (z-score < 1.7σ)."
        return {**payload, "summary": summary}

    # — Root cause only —
    @classmethod
    def root_cause(cls, ctx: Dict[str, Any], mode: Optional[str]) -> Dict[str, Any]:
        payload = cls._compute(ctx, mode)
        return {**payload, "summary": payload["rootCause"] or "Insufficient data for root-cause attribution."}

    # — Short summary —
    @classmethod
    def generate_summary(cls, ctx: Dict[str, Any], mode: Optional[str]) -> Dict[str, Any]:
        payload = cls._compute(ctx, mode)
        # Compact summary: headline + best trend + best driver
        parts = [payload["headline"]]
        if payload["trends"]:
            parts.append(payload["trends"][0]["summary"])
        if payload["rootCauseDrivers"]:
            d = payload["rootCauseDrivers"][0]
            parts.append(f"Primary driver: **{d['label']}** at {_fmt(d['value'])} "
                          f"({d.get('share_pct') or 0}% of total).")
        return {**payload, "summary": " ".join(parts)}

    # — Next steps —
    @classmethod
    def next_steps(cls, ctx: Dict[str, Any], mode: Optional[str]) -> Dict[str, Any]:
        payload = cls._compute(ctx, mode)
        steps = payload["recommendations"] or [
            "Set a recurring review cadence on this metric.",
            "Define a target/threshold so deviations trigger an alert.",
            "Cross-reference with a leading indicator to forecast next period.",
        ]
        bullets = "\n".join([f"{i + 1}. {s}" for i, s in enumerate(steps)])
        return {**payload, "summary": f"Suggested next steps:\n{bullets}"}

    # — Story mode (narrative) —
    @classmethod
    def story_mode(cls, ctx: Dict[str, Any], mode: Optional[str]) -> Dict[str, Any]:
        payload = cls._compute(ctx, mode)
        # Construct a narrative arc: setup → tension → resolution → recommendation
        setup = (
            f"Looking at {payload['title'] or 'the chart'}, "
            f"{payload['measureLabel']} is being tracked across {payload['dimensionLabel']} "
            f"with {payload['stats'].get('count', 0)} data points."
        )
        tension = ""
        if payload["trends"]:
            t = payload["trends"][0]
            tension = (
                f" The story so far: {payload['measureLabel']} is {t['direction']} — "
                f"{_sign(t.get('pct_change'))}{t.get('pct_change')}% between the early and late period."
            )
        twist = ""
        if payload["anomalies"]:
            a = payload["anomalies"][0]
            twist = (
                f" The plot twist is **{a['label']}**, where {payload['measureLabel']} "
                f"deviates {_sign(a['deviation_pct'])}{a['deviation_pct']}% from the average — "
                f"a clear {a['direction']} worth investigating."
            )
        resolution = ""
        if payload["rootCauseDrivers"]:
            d = payload["rootCauseDrivers"][0]
            resolution = (
                f" When we break it down by {payload['dimensionLabel']}, **{d['label']}** "
                f"emerges as the protagonist, carrying {d.get('share_pct') or 0}% of the load."
            )
        action = ""
        if payload["recommendations"]:
            action = f" Next chapter: {payload['recommendations'][0]}"
        story = (setup + tension + twist + resolution + action).strip()
        narrative = _llm_polish({**payload, "summary": story}, ctx, _mode(mode), "Story mode")
        return {**payload, "summary": story, "narrative": narrative or story}

    # — Ask / chat —
    @classmethod
    def ask(cls, ctx: Dict[str, Any], question: str, mode: Optional[str],
            history: Optional[List[Dict[str, str]]]) -> Dict[str, Any]:
        payload = cls._compute(ctx, mode)
        q = (question or "").strip()
        if not q:
            return {**payload, "summary": "Ask a question about this visual to get a focused answer."}

        ql = q.lower()
        answer_parts: List[str] = []

        # Heuristic dispatch on keywords
        if any(k in ql for k in ("why", "cause", "driver", "contribut")):
            answer_parts.append(payload["rootCause"] or "I don't have enough data to attribute a cause yet.")
        if any(k in ql for k in ("anomal", "spike", "drop", "unusual", "outlier")):
            if payload["anomalies"]:
                answer_parts.extend([f"• {a['summary']}" for a in payload["anomalies"][:3]])
            else:
                answer_parts.append("I didn't find any statistically unusual points in this chart.")
        if any(k in ql for k in ("trend", "growth", "decline", "change", "increase", "decrease")):
            if payload["trends"]:
                answer_parts.extend([t["summary"] for t in payload["trends"]])
            else:
                answer_parts.append("There isn't a clear trend across this set.")
        if any(k in ql for k in ("top", "highest", "biggest", "leader", "best")):
            tc = payload["topCategories"]
            if tc:
                answer_parts.append(
                    "Top: " + ", ".join([f"**{t['label']}** ({_fmt(t['value'])})" for t in tc])
                )
        if any(k in ql for k in ("bottom", "lowest", "worst", "smallest")):
            bc = payload["bottomCategories"]
            if bc:
                answer_parts.append(
                    "Bottom: " + ", ".join([f"**{t['label']}** ({_fmt(t['value'])})" for t in bc])
                )
        if any(k in ql for k in ("total", "sum", "overall")):
            answer_parts.append(f"Total {payload['measureLabel']} is **{_fmt(payload['stats'].get('total'))}**.")
        if any(k in ql for k in ("average", "mean", "avg")):
            answer_parts.append(f"Average {payload['measureLabel']} is **{_fmt(payload['stats'].get('avg'))}**.")
        if any(k in ql for k in ("recommend", "what should", "action", "next step")):
            for r in payload["recommendations"][:3]:
                answer_parts.append(f"• {r}")

        # Default: blend headline + trend + top
        if not answer_parts:
            answer_parts.append(payload["headline"])
            if payload["trends"]:
                answer_parts.append(payload["trends"][0]["summary"])
            if payload["topCategories"]:
                t = payload["topCategories"][0]
                share = f" ({t['share_pct']}%)" if t.get("share_pct") is not None else ""
                answer_parts.append(
                    f"Leader: **{t['label']}** at {_fmt(t['value'])}{share}."
                )

        answer = "\n".join(answer_parts)
        # Optional LLM refinement
        polished = _llm_polish(
            {**payload, "summary": answer, "headline": f"Question: {q}"},
            ctx, _mode(mode), f"Q&A: {q}",
        )
        return {**payload, "question": q, "answer": polished or answer, "summary": polished or answer}
