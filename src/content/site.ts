// All copy for the Kodexa site lives here so it can be edited without
// touching the WebGL scene code.

export const brand = {
  name: "Kodexa",
  wordmark: "KODEXA",
  tagline: "Structure for the data-driven world.",
  description:
    "Kodexa designs and ships software that turns raw, messy data into clear decisions.",
  email: "hello@kodexa.com",
};

export const hero = {
  eyebrow: "EST. 2026 / SOFTWARE STUDIO",
  title: ["We build the", "structure beneath", "your data."],
  cue: "SCROLL TO EXPLORE",
};

export const manifesto = {
  label: "MANIFESTO",
  lines: [
    "Every company is sitting on a mountain of data.",
    "Most of it is frozen — scattered, unlabeled, unread.",
    "Kodexa exists to thaw it out.",
    "We design small, sharp tools that give data shape,",
    "so teams can see clearly and move quickly.",
  ],
};

export type Venture = {
  id: string;
  index: string;
  name: string;
  kind: string;
  summary: string;
  stat: { label: string; value: string };
};

export const ventures: Venture[] = [
  {
    id: "atlas",
    index: "01",
    name: "Kodexa Atlas",
    kind: "DATA CATALOG",
    summary: "Maps every table, field and owner across your stack in minutes.",
    stat: { label: "SOURCES MAPPED", value: "12,400+" },
  },
  {
    id: "relay",
    index: "02",
    name: "Kodexa Relay",
    kind: "REALTIME PIPELINES",
    summary: "Streams events between systems with sub-second delivery.",
    stat: { label: "EVENTS / DAY", value: "3.2B" },
  },
  {
    id: "lens",
    index: "03",
    name: "Kodexa Lens",
    kind: "ANALYTICS",
    summary: "Turns plain-language questions into live, shareable dashboards.",
    stat: { label: "QUERIES ANSWERED", value: "48M" },
  },
];

export type LabItem = {
  id: string;
  name: string;
  status: string;
  description: string;
};

export const labs: LabItem[] = [
  {
    id: "orb",
    name: "ORB",
    status: "RESEARCH",
    description: "Vector search that runs entirely on-device.",
  },
  {
    id: "knot",
    name: "KNOT",
    status: "PROTOTYPE",
    description: "Schema diffing for teams that ship migrations daily.",
  },
  {
    id: "glyph",
    name: "GLYPH",
    status: "BETA",
    description: "Document extraction that learns your templates.",
  },
];

export const footer = {
  cta: "Let's give your data some structure.",
  links: [
    { label: "X / TWITTER", href: "https://x.com" },
    { label: "LINKEDIN", href: "https://linkedin.com" },
    { label: "GITHUB", href: "https://github.com" },
  ],
  legal: `© ${new Date().getFullYear()} KODEXA INC. ALL RIGHTS RESERVED.`,
};
