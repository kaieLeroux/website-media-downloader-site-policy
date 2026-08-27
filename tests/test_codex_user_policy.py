from __future__ import annotations

import subprocess
import sys
import tempfile
import tomllib
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
INSTALLER = ROOT / "scripts" / "install_codex_user_policy.py"


class InstallCodexUserPolicyTests(unittest.TestCase):
    def run_installer(
        self, codex_home: Path, apply: bool = True
    ) -> subprocess.CompletedProcess[str]:
        command = [sys.executable, str(INSTALLER), "--codex-home", str(codex_home)]
        if apply:
            command.append("--apply")
        return subprocess.run(command, cwd=ROOT, text=True, capture_output=True, check=False)

    def test_dry_run_does_not_create_target(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            codex_home = Path(temp_dir) / "codex-home"
            result = self.run_installer(codex_home, apply=False)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertFalse(codex_home.exists())

    def test_apply_preserves_other_config_and_is_idempotent(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            codex_home = Path(temp_dir) / "codex-home"
            codex_home.mkdir()
            (codex_home / "config.toml").write_text(
                """model = "legacy"
model_reasoning_effort = "xhigh"
review_model = "gpt-5.6-sol"
[features]
apps = true

[agents]
max_concurrent_threads_per_session = 2
default_subagent_model = "gpt-5.6-sol"

[agents.local]
description = "preserve me"
config_file = "local.toml"
""",
                encoding="utf-8",
            )
            (codex_home / "AGENTS.md").write_text("# Existing guidance\n", encoding="utf-8")
            old_skill = codex_home / "skills" / "model-routing"
            old_skill.mkdir(parents=True)
            (old_skill / "SKILL.md").write_text("old skill\n", encoding="utf-8")

            first = self.run_installer(codex_home)
            self.assertEqual(first.returncode, 0, first.stderr)
            second = self.run_installer(codex_home)
            self.assertEqual(second.returncode, 0, second.stderr)

            config_text = (codex_home / "config.toml").read_text(encoding="utf-8")
            config = tomllib.loads(config_text)
            self.assertEqual(config["model"], "gpt-5.6-sol")
            self.assertEqual(config["model_reasoning_effort"], "medium")
            self.assertEqual(config["review_model"], "gpt-5.6-terra")
            self.assertTrue(config["features"]["apps"])
            self.assertEqual(config["agents"]["local"]["description"], "preserve me")
            self.assertEqual(config_text.count("BEGIN website-media-downloader model routing"), 1)
            self.assertEqual(config_text.count("BEGIN website-media-downloader subagent defaults"), 1)

            guidance = (codex_home / "AGENTS.md").read_text(encoding="utf-8")
            self.assertIn("# Existing guidance", guidance)
            self.assertEqual(guidance.count("BEGIN website-media-downloader model routing"), 1)
            self.assertTrue((codex_home / "agents" / "reviewer.toml").exists())
            self.assertTrue((codex_home / "skills" / "model-routing" / "SKILL.md").exists())
            backups = list((codex_home / "backups").glob("model-routing-*"))
            self.assertGreaterEqual(len(backups), 2)

    def test_dotted_agent_defaults_are_replaced(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            codex_home = Path(temp_dir) / "codex-home"
            codex_home.mkdir()
            (codex_home / "config.toml").write_text(
                'agents.default_subagent_model = "gpt-5.6-sol"\n'
                'agents.default_subagent_reasoning_effort = "high"\n',
                encoding="utf-8",
            )

            result = self.run_installer(codex_home)
            self.assertEqual(result.returncode, 0, result.stderr)
            config = tomllib.loads(
                (codex_home / "config.toml").read_text(encoding="utf-8")
            )
            self.assertEqual(
                config["agents"]["default_subagent_model"], "gpt-5.6-terra"
            )
            self.assertEqual(
                config["agents"]["default_subagent_reasoning_effort"], "medium"
            )


if __name__ == "__main__":
    unittest.main()
