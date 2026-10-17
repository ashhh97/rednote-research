from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, PageBreak
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor
import os

OUT = '/Users/yz/Library/CloudStorage/OneDrive-个人/travelagent/output/pdf/Travel_Itinerary_瑞士意大利_中英文详细版.pdf'
os.makedirs(os.path.dirname(OUT), exist_ok=True)

# Chinese-capable fonts bundled with macOS.
pdfmetrics.registerFont(TTFont('STHeiti', '/System/Library/Fonts/STHeiti Light.ttc', subfontIndex=0))
pdfmetrics.registerFont(TTFont('STHeiti-Bold', '/System/Library/Fonts/STHeiti Medium.ttc', subfontIndex=0))

BLUE = HexColor('#31588F')
PALE_BLUE = HexColor('#E8EEF6')
GRID = HexColor('#AAB7C6')
TEXT = HexColor('#222222')

styles = getSampleStyleSheet()
title = ParagraphStyle('title', parent=styles['Normal'], fontName='STHeiti-Bold', fontSize=15, leading=19, textColor=BLUE, alignment=TA_CENTER, spaceAfter=2)
subtitle = ParagraphStyle('subtitle', parent=styles['Normal'], fontName='STHeiti', fontSize=8.5, leading=11, textColor=TEXT, alignment=TA_CENTER, spaceAfter=8)
head = ParagraphStyle('head', parent=styles['Normal'], fontName='STHeiti-Bold', fontSize=7.8, leading=9.5, textColor=colors.white, alignment=TA_CENTER)
cell = ParagraphStyle('cell', parent=styles['Normal'], fontName='STHeiti', fontSize=6.8, leading=8.6, textColor=TEXT, alignment=TA_LEFT)
cell_bold = ParagraphStyle('cell_bold', parent=cell, fontName='STHeiti-Bold', fontSize=7.0, leading=8.8)
small = ParagraphStyle('small', parent=cell, fontSize=6.1, leading=7.6)
country = ParagraphStyle('country', parent=cell_bold, alignment=TA_CENTER, fontSize=7.3, leading=9.5)
note = ParagraphStyle('note', parent=cell, fontSize=6.6, leading=8.3, textColor=HexColor('#555555'))

def P(text, style=cell):
    return Paragraph(text.replace('\n', '<br/>'), style)

rows = [
    dict(country='SWITZERLAND<br/>瑞士', date='Day 1<br/>09/25 FRI', city='Shanghai / PVG T1<br/>上海/浦东T1', dest='<b>Pre-departure day</b><br/>出发准备日。晚间前往上海浦东机场T1办理值机，准备搭乘次日凌晨航班。<br/><br/><b>Overnight flight</b>: MU217 departs at 01:30 on 26 Sep.<br/>过夜航班：MU217于9月26日01:30起飞。', trans='<b>Confirmed ticket</b>: China Eastern MU217, Shanghai Pudong (PVG) T1 → Geneva (GVA) T1; 26 Sep, 01:30–07:50; Economy.<br/>已出票：东航MU217，上海浦东（PVG）T1→日内瓦（GVA）T1；9月26日01:30–07:50；经济舱。<br/><br/><b>Ticket details</b>: PNR NZ2QQ0 / GDS PNR HETW2J; e-ticket 781-9446968439; total CNY 6,858.<br/>票务信息：PNR NZ2QQ0 / GDS PNR HETW2J；电子客票号781-9446968439；总价人民币6,858元。', acc='<b>Overnight on aircraft</b><br/>飞机上过夜<br/><br/>Issued 11 Aug 2026 / 2026年8月11日出票'),
    dict(country='', date='Day 2<br/>09/26 SAT', city='Geneva<br/>日内瓦', dest='<b>Arrival in Geneva at 07:50</b><br/>07:50抵达日内瓦，办理入境手续；前往IntercityHotel Geneva寄存行李。<br/><br/><b>Morning / lunch</b>: Café de Paris - Chez Boubier.<br/>上午/午餐：Café de Paris - Chez Boubier。<br/><br/><b>Afternoon Old Town route</b>: St. Pierre Cathedral, historic Old Town and Restaurant Les Armures.<br/>下午老城路线：圣彼得大教堂、老城区及Restaurant Les Armures。<br/><br/><b>Late afternoon lakeside route</b>: Jardin Anglais → Flower Clock → Jet d’Eau → Parc des Eaux-Vives → City Park.<br/>下午后段湖畔路线：英国花园→花钟→大喷泉→Parc des Eaux-Vives→城市公园。<br/><br/><b>Evening</b>: Palais des Nations exterior and Broken Chair area; return to hotel and rest.<br/>晚上：万国宫外观及断椅区域；返回酒店休息。', trans='<b>Arrival transfer</b>: Geneva Airport → IntercityHotel Geneva by train/tram/taxi; then walking and local transit.<br/>抵达交通：日内瓦机场→IntercityHotel Geneva，火车/电车/出租车；市区以步行及公共交通为主。', acc='<b>IntercityHotel Geneva</b><br/>日内瓦城际酒店<br/><br/>Website:<br/>hrewards.com/zh/intercityhotel-geneva<br/><br/><font color="#777777">Reservation pending / 待确认预订</font>'),
    dict(country='', date='Day 3<br/>09/27 SUN', city='Grindelwald<br/>格林德瓦', dest='<b>Grindelwald-First full day</b><br/>格林德瓦First山一日游。<br/><br/><b>Morning</b>: First cable car; First Cliff Walk by Tissot.<br/>上午：First缆车上山；First悬崖步道。<br/><br/><b>Late morning-afternoon</b>: Hike First → Bachalpsee, take photos by the alpine lake, return to First. Optional First Flyer or Mountain Cart if operating.<br/>上午后段至下午：徒步First→Bachalpsee高山湖，拍照后返回；如开放可选First Flyer或山地卡丁车。', trans='<b>Local</b>: Walk from Grindelwald station to Firstbahn; cable car return ticket.<br/>当地：格林德瓦火车站步行至Firstbahn；购买缆车往返票。<br/><br/><font color="#777777">Check live operation and weather / 以实时运营与天气为准</font>', acc='<b>Grindelwald hotel</b><br/>格林德瓦酒店<br/><br/><font color="#777777">Same hotel / 同上</font>'),
    dict(country='', date='Day 4<br/>09/28 MON', city='Grindelwald<br/>格林德瓦', dest='<b>Weather buffer and village day</b><br/>山区天气机动日与小镇慢游。<br/><br/><b>Option A</b>: Repeat First viewpoints or complete any activity missed on Day 3.<br/>方案A：补拍First山景点或完成前一天未体验的项目。<br/><br/><b>Option B</b>: Pfingstegg, valley walk, cafés and souvenir shopping.<br/>方案B：Pfingstegg、山谷步道、咖啡馆及纪念品购物。', trans='<b>Local transport and walking</b><br/>当地缆车/公交/步行。<br/><br/>Keep the day flexible for mountain closures.<br/>为山地交通临时关闭预留弹性。', acc='<b>Grindelwald hotel</b><br/>格林德瓦酒店<br/><br/><font color="#777777">Same hotel / 同上</font>'),
    dict(country='SWITZERLAND<br/>瑞士', date='Day 5<br/>09/29 TUE', city='Handegg / Gelmerbahn<br/>Handegg / Gelmerbahn', dest='<b>Gelmerbahn and Gelmersee day trip</b><br/>Gelmerbahn及Gelmersee一日往返。<br/><br/><b>Morning</b>: Travel from Grindelwald to Handegg; ride the steep open funicular to Gelmersee.<br/>上午：从格林德瓦前往Handegg；乘坐陡峭的Gelmerbahn上Gelmersee。<br/><br/><b>Afternoon</b>: Short lakeside walk or part of the lake circuit, picnic, then descend and return.<br/>下午：湖边短线或环湖部分路段，野餐后下山返程。<br/><br/><font color="#777777">Wear sturdy shoes; no catering at the lake / 穿防滑鞋；湖边无餐饮</font>', trans='<b>Train + PostBus</b>: Grindelwald → Interlaken Ost → Meiringen/Innertkirchen → Handegg, Gelmerbahn<br/>火车＋邮政巴士：格林德瓦→因特拉肯东→迈林根/因特拉肯地区→Handegg。<br/><br/><b>Gelmerbahn ticket</b>: reserve in advance for a guaranteed seat.<br/>Gelmerbahn建议提前预约座位。', acc='<b>Grindelwald hotel</b><br/>格林德瓦酒店<br/><br/><font color="#777777">Same hotel / 同上</font>'),
    dict(country='', date='Day 6<br/>09/30 WED', city='Grindelwald<br/>格林德瓦', dest='<b>Flexible mountain day</b><br/>山区机动日。<br/><br/>Use this day to repeat First or enjoy a relaxed village walk if weather affected Days 3-5. Prepare documents and luggage for Italy transfer.<br/>如第3-5日受天气影响，用本日补拍First或Gelmerbahn；整理材料与行李，准备前往意大利。', trans='<b>Local transport and walking</b><br/>当地交通及步行。', acc='<b>Grindelwald hotel</b><br/>格林德瓦酒店<br/><br/><font color="#777777">Same hotel / 同上</font>'),
    dict(country='', date='Day 7<br/>10/01 THU', city='Grindelwald<br/>格林德瓦', dest='<b>Final Switzerland day</b><br/>瑞士段最后一个完整日。<br/><br/><b>Morning</b>: Slow morning in Grindelwald and final photos.<br/>上午：格林德瓦小镇慢游及最后拍摄。<br/><br/><b>Afternoon</b>: Pack and confirm next-day international train connection to Milan.<br/>下午：整理行李，确认翌日前往米兰的跨境铁路衔接。', trans='<b>Local</b>: Walking and local bus/cable car as needed.<br/>当地：步行及按需使用公交/缆车。', acc='<b>Grindelwald hotel</b><br/>格林德瓦酒店<br/><br/><font color="#777777">7 Swiss nights in total / 瑞士共7晚</font>'),
    dict(country='ITALY<br/>意大利', date='Day 8<br/>10/02 FRI', city='Milan<br/>米兰', dest='<b>Arrival in Milan</b><br/>抵达米兰，办理入住。<br/><br/><b>Afternoon</b>: Milan Cathedral exterior/interior if time permits, Galleria Vittorio Emanuele II and Piazza della Scala.<br/>下午：如时间允许，参观米兰大教堂、埃马努埃莱二世拱廊及斯卡拉广场。<br/><br/><b>Evening</b>: Light walk and dinner near hotel.<br/>晚上：酒店附近散步及晚餐。', trans='<b>Cross-border train</b>: Grindelwald → Interlaken/Bern → Milan.<br/>跨境火车：格林德瓦→因特拉肯/伯尔尼→米兰。<br/><br/>Approx. 4.5-6 hours; exact connections pending.<br/>约4.5-6小时，具体衔接待确认。', acc='<b>Milan hotel</b><br/>米兰酒店<br/><br/><font color="#777777">Free-cancellation booking pending / 可取消预订待确认</font>'),
    dict(country='', date='Day 9<br/>10/03 SAT', city='Crema<br/>克雷马', dest='<b>Call Me by Your Name pilgrimage</b><br/>《请以你的名字呼唤我》巡礼。<br/><br/><b>Morning</b>: Milan → Crema; visit Piazza Duomo and the official CMBYN city route, including the town scenes and tourist information point.<br/>上午：米兰→克雷马；参观主教座堂广场、官方CMBYN城市路线及旅游信息点。<br/><br/><b>Afternoon</b>: Optional bike or local guide/driver to surrounding filming locations such as Moscazzano and Pandino, subject to access.<br/>下午：可选自行车或当地向导/包车前往Moscazzano、Pandino等周边取景地，视开放及交通情况。<br/><br/><b>Evening</b>: Return to Milan.<br/>晚上：返回米兰。', trans='<b>Regional train and local bus</b>: Milan ↔ Crema.<br/>区域铁路及公交：米兰往返克雷马。<br/><br/>Surrounding locations are scattered; a car/guide is recommended.<br/>周边取景点分散，建议包车或正规向导。', acc='<b>Milan hotel</b><br/>米兰酒店<br/><br/><font color="#777777">Same hotel / 同上</font>'),
    dict(country='ITALY<br/>意大利', date='Day 10<br/>10/04 SUN', city='Florence<br/>佛罗伦萨', dest='<b>Milan → Florence</b><br/>米兰前往佛罗伦萨。<br/><br/><b>Morning</b>: High-speed train to Florence and hotel check-in/drop luggage.<br/>上午：乘高速铁路前往佛罗伦萨，入住或寄存行李。<br/><br/><b>Afternoon</b>: Piazza del Duomo, Cathedral exterior, Piazza della Signoria and Ponte Vecchio.<br/>下午：圣母百花大教堂广场、主教堂外观、领主广场及老桥。<br/><br/><b>Evening</b>: Arno riverside walk.<br/>晚上：阿诺河畔散步。', trans='<b>High-speed train</b>: Milano Centrale → Firenze S.M.N., approx. 2 hours.<br/>高速铁路：米兰中央→佛罗伦萨S.M.N.，约2小时。<br/><br/>Advance reservation recommended.<br/>建议提前预约。', acc='<b>Florence hotel</b><br/>佛罗伦萨酒店<br/><br/><font color="#777777">Reservation pending / 待确认预订</font>'),
    dict(country='ITALY<br/>意大利', date='Day 11<br/>10/05 MON', city='Rome<br/>罗马', dest='<b>Florence → Rome</b><br/>佛罗伦萨前往罗马。<br/><br/><b>Morning</b>: Optional Accademia or Uffizi only if a timed ticket is secured; otherwise relaxed Florence walk.<br/>上午：如已预约时段票，可选学院美术馆或乌菲兹美术馆；否则佛罗伦萨慢游。<br/><br/><b>Afternoon</b>: High-speed train to Rome; hotel check-in.<br/>下午：乘高速铁路前往罗马，办理入住。<br/><br/><b>Evening</b>: Spanish Steps, Trevi Fountain and nearby streets.<br/>晚上：西班牙台阶、特莱维喷泉及周边街区。', trans='<b>High-speed train</b>: Firenze S.M.N. → Roma Termini, approx. 1.5 hours.<br/>高速铁路：佛罗伦萨→罗马，约1.5小时。', acc='<b>Rome hotel</b><br/>罗马酒店<br/><br/><font color="#777777">Reservation pending / 待确认预订</font>'),
    dict(country='', date='Day 12<br/>10/06 TUE', city='Naples<br/>那不勒斯', dest='<b>Rome → Naples and My Brilliant Friend pilgrimage</b><br/>罗马→那不勒斯及《我的天才女友》巡礼。<br/><br/><b>Morning</b>: Colosseum / Roman Forum, one timed-entry area only.<br/>上午：斗兽场或古罗马广场，限预约其中一组。<br/><br/><b>Afternoon</b>: High-speed train to Naples; hotel check-in.<br/>下午：乘高速铁路前往那不勒斯，办理入住。<br/><br/><b>Evening</b>: Follow the official city route: Corso Umberto I, Via Duomo/Tribunali, Port’Alba, Galleria Principe, Chiaia and Piazza dei Martiri.<br/>晚上：按官方城市路线巡礼：Corso Umberto I、Via Duomo/Tribunali、Port’Alba、Galleria Principe、Chiaia及Piazza dei Martiri。', trans='<b>High-speed train</b>: Roma Termini → Napoli Centrale, approx. 1-1.25 hours.<br/>高速铁路：罗马→那不勒斯，约1-1.25小时。<br/><br/><b>Local</b>: Metro/walking; keep luggage light.<br/>当地：地铁及步行；建议轻装。', acc='<b>Naples hotel</b><br/>那不勒斯酒店<br/><br/>Prefer near Napoli Centrale for airport transfer.<br/>建议住Napoli Centrale附近，方便离境。<br/><br/><font color="#777777">Reservation pending / 待确认预订</font>'),
    dict(country='', date='Day 13<br/>10/07 WED', city='Naples → Shanghai<br/>那不勒斯→上海', dest='<b>Departure from Italy</b><br/>从意大利离境。<br/><br/><b>Morning</b>: If flight is late, complete a short final walk in Naples; otherwise transfer to airport.<br/>上午：如航班较晚，完成那不勒斯最后短线巡礼；否则前往机场。<br/><br/><b>Departure</b>: Naples Airport → Shanghai, flight details to be added after booking.<br/>离境：那不勒斯机场→上海，航班预订后补充具体信息。', trans='<b>Airport transfer</b>: Napoli Centrale → Naples Airport by Alibus/taxi.<br/>机场交通：Napoli Centrale→那不勒斯机场，机场巴士或出租车。<br/><br/><font color="#777777">Return flight pending / 返程机票待预订</font>', acc='<b>No overnight</b><br/>当日离境，无住宿。')
]

# Confirmed ticket update from the user's issued itinerary PDF; this supersedes the earlier Tianxun estimate.
rows[5]['city'] = 'Grindelwald → Zurich<br/>格林德瓦→苏黎世'
rows[5]['dest'] = '<b>Transfer to Zurich and FREITAG visit</b><br/>前往苏黎世并探访FREITAG。<br/><br/><b>Morning</b>: Check out and train to Zurich; leave luggage at hotel.<br/>上午：退房并乘火车前往苏黎世；酒店寄存行李。<br/><br/><b>Afternoon</b>: FREITAG Flagship Store Zurich, Geroldstrasse 17; bags, accessories and repair/circular services.<br/>下午：FREITAG苏黎世旗舰店，Geroldstrasse 17；参观包袋、配件及维修/循环服务。<br/><br/><b>Evening</b>: Zurich West walk and dinner.<br/>晚上：苏黎世西区散步及晚餐。'
rows[5]['trans'] = '<b>Train</b>: Grindelwald → Interlaken Ost/Bern → Zürich HB, approx. 2.5-3.5 hours.<br/>火车：格林德瓦→因特拉肯东/伯尔尼→苏黎世中央，约2.5-3.5小时。<br/><br/>FREITAG Flagship Store: Geroldstrasse 17; Wednesday 11:00-19:00 shown on official site.<br/>FREITAG旗舰店：Geroldstrasse 17；官网显示周三11:00-19:00营业。'
rows[5]['acc'] = '<b>Zurich hotel</b><br/>苏黎世酒店<br/><br/><font color="#777777">Free-cancellation booking pending / 建议预订可取消房型</font>'
rows[6]['city'] = 'Zurich<br/>苏黎世'
rows[6]['dest'] = '<b>Zurich city and FREITAG follow-up</b><br/>苏黎世城市观光及FREITAG补充行程。<br/><br/><b>Morning</b>: Old Town, Lindenhof viewpoint, Grossmünster and Limmat river walk.<br/>上午：苏黎世老城、林登霍夫观景台、大教堂外观及利马特河畔。<br/><br/><b>Afternoon</b>: FREITAG Flagship Store again if needed; optional factory-tour request only if pre-booked. Then Bahnhofstrasse and Lake Zurich promenade.<br/>下午：如需购物可再次前往FREITAG旗舰店；工厂参观仅在提前预约且有名额时安排；随后游览班霍夫大街及苏黎世湖畔。<br/><br/><b>Evening</b>: Pack for Milan transfer.<br/>晚上：整理行李，准备前往米兰。'
rows[6]['trans'] = '<b>Local</b>: Tram/train/walking in Zurich.<br/>当地：苏黎世电车/火车/步行。<br/><br/><font color="#777777">Thursday opening shown as 11:00-19:00; verify before travel / 官网显示周四11:00-19:00，出发前再次核实</font>'
rows[6]['acc'] = '<b>Zurich hotel</b><br/>苏黎世酒店<br/><br/><font color="#777777">7 Swiss nights in total / 瑞士共7晚</font>'
rows[7]['city'] = 'Zurich → Milan<br/>苏黎世→米兰'
rows[7]['trans'] = '<b>International train</b>: Zürich HB → Milano Centrale, usually via Gotthard route; approx. 3.5-4 hours.<br/>国际铁路：苏黎世中央→米兰中央，通常经圣哥达线路；约3.5-4小时。<br/><br/><font color="#777777">Exact train and seat reservation pending / 具体车次及座位待确认</font>'
rows[3]['dest'] = '<b>Interlaken + Lake Brienz + Iseltwald day trip</b><br/>因特拉肯＋布里恩茨湖＋Iseltwald一日线。<br/><br/><b>Morning</b>: Grindelwald → Interlaken Ost; walk through Höhematte and the centre of Interlaken.<br/>上午：格林德瓦→因特拉肯东；游览Höhematte草坪及因特拉肯市中心。<br/><br/><b>Late morning</b>: Boat from Interlaken Ost across Lake Brienz to Iseltwald; visit the lakeside village, quay and viewpoints.<br/>上午后段：从因特拉肯东乘船横渡布里恩茨湖到Iseltwald；游览湖畔村落、码头及观景点。<br/><br/><b>Afternoon</b>: Lakeside walk and coffee in Iseltwald; return by boat if timetable allows, otherwise bus via Interlaken.<br/>下午：Iseltwald湖边散步及咖啡；若船班时间合适乘船返程，否则经因特拉肯乘公交返回。<br/><br/><b>Evening</b>: Interlaken Ost → Grindelwald.<br/>晚上：因特拉肯东→格林德瓦。'
rows[3]['trans'] = '<b>Train + boat</b>: Grindelwald → Interlaken Ost; BLS boat Interlaken Ost (See) ↔ Iseltwald on Lake Brienz; return to Grindelwald by train.<br/>火车＋游船：格林德瓦→因特拉肯东；乘BLS船往返因特拉肯东（湖区码头）↔Iseltwald；火车返回格林德瓦。<br/><br/><font color="#777777">Boat service and exact timetable are seasonal; check the 2026 timetable before booking / 船班为季节性运营，购票前核对2026时刻表</font>'
rows[6]['dest'] = '<b>Zurich city, design and industrial quarter</b><br/>苏黎世城市、设计及工业街区路线。<br/><br/><b>Morning</b>: Old Town, Lindenhof viewpoint, Grossmünster and Limmat river walk.<br/>上午：苏黎世老城、林登霍夫观景台、大教堂外观及利马特河畔。<br/><br/><b>Afternoon</b>: FREITAG Flagship Store; continue through Zürich-West to Freitag Tower, Viadukt, Frau Gerolds Garten and Prime Tower exterior.<br/>下午：FREITAG旗舰店；继续游览苏黎世西区的Freitag Tower、Viadukt拱廊、Frau Gerolds Garten及Prime Tower外观。<br/><br/><b>Evening</b>: Bahnhofstrasse or Lake Zurich promenade; pack for Milan.<br/>晚上：班霍夫大街或苏黎世湖畔散步；整理行李准备米兰。'

def page_header(c, doc):
    c.saveState()
    c.setFont('STHeiti', 7)
    c.setFillColor(HexColor('#666666'))
    c.drawRightString(A4[0]-16*mm, A4[1]-11*mm, 'Applicant: __________________   Passport: __________________')
    c.setFont('STHeiti', 6.5)
    c.drawCentredString(A4[0]/2, 9*mm, f'Page {doc.page} of 4')
    c.restoreState()

def make_table(batch):
    header = [P('Country', head), P('Date', head), P('City or<br/>Airport', head), P('Destination and Scenic Spot', head), P('Transportation', head), P('Accommodation', head)]
    data = [header]
    for r in batch:
        data.append([P(r['country'], country), P(r['date'], cell_bold), P(r['city'], cell_bold), P(r['dest'], cell), P(r['trans'], small), P(r['acc'], small)])
    t = Table(data, colWidths=[47, 52, 64, 194, 91, 87], repeatRows=1, splitByRow=1, hAlign='LEFT')
    t.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), BLUE),
        ('TEXTCOLOR', (0,0), (-1,0), colors.white),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('GRID', (0,0), (-1,-1), 0.35, GRID),
        ('BACKGROUND', (0,1), (0,-1), PALE_BLUE),
        ('BACKGROUND', (1,1), (-1,-1), colors.white),
        ('LEFTPADDING', (0,0), (-1,-1), 4),
        ('RIGHTPADDING', (0,0), (-1,-1), 4),
        ('TOPPADDING', (0,0), (-1,-1), 5),
        ('BOTTOMPADDING', (0,0), (-1,-1), 5),
    ]))
    return t

story = []
story += [Spacer(1, 5*mm), P('Travel Program for Schengen Visa Application', title), P('申根签证旅行行程单', title), P('(Switzerland & Italy — September/October 2026)<br/>（瑞士及意大利｜2026年9月/10月）', subtitle)]
for i, batch in enumerate([rows[0:4], rows[4:7], rows[7:10], rows[10:13]]):
    if i > 0:
        story.append(Spacer(1, 12*mm))
    story.append(make_table(batch))
    if i < 3:
        story.append(PageBreak())

doc = SimpleDocTemplate(OUT, pagesize=A4, rightMargin=16*mm, leftMargin=16*mm, topMargin=16*mm, bottomMargin=14*mm, title='Travel Program for Schengen Visa Application')
doc.build(story, onFirstPage=page_header, onLaterPages=page_header)
print(OUT)
