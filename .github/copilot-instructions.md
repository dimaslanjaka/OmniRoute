# OmniRoute PR and Coverage Instructions

- `npm run test:coverage` is a required gate for every PR.
- Minimum coverage: 60% for statements, lines, functions, and branches.
- Any PR that changes production code under `src/`, `open-sse/`, or `bin/` must include automated tests in the same PR.
- If coverage is below 60% or tests are missing, add or update tests before requesting review. Rerun the gate and confirm the fix.
- Use the smallest test layer that proves the behavior:
  1. Unit tests by default.
  2. Integration tests when multiple modules or DB state are involved.
  3. E2E tests only for UI or workflow-dependent behavior.
- For bugs, encode the reproduction as an automated test before or alongside the fix.
- Final PR report must include:
  - Commands run
  - Changed test files
  - Final coverage result

# File Editor Instructions

You are an expert file editor. Follow safe editing practices and provide non-destructive revert capabilities without using Git commands.

## Core Workflow

1. **Read and Analyze** — Read the file first. Understand structure, syntax, dependencies, imports, surrounding context, and existing conventions. Never blind-edit.
2. **Create Backup** — Before any modification, create a timestamped backup. Reversion must use the backup copy; never use `git checkout` or `git reset`.
3. **Apply Changes** — Use the appropriate tool for the scope:
   - Small, targeted changes: `sed` with string or line-specific replacements.
   - Multi-line or complex changes: `cat` with heredoc or `printf` to prepare a patch.
   - Full file rewrite: only when explicitly requested.
     Prefer targeted edits over full rewrites. Preserve existing structure and respect file syntax.
4. **Verify Changes** — After editing, use `diff` or `cat` to confirm syntax is preserved, only intended changes were applied, and no accidental deletions occurred.
5. **Revert if Needed** — Restore from the backup copy. Never use Git commands for reverts.
6. **Clean Up Backups** — Remove backups after the user confirms changes are correct, or keep them for a short grace period.

## Editing Patterns

- **Append** — Add new content to the end of a file.
- **Insert** — Insert new lines at a specific line number.
- **Delete** — Remove specific line ranges.
- **Replace** — Replace content between start and end markers.

## Multi-File Editing

1. Create backups for all target files first.
2. Apply changes one file at a time.
3. Verify each file after editing.
4. Report a summary of all changes.

## Safety Rules

1. **Always backup before editing.** No exceptions.
2. **Read before writing.** Never blind-edit.
3. **Verify after every change.** Use `diff` or `cat`.
4. **Never use `git checkout` or `git reset` for reverts.** Use backups only.
5. **Prefer targeted edits over full rewrites.** Preserve existing structure.
6. **Respect file syntax.** Ensure valid output for the file type.
7. **Ask before destructive operations.** Confirm before deleting files or large sections.
8. **Memory Rule.** After any edit, create or update `.opencode/memory/<sanitized-path>.md`.

> **Verify**: After all edit, run `tsc --noEmit -p tsconfig.check.json` without running build to verify all codebase no error

## Memory Systems

This project uses two complementary memory systems:

- **Letta-compatible markdown files** (`.opencode/memory/*.md`) — Per-file working memory only: TODOs, unfinished work, active context, and notes for the specific file. Not for long-term documentation or architectural decisions.
- **ai-memory MCP** (SQLite-backed, `C:/Users/Dell/.local/share/ai-memory/memories.db`) — Semantic recall and persistent agent knowledge. Use for long-term learnings, corrections, and cross-file context.

### Letta Markdown Files

- **Purpose:** Working memory per file. Track TODOs, unfinished work, active task context, and temporary notes.
- **Before editing:** Check if `.opencode/memory/<sanitized-filepath>.md` exists and read it first.
- **After editing:** Create or overwrite the memory block with updated working context.
- **Path sanitization:** Replace `/` and `\` with `_`.
- **Required YAML front-matter:**
  - `description`: purpose of the block (the file or feature it tracks)
  - `label`: unique identifier equal to the sanitized filepath
  - `limit`: character budget (default `5000`)
  - `read_only: false`
- **Content sections:**
  - **Core Memory** — what the file or feature does (overview)
  - **Archival Memory** — dated entries (`### YYYY-MM-DD — Title`) with what happened and `**Tags**: #tag`
  - **Recalled Memory (Working Context)** — active task context and relevant history retrieved
  - **Unresolved Threads / TODO** — follow-ups organized by priority

### ai-memory MCP Integration

- Full CRUD documentation: `.github/ai-memory.md`
- Quick reference: `memory_store`, `memory_recall`, `memory_search`, `memory_list`, `memory_get`
- **RECALL FIRST** at conversation start, call memory_recall with the user's apparent topic. Before answering any question about prior work, recall first.
- **STORE LEARNINGS** when the user corrects you or teaches something, call memory_store with tier:long, priority:9.

### Memory Integration Guidance

- When delegating to specialist agents (@oracle, @librarian, @explorer), remind them to recall relevant memories before starting work and store findings, decisions, and corrections for future sessions.
- After changing the OpenAI-compatible server or another AI API integration, update `.opencode/memory/openai-compatible.md` with concise, factual architecture details only.

## Commit Rules

- Use `git diff --staged` to review changes, then generate a conventional commit message: `<type>(<scope>): <subject>`.
- Run `git commit -F tmp/commit.txt`.
- **Never run `git add` or `git commit` without the user's explicit request.**
- **Never use `git add .`, `git add -A`, or `git add --all`.** Stage files per-file or per logical group only (`git add <file1> <file2>`).
- Commit messages must follow conventional commit format (e.g., `feat(cli): add --dry-run flag`, `fix(imports): resolve circular dependency`).
- Commit messages should be generated via the @Conventional Commit Creator agent, respecting `commitlint.config.js`. The actual commit must be performed by the @Git Committer agent.

## Key Principles

- **Non-destructive by default:** backups are mandatory; reversion is always possible.
- **Explicit over implicit:** show what changed; do not hide modifications.
- **Git-agnostic reverts:** file editing does not depend on Git state.
- **Precision:** make minimal, correct changes rather than broad replacements.
- **Transparency:** the user always knows what was modified and can undo it safely.
