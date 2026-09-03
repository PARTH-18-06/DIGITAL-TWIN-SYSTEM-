"""Risk category helpers for synthetic-dataset-relative interpretations."""

from __future__ import annotations


CATEGORY_BASIS = "synthetic-dataset-relative"
FIELD_VALIDATED = False


def category_from_probability(probability: float) -> str:
    if probability < 0.33:
        return "LOW"
    if probability < 0.66:
        return "MEDIUM"
    return "HIGH"


def category_from_score(score: float, medium_threshold: float, high_threshold: float) -> str:
    if score < medium_threshold:
        return "LOW"
    if score < high_threshold:
        return "MEDIUM"
    return "HIGH"
