# Release checklist

Use this for every release of Release Control Tower. The release manager ticks each item in the
release pull request description.

## 1. Prepare (on a release branch)
- [ ] Scope is frozen: only the changes listed in the changelog entry are in the branch.
- [ ] `package.json` `version` bumped following semver (patch: fixes; minor: features; major: breaking data or URL changes).
- [ ] `CHANGELOG.md` has a dated entry for the version, under Added / Changed / Fixed / Removed.
- [ ] If the stored data shape changed: `SCHEMA_VERSION` bumped in `src/data/DataSource.ts`, and old data is migrated or discarded on load (never silently misread).
- [ ] README screenshots regenerated if the UI changed (`node scripts/screenshots.mjs` against `vite preview`).

## 2. Verify locally
- [ ] `npm ci`
- [ ] `npm run lint` and `npm run typecheck` clean
- [ ] `npm test`: all unit tests pass (rules, seed, import, exports)
- [ ] `npm run build` succeeds
- [ ] `npm run e2e`: acceptance flows, layout QA (14 widths), and axe all pass
- [ ] Screenshots in `qa-output/` reviewed by eye at 320, 768, 1024, and 1920 at least

## 3. Review
- [ ] Pull request reviewed and approved; CI green on the final commit
- [ ] [Go/no-go](GO-NO-GO.md) completed and recorded in the PR: **Go**

## 4. Release
- [ ] Merge to `main` (no squash of unrelated work)
- [ ] Record the go/no-go decision in `docs/GO-NO-GO.md`, merge, and wait for CI on `main`
- [ ] Tag the commit that CI just passed (the one containing the decision record): `git tag -a vX.Y.Z -m "vX.Y.Z" && git push origin vX.Y.Z`
- [ ] Cite the deploy run (which re-runs every gate on the tagged commit) in the release record
- [ ] Deploy workflow green: gates → build → deploy → live smoke test
- [ ] GitHub release created from the tag with the changelog entry as notes

## 5. Confirm (within 30 minutes)
- [ ] Live site loads at https://kingdomb.github.io/release-control-tower/ on desktop and phone
- [ ] Demo banner visible; eight conflicts shown on the seed data
- [ ] Import the CSV template; `.ics` export downloads
- [ ] If anything fails: follow the [rollback runbook](ROLLBACK-RUNBOOK.md)
