"""checkpoint(dev.db) 데이터를 Unified(master) 스키마의 새 저장 폴더로 옮깁니다. (U8)

checkpoint는 `create_all`로 만든 dev.db, master는 Alembic이 만든 app.db를 씁니다. 두 쪽의 clothing 표는 master에만 있는
칸 6개(outfit_template, main_color, pattern_path, pattern_mode, pattern_colors, fit)만 다르고, 이 칸은 모두 비어 있어도 됩니다.
그래도 dev.db에 Alembic을 그대로 돌리면 baseline이 표를 새로 만들려다 실패하므로, 빈 Unified 저장 파일을 먼저 만들고 행을 옮깁니다.

사용법 (저장소 맨 위에서):
    server\\.venv\\Scripts\\python server\\scripts\\import_checkpoint_data.py ^
        --source-db <dev.db 복사본> --source-photos <photos 복사본> --target-data-dir <새 폴더>

규칙
- 원본 DB는 읽기 전용(`mode=ro`)으로만 엽니다. 원본 사진은 복사만 합니다. 원본 data/ 대신 복사본을 넘기는 것을 권장합니다.
- 대상 폴더에 app.db가 있거나 photos에 파일이 있으면 아무것도 하지 않고 멈춥니다. (덮어쓰기 없음)
- keyword, style_tag는 앱 기본 단어와 겹치므로 번호를 믿지 않고 자연키((종류, 이름, 구분), 이름)로 맞춰 외래 키를 다시 잇습니다.
  원본에만 있는 단어·태그는 대상에 더합니다.
- main_color, outfit_template은 채우지 않습니다. 채우면 기존 사진 옷이 SVG 틀로 바뀌어 보입니다. (U8, 결정 필요 사항)
- 새 dependency 없음. 표준 라이브러리와 서버가 이미 쓰는 패키지만 씁니다.
"""

import argparse
import os
import shutil
import sqlite3
import sys
from pathlib import Path

SERVER_DIR = Path(__file__).resolve().parents[1]

# 옮길 표. clothing_keyword는 keyword 번호를 바꿔서 옮기므로 따로 다룹니다.
COPY_TABLES = ("clothing", "diary_entry", "favorite")
SLOT_COLUMNS = ("top_id", "bottom_id", "dress_id", "shoes_id", "outer_id")


def fail(message: str, code: int = 2):
    print(f"중단: {message}", file=sys.stderr)
    sys.exit(code)


def open_source(path: Path) -> sqlite3.Connection:
    if not path.is_file():
        fail(f"원본 DB가 없습니다: {path}")
    # mode=ro: 이 연결로는 어떤 것도 쓸 수 없습니다.
    conn = sqlite3.connect(f"{path.resolve().as_uri()}?mode=ro", uri=True)
    conn.row_factory = sqlite3.Row
    tables = {r[0] for r in conn.execute("select name from sqlite_master where type='table'")}
    needed = {"clothing", "clothing_keyword", "keyword", "style_tag", "settings", "diary_entry", "favorite"}
    if not needed <= tables:
        fail(f"checkpoint 저장 파일이 아닌 것 같습니다. 없는 표: {sorted(needed - tables)}")
    if "alembic_version" in tables:
        fail("이미 Unified(Alembic) 저장 파일입니다. checkpoint의 dev.db를 넘겨 주세요.")
    return conn


def columns(conn: sqlite3.Connection, table: str) -> list[str]:
    return [r[1] for r in conn.execute(f'pragma table_info("{table}")')]


def check_target(target: Path):
    if (target / "app.db").exists():
        fail(f"대상에 이미 app.db가 있습니다. 덮어쓰지 않습니다: {target}")
    photos = target / "photos"
    if photos.exists() and any(photos.iterdir()):
        fail(f"대상 photos 폴더가 비어 있지 않습니다: {photos}")


def create_unified_schema(target: Path):
    """정상 기동과 같은 방법으로 빈 Unified 저장 파일을 만듭니다. (Alembic upgrade head + 앱 기본 단어)"""
    os.environ["DATA_DIR"] = str(target)  # 절대 경로. app.db가 이 폴더에 만들어집니다.
    sys.path.insert(0, str(SERVER_DIR))
    from app.db import DB_PATH, init_db

    if DB_PATH.parent.resolve() != target.resolve():
        fail(f"DATA_DIR가 대상 폴더로 잡히지 않았습니다: {DB_PATH}")
    init_db()
    return DB_PATH


def import_data(src: sqlite3.Connection, db_path: Path, report: dict):
    dst = sqlite3.connect(db_path)
    dst.row_factory = sqlite3.Row
    dst.execute("PRAGMA foreign_keys=ON")
    try:
        dst.execute("BEGIN")

        # 키워드: 자연키로 맞춥니다.
        target_kw = {(r["kind"], r["name"], r["category"]): r["id"] for r in dst.execute("select * from keyword")}
        kw_map, added_kw = {}, []
        for row in src.execute("select * from keyword order by id"):
            key = (row["kind"], row["name"], row["category"])
            if key not in target_kw:
                cur = dst.execute(
                    "insert into keyword (kind, name, category, gender, sort_order) values (?,?,?,?,?)",
                    (row["kind"], row["name"], row["category"], row["gender"], row["sort_order"]))
                target_kw[key] = cur.lastrowid
                added_kw.append(key)
            kw_map[row["id"]] = target_kw[key]
        report["keyword_changed_ids"] = sum(1 for k, v in kw_map.items() if k != v)
        report["keyword_added"] = added_kw

        # 스타일 태그: 이름으로 맞춥니다.
        target_tag = {r["name"]: r["id"] for r in dst.execute("select * from style_tag")}
        tag_map, added_tags = {}, []
        for row in src.execute("select * from style_tag order by id"):
            if row["name"] not in target_tag:
                cur = dst.execute("insert into style_tag (name, sort_order) values (?,?)", (row["name"], row["sort_order"]))
                target_tag[row["name"]] = cur.lastrowid
                added_tags.append(row["name"])
            tag_map[row["id"]] = target_tag[row["name"]]
        report["style_tag_changed_ids"] = sum(1 for k, v in tag_map.items() if k != v)
        report["style_tag_added"] = added_tags

        # clothing, diary_entry, favorite: 양쪽에 있는 칸만 옮기고 나머지(master에만 있는 칸)는 비워 둡니다.
        for table in COPY_TABLES:
            common = [c for c in columns(src, table) if c in columns(dst, table)]
            only_dst = [c for c in columns(dst, table) if c not in columns(src, table)]
            report.setdefault("new_columns_left_null", {})[table] = only_dst
            for row in src.execute(f'select * from "{table}" order by id'):
                values = dict(row)
                if "style_tag_id" in values and values["style_tag_id"] is not None:
                    values["style_tag_id"] = tag_map[values["style_tag_id"]]
                dst.execute(
                    f'insert into "{table}" ({",".join(common)}) values ({",".join("?" * len(common))})',
                    [values[c] for c in common])

        for row in src.execute("select * from clothing_keyword order by clothing_id, keyword_id"):
            dst.execute("insert or ignore into clothing_keyword (clothing_id, keyword_id) values (?,?)",
                        (row["clothing_id"], kw_map[row["keyword_id"]]))

        # 설정: 마네킹 모양과 내 지역을 이어받습니다. (id 1 하나)
        for row in src.execute("select * from settings where id = 1"):
            common = [c for c in columns(src, "settings") if c in columns(dst, "settings")]
            dst.execute(
                f'insert or replace into settings ({",".join(common)}) values ({",".join("?" * len(common))})',
                [row[c] for c in common])

        dst.commit()
    except Exception:
        dst.rollback()
        dst.close()
        raise

    report["fk_errors"] = dst.execute("PRAGMA foreign_key_check").fetchall()
    report["counts"] = {t: dst.execute(f'select count(*) from "{t}"').fetchone()[0]
                        for t in ("clothing", "clothing_keyword", "keyword", "style_tag", "settings",
                                  "diary_entry", "favorite")}
    report["alembic_version"] = [r[0] for r in dst.execute("select version_num from alembic_version")]
    clothing = [dict(r) for r in dst.execute("select photo_path, image_path from clothing order by id")]
    dst.close()
    return clothing


def copy_photos(clothing: list[dict], source_photos: Path, target: Path, report: dict):
    """DB가 가리키는 사진 파일을 복사합니다(원본 이름 그대로). 없는 파일은 목록으로 남깁니다."""
    dest = target / "photos"
    dest.mkdir(parents=True, exist_ok=True)
    referenced, missing, copied = set(), [], 0
    for row in clothing:
        for name in (row["photo_path"], row["image_path"]):
            referenced.add(name)
            source = source_photos / name
            if source.is_file():
                shutil.copy2(source, dest / name)
                copied += 1
            else:
                missing.append(name)
    on_disk = {p.name for p in source_photos.iterdir() if p.is_file()} if source_photos.is_dir() else set()
    report["photos_copied"] = copied
    report["photos_missing"] = missing
    report["photos_unreferenced"] = sorted(on_disk - referenced)  # DB가 가리키지 않아 옮기지 않은 파일


def print_report(report: dict):
    print("== 가져오기 요약 ==")
    print("표별 행 수 (결과):", report["counts"])
    print("alembic_version:", report["alembic_version"])
    print(f"키워드 번호가 달라져 다시 이은 수: {report['keyword_changed_ids']}, 원본에만 있어 더한 키워드: {report['keyword_added']}")
    print(f"스타일 태그 번호가 달라져 다시 이은 수: {report['style_tag_changed_ids']}, 더한 태그: {report['style_tag_added']}")
    print("master에만 있는 칸(비워 둠):", report["new_columns_left_null"])
    print(f"사진 복사 {report['photos_copied']}개, 없는 파일 {report['photos_missing']}")
    print(f"DB가 가리키지 않아 옮기지 않은 파일 {len(report['photos_unreferenced'])}개: {report['photos_unreferenced']}")
    print("PRAGMA foreign_key_check:", report["fk_errors"] or "문제 없음")


def main():
    parser = argparse.ArgumentParser(description="checkpoint 데이터를 Unified 스키마의 새 폴더로 옮깁니다.")
    parser.add_argument("--source-db", required=True, type=Path, help="checkpoint dev.db (복사본 권장, 읽기 전용으로 엽니다)")
    parser.add_argument("--source-photos", required=True, type=Path, help="checkpoint photos 폴더 (복사만 합니다)")
    parser.add_argument("--target-data-dir", required=True, type=Path, help="새 DATA_DIR (비어 있어야 합니다)")
    args = parser.parse_args()

    target = args.target_data_dir.resolve()
    src = open_source(args.source_db)
    check_target(target)
    target.mkdir(parents=True, exist_ok=True)

    report: dict = {}
    db_path = create_unified_schema(target)
    clothing = import_data(src, db_path, report)
    src.close()
    copy_photos(clothing, args.source_photos.resolve(), target, report)
    print_report(report)
    if report["fk_errors"]:
        fail("외래 키 검사에 문제가 있습니다.", 3)


if __name__ == "__main__":
    main()
