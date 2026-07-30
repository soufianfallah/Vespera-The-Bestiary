from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image, ImageChops


ATLAS_ROWS = {
    "runes-effects-atlas.png": [
        ["aard", "axii", "igni", "quen", "yrden"],
        ["bleeding", "fire", "poison", "shock-waves", "no-conventional-weakness"],
    ],
    "oils-atlas.png": [
        [
            "beast-oil",
            "cursed-oil",
            "draconid-oil",
            "elementa-oil",
            "hybrid-oil",
            "insectoid-oil",
        ],
        [
            "necrophage-oil",
            "ogroid-oil",
            "relict-oil",
            "specter-oil",
            "vampire-oil",
        ],
    ],
    "alchemy-atlas.png": [
        [
            "black-blood",
            "blizzard",
            "dancing-star",
            "devil-s-puffball",
            "dimeritium-bomb",
            "golden-oriole",
        ],
        [
            "grapeshot",
            "moon-dust",
            "northern-wind",
            "reinald-s-philter",
            "samum",
            "white-honey",
        ],
    ],
}


def subject_mask(image: Image.Image) -> Image.Image:
    rgb = image.convert("RGB")
    key = Image.new("RGB", rgb.size, (0, 255, 0))
    difference = ImageChops.difference(rgb, key).convert("L")
    return difference.point(lambda value: 255 if value > 48 else 0)


def square_crop(cell: Image.Image, size: int) -> Image.Image:
    horizontal_gutter = round(cell.width * 0.055)
    vertical_gutter = round(cell.height * 0.025)
    cell = cell.crop(
        (
            horizontal_gutter,
            vertical_gutter,
            cell.width - horizontal_gutter,
            cell.height - vertical_gutter,
        )
    )
    mask = subject_mask(cell)
    bounds = mask.getbbox()
    if bounds is None:
        raise ValueError("No icon subject detected in atlas cell")

    left, top, right, bottom = bounds
    width = right - left
    height = bottom - top
    padding = max(12, round(max(width, height) * 0.08))
    left = max(0, left - padding)
    top = max(0, top - padding)
    right = min(cell.width, right + padding)
    bottom = min(cell.height, bottom + padding)
    subject = cell.crop((left, top, right, bottom))

    square_size = max(subject.width, subject.height)
    square = Image.new("RGB", (square_size, square_size), (0, 255, 0))
    square.paste(
        subject,
        ((square_size - subject.width) // 2, (square_size - subject.height) // 2),
    )
    return square.resize((size, size), Image.Resampling.LANCZOS)


def split_atlas(source: Path, rows: list[list[str]], output: Path, size: int) -> int:
    atlas = Image.open(source).convert("RGB")
    row_height = atlas.height / len(rows)
    written = 0

    for row_index, labels in enumerate(rows):
        column_width = atlas.width / len(labels)
        for column_index, label in enumerate(labels):
            box = (
                round(column_index * column_width),
                round(row_index * row_height),
                round((column_index + 1) * column_width),
                round((row_index + 1) * row_height),
            )
            icon = square_crop(atlas.crop(box), size)
            icon.save(output / f"{label}.png", optimize=True)
            written += 1

    return written


def main() -> None:
    parser = argparse.ArgumentParser(description="Split generated bestiary icon atlases.")
    parser.add_argument("--source-dir", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--size", type=int, default=512)
    args = parser.parse_args()

    args.output_dir.mkdir(parents=True, exist_ok=True)
    total = 0
    for filename, rows in ATLAS_ROWS.items():
        total += split_atlas(
            args.source_dir / filename,
            rows,
            args.output_dir,
            args.size,
        )
    print(f"Wrote {total} atlas crops to {args.output_dir}")


if __name__ == "__main__":
    main()
