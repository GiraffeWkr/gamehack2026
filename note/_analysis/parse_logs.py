#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Zad Archery — SkillsLog.txt / Logs.txt parser.
Outputs CSVs into the same folder as this script.

Input row format (11 numeric columns):
  NAME  CASTS  /min  HITS  DAMAGE  SHARE  DMG/s  D/s  DMG/CAST  DMG/HIT  CRIT  OVERKILL
NAME may contain spaces ("Wolf (pet)") and may be truncated to 20 chars + '.'.
Numbers may carry K / M / B suffixes. "-" means N/A.
"""
import re, os, csv, json, math

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SKILLS = os.path.join(ROOT, "SkillsLog.txt")
LOGS = os.path.join(ROOT, "Logs.txt")

NCOLS = 11  # numeric columns at end of a data row

NUM_RE = re.compile(r"^([\d.]+)([KMB]?)$")
HDR_RE = re.compile(
    r"\[SKILL DAMAGE\]\s+Lv\.(\d+)\s+(COMPLETED|INCOMPLETE)\s*\|\s*"
    r"(?:(\d+)m\s*)?(\d+)s game\s*\|\s*total\s+([\d.]+)([KMB]?)\s*\(([\d.]+)([KMB]?)/s\)\s*\|\s*"
    r"player Damage\s+(\d+)"
)
SESSION_RE = re.compile(r"Session started\s+([\d\-]+\s[\d:]+)\s*\|\s*Seed:\s*(\d+)\s*\|\s*Version:\s*([\d.]+)")
ARROWFALL_TOTAL_RE = re.compile(r"-- arrow fall \(mouse\):\s*([\d.]+)([KMB]?)\s*total,\s*([\d.]+)%")
BUFF_RE = re.compile(r"buffs cast:\s*(.+?)\s*$")
BUFF_ITEM_RE = re.compile(r"(\w+)\s+x(\d+)\s*\(([\d.]+)/min\)")
NODMG_RE = re.compile(r"NO DAMAGE this level:\s*(.+)$")
SPLIT_RE = re.compile(r"-- source split --")
SPLIT_ITEM_RE = re.compile(r"([\w]+):\s*([\d.]+)([KMB]?)\s*\(([\d.]+)%\)")

MULT = {"": 1.0, "K": 1e3, "M": 1e6, "B": 1e9}


def num(tok):
    """'14.49K' -> 14490.0 ; '-' or '' -> None"""
    if tok is None:
        return None
    tok = tok.strip()
    if tok in ("-", "", "N/A"):
        return None
    m = NUM_RE.match(tok)
    if not m:
        return None
    return float(m.group(1)) * MULT[m.group(2)]


def pct(tok):
    if not tok or tok.strip() in ("-", ""):
        return None
    return float(tok.rstrip("%"))


def parse_row(line):
    """Return dict for a skill/non-skill data row, or None."""
    toks = line.split()
    if len(toks) < NCOLS + 1:
        return None
    nums = toks[-NCOLS:]
    name = " ".join(toks[:-NCOLS]).strip()
    if not name:
        return None
    # sanity: the CASTS column must be an integer, HITS too (or '-')
    if not re.match(r"^\d+$", nums[0]):
        return None
    return {
        "name": name,
        "casts": int(nums[0]),
        "casts_per_min": float(nums[1]),
        "hits": int(nums[2]) if nums[2].isdigit() else None,
        "damage": num(nums[3]),
        "share_pct": pct(nums[4]),
        "dmg_per_s": num(nums[5]),
        "d_per_s": float(nums[6]),
        "dmg_per_cast": num(nums[7]),
        "dmg_per_hit": num(nums[8]),
        "crit_pct": pct(nums[9]),
        "overkill_pct": pct(nums[10]),
    }


def parse_skills_log():
    attempts = []          # one dict per level block
    rows = []              # long-format row table
    sessions = []          # session records
    buffers = []           # buff cast records
    nodmg = []             # NO DAMAGE records
    source_splits = []     # ArrowFall source split records

    session_idx = -1
    cur = None
    section = None

    for raw in open(SKILLS, encoding="utf-8", errors="replace").read().split("\n"):
        line = raw.rstrip("\r")

        ms = SESSION_RE.search(line)
        if ms:
            session_idx += 1
            sessions.append({
                "session_idx": session_idx,
                "started": ms.group(1).strip(),
                "seed": ms.group(2),
                "version": ms.group(3),
                "attempts": 0,
                "levels": [],
                "game_seconds": 0.0,
            })
            cur = None
            section = None
            continue

        mh = HDR_RE.search(line)
        if mh:
            mins = int(mh.group(3) or 0)
            secs = int(mh.group(4))
            cur = {
                "attempt_idx": len(attempts),
                "session_idx": session_idx,
                "level": int(mh.group(1)),
                "status": mh.group(2),
                "time_min": mins,
                "time_s": mins * 60 + secs,
                "total_damage": num(mh.group(5) + mh.group(6)),
                "dps": num(mh.group(7) + mh.group(8)),
                "player_damage": float(mh.group(9)),
                "arrowfall_total": None,
                "arrowfall_share": None,
                "rapidfire_casts": None,
                "rapidfire_per_min": None,
            }
            attempts.append(cur)
            if session_idx >= 0:
                sessions[session_idx]["attempts"] += 1
                sessions[session_idx]["levels"].append(cur["level"])
                sessions[session_idx]["game_seconds"] += cur["time_s"]
            section = "skill"
            continue

        if cur is None:
            continue

        # --- section markers ---
        ma = ARROWFALL_TOTAL_RE.search(line)
        if ma:
            cur["arrowfall_total"] = num(ma.group(1) + ma.group(2))
            cur["arrowfall_share"] = float(ma.group(3))
            section = "arrowfall"
            continue
        if line.strip() == "-- non-skill sources --":
            section = "nonskill"
            continue
        if SPLIT_RE.search(line):
            section = "split"
            continue

        mn = NODMG_RE.search(line)
        if mn:
            # "Bear (5 casts, 0 dmg)" -> the comma is inside parens, don't split on it
            parts, depth, buf = [], 0, ""
            for ch in mn.group(1):
                if ch == "(":
                    depth += 1
                elif ch == ")":
                    depth -= 1
                if ch == "," and depth == 0:
                    parts.append(buf); buf = ""
                else:
                    buf += ch
            parts.append(buf)
            for nm in parts:
                nm = nm.strip()
                if nm:
                    nodmg.append({"attempt_idx": cur["attempt_idx"], "level": cur["level"],
                                  "name": nm, "detail": mn.group(1).strip()})
            continue

        mb = BUFF_RE.search(line)
        if mb and "buffs cast:" in line:
            for nm, cnt, pm in BUFF_ITEM_RE.findall(mb.group(1)):
                buffers.append({"attempt_idx": cur["attempt_idx"], "level": cur["level"],
                                "buff": nm, "casts": int(cnt), "per_min": float(pm)})
                if nm == "RapidFire":
                    cur["rapidfire_casts"] = int(cnt)
                    cur["rapidfire_per_min"] = float(pm)
            continue

        if section == "split" and ":" in line:
            # "ArrowFall: Archer_Normal_Mouse 1419 (2.1%) | Archer_Elementalist_Explosive_Mouse 64.96K (97.9%)"
            owner, _, rest = line.strip().partition(":")
            for nm, v, suf, sh in re.findall(r"([\w]+)\s+([\d.]+)([KMB]?)\s*\(([\d.]+)%\)", rest):
                source_splits.append({"attempt_idx": cur["attempt_idx"], "level": cur["level"],
                                      "owner": owner.strip(), "name": nm,
                                      "damage": num(v + suf), "share_pct": float(sh)})
            section = "skillsplit_done"
            continue

        # --- data rows ---
        if not raw.startswith("      "):
            continue
        stripped = line.strip()
        if not stripped or stripped.startswith("~") or stripped.startswith("SKILL"):
            if not stripped.startswith("~"):
                continue
        indent = len(line) - len(line.lstrip(" "))
        is_sub = stripped.startswith("~")
        name_clean = stripped.lstrip("~").strip()
        r = parse_row(line)
        if not r:
            continue
        r["attempt_idx"] = cur["attempt_idx"]
        r["level"] = cur["level"]
        r["status"] = cur["status"]
        r["session_idx"] = session_idx
        r["section"] = "skill" if (section == "skill" and not is_sub) else (
            "arrowfall_sub" if is_sub else section)
        if is_sub:
            r["section"] = "arrowfall_sub"
        r["is_sub"] = is_sub
        r["indent"] = indent
        rows.append(r)

    return attempts, rows, sessions, buffers, nodmg, source_splits


LV_RE = re.compile(
    r"\[(COMPLETED|INCOMPLETE)\]\s+Lv\.(\d+)\s*\|\s*Time:\s*\[TOTAL\s+([^\]]+)\]\s*"
    r"([\dmsh ]+?) game\s*/\s*([\dmsh ]+?) real\s*\(([\d.]+)x\)\s*\|\s*"
    r"Played:\s*([\dmsh ]+?)\s*\|\s*Deaths:\s*(\d+)\s*\((\d+)\)\s*\|\s*"
    r"Killed:\s*(\d+)\s*\((\d+)\)\s*\|\s*Currencies:\s*(.*)$"
)
TOT_RE = re.compile(r"\[TOTAL\s+([^\]]+)\]")


def dur_to_s(t):
    t = t.strip()
    if t.startswith("["):
        t = t[1:-1]
    s = 0.0
    for v, u in re.findall(r"([\d.]+)\s*([hms])", t):
        s += float(v) * {"h": 3600, "m": 60, "s": 1}[u]
    return s


def parse_logs():
    out = []
    session_idx = -1
    for raw in open(LOGS, encoding="utf-8", errors="replace").read().split("\n"):
        line = raw.rstrip("\r")
        ms = SESSION_RE.search(line)
        if ms:
            session_idx += 1
            continue
        m = LV_RE.search(line)
        if not m:
            continue
        cur_str = m.group(12)   # group 11 is killed_total; the currency list is group 12
        currencies = {}
        for part in cur_str.split(","):
            part = part.strip()
            if not part:
                continue
            k, _, v = part.partition(":")
            k = k.strip(); v = v.strip()
            mm = re.match(r"^([\d.]+)([KMB]?)\s*\(([\d.]+)([KMB]?)\)$", v)
            if mm:
                currencies[k] = (num(mm.group(1) + mm.group(2)), num(mm.group(3) + mm.group(4)))
            else:
                currencies[k] = (num(v), None)
        out.append({
            "session_idx": session_idx,
            "status": m.group(1),
            "level": int(m.group(2)),
            "total_elapsed": m.group(3).strip(),
            "total_elapsed_s": dur_to_s(m.group(3)),
            "game_s": dur_to_s(m.group(4)),
            "real_s": dur_to_s(m.group(5)),
            "speed": float(m.group(6)),
            "played_s": dur_to_s(m.group(7)),
            "deaths_run": int(m.group(8)),
            "deaths_total": int(m.group(9)),
            "killed_run": int(m.group(10)),
            "killed_total": int(m.group(11)),
            "currencies": currencies,
        })
    return out


def write_csv(path, records, fields):
    with open(path, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=fields, extrasaction="ignore")
        w.writeheader()
        for r in records:
            w.writerow(r)


def main():
    attempts, rows, sessions, buffers, nodmg, splits = parse_skills_log()
    logattempts = parse_logs()

    # ---------- 1. attempts.csv ----------
    write_csv(os.path.join(HERE, "01_attempts.csv"), attempts, [
        "attempt_idx", "session_idx", "level", "status", "time_min", "time_s",
        "total_damage", "dps", "player_damage",
        "arrowfall_total", "arrowfall_share",
        "rapidfire_casts", "rapidfire_per_min",
    ])

    # ---------- 2. per-level aggregate ----------
    by_lv = {}
    for a in attempts:
        by_lv.setdefault(a["level"], []).append(a)
    best = []
    for lv in sorted(by_lv):
        lst = by_lv[lv]
        ok = [a for a in lst if a["status"] == "COMPLETED"]
        # representative = longest attempt (highest total damage) = the real "clear" attempt
        rep = max(lst, key=lambda a: a["total_damage"])
        best.append({
            "level": lv,
            "attempts": len(lst),
            "completed_attempts": len(ok),
            "cleared": bool(ok),
            "first_seen_status": lst[0]["status"],
            "rep_status": rep["status"],
            "rep_time_s": rep["time_s"],
            "rep_time": f"{rep['time_min']}m{rep['time_s']-rep['time_min']*60:02d}s",
            "rep_total_damage": rep["total_damage"],
            "rep_dps": rep["dps"],
            "rep_player_damage": rep["player_damage"],
            "min_total_damage": min(a["total_damage"] for a in lst),
            "max_total_damage": max(a["total_damage"] for a in lst),
            "sum_time_all_attempts_s": sum(a["time_s"] for a in lst),
        })
    write_csv(os.path.join(HERE, "02_level_summary.csv"), best, list(best[0].keys()))

    # ---------- 3. skill rows (long) ----------
    write_csv(os.path.join(HERE, "03_skill_rows.csv"), rows, [
        "attempt_idx", "session_idx", "level", "status", "section", "is_sub", "name",
        "casts", "casts_per_min", "hits", "damage", "share_pct",
        "dmg_per_s", "d_per_s", "dmg_per_cast", "dmg_per_hit",
        "crit_pct", "overkill_pct",
    ])

    # ---------- 4. skill unlock / usage pivot ----------
    top_skills = [r for r in rows if r["section"] in ("skill", "nonskill")]
    order, seen = [], set()
    for r in top_skills:
        if r["name"] not in seen:
            seen.add(r["name"]); order.append(r["name"])

    pivot = {}
    for r in top_skills:
        key = (r["level"], r["name"])
        d = pivot.setdefault(key, {"level": r["level"], "name": r["name"], "section": r["section"],
                                   "appearances": 0, "casts": 0, "damage": 0.0, "hits": 0,
                                   "share_pct": 0.0, "best_share": 0.0, "crit_pct": 0.0})
        d["appearances"] += 1
        d["casts"] += r["casts"] or 0
        d["damage"] += r["damage"] or 0
        d["hits"] += r["hits"] or 0
        d["share_pct"] += r["share_pct"] or 0
        d["best_share"] = max(d["best_share"], r["share_pct"] or 0)
        d["crit_pct"] = max(d["crit_pct"], r["crit_pct"] or 0)
    pv = sorted(pivot.values(), key=lambda d: (d["level"], order.index(d["name"]) if d["name"] in order else 99))
    write_csv(os.path.join(HERE, "04_skill_by_level.csv"), pv, [
        "level", "name", "section", "appearances", "casts", "hits", "damage",
        "share_pct", "best_share", "crit_pct"])

    # ---------- 5. unlock table (first level each skill appears as a top row) ----------
    unlock = []
    for nm in order:
        lvs = sorted({r["level"] for r in top_skills if r["name"] == nm})
        dmg_by_lv = {lv: sum(r["damage"] or 0 for r in top_skills if r["name"] == nm and r["level"] == lv) for lv in lvs}
        casts_by_lv = {lv: sum(r["casts"] or 0 for r in top_skills if r["name"] == nm and r["level"] == lv) for lv in lvs}
        sec = next(r["section"] for r in top_skills if r["name"] == nm)
        unlock.append({
            "name": nm, "section": sec,
            "first_level": lvs[0], "last_level": lvs[-1], "levels_present": len(lvs),
            "levels": ",".join(str(l) for l in lvs),
            "total_damage": sum(dmg_by_lv.values()),
            "total_casts": sum(casts_by_lv.values()),
        })
    unlock.sort(key=lambda d: (d["first_level"], -d["total_damage"]))
    write_csv(os.path.join(HERE, "05_unlock_table.csv"), unlock, list(unlock[0].keys()))

    # ---------- 6. buffs ----------
    write_csv(os.path.join(HERE, "06_buffs.csv"), buffers,
              ["attempt_idx", "level", "buff", "casts", "per_min"])

    # ---------- 7. NO DAMAGE ----------
    write_csv(os.path.join(HERE, "07_no_damage.csv"), nodmg,
              ["attempt_idx", "level", "name"])

    # ---------- 8. Logs.txt attempts (deaths / kills / currency) ----------
    for r in logattempts:
        r["currencies_flat"] = "; ".join(f"{k}={v[0]}" for k, v in r["currencies"].items())
    write_csv(os.path.join(HERE, "08_runs_deaths.csv"), logattempts, [
        "session_idx", "level", "status", "total_elapsed", "total_elapsed_s",
        "game_s", "real_s", "speed", "played_s",
        "deaths_run", "deaths_total", "killed_run", "killed_total", "currencies_flat"])

    # ---------- 9. sessions ----------
    for s in sessions:
        s["levels"] = ",".join(str(l) for l in s["levels"])
        s["game_min"] = round(s["game_seconds"] / 60.0, 2)
    write_csv(os.path.join(HERE, "09_sessions.csv"), sessions, [
        "session_idx", "started", "seed", "version", "attempts", "levels", "game_seconds", "game_min"])

    # ---------- 10. arrow fall source split ----------
    write_csv(os.path.join(HERE, "10_arrowfall_split.csv"), splits,
              ["attempt_idx", "level", "owner", "name", "damage", "share_pct"])

    # ---------- 11. growth curve ----------
    growth = []
    prev = None
    for b in best:
        lv = b["level"]
        # Lv.10 = 0-kill instant skip, Lv.18-28 missing (save-edited jump) -> break the chain
        chain = prev is not None and lv == prev["level"] + 1 and b["rep_time_s"] > 30
        g = dict(b)
        g["hp_ratio_vs_prev"] = (b["rep_total_damage"] / prev["rep_total_damage"]) if chain else None
        g["dps_ratio_vs_prev"] = (b["rep_dps"] / prev["rep_dps"]) if chain else None
        g["playerdmg_ratio_vs_prev"] = (b["rep_player_damage"] / prev["rep_player_damage"]) if (chain and prev["rep_player_damage"]) else None
        growth.append(g)
        prev = b
    write_csv(os.path.join(HERE, "11_growth.csv"), growth, [
        "level", "cleared", "rep_time_s", "rep_total_damage", "rep_dps", "rep_player_damage",
        "hp_ratio_vs_prev", "dps_ratio_vs_prev", "playerdmg_ratio_vs_prev",
    ])

    # geometric mean growth over the clean Lv.1->Lv.16 chain
    ratios = [g["hp_ratio_vs_prev"] for g in growth if g["hp_ratio_vs_prev"]]
    if ratios:
        gm = math.exp(sum(math.log(r) for r in ratios) / len(ratios))
        print(f"\nHP growth: {len(ratios)} clean steps Lv1->Lv16, geometric mean x{gm:.3f}/level "
              f"(samples: {', '.join(f'{r:.2f}' for r in ratios)})")
    ratios = [g["dps_ratio_vs_prev"] for g in growth if g["dps_ratio_vs_prev"]]
    if ratios:
        gm = math.exp(sum(math.log(r) for r in ratios) / len(ratios))
        print(f"DPS growth: geometric mean x{gm:.3f}/level")
    ratios = [g["playerdmg_ratio_vs_prev"] for g in growth if g["playerdmg_ratio_vs_prev"]]
    if ratios:
        gm = math.exp(sum(math.log(r) for r in ratios) / len(ratios))
        print(f"player-Damage-stat growth: geometric mean x{gm:.3f}/level")

    # ---------- 12. save-file stat comparison ----------
    saves = []
    for tag, path in (("Lv2", "lv2.json"), ("Lv30", "lv30.json")):
        p = os.path.join(HERE, path)
        if not os.path.exists(p):
            continue
        d = json.load(open(p, encoding="utf-8"))
        st = d.get("stats", {})
        for stat, v in st.items():
            if not isinstance(v, dict) or stat == "$type":
                continue
            tot = v.get("Total", {})
            saves.append({
                "save": tag,
                "stat": stat,
                "total": tot.get("RealValue", tot.get("_Value")),
                "flat": (v.get("Flat") or {}).get("RealValue", (v.get("Flat") or {}).get("_Value")),
                "additive_pct": (v.get("AdditiveIncreases") or {}).get("RealValue"),
                "multiplicative": (v.get("MultiplicativeIncreases") or {}).get("RealValue"),
            })
        saves.append({"save": tag, "stat": "__SecondsPlayed_FullGame", "total": d.get("SecondsPlayed_FullGame")})
        saves.append({"save": tag, "stat": "__TotalTimePlayed", "total": d.get("TotalTimePlayed")})
        saves.append({"save": tag, "stat": "__TotalLevelGameTime", "total": d.get("TotalLevelGameTime")})
        saves.append({"save": tag, "stat": "__TotalDeaths", "total": d.get("TotalDeaths_FullGame")})
        saves.append({"save": tag, "stat": "__TotalMonstersKilled", "total": d.get("TotalMonstersKilled_FullGame")})
        saves.append({"save": tag, "stat": "__MonstersLevel", "total": d.get("MonstersLevel")})
    write_csv(os.path.join(HERE, "12_save_stats.csv"), saves, ["save", "stat", "total", "flat", "additive_pct", "multiplicative"])
    print(f"\nsave stat records: {len(saves)}")

    # ---------- 13. joined design metrics (SkillsLog <-> Logs.txt, aligned 1:1) ----------
    joined = []
    if len(attempts) == len(logattempts):
        for i, (x, y) in enumerate(zip(attempts, logattempts)):
            killed = y["killed_run"]
            joined.append({
                "idx": i, "session_idx": x["session_idx"], "level": x["level"],
                "status": x["status"],
                "game_s": x["time_s"],
                "total_damage": x["total_damage"],
                "dps_actual": x["dps"],
                "monsters_killed": killed,
                "dmg_per_kill": (x["total_damage"] / killed) if killed else None,
                "player_damage_stat": x["player_damage"],
                "deaths_run": y["deaths_run"],
                "deaths_total": y["deaths_total"],
                "killed_total": y["killed_total"],
                "play_clock": y["total_elapsed"],
                "gold_run": y["currencies"].get("Gold", (None, None))[0],
                "speed": y["speed"],
            })
    write_csv(os.path.join(HERE, "13_design_metrics.csv"), joined, [
        "idx", "session_idx", "level", "status", "game_s", "total_damage", "dps_actual",
        "monsters_killed", "dmg_per_kill", "player_damage_stat",
        "deaths_run", "deaths_total", "killed_total", "play_clock", "gold_run", "speed"])

    print("\n--- joined design metrics (best/representative run per level) ---")
    print(f"{'Lv':>3} {'t':>6} {'kills':>6} {'dmg/kill':>12} {'total dmg':>14} {'playerdmg':>10} {'deaths':>6}")
    seen_lv = set()
    for j in joined:
        if j["level"] in seen_lv:
            continue
        # keep the most representative (longest) run per level
        cand = [c for c in joined if c["level"] == j["level"]]
        rep = max(cand, key=lambda c: c["game_s"])
        seen_lv.add(j["level"])
        t = f"{rep['game_s']//60}m{rep['game_s']%60:02d}s"
        print(f"{rep['level']:>3} {t:>6} {rep['monsters_killed']:>6} "
              f"{(rep['dmg_per_kill'] or 0):>12,.0f} {rep['total_damage']:>14,.0f} "
              f"{rep['player_damage_stat']:>10,.0f} {rep['deaths_run']:>6}")

    # ---------- 14. monster HP proxy + growth segments ----------
    # overkill inflates "total damage" above the real HP pool, so correct by the
    # damage-weighted overkill share, and use the run with the LOWEST dmg/kill
    # (least-overkilled) as the cleanest HP estimate per level.
    # overkill share per ATTEMPT (mixing runs of very different power skews a per-level average)
    ok_by_attempt = {}
    for r in rows:
        if r["is_sub"] or not (r["damage"] or 0):
            continue
        e = ok_by_attempt.setdefault(r["attempt_idx"], [0.0, 0.0])
        e[0] += (r["overkill_pct"] or 0) * r["damage"]
        e[1] += r["damage"]

    hp = []
    for lv in sorted(by_lv):
        lst = [j for j in joined if j["level"] == lv and (j["dmg_per_kill"] or 0) > 0]
        reps = [a for a in attempts if a["level"] == lv]
        rep = max(reps, key=lambda a: a["total_damage"])
        proxies = []
        for j in lst:
            o = ok_by_attempt.get(int(j["idx"]))
            okp = (o[0] / o[1]) if (o and o[1]) else 0.0
            j["overkill_attempt"] = round(okp, 1)
            j["hp_proxy_attempt"] = j["dmg_per_kill"] * (1 - okp / 100)
            proxies.append(j["hp_proxy_attempt"])
        proxies.sort()
        proxy = proxies[len(proxies) // 2] if proxies else 0.0   # median attempt
        min_dpk = min((j["dmg_per_kill"] for j in lst), default=None)
        avg_ok = (sum(j.get("overkill_attempt", 0) for j in lst) / len(lst)) if lst else 0.0
        hp.append({
            "level": lv,
            "attempts": len(reps),
            "monsters_killed_rep": max((j["monsters_killed"] for j in lst), default=0),
            "min_dmg_per_kill": min_dpk,
            "attempts_used": len(proxies),
            "overkill_pct_weighted": round(avg_ok, 1),
            "hp_proxy_per_monster": proxy,
            "rep_total_damage": rep["total_damage"],
            "rep_time_s": rep["time_s"],
            "rep_dps": rep["dps"],
            "rep_player_damage": rep["player_damage"],
        })
    prev = None
    for h in hp:
        # a level is "usable" for the curve if it is a real run (not the 1-second Lv.10 skip)
        h["usable"] = bool(h["rep_time_s"] > 30 and h["hp_proxy_per_monster"] > 0 and h["monsters_killed_rep"] > 0)
        chained = (prev is not None and h["level"] == prev["level"] + 1
                   and h["usable"] and prev["usable"])
        h["hp_ratio_vs_prev"] = (h["hp_proxy_per_monster"] / prev["hp_proxy_per_monster"]) if chained else None
        prev = h
    write_csv(os.path.join(HERE, "14_monster_hp_curve.csv"), hp, [
        "level", "attempts", "attempts_used", "monsters_killed_rep", "min_dmg_per_kill",
        "overkill_pct_weighted", "hp_proxy_per_monster", "hp_ratio_vs_prev",
        "rep_total_damage", "rep_time_s", "rep_dps", "rep_player_damage"])

    # segment growth rates
    def seg(lo, hi, label):
        a = next((h for h in hp if h["level"] == lo), None)
        b = next((h for h in hp if h["level"] == hi), None)
        if a and b and a["hp_proxy_per_monster"] > 0:
            steps = hi - lo
            r = (b["hp_proxy_per_monster"] / a["hp_proxy_per_monster"]) ** (1.0 / steps)
            print(f"  {label:<24} Lv{lo}->Lv{hi}: x{b['hp_proxy_per_monster']/a['hp_proxy_per_monster']:.1f} "
                  f"over {steps} lv = x{r:.3f}/level")
    print("\n--- monster-HP growth segments (overkill-corrected proxy) ---")
    seg(1, 9, "early (tutorial ramp)")
    seg(9, 15, "mid (steady)")
    seg(15, 17, "late")
    seg(17, 29, "post-skip")
    seg(1, 29, "whole Lv1-29")

    # ---------- 15. skill roster (game data vs log evidence) ----------
    roster = []
    save30 = os.path.join(HERE, "lv30.json")
    if os.path.exists(save30):
        d30 = json.load(open(save30, encoding="utf-8"))
        sl = {k: v for k, v in d30.get("SkillsLevels", {}).items() if k != "$type"}
        used = {u["name"]: u for u in unlock}
        alias = {"Wolf": "Wolf (pet)", "Bear": "Bear (pet)"}
        for nm, lvl in sl.items():
            key = alias.get(nm, nm)
            u = used.get(key)
            total_dmg = sum(r["damage"] or 0 for r in rows if r["name"] == key and not r["is_sub"])
            casts = sum(r["casts"] or 0 for r in rows if r["name"] == key and not r["is_sub"])
            roster.append({
                "skill": nm,
                "save_level_lv30": lvl,
                "appeared_in_logs": bool(u),
                "first_level_seen": u["first_level"] if u else None,
                "levels_present": u["levels_present"] if u else 0,
                "total_casts": casts,
                "total_damage": total_dmg,
            })
        roster.sort(key=lambda r: (r["first_level_seen"] or 999, -(r["total_damage"] or 0)))
        write_csv(os.path.join(HERE, "15_skill_roster.csv"), roster, list(roster[0].keys()))
        print("\n--- skill roster (save SkillsLevels @Lv30, never-used skills have level 0) ---")
        for r in roster:
            print(f"  {r['skill']:<18} saveLv={r['save_level_lv30']:<2} "
                  f"seen={'Lv'+str(r['first_level_seen']) if r['appeared_in_logs'] else 'NEVER':<5} "
                  f"casts={r['total_casts']:>5} dmg={r['total_damage']:>16,.0f}")

    # ---------- console report ----------
    print(f"attempts={len(attempts)} rows={len(rows)} sessions={len(sessions)} "
          f"buff_records={len(buffers)} nodmg={len(nodmg)} splits={len(splits)} logruns={len(logattempts)}")
    print("\n--- level: rep(t) rep(dmg) rep(DPS) playerDmg attempts cleared status ---")
    for b in best:
        print(f"Lv{b['level']:>2} {b['rep_time']:>7} "
              f"{b['rep_total_damage']:>13,.0f} {b['rep_dps']:>12,.0f} {b['rep_player_damage']:>7,.0f} "
              f" n={b['attempts']} clear={b['completed_attempts']} {b['rep_status']}")
    print("\n--- unlock (first appearance as a top-level row) ---")
    for u in unlock:
        print(f"  {u['name']:<22} first=Lv{u['first_level']:<3} section={u['section']:<12} "
              f"levels={u['levels_present']:<3} casts={u['total_casts']:<7} dmg={u['total_damage']:,.0f}")


if __name__ == "__main__":
    main()
