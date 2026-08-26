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
NUMBER_AUDIO_DIR = ROOT / "web" / "public" / "audio" / "voice" / "numbers"
NUMBER_PART_AUDIO_DIR = ROOT / "web" / "public" / "audio" / "voice" / "number-parts"
THINGS_DIR = ROOT / "web" / "public" / "things"
SERVICE_WORKER = ROOT / "web" / "public" / "sw.js"


def load_literal(source_file: Path, name: str):
    tree = ast.parse(source_file.read_text(encoding="utf-8"))
    for node in tree.body:
        if isinstance(node, ast.Assign) and any(
            isinstance(target, ast.Name) and target.id == name for target in node.targets
        ):
            return ast.literal_eval(node.value)
    raise AssertionError(f"{name} is missing from {source_file.name}")


def load_generator_literal(name: str):
    return load_literal(ROOT / "tools" / "generate_neural_voice_assets.py", name)


def load_voice_items() -> list[tuple[str, str, str, str]]:
    return load_generator_literal("ITEMS")


def main() -> None:
    ffmpeg = shutil.which("ffmpeg")
    ffprobe = shutil.which("ffprobe")
    if not ffmpeg or not ffprobe:
        raise RuntimeError("ffmpeg and ffprobe are required")

    source = DATA_FILE.read_text(encoding="utf-8")
    items = load_voice_items()
    numbers = load_generator_literal("NUMBERS")
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
    if "const NUMBER_VALUES = Array.from({ length: 21 }" not in service_worker_source:
        raise AssertionError("Service-worker number audio cache declaration is missing")
    if "export const NUMBER_ITEMS" not in source or "Array.from({ length: 21 }" not in source:
        raise AssertionError("0-20 number items are missing from game-data.ts")
    page_source = (ROOT / "web" / "app" / "page.tsx").read_text(encoding="utf-8")
    if "const NUMBER_QUESTIONS_PER_ROUND = 2" not in page_source:
        raise AssertionError("Each round must include exactly two number questions")

    for name in ("object-atlas-v2.png", "expanded-object-atlas-v1.png"):
        path = THINGS_DIR / name
        if not path.is_file() or path.stat().st_size < 100_000:
            raise AssertionError(f"Missing or unexpectedly small image atlas: {path}")

    direct_image_paths = re.findall(
        r"directImage\('[^']+', '[^']+', '[^']+', '[^']+', '[^']+', '([^']+)'\)", source
    )
    cached_image_match = re.search(r"const DIRECT_IMAGE_IDS = \[(.*?)\];", service_worker_source, re.S)
    if not cached_image_match:
        raise AssertionError("DIRECT_IMAGE_IDS is missing from sw.js")
    cached_image_ids = re.findall(r"'([^']+)'", cached_image_match.group(1))
    expected_image_ids = [Path(path).stem.removesuffix("-v1") for path in direct_image_paths]
    if set(cached_image_ids) != set(expected_image_ids):
        raise AssertionError("Service-worker direct image list does not match game-data.ts")
    for relative_path in direct_image_paths:
        path = ROOT / "web" / "public" / relative_path
        if not path.is_file() or path.stat().st_size < 1_000:
            raise AssertionError(f"Missing or unexpectedly small direct image: {path}")

    for name in ("../icon-64.png", "../icon-192.png", "../icon-512.png"):
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

    number_pause_failures = []
    missing_numbers = []
    expected_values = list(range(21))
    if [value for value, *_ in numbers] != expected_values:
        raise AssertionError("The number narration list must cover 0 through 20 in order")
    for value in expected_values:
        path = NUMBER_AUDIO_DIR / f"{value}.mp3"
        if not path.is_file():
            missing_numbers.append(path.name)
            continue
        result = subprocess.run(
            [ffmpeg, "-hide_banner", "-i", str(path), "-af", "silencedetect=noise=-45dB:d=0.25", "-f", "null", "NUL"],
            capture_output=True,
            text=True,
            errors="replace",
        )
        durations = [
            float(duration) for duration in re.findall(r"silence_duration:\s*([0-9.]+)", result.stderr)
            if float(duration) >= 0.35
        ]
        if not durations or not (0.40 <= durations[0] <= 0.60):
            number_pause_failures.append((value, durations[:1]))

    if missing_numbers:
        raise AssertionError(f"Missing number audio: {missing_numbers}")
    if number_pause_failures:
        raise AssertionError(f"Number pause checks failed: {number_pause_failures}")

    part_generator = ROOT / "tools" / "generate_number_part_assets.py"
    english_parts = load_literal(part_generator, "ENGLISH_PARTS")
    chinese_parts = load_literal(part_generator, "CHINESE_PARTS")
    for variable, expected in (("ENGLISH_NUMBER_PARTS", english_parts), ("CHINESE_NUMBER_PARTS", chinese_parts.keys())):
        match = re.search(rf"const {variable} = \[(.*?)\];", service_worker_source, re.S)
        if not match or set(re.findall(r"'([^']+)'", match.group(1))) != set(expected):
            raise AssertionError(f"Service-worker {variable} does not match the number speech generator")
    missing_parts = []
    invalid_part_durations = []
    for language, part_ids in (("en", english_parts), ("zh", chinese_parts.keys())):
        for part_id in part_ids:
            path = NUMBER_PART_AUDIO_DIR / language / f"{part_id}.mp3"
            if not path.is_file() or path.stat().st_size < 1_000:
                missing_parts.append(f"{language}/{part_id}.mp3")
                continue
            result = subprocess.run(
                [ffprobe, "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", str(path)],
                capture_output=True,
                text=True,
                check=True,
            )
            duration = float(result.stdout.strip())
            if not 0.12 <= duration <= 1.8:
                invalid_part_durations.append((language, part_id, round(duration, 3)))
    if missing_parts:
        raise AssertionError(f"Missing number speech parts: {missing_parts}")
    if invalid_part_durations:
        raise AssertionError(f"Unexpected number speech part durations: {invalid_part_durations}")

    builtin_count = len(re.findall(r"(?:baseAtlas|expandedAtlas|directImage)\('", source))
    extension_count = len(re.findall(r"extension\('", source))
    print(f"PASS: {builtin_count} built-in items, {extension_count} local extension items")
    print(f"PASS: {len(voice_ids)} audio clips with two valid pauses")
    print("PASS: 21 number clips (0-20) with a valid English-Chinese pause")
    print(f"PASS: {len(english_parts)} English and {len(chinese_parts)} Chinese local number speech parts")
    print(f"PASS: {len(cached_voice_ids)} audio clips are included in the offline cache")
    print(f"PASS: local image atlases, {len(direct_image_paths)} direct pictures, and application icons are present")


if __name__ == "__main__":
    main()
