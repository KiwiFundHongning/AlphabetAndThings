export type Difficulty = 'beginner' | 'easy' | 'medium' | 'hard';

export type ItemCategory = 'animal' | 'vehicle' | 'fruit' | 'vegetable' | 'daily' | 'nature' | 'food';

export type AtlasImage = {
  kind: 'atlas';
  src: string;
  columns: number;
  rows: number;
  column: number;
  row: number;
};

export type DirectImage = {
  kind: 'direct';
  src: string;
};

export type GameItem = {
  id: string;
  letter: string;
  word: string;
  chinese: string;
  category: ItemCategory;
  color: string;
  audio: string;
  image: AtlasImage | DirectImage;
};

export type ExtensionCatalogItem = Omit<GameItem, 'image'> & {
  aliases: string[];
};

export const DIFFICULTIES: Array<{
  id: Difficulty;
  label: string;
  short: string;
  description: string;
}> = [
  { id: 'beginner', label: '新手', short: '图＋单词＋声音', description: '图片、英文和中文都看得到' },
  { id: 'easy', label: '简单', short: '只看图和听声音', description: '隐藏单词，用图片来理解' },
  { id: 'medium', label: '中等', short: '只听声音', description: '没有图片和文字提示' },
  { id: 'hard', label: '困难', short: '听声音＋失败规则', description: '连续答错会失去本题机会' },
];

const COLORS: Record<string, string> = {
  A: '#ef6475', B: '#f2b84b', C: '#678ee7', D: '#9a77db', E: '#55bca8', F: '#4ba6df',
  G: '#9872d7', H: '#ee7b5a', I: '#e98dba', J: '#f29b3f', K: '#5e9de1', L: '#e9a83d',
  M: '#697bd9', N: '#df7f7d', O: '#ee913e', P: '#5e7a8b', R: '#d880b8', S: '#efbb39',
  T: '#e05f61', U: '#5baecf', W: '#4e94d7', Z: '#657681',
};

const baseAtlas = (
  id: string,
  letter: string,
  word: string,
  chinese: string,
  category: ItemCategory,
  column: number,
  row: number,
): GameItem => ({
  id,
  letter,
  word,
  chinese,
  category,
  color: COLORS[letter],
  audio: `audio/voice/items/${id}.mp3`,
  image: {
    kind: 'atlas',
    src: 'things/object-atlas-v2.png',
    columns: 6,
    rows: 4,
    column,
    row,
  },
});

const expandedAtlas = (
  id: string,
  letter: string,
  word: string,
  chinese: string,
  category: ItemCategory,
  column: number,
  row: number,
): GameItem => ({
  id,
  letter,
  word,
  chinese,
  category,
  color: COLORS[letter],
  audio: `audio/voice/items/${id}.mp3`,
  image: {
    kind: 'atlas',
    src: 'things/expanded-object-atlas-v1.png',
    columns: 6,
    rows: 6,
    column,
    row,
  },
});

export const CORE_ITEMS: GameItem[] = [
  baseAtlas('apple', 'A', 'Apple', '苹果', 'fruit', 0, 0),
  baseAtlas('ball', 'B', 'Ball', '球', 'daily', 1, 0),
  baseAtlas('cat', 'C', 'Cat', '猫', 'animal', 2, 0),
  baseAtlas('dog', 'D', 'Dog', '狗', 'animal', 3, 0),
  baseAtlas('egg', 'E', 'Egg', '鸡蛋', 'food', 4, 0),
  baseAtlas('fish', 'F', 'Fish', '鱼', 'animal', 5, 0),
  baseAtlas('grapes', 'G', 'Grapes', '葡萄', 'fruit', 0, 1),
  baseAtlas('hat', 'H', 'Hat', '帽子', 'daily', 1, 1),
  baseAtlas('ice-cream', 'I', 'Ice cream', '冰淇淋', 'food', 2, 1),
  baseAtlas('juice', 'J', 'Juice', '果汁', 'food', 3, 1),
  baseAtlas('kite', 'K', 'Kite', '风筝', 'daily', 4, 1),
  baseAtlas('lion', 'L', 'Lion', '狮子', 'animal', 5, 1),
  baseAtlas('moon', 'M', 'Moon', '月亮', 'nature', 0, 2),
  baseAtlas('nose', 'N', 'Nose', '鼻子', 'daily', 1, 2),
  baseAtlas('orange', 'O', 'Orange', '橙子', 'fruit', 2, 2),
  baseAtlas('panda', 'P', 'Panda', '熊猫', 'animal', 3, 2),
  baseAtlas('rabbit', 'R', 'Rabbit', '兔子', 'animal', 4, 2),
  baseAtlas('sun', 'S', 'Sun', '太阳', 'nature', 5, 2),
  baseAtlas('train', 'T', 'Train', '火车', 'vehicle', 0, 3),
  baseAtlas('umbrella', 'U', 'Umbrella', '雨伞', 'daily', 1, 3),
  baseAtlas('whale', 'W', 'Whale', '鲸鱼', 'animal', 2, 3),
  baseAtlas('zebra', 'Z', 'Zebra', '斑马', 'animal', 3, 3),
];

export const EXPANDED_ITEMS: GameItem[] = [
  expandedAtlas('bear', 'B', 'Bear', '熊', 'animal', 0, 0),
  expandedAtlas('bird', 'B', 'Bird', '小鸟', 'animal', 1, 0),
  expandedAtlas('cow', 'C', 'Cow', '奶牛', 'animal', 2, 0),
  expandedAtlas('duck', 'D', 'Duck', '鸭子', 'animal', 3, 0),
  expandedAtlas('elephant', 'E', 'Elephant', '大象', 'animal', 4, 0),
  expandedAtlas('frog', 'F', 'Frog', '青蛙', 'animal', 5, 0),
  expandedAtlas('horse', 'H', 'Horse', '马', 'animal', 0, 1),
  expandedAtlas('monkey', 'M', 'Monkey', '猴子', 'animal', 1, 1),
  expandedAtlas('pig', 'P', 'Pig', '小猪', 'animal', 2, 1),
  expandedAtlas('turtle', 'T', 'Turtle', '乌龟', 'animal', 3, 1),
  expandedAtlas('bee', 'B', 'Bee', '蜜蜂', 'animal', 4, 1),
  expandedAtlas('sheep', 'S', 'Sheep', '绵羊', 'animal', 5, 1),
  expandedAtlas('bus', 'B', 'Bus', '巴士', 'vehicle', 0, 2),
  expandedAtlas('car', 'C', 'Car', '小汽车', 'vehicle', 1, 2),
  expandedAtlas('crane-truck', 'C', 'Crane truck', '起重车', 'vehicle', 2, 2),
  expandedAtlas('excavator', 'E', 'Excavator', '挖掘机', 'vehicle', 3, 2),
  expandedAtlas('fire-truck', 'F', 'Fire truck', '消防车', 'vehicle', 4, 2),
  expandedAtlas('garbage-truck', 'G', 'Garbage truck', '垃圾车', 'vehicle', 5, 2),
  expandedAtlas('helicopter', 'H', 'Helicopter', '直升机', 'vehicle', 0, 3),
  expandedAtlas('loader', 'L', 'Loader', '装载机', 'vehicle', 1, 3),
  expandedAtlas('police-car', 'P', 'Police car', '警车', 'vehicle', 2, 3),
  expandedAtlas('ship', 'S', 'Ship', '轮船', 'vehicle', 3, 3),
  expandedAtlas('tractor', 'T', 'Tractor', '拖拉机', 'vehicle', 4, 3),
  expandedAtlas('dump-truck', 'D', 'Dump truck', '自卸卡车', 'vehicle', 5, 3),
  expandedAtlas('banana', 'B', 'Banana', '香蕉', 'fruit', 0, 4),
  expandedAtlas('carrot', 'C', 'Carrot', '胡萝卜', 'vegetable', 1, 4),
  expandedAtlas('cherries', 'C', 'Cherries', '樱桃', 'fruit', 2, 4),
  expandedAtlas('lemon', 'L', 'Lemon', '柠檬', 'fruit', 3, 4),
  expandedAtlas('mango', 'M', 'Mango', '芒果', 'fruit', 4, 4),
  expandedAtlas('pear', 'P', 'Pear', '梨', 'fruit', 5, 4),
  expandedAtlas('strawberry', 'S', 'Strawberry', '草莓', 'fruit', 0, 5),
  expandedAtlas('tomato', 'T', 'Tomato', '西红柿', 'vegetable', 1, 5),
  expandedAtlas('watermelon', 'W', 'Watermelon', '西瓜', 'fruit', 2, 5),
  expandedAtlas('book', 'B', 'Book', '图画书', 'daily', 3, 5),
  expandedAtlas('cup', 'C', 'Cup', '杯子', 'daily', 4, 5),
  expandedAtlas('toothbrush', 'T', 'Toothbrush', '牙刷', 'daily', 5, 5),
];

export const BUILTIN_ITEMS = [...CORE_ITEMS, ...EXPANDED_ITEMS];
export const ALLOWED_LETTERS = [...new Set(BUILTIN_ITEMS.map((item) => item.letter))];

const extension = (
  id: string,
  letter: string,
  word: string,
  chinese: string,
  category: ItemCategory,
  aliases: string[] = [],
): ExtensionCatalogItem => ({
  id,
  letter,
  word,
  chinese,
  category,
  color: COLORS[letter],
  audio: `audio/voice/items/${id}.mp3`,
  aliases: [word, chinese, ...aliases],
});

// The first expansion catalog stays deliberately small and local. Parents can
// type either language, then supply and approve their own picture.
export const EXTENSION_CATALOG: ExtensionCatalogItem[] = [
  extension('ant', 'A', 'Ant', '蚂蚁', 'animal'),
  extension('airplane', 'A', 'Airplane', '飞机', 'vehicle', ['plane']),
  extension('bread', 'B', 'Bread', '面包', 'food'),
  extension('butterfly', 'B', 'Butterfly', '蝴蝶', 'animal'),
  extension('cake', 'C', 'Cake', '蛋糕', 'food'),
  extension('camel', 'C', 'Camel', '骆驼', 'animal'),
  extension('dolphin', 'D', 'Dolphin', '海豚', 'animal'),
  extension('door', 'D', 'Door', '门', 'daily', ['房门']),
  extension('fork', 'F', 'Fork', '叉子', 'daily', ['餐叉']),
  extension('goat', 'G', 'Goat', '山羊', 'animal'),
  extension('giraffe', 'G', 'Giraffe', '长颈鹿', 'animal'),
  extension('key', 'K', 'Key', '钥匙', 'daily'),
  extension('lamp', 'L', 'Lamp', '灯', 'daily', ['台灯', 'light']),
  extension('milk', 'M', 'Milk', '牛奶', 'food'),
  extension('octopus', 'O', 'Octopus', '章鱼', 'animal'),
  extension('owl', 'O', 'Owl', '猫头鹰', 'animal'),
  extension('penguin', 'P', 'Penguin', '企鹅', 'animal'),
  extension('robot', 'R', 'Robot', '机器人', 'daily'),
  extension('spoon', 'S', 'Spoon', '勺子', 'daily'),
  extension('star', 'S', 'Star', '星星', 'nature'),
  extension('tiger', 'T', 'Tiger', '老虎', 'animal'),
  extension('unicorn', 'U', 'Unicorn', '独角兽', 'animal'),
  extension('watch', 'W', 'Watch', '手表', 'daily'),
];

export function normalizeLookup(value: string): string {
  return value.trim().toLocaleLowerCase('en-US').replace(/[\s_-]+/g, '');
}

export function findExtension(value: string): ExtensionCatalogItem | undefined {
  const normalized = normalizeLookup(value);
  if (!normalized) return undefined;
  return EXTENSION_CATALOG.find((item) =>
    item.aliases.some((alias) => normalizeLookup(alias) === normalized),
  );
}

export function activateExtension(item: ExtensionCatalogItem, imageDataUrl: string): GameItem {
  return {
    id: item.id,
    letter: item.letter,
    word: item.word,
    chinese: item.chinese,
    category: item.category,
    color: item.color,
    audio: item.audio,
    image: { kind: 'direct', src: imageDataUrl },
  };
}
