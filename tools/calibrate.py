#!/usr/bin/env python3
"""OpenF1 실측 데이터로 시뮬레이션 파라미터를 캘리브레이션한다.

브라우저가 아니라 오프라인에서 돌린다. OpenF1 무료 티어는 3req/s 제한이 있어
런타임에 여러 세션을 긁는 건 불가능하고, 애초에 개발 시점에 한 번만 하면 되는 일이다.
결과를 src/engine/params.js 와 src/data/circuits.js 에 상수로 구워넣으면
런타임 의존성이 0 이 된다.

    python tools/calibrate.py                 # 실버스톤, 가능한 전 시즌
    python tools/calibrate.py --circuit Monza
    python tools/calibrate.py --years 2024 2025

출력은 "현재값 → 실측값" 대조표다. 파일을 자동으로 고치지는 않는다.
숫자를 눈으로 확인하고 직접 반영하는 편이 안전하다.
"""

import argparse
import json
import statistics
import sys
import time
import urllib.parse
import urllib.request
from collections import defaultdict

BASE = "https://api.openf1.org/v1"
RATE_SLEEP = 0.45  # 무료 티어 3req/s. 여유를 둔다.

# 현재 APEX 가 쓰고 있는 값 (src/data/circuits.js, src/engine/params.js)
CURRENT = {
    "Silverstone": {"baseLap": 88.5, "pitLoss": 23.5, "laps": 52, "degMultiplier": 1.25, "fuelPerLap": 0.0364},
    "Monza": {"baseLap": 84.0, "pitLoss": 22.0, "laps": 53, "degMultiplier": 0.85, "fuelPerLap": 0.0359},
    "Monaco": {"baseLap": 74.5, "pitLoss": 19.5, "laps": 78, "degMultiplier": 0.60, "fuelPerLap": 0.0224},
}
CURRENT_WEAR = {"SOFT": 0.055, "MEDIUM": 0.035, "HARD": 0.022, "INTERMEDIATE": 0.045, "WET": 0.035}

_last_call = [0.0]


def get(endpoint, **params):
    """레이트 리밋을 지키며 호출한다."""
    wait = RATE_SLEEP - (time.time() - _last_call[0])
    if wait > 0:
        time.sleep(wait)
    url = f"{BASE}/{endpoint}"
    if params:
        url += "?" + urllib.parse.urlencode(params)
    _last_call[0] = time.time()
    try:
        with urllib.request.urlopen(url, timeout=30) as r:
            return json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return []
        if e.code == 429:
            print("  ! 레이트 리밋 — 2초 대기 후 재시도", file=sys.stderr)
            time.sleep(2)
            return get(endpoint, **params)
        raise


def median(xs):
    return statistics.median(xs) if xs else None


def race_sessions(circuit, years):
    out = []
    for y in years:
        for s in get("sessions", year=y, circuit_short_name=circuit, session_name="Race"):
            out.append(s)
    return sorted(out, key=lambda s: s["date_start"])


def analyse(session):
    """한 레이스 세션에서 필요한 값을 뽑는다."""
    key = session["session_key"]
    print(f"\n  {session['year']} {session['circuit_short_name']} (session_key={key})")

    laps = get("laps", session_key=key)
    stints = get("stints", session_key=key)
    pits = get("pit", session_key=key)
    weather = get("weather", session_key=key)
    result = get("session_result", session_key=key)

    if not laps:
        print("    데이터 없음 — 건너뜀")
        return None

    # --- 랩 수 ---
    # 최댓값을 쓰면 랩 카운팅 이상치(2023 실버스톤이 53으로 잡힘)에 끌려간다.
    # 드라이버별 완주 랩 수의 최빈값을 쓴다.
    per_driver = defaultdict(int)
    for l in laps:
        n = l.get("lap_number") or 0
        per_driver[l["driver_number"]] = max(per_driver[l["driver_number"]], n)
    total_laps = statistics.mode(per_driver.values()) if per_driver else 0

    # --- 그린 플래그 랩만 추리기 ---
    # OpenF1 /laps 에는 SC 플래그가 없다. 아웃랩을 빼고,
    # 전체 중앙값의 107% 를 넘는 랩(SC·트래픽·사고)을 이상치로 버린다.
    durations = [l["lap_duration"] for l in laps
                 if l.get("lap_duration") and not l.get("is_pit_out_lap")]
    if not durations:
        return None
    med_all = median(durations)
    green = [d for d in durations if d <= med_all * 1.07]

    fastest = min(green)
    med_green = median(green)

    # --- 피트 손실 ---
    # lane_duration 은 "피트레인을 통과한 시간"이지 "코스에 남았을 때 대비 잃은 시간"이 아니다.
    # 우리 모델의 pitLoss 는 후자다. 그대로 쓰면 8~10초 과대평가된다.
    #
    # 실제 손실 = (인랩 + 아웃랩) - 2 x 그 드라이버의 정상 랩
    lane = [p["lane_duration"] for p in pits if p.get("lane_duration")]
    stop = [p["stop_duration"] for p in pits if p.get("stop_duration")]

    all_lap = defaultdict(dict)          # 인랩/아웃랩 포함 전체
    for l in laps:
        if l.get("lap_duration"):
            all_lap[l["driver_number"]][l["lap_number"]] = l["lap_duration"]

    driver_ref = {}
    for drv, m in all_lap.items():
        clean = [d for d in m.values() if d <= med_all * 1.07]
        if len(clean) >= 8:
            driver_ref[drv] = median(clean)

    true_loss = []
    for pit in pits:
        drv, L = pit.get("driver_number"), pit.get("lap_number")
        ref = driver_ref.get(drv)
        m = all_lap.get(drv, {})
        if not (ref and L and L in m and (L + 1) in m):
            continue
        loss = (m[L] + m[L + 1]) - 2 * ref
        if 8 < loss < 45:            # 사고/SC 중 피트인 등 이상치 제외
            true_loss.append(loss)

    # --- 날씨 ---
    track_t = median([w["track_temperature"] for w in weather if w.get("track_temperature")])
    air_t = median([w["air_temperature"] for w in weather if w.get("air_temperature")])
    rain = max([w.get("rainfall") or 0 for w in weather] or [0])

    # --- 우승자 총 시간 ---
    winner = next((r for r in result if r.get("position") == 1), None)
    win_time = winner.get("duration") if winner else None
    if isinstance(win_time, list):
        win_time = None

    # --- 컴파운드별 마모 (다중회귀) ---
    # 스틴트 안에서 타이어 나이가 늘어나는 동안 연료도 같이 줄어든다.
    # 단순 회귀로는 둘이 교락되어 기울기가 음수로 나온다(=타이어가 닳을수록 빨라짐).
    #
    # 드라이버마다 피트 랩이 다르므로 절대 랩과 타이어 나이는 완전히 공선적이지 않다.
    #   lapTime ~ a + b1·절대랩 + b2·타이어나이
    # b1 = 연료 + 트랙 진화 (음수), b2 = 순수 마모 (양수여야 정상)
    by_driver_lap = defaultdict(dict)
    for l in laps:
        if l.get("lap_duration") and not l.get("is_pit_out_lap"):
            by_driver_lap[l["driver_number"]][l["lap_number"]] = l["lap_duration"]

    samples = defaultdict(list)   # compound -> [(absLap, age, time)]
    for st in stints:
        comp = st.get("compound")
        if not comp or st.get("lap_start") is None or st.get("lap_end") is None:
            continue
        dl = by_driver_lap.get(st["driver_number"], {})
        for lap in range(st["lap_start"], st["lap_end"] + 1):
            d = dl.get(lap)
            if not d or d > med_all * 1.07:
                continue
            age = lap - st["lap_start"] + 1 + (st.get("tyre_age_at_start") or 0)
            if age <= 1:
                continue  # 워밍업 랩은 별도 항이라 제외
            samples[comp].append((lap, age, d))

    deg, deg_n, fuel_coef = {}, {}, {}
    for comp, pts in samples.items():
        if len(pts) < 25:
            continue
        b1, b2 = multireg(pts)
        if b2 is None:
            continue
        deg[comp] = b2
        fuel_coef[comp] = b1
        deg_n[comp] = len(pts)

    return {
        "year": session["year"],
        "total_laps": total_laps,
        "fastest": fastest,
        "median_green": med_green,
        "lane_duration": median(lane),
        "stop_duration": median(stop),
        "true_pit_loss": median(true_loss),
        "true_pit_n": len(true_loss),
        "track_temp": track_t,
        "air_temp": air_t,
        "rain": rain,
        "winner_time": win_time,
        "deg": deg,
        "deg_n": deg_n,
        "fuel_coef": fuel_coef,
    }


def multireg(points):
    """y ~ a + b1·x1 + b2·x2 정규방정식 풀이. (b1, b2) 반환."""
    n = len(points)
    sx1 = sum(p[0] for p in points); sx2 = sum(p[1] for p in points)
    sy = sum(p[2] for p in points)
    mx1, mx2, my = sx1 / n, sx2 / n, sy / n
    s11 = sum((p[0] - mx1) ** 2 for p in points)
    s22 = sum((p[1] - mx2) ** 2 for p in points)
    s12 = sum((p[0] - mx1) * (p[1] - mx2) for p in points)
    s1y = sum((p[0] - mx1) * (p[2] - my) for p in points)
    s2y = sum((p[1] - mx2) * (p[2] - my) for p in points)
    det = s11 * s22 - s12 * s12
    if abs(det) < 1e-9:
        return None, None
    return (s22 * s1y - s12 * s2y) / det, (s11 * s2y - s12 * s1y) / det


def linreg_slope(points):
    n = len(points)
    sx = sum(p[0] for p in points)
    sy = sum(p[1] for p in points)
    sxx = sum(p[0] * p[0] for p in points)
    sxy = sum(p[0] * p[1] for p in points)
    denom = n * sxx - sx * sx
    if denom == 0:
        return None
    return (n * sxy - sx * sy) / denom


def report(circuit, runs):
    cur = CURRENT.get(circuit, {})
    print("\n" + "=" * 68)
    print(f"  캘리브레이션 결과 — {circuit}")
    print("=" * 68)

    print(f"\n  {'시즌':<8}{'랩':<6}{'최속랩':<10}{'중앙 그린랩':<13}{'피트레인':<10}{'정지':<8}{'노면':<7}{'비'}")
    for r in runs:
        print(f"  {r['year']:<8}{r['total_laps']:<6}"
              f"{r['fastest']:<10.3f}{r['median_green']:<13.3f}"
              f"{fmt(r['lane_duration']):<10}{fmt(r['stop_duration']):<8}"
              f"{fmt(r['track_temp'],1):<7}{'예' if r['rain'] else '아니오'}")

    dry = [r for r in runs if not r["rain"]]
    pool = dry or runs
    if not dry:
        print("\n  ⚠ 건조 레이스가 없습니다. 젖은 레이스 데이터로 계산하므로 신뢰도가 낮습니다.")

    # --- baseLap ---
    # 모델의 baseLap 은 "모든 보정항이 0 일 때의 랩타임" 이다.
    # 실측 최속랩은 저연료·신품 타이어·트랙 진화 완료 상태이므로 여기에 가깝다.
    base_measured = median([r["fastest"] for r in pool])
    # 우리 모델은 최속 시점에 연료 0, 진화 -0.8, 컴파운드 소프트 -0.55, 팀/드라이버 약 -0.12 를 더한다
    base_suggest = base_measured + 0.8 + 0.55 + 0.12

    lane_measured = median([r["lane_duration"] for r in pool if r["lane_duration"]])
    stop_measured = median([r["stop_duration"] for r in pool if r["stop_duration"]])
    laps_measured = max(r["total_laps"] for r in runs)
    win_times = [r["winner_time"] for r in pool if r["winner_time"]]

    print("\n  ── 서킷 파라미터 (이 서킷에만 적용) ─────────────────────")
    row("baseLap", cur.get("baseLap"), base_suggest,
        f"실측 최속랩 {base_measured:.3f} + 모델 보정 1.47")
    row("laps", cur.get("laps"), laps_measured, "실측 랩 수")
    tl = [r["true_pit_loss"] for r in pool if r["true_pit_loss"]]
    if tl:
        tl_med = median(tl)
        n_tl = sum(r["true_pit_n"] for r in pool)
        row("pitLoss", cur.get("pitLoss"), tl_med,
            f"(인랩+아웃랩) - 2x정상랩, n={n_tl}")
        print(f"    참고: lane_duration {fmt(lane_measured)}초는 피트레인 통과 시간이며")
        print(f"          코스 주행분을 빼기 전 값입니다. pitLoss 로 쓰면 안 됩니다.")

    if win_times:
        wt = median(win_times)
        print(f"\n  ── 검증 기준 ────────────────────────────────────────────")
        print(f"    실제 우승 기록 (중앙값)   {int(wt//3600)}:{int(wt%3600//60):02d}:{int(wt%60):02d}  ({wt:.0f}초)")
        print(f"    → 시뮬레이터 총시간이 이 값의 ±3% 안에 들어와야 합니다.")

    # --- 마모 ---
    print()
    print("  ── 컴파운드 마모 (전역 파라미터 — 다른 서킷에도 영향) ────")
    wet_runs = [r for r in runs if r["rain"]]
    if wet_runs:
        print(f"    젖은 레이스 {len(wet_runs)}회는 제외했습니다. "
              f"노면이 마르면서 랩타임이 급락해 마모 추정이 오염됩니다.")
    if not dry:
        print("    ⚠ 건조 레이스가 없어 마모를 추정할 수 없습니다.")
        print()
        return

    print("    다중회귀  lapTime ~ a + b1·절대랩 + b2·타이어나이")
    print("    b1 = 연료 + 트랙 진화 (음수여야 정상), b2 = 순수 마모 (양수여야 정상)")
    print()
    print(f"    {'컴파운드':<15}{'현재 유효값':<13}{'b2 실측':<12}{'b1(연료+진화)':<15}{'표본'}")

    all_deg, all_fuel, all_n = defaultdict(list), defaultdict(list), defaultdict(int)
    for r in dry:
        for c, v in r["deg"].items():
            all_deg[c].append(v)
            all_fuel[c].append(r["fuel_coef"][c])
            all_n[c] += r["deg_n"][c]

    dm = cur.get("degMultiplier", 1.0)
    suggestions = {}
    for comp in ["SOFT", "MEDIUM", "HARD", "INTERMEDIATE", "WET"]:
        if comp not in all_deg:
            continue
        b2 = median(all_deg[comp])
        b1 = median(all_fuel[comp])
        cur_w = CURRENT_WEAR.get(comp)
        eff = cur_w * dm if cur_w else None
        flag = "" if b2 > 0 else "  <- 음수. 표본 부족"
        print(f"    {comp:<15}{fmt(eff,4):<13}{b2:+.4f}     {b1:+.4f}        n={all_n[comp]}{flag}")
        if b2 > 0:
            suggestions[comp] = b2 / dm

    if suggestions:
        print()
        print(f"    -> TYRE[*].wear 제안값 (degMultiplier {dm} 로 나눈 원값):")
        for c, v in suggestions.items():
            print(f"       {c:<15}{fmt(CURRENT_WEAR.get(c),4)}  ->  {v:.4f}")

    fuel_all = [v for vs in all_fuel.values() for v in vs]
    if fuel_all:
        fm = median(fuel_all)
        print()
        print(f"    -> 연료+진화 합산 실측 {fm:+.4f}초/랩 "
              f"(현재 모델: 연료 -{cur.get('fuelPerLap', 0):.4f} + 트랙진화 별도항)")

    print("\n  ※ 자동 반영하지 않습니다. 숫자를 확인하고 직접 넣으세요:")
    print("     src/data/circuits.js  — baseLap, pitLoss, laps")
    print("     src/engine/params.js  — TYRE[*].wear")
    print()


def row(name, cur, new, note=""):
    if cur is None:
        print(f"    {name:<14}{'?':<12}→  {new:<12.3f}  {note}")
        return
    diff = new - cur
    mark = "  " if abs(diff) < 0.05 * max(abs(cur), 1) else "★"
    print(f"  {mark} {name:<14}{cur:<12.3f}→  {new:<12.3f}({diff:+.2f})  {note}")


def fmt(v, nd=3):
    return "—" if v is None else f"{v:.{nd}f}"


def main():
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass
    ap = argparse.ArgumentParser()
    ap.add_argument("--circuit", default="Silverstone", help="OpenF1 circuit_short_name")
    ap.add_argument("--years", nargs="*", type=int, default=[2023, 2024, 2025],
                    help="OpenF1 은 2023년부터만 제공")
    args = ap.parse_args()

    print(f"OpenF1 조회 중… ({args.circuit}, {args.years})")
    sessions = race_sessions(args.circuit, args.years)
    if not sessions:
        print(f"'{args.circuit}' 레이스 세션을 찾지 못했습니다. "
              f"circuit_short_name 을 확인하세요.")
        return 1

    runs = []
    for s in sessions:
        r = analyse(s)
        if r:
            runs.append(r)

    if not runs:
        print("분석 가능한 데이터가 없습니다.")
        return 1

    report(args.circuit, runs)
    return 0


if __name__ == "__main__":
    sys.exit(main())
