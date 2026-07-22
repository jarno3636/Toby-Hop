type CastInput = {
  displayName?: string | null;
  username?: string | null;
  streak: number;
  totalHops: number;
  tobyDisplay: string;
  dailyPosition: number;
  title: string;
  pondName?: string;
};

function getName(input: CastInput): string {
  if (input.displayName?.trim()) {
    return input.displayName.trim();
  }

  if (input.username?.trim()) {
    return `@${input.username.trim().replace(/^@/, '')}`;
  }

  return 'Another hopper';
}

const templates = [
  (input: CastInput) =>
    `Hop #${input.totalHops} complete.\n\n${input.streak} day streak · ${input.tobyDisplay} TOBY received\n\nOne hop. Every day. 🐸`,

  (input: CastInput) =>
    `The pond called and ${getName(input)} answered.\n\n${input.title} · ${input.streak} day streak · ${input.tobyDisplay} TOBY`,

  (input: CastInput) =>
    `I was hopper #${input.dailyPosition} today.\n\n${input.totalHops} total hops · ${input.streak} day streak · ${input.tobyDisplay} TOBY 🐸`,

  (input: CastInput) =>
    `Another day. Another hop.\n\nDay ${input.streak} · Hop #${input.totalHops} · ${input.tobyDisplay} TOBY`,

  (input: CastInput) =>
    `${getName(input)} added one more ripple to the pond.\n\n${input.streak} day streak · ${input.totalHops} total hops · ${input.tobyDisplay} TOBY`,

  (input: CastInput) =>
    `Toby made the jump.\n\n${input.title} · Hopper #${input.dailyPosition} today · ${input.tobyDisplay} TOBY`,

  (input: CastInput) =>
    `The streak lives on.\n\n${input.streak} days · ${input.totalHops} hops · ${input.tobyDisplay} TOBY collected 🐸`,

  (input: CastInput) =>
    `One small hop for ${getName(input)}.\nOne more ripple for the pond.\n\n${input.tobyDisplay} TOBY · Day ${input.streak}`,
];

export function buildCast(input: CastInput): string {
  const index = input.totalHops % templates.length;
  return templates[index](input);
}
