# Vespera architecture

## Runtime boundary

The deployed application is fully static. Routes read validated
`data/**/*.json` files during the Next.js build; browsers never call a database,
CMS, or bestiary API.

## Data pipeline

1. A local PDF can be rendered and read by `scripts/parse_bestiary.py`.
2. Creature fields are normalized into one JSON document per slug.
3. Optional reviewed research can be applied by `scripts/enrich_bestiary.py`.
4. Zod validates every document through `lib/schema.ts`.
5. `lib/bestiary.ts` is the only application data-access module.

The source PDF and pipeline caches stay outside version control. Generated JSON
is committed so the website can build without the original document.

## Application layers

- `app/`: static App Router routes, metadata, and global visual system.
- `components/experience/`: opening sequence, ambience, motion, and scrolling.
- `components/bestiary/`: searchable catalogue and monster detail experience.
- `lib/bestiary.ts`: cached server-side data and asset lookup.
- `lib/schema.ts`: shared TypeScript/Zod contract.
- `data/<category>/<slug>.json`: normalized creature documents.

`generateStaticParams` enumerates every monster route at build time, and
`output: "export"` creates a portable static deployment in `out/`.

## Asset pipeline

`scripts/optimize_assets.py` creates three delivery tiers:

- full WebP portraits for monster pages;
- small WebP thumbnails for the 136-card catalogue;
- compact WebP fieldcraft and featured UI assets.

The optimizer validates all outputs before optional source pruning. Catalogue
cards never load the full detail portraits.

## Performance strategy

- Offscreen catalogue cards use `content-visibility`.
- The catalogue receives compact summaries instead of complete monster objects.
- Card filtering avoids Framer Motion layout measurement across all 136 entries.
- Detail portraits remain lazy by route and are served as WebP.
- Lenis pauses automatically while the document is hidden.
- Motion respects `prefers-reduced-motion`.
