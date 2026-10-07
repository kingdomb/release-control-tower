# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/).

## [0.1.0] - 2026-10-07

First public release.

### Added
- Rule engine with five pure, unit-tested rules: time overlap (product or configuration item),
  environment double-booking (releases and bookings), guardrails (blackout, freeze, maintenance
  window for Normal production changes), dependency order, and RFC completeness.
- Slot finder that suggests up to three alternative windows clearing every time-based rule, and a
  ripple-effect traversal over dependencies and configuration-item mapping.
- Integrated calendar (month, week, swimlane timeline by team), regular single-team view over the
  same data, environment booking lanes, and shaded guardrail bands. Agenda list on phones.
- Conflict panel (sortable, click to focus, apply a suggestion), what-if preview with conflict diff
  and ripple, keep or discard, one-click undo.
- Release drawer with the five RFC fields, completeness warnings, and ITIL change-class badge.
- `.ics` export for all teams or one team; printable weekly Minimum Viable CAB agenda.
- CSV and JSON import with column mapping, per-row errors, and downloadable templates.
- Deterministic synthetic seed (15 teams, 60 releases, 8 weeks, 8 planted conflicts) with a demo banner.
- CI: lint, type-check, unit tests, build, Playwright end-to-end, layout QA at 14 widths, axe
  (WCAG 2.2 AA rules). Tag-only deploy to GitHub Pages with a live smoke test.

[0.1.0]: https://github.com/kingdomb/release-control-tower/releases/tag/v0.1.0
