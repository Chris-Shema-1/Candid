import os
import logging
from dotenv import load_dotenv
from sqlalchemy import create_engine, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

load_dotenv()

logger = logging.getLogger(__name__)

# ── URL resolution ─────────────────────────────────────────────────────────
# Production:  set DATABASE_URL=postgresql://user:pass@host:5432/dbname
# Local dev:   set DATABASE_URL=postgresql://hr_user:hr_pass@localhost:5432/hr_db
# Fallback:    SQLite (only if DATABASE_URL is not set at all)
_DATABASE_URL = os.getenv("DATABASE_URL", "").strip() or None

if _DATABASE_URL:
    # Render sets postgres:// (legacy); SQLAlchemy 2.x requires postgresql://
    if _DATABASE_URL.startswith("postgres://"):
        _DATABASE_URL = _DATABASE_URL.replace("postgres://", "postgresql://", 1)
    DATABASE_URL = _DATABASE_URL
    logger.info("Database: PostgreSQL")
else:
    _BASE_DIR = os.path.dirname(os.path.abspath(__file__))
    DATABASE_URL = f"sqlite:///{os.path.join(_BASE_DIR, 'database.db')}"
    logger.warning("DATABASE_URL not set — falling back to SQLite (local only)")

# ── Engine ─────────────────────────────────────────────────────────────────
_is_sqlite = DATABASE_URL.startswith("sqlite")

engine = create_engine(
    DATABASE_URL,
    # SQLite needs this to work across threads (FastAPI uses a thread pool)
    connect_args={"check_same_thread": False} if _is_sqlite else {},
    # PostgreSQL: keep a small connection pool; SQLite: no pool needed
    pool_pre_ping=True,   # verify connections before use (catches stale PG connections)
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def check_connection():
    """Called at startup to fail fast if the DB is unreachable."""
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        logger.info("Database connection OK")
    except Exception as e:
        logger.error(f"Database connection FAILED: {e}")
        raise
