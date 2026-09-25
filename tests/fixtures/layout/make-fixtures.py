#!/usr/bin/env python3
"""Build the two layout fixtures with reportlab. Run from anywhere; writes next to itself.

good.pdf: two clean pages.
bad.pdf:  page 1 clean; page 2 has two text lines drawn over each other and one line
          that runs past the right edge of the page.
"""
import os
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas

HERE = os.path.dirname(os.path.abspath(__file__))
W, H = letter

def clean_page(c, n):
    c.setFont("Helvetica-Bold", 16)
    c.drawString(72, H - 72, f"Section {n}: a clean page")
    c.setFont("Helvetica", 11)
    y = H - 110
    for i in range(12):
        c.drawString(72, y, f"Line {i + 1} of ordinary body text that sits inside the margins.")
        y -= 16
    c.showPage()

def bad_page(c):
    c.setFont("Helvetica-Bold", 16)
    c.drawString(72, H - 72, "Section 2: a broken page")
    c.setFont("Helvetica", 11)
    y = H - 110
    for i in range(4):
        c.drawString(72, y, f"Line {i + 1} of ordinary body text that sits inside the margins.")
        y -= 16
    # Two lines drawn almost on top of each other: the second sits 4 points above the first.
    c.setFont("Helvetica", 12)
    c.drawString(72, 500, "Title text that a reader should see on its own line")
    c.drawString(90, 504, "Caption text drawn right over the title text above")
    # A line that starts near the right margin and runs off the page.
    c.setFont("Helvetica", 11)
    c.drawString(430, 440, "This sentence runs off the right edge of the page entirely.")
    c.showPage()

c = canvas.Canvas(os.path.join(HERE, "good.pdf"), pagesize=letter)
clean_page(c, 1); clean_page(c, 2); c.save()

c = canvas.Canvas(os.path.join(HERE, "bad.pdf"), pagesize=letter)
clean_page(c, 1); bad_page(c); c.save()
print("wrote good.pdf and bad.pdf")
