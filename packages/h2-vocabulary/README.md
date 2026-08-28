# H2 Official Vocabulary

This package freezes the small, reviewable vocabulary artifacts extracted from
the supplied H2 competition package. It intentionally excludes the large
train, validation, test, and label CSV files.

## Contents

- `fields.json`: the canonical 69-field time-series schema.
- `anomaly-taxonomy.json`: C01-C07 names, subtypes, impacts, severity labels,
  and affected equipment.
- `equipment.json`, `constraints.json`, and `efficiency-curves.json`: equipment
  and operating context used by deterministic diagnosis and safety checks.
- `assistant-questions.json` and `knowledge-base.md`: the fixed Q01-Q10
  operations-assistant vocabulary and public knowledge text.
- `detection-thresholds.json`: versioned engineering and aggregation thresholds
  used by the deterministic detector. Public label columns are evaluation-only
  and are rejected by the analytics import boundary.
- `deprecated-field-map.json`: the explicit compatibility map from the former
  sanitized Fixture field names to canonical fields or a documented derived
  expression.

Runtime code treats official field names as the source of truth. This package
contains vocabulary and constraints only; it is not validation evidence, an
organizer score, or authorization to issue equipment-control commands.
