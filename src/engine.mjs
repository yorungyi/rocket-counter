/**
 * 포켓몬GO PvE 전투 계산 엔진 (로켓단 전투 기준).
 *
 * 모든 상수는 게임마스터 실값에서 온다 (data/battle.json, data/types.json).
 * 브라우저와 Node 양쪽에서 쓰도록 순수 ESM + 의존성 없음.
 */

// ---------------------------------------------------------------- 기본 계산기

/** 레벨 -> CP 배율. 반레벨은 인접 정수레벨의 제곱평균으로 보간한다(게임 내부 규칙). */
export function cpmFor(battle, level) {
  const t = battle.cpMultiplier;
  const lo = Math.floor(level);
  const a = t[lo - 1];
  if (level === lo) return a;
  const b = t[lo]; // 다음 정수 레벨
  return Math.sqrt((a * a + b * b) / 2);
}

/** 실전 공격/방어/HP. shadow면 게임마스터의 그림자 보정(공1.2 / 방0.8333)을 적용. */
export function statsOf(mon, battle, { level = 40, ivAtk = 15, ivDef = 15, ivSta = 15, shadow = false } = {}) {
  const cpm = cpmFor(battle, level);
  return {
    atk: (mon.atk + ivAtk) * cpm * (shadow ? battle.shadowAtk : 1),
    def: (mon.def + ivDef) * cpm * (shadow ? battle.shadowDef : 1),
    hp: Math.floor((mon.sta + ivSta) * cpm),
  };
}

/** 2중타입까지 곱해진 타입 상성 배율. */
export function effectiveness(types, moveType, defenderTypes) {
  let m = 1;
  for (const d of defenderTypes) m *= types.matrix[moveType]?.[d] ?? 1;
  return m;
}

/** PvE 대미지 1회분: floor(0.5 * 위력 * 공/방 * STAB * 상성) + 1 */
export function damage(power, atk, def, stab, eff) {
  return Math.floor(0.5 * power * (atk / def) * stab * eff) + 1;
}

// ------------------------------------------------------------------ 기술 사이클

/**
 * 빠른공격 + 차징공격 1사이클의 DPS.
 * 피격 에너지(energyDeltaPerHealthLost)는 변동이 커서 제외한다 — 실전 DPS는 이 값 이상이 된다.
 */
export function cycleDps({ fast, charged, atk, defenderDef, defenderTypes, attackerTypes, types, stabMult }) {
  const dmg = (mv) => {
    const stab = attackerTypes.includes(mv.type) ? stabMult : 1;
    return damage(mv.power, atk, defenderDef, stab, effectiveness(types, mv.type, defenderTypes));
  };

  const fastDmg = dmg(fast);
  const fastSec = fast.duration / 1000;
  if (!charged) return { dps: fastDmg / fastSec, nFast: Infinity, cycleSec: fastSec };

  const cost = Math.abs(charged.energy);
  const nFast = Math.max(1, Math.ceil(cost / (fast.energy || 1)));
  const cycleSec = nFast * fastSec + charged.duration / 1000;
  const cycleDmg = nFast * fastDmg + dmg(charged);
  return { dps: cycleDmg / cycleSec, nFast, cycleSec };
}

/** 그 포켓몬이 낼 수 있는 모든 조합 중 최고 DPS 조합. */
export function bestMoveset(mon, ctx) {
  const { moves } = ctx;
  let best = null;
  for (const fId of mon.fast) {
    const fast = moves[fId];
    if (!fast) continue;
    for (const cId of mon.charged) {
      const charged = moves[cId];
      if (!charged) continue;
      const r = cycleDps({ ...ctx, fast, charged, attackerTypes: mon.types });
      if (!best || r.dps > best.dps) best = { ...r, fastId: fId, chargedId: cId, fast, charged };
    }
  }
  return best;
}

/** 방어측이 가진 모든 조합의 평균 DPS — 상대 기술을 모를 때의 기대값. */
export function averageDps(mon, ctx) {
  const { moves } = ctx;
  let sum = 0, n = 0;
  for (const fId of mon.fast) {
    const fast = moves[fId];
    if (!fast) continue;
    for (const cId of mon.charged) {
      const charged = moves[cId];
      if (!charged) continue;
      sum += cycleDps({ ...ctx, fast, charged, attackerTypes: mon.types }).dps;
      n++;
    }
  }
  return n ? sum / n : 0;
}

// ------------------------------------------------------------- 1대1 대결 평가

/** DPS와 생존력을 함께 반영하는 종합점수. 0.6/0.4는 로켓단전(3마리 소모전) 기준 가중치. */
const DPS_WEIGHT = 0.6;

/**
 * 공격자 1마리가 방어자 1마리를 상대했을 때의 평가.
 * ttk   내가 상대를 쓰러뜨리는 데 걸리는 초
 * ttd   내가 쓰러지는 데 걸리는 초
 * tdo   쓰러지기 전까지 내가 넣는 총 대미지
 * score 순위용 종합점수
 */
export function matchup(attacker, defender, db, opts = {}) {
  const { types, moves, battle } = db;
  const atkSide = statsOf(attacker, battle, { level: opts.myLevel ?? 40, shadow: false });
  const defSide = statsOf(defender, battle, {
    level: opts.bossLevel ?? 24,
    ivAtk: opts.bossIv ?? 15, ivDef: opts.bossIv ?? 15, ivSta: opts.bossIv ?? 15,
    shadow: opts.bossShadow !== false,
  });

  const mine = bestMoveset(attacker, {
    types, moves, stabMult: battle.stab,
    atk: atkSide.atk, defenderDef: defSide.def, defenderTypes: defender.types,
  });
  if (!mine) return null;

  const theirDps = averageDps(defender, {
    types, moves, stabMult: battle.stab,
    atk: defSide.atk, defenderDef: atkSide.def, defenderTypes: attacker.types,
  });

  const ttk = defSide.hp / mine.dps;
  const ttd = theirDps > 0 ? atkSide.hp / theirDps : Infinity;
  const tdo = mine.dps * Math.min(ttd, ttk);
  const score = Math.pow(mine.dps, DPS_WEIGHT) * Math.pow(tdo, 1 - DPS_WEIGHT);

  return {
    id: attacker.id, ko: attacker.ko, en: attacker.en, types: attacker.types, mega: attacker.mega,
    dps: mine.dps, ttk, ttd, tdo, score,
    margin: ttd / ttk,                       // 1보다 크면 1대1로 이긴다
    fastId: mine.fastId, chargedId: mine.chargedId,
    fastKo: moves[mine.fastId].ko, chargedKo: moves[mine.chargedId].ko,
  };
}

/**
 * 공격자 1마리를 방어자 여럿에 대해 평가하고 하나로 합친다.
 * 표시 수치(dps/ttk)는 방어자 전체 평균이어야 한다 — 첫 방어자 기준으로 보여주면
 * 정렬 순서(평균 점수)와 숫자가 어긋나 순위가 거꾸로 읽힌다.
 * 기술셋은 "가장 버거운 상대"에 맞춘 것을 보여준다. 그게 실전에서 필요한 조언이다.
 */
export function aggregate(attacker, defenders, db, opts = {}) {
  let dps = 0, ttk = 0, tdo = 0, score = 0, worst = Infinity, hardest = null;
  for (const def of defenders) {
    const m = matchup(attacker, def, db, opts);
    if (!m) return null;
    dps += m.dps; ttk += m.ttk; tdo += m.tdo; score += m.score;
    if (m.margin < worst) { worst = m.margin; hardest = m; }
  }
  const n = defenders.length;
  return { ...hardest, dps: dps / n, ttk: ttk / n, tdo: tdo / n, score: score / n, worstMargin: worst };
}

// ------------------------------------------------------------------ 후보 풀

/** 추천 후보에서 제외할 대상(미출시/전용폼 등)을 걸러낸다. */
export function candidatePool(pokemon, { allowMega = true, allowLegendary = true, onlyIds = null } = {}) {
  const set = onlyIds ? new Set(onlyIds) : null;
  return pokemon.filter((p) => {
    if (!p.fast.length || !p.charged.length) return false;
    // 보유 목록이 있으면 그게 곧 후보다 — 가진 걸 메가/전설이라고 빼면 안 된다
    if (set) return set.has(p.id);
    if (!allowMega && p.mega) return false;
    if (!allowLegendary && (p.cls === 'LEGENDARY' || p.cls === 'MYTHIC')) return false;
    return true;
  });
}

// --------------------------------------------------- 모드 A: 타입 기반 추천

/**
 * 상대 타입만 알 때(조무래기 대사로 판별) 그 타입 전체에 강한 포켓몬을 뽑는다.
 * 해당 타입을 가진 실제 포켓몬들을 표본으로 삼아 평균 점수를 낸다 — 로테이션과 무관하게 항상 유효.
 */
export function rankByType(targetType, db, opts = {}) {
  const { pokemon } = db;
  const limit = opts.limit ?? 20;

  // 표본 선택이 결과를 좌우한다.
  // 종족값만으로 뽑으면 복합타입 전설(예: 자시안=강철/페어리)이 표본을 장악해
  // 정작 그 타입의 약점이 복합타입 쪽 저항에 지워진다.
  // 따라서 (1) 조무래기는 전설을 쓰지 않으므로 전설/환상 제외,
  //        (2) 단일타입을 우선 채우고 남는 자리만 복합타입으로 메운다.
  const of = pokemon.filter(
    (p) => p.types.includes(targetType) && !p.mega && p.cls !== 'LEGENDARY' && p.cls !== 'MYTHIC'
      && p.fast.length && p.charged.length,
  );
  const byBulk = (a, b) => (b.atk + b.def + b.sta) - (a.atk + a.def + a.sta);
  const mono = of.filter((p) => p.types.length === 1).sort(byBulk);
  const dual = of.filter((p) => p.types.length > 1).sort(byBulk);
  const size = opts.sampleSize ?? 12;
  const sample = [...mono.slice(0, size), ...dual.slice(0, Math.max(0, size - Math.min(mono.length, size)))];
  if (!sample.length) return { sample: [], ranked: [] };

  const ranked = [];
  for (const atk of candidatePool(pokemon, opts)) {
    const r = aggregate(atk, sample, db, opts);
    if (r) ranked.push(r);
  }
  ranked.sort((a, b) => b.score - a.score);
  return { sample, ranked: ranked.slice(0, limit) };
}

// ------------------------------------------- 모드 B: 라인업 기반 슬롯별 추천

/** 라인업의 각 슬롯(후보 여러 마리 가능)에 대해 카운터 순위를 낸다. */
export function rankForLineup(lineup, db, opts = {}) {
  const { pokemon } = db;
  const byId = new Map(pokemon.map((p) => [p.id, p]));
  const pool = candidatePool(pokemon, opts);
  const limit = opts.limit ?? 15;

  const slots = lineup.map((slot, i) => {
    const defenders = slot.map((id) => byId.get(id)).filter(Boolean);
    const ranked = [];
    for (const atk of pool) {
      const r = aggregate(atk, defenders, db, opts);
      if (r) ranked.push(r);
    }
    ranked.sort((a, b) => b.score - a.score);
    return { slot: i + 1, defenders, ranked };
  });

  // 파티 구성은 잘라내기 전 전체 목록으로 해야 한다.
  // 표시용 상위 N만 넘기면 후보가 전부 메가라 "메가 1마리" 규칙에 걸려 조합이 안 나온다.
  const team = pickTeam(slots);
  const megaCap = opts.megaCap ?? 3;
  return { slots: slots.map((s) => ({ ...s, ranked: capMega(s.ranked, limit, megaCap) })), team };
}

/**
 * 표시용 목록에서 메가진화(원시회귀 포함)를 상위 cap마리까지만 남긴다.
 * 한 전투에 메가는 한 마리만 낼 수 있는데 슬롯 목록이 메가로만 채워지면
 * 실제로 꺼낼 수 있는 비메가 대응을 볼 수가 없다. 빈자리는 다음 비메가로 채운다.
 */
export function capMega(ranked, limit, cap = 3) {
  const picks = [];
  let megas = 0;
  for (const r of ranked) {
    if (r.mega) {
      if (megas >= cap) continue;
      megas++;
    }
    picks.push(r);
    if (picks.length === limit) break;
  }
  return picks;
}

/**
 * 3마리 파티 구성: 각 슬롯의 최상위 후보들 중에서, 전 슬롯 대응력이 가장 고른 조합을 고른다.
 * 슬롯별 최고점으로 정규화한 뒤 "가장 약한 슬롯 점수"를 최대화한다(최악 상황 방어).
 */
export function pickTeam(slots, size = 3) {
  // 슬롯별 후보: 상위권이 메가로만 채워지면 "메가 1마리" 규칙에 걸려 조합이 안 나오므로
  // 비메가 상위권을 따로 섞어 넣는다.
  const short = slots.map((s) => [
    ...s.ranked.slice(0, 8),
    ...s.ranked.filter((r) => !r.mega).slice(0, 6),
  ]);
  const best = slots.map((s) => s.ranked[0]?.score || 1);
  const scoreOf = (id, si) => {
    const hit = slots[si].ranked.find((r) => r.id === id);
    return hit ? hit.score / best[si] : 0;
  };

  const ids = [...new Set(short.flat().map((r) => r.id))];
  // 메가진화는 한 번에 한 마리만 활성화되므로 파티에 둘 이상 넣을 수 없다
  const isMega = new Map(short.flat().map((r) => [r.id, !!r.mega]));
  let winner = null;
  for (let i = 0; i < ids.length; i++)
    for (let j = i + 1; j < ids.length; j++)
      for (let k = j + 1; k < ids.length; k++) {
        const trio = [ids[i], ids[j], ids[k]];
        if (trio.filter((id) => isMega.get(id)).length > 1) continue;
        // 각 슬롯을 셋 중 가장 잘 맞는 하나가 담당한다고 보고, 그 최소값을 평가
        const cover = slots.map((_, si) => Math.max(...trio.map((id) => scoreOf(id, si))));
        const weakest = Math.min(...cover);
        const sum = cover.reduce((a, b) => a + b, 0);
        if (!winner || weakest > winner.weakest || (weakest === winner.weakest && sum > winner.sum))
          winner = { trio, weakest, sum, cover };
      }
  if (!winner) return null;

  const lookup = (id) => {
    for (const s of slots) { const hit = s.ranked.find((r) => r.id === id); if (hit) return hit; }
    return null;
  };
  return {
    members: winner.trio.map(lookup).filter(Boolean).slice(0, size),
    coverage: winner.cover,
    weakest: winner.weakest,
  };
}
