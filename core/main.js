/* 格子验证件 · 界面与播报
 * 这一层只做三件事：把状态画出来、把命令收进去、把事件念出来。
 * 规则一律在 engine.js，改规则不用碰这个文件。 */
(function () {
  'use strict';

  const C = window.Core;
  const errors = [];
  window.__errors = errors;
  window.addEventListener('error', function (e) { errors.push(String(e.message || e)); });

  /* ================= 画布 ================= */
  /* 格子尺寸按窗口算，不写死：基准 52px 只是量不到容器时的退路。
     画布上的字号与间距一律跟着 CELL 缩放（sc 函数），否则放大后字反而显得更小。 */
  const CELL_BASE = 52, CELL_MIN = 40, CELL_MAX = 96;
  /* PAD 是画布四周的留白，只有「别让格子贴着画布边框」这一个用处
     —— 地名与标注都画在格内，西岸的竖排标签也按格子中心定位。
     所以它越小格子越大：留 0.35 格边框就够了。 */
  const PAD_RATIO = 0.35;
  let CELL = CELL_BASE, PAD = Math.round(CELL_BASE * PAD_RATIO);
  const canvas = document.getElementById('grid');
  const ctx = canvas.getContext('2d');
  const boardW = () => PAD * 2 + C.COLS * CELL;
  const boardH = () => PAD * 2 + C.ROWS * CELL;
  /* 名字用 sc 而不是 u：下面绘制函数里 u 是「单位」的惯用名，不能撞 */
  const sc = k => Math.round(k * CELL / CELL_BASE * 10) / 10;

  function pickCell(availW, availH) {
    if (availW <= 0 && availH <= 0) return 0;
    for (let c = CELL_MAX; c >= CELL_MIN; c--) {
      const p = Math.round(c * PAD_RATIO);
      if (availW > 0 && p * 2 + c * C.COLS > availW) continue;
      if (availH > 0 && p * 2 + c * C.ROWS > availH) continue;
      return c;
    }
    return 0;
  }

  function sizeBoard() {
    const board = canvas.parentElement || document.querySelector('.board');
    const cap = board ? board.querySelector('.cap') : null;
    /* 视口 0×0 = 页面还没排版（内置浏览器面板隐藏时就是这样）：这时候量出来的
       容器尺寸没意义，宁可保留基准尺寸，等真排版了再量 */
    const laidOut = (window.innerWidth || 0) > 0;
    /* 窄窗口下三栏改单栏，棋盘只受宽度约束，纵向交给整页滚动 */
    const narrow = laidOut && window.innerWidth <= 1180;
    const availW = (laidOut && board && board.clientWidth) ? board.clientWidth - 30 : 0;
    /* 高度直接量棋盘容器自己：中栏是 flex，结算表钉在下方，容器剩下的就是棋盘的；
       再扣掉上内边距（14）与说明那一行（量 DOM，不写死）—— 一屏看全由结构保证，
       不靠「给下面的东西预留多少像素」这种估数 */
    const capH = (cap && cap.offsetHeight) ? cap.offsetHeight + 7 : 24;
    const availH = (laidOut && !narrow && board && board.clientHeight)
      ? board.clientHeight - 14 - capH : 0;
    CELL = pickCell(availW, availH) || CELL_BASE;
    PAD = Math.round(CELL * PAD_RATIO);
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(boardW() * dpr); canvas.height = Math.round(boardH() * dpr);
    canvas.style.width = boardW() + 'px'; canvas.style.height = boardH() + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  sizeBoard();

  const COL = {
    plain: '#2a3630', hill: '#453a29', pass: '#5c4a2b', town: '#39465a',
    ford: '#1f4a5e', river: '#14293f', west: '#22282f'
  };
  const GLYPH = { hill: '▲', pass: '隘', town: '镇', ford: '渡' };
  const x0 = c => PAD + c * CELL;
  const y0 = r => PAD + r * CELL;
  function rr(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  /* ================= 状态 ================= */
  const el = id => document.getElementById(id);
  const turnLabel = el('turnLabel'), clockLabel = el('clockLabel'), exitLabel = el('exitLabel');
  const turnsLeftLabel = el('turnsLeftLabel'), seedNow = el('seedNow');
  const missionRed = el('missionRed'), missionBlue = el('missionBlue');
  const banner = el('banner'), unitList = el('unitList'), selName = el('selName');
  const hintLine = el('hintLine'), logEl = el('log'), crtTable = el('crtTable');
  const crtBox = el('crtBox'), crtNow = el('crtNow');
  const resolveBtn = el('resolveBtn'), resetBtn = el('resetBtn'), clearBtn = el('clearBtn');
  const autoChk = el('autoChk'), fogChk = el('fogChk'), seedRange = el('seedRange'), seedLabel = el('seedLabel');
  const reachChk = el('reachChk'), reachRange = el('reachRange'), reachLabel = el('reachLabel');
  const mapLink = el('mapLink'), jumpNote = el('jumpNote');
  const orderStatus = el('orderStatus'), guideBtn = el('guideBtn');
  const guide = el('guide'), guideOk = el('guideOk'), guideAI = el('guideAI'), guideRules = el('guideRules');
  const result = el('result'), resultTitle = el('resultTitle'), resultBadge = el('resultBadge');
  const resultWhy = el('resultWhy'), resultEvents = el('resultEvents'), resultNote = el('resultNote');
  const resultLink = el('resultLink'), againBtn = el('againBtn'), retryBtn = el('retryBtn'), closeResult = el('closeResult');

  const ORDER_NAME = { move: '移动', hold: '固守', recon: '侦察', attack: '攻击', withdraw: '脱离' };
  let state, pending = {}, selected = null, moveMode = false, autoRed = false, anim = null, reachCells = null;
  /* 已结算回合的行军实况（含当时的红方移动令）：实况线画在棋盘上、计划留作残影 —— 偏离得看得见 */
  let trails = [];
  let playedRed = [];                      // 本局逐回合的红方命令，供地图页原样复现
  let resultDismissed = false;             // 结算画面被手动关掉后，别再被下一次 render 弹回来
  let resultKeyCount = 0;                  // 结算画面实际列出的关键事件条数（自动化接口用）

  /* L1/L2：播报里的地名可点，跳到真实地图的对应位置；本局命令另存本机，供地图页复现同一局
     路径按页面算 —— 格子件在站点根（index.html），本文件在 core/ 里被引 */
  const MAP_PAGE = 'samples/four-crossings.html';
  const PLACE_RE = new RegExp(Object.keys(window.GridGeo.PLACES)
    .sort((a, b) => b.length - a.length).join('|'), 'g');
  const placeHref = n => MAP_PAGE + '?place=' + encodeURIComponent(n);

  function setHint(s) { hintLine.textContent = s; }

  /* 全队人数（红方单位总数）—— 播报与结算的分母一律用它，不拿任务线（EXIT_NEED = 2）当分母：
     任务线是「主力过河」，全队是 3 个，两个数不说清就会出现「2/2，那第 3 个呢」的读法 */
  const redTotal = () => state.units.filter(u => u.side === 'red').length;
  /* 打完时还留在东岸、没渡河也没阵亡的红方单位（结算里点名用） */
  const redLeftBehind = () => C.alive(state, 'red');

  /* ================= 绘制 ================= */
  function drawTerrain() {
    for (let r = 0; r < C.ROWS; r++) {
      for (let c = 0; c < C.COLS; c++) {
        const ch = C.MAP[r][c], t = C.TERRAIN[ch];
        const x = x0(c), y = y0(r);
        ctx.fillStyle = (c === 0) ? COL.west : COL[t.key];
        ctx.fillRect(x, y, CELL, CELL);
        if (c === 0) continue;
        if (t.key === 'river') {
          ctx.strokeStyle = 'rgba(120,180,230,.20)'; ctx.lineWidth = 1;
          for (let i = 1; i <= 2; i++) {
            ctx.beginPath();
            const yy = y + CELL * (i / 3);
            ctx.moveTo(x + sc(6), yy);
            ctx.bezierCurveTo(x + CELL * 0.35, yy - 4, x + CELL * 0.65, yy + 4, x + CELL - sc(6), yy);
            ctx.stroke();
          }
        } else if (GLYPH[t.key]) {
          ctx.fillStyle = 'rgba(255,255,255,.20)';
          ctx.font = sc(12) + 'px "Microsoft YaHei",sans-serif';
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(GLYPH[t.key], x + CELL / 2, y + CELL / 2);
        }
      }
    }
  }

  function drawGrid() {
    ctx.strokeStyle = 'rgba(255,255,255,.055)'; ctx.lineWidth = 1;
    for (let c = 0; c <= C.COLS; c++) {
      ctx.beginPath(); ctx.moveTo(x0(c) + .5, y0(0)); ctx.lineTo(x0(c) + .5, y0(C.ROWS)); ctx.stroke();
    }
    for (let r = 0; r <= C.ROWS; r++) {
      ctx.beginPath(); ctx.moveTo(x0(0), y0(r) + .5); ctx.lineTo(x0(C.COLS), y0(r) + .5); ctx.stroke();
    }
    ctx.save();
    ctx.translate(x0(0) + CELL / 2, y0(C.ROWS) / 2 + PAD / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = 'rgba(255,255,255,.32)';
    ctx.font = sc(11) + 'px "Microsoft YaHei",sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('西岸 · 渡过即脱离', 0, 0);
    ctx.restore();
  }

  function drawPlaces() {
    ctx.font = sc(10.5) + 'px "Microsoft YaHei",sans-serif';
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    for (const k in C.PLACES) {
      const p = k.split(',');
      ctx.fillStyle = 'rgba(226,238,250,.66)';
      ctx.fillText(C.PLACES[k], x0(+p[0]) + sc(4), y0(+p[1]) + sc(3));
    }
  }

  function drawGoals() {
    ctx.save();
    ctx.setLineDash([4, 3]);
    ctx.strokeStyle = 'rgba(255,209,102,.72)'; ctx.lineWidth = 1.5;
    C.RED_GOALS.forEach(g => { rr(x0(g.col) + sc(3), y0(g.row) + sc(3), CELL - sc(6), CELL - sc(6), sc(5)); ctx.stroke(); });
    ctx.restore();
  }

  function drawDetect(u) {
    const rad = C.detectRange(u);
    for (let r = 0; r < C.ROWS; r++) {
      for (let c = 0; c < C.COLS; c++) {
        if (Math.abs(c - u.col) + Math.abs(r - u.row) > rad) continue;
        ctx.fillStyle = 'rgba(140,200,255,.075)';
        ctx.fillRect(x0(c), y0(r), CELL, CELL);
      }
    }
  }

  /* 计划线顺着真实可行路径画（绕河、避格），不是一根直线；
     本回合走得动的段落实线、要下一回合的段虚线 —— 停在哪一眼看得见。
     画的是下单时存进命令里的那一份计划：这里重算一遍的话，
     画出来的线和引擎实际走的路就可能不是同一条（旧版正是这么错的） */
  function drawOrderPreview() {
    for (const id in pending) {
      const o = pending[id];
      if (o.type !== 'move') continue;
      const u = state.units.find(x => x.id === id);
      if (!u || u.exited || u.dead) continue;
      const pl = planOf(u, o);
      const stops = pl ? [{ col: u.col, row: u.row }].concat(pl.path) : [{ col: u.col, row: u.row }, o.to];
      const mx = p => x0(p.col) + CELL / 2, my = p => y0(p.row) + CELL / 2;
      const seg = (a, b) => { ctx.beginPath(); ctx.moveTo(mx(stops[a]), my(stops[a])); ctx.lineTo(mx(stops[b]), my(stops[b])); ctx.stroke(); };
      const split = pl ? pl.thisTurn : stops.length - 1;
      ctx.save();
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = 'rgba(255,209,102,.45)';
      for (let i = split; i < stops.length - 1; i++) seg(i, i + 1);
      ctx.setLineDash([]);
      ctx.strokeStyle = 'rgba(255,209,102,.9)';
      for (let i = 0; i < Math.min(split, stops.length - 1); i++) seg(i, i + 1);
      ctx.beginPath();
      ctx.arc(x0(o.to.col) + CELL / 2, y0(o.to.row) + CELL / 2, sc(9), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  /* 上一次真画出来的东西的条数（实况线段 / 蓝军棋子 / 动向箭头）：给验证用 ——
     桩 DOM 的画布是空实现，看不到像素，只能让画的人自己报数 */
  let drawnSegs = 0, drawnBlue = 0, drawnArrows = 0;

  /* 实况线：结算完把「实际走到哪」画出来（单位色，越近越亮）；只对没走到计划格的移动令补画金色残影。
     计划与实况的差就是这一回合的剧情 —— 为什么没走到，右栏播报里逐条写着 */
  function drawTrails(k) {
    drawnSegs = 0;
    const mx = p => x0(p.col) + CELL / 2, my = p => y0(p.row) + CELL / 2;
    /* 正在演的那一回合不画实况线：轨迹本身就是结局，先画出来等于剧透 */
    const n = trails.length - (anim ? 1 : 0);
    for (let i = 0; i < n; i++) {
      const t = trails[i], newest = i === n - 1;
      const a = newest ? 0.62 * k : Math.min(0.34, 0.12 + 0.22 * (i + 1) / n);
      ctx.save();
      ctx.lineWidth = newest ? 2 : 1.2;
      for (const s of t.segs) {
        if (s.side === 'blue' && !s.seen) continue;      // 当时没看见的行军，事后也不留线
        drawnSegs++;
        ctx.strokeStyle = s.side === 'red' ? 'rgba(255,123,110,' + a + ')' : 'rgba(127,192,255,' + a + ')';
        ctx.beginPath(); ctx.moveTo(mx(s.from), my(s.from)); ctx.lineTo(mx(s.to), my(s.to)); ctx.stroke();
        if (newest) {
          ctx.beginPath(); ctx.arc(mx(s.to), my(s.to), sc(4), 0, Math.PI * 2);
          ctx.fillStyle = ctx.strokeStyle; ctx.fill();
        }
      }
      /* 计划残影只画「没走到」的那几条：走到了就不画，免得和实况线叠在一起 */
      if (newest) {
        ctx.setLineDash([5, 4]);
        ctx.strokeStyle = 'rgba(255,209,102,' + (0.5 * k) + ')';
        ctx.lineWidth = 1.5;
        for (const p of t.plans) {
          const s = t.segs.find(x => x.id === p.id);
          if (s && s.to.col === p.to.col && s.to.row === p.to.row) continue;
          const stops = [p.from].concat(p.path || [p.to]);
          ctx.beginPath();
          ctx.moveTo(mx(stops[0]), my(stops[0]));
          for (let j = 1; j < stops.length; j++) ctx.lineTo(mx(stops[j]), my(stops[j]));
          ctx.stroke();
          ctx.beginPath(); ctx.arc(mx(p.to), my(p.to), sc(9), 0, Math.PI * 2); ctx.stroke();
        }
        ctx.setLineDash([]);
      }
      ctx.restore();
    }
  }

  /* 回放中的显示位置：跟着当前这一条事件走（行军类滑动，其余原地不动）。
     一律从「这条事件之前」推到「之后」，不读结算后的真值 —— 否则第一帧就是结局 */
  function posOf(u, k) {
    if (!anim) return { col: u.col, row: u.row };
    const a = anim.view0[u.id], b = anim.view[u.id];
    if (!b) return a || null;                                   // 这一条事件里它离场：停在原地
    if (!a || (a.col === b.col && a.row === b.row)) return b;
    return { col: a.col + (b.col - a.col) * k, row: a.row + (b.row - a.row) * k };
  }

  function drawTile(x, y, fill, stroke, dash) {
    rr(x + sc(7), y + sc(7), CELL - sc(14), CELL - sc(14), sc(6));
    ctx.fillStyle = fill; ctx.fill();
    if (dash) ctx.setLineDash([4, 3]);
    ctx.strokeStyle = stroke; ctx.lineWidth = 1.5; ctx.stroke();
    if (dash) ctx.setLineDash([]);
  }

  function drawUnits(k) {
    /* 回放中不按「结算后的死活」筛人：那一刻谁在棋盘上由 view 说了算 */
    const ids = anim ? anim.view : null;
    const list = (ids ? state.units.filter(u => ids[u.id]) : C.alive(state))
      .slice().sort((a, b) => (a === selected ? 1 : 0) - (b === selected ? 1 : 0));
    const vis = anim ? anim.vis : state.visible.red;
    drawnBlue = 0;
    for (const u of list) {
      if (u.side === 'blue' && !vis[u.id]) continue;
      const view = ids ? ids[u.id] : null;
      const p = posOf(u, k);
      if (!p) continue;
      if (u.side === 'blue') drawnBlue++;
      const str = view ? view.str : u.str, fat = view ? view.fat : u.fatigue;
      const isRed = u.side === 'red';
      drawTile(x0(p.col), y0(p.row), isRed ? 'rgba(192,57,43,.92)' : 'rgba(61,123,184,.92)',
        u === selected ? '#ffd166' : 'rgba(255,255,255,.45)');
      /* 还没下令的红军单位圈一圈金虚线：一眼看出「还有谁没动」 */
      if (isRed && !pending[u.id] && !state.winner) {
        ctx.save();
        ctx.setLineDash([3, 3]);
        ctx.strokeStyle = 'rgba(255,209,102,.75)'; ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(x0(p.col) + CELL / 2, y0(p.row) + CELL / 2, CELL * 0.42, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
      ctx.fillStyle = '#fff';
      ctx.font = '700 ' + sc(14) + 'px "SimHei","Microsoft YaHei",sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(u.name, x0(p.col) + CELL / 2, y0(p.row) + CELL / 2 + 1);
      const bw = (CELL - sc(22)) * Math.max(0, str) / 10;
      ctx.fillStyle = 'rgba(255,255,255,.82)';
      ctx.fillRect(x0(p.col) + sc(11), y0(p.row) + CELL - sc(16), bw, Math.max(2, sc(3)));
      ctx.fillStyle = 'rgba(255,255,255,.72)';
      ctx.font = sc(10) + 'px ui-monospace,Consolas,monospace';
      ctx.textAlign = 'right'; ctx.textBaseline = 'top';
      ctx.fillText(String(Math.max(0, str)), x0(p.col) + CELL - sc(10), y0(p.row) + sc(9));
      if (fat >= 3) {
        ctx.fillStyle = 'rgba(255,209,102,.85)';
        ctx.textAlign = 'left';
        ctx.fillText('疲' + fat, x0(p.col) + sc(10), y0(p.row) + sc(9));
      }
    }
  }

  /* 动向迹象：把最后两次接触连成一条线，在格边画个箭头 —— 它往哪个方向去了。
     只给方向不给速度：两次接触之间它走了几格、路上有没有停，你没看见，就不该知道 */
  function drawHeading(kk) {
    const f = kk.from;
    if (!f || (f.col === kk.col && f.row === kk.row)) return;
    const len = Math.hypot(kk.col - f.col, kk.row - f.row);
    const ux = (kk.col - f.col) / len, uy = (kk.row - f.row) / len;
    const px = -uy, py = ux;
    const cx = x0(kk.col) + CELL / 2, cy = y0(kk.row) + CELL / 2;
    const r0 = CELL * 0.33, r1 = CELL * 0.47, hl = CELL * 0.19, hw = CELL * 0.115;
    const tx = cx + ux * r1, ty = cy + uy * r1;
    drawnArrows++;
    ctx.save();
    ctx.fillStyle = ctx.strokeStyle = 'rgba(255,209,102,.9)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx + ux * r0, cy + uy * r0);
    ctx.lineTo(tx - ux * hl * 0.5, ty - uy * hl * 0.5);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.lineTo(tx - ux * hl + px * hw, ty - uy * hl + py * hw);
    ctx.lineTo(tx - ux * hl - px * hw, ty - uy * hl - py * hw);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  function drawGhosts() {
    /* 回放中用「按这一回合之前的情报」算出来的最后已知位置，回合数也退回上一回合 */
    const sight = anim ? anim.sight : state, turnNow = anim ? state.turn - 1 : state.turn;
    const vis = anim ? anim.vis : state.visible.red;
    drawnArrows = 0;
    const known = sight.known.red;
    for (const id in known) {
      const u = state.units.find(x => x.id === id);
      if (!u || u.exited || u.dead || vis[id]) continue;
      const kk = known[id], age = turnNow - kk.turn;
      drawTile(x0(kk.col), y0(kk.row), 'rgba(61,123,184,.10)', 'rgba(120,180,240,.65)', true);
      ctx.fillStyle = 'rgba(170,210,245,.9)';
      ctx.font = '700 ' + sc(13) + 'px "SimHei",sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('?', x0(kk.col) + CELL / 2, y0(kk.row) + CELL / 2 - sc(4));
      ctx.font = sc(9.5) + 'px "Microsoft YaHei",sans-serif';
      ctx.fillStyle = 'rgba(150,190,225,.85)';
      ctx.fillText(age <= 0 ? '刚失去接触' : age + ' 回合前', x0(kk.col) + CELL / 2, y0(kk.row) + CELL / 2 + sc(11));
      drawHeading(kk);
    }
  }

  /* 可达范围（等时圈）：从「现在」起 N 小时按地形代价能走到哪 ——
     让「渡口是瓶颈、绕山脊有多贵」从账本变成眼睛能看见的东西 */
  function drawReach() {
    if (!reachCells) return;
    for (const k of reachCells) {
      const c = k % C.COLS, r = Math.floor(k / C.COLS);
      ctx.fillStyle = 'rgba(255,209,102,.085)';
      ctx.fillRect(x0(c), y0(r), CELL, CELL);
      const rim = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(d => !reachCells.has((r + d[1]) * C.COLS + (c + d[0])));
      if (rim) { ctx.strokeStyle = 'rgba(255,209,102,.34)'; ctx.lineWidth = 1; ctx.strokeRect(x0(c) + .5, y0(r) + .5, CELL - 1, CELL - 1); }
    }
  }

  /* 交火闪光：这条播报是一次战斗时，闪的就是它打的那一格 */
  function drawFlash() {
    if (!anim || !anim.flash) return;
    const f = anim.flash, p = Math.max(0, Math.min(1, anim.k || 0));
    const cx = x0(f.col) + CELL / 2, cy = y0(f.row) + CELL / 2;
    ctx.save();
    ctx.fillStyle = 'rgba(255,209,102,' + (0.20 * (1 - p)).toFixed(3) + ')';
    ctx.fillRect(x0(f.col), y0(f.row), CELL, CELL);
    ctx.strokeStyle = 'rgba(255,209,102,' + (0.9 * (1 - p)).toFixed(3) + ')';
    ctx.lineWidth = sc(2.5);
    ctx.beginPath(); ctx.arc(cx, cy, CELL * (0.3 + 0.32 * p), 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }

  function draw(k) {
    k = (k == null) ? 1 : k;
    ctx.clearRect(0, 0, boardW(), boardH());
    drawTerrain();
    drawGoals();
    if (reachCells) drawReach();
    if (fogChk.checked && selected && !selected.exited && !selected.dead) drawDetect(selected);
    drawGrid();
    drawPlaces();
    drawTrails(k);
    drawOrderPreview();
    drawUnits(k);
    drawFlash();
    drawGhosts();
  }

  /* ================= 结算回放 ================= */
  /* 「推进一回合」不让棋盘瞬间跳到结局：按播报事件的先后一条一条演 ——
     谁先动、谁撞上谁、哪一格打起来、谁掉了兵；演到哪条就点亮右栏哪条播报。
     每一步「该看见什么」都从事件自己身上取（engine 的 data 里带着 unitId/from/to），
     所以这是演出，不是猜测。点棋盘（或那个变成「跳过」的按钮）直接看结果。 */
  const CUE_MS = {
    move: 230, contact: 230, exit: 360, combat: 520, loss: 300,
    order: 100, intel: 130, turn: 90, end: 90
  };
  let litEl = null;

  /* 点亮正在演的那条播报，并让它滚进视野（桩 DOM 没有 offsetTop，读到非数字就跳过） */
  function litLog(elm) {
    if (litEl && litEl !== elm) litEl.classList.remove('lit');
    litEl = elm;
    if (!elm) return;
    elm.classList.add('lit');
    if (typeof elm.offsetTop === 'number' && typeof logEl.clientHeight === 'number') {
      logEl.scrollTop = Math.max(0, elm.offsetTop - logEl.clientHeight / 2);
    }
  }

  /* 战斗结算表的那一格跟着战斗播报亮。列号从引擎的表里反查，不在这儿重抄一遍判定 */
  function markCRT(c) {
    document.querySelectorAll('#crtTable td').forEach(td => td.classList.remove('hit'));
    if (!c || !c.crt) return;
    const ci = C.CRT[c.crt.roll - 1].indexOf(c.crt.code);
    const cell = ci < 0 ? null : crtTable.querySelector('td[data-r="' + (c.crt.roll - 1) + '"][data-c="' + ci + '"]');
    if (cell) cell.classList.add('hit');
  }

  /* 把一条事件应用到一份 view 上（干跑与真演共用同一套规则，免得两边算得不一样） */
  function applyCue(view, c) {
    if (c.vset) return Object.assign({}, c.vset);
    const nv = Object.assign({}, view);
    if (c.mv) {
      const v = view[c.mv.id] || { str: 0, fat: 0 };
      nv[c.mv.id] = { col: c.mv.to.col, row: c.mv.to.row, str: v.str, fat: v.fat };
    }
    if (c.gone) delete nv[c.gone];
    if (c.kill) delete nv[c.kill];
    if (c.hurt) {
      const v = view[c.hurt.id];
      if (v) nv[c.hurt.id] = { col: v.col, row: v.row, str: Math.max(0, v.str + c.hurt.d), fat: v.fat };
    }
    return nv;
  }

  /* 播报事件 → 演出脚本。view 是「那一刻棋盘上有什么」：id → {col,row,str,fat}；
     不在 view 里 = 那一刻它不在棋盘上。位置只从事件往前推，不读结算后的真值。 */
  function buildCues(fresh, els, prev) {
    const view = {};
    for (const id in prev) view[id] = { col: prev[id].col, row: prev[id].row, str: prev[id].str, fat: prev[id].fat };
    const cues = [];
    fresh.forEach(function (e, j) {
      const d = e.data || {}, c = { kind: e.kind, el: els[j] || null, dur: CUE_MS[e.kind] || 120 };
      if (d.unitId && d.from && d.to && (e.kind === 'move' || e.kind === 'contact' || e.kind === 'exit')) {
        c.mv = { id: d.unitId, to: { col: d.to.col, row: d.to.row } };
        if (e.kind === 'exit') c.gone = d.unitId;      // 走到西岸就没入脱离区
      } else if (e.kind === 'combat') {
        c.flash = d.at ? { col: d.at.col, row: d.at.row } : null;
        if (d.roll && d.code) c.crt = { roll: d.roll, code: d.code };
      } else if (e.kind === 'loss' && d.unitId) {
        if (d.action === '覆灭') c.kill = d.unitId;
        else c.hurt = { id: d.unitId, d: d.delta || 0 };
      }
      cues.push(c);
    });
    /* 收尾帧：溃退（stepBack）不单独写播报，位置差留到这里一次对齐 ——
       不补这一帧，被推开的单位会整场站在错的地方。
       判据是「这一串事件演完的落点」和「结算后的真值」差多少，不是拿开局比 */
    const final = {};
    state.units.forEach(u => {
      if (u.exited || u.dead) return;
      final[u.id] = { col: u.col, row: u.row, str: u.str, fat: u.fatigue };
    });
    let played = view;
    for (const c of cues) played = applyCue(played, c);
    const drift = Object.keys(final).some(id => {
      const v = played[id];
      return !v || v.col !== final[id].col || v.row !== final[id].row || v.str !== final[id].str;
    });
    if (drift) cues.push({ kind: 'settle', el: null, dur: 320, vset: final });
    return cues;
  }

  /* 把当前这条事件应用到 view 上：先存一份 view0（滑动动画的起点），再算出 view（终点） */
  function advanceCue() {
    const c = anim.cues[anim.i];
    if (!c) { finishPlay(); return; }
    anim.view0 = anim.view;
    anim.view = applyCue(anim.view, c);
    anim.flash = c.flash || null;
    anim.k = 0;
    anim.t0 = performance.now();
    /* 看不见的那几条没有播报可点：灯留在上一条上，别一闪一闪 */
    if (c.el) litLog(c.el);
    if (c.kind === 'combat') markCRT(c);
  }

  function tick(now) {
    if (!anim) return;
    const c = anim.cues[anim.i];
    const k = Math.min(1, (now - anim.t0) / (c ? c.dur : 150));
    anim.k = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    draw(anim.k);
    if (k < 1) requestAnimationFrame(tick);
    else {
      anim.i++;
      if (anim.i < anim.cues.length) { advanceCue(); requestAnimationFrame(tick); }
      else finishPlay();
    }
  }

  function startPlay(cues, prev, sight, tail) {
    const v0 = {};
    for (const id in prev) v0[id] = { col: prev[id].col, row: prev[id].row, str: prev[id].str, fat: prev[id].fat };
    /* 这一场戏能看见谁，开场一次定死：结算完那一刻的情报。演到一半再去看一遍，等于给棋盘报信 */
    anim = { cues: cues, i: 0, view: v0, view0: v0, k: 0, flash: null, t0: performance.now(),
      sight: sight, vis: Object.assign({}, state.visible.red), tail: tail };
    advanceCue();
    requestAnimationFrame(tick);
    /* 页面切到后台时 rAF 不跑：兜底把这一场直接演完，画布与结算画面都不会停在半路 */
    const mine = anim;
    setTimeout(function () { if (anim === mine) finishPlay(); }, cues.reduce((s, c) => s + c.dur, 0) + 400);
  }

  function finishPlay() {
    const a = anim;
    if (!a) return;
    anim = null;
    litLog(null);
    if (a.tail) setHint(a.tail);
    render();                                  // render 里会补画终帧、补亮结算表、该弹结算画面就弹
  }

  /* ================= 播报 ================= */
  function esc(s) {
    return String(s).replace(/[&<>]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[m]));
  }
  /* 播报是「你的视角」：红方自己的行动与发现全报；蓝方只在你看得见它时才报（打起来了当然在场）。
     看不见的行军、蓝军自己发现你的事，都不写到你眼前 —— 它们只进「最后已知位置」那套情报 */
  function reportable(e) {
    if (!e.side || e.side === 'red' || e.kind === 'end') return true;
    if (e.kind === 'combat' || e.kind === 'loss' || e.kind === 'contact') return true;
    const id = e.data && e.data.unitId;
    return !!(id && state.visible.red[id]);
  }
  function addLog(e) {
    const d = document.createElement('div');
    d.className = 'ev ev-' + e.kind;
    const txt = esc(e.text).replace(PLACE_RE,
      m => '<a class="pl" target="_blank" rel="noopener" href="' + placeHref(m) + '">' + m + '</a>');
    d.innerHTML = '<span class="clk">' + e.clock + '</span><span class="t">T' + e.turn + '</span>' + txt;
    logEl.appendChild(d);
    logEl.scrollTop = logEl.scrollHeight;
    return d;                                  // 结算回放要拿着它一条一条点亮
  }

  /* ================= 面板渲染 ================= */
  function buildCRT() {
    let h = '<tr><th>1d6 ＼ 比</th>' + C.CRT_COLS.map(c => '<th>' + c + '</th>').join('') + '</tr>';
    for (let i = 0; i < 6; i++) {
      h += '<tr><th>' + (i + 1) + '</th>' +
        C.CRT[i].map((code, j) => '<td class="' + code + '" data-r="' + i + '" data-c="' + j + '">' + code + '</td>').join('') +
        '</tr>';
    }
    crtTable.innerHTML = h;
  }

  function render() {
    clockLabel.textContent = C.clockStr(state.clockMin);
    exitLabel.textContent = state.exited.red;
    /* 胜负是在结算里判的，判完 state.turn 已 +1：报「第几回合」要退回去一格 */
    turnLabel.textContent = state.winner ? state.turn - 1 : state.turn;
    turnsLeftLabel.textContent = state.winner ? '已分胜负'
      : '剩 ' + Math.max(0, C.TURNS_MAX - state.turn + 1) + ' 回合';
    missionRed.classList.toggle('done', state.exited.red >= C.EXIT_NEED);
    missionBlue.classList.toggle('done', !!state.winner && state.winner === 'blue');

    if (state.winner) {
      banner.className = 'banner show ' + state.winner;
      banner.textContent = state.winner === 'red'
        ? '主力渡河成功：' + state.exited.red + '/' + redTotal() + ' 个渡河脱离'
        : '蓝方达成目标：' + C.TURNS_MAX + ' 回合内未能送过 ' + C.EXIT_NEED + ' 个主力';
    } else {
      banner.className = 'banner';
    }
    resolveBtn.disabled = !!anim || !!state.winner;
    resolveBtn.textContent = anim ? '结算中… 点此跳过'
      : state.winner ? '已分胜负' : '推进一回合';

    unitList.innerHTML = '';
    for (const u of state.units.filter(x => x.side === 'red')) {
      const gone = u.exited || u.dead;
      const o = pending[u.id];
      const ps = (!gone && o && o.type === 'move') ? planShort(u, o) : '';
      const ord = gone ? (u.exited ? '已渡河脱离' : '已退出棋盘')
        : (o ? (o.type === 'move' ? '→ ' + C.placeName(o.to.col, o.to.row) + (ps ? ' · ' + ps : '') : ORDER_NAME[o.type]) : '未下令 · 按固守');
      const d = document.createElement('div');
      d.className = 'u' + (u === selected ? ' sel' : '') + (gone ? ' gone' : '');
      d.innerHTML = '<span class="sw" style="background:' + (gone ? '#5c6b7a' : '#c0392b') + '"></span>' +
        '<span><span class="nm">' + u.name + '</span><span class="ord">' + esc(ord) + '</span></span>' +
        '<span class="st">当量 ' + Math.max(0, u.str) + '<br>士气 ' + u.morale + ' · 疲劳 ' + u.fatigue + '</span>';
      d.addEventListener('click', function () {
        if (gone) { setHint(u.name + ' 已不在棋盘上。'); return; }
        selected = u; moveMode = false;
        setHint(selText(u));
        render();
      });
      unitList.appendChild(d);
    }

    selName.textContent = (!selected || selected.exited || selected.dead)
      ? '未选中' : selected.name + ' · 当量 ' + Math.max(0, selected.str) + ' · 士气 ' + selected.morale + ' · 侦察 ' + C.detectRange(selected);

    document.querySelectorAll('[data-order]').forEach(function (b) {
      b.disabled = !!anim || !selected || selected.exited || selected.dead;
      b.classList.toggle('on', !!(selected && pending[selected.id] && pending[selected.id].type === b.dataset.order));
    });

    /* 回放中不动结算表：让 flash 播报自己点亮那一格，否则第一帧就把战果漏了 */
    if (!anim) {
      document.querySelectorAll('#crtTable td').forEach(td => td.classList.remove('hit'));
      /* 战果写进收起时也看得见的那一行：表格不自动展开，免得展开时把棋盘挤小 */
      if (state.lastCombat) {
        const cell = crtTable.querySelector('td[data-r="' + (state.lastCombat.roll - 1) + '"][data-c="' + state.lastCombat.col + '"]');
        if (cell) cell.classList.add('hit');
        const R = C.RESULTS[state.lastCombat.code];
        crtNow.textContent = '最近一次：' + state.lastCombat.atk + ' 攻 ' + state.lastCombat.def +
          ' · 有效兵力比 ' + state.lastCombat.ratio.toFixed(2) + ' ≈ ' + C.CRT_COLS[state.lastCombat.col] +
          ' · 掷 ' + state.lastCombat.roll + ' → ' + state.lastCombat.code + ' ' + R.label;
        crtNow.className = 'now hot';
      } else {
        crtNow.textContent = '尚未发生交战。';
        crtNow.className = 'now';
      }
    }
    renderOrderStatus();
    renderResult();
    /* 等时圈：选中谁就只看谁，否则看全体红军 —— 每回合 2 小时，N 小时 = N/2 回合的机动点 */
    reachCells = null;
    if (reachChk.checked) {
      const budget = (+reachRange.value / 2) * C.MP;
      const src = (selected && !selected.exited && !selected.dead) ? [selected] : C.alive(state, 'red');
      reachCells = new Set();
      src.forEach(u => C.reachable(state, u, budget).forEach((v, k) => reachCells.add(k)));
    }
    if (!anim) draw(1);
  }

  /* 「还有谁没下令」写在推进按钮上方，别让人点了才发现没下令的单位全按固守结算 */
  function renderOrderStatus() {
    const mine = state.units.filter(u => u.side === 'red' && !u.exited && !u.dead);
    const pending_ = mine.filter(u => !pending[u.id]);
    let t, cls = 'orderstatus';
    if (anim) {
      t = '正在演第 ' + (state.turn - 1) + ' 回合的结算 —— 演到哪条就点亮右栏哪条播报；点棋盘或按钮直接跳过。';
      cls += ' ok';
    } else if (state.winner) {
      t = '本局已结束。';
    } else if (!mine.length) {
      t = '红方已无单位在棋盘上。';
    } else if (!pending_.length) {
      t = mine.length + ' 个单位全部已下令，点「推进一回合」结算。';
      cls += ' ok';
    } else if (pending_.length === mine.length) {
      t = mine.length + ' 个单位都还没下令 —— 直接推进会全部按「固守」结算。';
      cls += ' warn';
    } else {
      t = '已下令 ' + (mine.length - pending_.length) + '/' + mine.length +
        '，还没轮到 ' + pending_.map(u => u.name).join('、') + '（按「固守」结算）。';
    }
    orderStatus.textContent = t;
    orderStatus.className = cls;
  }

  /* 行军预告的两种写法：长句给提示行，短句给单位列表。
     代价（真实坡度 / 渡口硬约束）本来就在引擎里算，这里只负责把它说出来 */
  function planOf(u, o) {
    if (!o || o.type !== 'move') return null;
    /* 下单时算好的那份计划优先：画线、预告、执行三条路读的必须是同一份，
       否则棋盘一变，预告就成了空头支票 */
    return o.plan || C.planMove(state, u, o.to);
  }
  function planShort(u, o) {
    const pl = planOf(u, o);
    return pl ? '第 ' + (state.turn + pl.turns - 1) + ' 回合到' : '';
  }
  function planLong(u, o) {
    const pl = planOf(u, o);
    if (!pl) return '找不到通路（目标格可能被占用或隔断）';
    const pts = Math.round(pl.total * 10) / 10;
    const arrive = pl.turns === 1 ? '本回合' : '第 ' + (state.turn + pl.turns - 1) + ' 回合（' +
      C.clockStr(state.clockMin + 120 * (pl.turns - 1)) + '）';
    return '共 ' + pl.cells + ' 格 / ' + pts + ' 点机动（每回合 ' + C.MP + ' 点）—— ' + arrive +
      '到位' + (pl.thisTurn < pl.cells ? '，本回合只走得动 ' + pl.thisTurn + ' 格' : '');
  }

  function selText(u) {
    const o = pending[u.id];
    if (!o) return '已选中 ' + u.name + '，选择命令。';
    return '已选中 ' + u.name + '（已下令：' + (o.type === 'move'
      ? '移动 → ' + C.placeName(o.to.col, o.to.row) + ' · ' + planLong(u, o)
      : ORDER_NAME[o.type]) + '）。可重新下令。';
  }

  function renderResult() {
    if (!state.winner || resultDismissed) { result.hidden = true; return; }
    const win = state.winner === 'red';
    const lastTurn = state.turn - 1;
    const rounds = state.log.filter(e => e.kind === 'combat').length;
    const total = redTotal();
    const left = redLeftBehind();
    const lost = state.units.filter(u => u.side === 'red' && u.dead);
    resultBadge.textContent = '验证件 · 本局结果（种子 ' + state.seed + '）';
    resultTitle.textContent = win ? '主力渡河成功' : '蓝军守住渡口';
    resultTitle.className = win ? 'ok' : 'no';
    if (win) {
      /* 口径：任务线是「主力（2 个）过河」，全队 3 个 —— 胜负照判，但结算要把没过去的人点名，
         不让「2/3」读成「全队都过了」（全部 3 个过河的情况照实报「一个不少」） */
      const head = '第 ' + lastTurn + ' 回合，红军有 ' + state.exited.red + '/' + total +
        ' 个单位渡过赤水河进入西岸脱离区';
      if (state.exited.red >= total) {
        resultWhy.textContent = head + ' —— 全队过河，一个不少。';
      } else {
        const tail = [];
        if (left.length) tail.push(left.map(u => u.name).join('、') + ' 仍在东岸');
        if (lost.length) tail.push(lost.map(u => u.name).join('、') + ' 在东岸被歼');
        resultWhy.textContent = head + ' —— 任务要求的 ' + C.EXIT_NEED + ' 个主力已经过河；' +
          tail.join('；') + '。';
      }
    } else {
      resultWhy.textContent = '打到第 ' + C.TURNS_MAX + ' 回合结束，红军只渡过去 ' + state.exited.red + '/' + total +
        ' 个单位（任务要 ' + C.EXIT_NEED + ' 个主力）—— 蓝军把时限拖满了。';
    }
    const keys = state.log.filter(e => /^(combat|loss|exit|intel)$/.test(e.kind)).slice(-3);
    resultKeyCount = keys.length;
    resultEvents.innerHTML = keys.length
      ? keys.map(e => '<div class="kev kev-' + e.kind + '"><span class="t">T' + e.turn + '</span>' + esc(e.text) + '</div>').join('')
      : '<div class="kev">这一局没有发生交战 —— 双方都在走位，红方没能按时渡河。</div>';
    const dead = state.units.filter(u => u.side === 'red' && u.dead).length;
    resultNote.textContent = '共 ' + lastTurn + ' 回合 · 交战 ' + rounds + ' 次 · 红方阵亡 ' + dead +
      ' 个 · 渡河 ' + state.exited.red + '/' + total + ' 个（蓝方 ' + state.exited.blue + ' 个）· 本机记录的 ' + playedRed.length + ' 回合命令已存下。';
    resultLink.href = mapLink.href;
    /* 回放演完再弹：不然结算画面从第一帧就盖住整场戏（文字先填好，ui() 读得到） */
    result.hidden = !!anim;
  }

  /* ================= 回合 ================= */
  function saveRecord() {
    try {
      localStorage.setItem('siduchishui.sim.' + state.seed, JSON.stringify({
        seed: state.seed, turns: playedRed.length, red: playedRed,
        savedAt: new Date().toISOString()
      }));
    } catch (err) { /* 隐私模式或配额满：跳转退化为「同种子自动推演」 */ }
  }

  function updateJump() {
    const q = playedRed.length ? '&turn=' + playedRed.length : '';
    mapLink.href = MAP_PAGE + '?game=' + state.seed + q;
    jumpNote.textContent = playedRed.length
      ? '已带上本局 ' + playedRed.length + ' 回合命令（存本机 localStorage，换机器或换浏览器会退化为同种子自动推演）。'
      : '地图页把格网叠到真实地形上，按种子 ' + state.seed + ' 复现；你下令后这里会带上本局命令。';
  }

  function doTurn() {
    if (state.winner || anim) return [];
    /* prev 记的是「这一刻棋盘上有什么」：位置、当量、疲劳 —— 回放的第一帧就从这里长出来。
       情报（谁被发现了、最后已知位置）也存一份：这场戏要用下令时的那份眼光来演 */
    const prev = {}, sight = JSON.parse(JSON.stringify({ visible: state.visible, known: state.known }));
    state.units.forEach(u => {
      if (u.exited || u.dead) return;
      prev[u.id] = { col: u.col, row: u.row, str: u.str, fat: u.fatigue };
    });
    /* 蓝方永远交给 AI；红方按开关走 AI 或走玩家命令 */
    const redOrders = autoRed ? C.aiOrders(state, 'red') : pending;
    const orders = Object.assign(C.aiOrders(state, 'blue'), redOrders);
    /* 计划要连路径一起留档：结算后订单就清了，不留档就没法和实况对照 */
    const plans = [];
    for (const id in redOrders) {
      const o = redOrders[id], u = state.units.find(x => x.id === id);
      if (!o || o.type !== 'move' || !u || u.exited || u.dead) continue;
      const pl = o.plan || C.planMove(state, u, o.to);
      plans.push({
        id: id, name: u.name, from: { col: u.col, row: u.row },
        to: { col: o.to.col, row: o.to.row }, path: pl ? pl.path : [o.to]
      });
    }
    const before = state.log.length;
    C.resolveTurn(state, orders);
    if (state.winner) resultDismissed = false;   // 刚分出胜负：结算画面该自己弹出来
    const fresh = state.log.slice(before);
    /* 实况：位置真的变了的单位，从出发格到落脚格（溃退、撞停、渡河都算）。
       带 seen 标记：看不见的蓝军行军不画线 —— 情报口径一处定，播报/实况线/演出共用 */
    const segs = [];
    state.units.forEach(u => {
      const p = prev[u.id];
      if (!p || (p.col === u.col && p.row === u.row)) return;
      segs.push({
        id: u.id, side: u.side, from: p, to: { col: u.col, row: u.row },
        seen: u.side === 'red' || u.dead || !!state.visible.red[u.id]   // 打死的那个：它死在你眼前
      });
    });
    trails.push({ turn: state.turn - 1, segs: segs, plans: plans });
    playedRed.push(JSON.parse(JSON.stringify(redOrders)));
    saveRecord();
    pending = {}; moveMode = false;
    /* 看不见的条目不建 DOM（els 里留 null，位置对齐不变）：没演到它，也就没得点亮 */
    const els = fresh.map(e => reportable(e) ? addLog(e) : null);
    els.forEach((e, i) => { if (e) e.dataset.idx = i; });   // 回放用它核对「点亮的那条 = 正在演的那条」
    /* 演完之后提示行要说什么，先算好（回放结束时 finishPlay 会把它写上去） */
    let tail;
    if (state.winner) {
      tail = state.winner === 'red' ? '红方达成目标。可点「重开」换种子再来。' : '蓝方达成目标。可点「重开」换种子再来。';
    } else {
      const missed = plans.filter(p => {
        const s = segs.find(x => x.id === p.id);
        return !(s && s.to.col === p.to.col && s.to.row === p.to.row);
      });
      if (missed.length) tail = '第 ' + (state.turn - 1) + ' 回合：' + missed.map(p => p.name).join('、') +
        ' 没走到计划格（金色虚线 = 当时的计划，彩色实线 = 实际轨迹）—— 原因见右栏播报。';
      else if (plans.length) tail = '第 ' + (state.turn - 1) + ' 回合：移动令都走到了计划格。继续下令，或再推进一回合。';
      else tail = '第 ' + (state.turn - 1) + ' 回合结算完成。给单位下令，或再推进一回合。';
    }
    updateJump();          // 先更新跳转链接：结算画面里的「看这一局的回放」要用最新的一条
    /* 一场戏：按事件顺序演，演到哪条点亮哪条播报 —— 想直接看结果就点棋盘/按钮跳过 */
    startPlay(buildCues(fresh, els, prev), prev, sight, tail);
    render();              // 回放已开张：按钮变成「结算中… 点此跳过」、状态行改口
    setHint('正在演第 ' + (state.turn - 1) + ' 回合的结算 —— 右栏播报会一条一条亮起来；点棋盘可跳过。');
    return fresh;
  }

  /* ================= 上手引导 ================= */
  /* 只有第一次打开才自动弹；关过就记住（存不下就每次弹，不值得为它报错） */
  const GUIDE_KEY = 'siduchishui.guide.seen';
  function guideSeen() { try { return localStorage.getItem(GUIDE_KEY) === '1'; } catch (err) { return false; } }
  function openGuide() { guide.hidden = false; }
  function closeGuide(markSeen) {
    guide.hidden = true;
    if (markSeen !== false) { try { localStorage.setItem(GUIDE_KEY, '1'); } catch (err) { /* 忽略 */ } }
  }

  function doReset(seedArg) {
    const seed = (seedArg != null) ? seedArg : (parseInt(seedRange.value, 10) || 7);
    seedRange.value = seed;
    seedLabel.textContent = seed;
    seedNow.textContent = seed;
    state = C.makeState(seed);
    pending = {}; selected = null; moveMode = false; anim = null;
    litLog(null);
    trails = [];
    playedRed = [];
    resultDismissed = false;
    logEl.innerHTML = '';
    document.querySelectorAll('#crtTable td').forEach(td => td.classList.remove('hit'));
    result.hidden = true;
    guide.hidden = guideSeen();
    buildCRT();
    render();
    updateJump();
    setHint('种子 ' + seed + ' 已就位。点地图上的红军单位下令，然后「推进一回合」；不动的单位按「固守」结算。');
  }

  /* ================= 交互 ================= */
  document.querySelectorAll('[data-order]').forEach(function (b) {
    b.addEventListener('click', function () {
      if (!selected || selected.exited || selected.dead) { setHint('先点地图上的红军单位，再下命令。'); return; }
      const t = b.dataset.order;
      if (t === 'move') { moveMode = true; setHint('移动：点击地图上的目标格（赤水河不可通行）。'); render(); return; }
      pending[selected.id] = { type: t };
      moveMode = false;
      if (t === 'attack') {
        const adj = C.visibleFoes(state, 'red', selected).filter(f => C.manhattan(selected, f) === 1);
        setHint(adj.length ? selected.name + ' → 攻击 ' + adj[0].name
          : '注意：' + selected.name + ' 相邻没有已发现的敌军，攻击命令会落空（按固守结算）。');
      } else if (t === 'withdraw') {
        setHint(selected.name + ' → 脱离：向已发现敌军的反方向后撤一格。');
      } else {
        setHint(selected.name + ' → ' + ORDER_NAME[t] + '。');
      }
      render();
    });
  });

  /* 「到不了」也得分清是为什么：真寻路已经证明绕不过去，那就拿一条只算地形的
     路线走一遍，这条线上第一个被占住的格子就是堵点 —— 光看目标格的邻居不够用，
     堵点常在更上游（渡口东岸一被站住，连对岸的西岸格都到不了） */
  function whyUnreachable(to) {
    const b = C.unitAt(state, to.col, to.row);
    if (b) return C.placeName(to.col, to.row) + '上有' + b.name;
    const hits = C.routeBlockers(state, selected, to);
    if (hits && hits.length) {
      const h = hits[0];
      const gate = C.GATES.some(g => g.col === h.col && g.row === h.row);
      const more = hits.length > 1 ? '，后面还有 ' + (hits.length - 1) + ' 处堵点' : '';
      return '去路被' + h.unit.name + '（在 ' + C.placeName(h.col, h.row) + '）挡住' + more +
        (gate ? '，渡口东岸只有这一条接近路' : '') +
        (h.unit.side === 'blue' ? ' —— 先下「攻击」打掉它，或换个目标格'
                                : ' —— 先给它下别的命令，让它挪开');
    }
    return '去路被地形隔断（赤水河与陡坡）';
  }

  /* 下移动令要走一遍行军预告：代价不在下单时说清楚，玩家只能靠读心猜坡度。
     计划算出来就存进命令里 —— 引擎按同一条路径行军，走不通才改道并在播报里说明。
     没通路当场说「到不了」，别收下一个结算时才发现的空头命令 */
  function applyMoveOrder(col, row) {
    if (!C.passable({ col: col, row: row })) {
      setHint('该格不可通行（赤水河）。只有两处渡口可以过河。');
      return false;
    }
    if (selected.col === col && selected.row === row) {
      setHint(selected.name + ' 已经在 ' + C.placeName(col, row) + ' 上，原地不动就不用下令。选别的目标格。');
      return false;
    }
    const pl = C.planMove(state, selected, { col: col, row: row });
    if (!pl) {
      setHint('到不了 ' + C.placeName(col, row) + '：' + whyUnreachable({ col: col, row: row }) + '。');
      return false;
    }
    pending[selected.id] = { type: 'move', to: { col: col, row: row }, plan: pl };
    moveMode = false;
    setHint('已下令：' + selected.name + ' → ' + C.placeName(col, row) + '。' +
      planLong(selected, pending[selected.id]) + '。可继续给其他单位下令，或点「推进一回合」。');
    render();
    return true;
  }

  canvas.addEventListener('click', function (e) {
    if (anim) { finishPlay(); setHint('已跳到结果。'); return; }   // 结算演出中：点棋盘 = 跳过
    const rect = canvas.getBoundingClientRect();
    const col = Math.floor((e.clientX - rect.left - PAD) / CELL);
    const row = Math.floor((e.clientY - rect.top - PAD) / CELL);
    if (col < 0 || col >= C.COLS || row < 0 || row >= C.ROWS) return;
    if (moveMode && selected) { applyMoveOrder(col, row); return; }
    const u = state.units.find(x => x.side === 'red' && !x.exited && !x.dead && x.col === col && x.row === row);
    if (u) { selected = u; setHint(selText(u)); render(); }
    else setHint('此处没有可选的红军单位。点红军棋子选中，或点「移动」后再点目标格。');
  });

  canvas.addEventListener('mousemove', function (e) {
    const rect = canvas.getBoundingClientRect();
    const col = Math.floor((e.clientX - rect.left - PAD) / CELL);
    const row = Math.floor((e.clientY - rect.top - PAD) / CELL);
    canvas.style.cursor = (col >= 0 && col < C.COLS && row >= 0 && row < C.ROWS) ? (moveMode ? 'crosshair' : 'pointer') : 'default';
  });

  resolveBtn.addEventListener('click', function () {
    if (anim) finishPlay(); else doTurn();      // 演出中这个按钮就是「跳过」（render 里换的文案）
  });
  resetBtn.addEventListener('click', function () { doReset(); });
  clearBtn.addEventListener('click', function () { pending = {}; moveMode = false; setHint('已清空本回合命令。'); render(); });
  autoChk.addEventListener('change', function () { autoRed = autoChk.checked; setHint(autoRed ? '红方已交给 AI —— 点「推进一回合」即可看完整循环。' : '红方由你下令。'); render(); });
  fogChk.addEventListener('change', function () { render(); });
  reachChk.addEventListener('change', function () { render(); });
  reachRange.addEventListener('input', function () { reachLabel.textContent = reachRange.value + ' 小时'; render(); });
  seedRange.addEventListener('input', function () { seedLabel.textContent = seedRange.value; });
  guideBtn.addEventListener('click', openGuide);
  guideOk.addEventListener('click', function () { closeGuide(); setHint('点红军单位 → 点命令 → 点「推进一回合」。金虚线圈着的是还没下令的单位。'); });
  guideRules.addEventListener('click', function () { closeGuide(); setHint('规则在右栏「一分钟读懂」，点标题展开（7 条）；战斗结算表（CRT）在棋盘下方，最近一次战果就写在那一行上，要看表点标题展开。'); });
  guideAI.addEventListener('click', function () {
    autoChk.checked = true; autoRed = true; closeGuide();
    setHint('红方已交给 AI —— 点「推进一回合」看完整循环。');
    render();
  });
  againBtn.addEventListener('click', function () { doReset(state.seed % 99 + 1); });
  retryBtn.addEventListener('click', function () { doReset(state.seed); });
  closeResult.addEventListener('click', function () { resultDismissed = true; result.hidden = true; setHint('棋盘还在，可以点「看这一局的回放」或「重开」。'); });
  window.addEventListener('resize', function () { sizeBoard(); render(); });
  /* 面板从隐藏变为可见时不一定有 resize，visibilitychange 补一刀 */
  document.addEventListener('visibilitychange', function () { sizeBoard(); render(); });
  /* 结算表展开 / 收起会改棋盘容器的高度：重新量一次，棋盘永远是一屏看全的 */
  crtBox.addEventListener('toggle', function () { sizeBoard(); render(); });
  window.addEventListener('keydown', function (e) {
    if (e.code === 'Space' && !/^(INPUT|BUTTON|SELECT|TEXTAREA)$/.test(e.target.tagName)) {
      e.preventDefault();
      if (anim) finishPlay(); else doTurn();
    }
  });

  /* ================= 自动化接口 ================= */
  window.__core = {
    Core: C,
    get state() { return state; },
    get pending() { return pending; },
    get trails() { return trails; },
    info: function () {
      return {
        turn: state.turn, winner: state.winner, exited: state.exited, logLen: state.log.length,
        unitPos: state.units.map(u => u.id + ':' + u.col + ',' + u.row + (u.exited ? '(渡河)' : '') + (u.dead ? '(退出)' : '')),
        visibleRed: Object.keys(state.visible.red).filter(k => state.visible.red[k]),
        visibleBlue: Object.keys(state.visible.blue).filter(k => state.visible.blue[k]),
        lastCombat: state.lastCombat,
        errors: errors.slice(0, 6)
      };
    },
    /* step 是「推进 n 回合并给我结果」：每回合把结算演出直接放完，不让它挡着读状态。
       要观察演出本身用 push() / play() / skip() */
    step: function (n) {
      n = n || 1;
      for (let i = 0; i < n; i++) { if (state.winner) break; doTurn(); finishPlay(); }
      return this.info();
    },
    push: function () { doTurn(); return this.play(); },        // 「推进一回合」按钮那一下
    play: function () {
      if (!anim) return { playing: false, i: -1, n: 0, kind: 'none', unitId: null, to: null, kinds: [], view: {}, lit: null, litIdx: null, elIdx: '' };
      const c = anim.cues[anim.i] || null;
      const view = {};
      for (const id in anim.view) view[id] = anim.view[id].col + ',' + anim.view[id].row + ':' + anim.view[id].str;
      return {
        playing: true, i: anim.i, n: anim.cues.length, kind: c ? c.kind : 'end',
        unitId: c ? (c.mv ? c.mv.id : (c.hurt ? c.hurt.id : c.kill)) || null : null,
        to: c && c.mv ? c.mv.to.col + ',' + c.mv.to.row : null,
        kinds: anim.cues.map(x => x.kind), view: view,
        /* 点亮的那条播报：类名给人看，dataset.idx 给断言用（桩 DOM 的 textContent 是空的）。
           elIdx = 每一步对应的播报序号（``=这一步看不见，没有 DOM），用来断言「灯跟着演出走」 */
        lit: litEl ? String(litEl.className) : null,
        litIdx: litEl ? String(litEl.dataset.idx) : null,
        elIdx: anim.cues.map(x => (x.el && x.el.dataset.idx != null) ? String(x.el.dataset.idx) : '').join(',')
      };
    },
    skip: function () { finishPlay(); return this.ui(); },
    setAuto: function (v) { autoChk.checked = !!v; autoRed = !!v; render(); },
    setPending: function (id, order) { pending[id] = order; render(); },
    orderMove: function (id, col, row) {
      selected = state.units.find(u => u.id === id) || selected;
      moveMode = true;
      return { ok: applyMoveOrder(col, row), hint: hintLine.textContent };
    },
    setSelected: function (id) { selected = state.units.find(u => u.id === id) || null; render(); },
    setReach: function (on, hours) {
      if (on !== undefined) reachChk.checked = !!on;
      if (hours != null) { reachRange.value = hours; reachLabel.textContent = hours + ' 小时'; }
      render();
      return { on: reachChk.checked, hours: +reachRange.value, n: reachCells ? reachCells.size : 0 };
    },
    jumpUrl: function () { return mapLink.href; },
    record: function () {
      try { return JSON.parse(localStorage.getItem('siduchishui.sim.' + state.seed) || 'null'); }
      catch (err) { return null; }
    },
    reset: function (seed) { if (seed != null) seedRange.value = seed; doReset(); return this.info(); },
    layout: function () { sizeBoard(); render(); return this.ui(); },
    ui: function () {
      return {
        cell: CELL, pad: PAD, canvasW: canvas.width, canvasH: canvas.height,
        guideHidden: !!guide.hidden, resultHidden: !!result.hidden,
        resultTitle: resultTitle.textContent, resultWhy: resultWhy.textContent,
        resultKeys: resultKeyCount, resultNote: resultNote.textContent,
        resultLink: resultLink.href, turnsLeft: turnsLeftLabel.textContent,
        orderStatus: orderStatus.textContent,
        hint: hintLine.textContent,
        reachOn: reachChk.checked, reachHours: +reachRange.value, reachN: reachCells ? reachCells.size : 0,
        trailN: trails.length,
        trailSegs: trails.length ? trails[trails.length - 1].segs.length : 0,
        trailPlans: trails.length ? trails[trails.length - 1].plans.length : 0,
        drawnSegs: drawnSegs,          // 上一次真画出来的实况线段数（看不见的蓝军行军不画）
        drawnBlue: drawnBlue,          // 上一次真画在棋盘上的蓝军棋子数
        drawnArrows: drawnArrows,      // 上一次真画出来的动向箭头数
        playing: !!anim, cueI: anim ? anim.i : -1, cueN: anim ? anim.cues.length : 0,
        litCls: litEl ? String(litEl.className) : '', litIdx: litEl ? String(litEl.dataset.idx) : '',
        resolveLabel: resolveBtn.textContent,
        crtOpen: !!crtBox.open, crtNow: crtNow.textContent,
        missionRedDone: missionRed.classList.contains('done'),
        missionBlueDone: missionBlue.classList.contains('done'),
        bannerCls: banner.className, bannerText: banner.textContent,
        exitLabel: exitLabel.textContent,
        seedNow: seedNow.textContent
      };
    },
    guide: function (open) {
      if (open === undefined) return { hidden: !!guide.hidden, seen: guideSeen() };
      if (open) openGuide(); else closeGuide();
      return { hidden: !!guide.hidden, seen: guideSeen() };
    }
  };

  /* ================= 启动 ================= */
  const q = new URLSearchParams(location.search);
  if (q.has('seed')) seedRange.value = q.get('seed');
  if (q.get('auto') === '1') autoChk.checked = true;
  autoRed = autoChk.checked;
  doReset();
  /* ?guide=1 强制弹、?guide=0 强制不弹（回归脚本用），都不写「已看过」 */
  const wantGuide = q.get('guide');
  if (wantGuide === '1') openGuide();
  else if (wantGuide === '0') closeGuide(false);
})();
