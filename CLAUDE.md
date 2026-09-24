@AGENTS.md

Built with the kodexa-builder skill (v1.1.0). Load it for any new feature or
design work, and log preferences, corrections and reversals to
`.claude/kodexa-learnings.md` as they happen.

Palette exceptions: warm near-black and gold on /tea (the brief was a dark, gold-lit tea film)

## /tea (Kinari tea demo)

- Copy: `src/content/tea.ts`. Scroll timing: `src/lib/teaTimeline.ts`.
- Scene: `src/components/tea/teaEngine.ts` (plain three.js, all procedural) and `shaders.ts`.
- Facebook reel: `npm run build && npx next start -p 3100`, then `node scripts/record-tea-reel.mjs` (writes `media/kinari-reel.mp4`). The frame layout lives at `/tea/reel`.
