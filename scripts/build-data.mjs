/**
 * 원본 데이터(raw/) -> 앱이 쓰는 정제 데이터(data/) 변환.
 *
 * 입력
 *   raw/gm_latest.json        PokeMiners 게임마스터 (상성표, CPM, 전투설정, 조무래기 캐릭터)
 *   raw/pogoapi_pokedex.json  pokemon-go-api (PvE 기술수치 + 한글명)
 *   raw/i18n_korean.json      공식 한글 문자열 (조무래기 대사)
 *
 * 출력
 *   data/types.json  data/pokemon.json  data/moves.json
 *   data/grunts.json data/battle.json
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const raw = (f) => JSON.parse(readFileSync(join(ROOT, 'raw', f), 'utf8'));
const emit = (f, v) => {
  writeFileSync(join(ROOT, 'data', f), JSON.stringify(v, null, 1));
  console.log(`  data/${f}`.padEnd(24), `${(JSON.stringify(v).length / 1024).toFixed(0)} KB`);
};

/** 게임마스터 attackScalar 배열의 고정 인덱스 순서. 아래 assert로 검증한다. */
const TYPE_ORDER = [
  'NORMAL', 'FIGHTING', 'FLYING', 'POISON', 'GROUND', 'ROCK',
  'BUG', 'GHOST', 'STEEL', 'FIRE', 'WATER', 'GRASS',
  'ELECTRIC', 'PSYCHIC', 'ICE', 'DRAGON', 'DARK', 'FAIRY',
];

const shortType = (t) => (typeof t === 'string' ? t : t?.type ?? null)?.replace('POKEMON_TYPE_', '') ?? null;

let KO_TYPE = {};
const gm = raw('gm_latest.json');
const dex = raw('pogoapi_pokedex.json');
const gmBy = (key) => gm.filter((t) => t.data?.[key]);

// ---------------------------------------------------------------- 한글 문자열
const i18nFlat = raw('i18n_korean.json').data;
const KO = {};
for (let i = 0; i < i18nFlat.length; i += 2) KO[i18nFlat[i]] = i18nFlat[i + 1];

// ---------------------------------------------------------------- 타입 상성표
function buildTypes() {
  const names = {};
  const collectNames = (t) => {
    const s = shortType(t);
    if (s && !names[s] && t?.names) names[s] = { ko: t.names.Korean, en: t.names.English };
  };
  for (const p of dex) {
    collectNames(p.primaryType);
    collectNames(p.secondaryType);
    for (const m of [...Object.values(p.quickMoves ?? {}), ...Object.values(p.cinematicMoves ?? {})]) collectNames(m.type);
  }

  const matrix = {};
  for (const t of gmBy('typeEffective')) {
    const atk = shortType(t.data.typeEffective.attackType);
    const scalars = t.data.typeEffective.attackScalar;
    matrix[atk] = Object.fromEntries(TYPE_ORDER.map((def, i) => [def, scalars[i]]));
  }

  // 인덱스 순서가 맞는지 알려진 상성으로 검증 (틀리면 전 계산이 조용히 어긋난다)
  const checks = [
    ['WATER', 'FIRE', 1.6], ['FIRE', 'WATER', 0.625], ['GROUND', 'FLYING', 0.390625],
    ['FIGHTING', 'NORMAL', 1.6], ['GHOST', 'NORMAL', 0.390625], ['FAIRY', 'DRAGON', 1.6],
    ['PSYCHIC', 'DARK', 0.390625], ['ELECTRIC', 'GROUND', 0.390625], ['STEEL', 'FAIRY', 1.6],
  ];
  for (const [a, d, want] of checks) {
    if (matrix[a][d] !== want) throw new Error(`상성표 인덱스 불일치: ${a}->${d} = ${matrix[a][d]}, 기대값 ${want}`);
  }
  console.log(`  상성표 검증 통과 (${checks.length}건)`);

  return { order: TYPE_ORDER, names, matrix };
}

// ------------------------------------------------------------------ 전투 상수
function buildBattle() {
  const bs = gm.find((t) => t.templateId === 'BATTLE_SETTINGS').data.battleSettings;
  const cpMultiplier = gm.find((t) => t.templateId === 'PLAYER_LEVEL_SETTINGS').data.playerLevel.cpMultiplier;
  if (Math.abs(cpMultiplier[39] - 0.7903) > 1e-6) throw new Error('CPM 인덱스 불일치: [39]는 레벨 40이어야 한다');
  return {
    stab: bs.sameTypeAttackBonusMultiplier,
    shadowAtk: bs.shadowPokemonAttackBonusMultiplier,
    shadowDef: bs.shadowPokemonDefenseBonusMultiplier,
    enemyAttackInterval: bs.enemyAttackInterval,
    cpMultiplier, // index 0 = 레벨 1, index n = 레벨 n+1
  };
}

// --------------------------------------------------------------------- 포켓몬
const moves = {};

function harvestMoves(src, kind) {
  for (const [id, m] of Object.entries(src ?? {})) {
    if (moves[id]) continue;
    moves[id] = {
      ko: m.names?.Korean ?? id,
      en: m.names?.English ?? id,
      type: shortType(m.type),
      power: m.power ?? 0,
      energy: m.energy ?? 0,          // 빠른공격 +, 차징공격 -
      duration: m.durationMs ?? 1000,
      kind,
    };
  }
}

function entry(src, { id, formId, ko, en, dex: dexNr, cls, inheritMoves }) {
  const fast = Object.keys(inheritMoves?.quickMoves ?? src.quickMoves ?? {});
  const charged = Object.keys(inheritMoves?.cinematicMoves ?? src.cinematicMoves ?? {});
  const eliteFast = Object.keys(inheritMoves?.eliteQuickMoves ?? src.eliteQuickMoves ?? {});
  const eliteCharged = Object.keys(inheritMoves?.eliteCinematicMoves ?? src.eliteCinematicMoves ?? {});

  harvestMoves(inheritMoves?.quickMoves ?? src.quickMoves, 'fast');
  harvestMoves(inheritMoves?.eliteQuickMoves ?? src.eliteQuickMoves, 'fast');
  harvestMoves(inheritMoves?.cinematicMoves ?? src.cinematicMoves, 'charged');
  harvestMoves(inheritMoves?.eliteCinematicMoves ?? src.eliteCinematicMoves, 'charged');

  return {
    id: formId,
    base: id,
    dex: dexNr,
    ko, en,
    atk: src.stats.attack,
    def: src.stats.defense,
    sta: src.stats.stamina,
    types: [shortType(src.primaryType), shortType(src.secondaryType)].filter(Boolean),
    fast: [...new Set([...fast, ...eliteFast])],
    charged: [...new Set([...charged, ...eliteCharged])],
    elite: [...new Set([...eliteFast, ...eliteCharged])],
    cls: cls ? cls.replace('POKEMON_CLASS_', '') : null,
    mega: false,
  };
}

function buildPokemon() {
  const out = [];
  for (const p of dex) {
    if (!p.stats) continue;

    out.push(entry(p, { id: p.id, formId: p.formId, ko: p.names.Korean, en: p.names.English, dex: p.dexNr, cls: p.pokemonClass }));

    for (const rf of Object.values(p.regionForms ?? {})) {
      if (!rf.stats) continue;
      out.push(entry(rf, { id: p.id, formId: rf.formId, ko: rf.names.Korean, en: rf.names.English, dex: p.dexNr, cls: rf.pokemonClass ?? p.pokemonClass }));
    }

    // 메가는 기술 목록이 없어 원종에서 상속받는다
    for (const me of Object.values(p.megaEvolutions ?? {})) {
      if (!me.stats) continue;
      const e = entry(me, { id: p.id, formId: me.id, ko: me.names.Korean, en: me.names.English, dex: p.dexNr, cls: p.pokemonClass, inheritMoves: p });
      e.mega = true;
      out.push(e);
    }
  }
  // 같은 formId 중복 제거 (리전폼이 원종과 같은 키를 쓰는 경우)
  const seen = new Map();
  for (const e of out) if (!seen.has(e.id)) seen.set(e.id, e);
  return [...seen.values()].sort((a, b) => a.dex - b.dex || a.id.localeCompare(b.id));
}

// ------------------------------------------------------- 조무래기 (대사 -> 타입)
function buildGrunts() {
  const byType = new Map();
  for (const t of gmBy('invasionNpcDisplaySettings')) {
    const s = t.data.invasionNpcDisplaySettings;
    const type = shortType(s.tipsType);
    if (!type) continue;
    const quoteKey = s.trainerQuote;
    const ko = KO[`${quoteKey}__male_speaker`] ?? KO[`${quoteKey}__female_speaker`] ?? KO[quoteKey] ?? null;
    if (!byType.has(type)) byType.set(type, { type, quoteKey, quoteKo: ko?.trim() ?? null, characters: [] });
    byType.get(type).characters.push(t.templateId);
  }
  // METAL은 STEEL의 구 표기라 대사만 다르고 타입은 같다 — 둘 다 보존해 검색에 쓴다
  const metalKo = KO['combat_grunt_quote_metal__female_speaker']?.trim();
  const steel = byType.get('STEEL');
  if (steel && metalKo && metalKo !== steel.quoteKo) steel.altQuoteKo = metalKo;

  return [...byType.values()].sort((a, b) => a.type.localeCompare(b.type));
}

// ------------------------------------------------- 로켓단 실제 라인업 (LeekDuck)
function buildRocket(pokemon) {
  const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const byEn = new Map();
  for (const p of pokemon) if (!byEn.has(norm(p.en))) byEn.set(norm(p.en), p);

  const src = raw('rocketLineups.json');
  const slotOf = (list) => (list ?? []).map((m) => {
    const hit = byEn.get(norm(m.name));
    return hit ? { id: hit.id, enc: !!m.isEncounter, shiny: !!m.canBeShiny } : null;
  }).filter(Boolean);

  const LEADER_KO = { Giovanni: '비주기', Arlo: '알로', Cliff: '클리프', Sierra: '시에라' };
  const parties = [];
  const gruntsByType = new Map();
  const unmatched = [];

  for (const x of src) {
    const slots = [slotOf(x.firstPokemon), slotOf(x.secondPokemon), slotOf(x.thirdPokemon)];
    const got = slots.flat().length;
    const want = ['firstPokemon', 'secondPokemon', 'thirdPokemon'].reduce((n, k) => n + (x[k]?.length ?? 0), 0);
    if (got !== want) unmatched.push(x.name);

    if (/Boss/i.test(x.title) || /Leader/i.test(x.title)) {
      parties.push({
        kind: /Boss/i.test(x.title) ? 'boss' : 'leader',
        key: x.name.toLowerCase(),
        ko: LEADER_KO[x.name] ?? x.name,
        en: x.name,
        type: null,
        slots,
      });
      continue;
    }

    const type = x.type ? x.type.toUpperCase() : null;
    if (!type) {
      // 타입 대사가 없는 조무래기 (기본/미끼) — 타입별과 섞지 않고 따로 둔다
      parties.push({ kind: 'grunt-other', key: norm(x.name), ko: x.name, en: x.name, type: null, slots });
      continue;
    }
    // 같은 타입 조무래기가 여러 변종으로 나뉘어 있다.
    // 실제로는 어느 변종을 만날지 붙기 전까지 모르므로 슬롯별 합집합으로 합친다.
    if (!gruntsByType.has(type)) gruntsByType.set(type, [[], [], []]);
    const acc = gruntsByType.get(type);
    slots.forEach((s, i) => {
      for (const m of s) if (!acc[i].some((e) => e.id === m.id)) acc[i].push(m);
    });
  }

  const quoteOf = new Map(buildGrunts().map((g) => [g.type, g.quoteKo]));
  for (const [type, slots] of gruntsByType) {
    parties.push({
      kind: 'grunt', key: `grunt-${type.toLowerCase()}`,
      ko: `${KO_TYPE[type] ?? type} 타입 조무래기`, en: `${type} Grunt`,
      type, quoteKo: quoteOf.get(type) ?? null, slots,
    });
  }

  if (unmatched.length) console.log(`  경고: 이름 매칭 실패 포함 -> ${unmatched.join(', ')}`);
  console.log(`  라인업 ${parties.length}건 (보스/리더 ${parties.filter((p) => p.kind !== 'grunt' && p.kind !== 'grunt-other').length} · 타입 조무래기 ${gruntsByType.size})`);

  return { asOf: new Date().toISOString().slice(0, 10), parties };
}

// ------------------------------------------------------------------------ 실행
console.log('빌드 시작');
const types = buildTypes();
const battle = buildBattle();
const pokemon = buildPokemon();   // moves 를 채우는 부작용이 있으므로 moves 저장보다 먼저
const grunts = buildGrunts();
KO_TYPE = Object.fromEntries(Object.entries(types.names).map(([k, v]) => [k, v.ko]));
const rocket = buildRocket(pokemon);

emit('types.json', types);
emit('battle.json', battle);
emit('pokemon.json', pokemon);
emit('moves.json', moves);
emit('grunts.json', grunts);
emit('rocket.json', rocket);

console.log(`\n포켓몬 ${pokemon.length} · 기술 ${Object.keys(moves).length} · 조무래기 타입 ${grunts.length}`);
console.log(`대사 확보: ${grunts.filter((g) => g.quoteKo).length}/${grunts.length}`);
