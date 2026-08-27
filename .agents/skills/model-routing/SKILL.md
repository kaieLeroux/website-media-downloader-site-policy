---
name: model-routing
description: Select the lowest-cost GPT-5.6 model and reasoning effort that still meets a task's quality bar. Use when routing parent work, subagents, code review, testing, or repeatable bulk work in this repository.
---

# Model Routing

Route by uncertainty and consequence, not by prompt length alone. Accuracy comes
first; cost and latency are optimized only after the acceptance criteria and
verification path are clear.

## Baseline routes

| Work | Model and effort | Use when |
| --- | --- | --- |
| Parent orchestration | `gpt-5.6-sol`, `medium` | The request is ambiguous, multi-step, high-value, or owns the final synthesis. |
| Everyday implementation | `gpt-5.6-terra`, `medium` | Scope and acceptance criteria are clear but code judgment is still required. |
| Repository exploration | `gpt-5.6-terra`, `low` | Read-heavy tracing can return distilled evidence to the parent. |
| Normal code review | `gpt-5.6-terra`, `medium` through `/review` | A bounded diff has ordinary product risk. |
| Logic-heavy review | `gpt-5.6-terra`, `high` | Cross-file behavior, edge cases, or compatibility need deeper checking. |
| High-risk review | `gpt-5.6-sol`, `high` | Permissions, auth, privacy, security, release, architecture, or a broad diff is involved. |
| Deterministic tests | `gpt-5.6-luna`, `low` | Commands and pass/fail criteria are already defined. |
| Mechanical bulk work | `gpt-5.6-luna`, `low` | The transformation is repeatable and independently verifiable. |

## Escalation and demotion

1. Start at the baseline route.
2. Escalate one step when requirements conflict, the failure cost is high, the
   relevant execution path cannot be bounded, verification is weak, or a lower
   route has already failed for a reasoning-related cause.
3. Use `xhigh` or `max` only for the hardest quality-first task after `high` has
   shown a real gap. Do not use Max merely because the repository or prompt is
   large.
4. Demote only after a representative task passes the same acceptance checks on
   the cheaper route. Never infer adequacy from a fluent answer alone.

## Context discipline

- Begin with the diff, entry points, and targeted search. Do not preload the
  whole repository or bundled libraries.
- Give each subagent only the files, constraints, and definition of done it
  needs. Ask it to return distilled evidence rather than raw file dumps.
- Split independent work by responsibility. Do not create agents for a simple
  one-file task, and do not have several agents reread the same large context.
- Keep the parent responsible for synthesis, acceptance checks, and escalation.
  A subagent result is evidence, not completion.

## Verification rule

No model or effort guarantees error-free work. The route is acceptable only
when the repository's build, tests, review rules, or another observable check
meets the stated definition of done. Record recurring failures in `AGENTS.md` or
this skill only when they represent a repeatable workflow lesson.
