/* 推演回放：把一局格子推演跑完，产出能被地图消费的数据（纯逻辑，无 DOM）
 *
 * 输入：种子 —— 与格子件（站点根 index.html）种子滑杆上那个数是同一个。
 *   opts.red：逐回合的红方命令（格子件里玩家真下过的那些）。不传就用引擎 AI，等价于勾选「红方交 AI」。
 * 引擎是确定性的（mulberry32 + 固定 AI + 固定结算顺序），所以**同种子同命令，结果逐字段一致**：
 * 地图页拿到 ?game=<种子> 与同一份红方命令，就能复现格子件里的那一局。
 *   ├ 全自动那一局：只靠种子即可复现；
 *   └ 手动下令那一局：core/main.js 把每回合的命令存进 localStorage（键 siduchishui.sim.<种子>），
 *     链接把它带过来；换机器或清了存储就退化为「同种子自动推演」，不会是同一局 —— 界面上要说明。
 *
 * 输出：
 *   frames[]  每回合态势快照：回合、钟点、各单位位置/兵力当量/士气/疲劳、红方当时是否看得见该单位
 *   simLog[]  推演日志：字段与《行军日志字段表》同名，差异见 samples/march-log-schema.md §1.1
 */
(function (root) {
  'use strict';

  const ACTION_ORDER = ['覆灭', '战斗', '渡河', '行军', '侦察', '待命'];
  const KIND_ACTION = { move: '行军', contact: '行军', exit: '渡河', combat: '战斗', loss: '损失' };

  function primaryAction(evs) {
    const set = {};
    for (const e of evs) set[(e.data && e.data.action) || KIND_ACTION[e.kind]] = true;
    if (set['覆灭']) return '覆灭';
    if (set['战斗'] || set['损失']) return '战斗';
    if (set['渡河']) return '渡河';
    if (set['行军']) return '行军';
    if (set['侦察']) return '侦察';
    return '待命';
  }

  function placeOf(C, cell) {
    return cell ? C.placeName(cell.col, cell.row) : '';
  }

  function frameOf(C, st, turn, clock, fresh) {
    return {
      turn: turn,
      clock: clock,
      units: st.units.map(u => ({
        id: u.id, side: u.side, name: u.name, col: u.col, row: u.row,
        str: Math.max(0, u.str), morale: u.morale, fatigue: u.fatigue,
        exited: !!u.exited, dead: !!u.dead,
        seenByRed: !!st.visible.red[u.id]
      })),
      exited: { red: st.exited.red, blue: st.exited.blue },
      winner: st.winner,
      log: fresh
    };
  }

  function collect(simLog, seed, turn, clockMin, fresh, st, G, C) {
    const byUnit = new Map();
    for (const e of fresh) {
      const id = e.data && e.data.unitId;
      if (!id) continue;
      if (!byUnit.has(id)) byUnit.set(id, []);
      byUnit.get(id).push(e);
    }
    const nameOf = {};
    st.units.forEach(u => { nameOf[u.id] = u; });

    for (const entry of byUnit) {
      const id = entry[0], evs = entry[1];
      const u = nameOf[id] || {};
      const datas = evs.map(e => e.data || {});
      const move = datas.filter(d => d.to)[0] || null;
      const combat = datas.filter(d => d.code)[0] || null;
      const foeId = (datas.filter(d => d.foeId)[0] || {}).foeId;
      const losses = datas.filter(d => d.delta).map(d => d.delta);
      const blocked = (datas.filter(d => d.blocked)[0] || {}).blocked;
      const end = { col: u.col, row: u.row };
      const lonlat = G.cellCenter(end.col, end.row);

      const notes = [];
      if (foeId) notes.push('与 ' + (nameOf[foeId] ? nameOf[foeId].name : foeId) + ' 接触');
      if (blocked) notes.push(blocked);
      if (combat) notes.push('有效兵力比 ' + combat.ratio.toFixed(2) + '，骰 ' + combat.roll + ' → ' + combat.code);
      if (datas.some(d => d.retreat)) notes.push('溃退后渡河');

      simLog.push({
        logId: 'sim-' + seed + '-t' + turn + '-' + id,
        side: u.side || '',
        unitId: id,
        unitName: (u.name || id) + '（推演占位）',
        unitLevel: '',
        turn: turn,
        clock: C.clockStr(clockMin),
        timeRange: '第 ' + turn + ' 回合 ' + C.clockStr(clockMin) + '—' + C.clockStr(clockMin + 120),
        action: primaryAction(evs),
        placeName: C.placeName(end.col, end.row),
        lonlat: lonlat,
        coordCertainty: '推演',
        fromPlaceName: placeOf(C, move && move.from),
        toPlaceName: placeOf(C, move && move.to),
        routeNote: notes.join('；'),
        distanceKm: '',
        engagedWith: foeId ? (nameOf[foeId] ? nameOf[foeId].name : foeId) : '',
        lossNote: losses.length ? '合计 ' + losses.reduce((a, b) => a + b, 0) + ' 点兵力当量' : '',
        sourceRef: '格子验证件 · 种子 ' + seed,
        sourceType: '本局推演',
        sourceLocator: 'index.html?seed=' + seed + '&auto=1',
        certainty: '推演',
        conflictNote: '',
        animRef: 't' + turn,
        eventCardRef: '',
        rawText: evs.map(e => e.text).join(' ／ ')
      });
    }
  }

  /* 跑完一局。opts.red = 逐回合的红方命令数组（第 0 项对应第 1 回合），不传则红方也交给引擎 AI */
  function run(seed, opts) {
    opts = opts || {};
    const redOrders = opts.red && opts.red.length ? opts.red : null;
    const C = root.Core, G = root.GridGeo;
    const st = C.makeState(seed);
    const frames = [];
    const simLog = [];
    frames.push(frameOf(C, st, st.turn, C.clockStr(st.clockMin), []));
    while (!st.winner) {
      const turn = st.turn, clockMin = st.clockMin, clock = C.clockStr(clockMin);
      const before = st.log.length;
      const red = (redOrders && redOrders[turn - 1]) || C.aiOrders(st, 'red');
      const orders = Object.assign(C.aiOrders(st, 'blue'), red);
      C.resolveTurn(st, orders);
      const fresh = st.log.slice(before);
      frames.push(frameOf(C, st, turn, clock, fresh));
      collect(simLog, seed, turn, clockMin, fresh, st, G, C);
    }
    return {
      seed: seed,
      winner: st.winner,
      turns: frames.length - 1,
      frames: frames,
      simLog: simLog
    };
  }

  root.Replay = { run: run, primaryAction: primaryAction, ACTION_ORDER: ACTION_ORDER };
})(typeof window !== 'undefined' ? window : globalThis);
