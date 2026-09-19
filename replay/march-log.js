/* 行军日志记录表（marchLog）—— 样片：土城 → 一渡赤水
 *
 * 字段与《行军日志字段表》（../samples/march-log-schema.md §1）逐字对应，一条记录对一个部队。
 * 写法：能核的填值，核不出的留空（空串）并标「待核」；文献打架的并列写在 conflictNote 里。
 * 确定性按字段表 §3 的保守取整规则：只要有一个关键字段是「待核」，certainty 不得高于「待核」
 *   （字段表 §2 的示例里有三条写成了 近似/标定，与本规则冲突，已按规则改正，见该节末注）。
 *
 * animRef 沿用字段表 §6 的写法（指向 scenario.js 的 tracks[].segments / events）。
 * 本页播放器只从 animRef 里解析 t0/t1 两个数，用来把记录定位到 90 秒动画的时段；
 *   解析不到 t0/t1 的记录 = 不在本片时段内（如 1 月 24 日占土城），面板按「前情」显示。
 *   「unitId=…」这类描述是给人看的（scenario.js 的片段尚未编号），定位不依赖它。
 */
const MARCH_LOG_META = {
  table: 'marchLog（行军日志记录表）',
  scope: '1935-01-24 — 1935-01-29 · 土城 — 一渡赤水',
  schema: '../samples/march-log-schema.md',
  gaps: [
    '1 月 25 日、26 日各部队日程未见记载 —— 本表留空，缺口是显形的',
    '出处定位（页码 / 条目号）与权威出处待补 —— 现有来源多为网络报道，定稿须换档案与出版物',
    '蓝军侧公开出版物密度远低于红军侧：本表蓝军只有 1 条且出处待补（字段表 §5 方案 A）'
  ]
};

const MARCH_LOG = [
  /* ---------- 前情：不在本片时段内 ---------- */
  {
    logId: 'tucheng-19350124-main', side: 'red', unitId: 'r-main',
    unitName: '中央红军（主力，具体部队待核）', unitLevel: '军团级以上（待细分）', parentUnitId: '',
    date: '1935-01-24', timeRange: '', action: '行军',
    placeName: '土城', lonlat: [106.03, 28.28], coordCertainty: '近似',
    fromPlaceName: '', toPlaceName: '土城', routeNote: '', distanceKm: '',
    engagedWith: '', lossNote: '',
    sourceRef: '中国红色旅游网《贵州·习水·土城》', sourceType: '网络', sourceLocator: '待补',
    certainty: '近似',
    conflictNote: '具体是哪个军团先入城，未见明确记载；本片动画自 1 月 26 日由遵义北上起叙，与「1 月 24 日已占土城」一说并不一致，两说并存待核',
    animRef: '', eventCardRef: ''
  },

  /* ---------- 1 月 27 日 ---------- */
  {
    logId: 'qinggangpo-19350127-red', side: 'red', unitId: 'r-main',
    unitName: '中央红军（北进部队，番号待核）', unitLevel: '（待细分）', parentUnitId: '',
    date: '1935-01-27', timeRange: '', action: '战斗',
    placeName: '土城·青杠坡', lonlat: [106.045, 28.285], coordCertainty: '待核',
    fromPlaceName: '土城', toPlaceName: '青杠坡', routeNote: '北进途中与川军遭遇', distanceKm: '',
    engagedWith: '川军（番号待核）', lossNote: '',
    sourceRef: '《红军长征在贵州》系列报道·第十期《土城会议：拉开四渡赤水的序幕》',
    sourceType: '网络', sourceLocator: '待补（原文为「1 月 27 日……遭遇」句）',
    certainty: '待核',
    conflictNote: '遭遇战与 28 日主战斗的分界，各文献划分不一',
    animRef: 'tracks[].segments: unitId=r3, t0=26, t1=28', eventCardRef: 'card-qinggangpo'
  },

  /* ---------- 1 月 28 日：青杠坡战斗（红军侧，一条记录一个部队） ---------- */
  {
    logId: 'qinggangpo-19350128-r3', side: 'red', unitId: 'r3',
    unitName: '红三军团', unitLevel: '军团', parentUnitId: '',
    date: '1935-01-28', timeRange: '拂晓起', action: '战斗',
    placeName: '土城·青杠坡', lonlat: [106.045, 28.285], coordCertainty: '待核',
    fromPlaceName: '', toPlaceName: '', routeNote: '', distanceKm: '',
    engagedWith: '川军（番号待核）', lossNote: '',
    sourceRef: '《红军长征在贵州》系列报道·第十期', sourceType: '网络',
    sourceLocator: '待补（原文为「1 月 28 日……青杠坡战斗正式打响」句）',
    certainty: '待核',
    conflictNote: '参战部队构成（红三军团 / 红五军团 / 干部团）各文献详略不一',
    animRef: 'tracks[].segments: unitId=r3, t0=28, t1=52', eventCardRef: 'card-qinggangpo'
  },
  {
    logId: 'qinggangpo-19350128-r5', side: 'red', unitId: 'r5',
    unitName: '红五军团', unitLevel: '军团', parentUnitId: '',
    date: '1935-01-28', timeRange: '拂晓起', action: '战斗',
    placeName: '土城·青杠坡', lonlat: [106.045, 28.285], coordCertainty: '待核',
    fromPlaceName: '', toPlaceName: '', routeNote: '', distanceKm: '',
    engagedWith: '川军（番号待核）', lossNote: '',
    sourceRef: '党建网《“土城会议”——拉开四渡赤水的序幕》', sourceType: '网络',
    sourceLocator: '待补（原文为「参战为红三、红五军团及军委干部团」句）',
    certainty: '待核',
    conflictNote: '参战部队构成各文献详略不一；本条按「红三、红五军团及军委干部团」之说记入',
    animRef: 'tracks[].segments: unitId=r5, t0=28, t1=52', eventCardRef: 'card-qinggangpo'
  },
  {
    logId: 'qinggangpo-19350128-cadre', side: 'red', unitId: 'cadre',
    unitName: '军委干部团', unitLevel: '干部团', parentUnitId: '',
    date: '1935-01-28', timeRange: '拂晓起', action: '战斗',
    placeName: '土城·青杠坡', lonlat: [106.045, 28.285], coordCertainty: '待核',
    fromPlaceName: '', toPlaceName: '', routeNote: '', distanceKm: '',
    engagedWith: '川军（番号待核）', lossNote: '',
    sourceRef: '党建网《“土城会议”——拉开四渡赤水的序幕》', sourceType: '网络',
    sourceLocator: '待补（原文为「参战为红三、红五军团及军委干部团」句）',
    certainty: '待核',
    conflictNote: '',
    animRef: 'tracks[].segments: unitId=cadre, t0=28, t1=52', eventCardRef: 'card-qinggangpo'
  },

  /* ---------- 1 月 28 日：蓝军侧（同表同字段，靠「待核」显形） ---------- */
  {
    logId: 'qinggangpo-19350128-blue', side: 'blue', unitId: 'b-chuan',
    unitName: '川军（番号全称待核，一说郭勋祺部）', unitLevel: '（待核）', parentUnitId: '',
    date: '1935-01-28', timeRange: '', action: '战斗',
    placeName: '土城·青杠坡', lonlat: [106.045, 28.285], coordCertainty: '待核',
    fromPlaceName: '', toPlaceName: '', routeNote: '', distanceKm: '',
    engagedWith: '红三军团 / 红五军团 / 干部团', lossNote: '',
    sourceRef: '（待补，需国民党军战史、川军档案或地方志）', sourceType: '（待补）', sourceLocator: '待补',
    certainty: '待核',
    conflictNote: '蓝军侧行军日志在公开出版物中密度远低于红军侧，日程与位置多为推测；本条按字段表 §5 方案 A 与红军侧同表同字段，不用推定值填充',
    animRef: 'tracks[].segments: unitId=b_guo, t0=28, t1=52', eventCardRef: ''
  },

  /* ---------- 1 月 28 日夜：土城会议 ---------- */
  {
    logId: 'tucheng-19350128-meeting', side: 'red', unitId: 'r-cmc',
    unitName: '中革军委（中央政治局主要领导人）', unitLevel: '军委', parentUnitId: '',
    date: '1935-01-28', timeRange: '', action: '会议',
    placeName: '土城·旧商会会馆', lonlat: [106.03, 28.28], coordCertainty: '近似',
    fromPlaceName: '', toPlaceName: '', routeNote: '', distanceKm: '',
    engagedWith: '', lossNote: '',
    sourceRef: '《红军长征在贵州》系列报道·第十期', sourceType: '网络', sourceLocator: '待补',
    certainty: '近似',
    conflictNote: '会议具体时段与参会范围各文献表述不一（一说当晚、一说 29 日凌晨）；决定内容为「立即撤出青杠坡战斗，从土城一带西渡赤水河」',
    animRef: 'events: t=54, dur=10（会议按瞬时事件处理）; t0=52, t1=66', eventCardRef: 'card-tucheng-meeting'
  },

  /* ---------- 1 月 29 日：一渡赤水 ---------- */
  {
    logId: 'chishui-19350129-red', side: 'red', unitId: 'r-main',
    unitName: '中央红军（分三路）', unitLevel: '军团级以上（待细分）', parentUnitId: '',
    date: '1935-01-29', timeRange: '凌晨起', action: '渡河',
    placeName: '土城南北地区 / 猿猴（今元厚）', lonlat: [106.03, 28.28], coordCertainty: '近似',
    fromPlaceName: '土城', toPlaceName: '川南古蔺、叙永方向', routeNote: '分三路西渡', distanceKm: '',
    engagedWith: '', lossNote: '',
    sourceRef: '《红军长征在贵州》系列报道·第十期', sourceType: '网络',
    sourceLocator: '待补（原文为「1 月 29 日……分 3 路从猿猴（今元厚）、土城南北地区西渡赤水河」句）',
    certainty: '近似',
    conflictNote: '「浑溪口」等具体渡口名，本样张尚未核到权威标注；本片动画按浑溪口架浮桥呈现',
    animRef: 'tracks[].segments: 三条 cross 段（r3 / r5 / cadre）; t0=66, t1=80', eventCardRef: 'card-first-crossing'
  },

  /* ---------- 1 月 29 日白天：转向川南 ---------- */
  {
    logId: 'gulin-19350129-main', side: 'red', unitId: 'r-main',
    unitName: '中央红军（分三路）', unitLevel: '军团级以上（待细分）', parentUnitId: '',
    date: '1935-01-29', timeRange: '白天', action: '行军',
    placeName: '古蔺、叙永方向', lonlat: [105.81, 28.04], coordCertainty: '近似',
    fromPlaceName: '土城 / 猿猴（今元厚）', toPlaceName: '古蔺、叙永方向',
    routeNote: '一渡后西进川南', distanceKm: '',
    engagedWith: '', lossNote: '',
    sourceRef: '网易《一渡：从土城开始的战略转移》', sourceType: '网络', sourceLocator: '待补',
    certainty: '近似',
    conflictNote: '',
    animRef: 'tracks[].segments: 第 5—6 段 march; t0=80, t1=90', eventCardRef: 'card-first-crossing'
  }
];

/* 从 animRef 里取本片动画时段；取不到（时段外）返回 null */
function marchLogRange(rec) {
  const m = /t0=([\d.]+)\s*,\s*t1=([\d.]+)/.exec(rec.animRef || '');
  return m ? { t0: parseFloat(m[1]), t1: parseFloat(m[2]) } : null;
}
