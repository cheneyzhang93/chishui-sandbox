/* 格网 ↔ 经纬度：示意棋盘落到真实地图上的**唯一**映射
 *
 * core/engine.js 是一张抽象棋盘（12 列 × 9 行，col 0 = 西岸脱离区，col 1 = 赤水河），
 * 它刻意不带经纬度。这个文件是它与真实地理之间唯一的接口，回答三个问题：
 *   1. 某一格在地图上的中心点在哪；
 *   2. 格网地名对应哪个经纬度（供地图定位）；
 *   3. 整张棋盘在地图上的范围与格子多边形（供地图叠加层）。
 *
 * 标定（示意，非真实境界）：
 *   对齐对象：(1,5) 土城渡口 ≈ 浑溪口 [105.985,28.300]，(2,5) 土城 ≈ 土城 [106.01,28.29]，
 *             (1,2) 元厚渡口 ≈ 元厚（猿猴）[105.94,28.40]，行 5 / 行 2 的行心与之对齐。
 *   尺度：每格 0.048° 经 × 0.036° 纬 ≈ 4.7 × 4.0 km，棋盘约 56 × 36 km。
 *
 * 已知不符（写在这里，不靠人记）：
 *   赤水河：真实河道在此段斜穿第 0—1 列，北端（元厚附近）偏到第 0 列；格网里的第 1 列是一条直列。
 *           元厚渡口与土城渡口相距约 4.4 km，而一格宽约 4.7 km —— 两处分别贴在第 1 列的东西边缘。
 *   青杠坡：格网把它放在土城东北 (4,3)；地图上的青杠坡标记 [106.045,28.285] 坐标待核，
 *           两者不重合（格网为示意）。
 *   镇址：OSM 的土城镇节点（105.9972,28.2792）落在 (2,6)、元厚镇节点（105.9340,28.3679）落在 (0,3)，
 *         与格网标定的土城 (2,5)、元厚渡口 (1,2) 各差约一格（镇治与渡口是否同址，待核）。
 *   结论：格网只能当「作战分区」看，不能当真实境界；渡口/土城三处落点误差约 1—2 km。
 */
(function (root) {
  'use strict';

  const COLS = 12, ROWS = 9;
  const CELL_LON = 0.048, CELL_LAT = 0.036;
  /* 由「(1,5) 格心 ≈ 浑溪口、(2,5) 格心 ≈ 土城」反推的左上角 */
  const WEST = 105.8905, NORTH = 28.4980;

  const EAST = WEST + COLS * CELL_LON;
  const SOUTH = NORTH - ROWS * CELL_LAT;

  /* 格网地名 → 真实经纬度。real = false 表示格网里的虚构要点，地图上没有对应地名。
     四处镇名（隆兴/回龙/程寨/三岔河）为 OSM Overpass 实测节点（2026-09-18，bbox 内的 place 节点），
     坐标即节点坐标；它们同时是 core/engine.js 命名表里的锚点。 */
  const PLACES = {
    '元厚渡口': { lonlat: [105.940, 28.400], real: true, note: '元厚（猿猴）' },
    '土城渡口': { lonlat: [105.985, 28.300], real: true, note: '浑溪口一带' },
    '土城': { lonlat: [106.010, 28.290], real: true, note: '' },
    '青杠坡': { lonlat: [106.045, 28.285], real: true, note: '地图上该点标「待核」' },
    '青杠坡隘口': { cell: [6, 2], real: false, note: '格网内设的要点，地图上无对应地名' },
    '隆兴镇': { lonlat: [106.0997, 28.2282], real: true, note: 'OSM 镇名节点（2026-09-18 实测），示意方位' },
    '回龙镇': { lonlat: [106.2061, 28.1900], real: true, note: 'OSM 镇名节点（2026-09-18 实测），示意方位' },
    '程寨镇': { lonlat: [106.3075, 28.4033], real: true, note: 'OSM 镇名节点（2026-09-18 实测），示意方位' },
    '三岔河镇': { lonlat: [106.3992, 28.4429], real: true, note: 'OSM 镇名节点（2026-09-18 实测），示意方位' }
  };

  const inGrid = (col, row) => col >= 0 && col < COLS && row >= 0 && row < ROWS;

  function cellCenter(col, row) {
    return [WEST + (col + 0.5) * CELL_LON, NORTH - (row + 0.5) * CELL_LAT];
  }
  function cellRing(col, row) {
    const w = WEST + col * CELL_LON, e = w + CELL_LON;
    const n = NORTH - row * CELL_LAT, s = n - CELL_LAT;
    return [[w, n], [e, n], [e, s], [w, s], [w, n]];
  }
  function pointToCell(lon, lat) {
    return { col: Math.floor((lon - WEST) / CELL_LON), row: Math.floor((NORTH - lat) / CELL_LAT) };
  }
  function terrainOf(col, row) {
    const map = root.Core && root.Core.MAP;
    return (map && map[row]) ? map[row][col] : null;
  }

  function cellPolygons() {
    const names = (root.Core && root.Core.PLACES) || {};
    const features = [];
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        const ch = terrainOf(col, row);
        features.push({
          type: 'Feature',
          properties: {
            col: col, row: row, key: col + ',' + row,
            terrain: ch,
            name: names[col + ',' + row] || null,
            west: col === 0
          },
          geometry: { type: 'Polygon', coordinates: [cellRing(col, row)] }
        });
      }
    }
    return { type: 'FeatureCollection', features: features };
  }

  function placeInfo(name) {
    const p = PLACES[name];
    if (!p) return null;
    return { lonlat: p.lonlat || cellCenter(p.cell[0], p.cell[1]), real: !!p.real, note: p.note || '' };
  }
  function placeLonLat(name) {
    const p = placeInfo(name);
    return p ? p.lonlat : null;
  }

  root.GridGeo = {
    COLS: COLS, ROWS: ROWS,
    WEST: WEST, NORTH: NORTH, EAST: EAST, SOUTH: SOUTH,
    CELL_LON: CELL_LON, CELL_LAT: CELL_LAT,
    PLACES: PLACES,
    bbox: function () { return [WEST, SOUTH, EAST, NORTH]; },
    cellCenter: cellCenter,
    cellRing: cellRing,
    cellPolygons: cellPolygons,
    pointToCell: pointToCell,
    terrainOf: terrainOf,
    placeInfo: placeInfo,
    placeLonLat: placeLonLat,
    note: '格网为示意棋盘（每格约 4.7 × 4.0 km），不对应真实境界；棋子为推演占位（红1/蓝1），不代表真实部队。'
  };
})(typeof window !== 'undefined' ? window : globalThis);
