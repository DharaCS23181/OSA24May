"""
ArithFlow — API v1 Router.

Aggregates all v1 endpoint routers into a single mountable router.
"""

from fastapi import APIRouter

from app.api.v1.pipelines import router as pipelines_router
from app.api.v1.jobs import router as jobs_router
from app.api.v1.connectors import router as connectors_router
from app.api.v1.transforms import router as transforms_router
from app.api.v1.system import router as system_router
from app.api.v1.upload import router as upload_router
from app.api.v1.database_manager import router as database_router
from app.api.v1.file_transforms import router as file_transforms_router
from app.api.v1.catalog import router as catalog_router
from app.api.v1.quality import router as quality_router
from app.api.v1.job_logs import router as job_logs_router
from app.api.v1.vault import router as vault_router
from app.api.v1.export import router as export_router
from app.api.v1.copilot import router as copilot_router
from app.api.v1.saved_connections import router as saved_connections_router

router = APIRouter(prefix="/api/v1")

router.include_router(pipelines_router)
router.include_router(jobs_router)
router.include_router(connectors_router)
router.include_router(transforms_router)
router.include_router(system_router)
router.include_router(vault_router)
router.include_router(upload_router)
router.include_router(database_router)
router.include_router(file_transforms_router)
router.include_router(catalog_router)
router.include_router(quality_router)
router.include_router(export_router)
router.include_router(job_logs_router)
router.include_router(copilot_router)
router.include_router(saved_connections_router)

