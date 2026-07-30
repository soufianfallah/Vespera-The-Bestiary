import { z } from "zod";

export const categorySchema = z.enum([
  "beasts",
  "cursed",
  "draconids",
  "elementa",
  "hybrids",
  "insectoids",
  "necrophages",
  "ogroids",
  "relicts",
  "specters",
  "vampires",
]);

const factSourceSchema = z.enum([
  "journal",
  "game-reference",
  "book-reference",
  "witcher-inference",
]);

export const monsterSchema = z.object({
  schemaVersion: z.literal(1),
  slug: z.string(),
  name: z.string(),
  category: categorySchema,
  description: z.string(),
  story: z.string(),
  lore: z.string(),
  weaknesses: z.array(z.string()),
  oils: z.array(z.string()),
  bombs: z.array(z.string()),
  signs: z.array(z.string()),
  swordType: z.string().nullable(),
  habitat: z.array(z.string()),
  loot: z.array(z.string()),
  locations: z.array(z.string()),
  dangerLevel: z.string().nullable(),
  factSources: z.object({
    swordType: factSourceSchema,
    oils: factSourceSchema,
    bombs: factSourceSchema,
    signs: factSourceSchema,
    habitat: factSourceSchema,
    loot: factSourceSchema,
    locations: factSourceSchema,
    dangerLevel: factSourceSchema,
  }),
  encounter: z.object({
    medium: z.enum(["game", "book", "game-and-book", "inferred"]),
    title: z.string(),
    location: z.string(),
    note: z.string(),
    referenceUrl: z.string().url().nullable(),
  }),
  portrait: z.string(),
  gallery: z.array(z.string()),
  source: z.object({
    file: z.string(),
    page: z.number(),
    embeddedImageCount: z.number(),
    ocrConfidence: z.number(),
    extractedAt: z.string(),
  }),
});

export type Category = z.infer<typeof categorySchema>;
export type Monster = z.infer<typeof monsterSchema>;

export const CATEGORY_LABELS: Record<Category, string> = {
  beasts: "Beasts",
  cursed: "Cursed Ones",
  draconids: "Draconids",
  elementa: "Elementa",
  hybrids: "Hybrids",
  insectoids: "Insectoids",
  necrophages: "Necrophages",
  ogroids: "Ogroids",
  relicts: "Relicts",
  specters: "Specters",
  vampires: "Vampires",
};
