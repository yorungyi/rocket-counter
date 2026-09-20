# 로켓단 대응기

포켓몬GO GO로켓단 전투에서 **최적 대응 포켓몬**을 계산하는 도구.
조무래기 대사로 타입을 판별하거나, 상대 라인업을 직접 넣어 슬롯별 카운터와 3마리 파티를 뽑는다.

결과물은 두 가지다.

- `docs/` — **설치형 웹앱(PWA)**. GitHub Pages에 올리면 폰 홈화면에 아이콘으로 깔리고,
  주소창 없이 전체화면으로 뜨며, 비행기모드에서도 동작한다.
- `dist/rocket-counter.html` — **단일 파일**. 더블클릭하면 인터넷 없이 열린다. 공유·백업용.

## 쓰는 법

탭 세 개다.

**조무래기** — 들은 대사를 입력하면 타입이 판별되고, 그 조무래기가 **실제로 내는 포켓몬**
(슬롯 1/2/3)과 슬롯별 카운터가 바로 나온다. 대사가 기억 안 나면 18타입 그리드에서 직접 고른다.
★ 표시는 이기면 잡을 수 있는 개체다.

**리더·보스** — 비주기(지오반니)·알로·클리프·시에라를 고르면 라인업과 대응이 나온다.

**직접입력** — 라인업이 바뀌었거나 목록에 없는 상대를 만났을 때. 한 슬롯에 여러 후보를 넣으면
그 전부를 감당할 수 있는 카운터를 계산한다.

**내 포켓몬** — 이름으로 검색해 체크하면 등록된다. 등록하는 순간 **「보유한 것만」**이 켜져서
그 뒤로는 실제로 가진 것 중에서만 추천한다(결과 위 스위치로 끌 수 있다 — 끄면 "뭘 키워야 하나"가 보인다).

이 탭 아래의 **내 대응표**가 핵심이다. 리더·보스 4명과 조무래기 18타입 각각에 대해
내 보유 포켓몬 중 최적 3마리를 한 화면에 정리한다. 전투 중에 이것만 봐도 된다.
주력 30~50마리면 충분하고, 등록 내용과 설정은 브라우저에 저장된다.

**상대 레벨** — 기본은 모드별 자동(조무래기 8 / 리더·보스 24)이다. 게임에서 본 CP나
체감 처치 시간과 안 맞으면 직접 조정한다. 순위는 거의 안 변하고 처치 시간이 맞춰진다.

### 읽는 법

| 항목 | 뜻 |
|---|---|
| DPS | 초당 대미지 (빠른공격+차징공격 1사이클 기준) |
| 처치 | 상대 1마리를 쓰러뜨리는 데 걸리는 초 |
| 여유 | 내가 버티는 시간 ÷ 상대를 잡는 시간. **1을 넘으면 1대1로 이긴다** |

## 설계 판단

**라인업은 내장하되 갱신 경로를 열어둔다.** 로켓단 라인업은 로테이션마다 바뀐다.
LeekDuck을 스크랩해 자동 갱신되는 소스를 빌드 시점에 구워 넣고, 화면에 기준일을 띄운다.
안 맞으면 「직접입력」 탭으로 우회할 수 있고, 빌드를 다시 돌리면 최신으로 갱신된다.
라인업 데이터가 없는 타입은 자동으로 타입 표본 계산으로 넘어간다.

**같은 타입의 남/여 조무래기는 합쳐서 보여준다.** 붙기 전까지 어느 쪽인지 알 수 없으므로
슬롯별 합집합이 실전에서 맞는 정보다.

**수치는 전부 게임마스터 원본.** 타입 상성(1.6 / 0.625 / 0.390625), CP 배율,
그림자 보정(공격 ×1.2 / 방어 ×0.8333), 기술 위력·에너지·시전시간까지 추측값이 없다.

**타입 기반 추천의 표본 선택.** 종족값 상위로만 표본을 뽑으면 복합타입 전설
(예: 자시안 = 강철/페어리)이 표본을 장악해 정작 그 타입의 약점이 지워진다.
그래서 전설·환상을 빼고 단일타입을 우선 채운다. 조무래기는 전설을 쓰지 않으므로 현실과도 맞다.

## 한계

- 피격 에너지(`energyDeltaPerHealthLost`)를 DPS 계산에서 제외했다. 실제 DPS는 표시값보다 **높다**.
- 상대 레벨은 조무래기 Lv8 / 리더·지오반니 Lv24로 가정한다.
  **순위는 이 값에 거의 영향받지 않지만 처치 시간은 달라진다.**
- 리더·지오반니의 실드(2회)는 반영하지 않는다. 실제 처치 시간은 더 걸린다.
- 상대 기술은 알 수 없으므로 그 포켓몬이 가진 모든 조합의 **평균**으로 피해량을 잡는다.
- 개체값(IV)은 반영하지 않는다. 내 포켓몬은 전부 설정한 레벨 / 15-15-15로 가정한다.
- 여유는 ×10을 넘으면 `×10↑`로 묶어 표시한다. 그 이상은 구분해봐야 의미가 없다.
- 포켓몬고는 보관함을 읽어올 공식 API가 없다. 비공식 접근은 계정 밴 대상이라
  **쓰지 않는다.** 보유 목록은 앱 안에서 직접 등록한다.

## 폰에 설치하기

`docs/`가 GitHub Pages로 올라가 있으면 그 주소를 폰 브라우저로 연 다음,

- **안드로이드(Chrome)** — 메뉴 → `앱 설치` 또는 `홈 화면에 추가`
- **아이폰(Safari)** — 공유 버튼 → `홈 화면에 추가`

설치하면 주소창 없는 전체화면으로 뜨고, 한 번 연 뒤에는 오프라인에서도 열린다.
온라인일 때는 열 때마다 최신 버전을 받아온다(서비스워커가 페이지를 네트워크 우선으로 가져온다).

## 구조

```
raw/        내려받은 원본 (게임마스터 19MB 등, git에서 제외 — 재생성 가능)
data/       정제 데이터 — types / pokemon / moves / grunts / battle / rocket
src/        engine.mjs  전투 계산 엔진 (브라우저·Node 공용)
web/        index.html  UI 원본 (__ENGINE__ / __DATA__ 자리표시자)
docs/       PWA 배포본 — GitHub Pages가 여기를 서비스한다
dist/       rocket-counter.html  단일 파일 배포본
scripts/    build-data · verify · bundle · make-icons · serve
```

`web/index.html`은 문서 뼈대(`<html>`/`<head>`) 없이 본문만 담는다.
단일 파일은 그대로 쓰고, PWA는 `bundle.mjs`가 뼈대와 매니페스트·서비스워커를 씌운다.

## 빌드

```bash
npm run build     # 데이터 → 검증 → 아이콘 → 번들 (docs/ 와 dist/ 둘 다)
npm run verify    # 검증만
node scripts/serve.mjs   # http://localhost:4173 에서 docs/ 확인 (서비스워커 포함)
```

서비스워커는 `file://`에서 동작하지 않으므로 PWA 확인은 반드시 서버로 해야 한다.

## 데이터 갱신

새 포켓몬이나 기술이 추가되면 원본을 다시 받아 빌드한다.

```bash
curl -o raw/gm_latest.json https://raw.githubusercontent.com/PokeMiners/game_masters/master/latest/latest.json
curl -o raw/pogoapi_pokedex.json https://pokemon-go-api.github.io/pokemon-go-api/api/pokedex.json
curl -o raw/i18n_korean.json "https://raw.githubusercontent.com/PokeMiners/pogo_assets/master/Texts/Latest%20APK/JSON/i18n_korean.json"
curl -o raw/rocketLineups.json https://raw.githubusercontent.com/bigfoott/ScrapedDuck/data/rocketLineups.json
node scripts/build-data.mjs && node scripts/verify.mjs && node scripts/bundle.mjs
```

`verify.mjs`는 상성표 인덱스, 그림자 보정, CPM, 그리고 타입별 추천이 게임 상식과
맞는지(물→전기/풀, 페어리→독/강철 등)까지 25건을 검사한다. **통과해야 배포한다.**

## 출처

- 게임마스터 — [PokeMiners/game_masters](https://github.com/PokeMiners/game_masters)
- PvE 기술 수치·한글명 — [pokemon-go-api](https://pokemon-go-api.github.io/pokemon-go-api/)
- 한글 대사 — [PokeMiners/pogo_assets](https://github.com/PokeMiners/pogo_assets)
- 로켓단 라인업 — [ScrapedDuck](https://github.com/bigfoott/ScrapedDuck) (LeekDuck 스크랩, 자동 갱신)

라인업만 바뀌었을 땐 `rocketLineups.json`만 다시 받아 빌드해도 된다.

## 표시 기술셋에 대해

한 슬롯에 여러 후보가 있을 때 DPS·처치 시간은 **후보 전체의 평균**이고,
기술셋은 그중 **가장 버거운 상대에 맞춘 것**을 보여준다. 실전에서 필요한 건 평균이 아니라
최악의 경우에도 통하는 기술이기 때문이다.

그래서 직관과 다른 답이 나올 때가 있는데, 대개 그쪽이 맞다.
예를 들어 강철 타입 상대 추천에 격투기가 아니라 고스트기가 올라오는 경우 —
강철 중 가장 버거운 메타그로스가 강철/에스퍼라 고스트 1.6배가 격투 1.0배를 이긴다.
