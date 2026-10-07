# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/).

## [0.1.1] - 2026-10-07

Fixes from the independent review of v0.1.0.

### Fixed
- Month view shaded the whole day for a window that starts or ends mid-day (for example a blackout
  from 19:00); it now shades only the covered part of each day, with exact times on hover.
- Clicking outside a menu or dialog did not return focus to the control that opened it.
- Phone agenda wrapped each time range onto three lines.
- The "+N more" link in the month grid was clipped on touch screens at tablet widths.
- Seed data gave some pre-approved Standard changes a "Medium" risk statement.

### Changed
- Deploy smoke test now checks that the script bundle and stylesheet load and that the bundle contains
  the rule engine, not just that the HTML page returns 200.
- README: corrected the CI trigger description and the data-privacy statement (fonts load from Google Fonts).

### Added
- Tests: Tab reaches the timeline strips with a visible focus outline; dialogs close on Escape and
  outside click and return focus; partial-day guardrail shading.

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

[0.1.1]: https://github.com/kingdomb/release-control-tower/releases/tag/v0.1.1
[0.1.0]: https://github.com/kingdomb/release-control-tower/releases/tag/v0.1.0
