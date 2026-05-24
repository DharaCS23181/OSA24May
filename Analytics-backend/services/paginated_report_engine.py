import io
import datetime
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, letter, landscape as rl_landscape, portrait as rl_portrait
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, PageBreak, Image as PlatypusImage
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch


# Brand palette aligned with BI dashboard / report theme
_CHART_PRIMARY = "#78176b"
_CHART_PALETTE = ["#78176b", "#9b4d8c", "#b87aa8", "#6d28d9", "#0ea5e9", "#64748b"]


def _human_axis_value(val, _pos=None):
    """Compact axis labels: 1.2B / 560M / 39K — no scientific notation."""
    try:
        n = float(val)
    except (TypeError, ValueError):
        return str(val)
    sign = "−" if n < 0 else ""
    n = abs(n)
    if n >= 1e12:
        return f"{sign}{n / 1e12:.1f}T"
    if n >= 1e9:
        return f"{sign}{n / 1e9:.1f}B"
    if n >= 1e6:
        return f"{sign}{n / 1e6:.1f}M"
    if n >= 1e3:
        return f"{sign}{n / 1e3:.1f}K"
    if n >= 100:
        return f"{sign}{n:,.0f}"
    if n >= 1:
        return f"{sign}{n:,.1f}".rstrip("0").rstrip(".")
    return f"{sign}{n:.2f}"


def _short_label(text, max_len=14):
    s = str(text).strip().replace("\n", " ")
    if len(s) <= max_len:
        return s
    return s[: max_len - 1] + "…"


def _is_date_like_label(s):
    s = str(s).strip()
    if len(s) >= 10 and s[4] == "-" and s[7] == "-":
        return True
    if len(s) >= 10 and s[2] == "/" and s[5] == "/":
        return True
    return False


def _skip_column_for_kpi_summary(col_name: str) -> bool:
    """Skip identifier-like columns in Summary — totals/averages are misleading."""
    n = (col_name or "").strip().lower()
    if not n:
        return True
    if n in ("id", "index", "row", "rownum", "row_number", "uuid", "guid", "key"):
        return True
    if n.endswith("_id"):
        return True
    return False


def _downsample_dict_rows(rows, lk, vk, chart_type, max_points=18):
    """Reduce overcrowded axes; preserve time order for date-like categories."""
    if not rows or len(rows) <= max_points:
        return rows
    date_like = lk and ("date" in lk.lower() or "time" in lk.lower())
    if not date_like and rows:
        date_like = _is_date_like_label(rows[0].get(lk, ""))
    if date_like and chart_type in ("bar", "line", "area", "step"):
        step = max(1, len(rows) // max_points)
        return rows[::step][:max_points]
    if chart_type in ("bar", "pie"):
        try:
            ranked = sorted(
                rows,
                key=lambda r: float(r.get(vk, 0) or 0),
                reverse=True,
            )
            return ranked[:max_points]
        except (TypeError, ValueError):
            return rows[:max_points]
    return rows[:max_points]


def _apply_bi_chart_style(ax, fig, *, show_y_grid=True):
    """Clean dashboard look: soft panel, no heavy frame, optional horizontal grid."""
    ax.set_facecolor("#f8fafc")
    fig.patch.set_facecolor("#ffffff")
    for spine_name in ("top", "right"):
        ax.spines[spine_name].set_visible(False)
    ax.spines["bottom"].set_color("#e2e8f0")
    ax.spines["left"].set_color("#e2e8f0")
    ax.tick_params(axis="both", colors="#64748b", labelsize=9)
    if show_y_grid:
        ax.yaxis.grid(True, color="#e2e8f0", linestyle="-", linewidth=0.9, alpha=1)
        ax.set_axisbelow(True)
    else:
        ax.grid(False)
    ax.xaxis.grid(False)


def generate_chart_image(data, chart_type='bar', title='', width=6*inch, height=3*inch, x_key=None, y_key=None):
    """
    Generate a PNG chart styled to match the BI report theme (purple, readable axes).
    """
    try:
        import matplotlib
        matplotlib.use('Agg')
        import matplotlib.pyplot as plt
        from matplotlib import ticker as mticker

        # Slightly taller figure for rotated category labels
        fig_h = max(height / inch, 3.2)
        fig_w = max(width / inch, 7.0)
        fig, ax = plt.subplots(figsize=(fig_w, fig_h), dpi=120)
        keys = []
        x_label, y_label = "Category", "Value"

        if not data or len(data) == 0:
            ax.text(0.5, 0.5, "No data available", ha="center", va="center", color="#64748b", fontsize=11)
            ax.axis("off")
        else:
            labels = []
            values = []
            chart_type = (chart_type or "bar").lower()
            if chart_type == "column":
                chart_type = "bar"

            if isinstance(data, list) and len(data) > 0 and isinstance(data[0], dict):
                keys = list(data[0].keys())
                lk = x_key if x_key and x_key in data[0] else None
                vk = y_key if y_key and y_key in data[0] else None
                if not lk or not vk:
                    if "name" in data[0] and "value" in data[0]:
                        lk, vk = "name", "value"
                    else:
                        lk = lk or (keys[0] if keys else None)
                        num_k = None
                        for k in keys:
                            if k == lk:
                                continue
                            try:
                                float(data[0].get(k))
                                num_k = k
                                break
                            except (TypeError, ValueError):
                                continue
                        vk = vk or num_k or (keys[1] if len(keys) > 1 else keys[0])
                if lk and vk and lk == vk and len(keys) > 1:
                    for k in keys:
                        if k != lk:
                            vk = k
                            break
                x_label = str(lk) if lk else x_label
                y_label = str(vk) if vk else y_label

                slice_rows = _downsample_dict_rows(data, lk, vk, chart_type, max_points=18)
                try:
                    values = [float(row.get(vk, 0) or 0) for row in slice_rows]
                except (TypeError, ValueError):
                    values = list(range(len(slice_rows)))
                labels = [_short_label(row.get(lk, ""), 16) for row in slice_rows]
            elif isinstance(data, list) and len(data) > 0:
                cap = min(24, len(data))
                labels = [str(i) for i in range(cap)]
                values = [float(x) for x in data[:cap]]
            else:
                labels, values = [], []

            if chart_type == "pie":
                _apply_bi_chart_style(ax, fig, show_y_grid=False)
                ax.pie(
                    values,
                    labels=labels,
                    autopct="%1.1f%%",
                    colors=_CHART_PALETTE * (1 + len(values) // len(_CHART_PALETTE)),
                    wedgeprops=dict(edgecolor="white", linewidth=1.2),
                    textprops={"fontsize": 8, "color": "#334155"},
                )
                ax.axis("equal")
            else:
                _apply_bi_chart_style(ax, fig)
                ax.yaxis.set_major_formatter(mticker.FuncFormatter(_human_axis_value))
                if chart_type in ("line", "step"):
                    x_idx = list(range(len(labels)))
                    if chart_type == "step":
                        ax.plot(
                            x_idx,
                            values,
                            color=_CHART_PRIMARY,
                            linewidth=2.4,
                            drawstyle="steps-post",
                        )
                    else:
                        ax.plot(
                            x_idx,
                            values,
                            color=_CHART_PRIMARY,
                            linewidth=2.4,
                            marker="o",
                            markersize=5,
                            markerfacecolor="white",
                            markeredgewidth=1.5,
                            markeredgecolor=_CHART_PRIMARY,
                        )
                    ax.set_xticks(x_idx)
                    ax.set_xticklabels(labels, rotation=32, ha="right", fontsize=8)
                    ax.set_xlabel(x_label, color="#475569", fontsize=10, labelpad=8)
                    ax.set_ylabel(y_label, color="#475569", fontsize=10, labelpad=8)
                else:
                    # Bar (default): numeric x positions — matches dashboard bar visuals
                    x_idx = list(range(len(labels)))
                    ax.bar(
                        x_idx,
                        values,
                        color=_CHART_PRIMARY,
                        edgecolor="white",
                        linewidth=0.85,
                        width=0.72,
                        alpha=0.92,
                    )
                    ax.set_xticks(x_idx)
                    ax.set_xticklabels(labels, rotation=32, ha="right", fontsize=8)
                    ax.set_xlabel(x_label, color="#475569", fontsize=10, labelpad=8)
                    ax.set_ylabel(y_label, color="#475569", fontsize=10, labelpad=8)

            if title:
                ax.set_title(
                    title,
                    fontsize=13,
                    fontweight="600",
                    color=_CHART_PRIMARY,
                    pad=14,
                )

            fig.subplots_adjust(bottom=0.22, left=0.12, right=0.96, top=0.88)

        buf = io.BytesIO()
        fig.savefig(buf, format="png", dpi=160, bbox_inches="tight", facecolor=fig.get_facecolor(), pad_inches=0.28)
        plt.close(fig)
        buf.seek(0)
        return buf.getvalue()
    except Exception as e:
        import traceback
        print(f"Error generating chart: {e}")
        traceback.print_exc()
        return None


class PaginatedReportEngine:
    @staticmethod
    def generate_pdf(report_config, elements, data_provider_fn):
        """
        Generates a COMPLETE Power BI-style paginated report PDF.
        
        Structure:
        1. Header (title + date)
        2. Summary section (KPIs)
        3. Chart section (optional)
        4. Table section (paginated)
        5. Footer (Page X of Y)
        
        report_config: {
            page_size: "A4" or "LETTER",
            orientation: "portrait" or "landscape",
            header_text: "Report Title",
            rows_per_page: 30,
            show_header: true,
            show_footer: true,
            include_summary: true,
            include_chart: false,
            chart_type: "bar"
        }
        
        elements: [{
            type: "table" | "chart" | "text",
            config_json: {...}
        }]
        
        data_provider_fn(data_source_index) -> list of dicts
        """
        buffer = io.BytesIO()
        
        # Page size configuration
        page_size_str = report_config.get("page_size", "A4").upper()
        page_size = letter if page_size_str == "LETTER" else A4
            
        orientation_str = report_config.get("orientation", "portrait").lower()
        if orientation_str == "landscape":
            page_size = rl_landscape(page_size)
        else:
            page_size = rl_portrait(page_size)
            
        # Margins
        left_margin = 0.75 * inch
        right_margin = 0.75 * inch
        top_margin = 0.75 * inch
        bottom_margin = 0.75 * inch
        
        doc = SimpleDocTemplate(
            buffer,
            pagesize=page_size,
            rightMargin=right_margin,
            leftMargin=left_margin,
            topMargin=top_margin,
            bottomMargin=bottom_margin
        )

        story = []
        styles = getSampleStyleSheet()
        
        # Custom styles
        styles.add(ParagraphStyle(name='ReportTitle', parent=styles['Heading1'], 
                                   fontSize=24, textColor=colors.HexColor('#78176b'), 
                                   spaceAfter=10, keepWithNext=True))
        styles.add(ParagraphStyle(name='ReportDate', parent=styles['Normal'], 
                                   fontSize=10, textColor=colors.grey, spaceAfter=20))
        styles.add(ParagraphStyle(name='SectionHeader', parent=styles['Heading2'], 
                                   fontSize=14, textColor=colors.HexColor('#78176b'), 
                                   spaceAfter=10, spaceBefore=20))
        styles.add(ParagraphStyle(name='KPIValue', parent=styles['Normal'], 
                                   fontSize=20, textColor=colors.HexColor('#78176b'), alignment=1))
        styles.add(ParagraphStyle(name='KPILabel', parent=styles['Normal'], 
                                   fontSize=10, textColor=colors.grey, alignment=1))
        
        # Get config values
        header_text = report_config.get("header_text", "Report")
        default_rows_per_page = report_config.get("rows_per_page", 30)
        show_footer_setting = report_config.get("show_footer", True)
        include_summary = report_config.get("include_summary", True)
        include_chart = report_config.get("include_chart", False)
        chart_type = report_config.get("chart_type", 'bar')
        
        # Calculate page dimensions
        page_width = page_size[0] - left_margin - right_margin
        report_row_cap = max(1, min(int(default_rows_per_page or 30), 50_000))
        
        # ===== 1. HEADER SECTION =====
        story.append(Paragraph(header_text, styles['ReportTitle']))
        story.append(Paragraph(datetime.datetime.now().strftime('%B %d, %Y'), styles['ReportDate']))
        ds_rows = report_config.get("dataset_row_count")
        sel_cols = report_config.get("selected_columns_count")
        if ds_rows is not None or sel_cols is not None:
            bits = []
            if ds_rows is not None:
                try:
                    bits.append(f"<b>Dataset rows:</b> {int(ds_rows):,}")
                except (TypeError, ValueError):
                    bits.append(f"<b>Dataset rows:</b> {ds_rows}")
            if sel_cols is not None:
                try:
                    bits.append(f"<b>Columns selected for export:</b> {int(sel_cols)}")
                except (TypeError, ValueError):
                    bits.append(f"<b>Columns selected for export:</b> {sel_cols}")
            story.append(Paragraph(" &nbsp;|&nbsp; ".join(bits), styles['ReportDate']))
        story.append(Spacer(1, 0.2 * inch))
        
        # ===== 2. SUMMARY SECTION (KPIs) =====
        if include_summary:
            # Get data for summary (cap to same limit as charts: rows_per_page from report settings)
            data_source_index = 0
            data_rows = data_provider_fn(data_source_index)
            if data_rows and len(data_rows) > report_row_cap:
                data_rows = data_rows[:report_row_cap]

            if data_rows and len(data_rows) > 0:
                story.append(Paragraph('Summary', styles['SectionHeader']))

                total_rows = len(data_rows)

                numeric_cols = []
                sample = data_rows[0]
                for key, val in sample.items():
                    if _skip_column_for_kpi_summary(key):
                        continue
                    try:
                        float(val)
                        numeric_cols.append(key)
                    except Exception:
                        pass

                kpi_data = [['Metric', 'Value']]
                kpi_data.append(['Rows in sample', str(total_rows)])

                for col in numeric_cols[:3]:
                    try:
                        values = [float(row.get(col, 0)) for row in data_rows if row.get(col) is not None]
                        if values:
                            avg = sum(values) / len(values)
                            total = sum(values)
                            kpi_data.append([f'{col} - Total', f'{total:,.2f}'])
                            kpi_data.append([f'{col} - Average', f'{avg:,.2f}'])
                    except Exception:
                        pass

                kpi_table = Table(kpi_data[:7], colWidths=[page_width / 2, page_width / 2])
                kpi_style = TableStyle([
                    ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#78176b')),
                    ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
                    ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                    ('FONTSIZE', (0, 0), (-1, 0), 10),
                    ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                    ('BOTTOMPADDING', (0, 0), (-1, 0), 10),
                    ('GRID', (0, 0), (-1, -1), 0.5, colors.lightgrey),
                    ('BACKGROUND', (0, 1), (-1, -1), colors.white),
                ])
                kpi_table.setStyle(kpi_style)
                story.append(kpi_table)
                story.append(Spacer(1, 0.25 * inch))
        
        # ===== 3. CHART SECTION =====
        if include_chart:
            story.append(Paragraph('Visualization', styles['SectionHeader']))
            
            data_rows = data_provider_fn(0)
            if data_rows and len(data_rows) > report_row_cap:
                data_rows = data_rows[:report_row_cap]
            if data_rows and len(data_rows) > 0:
                chart_bytes = generate_chart_image(data_rows, chart_type, header_text)
                if chart_bytes:
                    img = PlatypusImage(io.BytesIO(chart_bytes), width=page_width, height=2.5*inch)
                    story.append(img)
            
            story.append(Spacer(1, 0.3 * inch))
        
        # ===== 4. TABLE / CHART ELEMENTS =====
        for element in elements:
            el_type = element.get("type")
            config = element.get("config_json", {})
            
            if el_type == "text":
                text = config.get("content", "")
                story.append(Paragraph(text, styles['Normal']))
                story.append(Spacer(1, 0.1 * inch))
                 
            elif el_type == "table":
                columns = config.get("columns", [])
                rows_per_page = config.get("rows_per_page", default_rows_per_page)
                show_header_el = config.get("show_header", True)

                table_data_cfg = config.get("table_data")
                if table_data_cfg:
                    data_rows = table_data_cfg
                else:
                    data_rows = data_provider_fn(config.get("data_source_index", 0)) or []

                if not data_rows:
                    continue

                if columns:
                    col_pick = [col.get("name") for col in columns if col.get("name")]
                    if col_pick:
                        data_rows = [{k: row.get(k) for k in col_pick} for row in data_rows]
                else:
                    columns = [{"name": c, "header": c} for c in list(data_rows[0].keys())]

                if not columns:
                    continue

                if len(data_rows) > report_row_cap:
                    data_rows = data_rows[:report_row_cap]

                # Prepare column names
                col_names = [col.get("name") for col in columns]
                col_headers = [col.get("header", col.get("name")) for col in columns]
                
                # Calculate column widths (equal distribution)
                num_cols = len(col_names)
                if num_cols > 0:
                    col_width = page_width / num_cols
                    col_widths = [col_width] * num_cols
                else:
                    col_widths = None
                
                # Split data into pages (data_rows already capped to export limit)
                total_rows = len(data_rows)
                total_pages = max(1, (total_rows + rows_per_page - 1) // rows_per_page)

                for page_num in range(total_pages):
                    start_idx = page_num * rows_per_page
                    end_idx = min(start_idx + rows_per_page, total_rows)
                    page_data = data_rows[start_idx:end_idx]
                    
                    # Build table data
                    table_data = []
                    
                    # Header row
                    if page_num == 0 or show_header_el:
                        table_data.append(col_headers)
                    
                    # Data rows
                    for row_dict in page_data:
                        row_data = [str(row_dict.get(col_name, ""))[:50] for col_name in col_names]
                        table_data.append(row_data)
                    
                    # Create table
                    t = Table(table_data, colWidths=col_widths, repeatRows=1)
                    
                    # Style
                    t_style = TableStyle([
                        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#78176b')),
                        ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
                        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
                        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                        ('FONTSIZE', (0, 0), (-1, 0), 9),
                        ('BOTTOMPADDING', (0, 0), (-1, 0), 8),
                        ('TOPPADDING', (0, 0), (-1, 0), 8),
                        ('BACKGROUND', (0, 1), (-1, -1), colors.white),
                        ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
                        ('FONTSIZE', (0, 1), (-1, -1), 8),
                        ('BOTTOMPADDING', (0, 1), (-1, -1), 6),
                        ('GRID', (0, 0), (-1, -1), 0.5, colors.lightgrey),
                    ])
                    
                    # Alternating row colors
                    header_rows = 1 if (page_num == 0 or show_header_el) else 0
                    for i in range(header_rows, len(table_data)):
                        if i % 2 == 0:
                            t_style.add('BACKGROUND', (0, i), (-1, i), colors.HexColor('#f9fafb'))
                    
                    t.setStyle(t_style)
                    story.append(t)
                    
                    # Page number info for this chunk
                    story.append(Spacer(1, 0.1 * inch))
                    if total_pages > 1:
                        story.append(Paragraph(
                            f'<small>Rows {start_idx + 1}–{end_idx} of {total_rows}</small>',
                            styles['Normal'],
                        ))

                    if page_num < total_pages - 1:
                        story.append(PageBreak())
                
                story.append(Spacer(1, 0.2 * inch))

            elif el_type == "chart":
                chart_data = config.get("chart_data")
                chart_type = (config.get("chart_type") or "bar").lower()
                if chart_type == "column":
                    chart_type = "bar"
                title = config.get("title", "Chart")
                x_field = config.get("xField") or config.get("x_axis")
                y_field = config.get("yField") or config.get("y_field") or config.get("y_axis")
                
                if chart_data and len(chart_data) > 0:
                    chart_bytes = generate_chart_image(
                        chart_data, chart_type, title,
                        x_key=x_field, y_key=y_field
                    )
                    if chart_bytes:
                        img = PlatypusImage(io.BytesIO(chart_bytes), width=page_width, height=2.5*inch)
                        story.append(img)
                else:
                    story.append(Paragraph("No chart data available.", styles['Normal']))
                
                story.append(Spacer(1, 0.2 * inch))

        # ===== 5. FOOTER =====
        # Using canvas callback for page numbers
        def add_page_number(canvas, doc):
            page_num = canvas.getPageNumber()
            canvas.saveState()
            
            # Footer line
            canvas.setStrokeColor(colors.lightgrey)
            canvas.setLineWidth(0.5)
            canvas.line(left_margin, bottom_margin - 0.2*inch, 
                       page_size[0] - right_margin, bottom_margin - 0.2*inch)
            
            # Page number
            canvas.setFont('Helvetica', 9)
            canvas.setFillColor(colors.grey)
            canvas.drawRightString(page_size[0] - right_margin, 0.3 * inch, f"Page {page_num}")
            
            canvas.restoreState()

        doc.build(story, onFirstPage=add_page_number, onLaterPages=add_page_number)
        
        pdf_bytes = buffer.getvalue()
        buffer.close()
        return pdf_bytes