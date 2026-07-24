"""API key management CLI.

    python -m notanda_server.keys create "moh-macbook"
    python -m notanda_server.keys list
"""

import hashlib
import secrets
import sys

from . import db


def hash_key(key: str) -> str:
    return hashlib.sha256(key.encode()).hexdigest()


def create(label: str) -> str:
    key = secrets.token_urlsafe(32)
    conn = db.connect()
    with conn:
        conn.execute(
            "INSERT INTO api_keys (key_hash, label, created_at) VALUES (?, ?, ?)",
            (hash_key(key), label, db.now_iso()),
        )
    conn.close()
    return key


def main() -> None:
    if len(sys.argv) >= 3 and sys.argv[1] == "create":
        key = create(sys.argv[2])
        print(f"API key for '{sys.argv[2]}' (shown once, store it now):\n{key}")
    elif len(sys.argv) >= 2 and sys.argv[1] == "list":
        conn = db.connect()
        for row in conn.execute("SELECT id, label, created_at FROM api_keys ORDER BY id"):
            print(f"{row['id']}\t{row['label']}\t{row['created_at']}")
        conn.close()
    else:
        print(__doc__)
        sys.exit(1)


if __name__ == "__main__":
    main()
