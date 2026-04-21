import re
import sqlite3
from pathlib import Path
from datetime import datetime


DB_PATH = Path("data") / "evaluations.db"


def extract_upwork_id(text: str) -> str | None:
    m = re.search(r"~(\d{10,})", text)
    return m.group(1) if m else None


def extract_job_url(text: str) -> str | None:
    m = re.search(r"(?im)^\s*URL:\s*(https?://\S+)\s*$", text)
    if m and "upwork.com" in m.group(1):
        return m.group(1).strip()
    m2 = re.search(r"https?://www\.upwork\.com/jobs/~\d{10,}", text)
    if m2:
        return m2.group(0)
    job_id = extract_upwork_id(text)
    if job_id:
        return f"https://www.upwork.com/jobs/~{job_id}"
    return None


def extract_title(text: str) -> str | None:
    m = re.search(r"(?im)^\s*TITLE:\s*(.+?)\s*$", text)
    if m:
        t = m.group(1).strip().strip("*").strip()
        return t[:180] if len(t) >= 6 else None
    # fallback: first meaningful line
    for line in text.splitlines():
        l = line.strip()
        if not l:
            continue
        if re.match(r"(?i)^(URL|POSTED|TYPE|LEVEL|DURATION|BUDGET|SKILLS|DESCRIPTION)\s*:", l):
            continue
        l = l.strip("*").strip()
        if len(l) >= 6:
            return l[:180]
    return None


def infer_source(text: str) -> str | None:
    if re.search(r"(?im)^\s*TITLE:\s*", text) or re.search(r"(?im)^\s*DESCRIPTION:\s*", text):
        return "text"
    return None


def main():
    if not DB_PATH.exists():
        raise SystemExit(f"DB not found: {DB_PATH}")

    # Backup first (simple file copy)
    backup_path = DB_PATH.with_suffix(f".db.bak.{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}")
    backup_path.write_bytes(DB_PATH.read_bytes())
    print(f"backup={backup_path}")

    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    cur = con.cursor()

    cur.execute(
        "SELECT id, job_snippet, title, job_url, upwork_job_id, source FROM evaluations"
    )
    rows = cur.fetchall()

    updated = 0
    dup_counts: dict[str, int] = {}

    for r in rows:
        id_ = r["id"]
        snippet = r["job_snippet"] or ""
        title = r["title"]
        job_url = r["job_url"]
        upwork_job_id = r["upwork_job_id"]
        source = r["source"]

        new_job_url = job_url or extract_job_url(snippet)
        new_upwork_id = upwork_job_id or (extract_upwork_id(new_job_url) if new_job_url else None) or extract_upwork_id(snippet)
        new_title = title or extract_title(snippet)
        new_source = source or infer_source(snippet)

        if new_upwork_id:
            dup_counts[new_upwork_id] = dup_counts.get(new_upwork_id, 0) + 1

        if (
            new_job_url != job_url
            or new_upwork_id != upwork_job_id
            or new_title != title
            or new_source != source
        ):
            cur.execute(
                "UPDATE evaluations SET title = COALESCE(?, title), job_url = COALESCE(?, job_url), upwork_job_id = COALESCE(?, upwork_job_id), source = COALESCE(?, source) WHERE id = ?",
                (new_title, new_job_url, new_upwork_id, new_source, id_),
            )
            updated += 1

    con.commit()

    duplicates = sorted((k, v) for k, v in dup_counts.items() if v > 1)

    print(f"rows={len(rows)} updated={updated} duplicates={len(duplicates)}")
    if duplicates:
        print("Top duplicates (upwork_job_id -> count):")
        for k, v in duplicates[:25]:
            print(f"  {k} -> {v}")

    # Cleanup duplicates: keep newest by saved_at for each upwork_job_id (non-null)
    cur.execute(
        """
        SELECT upwork_job_id, COUNT(*) c
        FROM evaluations
        WHERE upwork_job_id IS NOT NULL
        GROUP BY upwork_job_id
        HAVING c > 1
        """
    )
    dup_groups = [row[0] for row in cur.fetchall()]
    deleted = 0
    kept = 0

    for upwork_id in dup_groups:
        cur.execute(
            """
            SELECT id, saved_at
            FROM evaluations
            WHERE upwork_job_id = ?
            ORDER BY saved_at DESC, id DESC
            """,
            (upwork_id,),
        )
        candidates = cur.fetchall()
        if len(candidates) <= 1:
            continue
        keep_id = candidates[0][0]
        delete_ids = [c[0] for c in candidates[1:]]
        kept += 1
        cur.executemany("DELETE FROM evaluations WHERE id = ?", [(x,) for x in delete_ids])
        deleted += len(delete_ids)

    con.commit()
    if dup_groups:
        print(f"dedup_groups={len(dup_groups)} kept_groups={kept} deleted_rows={deleted}")

    con.close()


if __name__ == "__main__":
    main()

