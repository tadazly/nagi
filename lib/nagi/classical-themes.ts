export type FamiliarClassicalTheme = {
  composer: string;
  contour: readonly number[];
  id: string;
  mode: 'major' | 'minor';
  name: string;
  rhythmBeats: readonly number[];
  weight: number;
};

// Short, transformable public-domain theme archetypes. They provide familiar
// contour and phrase logic without turning NAGI into a fixed-score player.
export const FAMILIAR_CLASSICAL_THEMES: readonly FamiliarClassicalTheme[] = [
  {
    composer: 'Beethoven',
    contour: [0, 0, 1, 1, 2, 2, 1, 0],
    id: 'ode-to-joy',
    mode: 'major',
    name: 'Ode to Joy',
    rhythmBeats: [1, 1, 1, 1, 1, 1, 1.5, 0.5],
    weight: 1.35,
  },
  {
    composer: 'Mozart',
    contour: [0, 0, 4, 0, 2, 0, 4, 2],
    id: 'eine-kleine-nachtmusik',
    mode: 'major',
    name: 'Eine kleine Nachtmusik',
    rhythmBeats: [0.5, 0.5, 1, 0.5, 0.5, 1, 0.75, 1.25],
    weight: 1.24,
  },
  {
    composer: 'Pachelbel',
    contour: [0, 4, 5, 2, 3, 0, 3, 4],
    id: 'canon-in-d',
    mode: 'major',
    name: 'Canon in D',
    rhythmBeats: [1, 1, 1, 1, 1, 1, 1, 1],
    weight: 1.18,
  },
  {
    composer: 'Bach',
    contour: [0, 2, 4, 2, 5, 4, 2, 1],
    id: 'air-on-the-g-string',
    mode: 'major',
    name: 'Air on the G String',
    rhythmBeats: [1.5, 0.5, 1, 1, 1.5, 0.5, 1, 2],
    weight: 1.08,
  },
  {
    composer: 'Vivaldi',
    contour: [0, 2, 4, 5, 4, 2, 1, 0],
    id: 'spring',
    mode: 'major',
    name: 'The Four Seasons: Spring',
    rhythmBeats: [0.5, 0.5, 0.5, 0.5, 1, 0.5, 0.5, 1],
    weight: 1.04,
  },
  {
    composer: 'Brahms',
    contour: [0, 2, 2, 4, 4, 2, 0, 1],
    id: 'lullaby',
    mode: 'major',
    name: 'Wiegenlied',
    rhythmBeats: [0.75, 0.25, 1, 0.75, 0.25, 1, 1, 2],
    weight: 0.98,
  },
  {
    composer: 'Beethoven',
    contour: [0, -1, 0, -1, 0, -3, -1, -2],
    id: 'fur-elise',
    mode: 'minor',
    name: 'Für Elise',
    rhythmBeats: [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.75, 1.25],
    weight: 1.28,
  },
  {
    composer: 'Beethoven',
    contour: [0, 0, 0, -2, -3, -3, -3, -4],
    id: 'symphony-five',
    mode: 'minor',
    name: 'Symphony No. 5',
    rhythmBeats: [0.5, 0.5, 0.5, 1.5, 0.5, 0.5, 0.5, 1.5],
    weight: 1.16,
  },
  {
    composer: 'Beethoven',
    contour: [0, 2, 4, 5, 4, 2, 1, 0],
    id: 'moonlight-sonata',
    mode: 'minor',
    name: 'Moonlight Sonata',
    rhythmBeats: [1, 0.5, 0.5, 1, 0.5, 0.5, 1, 2],
    weight: 1.05,
  },
  {
    composer: 'Chopin',
    contour: [0, 1, 3, 4, 3, 1, -1, 0],
    id: 'nocturne-op9-no2',
    mode: 'minor',
    name: 'Nocturne Op. 9 No. 2',
    rhythmBeats: [1, 0.5, 0.5, 1.5, 0.5, 1, 0.5, 1.5],
    weight: 0.94,
  },
] as const;

type RandomLike = {
  next: () => number;
};

export const chooseFamiliarClassicalTheme = (
  random: RandomLike,
  mode: 'major' | 'minor',
) => {
  const matching = FAMILIAR_CLASSICAL_THEMES.filter((theme) => theme.mode === mode);
  const total = matching.reduce((sum, theme) => sum + theme.weight, 0);
  let cursor = random.next() * total;
  for (const theme of matching) {
    cursor -= theme.weight;
    if (cursor <= 0) return theme;
  }
  return matching.at(-1) ?? FAMILIAR_CLASSICAL_THEMES[0];
};
