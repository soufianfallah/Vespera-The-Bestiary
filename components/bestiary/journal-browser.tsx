"use client";

import { AnimatePresence, motion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { FiArrowUp, FiSearch, FiX } from "react-icons/fi";
import type { Category, Monster } from "@/lib/schema";
import { CATEGORY_LABELS } from "@/lib/schema";
import { AmbientLayer } from "@/components/experience/ambient-layer";
import { Sigil } from "@/components/experience/sigil";
import { useSoundscape } from "@/components/experience/soundscape";

const categoryOrder = Object.keys(CATEGORY_LABELS) as Category[];

type MonsterSummary = Pick<Monster, "category" | "name" | "slug" | "story"> & {
  portrait: string;
  searchText: string;
};

function MonsterCard({
  monster,
  index,
  eager,
}: {
  monster: MonsterSummary;
  index: number;
  eager: boolean;
}) {
  const { playMonsterSelect } = useSoundscape();

  return (
    <article className="monster-card-entry">
      <Link
        href={`/bestiary/${monster.slug}`}
        className="monster-card"
        onClick={() => void playMonsterSelect()}
      >
        <span className="card-number">
          {String(index + 1).padStart(2, "0")}
        </span>
        <div className="card-portrait">
          <Image
            src={monster.portrait}
            alt={`${monster.name}, ${CATEGORY_LABELS[monster.category].toLowerCase()} bestiary portrait`}
            fill
            priority={eager}
            loading={eager ? "eager" : "lazy"}
            fetchPriority={eager ? "high" : "auto"}
            sizes="(max-width: 700px) 74px, 96px"
          />
          <Sigil category={monster.category} className="card-sigil" />
        </div>
        <div>
          <p>{CATEGORY_LABELS[monster.category]}</p>
          <h2>{monster.name}</h2>
          <span>{monster.story.slice(0, 120)}</span>
        </div>
        <i aria-hidden="true">↗</i>
      </Link>
    </article>
  );
}

export function JournalBrowser({
  monsters,
  counts,
}: {
  monsters: MonsterSummary[];
  counts: Record<Category, number>;
}) {
  const [category, setCategory] = useState<Category | "all">("all");
  const [query, setQuery] = useState("");
  const [showScrollTop, setShowScrollTop] = useState(false);

  useEffect(() => {
    const updateScrollTop = () => setShowScrollTop(window.scrollY > 520);
    updateScrollTop();
    window.addEventListener("scroll", updateScrollTop, { passive: true });
    return () => window.removeEventListener("scroll", updateScrollTop);
  }, []);

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return monsters.filter(
      (monster) =>
        (category === "all" || monster.category === category) &&
        (!needle || monster.searchText.includes(needle)),
    );
  }, [category, monsters, query]);

  const grouped = useMemo(() => {
    let visibleIndex = 0;
    return categoryOrder.flatMap((item) => {
      const entries = filtered
        .filter((monster) => monster.category === item)
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((monster) => ({ monster, index: visibleIndex++ }));

      return entries.length ? [{ category: item, entries }] : [];
    });
  }, [filtered]);

  return (
    <main className="archive-shell">
      <AmbientLayer />
      <aside className="journal-sidebar">
        <Link href="/" className="archive-brand">
          <span className="archive-medallion">
            <Image
              src="/images/bestiary-medallion.webp"
              alt=""
              fill
              sizes="48px"
            />
          </span>
          <span>
            <small>Vespera</small>
            The Bestiary
          </span>
        </Link>
        <nav aria-label="Monster categories">
          <button
            className={category === "all" ? "active" : ""}
            onClick={() => setCategory("all")}
          >
            <span>All entries</span>
            <b>{monsters.length}</b>
          </button>
          {categoryOrder.map((item) => (
            <button
              key={item}
              className={category === item ? "active" : ""}
              onClick={() => setCategory(item)}
            >
              <Sigil category={item} />
              <span>{CATEGORY_LABELS[item]}</span>
              <b>{counts[item]}</b>
            </button>
          ))}
        </nav>
      </aside>

      <motion.section
        className="journal-page"
        initial={{ rotateY: -22, opacity: 0, x: 60 }}
        animate={{ rotateY: 0, opacity: 1, x: 0 }}
        transition={{ duration: 1.05, ease: [0.22, 1, 0.36, 1] }}
      >
        <header className="journal-header">
          <div>
            <p className="eyebrow">Volume I · Field observations</p>
            <h1>
              {category === "all"
                ? "Known Creatures"
                : CATEGORY_LABELS[category]}
            </h1>
          </div>
          <label className="search-box">
            <FiSearch aria-hidden="true" />
            <span className="sr-only">Search the bestiary</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search the ink..."
            />
            {query && (
              <button onClick={() => setQuery("")} aria-label="Clear search">
                <FiX />
              </button>
            )}
          </label>
        </header>
        <div className="result-rule">
          <span>{filtered.length} creatures catalogued</span>
          <i />
        </div>
        {category === "all" ? (
          <div className="catalogue-groups">
            {grouped.map((group) => (
              <section
                key={group.category}
                className="catalogue-category"
                aria-labelledby={`category-${group.category}`}
              >
                <header className="catalogue-category-heading">
                  <Sigil category={group.category} />
                  <h2 id={`category-${group.category}`}>
                    {CATEGORY_LABELS[group.category]}
                  </h2>
                  <span>{group.entries.length}</span>
                  <i />
                </header>
                <div className="monster-grid">
                  {group.entries.map(({ monster, index }) => (
                    <MonsterCard
                      key={monster.slug}
                      monster={monster}
                      index={index}
                      eager={index < 4}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <div className="monster-grid">
            {grouped[0]?.entries.map(({ monster, index }) => (
              <MonsterCard
                key={monster.slug}
                monster={monster}
                index={index}
                eager={index < 4}
              />
            ))}
          </div>
        )}
        {filtered.length === 0 && (
          <div className="empty-state">
            <p>No ink answers that name.</p>
            <button
              onClick={() => {
                setQuery("");
                setCategory("all");
              }}
            >
              Clear the page
            </button>
          </div>
        )}
      </motion.section>
      <AnimatePresence>
        {showScrollTop && (
          <motion.button
            className="scroll-to-top"
            type="button"
            aria-label="Return to the top of Known Creatures"
            title="Return to top"
            initial={{ opacity: 0, y: 14, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.9 }}
            whileHover={{ y: -3 }}
            whileTap={{ scale: 0.94 }}
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          >
            <FiArrowUp aria-hidden="true" />
            <span>Top</span>
          </motion.button>
        )}
      </AnimatePresence>
    </main>
  );
}
