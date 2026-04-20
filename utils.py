import pandas as pd
from typing import Tuple, List, Dict, Any

REQUIRED_COLUMNS = {"nationalid", "name", "phone", "trade", "experience", "education", "status", "remarks"}

COLUMN_MAP = {
    # nationalid
    "national_id": "nationalid", "national id": "nationalid",
    "nid": "nationalid", "id": "nationalid", "id_number": "nationalid",
    # name
    "names": "name", "full_name": "name", "fullname": "name",
    "candidate_name": "name", "employee_name": "name",
    # phone
    "phone_number": "phone", "mobile": "phone", "tel": "phone",
    "telephone": "phone", "contact": "phone",
    # trade
    "job": "trade", "position": "trade", "occupation": "trade", "profession": "trade",
    # experience
    "exp": "experience", "years_of_experience": "experience", "work_experience": "experience",
    # education
    "edu": "education", "qualification": "education", "degree": "education",
    # driving license
    "driving_license": "driving_license_no", "license_no": "driving_license_no",
    "dl_no": "driving_license_no", "license_number": "driving_license_no",
    "license_type": "driving_license_type", "dl_type": "driving_license_type",
    # last employer
    "previous_employer": "last_employer", "employer": "last_employer",
    "last_company": "last_employer",
    # age
    "dob": "age",
}

OPTIONAL_EXTRA_COLUMNS = [
    "driving_license_no", "driving_license_type", "last_employer",
    "supporting_doc_path", "age",
]


def normalize_columns(df: pd.DataFrame) -> pd.DataFrame:
    df.columns = [c.strip().lower() for c in df.columns]
    df.rename(columns={k: v for k, v in COLUMN_MAP.items() if k in df.columns}, inplace=True)
    df.columns = [c.replace(" ", "_") for c in df.columns]
    return df


def validate_columns(df: pd.DataFrame) -> Tuple[bool, str]:
    if "nationalid" not in df.columns:
        return False, f"Missing required column: 'nationalid'. Found: {list(df.columns)}"
    return True, ""


def clean_dataframe(df: pd.DataFrame) -> Tuple[pd.DataFrame, int]:
    df = normalize_columns(df)
    for col in REQUIRED_COLUMNS:
        if col not in df.columns:
            df[col] = ""
    str_cols = df.select_dtypes(include="object").columns
    df[str_cols] = df[str_cols].apply(lambda c: c.str.strip())
    df = df[df["nationalid"].notna() & (df["nationalid"] != "")]
    before = len(df)
    df = df.drop_duplicates(subset=["nationalid"])
    file_dupes = before - len(df)
    df["nationalid"] = df["nationalid"].astype(str)
    df["status"] = df["status"].fillna("Pending").replace("", "Pending")
    return df, file_dupes


def df_to_records(df: pd.DataFrame) -> List[Dict[str, Any]]:
    base_cols = ["name", "nationalid", "phone", "trade", "experience",
                 "education", "status", "remarks"]
    all_cols = base_cols + OPTIONAL_EXTRA_COLUMNS
    for col in all_cols:
        if col not in df.columns:
            df[col] = None
    subset = df[all_cols].copy()
    subset = subset.where(pd.notnull(subset), None)
    records = subset.to_dict(orient="records")

    def _val(v):
        if v is None:
            return None
        s = str(v).strip()
        return s if s else None

    def _int(v):
        try:
            return int(float(v)) if v is not None and str(v).strip() != "" else None
        except (ValueError, TypeError):
            return None

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
            "driving_license_no": _val(r.get("driving_license_no")),
            "driving_license_type": _val(r.get("driving_license_type")),
            "last_employer": _val(r.get("last_employer")),
            "supporting_doc_path": _val(r.get("supporting_doc_path")),
            "age": _int(r.get("age")),
        }
        for r in records
    ]


def read_file(path: str) -> pd.DataFrame:
    if path.endswith(".csv"):
        return pd.read_csv(path, dtype=str)
    elif path.endswith((".xlsx", ".xls")):
        return pd.read_excel(path, dtype=str)
    raise ValueError("Unsupported file format. Use CSV or Excel.")
