"""Generate the bundled bilingual narration clips (development only)."""

from __future__ import annotations

import argparse
import asyncio
import shutil
import subprocess
import tempfile
from pathlib import Path

import edge_tts


ENGLISH_VOICE = "en-US-AvaNeural"
CHINESE_VOICE = "zh-CN-XiaoxiaoNeural"
LETTER_NAMES = {
    "A": "ay", "B": "bee", "C": "see", "D": "dee", "E": "E", "F": "eff",
    "G": "gee", "H": "aitch", "I": "eye", "J": "jay", "K": "kay", "L": "el",
    "M": "em", "N": "en", "O": "oh", "P": "pea", "R": "are", "S": "ess",
    "T": "tea", "U": "you", "W": "double you", "Z": "zee",
}

# id, letter, English word, Simplified Chinese word
ITEMS = [
    ("apple", "A", "Apple", "苹果"), ("ball", "B", "Ball", "球"),
    ("cat", "C", "Cat", "猫"), ("dog", "D", "Dog", "狗"),
    ("egg", "E", "Egg", "鸡蛋"), ("fish", "F", "Fish", "鱼"),
    ("grapes", "G", "Grapes", "葡萄"), ("hat", "H", "Hat", "帽子"),
    ("ice-cream", "I", "Ice cream", "冰淇淋"), ("juice", "J", "Juice", "果汁"),
    ("kite", "K", "Kite", "风筝"), ("lion", "L", "Lion", "狮子"),
    ("moon", "M", "Moon", "月亮"), ("nose", "N", "Nose", "鼻子"),
    ("orange", "O", "Orange", "橙子"), ("panda", "P", "Panda", "熊猫"),
    ("rabbit", "R", "Rabbit", "兔子"), ("sun", "S", "Sun", "太阳"),
    ("train", "T", "Train", "火车"), ("umbrella", "U", "Umbrella", "雨伞"),
    ("whale", "W", "Whale", "鲸鱼"), ("zebra", "Z", "Zebra", "斑马"),
    ("bear", "B", "Bear", "熊"), ("bird", "B", "Bird", "小鸟"),
    ("cow", "C", "Cow", "奶牛"), ("duck", "D", "Duck", "鸭子"),
    ("elephant", "E", "Elephant", "大象"), ("frog", "F", "Frog", "青蛙"),
    ("horse", "H", "Horse", "马"), ("monkey", "M", "Monkey", "猴子"),
    ("pig", "P", "Pig", "小猪"), ("turtle", "T", "Turtle", "乌龟"),
    ("bee", "B", "Bee", "蜜蜂"), ("sheep", "S", "Sheep", "绵羊"),
    ("bus", "B", "Bus", "巴士"), ("car", "C", "Car", "小汽车"),
    ("crane-truck", "C", "Crane truck", "起重车"),
    ("excavator", "E", "Excavator", "挖掘机"),
    ("fire-truck", "F", "Fire truck", "消防车"),
    ("garbage-truck", "G", "Garbage truck", "垃圾车"),
    ("helicopter", "H", "Helicopter", "直升机"),
    ("loader", "L", "Loader", "装载机"),
    ("police-car", "P", "Police car", "警车"), ("ship", "S", "Ship", "轮船"),
    ("tractor", "T", "Tractor", "拖拉机"),
    ("dump-truck", "D", "Dump truck", "自卸卡车"),
    ("banana", "B", "Banana", "香蕉"), ("carrot", "C", "Carrot", "胡萝卜"),
    ("cherries", "C", "Cherries", "樱桃"), ("lemon", "L", "Lemon", "柠檬"),
    ("mango", "M", "Mango", "芒果"), ("pear", "P", "Pear", "梨"),
    ("strawberry", "S", "Strawberry", "草莓"),
    ("tomato", "T", "Tomato", "西红柿"),
    ("watermelon", "W", "Watermelon", "西瓜"),
    ("book", "B", "Book", "图画书"), ("cup", "C", "Cup", "杯子"),
    ("toothbrush", "T", "Toothbrush", "牙刷"),
    ("ant", "A", "Ant", "蚂蚁"), ("airplane", "A", "Airplane", "飞机"),
    ("bread", "B", "Bread", "面包"), ("butterfly", "B", "Butterfly", "蝴蝶"),
    ("cake", "C", "Cake", "蛋糕"), ("camel", "C", "Camel", "骆驼"),
    ("dolphin", "D", "Dolphin", "海豚"), ("door", "D", "Door", "门"),
    ("fork", "F", "Fork", "叉子"), ("goat", "G", "Goat", "山羊"),
    ("giraffe", "G", "Giraffe", "长颈鹿"), ("key", "K", "Key", "钥匙"),
    ("lamp", "L", "Lamp", "灯"), ("milk", "M", "Milk", "牛奶"),
    ("octopus", "O", "Octopus", "章鱼"), ("owl", "O", "Owl", "猫头鹰"),
    ("penguin", "P", "Penguin", "企鹅"), ("robot", "R", "Robot", "机器人"),
    ("spoon", "S", "Spoon", "勺子"), ("star", "S", "Star", "星星"),
    ("tiger", "T", "Tiger", "老虎"), ("unicorn", "U", "Unicorn", "独角兽"),
    ("watch", "W", "Watch", "手表"),
]


async def synthesize(text: str, voice: str, destination: Path, semaphore: asyncio.Semaphore) -> None:
    async with semaphore:
        rate = "-10%" if voice == CHINESE_VOICE else "-4%"
        await edge_tts.Communicate(text, voice, rate=rate, volume="+0%").save(str(destination))


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
        "areverse,silenceremove=start_periods=1:start_duration=0.05:"
        "start_threshold=-60dB,areverse"
    )
    filters = (
        f"[0:a]{trim}[letter];[1:a]{trim}[word];[2:a]{trim}[chinese];"
        f"anullsrc=r=24000:cl=mono:d={letter_word_pause:.3f}[letter_pause];"
        f"anullsrc=r=24000:cl=mono:d={word_chinese_pause:.3f}[chinese_pause];"
        "[letter][letter_pause][word][chinese_pause][chinese]"
        # Edge voice files are already level-matched. Avoid a second loudness
        # transform because it can blur very short Mandarin syllable endings.
        "concat=n=5:v=0:a=1[out]"
    )
    subprocess.run(
        [ffmpeg, "-hide_banner", "-loglevel", "error", "-y", "-i", str(letter),
         "-i", str(word), "-i", str(chinese), "-filter_complex", filters,
         "-map", "[out]", "-codec:a", "libmp3lame", "-b:a", "128k", str(destination)],
        check=True,
    )


async def generate(
    output: Path,
    letter_word_pause: float,
    word_chinese_pause: float,
    selected_ids: set[str] | None = None,
) -> None:
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        raise RuntimeError("ffmpeg is required to assemble the narration clips")
    output.mkdir(parents=True, exist_ok=True)
    semaphore = asyncio.Semaphore(6)

    with tempfile.TemporaryDirectory(prefix="alphabet-neural-voice-") as temp_dir:
        temp_root = Path(temp_dir)
        letter_files = {letter: temp_root / f"letter-{letter.lower()}.mp3" for letter in LETTER_NAMES}
        await asyncio.gather(*[
            synthesize(LETTER_NAMES[letter], ENGLISH_VOICE, path, semaphore)
            for letter, path in letter_files.items()
        ])

        sources: list[tuple[str, str, str, str, Path, Path]] = []
        jobs = []
        selected_items = [item for item in ITEMS if selected_ids is None or item[0] in selected_ids]
        for item_id, letter, word, chinese in selected_items:
            word_file = temp_root / f"{item_id}-word.mp3"
            chinese_file = temp_root / f"{item_id}-zh.mp3"
            sources.append((item_id, letter, word, chinese, word_file, chinese_file))
            jobs.extend([
                synthesize(word, ENGLISH_VOICE, word_file, semaphore),
                synthesize(chinese, CHINESE_VOICE, chinese_file, semaphore),
            ])
        await asyncio.gather(*jobs)

        for item_id, letter, word, chinese, word_file, chinese_file in sources:
            combine_segments(
                ffmpeg, letter_files[letter], word_file, chinese_file, output / f"{item_id}.mp3",
                letter_word_pause, word_chinese_pause,
            )
            print(f"voice: {item_id:16} {letter}  {word}  {chinese}", flush=True)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--letter-word-pause", type=float, default=0.8)
    parser.add_argument("--word-chinese-pause", type=float, default=0.45)
    parser.add_argument("--ids", help="Optional comma-separated item ids")
    args = parser.parse_args()
    selected_ids = {value.strip() for value in args.ids.split(",") if value.strip()} if args.ids else None
    asyncio.run(generate(args.output, args.letter_word_pause, args.word_chinese_pause, selected_ids))


if __name__ == "__main__":
    main()
