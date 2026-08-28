#!/usr/bin/env python3
"""collect.py 가 만든 데이터셋으로 타이어 마모를 추정한다.

핵심은 교락(confounding) 제거다.
스틴트 안에서 타이어가 닳는 동안 연료도 같이 줄어든다. 단순회귀를 돌리면
연료 쪽이 이겨서 "타이어가 닳을수록 빨라진다"는 음수 기울기가 나온다.

드라이버마다 피트 랩이 달라 절대 랩과 타이어 나이가 완전 공선은 아니므로
다중회귀로 분리할 수 있다:

    lapTime ~ a + b1·절대랩 + b2·타이어나이
    b1 = 연료 + 트랙 진화 (음수)
    b2 = 순수 마모 (양수)

세션마다 baseLap 이 크게 달라서(스파 108초 vs 잔드보르트 73초) 전부 한 통에
넣고 돌리면 안 된다. 세션 × 컴파운드로 나눠 회귀하고 중앙값으로 모은다.

    python tools/analyze.py
    python tools/analyze.py --data data/laps.csv --min-n 40
"""

import argparse
import csv
import statistics
import sys
from collections import defaultdict

# 논문 보고값 (arXiv 2512.00640, 2025 오스트리아 GP 해밀턴, 베이지안 상태공간)
PAPER = {"HARD": 0.054, "MEDIUM": 0.060}

# 현재 APEX 값 (src/engine/params.js)
CURRENT = {"SOFT": 0.055, "MEDIUM": 0.035, "HARD": 0.022,
           "INTERMEDIATE": 0.045, "WET": 0.035}

# 현재 서킷별 degMultiplier (src/data/circuits.js)
CIRCUIT_DM = {
    "Silverstone": 1.25, "Monza": 0.85, "Catalunya": 1.20,
    "Hungaroring": 1.05, "Zandvoort": 1.10, "Suzuka": 1.20,
    "Spa-Francorchamps": 1.15, "Monaco": 0.60,
}


def num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def load(path):
    with open(path, encoding="utf-8") as f:
        return list(csv.DictReader(f))


def multireg(pts):
    """y ~ a + b1·x1 + b2·x2  →  (b1, b2, R²)"""
    n = len(pts)
    if n < 6:
        return None, None, None
    mx1 = sum(p[0] for p in pts) / n
    mx2 = sum(p[1] for p in pts) / n
    my = sum(p[2] for p in pts) / n
    s11 = sum((p[0] - mx1) ** 2 for p in pts)
    s22 = sum((p[1] - mx2) ** 2 for p in pts)
    s12 = sum((p[0] - mx1) * (p[1] - mx2) for p in pts)
    s1y = sum((p[0] - mx1) * (p[2] - my) for p in pts)
    s2y = sum((p[1] - mx2) * (p[2] - my) for p in pts)
    det = s11 * s22 - s12 * s12
    if abs(det) < 1e-9:
        return None, None, None
    b1 = (s22 * s1y - s12 * s2y) / det
    b2 = (s11 * s2y - s12 * s1y) / det
    sst = sum((p[2] - my) ** 2 for p in pts)
    sse = sum((p[2] - (my + b1 * (p[0] - mx1) + b2 * (p[1] - mx2))) ** 2 for p in pts)
    r2 = 1 - sse / sst if sst > 0 else None
    return b1, b2, r2


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", default="data/laps.csv")
    ap.add_argument("--min-n", type=int, default=40, help="세션×컴파운드 최소 표본")
    args = ap.parse_args()
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

    rows = load(args.data)
    print(f"원본 {len(rows):,}행\n")

    # ── 전처리 ────────────────────────────────────────────────
    print("전처리")
    step = rows
    step = [r for r in step if num(r["lap_duration"])]
    print(f"  랩타임 있음                {len(step):>7,}")
    step = [r for r in step if r["compound"] and num(r["tyre_age"])]
    print(f"  컴파운드·타이어나이 있음    {len(step):>7,}")
    step = [r for r in step if r["is_pit_out"] != "1" and r["is_pit_in"] != "1"]
    print(f"  인랩·아웃랩 제외           {len(step):>7,}")
    step = [r for r in step if not (num(r["rainfall"]) or 0)]
    print(f"  건조 구간만                {len(step):>7,}")
    step = [r for r in step if num(r["tyre_age"]) >= 2]
    print(f"  워밍업 랩(나이 1) 제외      {len(step):>7,}")

    # 세션별 이상치 제거 — SC·트래픽·사고 랩
    by_sess = defaultdict(list)
    for r in step:
        by_sess[(r["year"], r["circuit"])].append(r)
    clean = []
    for k, rs in by_sess.items():
        med = statistics.median([num(r["lap_duration"]) for r in rs])
        clean += [r for r in rs if num(r["lap_duration"]) <= med * 1.07]
    print(f"  세션 중앙값 107% 초과 제외  {len(clean):>7,}")
    print(f"  → 최종 분석 대상           {len(clean):>7,}행\n")

    # ── 세션 × 컴파운드 회귀 ──────────────────────────────────
    groups = defaultdict(list)
    for r in clean:
        groups[(r["year"], r["circuit"], r["compound"])].append(
            (num(r["lap_number"]), num(r["tyre_age"]), num(r["lap_duration"])))

    # 서킷별 기준 랩타임 — 정규화에 쓴다
    sess_med = {}
    for k, rs in by_sess.items():
        sess_med[k] = statistics.median([num(r["lap_duration"]) for r in rs])

    fits = defaultdict(list)     # compound -> [(b2, circuit, n, r2)]
    fuel = defaultdict(list)
    for (yr, circ, comp), pts in sorted(groups.items()):
        if len(pts) < args.min_n:
            continue
        b1, b2, r2 = multireg(pts)
        if b2 is None or not (-0.4 < b2 < 0.6):
            continue
        base = sess_med.get((yr, circ)) or 90.0
        fits[comp].append((b2, circ, len(pts), r2, b2 / base * 100))
        fuel[comp].append(b1)

    # ── 컴파운드별 결과 ───────────────────────────────────────
    print("=" * 70)
    print("  컴파운드별 순수 마모 b2  (초/랩)")
    print("=" * 70)
    print(f"\n  {'컴파운드':<14}{'중앙값':<10}{'사분위범위':<18}{'세션수':<8}{'현재값':<9}{'논문'}")
    for comp in ["SOFT", "MEDIUM", "HARD", "INTERMEDIATE"]:
        if comp not in fits:
            continue
        vals = sorted(v[0] for v in fits[comp])
        med = statistics.median(vals)
        q1 = vals[len(vals) // 4]
        q3 = vals[3 * len(vals) // 4]
        paper = f"{PAPER[comp]:.3f}" if comp in PAPER else "—"
        print(f"  {comp:<14}{med:+.4f}   [{q1:+.4f}, {q3:+.4f}]   "
              f"{len(vals):<8}{CURRENT.get(comp, 0):<9.3f}{paper}")

    fa = [v for vs in fuel.values() for v in vs]
    if fa:
        print(f"\n  연료+트랙진화 b1 중앙값  {statistics.median(fa):+.4f} 초/랩")

    # ── 서킷별 상대 마모 → degMultiplier ──────────────────────
    print("\n" + "=" * 70)
    print("  서킷별 상대 마모  →  degMultiplier 제안")
    print("=" * 70)
    per_circ = defaultdict(list)
    for comp, entries in fits.items():
        if comp in ("INTERMEDIATE", "WET"):
            continue
        for b2, circ, n, r2, rel in entries:
            per_circ[circ].append((rel, circ))
    sess_count = defaultdict(set)
    for comp, entries in fits.items():
        for b2, circ, n, r2, rel in entries:
            sess_count[circ].add((comp,))

    circ_med = {c: statistics.median([x[0] for x in v]) for c, v in per_circ.items() if len(v) >= 2}
    circ_n = {c: len(v) for c, v in per_circ.items()}
    if circ_med:
        overall = statistics.median(list(circ_med.values()))
        print(f"\n  기준(전체 중앙값) {overall:.4f} %/랩 = degMultiplier 1.00\n")
        print(f"  {'서킷':<24}{'마모(%/랩)':<15}{'실측비율':<11}{'현재값':<10}{'차이':<9}{'적합수'}")
        for c, v in sorted(circ_med.items(), key=lambda x: -x[1]):
            ratio = v / overall if overall else 0
            cur = CIRCUIT_DM.get(c)
            diff = f"{ratio - cur:+.2f}" if cur else "—"
            cur_s = f"{cur:.2f}" if cur else "—"
            print(f"  {c:<24}{v:.4f}        {ratio:>5.2f}       {cur_s:<10}{diff:<9}{circ_n.get(c,0)}")

    print("\n" + "=" * 70)
    print("  해석")
    print("=" * 70)
    print("""
  · b2 가 양수여야 정상이다(타이어가 닳을수록 느려짐).
    단순회귀로는 전부 음수가 나온다 — 연료 효과와 교락되기 때문.

  · 논문(arXiv 2512.00640)은 HARD 0.054 / MEDIUM 0.060 을 보고하면서
    "신뢰구간이 크게 겹쳐 컴파운드 간 차이의 근거가 약하다"고 밝혔다.
    우리 결과도 같은 경향이면, 컴파운드별 wear 를 크게 벌려놓은
    현재 설정(SOFT 0.055 vs HARD 0.022, 2.5배)은 근거가 약한 셈이다.

  · 드라이버가 타이어를 아껴 타면(리프트&코스트) 마모가 랩타임에
    덜 드러난다. 논문도 이 점을 한계로 지적한다.
""")
    report_holdout(clean)
    return 0




# ─────────────────────────────────────────────────────────────
#  홀드아웃 검증
#
#  각 스틴트의 앞 75% 로 학습하고 뒤 25% 를 예측한다.
#  시간 순서를 지켜야 "미래를 보고 과거를 맞추는" 누수가 없다.
#
#  주의: 한 스틴트 안에서는 절대랩과 타이어나이가 완전히 공선적이다
#        (절대랩 = 시작랩 + 나이 - 1). 그래서 스틴트 하나로는 회귀가 불가능하다.
#        같은 세션·컴파운드의 여러 스틴트를 모아서 학습해야 공선성이 깨진다.
# ─────────────────────────────────────────────────────────────

def holdout(rows, min_laps=8):
    import statistics as st_
    groups = defaultdict(lambda: defaultdict(list))   # (yr,circ,comp) -> stint_id -> laps
    for r in rows:
        sid = (r["session_key"], r["driver_number"], r["stint_number"])
        groups[(r["year"], r["circuit"], r["compound"])][sid].append(r)

    per_session = defaultdict(list)
    for (yr, circ, comp), stints in groups.items():
        train, test = [], []
        for sid, laps in stints.items():
            laps.sort(key=lambda r: num(r["lap_number"]))
            if len(laps) < min_laps:
                continue
            cut = int(len(laps) * 0.75)
            train += laps[:cut]
            test += laps[cut:]
        if len(train) < 30 or len(test) < 5:
            continue

        pts = [(num(r["lap_number"]), num(r["tyre_age"]), num(r["lap_duration"])) for r in train]
        b1, b2, _ = multireg(pts)
        if b1 is None:
            continue
        n = len(pts)
        mx1 = sum(p[0] for p in pts) / n
        mx2 = sum(p[1] for p in pts) / n
        my = sum(p[2] for p in pts) / n

        errs = []
        for r in test:
            pred = my + b1 * (num(r["lap_number"]) - mx1) + b2 * (num(r["tyre_age"]) - mx2)
            errs.append(abs(num(r["lap_duration"]) - pred))
        per_session[(yr, circ)] += errs

    return per_session


def report_holdout(clean):
    import statistics as st_
    ps = holdout(clean)
    if not ps:
        return
    print("\n" + "=" * 70)
    print("  홀드아웃 검증 — 스틴트 앞 75% 학습 → 뒤 25% 예측")
    print("=" * 70)
    print(f"\n  {'경기':<28}{'예측 랩':<10}{'MAE(초)':<11}{'RMSE(초)'}")
    all_e = []
    for k in sorted(ps):
        e = ps[k]
        all_e += e
        mae = sum(e) / len(e)
        rmse = (sum(x * x for x in e) / len(e)) ** 0.5
        print(f"  {k[0]} {k[1]:<22}{len(e):<10}{mae:<11.3f}{rmse:.3f}")
    mae = sum(all_e) / len(all_e)
    rmse = (sum(x * x for x in all_e) / len(all_e)) ** 0.5
    print(f"\n  {'전체':<28}{len(all_e):<10}{mae:<11.3f}{rmse:.3f}")
    print(f"\n  · MAE {mae:.3f}초는 랩타임의 약 {mae/90*100:.1f}% 수준이다(90초 랩 기준).")
    print( "  · 선형 모형이라 클리프(급격한 성능 저하)는 잡지 못한다. 이것이 오차의 주원인이다.")


if __name__ == "__main__":
    sys.exit(main())
