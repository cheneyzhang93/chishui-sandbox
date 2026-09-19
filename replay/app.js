/* 四渡赤水 · 态势沙盘 —— 静态播放器原型
 * 数据驱动：scenario.js 提供时间轴数据，本文件只负责按时间插值、渲染与镜头。
 */
(function () {
  'use strict';

  const DUR = DURATION;
  const S = SCENARIO;
  const state = { t: 0, playing: false, speed: 1, autoCam: true };
  let camDirty = true;

  /* ---------- 底图样式：卫星影像 / 暗色指挥图 / 高程（DEM） ---------- */
  const style = {
    version: 8,
    sources: {
      'bm-img': {
        type: 'raster',
        tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
        tileSize: 256, maxzoom: 18,
        attribution: 'Imagery © Esri, Maxar, Earthstar Geographics'
      },
      'bm-dark': {
        type: 'raster',
        tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}'],
        tileSize: 256, maxzoom: 16,
        attribution: 'Basemap © Esri, HERE, Garmin, © OpenStreetMap contributors'
      },
      dem: {
        type: 'raster-dem',
        tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
        encoding: 'terrarium', tileSize: 256, maxzoom: 13
      }
    },
    layers: [
      { id: 'bm-img', type: 'raster', source: 'bm-img' },
      { id: 'bm-dark', type: 'raster', source: 'bm-dark', layout: { visibility: 'none' } }
    ]
  };

  const map = new maplibregl.Map({
    container: 'map',
    style: style,
    center: [106.55, 27.95],
    zoom: 8.4,
    pitch: 35,
    bearing: 0,
    antialias: true,
    attributionControl: { compact: true }
  });

  window.__map = map;
  window.__errors = [];
  let demWarned = false;
  map.on('error', function (e) {
    const msg = (e && e.error && e.error.message) || String(e);
    window.__errors.push(msg);
    console.warn('[map]', msg);
    if (!demWarned && /terrarium|elevation-tiles-prod|dem/.test(msg)) {
      demWarned = true;
      const st = document.getElementById('status');
      if (st) st.textContent = '高程数据不可达：三维地形与晕渲已跳过';
    }
  });

  // 加载看门狗：CDN 被拦或页面处于隐藏标签页时给出可读原因
  setTimeout(function () {
    if (map.loaded()) return;
    const st = document.getElementById('loading');
    if (st && !st.classList.contains('off')) {
      st.textContent = '尚未加载完成：可能无法访问 CDN（unpkg / 瓦片服务），或本页处于后台隐藏标签页';
    }
  }, 12000);

  map.on('load', function () {
    const el = document.getElementById('loading');
    if (el) el.classList.add('off');
    initTerrain();
    addTokenImages();
    addDataLayers();
    applyUrlParams();
    requestAnimationFrame(loop);
  });

  /* 便于截图与分享：?t=35 定位时刻，?play=1 自动播放，?basemap=dark 切底图，?cam=0 关闭自动镜头 */
  function applyUrlParams() {
    const q = new URLSearchParams(location.search);
    if (q.has('t')) state.t = Math.max(0, Math.min(DUR, parseFloat(q.get('t')) || 0));
    if (q.get('basemap') === 'dark') {
      els.basemap.value = 'dark';
      els.basemap.dispatchEvent(new Event('change'));
    }
    if (q.get('cam') === '0') { state.autoCam = false; els.autoCam.checked = false; }
    if (q.get('log') === '1') els.logPanel.classList.add('show');
    camDirty = true;
    if (q.get('play') === '1') setPlaying(true);
  }

  /* ---------- 三维地形 ---------- */
  function initTerrain() {
    try {
      map.setTerrain({ source: 'dem', exaggeration: 1.35 });
      map.addLayer({
        id: 'hills', type: 'hillshade', source: 'dem',
        layout: { visibility: 'none' },
        paint: {
          'hillshade-exaggeration': 0.42,
          'hillshade-shadow-color': '#0a0e14',
          'hillshade-highlight-color': '#ffffff',
          'hillshade-accent-color': '#2a3646'
        }
      });
    } catch (err) {
      console.warn('地形启用失败（DEM 不可用）', err);
    }
  }

  /* ---------- 生成军队标号图标（画布 → addImage） ---------- */
  function roundRect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  function makeToken(text, side, combat) {
    const R = 2, W = 58, H = 36;
    const c = document.createElement('canvas');
    c.width = W * R; c.height = H * R;
    const g = c.getContext('2d');
    g.scale(R, R);
    const bg = side === 'red' ? '#b3261e' : '#1f5fa9';
    const bd = side === 'red' ? '#ff8a80' : '#8fc4ff';
    roundRect(g, 2.5, 2.5, W - 5, H - 5, 7);
    g.fillStyle = bg; g.fill();
    g.lineWidth = 2; g.strokeStyle = bd; g.stroke();
    if (combat) {
      g.setLineDash([4, 3]);
      g.lineWidth = 2; g.strokeStyle = '#ffb74d';
      roundRect(g, 0.5, 0.5, W - 1, H - 1, 9);
      g.stroke();
      g.setLineDash([]);
    }
    const fs = Math.min(15, 42 / Math.max(2, text.length));
    g.font = 'bold ' + fs + 'px "Microsoft YaHei","PingFang SC",sans-serif';
    g.fillStyle = '#ffffff';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, W / 2, H / 2 + 0.5);
    return g.getImageData(0, 0, W * R, H * R);
  }

  function makeRing() {
    const R = 2, W = 72, H = 72;
    const c = document.createElement('canvas');
    c.width = W * R; c.height = H * R;
    const g = c.getContext('2d');
    g.scale(R, R);
    g.setLineDash([8, 6]);
    g.lineWidth = 2.5;
    g.strokeStyle = '#ffb74d';
    g.beginPath();
    g.arc(W / 2, H / 2, 25, 0, Math.PI * 2);
    g.stroke();
    g.setLineDash([]);
    g.lineWidth = 1;
    g.strokeStyle = 'rgba(255,183,77,.5)';
    g.beginPath();
    g.arc(W / 2, H / 2, 32, 0, Math.PI * 2);
    g.stroke();
    return g.getImageData(0, 0, W * R, H * R);
  }

  /* 中文标号一律走画布图标：style 里没有 glyphs 字体服务，text-field 无法渲染汉字 */
  const LABEL_FONT = '600 12px "Microsoft YaHei","PingFang SC",sans-serif';
  const meas = document.createElement('canvas').getContext('2d');

  function makeLabel(text, color, dashed) {
    const R = 2, fs = 12, padX = 7, padY = 5;
    meas.font = LABEL_FONT;
    const W = Math.ceil(meas.measureText(text).width) + padX * 2;
    const H = fs + padY * 2;
    const c = document.createElement('canvas');
    c.width = W * R; c.height = H * R;
    const g = c.getContext('2d');
    g.scale(R, R);
    roundRect(g, 0.75, 0.75, W - 1.5, H - 1.5, 4);
    g.fillStyle = 'rgba(6,9,14,.76)'; g.fill();
    if (dashed) g.setLineDash([3, 2]);
    g.lineWidth = 1; g.globalAlpha = 0.9;
    g.strokeStyle = color; g.stroke();
    g.setLineDash([]); g.globalAlpha = 1;
    g.font = LABEL_FONT;
    g.fillStyle = color;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, W / 2, H / 2 + 0.5);
    return g.getImageData(0, 0, W * R, H * R);
  }

  const PLACE_COLOR = { city: '#dfe6ee', battle: '#ffd166', ferry: '#7fe7ff' };
  function placeColor(p) {
    return p.certainty === '待核' ? '#ffd166' : (PLACE_COLOR[p.type] || '#dfe6ee');
  }

  const EVENT_COLOR = {
    intel: '#b39ddb', battle: '#ffb74d', decision: '#ffe082', cross: '#8ef0c8', move: '#e8e8e8'
  };

  function addTokenImages() {
    S.units.forEach(function (u) {
      map.addImage(u.id, makeToken(u.token, u.side, false), { pixelRatio: 2 });
      map.addImage(u.id + '-c', makeToken(u.token, u.side, true), { pixelRatio: 2 });
    });
    map.addImage('ring', makeRing(), { pixelRatio: 2 });
    S.places.forEach(function (p) {
      const c = placeColor(p);
      map.addImage('pl-' + p.id, makeLabel(p.name, c, p.certainty === '待核'), { pixelRatio: 2 });
    });
    S.events.forEach(function (e, i) {
      map.addImage('ev-' + i, makeLabel(e.label, EVENT_COLOR[e.kind] || '#e8e8e8', false), { pixelRatio: 2 });
    });
  }

  /* ---------- 数据图层 ---------- */
  const EMPTY = { type: 'FeatureCollection', features: [] };

  function plannedFC() {
    const feats = [];
    S.tracks.forEach(function (tr) {
      const u = unitById(tr.unitId);
      const pts = [];
      tr.segments.forEach(function (s) {
        s.points.forEach(function (p) {
          const last = pts[pts.length - 1];
          if (!last || last[0] !== p[0] || last[1] !== p[1]) pts.push(p);
        });
      });
      if (pts.length > 1) {
        feats.push({
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: pts },
          properties: { side: u.side }
        });
      }
    });
    return { type: 'FeatureCollection', features: feats };
  }

  function placesFC() {
    return {
      type: 'FeatureCollection',
      features: S.places.map(function (p) {
        return {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: p.lonlat },
          properties: { name: p.name, type: p.type, icon: 'pl-' + p.id }
        };
      })
    };
  }

  function addDataLayers() {
    map.addSource('planned', { type: 'geojson', data: plannedFC() });
    map.addSource('traveled', { type: 'geojson', data: EMPTY });
    map.addSource('leaders', { type: 'geojson', data: EMPTY });
    map.addSource('units', { type: 'geojson', data: EMPTY });
    map.addSource('events', { type: 'geojson', data: EMPTY });
    map.addSource('places', { type: 'geojson', data: placesFC() });

    map.addLayer({
      id: 'planned', type: 'line', source: 'planned',
      paint: {
        'line-color': ['match', ['get', 'side'], 'red', '#ff5b52', '#57a8ff'],
        'line-width': 1.4, 'line-dasharray': [2, 2], 'line-opacity': 0.4
      }
    });
    map.addLayer({
      id: 'traveled', type: 'line', source: 'traveled',
      paint: {
        'line-color': ['match', ['get', 'side'], 'red', '#ff3b30', '#2f8bff'],
        'line-width': 3, 'line-opacity': 0.95
      }
    });
    map.addLayer({
      id: 'places-dot', type: 'circle', source: 'places',
      filter: ['!=', ['get', 'type'], 'city'],
      paint: {
        'circle-radius': 4,
        'circle-color': ['match', ['get', 'type'], 'ferry', '#7fe7ff', 'battle', '#ffd166', '#e8e8e8'],
        'circle-stroke-color': '#000', 'circle-stroke-width': 1
      }
    });
    map.addLayer({
      id: 'places', type: 'symbol', source: 'places',
      layout: {
        'icon-image': ['get', 'icon'],
        'icon-size': 1,
        'icon-anchor': 'top',
        'icon-offset': [0, 7]
      }
    });
    map.addLayer({
      id: 'leaders', type: 'line', source: 'leaders',
      paint: {
        'line-color': ['match', ['get', 'side'], 'red', '#ff8a80', '#8fc4ff'],
        'line-width': 1, 'line-dasharray': [3, 2], 'line-opacity': 0.6
      }
    });
    map.addLayer({
      id: 'units', type: 'symbol', source: 'units',
      layout: {
        'icon-image': ['get', 'icon'],
        'icon-size': 1,
        'icon-allow-overlap': true,
        'icon-ignore-placement': true
      }
    });
    map.addLayer({
      id: 'events-ring', type: 'symbol', source: 'events',
      layout: {
        'icon-image': 'ring',
        'icon-size': 1,
        'icon-allow-overlap': true,
        'icon-ignore-placement': true
      }
    });
    map.addLayer({
      id: 'events-label', type: 'symbol', source: 'events',
      layout: {
        'icon-image': ['get', 'icon'],
        'icon-size': 1,
        'icon-anchor': 'bottom',
        'icon-offset': [0, -40],
        'icon-allow-overlap': true,
        'icon-ignore-placement': true
      }
    });
  }

  /* ---------- 几何插值 ---------- */
  function segLens(pts) {
    const lens = []; let total = 0;
    for (let i = 1; i < pts.length; i++) {
      const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      lens.push(d); total += d;
    }
    return { lens: lens, total: total };
  }

  function sampleAlong(pts, f) {
    if (pts.length === 1 || f <= 0) return pts[0].slice();
    if (f >= 1) return pts[pts.length - 1].slice();
    const m = segLens(pts);
    let target = f * m.total;
    for (let i = 0; i < m.lens.length; i++) {
      if (target <= m.lens[i]) {
        const r = m.lens[i] === 0 ? 0 : target / m.lens[i];
        return [
          pts[i][0] + (pts[i + 1][0] - pts[i][0]) * r,
          pts[i][1] + (pts[i + 1][1] - pts[i][1]) * r
        ];
      }
      target -= m.lens[i];
    }
    return pts[pts.length - 1].slice();
  }

  function partialPath(pts, f) {
    if (f <= 0) return [];
    if (f >= 1 || pts.length === 1) return pts.slice();
    const m = segLens(pts);
    let target = f * m.total;
    const out = [pts[0].slice()];
    for (let i = 0; i < m.lens.length; i++) {
      if (target >= m.lens[i]) {
        out.push(pts[i + 1].slice());
        target -= m.lens[i];
      } else {
        const r = m.lens[i] === 0 ? 0 : target / m.lens[i];
        out.push([
          pts[i][0] + (pts[i + 1][0] - pts[i][0]) * r,
          pts[i][1] + (pts[i + 1][1] - pts[i][1]) * r
        ]);
        break;
      }
    }
    return out;
  }

  const trackMap = {};
  S.tracks.forEach(function (tr) { trackMap[tr.unitId] = tr; });
  const unitMap = {};
  S.units.forEach(function (u) { unitMap[u.id] = u; });
  function unitById(id) { return unitMap[id]; }

  function unitAt(tr, t, seed) {
    const segs = tr.segments;
    if (t < segs[0].t0) return null;
    let active = null;
    for (let i = 0; i < segs.length; i++) {
      if (t >= segs[i].t0 && t <= segs[i].t1) { active = segs[i]; break; }
    }
    if (active) {
      const f = (t - active.t0) / Math.max(0.0001, active.t1 - active.t0);
      const base = sampleAlong(active.points, f);
      let pos = base;
      if (active.state === 'combat') {
        const j = 0.0035;
        pos = [base[0] + j * Math.sin(t * 6.3 + seed * 3.1),
               base[1] + j * Math.cos(t * 5.1 + seed * 2.3)];
      }
      return { pos: pos, state: active.state };
    }
    let prev = null;
    for (let i = 0; i < segs.length; i++) if (segs[i].t1 < t) prev = segs[i];
    if (prev) return { pos: prev.points[prev.points.length - 1].slice(), state: prev.state };
    return null;
  }

  function traveledPath(tr, t) {
    const out = [];
    for (let i = 0; i < tr.segments.length; i++) {
      const s = tr.segments[i];
      if (t <= s.t0) break;
      const part = (t >= s.t1) ? s.points.slice() : partialPath(s.points, (t - s.t0) / Math.max(0.0001, s.t1 - s.t0));
      part.forEach(function (p) {
        const last = out[out.length - 1];
        if (!last || last[0] !== p[0] || last[1] !== p[1]) out.push(p);
      });
      if (t < s.t1) break;
    }
    return out;
  }

  function cameraAt(t) {
    const ks = S.camera;
    if (t <= ks[0].t) return ks[0];
    for (let i = 1; i < ks.length; i++) {
      if (t <= ks[i].t) {
        const a = ks[i - 1], b = ks[i];
        const f = (t - a.t) / Math.max(0.0001, b.t - a.t);
        let db = b.bearing - a.bearing;
        while (db > 180) db -= 360;
        while (db < -180) db += 360;
        return {
          center: [a.center[0] + (b.center[0] - a.center[0]) * f,
                   a.center[1] + (b.center[1] - a.center[1]) * f],
          zoom: a.zoom + (b.zoom - a.zoom) * f,
          pitch: a.pitch + (b.pitch - a.pitch) * f,
          bearing: a.bearing + db * f
        };
      }
    }
    return ks[ks.length - 1];
  }

  /* ---------- 战法移标：同点位部队标号按屏幕距离散开，移标线指回真实位置 ---------- */
  const SLOTS = [[-52, -24], [52, -24], [-80, 26], [80, 26], [-52, -60], [52, -60], [-110, 0], [110, 0]];
  let prevPairs = {};

  function displaceUnits(uf) {
    if (uf.length < 2) return [];
    const proj = uf.map(function (f) { return map.project(f.geometry.coordinates); });
    const parent = proj.map(function (_, i) { return i; });
    function find(x) { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; }
    const pairs = {};
    for (let i = 0; i < proj.length; i++) {
      for (let j = i + 1; j < proj.length; j++) {
        const key = uf[i].properties.uid + '|' + uf[j].properties.uid;
        const f = prevPairs[key] ? 1.6 : 1;   // 迟滞：已散开的保持散开，避免抖动
        const dx = Math.abs(proj[i].x - proj[j].x), dy = Math.abs(proj[i].y - proj[j].y);
        if (dx < 64 * f && dy < 40 * f) {
          const a = find(i), b = find(j);
          if (a !== b) parent[b] = a;
          pairs[key] = 1;
        }
      }
    }
    prevPairs = pairs;

    const groups = {};
    proj.forEach(function (_, i) { const r = find(i); (groups[r] = groups[r] || []).push(i); });

    const leaders = [];
    Object.keys(groups).forEach(function (k) {
      const g = groups[k];
      if (g.length < 2) return;
      g.forEach(function (idx, n) {
        const s = SLOTS[n % SLOTS.length];
        const trueLL = uf[idx].geometry.coordinates;
        const moved = map.unproject([proj[idx].x + s[0], proj[idx].y + s[1]]);
        uf[idx].geometry.coordinates = [moved.lng, moved.lat];
        leaders.push({
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: [trueLL, [moved.lng, moved.lat]] },
          properties: { side: uf[idx].properties.side }
        });
      });
    });
    return leaders;
  }

  /* ---------- 渲染循环 ---------- */
  const els = {
    play: document.getElementById('playBtn'),
    restart: document.getElementById('restartBtn'),
    slider: document.getElementById('timeSlider'),
    clock: document.getElementById('clock'),
    hist: document.getElementById('hist'),
    autoCam: document.getElementById('autoCam'),
    speed: document.getElementById('speedSel'),
    caption: document.getElementById('caption'),
    basemap: document.getElementById('basemapSel'),
    srcBtn: document.getElementById('srcBtn'),
    srcPanel: document.getElementById('srcPanel'),
    srcClose: document.getElementById('srcClose'),
    srcList: document.getElementById('srcList'),
    uncList: document.getElementById('uncList'),
    logBtn: document.getElementById('logBtn'),
    logPanel: document.getElementById('logPanel'),
    logClose: document.getElementById('logClose'),
    logList: document.getElementById('logList'),
    logScope: document.getElementById('logScope'),
    logGaps: document.getElementById('logGaps')
  };
  els.slider.max = String(DUR);

  let last = 0;
  function loop(now) {
    const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
    last = now;
    if (state.playing) {
      state.t += dt * state.speed;
      if (state.t >= DUR) { state.t = DUR; setPlaying(false); }
    }
    render(now / 1000);
    requestAnimationFrame(loop);
  }

  let lastCaption = null;
  const counts = { units: 0, events: 0, leaders: 0 };
  function render(wallSec) {
    const t = state.t;

    // 部队位置与行进轨迹
    const uf = [], tf = [];
    for (let i = 0; i < S.units.length; i++) {
      const u = S.units[i];
      const tr = trackMap[u.id];
      if (!tr) continue;
      const st = unitAt(tr, t, u.seed);
      if (st) {
        uf.push({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: st.pos },
          properties: { icon: st.state === 'combat' ? u.id + '-c' : u.id, side: u.side, uid: u.id }
        });
      }
      const path = traveledPath(tr, t);
      if (path.length > 1) {
        tf.push({
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: path },
          properties: { side: u.side }
        });
      }
    }
    const lf = displaceUnits(uf);
    const su = map.getSource('units');
    if (su) su.setData({ type: 'FeatureCollection', features: uf });
    const stv = map.getSource('traveled');
    if (stv) stv.setData({ type: 'FeatureCollection', features: tf });
    const sl = map.getSource('leaders');
    if (sl) sl.setData({ type: 'FeatureCollection', features: lf });
    counts.units = uf.length;
    counts.leaders = lf.length;

    // 事件环与标签
    const ef = [];
    for (let i = 0; i < S.events.length; i++) {
      const e = S.events[i];
      if (t >= e.t && t <= e.t + e.dur) {
        ef.push({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: e.pos },
          properties: { label: e.label, kind: e.kind, icon: 'ev-' + i }
        });
      }
    }
    const sev = map.getSource('events');
    if (sev) sev.setData({ type: 'FeatureCollection', features: ef });
    counts.events = ef.length;
    if (map.getLayer('events-ring')) {
      map.setLayoutProperty('events-ring', 'icon-size', 0.9 + 0.16 * Math.sin(wallSec * 4.2));
    }

    // 字幕
    let cap = null;
    for (let i = 0; i < S.captions.length; i++) {
      const c = S.captions[i];
      if (t >= c.t0 && t < c.t1) { cap = c.text; break; }
    }
    if (cap !== lastCaption) {
      lastCaption = cap;
      if (cap) { els.caption.textContent = cap; els.caption.classList.add('on'); }
      else { els.caption.classList.remove('on'); }
    }

    // 时钟与史实时间
    const mm = Math.floor(t / 60), ss = Math.floor(t % 60);
    const dm = Math.floor(DUR / 60), ds = Math.floor(DUR % 60);
    els.clock.textContent = pad(mm) + ':' + pad(ss) + ' / ' + pad(dm) + ':' + pad(ds);
    let mark = S.timeMarks[0].label;
    for (let i = 0; i < S.timeMarks.length; i++) {
      if (t >= S.timeMarks[i].t) mark = S.timeMarks[i].label;
    }
    els.hist.textContent = mark;
    if (document.activeElement !== els.slider) els.slider.value = String(t);
    updateLogActive(t);

    // 镜头
    if (state.autoCam && (state.playing || camDirty)) {
      map.jumpTo(cameraAt(t));
      camDirty = false;
    }
  }

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  function setPlaying(v) {
    state.playing = v;
    els.play.textContent = v ? '❚❚' : '▶';
  }

  /* ---------- 交互 ---------- */
  els.play.addEventListener('click', function () { setPlaying(!state.playing); });
  els.restart.addEventListener('click', function () {
    state.t = 0; camDirty = true;
  });
  els.slider.addEventListener('input', function () {
    state.t = parseFloat(els.slider.value);
    camDirty = true;
  });
  els.autoCam.addEventListener('change', function () {
    state.autoCam = els.autoCam.checked;
    camDirty = true;
  });
  els.speed.addEventListener('change', function () {
    state.speed = parseFloat(els.speed.value);
  });
  els.basemap.addEventListener('change', function () {
    const v = els.basemap.value;
    map.setLayoutProperty('bm-img', 'visibility', v === 'img' ? 'visible' : 'none');
    map.setLayoutProperty('bm-dark', 'visibility', v === 'dark' ? 'visible' : 'none');
    // 晕渲叠在高程晕渲上会糊掉影像底图，只在暗色指挥图下启用
    if (map.getLayer('hills')) {
      map.setLayoutProperty('hills', 'visibility', v === 'dark' ? 'visible' : 'none');
    }
  });
  els.srcBtn.addEventListener('click', function () { els.srcPanel.classList.add('show'); });
  els.srcClose.addEventListener('click', function () { els.srcPanel.classList.remove('show'); });
  els.logBtn.addEventListener('click', function () { els.logPanel.classList.add('show'); });
  els.logClose.addEventListener('click', function () { els.logPanel.classList.remove('show'); });
  els.logList.addEventListener('click', function (e) {
    if (e.target && e.target.closest && e.target.closest('a')) return;   // 地名链接走新标签页，不当跳段
    const li = (e.target && e.target.closest) ? e.target.closest('.mrec') : null;
    if (!li || !li.dataset || !li.dataset.t0) return;
    state.t = parseFloat(li.dataset.t0);
    camDirty = true;
  });
  window.addEventListener('keydown', function (e) {
    if (e.code === 'Space') { e.preventDefault(); setPlaying(!state.playing); }
    if (e.code === 'ArrowRight') { state.t = Math.min(DUR, state.t + 1); camDirty = true; }
    if (e.code === 'ArrowLeft') { state.t = Math.max(0, state.t - 1); camDirty = true; }
  });

  function fillSourcePanel() {
    els.srcList.innerHTML = S.sources.map(function (s) { return '<li>' + s + '</li>'; }).join('');
    els.uncList.innerHTML = S.uncertain.map(function (s) { return '<li class="u">' + s + '</li>'; }).join('');
  }

  /* ---------- 行军日志面板：marchLog（行军日志记录表）落到播放器上 ----------
     字段与《行军日志字段表》一致，逐条带出处与确定性；能核的填值，核不出的标「待核」。
     本片时段内没有记录的地方（1 月 25—26 日）不补故事，缺口在面板底部明写。 */
  const CERT_CLASS = { '标定': 'c-ok', '近似': 'c-approx', '待核': 'c-tbd' };
  const ACTION_CLASS = { '行军': 'a-march', '战斗': 'a-battle', '渡河': 'a-cross', '会议': 'a-meet' };
  let logRecs = [], logActive = -2;

  function dateCn(d) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d || '');
    return m ? (parseInt(m[2], 10) + '月' + parseInt(m[3], 10) + '日') : (d || '');
  }
  function mapHref(rec) {
    return '../samples/four-crossings.html?ll=' + rec.lonlat[0] + ',' + rec.lonlat[1] +
           '&name=' + encodeURIComponent(rec.placeName);
  }
  function mk(tag, cls, text) {
    const d = document.createElement(tag);
    if (cls) d.className = cls;
    if (text !== undefined && text !== null) d.textContent = text;
    return d;
  }

  function logRowEl(rec, range) {
    const li = mk('li', 'mrec' + (range ? '' : ' mrec-out'));
    if (range) { li.dataset.t0 = String(range.t0); li.dataset.t1 = String(range.t1); }
    const head = mk('div', 'mh');
    head.appendChild(mk('span', 'md', dateCn(rec.date)));
    const a = mk('a', 'mp', rec.placeName);
    a.href = mapHref(rec);
    a.target = '_blank';
    a.rel = 'noopener';
    a.title = '在四渡图上定位这个点位（坐标由本记录带过去）';
    head.appendChild(a);
    head.appendChild(mk('span', 'mc ' + (CERT_CLASS[rec.certainty] || 'c-approx'), rec.certainty));
    li.appendChild(head);

    const body = mk('div', 'mb');
    body.appendChild(mk('span', 'mu', rec.unitName));
    body.appendChild(mk('span', 'ma ' + (ACTION_CLASS[rec.action] || 'a-march'), rec.action));
    body.appendChild(mk('span', 'ms', rec.timeRange || '（时段未载）'));
    li.appendChild(body);

    li.appendChild(mk('div', 'msrc', '出处：' + rec.sourceRef + '（' + rec.sourceType + '）' +
      (rec.sourceLocator ? ' · ' + rec.sourceLocator : '')));
    if (rec.engagedWith) li.appendChild(mk('div', 'msrc', '交战对象：' + rec.engagedWith));
    if (rec.conflictNote) li.appendChild(mk('div', 'mcf', '异说：' + rec.conflictNote));
    if (rec.eventCardRef) li.appendChild(mk('div', 'msrc', '事件卡：' + rec.eventCardRef));
    if (!range) li.appendChild(mk('div', 'mout', '不在本片时段内（前情）'));
    return li;
  }

  function renderLogPanel() {
    if (typeof MARCH_LOG === 'undefined') return;
    logRecs = MARCH_LOG.map(function (r) { return { rec: r, range: marchLogRange(r) }; })
      .sort(function (a, b) {
        if (a.rec.date !== b.rec.date) return a.rec.date < b.rec.date ? -1 : 1;
        const ta = a.range ? a.range.t0 : -1, tb = b.range ? b.range.t0 : -1;
        return ta - tb;
      });
    els.logScope.textContent = MARCH_LOG_META.scope + ' · 表名：' + MARCH_LOG_META.table +
      ' · 字段表：' + MARCH_LOG_META.schema;
    els.logList.innerHTML = '';
    logRecs.forEach(function (it) { els.logList.appendChild(logRowEl(it.rec, it.range)); });
    els.logGaps.textContent = '本表缺口（待补）\n' +
      MARCH_LOG_META.gaps.map(function (g) { return '· ' + g; }).join('\n');
    logActive = -2;
  }

  /* 当前时刻落在哪几条记录的时段里 → 高亮；已经播过的置灰 */
  function updateLogActive(t) {
    let idx = -1;
    for (let i = 0; i < logRecs.length; i++) {
      const r = logRecs[i].range;
      if (r && t >= r.t0 && t < r.t1) { idx = i; break; }
    }
    if (idx === logActive) return;
    logActive = idx;
    const items = els.logList.children;
    for (let i = 0; i < items.length; i++) {
      const r = logRecs[i] ? logRecs[i].range : null;
      items[i].classList.toggle('on', i === idx);
      items[i].classList.toggle('past', !!r && t >= r.t1);
    }
  }

  /* 两块纯数据面板不依赖底图：在这里渲染，CDN 被拦或瓦片挂了也照样能看 */
  fillSourcePanel();
  renderLogPanel();

  /* ---------- 调试接口（自动化验证用） ---------- */
  window.__sandbox = {
    state: state,
    duration: DUR,
    setTime: function (v) { state.t = Math.max(0, Math.min(DUR, +v)); camDirty = true; },
    play: function () { setPlaying(true); },
    pause: function () { setPlaying(false); },
    info: function () {
      let imgs = 0;
      try { imgs = map.listImages().length; } catch (err) { /* 样式未就绪 */ }
      return {
        t: state.t, playing: state.playing,
        loaded: map.loaded(),
        terrain: !!map.getTerrain(),
        units: counts.units,
        events: counts.events,
        leaders: counts.leaders,
        images: imgs
      };
    },
    /* 行军日志面板状态：行数、当前高亮行、每行的确定性标记与地名链接 */
    log: function () {
      const items = els.logList.children, rows = [];
      for (let i = 0; i < items.length; i++) {
        const q = items[i];
        const a = q.children && q.children[0] ? q.children[0].children[1] : null;
        rows.push({
          on: q.classList.contains('on'),
          past: q.classList.contains('past'),
          out: q.classList.contains('mrec-out'),
          text: (q.textContent || '').replace(/\s+/g, ' ').trim(),
          map: a ? a.getAttribute('href') : ''
        });
      }
      return {
        open: els.logPanel.classList.contains('show'),
        rows: rows,
        active: logActive,
        scope: els.logScope.textContent,
        gaps: els.logGaps.textContent
      };
    }
  };
})();
