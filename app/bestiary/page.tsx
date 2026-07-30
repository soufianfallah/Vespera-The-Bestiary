import type { Metadata } from "next";
import { JournalBrowser } from "@/components/bestiary/journal-browser";
import {
  getAllMonsters,
  getCategoryCounts,
  getMonsterThumbnail,
} from "@/lib/bestiary";

export const metadata: Metadata = {
  title: "Known Creatures",
};

export default function BestiaryPage() {
  const monsters = getAllMonsters().map((monster) => ({
    slug: monster.slug,
    name: monster.name,
    category: monster.category,
    story: monster.story.slice(0, 160),
    portrait: getMonsterThumbnail(monster),
    searchText: [
      monster.name,
      monster.category,
      ...monster.weaknesses,
      ...monster.habitat,
      ...monster.locations,
    ]
      .join(" ")
      .toLocaleLowerCase(),
  }));

  return <JournalBrowser monsters={monsters} counts={getCategoryCounts()} />;
}
