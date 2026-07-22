type CastInput = {
  displayName: string;
  streak: number;
  totalHops: number;
  tobyDisplay: string;
  dailyPosition: number;
  title: string;
};

const templates = [
  (x: CastInput) =>
    `Hop #${x.totalHops} complete. ${x.streak}-day streak · ${x.tobyDisplay} $TOBY received.\n\nOne hop. Every day. 🐸`,
  (x: CastInput) =>
    `${x.displayName} just crossed the pond again.\n\n${x.title} · Day ${x.streak} · Hop #${x.totalHops} · ${x.tobyDisplay} $TOBY 🐸`,
  (x: CastInput) =>
    `I was hopper #${x.dailyPosition} in the pond today.\n\n${x.streak}-day streak · ${x.totalHops} total hops · +${x.tobyDisplay} $TOBY`,
  (x: CastInput) =>
    `The streak continues: ${x.streak} days.\n\nHop #${x.totalHops} brought ${x.tobyDisplay} $TOBY back from the pond. 🐸`
];

export function buildCast(input: CastInput): string {
  const index = input.totalHops % templates.length;
  return templates[index](input);
}
