#!/usr/bin/env python3
"""OpenF1 에서 이미 끝난 그랑프리 한 경기를 통째로 받아 재현용 JSON 으로 저장한다.

analyze 용 CSV(tools/collect.py)와 목적이 다르다. 이쪽은 "그 경기가 실제로 어떻게
흘러갔는지"를 화면에서 그대로 재생하기 위한 데이터다. 드라이버마다 실제 스틴트,
실제 랩타임, 실제 피트스톱을 담고, 세이프티카·VSC·레드플래그 구간을 랩 번호로 붙인다.

    python tools/collect_races.py --year 2026            # 끝난 경기 전부
    python tools/collect_races.py --year 2026 --circuit Monza
    python tools/collect_races.py --list                 # 받을 수 있는 경기만 출력

출력: data/races/{year}-{circuitId}.json 과 data/races/index.json
"""

import argparse
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import defaultdict
from datetime import datetime, timezone

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

BASE = "https://api.openf1.org/v1"
RATE_SLEEP = 0.45          # 무료 티어 3req/s (--slow 로 늦출 수 있다)
OUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data", "races")

# OpenF1 circuit_short_name → src/data/circuits.js 의 id
CIRCUIT_ID = {
    "Melbourne": "australia", "Shanghai": "china", "Suzuka": "japan", "Sakhir": "bahrain",
    "Jeddah": "saudi", "Miami": "miami", "Montreal": "canada", "Monte Carlo": "monaco",
    "Catalunya": "barcelona", "Spielberg": "austria", "Silverstone": "britain",
    "Spa-Francorchamps": "belgium", "Hungaroring": "hungary", "Zandvoort": "netherlands",
    "Monza": "italy", "Madring": "spain", "Baku": "azerbaijan", "Singapore": "singapore",
    "Austin": "usa", "Mexico City": "mexico", "Interlagos": "brazil",
    "Las Vegas": "lasvegas", "Lusail": "qatar", "Yas Marina Circuit": "abudhabi",
}

# 로그에 남길 가치가 없는 관제 메시지 — 트랙 리밋·블루플래그 등은 수백 건이라 전부 버린다
NOISE = (
    "TRACK LIMITS", "BLUE FLAG", "WAVED", "LAP DELETED", "TIME", "REINSTATED",
    "PIT EXIT", "OVERTAKE", "RISK OF RAIN", "ALL PASS HOLDERS", "MARSHALS",
    "TRACK SURFACE", "CLEAR IN TRACK", "YELLOW IN TRACK", "GREEN LIGHT",
    "PRACTICE START", "SLIPPERY", "BLACK AND WHITE",
)


def get(path, **params):
    q = urllib.parse.urlencode(params)
    url = f"{BASE}/{path}?{q}" if q else f"{BASE}/{path}"
    for attempt in range(4):
        try:
            with urllib.request.urlopen(url, timeout=60) as r:
                time.sleep(RATE_SLEEP)
                return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return []
            if e.code in (429, 500, 502, 503) and attempt < 3:
                time.sleep(2 + attempt * 2)
                continue
            raise
        except Exception:
            if attempt < 3:
                time.sleep(2 + attempt * 2)
                continue
            raise
    return []


def finished_races(year):
    """이미 끝난 레이스 세션만. 미래 경기는 데이터가 없다."""
    now = datetime.now(timezone.utc)
    out = []
    for s in get("sessions", year=year, session_name="Race"):
        cid = CIRCUIT_ID.get(s.get("circuit_short_name"))
        if not cid:
            continue
        end = s.get("date_end") or s.get("date_start")
        if not end:
            continue
        if datetime.fromisoformat(end.replace("Z", "+00:00")) > now:
            continue
        out.append((s, cid))
    return out


CAR_RE = re.compile(r"CARS?\s+(\d+)\s*\(([A-Z]{3})\)(?:\s+AND\s+(\d+)\s*\(([A-Z]{3})\))?")
TURN_RE = re.compile(r"TURN\s+(\d+)")


def incident_ko(text):
    """관제 영문 메시지를 짧은 한국어로. 형식이 안 맞으면 None 을 돌려 버린다."""
    up = text.upper()
    cars = CAR_RE.search(up)
    if not cars:
        return None
    turn = TURN_RE.search(up)
    where = f"{turn.group(1)}번 코너 " if turn else ""
    a_num, a_code, b_num, b_code = cars.groups()
    who = f"{a_code} {a_num}번" + (f"·{b_code} {b_num}번" if b_code else "")
    if "UNDER INVESTIGATION" in up:
        return f"{where}{who} 조사 진행"
    if "NO FURTHER" in up:
        return f"{where}{who} 추가 조치 없음"
    if "PENALTY" in up:
        sec = re.search(r"(\d+)\s*SECOND", up)
        return f"{who} {sec.group(1)}초 페널티" if sec else f"{who} 페널티"
    if "RETIRE" in up or "STOPPED" in up:
        return f"{who} 리타이어"
    return f"{where}{who} 사건 접수"


def control_events(session_key):
    """관제 메시지 → 랩 번호가 붙은 사건 목록 + SC/VSC/레드플래그 구간."""
    msgs = get("race_control", session_key=session_key)
    events, bands = [], []
    open_band = None

    def close(lap):
        nonlocal open_band
        if open_band:
            open_band["to"] = max(open_band["from"], lap)
            bands.append(open_band)
            open_band = None

    def open_(kind, lap):
        nonlocal open_band
        close(lap)
        open_band = {"type": kind, "from": lap}

    for m in sorted(msgs, key=lambda x: x.get("date") or ""):
        lap = m.get("lap_number")
        text = (m.get("message") or "").strip()
        up = text.upper()
        if lap is None or not text:
            continue

        if m.get("category") == "SafetyCar":
            if "VSC DEPLOYED" in up:
                open_("vsc", lap)
                events.append({"lap": lap, "type": "vsc", "ko": "버추얼 세이프티카 발령"})
            elif "VSC ENDING" in up or "VIRTUAL SAFETY CAR ENDING" in up:
                close(lap)
                events.append({"lap": lap, "type": "clear", "ko": "버추얼 세이프티카 해제"})
            elif "SAFETY CAR DEPLOYED" in up:
                open_("sc", lap)
                events.append({"lap": lap, "type": "sc", "ko": "세이프티카 출동"})
            elif "SAFETY CAR IN THIS LAP" in up:
                close(lap + 1)
                events.append({"lap": lap, "type": "clear", "ko": "세이프티카 이번 랩 복귀"})
            continue

        # ⚠ "CHEQUERED FLAG" 안에 "RED FLAG" 가 통째로 들어 있다. 단어 경계를 봐야 한다.
        if "CHEQUERED" in up:
            close(lap)
            events.append({"lap": lap, "type": "finish", "ko": "체커기"})
        elif "RED FLAG" in up:
            open_("red", lap)
            events.append({"lap": lap, "type": "red", "ko": "적기 — 레이스 중단"})
        elif "SESSION STARTED" in up and lap > 1:
            close(lap)
            events.append({"lap": lap, "type": "restart", "ko": "레이스 재개"})
        elif "STANDING START" in up:
            events.append({"lap": lap, "type": "restart", "ko": "정지 출발로 재개"})
        elif any(n in up for n in NOISE):
            continue
        elif "INCIDENT INVOLVING" in up or "RETIRE" in up or "STOPPED ON TRACK" in up:
            ko = incident_ko(text)
            if ko:
                events.append({"lap": lap, "type": "incident", "ko": ko, "text": text})

    close(10 ** 6)
    seen, uniq = set(), []
    for e in sorted(events, key=lambda x: (x["lap"], x["type"])):
        k = (e["lap"], e["type"], e["ko"])
        if k in seen:
            continue
        seen.add(k)
        uniq.append(e)
    return uniq, [b for b in bands if b.get("to") and b["to"] < 10 ** 6]


def collect(session, circuit_id, verbose=True):
    sk = session["session_key"]
    meeting = (get("meetings", meeting_key=session["meeting_key"]) or [{}])[0]
    drivers = get("drivers", session_key=sk)
    results = get("session_result", session_key=sk)
    stints = get("stints", session_key=sk)
    pits = get("pit", session_key=sk)
    laps = get("laps", session_key=sk)
    weather = get("weather", session_key=sk)
    events, bands = control_events(sk)

    by_num = {}
    for d in drivers:
        by_num[d["driver_number"]] = {
            "num": d["driver_number"],
            "code": d.get("name_acronym"),
            "name": d.get("full_name") or d.get("broadcast_name"),
            "team": d.get("team_name"),
            "colour": d.get("team_colour"),
            "stints": [], "pits": [], "lapTimes": {},
        }

    for s in stints:
        d = by_num.get(s["driver_number"])
        if not d or not s.get("compound") or s.get("lap_start") is None:
            continue
        d["stints"].append({
            "compound": s["compound"], "from": s["lap_start"],
            "to": s.get("lap_end") or s["lap_start"], "age": s.get("tyre_age_at_start") or 0,
        })

    for p in pits:
        d = by_num.get(p["driver_number"])
        if not d or p.get("lap_number") is None:
            continue
        d["pits"].append({"lap": p["lap_number"], "lane": round(p.get("pit_duration") or 0, 1)})

    total_laps = 0
    for l in laps:
        d = by_num.get(l["driver_number"])
        if not d:
            continue
        n = l.get("lap_number")
        total_laps = max(total_laps, n or 0)
        if n and l.get("lap_duration"):
            d["lapTimes"][n] = round(l["lap_duration"], 3)

    for r in results:
        d = by_num.get(r["driver_number"])
        if not d:
            continue
        d["pos"] = r.get("position")
        d["laps"] = r.get("number_of_laps")
        d["dnf"] = bool(r.get("dnf") or r.get("dns") or r.get("dsq"))
        d["gap"] = r.get("gap_to_leader")
        d["total"] = r.get("duration") if isinstance(r.get("duration"), (int, float)) else None

    # 랩타임 딕셔너리 → 1번 랩부터의 배열 (없는 랩은 null)
    out_drivers = []
    for d in by_num.values():
        d["stints"].sort(key=lambda s: s["from"])
        d["pits"].sort(key=lambda p: p["lap"])
        d["lapTimes"] = [d["lapTimes"].get(i) for i in range(1, total_laps + 1)]
        if d.get("pos") is None and not any(t for t in d["lapTimes"]):
            continue                      # 출전하지 않은 번호
        out_drivers.append(d)
    out_drivers.sort(key=lambda d: (d.get("pos") is None, d.get("pos") or 99))

    temps = [w["track_temperature"] for w in weather if w.get("track_temperature") is not None]
    airs = [w["air_temperature"] for w in weather if w.get("air_temperature") is not None]
    rain = any(w.get("rainfall") for w in weather)

    race = {
        "key": f"{session['year']}-{circuit_id}",
        "sessionKey": sk,
        "year": session["year"],
        "circuitId": circuit_id,
        "officialName": meeting.get("meeting_official_name") or meeting.get("meeting_name"),
        "meetingName": meeting.get("meeting_name"),
        "country": meeting.get("country_name"),
        "location": meeting.get("location"),
        "date": (session.get("date_start") or "")[:10],
        "totalLaps": total_laps,
        "weather": {
            "trackTemp": round(sum(temps) / len(temps), 1) if temps else None,
            "airTemp": round(sum(airs) / len(airs), 1) if airs else None,
            "rain": rain,
        },
        "events": events,
        "bands": bands,
        "drivers": out_drivers,
        "source": "OpenF1 api.openf1.org",
        "collected": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
    }
    if verbose:
        print(f"  {race['key']:16} {total_laps}랩 · 드라이버 {len(out_drivers)} · 사건 {len(events)} · 구간 {len(bands)}")
    return race


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--year", type=int, default=2026)
    ap.add_argument("--circuit", help="OpenF1 circuit_short_name (예: Monza)")
    ap.add_argument("--list", action="store_true", help="받을 수 있는 경기만 출력")
    ap.add_argument("--slow", type=float, help="요청 간 대기 시간(초). 429 가 나면 1.5 정도로")
    a = ap.parse_args()
    if a.slow:
        globals()["RATE_SLEEP"] = a.slow

    races = finished_races(a.year)
    if a.circuit:
        races = [r for r in races if r[0]["circuit_short_name"] == a.circuit]
    if a.list:
        for s, cid in races:
            print(f"{s['session_key']:6} {cid:12} {s['circuit_short_name']:20} {s['date_start'][:10]}")
        return

    os.makedirs(OUT_DIR, exist_ok=True)
    index = []
    for s, cid in races:
        print(f"{s['circuit_short_name']} ({s['date_start'][:10]}) …")
        try:
            race = collect(s, cid)
        except Exception as e:                                    # noqa
            print(f"  실패: {e}")
            continue
        if race["totalLaps"] < 5 or len(race["drivers"]) < 5:
            print("  skip: not enough lap/driver data")
            continue
        path = os.path.join(OUT_DIR, race["key"] + ".json")
        with open(path, "w", encoding="utf-8") as f:
            json.dump(race, f, ensure_ascii=False, separators=(",", ":"))
        winner = race["drivers"][0] if race["drivers"] else {}
        index.append({
            "key": race["key"], "year": race["year"], "circuitId": cid,
            "officialName": race["officialName"], "country": race["country"],
            "location": race["location"], "date": race["date"],
            "totalLaps": race["totalLaps"],
            "winner": winner.get("name"), "winnerCode": winner.get("code"),
            "bands": race["bands"],
            "sizeKb": round(os.path.getsize(path) / 1024, 1),
        })

    # 기존 인덱스와 합친다 (연도별로 따로 돌려도 유지되도록)
    idx_path = os.path.join(OUT_DIR, "index.json")
    old = []
    if os.path.exists(idx_path):
        try:
            old = json.load(open(idx_path, encoding="utf-8"))
        except Exception:                                          # noqa
            old = []
    merged = {r["key"]: r for r in old}
    merged.update({r["key"]: r for r in index})
    rows = sorted(merged.values(), key=lambda r: (r["year"], r["date"]))
    with open(idx_path, "w", encoding="utf-8") as f:
        json.dump(rows, f, ensure_ascii=False, indent=1)
    total = sum(r["sizeKb"] for r in rows if "sizeKb" in r)
    print(f"\n{len(rows)}개 경기 → {OUT_DIR}  (합계 {total:.0f} KB)")


if __name__ == "__main__":
    main()
