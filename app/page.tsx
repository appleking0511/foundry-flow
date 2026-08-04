"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Kind = "conveyor" | "fastConveyor" | "splitter" | "merger" | "drill" | "copperDrill" | "lumber" | "powerPlant" | "advancedPowerPlant" | "powerline" | "oxygenGenerator" | "oxygenPipe" | "smelter" | "wireMill" | "batteryPlant" | "assembler" | "fenceFactory" | "warehouse" | "largeWarehouse" | "seller" | "cityDepot" | "securityDepot" | "lab";
type Resource = "iron" | "tree" | "stone" | "coal" | "copper";
type Item = "ironOre" | "wood" | "stone" | "coal" | "copperOre" | "copperWire" | "battery" | "ironPlate" | "gear" | "steelFence";
type Building = { kind: Kind; dir: number; progress: number; level?: number; altDir?: number };
type MovingItem = { id: number; type: Item; x: number; y: number };
type CityProject = { name: string; icon: string; description: string; requirements: Partial<Record<Item, number>>; rewardMoney: number; rewardResearch: number; unlock: string };
type DefenseKind = "wall" | "turret" | "missile";
type ZombieKind = "normal" | "runner" | "tank" | "spitter";
type DefenseBuilding = { kind: DefenseKind; hp: number };
type Zombie = { id: number; kind: ZombieKind; x: number; y: number; hp: number; maxHp: number };
type DefenseShot = { id: number; kind: "bullet" | "missile"; fromX: number; fromY: number; toX: number; toY: number };
type BattleState = { phase: "prepare" | "battle" | "won" | "lost"; stage: number; zombies: Zombie[]; shots: DefenseShot[]; pending: number; coreHp: number; tick: number };
type GameState = {
  money: number; research: number; cityXp: number; buildings: Record<string, Building>;
  items: MovingItem[]; sold: Record<string, number>; inventory: Record<string, number>;
  sellerStatus: Record<string, { type: Item; lastPrice: number; count: number; revenue: number }>;
  lifetime: number; nextId: number; expanded: boolean; researchLevel: number; landTier: number;
  cityProject: number; cityDeliveries: Record<string, number>; satisfaction: number;
  securityStock: Record<string, number>; securityStage: number; securityLayout: Record<string, DefenseBuilding>;
};

const MAP_MIN_X = -18, MAP_MAX_X = 36, MAP_MIN_Y = -12, MAP_MAX_Y = 23;
const W = MAP_MAX_X - MAP_MIN_X + 1, H = MAP_MAX_Y - MAP_MIN_Y + 1;
const DIRS = [{ x: 1, y: 0, icon: "→" }, { x: 0, y: 1, icon: "↓" }, { x: -1, y: 0, icon: "←" }, { x: 0, y: -1, icon: "↑" }];
const resources: Record<string, Resource> = {
  "2,3": "iron", "2,8": "tree", "5,1": "stone", "14,9": "coal", "15,2": "copper",
  "3,3": "iron", "3,8": "tree", "6,1": "stone", "14,8": "coal", "16,2": "copper",
  "19,3": "tree", "20,8": "iron", "23,2": "coal", "25,9": "copper", "28,4": "iron", "31,8": "tree", "34,2": "copper",
  "-2,2": "tree", "-1,9": "stone", "5,-2": "iron", "10,-1": "coal", "-4,6": "copper", "8,14": "tree", "15,15": "iron", "3,17": "copper",
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
  copperWire: { icon: "≋", label: "구리 전선", color: "#ee9a63", price: 96 }, battery: { icon: "▯", label: "배터리", color: "#82e08e", price: 265 },
  gear: { icon: "✿", label: "기어", color: "#f2b84b", price: 210 }, steelFence: { icon: "▥", label: "철제 울타리", color: "#d7b07a", price: 310 },
};
const buildings: { kind: Kind; icon: string; name: string; cost: number; group: string; desc: string }[] = [
  { kind: "conveyor", icon: "⇢", name: "컨베이어", cost: 25, group: "운송", desc: "물품을 다음 칸으로 운반" },
  { kind: "fastConveyor", icon: "➠", name: "고속 컨베이어", cost: 70, group: "운송", desc: "연속 설치 시 물품을 2배 빠르게 운반" },
  { kind: "splitter", icon: "⑂", name: "분배기", cost: 180, group: "운송", desc: "물품을 정면과 오른쪽 출구로 번갈아 분배" },
  { kind: "merger", icon: "⑃", name: "병합기", cost: 160, group: "운송", desc: "여러 방향의 물품을 한 출구로 병합" },
  { kind: "drill", icon: "⛏", name: "철광기", cost: 260, group: "채집", desc: "철광맥에서 철광석 채굴" },
  { kind: "copperDrill", icon: "◇", name: "구리 광산", cost: 950, group: "채집", desc: "전력을 사용해 구리광맥에서 구리광석 채굴" },
  { kind: "lumber", icon: "♠", name: "벌목기", cost: 220, group: "채집", desc: "나무에서 원목 생산" },
  { kind: "powerPlant", icon: "⚡", name: "화력발전기", cost: 700, group: "전력", desc: "원목을 태워 전기 생산" },
  { kind: "advancedPowerPlant", icon: "ϟ", name: "개선 화력발전기", cost: 2200, group: "전력", desc: "원목을 더 오래 사용하는 고효율 발전기" },
  { kind: "powerline", icon: "⌁", name: "전선", cost: 15, group: "전력", desc: "발전기의 전기를 철광기에 전달" },
  { kind: "oxygenGenerator", icon: "O₂", name: "산소 공급기", cost: 420, group: "산소", desc: "연소 시설에 필요한 산소를 생산" },
  { kind: "oxygenPipe", icon: "○", name: "산소 배관", cost: 18, group: "산소", desc: "산소 공급기에서 연소 시설까지 산소 전달" },
  { kind: "smelter", icon: "♨", name: "용광로", cost: 650, group: "가공", desc: "철광석을 철판으로 제련" },
  { kind: "wireMill", icon: "≋", name: "전선 제작기", cost: 1800, group: "가공", desc: "구리광석 1개로 구리 전선 2개 생산" },
  { kind: "batteryPlant", icon: "▯", name: "배터리 공장", cost: 3200, group: "가공", desc: "구리 전선 2개와 철판 1개로 배터리 조립" },
  { kind: "assembler", icon: "⚙", name: "조립기", cost: 1400, group: "가공", desc: "철판 2개로 기어 조립" },
  { kind: "fenceFactory", icon: "▥", name: "울타리 제작소", cost: 1750, group: "안보", desc: "철판 6개로 철제 울타리 1개 제작" },
  { kind: "warehouse", icon: "▦", name: "창고", cost: 480, group: "물류", desc: "생산품을 임시 보관" },
  { kind: "largeWarehouse", icon: "▥", name: "대형 창고", cost: 1200, group: "물류", desc: "여러 생산라인을 잇는 대형 물류 거점" },
  { kind: "seller", icon: "₩", name: "판매소", cost: 0, group: "판매", desc: "무료 설치 · 도착한 물품을 자동 판매" },
  { kind: "cityDepot", icon: "▰", name: "도시 납품소", cost: 0, group: "도시", desc: "무료 설치 · 생산품을 도시 프로젝트에 납품" },
  { kind: "securityDepot", icon: "⛨", name: "안보 보급소", cost: 900, group: "안보", desc: "철판·기어와 향후 무기류를 도시 방어용으로 비축" },
  { kind: "lab", icon: "⌬", name: "연구소", cost: 2400, group: "연구", desc: "연구 포인트 자동 생산" },
];
const buildingMeta = Object.fromEntries(buildings.map(b => [b.kind, b])) as Record<Kind, typeof buildings[number]>;
const productionMeta: Record<Kind, { input: string; output: string; note: string }> = {
  conveyor: { input: "도착한 물품", output: "다음 칸 운송", note: "화살표 방향으로 모든 물품을 이동합니다." },
  fastConveyor: { input: "도착한 물품", output: "고속 운송", note: "연속해서 설치하면 일반 컨베이어보다 2배 빠르게 이동합니다." },
  splitter: { input: "한 개의 생산라인", output: "정면·오른쪽 분배", note: "물품을 두 출구로 번갈아 보내 생산라인을 나눕니다." },
  merger: { input: "여러 생산라인", output: "한 개의 출구", note: "여러 방향의 물품을 받아 화살표 방향 한 줄로 합칩니다." },
  drill: { input: "철광맥", output: "철광석", note: "철광맥 위에서 철광석을 자동 채굴합니다." },
  copperDrill: { input: "구리광맥 + 전기", output: "구리광석", note: "구리광맥 위에서 전력을 사용해 구리광석을 채굴합니다." },
  lumber: { input: "산림", output: "원목", note: "나무 위에서 원목을 자동 생산합니다." },
  powerPlant: { input: "원목", output: "전기", note: "원목을 연료로 태워 전선을 통해 전기를 공급합니다." },
  advancedPowerPlant: { input: "원목", output: "고효율 전기", note: "원목 한 개를 오래 태워 더 안정적으로 전력을 공급합니다." },
  powerline: { input: "발전기 전력", output: "전기 전달", note: "화력발전기와 철광기를 이어 전기를 전달합니다." },
  oxygenGenerator: { input: "대기", output: "산소", note: "산소 배관을 통해 화력발전기와 용광로에 연소용 산소를 공급합니다." },
  oxygenPipe: { input: "산소 공급기", output: "산소 전달", note: "산소 공급기와 불을 사용하는 시설을 연결합니다." },
  smelter: { input: "철광석 + 원목 연료", output: "철판", note: "원목 화력이 있어야 철광석을 철판으로 제련합니다." },
  wireMill: { input: "구리광석 1개 + 전기", output: "구리 전선 2개", note: "전력을 사용해 구리광석을 전선으로 가공합니다." },
  batteryPlant: { input: "구리 전선 2개 + 철판 1개", output: "배터리", note: "전력망에 연결해 전선과 철판을 배터리로 조립합니다." },
  assembler: { input: "철판 2개", output: "기어", note: "철판을 조립해 고가의 기어를 생산합니다." },
  fenceFactory: { input: "철판 6개", output: "철제 울타리", note: "완성된 울타리를 컨베이어로 안보 보급소에 보내야 안보 필드에 설치할 수 있습니다." },
  warehouse: { input: "모든 생산품", output: "보관·출고", note: "생산품을 받아 다음 라인으로 전달합니다." },
  largeWarehouse: { input: "여러 생산라인", output: "대량 보관·출고", note: "여러 라인을 연결하는 대형 물류 거점입니다." },
  seller: { input: "모든 생산품", output: "자동 판매", note: "시장 시세에 맞춰 물품을 즉시 판매합니다." },
  cityDepot: { input: "도시 요구 생산품", output: "도시 건설 납품", note: "물품을 판매하지 않고 도시 프로젝트와 만족도 향상에 사용합니다." },
  securityDepot: { input: "철판·기어·무기류", output: "도시 방어 비축", note: "도시 안보 화면에서 사용할 방어 물자를 안전하게 비축합니다." },
  lab: { input: "시간", output: "연구 포인트", note: "새 기술에 필요한 연구 포인트를 생산합니다." },
};
const recipeCatalog: { item: Item; building: string; ingredients: string; steps: string[]; requirement: string; tip: string }[] = [
  { item: "ironOre", building: "철광기", ingredients: "철광맥 + 전기", steps: ["철광맥 위에 철광기 설치", "원목을 넣은 화력발전기 가동", "전선으로 철광기까지 연결", "출구에 컨베이어 연결"], requirement: "연구 Lv.1 · 전력 공급 필수", tip: "초반에는 바로 팔 수 있지만 철판으로 가공하면 더 비쌉니다." },
  { item: "wood", building: "벌목기", ingredients: "산림", steps: ["나무 자원 위에 벌목기 설치", "출구 방향 선택", "컨베이어로 발전기·용광로·판매소에 공급"], requirement: "연구 Lv.1 · 전력 불필요", tip: "판매 수익뿐 아니라 발전과 제련에 쓰이는 핵심 연료입니다." },
  { item: "ironPlate", building: "용광로", ingredients: "철광석 1 + 원목 화력", steps: ["철광석 라인을 용광로로 연결", "다른 라인에서 원목을 용광로에 투입", "용광로 출구에 컨베이어 연결", "철판을 조립기 또는 판매소로 운송"], requirement: "연구 Lv.1 · 원목 1개로 화력 4 충전", tip: "철광석보다 단가가 높고 기어 제작 재료로도 사용됩니다." },
  { item: "gear", building: "조립기", ingredients: "철판 2", steps: ["연구소에서 연구 포인트 생산", "연구 Lv.2를 달성해 조립기 해금", "철판 라인을 조립기에 연결", "완성된 기어를 판매소로 운송"], requirement: "연구 Lv.2 · 철판 2개 필요", tip: "현재 기초 공장에서 만들 수 있는 가장 비싼 조립품입니다." },
  { item: "steelFence", building: "울타리 제작소", ingredients: "철판 6", steps: ["연구 Lv.3 달성", "철판 생산라인을 울타리 제작소에 연결", "철판 6개를 투입해 울타리 제작", "완성품을 안보 보급소로 운송"], requirement: "연구 Lv.3 · 철판 6개 필요", tip: "판매하지 않고 안보 보급소로 보내야 도시 안보 필드에 설치할 수 있습니다." },
  { item: "copperOre", building: "구리 광산", ingredients: "구리광맥 + 전기", steps: ["연구 Lv.4 달성", "구리광맥 위에 구리 광산 설치", "발전기와 전선으로 전력 연결", "출구에 컨베이어 연결"], requirement: "연구 Lv.4 · 전력 공급 필수", tip: "전선과 배터리 생산의 시작 재료입니다." },
  { item: "copperWire", building: "전선 제작기", ingredients: "구리광석 1", steps: ["전선 제작기를 전력망에 연결", "구리광석을 컨베이어로 투입", "가공된 구리 전선을 배터리 공장으로 운송"], requirement: "연구 Lv.4 · 구리광석 1개로 전선 2개", tip: "직접 판매하거나 배터리 제작에 사용할 수 있습니다." },
  { item: "battery", building: "배터리 공장", ingredients: "구리 전선 2 + 철판 1", steps: ["배터리 공장을 전력망에 연결", "구리 전선과 철판 라인을 함께 투입", "완성된 배터리를 판매소나 도시 납품소로 운송"], requirement: "연구 Lv.4 · 전력 공급 필수", tip: "Lv.4에서 가장 가치가 높은 전기 산업 제품입니다." },
];
const cityProjects: CityProject[] = [
  { name: "개척 시청", icon: "▦", description: "정착민이 생활할 첫 행정 중심지를 건설합니다.", requirements: { wood: 24, ironPlate: 12 }, rewardMoney: 1800, rewardResearch: 15, unlock: "도시 계약과 만족도 보너스" },
  { name: "산업 철도역", icon: "▤", description: "대량 화물을 실어 나를 도시 철도망을 완성합니다.", requirements: { ironPlate: 50, gear: 12 }, rewardMoney: 4200, rewardResearch: 30, unlock: "동부 산업 구역 구매 권한" },
  { name: "도시 전력망", icon: "⚡", description: "공장과 주거지를 연결하는 안정적인 전력망을 구축합니다.", requirements: { wood: 45, ironPlate: 80, gear: 24 }, rewardMoney: 7500, rewardResearch: 50, unlock: "광물 탐사 구역과 고속 물류" },
  { name: "중앙 산업단지", icon: "▥", description: "도시 전체 생산을 책임지는 거대 산업단지를 건설합니다.", requirements: { ironPlate: 160, gear: 70 }, rewardMoney: 14000, rewardResearch: 80, unlock: "Lv.4 구리·전기 산업 준비" },
  { name: "스마트 에너지 지구", icon: "▯", description: "구리 전선과 배터리로 도시 전체의 지능형 전력망을 완성합니다.", requirements: { copperWire: 100, battery: 30, gear: 35 }, rewardMoney: 24000, rewardResearch: 120, unlock: "Lv.5 정밀 부품 산업 준비" },
];
const securityStages = [
  { name: "외곽 정찰", threat: 12, composition: { normal: 8, runner: 0, tank: 0, spitter: 0 }, reward: 1000, research: 6 },
  { name: "고속도로 습격", threat: 20, composition: { normal: 10, runner: 2, tank: 0, spitter: 0 }, reward: 1600, research: 9 },
  { name: "질주자 출현", threat: 29, composition: { normal: 12, runner: 5, tank: 0, spitter: 0 }, reward: 2400, research: 13 },
  { name: "철갑 좀비", threat: 39, composition: { normal: 14, runner: 3, tank: 3, spitter: 0 }, reward: 3500, research: 18 },
  { name: "공단 야간전", threat: 49, composition: { normal: 16, runner: 7, tank: 2, spitter: 0 }, reward: 5000, research: 24 },
  { name: "산성 감염체", threat: 59, composition: { normal: 18, runner: 5, tank: 4, spitter: 3 }, reward: 6800, research: 31 },
  { name: "동부 관문전", threat: 68, composition: { normal: 21, runner: 10, tank: 4, spitter: 2 }, reward: 9000, research: 39 },
  { name: "중장갑 군단", threat: 78, composition: { normal: 24, runner: 8, tank: 7, spitter: 4 }, reward: 12000, research: 48 },
  { name: "도시 포위망", threat: 89, composition: { normal: 27, runner: 13, tank: 8, spitter: 5 }, reward: 16000, research: 60 },
  { name: "감염 군주", threat: 100, composition: { normal: 32, runner: 16, tank: 10, spitter: 8 }, reward: 24000, research: 80 },
] as const;
const zombieMeta: Record<ZombieKind, { name: string; icon: string; sprite: string; hp: number; damage: number; desc: string }> = {
  normal: { name: "일반 좀비", icon: "♟", sprite: "/assets/defense/zombie-normal.webp", hp: 12, damage: 6, desc: "표준 속도와 공격력" },
  runner: { name: "질주 좀비", icon: "♞", sprite: "/assets/defense/zombie-runner.webp", hp: 9, damage: 5, desc: "한 번에 두 칸 이동" },
  tank: { name: "중장갑 좀비", icon: "♜", sprite: "/assets/defense/zombie-tank.webp", hp: 38, damage: 13, desc: "높은 체력과 시설 파괴력" },
  spitter: { name: "산성 좀비", icon: "♝", sprite: "/assets/defense/zombie-spitter.webp", hp: 18, damage: 8, desc: "도시를 원거리 공격" },
};
const stageZombieCount = (stage: typeof securityStages[number]) => Object.values(stage.composition).reduce((sum, count) => sum + count, 0);
const factoryImages: Partial<Record<Kind, string>> = { drill: "/assets/factory/iron-drill.webp", conveyor: "/assets/factory/conveyor.webp", powerPlant: "/assets/factory/power-plant.webp", lab: "/assets/factory/research-lab.webp" };
const defenseMeta: Record<DefenseKind, { name: string; icon: string; sprite?: string; steel: number; parts: number; hp: number; range: number; damage: number; desc: string }> = {
  wall: { name: "철제 울타리", icon: "▥", sprite: "/assets/defense/steel-fence.webp", steel: 0, parts: 0, hp: 42, range: 0, damage: 0, desc: "울타리 제작소에서 만든 완제품 1개를 설치합니다." },
  turret: { name: "기관총 포탑", icon: "⌖", sprite: "/assets/defense/machine-turret.webp", steel: 6, parts: 4, hp: 32, range: 3, damage: 5, desc: "사거리 3칸 안의 좀비에게 총알을 연사합니다." },
  missile: { name: "미사일 포대", icon: "▲", steel: 10, parts: 8, hp: 24, range: 5, damage: 11, desc: "긴 사거리와 높은 피해로 강한 좀비를 공격합니다." },
};
const DEF_W = 14, DEF_H = 9, CORE_X = 7, CORE_Y = 4;
const initial: GameState = { money: 4200, research: 0, cityXp: 0, buildings: {}, items: [], sold: {}, inventory: {}, sellerStatus: {}, lifetime: 0, nextId: 1, expanded: false, researchLevel: 1, landTier: 1, cityProject: 0, cityDeliveries: {}, satisfaction: 70, securityStock: {}, securityStage: 0, securityLayout: {} };
const key = (x: number, y: number) => `${x},${y}`;
const won = (n: number) => new Intl.NumberFormat("ko-KR").format(Math.floor(n));
const researchCost = (level: number) => 80 + (level - 1) * 70;
const upgradeCost = (kind: Kind, level: number) => Math.floor(Math.max(250, buildingMeta[kind].cost * (.55 + level * .2)));
const unlockLevel: Partial<Record<Kind, number>> = { assembler: 2, fastConveyor: 3, splitter: 3, merger: 3, largeWarehouse: 3, fenceFactory: 3, copperDrill: 4, wireMill: 4, batteryPlant: 4, advancedPowerPlant: 4, lab: 1 };
const noUpgrade = new Set<Kind>(["warehouse", "largeWarehouse", "seller", "cityDepot", "securityDepot", "powerline", "oxygenPipe", "lab", "splitter", "merger"]);
const noDirection = new Set<Kind>(["lab", "powerPlant", "advancedPowerPlant", "powerline", "oxygenGenerator", "oxygenPipe", "seller", "cityDepot", "securityDepot"]);
const landNames = ["동부 산업 구역", "광물 탐사 구역", "구리 제련 구역", "정밀 부품 구역", "중앙 철강 구역", "자동차 산업 구역", "전자 산업 구역", "첨단 자동화 구역", "우주기지 구역"];
const landCosts = [4000, 9000, 16000, 26000, 40000, 62000, 90000, 130000, 190000];
const landPlans = landNames.map((name, index) => ({ tier: index + 2, name, requiredLevel: index + 2, cost: landCosts[index] }));
const landBounds = (tier: number) => { const padding = (Math.max(1, tier) - 1) * 2; return { minX: Math.max(MAP_MIN_X, -padding), maxX: Math.min(MAP_MAX_X, 9 + padding), minY: Math.max(MAP_MIN_Y, -padding), maxY: Math.min(MAP_MAX_Y, 11 + padding) }; };
const isLandUnlocked = (x: number, y: number, tier: number) => { const bounds = landBounds(tier); return x >= bounds.minX && x <= bounds.maxX && y >= bounds.minY && y <= bounds.maxY; };

function oxygenNetwork(buildings: Record<string, Building>) {
  const supplied = new Set<string>();
  for (const [start, source] of Object.entries(buildings)) {
    if (source.kind !== "oxygenGenerator") continue;
    const queue = [start], visited = new Set<string>([start]);
    while (queue.length) {
      const pos = queue.shift()!, [x, y] = pos.split(",").map(Number); supplied.add(pos);
      for (const d of DIRS) {
        const np = key(x + d.x, y + d.y), next = buildings[np]; if (!next) continue;
        if (["powerPlant", "advancedPowerPlant", "smelter"].includes(next.kind)) supplied.add(np);
        if ((next.kind === "oxygenPipe" || next.kind === "oxygenGenerator") && !visited.has(np)) { visited.add(np); queue.push(np); }
      }
    }
  }
  return supplied;
}

function poweredNetwork(buildings: Record<string, Building>, inventory: Record<string, number>, oxygen?: Set<string>) {
  const powered = new Set<string>();
  for (const [start, plant] of Object.entries(buildings)) {
    if (!["powerPlant", "advancedPowerPlant"].includes(plant.kind) || (inventory[`fuel:${start}`] || 0) <= 0 || (oxygen && !oxygen.has(start))) continue;
    const queue = [start], visited = new Set<string>([start]);
    while (queue.length) {
      const pos = queue.shift()!, [x, y] = pos.split(",").map(Number); powered.add(pos);
      for (const d of DIRS) {
        const np = key(x + d.x, y + d.y), next = buildings[np]; if (!next) continue;
        if (["drill", "copperDrill", "wireMill", "batteryPlant"].includes(next.kind)) powered.add(np);
        if ((next.kind === "powerline" || next.kind === "powerPlant" || next.kind === "advancedPowerPlant") && !visited.has(np)) { visited.add(np); queue.push(np); }
      }
    }
  }
  return powered;
}

function nextDefenseStep(x: number, y: number, layout: Record<string, DefenseBuilding>) {
  const target = key(CORE_X, CORE_Y), start = key(x, y), queue = [start], visited = new Set([start]), previous = new Map<string, string>();
  while (queue.length) {
    const pos = queue.shift()!; if (pos === target) break;
    const [cx, cy] = pos.split(",").map(Number);
    for (const d of DIRS) {
      const nx = cx + d.x, ny = cy + d.y, np = key(nx, ny);
      if (nx < 0 || nx >= DEF_W || ny < 0 || ny >= DEF_H || visited.has(np) || (layout[np] && np !== start)) continue;
      visited.add(np); previous.set(np, pos); queue.push(np);
    }
  }
  if (!visited.has(target)) return null;
  let cursor = target;
  while (previous.get(cursor) && previous.get(cursor) !== start) cursor = previous.get(cursor)!;
  const [nx, ny] = cursor.split(",").map(Number); return { x: nx, y: ny };
}

function canReceiveItem(kind: Kind, item: Item) {
  if (["conveyor", "fastConveyor", "splitter", "merger", "warehouse", "largeWarehouse", "seller", "cityDepot", "securityDepot"].includes(kind)) return true;
  if (["powerPlant", "advancedPowerPlant"].includes(kind)) return item === "wood";
  if (kind === "smelter") return item === "wood" || item === "ironOre";
  if (kind === "wireMill") return item === "copperOre";
  if (kind === "batteryPlant") return item === "copperWire" || item === "ironPlate";
  if (kind === "assembler") return item === "ironPlate";
  if (kind === "fenceFactory") return item === "ironPlate";
  return false;
}

export default function FactoryGame() {
  const [game, setGame] = useState<GameState>(initial);
  const [selected, setSelected] = useState<Kind | "delete" | "rotate">("conveyor");
  const [rotation, setRotation] = useState(0);
  const [paused, setPaused] = useState(false);
  const [zoom, setZoom] = useState(.82);
  const [pan, setPan] = useState({ x: -890, y: -600 });
  const [market, setMarket] = useState<Record<Item, number>>(() => Object.fromEntries(Object.keys(itemMeta).map(k => [k, 1])) as Record<Item, number>);
  const [marketHistory, setMarketHistory] = useState<Record<Item, number[]>>(() => Object.fromEntries((Object.keys(itemMeta) as Item[]).map(type => [type, Array(8).fill(itemMeta[type].price)])) as Record<Item, number[]>);
  const [toast, setToast] = useState("철광기에 컨베이어를 연결해 생산을 시작하세요");
  const [tab, setTab] = useState<"status" | "market" | "contract" | "city">("status");
  const [mobilePanel, setMobilePanel] = useState<"build" | "intel" | null>(null);
  const [inspectorPos, setInspectorPos] = useState<string | null>(null);
  const [recipeOpen, setRecipeOpen] = useState(false);
  const [securityOpen, setSecurityOpen] = useState(false);
  const [stagePickerOpen, setStagePickerOpen] = useState(false);
  const [selectedSecurityStage, setSelectedSecurityStage] = useState(0);
  const [defenseSelected, setDefenseSelected] = useState<DefenseKind | "erase">("wall");
  const [battle, setBattle] = useState<BattleState>({ phase: "prepare", stage: 0, zombies: [], shots: [], pending: 0, coreHp: 100, tick: 0 });
  const [recipeQuery, setRecipeQuery] = useState("");
  const [selectedRecipe, setSelectedRecipe] = useState<Item>("ironOre");
  const [loaded, setLoaded] = useState(false);
  const [bootReady, setBootReady] = useState(false);
  const [started, setStarted] = useState(false);
  const [muted, setMuted] = useState(false);
  const [incomePerSecond, setIncomePerSecond] = useState(0);
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const down = useRef<{ x: number; y: number } | null>(null);
  const wasDragging = useRef(false);
  const touchPointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ distance: number; zoom: number } | null>(null);
  const audioContext = useRef<AudioContext | null>(null);
  const masterGain = useRef<GainNode | null>(null);
  const bgmTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const bgmStep = useRef(0);
  const incomeEvents = useRef<{ at: number; value: number }[]>([]);
  const gameRef = useRef<GameState>(initial);
  const battleRewardedStage = useRef<number | null>(null);

  useEffect(() => {
    try { const raw = localStorage.getItem("factory-flow-save"); if (raw) { const parsed = JSON.parse(raw); setGame({ ...initial, ...parsed, landTier: Math.max(1, Number(parsed.landTier ?? (parsed.expanded ? 2 : 1))), cityDeliveries: { ...(parsed.cityDeliveries || {}) }, securityStock: { ...(parsed.securityStock || {}) }, securityLayout: { ...(parsed.securityLayout || {}) }, sellerStatus: { ...(parsed.sellerStatus || {}) }, inventory: { ...(parsed.inventory || {}) }, items: [] }); } } catch {}
    setLoaded(true);
  }, []);
  useEffect(() => { gameRef.current = game; }, [game]);
  useEffect(() => { const id = setTimeout(() => setBootReady(true), 1400); return () => clearTimeout(id); }, []);
  useEffect(() => { if (!loaded) return; const id = setInterval(() => localStorage.setItem("factory-flow-save", JSON.stringify({ ...game, items: [] })), 5000); return () => clearInterval(id); }, [game, loaded]);
  useEffect(() => { const persist = () => localStorage.setItem("factory-flow-save", JSON.stringify({ ...gameRef.current, items: [] })); addEventListener("pagehide", persist); addEventListener("beforeunload", persist); return () => { removeEventListener("pagehide", persist); removeEventListener("beforeunload", persist); }; }, []);
  useEffect(() => { const id = setInterval(() => { const cutoff = Date.now() - 5000; incomeEvents.current = incomeEvents.current.filter(event => event.at >= cutoff); setIncomePerSecond(incomeEvents.current.reduce((sum, event) => sum + event.value, 0) / 5); }, 500); return () => clearInterval(id); }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key.toLowerCase() === "r") setRotation(r => (r + 1) % 4); if (e.key === "Escape") setSelected("conveyor"); };
    addEventListener("keydown", onKey); return () => removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => {
    const id = setInterval(() => setMarket(m => {
      const next = Object.fromEntries(Object.entries(m).map(([k, v]) => [k, Math.max(.62, Math.min(1.55, v + (Math.random() - .5) * .18))])) as Record<Item, number>;
      setMarketHistory(history => Object.fromEntries((Object.keys(itemMeta) as Item[]).map(type => [type, [...(history[type] || []), itemMeta[type].price * next[type]].slice(-24)])) as Record<Item, number[]>);
      return next;
    }), 12000);
    return () => clearInterval(id);
  }, []);

  const ensureAudio = useCallback(() => {
    if (!audioContext.current) {
      const AudioCtor = window.AudioContext || (window as typeof window & { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const context = new AudioCtor(), master = context.createGain();
      master.gain.value = muted ? 0 : .72; master.connect(context.destination);
      audioContext.current = context; masterGain.current = master;
    }
    if (audioContext.current.state === "suspended") void audioContext.current.resume();
    return audioContext.current;
  }, [muted]);

  const playTone = useCallback((frequency: number, duration: number, volume: number, type: OscillatorType = "sine", delay = 0) => {
    const context = ensureAudio(), master = masterGain.current; if (!master) return;
    const oscillator = context.createOscillator(), gain = context.createGain(), start = context.currentTime + delay;
    oscillator.type = type; oscillator.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(.0001, start); gain.gain.exponentialRampToValueAtTime(volume, start + .025); gain.gain.exponentialRampToValueAtTime(.0001, start + duration);
    oscillator.connect(gain); gain.connect(master); oscillator.start(start); oscillator.stop(start + duration + .03);
  }, [ensureAudio]);

  const playSfx = useCallback((sound: "install" | "upgrade" | "delete") => {
    if (sound === "install") { playTone(330, .13, .1, "square"); playTone(495, .18, .08, "triangle", .07); }
    if (sound === "upgrade") { playTone(392, .13, .09, "triangle"); playTone(523, .16, .09, "triangle", .08); playTone(659, .24, .08, "sine", .16); }
    if (sound === "delete") { playTone(190, .18, .11, "sawtooth"); playTone(105, .27, .08, "square", .09); }
  }, [playTone]);

  const startBgm = useCallback(() => {
    ensureAudio(); if (bgmTimer.current) return;
    // APPLEKING GAMES용 오리지널 생성 음악: 외부 음원·샘플을 사용하지 않습니다.
    const chords = [[110, 130.81, 164.81, 196], [87.31, 110, 130.81, 164.81], [98, 123.47, 146.83, 196], [82.41, 103.83, 130.81, 164.81]];
    const motifs = [[220, 261.63, 329.63, 293.66], [196, 220, 261.63, 329.63], [246.94, 293.66, 392, 329.63], [207.65, 261.63, 329.63, 293.66]];
    const playScene = () => {
      const step = bgmStep.current++ % chords.length, chord = chords[step], motif = motifs[step];
      chord.forEach((note, index) => playTone(note, 4.4, .0045 - index * .00045, index % 2 ? "sine" : "triangle", index * .055));
      playTone(chord[0] / 2, 3.8, .008, "sine");
      motif.forEach((note, index) => playTone(note, .72, .0055, "sine", .38 + index * .46));
      playTone(chord[2] * 2, 1.5, .0028, "triangle", 2.05);
    };
    playScene(); bgmTimer.current = setInterval(playScene, 2600);
  }, [ensureAudio, playTone]);

  const startGame = () => { if (!bootReady) return; startBgm(); setStarted(true); };
  const toggleSound = () => { const next = !muted; setMuted(next); const context = audioContext.current, gain = masterGain.current; if (context && gain) gain.gain.setTargetAtTime(next ? 0 : .72, context.currentTime, .04); };
  useEffect(() => () => { if (bgmTimer.current) clearInterval(bgmTimer.current); if (audioContext.current) void audioContext.current.close(); }, []);

  const tick = useCallback(() => setGame(prev => {
    if (paused || !started) return prev;
    const g: GameState = { ...prev, buildings: { ...prev.buildings }, items: prev.items.map(i => ({ ...i })), sold: { ...prev.sold }, inventory: { ...prev.inventory }, sellerStatus: { ...prev.sellerStatus }, cityDeliveries: { ...(prev.cityDeliveries || {}) }, securityStock: { ...(prev.securityStock || {}) }, satisfaction: Math.max(25, (prev.satisfaction ?? 70) - .008), lifetime: prev.lifetime + .5 };
    const oxygen = oxygenNetwork(g.buildings);
    for (const [pos, b] of Object.entries(g.buildings)) if (["powerPlant", "advancedPowerPlant"].includes(b.kind) && oxygen.has(pos) && (g.inventory[`fuel:${pos}`] || 0) > 0) g.inventory[`fuel:${pos}`] = Math.max(0, g.inventory[`fuel:${pos}`] - (b.kind === "advancedPowerPlant" ? .1 : .25));
    const powered = poweredNetwork(g.buildings, g.inventory, oxygen);
    const occupied = new Map(g.items.map(i => [key(i.x, i.y), i]));
    const toRemove = new Set<number>();
    const spawned: MovingItem[] = [];
    let earned = 0, xp = 0, researchGain = 0;

    for (const [pos, b0] of Object.entries(g.buildings)) {
      const levelBoost = 1 + ((b0.level || 1) - 1) * .25;
      const [x, y] = pos.split(",").map(Number), b = { ...b0, progress: b0.progress + .5 * levelBoost };
      g.buildings[pos] = b;
      const out = DIRS[b.dir], nx = x + out.x, ny = y + out.y;
      if (["drill", "copperDrill", "lumber"].includes(b.kind) && b.progress >= (b.kind === "lumber" ? 3 : b.kind === "copperDrill" ? 3.5 : 2.5)) {
        const res = resources[pos]; const valid = b.kind === "drill" ? res === "iron" : b.kind === "copperDrill" ? res === "copper" : res === "tree";
        const type = valid ? resourceMeta[res!].item : "ironOre", outputTarget = g.buildings[key(nx, ny)];
        if (valid && (b.kind === "lumber" || powered.has(pos)) && !occupied.has(key(nx, ny)) && outputTarget && canReceiveItem(outputTarget.kind, type)) {
          const ni = { id: g.nextId++, type, x: nx, y: ny }; spawned.push(ni); occupied.set(key(nx, ny), ni); b.progress = 0;
        }
      }
      if (b.kind === "lab" && b.progress >= 8) { researchGain += 1; b.progress = 0; }
      if (b.kind === "smelter" && oxygen.has(pos) && b.progress >= 2 && (g.inventory[`ore:${pos}`] || 0) >= 1 && (g.inventory[`heat:${pos}`] || 0) >= 1 && g.buildings[key(nx, ny)] && canReceiveItem(g.buildings[key(nx, ny)].kind, "ironPlate") && !occupied.has(key(nx, ny))) {
        const ni = { id: g.nextId++, type: "ironPlate" as Item, x: nx, y: ny };
        spawned.push(ni); occupied.set(key(nx, ny), ni);
        g.inventory[`ore:${pos}`] = Math.max(0, (g.inventory[`ore:${pos}`] || 0) - 1);
        g.inventory[`heat:${pos}`] = Math.max(0, (g.inventory[`heat:${pos}`] || 0) - 1);
        b.progress = 0;
      }
      if (b.kind === "wireMill" && powered.has(pos) && b.progress >= 1.5 && (g.inventory[`wireStock:${pos}`] || 0) >= 1 && g.buildings[key(nx, ny)] && canReceiveItem(g.buildings[key(nx, ny)].kind, "copperWire") && !occupied.has(key(nx, ny))) {
        const ni = { id: g.nextId++, type: "copperWire" as Item, x: nx, y: ny }; spawned.push(ni); occupied.set(key(nx, ny), ni);
        g.inventory[`wireStock:${pos}`] = Math.max(0, (g.inventory[`wireStock:${pos}`] || 0) - 1); b.progress = 0;
      }
      if (b.kind === "batteryPlant" && powered.has(pos) && b.progress >= 3 && (g.inventory[`batteryWire:${pos}`] || 0) >= 2 && (g.inventory[`batteryPlate:${pos}`] || 0) >= 1 && g.buildings[key(nx, ny)] && canReceiveItem(g.buildings[key(nx, ny)].kind, "battery") && !occupied.has(key(nx, ny))) {
        const ni = { id: g.nextId++, type: "battery" as Item, x: nx, y: ny }; spawned.push(ni); occupied.set(key(nx, ny), ni);
        g.inventory[`batteryWire:${pos}`] -= 2; g.inventory[`batteryPlate:${pos}`] -= 1; b.progress = 0;
      }
      if (b.kind === "fenceFactory" && b.progress >= 3 && (g.inventory[`fencePlate:${pos}`] || 0) >= 6 && g.buildings[key(nx, ny)] && canReceiveItem(g.buildings[key(nx, ny)].kind, "steelFence") && !occupied.has(key(nx, ny))) {
        const ni = { id: g.nextId++, type: "steelFence" as Item, x: nx, y: ny }; spawned.push(ni); occupied.set(key(nx, ny), ni);
        g.inventory[`fencePlate:${pos}`] -= 6; b.progress = 0;
      }
    }

    const shuffled = [...g.items].sort((a, b) => b.x + b.y - a.x - a.y);
    for (const item of shuffled) {
      if (toRemove.has(item.id)) continue;
      const b = g.buildings[key(item.x, item.y)]; if (!b) { toRemove.add(item.id); continue; }
      const machinePos = key(item.x, item.y);
      if (b.kind === "powerPlant" && item.type === "wood") {
        g.inventory[`fuel:${machinePos}`] = (g.inventory[`fuel:${machinePos}`] || 0) + 12; toRemove.add(item.id); occupied.delete(machinePos); continue;
      }
      if (b.kind === "advancedPowerPlant" && item.type === "wood") {
        g.inventory[`fuel:${machinePos}`] = (g.inventory[`fuel:${machinePos}`] || 0) + 30; toRemove.add(item.id); occupied.delete(machinePos); continue;
      }
      if (b.kind === "smelter" && item.type === "wood") {
        g.inventory[`heat:${machinePos}`] = (g.inventory[`heat:${machinePos}`] || 0) + 4; toRemove.add(item.id); occupied.delete(machinePos); continue;
      }
      if (b.kind === "smelter" && item.type === "ironOre") {
        g.inventory[`ore:${machinePos}`] = (g.inventory[`ore:${machinePos}`] || 0) + 1; toRemove.add(item.id); occupied.delete(machinePos); continue;
      }
      if (b.kind === "wireMill" && item.type === "copperOre") {
        g.inventory[`wireStock:${machinePos}`] = (g.inventory[`wireStock:${machinePos}`] || 0) + 2; toRemove.add(item.id); occupied.delete(machinePos); continue;
      }
      if (b.kind === "batteryPlant" && item.type === "copperWire") {
        g.inventory[`batteryWire:${machinePos}`] = (g.inventory[`batteryWire:${machinePos}`] || 0) + 1; toRemove.add(item.id); occupied.delete(machinePos); continue;
      }
      if (b.kind === "batteryPlant" && item.type === "ironPlate") {
        g.inventory[`batteryPlate:${machinePos}`] = (g.inventory[`batteryPlate:${machinePos}`] || 0) + 1; toRemove.add(item.id); occupied.delete(machinePos); continue;
      }
      if (b.kind === "fenceFactory" && item.type === "ironPlate") {
        g.inventory[`fencePlate:${machinePos}`] = (g.inventory[`fencePlate:${machinePos}`] || 0) + 1; toRemove.add(item.id); occupied.delete(machinePos); continue;
      }
      if (b.kind === "cityDepot") {
        const project = cityProjects[g.cityProject || 0], required = project?.requirements[item.type] || 0, delivered = g.cityDeliveries[item.type] || 0;
        if (required > delivered) g.cityDeliveries[item.type] = Math.min(required, delivered + 1);
        else g.inventory[`cityReserve:${item.type}`] = (g.inventory[`cityReserve:${item.type}`] || 0) + 1;
        g.satisfaction = Math.min(100, g.satisfaction + (required > delivered ? .8 : .25)); xp += required > delivered ? 2 : .5;
        toRemove.add(item.id); occupied.delete(machinePos); continue;
      }
      if (b.kind === "securityDepot") {
        const stockKey = item.type === "steelFence" ? "wall" : item.type === "ironPlate" ? "fenceSteel" : item.type === "gear" ? "defenseParts" : `reserve:${item.type}`;
        g.securityStock[stockKey] = (g.securityStock[stockKey] || 0) + 1; toRemove.add(item.id); occupied.delete(machinePos); continue;
      }
      if (b.kind === "seller") {
        const cityBonus = 1 + Math.max(0, g.satisfaction - 60) / 200;
        const value = itemMeta[item.type].price * market[item.type] * cityBonus;
        const previousSale = g.sellerStatus[machinePos];
        g.sellerStatus[machinePos] = { type: item.type, lastPrice: value, count: (previousSale?.count || 0) + 1, revenue: (previousSale?.revenue || 0) + value };
        earned += value; xp += Math.max(1, value / 25); g.sold[item.type] = (g.sold[item.type] || 0) + 1; toRemove.add(item.id); occupied.delete(machinePos); continue;
      }
      if (b.kind === "assembler" && item.type === "ironPlate") {
        const stored = g.inventory._assembly || 0;
        if (stored < 1) { g.inventory._assembly = stored + 1; toRemove.add(item.id); occupied.delete(key(item.x, item.y)); continue; }
        g.inventory._assembly = 0; item.type = "gear";
      }
      if (b.kind === "splitter") {
        const outputDirs = [b.dir, b.altDir ?? ((b.dir + 1) % 4)];
        const connected = outputDirs.filter(dir => { const d = DIRS[dir], target = g.buildings[key(item.x + d.x, item.y + d.y)]; return !!target && canReceiveItem(target.kind, item.type); });
        const cursor = Math.floor(g.inventory[`split:${machinePos}`] || 0);
        const choices = connected.length ? connected.map((_, index) => DIRS[connected[(cursor + index) % connected.length]]) : [];
        for (const d of choices) {
          const nx = item.x + d.x, ny = item.y + d.y, targetPos = key(nx, ny);
          if (g.buildings[targetPos] && canReceiveItem(g.buildings[targetPos].kind, item.type) && !occupied.has(targetPos)) { occupied.delete(machinePos); item.x = nx; item.y = ny; occupied.set(targetPos, item); g.inventory[`split:${machinePos}`] = cursor + 1; break; }
        }
      } else if (["conveyor", "fastConveyor", "merger", "smelter", "wireMill", "batteryPlant", "assembler", "fenceFactory", "warehouse", "largeWarehouse"].includes(b.kind)) {
        const d = DIRS[b.dir]; let nx = item.x + d.x, ny = item.y + d.y, targetPos = key(nx, ny), target = g.buildings[targetPos];
        if (b.kind === "fastConveyor" && target?.kind === "fastConveyor") {
          const nextDir = DIRS[target.dir], fastX = nx + nextDir.x, fastY = ny + nextDir.y, fastPos = key(fastX, fastY);
          if (g.buildings[fastPos] && canReceiveItem(g.buildings[fastPos].kind, item.type) && !occupied.has(fastPos)) { nx = fastX; ny = fastY; targetPos = fastPos; target = g.buildings[fastPos]; }
        }
        if (target && canReceiveItem(target.kind, item.type) && !occupied.has(targetPos)) { occupied.delete(machinePos); item.x = nx; item.y = ny; occupied.set(targetPos, item); }
      }
    }
    g.items = g.items.filter(i => !toRemove.has(i.id)).concat(spawned).slice(-160);
    if (earned > 0) incomeEvents.current.push({ at: Date.now(), value: earned });
    g.money += earned; g.cityXp += xp; g.research += researchGain;
    return g;
  }), [market, paused, started]);
  useEffect(() => { const id = setInterval(tick, 500); return () => clearInterval(id); }, [tick]);

  const place = (x: number, y: number) => {
    if (wasDragging.current) { wasDragging.current = false; return; }
    const pos = key(x, y);
    setGame(g => {
      if (!isLandUnlocked(x, y, g.landTier || 1)) { setToast("잠긴 부지입니다 · 연구 레벨을 올리고 새 구역을 구매하세요"); return g; }
      if (selected === "rotate") {
        const target = g.buildings[pos];
        if (!target) { setToast("회전할 건물을 선택하세요"); return g; }
        const nextDir = (target.dir + 1) % 4;
        setToast(`${buildingMeta[target.kind].name} 방향을 ${DIRS[nextDir].icon}로 변경했습니다`);
        return { ...g, buildings: { ...g.buildings, [pos]: { ...target, dir: nextDir } } };
      }
      if (selected === "delete") {
        if (!g.buildings[pos]) return g; setToast("건물을 철거하고 비용의 50%를 회수했습니다");
        playSfx("delete");
        const sellerStatus = { ...g.sellerStatus }; delete sellerStatus[pos];
        return { ...g, money: g.money + buildingMeta[g.buildings[pos].kind].cost * .5, buildings: Object.fromEntries(Object.entries(g.buildings).filter(([k]) => k !== pos)), items: g.items.filter(i => key(i.x, i.y) !== pos), sellerStatus };
      }
      const meta = buildingMeta[selected];
      if (g.buildings[pos]) { setInspectorPos(pos); setToast("구조물 관리창을 열었습니다"); return g; }
      if (g.money < meta.cost) { setToast("자금이 부족합니다"); return g; }
      if (selected === "cityDepot" && Object.values(g.buildings).some(building => building.kind === "cityDepot")) { setToast("도시 납품소는 한 곳만 설치할 수 있습니다"); return g; }
      if (selected === "securityDepot" && Object.values(g.buildings).some(building => building.kind === "securityDepot")) { setToast("안보 보급소는 한 곳만 설치할 수 있습니다"); return g; }
      if (selected === "drill" && resources[pos] !== "iron") { setToast("철광기는 철광맥 위에만 설치할 수 있습니다"); return g; }
      if (selected === "copperDrill" && resources[pos] !== "copper") { setToast("구리 광산은 구리광맥 위에만 설치할 수 있습니다"); return g; }
      if (selected === "lumber" && resources[pos] !== "tree") { setToast("벌목기는 나무 위에만 설치할 수 있습니다"); return g; }
      setToast(`${meta.name} 설치 완료 · R 키로 방향 전환`);
      playSfx("install");
      return { ...g, money: g.money - meta.cost, buildings: { ...g.buildings, [pos]: { kind: selected, dir: rotation, altDir: selected === "splitter" ? (rotation + 1) % 4 : undefined, progress: 0, level: 1 } } };
    });
  };

  const efficiency = useMemo(() => {
    const all = Object.values(game.buildings); if (!all.length) return 0;
    const productive = all.filter(b => b.kind === "conveyor" || b.progress < 3.5).length;
    return Math.min(98, Math.round(38 + productive / all.length * 52 + Math.min(8, game.sold.ironPlate || 0)));
  }, [game.buildings, game.sold]);
  const cityLevel = Math.min(10, Math.max(1 + (game.cityProject || 0), 1 + Math.floor(game.cityXp / 240)));
  const contractNow = game.sold.ironPlate || 0;
  const nextLand = landPlans.find(plan => plan.tier === (game.landTier || 1) + 1);
  const activeLandBounds = landBounds(game.landTier || 1);
  const groups = ["채집", "전력", "산소", "운송", "가공", "물류", "판매", "도시", "안보", "연구"];
  const itemAt = new Map(game.items.map(i => [key(i.x, i.y), i]));
  const inspected = inspectorPos ? game.buildings[inspectorPos] : undefined;
  const inspectedInfo = inspected ? productionMeta[inspected.kind] : undefined;
  const inspectedSale = inspectorPos ? game.sellerStatus[inspectorPos] : undefined;
  const visibleRecipes = recipeCatalog.filter(recipe => `${itemMeta[recipe.item].label} ${recipe.building} ${recipe.ingredients}`.toLowerCase().includes(recipeQuery.trim().toLowerCase()));
  const recipeDetail = visibleRecipes.find(recipe => recipe.item === selectedRecipe) || visibleRecipes[0] || recipeCatalog[0];
  const selectedPriceHistory = marketHistory[recipeDetail.item] || [itemMeta[recipeDetail.item].price * market[recipeDetail.item]];
  const historyLow = Math.min(...selectedPriceHistory), historyHigh = Math.max(...selectedPriceHistory);
  const historyChange = selectedPriceHistory[selectedPriceHistory.length - 1] - selectedPriceHistory[0];
  const activeProduction = Array.from(new Set(Object.values(game.buildings).map(b => productionMeta[b.kind].output).filter(v => !v.includes("운송") && !v.includes("보관") && !v.includes("판매"))));
  const liveOxygen = oxygenNetwork(game.buildings);
  const livePower = poweredNetwork(game.buildings, game.inventory, liveOxygen);
  const currentCityProject = cityProjects[game.cityProject || 0];
  const cityRequirementEntries = currentCityProject ? Object.entries(currentCityProject.requirements) as [Item, number][] : [];
  const cityProjectComplete = !!currentCityProject && cityRequirementEntries.every(([type, amount]) => (game.cityDeliveries?.[type] || 0) >= amount);
  const cityProjectProgress = currentCityProject ? cityRequirementEntries.reduce((sum, [type, amount]) => sum + Math.min(1, (game.cityDeliveries?.[type] || 0) / amount), 0) / Math.max(1, cityRequirementEntries.length) * 100 : 100;
  const citySaleBonus = Math.max(0, (game.satisfaction ?? 70) - 60) / 2;
  const securityScore = Math.min(100, Object.values(game.securityLayout || {}).reduce((sum, building) => sum + building.hp, 0) / 3);
  const currentSecurityStage = securityStages[selectedSecurityStage];
  const zombieThreat = currentSecurityStage?.threat || 0;
  const securityStageReady = !!currentSecurityStage && Object.values(game.securityLayout || {}).some(building => building.kind === "turret" || building.kind === "missile");

  const rotateAt = (pos: string) => setGame(g => {
    const b = g.buildings[pos]; if (!b) return g;
    if (noDirection.has(b.kind)) { setToast(`${buildingMeta[b.kind].name}은 방향 설정이 필요하지 않습니다`); return g; }
    let dir = (b.dir + 1) % 4; if (b.kind === "splitter" && dir === (b.altDir ?? ((b.dir + 1) % 4))) dir = (dir + 1) % 4; setToast(`${buildingMeta[b.kind].name} 방향 ${DIRS[dir].icon}`);
    return { ...g, buildings: { ...g.buildings, [pos]: { ...b, dir } } };
  });
  const rotateSplitterPort = (pos: string, port: "a" | "b") => setGame(g => {
    const b = g.buildings[pos]; if (!b || b.kind !== "splitter") return g;
    const other = port === "a" ? (b.altDir ?? ((b.dir + 1) % 4)) : b.dir;
    let next = ((port === "a" ? b.dir : (b.altDir ?? ((b.dir + 1) % 4))) + 1) % 4;
    if (next === other) next = (next + 1) % 4;
    setToast(`분배기 출구 ${port === "a" ? "A" : "B"} 방향 ${DIRS[next].icon}`);
    return { ...g, buildings: { ...g.buildings, [pos]: { ...b, ...(port === "a" ? { dir: next } : { altDir: next }) } } };
  });
  const deleteAt = (pos: string) => setGame(g => {
    const b = g.buildings[pos]; if (!b) return g;
    setInspectorPos(null); setToast(`${buildingMeta[b.kind].name} 철거 · 비용 50% 회수`);
    playSfx("delete");
    const sellerStatus = { ...g.sellerStatus }; delete sellerStatus[pos];
    return { ...g, money: g.money + buildingMeta[b.kind].cost * .5, buildings: Object.fromEntries(Object.entries(g.buildings).filter(([k]) => k !== pos)), items: g.items.filter(i => key(i.x, i.y) !== pos), sellerStatus };
  });
  const upgradeAt = (pos: string) => setGame(g => {
    const b = g.buildings[pos]; if (!b) return g;
    if (noUpgrade.has(b.kind)) { setToast(`${buildingMeta[b.kind].name}은 업그레이드가 필요하지 않습니다`); return g; }
    const level = b.level || 1, cost = upgradeCost(b.kind, level);
    if (g.money < cost) { setToast(`업그레이드 자금이 ₩${won(cost - g.money)} 부족합니다`); return g; }
    setToast(`${buildingMeta[b.kind].name} Lv.${level + 1} · 생산 효율 +25%`);
    playSfx("upgrade");
    return { ...g, money: g.money - cost, buildings: { ...g.buildings, [pos]: { ...b, level: level + 1 } } };
  });
  const levelUpResearch = () => setGame(g => {
    const cost = researchCost(g.researchLevel);
    if (g.research < cost) { setToast(`연구 레벨업에 RP ${won(cost - g.research)}가 더 필요합니다`); return g; }
    setToast(`연구 Lv.${g.researchLevel + 1} 달성 · 새로운 건설 품목 해금`);
    return { ...g, research: g.research - cost, researchLevel: g.researchLevel + 1 };
  });
  const buyLand = () => setGame(g => {
    const plan = landPlans.find(entry => entry.tier === (g.landTier || 1) + 1);
    if (!plan) { setToast("모든 산업 구역을 확보했습니다"); return g; }
    if (g.researchLevel < plan.requiredLevel) { setToast(`${plan.name}은 연구 Lv.${plan.requiredLevel}에서 구매할 수 있습니다`); return g; }
    if (g.money < plan.cost) { setToast(`부지 구매 자금이 ₩${won(plan.cost - g.money)} 부족합니다`); return g; }
    setToast(`${plan.name} 확보 완료 · 필드가 확장되었습니다`);
    const next = { ...g, money: g.money - plan.cost, landTier: plan.tier }; localStorage.setItem("factory-flow-save", JSON.stringify({ ...next, items: [] })); return next;
  });
  const completeCityProject = () => setGame(g => {
    const project = cityProjects[g.cityProject || 0]; if (!project) { setToast("현재 공개된 도시 프로젝트를 모두 완료했습니다"); return g; }
    const complete = (Object.entries(project.requirements) as [Item, number][]).every(([type, amount]) => (g.cityDeliveries?.[type] || 0) >= amount);
    if (!complete) { setToast("도시 프로젝트에 필요한 물품이 부족합니다"); return g; }
    playSfx("upgrade"); setToast(`${project.name} 완공! ${project.unlock} 해금`);
    return { ...g, money: g.money + project.rewardMoney, research: g.research + project.rewardResearch, cityXp: g.cityXp + 240, cityProject: (g.cityProject || 0) + 1, cityDeliveries: {}, satisfaction: Math.min(100, (g.satisfaction ?? 70) + 10) };
  });

  const save = () => { localStorage.setItem("factory-flow-save", JSON.stringify({ ...game, items: [] })); setToast("게임을 저장했습니다"); };
  const claimContract = () => {
    if (contractNow < 20) return setToast("철판이 더 필요합니다");
    setGame(g => ({ ...g, money: g.money + 3500, research: g.research + 20, sold: { ...g.sold, ironPlate: (g.sold.ironPlate || 0) - 20 } })); setToast("계약 완료! ₩3,500 + 연구 20 획득");
  };

  const placeDefense = (x: number, y: number) => {
    if (battle.phase === "battle") { setToast("전투 중에는 방어시설을 변경할 수 없습니다"); return; }
    if (x === CORE_X && y === CORE_Y) { setToast("도시 핵심 시설이 있는 타일입니다"); return; }
    const pos = key(x, y);
    setGame(g => {
      const layout = { ...(g.securityLayout || {}) }, existing = layout[pos];
      if (defenseSelected === "erase") {
        if (!existing) return g;
        const meta = defenseMeta[existing.kind]; delete layout[pos]; playSfx("delete");
        setToast(`${meta.name} 철거 · 자재 일부 회수`);
        return { ...g, securityLayout: layout, securityStock: existing.kind === "wall" ? { ...g.securityStock, wall: (g.securityStock.wall || 0) + 1 } : { ...g.securityStock, fenceSteel: (g.securityStock.fenceSteel || 0) + Math.floor(meta.steel / 2), defenseParts: (g.securityStock.defenseParts || 0) + Math.floor(meta.parts / 2) } };
      }
      if (existing) { setToast("이미 방어시설이 설치된 타일입니다"); return g; }
      const meta = defenseMeta[defenseSelected];
      if (defenseSelected === "wall") {
        if ((g.securityStock.wall || 0) < 1) { setToast("안보 보급소에 철제 울타리 완제품이 없습니다"); return g; }
        layout[pos] = { kind: "wall", hp: meta.hp }; playSfx("install"); setToast("철제 울타리 설치 완료");
        return { ...g, securityLayout: layout, securityStock: { ...g.securityStock, wall: (g.securityStock.wall || 0) - 1 } };
      }
      if ((g.securityStock.fenceSteel || 0) < meta.steel || (g.securityStock.defenseParts || 0) < meta.parts) { setToast(`${meta.name} 설치 물자가 부족합니다`); return g; }
      layout[pos] = { kind: defenseSelected, hp: meta.hp }; playSfx("install"); setToast(`${meta.name} 설치 완료`);
      return { ...g, securityLayout: layout, securityStock: { ...g.securityStock, fenceSteel: (g.securityStock.fenceSteel || 0) - meta.steel, defenseParts: (g.securityStock.defenseParts || 0) - meta.parts } };
    });
  };

  const startDefenseBattle = () => {
    if (selectedSecurityStage > (game.securityStage || 0)) { setToast("이전 스테이지를 먼저 클리어하세요"); return; }
    if (!securityStageReady) { setToast("기관총 포탑 또는 미사일 포대를 먼저 설치하세요"); return; }
    battleRewardedStage.current = null; playSfx("upgrade"); setToast(`STAGE ${selectedSecurityStage + 1} 방어 작전 시작`);
    setBattle({ phase: "battle", stage: selectedSecurityStage, zombies: [], shots: [], pending: stageZombieCount(currentSecurityStage), coreHp: 100, tick: 0 });
  };

  useEffect(() => {
    if (battle.phase !== "battle") return;
    const id = setInterval(() => setBattle(previous => {
      if (previous.phase !== "battle") return previous;
      const stageIndex = previous.stage, stage = securityStages[stageIndex];
      if (!stage) return { ...previous, phase: "won" };
      let pending = previous.pending, coreHp = previous.coreHp, zombies = previous.zombies.map(zombie => ({ ...zombie })); const shots: DefenseShot[] = [];
      const layout = Object.fromEntries(Object.entries(gameRef.current.securityLayout || {}).map(([pos, building]) => [pos, { ...building }])) as Record<string, DefenseBuilding>;
      const spawns = [{ x: 0, y: 1 }, { x: DEF_W - 1, y: 7 }, { x: 0, y: 7 }, { x: DEF_W - 1, y: 1 }, { x: 7, y: 0 }, { x: 7, y: DEF_H - 1 }];
      if (pending > 0) {
        const zombieQueue = (Object.entries(stage.composition) as [ZombieKind, number][]).flatMap(([kind, count]) => Array.from({ length: count }, () => kind));
        const spawnIndex = zombieQueue.length - pending, kind = zombieQueue[spawnIndex], spawn = spawns[spawnIndex % spawns.length], maxHp = Math.round(zombieMeta[kind].hp * (1 + stageIndex * .11));
        zombies.push({ id: Date.now() + pending, kind, x: spawn.x, y: spawn.y, hp: maxHp, maxHp }); pending -= 1;
      }
      for (const [pos, defense] of Object.entries(layout)) {
        const meta = defenseMeta[defense.kind]; if (!meta.damage) continue;
        const [tx, ty] = pos.split(",").map(Number);
        const target = zombies.filter(zombie => zombie.hp > 0 && Math.abs(zombie.x - tx) + Math.abs(zombie.y - ty) <= meta.range).sort((a, b) => (Math.abs(a.x - CORE_X) + Math.abs(a.y - CORE_Y)) - (Math.abs(b.x - CORE_X) + Math.abs(b.y - CORE_Y)))[0];
        if (target) { target.hp -= meta.damage; shots.push({ id: Date.now() + shots.length, kind: defense.kind === "missile" ? "missile" : "bullet", fromX: tx, fromY: ty, toX: target.x, toY: target.y }); }
      }
      zombies = zombies.filter(zombie => zombie.hp > 0);
      for (const zombie of zombies) {
        const moves = zombie.kind === "runner" ? 2 : 1;
        for (let move = 0; move < moves; move += 1) {
          const distance = Math.abs(zombie.x - CORE_X) + Math.abs(zombie.y - CORE_Y), attack = zombieMeta[zombie.kind].damage + Math.floor(stageIndex / 3);
          if (zombie.kind === "spitter" && distance <= 3) { coreHp -= attack; break; }
          if (distance <= 1) { coreHp -= attack; break; }
          const step = nextDefenseStep(zombie.x, zombie.y, layout);
          if (step) { zombie.x = step.x; zombie.y = step.y; continue; }
          const adjacent = DIRS.map(direction => key(zombie.x + direction.x, zombie.y + direction.y)).find(pos => layout[pos]);
          if (adjacent) { layout[adjacent].hp -= attack; if (layout[adjacent].hp <= 0) delete layout[adjacent]; break; }
          const dx = Math.sign(CORE_X - zombie.x), dy = Math.sign(CORE_Y - zombie.y), nx = zombie.x + (Math.abs(CORE_X - zombie.x) >= Math.abs(CORE_Y - zombie.y) ? dx : 0), ny = zombie.y + (Math.abs(CORE_X - zombie.x) < Math.abs(CORE_Y - zombie.y) ? dy : 0), np = key(nx, ny);
          if (layout[np]) { layout[np].hp -= attack; if (layout[np].hp <= 0) delete layout[np]; break; } else { zombie.x = nx; zombie.y = ny; }
        }
      }
      setGame(g => ({ ...g, securityLayout: layout }));
      if (coreHp <= 0) { setToast("도시 핵심 시설이 파괴되었습니다 · 방어선을 재정비하세요"); return { phase: "lost", stage: stageIndex, zombies, shots, pending, coreHp: 0, tick: previous.tick + 1 }; }
      if (pending === 0 && zombies.length === 0) {
        if (battleRewardedStage.current !== stageIndex) {
          battleRewardedStage.current = stageIndex; playSfx("upgrade");
          const firstClear = gameRef.current.securityStage === stageIndex;
          setToast(firstClear ? `STAGE ${stageIndex + 1} 클리어 · ₩${stage.reward.toLocaleString()} + ${stage.research} RP` : `STAGE ${stageIndex + 1} 재도전 클리어`);
          if (firstClear) { setGame(g => ({ ...g, money: g.money + stage.reward, research: g.research + stage.research, securityStage: Math.min(10, stageIndex + 1) })); setSelectedSecurityStage(Math.min(9, stageIndex + 1)); }
        }
        return { phase: "won", stage: stageIndex, zombies: [], shots, pending: 0, coreHp, tick: previous.tick + 1 };
      }
      return { phase: "battle", stage: stageIndex, zombies, shots, pending, coreHp, tick: previous.tick + 1 };
    }), 650);
    return () => clearInterval(id);
  }, [battle.phase, playSfx]);

  return <main className="game-shell">
    {!started && <section className={`boot-screen ${bootReady ? "ready" : "loading"}`} onClick={startGame} aria-label={bootReady ? "게임 시작" : "게임 로딩 중"}>
      <div className="boot-grid" />
      <div className="boot-logo"><span>AK</span><small>INDUSTRIAL SYSTEMS</small></div>
      <h1>APPLEKING <em>GAMES</em></h1>
      <p>FOUNDRY FLOW</p>
      <div className="boot-loader"><i /><b>{bootReady ? "SYSTEM READY" : "FACTORY DATA LOADING"}</b></div>
      <button disabled={!bootReady}>{bootReady ? "화면을 눌러 게임 시작" : "불러오는 중…"}</button>
      <footer>HEADPHONES RECOMMENDED · LANDSCAPE MODE</footer>
    </section>}
    <header className="topbar">
      <div className="brand"><span className="brand-mark">F</span><div><b>FOUNDRY FLOW</b><small>자동화 도시 건설국</small></div></div>
      <div className="top-stats">
        <div><small>보유 자금</small><strong>₩ {won(game.money)}</strong><em>+{won((game.sold.ironPlate || 0) * itemMeta.ironPlate.price)} 누적</em></div>
        <div><small>도시 성장</small><strong>LV.{cityLevel} 제조 도시</strong><span className="mini-track"><i style={{ width: `${currentCityProject ? cityProjectProgress : 100}%` }} /></span></div>
        <div><small>연구 포인트</small><strong className="cyan">⌬ {won(game.research)} RP</strong><em>연구소 {Object.values(game.buildings).filter(b => b.kind === "lab").length}동</em></div>
      </div>
      <div className="header-actions"><button onClick={toggleSound} title={muted ? "소리 켜기" : "음소거"}>{muted ? "🔇" : "🔊"}</button><button onClick={save}>저장</button><button onClick={() => { if (confirm("저장 데이터를 초기화할까요?")) { localStorage.removeItem("factory-flow-save"); setGame(initial); } }}>↻</button></div>
    </header>

    <section className="workspace">
      <nav className="mobile-dock" aria-label="모바일 게임 메뉴">
        <button className={mobilePanel === "build" ? "active" : ""} onClick={() => setMobilePanel(p => p === "build" ? null : "build")}><span>▦</span>건설</button>
        <button className={recipeOpen ? "active" : ""} onClick={() => { setRecipeOpen(true); setMobilePanel(null); }}><span>⌘</span>조합법</button>
        <button className={selected === "delete" ? "active danger" : ""} onClick={() => { setSelected("delete"); setMobilePanel(null); }}><span>⌫</span>철거</button>
        <button className={mobilePanel === "intel" ? "active" : ""} onClick={() => setMobilePanel(p => p === "intel" ? null : "intel")}><span>◫</span>현황</button>
      </nav>
      {mobilePanel && <button className="mobile-backdrop" aria-label="패널 닫기" onClick={() => setMobilePanel(null)} />}
      <aside className={`build-panel panel ${mobilePanel === "build" ? "mobile-open" : ""}`}>
        <div className="panel-title"><div><span>BUILD</span><h2>건설 메뉴</h2></div><kbd>R 회전</kbd></div>
        <div className="palette-scroll">
          {groups.map(group => <section key={group} className="build-group"><h3>{group}</h3><div className="build-grid">
            {buildings.filter(b => b.group === group).map(b => { const required = unlockLevel[b.kind] || 1, locked = game.researchLevel < required; return <button key={b.kind} disabled={locked} className={`build-card ${selected === b.kind ? "active" : ""} ${locked ? "locked" : ""}`} onClick={() => { setSelected(b.kind); setMobilePanel(null); }} title={locked ? `연구 Lv.${required} 필요` : b.desc}>
              <span className={`build-icon ${b.kind}`}>{factoryImages[b.kind] ? <img src={factoryImages[b.kind]} alt={b.name} /> : b.icon}</span><span className="build-copy"><b>{b.name}<em>₩{won(b.cost)}</em></b><small>{b.desc}</small></span>
              {locked && <i className="unlock-badge">연구 Lv.{required}</i>}
            </button>})}
          </div></section>)}
        </div>
        <div className="tool-row"><button className={selected === "delete" ? "active danger" : ""} onClick={() => setSelected("delete")}>⌫ 철거</button><button className={selected === "rotate" ? "active" : ""} onClick={() => setSelected("rotate")}>↻ 설치물 회전</button><button onClick={() => setRotation(r => (r + 1) % 4)}>설치 방향 {DIRS[rotation].icon}</button></div>
      </aside>

      <section className="map-area">
        <div className="map-toolbar">
          <div className="sector"><span className="pulse" /> A-{String(game.landTier || 1).padStart(2, "0")} 산업 지구 <small>구역 {(game.landTier || 1)}/10</small></div>
          <div className="price-ticker"><span>◆ 철광석 <b>₩{won(itemMeta.ironOre.price * market.ironOre)}</b></span><i>→ 용광로 →</i><span>▣ 철판 <b>₩{won(itemMeta.ironPlate.price * market.ironPlate)}</b></span><button onClick={() => setRecipeOpen(true)}>⌘ 조합법</button></div>
          <button className={`land-expand ${nextLand && game.researchLevel >= nextLand.requiredLevel && game.money >= nextLand.cost ? "ready" : ""}`} onClick={buyLand} disabled={!nextLand}>{nextLand ? `▦ ${nextLand.name} · ₩${won(nextLand.cost)}` : "✓ 전체 부지 확보"}<small>{nextLand && `연구 Lv.${nextLand.requiredLevel}`}</small></button>
          <div className="zoom"><button onClick={() => setZoom(z => Math.max(.55, z - .1))}>−</button><b>{Math.round(zoom * 100)}%</b><button onClick={() => setZoom(z => Math.min(1.25, z + .1))}>＋</button></div>
        </div>
        <div className="map-viewport"
          onWheel={e => { e.preventDefault(); setZoom(z => Math.max(.55, Math.min(1.25, z + (e.deltaY < 0 ? .06 : -.06)))); }}
          onPointerDown={e => { down.current = { x: e.clientX, y: e.clientY }; wasDragging.current = false; if (e.pointerType === "touch") { e.currentTarget.setPointerCapture(e.pointerId); touchPointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (touchPointers.current.size === 2) { const points = [...touchPointers.current.values()]; pinch.current = { distance: Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y), zoom }; drag.current = null; wasDragging.current = true; } else drag.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y }; } else if (e.altKey || e.button === 1) { e.currentTarget.setPointerCapture(e.pointerId); drag.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y }; } }}
          onPointerMove={e => { if (e.pointerType === "touch" && touchPointers.current.has(e.pointerId)) touchPointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (pinch.current && touchPointers.current.size >= 2) { const points = [...touchPointers.current.values()], distance = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y); setZoom(Math.max(.55, Math.min(1.25, pinch.current.zoom * distance / Math.max(1, pinch.current.distance)))); wasDragging.current = true; return; } if (drag.current) { if (Math.hypot(e.clientX - drag.current.x, e.clientY - drag.current.y) > 6) wasDragging.current = true; setPan({ x: drag.current.px + e.clientX - drag.current.x, y: drag.current.py + e.clientY - drag.current.y }); } }}
          onPointerUp={e => { touchPointers.current.delete(e.pointerId); if (touchPointers.current.size < 2) pinch.current = null; drag.current = null; down.current = null; }}
          onPointerCancel={e => { touchPointers.current.delete(e.pointerId); pinch.current = null; drag.current = null; }}>
          <div className="map-grid" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, gridTemplateColumns: `repeat(${W}, 64px)` }}>
            {Array.from({ length: W * H }, (_, i) => { const x = MAP_MIN_X + (i % W), y = MAP_MIN_Y + Math.floor(i / W), pos = key(x, y), res = resources[pos], b = game.buildings[pos], item = itemAt.get(pos), landLocked = !isLandUnlocked(x, y, game.landTier || 1), edgeMarker = landLocked && ((x === activeLandBounds.minX - 1 || x === activeLandBounds.maxX + 1) && y === Math.floor((activeLandBounds.minY + activeLandBounds.maxY) / 2) || (y === activeLandBounds.minY - 1 || y === activeLandBounds.maxY + 1) && x === Math.floor((activeLandBounds.minX + activeLandBounds.maxX) / 2)); return <button key={pos} className={`tile ${!landLocked && res ? `res-${res}` : ""} ${b ? "occupied" : ""} ${landLocked ? "land-locked" : ""}`} onClick={() => place(x, y)} aria-label={`${x}, ${y} 타일`}>
              {res && !b && !landLocked && <div className={`resource-node ${res}`}>{res === "iron" ? <img src="/assets/factory/iron-node.webp" alt="철광맥" /> : <span>{resourceMeta[res].icon}</span>}<small>{resourceMeta[res].label}</small></div>}
              {edgeMarker && <div className="land-fog"><b>구역 잠김</b><small>다음 부지는 상하좌우 동시 확장</small></div>}
              {b && <div className={`placed ${b.kind} ${["drill", "copperDrill", "wireMill", "batteryPlant"].includes(b.kind) && livePower.has(pos) ? "powered" : ""}`}><span className="machine-icon">{factoryImages[b.kind] ? <img src={factoryImages[b.kind]} alt={buildingMeta[b.kind].name} style={b.kind === "conveyor" ? { transform: `rotate(${(b.dir - 1) * 90}deg)` } : undefined} /> : buildingMeta[b.kind].icon}</span>{!noDirection.has(b.kind) && <i className={`dir d${b.dir}`}>{DIRS[b.dir].icon}</i>}{b.kind === "splitter" && <i className={`dir alt d${b.altDir ?? ((b.dir + 1) % 4)}`}>{DIRS[b.altDir ?? ((b.dir + 1) % 4)].icon}</i>}{b.kind !== "conveyor" && <small>{buildingMeta[b.kind].name}</small>}<em style={{ width: `${Math.min(100, b.progress / 3 * 100)}%` }} /></div>}
              {item && <span className="moving-item" style={{ background: itemMeta[item.type].color }} title={itemMeta[item.type].label}>{itemMeta[item.type].icon}</span>}
            </button>; })}
          </div>
          <div className="map-legend"><span><i className="legend-iron" /> 철광맥</span><span><i className="legend-tree" /> 산림</span><span><i className="legend-stone" /> 암석</span></div>
        </div>
        <div className="production-strip"><small>현재 생산</small>{activeProduction.length ? activeProduction.map(v => <span key={v}>{v}</span>) : <em>생산 라인 대기 중</em>}<b>운송 중 {game.items.length}</b></div>
        {inspectorPos && inspected && inspectedInfo && <section className="structure-inspector">
          <button className="inspector-close" onClick={() => setInspectorPos(null)} aria-label="닫기">×</button>
          <header><span className={`build-icon ${inspected.kind}`}>{factoryImages[inspected.kind] ? <img src={factoryImages[inspected.kind]} alt={buildingMeta[inspected.kind].name} /> : buildingMeta[inspected.kind].icon}</span><div><small>선택한 구조물</small><h3>{buildingMeta[inspected.kind].name} {!noUpgrade.has(inspected.kind) && <em>LV.{inspected.level || 1}</em>}</h3></div>{!noDirection.has(inspected.kind) && <i>{DIRS[inspected.dir].icon}</i>}</header>
          <p>{inspectedInfo.note}</p>
          {["powerPlant", "advancedPowerPlant", "smelter"].includes(inspected.kind) && <div className={`oxygen-status ${liveOxygen.has(inspectorPos) ? "on" : "off"}`}>O₂ {liveOxygen.has(inspectorPos) ? "산소 공급 정상 · 연소 가능" : "산소 부족 · 산소 공급기와 배관을 연결하세요"}</div>}
          {["oxygenGenerator", "oxygenPipe"].includes(inspected.kind) && <div className="oxygen-status on">O₂ {inspected.kind === "oxygenGenerator" ? "산소 생산 중" : liveOxygen.has(inspectorPos) ? "산소 전달 중" : "산소 공급기와 연결하세요"}</div>}
          {["drill", "copperDrill"].includes(inspected.kind) && <div className={`power-status ${livePower.has(inspectorPos) ? "on" : "off"}`}>⚡ {livePower.has(inspectorPos) ? `전력 공급 중 · 정상 ${inspected.kind === "copperDrill" ? "구리 채굴" : "철 채굴"}` : "전력 없음 · 발전기와 전선을 연결하세요"}</div>}
          {inspected.kind === "powerPlant" && <div className={`power-status ${(game.inventory[`fuel:${inspectorPos}`] || 0) > 0 ? "on" : "off"}`}>♠ 원목 연료 {Math.floor(game.inventory[`fuel:${inspectorPos}`] || 0)} · {(game.inventory[`fuel:${inspectorPos}`] || 0) > 0 ? "발전 중" : "컨베이어로 원목을 공급하세요"}</div>}
          {inspected.kind === "advancedPowerPlant" && <div className={`power-status ${(game.inventory[`fuel:${inspectorPos}`] || 0) > 0 ? "on" : "off"}`}>ϟ 고효율 연료 {Math.floor(game.inventory[`fuel:${inspectorPos}`] || 0)} · {(game.inventory[`fuel:${inspectorPos}`] || 0) > 0 ? "절약 발전 중" : "컨베이어로 원목을 공급하세요"}</div>}
          {inspected.kind === "smelter" && <div className={`power-status ${(game.inventory[`heat:${inspectorPos}`] || 0) > 0 ? "heat" : "off"}`}>♨ 화력 {Math.floor(game.inventory[`heat:${inspectorPos}`] || 0)} · ◆ 철광석 {Math.floor(game.inventory[`ore:${inspectorPos}`] || 0)} · {(game.inventory[`heat:${inspectorPos}`] || 0) <= 0 ? "원목을 공급하세요" : (game.inventory[`ore:${inspectorPos}`] || 0) <= 0 ? "철광석을 공급하세요" : "철판 제련 중"}</div>}
          {inspected.kind === "wireMill" && <div className={`power-status ${livePower.has(inspectorPos) ? "on" : "off"}`}>⚡ {livePower.has(inspectorPos) ? `전력 연결 · 전선 재고 ${Math.floor(game.inventory[`wireStock:${inspectorPos}`] || 0)}` : "전력 없음 · 발전기와 전선을 연결하세요"}</div>}
          {inspected.kind === "batteryPlant" && <div className={`power-status ${livePower.has(inspectorPos) ? "on" : "off"}`}>⚡ {livePower.has(inspectorPos) ? `전선 ${Math.floor(game.inventory[`batteryWire:${inspectorPos}`] || 0)} · 철판 ${Math.floor(game.inventory[`batteryPlate:${inspectorPos}`] || 0)}` : "전력 없음 · 발전기와 전선을 연결하세요"}</div>}
          {inspected.kind === "splitter" && <div className="splitter-ports"><span><small>출구 A</small><b>{DIRS[inspected.dir].icon}</b><button onClick={() => rotateSplitterPort(inspectorPos, "a")}>방향 변경</button></span><span><small>출구 B</small><b>{DIRS[inspected.altDir ?? ((inspected.dir + 1) % 4)].icon}</b><button onClick={() => rotateSplitterPort(inspectorPos, "b")}>방향 변경</button></span></div>}
          {inspected.kind === "cityDepot" && <div className="city-depot-status"><span>도시 만족도 <b>{Math.round(game.satisfaction ?? 70)}%</b></span><strong>{currentCityProject ? `${currentCityProject.icon} ${currentCityProject.name} 납품 중` : "✓ 공개 프로젝트 완료"}</strong><button onClick={() => { setTab("city"); setMobilePanel("intel"); setInspectorPos(null); }}>도시 목표 보기</button></div>}
          {inspected.kind === "securityDepot" && <div className="security-depot-status"><span>철제 울타리 완제품 <b>{Math.floor(game.securityStock?.wall || 0)}</b></span><span>철제 자재·기계 부품 <b>{Math.floor(game.securityStock?.fenceSteel || 0)} · {Math.floor(game.securityStock?.defenseParts || 0)}</b></span><button onClick={() => { setSelectedSecurityStage(Math.min(game.securityStage || 0, 9)); setSecurityOpen(true); setInspectorPos(null); }}>도시 안보 열기</button></div>}
          {inspected.kind === "seller" && <div className="seller-report">
            <div className="seller-report-head"><span>자동 판매 현황</span><em className={inspectedSale ? "live" : "waiting"}>{inspectedSale ? "판매 중" : "대기 중"}</em></div>
            {inspectedSale ? <>
              <div className="seller-product"><span style={{ color: itemMeta[inspectedSale.type].color }}>{itemMeta[inspectedSale.type].icon}</span><div><small>최근 판매 품목</small><b>{itemMeta[inspectedSale.type].label}</b></div><strong>₩{won(inspectedSale.lastPrice)}<small>최근 1개 판매가</small></strong></div>
              <div className="seller-stats"><span><small>현재 시장가</small><b>₩{won(itemMeta[inspectedSale.type].price * market[inspectedSale.type])}</b></span><span><small>누적 판매량</small><b>{won(inspectedSale.count)}개</b></span><span><small>누적 매출</small><b>₩{won(inspectedSale.revenue)}</b></span></div>
            </> : <div className="seller-empty"><span>⇢</span><div><b>판매할 물품을 기다리는 중</b><small>컨베이어를 판매소에 연결하면 도착한 물품과 판매가가 여기에 표시됩니다.</small></div></div>}
          </div>}
          <div className="process-flow"><span><small>입력</small><b>{inspectedInfo.input}</b></span><i>→</i><span><small>현재 생산</small><b>{inspectedInfo.output}</b></span></div>
          <div className="inspector-progress"><span>작업 진행도</span><b>{Math.min(100, Math.round(inspected.progress / 3 * 100))}%</b><div><i style={{ width: `${Math.min(100, inspected.progress / 3 * 100)}%` }} /></div></div>
          <div className="inspector-actions"><button disabled={noUpgrade.has(inspected.kind)} onClick={() => upgradeAt(inspectorPos)}>{noUpgrade.has(inspected.kind) ? "업그레이드 없음" : "⬆ 업그레이드"}<small>{noUpgrade.has(inspected.kind) ? "기본 성능 고정" : `₩${won(upgradeCost(inspected.kind, inspected.level || 1))}`}</small></button><button disabled={noDirection.has(inspected.kind) || inspected.kind === "splitter"} onClick={() => rotateAt(inspectorPos)}>{inspected.kind === "splitter" ? "위에서 출구 설정" : noDirection.has(inspected.kind) ? "방향 없음" : "↻ 회전"}</button><button className="delete" onClick={() => deleteAt(inspectorPos)}>⌫ 삭제</button></div>
        </section>}
        {recipeOpen && <><button className="recipe-backdrop" aria-label="조합법 닫기" onClick={() => setRecipeOpen(false)} /><section className="recipe-book">
          <header><div><small>PRODUCTION CODEX</small><h2>빠른 조합법</h2></div><button onClick={() => setRecipeOpen(false)}>×</button></header>
          <p>재료를 화살표 방향으로 연결하면 자동으로 다음 제품이 생산됩니다.</p>
          <label className="recipe-search"><span>⌕</span><input value={recipeQuery} onChange={e => setRecipeQuery(e.target.value)} placeholder="아이템·재료·시설 검색" /><em>{visibleRecipes.length}개</em></label>
          <div className="recipe-catalog">
            <div className="recipe-table-wrap">
              <table className="recipe-table">
                <thead><tr><th>아이템</th><th>필요 시설</th><th>재료</th><th>현재 판매가</th></tr></thead>
                <tbody>{visibleRecipes.map(recipe => <tr key={recipe.item} className={recipeDetail.item === recipe.item ? "selected" : ""} onClick={() => setSelectedRecipe(recipe.item)}>
                  <td><span style={{ color: itemMeta[recipe.item].color }}>{itemMeta[recipe.item].icon}</span><b>{itemMeta[recipe.item].label}</b></td><td>{recipe.building}</td><td>{recipe.ingredients}</td><td>₩{won(itemMeta[recipe.item].price * market[recipe.item])}</td>
                </tr>)}</tbody>
              </table>
              {!visibleRecipes.length && <div className="recipe-no-results"><b>검색 결과가 없습니다</b><small>철광석, 원목, 용광로처럼 다른 검색어를 입력해 보세요.</small></div>}
            </div>
            {visibleRecipes.length > 0 && <article className="recipe-detail">
              <header><span style={{ color: itemMeta[recipeDetail.item].color }}>{itemMeta[recipeDetail.item].icon}</span><div><small>선택한 아이템</small><h3>{itemMeta[recipeDetail.item].label}</h3></div><strong>₩{won(itemMeta[recipeDetail.item].price * market[recipeDetail.item])}<small>현재 판매가</small></strong></header>
              <div className="price-history">
                <div className="price-history-head"><span>최근 시세 흐름 <small>12초마다 갱신</small></span><em className={historyChange >= 0 ? "up" : "down"}>{historyChange >= 0 ? "▲" : "▼"} ₩{won(Math.abs(historyChange))}</em></div>
                <div className="price-chart" aria-label={`${itemMeta[recipeDetail.item].label} 가격 변화 그래프`}>{selectedPriceHistory.map((price, index) => {
                  const range = Math.max(1, historyHigh - historyLow); const height = historyHigh === historyLow ? 45 : 18 + (price - historyLow) / range * 82;
                  return <i key={`${index}-${price}`} style={{ height: `${height}%` }} title={`${index + 1}번째 시세: ₩${won(price)}`} />;
                })}</div>
                <div className="price-range"><span>최저 ₩{won(historyLow)}</span><b>현재 ₩{won(selectedPriceHistory[selectedPriceHistory.length - 1])}</b><span>최고 ₩{won(historyHigh)}</span></div>
              </div>
              <div className="recipe-formula"><b>{recipeDetail.ingredients}</b><i>→</i><b>{recipeDetail.building}</b><i>→</i><strong>{itemMeta[recipeDetail.item].label}</strong></div>
              <ol>{recipeDetail.steps.map((step, index) => <li key={step}><span>{index + 1}</span>{step}</li>)}</ol>
              <div className="recipe-requirement"><span>해금·작동 조건</span><b>{recipeDetail.requirement}</b></div>
              <p>{recipeDetail.tip}</p>
            </article>}
          </div>
          <div className="recipe-list legacy-recipes">
            <article><span className="recipe-tier">기초 채굴</span><div><b>◆ 철광맥</b><i>→</i><b>⛏ 철광기</b><i>→</i><strong>◆ 철광석</strong></div><small>현재 판매가 ₩{won(itemMeta.ironOre.price * market.ironOre)} · 바로 판매하거나 철판으로 가공</small></article>
            <article><span className="recipe-tier hot">전력 공급</span><div><b>▰ 원목</b><i>→</i><b>⚡ 화력발전기</b><i>→</i><strong>⌁ 전선 → 철광기</strong></div><small>철광기는 발전 중인 발전기와 전선으로 연결되어야 작동</small></article>
            <article><span className="recipe-tier hot">가공 추천</span><div><b>◆ 철광석 1 + ▰ 원목</b><i>→</i><b>♨ 용광로</b><i>→</i><strong>▣ 철판 1</strong></div><small>원목 1개로 철판 4개 제련 · 현재 판매가 ₩{won(itemMeta.ironPlate.price * market.ironPlate)}</small></article>
            <article><span className="recipe-tier premium">고급 조립</span><div><b>▣ 철판 2</b><i>→</i><b>⚙ 조립기</b><i>→</i><strong>✿ 기어 1</strong></div><small>현재 판매가 ₩{won(itemMeta.gear.price * market.gear)} · 가장 높은 수익의 기초 조립품</small></article>
            <article><span className="recipe-tier wood">목재</span><div><b>♠ 산림</b><i>→</i><b>♠ 벌목기</b><i>→</i><strong>▰ 원목</strong></div><small>현재 판매가 ₩{won(itemMeta.wood.price * market.wood)} · 안정적인 보조 수익</small></article>
          </div>
          <footer>생산품 → 컨베이어 → 판매소 순서로 연결하면 시세에 맞춰 자동 판매됩니다.</footer>
        </section></>}
        <div className="toast"><span>i</span>{toast}</div>
      </section>

      <aside className={`intel-panel panel ${mobilePanel === "intel" ? "mobile-open" : ""}`}>
        <div className="tabs"><button className={tab === "status" ? "active" : ""} onClick={() => setTab("status")}>현황</button><button className={tab === "city" ? "active" : ""} onClick={() => setTab("city")}>도시 <i /></button><button onClick={() => { setSelectedSecurityStage(Math.min(game.securityStage || 0, 9)); setSecurityOpen(true); }}>안보</button><button className={tab === "market" ? "active" : ""} onClick={() => setTab("market")}>시장</button><button className={tab === "contract" ? "active" : ""} onClick={() => setTab("contract")}>계약</button></div>
        <div className="income-live"><span><i />실시간 수익<small>최근 5초 평균</small></span><strong>₩{won(incomePerSecond)}<small>/초</small></strong></div>
        {tab === "status" && <div className="intel-scroll">
          <section className="efficiency-card"><div className="ring" style={{ "--value": `${efficiency * 3.6}deg` } as React.CSSProperties}><div><strong>{efficiency}%</strong><small>공장 효율</small></div></div><div className="eff-stats"><span><i className="orange" /> 병목 <b>{Math.max(0, 3 - Math.floor(contractNow / 8))}</b></span><span><i className="red" /> 멈춘 기계 <b>{Math.max(0, Object.values(game.buildings).filter(b => b.kind !== "conveyor" && b.progress > 5).length)}</b></span><span><i className="blue" /> 운송 중 <b>{game.items.length}</b></span></div></section>
          <section className="side-section"><div className="section-head"><h3>실시간 생산</h3><small>분당</small></div>{(["ironOre", "ironPlate", "gear", "wood"] as Item[]).map(type => <div className="resource-row" key={type}><span className="item-chip" style={{ color: itemMeta[type].color }}>{itemMeta[type].icon}</span><span><b>{itemMeta[type].label}</b><small>판매 {game.sold[type] || 0}</small></span><strong>+{Math.min(99, game.items.filter(i => i.type === type).length * 2)}<small>/m</small></strong></div>)}</section>
          <section className="side-section"><div className="section-head"><h3>연구 레벨</h3><span className="status-live">LV.{game.researchLevel}</span></div><div className="research-card"><span>⌬</span><div><b>도시 기술 Lv.{game.researchLevel}</b><small>다음 해금: {game.researchLevel < 2 ? "조립기·동부 부지" : game.researchLevel < 3 ? "고속 물류·광물 부지" : game.researchLevel < 4 ? "구리·전기 산업" : "정밀 부품 산업"}</small><small className="research-rate">연구소 1개당 8초에 1 RP</small><div className="progress"><i style={{ width: `${Math.min(100, game.research / researchCost(game.researchLevel) * 100)}%` }} /></div></div><button className="research-up" disabled={game.research < researchCost(game.researchLevel)} onClick={levelUpResearch}>레벨업<small>{researchCost(game.researchLevel)} RP</small></button></div><div className="research-roadmap"><span className={game.researchLevel >= 3 ? "done" : ""}><b>Lv.3</b>고속 물류</span><span className={game.researchLevel >= 4 ? "done" : ""}><b>Lv.4</b>구리·전기</span><span className={game.researchLevel >= 5 ? "done" : ""}><b>Lv.5</b>정밀 부품</span><span className={game.researchLevel >= 7 ? "done" : ""}><b>Lv.7</b>자동차</span><span className={game.researchLevel >= 10 ? "done" : ""}><b>Lv.10</b>우주 산업</span></div></section>
        </div>}
        {tab === "market" && <div className="intel-scroll"><section className="market-banner"><small>시장 브리핑</small><b>철강 수요가 상승 중입니다</b><span>가격은 12초마다 변동합니다.</span></section><section className="side-section"><div className="section-head"><h3>실시간 시세</h3><small>기준가 대비</small></div>{(Object.keys(itemMeta) as Item[]).map(type => { const rate = market[type]; return <div className="market-row" key={type}><span style={{ color: itemMeta[type].color }}>{itemMeta[type].icon}</span><div><b>{itemMeta[type].label}</b><small>₩{won(itemMeta[type].price * rate)}</small></div><em className={rate >= 1 ? "up" : "down"}>{rate >= 1 ? "▲" : "▼"} {Math.abs((rate - 1) * 100).toFixed(1)}%</em></div>})}</section></div>}
        {tab === "city" && <div className="intel-scroll city-intel">
          <section className="city-overview"><div><small>도시 만족도</small><strong>{Math.round(game.satisfaction ?? 70)}%</strong><div><i style={{ width: `${game.satisfaction ?? 70}%` }} /></div></div><span><small>판매 가격 보너스</small><b>+{citySaleBonus.toFixed(1)}%</b></span></section>
          {!Object.values(game.buildings).some(building => building.kind === "cityDepot") && <section className="depot-warning"><span>▰</span><div><b>도시 납품소가 필요합니다</b><small>건설 메뉴의 도시 항목에서 무료로 설치하고 컨베이어를 연결하세요.</small></div></section>}
          {currentCityProject ? <section className="city-project-card">
            <header><span>{currentCityProject.icon}</span><div><small>CITY PROJECT · PHASE {(game.cityProject || 0) + 1}</small><h3>{currentCityProject.name}</h3></div><em>{Math.round(cityProjectProgress)}%</em></header>
            <p>{currentCityProject.description}</p>
            <div className="city-project-track"><i style={{ width: `${cityProjectProgress}%` }} /></div>
            <div className="city-requirements">{cityRequirementEntries.map(([type, amount]) => { const delivered = game.cityDeliveries?.[type] || 0; return <div key={type}><span style={{ color: itemMeta[type].color }}>{itemMeta[type].icon}</span><p><b>{itemMeta[type].label}</b><small>{Math.min(delivered, amount)} / {amount} 납품</small></p><em className={delivered >= amount ? "done" : ""}>{delivered >= amount ? "완료" : `${Math.round(delivered / amount * 100)}%`}</em></div>})}</div>
            <div className="city-rewards"><span><small>완공 보상</small><b>₩{won(currentCityProject.rewardMoney)} · ⌬ {currentCityProject.rewardResearch} RP</b></span><p><small>해금</small><strong>{currentCityProject.unlock}</strong></p></div>
            <button disabled={!cityProjectComplete} onClick={completeCityProject}>{cityProjectComplete ? "프로젝트 완공" : "물품 납품 진행 중"}</button>
          </section> : <section className="city-finale"><span>✓</span><h3>현재 도시 프로젝트 완료</h3><p>다음 산업 업데이트가 준비될 때까지 만족도를 유지하고 공장을 확장하세요.</p></section>}
          <section className="city-roadmap"><h3>도시 개발 계획</h3>{cityProjects.map((project, index) => <div key={project.name} className={index < (game.cityProject || 0) ? "done" : index === (game.cityProject || 0) ? "active" : ""}><span>{index < (game.cityProject || 0) ? "✓" : project.icon}</span><p><b>PHASE {index + 1} · {project.name}</b><small>{project.unlock}</small></p></div>)}</section>
        </div>}
        {tab === "contract" && <div className="intel-scroll"><section className="contract-card"><div className="contract-top"><span>긴급</span><small>도시 건설국</small></div><h3>철도 보수용 철판</h3><p>신규 화물 노선에 사용할 철판을 납품해 주세요.</p><div className="contract-progress"><span><b>{Math.min(contractNow, 20)}</b> / 20 철판</span><small>{Math.min(100, contractNow / 20 * 100).toFixed(0)}%</small><div><i style={{ width: `${Math.min(100, contractNow / 20 * 100)}%` }} /></div></div><div className="rewards"><span><small>보상</small><b>₩3,500</b></span><span><small>추가</small><b>⌬ 20 RP</b></span></div><button disabled={contractNow < 20} onClick={claimContract}>계약 납품</button></section><section className="locked-contract"><span>▣</span><div><b>다음 계약</b><small>도시 레벨 2에서 공개</small></div></section></div>}
      </aside>
    </section>

    {securityOpen && <section className="security-screen defense-screen">
      <header><div><small>APPLEKING CITY DEFENSE</small><h2>도시 안보 작전 지도</h2></div><span className={`battle-phase ${battle.phase}`}>{battle.phase === "prepare" ? "배치 단계" : battle.phase === "battle" ? "좀비 침입 중" : battle.phase === "won" ? "작전 성공" : "방어 실패"}</span><button onClick={() => setSecurityOpen(false)}>× 공장으로</button></header>
      <div className="defense-layout">
        <aside className="defense-build-menu">
          <div className="defense-stock"><span><small>울타리 완제품</small><b>▥ {Math.floor(game.securityStock?.wall || 0)}</b></span><span><small>철제 자재</small><b>▣ {Math.floor(game.securityStock?.fenceSteel || 0)}</b></span><span><small>기계 부품</small><b>✿ {Math.floor(game.securityStock?.defenseParts || 0)}</b></span></div>
          <h3>방어 장비 배치</h3>
          {(Object.keys(defenseMeta) as DefenseKind[]).map(kind => { const meta = defenseMeta[kind], locked = kind === "missile" && (game.securityStage || 0) < 2; return <button key={kind} disabled={battle.phase === "battle" || locked} className={defenseSelected === kind ? "active" : ""} onClick={() => setDefenseSelected(kind)}><span>{meta.sprite ? <img src={meta.sprite} alt={meta.name} /> : meta.icon}</span><div><b>{meta.name}</b><small>{meta.desc}</small><em>{kind === "wall" ? "▥ 완제품 1" : `▣ ${meta.steel}${meta.parts ? ` · ✿ ${meta.parts}` : ""}`}</em></div>{locked && <i>STAGE 3 해금</i>}</button>})}
          <button className={`defense-erase ${defenseSelected === "erase" ? "active" : ""}`} disabled={battle.phase === "battle"} onClick={() => setDefenseSelected("erase")}><span>⌫</span><div><b>시설 철거</b><small>선택한 시설을 철거하고 자재 50% 회수</small></div></button>
          <div className="defense-help"><b>무기 생산 시스템 예정</b><p>현재는 보급 자재로 현장 조립합니다. 이후 울타리·기관총·미사일을 공장 조합법으로 생산해 안보 보급소로 보내는 방식으로 전환됩니다.</p></div>
        </aside>

        <main className="defense-battlefield-wrap">
          <div className="battlefield-top"><span>도시 핵심 내구도 <b>{Math.max(0, battle.coreHp)}%</b></span><div><i style={{ width: `${Math.max(0, battle.coreHp)}%` }} /></div><em>적 {battle.zombies.length + battle.pending}</em></div>
          <div className={`defense-grid ${battle.phase}`} style={{ gridTemplateColumns: `repeat(${DEF_W},1fr)` }}>
            {Array.from({ length: DEF_W * DEF_H }, (_, index) => { const x = index % DEF_W, y = Math.floor(index / DEF_W), pos = key(x, y), defense = game.securityLayout?.[pos], meta = defense ? defenseMeta[defense.kind] : null, zombiesHere = battle.zombies.filter(zombie => zombie.x === x && zombie.y === y); return <button key={pos} onClick={() => placeDefense(x, y)} disabled={battle.phase === "battle"} className={`${x === CORE_X && y === CORE_Y ? "core" : ""} ${defense ? `has-defense ${defense.kind}` : ""} ${zombiesHere.length ? "under-attack" : ""}`}>
              {x === CORE_X && y === CORE_Y && <span className="city-core">▦<small>CITY</small></span>}
              {defense && meta && <span className="defense-unit">{meta.sprite ? <img src={meta.sprite} alt={meta.name} /> : meta.icon}<small>{meta.name}</small><i style={{ width: `${Math.max(0, defense.hp / meta.hp * 100)}%` }} /></span>}
              {zombiesHere.map((zombie, zombieIndex) => <span key={zombie.id} title={zombieMeta[zombie.kind].name} className={`battle-zombie ${zombie.kind}`} style={{ transform: `translate(${zombieIndex * 4}px,${zombieIndex * -3}px)` }}><img src={zombieMeta[zombie.kind].sprite} alt={zombieMeta[zombie.kind].name} /><i style={{ width: `${Math.max(0, zombie.hp / zombie.maxHp * 100)}%` }} /></span>)}
            </button>})}
            {battle.shots.map(shot => { const dx = (shot.toX - shot.fromX) / DEF_W, dy = (shot.toY - shot.fromY) / DEF_H; return <i key={`${shot.id}-${shot.fromX}-${shot.fromY}`} className={`defense-shot ${shot.kind}`} style={{ left: `${(shot.fromX + .5) / DEF_W * 100}%`, top: `${(shot.fromY + .5) / DEF_H * 100}%`, width: `${Math.hypot(dx, dy) * 100}%`, transform: `rotate(${Math.atan2(dy, dx)}rad)` }} />; })}
          </div>
          <div className="battlefield-legend"><span><i className="spawn-dot" /> 좀비 출현 지점: 전장 외곽</span><span>울타리로 길을 만들고 포탑의 사거리를 겹치세요</span></div>
        </main>

        <aside className="defense-mission">
          <button className="stage-select-button" disabled={battle.phase === "battle"} onClick={() => setStagePickerOpen(true)}>☰ 스테이지 선택 <b>1–10</b></button>
          {currentSecurityStage ? <><div className="mission-threat"><small>SELECTED STAGE</small><strong>{selectedSecurityStage + 1}</strong><span><b>{currentSecurityStage.name}</b><em>위협도 {zombieThreat}%</em></span></div>
            <div className="mission-info"><span><small>좀비 규모</small><b>{stageZombieCount(currentSecurityStage)}마리</b></span><span><small>특수 개체</small><b>{currentSecurityStage.composition.runner + currentSecurityStage.composition.tank + currentSecurityStage.composition.spitter}</b></span><span><small>방어력</small><b>{Math.round(securityScore)}%</b></span></div>
            <div className="zombie-composition">{(Object.entries(currentSecurityStage.composition) as [ZombieKind, number][]).filter(([, count]) => count > 0).map(([kind, count]) => <span key={kind} className={kind}><i><img src={zombieMeta[kind].sprite} alt={zombieMeta[kind].name} /></i><b>{zombieMeta[kind].name}</b><em>×{count}</em></span>)}</div>
            <div className="mission-reward"><small>클리어 보상</small><b>₩{won(currentSecurityStage.reward)}</b><em>+{currentSecurityStage.research} RP</em></div>
            {battle.phase === "prepare" && <button className="battle-start" disabled={!securityStageReady} onClick={startDefenseBattle}>{securityStageReady ? "좀비 웨이브 시작" : "공격 시설을 설치하세요"}</button>}
            {battle.phase === "battle" && <button className="battle-start fighting" disabled>방어 작전 진행 중 · {battle.zombies.length + battle.pending}</button>}
            {battle.phase === "lost" && <button className="battle-start retry" onClick={() => setBattle({ phase: "prepare", stage: selectedSecurityStage, zombies: [], shots: [], pending: 0, coreHp: 100, tick: 0 })}>방어선 재정비</button>}
            {battle.phase === "won" && <button className="battle-start victory" onClick={() => setBattle({ phase: "prepare", stage: selectedSecurityStage, zombies: [], shots: [], pending: 0, coreHp: 100, tick: 0 })}>다음 스테이지 준비</button>}
          </> : null}
          <div className="defense-roadmap">{securityStages.map((stage, index) => <span key={stage.name} className={index < (game.securityStage || 0) ? "cleared" : index === selectedSecurityStage ? "active" : index > (game.securityStage || 0) ? "locked" : ""}><b>{index < (game.securityStage || 0) ? "✓" : index + 1}</b><small>{stage.name}</small></span>)}</div>
          <div className="defense-tips"><b>작전 정보</b><p>좀비는 도시 핵심부로 가장 가까운 길을 찾습니다. 길이 완전히 막히면 앞의 울타리나 포탑을 파괴합니다.</p><p>기관총은 빠른 연사, 미사일은 긴 사거리와 높은 피해가 강점입니다.</p></div>
        </aside>
      </div>
      {stagePickerOpen && <div className="stage-picker-backdrop" onClick={() => setStagePickerOpen(false)}><section className="stage-picker" onClick={event => event.stopPropagation()}><header><div><small>CITY DEFENSE CAMPAIGN</small><h3>안보 스테이지 선택</h3></div><button onClick={() => setStagePickerOpen(false)}>×</button></header><p>스테이지는 순서대로 해금됩니다. 클리어한 작전은 언제든 다시 도전할 수 있습니다.</p><div className="stage-grid">{securityStages.map((stage, index) => { const locked = index > (game.securityStage || 0), total = stageZombieCount(stage), special = stage.composition.runner + stage.composition.tank + stage.composition.spitter; return <button key={stage.name} disabled={locked} className={`${index < (game.securityStage || 0) ? "cleared" : ""} ${index === selectedSecurityStage ? "selected" : ""}`} onClick={() => { setSelectedSecurityStage(index); setBattle({ phase: "prepare", stage: index, zombies: [], shots: [], pending: 0, coreHp: 100, tick: 0 }); setStagePickerOpen(false); }}><em>{locked ? "LOCKED" : index < (game.securityStage || 0) ? "CLEARED" : "CURRENT"}</em><strong>{index + 1}</strong><div><b>{stage.name}</b><small>좀비 {total} · 특수 {special}</small><span>위협도 {stage.threat}%</span></div></button>})}</div></section></div>}
    </section>}

    <footer className="bottom-bar">
      <div className="selection"><span className={`build-icon ${selected}`}>{selected === "delete" ? "⌫" : selected === "rotate" ? "↻" : factoryImages[selected] ? <img src={factoryImages[selected]} alt={buildingMeta[selected].name} /> : buildingMeta[selected].icon}</span><div><small>선택된 도구</small><b>{selected === "delete" ? "철거 도구" : selected === "rotate" ? "설치물 회전" : buildingMeta[selected].name}</b></div><p>{selected === "delete" ? "설치된 건물을 클릭해 철거" : selected === "rotate" ? "설치된 건물을 누를 때마다 90° 회전" : buildingMeta[selected].desc}</p><kbd>{selected === "rotate" ? "탭" : DIRS[rotation].icon}</kbd></div>
      <div className="factory-feed"><small>현재 생산</small><div className="feed-items">{game.items.slice(0, 8).map(i => <span key={i.id} style={{ color: itemMeta[i.type].color }}>{itemMeta[i.type].icon}</span>)}{!game.items.length && <em>라인이 대기 중입니다</em>}</div></div>
      <div className="game-controls"><span className="fps"><i /> 60 FPS</span><span className="normal-speed">1× 정상 속도</span><button className={paused ? "active" : ""} onClick={() => setPaused(p => !p)}>{paused ? "▶" : "Ⅱ"}</button></div>
    </footer>
    <div className="portrait-lock"><span>↻</span><b>기기를 가로로 돌려주세요</b><small>Foundry Flow는 가로 화면에 최적화되어 있습니다.</small></div>
  </main>;
}
