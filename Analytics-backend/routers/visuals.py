from fastapi import APIRouter
from typing import List
from pydantic import BaseModel

router = APIRouter(prefix="/visuals", tags=["visuals"])

class VisualMetadata(BaseModel):
    id: str
    name: str
    icon: str
    description: str
    script_url: str

# Inline SVG data URIs — no external image dependency, no CORS issues
RADAR_ICON = "data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Cpolygon points='50,5 95,35 80,85 20,85 5,35' fill='none' stroke='%230078d4' stroke-width='3'/%3E%3Cpolygon points='50,20 80,35 68,75 32,75 20,35' fill='none' stroke='%230078d4' stroke-width='2' opacity='0.5'/%3E%3Cpolygon points='50,35 65,45 58,65 42,65 35,45' fill='none' stroke='%230078d4' stroke-width='1.5' opacity='0.3'/%3E%3Cpolygon points='50,10 88,50 68,82 32,82 12,50' fill='%230078d4' fill-opacity='0.15' stroke='%230078d4' stroke-width='2'/%3E%3Ccircle cx='50' cy='50' r='3' fill='%230078d4'/%3E%3C/svg%3E"

BULLET_ICON = "data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect x='10' y='30' width='80' height='40' rx='3' fill='%23e5e7eb'/%3E%3Crect x='10' y='38' width='55' height='24' rx='2' fill='%2393c5fd'/%3E%3Crect x='10' y='43' width='40' height='14' rx='2' fill='%230078d4'/%3E%3Cline x1='70' y1='25' x2='70' y2='75' stroke='%23111827' stroke-width='3' stroke-linecap='round'/%3E%3C/svg%3E"

SANKEY_ICON = "data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect x='5' y='15' width='18' height='20' rx='2' fill='%230078d4'/%3E%3Crect x='5' y='40' width='18' height='14' rx='2' fill='%2338bdf8'/%3E%3Crect x='5' y='60' width='18' height='22' rx='2' fill='%2334d399'/%3E%3Crect x='77' y='20' width='18' height='28' rx='2' fill='%230078d4'/%3E%3Crect x='77' y='52' width='18' height='26' rx='2' fill='%2334d399'/%3E%3Cpath d='M23,20 Q50,20 77,28' fill='none' stroke='%230078d4' stroke-width='14' stroke-opacity='0.4'/%3E%3Cpath d='M23,43 Q50,43 77,43' fill='none' stroke='%2338bdf8' stroke-width='8' stroke-opacity='0.4'/%3E%3Cpath d='M23,66 Q50,66 77,65' fill='none' stroke='%2334d399' stroke-width='16' stroke-opacity='0.4'/%3E%3C/svg%3E"

MOCK_APPSOURCE_VISUALS = [
    {
        "id": "com.microsoft.powerbi.visuals.radar_chart",
        "name": "Radar Chart",
        "icon": RADAR_ICON,
        "description": "Display multivariate data on a two-dimensional chart with axes starting from the same point. Great for comparing performance across multiple categories.",
        "script_url": ""
    },
    {
        "id": "com.custom.visuals.bullet_chart",
        "name": "Bullet Chart",
        "icon": BULLET_ICON,
        "description": "A variation of a bar graph developed by Stephen Few to replace dashboard gauges and meters. Shows progress against a target.",
        "script_url": ""
    },
    {
        "id": "com.custom.visuals.sankey_diagram",
        "name": "Sankey Diagram",
        "icon": SANKEY_ICON,
        "description": "Flow diagram in which the width of the arrows is proportional to the flow rate. Ideal for visualizing data flows and relationships.",
        "script_url": ""
    }
]

@router.get("/marketplace", response_model=List[VisualMetadata])
def get_marketplace_visuals():
    """Returns a list of available custom visuals from the AppSource marketplace."""
    return MOCK_APPSOURCE_VISUALS

@router.post("/installed")
def register_installed_visual(visual: VisualMetadata):
    """Logs that a visual was installed. In a real app, this saves to the DB per user/tenant."""
    print(f"[Visuals] Installed: {visual.name} ({visual.id})")
    return {"status": "success", "message": "Visual marked as installed"}
