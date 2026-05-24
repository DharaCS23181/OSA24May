"""
snapshot_service.py
───────────────────
Takes a pixel-perfect screenshot of the dashboard using Playwright's
headless Chromium browser — exactly what the user sees on screen.

Output: A PNG image saved under backend/exports/, served for download
        via GET /api/power-automate/download/{workflow_id}
"""

import asyncio
from pathlib import Path

# Saved screenshots go here
EXPORTS_DIR = Path(__file__).parent.parent / "exports"
EXPORTS_DIR.mkdir(parents=True, exist_ok=True)


def _capture_snapshot_pdf_sync(workflow_id: str, url: str) -> str:
    """
    Blocking Playwright capture used via asyncio.to_thread().
    This avoids asyncio subprocess issues on some Windows/Python runtimes.
    """
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        raise RuntimeError(
            "Playwright not installed. Run: pip install playwright && playwright install chromium"
        )

    output_path = str(EXPORTS_DIR / f"snapshot_{workflow_id}.png")
    print(f"[SnapshotService] 📸 Opening: {url}")

    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        context = browser.new_context(
            viewport={"width": 1440, "height": 900},
            device_scale_factor=1.5,
        )
        page = context.new_page()
        page.goto(url, wait_until="networkidle", timeout=30_000)
        # Give charts/animations a moment to settle.
        page.wait_for_timeout(3000)
        page.screenshot(
            path=output_path,
            full_page=True,
            type="png",
            animations="disabled",
        )
        browser.close()

    print(f"[SnapshotService] ✅ Screenshot saved: {output_path}")
    return output_path


async def capture_snapshot_pdf(workflow_id: str, url: str) -> str:
    """
    Async wrapper that runs sync Playwright in a worker thread.
    """
    return await asyncio.to_thread(_capture_snapshot_pdf_sync, workflow_id, url)
