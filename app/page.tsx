"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Kind = "conveyor" | "drill" | "lumber" | "smelter" | "assembler" | "warehouse" | "seller" | "lab";
type Resource = "iron" | "tree" | "stone" | "coal" | "copper";
type Item = "ironOre" | "wood" | "stone" | "coal" | "copperOre" | "ironPlate" | "gear";
type Building = { kind: Kind; dir: number; progress: number };
type MovingItem = { id: number; type: Item; x: number; y: number };
type GameState = {
  money: number; research: number; cityXp: number; buildings: Record<string, Building>;
  items: MovingItem[]; sold: Record<string, number>; inventory: Record<string, number>;
  lifetime: number; nextId: number; expanded: boolean;
};

const W = 18, H = 12;
const DIRS = [{ x: 1, y: 0, icon: "→" }, { x: 0, y: 1, icon: "↓" }, { x: -1, y: 0, icon: "←" }, { x: 0, y: -1, icon: "↑" }];
const resources: Record<string, Resource> = {
  "2,3": "iron", "2,8": "tree", "5,1": "stone", "14,9": "coal", "15,2": "copper",
  "3,3": "iron", "3,8": "tree", "6,1": "stone", "14,8": "coal", "16,2": "copper",
};
const resourceMeta: Record<Resource, { icon: string; label: string; item: Item }> = {
  iron: { icon: "◆", label: "철광맥", item: "ironOre" }, tree: { icon: "♠", label: "나무", item: "wood" },
  stone: { icon: "●", label: "암석", item: "stone" }, coal: { icon: "⬟", label: "석탄", item: "coal" },
  copper: { icon: "◇", label: "구리광맥", item: "copperOre" },
};
const itemMeta: Record<Item, { icon: string; label: string; color: string; price: number }> = {
  ironOre: { icon: "◆", label: "철광석", color: "#93a2af", price: 18 }, wood: { icon: "▰", label: "원목", color: "#b77745", price: 14 },
  stone: { icon: "●", label: "석재", color: "#9ca3a8", price: 12 }, coal: { icon: "⬟", label: "석탄", color: "#4b5058", price: 22 },
  copperOre: { icon: "◇", label: "구리광석", color: "#d87d4a", price: 28 }, ironPlate: { icon: "▣", label: "철판", color: "#d9e1e5", price: 74 },
  gear: { icon: "✿", label: "기어", color: "#f2b84b", price: 210 },
};
const buildings: { kind: Kind; icon: string; name: string; cost: number; group: string; desc: string }[] = [
  { kind: "conveyor", icon: "⇢", name: "컨베이어", cost: 25, group: "운송", desc: "물품을 다음 칸으로 운반" },
  { kind: "drill", icon: "⛏", name: "철광기", cost: 260, group: "채집", desc: "철광맥에서 철광석 채굴" },
  { kind: "lumber", icon: "♠", name: "벌목기", cost: 220, group: "채집", desc: "나무에서 원목 생산" },
  { kind: "smelter", icon: "♨", name: "용광로", cost: 650, group: "가공", desc: "철광석을 철판으로 제련" },
  { kind: "assembler", icon: "⚙", name: "조립기", cost: 1400, group: "가공", desc: "철판 2개로 기어 조립" },
  { kind: "warehouse", icon: "▦", name: "창고", cost: 480, group: "물류", desc: "생산품을 임시 보관" },
  { kind: "seller", icon: "₩", name: "판매소", cost: 900, group: "판매", desc: "도착한 물품을 자동 판매" },
  { kind: "lab", icon: "⌬", name: "연구소", cost: 2400, group: "연구", desc: "연구 포인트 자동 생산" },
];
const buildingMeta = Object.fromEntries(buildings.map(b => [b.kind, b])) as Record<Kind, typeof buildings[number]>;
const initial: GameState = { money: 4200, research: 0, cityXp: 0, buildings: {}, items: [], sold: {}, inventory: {}, lifetime: 0, nextId: 1, expanded: false };
const key = (x: number, y: number) => `${x},${y}`;
const won = (n: number) => new Intl.NumberFormat("ko-KR").format(Math.floor(n));

export default function FactoryGame() {
  const [game, setGame] = useState<GameState>(initial);
  const [selected, setSelected] = useState<Kind | "delete" | "rotate">("conveyor");
  const [rotation, setRotation] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [paused, setPaused] = useState(false);
  const [zoom, setZoom] = useState(.82);
  const [pan, setPan] = useState({ x: 28, y: 20 });
  const [market, setMarket] = useState<Record<Item, number>>(() => Object.fromEntries(Object.keys(itemMeta).map(k => [k, 1])) as Record<Item, number>);
  const [toast, setToast] = useState("철광기에 컨베이어를 연결해 생산을 시작하세요");
  const [tab, setTab] = useState<"status" | "market" | "contract">("status");
  const [mobilePanel, setMobilePanel] = useState<"build" | "intel" | null>(null);
  const [loaded, setLoaded] = useState(false);
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const down = useRef<{ x: number; y: number } | null>(null);
  const wasDragging = useRef(false);

  useEffect(() => {
    try { const raw = localStorage.getItem("factory-flow-save"); if (raw) setGame({ ...initial, ...JSON.parse(raw), items: [] }); } catch {}
    setLoaded(true);
  }, []);
  useEffect(() => { if (!loaded) return; const id = setInterval(() => localStorage.setItem("factory-flow-save", JSON.stringify({ ...game, items: [] })), 5000); return () => clearInterval(id); }, [game, loaded]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key.toLowerCase() === "r") setRotation(r => (r + 1) % 4); if (e.key === "Escape") setSelected("conveyor"); };
    addEventListener("keydown", onKey); return () => removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => {
    const id = setInterval(() => setMarket(m => Object.fromEntries(Object.entries(m).map(([k, v]) => [k, Math.max(.62, Math.min(1.55, v + (Math.random() - .5) * .18))])) as Record<Item, number>), 12000);
    return () => clearInterval(id);
  }, []);

  const tick = useCallback(() => setGame(prev => {
    if (paused) return prev;
    const g: GameState = { ...prev, buildings: { ...prev.buildings }, items: prev.items.map(i => ({ ...i })), sold: { ...prev.sold }, inventory: { ...prev.inventory }, lifetime: prev.lifetime + .5 * speed };
    const occupied = new Map(g.items.map(i => [key(i.x, i.y), i]));
    const toRemove = new Set<number>();
    const spawned: MovingItem[] = [];
    let earned = 0, xp = 0, researchGain = 0;

    for (const [pos, b0] of Object.entries(g.buildings)) {
      const [x, y] = pos.split(",").map(Number), b = { ...b0, progress: b0.progress + .5 * speed };
      g.buildings[pos] = b;
      const out = DIRS[b.dir], nx = x + out.x, ny = y + out.y;
      if ((b.kind === "drill" || b.kind === "lumber") && b.progress >= (b.kind === "drill" ? 2.5 : 3)) {
        const res = resources[pos]; const valid = b.kind === "drill" ? res === "iron" : res === "tree";
        if (valid && !occupied.has(key(nx, ny)) && g.buildings[key(nx, ny)]) {
          const type = resourceMeta[res!].item; const ni = { id: g.nextId++, type, x: nx, y: ny }; spawned.push(ni); occupied.set(key(nx, ny), ni); b.progress = 0;
        }
      }
      if (b.kind === "lab" && b.progress >= 2) { researchGain += 1; b.progress = 0; }
    }

    const shuffled = [...g.items].sort((a, b) => b.x + b.y - a.x - a.y);
    for (const item of shuffled) {
      if (toRemove.has(item.id)) continue;
      const b = g.buildings[key(item.x, item.y)]; if (!b) { toRemove.add(item.id); continue; }
      if (b.kind === "seller") {
        const value = itemMeta[item.type].price * market[item.type]; earned += value; xp += Math.max(1, value / 25); g.sold[item.type] = (g.sold[item.type] || 0) + 1; toRemove.add(item.id); occupied.delete(key(item.x, item.y)); continue;
      }
      if (b.kind === "smelter" && item.type === "ironOre") {
        if ((item as MovingItem & { wait?: number }).wait === undefined) (item as MovingItem & { wait?: number }).wait = 0;
        const ii = item as MovingItem & { wait?: number }; ii.wait = (ii.wait || 0) + .5 * speed;
        if (ii.wait < 2) continue; item.type = "ironPlate";
      }
      if (b.kind === "assembler" && item.type === "ironPlate") {
        const stored = g.inventory._assembly || 0;
        if (stored < 1) { g.inventory._assembly = stored + 1; toRemove.add(item.id); occupied.delete(key(item.x, item.y)); continue; }
        g.inventory._assembly = 0; item.type = "gear";
      }
      if (["conveyor", "smelter", "assembler", "warehouse"].includes(b.kind)) {
        const d = DIRS[b.dir], nx = item.x + d.x, ny = item.y + d.y, target = g.buildings[key(nx, ny)];
        if (target && !occupied.has(key(nx, ny))) { occupied.delete(key(item.x, item.y)); item.x = nx; item.y = ny; occupied.set(key(nx, ny), item); }
      }
    }
    g.items = g.items.filter(i => !toRemove.has(i.id)).concat(spawned).slice(-160);
    g.money += earned; g.cityXp += xp; g.research += researchGain;
    return g;
  }), [market, paused, speed]);
  useEffect(() => { const id = setInterval(tick, 500); return () => clearInterval(id); }, [tick]);

  const place = (x: number, y: number) => {
    if (wasDragging.current) { wasDragging.current = false; return; }
    const pos = key(x, y);
    setGame(g => {
      if (selected === "rotate") {
        const target = g.buildings[pos];
        if (!target) { setToast("회전할 건물을 선택하세요"); return g; }
        const nextDir = (target.dir + 1) % 4;
        setToast(`${buildingMeta[target.kind].name} 방향을 ${DIRS[nextDir].icon}로 변경했습니다`);
        return { ...g, buildings: { ...g.buildings, [pos]: { ...target, dir: nextDir } } };
      }
      if (selected === "delete") {
        if (!g.buildings[pos]) return g; setToast("건물을 철거하고 비용의 50%를 회수했습니다");
        return { ...g, money: g.money + buildingMeta[g.buildings[pos].kind].cost * .5, buildings: Object.fromEntries(Object.entries(g.buildings).filter(([k]) => k !== pos)), items: g.items.filter(i => key(i.x, i.y) !== pos) };
      }
      const meta = buildingMeta[selected];
      if (g.buildings[pos]) { setToast("이미 건물이 있는 타일입니다"); return g; }
      if (g.money < meta.cost) { setToast("자금이 부족합니다"); return g; }
      if (selected === "drill" && resources[pos] !== "iron") { setToast("철광기는 철광맥 위에만 설치할 수 있습니다"); return g; }
      if (selected === "lumber" && resources[pos] !== "tree") { setToast("벌목기는 나무 위에만 설치할 수 있습니다"); return g; }
      setToast(`${meta.name} 설치 완료 · R 키로 방향 전환`);
      return { ...g, money: g.money - meta.cost, buildings: { ...g.buildings, [pos]: { kind: selected, dir: rotation, progress: 0 } } };
    });
  };

  const efficiency = useMemo(() => {
    const all = Object.values(game.buildings); if (!all.length) return 0;
    const productive = all.filter(b => b.kind === "conveyor" || b.progress < 3.5).length;
    return Math.min(98, Math.round(38 + productive / all.length * 52 + Math.min(8, game.sold.ironPlate || 0)));
  }, [game.buildings, game.sold]);
  const cityLevel = Math.min(6, 1 + Math.floor(game.cityXp / 120));
  const contractNow = game.sold.ironPlate || 0;
  const groups = ["채집", "운송", "가공", "물류", "판매", "연구"];
  const itemAt = new Map(game.items.map(i => [key(i.x, i.y), i]));

  const save = () => { localStorage.setItem("factory-flow-save", JSON.stringify({ ...game, items: [] })); setToast("게임을 저장했습니다"); };
  const claimContract = () => {
    if (contractNow < 20) return setToast("철판이 더 필요합니다");
    setGame(g => ({ ...g, money: g.money + 3500, research: g.research + 20, sold: { ...g.sold, ironPlate: (g.sold.ironPlate || 0) - 20 } })); setToast("계약 완료! ₩3,500 + 연구 20 획득");
  };

  return <main className="game-shell">
    <header className="topbar">
      <div className="brand"><span className="brand-mark">F</span><div><b>FOUNDRY FLOW</b><small>자동화 도시 건설국</small></div></div>
      <div className="top-stats">
        <div><small>보유 자금</small><strong>₩ {won(game.money)}</strong><em>+{won((game.sold.ironPlate || 0) * itemMeta.ironPlate.price)} 누적</em></div>
        <div><small>도시 성장</small><strong>LV.{cityLevel} 제조 도시</strong><span className="mini-track"><i style={{ width: `${game.cityXp % 120 / 1.2}%` }} /></span></div>
        <div><small>연구 포인트</small><strong className="cyan">⌬ {won(game.research)} RP</strong><em>연구소 {Object.values(game.buildings).filter(b => b.kind === "lab").length}동</em></div>
      </div>
      <div className="header-actions"><button onClick={save}>저장</button><button onClick={() => { if (confirm("저장 데이터를 초기화할까요?")) { localStorage.removeItem("factory-flow-save"); setGame(initial); } }}>↻</button></div>
    </header>

    <section className="workspace">
      <nav className="mobile-dock" aria-label="모바일 게임 메뉴">
        <button className={mobilePanel === "build" ? "active" : ""} onClick={() => setMobilePanel(p => p === "build" ? null : "build")}><span>▦</span>건설</button>
        <button className={selected === "rotate" ? "active" : ""} onClick={() => { setSelected("rotate"); setMobilePanel(null); }}><span>↻</span>회전</button>
        <button className={selected === "delete" ? "active danger" : ""} onClick={() => { setSelected("delete"); setMobilePanel(null); }}><span>⌫</span>철거</button>
        <button className={mobilePanel === "intel" ? "active" : ""} onClick={() => setMobilePanel(p => p === "intel" ? null : "intel")}><span>◫</span>현황</button>
      </nav>
      {mobilePanel && <button className="mobile-backdrop" aria-label="패널 닫기" onClick={() => setMobilePanel(null)} />}
      <aside className={`build-panel panel ${mobilePanel === "build" ? "mobile-open" : ""}`}>
        <div className="panel-title"><div><span>BUILD</span><h2>건설 메뉴</h2></div><kbd>R 회전</kbd></div>
        <div className="palette-scroll">
          {groups.map(group => <section key={group} className="build-group"><h3>{group}</h3><div className="build-grid">
            {buildings.filter(b => b.group === group).map(b => <button key={b.kind} className={`build-card ${selected === b.kind ? "active" : ""}`} onClick={() => { setSelected(b.kind); setMobilePanel(null); }} title={b.desc}>
              <span className={`build-icon ${b.kind}`}>{b.icon}</span><span className="build-copy"><b>{b.name}<em>₩{won(b.cost)}</em></b><small>{b.desc}</small></span>
            </button>)}
          </div></section>)}
        </div>
        <div className="tool-row"><button className={selected === "delete" ? "active danger" : ""} onClick={() => setSelected("delete")}>⌫ 철거</button><button className={selected === "rotate" ? "active" : ""} onClick={() => setSelected("rotate")}>↻ 설치물 회전</button><button onClick={() => setRotation(r => (r + 1) % 4)}>설치 방향 {DIRS[rotation].icon}</button></div>
      </aside>

      <section className="map-area">
        <div className="map-toolbar">
          <div className="sector"><span className="pulse" /> A-01 산업 지구 <small>안정</small></div>
          <div className="hint">휠: 확대 · Alt/중클릭 드래그: 이동 · R: 회전</div>
          <div className="zoom"><button onClick={() => setZoom(z => Math.max(.55, z - .1))}>−</button><b>{Math.round(zoom * 100)}%</b><button onClick={() => setZoom(z => Math.min(1.25, z + .1))}>＋</button></div>
        </div>
        <div className="map-viewport"
          onWheel={e => { e.preventDefault(); setZoom(z => Math.max(.55, Math.min(1.25, z + (e.deltaY < 0 ? .06 : -.06)))); }}
          onPointerDown={e => { down.current = { x: e.clientX, y: e.clientY }; wasDragging.current = false; if (e.pointerType === "touch" || e.altKey || e.button === 1) { e.currentTarget.setPointerCapture(e.pointerId); drag.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y }; } }}
          onPointerMove={e => { if (drag.current) { if (Math.hypot(e.clientX - drag.current.x, e.clientY - drag.current.y) > 6) wasDragging.current = true; setPan({ x: drag.current.px + e.clientX - drag.current.x, y: drag.current.py + e.clientY - drag.current.y }); } }}
          onPointerUp={() => { drag.current = null; down.current = null; }}>
          <div className="map-grid" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, gridTemplateColumns: `repeat(${W}, 64px)` }}>
            {Array.from({ length: W * H }, (_, i) => { const x = i % W, y = Math.floor(i / W), pos = key(x, y), res = resources[pos], b = game.buildings[pos], item = itemAt.get(pos); return <button key={pos} className={`tile ${res ? `res-${res}` : ""} ${b ? "occupied" : ""}`} onClick={() => place(x, y)} aria-label={`${x}, ${y} 타일`}>
              {res && !b && <div className="resource-node"><span>{resourceMeta[res].icon}</span><small>{resourceMeta[res].label}</small></div>}
              {b && <div className={`placed ${b.kind}`}><span className="machine-icon">{buildingMeta[b.kind].icon}</span><i className={`dir d${b.dir}`}>{DIRS[b.dir].icon}</i>{b.kind !== "conveyor" && <small>{buildingMeta[b.kind].name}</small>}<em style={{ width: `${Math.min(100, b.progress / 3 * 100)}%` }} /></div>}
              {item && <span className="moving-item" style={{ background: itemMeta[item.type].color }} title={itemMeta[item.type].label}>{itemMeta[item.type].icon}</span>}
            </button>; })}
          </div>
          <div className="map-legend"><span><i className="legend-iron" /> 철광맥</span><span><i className="legend-tree" /> 산림</span><span><i className="legend-stone" /> 암석</span></div>
        </div>
        <div className="toast"><span>i</span>{toast}</div>
      </section>

      <aside className={`intel-panel panel ${mobilePanel === "intel" ? "mobile-open" : ""}`}>
        <div className="tabs"><button className={tab === "status" ? "active" : ""} onClick={() => setTab("status")}>현황</button><button className={tab === "market" ? "active" : ""} onClick={() => setTab("market")}>시장</button><button className={tab === "contract" ? "active" : ""} onClick={() => setTab("contract")}>계약 <i /></button></div>
        {tab === "status" && <div className="intel-scroll">
          <section className="efficiency-card"><div className="ring" style={{ "--value": `${efficiency * 3.6}deg` } as React.CSSProperties}><div><strong>{efficiency}%</strong><small>공장 효율</small></div></div><div className="eff-stats"><span><i className="orange" /> 병목 <b>{Math.max(0, 3 - Math.floor(contractNow / 8))}</b></span><span><i className="red" /> 멈춘 기계 <b>{Math.max(0, Object.values(game.buildings).filter(b => b.kind !== "conveyor" && b.progress > 5).length)}</b></span><span><i className="blue" /> 운송 중 <b>{game.items.length}</b></span></div></section>
          <section className="side-section"><div className="section-head"><h3>실시간 생산</h3><small>분당</small></div>{(["ironOre", "ironPlate", "gear", "wood"] as Item[]).map(type => <div className="resource-row" key={type}><span className="item-chip" style={{ color: itemMeta[type].color }}>{itemMeta[type].icon}</span><span><b>{itemMeta[type].label}</b><small>판매 {game.sold[type] || 0}</small></span><strong>+{Math.min(99, game.items.filter(i => i.type === type).length * 2)}<small>/m</small></strong></div>)}</section>
          <section className="side-section"><div className="section-head"><h3>연구 진행</h3><span className="status-live">진행 중</span></div><div className="research-card"><span>⇢</span><div><b>물류 최적화 I</b><small>컨베이어 속도 +10%</small><div className="progress"><i style={{ width: `${Math.min(100, game.research)}%` }} /></div></div><em>{Math.min(100, Math.floor(game.research))}%</em></div></section>
        </div>}
        {tab === "market" && <div className="intel-scroll"><section className="market-banner"><small>시장 브리핑</small><b>철강 수요가 상승 중입니다</b><span>가격은 12초마다 변동합니다.</span></section><section className="side-section"><div className="section-head"><h3>실시간 시세</h3><small>기준가 대비</small></div>{(Object.keys(itemMeta) as Item[]).map(type => { const rate = market[type]; return <div className="market-row" key={type}><span style={{ color: itemMeta[type].color }}>{itemMeta[type].icon}</span><div><b>{itemMeta[type].label}</b><small>₩{won(itemMeta[type].price * rate)}</small></div><em className={rate >= 1 ? "up" : "down"}>{rate >= 1 ? "▲" : "▼"} {Math.abs((rate - 1) * 100).toFixed(1)}%</em></div>})}</section></div>}
        {tab === "contract" && <div className="intel-scroll"><section className="contract-card"><div className="contract-top"><span>긴급</span><small>도시 건설국</small></div><h3>철도 보수용 철판</h3><p>신규 화물 노선에 사용할 철판을 납품해 주세요.</p><div className="contract-progress"><span><b>{Math.min(contractNow, 20)}</b> / 20 철판</span><small>{Math.min(100, contractNow / 20 * 100).toFixed(0)}%</small><div><i style={{ width: `${Math.min(100, contractNow / 20 * 100)}%` }} /></div></div><div className="rewards"><span><small>보상</small><b>₩3,500</b></span><span><small>추가</small><b>⌬ 20 RP</b></span></div><button disabled={contractNow < 20} onClick={claimContract}>계약 납품</button></section><section className="locked-contract"><span>▣</span><div><b>다음 계약</b><small>도시 레벨 2에서 공개</small></div></section></div>}
      </aside>
    </section>

    <footer className="bottom-bar">
      <div className="selection"><span className={`build-icon ${selected}`}>{selected === "delete" ? "⌫" : selected === "rotate" ? "↻" : buildingMeta[selected].icon}</span><div><small>선택된 도구</small><b>{selected === "delete" ? "철거 도구" : selected === "rotate" ? "설치물 회전" : buildingMeta[selected].name}</b></div><p>{selected === "delete" ? "설치된 건물을 클릭해 철거" : selected === "rotate" ? "설치된 건물을 누를 때마다 90° 회전" : buildingMeta[selected].desc}</p><kbd>{selected === "rotate" ? "탭" : DIRS[rotation].icon}</kbd></div>
      <div className="factory-feed"><small>현재 생산</small><div className="feed-items">{game.items.slice(0, 8).map(i => <span key={i.id} style={{ color: itemMeta[i.type].color }}>{itemMeta[i.type].icon}</span>)}{!game.items.length && <em>라인이 대기 중입니다</em>}</div></div>
      <div className="game-controls"><span className="fps"><i /> 60 FPS</span><button className={paused ? "active" : ""} onClick={() => setPaused(p => !p)}>{paused ? "▶" : "Ⅱ"}</button>{[1,2,4].map(s => <button key={s} className={speed === s ? "active" : ""} onClick={() => { setSpeed(s); setPaused(false); }}>{s}×</button>)}</div>
    </footer>
    <div className="portrait-lock"><span>↻</span><b>기기를 가로로 돌려주세요</b><small>Foundry Flow는 가로 화면에 최적화되어 있습니다.</small></div>
  </main>;
}
