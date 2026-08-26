"""Validate the bundled clips with pause detection and offline speech recognition."""

from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
import tempfile
from pathlib import Path

from faster_whisper import WhisperModel

from generate_neural_voice_assets import ITEMS, LETTER_NAMES

LETTER_TRANSCRIPTS = {
    "A": {"a", "ay"}, "B": {"b", "bee"}, "C": {"c", "see"},
    "D": {"d", "dee"}, "E": {"e", "ee"}, "F": {"f", "eff"},
    "G": {"g", "gee"}, "H": {"h", "aitch"}, "I": {"i", "eye"},
    "J": {"j", "jay"}, "K": {"k", "kay"}, "L": {"l", "el"},
    "M": {"m", "em"}, "N": {"n", "en"}, "O": {"o", "oh"},
    "P": {"p", "pea", "pee"}, "R": {"r", "are"},
    "S": {"s", "ess"}, "T": {"t", "tea", "tee"},
    "U": {"u", "you"}, "W": {"w", "doubleu", "doubleyou"},
    "Z": {"z", "zee"},
}
MINIMUM_LETTER_SECONDS = {"A": 0.45, "E": 0.42, "P": 0.44}
WORD_TRANSCRIPT_ALIASES = {
    # The spoken word "bee" and the letter name B are true English homophones.
    "bee": {"bee", "b"},
    "pear": {"pear", "pair"},
    "sun": {"sun", "son"},
}


def normalize_english(text: str) -> str:
    return re.sub(r"[^a-z]", "", text.lower())


def normalize_chinese(text: str) -> str:
    simplified_equivalents = str.maketrans({
        "蘋": "苹", "貓": "猫", "雞": "鸡", "魚": "鱼", "風": "风",
        "箏": "筝", "獅": "狮", "陽": "阳", "車": "车", "傘": "伞",
        "鯨": "鲸", "馬": "马",
    })
    return "".join(re.findall(r"[\u3400-\u9fff]", text)).translate(simplified_equivalents)


def repeated_match(actual: str, expected: set[str]) -> bool:
    return any(actual == value * count for value in expected for count in range(1, 5))


def english_word_match(actual_text: str, expected: set[str]) -> bool:
    if repeated_match(normalize_english(actual_text), expected):
        return True
    # ASR commonly inserts an article before isolated concrete nouns even when
    # the audio contains only the noun. Compare again without whole-word articles.
    tokens = [token for token in re.findall(r"[a-z]+", actual_text.lower()) if token not in {"a", "the"}]
    return repeated_match("".join(tokens), expected)


def run_text(command: list[str]) -> str:
    result = subprocess.run(command, check=True, capture_output=True, text=True, errors="replace")
    return result.stdout + result.stderr


def clip_boundaries(ffmpeg: str, ffprobe: str, source: Path) -> tuple[list[tuple[float, float]], list[float]]:
    log = run_text([
        ffmpeg, "-hide_banner", "-i", str(source), "-af",
        "silencedetect=noise=-45dB:d=0.25", "-f", "null", "NUL",
    ])
    starts = [float(value) for value in re.findall(r"silence_start:\s*([0-9.]+)", log)]
    ends = [float(value) for value in re.findall(r"silence_end:\s*([0-9.]+)", log)]
    # Ignore a codec/voice leading pad that can be detected as a short silence.
    silences = [(start, end) for start, end in zip(starts, ends) if start > 0.1 and end - start >= 0.3]
    if len(silences) < 2:
        raise ValueError(f"Expected two pauses in {source.name}, found {len(silences)}")
    silences = silences[:2]
    duration = float(run_text([
        ffprobe, "-v", "error", "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1", str(source),
    ]).strip())
    first, second = silences
    segments = [
        (0.0, first[0]),
        (first[1], second[0]),
        (second[1], duration),
    ]
    return segments, [round(end - start, 3) for start, end in silences]


def extract_wav(ffmpeg: str, source: Path, start: float, end: float, destination: Path) -> None:
    subprocess.run([
        ffmpeg, "-hide_banner", "-loglevel", "error", "-y",
        # Keep generous silence around the speech so quiet plosives and
        # fricatives are never clipped by the silence detector.
        "-ss", f"{max(0, start - 0.42):.3f}", "-to", f"{end + 0.25:.3f}",
        "-i", str(source), "-ar", "16000", "-ac", "1", str(destination),
    ], check=True)


def repeat_wav(ffmpeg: str, source: Path, destination: Path) -> None:
    subprocess.run([
        ffmpeg, "-hide_banner", "-loglevel", "error", "-y", "-i", str(source),
        "-filter_complex",
        "[0:a]asplit=3[a][b][c];anullsrc=r=16000:cl=mono:d=0.25,asplit=2[s1][s2];"
        "[a][s1][b][s2][c]concat=n=5:v=0:a=1[out]",
        "-map", "[out]", str(destination),
    ], check=True)


def transcribe(model: WhisperModel, source: Path, language: str) -> str:
    segments, _ = model.transcribe(
        str(source), language=language, beam_size=5, temperature=0,
        condition_on_previous_text=False,
    )
    return "".join(segment.text for segment in segments).strip()


def trimmed_speech_duration(ffmpeg: str, ffprobe: str, source: Path, destination: Path) -> float:
    trim = (
        "silenceremove=start_periods=1:start_duration=0.02:start_threshold=-55dB,"
        "areverse,silenceremove=start_periods=1:start_duration=0.02:"
        "start_threshold=-55dB,areverse"
    )
    subprocess.run([
        ffmpeg, "-hide_banner", "-loglevel", "error", "-y", "-i", str(source),
        "-af", trim, str(destination),
    ], check=True)
    return float(run_text([
        ffprobe, "-v", "error", "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1", str(destination),
    ]).strip())


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--report", type=Path)
    parser.add_argument("--model", default="small")
    parser.add_argument("--ids", help="Optional comma-separated item ids, for example apple,kite")
    parser.add_argument("--skip-chinese", action="store_true", help="Check only letter names and English words")
    parser.add_argument("--skip-letters", action="store_true", help="Check only word speech and pauses")
    args = parser.parse_args()

    ffmpeg = shutil.which("ffmpeg")
    ffprobe = shutil.which("ffprobe")
    if not ffmpeg or not ffprobe:
        raise RuntimeError("ffmpeg and ffprobe are required")

    selected_ids = {
        value.strip().lower() for value in args.ids.split(",") if value.strip()
    } if args.ids else None
    selected_items = [item for item in ITEMS if selected_ids is None or item[0] in selected_ids]
    model = WhisperModel(args.model, device="cpu", compute_type="int8")
    results = []
    with tempfile.TemporaryDirectory(prefix="alphabet-voice-check-") as temp_dir:
        temp_root = Path(temp_dir)
        for item_id, letter, word, chinese in selected_items:
            source = args.input / f"{item_id}.mp3"
            boundaries, pauses = clip_boundaries(ffmpeg, ffprobe, source)
            wavs = [temp_root / f"{item_id}-{part}.wav" for part in ("letter", "word", "zh")]
            for boundary, wav in zip(boundaries, wavs):
                extract_wav(ffmpeg, source, *boundary, wav)
            repeated_wavs = [temp_root / f"{item_id}-{part}-repeated.wav" for part in ("letter", "word", "zh")]
            for wav, repeated in zip(wavs, repeated_wavs):
                repeat_wav(ffmpeg, wav, repeated)

            letter_duration = trimmed_speech_duration(
                ffmpeg, ffprobe, wavs[0], temp_root / f"{item_id}-letter-trimmed.wav"
            )

            letter_text = transcribe(model, repeated_wavs[0], "en")
            word_text = transcribe(model, repeated_wavs[1], "en")
            chinese_text = "not checked" if args.skip_chinese else transcribe(model, repeated_wavs[2], "zh")
            normalized_letter = normalize_english(letter_text)
            normalized_word = normalize_english(word_text)
            normalized_chinese = "" if args.skip_chinese else normalize_chinese(chinese_text)
            checks = {
                "letter_encoding": LETTER_NAMES.get(letter) == letter,
                "word": english_word_match(
                    word_text,
                    WORD_TRANSCRIPT_ALIASES.get(item_id, {normalize_english(word)}),
                ),
                "pauses": 0.75 <= pauses[0] <= 0.95 and 0.40 <= pauses[1] <= 0.60,
            }
            if not args.skip_letters:
                checks["letter"] = repeated_match(normalized_letter, LETTER_TRANSCRIPTS[letter])
                checks["letter_duration"] = letter_duration >= MINIMUM_LETTER_SECONDS.get(letter, 0.39)
            if not args.skip_chinese:
                checks["chinese"] = repeated_match(normalized_chinese, {chinese})
            row = {
                "id": item_id,
                "letter": letter,
                "expected": [letter, word, chinese],
                "transcribed": [letter_text, word_text, chinese_text],
                "letter_speech_seconds": round(letter_duration, 3),
                "pauses_seconds": pauses,
                "checks": checks,
                "passed": all(checks.values()),
            }
            results.append(row)
            print(
                f"{item_id}: {letter_text!r} | {word_text!r} | {chinese_text!r} "
                f"| pauses={pauses} | {'PASS' if row['passed'] else 'REVIEW'}",
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
    print(f"Validated {report['passed']}/{report['clips']} clips")
    if report["passed"] != report["clips"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
