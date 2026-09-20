/** 엔진 검증: 알려진 게임 사실과 계산 결과가 맞는지 확인한다. */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cpmFor, statsOf, damage, effectiveness, rankByType, matchup } from '../src/engine.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const load = (f) => JSON.parse(readFileSync(join(ROOT, 'data', f), 'utf8'));
const db = { types: load('types.json'), moves: load('moves.json'), battle: load('battle.json'), pokemon: load('pokemon.json') };
const byId = new Map(db.pokemon.map((p) => [p.id, p]));

let pass = 0, fail = 0;
const check = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}  ${detail}`); }
};

console.log('\n[1] 기본 계산');
check('CPM 레벨40 = 0.7903', Math.abs(cpmFor(db.battle, 40) - 0.7903) < 1e-9);
check('CPM 반레벨 보간 (L39.5는 L39~L40 사이)', cpmFor(db.battle, 39.5) > cpmFor(db.battle, 39) && cpmFor(db.battle, 39.5) < cpmFor(db.battle, 40));
check('물->불 = 1.6', effectiveness(db.types, 'WATER', ['FIRE']) === 1.6);
check('땅->비행 = 0.390625 (무효)', effectiveness(db.types, 'GROUND', ['FLYING']) === 0.390625);
check('2중타입 곱연산: 얼음->드래곤/비행 = 2.56', Math.abs(effectiveness(db.types, 'ICE', ['DRAGON', 'FLYING']) - 2.56) < 1e-9);
check('대미지 공식 하한 +1', damage(10, 100, 1e6, 1, 1) === 1);

console.log('\n[2] 그림자 보정 (게임마스터 실값)');
const mach = byId.get('MACHAMP');
const normal = statsOf(mach, db.battle, { level: 24, shadow: false });
const shadow = statsOf(mach, db.battle, { level: 24, shadow: true });
check('그림자 공격 x1.2', Math.abs(shadow.atk / normal.atk - 1.2) < 1e-9);
check('그림자 방어 x0.8333', Math.abs(shadow.def / normal.def - 0.8333333) < 1e-6);
check('그림자 HP 동일', shadow.hp === normal.hp);

console.log('\n[3] 타입 기반 추천이 상식과 맞는가');
const expect = {
  WATER:    ['GRASS', 'ELECTRIC'],
  FIRE:     ['WATER', 'ROCK', 'GROUND'],
  GRASS:    ['FIRE', 'FLYING', 'ICE', 'POISON', 'BUG'],
  NORMAL:   ['FIGHTING'],
  DRAGON:   ['DRAGON', 'ICE', 'FAIRY'],
  DARK:     ['FIGHTING', 'FAIRY', 'BUG'],
  // GHOST 포함: 표시 기술셋은 표본 중 "가장 버거운 상대"에 맞춘 것이고,
  // 강철 표본의 최강자는 메타그로스(강철/에스퍼)다. 그 상대엔 고스트 1.6 > 격투 1.0 이라
  // 고스트기가 올라오는 게 정답이다.
  STEEL:    ['FIRE', 'FIGHTING', 'GROUND', 'GHOST'],
  FAIRY:    ['POISON', 'STEEL'],
  GHOST:    ['GHOST', 'DARK'],
  ELECTRIC: ['GROUND'],
};
for (const [target, wantTypes] of Object.entries(expect)) {
  const { ranked } = rankByType(target, db, { limit: 8, bossLevel: 24 });
  const top = ranked.slice(0, 5);
  const topMoveTypes = top.map((r) => db.moves[r.chargedId]?.type);
  const hit = topMoveTypes.filter((t) => wantTypes.includes(t)).length;
  check(
    `vs ${target}: 상위5 주력기가 기대타입(${wantTypes.join('/')}) ${hit}/5`,
    hit >= 3,
    `실제=${top.map((r) => `${r.ko}(${db.moves[r.chargedId]?.type})`).join(', ')}`,
  );
}

console.log('\n[4] 대표 대결 수치 점검');
const tyranitar = byId.get('TYRANITAR');
const m = matchup(mach, tyranitar, db, { bossLevel: 24, myLevel: 40 });
console.log(`  괴력몬 vs 그림자 마기라스: DPS ${m.dps.toFixed(1)} / 처치 ${m.ttk.toFixed(1)}초 / 생존 ${m.ttd.toFixed(1)}초 / 여유 x${m.margin.toFixed(2)}`);
check('격투 카운터가 마기라스전에서 유리 (여유 > 1)', m.margin > 1, `margin=${m.margin.toFixed(2)}`);
check('DPS가 합리적 범위 (5~60)', m.dps > 5 && m.dps < 60, `dps=${m.dps.toFixed(1)}`);

console.log('\n[5] 데이터 무결성');
check('포켓몬 1000종 이상', db.pokemon.length > 1000, `${db.pokemon.length}`);
const noMoves = db.pokemon.filter((p) => !p.fast.length || !p.charged.length).length;
check('기술 없는 항목이 전체의 20% 미만', noMoves / db.pokemon.length < 0.2, `${noMoves}/${db.pokemon.length}`);
const badMove = Object.entries(db.moves).filter(([, v]) => !v.type || !v.duration).length;
check('모든 기술에 타입/시전시간 존재', badMove === 0, `${badMove}건 누락`);
check('메가 포켓몬이 기술을 상속받음', byId.get('CHARIZARD_MEGA_X')?.fast.length > 0);

console.log(`\n결과: ${pass} PASS / ${fail} FAIL\n`);
process.exit(fail ? 1 : 0);
