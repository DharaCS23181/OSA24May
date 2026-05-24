import asyncio
from playwright.async_api import async_playwright
import os
from utils.logger import get_logger

logger = get_logger("services.report_pdf_service")

class ReportPDFService:
    """
    Generates pixel-perfect PDFs by rendering the report in a headless browser.
    """
    
    @staticmethod
    async def generate_pdf(report_id: str, base_url: str = "http://localhost:5173"):
        """
        Loads the report preview page and prints it to PDF.
        """
        async with async_playwright() as p:
            browser = await p.chromium.launch()
            page = await browser.new_page()
            
            # Construct the preview URL
            # Note: In production, this would need an auth token
            url = f"{base_url}/analytics/reports/builder/{report_id}?preview=true"
            logger.info(f"Navigating to {url} for PDF generation")
            
            await page.goto(url, wait_until="networkidle")
            
            # Give it an extra second for any animations/charts to finalize
            await asyncio.sleep(1)
            
            # Define PDF output path
            output_dir = "exports"
            os.makedirs(output_dir, exist_ok=True)
            output_path = os.path.join(output_dir, f"report_{report_id}.pdf")
            
            # Print to PDF with print-style pagination
            await page.pdf(
                path=output_path,
                format="A4",
                print_background=True,
                margin={"top": "0px", "right": "0px", "bottom": "0px", "left": "0px"},
                display_header_footer=False
            )
            
            await browser.close()
            return output_path

# Helper for sync calling in FastAPI if needed
def sync_generate_pdf(report_id, base_url):
    return asyncio.run(ReportPDFService.generate_pdf(report_id, base_url))
