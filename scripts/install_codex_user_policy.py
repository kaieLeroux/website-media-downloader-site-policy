#!/usr/bin/env python3
"""Install this repository's reusable Codex routing policy for one user."""

from __future__ import annotations

import argparse
import os
import re
import shutil
import sys
import tempfile
import tomllib
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PROJECT_CONFIG = ROOT / ".codex" / "config.toml"
PROJECT_AGENTS = ROOT / ".codex" / "agents"
PROJECT_SKILL = ROOT / ".agents" / "skills" / "model-routing"

ROOT_BEGIN = "# BEGIN website-media-downloader model routing"
ROOT_END = "# END website-media-downloader model routing"
AGENTS_BEGIN = "# BEGIN website-media-downloader subagent defaults"
AGENTS_END = "# END website-media-downloader subagent defaults"
GUIDANCE_BEGIN = "<!-- BEGIN website-media-downloader model routing -->"
GUIDANCE_END = "<!-- END website-media-downloader model routing -->"

TOP_LEVEL_VALUES = {
    "model": '"gpt-5.6-sol"',
    "model_reasoning_effort": '"medium"',
    "model_verbosity": '"medium"',
    "review_model": '"gpt-5.6-terra"',
}
AGENT_VALUES = {
    "enabled": "true",
    "max_concurrent_threads_per_session": "4",
    "default_subagent_model": '"gpt-5.6-terra"',
    "default_subagent_reasoning_effort": '"medium"',
}

GLOBAL_GUIDANCE = f"""{GUIDANCE_BEGIN}
## モデル振り分けの既定

- 親タスクは GPT-5.6 Sol の Medium を安全側の既定とする。
- 明確な通常実装や調査は Terra、定型テストや機械的処理は Luna へ分ける。
- コードレビューは通常 Terra、権限・認証・セキュリティ・設計変更だけ Sol へ格上げする。
- 最も安い経路は、同じ完了条件と検証に合格した場合だけ採用する。
- 単純な一工程ではサブエージェントを作らず、独立した仕事だけを並列化する。
- 詳細な選定が必要なときは $model-routing を使う。
{GUIDANCE_END}
"""

SECTION_RE = re.compile(r"^\s*\[([^\[\]]+)\]\s*(?:#.*)?$")
ASSIGNMENT_RE = re.compile(r"^\s*([A-Za-z0-9_.-]+)\s*=")


def remove_marked_block(text: str, begin: str, end: str) -> str:
    pattern = re.compile(
        rf"(?ms)^\s*{re.escape(begin)}\s*$.*?^\s*{re.escape(end)}\s*$\n?"
    )
    return pattern.sub("", text)


def rewrite_config(existing: str) -> str:
    text = remove_marked_block(existing, ROOT_BEGIN, ROOT_END)
    text = remove_marked_block(text, AGENTS_BEGIN, AGENTS_END)

    filtered: list[str] = []
    section: str | None = None
    for line in text.splitlines():
        section_match = SECTION_RE.match(line)
        if section_match:
            section = section_match.group(1).strip()
            filtered.append(line)
            continue

        assignment = ASSIGNMENT_RE.match(line)
        key = assignment.group(1) if assignment else None
        if section is None and key in TOP_LEVEL_VALUES:
            continue
        if (
            section is None
            and key
            and key.startswith("agents.")
            and key.split(".", 1)[1] in AGENT_VALUES
        ):
            continue
        if section == "agents" and key in AGENT_VALUES:
            continue
        filtered.append(line)

    root_block = [ROOT_BEGIN]
    root_block.extend(f"{key} = {value}" for key, value in TOP_LEVEL_VALUES.items())
    root_block.append(ROOT_END)

    agent_block = [AGENTS_BEGIN]
    agent_block.extend(f"{key} = {value}" for key, value in AGENT_VALUES.items())
    agent_block.append(AGENTS_END)

    exact_agents_index = next(
        (
            i
            for i, line in enumerate(filtered)
            if SECTION_RE.match(line)
            and SECTION_RE.match(line).group(1).strip() == "agents"
        ),
        None,
    )
    child_agents_index = next(
        (
            i
            for i, line in enumerate(filtered)
            if SECTION_RE.match(line)
            and SECTION_RE.match(line).group(1).strip().startswith("agents.")
        ),
        None,
    )

    if exact_agents_index is not None:
        filtered[exact_agents_index + 1:exact_agents_index + 1] = agent_block
    elif child_agents_index is not None:
        filtered[child_agents_index:child_agents_index] = ["[agents]", *agent_block, ""]
    else:
        while filtered and not filtered[-1].strip():
            filtered.pop()
        filtered.extend(["", "[agents]", *agent_block])

    result = "\n".join([*root_block, "", *filtered]).strip() + "\n"
    tomllib.loads(result)
    return result


def rewrite_guidance(existing: str) -> str:
    retained = remove_marked_block(existing, GUIDANCE_BEGIN, GUIDANCE_END).rstrip()
    return (retained + "\n\n" if retained else "") + GLOBAL_GUIDANCE


def atomic_write(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(
        "w", encoding="utf-8", dir=path.parent, prefix=f".{path.name}.", delete=False
    ) as handle:
        handle.write(content)
        temp_path = Path(handle.name)
    os.replace(temp_path, path)


def backup_path(source: Path, destination: Path) -> None:
    if not source.exists():
        return
    destination.parent.mkdir(parents=True, exist_ok=True)
    if source.is_dir():
        shutil.copytree(source, destination)
    else:
        shutil.copy2(source, destination)


def install(codex_home: Path) -> Path:
    codex_home = codex_home.expanduser().resolve()
    if codex_home == Path(codex_home.anchor):
        raise ValueError("CODEX_HOME にファイルシステムのルートは指定できません。")

    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S.%fZ")
    backup = codex_home / "backups" / f"model-routing-{stamp}"
    backup.mkdir(parents=True, exist_ok=False)
    config_path = codex_home / "config.toml"
    guidance_path = codex_home / "AGENTS.md"
    agents_path = codex_home / "agents"
    skill_path = codex_home / "skills" / "model-routing"

    backup_path(config_path, backup / "config.toml")
    backup_path(guidance_path, backup / "AGENTS.md")
    backup_path(agents_path, backup / "agents")
    backup_path(skill_path, backup / "skills" / "model-routing")

    existing_config = config_path.read_text(encoding="utf-8") if config_path.exists() else ""
    existing_guidance = guidance_path.read_text(encoding="utf-8") if guidance_path.exists() else ""
    atomic_write(config_path, rewrite_config(existing_config))
    atomic_write(guidance_path, rewrite_guidance(existing_guidance))

    agents_path.mkdir(parents=True, exist_ok=True)
    for source in sorted(PROJECT_AGENTS.glob("*.toml")):
        shutil.copy2(source, agents_path / source.name)

    if skill_path.exists():
        shutil.rmtree(skill_path)
    skill_path.parent.mkdir(parents=True, exist_ok=True)
    shutil.copytree(PROJECT_SKILL, skill_path)

    tomllib.loads(config_path.read_text(encoding="utf-8"))
    return backup


def parse_args() -> argparse.Namespace:
    default_home = Path(os.environ.get("CODEX_HOME", Path.home() / ".codex"))
    parser = argparse.ArgumentParser(
        description="Codex のモデル振り分け設定を、既存設定を残したまま導入します。"
    )
    parser.add_argument("--codex-home", type=Path, default=default_home)
    parser.add_argument("--apply", action="store_true", help="バックアップ後に実際に適用する")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    target = args.codex_home.expanduser().resolve()
    if not args.apply:
        print(f"適用先: {target}")
        print("まだ変更していません。適用するには --apply を付けて再実行してください。")
        return 0

    try:
        backup = install(target)
    except (OSError, ValueError, tomllib.TOMLDecodeError) as exc:
        print(f"適用できませんでした: {exc}", file=sys.stderr)
        return 1

    print(f"適用しました: {target}")
    print(f"変更前のバックアップ: {backup}")
    print("新しい Codex セッションで /status と /model を確認してください。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
