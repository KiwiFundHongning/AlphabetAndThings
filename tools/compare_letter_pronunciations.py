"""Compare short English letter-name pronunciations before bundling them."""

from __future__ import annotations

import argparse
import asyncio
import re
import shutil
import subprocess
import tempfile
from pathlib import Path

import edge_tts
from faster_whisper import WhisperModel


VOICES = [
    "en-US-AvaMultilingualNeural",
    "en-US-JennyNeural",
]
RATES = ["-25%", "-35%", "-45%"]
SPELLINGS = {
    "A": ["A"],
    "E": ["E"],
    "P": ["P"],
    "R": ["R"],
    "W": ["W"],
}
EXPECTED = {
    "A": {"a", "ay", "aye"},
    "E": {"e"},
    "P": {"p", "pea", "pee"},
    "R": {"r", "are"},
    "W": {"w", "doubleu", "doubleyou"},
}


def run_text(command: list[str]) -> str:
    result = subprocess.run(command, check=True, capture_output=True, text=True, errors="replace")
    return result.stdout.strip()


def normalize(text: str) -> str:
    return re.sub(r"[^a-z]", "", text.lower())


def repeated_match(actual: str, expected: set[str]) -> bool:
    return any(actual == value * count for value in expected for count in range(1, 5))


def prepare_audio(ffmpeg: str, source: Path, trimmed: Path, repeated: Path) -> None:
    trim = (
        "aresample=16000,aformat=channel_layouts=mono,"
        "silenceremove=start_periods=1:start_duration=0.02:start_threshold=-55dB,"
        "areverse,silenceremove=start_periods=1:start_duration=0.02:start_threshold=-55dB,areverse"
    )
    subprocess.run([
        ffmpeg, "-hide_banner", "-loglevel", "error", "-y", "-i", str(source),
        "-af", trim, str(trimmed),
    ], check=True)
    subprocess.run([
        ffmpeg, "-hide_banner", "-loglevel", "error", "-y", "-i", str(trimmed),
        "-filter_complex",
        "[0:a]asplit=3[a][b][c];anullsrc=r=16000:cl=mono:d=0.3,asplit=2[s1][s2];"
        "[a][s1][b][s2][c]concat=n=5:v=0:a=1[out]",
        "-map", "[out]", str(repeated),
    ], check=True)


def duration(ffprobe: str, source: Path) -> float:
    return float(run_text([
        ffprobe, "-v", "error", "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1", str(source),
    ]))


def transcribe(model: WhisperModel, source: Path) -> str:
    segments, _ = model.transcribe(
        str(source), language="en", beam_size=5, temperature=0,
        condition_on_previous_text=False,
    )
    return "".join(segment.text for segment in segments).strip()


async def main_async(model_name: str) -> None:
    ffmpeg = shutil.which("ffmpeg")
    ffprobe = shutil.which("ffprobe")
    if not ffmpeg or not ffprobe:
        raise RuntimeError("ffmpeg and ffprobe are required")
    model = WhisperModel(model_name, device="cpu", compute_type="int8")
    with tempfile.TemporaryDirectory(prefix="alphabet-letter-compare-") as temp_dir:
        root = Path(temp_dir)
        for voice in VOICES:
            print(f"\n{voice}")
            for rate in RATES:
                print(f"  rate={rate}")
                for letter, spellings in SPELLINGS.items():
                    for index, spelling in enumerate(spellings):
                        stem = f"{voice}-{rate}-{letter}-{index}".replace("%", "")
                        raw = root / f"{stem}.mp3"
                        trimmed = root / f"{stem}-trimmed.wav"
                        repeated = root / f"{stem}-repeated.wav"
                        await edge_tts.Communicate(
                            spelling, voice, rate=rate, volume="+0%"
                        ).save(str(raw))
                        prepare_audio(ffmpeg, raw, trimmed, repeated)
                        actual = transcribe(model, repeated)
                        seconds = duration(ffprobe, trimmed)
                        ok = repeated_match(normalize(actual), EXPECTED[letter])
                        long_enough = seconds >= 0.42
                        print(
                            f"    {letter} text={spelling!r}: {actual!r} "
                            f"duration={seconds:.3f}s "
                            f"{'PASS' if ok and long_enough else 'REVIEW'}"
                        )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", default="small")
    args = parser.parse_args()
    asyncio.run(main_async(args.model))


if __name__ == "__main__":
    main()
