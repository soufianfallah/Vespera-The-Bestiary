import "server-only";

import fs from "node:fs";
import path from "node:path";
import { cache } from "react";
import {
  CATEGORY_LABELS,
  categorySchema,
  monsterSchema,
  type Category,
  type Monster,
} from "@/lib/schema";

const dataRoot = path.join(process.cwd(), "data");
const generatedPortraitRoot = path.join(
  process.cwd(),
  "public",
  "monsters",
  "generated",
);
const thumbnailRoot = path.join(process.cwd(), "public", "monsters", "thumbs");

export const getAllMonsters = cache((): Monster[] => {
  const categories = Object.keys(CATEGORY_LABELS).map((value) =>
    categorySchema.parse(value),
  );
  return categories
    .flatMap((category) => {
      const directory = path.join(dataRoot, category);
      return fs
        .readdirSync(directory)
        .filter((file) => file.endsWith(".json"))
        .map((file) =>
          monsterSchema.parse(
            JSON.parse(fs.readFileSync(path.join(directory, file), "utf8")),
          ),
        )
        .sort((a, b) => a.name.localeCompare(b.name));
    });
});

export const getMonster = cache((slug: string): Monster | undefined =>
  getAllMonsters().find((monster) => monster.slug === slug),
);

export const getMonsterPortrait = cache((monster: Monster): string => {
  const webpName = `${monster.slug}-hd.webp`;
  if (fs.existsSync(path.join(generatedPortraitRoot, webpName))) {
    return `/monsters/generated/${webpName}`;
  }

  const pngName = `${monster.slug}-hd.png`;
  return fs.existsSync(path.join(generatedPortraitRoot, pngName))
    ? `/monsters/generated/${pngName}`
    : monster.portrait;
});

export const getMonsterThumbnail = cache((monster: Monster): string => {
  const thumbnailName = `${monster.slug}.webp`;
  return fs.existsSync(path.join(thumbnailRoot, thumbnailName))
    ? `/monsters/thumbs/${thumbnailName}`
    : getMonsterPortrait(monster);
});

export const getCategoryCounts = cache(() =>
  getAllMonsters().reduce(
    (counts, monster) => {
      counts[monster.category] += 1;
      return counts;
    },
    Object.fromEntries(
      Object.keys(CATEGORY_LABELS).map((category) => [category, 0]),
    ) as Record<Category, number>,
  ),
);
