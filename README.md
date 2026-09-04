# COMPOUND

F1 타이어 전략 시뮬레이터. **F1 전략을 한국어로, 근거와 함께** 이해하게 만드는 것이 목표입니다.

배포: https://juhyeonmoon10.github.io/apex-strategy/

정확도 경쟁에서는 이미 앞선 서비스들이 있습니다(PITWALL, f1strategysim, RaceMate — 전부 영어).
이 프로젝트가 비어 있는 자리를 채우는 방식은 두 가지입니다.

1. **한국어** — 조사(을/를) 처리까지 포함한 자연스러운 한국어. 용어 사전 내장.
2. **설명** — 모든 추천에 "왜 그 결론인지"가 문장으로 붙습니다. 숫자만 주지 않습니다.

---

## 실행

빌드 도구가 필요 없습니다. Python 3 하나면 됩니다.

```bash
python serve.py 8124
```

http://localhost:8124 접속. GitHub Pages에는 이 디렉터리를 그대로 push하면 됩니다.

> `python -m http.server`를 쓰면 브라우저가 ES 모듈을 공격적으로 캐싱해 소스를 고쳐도
> 화면이 그대로인 일이 생깁니다. `serve.py`는 캐시 무효화 헤더를 붙입니다.
> `file://`로 직접 열면 CORS 때문에 동작하지 않습니다.

## 페이지

| 파일 | 역할 |
|---|---|
| `index.html` | 홈 — 한 문장, 시연 진입, 실측 숫자 3개 |
| `sim.html` | 시뮬레이터 — **3단계 스텝** (조건 → 전략+근거 → 레이스 리플레이) |
| `research.html` | 연구 — 데이터·전처리·방법·결과·검증·함정·한계·재현 |

`sim.html?step=2` 처럼 URL로 단계에 직접 진입할 수 있습니다. 조건과 편집한 전략도 URL에
직렬화됩니다. `?present=1`을 붙이면 고대비·큰 글씨로 바뀝니다 (화면에 스위치는 없습니다).

## 엔진 검증

브라우저 콘솔에서:

```js
COMPOUND.runSelfTest()
```

12개 항목 — 연료 효과, 클리프, 전략 격차, 피트 랩 민감도, 재현성, 실측 대조(그린랩·완주 시간),
추천 탐색, 24개 서킷 무결성 등.

---

## 구조

```
index.html · sim.html · research.html
styles/          tokens · base · components · board(전략 보드) · race(리플레이) · responsive
src/
  shell.js       공통 헤더·푸터
  store.js       상태 + URL 직렬화
  pages/         페이지별 진입점 (home · sim · research)
  engine/        ★ DOM 을 절대 참조하지 않는 순수 함수
    params.js      모든 모델 계수. 캘리브레이션은 이 파일만
    simulate.js    랩 단위 메인 루프
    explain.js     자연어 근거 생성
    narrate.js     재생 중 "이 랩에서" 문장
    trace.js       레이스 트레이스 + 교차 지점 탐지
    selftest.js    검증 12건
  data/          circuits · teams · assets · glossary · trackPaths(서킷 중심선, 자동 생성)
  ui/            DOM 렌더링. engine/ 을 import 하지만 그 반대는 절대 없다
    raceReplay.js  스텝 3 — 트랙 위 차 · 타이밍 타워 · 스틴트 간트 · 레이스 로그
tools/
  collect.py     OpenF1 → data/laps.csv (랩·스틴트·날씨 조인)
  analyze.py     마모 다중회귀 + 홀드아웃 검증
  calibrate.py   서킷 파라미터 실측 대조
  trace_maps.py  F1 공식 서킷 지도(PNG) → 트랙 중심선 좌표 (numpy 필요)
docs/            기획서, 작업 기록, UI 검수
```

**`engine/`이 `ui/`를 import하면 안 됩니다.** 이 경계 덕분에 엔진만 따로 테스트하고
캘리브레이션할 수 있습니다.

---

## 모델 요약

```
lapTime(n) = baseLap + 팀페이스 + 드라이버페이스 + 컴파운드델타
           + 마모(선형 + 클리프)      ← 클리프는 3.0초로 클램프
           + 연료효과                  ← 랩당 약 0.035초, 레이스 전체 약 1.9초
           + 트랙진화                  ← 지수 수렴
           + 노면적합도 + 트래픽 + 노이즈
```

- **랩 단위 누적.** 피트 랩을 1랩 옮기면 결과가 실제로 반응합니다 (0.75초).
- **재현 가능.** `mulberry32(seed)` — 같은 조건은 항상 같은 결과.
- **몬테카를로 500회.** 매 회차 모든 전략에 **같은 SC 타임라인**을 줍니다.
- **교차 지점 탐지.** 스톱 수가 같은 시점끼리만 비교하고, 피트 직후 3랩은 제외합니다.
  안 그러면 "상대가 방금 들어가서 26초 잃은" 순간을 역전으로 잡습니다.

## 데이터와 검증

| 항목 | 값 | 출처 |
|---|---|---|
| 수집 | 2023–2025 · 7개 서킷 · 21개 레이스 · **23,048랩** | `tools/collect.py` |
| 정제 | 18,364랩 · 1,001스틴트 | `tools/analyze.py` |
| 마모 계수 | SOFT 0.060 / MEDIUM 0.052 / HARD 0.067 초/랩 | 다중회귀. 논문(0.060/0.054)과 일치 |
| 홀드아웃 MAE | **0.717초** (RMSE 1.033) | 스틴트 앞 75% 학습 → 뒤 25% 예측 |
| 실버스톤 완주 오차 | **0.7%** | `tools/calibrate.py` |

**실버스톤만 실측 캘리브레이션됐습니다.** 나머지 23개 서킷은 근사 초기값이고, 시뮬레이터에
"근사 초기값" 배지로 표시됩니다. 마모 계수 실측값은 아직 `params.js`에 반영하지 않았습니다 —
컴파운드 간 차이를 얼마나 줄일지 판단이 먼저입니다.

> `pitLoss` 함정: OpenF1 `lane_duration`(28.75초)은 피트레인 **통과 시간**이지 **잃은 시간**이
> 아닙니다. 인랩+아웃랩을 정상 랩과 비교해야 실제 손실 19.9초가 나옵니다.

## 색 규칙

- **정체성 영역**(헤더, 버튼, 포커스, 가라지) → 팀 컬러. 원본 그대로.
- **데이터 영역**(스틴트 바, 차트 선, 타이어 밴드) → 컴파운드 컬러 독점.
- 팀 컬러와 컴파운드의 ΔE < 25면 **데이터 영역에서만** 채도를 낮춥니다 (11팀 중 5팀).
- 팀 컬러 위 텍스트는 상대 휘도 0.179(WCAG 대비식 교차점)로 자동 결정. 텍스트를 얹는 면은
  `--team-cta`로 4.5:1 보장 — **11개 팀 전부 AA 통과**.

## 드라이버 능력치

`src/data/teams.js` 의 드라이버 22명은 **EA SPORTS F1 25 · 2026 Season Pack DLC** 공식 레이팅
(OVR·EXP·RAC·AWA·PAC)을 [ea.com/games/f1/ratings](https://www.ea.com/games/f1/ratings) 에서
그대로 옮겼습니다 — 반복 "2026 Season Pack - June", 2026-09-04 확인. 아래 규칙으로 엔진 파라미터에 매핑합니다.

```
pace     = (88 − PAC) × 0.03        랩당 초
mgmt     = 1 − (EXP − 80) × 0.0015  경험 ↑ = 타이어 관리 ↑
wetSkill = OVR
```

팀(차량) 성능치는 EA 가 공개 페이지에 싣지 않아 프로젝트 추정값을 유지합니다.
가라지 카드에 OVR/PAC/RAC/EXP 가 출처와 함께 표시됩니다.
EA 페이지는 Hadjar 를 Racing Bulls 소속으로 표기하지만, 그러면 Red Bull 1명 / Racing Bulls 3명이
되어 시뮬레이터가 성립하지 않으므로 2026 발표 라인업(Hadjar → Red Bull)을 따르고 능력치만 EA 값을 씁니다.

## 이미지

드라이버·머신·로고는 F1 공식 미디어 CDN을 참조합니다(`src/data/assets.js`). CDN 실패 시 인라인
SVG 아트로 자동 교체됩니다.

전략 보드·가라지의 타이어는 `assets/tyres/` 의 피렐리 타이어 SVG(위키미디어 공용)를 씁니다 —
soft·medium·hard(P ZERO 빨강·노랑·흰색), inter·wet(CINTURATO 초록·파랑). `assets.js` 의
`TYRE_IMAGES` 로 끄면 자체 SVG 아이콘으로 돌아갑니다. F1 CDN 이미지와 피렐리 그래픽은 각 권리자의
자산이며, 비영리 프로젝트를 전제로 참조합니다.

## 남은 작업

- [ ] 마모 계수 실측값 반영 후 정확도 재측정
- [ ] `absolute_compound` — Pirelli 경기별 C1~C5 배정 반영
- [ ] 나머지 23개 서킷 캘리브레이션
- [ ] 경쟁 차량 3대 → 진짜 언더컷 판정
- [ ] K-best 동적계획법 (Carrasco Heine 2023) 검토
- [ ] FIA 규정 조항 번호 원문 대조

---

Formula 1, F1 및 관련 상표는 Formula One Licensing BV의 자산이며, 본 프로젝트는 상표권자와
무관한 비영리 프로젝트입니다.
