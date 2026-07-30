"""Build browser and touch icons from the Vespera medallion."""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "public" / "images" / "bestiary-medallion.webp"
APP = ROOT / "app"


def fitted_medallion(size: int, padding: int) -> Image.Image:
    source = Image.open(SOURCE).convert("RGBA")
    alpha_box = source.getchannel("A").getbbox()
    if alpha_box:
        source = source.crop(alpha_box)

    limit = size - padding * 2
    source.thumbnail((limit, limit), Image.Resampling.LANCZOS)
    if size <= 64:
        source = source.filter(
            ImageFilter.UnsharpMask(radius=0.8, percent=125, threshold=2)
        )

    canvas = Image.new("RGBA", (size, size))
    canvas.alpha_composite(
        source,
        ((size - source.width) // 2, (size - source.height) // 2),
    )
    return canvas


def main() -> None:
    APP.mkdir(parents=True, exist_ok=True)

    icon = fitted_medallion(192, 5)
    icon.save(APP / "icon.png", optimize=True)

    apple = Image.new("RGBA", (180, 180), "#090b0cff")
    apple.alpha_composite(fitted_medallion(180, 8))
    apple.convert("RGB").save(APP / "apple-icon.png", optimize=True)

    favicon = fitted_medallion(64, 3)
    favicon.save(
        APP / "favicon.ico",
        format="ICO",
        sizes=[(16, 16), (32, 32), (48, 48), (64, 64)],
    )

    print("Created app/favicon.ico, app/icon.png, and app/apple-icon.png")


if __name__ == "__main__":
    main()
