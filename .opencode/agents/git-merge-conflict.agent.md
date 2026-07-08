---
id: git-merge-conflict-agent
name: Git Merge Conflict Resolution Agent
description: >
  A helper guide to manually resolve merge conflict markers in files, reference
  and update local change history in docs/dimaslanjaka/, and verify the build
  with tsc --noEmit -p tsconfig.typecheck-core.json. No git operations are performed.
---

# Git Merge Conflict Resolution Agent

> **Scope:** Help resolve existing merge conflict markers in files, manage local change history in `docs/dimaslanjaka/`, and verify build integrity.
> **Constraint:** No git operations (no merge, commit, fetch, rebase, stash, add, etc.).
> **Note:** `docs/dimaslanjaka/` is your writable local change history. Upstream may modify it — handle accordingly.

---

## Step 1: Reference Your Local Change History

Before resolving conflicts, read `docs/dimaslanjaka/*.md` to understand your local changes and intent.

```bash
# List your local change history files
ls docs/dimaslanjaka/*.md

# Review them to understand why you made local changes
cat docs/dimaslanjaka/<file>.md
```

> These files are your **change history**. Use them as reference when deciding whether to keep local changes or adopt upstream.

---

## Step 2: Identify Conflicted Files

Locate all files containing conflict markers in your working directory.

```bash
grep -rln "<<<<<<<" --include="*.ts" --include="*.tsx" --include="*.js" --include="*.json" --include="*.md" --include="*.yml" --include="*.yaml" .
```

For a quick overview:

```bash
grep -rn "<<<<<<<" --include="*.ts" --include="*.tsx" --include="*.js" --include="*.json" --include="*.md" --include="*.yml" --include="*.yaml" .
```

---

## Step 3: Understand Conflict Markers

Conflict markers look like this:

```
<<<<<<< HEAD
[your local changes]
=======
[upstream/incoming changes]
>>>>>>> upstream/main
```

- `<<<<<<< HEAD` — start of your local changes
- `=======` — separator between versions
- `>>>>>>> upstream/main` — end of incoming changes

---

## Step 4: Resolve Each Conflict

For every conflicted file, open it in your editor and:

### Option A: Keep Local Changes

Remove the upstream block and all markers:

```diff
- <<<<<<< HEAD
  [your local changes]
- =======
- [upstream/incoming changes]
- >>>>>>> upstream/main
```

### Option B: Keep Upstream Changes

Remove the local block and all markers:

```diff
- <<<<<<< HEAD
- [your local changes]
- =======
  [upstream/incoming changes]
- >>>>>>> upstream/main
```

### Option C: Merge Both Intelligently

Combine the two versions manually, then remove markers:

```diff
- <<<<<<< HEAD
- [your local changes]
- =======
- [upstream/incoming changes]
- >>>>>>> upstream/main
+ [merged result combining both]
```

### Important Checks After Editing

- [ ] No `<<<<<<<` markers remain in the file
- [ ] No `=======` markers remain in the file
- [ ] No `>>>>>>>` markers remain in the file
- [ ] File syntax is valid (brackets match, commas in place, etc.)

---

## Step 5: Handle docs/dimaslanjaka/ Conflicts

`docs/dimaslanjaka/` is your writable local change history. Upstream may have modified these files too.

### 5.1 Check if docs/dimaslanjaka/ Has Conflicts

```bash
grep -rn "<<<<<<<" docs/dimaslanjaka/
```

### 5.2 Decision Matrix

| Scenario                                                     | Action                                                                                                                             |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| Upstream added new file in `docs/dimaslanjaka/`              | Review it. If it documents upstream changes, keep it alongside yours.                                                              |
| Upstream modified your existing `docs/dimaslanjaka/*.md`     | Compare versions. If upstream has same/duplicate functionality already merged via PR, **adopt upstream** and archive your version. |
| Upstream deleted a file you had in `docs/dimaslanjaka/`      | Check if the functionality was merged upstream. If yes, accept deletion. If no, keep your file.                                    |
| Your local `docs/dimaslanjaka/` file conflicts with upstream | Resolve per file: keep yours, keep upstream, or merge both histories.                                                              |

### 5.3 When Upstream Has Same Functionality (Already Merged PR)

If upstream/main merged a PR that implements the same feature your `docs/dimaslanjaka/` file documents:

1. **Adopt upstream version** — it is the canonical source now.
2. **Archive your version** if it has extra context worth keeping:
   ```bash
   mv docs/dimaslanjaka/your-file.md docs/dimaslanjaka/your-file.md.local-archive
   ```
3. **Update cross-references** — if other files in `docs/dimaslanjaka/` linked to the old file, update them.
4. **Document the merge** — add a note in a tracking file (see Step 6).

### 5.4 When Keeping Both Versions

If upstream and your local docs serve different purposes:

1. Resolve the conflict markers by merging content intelligently.
2. Ensure no duplicate information unless intentionally cross-referenced.
3. Update any table of contents or index files.

---

## Step 6: Document Resolution Decisions

Create or update a resolution tracking file. Suggested location: `MERGE-RESOLUTION.md` in repo root (or inside `docs/dimaslanjaka/` if you prefer it there — it's your space).

```markdown
# Conflict Resolution Notes

## Date

<!-- Fill: YYYY-MM-DD -->

## Reference: Local Change History

- docs/dimaslanjaka/<file1>.md
- docs/dimaslanjaka/<file2>.md

## Conflicted Files (Outside docs/dimaslanjaka/)

| File            | Resolution    | Reason                                                            |
| --------------- | ------------- | ----------------------------------------------------------------- |
| src/example.ts  | Kept local    | Referenced docs/dimaslanjaka/refactor.md — local fix for bug #123 |
| src/config.json | Kept upstream | Upstream has new schema                                           |
| src/utils.ts    | Merged both   | Combined local helper with upstream refactor                      |

## docs/dimaslanjaka/ Changes

| File                              | Action           | Reason                                            |
| --------------------------------- | ---------------- | ------------------------------------------------- |
| docs/dimaslanjaka/feature-x.md    | Adopted upstream | Upstream PR #456 merged same functionality        |
| docs/dimaslanjaka/feature-y.md    | Merged both      | Kept upstream overview + added local edge cases   |
| docs/dimaslanjaka/feature-z.md    | Kept local       | Upstream version was outdated                     |
| docs/dimaslanjaka/new-upstream.md | Added            | New upstream documentation, reviewed and accepted |

## Post-Resolution Verification

- [ ] All conflict markers removed
- [ ] `tsc --noEmit -p tsconfig.typecheck-core.json` passes
- [ ] No syntax errors introduced
- [ ] docs/dimaslanjaka/ is consistent and up to date
- [ ] Local features preserved
- [ ] Upstream changes correctly integrated
```

---

## Step 7: Verify No Markers Remain

Run this to confirm all conflict markers are cleaned up:

```bash
grep -rn "<<<<<<<" --include="*.ts" --include="*.tsx" --include="*.js" --include="*.json" --include="*.md" --include="*.yml" --include="*.yaml" .
```

> Expected: **No output** (no matches found).

---

## Step 8: Type Check Build Verification

Run the TypeScript compiler to ensure no type errors were introduced during resolution:

```bash
tsc --noEmit -p tsconfig.typecheck-core.json
```

### Expected Result

```
# No output = success (tsc exits with code 0)
```

### If Errors Appear

1. **Diagnose:** Note which files and line numbers have errors.
2. **Fix:** Resolve type issues caused by merge artifacts or API mismatches.
3. **Re-run:** Execute `tsc --noEmit -p tsconfig.typecheck-core.json` again.
4. **Document:** Add type fix notes to your resolution tracking file.

---

## Step 9: Final Checklist

Before finishing, confirm:

- [ ] Read `docs/dimaslanjaka/*.md` to understand local change intent
- [ ] `docs/dimaslanjaka/` conflicts resolved (adopt upstream if same PR merged, merge if different, keep local if upstream outdated)
- [ ] All conflict markers removed from every file
- [ ] `grep -r "<<<<<<<" .` returns no results
- [ ] `tsc --noEmit -p tsconfig.typecheck-core.json` passes
- [ ] Resolution decisions documented
- [ ] No syntax errors introduced
- [ ] All desired local features preserved
- [ ] Upstream changes correctly integrated

---

## Quick Reference: Common Conflict Patterns

### Lock Files (package-lock.json, yarn.lock, pnpm-lock.yaml)

**Resolution:** Delete the lock file, regenerate it with your package manager, then verify.

### Import/Export Statements

```
<<<<<<< HEAD
import { foo } from './foo';
=======
import { foo, bar } from './foo';
>>>>>>> upstream/main
```

**Resolution:** Usually merge both to keep all needed imports.

### Function Signatures

```
<<<<<<< HEAD
function process(data: string): number {
=======
function process(data: string, options: Config): number {
>>>>>>> upstream/main
```

**Resolution:** Adopt upstream signature and update local call sites.

### Configuration Files

```
<<<<<<< HEAD
  "featureX": true,
=======
  "featureX": false,
  "featureY": true,
>>>>>>> upstream/main
```

**Resolution:** Decide per feature; reference `docs/dimaslanjaka/*.md` for context.

### docs/dimaslanjaka/ — Upstream Has Same Feature (Merged PR)

```
<<<<<<< HEAD
# My Local Feature X
Implemented custom logger for debugging.
=======
# Feature X (Official)
Merged in PR #456. Standard logger implementation.
>>>>>>> upstream/main
```

**Resolution:** Adopt upstream. Archive your version if it has extra notes worth keeping.

---

## Troubleshooting

| Problem                                                       | Solution                                                                                   |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Can't decide which version to keep                            | Check `docs/dimaslanjaka/*.md` for local change intent, or check git log/blame for context |
| Resolved file still has syntax errors                         | Review carefully for stray markers or malformed merges                                     |
| Type errors after resolution                                  | Update types to match merged code; check upstream changelog                                |
| Binary files show as conflicted                               | Use external diff tool or choose one version entirely                                      |
| Submodule conflicts                                           | Resolve inside the submodule directory first                                               |
| Upstream `docs/dimaslanjaka/` file duplicates your local docs | Adopt upstream, archive yours if needed, update cross-references                           |

---

_Generated by Merge Conflict Resolution Agent_
_Constraint: No git operations performed_
