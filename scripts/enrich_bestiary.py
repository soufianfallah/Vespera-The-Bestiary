from __future__ import annotations

import argparse
import html
import json
import re
import time
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any


API = "https://witcher.fandom.com/api.php"

CATEGORY_DEFAULTS: dict[str, dict[str, Any]] = {
    "beasts": {
        "swordType": "Steel",
        "oil": "Beast Oil",
        "bombs": ["Samum"],
        "signs": ["Igni", "Axii"],
        "habitat": ["Forests, fields, and the margins of settled land"],
        "loot": ["Hide", "Raw meat", "Animal fat"],
        "locations": ["Velen", "Skellige", "Toussaint"],
        "danger": "Moderate",
    },
    "cursed": {
        "swordType": "Silver",
        "oil": "Cursed Oil",
        "bombs": ["Moon Dust"],
        "signs": ["Igni", "Yrden"],
        "habitat": ["Cursed ruins, abandoned settlements, and secluded wilds"],
        "loot": ["Cursed remains", "Monster tissue", "Mutagen"],
        "locations": ["Velen", "Skellige", "Toussaint"],
        "danger": "High",
    },
    "draconids": {
        "swordType": "Silver",
        "oil": "Draconid Oil",
        "bombs": ["Grapeshot"],
        "signs": ["Aard", "Quen"],
        "habitat": ["Cliffs, mountain passes, ruins, and open nesting grounds"],
        "loot": ["Draconid hide", "Monster claw", "Venom extract"],
        "locations": ["Velen", "Skellige", "Toussaint"],
        "danger": "High",
    },
    "elementa": {
        "swordType": "Silver",
        "oil": "Elementa Oil",
        "bombs": ["Dimeritium Bomb"],
        "signs": ["Quen"],
        "habitat": ["Ancient ruins, caves, and sites disturbed by magic"],
        "loot": ["Elemental essence", "Infused dust", "Monster core"],
        "locations": ["Velen", "Skellige", "Kaer Morhen"],
        "danger": "High",
    },
    "hybrids": {
        "swordType": "Silver",
        "oil": "Hybrid Oil",
        "bombs": ["Grapeshot"],
        "signs": ["Aard", "Quen"],
        "habitat": ["Coasts, cliffs, mountains, and isolated ruins"],
        "loot": ["Monster feathers", "Monster egg", "Hybrid tissue"],
        "locations": ["Velen", "Skellige", "Toussaint"],
        "danger": "High",
    },
    "insectoids": {
        "swordType": "Silver",
        "oil": "Insectoid Oil",
        "bombs": ["Dancing Star"],
        "signs": ["Igni", "Aard"],
        "habitat": ["Caves, forests, marshes, and underground colonies"],
        "loot": ["Chitinous shell", "Insectoid mandible", "Venom extract"],
        "locations": ["Velen", "Skellige", "Toussaint"],
        "danger": "High",
    },
    "necrophages": {
        "swordType": "Silver",
        "oil": "Necrophage Oil",
        "bombs": ["Devil's Puffball"],
        "signs": ["Igni"],
        "habitat": ["Battlefields, graveyards, marshes, and corpse-strewn ruins"],
        "loot": ["Necrophage hide", "Monster blood", "Necrophage tissue"],
        "locations": ["White Orchard", "Velen", "Skellige"],
        "danger": "Moderate",
    },
    "ogroids": {
        "swordType": "Silver",
        "oil": "Ogroid Oil",
        "bombs": ["Northern Wind"],
        "signs": ["Quen", "Axii"],
        "habitat": ["Caves, mountain valleys, bridges, and remote roads"],
        "loot": ["Ogroid hide", "Monster liver", "Monster bone"],
        "locations": ["Velen", "Skellige", "Toussaint"],
        "danger": "High",
    },
    "relicts": {
        "swordType": "Silver",
        "oil": "Relict Oil",
        "bombs": ["Dimeritium Bomb"],
        "signs": ["Igni", "Quen"],
        "habitat": ["Primeval forests, forgotten ruins, and places of old power"],
        "loot": ["Relict tissue", "Ancient essence", "Relict mutagen"],
        "locations": ["Velen", "Skellige", "Toussaint"],
        "danger": "High",
    },
    "specters": {
        "swordType": "Silver",
        "oil": "Specter Oil",
        "bombs": ["Moon Dust"],
        "signs": ["Yrden"],
        "habitat": ["Haunted fields, graveyards, ruins, and sites of violent death"],
        "loot": ["Essence of wraith", "Specter dust", "Infused dust"],
        "locations": ["White Orchard", "Velen", "Skellige"],
        "danger": "High",
    },
    "vampires": {
        "swordType": "Silver",
        "oil": "Vampire Oil",
        "bombs": ["Moon Dust"],
        "signs": ["Yrden", "Igni"],
        "habitat": ["Caves, crypts, abandoned estates, and dense urban hunting grounds"],
        "loot": ["Vampire blood", "Vampire fang", "Vampire tissue"],
        "locations": ["Novigrad", "Velen", "Toussaint"],
        "danger": "Extreme",
    },
}

EXTREME_SLUGS = {
    "cloud-giant",
    "dettlaff-van-der-eretein",
    "djinn",
    "ice-giant",
    "morvudd",
    "the-beast-of-beauclair",
    "the-caretaker",
    "the-toad-prince",
    "the-unseen-elder",
}

REGION_WORDS = {
    "beauclair",
    "kaer morhen",
    "novigrad",
    "oxenfurt",
    "skellige",
    "toussaint",
    "velen",
    "vizima",
    "white orchard",
}

PAGE_ALIASES = {
    "Arachasae": "Arachas",
    "Arachasae Armored": "Armored arachas",
    "Beann'Shies": "Banshee",
    "Berserkers": "Werebear",
    "Dogs": "Dog",
    "Drowned Dead": "Drowned dead",
    "Endrega Drone": "Endrega",
    "Endrega Warrior": "Endrega",
    "Endrega Worker": "Endrega",
    "Griffin": "Griffin (creature)",
    "Hound Of The Wild Hunt": "Hound of the Wild Hunt",
    "Jenny O' the Woods": "Jenny o' the Woods",
    "Kikimore Warrior": "Kikimore",
    "Moruudd": "Morvudd",
    "Plague Maiden": "Plague maiden",
    "Royal Wyvern": "Royal wyvern",
    "Venomous Arachasae": "Venomous arachas",
    "Water Hag": "Water hag",
    "Wham-A-Wham": "Wham-a-Wham",
    "Wild Boar": "Wild boar",
    "Wight": "Wight (creature)",
    "Wolves": "Wolf (creature)",
}


def api_request(parameters: dict[str, str]) -> dict[str, Any]:
    query = urllib.parse.urlencode({**parameters, "format": "json", "origin": "*"})
    request = urllib.request.Request(
        f"{API}?{query}",
        headers={"User-Agent": "VesperaBestiary/1.0 personal-project"},
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.load(response)


def fetch_wikitext(name: str) -> tuple[str, str] | None:
    page_name = PAGE_ALIASES.get(name, name)
    try:
        parsed = api_request(
            {"action": "parse", "page": page_name, "prop": "wikitext"}
        )
    except Exception:
        search = api_request(
            {
                "action": "query",
                "list": "search",
                "srsearch": f'intitle:"{name}"',
                "srlimit": "5",
            }
        )
        candidates = search.get("query", {}).get("search", [])
        if not candidates:
            return None
        parsed = api_request(
            {
                "action": "parse",
                "page": candidates[0]["title"],
                "prop": "wikitext",
            }
        )

    payload = parsed.get("parse")
    if not payload:
        return None
    return payload["title"], payload["wikitext"]["*"]


def clean_wikitext(value: str) -> list[str]:
    value = re.sub(r"<ref\b[^>]*>.*?</ref>", "", value, flags=re.I | re.S)
    value = re.sub(r"<ref\b[^>]*/>", "", value, flags=re.I)
    value = re.sub(r"<br\s*/?>", "\n", value, flags=re.I)
    value = re.sub(r"\[\[[^|\]]+\|([^\]]+)\]\]", r"\1", value)
    value = re.sub(r"\[\[([^\]]+)\]\]", r"\1", value)
    value = re.sub(r"\{\{[^{}]*\}\}", "", value)
    value = re.sub(r"<[^>]+>", "", value)
    value = value.replace("'''", "").replace("''", "")
    value = html.unescape(value)

    items = []
    for raw in value.splitlines():
        item = re.sub(r"\s+", " ", raw).strip(" |}*#:")
        if item and item.lower() not in {"none", "n/a", "unknown"}:
            items.append(item)
    return list(dict.fromkeys(items))


def extract_last_field(wikitext: str, field: str) -> list[str]:
    matches = re.findall(
        rf"^\|{re.escape(field)}\s*=\s*(.*?)(?=^\||^\}}\}})",
        wikitext,
        flags=re.I | re.M | re.S,
    )
    return clean_wikitext(matches[-1]) if matches else []


def is_habitat_description(value: str) -> bool:
    lower = value.lower()
    return (
        len(value) > 72
        or lower.startswith(("near ", "wet ", "caves", "fields", "forests"))
        or any(word in lower for word in ("banks of", "haunt", "live in", "found in"))
    )


def research_records(records: list[dict[str, Any]], cache_path: Path) -> dict[str, Any]:
    cache: dict[str, Any] = {}
    if cache_path.exists():
        cache = json.loads(cache_path.read_text(encoding="utf-8"))

    for index, monster in enumerate(records, start=1):
        slug = monster["slug"]
        if cache.get(slug, {}).get("status") == "found":
            continue
        result = fetch_wikitext(monster["name"])
        if result is None:
            cache[slug] = {"status": "missing"}
        else:
            title, wikitext = result
            cache[slug] = {
                "status": "found",
                "pageTitle": title,
                "url": f"https://witcher.fandom.com/wiki/{urllib.parse.quote(title.replace(' ', '_'))}",
                "occurrence": extract_last_field(wikitext, "occurrence"),
                "loot": extract_last_field(wikitext, "loot"),
            }
        print(f"[{index:03}/{len(records)}] {monster['name']}: {cache[slug]['status']}")
        time.sleep(0.05)

    cache_path.parent.mkdir(parents=True, exist_ok=True)
    cache_path.write_text(
        json.dumps(cache, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    return cache


def source_for(existing: Any, researched: bool = False) -> str:
    if existing not in (None, "", []):
        return "journal"
    return "game-reference" if researched else "witcher-inference"


def enrich_record(monster: dict[str, Any], research: dict[str, Any]) -> dict[str, Any]:
    defaults = CATEGORY_DEFAULTS[monster["category"]]
    occurrence = research.get("occurrence", []) if research.get("status") == "found" else []
    researched_locations = [item for item in occurrence if not is_habitat_description(item)]
    researched_habitat = [item for item in occurrence if is_habitat_description(item)]
    researched_loot = research.get("loot", []) if research.get("status") == "found" else []

    sources = {
        "swordType": source_for(monster.get("swordType")),
        "oils": source_for(monster.get("oils")),
        "bombs": source_for(monster.get("bombs")),
        "signs": source_for(monster.get("signs")),
        "habitat": source_for(monster.get("habitat"), bool(researched_habitat)),
        "loot": source_for(monster.get("loot"), bool(researched_loot)),
        "locations": source_for(monster.get("locations"), bool(researched_locations)),
        "dangerLevel": source_for(monster.get("dangerLevel")),
    }

    monster["swordType"] = monster.get("swordType") or defaults["swordType"]
    monster["oils"] = monster.get("oils") or [defaults["oil"]]
    monster["bombs"] = monster.get("bombs") or defaults["bombs"]
    monster["signs"] = monster.get("signs") or defaults["signs"]
    monster["habitat"] = (
        monster.get("habitat") or researched_habitat or defaults["habitat"]
    )
    monster["loot"] = monster.get("loot") or researched_loot or defaults["loot"]
    monster["locations"] = (
        monster.get("locations") or researched_locations or defaults["locations"]
    )
    monster["dangerLevel"] = monster.get("dangerLevel") or (
        "Extreme" if monster["slug"] in EXTREME_SLUGS else defaults["danger"]
    )

    encounter_location = ", ".join(monster["locations"][:3])
    reference_url = research.get("url") if research.get("status") == "found" else None
    basis = (
        "Game reference cross-check"
        if reference_url
        else "Witcher field inference from creature class"
    )
    monster["factSources"] = sources
    monster["encounter"] = {
        "medium": "game",
        "title": "The Witcher 3: Wild Hunt and expansions",
        "location": encounter_location,
        "note": f"{basis}; the trail is associated with {encounter_location}.",
        "referenceUrl": reference_url,
    }
    return monster


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Cross-check and enrich generated bestiary JSON records."
    )
    parser.add_argument("--data-root", type=Path, default=Path("data"))
    parser.add_argument(
        "--cache",
        type=Path,
        default=Path("data/_research/witcher-wiki.json"),
    )
    parser.add_argument("--fetch", action="store_true")
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()

    files = sorted(
        file
        for directory in args.data_root.iterdir()
        if directory.is_dir() and not directory.name.startswith("_")
        for file in directory.glob("*.json")
    )
    records = [
        json.loads(file.read_text(encoding="utf-8"))
        for file in files
    ]

    if args.fetch:
        cache = research_records(records, args.cache)
    elif args.cache.exists():
        cache = json.loads(args.cache.read_text(encoding="utf-8"))
    else:
        raise SystemExit("Research cache missing. Run with --fetch first.")

    if args.apply:
        for file, monster in zip(files, records, strict=True):
            enriched = enrich_record(monster, cache.get(monster["slug"], {}))
            file.write_text(
                json.dumps(enriched, ensure_ascii=False, indent=2) + "\n",
                encoding="utf-8",
            )

    found = sum(item.get("status") == "found" for item in cache.values())
    print(f"Research coverage: {found}/{len(records)} records")
    if args.apply:
        print(f"Enriched {len(records)} JSON files")


if __name__ == "__main__":
    main()
