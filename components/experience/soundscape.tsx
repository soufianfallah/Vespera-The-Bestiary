"use client";

import { usePathname } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { FiMusic, FiPause, FiPlay, FiSkipForward } from "react-icons/fi";

type SoundscapeMode = "threshold" | "journal";

type SoundscapeContextValue = {
  playing: boolean;
  start: () => Promise<void>;
  playPageFlip: () => Promise<void>;
  playMonsterHover: () => Promise<void>;
  playMonsterSelect: () => Promise<void>;
  togglePlayback: () => Promise<void>;
};

type Scene = {
  gain: GainNode;
  sources: AudioScheduledSourceNode[];
  timer: number;
};

type PlayerPosition = {
  x: number;
  y: number;
};

type DragState = {
  pointerId: number;
  offsetX: number;
  offsetY: number;
};

const SoundscapeContext = createContext<SoundscapeContextValue | null>(null);
const playerPositionKey = "vespera-player-position";
const localTrackVolume = 0.34;

const sceneNames: Record<SoundscapeMode, string> = {
  threshold: "At the Threshold",
  journal: "Along the Path",
};

type LocalTrack = {
  name: string;
  path: string;
  audibleFrom: number;
};

const localTracks: LocalTrack[] = [
  {
    name: "Kaer Morhen",
    path: "/audio-local/Kaer%20Morhen%20(From%20The%20Witcher%203%20-%20Wild%20Hunt).mp3",
    audibleFrom: 2.44,
  },
  {
    name: "Fields of Ard Skellig",
    path: "/audio-local/The%20Fields%20of%20Ard%20Skellig%20(Midnight).mp3",
    audibleFrom: 0.74,
  },
  {
    name: "Bad News Ahead",
    path: "/audio-local/1-11.%20Bad%20News%20Ahead%20Full.mp3",
    audibleFrom: 2.86,
  },
  {
    name: "Geralt and Yen",
    path: "/audio-local/1-13.%20CS001%20Geralt%20and%20Yen.mp3",
    audibleFrom: 0.02,
  },
];

function makeWind(context: AudioContext) {
  const buffer = context.createBuffer(
    1,
    context.sampleRate * 3,
    context.sampleRate,
  );
  const channel = buffer.getChannelData(0);
  let drift = 0;

  for (let index = 0; index < channel.length; index += 1) {
    drift = drift * 0.985 + (Math.random() * 2 - 1) * 0.015;
    channel[index] = drift;
  }

  return buffer;
}

function playAccent(
  context: AudioContext,
  destination: AudioNode,
  frequency: number,
  mode: SoundscapeMode,
) {
  const now = context.currentTime;
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  const filter = context.createBiquadFilter();

  oscillator.type = mode === "threshold" ? "sine" : "triangle";
  oscillator.frequency.setValueAtTime(frequency, now);
  oscillator.detune.setValueAtTime(mode === "threshold" ? -7 : 5, now);
  filter.type = "lowpass";
  filter.frequency.value = mode === "threshold" ? 880 : 1350;
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(
    mode === "threshold" ? 0.014 : 0.018,
    now + 0.035,
  );
  gain.gain.exponentialRampToValueAtTime(
    0.0001,
    now + (mode === "threshold" ? 4.6 : 2.4),
  );

  oscillator.connect(filter);
  filter.connect(gain);
  gain.connect(destination);
  oscillator.start(now);
  oscillator.stop(now + (mode === "threshold" ? 4.8 : 2.6));
}

function createPageFlip(context: AudioContext, destination: AudioNode) {
  const now = context.currentTime;
  const duration = 0.72;
  const buffer = context.createBuffer(
    1,
    Math.ceil(context.sampleRate * duration),
    context.sampleRate,
  );
  const channel = buffer.getChannelData(0);

  for (let index = 0; index < channel.length; index += 1) {
    const progress = index / channel.length;
    const rasp = Math.random() * 2 - 1;
    const fold = Math.sin(progress * Math.PI * 11) * 0.18;
    channel[index] = (rasp + fold) * Math.sin(progress * Math.PI);
  }

  const paper = context.createBufferSource();
  const filter = context.createBiquadFilter();
  const paperGain = context.createGain();
  const thump = context.createOscillator();
  const thumpGain = context.createGain();

  paper.buffer = buffer;
  paper.playbackRate.setValueAtTime(0.78, now);
  paper.playbackRate.exponentialRampToValueAtTime(1.42, now + duration);
  filter.type = "bandpass";
  filter.Q.value = 0.85;
  filter.frequency.setValueAtTime(520, now);
  filter.frequency.exponentialRampToValueAtTime(2800, now + 0.38);
  filter.frequency.exponentialRampToValueAtTime(740, now + duration);
  paperGain.gain.setValueAtTime(0.0001, now);
  paperGain.gain.exponentialRampToValueAtTime(0.22, now + 0.06);
  paperGain.gain.exponentialRampToValueAtTime(0.065, now + 0.38);
  paperGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  thump.type = "sine";
  thump.frequency.setValueAtTime(118, now + 0.43);
  thump.frequency.exponentialRampToValueAtTime(68, now + 0.62);
  thumpGain.gain.setValueAtTime(0.0001, now);
  thumpGain.gain.setValueAtTime(0.065, now + 0.43);
  thumpGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.66);

  paper.connect(filter);
  filter.connect(paperGain);
  paperGain.connect(destination);
  thump.connect(thumpGain);
  thumpGain.connect(destination);
  paper.start(now);
  paper.stop(now + duration);
  thump.start(now);
  thump.stop(now + 0.7);
}

function createInkScratch(
  context: AudioContext,
  destination: AudioNode,
  emphasis: "hover" | "select",
) {
  const now = context.currentTime;
  const duration = emphasis === "hover" ? 0.12 : 0.19;
  const buffer = context.createBuffer(
    1,
    Math.ceil(context.sampleRate * duration),
    context.sampleRate,
  );
  const channel = buffer.getChannelData(0);

  for (let index = 0; index < channel.length; index += 1) {
    const progress = index / channel.length;
    const grain = Math.random() * 2 - 1;
    const nib = Math.sin(progress * Math.PI * (emphasis === "hover" ? 9 : 15));
    const envelope = Math.sin(progress * Math.PI) ** 1.6;
    channel[index] = (grain * 0.78 + nib * 0.22) * envelope;
  }

  const scratch = context.createBufferSource();
  const filter = context.createBiquadFilter();
  const gain = context.createGain();

  scratch.buffer = buffer;
  scratch.playbackRate.value = emphasis === "hover" ? 1.18 : 0.94;
  filter.type = "bandpass";
  filter.Q.value = emphasis === "hover" ? 1.5 : 1.1;
  filter.frequency.setValueAtTime(emphasis === "hover" ? 1650 : 1180, now);
  filter.frequency.exponentialRampToValueAtTime(
    emphasis === "hover" ? 2850 : 3400,
    now + duration,
  );
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(
    emphasis === "hover" ? 0.026 : 0.052,
    now + 0.018,
  );
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  scratch.connect(filter);
  filter.connect(gain);
  gain.connect(destination);
  scratch.start(now);
  scratch.stop(now + duration);
}

function createMedallionChime(context: AudioContext, destination: AudioNode) {
  const start = context.currentTime + 0.075;
  const partials = [
    { frequency: 987.77, level: 0.024, decay: 0.58 },
    { frequency: 1481.66, level: 0.014, decay: 0.43 },
    { frequency: 2312.4, level: 0.006, decay: 0.31 },
  ];

  partials.forEach(({ frequency, level, decay }, index) => {
    const tone = context.createOscillator();
    const gain = context.createGain();
    const filter = context.createBiquadFilter();

    tone.type = index === 0 ? "sine" : "triangle";
    tone.frequency.setValueAtTime(frequency, start);
    tone.frequency.exponentialRampToValueAtTime(
      frequency * (index === 0 ? 0.997 : 1.003),
      start + decay,
    );
    filter.type = "highpass";
    filter.frequency.value = 620;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(level, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + decay);

    tone.connect(filter);
    filter.connect(gain);
    gain.connect(destination);
    tone.start(start);
    tone.stop(start + decay + 0.03);
  });
}

function createScene(
  context: AudioContext,
  destination: AudioNode,
  mode: SoundscapeMode,
): Scene {
  const sceneGain = context.createGain();
  const wind = context.createBufferSource();
  const windFilter = context.createBiquadFilter();
  const windGain = context.createGain();
  const sources: AudioScheduledSourceNode[] = [wind];
  const droneFrequencies =
    mode === "threshold" ? [55, 82.41, 110] : [73.42, 110, 146.83];
  const accentNotes =
    mode === "threshold"
      ? [110, 130.81, 164.81, 146.83]
      : [146.83, 174.61, 220, 196, 164.81, 220];
  let accentIndex = 0;

  sceneGain.gain.value = 0.0001;
  sceneGain.connect(destination);
  sceneGain.gain.exponentialRampToValueAtTime(1, context.currentTime + 1.4);

  wind.buffer = makeWind(context);
  wind.loop = true;
  windFilter.type = "lowpass";
  windFilter.frequency.value = mode === "threshold" ? 430 : 760;
  windGain.gain.value = mode === "threshold" ? 0.045 : 0.026;
  wind.connect(windFilter);
  windFilter.connect(windGain);
  windGain.connect(sceneGain);
  wind.start();

  droneFrequencies.forEach((frequency, index) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = index === 0 ? "sine" : "triangle";
    oscillator.frequency.value = frequency;
    oscillator.detune.value = index * 4 - 3;
    gain.gain.value = mode === "threshold" ? 0.006 - index * 0.001 : 0.004;
    oscillator.connect(gain);
    gain.connect(sceneGain);
    oscillator.start();
    sources.push(oscillator);
  });

  const accent = () => {
    playAccent(
      context,
      sceneGain,
      accentNotes[accentIndex % accentNotes.length],
      mode,
    );
    accentIndex += 1;
  };

  accent();
  const timer = window.setInterval(accent, mode === "threshold" ? 7200 : 4100);

  return { gain: sceneGain, sources, timer };
}

function disposeScene(context: AudioContext, scene: Scene) {
  window.clearInterval(scene.timer);
  const now = context.currentTime;
  scene.gain.gain.cancelScheduledValues(now);
  scene.gain.gain.setValueAtTime(Math.max(scene.gain.gain.value, 0.0001), now);
  scene.gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.7);
  window.setTimeout(() => {
    scene.sources.forEach((source) => {
      try {
        source.stop();
      } catch {
        // The source may already have completed.
      }
      source.disconnect();
    });
    scene.gain.disconnect();
  }, 850);
}

export function useSoundscape() {
  const value = useContext(SoundscapeContext);
  if (!value) {
    throw new Error("useSoundscape must be used inside SoundscapeProvider");
  }
  return value;
}

export function SoundscapeProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const mode: SoundscapeMode = pathname === "/" ? "threshold" : "journal";
  const [playing, setPlaying] = useState(false);
  const [localTrackActive, setLocalTrackActive] = useState(false);
  const [trackIndex, setTrackIndex] = useState<number | null>(null);
  const [playerPosition, setPlayerPosition] = useState<PlayerPosition | null>(
    null,
  );
  const [dragging, setDragging] = useState(false);
  const contextRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<GainNode | null>(null);
  const sceneRef = useRef<Scene | null>(null);
  const modeRef = useRef(mode);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const sourceRef = useRef<"local" | "procedural" | null>(null);
  const startInFlightRef = useRef<Promise<void> | null>(null);
  const autoplayAttemptedRef = useRef(false);
  const userPausedRef = useRef(false);
  const shouldResumeRef = useRef(true);
  const lastMonsterHoverRef = useRef(0);
  const playerRef = useRef<HTMLElement | null>(null);
  const positionRef = useRef<PlayerPosition | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const currentTrack =
    trackIndex === null ? null : localTracks[trackIndex % localTracks.length];

  const clampPosition = useCallback((position: PlayerPosition) => {
    const player = playerRef.current;
    if (!player) return position;
    const margin = 8;
    const maxX = Math.max(
      margin,
      window.innerWidth - player.offsetWidth - margin,
    );
    const maxY = Math.max(
      margin,
      window.innerHeight - player.offsetHeight - margin,
    );
    return {
      x: Math.min(Math.max(position.x, margin), maxX),
      y: Math.min(Math.max(position.y, margin), maxY),
    };
  }, []);

  const updatePlayerPosition = useCallback(
    (position: PlayerPosition) => {
      const next = clampPosition(position);
      positionRef.current = next;
      setPlayerPosition(next);
    },
    [clampPosition],
  );

  const ensureAudioGraph = useCallback(() => {
    let context = contextRef.current;

    if (!context) {
      context = new AudioContext();
      const master = context.createGain();
      master.gain.value = 0.86;
      master.connect(context.destination);
      contextRef.current = context;
      masterRef.current = master;
    }

    return {
      context,
      master: masterRef.current as GainNode,
    };
  }, []);

  const startProcedural = useCallback(async () => {
    const { context, master } = ensureAudioGraph();
    audioRef.current?.pause();

    if (!sceneRef.current) {
      modeRef.current = mode;
      sceneRef.current = createScene(context, master, mode);
    } else if (modeRef.current !== mode) {
      const previous = sceneRef.current;
      modeRef.current = mode;
      sceneRef.current = createScene(context, master, mode);
      disposeScene(context, previous);
    }

    await context.resume();
    sourceRef.current = "procedural";
    setLocalTrackActive(false);
    setPlaying(context.state === "running");
  }, [ensureAudioGraph, mode]);

  const startLocal = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio || !currentTrack) return false;

    if (audio.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      audio.load();
      return false;
    }

    audio.volume = localTrackVolume;
    if (audio.ended || audio.currentTime < currentTrack.audibleFrom) {
      audio.currentTime = currentTrack.audibleFrom;
    }

    try {
      await audio.play();
    } catch {
      return false;
    }

    if (contextRef.current?.state === "running") {
      await contextRef.current.suspend();
    }
    sourceRef.current = "local";
    setLocalTrackActive(true);
    setPlaying(true);
    return true;
  }, [currentTrack]);

  const start = useCallback(() => {
    if (userPausedRef.current) return Promise.resolve();
    if (startInFlightRef.current) return startInFlightRef.current;

    const run = (async () => {
      const localStarted = await startLocal();
      if (!localStarted) {
        const audio = audioRef.current;
        if (!audio || audio.error) await startProcedural();
      }
      window.sessionStorage.setItem("vespera-soundscape", "awakened");
    })();
    startInFlightRef.current = run;
    void run.finally(() => {
      if (startInFlightRef.current === run) startInFlightRef.current = null;
    });
    return run;
  }, [startLocal, startProcedural]);

  const playPageFlip = useCallback(async () => {
    const { context, master } = ensureAudioGraph();
    await context.resume();
    createPageFlip(context, master);
  }, [ensureAudioGraph]);

  const playMonsterHover = useCallback(async () => {
    const now = performance.now();
    if (now - lastMonsterHoverRef.current < 110) return;
    lastMonsterHoverRef.current = now;
    const { context, master } = ensureAudioGraph();
    await context.resume();
    createInkScratch(context, master, "hover");
  }, [ensureAudioGraph]);

  const playMonsterSelect = useCallback(async () => {
    const { context, master } = ensureAudioGraph();
    await context.resume();
    createInkScratch(context, master, "select");
    createMedallionChime(context, master);
  }, [ensureAudioGraph]);

  const togglePlayback = useCallback(async () => {
    const audio = audioRef.current;
    if (sourceRef.current === "local" && audio) {
      if (audio.paused) {
        userPausedRef.current = false;
        shouldResumeRef.current = true;
        if (
          !currentTrack ||
          audio.readyState < HTMLMediaElement.HAVE_METADATA
        ) {
          audio.load();
          return;
        }
        if (audio.currentTime < currentTrack.audibleFrom) {
          audio.currentTime = currentTrack.audibleFrom;
        }
        try {
          await audio.play();
          setPlaying(true);
        } catch {
          // A later pointer or keyboard gesture will retry playback.
        }
      } else {
        userPausedRef.current = true;
        shouldResumeRef.current = false;
        audio.pause();
        setPlaying(false);
      }
      return;
    }

    const context = contextRef.current;
    if (!context || context.state === "closed") {
      userPausedRef.current = false;
      shouldResumeRef.current = true;
      await start();
      return;
    }

    if (context.state === "running") {
      userPausedRef.current = true;
      shouldResumeRef.current = false;
      await context.suspend();
      setPlaying(false);
    } else {
      userPausedRef.current = false;
      shouldResumeRef.current = true;
      await context.resume();
      setPlaying(true);
    }
  }, [currentTrack, start]);

  const nextTrack = useCallback(() => {
    shouldResumeRef.current = !userPausedRef.current;
    audioRef.current?.pause();
    setPlaying(false);
    setTrackIndex((current) =>
      current === null ? 0 : (current + 1) % localTracks.length,
    );
  }, []);

  useEffect(() => {
    setTrackIndex(Math.floor(Math.random() * localTracks.length));
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !currentTrack) return;
    audio.pause();
    audio.src = currentTrack.path;
    audio.volume = localTrackVolume;
    audio.load();
    setLocalTrackActive(true);
    sourceRef.current = "local";
  }, [currentTrack]);

  useEffect(() => {
    if (sourceRef.current !== "procedural" || !sceneRef.current) return;
    const context = contextRef.current;
    const master = masterRef.current;
    if (!context || !master || modeRef.current === mode) return;
    const previous = sceneRef.current;
    modeRef.current = mode;
    sceneRef.current = createScene(context, master, mode);
    disposeScene(context, previous);
  }, [mode]);

  useEffect(() => {
    if (!autoplayAttemptedRef.current) {
      autoplayAttemptedRef.current = true;
      void start();
    }
    if (playing) return;

    const unlock = (event: Event) => {
      if (
        event.target instanceof Element &&
        event.target.closest(".soundscape-controls")
      ) {
        return;
      }
      void start();
    };

    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("wheel", unlock, { once: true, passive: true });
    window.addEventListener("keydown", unlock, { once: true });
    window.addEventListener("touchstart", unlock, {
      once: true,
      passive: true,
    });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("wheel", unlock);
      window.removeEventListener("keydown", unlock);
      window.removeEventListener("touchstart", unlock);
    };
  }, [playing, start]);

  useEffect(() => {
    const saved = window.localStorage.getItem(playerPositionKey);
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as Partial<PlayerPosition>;
        if (Number.isFinite(parsed.x) && Number.isFinite(parsed.y)) {
          updatePlayerPosition({
            x: parsed.x as number,
            y: parsed.y as number,
          });
        }
      } catch {
        window.localStorage.removeItem(playerPositionKey);
      }
    }

    const keepInView = () => {
      if (positionRef.current) updatePlayerPosition(positionRef.current);
    };
    window.addEventListener("resize", keepInView);
    return () => window.removeEventListener("resize", keepInView);
  }, [updatePlayerPosition]);

  const beginDrag = useCallback((event: React.PointerEvent<HTMLElement>) => {
    if ((event.target as Element).closest("button")) return;
    const player = playerRef.current;
    if (!player) return;
    const bounds = player.getBoundingClientRect();
    dragRef.current = {
      pointerId: event.pointerId,
      offsetX: event.clientX - bounds.left,
      offsetY: event.clientY - bounds.top,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
  }, []);

  const movePlayer = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      event.preventDefault();
      updatePlayerPosition({
        x: event.clientX - drag.offsetX,
        y: event.clientY - drag.offsetY,
      });
    },
    [updatePlayerPosition],
  );

  const finishDrag = useCallback((event: React.PointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (positionRef.current) {
      window.localStorage.setItem(
        playerPositionKey,
        JSON.stringify(positionRef.current),
      );
    }
  }, []);

  useEffect(
    () => () => {
      audioRef.current?.pause();
      if (sceneRef.current && contextRef.current) {
        disposeScene(contextRef.current, sceneRef.current);
      }
      if (contextRef.current) void contextRef.current.close();
    },
    [],
  );

  const value = useMemo(
    () => ({
      playing,
      start,
      playPageFlip,
      playMonsterHover,
      playMonsterSelect,
      togglePlayback,
    }),
    [
      playMonsterHover,
      playMonsterSelect,
      playPageFlip,
      playing,
      start,
      togglePlayback,
    ],
  );

  return (
    <SoundscapeContext.Provider value={value}>
      {children}
      <audio
        ref={audioRef}
        hidden
        preload="auto"
        onLoadedMetadata={(event) => {
          if (currentTrack) {
            event.currentTarget.currentTime = currentTrack.audibleFrom;
          }
        }}
        onCanPlay={(event) => {
          if (
            currentTrack &&
            event.currentTarget.currentTime < currentTrack.audibleFrom
          ) {
            event.currentTarget.currentTime = currentTrack.audibleFrom;
          }
          if (shouldResumeRef.current && !userPausedRef.current) {
            void start();
          }
        }}
        onPlay={() => {
          sourceRef.current = "local";
          setLocalTrackActive(true);
          setPlaying(true);
        }}
        onPause={() => {
          if (sourceRef.current === "local") setPlaying(false);
        }}
        onEnded={() => {
          shouldResumeRef.current = true;
          setTrackIndex((current) =>
            current === null ? 0 : (current + 1) % localTracks.length,
          );
        }}
        onError={() => void startProcedural()}
      />
      <aside
        ref={playerRef}
        className="soundscape-controls"
        data-dragging={dragging ? "true" : "false"}
        aria-label="Draggable music controls"
        title="Drag to reposition"
        style={
          playerPosition
            ? {
                left: playerPosition.x,
                top: playerPosition.y,
                right: "auto",
                bottom: "auto",
              }
            : undefined
        }
        onPointerDown={beginDrag}
        onPointerMove={movePlayer}
        onPointerUp={finishDrag}
        onPointerCancel={finishDrag}
      >
        <div className="soundscape-title" aria-live="polite">
          <FiMusic aria-hidden="true" />
          <span>
            <small>
              {localTrackActive ? "Witcher's refrain" : "Vespera soundscape"}
            </small>
            <strong>
              {localTrackActive && currentTrack
                ? currentTrack.name
                : sceneNames[mode]}
            </strong>
          </span>
        </div>
        <button
          type="button"
          onClick={() => void togglePlayback()}
          aria-label={playing ? "Pause music" : "Play music"}
          title={playing ? "Pause music" : "Play music"}
        >
          {playing ? (
            <FiPause aria-hidden="true" />
          ) : (
            <FiPlay aria-hidden="true" />
          )}
        </button>
        <button
          type="button"
          onClick={nextTrack}
          aria-label="Play next track"
          title="Next track"
        >
          <FiSkipForward aria-hidden="true" />
        </button>
      </aside>
    </SoundscapeContext.Provider>
  );
}
