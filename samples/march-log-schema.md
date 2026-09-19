# 样张 ③ 行军日志级字段表（土城 — 一渡赤水）

> 目的：把「行军路线」从一条画出来的曲线，升级成**一条能追到出处的数据记录**。
> 粒度声明：行军日志级 ＝ **日级 ＋ 地名级**。一天一条记录，落到「某日某部队在某地做某事」。
> 它不是逐小时战斗推演，也不承诺到连排级机动路线；几何形状在地图上仍是示意直线段，但**日期、地名、出处必须逐条可查**。

---

## 1. 表结构：`marchLog`（行军日志记录表）

| 字段名 | 中文标注 | 分组 | 类型 | 必填 | 取值 / 示例 | 说明 |
|---|---|---|---|---|---|---|
| `logId` | 日志记录标识 | 标识 | 字符串 | 是 | `tucheng-19350128-r3` | 全局唯一，建议 `地段-日期-部队` 组成 |
| `side` | 阵营 | 归属 | 枚举 | 是 | `red` 红军 / `blue` 国民党军 | 单盲情报内核靠这个字段区分可见性 |
| `unitId` | 部队标识 | 归属 | 字符串 | 是 | `r3` | 与动画 `units[].id` 对应 |
| `unitName` | 部队番号全称 | 归属 | 字符串 | 是 | `红三军团` | **写全称**，不写「三军团」「R3」这类简称 |
| `unitLevel` | 部队层级 | 归属 | 枚举 | 是 | `军团` / `军` / `师` / `旅` / `团` / `纵队` / `干部团` / `军委纵队` | 决定地图上是否展开子单位 |
| `parentUnitId` | 上级部队标识 | 归属 | 字符串 | 否 | `r1` | 用于折叠显示与统计汇总 |
| `date` | 日期 | 时间 | 日期 | 是 | `1935-01-28` | 一律用公历，格式 `YYYY-MM-DD` |
| `timeRange` | 时段 | 时间 | 字符串 | 否 | `拂晓` / `上午` / `午后` / `黄昏` / `夜` / `深夜` / `03:00-05:00` | **不知道就留空**，不要用「约」含糊过去 |
| `action` | 行动类型 | 行动 | 枚举 | 是 | `行军` / `宿营` / `集结` / `战斗` / `渡河` / `会议` / `侦察` / `佯动` / `待命` | 决定图标与动画节奏 |
| `placeName` | 当日主要活动地名 | 地理 | 字符串 | 是 | `土城·青杠坡` | 地名写法跟《中国历史地名大辞典》一类的规范写法 |
| `lonlat` | 坐标 | 地理 | 数值对 | 是 | `[106.045, 28.285]` | `[经度, 纬度]`，WGS84 |
| `coordCertainty` | 坐标确定性 | 确定性 | 枚举 | 是 | `标定` / `近似` / `待核` | 见第 3 节判定标准 |
| `fromPlaceName` | 出发地名 | 地理 | 字符串 | 否 | `土城` | 用于算当日方向与里程 |
| `toPlaceName` | 到达地名 | 地理 | 字符串 | 否 | `古蔺` | 同上 |
| `routeNote` | 路线说明 | 地理 | 字符串 | 否 | `经猿猴（今元厚）西渡` | 只写文献明确提到的经停点 |
| `distanceKm` | 当日里程（公里） | 地理 | 数值 | 否 | `—` | 无权威值时**留空**，不估算 |
| `engagedWith` | 交战对象 | 行动 | 字符串 | 否 | `川军（番号待核）` | 蓝军番号写全称，拿不准就标待核 |
| `lossNote` | 伤亡与损耗 | 行动 | 字符串 | 否 | `—` | 只在有权威数字时填，且必须带出处 |
| `sourceRef` | 出处 | 出处 | 字符串 | 是 | `《红军长征在贵州》系列报道·第十期` | 定稿须为权威出版物 / 档案 / 纪念馆馆藏 |
| `sourceType` | 出处类型 | 出处 | 枚举 | 是 | `档案` / `年表` / `战史` / `出版物` / `回忆录` / `日记` / `馆藏` / `地方志` / `网络` | `网络` 类型视为待升级 |
| `sourceLocator` | 出处定位 | 出处 | 字符串 | 否 | `第 12 页 / 1935 年 1 月 29 日条` | **定稿必须逐条标页码或条目号** |
| `certainty` | 记录确定性 | 确定性 | 枚举 | 是 | `标定` / `近似` / `待核` | 整条记录的总体标记，取字段中最保守者 |
| `conflictNote` | 异说提示 | 确定性 | 字符串 | 否 | `一说 1 月 28 日当晚，一说 29 日凌晨` | 文献冲突时**并列写出**，不选一个当定论 |
| `animRef` | 动画映射 | 挂接 | 字符串 | 否 | `tracks[].segments: id=tc-w1, t0=30, t1=54` | 指向 `scenario.js` 里的时间轴片段 |
| `eventCardRef` | 事件卡标识 | 挂接 | 字符串 | 否 | `card-tucheng-meeting` | 指向样张 ① 的事件卡，时间轴到点弹出 |

---

## 1.1 推演日志表（`simLog`）与行军日志记录表（`marchLog`）的差异

`core/replay.js` 把一局格子推演导出成与上表同构的一张表。落库名分为两个，**不要混用**：

- **`marchLog` = 行军日志记录表**：史料，字段与上表完全一致；
- **`simLog` = 推演日志表**：本局推演自动生成，**不是史料，不进史料库**。

同名字段含义一致，差异只有下面这几处 —— 这样地图回放与史实日志能共用一套消费代码，同时**一眼看出哪条是史料、哪条是推演**。

| 字段 | `marchLog`（史料） | `simLog`（推演） | 原因 |
|---|---|---|---|
| `date` | `1935-01-28` | **无此字段**（改用 `turn` + `clock` + `timeRange`） | 推演没有公历日期，只有回合与钟点（04:00 起算，每回合 2 小时） |
| `timeRange` | `拂晓` / `03:00-05:00` / 留空 | `第 3 回合 04:00—06:00` | 同上 |
| `unitName` | 番号全称，如 `红三军团` | 占位名加后缀：`红1（推演占位）` | 推演棋子不对应任何真实部队（占位番号是刻意的） |
| `sourceType` | `档案` / `年表` / `战史` / … | 新增取值 **`本局推演`** | 出处是一条可复现的命令，不是文献 |
| `certainty`、`coordCertainty` | `标定` / `近似` / `待核` | 新增取值 **`推演`** | 推演坐标取格心，不是史料标定 |
| `sourceRef`、`sourceLocator` | 出版物 + 页码 / 条目号 | `格子验证件 · 种子 N` / `index.html?seed=N&auto=1`（格子件在站点根） | 复现入口本身就是出处 |
| `rawText` | 无 | **新增字段**：该条记录对应的播报原文，多条用 `／` 连接 | 回放面板要显示人话，也便于回溯引擎判定 |
| `animRef` | `tracks[].segments: id=tc-w1, t0=30, t1=54` | `t<回合>`（对应地图页 `?game=N&turn=t`） | 挂接对象不同：一个是 90 秒动画，一个是回合 |
| `eventCardRef` | 事件卡标识 | 留空 | 推演暂无事件卡 |
| `unitLevel` | `军团` / `师` / `纵队` / … | 留空 | 占位番号没有层级，**不编** |

其余同名字段（`placeName` / `fromPlaceName` / `toPlaceName` / `lonlat` / `routeNote` / `engagedWith` / `lossNote`）含义一致；
`distanceKm` 一律留空 —— 格网里程不是实地里程，不估算。

**另有一张不是表的东西**：`frames[]` 态势快照（每回合一条），含各单位 `col` / `row` / `str` / `morale` / `fatigue` / `exited` / `dead` / `seenByRed`（红方当时是否看得见它）。
地图页的回放（`samples/four-crossings.html?game=<种子>`）用 `frames` 落点、用 `simLog` 写播报面板 —— 格心经纬度由 `core/grid-geo.js` 一处换算。

---

## 2. 示例记录（1935 年 1 月 24 日 — 1 月 29 日）

> 这 6 条的写法就是定稿的样子：**能核的填值，核不出的留空并标待核，文献打架的并列写。**

### 记录 1 — 占土城

```
logId            : tucheng-19350124-main
side             : red
unitId           : r-main
unitName         : 中央红军（主力，具体部队待核）
unitLevel        : 军团级以上（待细分）
parentUnitId     : —
date             : 1935-01-24
timeRange        : （留空）
action           : 行军
placeName        : 土城
lonlat           : [106.03, 28.28]
coordCertainty   : 近似
fromPlaceName    : （留空）
toPlaceName      : 土城
routeNote        : （留空）
distanceKm       : （留空）
engagedWith      : —
lossNote         : —
sourceRef        : 中国红色旅游网《贵州·习水·土城》
sourceType       : 网络
sourceLocator    : （待补）
certainty        : 近似
conflictNote     : 具体是哪个军团先入城，未见明确记载
animRef          : tracks[].segments: id=tc-approach, t0=8, t1=26
eventCardRef     : —
```

### 记录 2 — 青杠坡遭遇

```
logId            : qinggangpo-19350127-red
side             : red
unitId           : r-main
unitName         : 中央红军（北进部队，番号待核）
unitLevel        : （待细分）
parentUnitId     : —
date             : 1935-01-27
timeRange        : （留空）
action           : 战斗
placeName        : 土城·青杠坡
lonlat           : [106.045, 28.285]
coordCertainty   : 待核
fromPlaceName    : 土城
toPlaceName      : 青杠坡
routeNote        : 北进途中与川军遭遇
distanceKm       : （留空）
engagedWith      : 川军（番号待核）
lossNote         : —
sourceRef        : 《红军长征在贵州》系列报道·第十期《土城会议：拉开四渡赤水的序幕》
sourceType       : 网络
sourceLocator    : 待补（原文为「1 月 27 日……遭遇」句）
certainty        : 待核
conflictNote     : 遭遇战与 28 日主战斗的分界，各文献划分不一
animRef          : tracks[].segments: id=tc-w1, t0=26, t1=30
eventCardRef     : card-qinggangpo
```

### 记录 3 — 青杠坡战斗（红军侧）

```
logId            : qinggangpo-19350128-r3
side             : red
unitId           : r3
unitName         : 红三军团
unitLevel        : 军团
parentUnitId     : —
date             : 1935-01-28
timeRange        : 拂晓起
action           : 战斗
placeName         : 土城·青杠坡
lonlat           : [106.045, 28.285]
coordCertainty   : 待核
fromPlaceName    : （留空）
toPlaceName      : （留空）
routeNote        : （留空）
distanceKm       : （留空）
engagedWith      : 川军（番号待核）
lossNote         : （留空，须权威数字）
sourceRef        : 《红军长征在贵州》系列报道·第十期
sourceType       : 网络
sourceLocator    : 待补（原文为「1 月 28 日……青杠坡战斗正式打响」句）
certainty        : 待核
conflictNote     : 参战部队构成（红三军团 / 红五军团 / 干部团）各文献详略不一
animRef          : tracks[].segments: id=tc-w1, t0=26, t1=30
eventCardRef     : card-qinggangpo
```

同一天还有一条同构记录：`unitId: r-cadre`（干部团）、`action: 战斗`、其余字段同上 —— 一条记录对应一个部队，**不要把多个部队塞进一条**。

### 记录 4 — 土城会议

```
logId            : tucheng-19350128-meeting
side             : red
unitId           : r-cmc
unitName         : 中革军委（中央政治局主要领导人）
unitLevel        : 军委
parentUnitId     : —
date             : 1935-01-28
timeRange        : （留空，一说当晚、一说 29 日凌晨）
action           : 会议
placeName        : 土城·旧商会会馆
lonlat            : [106.03, 28.28]
coordCertainty   : 近似
fromPlaceName    : （留空）
toPlaceName      : （留空）
routeNote        : （留空）
distanceKm       : （留空）
engagedWith      : —
lossNote         : —
sourceRef        : 《红军长征在贵州》系列报道·第十期
sourceType       : 网络
sourceLocator    : 待补
certainty        : 近似
conflictNote     : 会议具体时段与参会范围，各文献表述不一；决定内容为「立即撤出青杠坡战斗，从土城一带西渡赤水河」
animRef          : —
eventCardRef     : card-tucheng-meeting
```

### 记录 5 — 一渡赤水

```
logId            : chishui-19350129-red
side             : red
unitId           : r-main
unitName         : 中央红军（分三路）
unitLevel        : 军团级以上（待细分）
parentUnitId     : —
date             : 1935-01-29
timeRange        : 凌晨起
action           : 渡河
placeName        : 土城南北地区 / 猿猴（今元厚）
lonlat           : [106.03, 28.28]
coordCertainty   : 近似
fromPlaceName    : 土城
toPlaceName      : 川南古蔺、叙永方向
routeNote        : 分三路西渡
distanceKm       : （留空）
engagedWith      : —
lossNote         : —
sourceRef        : 《红军长征在贵州》系列报道·第十期
sourceType       : 网络
sourceLocator    : 待补（原文为「1 月 29 日……分 3 路从猿猴（今元厚）、土城南北地区西渡赤水河」句）
certainty        : 近似
conflictNote     : 「浑溪口」等具体渡口名，本样张尚未核到权威标注
animRef          : tracks[].segments: id=tc-w1, t0=30, t1=54
eventCardRef     : card-first-crossing
```

### 记录 6 — 同一战场的蓝军侧（演示精度不对称）

```
logId            : qinggangpo-19350128-blue
side             : blue
unitId           : b-chuan
unitName         : 川军（番号全称待核，一说郭勋祺部）
unitLevel        : （待核）
parentUnitId     : —
date             : 1935-01-28
timeRange        : （留空）
action           : 战斗
placeName        : 土城·青杠坡
lonlat           : [106.045, 28.285]
coordCertainty   : 待核
fromPlaceName    : （留空）
toPlaceName      : （留空）
routeNote        : （留空）
distanceKm       : （留空）
engagedWith      : 红三军团 / 干部团
lossNote         : （留空）
sourceRef        : （待补，需国民党军战史、川军档案或地方志）
sourceType       : （待补）
sourceLocator    : （待补）
certainty        : 待核
conflictNote     : 蓝军侧行军日志在公开出版物中密度远低于红军侧，日程与位置多为推测
animRef          : —
eventCardRef     : —
```

---

## 3. `certainty`（确定性）判定标准

不要凭感觉标。三条硬标准：

| 取值 | 中文标注 | 判定标准 | 地图表现 |
|---|---|---|---|
| `标定` | 已核可定 | 日期、地名、事件三要素均能追到权威出版物 / 档案 / 纪念馆标注，坐标误差 < 1 km | 实线、实心标号 |
| `近似` | 日期可信、坐标近似 | 日期与事件可追，坐标取地名库中心点，误差 1–5 km | 实线、标号加「≈」角标 |
| `待核` | 存疑待考 | 文献说法冲突，或仅有地名而位置存疑，或仅有网络来源未经比对 | **虚线框标号**（与动画里的「虚线框标号：位置待核」图例一致） |

**保守取整规则**：一条记录里只要有一个关键字段是 `待核`，整条记录的 `certainty` 不得高于 `待核`。
这条规则的作用是让「查不下去的地方在地图上自动显形」，而不是靠人工记得标。

> 注：第 2 节的六条示例记录原先有三条与本规则不一致（记录 2、记录 3 标 `近似` 而 `coordCertainty` 为 `待核`；记录 5 标 `标定` 而 `coordCertainty` 为 `近似`），已按规则改正为 `待核` / `待核` / `近似`。

---

## 4. 已核 / 待核清单（本样张的实际状态）

**已核（可直接用）**
- 1 月 24 日 中央红军占土城 —— 中国红色旅游网《贵州·习水·土城》
- 1 月 27 日 红军北进途中与川军在青杠坡遭遇 —— 《红军长征在贵州》第十期
- 1 月 28 日 青杠坡战斗正式打响 —— 同上
- 1 月 29 日 分三路从猿猴（今元厚）、土城南北地区西渡赤水河 —— 同上
- 土城会议地点为土城旧商会会馆；决定「立即撤出青杠坡战斗，从土城一带西渡赤水河」 —— 同上
- 四渡总体时段：一渡 1 月 29 日；二渡 2 月 18—21 日（太平渡、二郎滩、九溪口）；三渡 3 月 16 日晨—17 日中午（茅台及附近渡口）；四渡 3 月 21—22 日（二郎滩、九溪口、太平渡） —— 《专家解析四渡赤水》（当代传播）

**待核（定稿前必须补）**
- 1 月 25 日、26 日 红军各部队日程 —— 本样张两条都留空，缺口是显形的
- 青杠坡战斗参战部队的精确构成与各自位置
- 川军番号全称、兵力、展开位置
- 「浑溪口」等具体渡口的位置与文献依据
- 各部队当日在土城—元厚段的具体行军路线（现为示意直线段）
- 里程与伤亡数字（无权威值一律留空）
- 出处定位（页码 / 条目号）—— 现有来源均为网络报道，**定稿须换成权威出版物与档案**

**出处升级路径**（按优先级）
1. 档案与原始文献：《红军长征·文献》系列
2. 战史：红一方面军战史、长征史
3. 日记与回忆录：长征日记、将领回忆录（须注意回忆录的时间误差）
4. 馆藏：四渡赤水纪念馆、土城纪念馆的展陈标注与馆藏文献
5. 地方志：习水、古蔺、叙永等县志
6. 网络报道（当前状态）：只作为线索，不作为定稿出处

---

## 5. 蓝军侧精度不对称（必须提前决策，否则会翻车）

红军侧日记、回忆录、战史密集，能做到日级甚至时段级；国民党军侧公开出版物密度低得多，**同一张地图上两侧精度不对等**。三种处理方式，选一种并贯彻：

- **方案 A（推荐）**：蓝军侧同表同字段，但 `certainty` 大量为 `待核`，地图上以虚线框标号呈现，并在地图角标注明「一侧史料密度差异，蓝军位置多为推定」。
- **方案 B**：蓝军侧只画到「地区级」「方向级」，不画到具体点位与日级日程。
- **方案 C**：蓝军侧独立成表，字段更少（`date` / `unitName` / `areaName` / `action` / `sourceRef`），不与红军侧共用时间轴精度。

**不建议**：为了让地图「两边都好看」而给蓝军侧编造日程 —— 这既过不了审读，也是这类题材最容易出事的地方。

---

## 6. 与动画的挂接

- `animRef` 指向 `scenario.js` 里已有的结构：`tracks[].segments`（每条 `segment` 有 `id` / `t0` / `t1` / `state` / `points`）。
- 一份行军日志记录可以映射到**一段**动画片段，也可以映射到**一个时间点**（`action: 战斗 / 会议` 这类瞬时事件，挂在 `events[]` 上）。
- 字段与动画字段的对应关系：

| 行军日志字段 | 动画结构字段 | 说明 |
|---|---|---|
| `lonlat` | `places[].coordinates` | 地名点位 |
| `coordCertainty` | `places[].certainty` | 控制是否用虚线框标号与「位置待核」呈现 |
| `date` + `timeRange` | `tracks[].segments: t0 / t1` | 把史实时间线性映射到 90 秒动画 |
| `unitId` + `unitName` | `units[].id` / `units[].token` | 部队标号与图标 |
| `action` | `events[].kind` | 事件类型与配色（`battle` / `decision` / `cross` …） |
| `eventCardRef` | `events[].cardRef`（待加） | 时间轴到点弹出事件卡 |

**这样做的好处**：以后补史料只动 `marchLog` 表，动画脚本不用改；改完重新生成，地图上的确定性标记与出处面板自动跟着变。

**反向挂接（推演 → 地图）**：`core/replay.js` 导出的 `simLog` 与 `frames` 态势快照走同一套 `animRef` 约定（`t<回合>`），
地图页 `samples/four-crossings.html?game=<种子>` 据此把一局格子推演叠到真实地形上回放（格网 + 棋子 + 逐回合播报）。
字段位置与含义不变，只是取值来自推演而不是史料 —— 所以回放面板和史料面板可以用同一段代码渲染，差别靠 `certainty` 一眼区分。

---

## 相关样张

- 样张 ①：`general-card.html` — 将领事件卡版式（事件卡就是上面 `eventCardRef` 指向的东西）
- 样张 ②：`four-crossings.html` — 2D 俯视「之」字四渡态势图（四渡同框）
