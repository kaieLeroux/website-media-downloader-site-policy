# Repository instructions

## Purpose and scope

- This is the site-policy fork of Website Media Downloader. Preserve its client-side privacy model and the existing Chrome, Chrome-YT, Firefox, and Firefox Android targets.
- Work from evidence in the repository. Read the smallest relevant set of files; do not load bundled or minified libraries merely to gain broad context.
- Treat `src/libraries/` as vendored code. Change it only when the task explicitly concerns that dependency.
- Shared behavior belongs in the base files under `src/`. Browser-specific behavior belongs in the closest matching directory under `src/overrides/`. Verify that a change does not leak Chrome-only APIs into Firefox.

## Safety boundaries

- Do not add or widen extension permissions, host permissions, OAuth scopes, telemetry, remote processing, or release credentials unless the user explicitly requests that exact change.
- Treat changes to `src/manifest.json`, background/offscreen execution, request-header handling, downloads, authentication, release workflows, and third-party libraries as high risk.
- Preserve unrelated user changes. Never edit generated files under `build/` as source.

## Verification

- For Codex policy or documentation changes, run `python3 scripts/check_codex_policy.py` and `python3 -m unittest tests/test_codex_user_policy.py`.
- For extension source changes, run `node src/build.js all` at minimum. Inspect all three generated manifests when permissions, background execution, or overrides change.
- Minification requires temporary npm dependencies and is a release check, not the default edit-time test. Run it only when the task concerns minification or release artifacts.
- A task is not complete until relevant tests or builds pass, or the exact blocker is reported.

## Model routing

- Use the repository skill `$model-routing` when selecting a parent model, subagent model, or reasoning effort.
- The normal parent is GPT-5.6 Sol with medium reasoning. Keep simple work in one agent. Delegate only independent, bounded work whose parallelism or specialization justifies the extra context.
- Use the project agents in `.codex/agents/`: `explorer`, `implementer`, `reviewer`, `deep_reviewer`, `tester`, and `mechanical_worker`.
- Normal `/review` uses GPT-5.6 Terra through `.codex/config.toml`. Use `reviewer` for logic-heavy reviews and `deep_reviewer` only for security-sensitive, architectural, unusually broad, or repeatedly failing work.
- Use `tester` to execute already-defined checks. If a failure needs diagnosis or code changes, hand the evidence to `implementer` or the parent; do not increase the test runner's reasoning merely because a test failed.

## Code Review Rules

- Report concrete correctness, security, privacy, compatibility, regression, or missing-test findings. Do not spend review budget on style-only comments.
- Check cross-browser override behavior, Firefox manifest leakage, background/offscreen lifecycles, request and cookie handling, download cleanup, localization fallbacks, and release packaging when affected.
- State file and line evidence, user-visible impact, and the smallest safe correction. If no material findings exist, say so plainly.
