'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import {
  ALLOWED_LETTERS,
  BUILTIN_ITEMS,
  CORE_ITEMS,
  DIFFICULTIES,
  EXTENSION_CATALOG,
  MAX_CUSTOM_NUMBER,
  NUMBER_ITEMS,
  activateExtension,
  createNumberItem,
  findExtension,
  type Difficulty,
  type ExtensionCatalogItem,
  type GameItem,
} from './game-data';

type LetterStats = { attempts: number; firstCorrect: number; lastPlayed: string | null };
type Progress = {
  letters: Record<string, LetterStats>;
  totalSeconds: number;
  sessions: number;
  volume: number;
  musicVolume: number;
  difficulty: Difficulty;
  hardFailureLimit: number;
  recentItems: string[];
  customImages: Record<string, string>;
  customNumbers: number[];
};
type Question = { item: GameItem; choices: string[] };
type Screen = 'home' | 'playing' | 'complete' | 'failed' | 'parent';
type Feedback = 'correct' | 'wrong' | 'questionFailed' | null;
type ExtensionStatus = { tone: 'info' | 'success' | 'error'; message: string } | null;

const STORAGE_KEY = 'alphabet-and-things-progress-v2';
const LEGACY_STORAGE_KEY = 'alphabet-and-things-progress-v1';
const QUESTION_COUNT = 5;
const NUMBER_QUESTIONS_PER_ROUND = 2;
const HARD_WRONG_LIMIT = 2;
const MAX_UPLOAD_BYTES = 6_000_000;
const MAX_NUMBERS_PER_RANGE = 100;
const MAX_CUSTOM_NUMBERS = 300;

type PictureStyle = CSSProperties & { '--atlas-x'?: string; '--atlas-y'?: string };

function ThingPicture({ item, className = '' }: { item: GameItem; className?: string }) {
  if (!item.image) return null;
  let style: PictureStyle;
  if (item.image.kind === 'direct') {
    style = {
      backgroundImage: `url(${JSON.stringify(item.image.src)})`,
      backgroundSize: 'contain',
      backgroundPosition: 'center',
    };
  } else {
    // A slight safe crop keeps decorative pixels at neighbouring 6×6 cell
    // edges out of the game card while retaining the exact sprite centre.
    const zoom = item.image.rows === 6 ? 1.16 : 1;
    const atlasX = (((item.image.column + 0.5) * zoom - 0.5) / (item.image.columns * zoom - 1)) * 100;
    const atlasY = (((item.image.row + 0.5) * zoom - 0.5) / (item.image.rows * zoom - 1)) * 100;
    style = {
      backgroundImage: `url(${JSON.stringify(item.image.src)})`,
      backgroundSize: `${item.image.columns * zoom * 100}% ${item.image.rows * zoom * 100}%`,
      '--atlas-x': `${atlasX}%`,
      '--atlas-y': `${atlasY}%`,
    };
  }

  return <span className={`thing-picture ${className}`.trim()} style={style} role="img" aria-label={`${item.word}，${item.chinese}`} />;
}

const emptyProgress = (): Progress => ({
  letters: {}, totalSeconds: 0, sessions: 0, volume: 0.85, musicVolume: 0.2,
  difficulty: 'beginner', hardFailureLimit: 3, recentItems: [], customImages: {}, customNumbers: [],
});

function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [result[index], result[randomIndex]] = [result[randomIndex], result[index]];
  }
  return result;
}

function clampInteger(value: unknown, fallback: number, minimum: number, maximum: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(maximum, Math.max(minimum, Math.round(value)))
    : fallback;
}

function readProgress(): Progress {
  if (typeof window === 'undefined') return emptyProgress();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY) ?? window.localStorage.getItem(LEGACY_STORAGE_KEY) ?? '{}';
    const stored = JSON.parse(raw) as Partial<Progress>;
    const difficulty = DIFFICULTIES.some((item) => item.id === stored.difficulty)
      ? stored.difficulty as Difficulty
      : 'beginner';
    return {
      letters: stored.letters ?? {},
      totalSeconds: clampInteger(stored.totalSeconds, 0, 0, Number.MAX_SAFE_INTEGER),
      sessions: clampInteger(stored.sessions, 0, 0, Number.MAX_SAFE_INTEGER),
      volume: typeof stored.volume === 'number' ? Math.min(1, Math.max(0, stored.volume)) : 0.85,
      musicVolume: typeof stored.musicVolume === 'number' ? Math.min(0.4, Math.max(0, stored.musicVolume)) : 0.2,
      difficulty,
      hardFailureLimit: clampInteger(stored.hardFailureLimit, 3, 1, 5),
      recentItems: Array.isArray(stored.recentItems)
        ? stored.recentItems.filter((item): item is string => typeof item === 'string').slice(-16)
        : [],
      customImages: stored.customImages && typeof stored.customImages === 'object' ? stored.customImages : {},
      customNumbers: Array.isArray(stored.customNumbers)
        ? [...new Set(stored.customNumbers.filter((value): value is number => Number.isInteger(value) && value > 20 && value <= MAX_CUSTOM_NUMBER))].sort((left, right) => left - right).slice(0, MAX_CUSTOM_NUMBERS)
        : [],
    };
  } catch {
    return emptyProgress();
  }
}

function writeProgress(progress: Progress): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
    window.localStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch {
    // A restrictive local-file browser mode may disable persistence; play still works.
  }
}

function choiceCountFor(progress: Progress, item: GameItem): number {
  const stats = progress.letters[item.letter];
  const accuracy = stats?.attempts ? stats.firstCorrect / stats.attempts : 0;
  return progress.difficulty === 'medium' || progress.difficulty === 'hard'
    ? 3
    : stats?.attempts >= 3 && accuracy >= 0.8 ? 3 : 2;
}

function numberDistractors(value: number, count: number, numbers: GameItem[]): string[] {
  const candidates = shuffle(numbers.filter((item) => item.value !== value))
    .sort((left, right) => Math.abs((left.value ?? 0) - value) - Math.abs((right.value ?? 0) - value));
  return candidates.slice(0, count).map((item) => item.letter);
}

function buildQuestions(progress: Progress, items: GameItem[], numbers: GameItem[]): Question[] {
  const grouped = new Map<string, GameItem[]>();
  items.forEach((item) => grouped.set(item.letter, [...(grouped.get(item.letter) ?? []), item]));
  const wordQuestions = shuffle([...grouped.keys()]).slice(0, QUESTION_COUNT - NUMBER_QUESTIONS_PER_ROUND).map((letter) => {
    const candidates = grouped.get(letter) ?? [];
    const fresh = candidates.filter((item) => !progress.recentItems.includes(item.id));
    const item = shuffle(fresh.length ? fresh : candidates)[0];
    const choiceCount = choiceCountFor(progress, item);
    const distractors = shuffle(ALLOWED_LETTERS.filter((candidate) => candidate !== letter)).slice(0, choiceCount - 1);
    return { item, choices: shuffle([letter, ...distractors]) };
  });

  const freshNumbers = numbers.filter((item) => !progress.recentItems.includes(item.id));
  const numberPool = freshNumbers.length >= NUMBER_QUESTIONS_PER_ROUND ? freshNumbers : numbers;
  const numberQuestions = shuffle(numberPool).slice(0, NUMBER_QUESTIONS_PER_ROUND).map((item) => {
    const value = item.value ?? 0;
    const choiceCount = choiceCountFor(progress, item);
    return { item, choices: shuffle([item.letter, ...numberDistractors(value, choiceCount - 1, numbers)]) };
  });

  return shuffle([...wordQuestions, ...numberQuestions]);
}

function NumberDots({ value, className = '' }: { value: number; className?: string }) {
  const rows = Array.from({ length: Math.ceil(value / 5) }, (_, row) => Math.min(5, value - row * 5));
  return (
    <div className={`number-dot-board ${className}`.trim()} role="img" aria-label={`${value} 个圆点`}>
      {value === 0
        ? <span className="empty-dot-note" aria-hidden="true" />
        : rows.map((count, row) => <span className="number-dot-row" key={row}>{Array.from({ length: count }, (_, column) => <i key={column} />)}</span>)}
    </div>
  );
}

function NumberWordPrompt({ item, className = '' }: { item: GameItem; className?: string }) {
  return (
    <div className={`number-word-board ${className}`.trim()} role="img" aria-label={`${item.word}，${item.chinese}`}>
      <strong>{item.word}</strong>
      <small>{item.chinese}</small>
    </div>
  );
}

function formatNumber(value: number | string): string {
  return Number(value).toLocaleString('en-US');
}

function parseNumberEntry(input: string): { values: number[]; error?: string } {
  const normalized = input
    .trim()
    .replace(/[０-９]/g, (digit) => String(digit.charCodeAt(0) - 0xfee0))
    .replace(/[,，]/g, '');
  const match = normalized.match(/^(\d+)(?:\s*(?:-|–|—|~|～|至)\s*(\d+))?$/);
  if (!match) return { values: [], error: '请输入一个整数，或类似 40-50 的数字区间。' };
  const first = Number(match[1]);
  const second = match[2] === undefined ? first : Number(match[2]);
  if (!Number.isSafeInteger(first) || !Number.isSafeInteger(second) || first > MAX_CUSTOM_NUMBER || second > MAX_CUSTOM_NUMBER) {
    return { values: [], error: `当前支持 0 到 ${formatNumber(MAX_CUSTOM_NUMBER)}。` };
  }
  const start = Math.min(first, second);
  const end = Math.max(first, second);
  if (end - start + 1 > MAX_NUMBERS_PER_RANGE) {
    return { values: [], error: `一次最多添加 ${MAX_NUMBERS_PER_RANGE} 个连续数字，请分成几次添加。` };
  }
  return { values: Array.from({ length: end - start + 1 }, (_, index) => start + index) };
}

function formatDuration(totalSeconds: number): string {
  return totalSeconds < 60 ? `${totalSeconds} 秒` : `${Math.floor(totalSeconds / 60)} 分钟`;
}

async function loadImageFile(file: File): Promise<string> {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw new Error('请选择 PNG、JPG 或 WebP 图片');
  if (file.size > MAX_UPLOAD_BYTES) throw new Error('图片不能超过 6 MB');

  const sourceUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const candidate = new Image();
      candidate.onload = () => resolve(candidate);
      candidate.onerror = () => reject(new Error('图片无法打开'));
      candidate.src = sourceUrl;
    });
    if (image.naturalWidth < 120 || image.naturalHeight < 120) throw new Error('图片太小，请选择至少 120×120 的图片');
    if (image.naturalWidth > 8000 || image.naturalHeight > 8000) throw new Error('图片尺寸过大');

    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('浏览器无法处理图片');
    context.fillStyle = '#fffaf0';
    context.fillRect(0, 0, 512, 512);
    const scale = Math.min(464 / image.naturalWidth, 464 / image.naturalHeight);
    const width = image.naturalWidth * scale;
    const height = image.naturalHeight * scale;
    context.drawImage(image, (512 - width) / 2, (512 - height) / 2, width, height);
    return canvas.toDataURL('image/webp', 0.84);
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}

export default function Home() {
  const [screen, setScreen] = useState<Screen>('home');
  const [progress, setProgress] = useState<Progress>(() => readProgress());
  const [questions, setQuestions] = useState<Question[]>([]);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [wrongCount, setWrongCount] = useState(0);
  const [failedQuestions, setFailedQuestions] = useState(0);
  const [assist, setAssist] = useState(false);
  const [locked, setLocked] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [selectedLetter, setSelectedLetter] = useState<string | null>(null);
  const [sessionFirstTries, setSessionFirstTries] = useState(0);
  const [gateMessage, setGateMessage] = useState('');
  const [confirmReset, setConfirmReset] = useState(false);
  const [extensionInput, setExtensionInput] = useState('');
  const [extensionStatus, setExtensionStatus] = useState<ExtensionStatus>(null);
  const [recognizedExtension, setRecognizedExtension] = useState<ExtensionCatalogItem | null>(null);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [pendingExtension, setPendingExtension] = useState<{ entry: ExtensionCatalogItem; imageDataUrl: string } | null>(null);
  const [numberInput, setNumberInput] = useState('');
  const [numberStatus, setNumberStatus] = useState<ExtensionStatus>(null);

  const progressRef = useRef<Progress>(progress);
  const sessionStartedAt = useRef(0);
  const gateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const actionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const numberKeyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const numberKeyBuffer = useRef('');
  const narrationPauseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const narrationSequence = useRef(0);
  const pendingFailureCountRef = useRef(0);
  const narrationRef = useRef<HTMLAudioElement | null>(null);
  const backgroundMusicRef = useRef<HTMLAudioElement | null>(null);
  const voiceCacheRef = useRef<Map<string, HTMLAudioElement>>(new Map());

  const customItems = useMemo(() => EXTENSION_CATALOG.flatMap((entry) => {
    const imageDataUrl = progress.customImages[entry.id];
    return imageDataUrl ? [activateExtension(entry, imageDataUrl)] : [];
  }), [progress.customImages]);
  const availableItems = useMemo(() => [...BUILTIN_ITEMS, ...customItems], [customItems]);
  const availableNumbers = useMemo(
    () => [...NUMBER_ITEMS, ...progress.customNumbers.map((value) => createNumberItem(value))],
    [progress.customNumbers],
  );
  const current = questions[questionIndex];
  const activeDifficulty = DIFFICULTIES.find((item) => item.id === progress.difficulty) ?? DIFFICULTIES[0];

  useEffect(() => {
    if ('serviceWorker' in navigator && window.location.protocol.startsWith('http') && !['localhost', '127.0.0.1'].includes(window.location.hostname)) {
      const pageBase = window.location.pathname.endsWith('/') ? window.location.href : new URL('.', window.location.href).href;
      navigator.serviceWorker.register(new URL('sw.js', pageBase).toString()).catch(() => undefined);
    }
  }, []);

  useEffect(() => () => {
    if (gateTimer.current) clearTimeout(gateTimer.current);
    if (actionTimer.current) clearTimeout(actionTimer.current);
    if (numberKeyTimer.current) clearTimeout(numberKeyTimer.current);
    if (narrationPauseTimer.current) clearTimeout(narrationPauseTimer.current);
    narrationSequence.current += 1;
    narrationRef.current?.pause();
    backgroundMusicRef.current?.pause();
  }, []);

  const saveProgress = useCallback((update: (previous: Progress) => Progress) => {
    setProgress((previous) => {
      const next = update(previous);
      progressRef.current = next;
      writeProgress(next);
      return next;
    });
  }, []);

  const applyMusicVolume = useCallback((ducked = false) => {
    if (backgroundMusicRef.current) backgroundMusicRef.current.volume = Math.min(1, Math.max(0, progressRef.current.musicVolume * (ducked ? 0.18 : 1)));
  }, []);

  const stopMusic = useCallback(() => {
    if (!backgroundMusicRef.current) return;
    backgroundMusicRef.current.pause();
    backgroundMusicRef.current.currentTime = 0;
  }, []);

  const getBackgroundMusic = useCallback(() => {
    if (!backgroundMusicRef.current) {
      const music = new Audio(new URL('audio/music/gentle-ocean-play.mp3', document.baseURI).toString());
      music.loop = true;
      music.preload = 'auto';
      backgroundMusicRef.current = music;
    }
    return backgroundMusicRef.current;
  }, []);

  const startMusic = useCallback(() => {
    const music = getBackgroundMusic();
    music.muted = false;
    applyMusicVolume(false);
    music.play().catch(() => undefined);
  }, [applyMusicVolume, getBackgroundMusic]);

  const getPronunciation = useCallback((item: GameItem) => {
    if (!item.audio) throw new Error(`Missing bundled narration for ${item.id}`);
    if (!voiceCacheRef.current.has(item.id)) {
      const narration = new Audio(new URL(item.audio, document.baseURI).toString());
      narration.preload = 'auto';
      voiceCacheRef.current.set(item.id, narration);
    }
    return voiceCacheRef.current.get(item.id)!;
  }, []);

  const getAudioPart = useCallback((src: string) => {
    const cacheKey = `part:${src}`;
    if (!voiceCacheRef.current.has(cacheKey)) {
      const narration = new Audio(new URL(src, document.baseURI).toString());
      narration.preload = 'auto';
      voiceCacheRef.current.set(cacheKey, narration);
    }
    return voiceCacheRef.current.get(cacheKey)!;
  }, []);

  const stopNarration = useCallback(() => {
    narrationSequence.current += 1;
    if (narrationPauseTimer.current) clearTimeout(narrationPauseTimer.current);
    narrationPauseTimer.current = null;
    if (narrationRef.current) {
      narrationRef.current.onended = null;
      narrationRef.current.onerror = null;
      narrationRef.current.pause();
      narrationRef.current.currentTime = 0;
    }
    narrationRef.current = null;
    applyMusicVolume(false);
  }, [applyMusicVolume]);

  const playPronunciation = useCallback((item: GameItem) => {
    stopNarration();
    if (progressRef.current.volume <= 0) return;
    if (item.audioParts?.length) {
      const sequenceId = narrationSequence.current;
      applyMusicVolume(true);
      const finishSequence = () => {
        if (narrationSequence.current !== sequenceId) return;
        narrationRef.current = null;
        applyMusicVolume(false);
      };
      const playPart = (index: number) => {
        if (narrationSequence.current !== sequenceId) return;
        if (index >= item.audioParts!.length) {
          finishSequence();
          return;
        }
        const part = item.audioParts![index];
        const narration = getAudioPart(part.src);
        narration.currentTime = 0;
        narration.volume = progressRef.current.volume;
        narrationRef.current = narration;
        let advanced = false;
        const advance = () => {
          if (advanced || narrationSequence.current !== sequenceId) return;
          advanced = true;
          narration.onended = null;
          narration.onerror = null;
          narrationRef.current = null;
          narrationPauseTimer.current = setTimeout(() => playPart(index + 1), part.pauseAfter ?? 0);
        };
        narration.onended = advance;
        narration.onerror = advance;
        narration.play().catch(advance);
      };
      playPart(0);
      return;
    }
    const narration = getPronunciation(item);
    narration.currentTime = 0;
    narration.volume = progressRef.current.volume;
    narrationRef.current = narration;
    applyMusicVolume(true);
    const restoreMusic = () => {
      if (narrationRef.current === narration) narrationRef.current = null;
      applyMusicVolume(false);
    };
    narration.onended = restoreMusic;
    narration.onerror = restoreMusic;
    narration.play().catch(restoreMusic);
  }, [applyMusicVolume, getAudioPart, getPronunciation, stopNarration]);

  useEffect(() => { getBackgroundMusic().load(); }, [getBackgroundMusic]);

  const playTone = useCallback((kind: 'correct' | 'wrong') => {
    if (progressRef.current.volume <= 0) return;
    const AudioContextClass = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const context = new AudioContextClass();
    const gain = context.createGain();
    gain.gain.setValueAtTime(progressRef.current.volume * (kind === 'wrong' ? 0.18 : 0.12), context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.55);
    gain.connect(context.destination);
    (kind === 'correct' ? [523.25, 659.25, 783.99] : [330, 294]).forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      oscillator.type = kind === 'correct' ? 'sine' : 'triangle';
      oscillator.frequency.value = frequency;
      oscillator.connect(gain);
      const startsAt = context.currentTime + index * 0.11;
      oscillator.start(startsAt);
      oscillator.stop(startsAt + 0.28);
    });
    window.setTimeout(() => context.close().catch(() => undefined), 800);
  }, []);

  const addElapsedTime = useCallback((completed: boolean) => {
    if (!sessionStartedAt.current) return;
    const elapsed = Math.max(1, Math.round((Date.now() - sessionStartedAt.current) / 1000));
    sessionStartedAt.current = 0;
    saveProgress((previous) => ({ ...previous, totalSeconds: previous.totalSeconds + elapsed, sessions: previous.sessions + (completed ? 1 : 0) }));
  }, [saveProgress]);

  const prepareQuestion = useCallback((nextIndex: number) => {
    if (numberKeyTimer.current) clearTimeout(numberKeyTimer.current);
    numberKeyBuffer.current = '';
    setQuestionIndex(nextIndex);
    setWrongCount(0);
    setAssist(false);
    setLocked(false);
    setFeedback(null);
    setSelectedLetter(null);
    const next = questions[nextIndex];
    if (next) playPronunciation(next.item);
  }, [playPronunciation, questions]);

  const startGame = () => {
    if (actionTimer.current) clearTimeout(actionTimer.current);
    if (numberKeyTimer.current) clearTimeout(numberKeyTimer.current);
    numberKeyBuffer.current = '';
    stopNarration();
    const nextQuestions = buildQuestions(progressRef.current, availableItems, availableNumbers);
    setQuestions(nextQuestions);
    saveProgress((previous) => ({ ...previous, recentItems: [...previous.recentItems, ...nextQuestions.map((question) => question.item.id)].slice(-16) }));
    setQuestionIndex(0);
    setWrongCount(0);
    setFailedQuestions(0);
    pendingFailureCountRef.current = 0;
    setAssist(false);
    setLocked(false);
    setFeedback(null);
    setSelectedLetter(null);
    setSessionFirstTries(0);
    sessionStartedAt.current = Date.now();
    setScreen('playing');
    startMusic();
    playPronunciation(nextQuestions[0].item);
  };

  const goHome = () => {
    if (screen === 'playing') addElapsedTime(false);
    if (actionTimer.current) clearTimeout(actionTimer.current);
    if (numberKeyTimer.current) clearTimeout(numberKeyTimer.current);
    numberKeyBuffer.current = '';
    stopNarration();
    stopMusic();
    setFeedback(null);
    setScreen('home');
  };

  const finishCorrectFeedback = useCallback(() => {
    if (actionTimer.current) clearTimeout(actionTimer.current);
    actionTimer.current = null;
    stopNarration();
    if (questionIndex >= questions.length - 1) {
      addElapsedTime(true);
      stopMusic();
      setScreen('complete');
    } else {
      prepareQuestion(questionIndex + 1);
    }
  }, [addElapsedTime, prepareQuestion, questionIndex, questions.length, stopMusic, stopNarration]);

  const finishFailedFeedback = useCallback((failureCount = pendingFailureCountRef.current) => {
    if (actionTimer.current) clearTimeout(actionTimer.current);
    actionTimer.current = null;
    if (failureCount >= progressRef.current.hardFailureLimit) {
      addElapsedTime(false);
      stopMusic();
      setScreen('failed');
    } else if (questionIndex >= questions.length - 1) {
      addElapsedTime(true);
      stopMusic();
      setScreen('complete');
    } else {
      prepareQuestion(questionIndex + 1);
    }
  }, [addElapsedTime, prepareQuestion, questionIndex, questions.length, stopMusic]);

  const dismissWrongFeedback = useCallback(() => {
    if (actionTimer.current) clearTimeout(actionTimer.current);
    actionTimer.current = null;
    setLocked(false);
    setFeedback(null);
    setSelectedLetter(null);
  }, []);

  const skipFeedback = useCallback(() => {
    if (feedback === 'correct') finishCorrectFeedback();
    if (feedback === 'wrong') dismissWrongFeedback();
    if (feedback === 'questionFailed') finishFailedFeedback();
  }, [dismissWrongFeedback, feedback, finishCorrectFeedback, finishFailedFeedback]);

  const recordResult = useCallback((item: GameItem, firstCorrect: boolean) => {
    saveProgress((previous) => {
      const old = previous.letters[item.letter] ?? { attempts: 0, firstCorrect: 0, lastPlayed: null };
      return {
        ...previous,
        letters: { ...previous.letters, [item.letter]: { attempts: old.attempts + 1, firstCorrect: old.firstCorrect + (firstCorrect ? 1 : 0), lastPlayed: new Date().toISOString() } },
      };
    });
  }, [saveProgress]);

  const answerQuestion = useCallback((letter: string) => {
    if (!current || locked || (assist && letter !== current.item.letter)) return;
    startMusic();
    setLocked(true);
    setSelectedLetter(letter);
    if (letter === current.item.letter) {
      const firstTry = wrongCount === 0;
      if (firstTry) setSessionFirstTries((score) => score + 1);
      setFeedback('correct');
      playTone('correct');
      playPronunciation(current.item);
      recordResult(current.item, firstTry);
      actionTimer.current = setTimeout(finishCorrectFeedback, 4200);
      return;
    }

    const nextWrongCount = wrongCount + 1;
    setWrongCount(nextWrongCount);
    playTone('wrong');
    if (progressRef.current.difficulty === 'hard' && nextWrongCount >= HARD_WRONG_LIMIT) {
      const nextFailures = failedQuestions + 1;
      pendingFailureCountRef.current = nextFailures;
      setFailedQuestions(nextFailures);
      setFeedback('questionFailed');
      recordResult(current.item, false);
      actionTimer.current = setTimeout(() => finishFailedFeedback(nextFailures), 1800);
      return;
    }
    setAssist(progressRef.current.difficulty !== 'hard' && nextWrongCount >= 2);
    setFeedback('wrong');
    actionTimer.current = setTimeout(dismissWrongFeedback, 900);
  }, [assist, current, dismissWrongFeedback, failedQuestions, finishCorrectFeedback, finishFailedFeedback, locked, playPronunciation, playTone, recordResult, startMusic, wrongCount]);

  useEffect(() => {
    if (screen !== 'playing' || !current) return;
    const handleLetterKey = (event: KeyboardEvent) => {
      if (event.repeat || event.altKey || event.ctrlKey || event.metaKey) return;
      if (feedback) {
        if (event.key.length === 1 || event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          skipFeedback();
        }
        return;
      }
      if (current.item.kind === 'number') {
        if (event.key === 'Backspace') {
          event.preventDefault();
          numberKeyBuffer.current = numberKeyBuffer.current.slice(0, -1);
          return;
        }
        if (!/^\d$/.test(event.key)) return;
        event.preventDefault();
        if (numberKeyTimer.current) clearTimeout(numberKeyTimer.current);
        const candidate = `${numberKeyBuffer.current}${event.key}`;
        const matches = current.choices.filter((choice) => choice.startsWith(candidate));
        numberKeyBuffer.current = matches.length ? candidate : event.key;
        const exact = current.choices.find((choice) => choice === numberKeyBuffer.current);
        const hasLongerMatch = current.choices.some((choice) => choice.startsWith(numberKeyBuffer.current) && choice !== numberKeyBuffer.current);
        if (exact && !hasLongerMatch) {
          numberKeyBuffer.current = '';
          answerQuestion(exact);
          return;
        }
        numberKeyTimer.current = setTimeout(() => {
          const delayedExact = current.choices.find((choice) => choice === numberKeyBuffer.current);
          numberKeyBuffer.current = '';
          if (delayedExact) answerQuestion(delayedExact);
        }, 900);
        return;
      }
      const letter = event.key.toUpperCase();
      if (current.choices.includes(letter)) {
        event.preventDefault();
        answerQuestion(letter);
      }
    };
    window.addEventListener('keydown', handleLetterKey);
    return () => {
      window.removeEventListener('keydown', handleLetterKey);
      if (numberKeyTimer.current) clearTimeout(numberKeyTimer.current);
      numberKeyBuffer.current = '';
    };
  }, [answerQuestion, current, feedback, screen, skipFeedback]);

  const beginParentHold = () => {
    if (gateTimer.current) clearTimeout(gateTimer.current);
    setGateMessage('继续按住…');
    gateTimer.current = setTimeout(() => { setGateMessage(''); setConfirmReset(false); setScreen('parent'); }, 3000);
  };
  const cancelParentHold = () => { if (gateTimer.current) clearTimeout(gateTimer.current); gateTimer.current = null; };

  const summary = useMemo(() => {
    const records = Object.values(progress.letters);
    const attempts = records.reduce((total, item) => total + item.attempts, 0);
    const firstCorrect = records.reduce((total, item) => total + item.firstCorrect, 0);
    const practicedLetters = CORE_ITEMS.filter((item) => (progress.letters[item.letter]?.attempts ?? 0) > 0).length;
    const practicedNumbers = availableNumbers.filter((item) => (progress.letters[item.letter]?.attempts ?? 0) > 0).length;
    return { practicedLetters, practicedNumbers, attempts, accuracy: attempts ? Math.round((firstCorrect / attempts) * 100) : 0 };
  }, [availableNumbers, progress.letters]);

  const resetProgress = () => {
    const reset: Progress = { ...emptyProgress(), volume: progress.volume, musicVolume: progress.musicVolume, difficulty: progress.difficulty, hardFailureLimit: progress.hardFailureLimit, customImages: progress.customImages, customNumbers: progress.customNumbers };
    progressRef.current = reset;
    setProgress(reset);
    writeProgress(reset);
    setConfirmReset(false);
  };

  const recognizeExtension = () => {
    setPendingExtension(null);
    const entry = findExtension(extensionInput);
    setRecognizedExtension(entry ?? null);
    if (!entry) {
      setExtensionStatus({ tone: 'error', message: '第一版只识别下方安全词表中的常见词，可以输入中文或英文。' });
    } else if (progress.customImages[entry.id]) {
      setExtensionStatus({ tone: 'info', message: `${entry.word} · ${entry.chinese} 已在扩展词库中。` });
    } else {
      setExtensionStatus({ tone: 'success', message: `已识别：${entry.letter} · ${entry.word} · ${entry.chinese}。现在请上传图片。` });
    }
  };

  const handleExtensionUpload = async (file: File | undefined) => {
    if (!file || !recognizedExtension) return;
    setUploadLoading(true);
    try {
      const imageDataUrl = await loadImageFile(file);
      setPendingExtension({ entry: recognizedExtension, imageDataUrl });
      setExtensionStatus({ tone: 'success', message: '图片已缩小并保存在本地预览中，请家长确认内容适合儿童。' });
    } catch (error) {
      setPendingExtension(null);
      setExtensionStatus({ tone: 'error', message: error instanceof Error ? error.message : '图片处理失败。' });
    } finally {
      setUploadLoading(false);
    }
  };

  const confirmExtension = () => {
    if (!pendingExtension) return;
    saveProgress((previous) => ({ ...previous, customImages: { ...previous.customImages, [pendingExtension.entry.id]: pendingExtension.imageDataUrl } }));
    setExtensionStatus({ tone: 'success', message: `${pendingExtension.entry.word} · ${pendingExtension.entry.chinese} 已加入本机词库。` });
    setExtensionInput('');
    setRecognizedExtension(null);
    setPendingExtension(null);
  };

  const removeExtension = (id: string) => {
    saveProgress((previous) => {
      const customImages = { ...previous.customImages };
      delete customImages[id];
      return { ...previous, customImages };
    });
  };

  const addNumbers = () => {
    const parsed = parseNumberEntry(numberInput);
    if (parsed.error) {
      setNumberStatus({ tone: 'error', message: parsed.error });
      return;
    }
    const existing = new Set([...NUMBER_ITEMS.map((item) => item.value ?? 0), ...progressRef.current.customNumbers]);
    const additions = parsed.values.filter((value) => value > 20 && !existing.has(value));
    if (!additions.length) {
      setNumberStatus({ tone: 'info', message: '这些数字已经在题库中，不需要重复添加。' });
      return;
    }
    if (progressRef.current.customNumbers.length + additions.length > MAX_CUSTOM_NUMBERS) {
      setNumberStatus({ tone: 'error', message: `最多保存 ${MAX_CUSTOM_NUMBERS} 个家长添加的数字，请先移除一些。` });
      return;
    }
    saveProgress((previous) => ({
      ...previous,
      customNumbers: [...new Set([...previous.customNumbers, ...additions])].sort((left, right) => left - right),
    }));
    const skipped = parsed.values.length - additions.length;
    setNumberStatus({
      tone: 'success',
      message: `已加入 ${additions.length} 个数字${skipped ? `，另有 ${skipped} 个已经存在` : ''}。英文、中文名称和本地读音已自动准备好。`,
    });
    setNumberInput('');
  };

  const removeCustomNumber = (value: number) => {
    saveProgress((previous) => ({
      ...previous,
      customNumbers: previous.customNumbers.filter((candidate) => candidate !== value),
    }));
    setNumberStatus({ tone: 'info', message: `${formatNumber(value)} 已从题库移除，原有学习统计暂时保留。` });
  };

  if (screen === 'playing' && current) {
    const isNumber = current.item.kind === 'number';
    const numberValue = current.item.value ?? 0;
    const showVisual = progress.difficulty === 'beginner' || progress.difficulty === 'easy';
    const showPicture = !isNumber && showVisual;
    const showDots = isNumber && numberValue <= 20 && showVisual;
    const showNumberWords = isNumber && numberValue > 20 && showVisual;
    const showWords = !isNumber && progress.difficulty === 'beginner';
    const audioOnly = progress.difficulty === 'medium' || progress.difficulty === 'hard';
    return (
      <main className="game-shell">
        <header className="game-header">
          <button className="round-icon-button" type="button" onClick={goHome} aria-label="回到首页">⌂</button>
          <div>
            <div className="round-progress" aria-label={`第 ${questionIndex + 1} 题，共 ${questions.length} 题`}>
              {questions.map((question, index) => <span className={index <= questionIndex ? 'progress-dot active' : 'progress-dot'} key={`${question.item.id}-${index}`} />)}
            </div>
            {progress.difficulty === 'hard' && <div className="hard-status">本轮休息题：{failedQuestions}/{progress.hardFailureLimit}</div>}
          </div>
          <button className="round-icon-button speaker-button" type="button" onClick={() => { startMusic(); playPronunciation(current.item); }} aria-label={isNumber ? '再听数字读音' : '再听字母和物品读音'}>🔊</button>
        </header>

        <section className="question-area">
          <div className={`learning-focus ${isNumber ? 'number-focus' : ''} ${showNumberWords ? 'large-number-focus' : ''} ${audioOnly ? 'audio-only-focus' : ''} ${(showPicture || showDots || showNumberWords) && !showWords ? 'picture-only-focus' : ''}`}>
            {showPicture && <ThingPicture item={current.item} className="focus-picture" />}
            {showDots && <NumberDots value={numberValue} className="focus-number-dots" />}
            {showNumberWords && <NumberWordPrompt item={current.item} className="focus-number-words" />}
            {showWords && <div className="focus-caption"><span className="focus-word"><strong>{current.item.letter}</strong><b>{current.item.word.slice(1)}</b></span><small>{current.item.chinese}</small></div>}
            {audioOnly && <button className="listen-again-card" type="button" onClick={() => playPronunciation(current.item)}><span aria-hidden="true">🔊</span><small>点这里再听一次</small></button>}
          </div>

          <div className={`choice-grid choices-${current.choices.length}`}>
            {current.choices.map((letter) => {
              const isTarget = letter === current.item.letter;
              const choiceLabel = isNumber ? formatNumber(letter) : letter;
              const numberFontSize = isNumber ? Math.max(16, Math.min(100, 175 / choiceLabel.length)) : undefined;
              const classes = ['letter-choice', isNumber ? 'number-choice' : '', wrongCount > 0 && isTarget && progress.difficulty !== 'hard' ? 'hinted' : '', assist && isTarget ? 'assisted' : '', selectedLetter === letter && feedback === 'wrong' ? 'wrong-choice' : '', selectedLetter === letter && feedback === 'correct' ? 'correct-choice' : ''].filter(Boolean).join(' ');
              return <button className={classes} type="button" key={letter} disabled={locked || (assist && !isTarget)} onClick={() => answerQuestion(letter)} aria-label={`${isNumber ? '数字' : '字母'} ${letter}`}><span style={numberFontSize ? { fontSize: `${numberFontSize}px` } : undefined}>{choiceLabel}</span><small>{isNumber ? `键入 ${letter}` : `按 ${letter} 键`}</small></button>;
            })}
          </div>
          <div className="feedback-message" role="status" aria-live="polite">
            {feedback === 'wrong' && (progress.difficulty === 'hard' ? '再试一次' : assist ? `一起点击 ${current.item.letter}` : '没关系，再试一次！')}
            {!feedback && assist && `看，${current.item.letter} 在闪闪发光！`}
            {!feedback && !assist && (isNumber ? '可以点选，也可以用键盘输入数字' : '可以点选，也可以按键盘上的字母键')}
          </div>
        </section>

        {feedback === 'wrong' && <button className="wrong-feedback-overlay" type="button" onClick={skipFeedback} aria-label="答错了，点击继续作答"><span className="wrong-mark" aria-hidden="true">×</span><span className="wrong-overlay-copy">没关系，再试一次</span></button>}
        {feedback === 'questionFailed' && <button className="wrong-feedback-overlay question-failed-overlay" type="button" onClick={skipFeedback} aria-label="本题结束，点击继续"><span className="wrong-mark soft-cross" aria-hidden="true">×</span><span className="wrong-overlay-copy">这题先休息一下</span><small>点击或按任意键继续</small></button>}
        {feedback === 'correct' && <button className="reward-overlay" type="button" onClick={skipFeedback} aria-label="跳过正确动画，继续下一题"><div className="reward-card"><div className="reward-stars" aria-hidden="true">★ ✦ ★</div>{isNumber ? (numberValue <= 20 ? <NumberDots value={numberValue} className="reward-number-dots" /> : <NumberWordPrompt item={current.item} className="reward-number-words" />) : <ThingPicture item={current.item} className="reward-picture" />}<div className={`reward-word ${isNumber ? 'reward-number-answer' : ''}`}>{isNumber ? <><span className="reward-english"><strong>{formatNumber(current.item.letter)}</strong> · {current.item.word}</span><small>{current.item.chinese}</small></> : <><span className="reward-english"><strong>{current.item.letter}</strong>{current.item.word.slice(1)}</span><small>{current.item.chinese}</small></>}</div><p>太棒了！</p><small className="skip-hint">点击或按任意键继续</small></div></button>}
      </main>
    );
  }

  if (screen === 'complete') {
    return <main className="celebration-shell"><section className="celebration-card"><div className="celebration-stars" aria-hidden="true">⭐ ✨ ⭐</div><div className="trophy" aria-hidden="true">🏆</div><p className="eyebrow">完成一轮啦</p><h1>做得真棒！</h1><p className="celebration-copy">你完成了 {QUESTION_COUNT} 道字母和数字题，第一次就答对了 {sessionFirstTries} 题。</p><div className="celebration-actions"><button className="start-button compact" type="button" onClick={startGame}>再玩一次</button><button className="soft-button" type="button" onClick={goHome}>回到首页</button></div></section></main>;
  }

  if (screen === 'failed') {
    return <main className="celebration-shell gentle-failure-shell"><section className="celebration-card gentle-failure-card"><div className="trophy" aria-hidden="true">🌱</div><p className="eyebrow">今天先到这里</p><h1>休息一下吧</h1><p className="celebration-copy">困难模式已经有 {failedQuestions} 题需要休息。喝口水，准备好以后再来玩。</p><div className="celebration-actions"><button className="start-button compact" type="button" onClick={startGame}>重新挑战</button><button className="soft-button" type="button" onClick={goHome}>换个难度</button></div></section></main>;
  }

  if (screen === 'parent') {
    const enabledExtensions = EXTENSION_CATALOG.filter((item) => progress.customImages[item.id]);
    return (
      <main className="parent-shell">
        <header className="parent-header"><div><p className="eyebrow">仅保存在这台设备</p><h1>家长专区</h1></div><button className="soft-button" type="button" onClick={goHome}>完成</button></header>
        <section className="summary-grid" aria-label="学习概况">
          <article><span>认识过</span><strong>{summary.practicedLetters}<small>/22</small></strong><p>个字母</p></article>
          <article><span>数过</span><strong>{summary.practicedNumbers}<small>/{availableNumbers.length}</small></strong><p>个数字</p></article>
          <article><span>完成练习</span><strong>{summary.attempts}</strong><p>道题</p></article>
          <article><span>首次正确率</span><strong>{summary.accuracy}<small>%</small></strong><p>不显示给孩子</p></article>
          <article><span>学习内容</span><strong>{availableItems.length + availableNumbers.length}</strong><p>{availableItems.length} 个物品 · {availableNumbers.length} 个数字</p></article>
          <article><span>练习时间</span><strong className="duration-number">{formatDuration(progress.totalSeconds)}</strong><p>{progress.sessions} 个完整小回合</p></article>
        </section>

        <section className="parent-panel difficulty-parent-panel"><div><h2>难度与困难模式</h2><p>困难模式同题连续错 {HARD_WRONG_LIMIT} 次，本题会先结束。</p></div><label className="hard-limit-control"><span>累计失败上限</span><input type="range" min="1" max="5" step="1" value={progress.hardFailureLimit} onChange={(event) => saveProgress((previous) => ({ ...previous, hardFailureLimit: Number(event.target.value) }))} /><strong>{progress.hardFailureLimit} 题</strong></label></section>

        <section className="parent-panel settings-panel"><div><h2>声音</h2><p>自然美式英语和普通话教学读音随游戏保存；背景音乐在读音时自动变轻。</p></div><div className="sound-control-stack"><label className="volume-control"><strong>读音</strong><span aria-hidden="true">🔈</span><input type="range" min="0" max="1" step="0.05" value={progress.volume} onChange={(event) => saveProgress((previous) => ({ ...previous, volume: Number(event.target.value) }))} aria-label="读音音量" /><span aria-hidden="true">🔊</span></label><label className="volume-control"><strong>音乐</strong><span aria-hidden="true">♪</span><input type="range" min="0" max="0.4" step="0.01" value={progress.musicVolume} onChange={(event) => { const musicVolume = Number(event.target.value); saveProgress((previous) => ({ ...previous, musicVolume })); if (backgroundMusicRef.current) backgroundMusicRef.current.volume = musicVolume; }} aria-label="背景音乐音量" /><span aria-hidden="true">♫</span></label></div></section>

        <section className="parent-panel number-library-panel">
          <div className="extension-heading"><div><h2>添加数字题库</h2><p>输入单个数字，或输入连续区间。21 以上不显示点阵，题目中央会自动显示英文和中文数字名称。</p></div><span className="local-badge">完全本地</span></div>
          <div className="extension-search-row"><input value={numberInput} onChange={(event) => setNumberInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') addNumbers(); }} placeholder="例如：35 或 40-50" maxLength={25} inputMode="numeric" aria-label="输入数字或数字区间" /><button className="soft-button primary-soft-button" type="button" onClick={addNumbers}>加入数字</button></div>
          <p className="number-limit-note">支持 0–{formatNumber(MAX_CUSTOM_NUMBER)}；一次最多添加 {MAX_NUMBERS_PER_RANGE} 个连续数字，本机最多保存 {MAX_CUSTOM_NUMBERS} 个自定义数字。</p>
          {numberStatus && <p className={`extension-status ${numberStatus.tone}`} role="status">{numberStatus.message}</p>}
          {progress.customNumbers.length > 0 && <div className="enabled-numbers"><h3>已添加的数字（{progress.customNumbers.length}）</h3><div className="custom-number-grid">{progress.customNumbers.map((value) => { const item = createNumberItem(value); return <article key={value}><div><strong>{formatNumber(value)}</strong><span>{item.word}</span><small>{item.chinese}</small></div><button type="button" onClick={() => playPronunciation(item)}>试听</button><button type="button" onClick={() => removeCustomNumber(value)}>移除</button></article>; })}</div></div>}
        </section>

        <section className="parent-panel extension-panel">
          <div className="extension-heading"><div><h2>本地扩展词库</h2><p>输入中文或英文，由本地安全词表识别；图片由家长上传并确认。整个过程无需联网，也不会安装模型。</p></div><span className="local-badge">完全本地</span></div>
          <div className="extension-search-row"><input value={extensionInput} onChange={(event) => setExtensionInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') recognizeExtension(); }} placeholder="例如：蝴蝶 或 butterfly" maxLength={30} aria-label="输入要增加的中文或英文单词" /><button className="soft-button primary-soft-button" type="button" onClick={recognizeExtension}>识别单词</button></div>
          {extensionStatus && <p className={`extension-status ${extensionStatus.tone}`} role="status">{extensionStatus.message}</p>}

          {recognizedExtension && !progress.customImages[recognizedExtension.id] && (
            <div className="upload-step">
              <div><strong>{recognizedExtension.letter} · {recognizedExtension.word}</strong><span>{recognizedExtension.chinese}</span></div>
              <label className="upload-button"><input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => void handleExtensionUpload(event.target.files?.[0])} /><span>{uploadLoading ? '正在处理…' : '选择本地图片'}</span></label>
              <small>支持 PNG、JPG、WebP，最大 6 MB；游戏会自动缩小图片以节省空间。</small>
            </div>
          )}

          {pendingExtension && (
            <div className="extension-preview"><ThingPicture item={activateExtension(pendingExtension.entry, pendingExtension.imageDataUrl)} className="extension-preview-picture" /><div><strong>{pendingExtension.entry.letter} · {pendingExtension.entry.word}</strong><span>{pendingExtension.entry.chinese}</span><small>请家长确认图片清楚、对应准确并且适合儿童。</small></div><button className="soft-button" type="button" onClick={() => playPronunciation(activateExtension(pendingExtension.entry, pendingExtension.imageDataUrl))}>试听读音</button><button className="soft-button confirm-extension-button" type="button" onClick={confirmExtension}>确认加入</button><button className="soft-button" type="button" onClick={() => setPendingExtension(null)}>重选图片</button></div>
          )}

          <details className="safe-catalog"><summary>查看第一版可识别的 {EXTENSION_CATALOG.length} 个安全词</summary><div className="catalog-chips">{EXTENSION_CATALOG.map((item) => <button key={item.id} type="button" onClick={() => setExtensionInput(item.chinese)}>{item.word} · {item.chinese}</button>)}</div></details>

          {enabledExtensions.length > 0 && <div className="enabled-extensions"><h3>已加入的扩展词</h3>{enabledExtensions.map((entry) => { const item = activateExtension(entry, progress.customImages[entry.id]); return <article key={entry.id}><ThingPicture item={item} className="enabled-extension-picture" /><span><strong>{entry.word}</strong><small>{entry.chinese}</small></span><button type="button" onClick={() => playPronunciation(item)}>试听</button><button type="button" onClick={() => removeExtension(entry.id)}>移除</button></article>; })}</div>}

          <div className="sentinel-note"><strong>儿童内容安全</strong><span>系统不搜索网络图片。只有家长亲自选择、看到预览并确认的图片才能进入题库；图片只保存在当前浏览器。</span></div>
        </section>

        <section className="parent-panel"><div className="panel-heading"><div><h2>字母学习记录</h2><p>“首次正确”只统计每道题第一次选择。</p></div></div><div className="letter-stats-grid">{CORE_ITEMS.map((item) => { const stats = progress.letters[item.letter]; const accuracy = stats?.attempts ? Math.round((stats.firstCorrect / stats.attempts) * 100) : null; return <article className="letter-stat" key={item.letter}><div className="stat-letter" style={{ background: item.color }}>{item.letter}</div><div><strong>{availableItems.filter((entry) => entry.letter === item.letter).length} 个物品</strong><p>{stats?.attempts ?? 0} 次练习 · {accuracy === null ? '尚无正确率' : `${accuracy}% 首次正确`}</p>{stats?.lastPlayed && <small>最近：{new Date(stats.lastPlayed).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })}</small>}</div><ThingPicture item={item} className="stat-picture" /></article>; })}</div></section>

        <section className="parent-panel"><div className="panel-heading"><div><h2>数字学习记录</h2><p>0–20 和家长添加的数字会一起随机出题，记录规则与字母题相同。</p></div></div><div className="letter-stats-grid number-stats-grid">{availableNumbers.map((item) => { const stats = progress.letters[item.letter]; const accuracy = stats?.attempts ? Math.round((stats.firstCorrect / stats.attempts) * 100) : null; return <article className="letter-stat number-stat" key={item.id}><div className="stat-letter number-stat-letter" style={{ background: item.color }}>{formatNumber(item.letter)}</div><div><strong>{item.word} · {item.chinese}</strong><p>{stats?.attempts ?? 0} 次练习 · {accuracy === null ? '尚无正确率' : `${accuracy}% 首次正确`}</p>{stats?.lastPlayed && <small>最近：{new Date(stats.lastPlayed).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })}</small>}</div></article>; })}</div></section>

        <section className="parent-panel privacy-panel"><div><h2>隐私与记录</h2><p>无需登录，没有服务器数据库、广告或追踪。不使用麦克风、摄像头和位置。上传图片、扩展词、数字题库和学习统计都只保存在本机。</p></div>{!confirmReset ? <button className="danger-soft-button" type="button" onClick={() => setConfirmReset(true)}>清除学习记录</button> : <div className="reset-confirm"><span>确定清除学习统计吗？已加词库和数字会保留。</span><button type="button" onClick={resetProgress}>确定清除</button><button type="button" onClick={() => setConfirmReset(false)}>取消</button></div>}</section>
      </main>
    );
  }

  return (
    <main className="home-shell">
      <div className="sun-glow" aria-hidden="true" /><div className="cloud cloud-one" aria-hidden="true" /><div className="cloud cloud-two" aria-hidden="true" />
      <header className="home-header"><div className="brand-mark" aria-label="Alphabet and Things"><span className="brand-excavator" style={{ backgroundImage: "url('icon-192.png')" }} aria-hidden="true" /></div><div className="parent-gate-wrap"><button className="grown-up-button" type="button" aria-label="家长专区，长按三秒进入" onPointerDown={beginParentHold} onPointerUp={cancelParentHold} onPointerLeave={cancelParentHold} onPointerCancel={cancelParentHold} onKeyDown={(event) => { if (!event.repeat && (event.key === 'Enter' || event.key === ' ')) beginParentHold(); }} onKeyUp={cancelParentHold} onContextMenu={(event) => event.preventDefault()} onClick={() => setGateMessage('请长按 3 秒进入')}><span aria-hidden="true">🔒</span>家长专区</button>{gateMessage && <span className="gate-message" role="status">{gateMessage}</span>}</div></header>
      <section className="hero" aria-labelledby="game-title">
        <div className="hero-copy"><p className="eyebrow">听一听 · 数一数 · 找一找</p><h1 id="game-title"><span>字母、数字<br />和好朋友</span><small>Alphabet &amp; Things</small></h1><p className="welcome-copy">和动物、工程车、水果一起，<br />开心认识英文字母和数字！</p>
          <div className="difficulty-picker" aria-label="选择游戏难度">{DIFFICULTIES.map((difficulty) => <button key={difficulty.id} type="button" className={progress.difficulty === difficulty.id ? 'difficulty-option selected' : 'difficulty-option'} onClick={() => saveProgress((previous) => ({ ...previous, difficulty: difficulty.id }))} aria-pressed={progress.difficulty === difficulty.id}><strong>{difficulty.label}</strong><span>{difficulty.short}</span></button>)}</div>
          <button className="start-button" type="button" onClick={startGame}><span className="play-icon" aria-hidden="true">▶</span><span>开始{activeDifficulty.label}游戏<small>LET&apos;S PLAY!</small></span></button><div className="session-note" aria-label="每轮五题，三个物品题和两个数字题"><span aria-hidden="true">⭐</span>每次 5 题 · 3 个物品＋2 个数字 · 共 {availableNumbers.length} 个数字</div>
        </div>
        <div className="friends-stage" aria-label="字母与事物示例"><div className="rainbow" aria-hidden="true"><span /></div>{CORE_ITEMS.slice(0, 3).map((item, index) => <div className={`friend friend-${['apple', 'ball', 'cat'][index]}`} key={item.letter}><span className="friend-letter">{item.letter}</span><ThingPicture item={item} className="friend-thing" /></div>)}<div className="ground" aria-hidden="true"><span className="flower flower-one">✿</span><span className="flower flower-two">✿</span><span className="flower flower-three">✿</span></div></div>
      </section>
    </main>
  );
}
