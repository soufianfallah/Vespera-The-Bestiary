"use client";

import {
  AnimatePresence,
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
} from "framer-motion";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { AmbientLayer } from "./ambient-layer";
import { useSoundscape } from "./soundscape";

function BestiaryMedallion({ reduced }: { reduced: boolean | null }) {
  const pointerX = useMotionValue(0);
  const pointerY = useMotionValue(0);
  const rotateX = useSpring(useTransform(pointerY, [-0.5, 0.5], [2.5, -2.5]), {
    stiffness: 90,
    damping: 18,
  });
  const rotateY = useSpring(useTransform(pointerX, [-0.5, 0.5], [-2.5, 2.5]), {
    stiffness: 90,
    damping: 18,
  });

  useEffect(() => {
    if (reduced) return;

    const updateTilt = (event: PointerEvent) => {
      pointerX.set(event.clientX / window.innerWidth - 0.5);
      pointerY.set(event.clientY / window.innerHeight - 0.5);
    };
    const resetTilt = () => {
      pointerX.set(0);
      pointerY.set(0);
    };

    window.addEventListener("pointermove", updateTilt, { passive: true });
    window.addEventListener("pointerleave", resetTilt);
    return () => {
      window.removeEventListener("pointermove", updateTilt);
      window.removeEventListener("pointerleave", resetTilt);
    };
  }, [pointerX, pointerY, reduced]);

  return (
    <motion.div
      className="opening-medallion"
      style={{
        rotateX: reduced ? 0 : rotateX,
        rotateY: reduced ? 0 : rotateY,
        transformPerspective: 900,
      }}
      animate={
        reduced
          ? undefined
          : {
              y: [0, -5, 0],
              rotate: [-1.1, 1.1, -1.1],
            }
      }
      transition={{
        duration: 7,
        ease: "easeInOut",
        repeat: Number.POSITIVE_INFINITY,
      }}
    >
      <Image
        src="/images/bestiary-medallion.webp"
        alt=""
        fill
        priority
        sizes="(max-width: 700px) 210px, (max-width: 1200px) 280px, 340px"
      />
      <span className="medallion-glint" aria-hidden="true" />
    </motion.div>
  );
}

export function OpeningSequence() {
  const router = useRouter();
  const reduced = useReducedMotion();
  const { playing: soundOn, start: startSound } = useSoundscape();
  const [leaving, setLeaving] = useState(false);
  const wheelDistance = useRef(0);
  const touchStartY = useRef<number | null>(null);

  const enter = useCallback(() => {
    if (leaving) return;
    setLeaving(true);
    if (!soundOn) void startSound();
    window.sessionStorage.setItem("vespera-entered", "true");
    window.setTimeout(() => router.push("/bestiary"), reduced ? 150 : 1150);
  }, [leaving, reduced, router, soundOn, startSound]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Enter") enter();
    };
    const onWheel = (event: WheelEvent) => {
      if (event.deltaY <= 0) {
        wheelDistance.current = Math.max(
          0,
          wheelDistance.current + event.deltaY,
        );
        return;
      }
      wheelDistance.current += event.deltaY;
      if (wheelDistance.current >= 90) enter();
    };
    const onTouchStart = (event: TouchEvent) => {
      touchStartY.current = event.touches[0]?.clientY ?? null;
    };
    const onTouchEnd = (event: TouchEvent) => {
      const start = touchStartY.current;
      const end = event.changedTouches[0]?.clientY;
      touchStartY.current = null;
      if (start !== null && end !== undefined && start - end >= 48) enter();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("wheel", onWheel, { passive: true });
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchend", onTouchEnd);
    };
  }, [enter]);

  return (
    <main className="opening-screen">
      <AmbientLayer />
      <motion.div
        className="opening-image"
        initial={{ opacity: 0, scale: 1.08 }}
        animate={{ opacity: leaving ? 0 : 0.52, scale: leaving ? 1.13 : 1 }}
        transition={{ duration: reduced ? 0 : 2.8, ease: "easeOut" }}
      />
      <AnimatePresence>
        {!leaving && (
          <motion.section
            className="opening-content"
            initial={false}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 0.94, y: -24, filter: "blur(8px)" }}
            transition={{ duration: reduced ? 0 : 1.1 }}
          >
            <motion.div
              className="opening-medallion-reveal"
              initial={false}
              animate={{ opacity: 1, scale: 1, rotate: 0 }}
              transition={{
                delay: reduced ? 0 : 0.3,
                duration: reduced ? 0 : 1.8,
                ease: [0.22, 1, 0.36, 1],
              }}
            >
              <BestiaryMedallion reduced={reduced} />
            </motion.div>
            <motion.p
              className="eyebrow"
              initial={false}
              animate={{ opacity: 0.78 }}
              transition={{ delay: reduced ? 0 : 1.5 }}
            >
              A chronicle of things best left unnamed
            </motion.p>
            <motion.h1
              initial={false}
              animate={{ opacity: 1, letterSpacing: "0.13em" }}
              transition={{ delay: reduced ? 0 : 1, duration: 1.6 }}
            >
              The Bestiary
            </motion.h1>
            <motion.button
              className="enter-button"
              onClick={enter}
              initial={false}
              animate={{ opacity: 1 }}
              transition={{ delay: reduced ? 0 : 2.4 }}
            >
              <span>Scroll to open</span>
              <small>
                {soundOn
                  ? "ambience awakened · Enter also works"
                  : "or press Enter · sound begins on entry"}
              </small>
              <i className="scroll-cue" aria-hidden="true">
                <b />
              </i>
            </motion.button>
          </motion.section>
        )}
      </AnimatePresence>
      {leaving && <div className="page-flare" aria-hidden="true" />}
    </main>
  );
}
