"""
ArithFlow — Tally Connector.

Connects to TallyPrime / Tally.ERP 9 via its built-in HTTP XML server (default port 9000).
TallyPrime exposes a local XML API — this connector POSTs XML requests and parses the XML response.

Manual Setup: The user must have TallyPrime running locally or on a network host with the
HTTP server enabled (Gateway of Tally → F12 → Enable ODBC / HTTP server on port 9000).

Also supports fallback to Excel/CSV export files if `file_path` is set.
"""

from __future__ import annotations

import xml.etree.ElementTree as ET
from typing import Any, AsyncGenerator

import httpx
import polars as pl

from connectors.base import BaseConnector, LoadResult
from utils.logger import get_logger

logger = get_logger("connectors.tally")

# Common Tally report XML request templates
TALLY_REQUESTS = {
    "Ledger": """<ENVELOPE>
  <HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Collection</TYPE><ID>Ledger</ID></HEADER>
  <BODY><DESC><STATICVARIABLES>
    <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
    {date_filter}
  </STATICVARIABLES>
  <TDL><TDLMESSAGE><COLLECTION ISMODIFY="No" ISFIXED="No" ISINITIALIZE="No" ISOPTION="No" ISINTERNAL="No" NAME="Ledger">
    <TYPE>Ledger</TYPE>
    <FETCH>Name,Parent,OpeningBalance,ClosingBalance,LedgerPhone,LedgerEmail</FETCH>
  </COLLECTION></TDLMESSAGE></TDL></DESC></BODY>
</ENVELOPE>""",
    "Vouchers": """<ENVELOPE>
  <HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Collection</TYPE><ID>AllVouchers</ID></HEADER>
  <BODY><DESC><STATICVARIABLES>
    <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
    <SVFROMDATE>{from_date}</SVFROMDATE>
    <SVTODATE>{to_date}</SVTODATE>
  </STATICVARIABLES>
  <TDL><TDLMESSAGE><COLLECTION ISMODIFY="No" ISFIXED="No" ISINITIALIZE="No" ISOPTION="No" ISINTERNAL="No" NAME="AllVouchers">
    <TYPE>Voucher</TYPE>
    <FETCH>Date,VoucherTypeName,VoucherNumber,PartyLedgerName,Amount,Narration</FETCH>
  </COLLECTION></TDLMESSAGE></TDL></DESC></BODY>
</ENVELOPE>""",
    "Stock": """<ENVELOPE>
  <HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Collection</TYPE><ID>StockItems</ID></HEADER>
  <BODY><DESC><STATICVARIABLES>
    <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
    {date_filter}
  </STATICVARIABLES>
  <TDL><TDLMESSAGE><COLLECTION ISMODIFY="No" ISFIXED="No" ISINITIALIZE="No" ISOPTION="No" ISINTERNAL="No" NAME="StockItems">
    <TYPE>StockItem</TYPE>
    <FETCH>Name,Parent,BaseUnits,OpeningBalance,ClosingBalance,OpeningRate,ClosingRate</FETCH>
  </COLLECTION></TDLMESSAGE></TDL></DESC></BODY>
</ENVELOPE>""",
}


class TallyConnector(BaseConnector):
    """
    Tally XML HTTP connector.
    Config:
    - host: Tally host (default: localhost)
    - port: Tally HTTP port (default: 9000)
    - company: Tally company name (optional, uses active company if blank)
    - report: Ledger | Vouchers | Stock (default: Ledger)
    - from_date: YYYYMMDD (for Vouchers, default: 1-Apr of current year)
    - to_date: YYYYMMDD (for Vouchers, default: today)
    - file_path: Fallback — path to Tally Excel/CSV export file
    - chunk_size: records per yield (default: 500)
    """

    async def test_connection(self) -> bool:
        # If file_path mode, check file exists
        file_path = self.config.get("file_path", "")
        if file_path:
            import os
            return os.path.exists(file_path)

        host = self.config.get("host", "localhost")
        port = self.config.get("port", 9000)
        url = f"http://{host}:{port}"

        try:
            # Send a minimal test request to Tally
            test_xml = """<ENVELOPE><HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Function</TYPE><ID>$$IsEmpty:""</ID></HEADER><BODY><DESC></DESC></BODY></ENVELOPE>"""
            async with httpx.AsyncClient(timeout=8) as client:
                resp = await client.post(url, content=test_xml, headers={"Content-Type": "text/xml"})
                return resp.status_code < 500
        except Exception as e:
            logger.error(f"Tally connection test failed: {e}")
            return False

    async def extract(self) -> AsyncGenerator[list[dict[str, Any]], None]:
        file_path = self.config.get("file_path", "")

        # Fallback mode: read from exported Excel/CSV file
        if file_path:
            async for chunk in self._extract_from_file(file_path):
                yield chunk
            return

        # Live Tally XML mode
        host = self.config.get("host", "localhost")
        port = int(self.config.get("port", 9000))
        report = self.config.get("report", "Ledger")
        from_date = self.config.get("from_date", "20240401")
        to_date = self.config.get("to_date", "20241231")
        chunk_size = int(self.config.get("chunk_size", 500))

        url = f"http://{host}:{port}"

        # Build XML request
        date_filter = f"<SVFROMDATE>{from_date}</SVFROMDATE><SVTODATE>{to_date}</SVTODATE>"
        xml_body = TALLY_REQUESTS.get(report, TALLY_REQUESTS["Ledger"])
        xml_body = xml_body.replace("{from_date}", from_date).replace("{to_date}", to_date)
        xml_body = xml_body.replace("{date_filter}", date_filter)

        logger.info(f"Connecting to Tally at {url}, report: {report}")

        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(
                url,
                content=xml_body.encode("utf-8"),
                headers={"Content-Type": "text/xml; charset=utf-8"},
            )
            resp.raise_for_status()

        records = _parse_tally_xml(resp.text, report)
        logger.info(f"Tally returned {len(records)} records for {report}")

        # Yield in chunks
        for i in range(0, len(records), chunk_size):
            yield records[i : i + chunk_size]

        logger.info("Tally extraction complete.")

    async def _extract_from_file(self, file_path: str) -> AsyncGenerator[list[dict[str, Any]], None]:
        """Fallback: read from Tally-exported Excel or CSV file."""
        import os
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"Tally export file not found: {file_path}")

        chunk_size = int(self.config.get("chunk_size", 500))
        ext = os.path.splitext(file_path)[1].lower()

        loop = __import__("asyncio").get_event_loop()

        if ext in (".xlsx", ".xls"):
            df = await loop.run_in_executor(None, lambda: pl.read_excel(file_path))
        elif ext == ".csv":
            df = await loop.run_in_executor(None, lambda: pl.read_csv(file_path, infer_schema_length=1000))
        else:
            raise ValueError(f"Unsupported Tally export file type: {ext}")

        for i in range(0, len(df), chunk_size):
            yield df.slice(i, chunk_size).to_dicts()

    async def load(self, data: Any) -> LoadResult:
        return LoadResult(success=False, message="Tally connector is source-only.")

    @staticmethod
    def get_config_schema() -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "host": {
                    "type": "string",
                    "title": "Tally Host",
                    "default": "localhost",
                    "description": "Hostname or IP where TallyPrime is running",
                },
                "port": {
                    "type": "integer",
                    "title": "Tally Port",
                    "default": 9000,
                    "description": "Tally HTTP server port (default 9000)",
                },
                "company": {
                    "type": "string",
                    "title": "Company Name",
                    "description": "Tally company name (leave blank for active company)",
                },
                "report": {
                    "type": "string",
                    "title": "Report / Data Type",
                    "enum": ["Ledger", "Vouchers", "Stock"],
                    "default": "Ledger",
                    "description": "Type of Tally data to extract",
                },
                "from_date": {
                    "type": "string",
                    "title": "From Date (YYYYMMDD)",
                    "default": "20240401",
                    "description": "Start date for Vouchers (format: 20240401)",
                },
                "to_date": {
                    "type": "string",
                    "title": "To Date (YYYYMMDD)",
                    "default": "20241231",
                    "description": "End date for Vouchers/Stock (format: 20241231)",
                },
                "file_path": {
                    "type": "string",
                    "format": "file",
                    "title": "File Path",
                    "description": "Select an uploaded Excel/CSV file from the dropdown if you're not using live XML mode"
                },
                "chunk_size": {
                    "type": "integer",
                    "title": "Chunk Size",
                    "default": 500,
                    "description": "Records per batch",
                },
                "output_file_name": {
                    "type": "string",
                    "title": "Output File Name",
                    "description": "Specify the name for the generated output file (e.g., tally_data.parquet).",
                },
            },
            "required": ["output_file_name"],
        }

    @staticmethod
    def get_display_name() -> str:
        return "Tally (TallyPrime XML / Export)"


def _parse_tally_xml(xml_text: str, report: str) -> list[dict[str, Any]]:
    """Parse Tally XML response into a list of flat dicts."""
    records = []

    # Clean up common Tally XML quirks
    xml_text = xml_text.strip()
    if not xml_text:
        return records

    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError as e:
        logger.error(f"Tally XML parse error: {e}\nRaw: {xml_text[:500]}")
        return records

    # Find collection items — they are direct children of BODY/DATA/TALLYMESSAGE
    # or ENVELOPE/BODY/DATA/TALLYMESSAGE depending on Tally version
    items = []
    for tag in ["TALLYMESSAGE", "ENVELOPE"]:
        items = root.findall(f".//{tag}/*") or []
        if items:
            break

    # If no items found, try finding any repeated child elements
    if not items:
        for child in root.iter():
            if len(list(child)) > 0:
                items = list(child)
                break

    for item in items:
        record: dict[str, Any] = {}
        # Include tag name as type
        record["_tally_type"] = item.tag
        for child in item:
            key = child.tag.strip()
            val = (child.text or "").strip()
            record[key] = val
        if len(record) > 1:  # Worth keeping if has more than just type
            records.append(record)

    return records
