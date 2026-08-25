"""Generate the bundled bilingual narration clips.

This helper is used only during development. It downloads no model into the
game and the generated MP3 files are played entirely offline at runtime.
"""

from __future__ import annotations

import argparse
import asyncio
import shutil
import subprocess
import tempfile
from pathlib import Path

import edge_tts


ENGLISH_VOICE = "en-US-AnaNeural"
CHINESE_VOICE = "zh-CN-XiaoyiNeural"

ITEMS = [
    ("A", "Apple", "苹果"),
    ("B", "Ball", "球"),
    ("C", "Cat", "猫"),
    ("D", "Dog", "狗"),
    ("E", "Egg", "鸡蛋"),
    ("F", "Fish", "鱼"),
    ("G", "Grapes", "葡萄"),
    ("H", "Hat", "帽子"),
    ("I", "Ice cream", "冰淇淋"),
    ("J", "Juice", "果汁"),
    ("K", "Kite", "风筝"),
    ("L", "Lion", "狮子"),
    ("M", "Moon", "月亮"),
    ("N", "Nose", "鼻子"),
    ("O", "Orange", "橙子"),
    ("P", "Panda", "熊猫"),
    ("R", "Rabbit", "兔子"),
    ("S", "Sun", "太阳"),
    ("T", "Train", "火车"),
    ("U", "Umbrella", "雨伞"),
    ("W", "Whale", "鲸鱼"),
    ("Z", "Zebra", "斑马"),
]


async def synthesize(text: str, voice: str, destination: Path) -> None:
    communicator = edge_tts.Communicate(text, voice, rate="-4%", volume="+0%")
    await communicator.save(str(destination))


def combine_segments(
    ffmpeg: str,
    letter: Path,
    word: Path,
    chinese: Path,
    destination: Path,
    letter_word_pause: float,
    word_chinese_pause: float,
) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    trim = (
        "aresample=24000,aformat=sample_fmts=fltp:channel_layouts=mono,"
        "silenceremove=start_periods=1:start_duration=0.02:start_threshold=-52dB:"
        "stop_periods=1:stop_duration=0.10:stop_threshold=-52dB"
    )
    filters = (
        f"[0:a]{trim}[letter];"
        f"[1:a]{trim}[word];"
        f"[2:a]{trim}[chinese];"
        f"anullsrc=r=24000:cl=mono:d={letter_word_pause:.3f}[letter_pause];"
        f"anullsrc=r=24000:cl=mono:d={word_chinese_pause:.3f}[chinese_pause];"
        "[letter][letter_pause][word][chinese_pause][chinese]"
        "concat=n=5:v=0:a=1,loudnorm=I=-16:TP=-2:LRA=6[out]"
    )
    subprocess.run(
        [
            ffmpeg,
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-i",
            str(letter),
            "-i",
            str(word),
            "-i",
            str(chinese),
            "-filter_complex",
            filters,
            "-map",
            "[out]",
            "-codec:a",
            "libmp3lame",
            "-b:a",
            "80k",
            str(destination),
        ],
        check=True,
    )


async def generate(output: Path, letter_word_pause: float, word_chinese_pause: float) -> None:
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        raise RuntimeError("ffmpeg is required to assemble the narration clips")

    with tempfile.TemporaryDirectory(prefix="alphabet-neural-voice-") as temp_dir:
        temp_root = Path(temp_dir)
        for letter, word, chinese in ITEMS:
            letter_file = temp_root / f"{letter.lower()}-letter.mp3"
            word_file = temp_root / f"{letter.lower()}-word.mp3"
            chinese_file = temp_root / f"{letter.lower()}-zh.mp3"
            await synthesize(letter, ENGLISH_VOICE, letter_file)
            await synthesize(word, ENGLISH_VOICE, word_file)
            await synthesize(chinese, CHINESE_VOICE, chinese_file)
            combine_segments(
                ffmpeg,
                letter_file,
                word_file,
                chinese_file,
                output / f"{letter.lower()}.mp3",
                letter_word_pause,
                word_chinese_pause,
            )
            print(f"voice: {letter}  [pause {letter_word_pause:.1f}s]  {word}  {chinese}", flush=True)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--letter-word-pause", type=float, default=0.8)
    parser.add_argument("--word-chinese-pause", type=float, default=0.45)
    args = parser.parse_args()
    asyncio.run(generate(args.output, args.letter_word_pause, args.word_chinese_pause))


if __name__ == "__main__":
    main()
