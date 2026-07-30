"""Create repository-friendly WebP assets from the bestiary source PNGs."""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"


def save_webp(
    source: Path,
    destination: Path,
    *,
    max_size: tuple[int, int],
    quality: int,
) -> None:
    if (
        destination.exists()
        and destination.stat().st_size > 0
        and destination.stat().st_mtime >= source.stat().st_mtime
    ):
        return

    with Image.open(source) as opened:
        image = opened.convert("RGBA")
        image.thumbnail(max_size, Image.Resampling.LANCZOS)
        destination.parent.mkdir(parents=True, exist_ok=True)
        image.save(
            destination,
            "WEBP",
            quality=quality,
            method=4,
        )


def optimize_portraits(prune_sources: bool) -> tuple[int, int, int]:
    portrait_root = PUBLIC / "monsters" / "generated"
    thumbnail_root = PUBLIC / "monsters" / "thumbs"
    sources = sorted(portrait_root.glob("*-hd.png"))
    before = sum(source.stat().st_size for source in sources)
    outputs: list[Path] = []

    for source in sources:
        slug = source.stem.removesuffix("-hd")
        portrait = source.with_suffix(".webp")
        thumbnail = thumbnail_root / f"{slug}.webp"
        save_webp(source, portrait, max_size=(960, 1200), quality=88)
        save_webp(source, thumbnail, max_size=(240, 300), quality=78)
        outputs.extend((portrait, thumbnail))

    if len(outputs) != len(sources) * 2 or any(
        not output.exists() or output.stat().st_size == 0 for output in outputs
    ):
        raise RuntimeError("Portrait optimization did not produce every output.")

    after = sum(output.stat().st_size for output in outputs)
    if prune_sources:
        for source in sources:
            source.unlink()
    return len(sources), before, after


def optimize_fieldcraft(prune_sources: bool) -> tuple[int, int, int]:
    icon_root = PUBLIC / "icons" / "fieldcraft"
    sources = sorted(icon_root.glob("*.png"))
    before = sum(source.stat().st_size for source in sources)
    outputs: list[Path] = []

    for source in sources:
        output = source.with_suffix(".webp")
        save_webp(source, output, max_size=(192, 192), quality=88)
        outputs.append(output)

    if len(outputs) != len(sources) or any(
        not output.exists() or output.stat().st_size == 0 for output in outputs
    ):
        raise RuntimeError("Fieldcraft optimization did not produce every output.")

    after = sum(output.stat().st_size for output in outputs)
    if prune_sources:
        for source in sources:
            source.unlink()
    return len(sources), before, after


def optimize_featured_images(prune_sources: bool) -> tuple[int, int, int]:
    image_root = PUBLIC / "images"
    jobs = (
        ("bestiary-medallion.png", "bestiary-medallion.webp", (640, 640), 90),
        ("twin-witcher-swords.png", "twin-witcher-swords.webp", (420, 640), 88),
    )
    before = 0
    after = 0
    completed = 0

    for source_name, output_name, max_size, quality in jobs:
        source = image_root / source_name
        if not source.exists():
            continue
        output = image_root / output_name
        before += source.stat().st_size
        save_webp(source, output, max_size=max_size, quality=quality)
        if not output.exists() or output.stat().st_size == 0:
            raise RuntimeError(f"Featured image optimization failed: {source_name}")
        after += output.stat().st_size
        completed += 1
        if prune_sources:
            source.unlink()

    unused_hero = image_root / "vespera-journal-hero.png"
    if prune_sources and unused_hero.exists():
        unused_hero.unlink()

    return completed, before, after


def megabytes(value: int) -> str:
    return f"{value / (1024 * 1024):.2f} MB"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--prune-sources",
        action="store_true",
        help="Delete source PNGs only after all optimized outputs validate.",
    )
    args = parser.parse_args()

    groups = {
        "portraits": optimize_portraits(args.prune_sources),
        "fieldcraft": optimize_fieldcraft(args.prune_sources),
        "featured": optimize_featured_images(args.prune_sources),
    }
    for name, (count, before, after) in groups.items():
        print(
            f"{name}: {count} assets, "
            f"{megabytes(before)} -> {megabytes(after)}"
        )


if __name__ == "__main__":
    main()
