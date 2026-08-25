'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';

type LetterItem = {
  letter: string;
  word: string;
  chinese: string;
  atlasColumn: number;
  atlasRow: number;
  color: string;
};

type LetterStats = {
  attempts: number;
  firstCorrect: number;
  lastPlayed: string | null;
};

type Progress = {
  letters: Record<string, LetterStats>;
  totalSeconds: number;
  sessions: number;
  volume: number;
  musicVolume: number;
};

type Question = {
  item: LetterItem;
  choices: string[];
};

type Screen = 'home' | 'playing' | 'complete' | 'parent';
type Feedback = 'correct' | 'wrong' | null;

const LETTERS: LetterItem[] = [
  { letter: 'A', word: 'Apple', chinese: '苹果', atlasColumn: 0, atlasRow: 0, color: '#ef6475' },
  { letter: 'B', word: 'Ball', chinese: '球', atlasColumn: 1, atlasRow: 0, color: '#f2b84b' },
  { letter: 'C', word: 'Cat', chinese: '猫', atlasColumn: 2, atlasRow: 0, color: '#678ee7' },
  { letter: 'D', word: 'Dog', chinese: '狗', atlasColumn: 3, atlasRow: 0, color: '#9a77db' },
  { letter: 'E', word: 'Egg', chinese: '鸡蛋', atlasColumn: 4, atlasRow: 0, color: '#55bca8' },
  { letter: 'F', word: 'Fish', chinese: '鱼', atlasColumn: 5, atlasRow: 0, color: '#4ba6df' },
  { letter: 'G', word: 'Grapes', chinese: '葡萄', atlasColumn: 0, atlasRow: 1, color: '#9872d7' },
  { letter: 'H', word: 'Hat', chinese: '帽子', atlasColumn: 1, atlasRow: 1, color: '#ee7b5a' },
  { letter: 'I', word: 'Ice cream', chinese: '冰淇淋', atlasColumn: 2, atlasRow: 1, color: '#e98dba' },
  { letter: 'J', word: 'Juice', chinese: '果汁', atlasColumn: 3, atlasRow: 1, color: '#f29b3f' },
  { letter: 'K', word: 'Kite', chinese: '风筝', atlasColumn: 4, atlasRow: 1, color: '#5e9de1' },
  { letter: 'L', word: 'Lion', chinese: '狮子', atlasColumn: 5, atlasRow: 1, color: '#e9a83d' },
  { letter: 'M', word: 'Moon', chinese: '月亮', atlasColumn: 0, atlasRow: 2, color: '#697bd9' },
  { letter: 'N', word: 'Nose', chinese: '鼻子', atlasColumn: 1, atlasRow: 2, color: '#df7f7d' },
  { letter: 'O', word: 'Orange', chinese: '橙子', atlasColumn: 2, atlasRow: 2, color: '#ee913e' },
  { letter: 'P', word: 'Panda', chinese: '熊猫', atlasColumn: 3, atlasRow: 2, color: '#5e7a8b' },
  { letter: 'R', word: 'Rabbit', chinese: '兔子', atlasColumn: 4, atlasRow: 2, color: '#d880b8' },
  { letter: 'S', word: 'Sun', chinese: '太阳', atlasColumn: 5, atlasRow: 2, color: '#efbb39' },
  { letter: 'T', word: 'Train', chinese: '火车', atlasColumn: 0, atlasRow: 3, color: '#e05f61' },
  { letter: 'U', word: 'Umbrella', chinese: '雨伞', atlasColumn: 1, atlasRow: 3, color: '#5baecf' },
  { letter: 'W', word: 'Whale', chinese: '鲸鱼', atlasColumn: 2, atlasRow: 3, color: '#4e94d7' },
  { letter: 'Z', word: 'Zebra', chinese: '斑马', atlasColumn: 3, atlasRow: 3, color: '#657681' },
];

const STORAGE_KEY = 'alphabet-and-things-progress-v1';
const QUESTION_COUNT = 5;

type AtlasStyle = CSSProperties & {
  '--atlas-x': string;
  '--atlas-y': string;
};

function ThingPicture({ item, className = '' }: { item: LetterItem; className?: string }) {
  const style: AtlasStyle = {
    backgroundImage: "url('things/object-atlas-v2.png')",
    '--atlas-x': `${item.atlasColumn * 20}%`,
    '--atlas-y': `${item.atlasRow * (100 / 3)}%`,
  };

  return (
    <span
      className={`thing-picture ${className}`.trim()}
      style={style}
      role="img"
      aria-label={`${item.word}，${item.chinese}`}
    />
  );
}

const emptyProgress = (): Progress => ({
  letters: {},
  totalSeconds: 0,
  sessions: 0,
  volume: 0.85,
  musicVolume: 0.12,
});

function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [result[index], result[randomIndex]] = [result[randomIndex], result[index]];
  }
  return result;
}

function readProgress(): Progress {
  if (typeof window === 'undefined') return emptyProgress();
  try {
    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '{}') as Partial<Progress>;
    return {
      letters: stored.letters ?? {},
      totalSeconds: Number.isFinite(stored.totalSeconds) ? stored.totalSeconds ?? 0 : 0,
      sessions: Number.isFinite(stored.sessions) ? stored.sessions ?? 0 : 0,
      volume: typeof stored.volume === 'number' ? Math.min(1, Math.max(0, stored.volume)) : 0.85,
      musicVolume: typeof stored.musicVolume === 'number'
        ? Math.min(0.35, Math.max(0, stored.musicVolume))
        : 0.12,
    };
  } catch {
    return emptyProgress();
  }
}

function buildQuestions(progress: Progress): Question[] {
  return shuffle(LETTERS).slice(0, QUESTION_COUNT).map((item) => {
    const stats = progress.letters[item.letter];
    const accuracy = stats?.attempts ? stats.firstCorrect / stats.attempts : 0;
    const choiceCount = stats?.attempts >= 3 && accuracy >= 0.8 ? 3 : 2;
    const distractors = shuffle(LETTERS.filter((candidate) => candidate.letter !== item.letter))
      .slice(0, choiceCount - 1)
      .map((candidate) => candidate.letter);
    return { item, choices: shuffle([item.letter, ...distractors]) };
  });
}

function formatDuration(totalSeconds: number): string {
  if (totalSeconds < 60) return `${totalSeconds} 秒`;
  const minutes = Math.floor(totalSeconds / 60);
  return `${minutes} 分钟`;
}

export default function Home() {
  const [screen, setScreen] = useState<Screen>('home');
  const [progress, setProgress] = useState<Progress>(() => readProgress());
  const [questions, setQuestions] = useState<Question[]>([]);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [wrongCount, setWrongCount] = useState(0);
  const [assist, setAssist] = useState(false);
  const [locked, setLocked] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [selectedLetter, setSelectedLetter] = useState<string | null>(null);
  const [sessionFirstTries, setSessionFirstTries] = useState(0);
  const [gateMessage, setGateMessage] = useState('');
  const [confirmReset, setConfirmReset] = useState(false);
  const progressRef = useRef<Progress>(progress);
  const sessionStartedAt = useRef(0);
  const gateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const actionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const narrationRef = useRef<HTMLAudioElement | null>(null);
  const backgroundMusicRef = useRef<HTMLAudioElement | null>(null);

  const current = questions[questionIndex];

  useEffect(() => {
    if (
      'serviceWorker' in navigator &&
      window.location.protocol.startsWith('http') &&
      !['localhost', '127.0.0.1'].includes(window.location.hostname)
    ) {
      const pageBase = window.location.pathname.endsWith('/')
        ? window.location.href
        : new URL('.', window.location.href).href;
      navigator.serviceWorker.register(new URL('sw.js', pageBase).toString()).catch(() => undefined);
    }
  }, []);

  useEffect(() => () => {
    if (gateTimer.current) clearTimeout(gateTimer.current);
    if (actionTimer.current) clearTimeout(actionTimer.current);
    narrationRef.current?.pause();
    backgroundMusicRef.current?.pause();
  }, []);

  const saveProgress = useCallback((update: (previous: Progress) => Progress) => {
    setProgress((previous) => {
      const next = update(previous);
      progressRef.current = next;
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const applyMusicVolume = useCallback((ducked = false) => {
    if (!backgroundMusicRef.current) return;
    const target = progressRef.current.musicVolume * (ducked ? 0.18 : 1);
    backgroundMusicRef.current.volume = Math.min(1, Math.max(0, target));
  }, []);

  const stopMusic = useCallback(() => {
    if (!backgroundMusicRef.current) return;
    backgroundMusicRef.current.pause();
    backgroundMusicRef.current.currentTime = 0;
  }, []);

  const startMusic = useCallback(() => {
    let music = backgroundMusicRef.current;
    if (!music) {
      music = new Audio(new URL('audio/music/gentle-ocean-play.mp3', document.baseURI).toString());
      music.loop = true;
      music.preload = 'auto';
      backgroundMusicRef.current = music;
    }
    applyMusicVolume(false);
    music.play().catch(() => undefined);
  }, [applyMusicVolume]);

  const playPronunciation = useCallback((item: LetterItem) => {
    narrationRef.current?.pause();
    narrationRef.current = null;
    applyMusicVolume(false);
    if (progressRef.current.volume <= 0) return;

    const narration = new Audio(
      new URL(`audio/voice/${item.letter.toLowerCase()}.mp3`, document.baseURI).toString(),
    );
    narration.preload = 'auto';
    narration.volume = progressRef.current.volume;
    narrationRef.current = narration;
    applyMusicVolume(true);

    const restoreMusic = () => {
      if (narrationRef.current === narration) narrationRef.current = null;
      applyMusicVolume(false);
    };
    narration.addEventListener('ended', restoreMusic, { once: true });
    narration.addEventListener('error', restoreMusic, { once: true });
    narration.play().catch(restoreMusic);
  }, [applyMusicVolume]);

  const playTone = useCallback((kind: 'correct' | 'wrong') => {
    if (progressRef.current.volume <= 0) return;
    const AudioContextClass = window.AudioContext ??
      (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;

    const context = new AudioContextClass();
    const gain = context.createGain();
    gain.gain.setValueAtTime(progressRef.current.volume * 0.12, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.55);
    gain.connect(context.destination);

    const notes = kind === 'correct' ? [523.25, 659.25, 783.99] : [330, 294];
    notes.forEach((frequency, index) => {
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

  useEffect(() => {
    if (screen !== 'playing' || !current || feedback) return;
    const timer = window.setTimeout(() => playPronunciation(current.item), 220);
    return () => window.clearTimeout(timer);
  }, [current, feedback, playPronunciation, screen]);

  const startGame = () => {
    if (actionTimer.current) clearTimeout(actionTimer.current);
    narrationRef.current?.pause();
    startMusic();
    setQuestions(buildQuestions(progressRef.current));
    setQuestionIndex(0);
    setWrongCount(0);
    setAssist(false);
    setLocked(false);
    setFeedback(null);
    setSelectedLetter(null);
    setSessionFirstTries(0);
    sessionStartedAt.current = Date.now();
    setScreen('playing');
  };

  const addElapsedTime = useCallback((completed: boolean) => {
    if (!sessionStartedAt.current) return;
    const elapsed = Math.max(1, Math.round((Date.now() - sessionStartedAt.current) / 1000));
    sessionStartedAt.current = 0;
    saveProgress((previous) => ({
      ...previous,
      totalSeconds: previous.totalSeconds + elapsed,
      sessions: previous.sessions + (completed ? 1 : 0),
    }));
  }, [saveProgress]);

  const goHome = () => {
    if (screen === 'playing') addElapsedTime(false);
    if (actionTimer.current) clearTimeout(actionTimer.current);
    narrationRef.current?.pause();
    stopMusic();
    setFeedback(null);
    setScreen('home');
  };

  const answerQuestion = useCallback((letter: string) => {
    if (!current || locked || (assist && letter !== current.item.letter)) return;

    setLocked(true);
    setSelectedLetter(letter);

    if (letter === current.item.letter) {
      const firstTry = wrongCount === 0;
      if (firstTry) setSessionFirstTries((score) => score + 1);
      setFeedback('correct');
      playTone('correct');
      playPronunciation(current.item);

      saveProgress((previous) => {
        const previousStats = previous.letters[current.item.letter] ?? {
          attempts: 0,
          firstCorrect: 0,
          lastPlayed: null,
        };
        return {
          ...previous,
          letters: {
            ...previous.letters,
            [current.item.letter]: {
              attempts: previousStats.attempts + 1,
              firstCorrect: previousStats.firstCorrect + (firstTry ? 1 : 0),
              lastPlayed: new Date().toISOString(),
            },
          },
        };
      });

      actionTimer.current = setTimeout(() => {
        if (questionIndex >= questions.length - 1) {
          addElapsedTime(true);
          stopMusic();
          setScreen('complete');
        } else {
          setQuestionIndex((index) => index + 1);
          setWrongCount(0);
          setAssist(false);
          setLocked(false);
          setFeedback(null);
          setSelectedLetter(null);
        }
      }, 4200);
      return;
    }

    const nextWrongCount = wrongCount + 1;
    setWrongCount(nextWrongCount);
    setAssist(nextWrongCount >= 2);
    setFeedback('wrong');
    playTone('wrong');

    actionTimer.current = setTimeout(() => {
      setLocked(false);
      setFeedback(null);
      setSelectedLetter(null);
    }, 720);
  }, [addElapsedTime, assist, current, locked, playPronunciation, playTone, questionIndex, questions.length, saveProgress, stopMusic, wrongCount]);

  useEffect(() => {
    if (screen !== 'playing' || !current) return;

    const handleLetterKey = (event: KeyboardEvent) => {
      if (event.repeat || event.altKey || event.ctrlKey || event.metaKey) return;
      const letter = event.key.toUpperCase();
      if (!current.choices.includes(letter)) return;
      event.preventDefault();
      answerQuestion(letter);
    };

    window.addEventListener('keydown', handleLetterKey);
    return () => window.removeEventListener('keydown', handleLetterKey);
  }, [answerQuestion, current, screen]);

  const beginParentHold = () => {
    if (gateTimer.current) clearTimeout(gateTimer.current);
    setGateMessage('继续按住…');
    gateTimer.current = setTimeout(() => {
      setGateMessage('');
      setConfirmReset(false);
      setScreen('parent');
    }, 3000);
  };

  const cancelParentHold = () => {
    if (gateTimer.current) clearTimeout(gateTimer.current);
    gateTimer.current = null;
  };

  const summary = useMemo(() => {
    const records = Object.values(progress.letters);
    const attempts = records.reduce((total, item) => total + item.attempts, 0);
    const firstCorrect = records.reduce((total, item) => total + item.firstCorrect, 0);
    return {
      practiced: records.filter((record) => record.attempts > 0).length,
      attempts,
      accuracy: attempts ? Math.round((firstCorrect / attempts) * 100) : 0,
    };
  }, [progress]);

  const updateVolume = (volume: number) => {
    saveProgress((previous) => ({ ...previous, volume }));
    if (narrationRef.current) narrationRef.current.volume = volume;
  };

  const updateMusicVolume = (musicVolume: number) => {
    saveProgress((previous) => ({ ...previous, musicVolume }));
    if (backgroundMusicRef.current) backgroundMusicRef.current.volume = musicVolume;
  };

  const resetProgress = () => {
    const reset = {
      ...emptyProgress(),
      volume: progress.volume,
      musicVolume: progress.musicVolume,
    };
    progressRef.current = reset;
    setProgress(reset);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(reset));
    setConfirmReset(false);
  };

  if (screen === 'playing' && current) {
    return (
      <main className="game-shell">
        <header className="game-header">
          <button className="round-icon-button" type="button" onClick={goHome} aria-label="回到首页">⌂</button>
          <div className="round-progress" aria-label={`第 ${questionIndex + 1} 题，共 ${questions.length} 题`}>
            {questions.map((question, index) => (
              <span className={index <= questionIndex ? 'progress-dot active' : 'progress-dot'} key={`${question.item.letter}-${index}`} />
            ))}
          </div>
          <button className="round-icon-button speaker-button" type="button" onClick={() => playPronunciation(current.item)} aria-label="再听字母和物品读音">🔊</button>
        </header>

        <section className="question-area">
          <div className="learning-focus">
            <ThingPicture item={current.item} className="focus-picture" />
            <div className="focus-caption">
              <strong style={{ background: current.item.color }}>{current.item.letter}</strong>
              <span>{current.item.word}</span>
              <small>{current.item.chinese}</small>
            </div>
          </div>

          <div className={`choice-grid choices-${current.choices.length}`}>
            {current.choices.map((letter) => {
              const isTarget = letter === current.item.letter;
              const classes = [
                'letter-choice',
                wrongCount > 0 && isTarget ? 'hinted' : '',
                assist && isTarget ? 'assisted' : '',
                selectedLetter === letter && feedback === 'wrong' ? 'wrong-choice' : '',
                selectedLetter === letter && feedback === 'correct' ? 'correct-choice' : '',
              ].filter(Boolean).join(' ');

              return (
                <button
                  className={classes}
                  type="button"
                  key={letter}
                  disabled={locked || (assist && !isTarget)}
                  onClick={() => answerQuestion(letter)}
                  aria-label={`字母 ${letter}`}
                >
                  <span>{letter}</span>
                  <small>按 {letter} 键</small>
                </button>
              );
            })}
          </div>

          <div className="feedback-message" role="status" aria-live="polite">
            {feedback === 'wrong' && (assist ? `一起点击 ${current.item.letter}` : '没关系，再试一次！')}
            {!feedback && assist && `看，${current.item.letter} 在闪闪发光！`}
            {!feedback && !assist && '可以点选，也可以按键盘上的字母键'}
          </div>
        </section>

        {feedback === 'correct' && (
          <div className="reward-overlay" role="status" aria-live="assertive">
            <div className="reward-card" style={{ borderColor: current.item.color }}>
              <div className="reward-stars" aria-hidden="true">★ ✦ ★</div>
              <ThingPicture item={current.item} className="reward-picture" />
              <div className="reward-word">
                <strong>{current.item.letter}</strong>
                <span>{current.item.word}</span>
                <small>{current.item.chinese}</small>
              </div>
              <p>太棒了！</p>
            </div>
          </div>
        )}
      </main>
    );
  }

  if (screen === 'complete') {
    return (
      <main className="celebration-shell">
        <section className="celebration-card">
          <div className="celebration-stars" aria-hidden="true">⭐ ✨ ⭐</div>
          <div className="trophy" aria-hidden="true">🏆</div>
          <p className="eyebrow">完成一轮啦</p>
          <h1>做得真棒！</h1>
          <p className="celebration-copy">你完成了 5 道字母题，第一次就答对了 {sessionFirstTries} 题。</p>
          <div className="celebration-actions">
            <button className="start-button compact" type="button" onClick={startGame}>
              再玩一次
            </button>
            <button className="soft-button" type="button" onClick={goHome}>回到首页</button>
          </div>
        </section>
      </main>
    );
  }

  if (screen === 'parent') {
    return (
      <main className="parent-shell">
        <header className="parent-header">
          <div>
            <p className="eyebrow">仅保存在这台设备</p>
            <h1>家长专区</h1>
          </div>
          <button className="soft-button" type="button" onClick={goHome}>完成</button>
        </header>

        <section className="summary-grid" aria-label="学习概况">
          <article><span>认识过</span><strong>{summary.practiced}<small>/22</small></strong><p>个字母</p></article>
          <article><span>完成练习</span><strong>{summary.attempts}</strong><p>道题</p></article>
          <article><span>首次正确率</span><strong>{summary.accuracy}<small>%</small></strong><p>不显示给孩子</p></article>
          <article><span>练习时间</span><strong className="duration-number">{formatDuration(progress.totalSeconds)}</strong><p>{progress.sessions} 个完整小回合</p></article>
        </section>

        <section className="parent-panel settings-panel">
          <div>
            <h2>声音</h2>
            <p>字母与物品使用随游戏保存的儿童风格预生成读音；背景音乐会在读音播放时自动变轻。</p>
          </div>
          <div className="sound-control-stack">
            <label className="volume-control">
              <strong>读音</strong>
              <span aria-hidden="true">🔈</span>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={progress.volume}
                onChange={(event) => updateVolume(Number(event.target.value))}
                aria-label="读音音量"
              />
              <span aria-hidden="true">🔊</span>
            </label>
            <label className="volume-control">
              <strong>音乐</strong>
              <span aria-hidden="true">♪</span>
              <input
                type="range"
                min="0"
                max="0.35"
                step="0.01"
                value={progress.musicVolume}
                onChange={(event) => updateMusicVolume(Number(event.target.value))}
                aria-label="背景音乐音量"
              />
              <span aria-hidden="true">♫</span>
            </label>
          </div>
        </section>

        <section className="parent-panel">
          <div className="panel-heading">
            <div>
              <h2>字母学习记录</h2>
              <p>“首次正确”只统计每道题第一次点击。</p>
            </div>
          </div>
          <div className="letter-stats-grid">
            {LETTERS.map((item) => {
              const stats = progress.letters[item.letter];
              const accuracy = stats?.attempts ? Math.round((stats.firstCorrect / stats.attempts) * 100) : null;
              return (
                <article className="letter-stat" key={item.letter}>
                  <div className="stat-letter" style={{ background: item.color }}>{item.letter}</div>
                  <div>
                    <strong>{item.word} · {item.chinese}</strong>
                    <p>{stats?.attempts ?? 0} 次练习 · {accuracy === null ? '尚无正确率' : `${accuracy}% 首次正确`}</p>
                    {stats?.lastPlayed && <small>最近：{new Date(stats.lastPlayed).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })}</small>}
                  </div>
                  <ThingPicture item={item} className="stat-picture" />
                </article>
              );
            })}
          </div>
        </section>

        <section className="parent-panel privacy-panel">
          <div>
            <h2>隐私与记录</h2>
            <p>无需登录，没有服务器数据库、广告或追踪。不使用麦克风、摄像头和位置。所有统计只在本机，清除后无法恢复。</p>
          </div>
          {!confirmReset ? (
            <button className="danger-soft-button" type="button" onClick={() => setConfirmReset(true)}>清除学习记录</button>
          ) : (
            <div className="reset-confirm">
              <span>确定清除全部记录吗？</span>
              <button type="button" onClick={resetProgress}>确定清除</button>
              <button type="button" onClick={() => setConfirmReset(false)}>取消</button>
            </div>
          )}
        </section>
      </main>
    );
  }

  return (
    <main className="home-shell">
      <div className="sun-glow" aria-hidden="true" />
      <div className="cloud cloud-one" aria-hidden="true" />
      <div className="cloud cloud-two" aria-hidden="true" />

      <header className="home-header">
        <div className="brand-mark" aria-label="Alphabet and Things">
          <span className="brand-a">A</span>
          <ThingPicture item={LETTERS[0]} className="brand-apple" />
        </div>
        <div className="parent-gate-wrap">
          <button
            className="grown-up-button"
            type="button"
            aria-label="家长专区，长按三秒进入"
            onPointerDown={beginParentHold}
            onPointerUp={cancelParentHold}
            onPointerLeave={cancelParentHold}
            onPointerCancel={cancelParentHold}
            onKeyDown={(event) => {
              if (!event.repeat && (event.key === 'Enter' || event.key === ' ')) beginParentHold();
            }}
            onKeyUp={cancelParentHold}
            onContextMenu={(event) => event.preventDefault()}
            onClick={() => setGateMessage('请长按 3 秒进入')}
          >
            <span aria-hidden="true">🔒</span>
            家长专区
          </button>
          {gateMessage && <span className="gate-message" role="status">{gateMessage}</span>}
        </div>
      </header>

      <section className="hero" aria-labelledby="game-title">
        <div className="hero-copy">
          <p className="eyebrow">听一听 · 找一找 · 认识字母</p>
          <h1 id="game-title">
            <span>字母和好朋友</span>
            <small>Alphabet &amp; Things</small>
          </h1>
          <p className="welcome-copy">和苹果、猫咪、火车一起，<br />开心认识英文字母！</p>

          <button className="start-button" type="button" onClick={startGame}>
            <span className="play-icon" aria-hidden="true">▶</span>
            <span>开始游戏<small>LET&apos;S PLAY!</small></span>
          </button>

          <div className="session-note" aria-label="每轮五题，大约三分钟">
            <span aria-hidden="true">⭐</span>
            每次 5 题 · 无需登录 · 记录只存在本机
          </div>
        </div>

        <div className="friends-stage" aria-label="字母与事物示例">
          <div className="rainbow" aria-hidden="true"><span /></div>
          {LETTERS.slice(0, 3).map((item, index) => (
            <div className={`friend friend-${['apple', 'ball', 'cat'][index]}`} key={item.letter}>
              <span className="friend-letter">{item.letter}</span>
              <ThingPicture item={item} className="friend-thing" />
            </div>
          ))}
          <div className="ground" aria-hidden="true">
            <span className="flower flower-one">✿</span>
            <span className="flower flower-two">✿</span>
            <span className="flower flower-three">✿</span>
          </div>
        </div>
      </section>
    </main>
  );
}
