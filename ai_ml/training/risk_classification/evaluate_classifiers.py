"""Print the saved SRP risk classifier report."""

from pathlib import Path


REPORT_PATH = Path(__file__).resolve().parents[2] / "reports" / "risk_classifier_report.json"


def main() -> int:
    print(REPORT_PATH.read_text(encoding="utf-8"))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
