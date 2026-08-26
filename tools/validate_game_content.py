"""Fast deterministic validation for content, images, and bundled audio."""

from __future__ import annotations

import ast
import re
import shutil
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA_FILE = ROOT / "web" / "app" / "game-data.ts"
AUDIO_DIR = ROOT / "web" / "public" / "audio" / "voice" / "items"
THINGS_DIR = ROOT / "web" / "public" / "things"
SERVICE_WORKER = ROOT / "web" / "public" / "sw.js"


def load_voice_items() -> list[tuple[str, str, str, str]]:
    generator = ROOT / "tools" / "generate_neural_voice_assets.py"
    tree = ast.parse(generator.read_text(encoding="utf-8"))
    for node in tree.body:
        if isinstance(node, ast.Assign) and any(
            isinstance(target, ast.Name) and target.id == "ITEMS" for target in node.targets
        ):
            return ast.literal_eval(node.value)
    raise AssertionError("ITEMS is missing from the audio generator")


def main() -> None:
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        raise RuntimeError("ffmpeg is required")

    source = DATA_FILE.read_text(encoding="utf-8")
    items = load_voice_items()
    game_ids = re.findall(r"(?:baseAtlas|expandedAtlas|directImage|extension)\('([^']+)'", source)
    voice_ids = [item_id for item_id, *_ in items]
    if len(game_ids) != len(set(game_ids)):
        raise AssertionError("Duplicate ids exist in game-data.ts")
    if set(game_ids) != set(voice_ids):
        raise AssertionError(
            f"Game/voice id mismatch: game-only={sorted(set(game_ids)-set(voice_ids))}, "
            f"voice-only={sorted(set(voice_ids)-set(game_ids))}"
        )

    service_worker_source = SERVICE_WORKER.read_text(encoding="utf-8")
    voice_list_match = re.search(r"const VOICE_IDS = \[(.*?)\];", service_worker_source, re.S)
    if not voice_list_match:
        raise AssertionError("VOICE_IDS is missing from sw.js")
    cached_voice_ids = re.findall(r"'([^']+)'", voice_list_match.group(1))
    if set(cached_voice_ids) != set(voice_ids):
        raise AssertionError("Service-worker audio list does not match the game word bank")

    for name in ("object-atlas-v2.png", "expanded-object-atlas-v1.png"):
        path = THINGS_DIR / name
        if not path.is_file() or path.stat().st_size < 100_000:
            raise AssertionError(f"Missing or unexpectedly small image atlas: {path}")

    for name in ("leaf-v1.png", "../icon-64.png", "../icon-192.png", "../icon-512.png"):
        path = THINGS_DIR / name
        if not path.is_file() or path.stat().st_size < 1_000:
            raise AssertionError(f"Missing or unexpectedly small direct image: {path}")

    pause_failures = []
    missing = []
    for item_id in voice_ids:
        path = AUDIO_DIR / f"{item_id}.mp3"
        if not path.is_file():
            missing.append(path.name)
            continue
        result = subprocess.run(
            [ffmpeg, "-hide_banner", "-i", str(path), "-af", "silencedetect=noise=-45dB:d=0.25", "-f", "null", "NUL"],
            capture_output=True,
            text=True,
            errors="replace",
        )
        durations = [
            float(value) for value in re.findall(r"silence_duration:\s*([0-9.]+)", result.stderr)
            if float(value) >= 0.35
        ]
        if len(durations) < 2 or not (0.75 <= durations[0] <= 0.95) or not (0.40 <= durations[1] <= 0.60):
            pause_failures.append((item_id, durations[:2]))

    if missing:
        raise AssertionError(f"Missing audio: {missing}")
    if pause_failures:
        raise AssertionError(f"Pause checks failed: {pause_failures}")

    builtin_count = len(re.findall(r"(?:baseAtlas|expandedAtlas|directImage)\('", source))
    extension_count = len(re.findall(r"extension\('", source))
    print(f"PASS: {builtin_count} built-in items, {extension_count} local extension items")
    print(f"PASS: {len(voice_ids)} audio clips with two valid pauses")
    print(f"PASS: {len(cached_voice_ids)} audio clips are included in the offline cache")
    print("PASS: local image atlases, leaf art, and application icons are present")


if __name__ == "__main__":
    main()
