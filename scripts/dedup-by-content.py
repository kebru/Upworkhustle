import re
import sqlite3
from pathlib import Path
from datetime import datetime, timezone
import hashlib


DB_PATH = Path("data") / "evaluations.db"


def norm_title(title: str | None) -> str:
    if not title:
        return ""
    t = title.strip().lower()
    t = re.sub(r"\s+", " ", t)
    t = re.sub(r"[^\w\s]", "", t)  # drop punctuation
    return t.strip()


def norm_text(snippet: str | None) -> str:
    if not snippet:
        return ""
    s = snippet
    # remove URL metadata lines (our pipeline adds these)
    s = re.sub(r"(?im)^\s*URL:\s*https?://\S+\s*$", "", s)
    # remove typical label prefixes to reduce noise
    s = re.sub(r"(?im)^\s*(TITLE|POSTED|TYPE|LEVEL|DURATION|BUDGET|SKILLS)\s*:\s*", "", s)
    s = s.lower()
    s = re.sub(r"\s+", " ", s)
    s = re.sub(r"[^\w\s]", "", s)
    return s.strip()


def fingerprint(title: str | None, snippet: str | None) -> str:
    nt = norm_title(title)
    ns = norm_text(snippet)
    # cap text so huge snippets don't dominate + stable performance
    payload = (nt + "\n" + ns[:2000]).encode("utf-8", errors="ignore")
    return hashlib.sha1(payload).hexdigest()


def main() -> None:
    if not DB_PATH.exists():
        raise SystemExit(f"DB not found: {DB_PATH}")

    # Backup first
    ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    backup_path = DB_PATH.with_suffix(f".db.bak.contentdedup.{ts}")
    backup_path.write_bytes(DB_PATH.read_bytes())
    print(f"backup={backup_path}")

    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    cur = con.cursor()

    cur.execute(
        "SELECT id, saved_at, title, job_snippet FROM evaluations ORDER BY saved_at DESC, id DESC"
    )
    rows = cur.fetchall()

    groups: dict[str, list[sqlite3.Row]] = {}
    for r in rows:
        fp = fingerprint(r["title"], r["job_snippet"])
        groups.setdefault(fp, []).append(r)

    dup_groups = [g for g in groups.values() if len(g) > 1]
    print(f"rows={len(rows)} duplicate_groups_exact={len(dup_groups)}")

    deleted = 0
    for g in dup_groups:
        # keep newest (we selected ORDER BY saved_at DESC)
        keep = g[0]
        to_delete = g[1:]
        cur.executemany("DELETE FROM evaluations WHERE id = ?", [(r["id"],) for r in to_delete])
        deleted += len(to_delete)

    con.commit()

    # Post-check
    cur.execute("SELECT COUNT(*) FROM evaluations")
    remaining = cur.fetchone()[0]
    print(f"deleted_rows={deleted} remaining_rows={remaining}")

    con.close()


if __name__ == "__main__":
    main()

