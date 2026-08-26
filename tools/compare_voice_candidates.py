"""Compare candidate build-time voices on difficult short words."""

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


ENGLISH_VOICES = [
    "en-US-AnaNeural",
    "en-US-AvaMultilingualNeural",
    "en-US-EmmaMultilingualNeural",
    "en-US-AndrewMultilingualNeural",
    "en-US-AvaNeural",
    "en-US-AriaNeural",
    "en-US-JennyNeural",
    "en-US-MichelleNeural",
    "en-US-BrianMultilingualNeural",
    "en-US-RogerNeural",
    "en-US-ChristopherNeural",
]
CHINESE_VOICES = [
    "zh-CN-XiaoxiaoNeural", "zh-CN-XiaoyiNeural",
    "zh-CN-YunxiaNeural", "zh-CN-YunxiNeural",
]
ENGLISH_WORDS = [
    "Apple", "Ball", "Cat", "Dog", "Egg", "Fish", "Grapes", "Hat",
    "Ice cream", "Juice", "Kite", "Lion", "Moon", "Nose", "Orange",
    "Panda", "Rabbit", "Sun", "Train", "Umbrella", "Whale", "Zebra",
    "Bee", "Rabbit", "Excavator", "Bulldozer", "Road roller",
    "Pig", "Beef", "Ship", "Mango", "Book", "Key", "Lamp",
    "Forklift", "Penguins", "Fire engine", "Police car", "Garbage truck",
]
CHINESE_WORDS = [
    "苹果", "球", "猫", "狗", "鸡蛋", "鱼", "葡萄", "帽子", "冰淇淋",
    "果汁", "风筝", "狮子", "月亮", "鼻子", "橙子", "熊猫", "兔子",
    "太阳", "火车", "雨伞", "鲸鱼", "斑马",
    "挖掘机", "推土机", "压路机", "叉车", "鸡", "企鹅", "鲨鱼",
    "蓝莓", "牛油果", "火", "水", "米饭",
]


def normalize_english(text: str) -> str:
    return re.sub(r"[^a-z]", "", text.lower())


def normalize_chinese(text: str) -> str:
    return "".join(re.findall(r"[\u3400-\u9fff]", text))


def prepare_repeated(ffmpeg: str, source: Path, destination: Path) -> None:
    subprocess.run([
        ffmpeg, "-hide_banner", "-loglevel", "error", "-y", "-i", str(source),
        "-filter_complex",
        "[0:a]aresample=16000,aformat=channel_layouts=mono,areverse,"
        "silenceremove=start_periods=1:start_duration=0.05:start_threshold=-60dB,"
        "areverse,asplit=3[a][b][c];"
        "anullsrc=r=16000:cl=mono:d=0.25,asplit=2[s1][s2];"
        "[a][s1][b][s2][c]concat=n=5:v=0:a=1[out]",
        "-map", "[out]", str(destination),
    ], check=True)


def transcribe(model: WhisperModel, source: Path, language: str) -> str:
    segments, _ = model.transcribe(
        str(source), language=language, beam_size=5, temperature=0,
        condition_on_previous_text=False,
    )
    return "".join(segment.text for segment in segments).strip()


async def synthesize(text: str, voice: str, destination: Path) -> None:
    await edge_tts.Communicate(text, voice, rate="-4%", volume="+0%").save(str(destination))


async def main_async(
    model_name: str,
    language_filter: str | None,
    voice_filter: str | None,
    word_filter: set[str] | None,
) -> None:
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        raise RuntimeError("ffmpeg is required")
    model = WhisperModel(model_name, device="cpu", compute_type="int8")
    with tempfile.TemporaryDirectory(prefix="alphabet-voice-compare-") as temp_dir:
        root = Path(temp_dir)
        for language, voices, words in (
            ("en", ENGLISH_VOICES, ENGLISH_WORDS),
            ("zh", CHINESE_VOICES, CHINESE_WORDS),
        ):
            if language_filter and language != language_filter:
                continue
            for voice in voices:
                if voice_filter and voice != voice_filter:
                    continue
                passed = 0
                print(f"\n{voice}")
                selected_words = [word for word in words if word_filter is None or word in word_filter]
                for index, word in enumerate(selected_words):
                    raw = root / f"{language}-{index}-raw.mp3"
                    repeated = root / f"{language}-{index}-repeated.wav"
                    await synthesize(word, voice, raw)
                    prepare_repeated(ffmpeg, raw, repeated)
                    actual = transcribe(model, repeated, language)
                    normalized = normalize_english(actual) if language == "en" else normalize_chinese(actual)
                    expected = normalize_english(word) if language == "en" else word
                    ok = normalized in {expected, expected * 2, expected * 3, expected * 4}
                    passed += int(ok)
                    print(f"  {word}: {actual!r} {'PASS' if ok else 'REVIEW'}")
                print(f"  score: {passed}/{len(selected_words)}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", default="small")
    parser.add_argument("--language", choices=("en", "zh"))
    parser.add_argument("--voice")
    parser.add_argument("--words", help="Optional comma-separated exact words")
    args = parser.parse_args()
    words = {value.strip() for value in args.words.split(",") if value.strip()} if args.words else None
    asyncio.run(main_async(args.model, args.language, args.voice, words))


if __name__ == "__main__":
    main()
