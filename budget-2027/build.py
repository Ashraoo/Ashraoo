"""Builds the bilingual "2027 Budget, Goals & Ramadan Planner" workbooks.

Usage: python build.py            -> writes dist/Planner-2027-AR.xlsx and dist/Planner-2027-EN.xlsx
Every number shown on the Dashboard/Categories/Goals/Ramadan sheets is a live formula.
"""
import datetime as dt
import os
import random

from openpyxl import Workbook
from openpyxl.chart import BarChart, Reference
from openpyxl.chart.series import SeriesLabel
from openpyxl.comments import Comment
from openpyxl.formatting.rule import CellIsRule, DataBarRule, FormulaRule
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from openpyxl.workbook.defined_name import DefinedName
from openpyxl.worksheet.datavalidation import DataValidation

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "dist")
YEAR = 2027
RAMADAN_START = dt.date(2027, 2, 8)  # 1 Ramadan 1448 AH, astronomical estimate; editable in the file
TX_FIRST, TX_LAST = 6, 1005          # 1,000 transaction rows
CAT_FIRST, INC_LAST, CAT_LAST = 6, 13, 40  # 8 income rows, 27 expense rows

# ---------- palette ----------
FONT = "Arial"
C_DARK, C_ACCENT, C_GOLD = "0F4C5C", "1B998B", "C9A227"
C_INPUT, C_CALC, C_CARD, C_LINE = "FFF8DC", "F2F4F5", "E8F4F2", "D0D7DB"
NUM = '#,##0;[Red]-#,##0;"-"'
PCT = '0%;[Red]-0%;"-"'
DATE = "yyyy-mm-dd"
thin = Side(style="thin", color=C_LINE)
BOX = Border(left=thin, right=thin, top=thin, bottom=thin)

T = {
    "ar": dict(
        rtl=True, cur="EGP",
        s_start="ابدأ هنا", s_dash="لوحة التحكم", s_tx="المعاملات", s_cat="الفئات والميزانية",
        s_goals="الأهداف", s_ram="رمضان",
        inc="دخل", exp="مصروف",
        title="مخطط الميزانية والأهداف ورمضان 2027",
        how=[
            "1) اكتب إعداداتك في الخانات الصفراء تحت (السنة، العملة، هدف الادخار، بداية رمضان، سعر جرام الذهب).",
            "2) من شيت «الفئات والميزانية» عدّل أسماء الفئات واكتب الميزانية الشهرية لكل فئة.",
            "3) سجّل كل مصروف أو دخل في شيت «المعاملات»: التاريخ + الفئة (من القائمة) + المبلغ. النوع والشهر بيتحسبوا لوحدهم.",
            "4) لوحة التحكم بتتحدّث تلقائياً: الدخل، المصروف، صافي الادخار، الميزانية مقابل الفعلي، والرسوم البيانية.",
            "5) شيت «الأهداف»: اكتب الهدف والمبلغ والموعد، وهيحسبلك المطلوب ادخاره كل شهر.",
            "6) شيت «رمضان»: ميزانية رمضان، حاسبة الزكاة، ومتابعة 30 يوم (صيام، قرآن، تراويح، صدقة).",
            "الخانات الصفراء = إدخال • الخانات الرمادية = معادلات، لا تعدّلها.",
            "البيانات الموجودة مثال توضيحي: امسح خانات (التاريخ، الفئة، الوصف، المبلغ) في «المعاملات» وابدأ ببياناتك.",
            "للاستخدام على Google Sheets: ارفع الملف على Google Drive ثم افتحه بـ Google Sheets.",
        ],
        settings="الإعدادات", year="السنة", currency="العملة", save_t="هدف الادخار (% من الدخل)",
        r_start="أول يوم رمضان", r_days="عدد أيام رمضان", r_end="آخر يوم رمضان (تلقائي)",
        gold="سعر جرام الذهب عيار 24 (بعملتك)", nisab="النصاب = 85 جرام ذهب (تلقائي)",
        r_note="تاريخ تقديري (1 رمضان 1448هـ ≈ 8 فبراير 2027). عدّله حسب إعلان الرؤية في بلدك.",
        gold_note="رقم مثال — حدّثه بسعر اليوم قبل حساب الزكاة.",
        months=["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"],
        k_inc="إجمالي الدخل", k_exp="إجمالي المصروف", k_net="صافي الادخار", k_rate="نسبة الادخار",
        k_ram="مصروف رمضان", k_goal="تقدّم الأهداف", vs_target="الهدف:",
        month="الشهر", income="الدخل", expense="المصروف", net="الصافي", budget="ميزانية المصروف",
        variance="المتبقي من الميزانية", rate="نسبة الادخار", total="الإجمالي",
        ch_month="الدخل مقابل المصروف شهرياً", ch_pie="توزيع المصروف حسب الفئة", ch_cat="الميزانية مقابل الفعلي",
        tx_hdr=["التاريخ", "الفئة", "الوصف", "المبلغ", "النوع (تلقائي)", "الشهر (تلقائي)", "في رمضان؟"],
        cat_hdr=["الفئة", "النوع", "الخطة الشهرية", "الخطة السنوية", "الفعلي (السنة)", "المتبقي", "% المستخدم"],
        cat_inc_total="إجمالي الدخل", cat_exp_total="إجمالي المصروف",
        goal_hdr=["الهدف", "المبلغ المطلوب", "المدّخر حتى الآن", "الموعد", "التقدّم", "المتبقي",
                  "شهور متبقية", "مطلوب شهرياً", "الحالة"],
        done="✓ تم", late="متأخر", on="على المسار",
        r_dates="مواعيد رمضان", r_days_left="أيام متبقية على رمضان",
        r_budget="ميزانية رمضان", r_bhdr=["الفئة", "المخطط", "الفعلي في رمضان", "المتبقي", "% المستخدم"],
        r_all="كل المصروفات خلال رمضان",
        zakat="حاسبة الزكاة", z_rows=["نقدي وأرصدة بنكية", "قيمة الذهب والفضة", "استثمارات وعروض تجارة",
                                    "ديون لك مرجوّة السداد", "(−) ديون عليك مستحقة"],
        z_net="صافي المال الخاضع للزكاة", z_nisab="النصاب", z_reach="بلغ النصاب؟", z_due="الزكاة المستحقة (2.5%)",
        yes="نعم", no="لا",
        z_note="حاسبة استرشادية — بشرط مرور حول هجري كامل على المال. راجع جهة إفتاء موثوقة للحالات الخاصة.",
        tracker="متابعة 30 يوم", tr_hdr=["اليوم", "التاريخ", "صيام", "قرآن (صفحات)", "تراويح", "صدقة"],
        tr_sum="الإجمالي",
        dash_sub="كل الأرقام بتتحسب تلقائياً من شيت المعاملات",
    ),
    "en": dict(
        rtl=False, cur="USD",
        s_start="Start Here", s_dash="Dashboard", s_tx="Transactions", s_cat="Categories & Budget",
        s_goals="Goals", s_ram="Ramadan",
        inc="Income", exp="Expense",
        title="2027 Budget, Goals & Ramadan Planner",
        how=[
            "1) Fill in your settings in the yellow cells below (year, currency, savings target, Ramadan start, gold price).",
            "2) In 'Categories & Budget', rename categories and set a monthly plan for each one.",
            "3) Log every income or expense in 'Transactions': date + category (dropdown) + amount. Type and month fill in automatically.",
            "4) The Dashboard updates itself: income, expenses, net savings, budget vs. actual, and charts.",
            "5) 'Goals': enter a goal, amount and deadline to see how much you need to save each month.",
            "6) 'Ramadan': Ramadan budget, zakat calculator and a 30-day tracker (fasting, Quran, taraweeh, charity).",
            "Yellow cells = inputs • Grey cells = formulas, please don't edit.",
            "The data inside is a demo: clear Date, Category, Description and Amount in 'Transactions' and start with your own.",
            "Google Sheets: upload the file to Google Drive, then open it with Google Sheets.",
        ],
        settings="Settings", year="Year", currency="Currency", save_t="Savings target (% of income)",
        r_start="First day of Ramadan", r_days="Days in Ramadan", r_end="Last day of Ramadan (auto)",
        gold="24k gold price per gram (your currency)", nisab="Nisab = 85 g of gold (auto)",
        r_note="Estimated date (1 Ramadan 1448 AH ≈ Feb 8, 2027). Adjust to the moon-sighting announcement in your country.",
        gold_note="Example value — update with today's price before calculating zakat.",
        months=["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
        k_inc="Total income", k_exp="Total expenses", k_net="Net savings", k_rate="Savings rate",
        k_ram="Ramadan spending", k_goal="Goals progress", vs_target="Target:",
        month="Month", income="Income", expense="Expenses", net="Net", budget="Expense budget",
        variance="Budget left", rate="Savings rate", total="Total",
        ch_month="Monthly income vs. expenses", ch_pie="Expenses by category", ch_cat="Budget vs. actual",
        tx_hdr=["Date", "Category", "Description", "Amount", "Type (auto)", "Month (auto)", "In Ramadan?"],
        cat_hdr=["Category", "Type", "Monthly plan", "Annual plan", "Actual (year)", "Remaining", "% used"],
        cat_inc_total="Total income", cat_exp_total="Total expenses",
        goal_hdr=["Goal", "Target amount", "Saved so far", "Deadline", "Progress", "Remaining",
                  "Months left", "Needed / month", "Status"],
        done="✓ Done", late="Overdue", on="On track",
        r_dates="Ramadan dates", r_days_left="Days until Ramadan",
        r_budget="Ramadan budget", r_bhdr=["Category", "Planned", "Actual in Ramadan", "Remaining", "% used"],
        r_all="All expenses during Ramadan",
        zakat="Zakat calculator", z_rows=["Cash & bank balances", "Gold & silver value", "Investments & trade goods",
                                         "Money owed to you (collectable)", "(−) Debts you owe now"],
        z_net="Net zakatable wealth", z_nisab="Nisab", z_reach="Above nisab?", z_due="Zakat due (2.5%)",
        yes="Yes", no="No",
        z_note="Guidance only — wealth must be held for a full lunar year. Consult a trusted scholar for special cases.",
        tracker="30-day tracker", tr_hdr=["Day", "Date", "Fasted", "Quran (pages)", "Taraweeh", "Charity"],
        tr_sum="Total",
        dash_sub="Every number is calculated automatically from the Transactions sheet",
    ),
}

# (arabic, english, type, monthly plan AR (EGP), monthly plan EN (USD))
CATS = [
    ("الراتب", "Salary", "inc", 25000, 4500),
    ("عمل حر", "Freelance", "inc", 8000, 1200),
    ("استثمارات وأرباح", "Investments", "inc", 1500, 250),
    ("سكن وإيجار", "Rent & housing", "exp", 7000, 1400),
    ("فواتير ومرافق", "Utilities & bills", "exp", 1500, 250),
    ("طعام ومشتريات البيت", "Groceries & food", "exp", 6000, 600),
    ("مواصلات", "Transport", "exp", 1500, 250),
    ("اتصالات وإنترنت", "Phone & internet", "exp", 600, 80),
    ("صحة", "Health", "exp", 800, 120),
    ("تعليم وكورسات", "Education", "exp", 1000, 150),
    ("ترفيه وخروجات", "Entertainment", "exp", 1200, 200),
    ("ملابس", "Clothing", "exp", 800, 120),
    ("اشتراكات", "Subscriptions", "exp", 400, 60),
    ("متفرقات وطوارئ", "Misc & emergencies", "exp", 1000, 150),
    ("إفطار وسحور", "Iftar & suhoor", "exp", 0, 0),
    ("زكاة وصدقات", "Zakat & charity", "exp", 0, 0),
    ("هدايا وعيدية", "Eid gifts", "exp", 0, 0),
    ("ملابس العيد", "Eid clothes", "exp", 0, 0),
]
RAMADAN_CATS = {"إفطار وسحور": (5000, 600), "زكاة وصدقات": (6000, 700),
                "هدايا وعيدية": (3000, 300), "ملابس العيد": (2500, 250)}

DESC = {
    "Salary": ("مرتب الشهر", "Monthly salary"), "Freelance": ("مشروع عميل", "Client project"),
    "Investments": ("أرباح", "Dividends"), "Rent & housing": ("إيجار الشهر", "Monthly rent"),
    "Utilities & bills": ("كهرباء ومياه وغاز", "Electricity, water, gas"),
    "Groceries & food": ("مشتريات سوبرماركت", "Supermarket"), "Transport": ("بنزين ومواصلات", "Fuel & rides"),
    "Phone & internet": ("باقة النت والموبايل", "Mobile & internet plan"), "Health": ("صيدلية", "Pharmacy"),
    "Education": ("كورس أونلاين", "Online course"), "Entertainment": ("خروجة", "Night out"),
    "Clothing": ("ملابس", "Clothes"), "Subscriptions": ("اشتراكات شهرية", "Monthly subscriptions"),
    "Misc & emergencies": ("مصاريف متنوعة", "Misc"), "Iftar & suhoor": ("مشتريات إفطار", "Iftar groceries"),
    "Zakat & charity": ("صدقة / زكاة", "Charity / zakat"), "Eid gifts": ("عيدية", "Eid gifts"),
    "Eid clothes": ("ملابس العيد", "Eid clothes"),
}

GOALS = [
    ("صندوق طوارئ (6 شهور)", "Emergency fund (6 months)", 120000, 21000, 25000, 4200, dt.date(2027, 12, 31)),
    ("عمرة", "Umrah trip", 90000, 15000, 3500, 600, dt.date(2027, 10, 31)),
    ("لابتوب جديد", "New laptop", 45000, 30000, 1800, 1200, dt.date(2027, 6, 30)),
    ("عيدية وهدايا العيد", "Eid gifts fund", 3000, 3000, 300, 300, dt.date(2027, 3, 8)),
]
ZAKAT_SAMPLE = {"ar": [350000, 120000, 80000, 20000, 30000], "en": [12000, 5000, 4000, 800, 1500]}
GOLD_SAMPLE = {"ar": 6000, "en": 135}


def style(c, *, bold=False, size=10, color="222222", fill=None, fmt=None, align=None, border=True, italic=False):
    c.font = Font(name=FONT, bold=bold, size=size, color=color, italic=italic)
    if fill:
        c.fill = PatternFill("solid", fgColor=fill)
    if fmt:
        c.number_format = fmt
    if align:
        c.alignment = Alignment(horizontal=align, vertical="center", wrap_text=True)
    if border:
        c.border = BOX


def header_row(ws, row, col, labels, fill=C_DARK, height=30):
    for i, lab in enumerate(labels):
        style(ws.cell(row=row, column=col + i, value=lab), bold=True, color="FFFFFF", fill=fill, align="center")
    if height:
        ws.row_dimensions[row].height = height


def title(ws, text, sub=None, width=10):
    ws.merge_cells(start_row=2, start_column=2, end_row=2, end_column=1 + width)
    c = ws.cell(row=2, column=2, value=text)
    c.font = Font(name=FONT, bold=True, size=18, color=C_DARK)
    c.alignment = Alignment(vertical="center")
    ws.row_dimensions[2].height = 34
    if sub:
        s = ws.cell(row=3, column=2, value=sub)
        s.font = Font(name=FONT, size=10, color="666666", italic=True)


def inp(c, value=None, fmt=None, align="center"):
    if value is not None:
        c.value = value
    style(c, color="0000FF", fill=C_INPUT, fmt=fmt, align=align)


def calc(c, formula, fmt=None, bold=False, fill=C_CALC, align="center"):
    c.value = formula
    style(c, fill=fill, fmt=fmt, bold=bold, align=align)


def widths(ws, spec):
    for col, w in spec.items():
        ws.column_dimensions[col].width = w


def build(lang, out=OUT, shots=False):
    """shots=True: one printed page per sheet (used to render marketing screenshots)."""
    t = T[lang]
    L = 0 if lang == "ar" else 1
    q = lambda name: f"'{name}'"  # always quote sheet names (Arabic / spaces)
    wb = Workbook()
    ws_start = wb.active
    ws_start.title = t["s_start"]
    ws_dash = wb.create_sheet(t["s_dash"])
    ws_tx = wb.create_sheet(t["s_tx"])
    ws_cat = wb.create_sheet(t["s_cat"])
    ws_goal = wb.create_sheet(t["s_goals"])
    ws_ram = wb.create_sheet(t["s_ram"])
    for ws in wb.worksheets:
        ws.sheet_view.rightToLeft = t["rtl"]
        ws.sheet_view.showGridLines = False
        ws.column_dimensions["A"].width = 2
        ws.page_setup.orientation = "landscape"
        ws.page_setup.paperSize = ws.PAPERSIZE_A4
        ws.sheet_properties.pageSetUpPr.fitToPage = True
        ws.page_setup.fitToWidth = 1
        ws.page_setup.fitToHeight = 0
    ws_start.sheet_properties.tabColor = C_GOLD
    ws_dash.sheet_properties.tabColor = C_DARK
    ws_ram.sheet_properties.tabColor = C_ACCENT

    def name(n, sheet, ref):
        wb.defined_names[n] = DefinedName(n, attr_text=f"{q(sheet.title)}!{ref}")

    # ================= Start / settings =================
    ws = ws_start
    title(ws, t["title"], width=3)
    for i, line in enumerate(t["how"]):
        ws.merge_cells(start_row=4 + i, start_column=2, end_row=4 + i, end_column=4)
        c = ws.cell(row=4 + i, column=2, value=line)
        c.font = Font(name=FONT, size=10, color="333333", bold=i >= 6)
        c.alignment = Alignment(wrap_text=True, vertical="center")
        ws.row_dimensions[4 + i].height = 30
    r0 = 15
    header_row(ws, r0, 2, [t["settings"], ""])
    rows = [
        (t["year"], YEAR, "0", None),
        (t["currency"], t["cur"], None, None),
        (t["save_t"], 0.2, "0%", None),
        (t["r_start"], RAMADAN_START, DATE, t["r_note"]),
        (t["r_days"], 30, "0", None),
        (t["r_end"], "=C19+C20-1", DATE, None),
        (t["gold"], GOLD_SAMPLE[lang], NUM, t["gold_note"]),
        (t["nisab"], "=85*C22", NUM, None),
    ]
    for i, (lab, val, fmt, note) in enumerate(rows):
        r = r0 + 1 + i
        style(ws.cell(row=r, column=2, value=lab), bold=True, align="left" if not t["rtl"] else "right")
        cell = ws.cell(row=r, column=3)
        if isinstance(val, str) and val.startswith("="):
            calc(cell, val, fmt)
        else:
            inp(cell, val, fmt)
        if note:
            cell.comment = Comment(note, "Planner")
            n = ws.cell(row=r, column=4, value=note)
            n.font = Font(name=FONT, size=9, italic=True, color="888888")
            n.alignment = Alignment(wrap_text=True, vertical="center")
            ws.row_dimensions[r].height = 30
    widths(ws, {"B": 38, "C": 18, "D": 70})
    name("cfgYear", ws, "$C$16")
    name("cfgCur", ws, "$C$17")
    name("cfgSave", ws, "$C$18")
    name("cfgRStart", ws, "$C$19")
    name("cfgRDays", ws, "$C$20")
    name("cfgREnd", ws, "$C$21")
    name("cfgNisab", ws, "$C$23")

    # ================= Categories =================
    ws = ws_cat
    title(ws, t["s_cat"], width=7)
    header_row(ws, 5, 2, t["cat_hdr"])
    inc_c = [c for c in CATS if c[2] == "inc"]
    exp_c = [c for c in CATS if c[2] == "exp"]
    for r in range(CAT_FIRST, CAT_LAST + 1):
        is_inc = r <= INC_LAST
        pool = inc_c if is_inc else exp_c
        idx = r - CAT_FIRST if is_inc else r - INC_LAST - 1
        cat = pool[idx] if idx < len(pool) else None
        inp(ws.cell(row=r, column=2), cat[L] if cat else None, align="left" if not t["rtl"] else "right")
        style(ws.cell(row=r, column=3, value=t["inc"] if is_inc else t["exp"]),
              fill=C_CARD if is_inc else C_CALC, align="center", color=C_ACCENT if is_inc else "555555")
        inp(ws.cell(row=r, column=4), (cat[3] if lang == "ar" else cat[4]) if cat else None, NUM)
        calc(ws.cell(row=r, column=5), f"=N(D{r})*12", NUM)
        calc(ws.cell(row=r, column=6),
             f'=IF(B{r}="",0,SUMIFS(txAmt,txCat,B{r},txDate,">="&DATE(cfgYear,1,1),txDate,"<"&DATE(cfgYear+1,1,1)))', NUM)
        calc(ws.cell(row=r, column=7), f"=E{r}-F{r}", NUM)
        calc(ws.cell(row=r, column=8), f'=IF(OR(B{r}="",E{r}=0),"",F{r}/E{r})', PCT)
    for r, lab, typ in ((42, t["cat_inc_total"], t["inc"]), (43, t["cat_exp_total"], t["exp"])):
        style(ws.cell(row=r, column=2, value=lab), bold=True, fill=C_CARD)
        style(ws.cell(row=r, column=3, value=typ), bold=True, fill=C_CARD, align="center")
        for col in "DEFG":
            calc(ws[f"{col}{r}"], f'=SUMIF($C${CAT_FIRST}:$C${CAT_LAST},C{r},{col}{CAT_FIRST}:{col}{CAT_LAST})', NUM,
                 bold=True, fill=C_CARD)
        calc(ws[f"H{r}"], f"=IF(E{r}=0,0,F{r}/E{r})", PCT, bold=True, fill=C_CARD)
    ws.conditional_formatting.add(f"H{INC_LAST + 1}:H{CAT_LAST}",
                                  CellIsRule(operator="greaterThan", formula=["1"],
                                             font=Font(color="C0392B", bold=True)))
    ws.conditional_formatting.add(f"H{CAT_FIRST}:H{CAT_LAST}",
                                  DataBarRule(start_type="num", start_value=0, end_type="num", end_value=1,
                                              color=C_ACCENT))
    widths(ws, {"B": 26, "C": 11, "D": 15, "E": 15, "F": 15, "G": 15, "H": 12})
    ws.freeze_panes = "B6"
    name("catNames", ws, f"$B${CAT_FIRST}:$B${CAT_LAST}")
    name("catTypes", ws, f"$C${CAT_FIRST}:$C${CAT_LAST}")
    # chart: budget vs actual for expense categories
    ch = BarChart()
    ch.type = "bar"
    ch.title = t["ch_cat"]
    ch.style = 10
    for col in (5, 6):
        ch.add_data(Reference(ws, min_col=col, min_row=INC_LAST + 1, max_row=INC_LAST + len(exp_c)),
                    titles_from_data=False)
    ch.set_categories(Reference(ws, min_col=2, min_row=INC_LAST + 1, max_row=INC_LAST + len(exp_c)))
    ch.series[0].tx = SeriesLabel(v=t["cat_hdr"][3])
    ch.series[1].tx = SeriesLabel(v=t["cat_hdr"][4])
    ch.series[0].graphicalProperties.solidFill = C_LINE
    ch.series[1].graphicalProperties.solidFill = C_ACCENT
    ch.height, ch.width = 12, 18
    ws.add_chart(ch, "J5")

    # ================= Transactions =================
    ws = ws_tx
    title(ws, t["s_tx"], width=7)
    header_row(ws, 5, 2, t["tx_hdr"])
    dv_cat = DataValidation(type="list", formula1="=catNames", allow_blank=True, showErrorMessage=True)
    dv_date = DataValidation(type="date", operator="greaterThan", formula1="36526", allow_blank=True,
                             showErrorMessage=True)
    dv_amt = DataValidation(type="decimal", operator="greaterThanOrEqual", formula1="0", allow_blank=True,
                            showErrorMessage=True)
    for dv in (dv_cat, dv_date, dv_amt):
        ws.add_data_validation(dv)
    dv_date.add(f"B{TX_FIRST}:B{TX_LAST}")
    dv_cat.add(f"C{TX_FIRST}:C{TX_LAST}")
    dv_amt.add(f"E{TX_FIRST}:E{TX_LAST}")
    sample = sample_transactions(lang)
    al = "right" if t["rtl"] else "left"
    for i, r in enumerate(range(TX_FIRST, TX_LAST + 1)):
        row = sample[i] if i < len(sample) else (None, None, None, None)
        inp(ws.cell(row=r, column=2), row[0], DATE)
        inp(ws.cell(row=r, column=3), row[1], align=al)
        inp(ws.cell(row=r, column=4), row[2], align=al)
        inp(ws.cell(row=r, column=5), row[3], NUM)
        calc(ws.cell(row=r, column=6),
             f'=IF(C{r}="","",IFERROR(INDEX(catTypes,MATCH(C{r},catNames,0)),"?"))')
        calc(ws.cell(row=r, column=7), f'=IF(B{r}="","",MONTH(B{r}))', "0")
        calc(ws.cell(row=r, column=8),
             f'=IF(B{r}="","",IF(AND(B{r}>=cfgRStart,B{r}<=cfgREnd),"☾",""))')
    widths(ws, {"B": 13, "C": 24, "D": 30, "E": 14, "F": 14, "G": 12, "H": 12})
    ws.freeze_panes = f"B{TX_FIRST}"
    ws.auto_filter.ref = f"B5:H{TX_LAST}"
    name("txDate", ws, f"$B${TX_FIRST}:$B${TX_LAST}")
    name("txCat", ws, f"$C${TX_FIRST}:$C${TX_LAST}")
    name("txAmt", ws, f"$E${TX_FIRST}:$E${TX_LAST}")
    name("txType", ws, f"$F${TX_FIRST}:$F${TX_LAST}")

    # ================= Goals =================
    ws = ws_goal
    title(ws, t["s_goals"], width=9)
    header_row(ws, 5, 2, t["goal_hdr"])
    for i, r in enumerate(range(6, 16)):
        g = GOALS[i] if i < len(GOALS) else None
        inp(ws.cell(row=r, column=2), g[L] if g else None, align=al)
        inp(ws.cell(row=r, column=3), (g[2] if lang == "ar" else g[4]) if g else None, NUM)
        inp(ws.cell(row=r, column=4), (g[3] if lang == "ar" else g[5]) if g else None, NUM)
        inp(ws.cell(row=r, column=5), g[6] if g else None, DATE)
        calc(ws.cell(row=r, column=6), f'=IF(OR(B{r}="",N(C{r})=0),"",MIN(1,N(D{r})/C{r}))', PCT)
        calc(ws.cell(row=r, column=7), f'=IF(B{r}="","",MAX(0,N(C{r})-N(D{r})))', NUM)
        calc(ws.cell(row=r, column=8),
             f'=IF(OR(B{r}="",E{r}=""),"",MAX(1,(YEAR(E{r})-YEAR(TODAY()))*12+MONTH(E{r})-MONTH(TODAY())))', "0")
        calc(ws.cell(row=r, column=9), f'=IF(H{r}="","",G{r}/H{r})', NUM)
        calc(ws.cell(row=r, column=10),
             f'=IF(B{r}="","",IF(N(F{r})>=1,"{t["done"]}",IF(AND(E{r}<>"",E{r}<TODAY()),"{t["late"]}","{t["on"]}")))')
    style(ws.cell(row=17, column=2, value=t["total"]), bold=True, fill=C_CARD)
    calc(ws["C17"], "=SUM(C6:C15)", NUM, bold=True, fill=C_CARD)
    calc(ws["D17"], "=SUM(D6:D15)", NUM, bold=True, fill=C_CARD)
    calc(ws["F17"], "=IF(C17=0,0,MIN(1,D17/C17))", PCT, bold=True, fill=C_CARD)
    calc(ws["G17"], "=SUM(G6:G15)", NUM, bold=True, fill=C_CARD)
    calc(ws["I17"], "=SUM(I6:I15)", NUM, bold=True, fill=C_CARD)
    ws.conditional_formatting.add("F6:F15", DataBarRule(start_type="num", start_value=0, end_type="num",
                                                        end_value=1, color=C_ACCENT))
    ws.conditional_formatting.add("J6:J15", CellIsRule(operator="equal", formula=[f'"{t["late"]}"'],
                                                       font=Font(color="C0392B", bold=True)))
    ws.conditional_formatting.add("J6:J15", CellIsRule(operator="equal", formula=[f'"{t["done"]}"'],
                                                       font=Font(color="1E8449", bold=True)))
    widths(ws, {"B": 28, "C": 15, "D": 15, "E": 13, "F": 11, "G": 14, "H": 12, "I": 14, "J": 13})
    goal_ok = DataValidation(type="date", operator="greaterThan", formula1="36526", allow_blank=True)
    ws.add_data_validation(goal_ok)
    goal_ok.add("E6:E15")

    # ================= Ramadan =================
    ws = ws_ram
    title(ws, "☾ " + t["s_ram"] + " 1448", width=12)
    header_row(ws, 5, 2, [t["r_dates"], ""], height=None)
    rows = [(t["r_start"], "=cfgRStart", DATE), (t["r_end"], "=cfgREnd", DATE),
            (t["r_days_left"], "=MAX(0,cfgRStart-TODAY())", "0")]
    for i, (lab, f, fmt) in enumerate(rows):
        style(ws.cell(row=6 + i, column=2, value=lab), bold=True)
        calc(ws.cell(row=6 + i, column=3), f, fmt, bold=True)
    # budget
    header_row(ws, 10, 2, [t["r_budget"], "", "", "", ""], fill=C_ACCENT, height=None)
    header_row(ws, 11, 2, t["r_bhdr"], height=None)
    dv_rcat = DataValidation(type="list", formula1="=catNames", allow_blank=True)
    ws.add_data_validation(dv_rcat)
    rcats = list(RAMADAN_CATS.items())
    names_by_ar = {c[0]: c for c in CATS}
    for i, r in enumerate(range(12, 20)):
        rc = rcats[i] if i < len(rcats) else None
        catname = names_by_ar[rc[0]][L] if rc else None
        inp(ws.cell(row=r, column=2), catname, align=al)
        inp(ws.cell(row=r, column=3), (rc[1][0] if lang == "ar" else rc[1][1]) if rc else None, NUM)
        calc(ws.cell(row=r, column=4),
             f'=IF(B{r}="",0,SUMIFS(txAmt,txCat,B{r},txDate,">="&cfgRStart,txDate,"<="&cfgREnd))', NUM)
        calc(ws.cell(row=r, column=5), f"=N(C{r})-D{r}", NUM)
        calc(ws.cell(row=r, column=6), f'=IF(N(C{r})=0,"",D{r}/C{r})', PCT)
    dv_rcat.add("B12:B19")
    style(ws["B20"], bold=True, fill=C_CARD)
    ws["B20"] = t["total"]
    calc(ws["C20"], "=SUM(C12:C19)", NUM, bold=True, fill=C_CARD)
    calc(ws["D20"], "=SUM(D12:D19)", NUM, bold=True, fill=C_CARD)
    calc(ws["E20"], "=C20-D20", NUM, bold=True, fill=C_CARD)
    calc(ws["F20"], "=IF(C20=0,0,D20/C20)", PCT, bold=True, fill=C_CARD)
    style(ws["B21"], bold=True)
    ws["B21"] = t["r_all"]
    calc(ws["D21"], f'=SUMIFS(txAmt,txType,"{t["exp"]}",txDate,">="&cfgRStart,txDate,"<="&cfgREnd)', NUM, bold=True)
    name("ramSpend", ws, "$D$21")
    ws.conditional_formatting.add("F12:F20", DataBarRule(start_type="num", start_value=0, end_type="num",
                                                         end_value=1, color=C_GOLD))
    # zakat
    header_row(ws, 23, 2, [t["zakat"], ""], fill=C_GOLD, height=None)
    for i, lab in enumerate(t["z_rows"]):
        style(ws.cell(row=24 + i, column=2, value=lab))
        inp(ws.cell(row=24 + i, column=3), ZAKAT_SAMPLE[lang][i], NUM)
    zr = [(t["z_net"], "=C24+C25+C26+C27-C28", NUM), (t["z_nisab"], "=cfgNisab", NUM),
          (t["z_reach"], f'=IF(C29>=C30,"{t["yes"]}","{t["no"]}")', None),
          (t["z_due"], "=IF(C29>=C30,C29*0.025,0)", NUM)]
    for i, (lab, f, fmt) in enumerate(zr):
        style(ws.cell(row=29 + i, column=2, value=lab), bold=True)
        calc(ws.cell(row=29 + i, column=3), f, fmt, bold=True, fill=C_CARD if i == 3 else C_CALC)
    ws.merge_cells("B34:F35")
    n = ws["B34"]
    n.value = t["z_note"]
    n.font = Font(name=FONT, size=9, italic=True, color="888888")
    n.alignment = Alignment(wrap_text=True, vertical="top")
    # 30-day tracker (columns H..M)
    ws.merge_cells("H5:M5")
    style(ws["H5"], bold=True, color="FFFFFF", fill=C_ACCENT, align="center")
    ws["H5"] = t["tracker"]
    header_row(ws, 6, 8, t["tr_hdr"])
    dv_chk = DataValidation(type="list", formula1='"✓,✗"', allow_blank=True)
    ws.add_data_validation(dv_chk)
    for d in range(1, 31):
        r = 6 + d
        calc(ws.cell(row=r, column=8), f'=IF({d}>cfgRDays,"",{d})', "0")
        calc(ws.cell(row=r, column=9), f'=IF({d}>cfgRDays,"",cfgRStart+{d}-1)', DATE)
        demo = d <= 12  # first 12 days filled as an example
        inp(ws.cell(row=r, column=10), "✓" if demo else None)
        inp(ws.cell(row=r, column=11), (20 if d % 3 else 15) if demo else None, "0")
        inp(ws.cell(row=r, column=12), ("✓" if d not in (5, 9) else "✗") if demo else None)
        inp(ws.cell(row=r, column=13), (round((50 if lang == "ar" else 5) * (1 + d % 4))) if demo else None, NUM)
    dv_chk.add("J7:J36")
    dv_chk.add("L7:L36")
    style(ws["H37"], bold=True, fill=C_CARD)
    ws["H37"] = t["tr_sum"]
    style(ws["I37"], fill=C_CARD)
    calc(ws["J37"], '=COUNTIF(J7:J36,"✓")&" / "&cfgRDays', bold=True, fill=C_CARD)
    calc(ws["K37"], "=SUM(K7:K36)", "0", bold=True, fill=C_CARD)
    calc(ws["L37"], '=COUNTIF(L7:L36,"✓")&" / "&cfgRDays', bold=True, fill=C_CARD)
    calc(ws["M37"], "=SUM(M7:M36)", NUM, bold=True, fill=C_CARD)
    widths(ws, {"B": 30, "C": 15, "D": 16, "E": 14, "F": 11, "G": 3,
                "H": 7, "I": 12, "J": 9, "K": 13, "L": 10, "M": 12})

    # ================= Dashboard =================
    ws = ws_dash
    title(ws, t["title"], width=12)
    ws["B3"] = f'="{t["year"]}: "&cfgYear&"   •   "&cfgCur&"   •   {t["dash_sub"]}"'
    ws["B3"].font = Font(name=FONT, size=10, italic=True, color="666666")
    ys = 'txDate,">="&DATE(cfgYear,1,1),txDate,"<"&DATE(cfgYear+1,1,1)'
    kpis = [
        (t["k_inc"], f'=SUMIFS(txAmt,txType,"{t["inc"]}",{ys})', NUM, None),
        (t["k_exp"], f'=SUMIFS(txAmt,txType,"{t["exp"]}",{ys})', NUM, None),
        (t["k_net"], "=B6-D6", NUM, None),
        (t["k_rate"], "=IF(B6=0,0,F6/B6)", PCT, f'="{t["vs_target"]} "&TEXT(cfgSave,"0%")'),
        (t["k_ram"], "=ramSpend", NUM, None),
        (t["k_goal"], f"={q(t['s_goals'])}!F17", PCT, None),
    ]
    for i, (lab, f, fmt, sub) in enumerate(kpis):
        col = 2 + i * 2
        ws.merge_cells(start_row=5, start_column=col, end_row=5, end_column=col + 1)
        ws.merge_cells(start_row=6, start_column=col, end_row=6, end_column=col + 1)
        ws.merge_cells(start_row=7, start_column=col, end_row=7, end_column=col + 1)
        style(ws.cell(row=5, column=col, value=lab), bold=True, color="FFFFFF", fill=C_DARK, align="center")
        c = ws.cell(row=6, column=col, value=f)
        style(c, bold=True, size=18, color=C_DARK, fill=C_CARD, fmt=fmt, align="center")
        s = ws.cell(row=7, column=col, value=sub)
        style(s, size=9, color="666666", fill=C_CARD, align="center", italic=True)
        for rr in (5, 6, 7):
            ws.cell(row=rr, column=col + 1).border = BOX
    ws.row_dimensions[6].height = 38
    # monthly table
    hdr = [t["month"], t["income"], t["expense"], t["net"], t["budget"], t["variance"], t["rate"]]
    header_row(ws, 10, 2, hdr)
    bud = f'SUMIF({q(t["s_cat"])}!$C${CAT_FIRST}:$C${CAT_LAST},"{t["exp"]}",{q(t["s_cat"])}!$D${CAT_FIRST}:$D${CAT_LAST})'
    for m in range(1, 13):
        r = 10 + m
        style(ws.cell(row=r, column=2, value=t["months"][m - 1]), bold=True, align="center")
        rng = f'txDate,">="&DATE(cfgYear,{m},1),txDate,"<"&DATE(cfgYear,{m + 1},1)'
        calc(ws.cell(row=r, column=3), f'=SUMIFS(txAmt,txType,"{t["inc"]}",{rng})', NUM, fill=None)
        calc(ws.cell(row=r, column=4), f'=SUMIFS(txAmt,txType,"{t["exp"]}",{rng})', NUM, fill=None)
        calc(ws.cell(row=r, column=5), f"=C{r}-D{r}", NUM, fill=None)
        calc(ws.cell(row=r, column=6), f"={bud}", NUM, fill=None)
        calc(ws.cell(row=r, column=7), f"=F{r}-D{r}", NUM, fill=None)
        calc(ws.cell(row=r, column=8), f"=IF(C{r}=0,0,E{r}/C{r})", PCT, fill=None)
    style(ws["B23"], bold=True, fill=C_CARD, align="center")
    ws["B23"] = t["total"]
    for col in "CDEFG":
        calc(ws[f"{col}23"], f"=SUM({col}11:{col}22)", NUM, bold=True, fill=C_CARD)
    calc(ws["H23"], "=IF(C23=0,0,E23/C23)", PCT, bold=True, fill=C_CARD)
    ws.conditional_formatting.add("H11:H23", FormulaRule(formula=["AND($C11>0,H11<cfgSave)"],
                                                         font=Font(color="C0392B")))
    ws.conditional_formatting.add("H11:H23", FormulaRule(formula=["AND($C11>0,H11>=cfgSave)"],
                                                         font=Font(color="1E8449", bold=True)))
    # charts
    bar = BarChart()
    bar.type = "col"
    bar.title = t["ch_month"]
    bar.add_data(Reference(ws, min_col=3, max_col=4, min_row=10, max_row=22), titles_from_data=True)
    bar.set_categories(Reference(ws, min_col=2, min_row=11, max_row=22))
    bar.series[0].graphicalProperties.solidFill = C_ACCENT
    bar.series[1].graphicalProperties.solidFill = "E07A5F"
    bar.height, bar.width = 9, 15
    ws.add_chart(bar, "J10")
    cs = ws_cat
    byc = BarChart()
    byc.type = "bar"
    byc.title = t["ch_pie"]
    byc.add_data(Reference(cs, min_col=6, min_row=INC_LAST + 1, max_row=CAT_LAST), titles_from_data=False)
    byc.set_categories(Reference(cs, min_col=2, min_row=INC_LAST + 1, max_row=CAT_LAST))
    byc.series[0].graphicalProperties.solidFill = C_DARK
    byc.legend = None
    byc.y_axis.scaling.orientation = "minMax"
    byc.x_axis.scaling.orientation = "maxMin"  # first category on top
    byc.height, byc.width = 11, 20
    ws.add_chart(byc, "B26")
    widths(ws, {c: 13 for c in "BCDEFGHIJKLM"})

    if shots:
        areas = [(ws_start, "B2:D23"), (ws_dash, "B2:P48"), (ws_tx, "B2:H40"), (ws_cat, "B2:T43"),
                 (ws_goal, "B2:J17"), (ws_ram, "B2:M38")]
        for sh, area in areas:
            sh.print_area = area
            sh.page_setup.fitToHeight = 1
    wb.active = 0
    os.makedirs(out, exist_ok=True)
    path = os.path.join(out, f"Planner-2027-{lang.upper()}.xlsx")
    wb.save(path)
    return path


def sample_transactions(lang):
    """Demo rows for Jan–Mar 2027, incl. the Ramadan window. Deterministic."""
    rnd = random.Random(1448)
    L = 0 if lang == "ar" else 1
    by_en = {c[1]: c for c in CATS}
    rows = []

    def add(d, en, amount, desc=None):
        c = by_en[en]
        rows.append((d, c[L], desc or DESC[en][L], round(amount)))

    for m in (1, 2, 3):
        plan = lambda en: by_en[en][3 if lang == "ar" else 4]
        add(dt.date(YEAR, m, 1), "Salary", plan("Salary"))
        add(dt.date(YEAR, m, 2), "Rent & housing", plan("Rent & housing"))
        add(dt.date(YEAR, m, 5), "Utilities & bills", plan("Utilities & bills") * rnd.uniform(0.85, 1.15))
        add(dt.date(YEAR, m, 6), "Phone & internet", plan("Phone & internet"))
        add(dt.date(YEAR, m, 7), "Subscriptions", plan("Subscriptions"))
        for day in (4, 12, 20, 27):
            add(dt.date(YEAR, m, day), "Groceries & food", plan("Groceries & food") / 4 * rnd.uniform(0.8, 1.2))
        add(dt.date(YEAR, m, 10), "Transport", plan("Transport") * rnd.uniform(0.8, 1.1))
        add(dt.date(YEAR, m, 15), "Freelance", plan("Freelance") * rnd.uniform(0.6, 1.4))
        add(dt.date(YEAR, m, 18), "Entertainment", plan("Entertainment") * rnd.uniform(0.6, 1.3))
        add(dt.date(YEAR, m, 22), "Misc & emergencies", plan("Misc & emergencies") * rnd.uniform(0.3, 1.2))
        if m != 2:
            add(dt.date(YEAR, m, 24), "Education", plan("Education"))
            add(dt.date(YEAR, m, 26), "Investments", plan("Investments") * rnd.uniform(0.8, 1.2))
        if m == 1:
            add(dt.date(YEAR, m, 14), "Health", plan("Health") * 1.4)
            add(dt.date(YEAR, m, 25), "Clothing", plan("Clothing") * 1.5)
    k = 1 if lang == "ar" else 0.12
    for d, en, amt in [
        (dt.date(YEAR, 2, 8), "Iftar & suhoor", 1800), (dt.date(YEAR, 2, 14), "Iftar & suhoor", 1300),
        (dt.date(YEAR, 2, 21), "Iftar & suhoor", 1400), (dt.date(YEAR, 3, 1), "Iftar & suhoor", 1200),
        (dt.date(YEAR, 2, 10), "Zakat & charity", 1000), (dt.date(YEAR, 3, 4), "Zakat & charity", 4800),
        (dt.date(YEAR, 3, 3), "Eid clothes", 2900), (dt.date(YEAR, 3, 8), "Eid gifts", 2600),
    ]:
        add(d, en, amt * k)
    rows.sort(key=lambda r: r[0])
    return rows


if __name__ == "__main__":
    for lg in ("ar", "en"):
        print(build(lg))
