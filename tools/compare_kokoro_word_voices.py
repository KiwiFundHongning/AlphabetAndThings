"""Generate focused Kokoro voice samples for short preschool vocabulary."""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

import numpy as np
import soundfile as sf
from kokoro import KPipeline


DEFAULT_WORDS = ["Bee", "Rabbit", "Apple", "Fish", "Dog", "Moon"]
DEFAULT_VOICES = ["af_heart", "af_bella", "af_nicole"]


def safe_name(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--words", help="Optional comma-separated words")
    parser.add_argument("--voices", help="Optional comma-separated Kokoro voices")
    parser.add_argument("--speed", type=float, default=0.9)
    parser.add_argument("--suffix", default=".", help="Punctuation appended to each sample")
    args = parser.parse_args()

    words = [value.strip() for value in args.words.split(",") if value.strip()] if args.words else DEFAULT_WORDS
    voices = [value.strip() for value in args.voices.split(",") if value.strip()] if args.voices else DEFAULT_VOICES
    args.output.mkdir(parents=True, exist_ok=True)
    pipeline = KPipeline(lang_code="a", repo_id="hexgrad/Kokoro-82M")

    for voice in voices:
        for word in words:
            chunks = list(pipeline(f"{word}{args.suffix}", voice=voice, speed=args.speed))
            audio_parts = [np.asarray(chunk.audio, dtype=np.float32) for chunk in chunks]
            if not audio_parts:
                raise RuntimeError(f"Kokoro returned no audio for {word}")
            audio = np.concatenate(audio_parts)
            destination = args.output / f"{safe_name(word)}-{voice}.wav"
            sf.write(destination, audio, 24_000)
            graphemes = " | ".join(chunk.graphemes for chunk in chunks)
            phonemes = " | ".join(chunk.phonemes for chunk in chunks)
            print(f"{voice:10} {word:10} {len(audio) / 24_000:.3f}s  {graphemes!r}  {phonemes!r}")


if __name__ == "__main__":
    main()
