"""Generate Kokoro fallback narration and the original background-music loop.

This is a build-time helper only. The Kokoro model is downloaded to the local
model cache and is not shipped with the game. The game receives small MP3 files.
"""

from __future__ import annotations

import argparse
import math
import shutil
import subprocess
import tempfile
from pathlib import Path

import numpy as np
import soundfile as sf
import torch
from kokoro import KModel, KPipeline


SAMPLE_RATE = 24_000
REPO_ID = "hexgrad/Kokoro-82M-v1.1-zh"
ENGLISH_VOICE = "af_sol"
CHINESE_VOICE = "zf_001"

ITEMS = [
    ("A", "Apple", "苹果", "ˈeɪ"),
    ("B", "Ball", "球", "bˈiː"),
    ("C", "Cat", "猫", "sˈiː"),
    ("D", "Dog", "狗", "dˈiː"),
    ("E", "Egg", "鸡蛋", "ˈiː"),
    ("F", "Fish", "鱼", "ˈɛf"),
    ("G", "Grapes", "葡萄", "dʒˈiː"),
    ("H", "Hat", "帽子", "ˈeɪtʃ"),
    ("I", "Ice cream", "冰淇淋", "ˈaɪ"),
    ("J", "Juice", "果汁", "dʒˈeɪ"),
    ("K", "Kite", "风筝", "kˈeɪ"),
    ("L", "Lion", "狮子", "ˈɛl"),
    ("M", "Moon", "月亮", "ˈɛm"),
    ("N", "Nose", "鼻子", "ˈɛn"),
    ("O", "Orange", "橙子", "ˈoʊ"),
    ("P", "Panda", "熊猫", "pˈiː"),
    ("R", "Rabbit", "兔子", "ˈɑːɹ"),
    ("S", "Sun", "太阳", "ˈɛs"),
    ("T", "Train", "火车", "tˈiː"),
    ("U", "Umbrella", "雨伞", "jˈuː"),
    ("W", "Whale", "鲸鱼", "dˈʌbəl jˌuː"),
    ("Z", "Zebra", "斑马", "zˈiː"),
]


def first_audio(pipeline: KPipeline, text: str, voice: str, speed: float) -> np.ndarray:
    result = next(pipeline(text, voice=voice, speed=speed))
    audio = result.audio
    if hasattr(audio, "detach"):
        audio = audio.detach().cpu().numpy()
    return np.asarray(audio, dtype=np.float32)


def encode_mp3(source: Path, destination: Path) -> None:
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        raise RuntimeError("ffmpeg is required to encode the local MP3 assets")
    destination.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        [
            ffmpeg,
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-i",
            str(source),
            "-af",
            "loudnorm=I=-16:TP=-2:LRA=6",
            "-codec:a",
            "libmp3lame",
            "-b:a",
            "64k",
            str(destination),
        ],
        check=True,
    )


def generate_voice_assets(output_dir: Path) -> None:
    device = "cuda" if torch.cuda.is_available() else "cpu"
    model = KModel(repo_id=REPO_ID).to(device).eval()
    english = KPipeline(lang_code="a", repo_id=REPO_ID, model=model)
    english_g2p = KPipeline(lang_code="a", repo_id=REPO_ID, model=False)

    def english_phonemes(text: str) -> str:
        return next(english_g2p(text)).phonemes

    chinese = KPipeline(
        lang_code="z",
        repo_id=REPO_ID,
        model=model,
        en_callable=english_phonemes,
    )

    output_dir.mkdir(parents=True, exist_ok=True)
    letter_word_silence = np.zeros(int(SAMPLE_RATE * 0.8), dtype=np.float32)
    word_chinese_silence = np.zeros(int(SAMPLE_RATE * 0.45), dtype=np.float32)

    with tempfile.TemporaryDirectory(prefix="alphabet-voice-") as temp_dir:
        temp_root = Path(temp_dir)
        for letter, word, chinese_word, phoneme in ITEMS:
            letter_audio = first_audio(english, f"[{letter}](/{phoneme}/).", ENGLISH_VOICE, 0.96)
            word_audio = first_audio(english, f"{word}.", ENGLISH_VOICE, 0.96)
            chinese_audio = first_audio(chinese, f"{chinese_word}。", CHINESE_VOICE, 0.94)
            combined = np.concatenate((
                letter_audio,
                letter_word_silence,
                word_audio,
                word_chinese_silence,
                chinese_audio,
            ))
            wav_path = temp_root / f"{letter.lower()}.wav"
            sf.write(wav_path, combined, SAMPLE_RATE)
            encode_mp3(wav_path, output_dir / f"{letter.lower()}.mp3")
            print(f"voice: {letter} {word} {chinese_word}")


def midi_frequency(note: int) -> float:
    return 440.0 * (2.0 ** ((note - 69) / 12.0))


def add_pluck(track: np.ndarray, start: float, duration: float, note: int, amplitude: float, pan: float) -> None:
    start_index = int(start * SAMPLE_RATE)
    length = min(int(duration * SAMPLE_RATE), len(track) - start_index)
    if length <= 0:
        return
    time = np.arange(length, dtype=np.float32) / SAMPLE_RATE
    frequency = midi_frequency(note)
    envelope = np.exp(-4.8 * time / max(duration, 0.01)) * np.minimum(1, time / 0.018)
    tone = (
        np.sin(2 * math.pi * frequency * time)
        + 0.28 * np.sin(2 * math.pi * frequency * 2 * time)
        + 0.10 * np.sin(2 * math.pi * frequency * 3 * time)
    ) * envelope * amplitude
    left = math.sqrt((1 - pan) / 2)
    right = math.sqrt((1 + pan) / 2)
    track[start_index : start_index + length, 0] += tone * left
    track[start_index : start_index + length, 1] += tone * right


def generate_original_music(destination: Path) -> None:
    bpm = 96
    beat = 60 / bpm
    bars = 16
    duration = bars * 4 * beat
    track = np.zeros((int(duration * SAMPLE_RATE), 2), dtype=np.float32)

    melody = [
        72, 76, 79, 76, 74, 77, 81, 77,
        76, 79, 84, 79, 67, 71, 74, 71,
        69, 72, 76, 72, 65, 69, 72, 69,
        74, 79, 83, 79, 76, 74, 72, 67,
    ]
    bass_roots = [48, 50, 52, 43, 45, 41, 43, 48]

    for step in range(bars * 8):
        note = melody[step % len(melody)]
        add_pluck(track, step * beat / 2, beat * 0.48, note, 0.11, -0.18 if step % 2 == 0 else 0.18)

    for bar in range(bars):
        root = bass_roots[bar % len(bass_roots)]
        add_pluck(track, bar * beat * 4, beat * 2.7, root, 0.055, 0)
        add_pluck(track, bar * beat * 4 + beat * 2, beat * 1.5, root + 7, 0.04, 0)

    # Gentle bell sparkles, kept sparse so narration stays dominant.
    for bar in range(0, bars, 2):
        add_pluck(track, bar * beat * 4 + beat * 3.5, beat * 0.45, 84 + (bar % 4), 0.045, 0.45)

    peak = float(np.max(np.abs(track))) or 1.0
    track = np.tanh(track / peak * 1.35) * 0.5
    fade_length = int(SAMPLE_RATE * 0.05)
    track[:fade_length] *= np.linspace(0, 1, fade_length, dtype=np.float32)[:, None]
    track[-fade_length:] *= np.linspace(1, 0, fade_length, dtype=np.float32)[:, None]

    with tempfile.TemporaryDirectory(prefix="alphabet-music-") as temp_dir:
        wav_path = Path(temp_dir) / "gentle-ocean-play.wav"
        sf.write(wav_path, track, SAMPLE_RATE)
        ffmpeg = shutil.which("ffmpeg")
        if not ffmpeg:
            raise RuntimeError("ffmpeg is required to encode the music asset")
        destination.parent.mkdir(parents=True, exist_ok=True)
        subprocess.run(
            [
                ffmpeg,
                "-hide_banner",
                "-loglevel",
                "error",
                "-y",
                "-i",
                str(wav_path),
                "-codec:a",
                "libmp3lame",
                "-b:a",
                "80k",
                str(destination),
            ],
            check=True,
        )
    print("music: original gentle-ocean-play loop")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--skip-voices", action="store_true")
    parser.add_argument("--skip-music", action="store_true")
    args = parser.parse_args()

    if not args.skip_voices:
        generate_voice_assets(args.output / "voice")
    if not args.skip_music:
        generate_original_music(args.output / "music" / "gentle-ocean-play.mp3")


if __name__ == "__main__":
    main()
