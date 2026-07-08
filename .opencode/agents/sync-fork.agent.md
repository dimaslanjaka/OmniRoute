---
id: upstream-sync-policy
title: Upstream Sync Policy
description: Guidelines for synchronizing this fork with the upstream OmniRoute repository, including remote setup, sync cadence, workflow, and commercial guardrails.
---

# Upstream Sync Policy

This fork tracks [`diegosouzapw/OmniRoute`](https://github.com/diegosouzapw/OmniRoute).

---

## Local Remote Setup

```bash
git remote add upstream https://github.com/diegosouzapw/OmniRoute.git
git fetch upstream
```

---

## Sync Cadence

| Frequency     | Action                                                            |
| ------------- | ----------------------------------------------------------------- |
| **Weekly**    | Check upstream while this repo is actively evaluated.             |
| **Per sync**  | Fast-forward cleanly when possible.                               |
| **Per sync**  | Keep NorthernAI commits small so upstream merges stay reviewable. |
| **Post-sync** | Re-run the repo's own tests and build after each upstream sync.   |

---

## Suggested Sync Flow

```bash
git checkout main
git fetch origin
git fetch upstream
git merge --ff-only upstream/main
git push origin main
```

> **Note:** If a fast-forward is not possible, create a dedicated sync branch, resolve conflicts there, and only then update `main`.

---

## Commercial Guardrails

- ✅ Keep upstream license and notices intact.
- ✅ Do not remove upstream attribution.
- ✅ Keep paid hosted/team features in NorthernAI-owned layers unless the upstream license and contribution policy clearly permit deeper changes.
