#!/usr/bin/env python3
"""조사 문서의 수식에 들어갈 계수를 실측 랩(data/laps.csv)에서 문서가 말한 방법 그대로 뽑는다.

    python tools/doc_params.py            # 표 출력 + src/data/docParams.js 저장

문서의 수식과 계수가 얻어지는 곳
  F2  t_tire(a) = β0 + β1·a + β2·(a − τ)₊
      β1 : 클리프 이전 열화율   ← 스틴트별 회귀 기울기 (문서: "FP2 롱런 회귀의 기울기")
      τ  : 클리프 랩            ← 변화점(꺾은선) 회귀. 각 τ 후보로 맞춰 오차가 가장 작은 τ
      β2 : 클리프 이후 추가 기울기
      검증용으로 문서의 롤링 규칙(직전 3랩 기울기 > 초반 기울기 × 2.5)도 같이 돌린다.
  F5  k_c = t̄_c / t̄_M        ← 같은 경기·같은 드라이버가 두 컴파운드를 모두 쓴 경우만 비교

문서가 "조건이 비슷한 랩"을 고르라고 했으므로 아래를 맞춘다.
  · 인랩·아웃랩·워밍업 랩(나이 1)·비 오는 랩 제외
  · 세션 중앙값의 107% 를 넘는 랩(SC·트래픽) 제외
  · 연료 효과 보정: 남은 랩 수 × 0.035초 를 빼서 연료가 같은 상태로 맞춘다
"""
import csv
import json
import os
import statistics
import sys
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "..", "data", "laps.csv")
OUT = os.path.join(HERE, "..", "src", "data", "docParams.js")
FUEL_PER_LAP = 0.035          # README·params 의 연료 효과와 같은 값
COMPS = ["SOFT", "MEDIUM", "HARD"]


def num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def linfit(xs, ys):
    n = len(xs)
    mx, my = sum(xs) / n, sum(ys) / n
    sxx = sum((x - mx) ** 2 for x in xs)
    if sxx == 0:
        return None, None
    b = sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / sxx
    return my - b * mx, b


def sse_hinge(ages, ys, tau):
    """t = b0 + b1·a + b2·(a−τ)₊ 를 최소제곱으로 맞추고 (b0,b1,b2,sse) 를 돌려준다."""
    X = [(1.0, a, max(0.0, a - tau)) for a in ages]
    # 3×3 정규방정식
    A = [[sum(r[i] * r[j] for r in X) for j in range(3)] for i in range(3)]
    B = [sum(r[i] * y for r, y in zip(X, ys)) for i in range(3)]
    try:
        sol = solve3(A, B)
    except ZeroDivisionError:
        return None
    b0, b1, b2 = sol
    sse = sum((y - (b0 + b1 * a + b2 * max(0.0, a - tau))) ** 2 for a, y in zip(ages, ys))
    return b0, b1, b2, sse


def solve3(A, B):
    M = [row[:] + [b] for row, b in zip(A, B)]
    for i in range(3):
        p = max(range(i, 3), key=lambda r: abs(M[r][i]))
        M[i], M[p] = M[p], M[i]
        if abs(M[i][i]) < 1e-12:
            raise ZeroDivisionError
        for r in range(3):
            if r != i:
                f = M[r][i] / M[i][i]
                M[r] = [x - f * y for x, y in zip(M[r], M[i])]
    return [M[i][3] / M[i][i] for i in range(3)]


def main():
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    rows = list(csv.DictReader(open(DATA, encoding="utf-8")))

    # ── 전처리 (analyze.py 와 같은 규칙) ─────────────────────
    clean = [r for r in rows
             if num(r["lap_duration"]) and r["compound"] in COMPS and num(r["tyre_age"])
             and r["is_pit_out"] != "1" and r["is_pit_in"] != "1"
             and not (num(r["rainfall"]) or 0) and num(r["tyre_age"]) >= 2]
    by_sess = defaultdict(list)
    for r in clean:
        by_sess[r["session_key"]].append(r)
    total_laps = {}
    kept = []
    for sk, rs in by_sess.items():
        m = statistics.median(num(r["lap_duration"]) for r in rs)
        total_laps[sk] = max(int(num(r["lap_number"])) for r in rs)
        kept += [r for r in rs if num(r["lap_duration"]) <= m * 1.07]
    for r in kept:
        left = total_laps[r["session_key"]] - num(r["lap_number"])
        r["_t"] = num(r["lap_duration"]) - FUEL_PER_LAP * left      # 연료 보정
    print(f"원본 {len(rows):,}랩 → 분석 {len(kept):,}랩 ({len(by_sess)}개 경기)\n")

    # ── F5: 컴파운드 계수 k_c = t̄_c / t̄_M ──────────────────
    per_drv = defaultdict(lambda: defaultdict(list))
    for r in kept:
        if 2 <= num(r["tyre_age"]) <= 12:                      # 비슷한 사용량
            per_drv[(r["session_key"], r["driver_number"])][r["compound"]].append(r["_t"])
    ratios = defaultdict(list)
    for key, by_c in per_drv.items():
        if len(by_c.get("MEDIUM", [])) < 4:
            continue
        tm = statistics.mean(by_c["MEDIUM"])
        for c in ("SOFT", "HARD"):
            if len(by_c.get(c, [])) >= 4:
                ratios[c].append(statistics.mean(by_c[c]) / tm)
    kc = {"MEDIUM": 1.0}
    print("F5 컴파운드 계수 k_c = t̄_c / t̄_M  (같은 경기·같은 드라이버 쌍의 중앙값)")
    for c in ("SOFT", "HARD"):
        v = ratios[c]
        kc[c] = round(statistics.median(v), 5) if v else None
        print(f"  {c:<7} k = {kc[c]}   표본 {len(v)}쌍   사분위 "
              f"{statistics.quantiles(v, n=4)[0]:.4f}–{statistics.quantiles(v, n=4)[2]:.4f}" if len(v) >= 4 else "")

    # ── F2: 스틴트별 꺾은선 회귀 ───────────────────────────
    stints = defaultdict(list)
    for r in kept:
        stints[(r["session_key"], r["driver_number"], r["stint_number"], r["compound"])].append(
            (num(r["tyre_age"]), r["_t"]))
    res = {c: {"b1": [], "tau": [], "b2": [], "roll": [], "n": 0, "long": 0} for c in COMPS}
    for (sk, dn, st, comp), pts in stints.items():
        pts.sort()
        ages = [a for a, _ in pts]
        ys = [y for _, y in pts]
        if len(pts) < 8:
            continue
        res[comp]["n"] += 1
        _, b1 = linfit(ages, ys)
        if b1 is not None and -0.3 < b1 < 0.5:
            res[comp]["b1"].append(b1)
        if len(pts) < 15:
            continue
        res[comp]["long"] += 1
        # 변화점 회귀: τ 후보마다 꺾은선을 맞추고 오차가 가장 작은 τ
        lin = sse_hinge(ages, ys, 1e9)
        best = None
        for tau in range(int(ages[0]) + 5, int(ages[-1]) - 3):
            f = sse_hinge(ages, ys, tau)
            if f and (best is None or f[3] < best[3]):
                best = (f[0], f[1], f[2], f[3], tau)
        # 꺾은선이 직선보다 확실히 나을 때만 클리프로 인정 (오차 20% 이상 감소 + β2 > 0.05)
        if best and lin and best[2] > 0.05 and best[3] < lin[3] * 0.8:
            res[comp]["tau"].append(best[4])
            res[comp]["b2"].append(best[2])
        # 문서의 롤링 규칙: 직전 3랩 기울기 > 초반 기울기 × 2.5 가 2랩 연속
        _, early = linfit(ages[:6], ys[:6])
        if early and early > 0.02:
            streak = 0
            for i in range(3, len(ages)):
                _, s = linfit(ages[i - 2:i + 1], ys[i - 2:i + 1])
                streak = streak + 1 if s and s > early * 2.5 else 0
                if streak >= 2:
                    res[comp]["roll"].append(ages[i - 1])
                    break

    out = {"source": "data/laps.csv · tools/doc_params.py", "laps": len(kept), "races": len(by_sess),
           "fuelPerLap": FUEL_PER_LAP, "compounds": {}}
    print("\nF2 꺾은선 회귀  t(a) = β0 + β1·a + β2·(a − τ)₊")
    print(f"  {'':<7}{'β1 중앙값':>10}{'스틴트':>8}{'15랩+':>7}{'클리프 검출':>11}{'τ 중앙값':>9}{'β2 중앙값':>10}{'롤링 τ':>8}")
    for c in COMPS:
        r = res[c]
        med = lambda v: round(statistics.median(v), 4) if v else None
        row = {
            "k1": med(r["b1"]), "stints": r["n"], "longStints": r["long"],
            "cliffDetected": len(r["tau"]), "tau": med(r["tau"]), "b2": med(r["b2"]),
            "rollTau": med(r["roll"]), "rollDetected": len(r["roll"]), "kc": kc.get(c),
        }
        out["compounds"][c] = row
        print(f"  {c:<7}{str(row['k1']):>10}{r['n']:>8}{r['long']:>7}{len(r['tau']):>11}"
              f"{str(row['tau']):>9}{str(row['b2']):>10}{str(row['rollTau']):>8}")

    out["kcRatios"] = {c: len(ratios[c]) for c in ("SOFT", "HARD")}
    NL = chr(10)
    with open(OUT, "w", encoding="utf-8", newline=NL) as f:
        f.write("// 자동 생성 — tools/doc_params.py. 조사 문서의 방법으로 실측 랩에서 뽑은 계수." + NL)
        f.write("// 화면의 '실측값 넣기' 와 연구 페이지가 읽는다. 엔진 기본값은 params.js 의 DOC_MODEL." + NL)
        f.write("export const DOC_MEASURED = ")
        json.dump(out, f, ensure_ascii=False, indent=1)
        f.write(";" + NL)
    print(f"\n→ {os.path.relpath(OUT)}")


if __name__ == "__main__":
    main()
