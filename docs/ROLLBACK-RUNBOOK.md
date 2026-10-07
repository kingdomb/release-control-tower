# Rollback runbook

The site is static on GitHub Pages, and all user data lives in each visitor's browser, so a
rollback means redeploying a previous build. No server state needs restoring.

## When to roll back
- The live site does not load, or shows a blank page or a JavaScript error on load.
- The seed no longer shows the eight planted conflicts, or the rule engine reports wrong conflicts.
- Import, export, or saving loses or corrupts data.
- A severe accessibility regression (keyboard trap, unreadable contrast) on a core flow.

Decide within 15 minutes of detection. When in doubt, roll back first and investigate after.

## Option A: redeploy the previous tag (preferred, about 5 minutes)
1. Find the last good tag: `git tag --sort=-v:refname | head`.
2. GitHub → Actions → **Deploy to GitHub Pages** → find the successful run for that tag → **Re-run all jobs**.
   (The workflow builds from the tag's commit, so the old version is rebuilt and redeployed.)
3. Wait for the deploy job's smoke test to pass.
4. Verify by hand: the site loads, the demo banner shows, eight conflicts appear.

If the old run has expired, push a new patch tag on the last good commit instead:
```bash
git checkout -b hotfix/rollback vPREVIOUS
# bump package.json to the next patch version, add a "Reverted" changelog entry, commit
git tag -a vX.Y.(Z+1) -m "Roll back to vPREVIOUS" && git push origin hotfix/rollback vX.Y.(Z+1)
```

## Option B: revert the change on main (when the bad change is small and isolated)
1. `git revert <bad-merge-commit> -m 1` on a branch, open a PR, let CI pass.
2. Merge, bump the patch version and changelog, tag, and let the deploy run.

## Browser data
- Stored state carries a `version`. If a bad release wrote data in a new shape, the rolled-back
  version ignores it (it only loads its own `SCHEMA_VERSION`) and falls back to the demo seed.
  Users can re-import their schedule file.
- Tell users: "Clear and start empty" then re-import, if their view looks wrong after the rollback.

## Afterwards
- Record the incident in the release record of [GO-NO-GO.md](GO-NO-GO.md): what broke, how it was
  detected, time to roll back.
- Add a test that would have caught it before the fix is re-released.
