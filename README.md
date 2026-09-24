# Kodexa — website

A scroll-driven WebGL marketing site for Kodexa, built with Next.js 16, React 19,
Tailwind CSS v4 and three.js.

## Sections

1. **Intro** — wireframe network with floating figures.
2. **Hero** — a dome of rounded snow blocks with a glowing interior and arched entrance. Hovering pushes nearby blocks outward and tags them with numbered crosshairs.
3. **Manifesto** — the dome breaks apart while the mission statement resolves line by line.
4. **Ventures** — the camera flies past three iridescent rock blocks, each tagged with a HUD card.
5. **Labs** — a particle sculpture on a pedestal that morphs between experiments (arrow buttons / ← → keys).
6. **Contact** — wordmark, email and social links.

All geometry is generated procedurally in code; there are no external 3D or image assets.

## Editing content

All copy (brand name, taglines, manifesto, ventures, labs, footer links) lives in
`src/content/site.ts`. Scroll timing for each section is in `src/lib/timeline.ts`.

## Commands

```bash
npm install
npm run dev        # http://localhost:3000
npm run build
npm run lint
npm run typecheck
npm run check      # lint + typecheck + build
```

## /tea: Kinari tea demo

A second, separate page at `/tea`: a scroll-driven glass teapot. Leaves fall in
from a foil pouch, the water swirls and turns gold, and the pot pours into a
cup. Copy is in `src/content/tea.ts`; the WhatsApp number there is a placeholder.

`media/kinari-reel.mp4` is a 1080x1920 video of the page for Facebook or
Instagram. To re-record it after changes:

```bash
npm run build && npx next start -p 3100
node scripts/record-tea-reel.mjs   # needs Playwright and ffmpeg
```
