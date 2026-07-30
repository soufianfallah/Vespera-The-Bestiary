"""OCR, normalize, and validate the image-only bestiary PDF.

The parser is intentionally conservative: it writes empty values and validation
warnings when the source does not state a field clearly. It never fabricates
monster facts.
"""

from __future__ import annotations

import argparse
import json
import re
import statistics
import sys
import unicodedata
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from difflib import SequenceMatcher
from pathlib import Path
from typing import Any, Iterable

ROOT = Path(__file__).resolve().parents[1]
VENDOR = ROOT / ".parser-vendor"
if VENDOR.exists():
    sys.path.insert(0, str(VENDOR))

fitz: Any = None
cv2: Any = None
np: Any = None
Image: Any = None
RapidOCR: Any = None


def require_parser_dependencies() -> None:
    """Load the heavy OCR stack only for commands that actually need it."""

    global Image, RapidOCR, cv2, fitz, np
    try:
        import cv2 as cv2_module
        import fitz as fitz_module
        import numpy as numpy_module
        from PIL import Image as pillow_image
        from rapidocr import RapidOCR as rapid_ocr
    except ImportError as exc:
        raise SystemExit(
            "Parser dependencies are missing. Run:\n"
            "  python -m pip install --target .parser-vendor -r requirements-parser.txt"
        ) from exc

    fitz = fitz_module
    cv2 = cv2_module
    np = numpy_module
    Image = pillow_image
    RapidOCR = rapid_ocr

PDF_PATH = ROOT / "the-witcher-3-bestiary.pdf"
CACHE_DIR = ROOT / ".cache" / "ocr"
DATA_DIR = ROOT / "data"
REPORT_DIR = DATA_DIR / "_reports"
PORTRAIT_DIR = ROOT / "public" / "monsters"
ICON_DIR = ROOT / "public" / "icons" / "weaknesses"

CATEGORIES = [
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
]

# These are transition markers read from the PDF contents pages. Only category
# boundaries live in code; all record text and titles come from OCR.
CATEGORY_STARTS = [
    ("beasts", "bear"),
    ("cursed", "archespore"),
    ("draconids", "basilisk"),
    ("elementa", "djinn"),
    ("hybrids", "erynia"),
    ("insectoids", "arachasae"),
    ("necrophages", "abaya"),
    ("ogroids", "cloud giant"),
    ("relicts", "chort"),
    ("specters", "barghest"),
    ("vampires", "alpha garkain"),
]

SIGNS = ["Aard", "Axii", "Igni", "Quen", "Yrden"]
BOMBS = [
    "Dancing Star",
    "Devil's Puffball",
    "Dimeritium Bomb",
    "Grapeshot",
    "Moon Dust",
    "Northern Wind",
    "Samum",
]
OILS = [
    "Beast Oil",
    "Cursed Oil",
    "Draconid Oil",
    "Elementa Oil",
    "Hybrid Oil",
    "Insectoid Oil",
    "Necrophage Oil",
    "Ogroid Oil",
    "Relict Oil",
    "Specter Oil",
    "Vampire Oil",
]

VISUAL_REFERENCES = [
    # page, x, y, kind, label — coordinates are in the parser's 2× render.
    (5, 100, 270, "sign", "Aard"),
    (5, 100, 424, "sign", "Axii"),
    (5, 100, 575, "sign", "Igni"),
    (5, 100, 735, "sign", "Quen"),
    (5, 100, 878, "sign", "Yrden"),
    (5, 480, 268, "bomb", "Dancing Star"),
    (5, 480, 423, "bomb", "Devil's Puffball"),
    (5, 480, 576, "bomb", "Dimeritium Bomb"),
    (5, 480, 746, "bomb", "Grapeshot"),
    (5, 480, 898, "bomb", "Moon Dust"),
    (5, 870, 272, "bomb", "Northern Wind"),
    (5, 870, 412, "bomb", "Samum"),
    (5, 870, 565, "potion", "Blizzard"),
    (5, 870, 747, "potion", "Black Blood"),
    (5, 870, 900, "potion", "Golden Oriole"),
    (5, 870, 1047, "potion", "White Honey"),
    (6, 100, 262, "oil", "Beast Oil"),
    (6, 475, 262, "oil", "Hybrid Oil"),
    (6, 860, 265, "oil", "Relict Oil"),
    (6, 100, 446, "oil", "Cursed Oil"),
    (6, 475, 450, "oil", "Insectoid Oil"),
    (6, 860, 462, "oil", "Specter Oil"),
    (6, 100, 634, "oil", "Draconid Oil"),
    (6, 475, 631, "oil", "Necrophage Oil"),
    (6, 860, 639, "oil", "Vampire Oil"),
    (6, 100, 825, "oil", "Elementa Oil"),
    (6, 475, 828, "oil", "Ogroid Oil"),
]

OCR_FIXES = {
    "WOLUES": "WOLVES",
    "SILUER": "SILVER",
    "WYUERN": "WYVERN",
    "UAMPIRE": "VAMPIRE",
    "UENOMOUS": "VENOMOUS",
    "CORUO": "CORVO",
    "BRUZA": "BRUXA",
    "SCURUER": "SCURVER",
    "MOURNTART": "MOURNTART",
    "WOLDES": "WOLVES",
    "SLYZARI": "SLYZARD",
    "SYLUAN": "SYLVAN",
    "CLOPS": "CYCLOPS",
    "GRAUEHAG": "GRAVE HAG",
}

# Page-title corrections are an OCR review layer, not supplemental monster data.
# Keys are punctuation-free OCR strings; values are the title visibly printed on
# the corresponding source page.
TITLE_CORRECTIONS = {
    "BIGBADWOLF": "Big Bad Wolf",
    "THREELITTLEPIGS": "Three Little Pigs",
    "WOLVES": "Wolves",
    "THETOADPRINCE": "The Toad Prince",
    "SILVERBASILISK": "Silver Basilisk",
    "THEDRAGONOFFYRESDAL": "The Dragon of Fyresdal",
    "MOREAUSGOLEM": "Moreau's Golem",
    "THEAPIARIANPHANTOM": "The Apiarian Phantom",
    "SUCCUBI": "Succubus",
    "ARACHASAEARMORED": "Arachasae Armored",
    "ENDREGAWARRIOR": "Endrega Warrior",
    "GIANTCENTIPEDE": "Giant Centipede",
    "KIKIMOREWORKER": "Kikimore Worker",
    "VENOMOUSARACHASAE": "Venomous Arachasae",
    "GRAVEHAG": "Grave Hag",
    "WATERHAG": "Water Hag",
    "ICEGIANT": "Ice Giant",
    "ICETROLL": "Ice Troll",
    "ROCKTROLL": "Rock Troll",
    "LADIESOFTHEWOOD": "Ladies of the Wood",
    "SHAELMAARFROMTHEEMPEROROFNILFGAARD": "Shaelmaar from the Emperor of Nilfgaard",
    "THECARETAKER": "The Caretaker",
    "THEMONSTEROFTUFO": "The Monster of Tufo",
    "DAPHNESWRAITH": "Daphne's Wraith",
    "THEWELL": "Devil by the Well",
    "JEHDS": "Jenny O' the Woods",
    "PLAGUEMAIDEN": "Plague Maiden",
    "THEWHITELADY": "The White Lady",
    "THEWRAITHFROMTHEPAINTING": "The Wraith from the Painting",
    "THEBEASTOFBEAUCLAIR": "The Beast of Beauclair",
    "THEBRUXAOFCOUVOBIANCO": "The Bruxa of Corvo Bianco",
    "THEBRUXAOFCORVOBIANCO": "The Bruxa of Corvo Bianco",
}


@dataclass
class OcrLine:
    text: str
    confidence: float
    box: list[list[float]]
    x: float
    y: float
    width: float
    height: float


def clean_text(value: str) -> str:
    value = unicodedata.normalize("NFKC", value)
    value = value.replace("â€”", "—").replace("â€“", "—")
    value = value.replace("â€™", "’").replace("â€œ", "“").replace("â€", "”")
    value = value.replace("–", "—")
    value = re.sub(r"\s+([,.;:!?])", r"\1", value)
    value = re.sub(r"\s+", " ", value).strip(" \t\r\n·")
    return value


def normalized_key(value: str) -> str:
    value = clean_text(value).upper()
    for wrong, right in OCR_FIXES.items():
        value = value.replace(wrong, right)
    return re.sub(r"[^A-Z0-9]+", "", value)


def slugify(value: str) -> str:
    value = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode()
    value = re.sub(r"[^a-zA-Z0-9]+", "-", value.lower()).strip("-")
    return value or "unnamed"


def as_line(text: str, confidence: float, box: Any) -> OcrLine:
    points = [[float(p[0]), float(p[1])] for p in box]
    xs = [p[0] for p in points]
    ys = [p[1] for p in points]
    return OcrLine(
        text=clean_text(text),
        confidence=round(float(confidence), 4),
        box=points,
        x=round(min(xs), 2),
        y=round(sum(ys) / len(ys), 2),
        width=round(max(xs) - min(xs), 2),
        height=round(max(ys) - min(ys), 2),
    )


def page_cache_path(page_number: int) -> Path:
    return CACHE_DIR / f"page-{page_number:03d}.json"


def read_cached_page(page_number: int) -> dict[str, Any] | None:
    path = page_cache_path(page_number)
    if not path.exists():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def ocr_document(force: bool = False, start: int = 1, end: int | None = None) -> None:
    if not PDF_PATH.exists():
        raise SystemExit(f"Missing source PDF: {PDF_PATH}")
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    document = fitz.open(PDF_PATH)
    last = min(end or len(document), len(document))
    engine = RapidOCR()

    for page_number in range(max(1, start), last + 1):
        cache_path = page_cache_path(page_number)
        if cache_path.exists() and not force:
            print(f"[{page_number:03d}/{last:03d}] cached")
            continue

        page = document[page_number - 1]
        pixmap = page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
        image = np.frombuffer(pixmap.samples, dtype=np.uint8).reshape(
            pixmap.height, pixmap.width, pixmap.n
        )
        result = engine(image)
        lines: list[OcrLine] = []
        if result:
            lines = [
                as_line(text, score, box)
                for text, score, box in zip(result.txts, result.scores, result.boxes)
            ]

        payload = {
            "page": page_number,
            "width": pixmap.width,
            "height": pixmap.height,
            "embeddedImageCount": len(page.get_images(full=True)),
            "lines": [asdict(line) for line in sorted(lines, key=lambda item: item.y)],
        }
        cache_path.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
        print(f"[{page_number:03d}/{last:03d}] {len(lines):02d} OCR lines")


def title_candidate(page: dict[str, Any]) -> dict[str, Any] | None:
    height = page["height"]
    lines = page["lines"]
    candidates = []
    for line in lines:
        text = clean_text(line["text"])
        y_ratio = line["y"] / height
        uppercase_ratio = sum(c.isupper() for c in text) / max(
            1, sum(c.isalpha() for c in text)
        )
        if (
            0.38 <= y_ratio <= 0.64
            and line["height"] >= height * 0.035
            and 2 <= len(text) <= 60
            and uppercase_ratio >= 0.7
            and not re.fullmatch(r"[A-Z]", text)
        ):
            candidates.append(line)
    if not candidates:
        return None
    return max(candidates, key=lambda item: item["height"] * item["confidence"])


def title_text(page: dict[str, Any], candidate: dict[str, Any]) -> str:
    """Join stacked decorative title lines such as the final Bruxa entry."""
    height = page["height"]
    nearby = []
    for line in page["lines"]:
        text = clean_text(line["text"])
        uppercase_ratio = sum(c.isupper() for c in text) / max(
            1, sum(c.isalpha() for c in text)
        )
        if (
            line["height"] >= height * 0.035
            and abs(line["y"] - candidate["y"]) <= height * 0.075
            and uppercase_ratio >= 0.7
            and 2 <= len(text) <= 60
        ):
            nearby.append(line)
    return clean_text(" ".join(line["text"] for line in sorted(nearby, key=lambda item: item["y"])))


def body_lines(page: dict[str, Any], title: dict[str, Any]) -> list[dict[str, Any]]:
    lower = title["y"] + title["height"] * 0.7
    upper = page["height"] * 0.935
    result = [
        line
        for line in page["lines"]
        if lower < line["y"] < upper
        and line["height"] < page["height"] * 0.045
        and len(line["text"]) > 3
    ]
    # Real entry pages have a substantial prose panel. This rejects art pages.
    if len([line for line in result if len(line["text"]) >= 45]) < 2:
        return []
    return sorted(result, key=lambda item: (item["y"], item["x"]))


def group_paragraphs(lines: list[dict[str, Any]]) -> list[str]:
    if not lines:
        return []
    heights = [line["height"] for line in lines]
    normal_height = statistics.median(heights)
    paragraphs: list[list[str]] = [[]]
    previous_y: float | None = None
    for line in lines:
        if previous_y is not None and line["y"] - previous_y > normal_height * 1.55:
            paragraphs.append([])
        paragraphs[-1].append(line["text"])
        previous_y = line["y"]
    return [clean_text(" ".join(parts)) for parts in paragraphs if parts]


def contains_phrase(text: str, phrase: str) -> bool:
    flexible = re.escape(phrase).replace(r"\ ", r"\s+")
    return bool(re.search(rf"\b{flexible}\b", text, flags=re.IGNORECASE))


def infer_fields(text: str, category: str) -> dict[str, Any]:
    signs = [item for item in SIGNS if contains_phrase(text, item)]
    bombs = [item for item in BOMBS if contains_phrase(text, item)]
    oils = [item for item in OILS if contains_phrase(text, item)]

    sword: str | None = None
    if re.search(r"\bsilver (?:sword|blade)\b|\bsilver works\b", text, re.I):
        sword = "Silver"
    elif re.search(r"\bsteel (?:sword|blade)\b", text, re.I):
        sword = "Steel"

    weaknesses: list[str] = []
    for term in signs + bombs + oils:
        if term not in weaknesses:
            weaknesses.append(term)
    for pattern, label in [
        (r"\bfire\b", "Fire"),
        (r"\bpoison(?:ed|ing)?\b", "Poison"),
        (r"\bbleed(?:ing)?\b", "Bleeding"),
        (r"\bshock wave\b", "Shock waves"),
    ]:
        if re.search(pattern, text, re.I) and label not in weaknesses:
            weaknesses.append(label)

    return {
        "weaknesses": weaknesses,
        "oils": oils,
        "bombs": bombs,
        "signs": signs,
        "swordType": sword,
        "habitat": [],
        "loot": [],
        "locations": [],
        "dangerLevel": None,
    }


class VisualWeaknessClassifier:
    """Match the fixed weakness slots against glossary glyphs.

    SIFT handles the scale/background differences between glossary and entry
    pages. Conservative score and margin thresholds prevent uncertain glyphs
    from becoming facts.
    """

    def __init__(self, document: fitz.Document):
        self.document = document
        self.sift = cv2.SIFT_create(nfeatures=300)
        self.matcher = cv2.BFMatcher()
        self.references: dict[str, dict[str, Any]] = {}
        rendered = {page: self._render(page) for page in {item[0] for item in VISUAL_REFERENCES}}
        for page, x, y, kind, label in VISUAL_REFERENCES:
            crop = self._crop(rendered[page], x, y, 65)
            _, descriptors = self.sift.detectAndCompute(
                cv2.cvtColor(crop, cv2.COLOR_RGB2GRAY), None
            )
            self.references[label] = {
                "kind": kind,
                "descriptors": descriptors,
                "histogram": self._histogram(crop),
            }

    def _render(self, page_number: int) -> np.ndarray:
        page = self.document[page_number - 1]
        pixmap = page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
        return np.frombuffer(pixmap.samples, dtype=np.uint8).reshape(
            pixmap.height, pixmap.width, pixmap.n
        )

    @staticmethod
    def _crop(image: np.ndarray, x: int, y: int, radius: int) -> np.ndarray:
        return image[
            max(0, y - radius) : min(image.shape[0], y + radius),
            max(0, x - radius) : min(image.shape[1], x + radius),
        ]

    @staticmethod
    def _histogram(image: np.ndarray) -> np.ndarray:
        hsv = cv2.cvtColor(image, cv2.COLOR_RGB2HSV)
        mask = (
            (hsv[:, :, 1] > 40) & (hsv[:, :, 2] > 40) & (hsv[:, :, 2] < 245)
        ).astype("uint8")
        histogram = cv2.calcHist([hsv], [0], mask, [36], [0, 180])
        return cv2.normalize(histogram, histogram).flatten()

    @staticmethod
    def _sign_from_hue(crop: np.ndarray) -> str | None:
        # The outer crop includes scenery beyond the square slot; hue sampling
        # uses the central glyph plate so sky/foliage cannot change the Sign.
        inset_y = max(0, crop.shape[0] // 2 - 40)
        inset_x = max(0, crop.shape[1] // 2 - 40)
        center = crop[inset_y : inset_y + 80, inset_x : inset_x + 80]
        hsv = cv2.cvtColor(center, cv2.COLOR_RGB2HSV)
        saturated = hsv[:, :, 1] > 90
        if saturated.sum() < center.shape[0] * center.shape[1] * 0.08:
            return None
        hue = float(np.median(hsv[:, :, 0][saturated]))
        if hue < 12 or hue > 170:
            return "Igni"
        if 18 <= hue < 40:
            return "Quen"
        if 40 <= hue < 82:
            return "Axii"
        if 82 <= hue < 125:
            return "Aard"
        if 125 <= hue <= 170:
            return "Yrden"
        return None

    def _scores(self, crop: np.ndarray) -> list[tuple[int, str]]:
        _, descriptors = self.sift.detectAndCompute(
            cv2.cvtColor(crop, cv2.COLOR_RGB2GRAY), None
        )
        if descriptors is None:
            return []
        scores: list[tuple[int, str]] = []
        for label, reference in self.references.items():
            ref_descriptors = reference["descriptors"]
            if ref_descriptors is None:
                continue
            pairs = self.matcher.knnMatch(ref_descriptors, descriptors, k=2)
            good = [first for first, second in pairs if first.distance < 0.7 * second.distance]
            scores.append((len(good), label))
        return sorted(scores, reverse=True)

    def classify(self, page_number: int) -> dict[str, list[str]]:
        image = self._render(page_number)
        detected: dict[str, list[str]] = {
            "weaknesses": [],
            "oils": [],
            "bombs": [],
            "signs": [],
        }
        for x in (132, 1055):
            for y in (340, 540, 740):
                crop = self._crop(image, x, y, 75)
                scores = self._scores(crop)
                if not scores:
                    continue

                sign_scores = [
                    score
                    for score in scores
                    if self.references[score[1]]["kind"] == "sign"
                ]
                if sign_scores and sign_scores[0][0] >= 8:
                    sign = self._sign_from_hue(crop)
                    if sign and sign not in detected["signs"]:
                        detected["signs"].append(sign)
                        detected["weaknesses"].append(sign)
                        continue

                non_sign = [
                    score
                    for score in scores
                    if self.references[score[1]]["kind"] != "sign"
                ]
                if not non_sign or non_sign[0][0] < 12:
                    continue
                best_score, best_label = non_sign[0]
                second_score = non_sign[1][0] if len(non_sign) > 1 else 0

                # Moon Dust and Dimeritium share a very similar vessel. Hue
                # histograms resolve the cases where geometry alone is tied.
                if best_score - second_score < max(3, best_score * 0.12):
                    crop_histogram = self._histogram(crop)
                    tied_labels = {label for _, label in non_sign[:2]}
                    hist_scores = sorted(
                        (
                            cv2.compareHist(
                                crop_histogram,
                                reference["histogram"],
                                cv2.HISTCMP_CORREL,
                            ),
                            label,
                        )
                        for label, reference in self.references.items()
                        if label in tied_labels
                    )
                    histogram_score, histogram_label = hist_scores[-1]
                    if histogram_score < 0.45:
                        continue
                    best_label = histogram_label

                kind = self.references[best_label]["kind"]
                if best_label not in detected["weaknesses"]:
                    detected["weaknesses"].append(best_label)
                target = {"oil": "oils", "bomb": "bombs"}.get(kind)
                if target and best_label not in detected[target]:
                    detected[target].append(best_label)
        return detected


def category_for_title(title: str, current_index: int) -> tuple[str, int]:
    title_key = normalized_key(title)
    best_index = current_index
    for index in range(current_index, len(CATEGORY_STARTS)):
        marker = normalized_key(CATEGORY_STARTS[index][1])
        similarity = SequenceMatcher(None, title_key, marker).ratio()
        if similarity >= 0.72:
            best_index = index
            break
    return CATEGORY_STARTS[best_index][0], best_index


def extract_records() -> list[dict[str, Any]]:
    cached = sorted(CACHE_DIR.glob("page-*.json"))
    if not cached:
        raise SystemExit("No OCR cache. Run `npm run data:extract` first.")

    records: list[dict[str, Any]] = []
    category_index = 0
    extracted_at = datetime.now(timezone.utc).isoformat()
    document = fitz.open(PDF_PATH)
    visual_classifier = VisualWeaknessClassifier(document)

    for cache_path in cached:
        page = json.loads(cache_path.read_text(encoding="utf-8"))
        title_line = title_candidate(page)
        if not title_line:
            continue
        prose = body_lines(page, title_line)
        if not prose:
            continue
        paragraphs = group_paragraphs(prose)
        if len(paragraphs) < 2:
            continue

        raw_title = title_text(page, title_line)
        fixed_title = raw_title.upper()
        for wrong, right in OCR_FIXES.items():
            fixed_title = fixed_title.replace(wrong, right)
        correction_key = normalized_key(fixed_title)
        name = TITLE_CORRECTIONS.get(correction_key, fixed_title.title())

        category, category_index = category_for_title(name, category_index)
        epigraph = paragraphs[0]
        description = paragraphs[1] if len(paragraphs) > 1 else ""
        lore = "\n\n".join(paragraphs[2:])
        all_text = "\n\n".join(paragraphs)
        inferred = infer_fields(all_text, category)
        visual = visual_classifier.classify(page["page"])
        named_items = {*SIGNS, *BOMBS, *OILS}
        general_weaknesses = [
            value for value in inferred["weaknesses"] if value not in named_items
        ]
        inferred["weaknesses"] = list(
            dict.fromkeys([*general_weaknesses, *visual["weaknesses"]])
        )
        # The visual slots are the PDF's explicit weakness declaration. Prose
        # often names ineffective or contrasted preparations, so it is only a
        # fallback when no visual glyph of that kind was detected.
        for field in ("oils", "bombs", "signs"):
            if visual[field]:
                inferred[field] = visual[field]
        confidence_values = [line["confidence"] for line in prose]
        portrait = f"/monsters/{slugify(name)}.webp"
        record = {
            "schemaVersion": 1,
            "slug": slugify(name),
            "name": name,
            "category": category,
            "description": description,
            "story": epigraph,
            "lore": lore,
            **inferred,
            "portrait": portrait,
            "gallery": [portrait],
            "source": {
                "file": PDF_PATH.name,
                "page": page["page"],
                "embeddedImageCount": page["embeddedImageCount"],
                "ocrConfidence": round(statistics.mean(confidence_values), 4),
                "extractedAt": extracted_at,
            },
        }
        records.append(record)

    return records


def write_records(records: Iterable[dict[str, Any]]) -> None:
    records = list(records)
    for category in CATEGORIES:
        category_dir = DATA_DIR / category
        category_dir.mkdir(parents=True, exist_ok=True)
        for stale_file in category_dir.glob("*.json"):
            stale_file.unlink()
    REPORT_DIR.mkdir(parents=True, exist_ok=True)

    for record in records:
        output = DATA_DIR / record["category"] / f"{record['slug']}.json"
        output.write_text(
            json.dumps(record, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
        )

    manifest = {
        "schemaVersion": 1,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "count": len(records),
        "categories": {
            category: sum(record["category"] == category for record in records)
            for category in CATEGORIES
        },
        "monsters": [
            {
                "name": record["name"],
                "slug": record["slug"],
                "category": record["category"],
                "page": record["source"]["page"],
            }
            for record in records
        ],
    }
    (DATA_DIR / "manifest.json").write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    print(f"Wrote {len(records)} monster records.")


def extract_visual_assets() -> None:
    """Export monster artwork and glossary glyphs from the supplied PDF.

    Portrait crops exclude the title/prose panel and fixed side weakness slots.
    They are source-derived assets intended for the user's personal project.
    """
    if not (DATA_DIR / "manifest.json").exists():
        raise SystemExit("No manifest. Run `npm run data:extract` first.")
    document = fitz.open(PDF_PATH)
    PORTRAIT_DIR.mkdir(parents=True, exist_ok=True)
    ICON_DIR.mkdir(parents=True, exist_ok=True)
    manifest = json.loads((DATA_DIR / "manifest.json").read_text(encoding="utf-8"))

    for item in manifest["monsters"]:
        page_number = int(item["page"])
        cached = read_cached_page(page_number)
        if not cached:
            continue
        title = title_candidate(cached)
        if not title:
            continue
        page = document[page_number - 1]
        pixmap = page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
        image = Image.fromarray(
            np.frombuffer(pixmap.samples, dtype=np.uint8).reshape(
                pixmap.height, pixmap.width, pixmap.n
            )
        )

        # Remove the fixed left/right icon rails and stop above the title.
        left = int(pixmap.width * 0.19)
        right = int(pixmap.width * 0.81)
        top = int(pixmap.height * 0.045)
        bottom = int(title["y"] - title["height"] * 0.7 - 50)
        if bottom - top < 420:
            bottom = int(title["y"] - 36)
        portrait = image.crop((left, top, right, bottom))
        if portrait.width > 900:
            height = round(portrait.height * 900 / portrait.width)
            portrait = portrait.resize((900, height), Image.Resampling.LANCZOS)
        portrait.save(
            PORTRAIT_DIR / f"{item['slug']}.webp",
            "WEBP",
            quality=86,
            method=6,
        )

    rendered_pages: dict[int, Image.Image] = {}
    for page_number, x, y, _, label in VISUAL_REFERENCES:
        if page_number not in rendered_pages:
            page = document[page_number - 1]
            pixmap = page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
            rendered_pages[page_number] = Image.fromarray(
                np.frombuffer(pixmap.samples, dtype=np.uint8).reshape(
                    pixmap.height, pixmap.width, pixmap.n
                )
            )
        radius = 54
        # The first glossary column sits beside an ornamental rule; its glyphs
        # are visually centered slightly to the right of the OCR coordinate.
        asset_x = x + 18 if x == 100 else x
        icon = rendered_pages[page_number].crop(
            (asset_x - radius, y - radius, asset_x + radius, y + radius)
        )
        icon = icon.resize((128, 128), Image.Resampling.LANCZOS)
        icon.save(
            ICON_DIR / f"{slugify(label)}.webp",
            "WEBP",
            quality=90,
            method=6,
        )

    print(
        f"Exported {len(manifest['monsters'])} portraits and "
        f"{len(VISUAL_REFERENCES)} glossary icons."
    )


REQUIRED_FIELDS = [
    "schemaVersion",
    "slug",
    "name",
    "category",
    "description",
    "story",
    "lore",
    "weaknesses",
    "oils",
    "bombs",
    "signs",
    "swordType",
    "habitat",
    "loot",
    "locations",
    "dangerLevel",
    "portrait",
    "gallery",
    "source",
]


def validate_records() -> dict[str, Any]:
    files = sorted(
        path
        for category in CATEGORIES
        for path in (DATA_DIR / category).glob("*.json")
    )
    errors: list[dict[str, Any]] = []
    missing: list[dict[str, Any]] = []
    seen_slugs: dict[str, str] = {}
    seen_names: dict[str, str] = {}

    for path in files:
        record = json.loads(path.read_text(encoding="utf-8"))
        absent = [field for field in REQUIRED_FIELDS if field not in record]
        if absent:
            errors.append({"file": str(path.relative_to(ROOT)), "missingFields": absent})
            continue
        if record["category"] not in CATEGORIES:
            errors.append({"file": str(path.relative_to(ROOT)), "category": record["category"]})
        for key, seen in [("slug", seen_slugs), ("name", seen_names)]:
            normalized = str(record[key]).casefold()
            if normalized in seen:
                errors.append(
                    {
                        "file": str(path.relative_to(ROOT)),
                        "duplicate": key,
                        "matches": seen[normalized],
                    }
                )
            else:
                seen[normalized] = str(path.relative_to(ROOT))

        empty_fields = [
            field
            for field in [
                "lore",
                "weaknesses",
                "oils",
                "bombs",
                "signs",
                "swordType",
                "habitat",
                "loot",
                "locations",
                "dangerLevel",
                "gallery",
            ]
            if record[field] in (None, "", [])
        ]
        if empty_fields:
            missing.append(
                {
                    "monster": record["name"],
                    "page": record["source"]["page"],
                    "fields": empty_fields,
                }
            )

    report = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "valid": not errors,
        "recordCount": len(files),
        "errors": errors,
        "missingInformation": missing,
        "notes": [
            "Empty fields mean the PDF prose/OCR did not state the value explicitly.",
            "Full pages are not exported; central portrait and glossary-icon crops are source-derived.",
            "Weakness glyph classification is not treated as fact until confidently matched.",
        ],
    }
    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    path = REPORT_DIR / "validation.json"
    path.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Validated {len(files)} records: {'PASS' if report['valid'] else 'FAIL'}")
    print(f"Report: {path.relative_to(ROOT)}")
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "command", choices=["ocr", "extract", "assets", "validate", "all"]
    )
    parser.add_argument("--force", action="store_true", help="replace cached OCR pages")
    parser.add_argument("--start", type=int, default=1)
    parser.add_argument("--end", type=int)
    args = parser.parse_args()

    if args.command in {"ocr", "extract", "assets", "all"}:
        require_parser_dependencies()
    if args.command in {"ocr", "extract", "all"}:
        ocr_document(force=args.force, start=args.start, end=args.end)
    if args.command in {"extract", "all"}:
        write_records(extract_records())
    if args.command in {"assets", "all"}:
        extract_visual_assets()
    if args.command in {"validate", "all"}:
        report = validate_records()
        if not report["valid"]:
            raise SystemExit(1)


if __name__ == "__main__":
    main()
