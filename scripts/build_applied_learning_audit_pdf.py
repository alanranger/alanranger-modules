"""Generate the Applied Learning Library audit as a PDF.

Output: applied-learning-library-audit.pdf alongside the dashboard snippet.
"""
from pathlib import Path

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


OUTPUT_PATH = (
    Path(__file__).resolve().parent.parent
    / "applied-learning-library-audit.pdf"
)

BRAND_ORANGE = colors.HexColor("#E57200")
PLACEHOLDER_BG = colors.HexColor("#FEF3C7")
PLACEHOLDER_TEXT = colors.HexColor("#7C4A03")
COMING_SOON_BG = colors.HexColor("#FEF3C7")
LIVE_BG = colors.HexColor("#FFF5EC")
ROW_STRIPE = colors.HexColor("#F7F7F9")
BORDER = colors.HexColor("#D5D8DE")
HEADER_BG = colors.HexColor("#1E293B")
TEXT = colors.HexColor("#1E1E1E")
MUTED = colors.HexColor("#64748B")


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
            fontSize=10,
            textColor=MUTED,
            spaceAfter=12,
        ),
        "h2": ParagraphStyle(
            "h2",
            parent=base["Heading2"],
            fontName="Helvetica-Bold",
            fontSize=13,
            leading=16,
            textColor=TEXT,
            spaceBefore=14,
            spaceAfter=6,
        ),
        "h3": ParagraphStyle(
            "h3",
            parent=base["Heading3"],
            fontName="Helvetica-Bold",
            fontSize=11,
            leading=14,
            textColor=BRAND_ORANGE,
            spaceBefore=10,
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
            fontSize=8,
            leading=10,
            textColor=TEXT,
        ),
        "cell_bold": ParagraphStyle(
            "cell_bold",
            parent=base["Normal"],
            fontName="Helvetica-Bold",
            fontSize=8,
            leading=10,
            textColor=TEXT,
        ),
        "cell_muted": ParagraphStyle(
            "cell_muted",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=7.5,
            leading=10,
            textColor=MUTED,
        ),
    }


def section_data():
    """All tile data, grouped by section. Returns list of (label, rows).

    Each row: (number, status_code, title, slug_or_url).
    status_code: "live" | "placeholder" | "coming-soon".
    """
    return [
        (
            "Portraits & Headshots (5 live, 0 remaining)",
            [
                ("01", "live", "Professional Headshots for LinkedIn: Tips for 2026", "/blog-on-photography/professional-headshots-for-linkedin"),
                ("02", "live", "Corporate Headshot Photography Guide for UK Photographers", "/blog-on-photography/corporate-headshot-photography"),
                ("03", "live", "Portrait Lighting Techniques", "/blog-on-photography/portrait-lighting-techniques"),
                ("04", "live", "15 Essential Portrait Photography Tips for UK Photographers", "/blog-on-photography/portrait-photography-tips"),
                ("05", "live", "Headshots at Home: A DIY Lighting and Backdrop Guide", "/blog-on-photography/headshots-at-home-guide"),
            ],
        ),
        (
            "Product & Commercial (7 live, 0 remaining)",
            [
                ("01", "live", "30 Fresh Product Photography Ideas to Elevate Your Brand", "/blog-on-photography/product-photography-ideas"),
                ("02", "live", "DIY Product Photography: Shoot Professional Images at Home", "/blog-on-photography/diy-product-photography"),
                ("03", "live", "How to Photograph Jewelry: A Guide for UK Photographers", "/blog-on-photography/how-to-photograph-jewelry"),
                ("04", "live", "How to Master a Product Photography Lighting Setup in 2026", "/blog-on-photography/product-photography-lighting"),
                ("05", "live", "Etsy Product Photography: Seller's Guide for 2026", "/blog-on-photography/etsy-product-photography-rules"),
                ("06", "live", "How to Take Product Photos with iPhone – Essential UK Guide", "/blog-on-photography/how-to-take-product-photos-with-iphone"),
                ("07", "live", "How to Photograph Artwork: Step-by-Step Guide for Beginners", "/blog-on-photography/how-to-photograph-artwork"),
            ],
        ),
        (
            "Property & Interiors (3 live, 0 remaining)",
            [
                ("01", "live", "How to Take Real Estate Photos: The Complete UK Guide", "/blog-on-photography/how-to-take-real-estate-photos"),
                ("02", "live", "Real Estate Photography Tips: 7 Strategies for Photographers", "/blog-on-photography/real-estate-photography-tips"),
                ("03", "live", "Airbnb Photography Guide for Holiday Let & Rental Hosts", "/blog-on-photography/airbnb-photography-guide"),
            ],
        ),
        (
            "Night, Astro & Natural Light (4 live, 0 remaining)",
            [
                ("01", "live", "Night Photography Settings Guide for UK Photographers", "/blog-on-photography/night-photography-settings"),
                ("02", "live", "How to Photograph Fireworks: Camera Settings Guide", "/blog-on-photography/how-to-photograph-fireworks"),
                ("03", "live", "Natural Light Photography Tips for Stunning UK Shots", "/blog-on-photography/natural-light-photography-tips"),
                ("04", "live", "How to Photograph the Northern Lights (Aurora Borealis)", "/blog-on-photography/how-to-photograph-northern-lights"),
            ],
        ),
        (
            "Close-Up & Food (3 live, 0 remaining)",
            [
                ("01", "live", "Macro Photography for Beginners: A UK Starter's Guide", "/blog-on-photography/macro-photography-beginners"),
                ("02", "live", "30 Essential Food Photography Tips for UK Photographers", "/blog-on-photography/food-photography-tips"),
                ("03", "live", "Food Photography at Home: A Window Light Guide 2026", "/blog-on-photography/food-photography-at-home"),
            ],
        ),
        (
            "Wildlife, Nature & Seasons (6 live, 2 placeholders)",
            [
                ("01", "live", "Bird Photography Guide for UK Birders: Settings for Birds", "/blog-on-photography/bird-photography-guide"),
                ("02", "placeholder", "UK Wildlife Photography: The Best Places by Season", "uk-wildlife-photography-locations"),
                ("03", "live", "UK Woodland Photography: A Year-Round Practical Guide", "/blog-on-photography/uk-woodland-photography-year-round-guide"),
                ("04", "live", "UK Garden Wildlife Photography: Birds, Bees, and Beyond", "/blog-on-photography/garden-wildlife-photography-uk-guide"),
                ("05", "placeholder", "Seasonal Nature Photography: Autumn, Frost and Mist", "seasonal-nature-photography-uk"),
                ("06", "live", "Dog Photography for Owners: A Practical UK Guide 2026", "/blog-on-photography/pet-dog-photography-uk-guide"),
                ("07", "live", "Bluebell Photography in the UK: A Practical Field Guide", "/blog-on-photography/uk-bluebell-photography-guide"),
                ("08", "live", "Autumn Arboretum & Garden Photography: A UK Guide 2026", "/blog-on-photography/autumn-arboretum-photography-uk-guide"),
            ],
        ),
        (
            "Landscape, Travel & Street (7 live, 0 remaining)",
            [
                ("01", "live", "Long Exposure Seascapes: A UK Coastal Photography Guide", "/blog-on-photography/long-exposure-seascapes-guide"),
                ("02", "live", "Landscape Photography Vision: The 30-50-10-10 Framework", "/blog-on-photography/landscape-photography-vision-framework"),
                ("03", "live", "UK Architectural Exterior Photography - Intermediate Guide", "/blog-on-photography/uk-architectural-exterior-photography"),
                ("04", "live", "UK Street Photography: An Ethics-First Practical Guide", "/blog-on-photography/uk-street-photography-ethics-guide"),
                ("05", "live", "Black & White Photography: When to Convert and Why 2026", "/blog-on-photography/black-and-white-when-to-convert"),
                ("06", "live", "Travel Photography: A Practical UK Beginner's Guide", "/blog-on-photography/travel-photography-beginners-guide"),
                ("07", "live", "UK Waterfall Photography: A Complete Field Guide 2026", "/blog-on-photography/uk-waterfall-photography-guide"),
            ],
        ),
    ]


def build_section_table(rows, styles):
    header = [
        Paragraph("<b>#</b>", styles["cell_bold"]),
        Paragraph("<b>Status</b>", styles["cell_bold"]),
        Paragraph("<b>Title</b>", styles["cell_bold"]),
        Paragraph("<b>URL / Slug (data-applied-id)</b>", styles["cell_bold"]),
    ]
    body = [header]
    status_labels = {
        "live": "Live",
        "placeholder": "Placeholder",
        "coming-soon": "Coming Soon",
    }
    for number, status, title, url in rows:
        body.append(
            [
                Paragraph(number, styles["cell_bold"]),
                Paragraph(status_labels[status], styles["cell"]),
                Paragraph(title, styles["cell"]),
                Paragraph(url, styles["cell_muted"]),
            ]
        )

    table = Table(
        body,
        colWidths=[12 * mm, 22 * mm, 82 * mm, 74 * mm],
        repeatRows=1,
    )
    style = TableStyle(
        [
            ("BACKGROUND", (0, 0), (-1, 0), HEADER_BG),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 8),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("ALIGN", (0, 0), (0, -1), "CENTER"),
            ("GRID", (0, 0), (-1, -1), 0.4, BORDER),
            ("LEFTPADDING", (0, 0), (-1, -1), 5),
            ("RIGHTPADDING", (0, 0), (-1, -1), 5),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ]
    )
    for index, (_, status, _, _) in enumerate(rows, start=1):
        if status == "live":
            style.add("BACKGROUND", (0, index), (-1, index), LIVE_BG)
        elif status == "placeholder":
            style.add("BACKGROUND", (0, index), (-1, index), PLACEHOLDER_BG)
            style.add("TEXTCOLOR", (0, index), (-1, index), PLACEHOLDER_TEXT)
        else:
            style.add("BACKGROUND", (0, index), (-1, index), COMING_SOON_BG)
    table.setStyle(style)
    return table


def build_summary_table(styles):
    header = [
        Paragraph("<b>Section</b>", styles["cell_bold"]),
        Paragraph("<b>Live</b>", styles["cell_bold"]),
        Paragraph("<b>Placeholder</b>", styles["cell_bold"]),
        Paragraph("<b>Coming Soon</b>", styles["cell_bold"]),
        Paragraph("<b>Total</b>", styles["cell_bold"]),
    ]
    rows = [
        ("Portraits & Headshots", 5, 0, 0, 5),
        ("Product & Commercial", 7, 0, 0, 7),
        ("Property & Interiors", 3, 0, 0, 3),
        ("Night, Astro & Natural Light", 4, 0, 0, 4),
        ("Close-Up & Food", 3, 0, 0, 3),
        ("Wildlife, Nature & Seasons", 6, 2, 0, 8),
        ("Landscape, Travel & Street", 7, 0, 0, 7),
    ]
    body = [header]
    for section, live, placeholder, coming, total in rows:
        body.append(
            [
                Paragraph(section, styles["cell"]),
                Paragraph(str(live), styles["cell"]),
                Paragraph(str(placeholder), styles["cell"]),
                Paragraph(str(coming), styles["cell"]),
                Paragraph(str(total), styles["cell_bold"]),
            ]
        )
    totals = [sum(row[i] for row in rows) for i in range(1, 5)]
    body.append(
        [
            Paragraph("<b>TOTAL</b>", styles["cell_bold"]),
            *(Paragraph(f"<b>{value}</b>", styles["cell_bold"]) for value in totals),
        ]
    )
    table = Table(
        body,
        colWidths=[70 * mm, 22 * mm, 28 * mm, 30 * mm, 22 * mm],
        repeatRows=1,
    )
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), HEADER_BG),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTSIZE", (0, 0), (-1, -1), 8),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("ALIGN", (1, 0), (-1, -1), "CENTER"),
                ("GRID", (0, 0), (-1, -1), 0.4, BORDER),
                ("BACKGROUND", (0, -1), (-1, -1), BRAND_ORANGE),
                ("TEXTCOLOR", (0, -1), (-1, -1), colors.white),
                ("ROWBACKGROUNDS", (0, 1), (-1, -2), [colors.white, ROW_STRIPE]),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ]
        )
    )
    return table


def build_remaining_list(styles):
    items = [
        ("Wildlife, Nature & Seasons (2 placeholders to publish)", [
            ("02", "uk-wildlife-photography-locations", "UK Wildlife Photography: The Best Places by Season"),
            ("05", "seasonal-nature-photography-uk", "Seasonal Nature Photography: Autumn, Frost and Mist"),
        ]),
    ]
    flow = []
    for heading, rows in items:
        flow.append(Paragraph(heading, styles["h3"]))
        header = [
            Paragraph("<b>#</b>", styles["cell_bold"]),
            Paragraph("<b>Planned Slug</b>", styles["cell_bold"]),
            Paragraph("<b>Working Title</b>", styles["cell_bold"]),
        ]
        body = [header]
        for number, slug, title in rows:
            body.append(
                [
                    Paragraph(number, styles["cell_bold"]),
                    Paragraph(slug, styles["cell"]),
                    Paragraph(title, styles["cell"]),
                ]
            )
        table = Table(body, colWidths=[12 * mm, 72 * mm, 106 * mm], repeatRows=1)
        table.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), HEADER_BG),
                    ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                    ("FONTSIZE", (0, 0), (-1, -1), 8),
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    ("ALIGN", (0, 0), (0, -1), "CENTER"),
                    ("GRID", (0, 0), (-1, -1), 0.4, BORDER),
                    ("BACKGROUND", (0, 1), (-1, -1), PLACEHOLDER_BG),
                    ("TEXTCOLOR", (0, 1), (-1, -1), PLACEHOLDER_TEXT),
                    ("LEFTPADDING", (0, 0), (-1, -1), 5),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 5),
                    ("TOPPADDING", (0, 0), (-1, -1), 4),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ]
            )
        )
        flow.append(table)
        flow.append(Spacer(1, 6))
    return flow


def build_story():
    styles = build_styles()
    story = []
    story.append(Paragraph("Applied Learning Library — Audit", styles["title"]))
    story.append(
        Paragraph(
            "Academy Dashboard snippet &mdash; tile inventory as of the current "
            "<code>Squarespace Snippets/academy-dashboard-squarespace-snippet-v1.html</code>. "
            "35 live / 2 placeholders / 0 coming-soon &mdash; 37 tiles in total.",
            styles["subtitle"],
        )
    )

    story.append(Paragraph("Section summary", styles["h2"]))
    story.append(build_summary_table(styles))

    story.append(Paragraph("Full tile inventory", styles["h2"]))
    for label, rows in section_data():
        story.append(Paragraph(label, styles["h3"]))
        story.append(build_section_table(rows, styles))
        story.append(Spacer(1, 6))

    story.append(Paragraph("Remaining placeholders (2 articles to write)", styles["h2"]))
    story.extend(build_remaining_list(styles))

    story.append(Paragraph("Notes for future swaps", styles["h2"]))
    story.append(
        Paragraph(
            "When an article goes live, two attributes change on the matching tile:"
            " <b>href=\"#\"</b> becomes the real blog URL, and "
            "<b>data-applied-placeholder=\"true\"</b> is removed. The "
            "<b>data-applied-id</b> is the permanent tracking key so ideally it "
            "matches the URL slug from day one. Tracking is automatic via "
            "<code>wireAppliedLearningLinks()</code>, which posts a keepalive beacon "
            "to <code>/api/academy/track-tile-open</code> and updates the "
            "<code>arAcademy.appliedLearning.opened</code> bucket in Memberstack "
            "member JSON.",
            styles["body"],
        )
    )
    return story


def main():
    doc = SimpleDocTemplate(
        str(OUTPUT_PATH),
        pagesize=A4,
        title="Applied Learning Library Audit",
        author="Alan Ranger Photography Academy",
        leftMargin=14 * mm,
        rightMargin=14 * mm,
        topMargin=14 * mm,
        bottomMargin=14 * mm,
    )
    doc.build(build_story())
    print(f"Wrote {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
