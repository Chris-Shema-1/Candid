import pandas as pd
from typing import Tuple, List, Dict, Any

REQUIRED_COLUMNS = {"nationalid", "name", "phone", "trade", "experience", "education", "status", "remarks"}

# Maps any alias (after lowercasing) -> canonical column name
COLUMN_MAP = {
    # nationalid aliases
    "national_id": "nationalid",
    "national id": "nationalid",
    "nid": "nationalid",
    "id": "nationalid",
    "id_number": "nationalid",
    # name aliases
    "names": "name",
    "full_name": "name",
    "fullname": "name",
    "candidate_name": "name",
    "employee_name": "name",
    # phone aliases
    "phone_number": "phone",
    "mobile": "phone",
    "tel": "phone",
    "telephone": "phone",
    "contact": "phone",
    # trade aliases
    "job": "trade",
    "position": "trade",
    "occupation": "trade",
    "profession": "trade",
    # experience aliases
    "exp": "experience",
    "years_of_experience": "experience",
    "work_experience": "experience",
    # education aliases
    "edu": "education",
    "qualification": "education",
    "degree": "education",
}


def normalize_columns(df: pd.DataFrame) -> pd.DataFrame:
    # Step 1: Strip whitespace and convert to lowercase
    df.columns = [c.strip().lower() for c in df.columns]
    # Step 2: Replace spaces with underscores (BEFORE mapping for better alias matching)
    df.columns = [c.replace(" ", "_") for c in df.columns]
    # Step 3: Map aliases to canonical column names
    df.rename(columns={k: v for k, v in COLUMN_MAP.items() if k in df.columns}, inplace=True)
    return df


def validate_columns(df: pd.DataFrame) -> Tuple[bool, str]:
    missing = REQUIRED_COLUMNS - set(df.columns)
    if "nationalid" not in df.columns:
        return False, f"Missing required column: 'nationalid'. Found: {list(df.columns)}"
    return True, ""


def clean_dataframe(df: pd.DataFrame) -> Tuple[pd.DataFrame, int]:
    df = normalize_columns(df)
    # Fill missing optional columns
    for col in REQUIRED_COLUMNS:
        if col not in df.columns:
            df[col] = ""
    # Strip whitespace from string columns
    str_cols = df.select_dtypes(include="object").columns
    df[str_cols] = df[str_cols].apply(lambda c: c.str.strip())
    # Remove rows with empty nationalid
    df = df[df["nationalid"].notna() & (df["nationalid"] != "")]
    # Drop duplicates within the file itself
    before = len(df)
    df = df.drop_duplicates(subset=["nationalid"])
    file_dupes = before - len(df)
    # Normalize nationalid to string
    df["nationalid"] = df["nationalid"].astype(str)
    df["status"] = df["status"].fillna("Pending").replace("", "Pending")
    return df, file_dupes


def df_to_records(df: pd.DataFrame) -> List[Dict[str, Any]]:
    cols = ["name", "nationalid", "phone", "trade", "experience", "education", "status", "remarks"]
    for col in cols:
        if col not in df.columns:
            df[col] = ""
    subset = df[cols].copy()
    subset = subset.where(pd.notnull(subset), None)
    records = subset.to_dict(orient="records")
    # Rename nationalid -> national_id for schema
    def _val(v):
        """Return None for empty/whitespace strings so DB stores NULL not blank."""
        if v is None:
            return None
        s = str(v).strip()
        return s if s else None

    return [
        {
            "name": _val(r.get("name")),
            "national_id": _val(r.get("nationalid")),
            "phone": _val(r.get("phone")),
            "trade": _val(r.get("trade")),
            "experience": _val(r.get("experience")),
            "education": _val(r.get("education")),
            "status": _val(r.get("status")) or "Pending",
            "remarks": _val(r.get("remarks")),
        }
        for r in records
    ]


def read_file(path: str) -> pd.DataFrame:
    if path.endswith(".csv"):
        return pd.read_csv(path, dtype=str)
    elif path.endswith((".xlsx", ".xls")):
        return pd.read_excel(path, dtype=str)
    raise ValueError("Unsupported file format. Use CSV or Excel.")
