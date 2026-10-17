import fs from 'node:fs/promises';
import { Workbook, SpreadsheetFile } from '@oai/artifact-tool';

const outDir = '/Users/yz/Library/CloudStorage/OneDrive-个人/travelagent/outputs';
const outPath = `${outDir}/瑞士意大利申根行程单_2026-09-25至10-07.xlsx`;
const workbook = Workbook.create();
const itinerary = workbook.worksheets.add('每日行程');
const summary = workbook.worksheets.add('签证摘要');
const sources = workbook.worksheets.add('资料来源');

const navy = '#1F4E78', blue = '#D9EAF7', pale = '#F5F8FB', gold = '#FFF2CC', green = '#E2F0D9', grey = '#6B7280', line = '#D9E2F3';

// Summary sheet
summary.showGridLines = false;
summary.mergeCells('A1:H1');
summary.getRange('A1').values = [['瑞士＋意大利旅游行程单（签证材料草案）']];
summary.getRange('A1:H1').format = { fill: navy, font: { bold: true, color: '#FFFFFF', size: 16 }, horizontalAlignment: 'center', verticalAlignment: 'center' };
summary.getRange('A1:H1').format.rowHeight = 30;
summary.getRange('A3:B11').values = [
  ['旅行日期', '2026-09-25 至 2026-10-07'],
  ['旅行天数', 13],
  ['住宿晚数', 12],
  ['出发城市', '上海（具体机场/航班待预订）'],
  ['申根入境', '日内瓦（瑞士）'],
  ['申根离境', '那不勒斯（意大利，建议）'],
  ['瑞士住宿晚数', 7],
  ['意大利住宿晚数', 5],
  ['主要目的地说明', '瑞士实际住宿晚数多于意大利1晚；行程重点为格林德瓦、First山和Gelmerbahn。']
];
summary.getRange('A3:A11').format = { fill: blue, font: { bold: true, color: navy } };
summary.getRange('B3:B11').format = { fill: pale, wrapText: true };
summary.getRange('A3:B11').format.borders = { preset: 'all', style: 'thin', color: line };
summary.getRange('A13:H13').merge();
summary.getRange('A13').values = [['住宿安排（真实预订后替换“待预订”）']];
summary.getRange('A13:H13').format = { fill: navy, font: { bold: true, color: '#FFFFFF' } };
summary.getRange('A14:H20').values = [
  ['城市', '国家', '入住', '离店', '晚数', '住宿', '预订状态', '备注'],
  ['日内瓦', '瑞士', '2026-09-25', '2026-09-26', 1, 'IntercityHotel Geneva', '待预订/待确认', '用户指定酒店；官网链接见资料来源'],
  ['格林德瓦', '瑞士', '2026-09-26', '2026-10-02', 6, '待预订（建议可取消）', '待预订', '覆盖First山、Gelmerbahn及天气机动日'],
  ['米兰', '意大利', '2026-10-02', '2026-10-04', 2, '待预订（建议可取消）', '待预订', '含克雷马一日巡礼'],
  ['佛罗伦萨', '意大利', '2026-10-04', '2026-10-05', 1, '待预订（建议可取消）', '待预订', '城市观光；停留较短'],
  ['罗马', '意大利', '2026-10-05', '2026-10-06', 1, '待预订（建议可取消）', '待预订', '核心古迹；停留较短'],
  ['那不勒斯', '意大利', '2026-10-06', '2026-10-07', 1, '待预订（建议靠近Napoli Centrale）', '待预订', '《我的天才女友》巡礼；建议从那不勒斯离境']
];
summary.getRange('A14:H14').format = { fill: blue, font: { bold: true, color: navy }, wrapText: true };
summary.getRange('A15:H20').format = { fill: '#FFFFFF', wrapText: true };
summary.getRange('A14:H20').format.borders = { preset: 'all', style: 'thin', color: line };
summary.getRange('A22:H25').merge(true);
summary.getRange('A22').values = [['签证材料使用说明：本表为真实行程规划草案。酒店、交通、门票和保险应在递交签证前按实际购买/预订情况更新，并确保与实际出行一致。未实际预订的内容统一标为“待预订”，不可直接作为已确认订单提交。']];
summary.getRange('A22:H25').format = { fill: gold, wrapText: true, font: { color: '#7F6000' }, verticalAlignment: 'center' };
summary.getRange('A22:H25').format.borders = { preset: 'outside', style: 'thin', color: '#D6B656' };
summary.getRange('A1:H25').format.font.name = 'Arial';
summary.getRange('A:A').format.columnWidth = 18; summary.getRange('B:B').format.columnWidth = 30; summary.getRange('C:E').format.columnWidth = 14; summary.getRange('F:F').format.columnWidth = 28; summary.getRange('G:G').format.columnWidth = 16; summary.getRange('H:H').format.columnWidth = 34;
summary.freezePanes.freezeRows(2);

// Itinerary sheet
itinerary.showGridLines = false;
itinerary.mergeCells('A1:J1');
itinerary.getRange('A1').values = [['2026年9月25日—10月7日｜瑞士＋意大利逐日行程']];
itinerary.getRange('A1:J1').format = { fill: navy, font: { bold: true, color: '#FFFFFF', size: 16 }, horizontalAlignment: 'center', verticalAlignment: 'center' };
itinerary.getRange('A1:J1').format.rowHeight = 30;
itinerary.getRange('A3:J3').values = [['天数','日期','国家/城市','住宿','每日安排','交通建议','重点/巡礼内容','预订/凭证','风险提示','来源']];
itinerary.getRange('A3:J3').format = { fill: blue, font: { bold: true, color: navy }, wrapText: true, verticalAlignment: 'center' };

const rows = [
 [1,new Date('2026-09-25'),'瑞士｜日内瓦','IntercityHotel Geneva','上海出发→日内瓦入境；入住酒店；根据航班时间安排湖畔/老城轻松散步。','国际航班：上海→日内瓦（待预订）','瑞士作为申根首入境国；保留入境与住宿证明。','机票/酒店：待预订；酒店官网已提供','到达时间未定，不安排过满','酒店官网'],
 [2,new Date('2026-09-26'),'瑞士｜日内瓦→格林德瓦','格林德瓦（待预订）','退房后乘火车前往格林德瓦；下午小镇、教堂、梦幻山坡拍照；早休息。','Geneva→Bern→Interlaken Ost→Grindelwald（以SBB当天班次为准）','进入本次瑞士山地重点区域。','火车票/酒店：待预订','山地天气变化；留出转车余量','SBB｜Grindelwald Tourism'],
 [3,new Date('2026-09-27'),'瑞士｜格林德瓦 First','格林德瓦（同上）','上午乘First缆车上山；First Cliff Walk；徒步Bachalpsee往返；体力允许再选First Flyer或Mountain Cart。','步行至Firstbahn；缆车往返','核心必去：First山＋Bachalpsee。建议早上出发。','First缆车/项目：待购','项目及缆车受天气影响；提前查运营状态','Jungfrau官方｜小红书路线笔记'],
 [4,new Date('2026-09-28'),'瑞士｜格林德瓦','格林德瓦（同上）','格林德瓦小镇慢游；天气好可安排Pfingstegg或湖边散步；作为First/山区天气机动日。','当地步行/缆车（按当天状态）','机动日可用于补拍First或休息，增强行程真实性与可执行性。','活动票：待购','不建议当天再塞少女峰，避免与核心重点冲突','Grindelwald Tourism'],
 [5,new Date('2026-09-29'),'瑞士｜Gelmerbahn / Gelmersee','格林德瓦（同上）','早出发前往Handegg；乘Gelmerbahn上Gelmersee；湖边短线/环湖步道视体力与天气；原路返回格林德瓦。','Grindelwald→Interlaken Ost→Meiringen/Innertkirchen→Handegg, Gelmerbahn（SBB/邮政巴士）','核心必去：Gelmerbahn＋Gelmersee；官方建议提前购买座位保障票。','Gelmerbahn：待购/预约；公共交通：待购','2026季节为6月6日—10月25日；山路需防滑鞋，湖边无餐饮','Grimselwelt官方｜Switzerland Tourism'],
 [6,new Date('2026-09-30'),'瑞士｜格林德瓦','格林德瓦（同上）','天气/体力缓冲；整理行李，准备翌日前往意大利。','格林德瓦市内','瑞士段最后一个完整日；确保瑞士实际住宿晚数为7晚。','酒店：同上','山地景点临时关闭时使用此日补救','Jungfrau官方'],
 [7,new Date('2026-10-01'),'瑞士｜格林德瓦','格林德瓦（同上）','上午小镇休整或补拍；下午整理离境材料。','步行/当地交通','瑞士住宿晚数多于意大利1晚；此日为签证摘要中的瑞士主目的地支撑日。','酒店：同上','不要虚构已购买交通或景点票','行程规划'],
 [8,new Date('2026-10-02'),'意大利｜米兰','米兰（待预订）','格林德瓦退房→米兰；下午米兰大教堂、埃马努埃莱二世拱廊、斯福尔扎城堡外观。','Grindelwald→Interlaken/Bern→Milan（以SBB/Trenitalia班次为准）','进入意大利；米兰作为北意交通节点。','火车票/酒店：待预订','跨国长途转移，建议购买可改签车票','SBB｜Trenitalia'],
 [9,new Date('2026-10-03'),'意大利｜克雷马巡礼','米兰（同上）','米兰往返克雷马；参观旅游局推荐的《Call Me by Your Name》城市路线；如有时间租车/预约当地巡礼延伸至Moscazzano、Pandino等周边取景地。','米兰→克雷马区域铁路/公交；周边取景地建议当地包车或正规向导','核心必去：Crema CMBYN city tour；克雷马周边取景点分散，不能只靠步行。','巡礼/自行车/包车：待预约','部分取景地为私人场所，只在公共道路或官方允许范围拍摄','Turismo Crema｜Pro Loco Crema'],
 [10,new Date('2026-10-04'),'意大利｜米兰→佛罗伦萨','佛罗伦萨（待预订）','上午离开米兰前往佛罗伦萨；下午圣母百花大教堂外观、领主广场、老桥。','Milano Centrale→Firenze S.M.N.（高速铁路）','意大利城市段压缩安排；如想增加艺术馆需提前预约并减少其他点。','Trenitalia/Italo/酒店：待预订','高速铁路建议尽早订；景点开放以官网为准','Trenitalia｜Visit Tuscany'],
 [11,new Date('2026-10-05'),'意大利｜佛罗伦萨→罗马','罗马（待预订）','上午补充佛罗伦萨城市观光；下午高速铁路到罗马，晚间西班牙广场/特莱维喷泉。','Firenze S.M.N.→Roma Termini','罗马仅安排核心城市观光，不把梵蒂冈硬塞进同一天。','火车/酒店：待预订','景点预约需根据最终航班和住宿确认','Trenitalia'],
 [12,new Date('2026-10-06'),'意大利｜罗马→那不勒斯巡礼','那不勒斯（待预订，建议近Napoli Centrale）','上午罗马斗兽场/古罗马广场（二选一组，需预约）；下午前往那不勒斯；傍晚沿Corso Umberto I、Via dei Tribunali、Port’Alba、Galleria Principe、Chiaia/Piazza dei Martiri方向做《我的天才女友》巡礼。','Roma Termini→Napoli Centrale（高速铁路）','核心必去：那不勒斯《我的天才女友》官方城市路线。','景点/火车/酒店：待预订','行李尽量轻；那不勒斯晚间注意保管财物','Visit Naples官方'],
 [13,new Date('2026-10-07'),'意大利｜那不勒斯→上海','—','那不勒斯机场离境→上海（建议购买返程联程票）；如航班较晚，上午完成最后的那不勒斯巡礼。','Napoli Centrale→Naples Airport；国际航班待预订','建议从意大利离开申根区，和行程顺序一致。','返程机票：待预订','必须以真实航班和实际离境安排更新','行程规划']
];
itinerary.getRange('A4:J16').values = rows;
itinerary.getRange('B4:B16').format.numberFormat = [['yyyy-mm-dd']];
itinerary.getRange('A4:J16').format = { wrapText: true, verticalAlignment: 'top' };
itinerary.getRange('A4:J16').format.borders = { insideHorizontal: { style:'thin', color:line }, bottom:{ style:'thin', color:line } };
itinerary.getRange('C4:C10').format.fill = '#EAF3F8'; itinerary.getRange('C11:C16').format.fill = '#FCE4D6';
itinerary.getRange('A4:A16').format.horizontalAlignment = 'center'; itinerary.getRange('B4:B16').format.horizontalAlignment = 'center';
itinerary.getRange('A:A').format.columnWidth = 8; itinerary.getRange('B:B').format.columnWidth = 13; itinerary.getRange('C:C').format.columnWidth = 18; itinerary.getRange('D:D').format.columnWidth = 24; itinerary.getRange('E:E').format.columnWidth = 48; itinerary.getRange('F:F').format.columnWidth = 42; itinerary.getRange('G:G').format.columnWidth = 38; itinerary.getRange('H:H').format.columnWidth = 27; itinerary.getRange('I:I').format.columnWidth = 32; itinerary.getRange('J:J').format.columnWidth = 25;
itinerary.getRange('A4:J16').format.rowHeight = 72;
itinerary.getRange('A1:J16').format.font.name = 'Arial'; itinerary.freezePanes.freezeRows(3);

// Sources sheet
sources.showGridLines = false;
sources.mergeCells('A1:E1'); sources.getRange('A1').values = [['官方资料与旅行搜索依据']]; sources.getRange('A1:E1').format = { fill: navy, font:{bold:true,color:'#FFFFFF',size:15}, horizontalAlignment:'center' };
sources.getRange('A3:E3').values = [['类别','资料/页面','用途','链接','备注']]; sources.getRange('A3:E3').format = { fill: blue, font:{bold:true,color:navy}, wrapText:true };
sources.getRange('A4:E15').values = [
 ['签证规则','瑞士驻华使领馆：Where to apply for a Schengen visa','确认主要目的地、领区与申请规则','https://www.eda.admin.ch/countries/china/en/home/visa/einreise-ch/bis-90-tage/ort-antragstellung-schengen.html','递交前再次核对VFS与领区要求'],
 ['签证规则','欧盟：Applying for a Schengen visa','确认多国旅行按最长停留国申请','https://home-affairs.ec.europa.eu/policies/schengen/visa-policy/applying-schengen-visa_en','本表按瑞士7晚、意大利5晚规划'],
 ['日内瓦酒店','IntercityHotel Geneva','用户指定酒店','https://hrewards.com/zh/intercityhotel-geneva','尚未实际预订'],
 ['First官方','Grindelwald-First – Top of Adventure','确认2026夏季运营与Bachalpsee信息','https://www.jungfrau.ch/en-gb/grindelwaldfirst/','9月25日—10月7日在运营区间内，仍须看当天状态'],
 ['First官方','Operating info','确认缆车/山地交通运营信息','https://www.jungfrau.ch/en-gb/live/operating-info','以旅行当天实时状态为准'],
 ['Gelmerbahn官方','Grimselwelt Online-Shop','确认2026 Gelmerbahn日期、票价与预约','https://besucherdienst.kwo.ch/path/app/','2026-06-06至2026-10-25；官方提示提前买票保座'],
 ['Gelmerbahn参考','Switzerland Tourism：Gelmerbahn','确认湖边徒步与装备提示','https://www.myswitzerland.com/en-gb/experiences/gelmerbahn-funicular-railway/','环湖约2小时，需防滑鞋；湖边无餐饮'],
 ['CMBYN官方旅游','Turismo Crema：CMBYN city tour','确认克雷马城市巡礼路线','https://turismocrema.it/en/itinerari/cmbyn-city-tour/','建议到当地旅游信息点领取最新路线'],
 ['CMBYN周边','Pro Loco Crema：#SummerInCrema','确认周边取景地与当地巡礼产品','https://www.prolococrema.it/summerincrema','周边取景点分散，可能需要包车/向导'],
 ['那不勒斯官方旅游','Visit Naples：My Brilliant Friend locations','确认那不勒斯系列巡礼路线','https://www.visitnaples.eu/en/neapolitanity/discover-naples/the-places-of-lamica-geniale-a-tour-of-the-novels-by-elena-ferrante','官方建议的一日城市路线可压缩为半日/傍晚线'],
 ['佛罗伦萨官方旅游','Visit Tuscany：L’Amica Geniale in Florence','影视与城市资料补充','https://www.visittuscany.com/en/itineraries/lamica-geniale-in-florence/','非本次必去，可按时间删减'],
 ['旅行搜索','小红书/Rednote搜索结果（已取得详情）','参考First早出发、Bachalpsee与项目安排','https://www.rednote.com/explore/6a4418e000000001c026ecb','笔记为经验参考，不替代官方信息']
];
sources.getRange('A4:E15').format = { wrapText:true, verticalAlignment:'top' }; sources.getRange('A3:E15').format.borders = { insideHorizontal:{style:'thin',color:line}, bottom:{style:'thin',color:line} };
sources.getRange('A:A').format.columnWidth=18; sources.getRange('B:B').format.columnWidth=34; sources.getRange('C:C').format.columnWidth=36; sources.getRange('D:D').format.columnWidth=58; sources.getRange('E:E').format.columnWidth=32; sources.getRange('A4:E15').format.rowHeight=48;
sources.getRange('A1:E15').format.font.name='Arial'; sources.freezePanes.freezeRows(3);

await fs.mkdir(outDir, { recursive: true });
const xlsx = await SpreadsheetFile.exportXlsx(workbook);
await xlsx.save(outPath);

const check = await workbook.inspect({ kind:'table', sheetId:'每日行程', range:'A1:J16', include:'values,formulas', tableMaxRows:6, tableMaxCols:10, maxChars:4000 });
console.log(check.ndjson);
const errors = await workbook.inspect({ kind:'match', searchTerm:'#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A', options:{useRegex:true,maxResults:50}, summary:'formula scan' });
console.log(errors.ndjson);
for (const [name, range] of [['每日行程','A1:J16'],['签证摘要','A1:H25'],['资料来源','A1:E15']]) {
  const blob = await workbook.render({ sheetName:name, range, scale:1, format:'png' });
  await fs.writeFile(`${outDir}/${name}.png`, new Uint8Array(await blob.arrayBuffer()));
}
console.log(outPath);
