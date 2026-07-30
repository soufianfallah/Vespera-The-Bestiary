import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MonsterDetail } from "@/components/bestiary/monster-detail";
import { getAllMonsters, getMonster, getMonsterPortrait } from "@/lib/bestiary";

export const dynamicParams = false;

export function generateStaticParams() {
  return getAllMonsters().map((monster) => ({ slug: monster.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const monster = getMonster(slug);
  return monster
    ? { title: monster.name, description: monster.description.slice(0, 155) }
    : {};
}

export default async function MonsterPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const monster = getMonster(slug);
  if (!monster) notFound();
  const monsters = getAllMonsters();
  const monsterIndex = monsters.findIndex((entry) => entry.slug === slug);
  const previousMonster =
    monsters[(monsterIndex - 1 + monsters.length) % monsters.length];
  const nextMonster = monsters[(monsterIndex + 1) % monsters.length];

  return (
    <MonsterDetail
      monster={monster}
      portraitSrc={getMonsterPortrait(monster)}
      previousMonster={{
        name: previousMonster.name,
        slug: previousMonster.slug,
      }}
      nextMonster={{ name: nextMonster.name, slug: nextMonster.slug }}
    />
  );
}
