/* 格子验证件 · 规则引擎（纯逻辑，无 DOM）
 *
 * 目的只有一个：验证「命令 → 结算 → 事件 → 播报」这个循环能不能在一张行军地图上跑通。
 * 因此这里刻意不接真实地图、不标真实经纬度，兵力量化为抽象「兵力当量」，
 * 番号用红1/蓝1 之类的占位符 —— 不对应任何真实部队、不构成战史结论。
 *
 * 对外接口（window.Core）：
 *   resolveTurn(state, orders) -> events[]   一回合的全部结算，state 就地更新
 *   aiOrders(state, side)      -> orders{}   极简 AI 的命令（红蓝共用）
 *   makeState(seed)            -> state
 */
(function (root) {
  'use strict';

  /* ================= 棋盘 =================
   * 12 列 × 9 行，每格约 4 km（示意，未做坐标标定）。
   * 赤水河纵贯第 1 列，只有 2 个渡口可以过河；第 0 列为西岸脱离区。 */
  const COLS = 12, ROWS = 9;
  const MAP = [
    '.R..hhhh....',
    '.R...hhh....',
    '.f..hhph....',
    '.R...hhh....',
    '.R....hh....',
    '.ft.........',
    '.R..........',
    '.R..........',
    '.R..........'
  ];

  const TERRAIN = {
    '.': { key: 'plain', name: '平地', cost: 1, def: 0 },
    'h': { key: 'hill', name: '山地', cost: 2, def: 2 },
    'p': { key: 'pass', name: '隘口', cost: 2, def: 3 },
    't': { key: 'town', name: '城镇', cost: 1, def: 3 },
    'f': { key: 'ford', name: '渡口', cost: 3, def: 1 },
    'R': { key: 'river', name: '赤水河', cost: Infinity, def: 0 }
  };

  /* 行军速度不由地形符号决定，由真实坡度决定（core/terrain-cost.js，Copernicus GLO-90 DEM）。
     上表里的 cost 只剩两个用处：赤水河的 Infinity 是硬约束，其余是没加载 DEM 表时的兜底。
     下面两条是作战分区对物理代价的规则性修正 —— 符号说得比坡度更多的那部分：
     渡口是过河的唯一孔道，必定拥堵，慢于按坡度算的值；隘口同理（窄，重武器展不开）；
     城镇有街巷与道路，按平地计，不因为城边陡就慢。 */
  const COST_FLOOR = { ford: 3, pass: 2 };
  const COST_CAP = { town: 1 };

  function moveCost(p) {
    const t = terrainAt(p);
    if (!t || t.cost === Infinity) return Infinity;
    const dem = root.TerrainCost;   // 现取，避免脚本顺序变成隐含依赖
    let c = dem ? dem.costAt(p.col, p.row) : t.cost;
    if (COST_FLOOR[t.key] !== undefined) c = Math.max(c, COST_FLOOR[t.key]);
    if (COST_CAP[t.key] !== undefined) c = Math.min(c, COST_CAP[t.key]);
    return c;
  }

  /* 地名（示意方位，非精确地理）。
     前五处是标定过的要点；后四处镇名取自 OSM Overpass 实测节点（2026-09-18，bbox 内的 place 节点）——
     真实镇名，落格按 core/grid-geo.js 的标定换算，坐标只当示意方位用。 */
  const PLACES = {
    '1,2': '元厚渡口', '1,5': '土城渡口', '2,5': '土城',
    '6,2': '青杠坡隘口', '4,3': '青杠坡',
    '4,7': '隆兴镇', '6,8': '回龙镇', '8,2': '程寨镇', '10,1': '三岔河镇'
  };

  /* 无名格点不报坐标，报「离哪个地方多远」—— 坐标是给机器看的，方位是给人看的。
     锚点取最近的棋盘点位（曼哈顿距离，并列取先列出的）；这是格网空间的相对说法，不是真实方位。 */
  function relName(col, row) {
    let best = null, bestD = Infinity;
    for (const k in PLACES) {
      const p = k.split(','), d = Math.abs(+p[0] - col) + Math.abs(+p[1] - row);
      if (d < bestD) { bestD = d; best = [+p[0], +p[1], PLACES[k]]; }
    }
    const dc = col - best[0], dr = row - best[1];    // 行号向南增大
    const ew = { w: dc > 0 ? '东' : '西', n: Math.abs(dc) };
    const ns = { w: dr > 0 ? '南' : '北', n: Math.abs(dr) };
    if (dc === 0) return best[2] + '以' + ns.w + ' ' + ns.n + ' 格';
    if (dr === 0) return best[2] + '以' + ew.w + ' ' + ew.n + ' 格';
    const two = (a, b) => best[2] + '以' + a.w + ' ' + a.n + ' 格、以' + b.w + ' ' + b.n + ' 格';
    return Math.abs(dc) >= Math.abs(dr) ? two(ew, ns) : two(ns, ew);
  }
  function placeName(col, row) {
    if (col === 0) return '西岸';
    return PLACES[col + ',' + row] || relName(col, row);
  }

  /* ================= 规则常量 ================= */
  const TURNS_MAX = 8;        // 超过这个回合数红方未达成即判负（8 回合 × 2 小时 = 一天）
  const EXIT_NEED = 2;        // 红方需要渡河脱离的单位数
  const MP = 3;               // 每回合移动力
  const START_STR = 6;        // 兵力当量
  const START_MORALE = 7;     // 士气
  const DETECT_BASE = 3;      // 基础侦察半径（曼哈顿距离）
  const CLOCK_START = 4 * 60; // 04:00 起算，每回合 2 小时（刻度为抽象）

  /* 战斗结算表：行 = 1d6，列 = 攻守有效兵力比 */
  const CRT_COLS = ['1:2', '1:1', '2:1', '3:1', '4:1'];
  const CRT = [
    ['A2', 'A1', 'A1', 'E', 'E'],
    ['A2', 'A1', 'E', 'E', 'D1'],
    ['A1', 'E', 'E', 'D1', 'D1'],
    ['A1', 'E', 'D1', 'D1', 'D2'],
    ['E', 'D1', 'D1', 'D2', 'D2'],
    ['E', 'D1', 'D2', 'D2', 'X']
  ];
  const RESULTS = {
    A2: { label: '攻方重挫', atkLoss: 2, defLoss: 0, atkMorale: -2, defMorale: 0, atkBack: 1, defBack: 0 },
    A1: { label: '攻方受挫', atkLoss: 1, defLoss: 0, atkMorale: -1, defMorale: 0, atkBack: 0, defBack: 0 },
    E: { label: '对峙消耗', atkLoss: 1, defLoss: 1, atkMorale: 0, defMorale: 0, atkBack: 0, defBack: 0 },
    D1: { label: '守方动摇', atkLoss: 0, defLoss: 1, atkMorale: 1, defMorale: -1, atkBack: 0, defBack: 1 },
    D2: { label: '守方溃退', atkLoss: 0, defLoss: 2, atkMorale: 1, defMorale: -2, atkBack: 0, defBack: 2 },
    X: { label: '守方被歼', atkLoss: 1, defLoss: 3, atkMorale: 2, defMorale: -3, atkBack: 0, defBack: 2 }
  };

  /* ================= 基础工具 ================= */
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const key = p => p.row * COLS + p.col;
  const inBounds = (col, row) => col >= 0 && col < COLS && row >= 0 && row < ROWS;
  function cellAt(p) { return inBounds(p.col, p.row) ? MAP[p.row][p.col] : null; }
  function terrainAt(p) { const ch = cellAt(p); return ch ? TERRAIN[ch] : null; }
  function passable(p) { const t = terrainAt(p); return !!t && t.cost !== Infinity; }
  function manhattan(a, b) { return Math.abs(a.col - b.col) + Math.abs(a.row - b.row); }
  function neighbors(p) {
    return [{ col: p.col + 1, row: p.row }, { col: p.col - 1, row: p.row },
            { col: p.col, row: p.row + 1 }, { col: p.col, row: p.row - 1 }]
      .filter(q => inBounds(q.col, q.row));
  }
  function clockStr(min) {
    const h = Math.floor(min / 60) % 24, m = min % 60;
    return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
  }

  /* ================= 状态构造 ================= */
  const ROSTER = [
    { id: 'R1', side: 'red', name: '红1', col: 3, row: 3 },   // 青杠坡一线集结：到两处渡口各约一两回合
    { id: 'R2', side: 'red', name: '红2', col: 3, row: 4 },
    { id: 'R3', side: 'red', name: '红3', col: 4, row: 4 },
    { id: 'B1', side: 'blue', name: '蓝1', col: 2, row: 5 },   // 南渡口（土城）守备：城镇工事硬，一个人就站得住
    { id: 'B2', side: 'blue', name: '蓝2', col: 2, row: 2 },   // 北渡口守备：开局就封住口子，红军要过河先得夺口
    { id: 'B3', side: 'blue', name: '蓝3', col: 3, row: 2 }    // 北渡口侧后（元厚以东 2 格）：北口的二线，也是全军预备队 —— 硬打北口它是第二层；被诱饵调走，北口就只剩一个人
  ];
  const RED_GOALS = [{ col: 1, row: 5 }, { col: 1, row: 2 }];

  function makeState(seed) {
    return {
      seed: seed,
      rng: mulberry32(seed),
      turn: 1,
      clockMin: CLOCK_START,
      units: ROSTER.map(r => ({
        id: r.id, side: r.side, name: r.name, col: r.col, row: r.row,
        str: START_STR, morale: START_MORALE, fatigue: 0,
        exited: false, dead: false, movedCells: 0
      })),
      /* 单盲情报：每方各自看到什么 */
      visible: { red: {}, blue: {} },
      known: { red: {}, blue: {} },   // 最后已知位置 {id:{col,row,turn}}
      post: {},                       // 蓝方守备分派（单位 id → 口序号），每回合续任用
      reserveMarch: {},               // 预备队在途任务（单位 id → 口序号）：受命走到底，到了再重新判断
      redTarget: null,                // 红方锁定的目标渡口（下标），带迟滞，不每回合摇摆
      exited: { red: 0, blue: 0 },
      log: [],
      lastCombat: null,
      winner: null
    };
  }

  const alive = (state, side) => state.units.filter(u =>
    !u.exited && !u.dead && (side ? u.side === side : true));
  function unitAt(state, col, row) {
    return alive(state).find(u => u.col === col && u.row === row) || null;
  }
  function occupied(state, p, except) {
    return alive(state).some(u => u !== except && u.col === p.col && u.row === p.row);
  }
  function visibleFoes(state, side, from) {
    const out = [];
    for (const f of alive(state, side === 'red' ? 'blue' : 'red')) {
      if (!state.visible[side][f.id]) continue;
      if (!from || manhattan(from, f) <= detectRange(from)) out.push(f);
    }
    return out;
  }
  function detectRange(u) {
    const t = terrainAt(u);
    let r = DETECT_BASE + (t && t.key !== 'plain' ? 1 : 0);
    if (u.order && u.order.type === 'recon') r += 2;
    return r;
  }

  /* ================= 寻路（Dijkstra，四邻） ================= */
  function findPath(state, from, to, unit, ignoreUnits) {
    if (!passable(to) || (!ignoreUnits && occupied(state, to, unit))) return null;
    if (from.col === to.col && from.row === to.row) return null;
    const dist = new Map(), prev = new Map(), done = new Set();
    const open = [{ col: from.col, row: from.row, d: 0 }];
    dist.set(key(from), 0);
    while (open.length) {
      open.sort((a, b) => a.d - b.d);
      const cur = open.shift(), ck = key(cur);
      if (done.has(ck)) continue;
      done.add(ck);
      if (cur.col === to.col && cur.row === to.row) break;
      for (const nb of neighbors(cur)) {
        if (!passable(nb)) continue;
        const isTarget = nb.col === to.col && nb.row === to.row;
        /* 第 0 列（西岸脱离区）只能当终点：踩上去就离场，
           不许拿它当「去东岸另一格」的过路走廊 —— 否则渡口东岸一被堵，
           路线会从天而降地从另一个渡口绕到西岸再折回来 */
        if (!isTarget && (nb.col === 0 || (!ignoreUnits && occupied(state, nb, unit)))) continue;
        const nd = cur.d + moveCost(nb), nk = key(nb);
        if (!dist.has(nk) || nd < dist.get(nk)) {
          dist.set(nk, nd); prev.set(nk, ck);
          open.push({ col: nb.col, row: nb.row, d: nd });
        }
      }
    }
    if (!dist.has(key(to))) return null;
    const path = [];
    let ck = key(to);
    while (ck !== undefined && ck !== key(from)) {
      path.unshift({ col: ck % COLS, row: Math.floor(ck / COLS) });
      ck = prev.get(ck);
    }
    path.unshift({ col: from.col, row: from.row });
    return path;
  }

  /* 「到不了」到底是谁挡的：拿一条只算地形代价、不算占位的路线走一遍，线上的每个占位单位
     再单独「挪开」试一次寻路 —— 挪开这一个就通了，它才是真堵点；换条道就绕过去的不算
     （渡口东岸只有一条接近路，所以通常就那一个人）。
     返回 null = 不是单位挡的（纯地形隔断，比如赤水河） */
  function routeBlockers(state, u, to) {
    const from = { col: u.col, row: u.row };
    const path = findPath(state, from, to, u, true);
    if (!path) return null;
    const onRoute = [];
    for (let i = 1; i < path.length; i++) {
      const b = unitAt(state, path[i].col, path[i].row);
      if (b) onRoute.push({ col: path[i].col, row: path[i].row, unit: b });
    }
    if (!onRoute.length) return null;
    const choke = onRoute.filter(c => {
      c.unit.dead = true;
      const open = findPath(state, from, to, u);
      c.unit.dead = false;
      return !!open;
    });
    /* choke 为空 = 两处关口前后卡着，单挪一个都不够 —— 那也是单位挡的，不能赖地形 */
    return choke.length ? choke : onRoute;
  }

  /* ================= 回合结算 ================= */
  /* data 是给机器读的结构化载荷（unitId / action / from / to / foeId …），
     地图回放靠它把事件落到经纬度上；text 仍是给人读的播报。 */
  function log(state, kind, side, text, data) {
    state.log.push({
      turn: state.turn, clock: clockStr(state.clockMin), kind: kind, side: side,
      text: text, data: data || null
    });
  }

  /* 下单时算好的路线能不能原样走：返回 null 表示能走，否则返回「为什么不能」的人话。
     planned 是 planMove().path（不含出发格）—— 玩家看到的金线就是它。
     只查「本回合真走得动的那一段」（虚线之后的格子今天够不着，明天再算）：
     把整条路线从头查到尾，会为三天后的一个占位把今天的行军整个取消 */
  function plannedIssue(state, u, planned) {
    let prev = { col: u.col, row: u.row }, mp = MP;
    for (let i = 0; i < planned.length; i++) {
      const p = planned[i];
      if (manhattan(prev, p) !== 1 || !passable(p)) return '原定路线已失效';
      if (moveCost(p) > mp) return null;      // 这一步今天走不到：后面堵不堵，明天再说
      if (occupied(state, p, u)) {
        const b = unitAt(state, p.col, p.row);
        return '原定路线第 ' + (i + 1) + ' 格（' + placeName(p.col, p.row) + '）被' + (b ? b.name : '单位') + '占住';
      }
      mp -= moveCost(p);
      prev = p;
    }
    return null;
  }

  /* 行军令的执行。planned（可选）= 下单时画给玩家的路线：
     还完整可走就照着走 —— 金线即路线；中途被占就说明原因再重算一条，实在没有就原地待命。
     偏离原定路线这件事必须写进播报：沉默的偏离正是玩家报的「不按我设计的路线走」 */
  function moveAlong(state, u, to, events, planned) {
    const from = { col: u.col, row: u.row };
    let path = null, issue = null;
    if (planned && planned.length) {
      issue = plannedIssue(state, u, planned);
      if (!issue) path = [{ col: u.col, row: u.row }].concat(planned);
    }
    if (!path) {
      const alt = findPath(state, u, to, u);
      if (issue) {
        if (alt && alt.length > 1) {
          log(state, 'order', u.side, u.name + ' 改道：' + issue + '，改经 ' + placeName(alt[1].col, alt[1].row) + ' 继续向 ' + placeName(to.col, to.row) + ' 机动',
            { unitId: u.id, action: '改道', blocked: issue, from: from, to: { col: to.col, row: to.row } });
          path = alt;
        } else {
          log(state, 'order', u.side, u.name + ' 未能向 ' + placeName(to.col, to.row) + ' 机动（' + issue + '，无替代通路），原地待命',
            { unitId: u.id, action: '待命', blocked: issue, from: from, to: { col: to.col, row: to.row } });
          return null;
        }
      } else {
        if (!alt || alt.length < 2) {
          if (u.col === to.col && u.row === to.row) return null;   // 已在目标格，不必报
          let why = '无可用通路';
          if (!passable(to)) why = '目标格不可通行';
          else if (occupied(state, to, u)) why = '目标格已被占用';
          log(state, 'order', u.side, u.name + ' 未能向 ' + placeName(to.col, to.row) + ' 机动（' + why + '），原地待命',
            { unitId: u.id, action: '待命', blocked: why, from: from, to: { col: to.col, row: to.row } });
          return null;
        }
        path = alt;
      }
    }
    let mp = MP, prevPlace = placeName(u.col, u.row), contacts = null;
    for (let i = 1; i < path.length; i++) {
      const nx = path[i], cost = moveCost(nx);
      if (cost > mp) break;
      const blocker = unitAt(state, nx.col, nx.row);
      if (blocker && blocker.side !== u.side) {
        u.col = nx.col; u.row = nx.row; u.movedCells++;
        contacts = { a: u, d: blocker, why: '迎面接触' };
        log(state, 'contact', u.side, u.name + ' 在 ' + placeName(nx.col, nx.row) + ' 与 ' + blocker.name + ' 迎面接触',
          { unitId: u.id, action: '行军', from: from, to: { col: nx.col, row: nx.row }, foeId: blocker.id });
        break;
      }
      if (blocker) break;
      u.col = nx.col; u.row = nx.row; mp -= cost; u.movedCells++;
      if (u.col === 0) break;
    }
    if (u.col === 0) {
      u.exited = true; state.exited[u.side]++;
      log(state, 'exit', u.side, u.name + ' 由 ' + prevPlace + ' 渡过赤水河，脱离棋盘（累计 ' + state.exited[u.side] + ' 个单位）',
        { unitId: u.id, action: '渡河', from: from, to: { col: 0, row: u.row } });
    } else if (!contacts) {
      log(state, 'move', u.side, u.name + ' 由 ' + prevPlace + ' 机动至 ' + placeName(u.col, u.row) + '，本回合行进 ' + u.movedCells + ' 格',
        { unitId: u.id, action: '行军', from: from, to: { col: u.col, row: u.row }, cells: u.movedCells });
    }
    return contacts;
  }

  /* 行军预告（只读）：与 moveAlong 同一套代价规则，回答「本回合能走几格、还要几回合到」。
     代价（真实坡度 / 渡口硬约束）本来就在算，但不写出来玩家只能靠猜 —— 看不见的代价等于不存在。
     不改任何状态；目标格被占用或隔断时返回 null */
  function planMove(state, u, to) {
    const path = findPath(state, u, to, u);
    if (!path || path.length < 2) return null;
    let total = 0;
    for (let i = 1; i < path.length; i++) total += moveCost(path[i]);
    /* 到达回合数按 moveAlong 的算法数：每回合 MP 重新给满、结余不跨回合，
       走不动就整等一回合。不能用 ceil(总代价 / MP) —— 除不尽时会少说一回合，
       玩家照着预告安排计划，结果晚到一天 */
    let mp = MP, thisTurn = 0, turns = 1;
    for (let i = 1; i < path.length; i++) {
      const cost = moveCost(path[i]);
      if (cost > mp) { turns++; mp = MP; }
      mp -= cost;
      if (turns === 1) thisTurn++;
    }
    return {
      path: path.slice(1), cells: path.length - 1, total: total, thisTurn: thisTurn,
      turns: turns
    };
  }

  /* 可达范围（只读）：从现在起 N 小时（每回合 2 小时 × 每回合机动点）在地形上能走到哪，
     返回 Map<row*COLS+col, 累计代价>。只看地形与代价，不看友邻敌军占位 ——
     这是「时间-距离」的账，不是行军计划 */
  function reachable(state, u, budget) {
    const dist = new Map(); dist.set(key(u), 0);
    const open = [{ col: u.col, row: u.row, d: 0 }];
    const done = new Set();
    while (open.length) {
      open.sort((a, b) => a.d - b.d);
      const cur = open.shift(), ck = key(cur);
      if (done.has(ck)) continue;
      done.add(ck);
      if (cur.col === 0) continue;        // 西岸是终点：踩上去就离场，不能从那里继续扩张
      for (const nb of neighbors(cur)) {
        if (!passable(nb)) continue;
        const nd = cur.d + moveCost(nb);
        if (nd > budget) continue;
        const nk = key(nb);
        if (!dist.has(nk) || nd < dist.get(nk)) {
          dist.set(nk, nd);
          open.push({ col: nb.col, row: nb.row, d: nd });
        }
      }
    }
    dist.delete(key(u));
    return dist;
  }

  function stepBack(state, u, fromCell, steps, events) {
    const start = { col: u.col, row: u.row };
    for (let s = 0; s < steps; s++) {
      /* 退却不能退进西岸脱离区：溃退不是渡河 */
      const cands = neighbors(u).filter(p => p.col > 0 && passable(p) && !occupied(state, p, u));
      if (!cands.length) {
        u.str -= 1;
        log(state, 'loss', u.side, u.name + ' 无路可退，额外损失 1 点兵力当量',
          { unitId: u.id, action: '损失', delta: -1 });
        break;
      }
      cands.sort((a, b) => (manhattan(b, fromCell) - manhattan(a, fromCell)) || (moveCost(a) - moveCost(b)));
      u.col = cands[0].col; u.row = cands[0].row;
      if (u.col === 0) break;
    }
    if (u.col === 0) {
      u.exited = true; state.exited[u.side]++;
      log(state, 'exit', u.side, u.name + ' 退向西岸，渡过赤水河脱离棋盘（累计 ' + state.exited[u.side] + ' 个单位）',
        { unitId: u.id, action: '渡河', retreat: true, from: start, to: { col: 0, row: u.row } });
    }
  }

  function effStrength(u) {
    return u.str * (0.55 + 0.045 * u.morale) * (1 - 0.06 * u.fatigue);
  }

  function engage(state, atk, def, why, events) {
    const terrain = terrainAt(def) || TERRAIN['.'];
    const effA = effStrength(atk), effD = effStrength(def) * (1 + terrain.def * 0.12);
    const ratio = effA / effD;
    const col = ratio < 0.75 ? 0 : ratio < 1.5 ? 1 : ratio < 2.5 ? 2 : ratio < 3.5 ? 3 : 4;
    const roll = 1 + Math.floor(state.rng() * 6);
    const code = CRT[roll - 1][col], R = RESULTS[code];
    state.lastCombat = { code: code, roll: roll, col: col, atk: atk.name, def: def.name, ratio: ratio };

    log(state, 'combat', atk.side,
      atk.name + ' 攻击 ' + def.name + '（' + placeName(def.col, def.row) + ' · ' + terrain.name + '，' +
      why + '）：有效兵力 ' + effA.toFixed(1) + ' : ' + effD.toFixed(1) + ' ≈ ' + CRT_COLS[col] +
      '，骰 ' + roll + ' → ' + code + ' ' + R.label,
      { unitId: atk.id, foeId: def.id, action: '战斗', why: why, at: { col: def.col, row: def.row }, roll: roll, code: code, ratio: ratio });

    atk.str -= R.atkLoss; def.str -= R.defLoss;
    atk.morale = Math.max(1, Math.min(10, atk.morale + R.atkMorale));
    def.morale = Math.max(1, Math.min(10, def.morale + R.defMorale));
    if (R.atkLoss) log(state, 'loss', atk.side, atk.name + ' 损失 ' + R.atkLoss + ' 点兵力当量（余 ' + Math.max(0, atk.str) + '）',
      { unitId: atk.id, action: '损失', delta: -R.atkLoss, by: def.id });
    if (R.defLoss) log(state, 'loss', def.side, def.name + ' 损失 ' + R.defLoss + ' 点兵力当量（余 ' + Math.max(0, def.str) + '）',
      { unitId: def.id, action: '损失', delta: -R.defLoss, by: atk.id });
    if (R.atkBack) stepBack(state, atk, def, R.atkBack, events);
    if (R.defBack && !def.exited && !def.dead) stepBack(state, def, atk, R.defBack, events);
    if (def.str <= 0 && !def.dead && !def.exited) {
      def.dead = true;
      log(state, 'loss', def.side, def.name + ' 兵力当量归零，退出棋盘',
        { unitId: def.id, action: '覆灭' });
    }
    if (atk.str <= 0 && !atk.dead && !atk.exited) {
      atk.dead = true;
      log(state, 'loss', atk.side, atk.name + ' 兵力当量归零，退出棋盘',
        { unitId: atk.id, action: '覆灭' });
    }
  }

  function resolveTurn(state, orders) {
    if (state.winner) return [];
    orders = orders || {};
    const events = [];
    const all = alive(state);
    for (const u of all) {
      u.order = orders[u.id] || { type: 'hold' };
      u.movedCells = 0;
    }

    /* 1. 机动：红方先、蓝方后（这是本件的已知简化，不是真正的同步解算） */
    const contacts = [];
    const sequence = alive(state, 'red').concat(alive(state, 'blue'));
    for (const u of sequence) {
      if (u.exited || u.dead) continue;
      if (u.order.type === 'move') {
        /* order.plan 是下单时算给玩家看的那条路线（有就照着走，没有才现算） */
        const hit = moveAlong(state, u, u.order.to, events, u.order.plan && u.order.plan.path);
        if (hit) contacts.push(hit);
      } else if (u.order.type === 'withdraw') {
        const foe = visibleFoes(state, u.side, u)[0];
        if (foe) stepBack(state, u, foe, 1, events);
        else log(state, 'order', u.side, u.name + ' 未发现敌军，脱离命令落空',
          { unitId: u.id, action: '待命', blocked: '未发现敌军' });
      } else if (u.order.type === 'hold') {
        log(state, 'order', u.side, u.name + ' 于 ' + placeName(u.col, u.row) + ' 固守',
          { unitId: u.id, action: '待命', at: { col: u.col, row: u.row } });
      } else if (u.order.type === 'recon') {
        log(state, 'order', u.side, u.name + ' 于 ' + placeName(u.col, u.row) + ' 展开侦察',
          { unitId: u.id, action: '侦察', at: { col: u.col, row: u.row } });
      }
    }

    /* 2. 交战：同格撞击 + 相邻且下达攻击命令者 */
    const pairs = contacts.slice();
    for (const atk of alive(state)) {
      if (atk.order.type !== 'attack') continue;
      const foe = visibleFoes(state, atk.side, atk).filter(f => manhattan(atk, f) === 1)[0];
      if (foe) pairs.push({ a: atk, d: foe, why: '相邻攻击' });
      else log(state, 'order', atk.side, atk.name + ' 下达攻击命令但相邻无敌军，转为固守',
        { unitId: atk.id, action: '待命', blocked: '相邻无敌军' });
    }
    const seen = new Set();
    for (const p of pairs) {
      if (p.a.dead || p.d.dead || p.a.exited || p.d.exited) continue;
      const sig = [p.a.id, p.d.id].sort().join('>');
      if (seen.has(sig)) continue;
      seen.add(sig);
      engage(state, p.a, p.d, p.why, events);
    }

    /* 3. 疲劳：动过的加、没动的减 */
    for (const u of alive(state)) {
      u.fatigue = Math.max(0, Math.min(5, u.fatigue + (u.movedCells > 0 ? 1 : -1)));
    }

    /* 4. 侦察：单盲情报只在这里更新 */
    updateIntel(state);

    /* 5. 胜负。口径：任务线是「主力过河」= 2 个（EXIT_NEED），全队 3 个。
       播报里的分母一律写全队总数（2/3），不写 2/2 —— 免得读起来像「全队只有 2 个、
       1 个都没落下」。打过 3/3 的局照实报 3/3。 */
    const redTotal = state.units.filter(u => u.side === 'red').length;
    if (state.exited.red >= EXIT_NEED) {
      state.winner = 'red';
      log(state, 'end', 'red', '红方已有 ' + state.exited.red + '/' + redTotal + ' 个单位渡河脱离' +
        (state.exited.red >= redTotal ? ' —— 全队过河，一个不少' : ' —— 主力过河，红方达成目标'));
    } else if (state.turn >= TURNS_MAX) {
      state.winner = 'blue';
      log(state, 'end', 'blue', TURNS_MAX + ' 个回合内红方仅 ' + state.exited.red + '/' + redTotal +
        ' 个单位渡河（需 ' + EXIT_NEED + ' 个主力）—— 蓝方达成目标');
    } else {
      log(state, 'turn', null, '—— 第 ' + state.turn + ' 回合结束｜红方已渡河 ' + state.exited.red + '/' + redTotal + '｜蓝方已渡河 ' + state.exited.blue + ' ——');
    }

    state.turn++;
    state.clockMin += 120;
    for (const u of state.units) u.order = null;
    return events;
  }

  function updateIntel(state) {
    for (const side of ['red', 'blue']) {
      const foeSide = side === 'red' ? 'blue' : 'red';
      const own = alive(state, side);
      const foes = alive(state, foeSide);
      for (const f of foes) {
        let seen = false;
        for (const o of own) { if (manhattan(o, f) <= detectRange(o)) { seen = true; break; } }
        const was = !!state.visible[side][f.id];
        state.visible[side][f.id] = seen;
        if (seen) {
          const old = state.known[side][f.id];
          /* from = 上一次接触时它在哪：两点定一个动向（往哪个方向去了）。
             只给方向不给速度 —— 两次接触之间它走了几格，你没看见，就不该知道 */
          state.known[side][f.id] = {
            col: f.col, row: f.row, turn: state.turn,
            from: old ? { col: old.col, row: old.row, turn: old.turn } : null
          };
          if (!was) log(state, 'intel', side, (side === 'red' ? '红军' : '蓝军') + ' 发现 ' + f.name + ' —— ' + placeName(f.col, f.row));
        } else if (was) {
          log(state, 'intel', side, f.name + ' 失去接触，转入「最后已知位置」判定');
        }
      }
      /* 覆灭或渡河离场的单位不再有「看得见 / 看不见」这回事：留着它的记录，
         棋盘上会多出一个永不消失的「你见过」标记（回放里给已经打死的棋子打星），
         「最后一次接触」的序列也会被它拖住不动 —— 情报档案只跟还在棋盘上的单位走 */
      const onBoard = new Set(foes.map(f => f.id));
      for (const id in state.visible[side]) if (!onBoard.has(id)) { delete state.visible[side][id]; delete state.known[side][id]; }
    }
  }

  /* ================= 极简 AI（红蓝共用，供自动推演与对手方使用） ================= */
  /* 目标格若被占（友军或敌军），退而求其次走到它旁边 —— 否则会一直往同一格撞墙 */
  function approach(state, u, target) {
    if (u.col === target.col && u.row === target.row) return { type: 'hold' };
    if (passable(target) && !occupied(state, target, u)) return { type: 'move', to: target };
    const alts = neighbors(target)
      .filter(p => passable(p) && !occupied(state, p, u) && !(p.col === u.col && p.row === u.row))
      .sort((a, b) => manhattan(u, a) - manhattan(u, b));
    /* 邻格里挑一个「真能走到」的：渡口只有一格东岸接近路，被占时它的邻格（西岸、对岸）
       都是死路 —— 不试走一遍就会派人去一个到不了的格子，然后原地待命到天荒地老 */
    for (const a of alts) if (findPath(state, u, a, u)) return { type: 'move', to: a };
    return { type: 'hold' };
  }

  /* 到某格还要几个回合（忽略占位：算的是路，不是谁站得上去）—— 挑目标时用来比远近。
     用整除式的 ceil(总代价/MP) 会少说一回合，这里与 planMove/moveAlong 一样逐格数。
     已经在目标格上是 0 回合，不是「到不了」—— findPath(A→A) 返回 null，
     不特判的话「站在口上的人」会被算成最远的，诱饵就会把守口的人调走（实测踩过一次） */
  function travelTurns(state, u, to) {
    if (u.col === to.col && u.row === to.row) return 0;
    const path = findPath(state, { col: u.col, row: u.row }, to, u, true);
    if (!path) return 99;
    let mp = MP, turns = 1;
    for (let i = 1; i < path.length; i++) {
      const c = moveCost(path[i]);
      if (c > mp) { turns++; mp = MP; }
      mp -= c;
    }
    return turns;
  }

  /* 军级情报：这一方现在「知道」的敌军在哪。目视接触优先，失去接触的按 3 回合内的
     最后已知位置算 —— 两边的决心都建立在这份名单上，谁都没有上帝视角。 */
  function intelPositions(state, side) {
    const out = [];
    for (const f of alive(state, side === 'red' ? 'blue' : 'red')) {
      if (state.visible[side][f.id]) out.push({ col: f.col, row: f.row, unit: f, live: true });
      else {
        const k = state.known[side][f.id];
        if (k && state.turn - k.turn <= 3) out.push({ col: k.col, row: k.row, unit: f, live: false });
      }
    }
    return out;
  }

  /* ================= 红方学说：主队 + 诱饵 =================
   * 任务只要 2 个单位过河，第 3 个就是现成的诱饵：明着朝另一处渡口去，把蓝方的预备队
   * 钉在错的方向上；主队（其余各员）再打防守弱的那一处。
   * 目标渡口按「阻力分」挑：行军回合数 + 2×守备人数 + 1.5×地形防御。
   * 地形防御按 1.5 倍计（城镇 = 多算两个守备）：城镇口子兵力比不到 1:1.5 时战斗表里
   * 根本没有「守方后退」这一档，用人数是推不开的 —— 实测权重取 0.5 时红方偶尔会被
   * 增援吓到去打土城，24 局里 4 局全输；取 1.5 后不再发生。
   * 决心不轻易改 —— 换一处要重走两三个回合，来回摇摆等于两头都到不了，所以要差出 1.5 分才换。 */
  function redScore(state, i) {
    let march = 99;
    for (const u of alive(state, 'red')) march = Math.min(march, travelTurns(state, u, GATES[i]));
    let guards = 0;
    for (const p of intelPositions(state, 'red')) {
      if (manhattan(p, GATES[i]) <= 2) guards++;
    }
    return march + 2 * guards + 1.5 * (terrainAt(GATES[i]) || { def: 0 }).def;
  }

  function redOrders(state) {
    const units = alive(state, 'red');
    const orders = {};
    if (!units.length) return orders;
    const score = [redScore(state, 0), redScore(state, 1)];
    const best = score[0] <= score[1] ? 0 : 1;
    let t = state.redTarget;
    if (t === null || t === undefined || score[t] > score[best] + 1.5) t = best;
    state.redTarget = t;
    const other = 1 - t;
    /* 诱饵挑「离目标渡口最远的那一员」= 主攻用不上、离另一处最近的人 —— 它到得最快、
       也最快被蓝军看见。只剩两员时没有诱饵，只能硬打，这也正是伤亡之后会变难的原因。 */
    let decoy = null;
    if (units.length >= 3) {
      decoy = units.slice().sort((a, b) =>
        (travelTurns(state, b, GATES[t]) - travelTurns(state, a, GATES[t])) ||
        (a.id < b.id ? -1 : 1))[0];
    }
    for (const u of units) {
      if (u === decoy) {
        /* 诱饵只摆样子不开火：打起来它先垮，而它这一趟的活是「被看见」 */
        orders[u.id] = approach(state, u, GATES[other]);
        continue;
      }
      const gate = GATES[t], ford = FORDS[t].ford;
      const foes = visibleFoes(state, 'red', u);
      const onFord = u.col === ford.col && u.row === ford.row;
      const onGate = u.col === gate.col && u.row === gate.row;
      /* 已经下水：向对岸脱离 —— 渡口只容一个单位，下水的不走，后面的人过不去 */
      if (onFord) { orders[u.id] = { type: 'move', to: { col: 0, row: ford.row } }; continue; }
      /* 渡口本身被占：只有打退它才能下水 */
      const fordFoe = foes.find(f => f.col === ford.col && f.row === ford.row);
      if (fordFoe && manhattan(u, fordFoe) === 1) { orders[u.id] = { type: 'attack' }; continue; }
      /* 已经站在口子上就过河 —— 跟旁边一格上的守军对耗，等于把过河的窗口一天天耗掉；
         争夺口子是「还没站上去」时才做的事 */
      if (onGate) { orders[u.id] = { type: 'move', to: ford }; continue; }
      /* 口子被敌军占着：必须把它打下来（相邻就打，不相邻就压上去） */
      const gateFoe = foes.find(f => f.col === gate.col && f.row === gate.row);
      if (gateFoe) {
        orders[u.id] = manhattan(u, gateFoe) === 1
          ? { type: 'attack' } : approach(state, u, gate);
        continue;
      }
      /* 口子被自家先头占着：照旧往口子上排 —— 命令是同时下的，先头这一回合就可能让开，
         执行到自己的时候再判一次，让开就补进去；提前改道去绕，反而谁都到不了口上 */
      const gateUnit = unitAt(state, gate.col, gate.row);
      if (gateUnit && gateUnit.side === 'red') { orders[u.id] = { type: 'move', to: gate }; continue; }
      orders[u.id] = approach(state, u, gate);
    }
    return orders;
  }

  function aiOrders(state, side) {
    return side === 'blue' ? blueOrders(state) : redOrders(state);
  }

  /* ================= 蓝方学说：守口 + 预备队 =================
   * 地形事实（由棋盘推出来，不写死格子）：赤水河只有两处渡口，每处只有一格东岸接近路。
   * 守住那两格，红军就过不了河 —— 所以守备分派每回合按「谁离得近谁去」重算，不认单位番号。
   * 多出来的那一个人是预备队：按军级情报往「红军更靠近的那处渡口」补，没人靠近就回两渡口
   * 之间的中位待机 —— 预备队跑远了就不是预备队了。
   * 命令与行军都要时间：预备队一旦被诱饵调开，折回来就是两三个回合的事 —— 这正是佯动值钱的地方。
   * 蓝方没有上帝视角（只用 visible / known 与地形），这是「活的对手」要付的代价。
   * 守口的人不追远敌：只在敌人贴脸时才打 —— 离开口子去追，口子就空了。 */
  const STANDBY = { col: 4, row: 3 };   // 预备队待机位：两渡口之间的中位（青杠坡一带）

  /* 渡口与它的东岸接近格（本图上每处渡口只有一格可通行的东岸邻格，即过河的必经孔道）——
     守备要站的是它，预备队要补的也是它。 */
  const FORDS = RED_GOALS.map(ford => ({
    ford: ford,
    gate: neighbors(ford).filter(p => p.col > 0 && passable(p))[0]
  }));
  const GATES = FORDS.map(f => f.gate);

  /* 守备分派：先续任、再补空 —— 上回合守某个口的人只要还活着就接着守，空出来的口按
     「全局最近的单位—口配对」补人（同距按番号定序，保证确定性）。
     续任不是礼节：每回合从头按距离重算，会因为一格的远近差把两个人对调，
     结果两个人都掉头走在半路，谁也没站到口上 —— 实测过一次，防线整个空掉。
     返回 单位 id → 口；没分到口的人就是预备队 */
  function assignGates(state, units, gates) {
    const prev = state.post, post = {}, uTaken = {}, gTaken = {};
    for (const u of units) {
      const gi = prev[u.id];
      if (gi === undefined || gi >= gates.length || gTaken[gi]) continue;
      uTaken[u.id] = 1; gTaken[gi] = 1; post[u.id] = gates[gi];
    }
    const pairs = [];
    for (const u of units) {
      if (uTaken[u.id]) continue;
      for (let i = 0; i < gates.length; i++) {
        if (!gTaken[i]) pairs.push({ id: u.id, gi: i, d: manhattan(u, gates[i]) });
      }
    }
    pairs.sort((a, b) => (a.d - b.d) || (a.id < b.id ? -1 : a.id > b.id ? 1 : a.gi - b.gi));
    for (const p of pairs) {
      if (uTaken[p.id] || gTaken[p.gi]) continue;
      uTaken[p.id] = 1; gTaken[p.gi] = 1; post[p.id] = gates[p.gi];
    }
    for (const k in prev) delete prev[k];
    for (const id in post) prev[id] = gates.indexOf(post[id]);
    return post;
  }

  /* 守口的走位：口空着就直接上；口被占着就压到最近的东岸接近格（下一回合口一空就补上去），
     实在挤不进去就朝口的方向挪一步 —— 「目标格已被占用，原地待命」等于把防线让开。 */
  function pressTo(state, u, gate) {
    if (u.col === gate.col && u.row === gate.row) return { type: 'hold' };
    if (!occupied(state, gate, u)) return { type: 'move', to: gate };
    const cands = neighbors(gate)
      .filter(p => p.col > 0 && passable(p) && !occupied(state, p, u))
      .sort((a, b) => (manhattan(u, a) - manhattan(u, b)) || (b.col - a.col));
    if (cands.length) return { type: 'move', to: cands[0] };
    const steps = neighbors(u)
      .filter(p => p.col > 0 && passable(p) && !occupied(state, p, u) && manhattan(p, gate) < manhattan(u, gate))
      .sort((a, b) => (moveCost(a) - moveCost(b)) || (a.col - b.col) || (a.row - b.row));
    return steps.length ? { type: 'move', to: steps[0] } : { type: 'hold' };
  }

  /* 哪处渡口更危险：照军级情报给两处渡口打分 —— 离得越近、看得越真，分越高。
     两处都没人靠近就不派预备队：预备队不是巡逻队，它只在有威胁时才动。 */
  function threatGate(state) {
    const intel = intelPositions(state, 'blue');
    let best = null;
    for (let i = 0; i < GATES.length; i++) {
      let score = 0;
      for (const p of intel) {
        const d = manhattan(p, GATES[i]);
        if (d <= 4) score += (p.live ? 2 : 1) * (5 - d);
      }
      if (!best || score > best.score) best = { gate: GATES[i], score: score };
    }
    return best && best.score > 0 ? best.gate : null;
  }

  function blueOrders(state) {
    const orders = {};
    const units = alive(state, 'blue');
    const post = assignGates(state, units, GATES);
    for (const id in state.reserveMarch) if (!units.some(u => u.id === id)) delete state.reserveMarch[id];
    for (const u of units) {
      const foes = visibleFoes(state, 'blue', u);
      if (foes.some(f => manhattan(u, f) === 1)) { orders[u.id] = { type: 'attack' }; continue; }
      const my = post[u.id];
      if (my) { delete state.reserveMarch[u.id]; orders[u.id] = pressTo(state, u, my); continue; }   // 守口：回口上、留在口上
      /* 预备队：受命增援某口就走到底 —— 到了口边才重新判断。
         中途掉头看着更「机灵」，实际是把两三个回合花在两条路上，两头都没赶上。
         这也正是诱饵值钱的地方：把它骗去错的方向，这几个回合就再也收不回来 */
      const committed = state.reserveMarch[u.id];
      if (committed !== undefined && manhattan(u, GATES[committed]) > 1) {
        orders[u.id] = pressTo(state, u, GATES[committed]);
        continue;
      }
      const tg = threatGate(state);                                 // 预备队：往受威胁的口补
      if (tg) {
        state.reserveMarch[u.id] = GATES.indexOf(tg);
        orders[u.id] = pressTo(state, u, tg);
      } else {
        delete state.reserveMarch[u.id];
        orders[u.id] = approach(state, u, STANDBY);
      }
    }
    return orders;
  }

  root.Core = {
    COLS: COLS, ROWS: ROWS, MAP: MAP, TERRAIN: TERRAIN, PLACES: PLACES,
    CRT: CRT, CRT_COLS: CRT_COLS, RESULTS: RESULTS,
    TURNS_MAX: TURNS_MAX, EXIT_NEED: EXIT_NEED, MP: MP, DETECT_BASE: DETECT_BASE,
    makeState: makeState, resolveTurn: resolveTurn, aiOrders: aiOrders,
    findPath: findPath, routeBlockers: routeBlockers, planMove: planMove, reachable: reachable, manhattan: manhattan, neighbors: neighbors,
    cellAt: cellAt, terrainAt: terrainAt, passable: passable, moveCost: moveCost,
    unitAt: unitAt, alive: alive, placeName: placeName,
    detectRange: detectRange, visibleFoes: visibleFoes, clockStr: clockStr,
    RED_GOALS: RED_GOALS, GATES: GATES, STANDBY: STANDBY
  };
})(typeof window !== 'undefined' ? window : globalThis);
