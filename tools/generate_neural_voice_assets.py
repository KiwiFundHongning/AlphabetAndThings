"""Generate the bundled bilingual narration clips (development only)."""

from __future__ import annotations

import argparse
import asyncio
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

LETTER_VOICE = "en-US-JennyNeural"
ENGLISH_WORD_VOICE = "en-US-AvaMultilingualNeural"
CHINESE_VOICE = "zh-CN-XiaoxiaoNeural"
NUMBER_CHINESE_VOICE = "zh-CN-XiaoxiaoNeural"
LETTER_RATE = "-35%"
LETTER_VOICE_OVERRIDES = {
    # Ava produces the clearest tested A and P; Jenny is more reliable for
    # other isolated letter names such as E, R, and W.
    "A": "en-US-AvaMultilingualNeural",
    "P": "en-US-AvaMultilingualNeural",
}
LETTER_RATE_OVERRIDES = {"A": "-25%", "E": "-40%", "P": "-45%"}
ENGLISH_WORD_RATE = "-4%"
CHINESE_RATE = "-8%"
LETTER_TEMPO = 1.0
ENGLISH_WORD_VOICE_OVERRIDES = {
    # Focused repeated-ASR comparisons choose voices that retain the clearest
    # short vowel and final consonant for these easily confused preschool words.
    "cat": "en-US-AvaNeural",
    "hat": "en-US-EmmaMultilingualNeural",
    "whale": "en-US-EmmaMultilingualNeural",
    "pig": "en-US-AvaNeural",
    "beef": "en-US-EmmaMultilingualNeural",
    "ship": "en-US-EmmaMultilingualNeural",
    "mango": "en-US-AndrewMultilingualNeural",
    "book": "en-US-MichelleNeural",
    "key": "en-US-AndrewMultilingualNeural",
    "lamp": "en-US-AndrewMultilingualNeural",
}
LETTER_NAMES = {
    letter: letter for letter in "ABCDEFGHIJKLMNOPRSTUWZ"
}
LETTER_SPEECH_TEXT = LETTER_NAMES

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
    ("bulldozer", "B", "Bulldozer", "推土机"),
    ("road-roller", "R", "Road roller", "压路机"),
    ("monster-truck", "M", "Monster truck", "怪兽卡车"),
    ("fire-engine", "F", "Fire engine", "消防车"),
    ("forklift", "F", "Forklift", "叉车"),
    ("race-car", "R", "Race car", "赛车"),
    ("tank", "T", "Tank", "坦克"),
    ("crocodile", "C", "Crocodile", "鳄鱼"),
    ("cattle", "C", "Cattle", "牛群"),
    ("chicken", "C", "Chicken", "鸡"),
    ("penguins", "P", "Penguins", "企鹅"),
    ("shark", "S", "Shark", "鲨鱼"),
    ("blueberry", "B", "Blueberry", "蓝莓"),
    ("avocado", "A", "Avocado", "牛油果"),
    ("tree", "T", "Tree", "树"),
    ("flower", "F", "Flower", "花"),
    ("fire", "F", "Fire", "火"),
    ("water", "W", "Water", "水"),
    ("beef", "B", "Beef", "牛肉"),
    ("rice", "R", "Rice", "米饭"),
    ("fire-truck", "F", "Fire truck", "消防车"),
    ("garbage-truck", "G", "Garbage truck", "垃圾车"),
    ("helicopter", "H", "Helicopter", "直升机"),
    ("leaf", "L", "Leaf", "叶子"),
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

NUMBERS = [
    (0, "Zero", "零"), (1, "One", "一"), (2, "Two", "二"),
    (3, "Three", "三"), (4, "Four", "四"), (5, "Five", "五"),
    (6, "Six", "六"), (7, "Seven", "七"), (8, "Eight", "八"),
    (9, "Nine", "九"), (10, "Ten", "十"), (11, "Eleven", "十一"),
    (12, "Twelve", "十二"), (13, "Thirteen", "十三"),
    (14, "Fourteen", "十四"), (15, "Fifteen", "十五"),
    (16, "Sixteen", "十六"), (17, "Seventeen", "十七"),
    (18, "Eighteen", "十八"), (19, "Nineteen", "十九"),
    (20, "Twenty", "二十"),
]


async def synthesize(
    text: str,
    voice: str,
    destination: Path,
    semaphore: asyncio.Semaphore,
    rate: str | None = None,
) -> None:
    import edge_tts

    async with semaphore:
        speech_rate = rate or ("-10%" if voice == CHINESE_VOICE else "-4%")
        await edge_tts.Communicate(text, voice, rate=speech_rate, volume="+0%").save(str(destination))


def combine_segments(
    ffmpeg: str,
    letter: Path,
    word: Path,
    chinese: Path,
    destination: Path,
    letter_word_pause: float,
    word_chinese_pause: float,
    letter_tempo: float,
) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    speech_filter = (
        "aresample=24000,aformat=sample_fmts=fltp:channel_layouts=mono,"
        "silenceremove=start_periods=1:start_duration=0.01:start_threshold=-65dB:"
        "start_silence=0.08,"
        "areverse,silenceremove=start_periods=1:start_duration=0.05:"
        "start_threshold=-65dB:start_silence=0.06,areverse"
    )
    filters = (
        f"[0:a]{speech_filter},atempo={letter_tempo:.3f},"
        "loudnorm=I=-14:TP=-1.5:LRA=5[letter];"
        f"[1:a]{speech_filter},loudnorm=I=-14:TP=-1.5:LRA=5[word];"
        f"[2:a]{speech_filter},loudnorm=I=-14:TP=-1.5:LRA=5[chinese];"
        f"anullsrc=r=24000:cl=mono:d={letter_word_pause:.3f}[letter_pause];"
        f"anullsrc=r=24000:cl=mono:d={word_chinese_pause:.3f}[chinese_pause];"
        "[letter][letter_pause][word][chinese_pause][chinese]"
        "concat=n=5:v=0:a=1,alimiter=limit=0.84[out]"
    )
    subprocess.run(
        [ffmpeg, "-hide_banner", "-loglevel", "error", "-y", "-i", str(letter),
         "-i", str(word), "-i", str(chinese), "-filter_complex", filters,
         "-map", "[out]", "-codec:a", "libmp3lame", "-b:a", "128k", str(destination)],
        check=True,
    )


def combine_number_segments(
    ffmpeg: str,
    english: Path,
    chinese: Path,
    destination: Path,
    language_pause: float,
) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    speech_filter = (
        "aresample=24000,aformat=sample_fmts=fltp:channel_layouts=mono,"
        "silenceremove=start_periods=1:start_duration=0.01:start_threshold=-65dB:"
        "start_silence=0.08,"
        "areverse,silenceremove=start_periods=1:start_duration=0.05:"
        "start_threshold=-65dB:start_silence=0.06,areverse"
    )
    filters = (
        f"[0:a]{speech_filter},loudnorm=I=-14:TP=-1.5:LRA=5[english];"
        f"[1:a]{speech_filter},loudnorm=I=-14:TP=-1.5:LRA=5[chinese];"
        f"anullsrc=r=24000:cl=mono:d={language_pause:.3f}[pause];"
        "[english][pause][chinese]concat=n=3:v=0:a=1,alimiter=limit=0.84[out]"
    )
    subprocess.run(
        [ffmpeg, "-hide_banner", "-loglevel", "error", "-y", "-i", str(english),
         "-i", str(chinese), "-filter_complex", filters, "-map", "[out]",
         "-codec:a", "libmp3lame", "-b:a", "128k", str(destination)],
        check=True,
    )


async def generate(
    output: Path,
    number_output: Path,
    letter_word_pause: float,
    word_chinese_pause: float,
    selected_ids: set[str] | None = None,
) -> None:
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        raise RuntimeError("ffmpeg is required to assemble the narration clips")
    output.mkdir(parents=True, exist_ok=True)
    number_output.mkdir(parents=True, exist_ok=True)
    semaphore = asyncio.Semaphore(6)

    with tempfile.TemporaryDirectory(prefix="alphabet-neural-voice-") as temp_dir:
        temp_root = Path(temp_dir)
        letter_files = {letter: temp_root / f"letter-{letter.lower()}.mp3" for letter in LETTER_NAMES}
        await asyncio.gather(*[
            synthesize(
                LETTER_SPEECH_TEXT[letter],
                LETTER_VOICE_OVERRIDES.get(letter, LETTER_VOICE),
                path,
                semaphore,
                LETTER_RATE_OVERRIDES.get(letter, LETTER_RATE),
            )
            for letter, path in letter_files.items()
        ])

        sources: list[tuple[str, str, str, str, Path, Path]] = []
        jobs = []
        selected_items = [item for item in ITEMS if selected_ids is None or item[0] in selected_ids]
        for item_id, letter, word, chinese in selected_items:
            word_file = temp_root / f"{item_id}-word.mp3"
            chinese_file = temp_root / f"{item_id}-zh.mp3"
            sources.append((item_id, letter, word, chinese, word_file, chinese_file))
            jobs.append(synthesize(
                f"{chinese}。",
                CHINESE_VOICE,
                chinese_file,
                semaphore,
                CHINESE_RATE,
            ))
            jobs.append(synthesize(
                f"{word}.",
                ENGLISH_WORD_VOICE_OVERRIDES.get(item_id, ENGLISH_WORD_VOICE),
                word_file,
                semaphore,
                ENGLISH_WORD_RATE,
            ))

        selected_numbers = [
            item for item in NUMBERS
            if selected_ids is None or f"number-{item[0]}" in selected_ids
        ]
        number_sources: list[tuple[int, str, str, Path, Path]] = []
        for value, english, chinese in selected_numbers:
            english_file = temp_root / f"number-{value}-en.mp3"
            chinese_file = temp_root / f"number-{value}-zh.mp3"
            number_sources.append((value, english, chinese, english_file, chinese_file))
            jobs.append(synthesize(f"{chinese}。", NUMBER_CHINESE_VOICE, chinese_file, semaphore, CHINESE_RATE))
            jobs.append(synthesize(f"{english}.", ENGLISH_WORD_VOICE, english_file, semaphore, ENGLISH_WORD_RATE))

        await asyncio.gather(*jobs)

        for item_id, letter, word, chinese, word_file, chinese_file in sources:
            combine_segments(
                ffmpeg, letter_files[letter], word_file, chinese_file, output / f"{item_id}.mp3",
                letter_word_pause, word_chinese_pause,
                LETTER_TEMPO,
            )
            print(f"voice: {item_id:16} {letter}  {word}  {chinese}", flush=True)

        for value, english, chinese, english_file, chinese_file in number_sources:
            combine_number_segments(
                ffmpeg, english_file, chinese_file, number_output / f"{value}.mp3",
                word_chinese_pause,
            )
            print(f"number: {value:2}  {english}  {chinese}", flush=True)


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--number-output", type=Path, help="Defaults to the sibling numbers folder")
    # Each following segment retains a safe leading pad and the prior segment a
    # short tail pad, producing audible gaps near 0.8 s and 0.45 s respectively.
    parser.add_argument("--letter-word-pause", type=float, default=0.70)
    parser.add_argument("--word-chinese-pause", type=float, default=0.33)
    parser.add_argument("--ids", help="Optional comma-separated item ids, including number-0 through number-20")
    args = parser.parse_args()
    selected_ids = {value.strip() for value in args.ids.split(",") if value.strip()} if args.ids else None
    number_output = args.number_output or args.output.parent / "numbers"
    asyncio.run(generate(args.output, number_output, args.letter_word_pause, args.word_chinese_pause, selected_ids))


if __name__ == "__main__":
    main()
