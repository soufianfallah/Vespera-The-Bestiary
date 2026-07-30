"use client";

import { useEffect, useMemo, useState } from "react";

export function AmbientLayer() {
  const [reducedMotion, setReducedMotion] = useState(true);
  const particles = useMemo(
    () =>
      Array.from({ length: 24 }, (_, index) => ({
        left: `${(index * 37) % 101}%`,
        delay: `${(index % 8) * -1.7}s`,
        duration: `${10 + (index % 7) * 2.1}s`,
        size: `${1 + (index % 3)}px`,
      })),
    [],
  );

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return (
    <div className="ambient-layer" aria-hidden="true">
      <div className="vignette" />
      <div className="fog fog-one" />
      <div className="fog fog-two" />
      {!reducedMotion &&
        particles.map((particle, index) => (
          <i
            key={index}
            className="dust"
            style={{
              left: particle.left,
              width: particle.size,
              height: particle.size,
              animationDelay: particle.delay,
              animationDuration: particle.duration,
            }}
          />
        ))}
    </div>
  );
}
