#!/usr/bin/env python3
"""Validate the repository's Codex routing configuration without dependencies."""

from __future__ import annotations

import sys
import tomllib
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
EXPECTED_AGENTS = {
    "deep-reviewer.toml": ("deep_reviewer", "gpt-5.6-sol", "high"),
    "explorer.toml": ("explorer", "gpt-5.6-terra", "low"),
    "implementer.toml": ("implementer", "gpt-5.6-terra", "medium"),
    "mechanical-worker.toml": ("mechanical_worker", "gpt-5.6-luna", "low"),
    "reviewer.toml": ("reviewer", "gpt-5.6-terra", "high"),
    "tester.toml": ("tester", "gpt-5.6-luna", "low"),
}


def load_toml(path: Path) -> dict:
    return tomllib.loads(path.read_text(encoding="utf-8"))


def check() -> list[str]:
    errors: list[str] = []
    config_path = ROOT / ".codex" / "config.toml"
    try:
        config = load_toml(config_path)
    except (OSError, tomllib.TOMLDecodeError) as exc:
        return [f"{config_path}: {exc}"]

    expected_config = {
        "model": "gpt-5.6-sol",
        "model_reasoning_effort": "medium",
        "review_model": "gpt-5.6-terra",
    }
    for key, expected in expected_config.items():
        if config.get(key) != expected:
            errors.append(f"config.toml: {key} must be {expected!r}")

    agents_config = config.get("agents", {})
    if agents_config.get("default_subagent_model") != "gpt-5.6-terra":
        errors.append("config.toml: default subagent model must be gpt-5.6-terra")
    if agents_config.get("default_subagent_reasoning_effort") != "medium":
        errors.append("config.toml: default subagent effort must be medium")

    agent_dir = ROOT / ".codex" / "agents"
    actual_names = {path.name for path in agent_dir.glob("*.toml")}
    if actual_names != set(EXPECTED_AGENTS):
        errors.append(
            f"agent files differ: expected {sorted(EXPECTED_AGENTS)}, got {sorted(actual_names)}"
        )

    for filename, (name, model, effort) in EXPECTED_AGENTS.items():
        path = agent_dir / filename
        if not path.exists():
            continue
        try:
            data = load_toml(path)
        except (OSError, tomllib.TOMLDecodeError) as exc:
            errors.append(f"{path}: {exc}")
            continue
        for key in ("name", "description", "developer_instructions"):
            if not data.get(key):
                errors.append(f"{filename}: missing {key}")
        if data.get("name") != name or data.get("model") != model or data.get("model_reasoning_effort") != effort:
            errors.append(f"{filename}: unexpected name/model/effort route")

    skill = ROOT / ".agents" / "skills" / "model-routing" / "SKILL.md"
    skill_text = skill.read_text(encoding="utf-8") if skill.exists() else ""
    if "name: model-routing" not in skill_text or "[TODO" in skill_text:
        errors.append("model-routing skill is missing or unfinished")

    agents_md = ROOT / "AGENTS.md"
    if not agents_md.exists() or agents_md.stat().st_size > 32768:
        errors.append("AGENTS.md is missing or exceeds the default 32 KiB instruction budget")

    docs = ROOT / "docs" / "CODEX_MODEL_ROUTING_JA.md"
    docs_text = docs.read_text(encoding="utf-8") if docs.exists() else ""
    for required in (
        "https://github.com/kaieLeroux/website-media-downloader-site-policy",
        "https://learn.chatgpt.com/docs/models",
        "https://developers.openai.com/api/docs/pricing",
    ):
        if required not in docs_text:
            errors.append(f"documentation is missing {required}")

    return errors


def main() -> int:
    errors = check()
    if errors:
        for error in errors:
            print(f"[ERROR] {error}", file=sys.stderr)
        return 1
    print("[OK] Codex model-routing policy is valid")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
