#!/usr/bin/env python3
"""OpenF1 에서 레이스 데이터를 모아 분석용 데이터셋(CSV)으로 저장한다.

랩 하나가 한 행이 되고, 거기에 스틴트(컴파운드·타이어 나이)와 날씨를 붙인다.
이 조인이 곧 데이터 전처리의 핵심이다 — 원본은 세 군데에 흩어져 있다.

    /laps     랩타임, 섹터, 아웃랩 여부      (랩 단위)
    /stints   컴파운드, 타이어 나이           (스틴트 단위 → 랩으로 펼쳐야 함)
    /weather  노면·기온·강수                 (1분 간격 → 랩 시각에 맞춰 붙여야 함)

사용법:
    python tools/collect.py                          # 기본 서킷 묶음
    python tools/collect.py --circuit Silverstone
    python tools/collect.py --all --years 2023 2024 2025
    python tools/collect.py --out data/laps.csv

출력 CSV 컬럼은 아래 FIELDS 참고.
"""

import argparse
import csv
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from bisect import bisect_left
from collections import defaultdict
from datetime import datetime

BASE = "https://api.openf1.org/v1"
RATE_SLEEP = 0.45   # 무료 티어 3req/s

DEFAULT_CIRCUITS = [
    "Silverstone", "Monza", "Monaco", "Spa-Francorchamps",
    "Catalunya", "Hungaroring", "Zandvoort", "Suzuka",
]

FIELDS = [
    "year", "circuit", "session_key", "driver_number", "driver", "team",
    "lap_number", "lap_duration",
    "sector1", "sector2", "sector3",
    "compound", "tyre_age", "stint_number", "stint_lap",
    "is_pit_out", "is_pit_in",
    "track_temp", "air_temp", "humidity", "rainfall", "wind_speed",
]

_last = [0.0]


def get(endpoint, **params):
    wait = RATE_SLEEP - (time.time() - _last[0])
    if wait > 0:
        time.sleep(wait)
    url = f"{BASE}/{endpoint}"
    if params:
        url += "?" + urllib.parse.urlencode(params)
    _last[0] = time.time()
    for attempt in range(4):
        try:
            with urllib.request.urlopen(url, timeout=60) as r:
                return json.loads(r.read().decode())
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return []
            if e.code == 429:
                time.sleep(2 + attempt)
                continue
            raise
        except Exception:
            if attempt == 3:
                raise
            time.sleep(1 + attempt)
    return []


def parse_ts(s):
    if not s:
        return None
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00")).timestamp()
    except ValueError:
        return None


def collect_session(session):
    """한 세션 → 랩 단위 행 목록"""
    key = session["session_key"]
    laps = get("laps", session_key=key)
    if not laps:
        return []
    stints = get("stints", session_key=key)
    weather = get("weather", session_key=key)
    drivers = get("drivers", session_key=key)

    # --- 드라이버 메타 ---
    dmeta = {}
    for d in drivers:
        dmeta[d["driver_number"]] = (d.get("name_acronym") or "", d.get("team_name") or "")

    # --- 스틴트를 랩 단위로 펼치기 ---
    # 스틴트는 (시작랩, 끝랩) 구간이라 랩 하나하나에 매핑해줘야 조인이 된다.
    stint_of = defaultdict(dict)   # driver -> lap -> (compound, tyre_age, stint_no, stint_lap)
    for st in stints:
        s0, s1 = st.get("lap_start"), st.get("lap_end")
        if s0 is None or s1 is None:
            continue
        age0 = st.get("tyre_age_at_start") or 0
        for lap in range(s0, s1 + 1):
            stint_of[st["driver_number"]][lap] = (
                st.get("compound"), age0 + (lap - s0) + 1,
                st.get("stint_number"), lap - s0 + 1,
            )

    # --- 날씨를 시각 기준으로 붙이기 ---
    # 1분 간격이라 랩 시작 시각에 가장 가까운 관측을 찾아 쓴다.
    wsorted = sorted(
        [(parse_ts(w.get("date")), w) for w in weather if parse_ts(w.get("date"))],
        key=lambda x: x[0])
    wtimes = [t for t, _ in wsorted]

    def weather_at(ts):
        if not wsorted or ts is None:
            return {}
        i = bisect_left(wtimes, ts)
        cands = [x for x in (i - 1, i) if 0 <= x < len(wsorted)]
        if not cands:
            return {}
        best = min(cands, key=lambda j: abs(wtimes[j] - ts))
        return wsorted[best][1]

    # --- 인랩(피트인한 랩) 표시 ---
    pit_laps = defaultdict(set)
    for p in get("pit", session_key=key):
        if p.get("lap_number") is not None:
            pit_laps[p["driver_number"]].add(p["lap_number"])

    rows = []
    for l in laps:
        drv = l.get("driver_number")
        lap_n = l.get("lap_number")
        if drv is None or lap_n is None:
            continue
        st = stint_of.get(drv, {}).get(lap_n, (None, None, None, None))
        w = weather_at(parse_ts(l.get("date_start")))
        acr, team = dmeta.get(drv, ("", ""))
        rows.append({
            "year": session.get("year"),
            "circuit": session.get("circuit_short_name"),
            "session_key": key,
            "driver_number": drv,
            "driver": acr,
            "team": team,
            "lap_number": lap_n,
            "lap_duration": l.get("lap_duration"),
            "sector1": l.get("duration_sector_1"),
            "sector2": l.get("duration_sector_2"),
            "sector3": l.get("duration_sector_3"),
            "compound": st[0],
            "tyre_age": st[1],
            "stint_number": st[2],
            "stint_lap": st[3],
            "is_pit_out": 1 if l.get("is_pit_out_lap") else 0,
            "is_pit_in": 1 if lap_n in pit_laps.get(drv, ()) else 0,
            "track_temp": w.get("track_temperature"),
            "air_temp": w.get("air_temperature"),
            "humidity": w.get("humidity"),
            "rainfall": w.get("rainfall"),
            "wind_speed": w.get("wind_speed"),
        })
    return rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--circuit", action="append", help="반복 지정 가능")
    ap.add_argument("--all", action="store_true", help="해당 연도의 모든 레이스")
    ap.add_argument("--years", nargs="*", type=int, default=[2023, 2024, 2025])
    ap.add_argument("--out", default="data/laps.csv")
    args = ap.parse_args()

    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

    # --- 대상 세션 목록 ---
    sessions = []
    if args.all:
        for y in args.years:
            sessions += get("sessions", year=y, session_name="Race")
    else:
        circuits = args.circuit or DEFAULT_CIRCUITS
        for y in args.years:
            for c in circuits:
                sessions += get("sessions", year=y, circuit_short_name=c, session_name="Race")

    sessions = [s for s in sessions if not s.get("is_cancelled")]
    sessions.sort(key=lambda s: s.get("date_start") or "")
    if not sessions:
        print("대상 세션이 없습니다.")
        return 1

    print(f"세션 {len(sessions)}개 수집 시작 "
          f"(레이트 리밋 때문에 세션당 5~6초 걸립니다)\n")

    all_rows = []
    for i, s in enumerate(sessions, 1):
        label = f"{s.get('year')} {s.get('circuit_short_name')}"
        try:
            rows = collect_session(s)
        except Exception as e:
            print(f"  [{i}/{len(sessions)}] {label:<28} 실패: {e}")
            continue
        all_rows += rows
        print(f"  [{i}/{len(sessions)}] {label:<28} {len(rows):>5}랩")

    if not all_rows:
        print("\n수집된 데이터가 없습니다.")
        return 1

    out = args.out
    os.makedirs(os.path.dirname(out) or ".", exist_ok=True)
    with open(out, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=FIELDS)
        w.writeheader()
        w.writerows(all_rows)

    size_kb = os.path.getsize(out) / 1024
    print(f"\n저장 완료: {out}  ({len(all_rows):,}행, {size_kb:.0f} KB)")
    summarise(all_rows)
    return 0


def summarise(rows):
    print("\n" + "=" * 60)
    print("  수집 요약")
    print("=" * 60)

    by_circuit = defaultdict(int)
    by_compound = defaultdict(int)
    wet = 0
    missing_compound = 0
    usable = 0
    for r in rows:
        by_circuit[f"{r['year']} {r['circuit']}"] += 1
        if r["compound"]:
            by_compound[r["compound"]] += 1
        else:
            missing_compound += 1
        if (r.get("rainfall") or 0):
            wet += 1
        if r["lap_duration"] and r["compound"] and not r["is_pit_out"]:
            usable += 1

    print(f"\n  전체 {len(rows):,}행")
    print(f"  분석 가능 {usable:,}행 "
          f"(랩타임·컴파운드 있고 아웃랩 아님, {usable/len(rows)*100:.0f}%)")
    print(f"  컴파운드 결측 {missing_compound:,}행")
    print(f"  강우 구간 {wet:,}행 ({wet/len(rows)*100:.0f}%)")

    print("\n  컴파운드 분포")
    for c, n in sorted(by_compound.items(), key=lambda x: -x[1]):
        print(f"    {c:<16}{n:>7,}")

    print("\n  세션별")
    for k, n in sorted(by_circuit.items()):
        print(f"    {k:<28}{n:>6,}")
    print()


if __name__ == "__main__":
    sys.exit(main())
