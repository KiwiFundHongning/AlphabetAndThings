"""Transcribe short development voice samples after repeating them three times."""

from __future__ import annotations

import argparse
import json
import shutil
import tempfile
from pathlib import Path

from faster_whisper import WhisperModel

from validate_voice_assets import repeat_wav, transcribe


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--model", default="turbo")
    parser.add_argument("--language", choices=("en", "zh"), default="en")
    parser.add_argument("--report", type=Path)
    args = parser.parse_args()
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        raise RuntimeError("ffmpeg is required")

    model = WhisperModel(args.model, device="cpu", compute_type="int8")
    results = []
    with tempfile.TemporaryDirectory(prefix="voice-sample-recognition-") as temp_dir:
        temp_root = Path(temp_dir)
        sources = sorted(path for path in args.input.iterdir() if path.suffix.lower() in {".wav", ".mp3"})
        for source in sources:
            repeated = temp_root / source.name
            repeat_wav(ffmpeg, source, repeated)
            text = transcribe(model, repeated, args.language)
            results.append({"sample": source.stem, "transcribed": text})
            print(f"{source.stem:24} {text!r}", flush=True)
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(results, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
