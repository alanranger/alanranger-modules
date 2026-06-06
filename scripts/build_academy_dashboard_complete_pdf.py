"""Build a full Academy Dashboard inventory PDF from the live Squarespace snippet.

Reads academy-dashboard-squarespace-snippet-v1.html (modules, practice packs,
checklists, applied learning, RPS) and writes academy-dashboard-complete-inventory.pdf.
"""
from __future__ import annotations

import html
import re
from datetime import date
from pathlib import Path
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

SCRIPT_DIR = Path(__file__).resolve().parent
SNIPPET_PATH = SCRIPT_DIR.parent / "Squarespace Snippets" / "academy-dashboard-squarespace-snippet-v1.html"
OUTPUT_PATH = SCRIPT_DIR.parent / "academy-dashboard-complete-inventory.pdf"
BASE = "https://www.alanranger.com"

BRAND_ORANGE = colors.HexColor("#E57200")
PLACEHOLDER_BG = colors.HexColor("#FEF3C7")
PLACEHOLDER_TEXT = colors.HexColor("#7C4A03")
LIVE_BG = colors.HexColor("#FFF5EC")
COMING_SOON_BG = colors.HexColor("#FDE68A")
ROW_STRIPE = colors.HexColor("#F7F7F9")
BORDER = colors.HexColor("#D5D8DE")
HEADER_BG = colors.HexColor("#1E293B")
TEXT = colors.HexColor("#1E1E1E")
MUTED = colors.HexColor("#64748B")

MODULE_GROUPS = [
    ("15 Key Camera Setting Modules", 1, 15),
    ("10 Essential Gear and Accessory Guides", 16, 25),
    ("10 Composition Guide Modules", 26, 35),
    ("10 Photography Genre Topic Guides", 36, 45),
    ("15 Practical Photography Assignments", 46, 60),
]

PRACTICE_PACK_GROUPS = [
    ("Technical Foundations", 0, 9),
    ("Composition & Creative", 10, 19),
    ("Genre-Specific", 20, 29),
]

CHECKLIST_GROUPS = [
    ("Composition Guides", 0, 9),
    ("Genre Guides", 10, 19),
    ("Camera Settings Guides", 20, 34),
]

COL_TITLE_SLUG_URL = ["#", "Title (from slug)", "URL"]


def read_snippet() -> str:
    return SNIPPET_PATH.read_text(encoding="utf-8")


def extract_js_string_array(source: str, const_name: str) -> list[str]:
    lines = source.splitlines()
    out: list[str] = []
    in_array = False
    for line in lines:
        if not in_array:
            if f"const {const_name} = [" in line:
                in_array = True
            continue
        if "];" in line and line.strip().endswith("];"):
            break
        m = re.search(r"'(/[^']+)'", line)
        if m:
            out.append(m.group(1))
    return out


def full_url(path: str) -> str:
    if path.startswith("http://") or path.startswith("https://"):
        return path
    return BASE.rstrip("/") + path


def slug_to_title(path: str) -> str:
    slug = path.rstrip("/").split("/")[-1]
    if slug.lower().endswith(".pdf"):
        slug = slug[:-4]
    t = slug.replace("-", " ").replace("_", " ")
    return " ".join(w.capitalize() for w in t.split())


def parse_attr_string(s: str) -> dict[str, str]:
    return dict(re.findall(r'([\w-]+)="([^"]*)"', s))


def _applied_anchor_row(attrs: dict[str, str], num: str) -> dict:
    href = attrs.get("href", "")
    ph = attrs.get("data-applied-placeholder") == "true"
    if ph or href in ("#", ""):
        sid = attrs.get("data-applied-id", "")
        url_disp = (
            f"{BASE}/blog-on-photography/{sid} (planned — tile still href=#)"
            if sid
            else "(placeholder — no id)"
        )
        status = "placeholder"
    else:
        status = "live"
        url_disp = href
    return {
        "num": num,
        "status": status,
        "title": html.unescape(attrs.get("title", "")),
        "id": attrs.get("data-applied-id", ""),
        "url": url_disp,
    }


def _applied_button_row(m: re.Match[str]) -> dict:
    t_m = re.search(r'title="([^"]*)"', m.group(0))
    tit = html.unescape(t_m.group(1)) if t_m else ""
    return {
        "num": m.group(1),
        "status": "coming-soon",
        "title": tit,
        "id": "",
        "url": "—",
    }


def extract_applied_learning(html_text: str) -> list[tuple[str, list[dict]]]:
    start = html_text.find('<div id="ar-applied-learning-mini-grid">')
    end = html_text.find('id="arp-rps-accreditation-tile"', start)
    if start == -1 or end == -1:
        return []
    block = html_text[start:end]
    chunks = re.split(
        r'<div class="ar-applied-learning-category-row">\s*',
        block,
    )[1:]
    sections: list[tuple[str, list[dict]]] = []
    for chunk in chunks:
        lm = re.search(
            r'<div class="ar-applied-learning-category-label">([^<]+)</div>',
            chunk,
        )
        label = html.unescape(lm.group(1).strip()) if lm else ""
        cm = re.search(
            r'<div class="ar-applied-learning-category-cubes">(.*?)</div>\s*</div>',
            chunk,
            re.DOTALL,
        )
        if not cm:
            continue
        inner = cm.group(1)
        items: list[dict] = []
        for m in re.finditer(r"<a\s+([^>]+)>(\d{2})</a>", inner):
            items.append(_applied_anchor_row(parse_attr_string(m.group(1)), m.group(2)))
        for m in re.finditer(r"<button[^>]*>(\d{2})</button>", inner):
            items.append(_applied_button_row(m))
        sections.append((label, items))
    return sections


def extract_rps(html_text: str) -> list[dict]:
    m = re.search(
        r'<div class="ar-rps-cubes">(.*?)</div>\s*</div>',
        html_text,
        re.DOTALL,
    )
    if not m:
        return []
    inner = m.group(1)
    rows: list[dict] = []
    for am in re.finditer(r"<a\s+([^>]+)>(\d{2})</a>", inner):
        attrs = parse_attr_string(am.group(1))
        rows.append(
            {
                "num": am.group(2),
                "status": "live",
                "title": html.unescape(attrs.get("title", "")),
                "url": attrs.get("href", ""),
            }
        )
    for bm in re.finditer(r"<button[^>]*>(\d{2})</button>", inner):
        rows.append(
            {
                "num": bm.group(1),
                "status": "coming-soon",
                "title": "—",
                "url": "—",
            }
        )
    rows.sort(key=lambda r: r["num"])
    return rows


def build_styles():
    base = getSampleStyleSheet()
    return {
        "title": ParagraphStyle(
            "title",
            parent=base["Title"],
            fontName="Helvetica-Bold",
            fontSize=20,
            leading=24,
            textColor=BRAND_ORANGE,
            spaceAfter=4,
        ),
        "subtitle": ParagraphStyle(
            "subtitle",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=9.5,
            textColor=MUTED,
            spaceAfter=10,
        ),
        "h2": ParagraphStyle(
            "h2",
            parent=base["Heading2"],
            fontName="Helvetica-Bold",
            fontSize=13,
            leading=16,
            textColor=TEXT,
            spaceBefore=12,
            spaceAfter=6,
        ),
        "h3": ParagraphStyle(
            "h3",
            parent=base["Heading3"],
            fontName="Helvetica-Bold",
            fontSize=11,
            leading=14,
            textColor=BRAND_ORANGE,
            spaceBefore=8,
            spaceAfter=4,
        ),
        "body": ParagraphStyle(
            "body",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=9,
            leading=12,
            textColor=TEXT,
        ),
        "cell": ParagraphStyle(
            "cell",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=7.5,
            leading=9.5,
            textColor=TEXT,
        ),
        "cell_bold": ParagraphStyle(
            "cell_bold",
            parent=base["Normal"],
            fontName="Helvetica-Bold",
            fontSize=7.5,
            leading=9.5,
            textColor=TEXT,
        ),
    }


def para(txt: str, style) -> Paragraph:
    return Paragraph(escape(txt).replace("\n", "<br/>"), style)


def url_para(url: str, style) -> Paragraph:
    safe_href = escape(url, {"'": "&apos;", '"': "&quot;"})
    u = url if len(url) < 200 else url[:90] + " ... " + url[-85:]
    safe_u = escape(u, {"'": "&apos;", '"': "&quot;"})
    return Paragraph(f'<a href="{safe_href}" color="blue">{safe_u}</a>', style)


def three_col_table(
    styles,
    title_row: list[str],
    rows: list[tuple[str, str, str]],
    col_widths,
):
    hdr = [
        para(title_row[0], styles["cell_bold"]),
        para(title_row[1], styles["cell_bold"]),
        para(title_row[2], styles["cell_bold"]),
    ]
    body = [hdr]
    for a, b, c in rows:
        body.append([para(a, styles["cell_bold"]), para(b, styles["cell"]), url_para(c, styles["cell"])])
    t = Table(body, colWidths=col_widths, repeatRows=1)
    t.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), HEADER_BG),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("GRID", (0, 0), (-1, -1), 0.25, BORDER),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, ROW_STRIPE]),
                ("LEFTPADDING", (0, 0), (-1, -1), 4),
                ("RIGHTPADDING", (0, 0), (-1, -1), 4),
                ("TOPPADDING", (0, 0), (-1, -1), 3),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ]
        )
    )
    return t


def applied_table(styles, items: list[dict]):
    hdr = [
        para("#", styles["cell_bold"]),
        para("Status", styles["cell_bold"]),
        para("Title", styles["cell_bold"]),
        para("URL / note", styles["cell_bold"]),
    ]
    body = [hdr]
    for it in items:
        st = it["status"].replace("-", " ").title()
        if it["status"] == "live" and it["url"].startswith("http"):
            url_cell = url_para(it["url"], styles["cell"])
        elif it["status"] == "placeholder" and it["url"].startswith("http"):
            url_cell = para(it["url"], styles["cell"])
        else:
            url_cell = para(str(it["url"]), styles["cell"])
        body.append(
            [
                para(it["num"], styles["cell_bold"]),
                para(st, styles["cell"]),
                para(it["title"], styles["cell"]),
                url_cell,
            ]
        )
    t = Table(body, colWidths=[11 * mm, 22 * mm, 68 * mm, 87 * mm], repeatRows=1)
    ts = TableStyle(
        [
            ("BACKGROUND", (0, 0), (-1, 0), HEADER_BG),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("GRID", (0, 0), (-1, -1), 0.25, BORDER),
            ("LEFTPADDING", (0, 0), (-1, -1), 4),
            ("RIGHTPADDING", (0, 0), (-1, -1), 4),
            ("TOPPADDING", (0, 0), (-1, -1), 3),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ]
    )
    for i, it in enumerate(items, start=1):
        if it["status"] == "live":
            ts.add("BACKGROUND", (0, i), (-1, i), LIVE_BG)
        elif it["status"] == "placeholder":
            ts.add("BACKGROUND", (0, i), (-1, i), PLACEHOLDER_BG)
            ts.add("TEXTCOLOR", (0, i), (-1, i), PLACEHOLDER_TEXT)
        else:
            ts.add("BACKGROUND", (0, i), (-1, i), COMING_SOON_BG)
    t.setStyle(ts)
    return t


def inventory_counts(applied: list[tuple[str, list[dict]]], rps: list[dict]) -> dict[str, int]:
    n_live_applied = sum(
        1 for _s, items in applied for it in items if it["status"] == "live"
    )
    n_ph_applied = sum(
        1 for _s, items in applied for it in items if it["status"] == "placeholder"
    )
    n_cs_applied = sum(
        1 for _s, items in applied for it in items if it["status"] == "coming-soon"
    )
    n_live_rps = sum(1 for r in rps if r["status"] == "live")
    n_cs_rps = sum(1 for r in rps if r["status"] == "coming-soon")
    total_applied = n_live_applied + n_ph_applied + n_cs_applied
    return {
        "n_live_applied": n_live_applied,
        "n_ph_applied": n_ph_applied,
        "n_cs_applied": n_cs_applied,
        "n_live_rps": n_live_rps,
        "n_cs_rps": n_cs_rps,
        "total_applied": total_applied,
    }


def summary_counts_table(styles, c: dict[str, int], rps_len: int) -> Table:
    summary_data = [
        ["Area", "Tiles / items", "Live URLs", "Gaps"],
        ["Modules", "60", "60", "—"],
        ["Practice Packs", "30", "30", "—"],
        ["1-Page Field Checklists", "35", "35", "—"],
        [
            "Applied Learning Library",
            str(c["total_applied"]),
            str(c["n_live_applied"]),
            f"{c['n_ph_applied']} placeholders + {c['n_cs_applied']} coming-soon",
        ],
        [
            "RPS Accreditation",
            str(rps_len),
            str(c["n_live_rps"]),
            f"{c['n_cs_rps']} coming-soon buttons",
        ],
    ]
    sh = [para(summary_data[0][i], styles["cell_bold"]) for i in range(4)]
    sb = [sh]
    for row in summary_data[1:]:
        sb.append(
            [
                para(row[0], styles["cell"]),
                para(row[1], styles["cell"]),
                para(row[2], styles["cell"]),
                para(row[3], styles["cell"]),
            ]
        )
    st = Table(sb, colWidths=[55 * mm, 32 * mm, 28 * mm, 65 * mm], repeatRows=1)
    st.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), HEADER_BG),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("GRID", (0, 0), (-1, -1), 0.25, BORDER),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, ROW_STRIPE]),
                ("LEFTPADDING", (0, 0), (-1, -1), 5),
                ("RIGHTPADDING", (0, 0), (-1, -1), 5),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ]
        )
    )
    return st


def append_intro_sections(story, styles) -> None:
    story.append(Paragraph("Alan Ranger Academy — Dashboard Inventory", styles["title"]))
    story.append(
        para(
            f"Generated {date.today().isoformat()} from {SNIPPET_PATH.name}. "
            "This document lists every numbered destination wired on /academy/dashboard "
            "(plus key hub links), what each area is for, and where content is still missing.",
            styles["subtitle"],
        )
    )
    story.append(Paragraph("Purpose of the dashboard", styles["h2"]))
    story.append(
        para(
            "The Academy dashboard is the member home for the online photography course. "
            "The Modules grid is the structured 60-lesson syllabus (camera, gear, composition, genre, assignments). "
            "Paid members unlock Practice Packs and Field Checklists — parallel libraries of field exercises and one-page guides. "
            "The Applied Learning Library is a growing set of long-form, scenario-led articles (mostly on the public blog) "
            "with per-tile open tracking. RPS Accreditation collects mentoring and distinction-related entry points. "
            "Exams, the eBook, calculators, and support tiles sit alongside these libraries so members can learn, practise, "
            "assess, and get help from one screen.",
            styles["body"],
        )
    )
    story.append(Spacer(1, 6))
    story.append(Paragraph("Progress and tracking (high level)", styles["h2"]))
    story.append(
        para(
            "Module, practice pack, and checklist opens are stored in Memberstack member JSON under "
            "arAcademy.modules.opened (path keys, with titles and timestamps when available). "
            "Applied Learning uses arAcademy.appliedLearning.opened and the /api/academy/track-tile-open endpoint "
            "(keepalive beacon on click). Placeholder applied tiles use data-applied-placeholder and do not navigate or track.",
            styles["body"],
        )
    )


def append_modules_packs_checklists(
    story,
    styles,
    mod_urls: list[str],
    pack_urls: list[str],
    check_urls: list[str],
) -> None:
    cw = [14 * mm, 52 * mm, 123 * mm]
    story.append(Paragraph("Modules (60) — course syllabus", styles["h2"]))
    for label, start, end in MODULE_GROUPS:
        story.append(Paragraph(label, styles["h3"]))
        rows = [
            (f"{i:02d}", slug_to_title(mod_urls[i - 1]), full_url(mod_urls[i - 1]))
            for i in range(start, end + 1)
        ]
        story.append(three_col_table(styles, COL_TITLE_SLUG_URL, rows, cw))
        story.append(Spacer(1, 4))

    story.append(Paragraph("Practice Packs (30) — paid field assignments", styles["h2"]))
    for label, a, b in PRACTICE_PACK_GROUPS:
        story.append(Paragraph(label, styles["h3"]))
        rows = [
            (f"{idx + 1:02d}", slug_to_title(pack_urls[idx]), full_url(pack_urls[idx]))
            for idx in range(a, b + 1)
        ]
        story.append(three_col_table(styles, COL_TITLE_SLUG_URL, rows, cw))
        story.append(Spacer(1, 4))

    story.append(Paragraph("1-Page Field Checklists (35) — paid printable guides", styles["h2"]))
    for label, a, b in CHECKLIST_GROUPS:
        story.append(Paragraph(label, styles["h3"]))
        rows = [
            (f"{idx + 1:02d}", slug_to_title(check_urls[idx]), full_url(check_urls[idx]))
            for idx in range(a, b + 1)
        ]
        story.append(three_col_table(styles, COL_TITLE_SLUG_URL, rows, cw))
        story.append(Spacer(1, 4))


def append_applied_and_rps(
    story,
    styles,
    applied: list[tuple[str, list[dict]]],
    rps: list[dict],
) -> None:
    applied_total = sum(len(items) for _label, items in applied)
    story.append(
        Paragraph(
            f"Applied Learning Library ({applied_total}) — long-form guides",
            styles["h2"],
        )
    )
    story.append(
        para(
            "Tiles are grouped by photography theme. Live links go to alanranger.com blog posts; "
            "placeholders show the planned data-applied-id slug; any disabled buttons are marked as coming-soon.",
            styles["body"],
        )
    )
    for sec_label, items in applied:
        story.append(Paragraph(sec_label, styles["h3"]))
        story.append(applied_table(styles, items))
        story.append(Spacer(1, 4))

    story.append(Paragraph("Royal Photographic Society — Accreditation (10 cubes)", styles["h2"]))
    story.append(
        para(
            "First three cubes link to RPS-related blog and mentoring pages; cubes 04–10 are disabled coming-soon placeholders in the snippet.",
            styles["body"],
        )
    )
    rh = [
        para("#", styles["cell_bold"]),
        para("Status", styles["cell_bold"]),
        para("Title / note", styles["cell_bold"]),
        para("URL", styles["cell_bold"]),
    ]
    rb = [rh]
    for r in rps:
        st_lbl = "Live" if r["status"] == "live" else "Coming Soon"
        ucell = (
            url_para(r["url"], styles["cell"])
            if r["url"].startswith("http")
            else para("—", styles["cell"])
        )
        rb.append(
            [
                para(r["num"], styles["cell_bold"]),
                para(st_lbl, styles["cell"]),
                para(r["title"], styles["cell"]),
                ucell,
            ]
        )
    rt = Table(rb, colWidths=[11 * mm, 22 * mm, 55 * mm, 100 * mm], repeatRows=1)
    rts = TableStyle(
        [
            ("BACKGROUND", (0, 0), (-1, 0), HEADER_BG),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("GRID", (0, 0), (-1, -1), 0.25, BORDER),
            ("LEFTPADDING", (0, 0), (-1, -1), 4),
            ("RIGHTPADDING", (0, 0), (-1, -1), 4),
            ("TOPPADDING", (0, 0), (-1, -1), 3),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ]
    )
    for i, r in enumerate(rps, start=1):
        if r["status"] == "live":
            rts.add("BACKGROUND", (0, i), (-1, i), LIVE_BG)
        else:
            rts.add("BACKGROUND", (0, i), (-1, i), COMING_SOON_BG)
    rt.setStyle(rts)
    story.append(rt)
    story.append(Spacer(1, 6))


def other_destinations_table(styles) -> Table:
    other = [
        ("Online course (modules hub)", "https://www.alanranger.com/academy/online-photography-course"),
        ("Exams & certification", "https://www.alanranger.com/academy/photography-exams-certification"),
        ("Practice pack library page", "https://www.alanranger.com/practice-pack-library"),
        ("Field checklists page", "https://www.alanranger.com/35-photography-1-page-field-checklists"),
        ("Academy eBook", "https://www.alanranger.com/academy/ebook"),
        ("Course feedback", "https://www.alanranger.com/academy/photography-course-feedback"),
        ("Q&A", "https://www.alanranger.com/academy/photography-questions-answers"),
        ("Robo-Ranger chat", "/academy-robo-ranger (relative in snippet)"),
        ("Exposure calculator", "https://www.alanranger.com/outdoor-photography-exposure-calculator"),
        ("Print size / resize article + tool CTA", "https://www.alanranger.com/blog-on-photography/photo-print-sizes-resize-photos"),
        ("Hue / Colour IQ test", "https://alanranger-modules.vercel.app/tools/hue-test"),
        ("Asset care — backup", "https://www.alanranger.com/blog-on-photography/how-to-back-up-photos"),
        ("Asset care — sensor cleaning", "https://www.alanranger.com/blog-on-photography/camera-sensor-cleaning-guide"),
        ("Asset care — camera care", "https://www.alanranger.com/blog-on-photography/camera-care-guide"),
        ("Asset care — photographers copyright", "https://www.alanranger.com/blog-on-photography/photographers-copyright-digital-images-photographs"),
        ("Asset care — photographers rights (UK)", "https://www.alanranger.com/blog-on-photography/photographers-rights-in-the-uk"),
    ]
    oh = [para("Destination", styles["cell_bold"]), para("URL", styles["cell_bold"])]
    ob = [oh]
    for name, url in other:
        ob.append(
            [
                para(name, styles["cell"]),
                url_para(url, styles["cell"]) if url.startswith("http") else para(url, styles["cell"]),
            ]
        )
    ot = Table(ob, colWidths=[62 * mm, 126 * mm], repeatRows=1)
    ot.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), HEADER_BG),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("GRID", (0, 0), (-1, -1), 0.25, BORDER),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, ROW_STRIPE]),
                ("LEFTPADDING", (0, 0), (-1, -1), 4),
                ("RIGHTPADDING", (0, 0), (-1, -1), 4),
                ("TOPPADDING", (0, 0), (-1, -1), 3),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ]
        )
    )
    return ot


def append_gap_analysis(story, styles, c: dict[str, int]) -> None:
    story.append(Paragraph("Gap analysis — where content or wiring is still thin", styles["h2"]))
    gaps = []
    gaps.append(
        f"Applied Learning: {c['n_ph_applied']} placeholder tiles need published URLs "
        "(remove data-applied-placeholder, set href)."
    )
    if c["n_cs_applied"] > 0:
        gaps.append(
            f"Applied Learning: {c['n_cs_applied']} tile(s) are disabled coming-soon "
            "buttons with no destination URL yet."
        )
    else:
        gaps.append("Applied Learning: no disabled coming-soon buttons currently remain.")
    gaps.extend(
        [
            f"RPS block: {c['n_cs_rps']} cubes are coming-soon buttons — need destinations or copy updates.",
            "UI badges on Applied Learning and RPS still read “Coming Soon” in the header while many Applied tiles are already live — consider updating badge copy for clarity.",
            "Robo-Ranger and eBook use site-relative paths in some tiles; confirm they resolve correctly on production.",
            "Photography Style Quiz button is shown/hidden via script — not a static URL in the snippet.",
        ]
    )
    for g in gaps:
        story.append(para("• " + g, styles["body"]))


def main():
    raw = read_snippet()
    mod_urls = extract_js_string_array(raw, "DEFINITIVE_MODULE_URLS")
    pack_urls = extract_js_string_array(raw, "PRACTICE_PACK_URLS")
    check_urls = extract_js_string_array(raw, "CHECKLIST_URLS")
    applied = extract_applied_learning(raw)
    rps = extract_rps(raw)
    styles = build_styles()
    counts = inventory_counts(applied, rps)

    story: list = []
    append_intro_sections(story, styles)
    story.append(Paragraph("Counts at a glance", styles["h2"]))
    story.append(summary_counts_table(styles, counts, len(rps)))
    story.append(Spacer(1, 8))
    append_modules_packs_checklists(story, styles, mod_urls, pack_urls, check_urls)
    append_applied_and_rps(story, styles, applied, rps)
    story.append(Paragraph("Other dashboard destinations (hubs & tools)", styles["h2"]))
    story.append(other_destinations_table(styles))
    append_gap_analysis(story, styles, counts)

    doc = SimpleDocTemplate(
        str(OUTPUT_PATH),
        pagesize=A4,
        title="Academy Dashboard Complete Inventory",
        author="Alan Ranger Photography Academy",
        leftMargin=12 * mm,
        rightMargin=12 * mm,
        topMargin=12 * mm,
        bottomMargin=12 * mm,
    )
    doc.build(story)
    print(f"Wrote {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
