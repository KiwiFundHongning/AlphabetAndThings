"""Generate focused child-friendly Edge voice samples for short number words."""

from __future__ import annotations

import argparse
import asyncio
import re
import sys
from pathlib import Path

import edge_tts


DEFAULT_WORDS = ["One", "Two", "Three", "Five", "Six", "Eight", "Ten", "Twelve"]
DEFAULT_VOICES = ["en-US-AnaNeural", "en-US-JennyNeural", "en-US-AvaNeural"]


def safe_name(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")


async def main_async() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--words", help="Optional comma-separated number words")
    parser.add_argument("--voices", help="Optional comma-separated Edge voices")
    parser.add_argument("--rate", default="-8%")
    parser.add_argument("--suffix", default=".")
    args = parser.parse_args()
    words = [value.strip() for value in args.words.split(",") if value.strip()] if args.words else DEFAULT_WORDS
    voices = [value.strip() for value in args.voices.split(",") if value.strip()] if args.voices else DEFAULT_VOICES
    args.output.mkdir(parents=True, exist_ok=True)

    for voice in voices:
        short_voice = voice.removesuffix("Neural").lower().replace("-", "_")
        for index, word in enumerate(words):
            word_name = safe_name(word) or f"sample-{index + 1}"
            destination = args.output / f"{word_name}-{short_voice}.mp3"
            await edge_tts.Communicate(f"{word}{args.suffix}", voice, rate=args.rate).save(str(destination))
            print(f"{voice:20} {word}", flush=True)


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    asyncio.run(main_async())


if __name__ == "__main__":
    main()
