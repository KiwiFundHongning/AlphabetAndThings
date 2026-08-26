"""Generate compact local speech building blocks for parent-added numbers."""

from __future__ import annotations

import argparse
import asyncio
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
EDGE_ENGLISH_VOICE = "en-US-AvaMultilingualNeural"
CHINESE_VOICE = "zh-CN-XiaoxiaoNeural"

ENGLISH_PARTS = [
    "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
    "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen",
    "seventeen", "eighteen", "nineteen", "twenty", "thirty", "forty", "fifty",
    "sixty", "seventy", "eighty", "ninety", "hundred", "thousand", "million",
]
CHINESE_PARTS = {
    "zero": "零", "one": "一", "two": "二", "three": "三", "four": "四",
    "five": "五", "six": "六", "seven": "七", "eight": "八", "nine": "九",
    "ten": "十", "hundred": "百", "thousand": "千", "ten-thousand": "万",
    "hundred-million": "亿",
}


async def edge_speech(text: str, voice: str, destination: Path, rate: str) -> None:
    import edge_tts

    await edge_tts.Communicate(text, voice, rate=rate, volume="+0%").save(str(destination))


def trim_to_mp3(ffmpeg: str, source: Path, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    trim = (
        "aresample=24000,aformat=sample_fmts=fltp:channel_layouts=mono,"
        "silenceremove=start_periods=1:start_duration=0.01:start_threshold=-65dB:"
        "start_silence=0.08,"
        "areverse,silenceremove=start_periods=1:start_duration=0.015:"
        "start_threshold=-65dB:start_silence=0.06,areverse,"
        "loudnorm=I=-14:TP=-1.5:LRA=5,alimiter=limit=0.84"
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
    with tempfile.TemporaryDirectory(prefix="alphabet-number-parts-") as temp_dir:
        temp_root = Path(temp_dir)
        edge_jobs = []
        english_sources: list[tuple[str, Path]] = []
        chinese_sources: list[tuple[str, Path]] = []

        for token in ENGLISH_PARTS:
            source = temp_root / f"en-{token}.mp3"
            english_sources.append((token, source))
            edge_jobs.append(edge_speech(f"{token}.", EDGE_ENGLISH_VOICE, source, "-8%"))

        for token_id, text in CHINESE_PARTS.items():
            source = temp_root / f"zh-{token_id}.mp3"
            chinese_sources.append((token_id, source))
            edge_jobs.append(edge_speech(f"{text}。", CHINESE_VOICE, source, "-8%"))

        await asyncio.gather(*edge_jobs)

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
