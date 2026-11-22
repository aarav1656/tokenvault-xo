# DESIGN.md: TokenVault XO web demo

Source theme: Hallmark catalog theme **Grid** (editorial cluster, Swiss neo-grotesque). Genre: editorial. Macrostructure: Index plus Plate (a numbered index of ruled bands on an exposed 12 column hairline grid, one object per band). Signal ink: ultramarine, chosen because the job is technical and institutional. Nav archetype: N1a wordmark plus two links (section index lives in the hero). Footer archetype: Ft1 mast-headed colophon. Process band: F4 step sequence. Readback: F3 tabular spec sheet.

## Verbs (who opens this and what they do)

A BCH BLAZE judge opens one link. They read what the vault does, check that the transactions exist on chain, open one transaction in blaze.xo.cash, then change the calculator inputs and watch the template compute the schedule. They spend about a minute.

## Art direction

A ruled sheet where the vault is drawn as data. One ultramarine stepped line falls from the locked supply to zero along a block-height rail with halving ticks; every figure beneath it is read from the chain or computed by the template in the browser. Geometry from the marks kit does the talking: period square, stepped bars, register mark, border arrows. No photographs, no icons, no gradients.

## Tokens

```css
:root {
  --color-paper: oklch(99% 0.003 255);
  --color-paper-2: oklch(97.2% 0.004 255);
  --color-paper-3: oklch(94.5% 0.005 255);
  --color-ink: oklch(16% 0.010 255);
  --color-muted: oklch(46% 0.012 255);
  --color-rule: oklch(88% 0.006 255);
  --color-signal: oklch(45% 0.19 264);
  --color-focus: var(--color-signal);
  --font-display: "Archivo", sans-serif;   /* 800, lowercase, -0.045em */
  --font-body: "Archivo", sans-serif;      /* 400 / 500 / 600 */
  --font-data: ui-monospace, "SF Mono", Menlo, Consolas, monospace; /* hashes and commitments only, system, not loaded */
  --radius: 0;
  --space: 8px;
}
```

- Type scale: 12 caps label (600, +0.09em), 14 small, 16 body, 20 lead, 32 section head (800 lowercase -0.04em), display clamp(52px, 10.5vw, 136px) at 0.9 leading.
- Figures: tabular numerals everywhere; hashes in the data stack.
- Spacing: 8px scale (8 16 24 32 48 64 96 128). Desktop bands breathe at 96 to 128px.
- Radius 0, no shadows, no cards. Depth is hairlines, ink rules and one plate.
- Colour split: paper 70, ink 20, signal 10. Signal marks confirmed state, the stepped line, halving ticks and the single plate. Failure is the inverted ink block, never a second hue.
- Motion: hover row shift 8px, hover underline, one 0.8s step line draw and numeral count after the chain read lands; everything stops under prefers-reduced-motion.
- Contrast pairs computed: ink on paper 17:1, muted on paper 7.4:1, signal on paper 8.9:1, paper on signal 8.9:1.

## Plate

The release schedule band is the one flooded plate: ultramarine ground, paper text, rails continue at low opacity. Hosts the calculator output.

## Refusal list

Gradient hero, emoji, icon tiles, equal card grids, rounded corners, shadows, glassmorphism, centred hero, serif, italic headings, a second hue, a dark page, a second plate, sparklines as decoration, status pills, the big-metric template (one number, one label, three satellites).

## References studied

See design-research/REFS.md: blaze.xo.cash, bchblaze.cash, sablier.com, blockchair.com transaction page, docs.sablier.com (negative).
