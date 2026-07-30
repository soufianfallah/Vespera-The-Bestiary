"use client";

import { useGSAP } from "@gsap/react";
import {
  motion,
  useReducedMotion,
  useScroll,
  useTransform,
} from "framer-motion";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Image from "next/image";
import Link from "next/link";
import { useRef } from "react";
import {
  GiBurningEmbers,
  GiCrossedSwords,
  GiFairyWand,
  GiOilDrum,
  GiPotionBall,
} from "react-icons/gi";
import { FiExternalLink } from "react-icons/fi";
import type { Monster } from "@/lib/schema";
import { CATEGORY_LABELS } from "@/lib/schema";
import { AmbientLayer } from "@/components/experience/ambient-layer";
import { Sigil } from "@/components/experience/sigil";

gsap.registerPlugin(ScrollTrigger, useGSAP);

const categoryMotion: Record<
  Monster["category"],
  { amplitude: number; duration: number }
> = {
  beasts: { amplitude: 5, duration: 8.5 },
  cursed: { amplitude: 7, duration: 10 },
  draconids: { amplitude: 4, duration: 12 },
  elementa: { amplitude: 3, duration: 13 },
  hybrids: { amplitude: 5, duration: 9.5 },
  insectoids: { amplitude: 7, duration: 7 },
  necrophages: { amplitude: 6, duration: 8.5 },
  ogroids: { amplitude: 3, duration: 13.5 },
  relicts: { amplitude: 4, duration: 14 },
  specters: { amplitude: 11, duration: 10.5 },
  vampires: { amplitude: 7, duration: 9 },
};

function hashSlug(slug: string) {
  return (
    Array.from(slug).reduce(
      (hash, character) => Math.imul(hash ^ character.charCodeAt(0), 16777619),
      2166136261,
    ) >>> 0
  );
}

function getMotionSignature(monster: Monster) {
  const hash = hashSlug(monster.slug);
  const temperament = categoryMotion[monster.category];
  const direction = hash & 1 ? 1 : -1;
  const amplitude = temperament.amplitude * (0.82 + (hash % 37) / 100);
  const duration = temperament.duration + ((hash >>> 8) % 330) / 100;
  const rotate = (0.22 + ((hash >>> 13) % 58) / 100) * direction;

  return {
    creature: {
      x: [0, amplitude * direction, amplitude * -0.55 * direction, 0],
      y: [0, -amplitude * 1.15, amplitude * 0.42, 0],
      rotate: [0, rotate, rotate * -0.7, 0],
      scale: [1, 1.008 + (hash % 5) * 0.002, 0.998, 1],
    },
    aura: {
      x: [0, -amplitude * 0.7 * direction, amplitude * 0.55 * direction, 0],
      y: [0, amplitude * 0.35, -amplitude * 0.5, 0],
      scale: [0.96, 1.04 + (hash % 4) * 0.01, 0.99, 0.96],
      opacity: [0.36, 0.62, 0.44, 0.36],
    },
    duration,
    auraDuration: duration * (1.17 + ((hash >>> 18) % 9) / 100),
    delay: -((hash >>> 20) % 500) / 100,
    origin: `${42 + (hash % 17)}% ${58 + ((hash >>> 5) % 20)}%`,
  };
}

function Fact({
  label,
  value,
}: {
  label: string;
  value: string | string[] | null;
}) {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  const displayedValues =
    label === "Harvest"
      ? values
          .filter(
            (item) =>
              item.length <= 55 && !/===|\{\{|thumb|bestiary entry/i.test(item),
          )
          .slice(0, 4)
      : values;
  return (
    <div className="fact">
      <dt>{label}</dt>
      <dd className={displayedValues.length ? "" : "unknown"}>
        {displayedValues.length ? displayedValues.join(" · ") : "Unknown"}
      </dd>
    </div>
  );
}

function iconPath(value: string) {
  const slug = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const known = new Set([
    "aard",
    "axii",
    "igni",
    "quen",
    "yrden",
    "bleeding",
    "fire",
    "poison",
    "shock-waves",
    "no-conventional-weakness",
    "dancing-star",
    "devil-s-puffball",
    "dimeritium-bomb",
    "grapeshot",
    "moon-dust",
    "northern-wind",
    "samum",
    "blizzard",
    "black-blood",
    "golden-oriole",
    "white-honey",
    "beast-oil",
    "hybrid-oil",
    "relict-oil",
    "cursed-oil",
    "insectoid-oil",
    "specter-oil",
    "draconid-oil",
    "necrophage-oil",
    "vampire-oil",
    "elementa-oil",
    "ogroid-oil",
    "reinald-s-philter",
  ]);
  if (!known.has(slug)) return null;
  const asset = slug === "specter-oil" ? "specter-oil-v2" : slug;
  return `/icons/fieldcraft/${asset}.webp`;
}

export function MonsterDetail({
  monster,
  portraitSrc,
  previousMonster,
  nextMonster,
}: {
  monster: Monster;
  portraitSrc: string;
  previousMonster: Pick<Monster, "name" | "slug">;
  nextMonster: Pick<Monster, "name" | "slug">;
}) {
  const root = useRef<HTMLElement>(null);
  const portrait = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll();
  const portraitY = useTransform(scrollYProgress, [0, 0.45], [0, 70]);
  const motionSignature = getMotionSignature(monster);

  useGSAP(
    () => {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      gsap.utils.toArray<HTMLElement>("[data-reveal]").forEach((section) => {
        gsap.from(section, {
          y: 36,
          opacity: 0,
          duration: 1,
          ease: "power3.out",
          scrollTrigger: { trigger: section, start: "top 85%", once: true },
        });
      });
      gsap.from(".ink-line", {
        scaleX: 0,
        transformOrigin: "left",
        duration: 1.4,
        ease: "power2.inOut",
        delay: 0.3,
      });
    },
    { scope: root },
  );

  const weaknessItems = [
    ...monster.weaknesses.map((value) => ({ value, icon: GiBurningEmbers })),
    ...monster.oils
      .filter((value) => !monster.weaknesses.includes(value))
      .map((value) => ({ value, icon: GiOilDrum })),
    ...monster.bombs
      .filter((value) => !monster.weaknesses.includes(value))
      .map((value) => ({ value, icon: GiPotionBall })),
    ...monster.signs
      .filter((value) => !monster.weaknesses.includes(value))
      .map((value) => ({ value, icon: GiFairyWand })),
  ];

  return (
    <main ref={root} className="detail-shell">
      <AmbientLayer />
      <header className="detail-nav">
        <Link href="/bestiary">← Return to the index</Link>
        <span>A witcher&apos;s bestiary</span>
      </header>

      <section className="monster-hero">
        <div className="monster-title">
          <p className="eyebrow">{CATEGORY_LABELS[monster.category]}</p>
          <h1>{monster.name}</h1>
          <div className="ink-line" />
          <blockquote>{monster.story}</blockquote>
        </div>
        <motion.div
          ref={portrait}
          className={`portrait-panel portrait-${monster.category}`}
          style={{ y: portraitY }}
        >
          <motion.div
            className="portrait-aura"
            animate={reduced ? undefined : motionSignature.aura}
            transition={{
              duration: motionSignature.auraDuration,
              delay: motionSignature.delay,
              ease: "easeInOut",
              repeat: Number.POSITIVE_INFINITY,
            }}
          />
          <Sigil category={monster.category} className="portrait-sigil" />
          <motion.div
            className="portrait-creature"
            animate={reduced ? undefined : motionSignature.creature}
            transition={{
              duration: motionSignature.duration,
              delay: motionSignature.delay,
              ease: "easeInOut",
              repeat: Number.POSITIVE_INFINITY,
              times: [0, 0.34, 0.72, 1],
            }}
            style={{ transformOrigin: motionSignature.origin }}
          >
            <Image
              src={portraitSrc}
              alt={`${monster.name}, ${CATEGORY_LABELS[monster.category].toLowerCase()}`}
              fill
              priority
              sizes="(max-width: 980px) 85vw, 40vw"
              className="monster-portrait-image"
            />
          </motion.div>
          <div className="portrait-haze" />
          <p>Known on the Path</p>
        </motion.div>
      </section>

      <section className="reading-column">
        <article data-reveal className="prose-section">
          <p className="section-index">I</p>
          <div>
            <p className="eyebrow">Creature lore</p>
            <h2>In the margins</h2>
            <p className="drop-cap">{monster.description}</p>
            {monster.lore && <p>{monster.lore}</p>}
          </div>
        </article>

        <article id="preparations" data-reveal className="weakness-section">
          <div>
            <p className="eyebrow">The hunter’s preparation</p>
            <h2>Known measures</h2>
          </div>
          {weaknessItems.length ? (
            <div className="weakness-grid">
              {weaknessItems.map(({ value, icon: Icon }) => (
                <div key={value} className="weakness-item">
                  <span className="weakness-icon-shell" aria-hidden="true">
                    {iconPath(value) ? (
                      <Image
                        src={iconPath(value)!}
                        alt=""
                        width={72}
                        height={72}
                        className="source-weakness-icon"
                      />
                    ) : (
                      <Icon />
                    )}
                  </span>
                  <span className="weakness-label">{value}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="source-unknown">No reliable weakness is known.</p>
          )}
        </article>

        <article id="reckoning" data-reveal className="field-notes">
          <div>
            <p className="eyebrow">A witcher&apos;s reckoning</p>
            <h2>Before the blade is drawn</h2>
          </div>
          <dl>
            <Fact label="Draw" value={monster.swordType} />
            <Fact label="Anoint" value={monster.oils} />
            <Fact label="Cast" value={monster.bombs} />
            <Fact label="Sign" value={monster.signs} />
            <Fact label="Lair" value={monster.habitat} />
            <Fact label="Harvest" value={monster.loot} />
            <Fact label="Trail" value={monster.locations} />
            <Fact label="Threat" value={monster.dangerLevel} />
          </dl>
          <Image
            src="/images/twin-witcher-swords.webp"
            alt=""
            width={280}
            height={424}
            className="sword-watermark"
          />
        </article>

        <article
          id="encounter-record"
          data-reveal
          className="encounter-section"
        >
          <div className="encounter-mark" aria-hidden="true">
            <GiCrossedSwords />
          </div>
          <div>
            <p className="eyebrow">Trail of the creature</p>
            <h2>Known encounters</h2>
            <span className="encounter-medium">{monster.encounter.medium}</span>
            <h3>{monster.encounter.title}</h3>
            <p className="encounter-location">{monster.encounter.location}</p>
            <p>{monster.encounter.note}</p>
            {monster.encounter.referenceUrl && (
              <a
                href={monster.encounter.referenceUrl}
                target="_blank"
                rel="noreferrer"
              >
                Follow this trail
                <FiExternalLink aria-hidden="true" />
              </a>
            )}
          </div>
        </article>

        <footer data-reveal className="provenance">
          <nav
            className="entry-pagination"
            aria-label="Adjacent bestiary entries"
          >
            <Link
              href={`/bestiary/${previousMonster.slug}`}
              className="entry-pagination-previous"
            >
              <small>Previous creature</small>
              <span>← {previousMonster.name}</span>
            </Link>
            <Link href="/bestiary" className="entry-pagination-index">
              Index
            </Link>
            <Link
              href={`/bestiary/${nextMonster.slug}`}
              className="entry-pagination-next"
            >
              <small>Next creature</small>
              <span>{nextMonster.name} →</span>
            </Link>
          </nav>
        </footer>
      </section>
    </main>
  );
}
