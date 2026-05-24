"""
Power Automate Router
─────────────────────
Handles all workflow CRUD, execution, and PDF download endpoints.

Endpoints:
  POST /api/power-automate/create-flow      → Save workflow + run background pipeline
  GET  /api/power-automate/flows            → List all saved workflows (with export status)
  GET  /api/power-automate/download/{id}    → Download the generated PDF for a workflow
  POST /api/power-automate/run             → Legacy mock trigger (backwards compat)
"""

import asyncio
import datetime
import logging
import os
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from database import SessionLocal
import models
import schemas

logger = logging.getLogger("power_automate")

router = APIRouter(prefix="/api/power-automate", tags=["automate"])

# Where generated PDFs are stored (relative to backend root)
EXPORTS_DIR = Path(__file__).parent.parent / "exports"
EXPORTS_DIR.mkdir(parents=True, exist_ok=True)


# ── DB Dependency ──────────────────────────────────────────────────────────────
def get_db():
    """Yield a SQLAlchemy session; close it when the request finishes."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ── Simulated Automation Steps ─────────────────────────────────────────────────

async def save_to_db(action_id: str, db: Session):
    """
    Step 1: Save data snapshot to database.
    Simulates a DB write with a short delay.
    """
    logger.info(f"[{action_id}] ⚙️  save_to_db — starting...")
    await asyncio.sleep(1)

    action = db.query(models.AutomateAction).filter(
        models.AutomateAction.id == action_id
    ).first()
    if action:
        action.last_status = "success"
        db.commit()

    logger.info(f"[{action_id}] ✅ save_to_db — complete.")


async def send_email(action_id: str, db: Session):
    """
    Step 2: Send email notification.
    Simulates SMTP delivery with a short delay.
    In production: swap this body for an SMTP/SendGrid call.
    """
    logger.info(f"[{action_id}] 📧 send_email — connecting to mail server...")
    await asyncio.sleep(1.5)

    action = db.query(models.AutomateAction).filter(
        models.AutomateAction.id == action_id
    ).first()
    if action:
        action.last_status = "success"
        db.commit()

    logger.info(f"[{action_id}] ✅ send_email — notification dispatched.")


async def generate_report(action_id: str, workflow_id: str, db: Session):
    """
    Step 3: Generate a real PDF snapshot of the dashboard.

    Uses Playwright to headlessly render the snapshot_url stored on the
    workflow record, saves the PDF to exports/, then updates the workflow's
    export_path so the download endpoint can serve it.
    """
    logger.info(f"[{action_id}] 📊 generate_report — starting PDF capture...")

    action = db.query(models.AutomateAction).filter(
        models.AutomateAction.id == action_id
    ).first()
    workflow = db.query(models.AutomateWorkflow).filter(
        models.AutomateWorkflow.id == workflow_id
    ).first()

    if not workflow:
        logger.error(f"[{action_id}] ❌ Workflow not found, skipping PDF generation.")
        return

    # Determine which URL to screenshot
    snapshot_url = workflow.snapshot_url or "http://localhost:8000"

    try:
        # Import the real Playwright-based snapshot service
        from services.snapshot_service import capture_snapshot_pdf

        pdf_path = await capture_snapshot_pdf(workflow_id, snapshot_url)

        # Persist the path so the download endpoint can find it
        if workflow:
            workflow.export_path = pdf_path
            db.commit()

        if action:
            action.last_status = "success"
            db.commit()

        logger.info(f"[{action_id}] ✅ generate_report — PDF saved at {pdf_path}")
        return True

    except Exception as err:
        # PDF generation failed — log it but don't crash the whole pipeline
        logger.error(f"[{action_id}] ❌ PDF generation failed: {err}")
        if action:
            action.last_status = "failed"
            db.commit()
        if workflow:
            workflow.status = "failed"
            db.commit()
        return False


# ── Action registry ─────────────────────────────────────────────────────────────
# Maps action_type strings → handler callables.
# Note: generate_report needs extra args so it's handled specially in the executor.
SIMPLE_ACTION_HANDLERS = {
    "save_to_db": save_to_db,
    "send_email":  send_email,
}


# ── Background Pipeline Executor ───────────────────────────────────────────────

async def execute_pipeline(workflow_id: str, db: Session):
    """
    Runs all actions in a workflow sequentially in the background.
    Updates workflow.status at each stage ('running' → 'success'/'failed').
    """
    logger.info(f"[Workflow:{workflow_id}] 🚀 Pipeline starting...")

    workflow = db.query(models.AutomateWorkflow).filter(
        models.AutomateWorkflow.id == workflow_id
    ).first()

    if not workflow:
        logger.error(f"[Workflow:{workflow_id}] ❌ Not found — aborting.")
        return

    workflow.status = "running"
    db.commit()

    try:
        pipeline_failed = False
        for action in workflow.actions:
            if action.action_type == "generate_report":
                # generate_report needs the workflow_id to store the PDF path
                ok = await generate_report(action.id, workflow_id, db)
                if not ok:
                    pipeline_failed = True
                    break
            else:
                handler = SIMPLE_ACTION_HANDLERS.get(action.action_type)
                if handler:
                    await handler(action.id, db)
                else:
                    logger.warning(
                        f"[Workflow:{workflow_id}] ⚠️ Unknown action: {action.action_type}"
                    )

        workflow.status = "failed" if pipeline_failed else "success"
        workflow.last_run_at = datetime.datetime.utcnow()
        db.commit()
        if pipeline_failed:
            logger.error(f"[Workflow:{workflow_id}] ❌ Pipeline completed with failures.")
        else:
            logger.info(f"[Workflow:{workflow_id}] 🎉 Pipeline completed successfully.")

    except Exception as err:
        logger.error(f"[Workflow:{workflow_id}] ❌ Pipeline failed: {err}")
        workflow.status = "failed"
        db.commit()
    finally:
        db.close()   # Close the background task's own session


# ── Helper: build response with has_export flag ────────────────────────────────
def _workflow_to_response(wf: models.AutomateWorkflow) -> dict:
    """Convert ORM object to dict matching WorkflowResponse schema."""
    return {
        "id": wf.id,
        "name": wf.name,
        "trigger_type": wf.trigger_type,
        "status": wf.status,
        "export_path": wf.export_path,
        "has_export": bool(wf.export_path and os.path.exists(wf.export_path)),
        "actions": [
            {
                "id": a.id,
                "action_type": a.action_type,
                "label": a.label,
                "execute_order": a.execute_order,
                "last_status": a.last_status,
            }
            for a in wf.actions
        ],
    }


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.post("/create-flow", response_model=schemas.WorkflowResponse)
async def create_flow(
    payload: schemas.WorkflowCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """
    Create a new automation workflow and fire the background pipeline.

    The API returns immediately after saving the DB record.
    The pipeline (save_to_db → send_email → generate_report) runs in the background.
    Poll GET /flows to check when status becomes 'success' and has_export=true.
    """
    # 1. Create the workflow record
    workflow = models.AutomateWorkflow(
        name=payload.name,
        trigger_type=payload.trigger_type,
        status="idle",
        snapshot_url=payload.snapshot_url,
    )
    db.add(workflow)
    db.flush()  # Flush to get the generated workflow.id

    # 2. Create each action step
    for action_data in payload.actions:
        action = models.AutomateAction(
            workflow_id=workflow.id,
            action_type=action_data.action_type,
            label=action_data.label,
            execute_order=action_data.execute_order,
            config=action_data.config or {},
            last_status="pending",
        )
        db.add(action)

    db.commit()
    db.refresh(workflow)

    logger.info(
        f"✅ Workflow '{workflow.name}' (id={workflow.id}) "
        f"saved with {len(workflow.actions)} actions."
    )

    # 3. Schedule the pipeline on a fresh DB session
    #    (the request session closes when this function returns)
    bg_db = SessionLocal()
    background_tasks.add_task(execute_pipeline, workflow.id, bg_db)

    return _workflow_to_response(workflow)


@router.get("/flows", response_model=list[schemas.WorkflowResponse])
def list_flows(db: Session = Depends(get_db)):
    """Return all workflows ordered by newest first, including export status."""
    workflows = (
        db.query(models.AutomateWorkflow)
        .order_by(models.AutomateWorkflow.created_at.desc())
        .all()
    )
    return [_workflow_to_response(wf) for wf in workflows]


@router.get("/flow/{workflow_id}", response_model=schemas.WorkflowResponse)
def get_flow(workflow_id: str, db: Session = Depends(get_db)):
    """
    Return the current state of a single workflow.
    The frontend polls this after 'Create Flow' to check when has_export becomes true.
    """
    wf = db.query(models.AutomateWorkflow).filter(
        models.AutomateWorkflow.id == workflow_id
    ).first()
    if not wf:
        raise HTTPException(status_code=404, detail="Workflow not found")
    return _workflow_to_response(wf)


@router.get("/download/{workflow_id}")
def download_pdf(workflow_id: str, db: Session = Depends(get_db)):
    """
    Serve the generated screenshot/PDF for a completed workflow as a file download.
    Detects format from the file extension (.png or .pdf).
    """
    wf = db.query(models.AutomateWorkflow).filter(
        models.AutomateWorkflow.id == workflow_id
    ).first()

    if not wf:
        raise HTTPException(status_code=404, detail="Workflow not found")

    if not wf.export_path:
        raise HTTPException(
            status_code=404,
            detail="Snapshot not generated yet. The generate_report action may still be running."
        )

    if not os.path.exists(wf.export_path):
        raise HTTPException(
            status_code=404,
            detail=f"File missing from disk: {wf.export_path}"
        )

    # Auto-detect content type from extension
    ext = Path(wf.export_path).suffix.lower()
    if ext == ".png":
        media_type = "image/png"
        ext_label  = "png"
    else:
        media_type = "application/pdf"
        ext_label  = "pdf"

    # Build a safe, human-readable filename
    safe_name = "".join(c if c.isalnum() or c in " -_" else "_" for c in wf.name)
    download_filename = f"{safe_name} - snapshot.{ext_label}"

    return FileResponse(
        path=wf.export_path,
        media_type=media_type,
        filename=download_filename,
        headers={"Content-Disposition": f'attachment; filename="{download_filename}"'},
    )


# ── Legacy Endpoint ────────────────────────────────────────────────────────────

@router.post("/run")
async def run_automate_flow():
    """
    Simple legacy endpoint — returns a mock success response.
    Kept so any older frontend call still gets a valid 200 response.
    """
    now = datetime.datetime.now().strftime("%I:%M:%S %p")
    logger.info(f"Legacy /run triggered at {now}")
    return {
        "success": True,
        "message": "Power Automate flow executed successfully",
        "executed_at": now,
    }
