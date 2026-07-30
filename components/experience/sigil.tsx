import type { IconType } from "react-icons";
import {
  GiCrystalGrowth,
  GiCursedStar,
  GiEvilBat,
  GiFangedSkull,
  GiGriffinSymbol,
  GiOgre,
  GiSpiderAlt,
  GiSpectre,
  GiSpikedDragonHead,
  GiTotemMask,
  GiWolfHead,
} from "react-icons/gi";
import type { Category } from "@/lib/schema";

const categoryIcons: Record<Category, IconType> = {
  beasts: GiWolfHead,
  cursed: GiCursedStar,
  draconids: GiSpikedDragonHead,
  elementa: GiCrystalGrowth,
  hybrids: GiGriffinSymbol,
  insectoids: GiSpiderAlt,
  necrophages: GiFangedSkull,
  ogroids: GiOgre,
  relicts: GiTotemMask,
  specters: GiSpectre,
  vampires: GiEvilBat,
};

export function Sigil({
  category,
  className = "",
}: {
  category: Category;
  className?: string;
}) {
  const Icon = categoryIcons[category];

  return <Icon className={className} aria-hidden="true" />;
}
