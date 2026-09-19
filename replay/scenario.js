/* 态势时间轴数据 —— 样片：土城受挫 → 一渡赤水
 * 说明：
 *  - 时间轴（t0/t1 等）单位为“动画秒”，总长 90 秒，与史实时间通过 timeMarks 对应。
 *  - certainty: 确定 / 待核，待核项见“史料与存疑”面板。
 *  - 路线为示意（依据主线叙事简化），正式版需按行军日志与史料逐段标定。
 */
const DURATION = 90;

const SCENARIO = {
  meta: {
    title: '四渡赤水 · 态势沙盘',
    sample: '土城受挫 → 一渡赤水',
    crs: 'EPSG:4326（WGS84）'
  },

  places: [
    { id: 'zunyi',        name: '遵义',        type: 'city',   lonlat: [106.93, 27.73], certainty: '确定' },
    { id: 'tongzi',       name: '桐梓',        type: 'city',   lonlat: [106.83, 28.13], certainty: '确定' },
    { id: 'tucheng',      name: '土城',        type: 'city',   lonlat: [106.01, 28.29], certainty: '确定' },
    { id: 'qinggangpo',   name: '青杠坡',      type: 'battle', lonlat: [106.045, 28.285], certainty: '待核' },
    { id: 'hunxikou',     name: '浑溪口',      type: 'ferry',  lonlat: [105.985, 28.300], certainty: '确定' },
    { id: 'yuanhou',      name: '元厚（猿猴）', type: 'ferry',  lonlat: [105.94, 28.40], certainty: '待核' },
    { id: 'gulin',        name: '古蔺',        type: 'city',   lonlat: [105.81, 28.04], certainty: '确定' },
    { id: 'xuyong',       name: '叙永',        type: 'city',   lonlat: [105.44, 28.17], certainty: '确定' },
    { id: 'zhaxi',        name: '扎西（威信）', type: 'city',   lonlat: [105.05, 27.84], certainty: '确定' },
    { id: 'chishuicheng', name: '赤水城',      type: 'city',   lonlat: [105.70, 28.58], certainty: '确定' },
    { id: 'luzhou',       name: '泸州',        type: 'city',   lonlat: [105.44, 28.87], certainty: '确定' },
    { id: 'yibin',        name: '宜宾',        type: 'city',   lonlat: [104.63, 28.77], certainty: '确定' }
  ],

  units: [
    { id: 'r3',      side: 'red',  name: '红三军团',   token: '红三',    seed: 1 },
    { id: 'r5',      side: 'red',  name: '红五军团',   token: '红五',    seed: 2 },
    { id: 'cadre',   side: 'red',  name: '军委干部团', token: '干部团',  seed: 3 },
    { id: 'b_guo',   side: 'blue', name: '川军郭勋祺旅', token: '郭勋祺旅', seed: 4 },
    { id: 'b_pan',   side: 'blue', name: '川军潘佐旅',  token: '潘佐旅',  seed: 5 },
    { id: 'b_jiang', side: 'blue', name: '川军长江江防', token: '长江江防', seed: 6 }
  ],

  tracks: [
    { unitId: 'r3', segments: [
      { t0: 0,  t1: 12, state: 'march',    points: [[106.93,27.73],[106.83,28.13],[106.50,28.22],[106.01,28.29]] },
      { t0: 12, t1: 28, state: 'approach', points: [[106.01,28.29],[106.045,28.285]] },
      { t0: 28, t1: 52, state: 'combat',   points: [[106.045,28.285]] },
      { t0: 52, t1: 66, state: 'move',     points: [[106.045,28.285],[106.01,28.29],[105.995,28.298]] },
      { t0: 66, t1: 80, state: 'cross',    points: [[105.995,28.298],[105.985,28.300],[105.93,28.29]] },
      { t0: 80, t1: 90, state: 'march',    points: [[105.93,28.29],[105.81,28.04]] }
    ]},
    { unitId: 'r5', segments: [
      { t0: 1.5,  t1: 13.5, state: 'march',    points: [[106.93,27.73],[106.83,28.13],[106.50,28.22],[106.01,28.29]] },
      { t0: 13.5, t1: 29,   state: 'approach', points: [[106.01,28.29],[106.075,28.272]] },
      { t0: 29,   t1: 52,   state: 'combat',   points: [[106.075,28.272]] },
      { t0: 52,   t1: 66,   state: 'move',     points: [[106.075,28.272],[106.01,28.29],[106.00,28.293]] },
      { t0: 66,   t1: 82,   state: 'cross',    points: [[106.00,28.293],[105.99,28.295],[105.935,28.285]] },
      { t0: 82,   t1: 90,   state: 'march',    points: [[105.935,28.285],[105.82,28.05]] }
    ]},
    { unitId: 'cadre', segments: [
      { t0: 0,  t1: 26, state: 'march',    points: [[106.93,27.73],[106.83,28.13],[106.50,28.22],[106.02,28.288]] },
      { t0: 26, t1: 34, state: 'assembly', points: [[106.02,28.288]] },
      { t0: 34, t1: 40, state: 'move',     points: [[106.02,28.288],[106.06,28.278]] },
      { t0: 40, t1: 52, state: 'combat',   points: [[106.06,28.278]] },
      { t0: 52, t1: 66, state: 'move',     points: [[106.06,28.278],[106.01,28.29],[105.997,28.295]] },
      { t0: 66, t1: 78, state: 'cross',    points: [[105.997,28.295],[105.988,28.298],[105.94,28.288]] },
      { t0: 78, t1: 90, state: 'march',    points: [[105.94,28.288],[105.83,28.03]] }
    ]},
    { unitId: 'b_guo', segments: [
      { t0: 12, t1: 28, state: 'march',  points: [[106.30,28.42],[106.12,28.32],[106.055,28.293]] },
      { t0: 28, t1: 52, state: 'combat', points: [[106.055,28.293]] },
      { t0: 52, t1: 90, state: 'hold',   points: [[106.055,28.293]] }
    ]},
    { unitId: 'b_pan', segments: [
      { t0: 30, t1: 52, state: 'march', points: [[106.42,28.53],[106.20,28.36],[106.085,28.305]] },
      { t0: 52, t1: 90, state: 'hold',  points: [[106.085,28.305]] }
    ]},
    { unitId: 'b_jiang', segments: [
      { t0: 54, t1: 90, state: 'hold', points: [[105.20,28.83]] }
    ]}
  ],

  events: [
    { t: 26, dur: 8,  pos: [106.045,28.285], kind: 'intel',    label: '情报：当面川军约4个团' },
    { t: 28, dur: 24, pos: [106.045,28.285], kind: 'battle',   label: '1月28日 青杠坡激战竟日' },
    { t: 54, dur: 10, pos: [106.01,28.29],   kind: 'decision', label: '土城会议：放弃北渡，西渡赤水' },
    { t: 66, dur: 16, pos: [105.988,28.298], kind: 'cross',    label: '一渡赤水 · 浑溪口浮桥' },
    { t: 83, dur: 7,  pos: [105.81,28.04],   kind: 'move',     label: '转向川南：古蔺、叙永' }
  ],

  captions: [
    { t0: 0,  t1: 12, text: '1935年1月，遵义会议后：中央红军拟北渡长江，与红四方面军会合' },
    { t0: 12, t1: 28, text: '川军郭勋祺部尾追，红军情报判断：当面川军约4个团' },
    { t0: 28, t1: 52, text: '1月28日 青杠坡：敌实际逾万且增援不断，激战竟日未能奏效' },
    { t0: 52, t1: 66, text: '当晚土城会议：放弃北渡长江的原定计划，西渡赤水' },
    { t0: 66, t1: 82, text: '1月29日 一渡赤水：土城浑溪口架浮桥西渡，约3万人过河' },
    { t0: 82, t1: 90, text: '一渡之后：敌军重兵防江，红军转向川南古蔺、叙永' }
  ],

  camera: [
    { t: 0,  center: [106.55, 27.95], zoom: 8.4,  pitch: 35, bearing: 0 },
    { t: 12, center: [106.35, 28.17], zoom: 9.2,  pitch: 45, bearing: -5 },
    { t: 26, center: [106.05, 28.29], zoom: 10.8, pitch: 52, bearing: -15 },
    { t: 34, center: [106.05, 28.29], zoom: 12.2, pitch: 58, bearing: -25 },
    { t: 52, center: [106.03, 28.29], zoom: 11.6, pitch: 55, bearing: -25 },
    { t: 60, center: [106.01, 28.29], zoom: 12.6, pitch: 58, bearing: -35 },
    { t: 66, center: [105.99, 28.30], zoom: 12.8, pitch: 55, bearing: -40 },
    { t: 78, center: [105.90, 28.24], zoom: 11.2, pitch: 50, bearing: -30 },
    { t: 90, center: [105.70, 28.10], zoom: 9.0,  pitch: 35, bearing: -10 }
  ],

  timeMarks: [
    { t: 0,  label: '1月26日 前' },
    { t: 12, label: '1月26日' },
    { t: 28, label: '1月28日 拂晓' },
    { t: 52, label: '1月28日 深夜' },
    { t: 66, label: '1月29日 凌晨' },
    { t: 82, label: '1月29日 白天' },
    { t: 88, label: '1月29日 后' }
  ],

  sources: [
    '党建网《“土城会议”——拉开四渡赤水的序幕》：土城会议（1935年1月28日）决定放弃北渡长江；参战为红三、红五军团及军委干部团；川军郭勋祺部万余人。',
    '网易《一渡：从土城开始的战略转移》：1935年1月29日凌晨于土城浑溪口一渡赤水；群众献门板架浮桥；约3万人渡河，向古蔺、叙永方向转移。',
    '百科（青杠坡战役）：1935年1月28日，红军与川军郭勋祺部激战；红军伤亡3000余人。',
    '搜狐《土城战役，四渡赤水的前奏》：川军郭勋祺第三旅（约万人）及潘佐旅参战，后续增援不断。'
  ],

  uncertain: [
    '参战部队口径：官方文章记“红三、红五军团及军委干部团”；部分通俗资料记“红一、三、五军团”（红一军团当时在赤水城方向作战）——待纪念馆核对。',
    '情报误判规模：红军判断当面为4个团，实际有6个团、8个团等不同说法——待核。',
    '红军伤亡“3000余人”为单一来源，待复核。',
    '一渡渡口集合：除浑溪口外是否含元厚（猿猴）等渡口、浮桥数量——待核。',
    '本片行军路线、川军来向、长江江防位置均为示意，正式版待史料标定。'
  ]
};
