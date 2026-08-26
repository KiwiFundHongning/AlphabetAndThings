"""Validate the 0–20 English/Mandarin number narration with offline ASR."""

from __future__ import annotations

import argparse
import json
import re
import shutil
import tempfile
from pathlib import Path

from faster_whisper import WhisperModel

from generate_neural_voice_assets import NUMBERS
from validate_voice_assets import (
    extract_wav,
    normalize_chinese,
    normalize_english,
    repeat_wav,
    repeated_match,
    run_text,
    transcribe,
)


def number_match(text: str, expected_word: str, expected_chinese: str, value: int, language: str) -> bool:
    normalized = normalize_english(text) if language == "en" else normalize_chinese(text)
    expected = normalize_english(expected_word) if language == "en" else expected_chinese
    if repeated_match(normalized, {expected}):
        return True
    # Speech recognizers often normalize a spoken number to Arabic digits. This
    # is semantically the same recognition result and must not be rejected.
    digits = "".join(re.findall(r"\d", text))
    numeric = str(value)
    return bool(digits) and any(digits == numeric * count for count in range(1, 6))


def clip_boundaries(ffmpeg: str, ffprobe: str, source: Path) -> tuple[list[tuple[float, float]], float]:
    log = run_text([
        ffmpeg, "-hide_banner", "-i", str(source), "-af",
        "silencedetect=noise=-45dB:d=0.25", "-f", "null", "NUL",
    ])
    starts = [float(value) for value in re.findall(r"silence_start:\s*([0-9.]+)", log)]
    ends = [float(value) for value in re.findall(r"silence_end:\s*([0-9.]+)", log)]
    pauses = [(start, end) for start, end in zip(starts, ends) if start > 0.1 and end - start >= 0.3]
    if not pauses:
        raise ValueError(f"Expected an English–Chinese pause in {source.name}")
    pause = pauses[0]
    duration = float(run_text([
        ffprobe, "-v", "error", "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1", str(source),
    ]).strip())
    return [(0.0, pause[0]), (pause[1], duration)], round(pause[1] - pause[0], 3)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--report", type=Path)
    parser.add_argument("--model", default="small")
    parser.add_argument("--values", help="Optional comma-separated values, for example 0,5,20")
    parser.add_argument("--skip-chinese", action="store_true")
    args = parser.parse_args()

    ffmpeg = shutil.which("ffmpeg")
    ffprobe = shutil.which("ffprobe")
    if not ffmpeg or not ffprobe:
        raise RuntimeError("ffmpeg and ffprobe are required")

    selected_values = {
        int(value.strip()) for value in args.values.split(",") if value.strip()
    } if args.values else None
    selected_numbers = [item for item in NUMBERS if selected_values is None or item[0] in selected_values]
    model = WhisperModel(args.model, device="cpu", compute_type="int8")
    results = []

    with tempfile.TemporaryDirectory(prefix="alphabet-number-voice-check-") as temp_dir:
        temp_root = Path(temp_dir)
        for value, english, chinese in selected_numbers:
            source = args.input / f"{value}.mp3"
            boundaries, pause = clip_boundaries(ffmpeg, ffprobe, source)
            english_wav = temp_root / f"{value}-en.wav"
            chinese_wav = temp_root / f"{value}-zh.wav"
            extract_wav(ffmpeg, source, *boundaries[0], english_wav)
            extract_wav(ffmpeg, source, *boundaries[1], chinese_wav)
            english_repeated = temp_root / f"{value}-en-repeated.wav"
            chinese_repeated = temp_root / f"{value}-zh-repeated.wav"
            repeat_wav(ffmpeg, english_wav, english_repeated)
            repeat_wav(ffmpeg, chinese_wav, chinese_repeated)

            english_text = transcribe(model, english_repeated, "en")
            chinese_text = "not checked" if args.skip_chinese else transcribe(model, chinese_repeated, "zh")
            checks = {
                "english": number_match(english_text, english, chinese, value, "en"),
                "pause": 0.40 <= pause <= 0.60,
            }
            if not args.skip_chinese:
                checks["chinese"] = number_match(chinese_text, english, chinese, value, "zh")
            row = {
                "value": value,
                "expected": [english, chinese],
                "transcribed": [english_text, chinese_text],
                "pause_seconds": pause,
                "checks": checks,
                "passed": all(checks.values()),
            }
            results.append(row)
            print(
                f"{value:2}: {english_text!r} | {chinese_text!r} | pause={pause} "
                f"| {'PASS' if row['passed'] else 'REVIEW'}",
                flush=True,
            )

    report = {
        "model": args.model,
        "clips": len(results),
        "passed": sum(1 for row in results if row["passed"]),
        "results": results,
    }
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Validated {report['passed']}/{report['clips']} number clips")
    if report["passed"] != report["clips"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
