# Go / no-go

Decided by the release manager before tagging. Any **No** on a must-have stops the release.
Record the outcome and the date in the release pull request.

| # | Criterion | Must-have | Evidence |
| --- | --- | --- | --- |
| 1 | CI green on the exact commit to be tagged (lint, types, unit, build, e2e, layout QA, axe) | Yes | Link to the CI run |
| 2 | Seed data shows exactly the eight planted conflicts, one per expected rule | Yes | `generate.test.ts` and `acceptance.spec.ts` in the CI run |
| 3 | No open critical or high defects against this version | Yes | Issue tracker filter |
| 4 | Version, tag, and changelog agree | Yes | `package.json`, `CHANGELOG.md`; the deploy workflow also enforces tag = version |
| 5 | Stored-data compatibility checked: existing browser data loads, or is reset with the version guard | Yes | Manual check with data saved by the previous release |
| 6 | Layout QA screenshots reviewed by a person | Yes | Notes in the PR |
| 7 | No real employer, client, or person in data, copy, or screenshots | Yes | Seed vocabulary test; screenshot review |
| 8 | Rollback path confirmed: previous tag exists and its deploy succeeded | Yes | Link to the previous deploy run |
| 9 | Release falls outside any personal blackout (do not ship before being unavailable) | No | Calendar |
| 10 | README and docs updated for any user-visible change | No | Diff |

**Decision:** Go / No-go — name — date

## Release record

| Version | Date | Decision | Notes |
| --- | --- | --- | --- |
| v0.1.0 | 2026-10-07 | Go | First release. Decision taken on CI run 37586468077 (merge commit); the tag was then placed on the following docs-only commit, whose gates passed in the deploy run 37588476673. Criterion 8 not applicable (no previous tag). Deviations: no pull request (milestones merged locally), so criteria 5 and 6 evidence is in the release report, not PR notes. |
| v0.1.1 | 2026-10-07 | Pending | Fixes from the v0.1.0 release review. Record after CI on the tagged commit. |
