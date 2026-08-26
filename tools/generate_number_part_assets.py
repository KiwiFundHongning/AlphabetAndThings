"""Generate compact local speech building blocks for parent-added numbers."""

from __future__ import annotations

import argparse
import asyncio
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any

import edge_tts


KOKORO_REPO = "hexgrad/Kokoro-82M"
KOKORO_VOICE = "af_heart"
KOKORO_SPEED = 0.9
EDGE_ENGLISH_VOICE = "en-US-AvaNeural"
CHINESE_VOICE = "zh-CN-YunxiaNeural"

ENGLISH_PARTS = [
    "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
    "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen",
    "seventeen", "eighteen", "nineteen", "twenty", "thirty", "forty", "fifty",
    "sixty", "seventy", "eighty", "ninety", "hundred", "thousand", "million",
]
EDGE_ENGLISH_PARTS = {"two", "five", "six", "eight"}
CHINESE_PARTS = {
    "zero": "零", "one": "一", "two": "二", "three": "三", "four": "四",
    "five": "五", "six": "六", "seven": "七", "eight": "八", "nine": "九",
    "ten": "十", "hundred": "百", "thousand": "千", "ten-thousand": "万",
    "hundred-million": "亿",
}


async def edge_speech(text: str, voice: str, destination: Path, rate: str) -> None:
    await edge_tts.Communicate(text, voice, rate=rate, volume="+0%").save(str(destination))


def kokoro_speech(text: str, pipeline: Any, destination: Path) -> None:
    import numpy as np
    import soundfile as sf

    chunks = list(pipeline(f"{text}.", voice=KOKORO_VOICE, speed=KOKORO_SPEED))
    audio = [np.asarray(chunk.audio, dtype=np.float32) for chunk in chunks]
    if not audio:
        raise RuntimeError(f"Kokoro returned no audio for {text}")
    sf.write(destination, np.concatenate(audio), 24_000)


def trim_to_mp3(ffmpeg: str, source: Path, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    trim = (
        "aresample=24000,aformat=sample_fmts=fltp:channel_layouts=mono,"
        "silenceremove=start_periods=1:start_duration=0.015:start_threshold=-58dB,"
        "areverse,silenceremove=start_periods=1:start_duration=0.015:"
        "start_threshold=-58dB,areverse"
    )
    subprocess.run(
        [ffmpeg, "-hide_banner", "-loglevel", "error", "-y", "-i", str(source),
         "-af", trim, "-codec:a", "libmp3lame", "-b:a", "128k", str(destination)],
        check=True,
    )


async def generate(output: Path) -> None:
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        raise RuntimeError("ffmpeg is required")
    try:
        from kokoro import KPipeline
    except ImportError as error:
        raise RuntimeError("Kokoro build dependencies are missing") from error

    pipeline = KPipeline(lang_code="a", repo_id=KOKORO_REPO)
    with tempfile.TemporaryDirectory(prefix="alphabet-number-parts-") as temp_dir:
        temp_root = Path(temp_dir)
        edge_jobs = []
        english_sources: list[tuple[str, Path]] = []
        chinese_sources: list[tuple[str, Path]] = []

        for token in ENGLISH_PARTS:
            suffix = "mp3" if token in EDGE_ENGLISH_PARTS else "wav"
            source = temp_root / f"en-{token}.{suffix}"
            english_sources.append((token, source))
            if token in EDGE_ENGLISH_PARTS:
                edge_jobs.append(edge_speech(f"{token}.", EDGE_ENGLISH_VOICE, source, "-8%"))

        for token_id, text in CHINESE_PARTS.items():
            source = temp_root / f"zh-{token_id}.mp3"
            chinese_sources.append((token_id, source))
            edge_jobs.append(edge_speech(text, CHINESE_VOICE, source, "-10%"))

        await asyncio.gather(*edge_jobs)
        for token, source in english_sources:
            if token not in EDGE_ENGLISH_PARTS:
                kokoro_speech(token, pipeline, source)

        for token, source in english_sources:
            trim_to_mp3(ffmpeg, source, output / "en" / f"{token}.mp3")
            print(f"english part: {token}", flush=True)
        for token_id, source in chinese_sources:
            trim_to_mp3(ffmpeg, source, output / "zh" / f"{token_id}.mp3")
            print(f"chinese part: {token_id} ({CHINESE_PARTS[token_id]})", flush=True)


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    asyncio.run(generate(args.output))


if __name__ == "__main__":
    main()
