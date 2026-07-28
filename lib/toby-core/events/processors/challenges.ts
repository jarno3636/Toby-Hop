import type {
  EventProcessor,
} from '../dispatcher';

export const runChallengeProcessor: EventProcessor = {
  name: 'Challenges',

  async handle(event) {
    if (
      event.type !== 'hop_completed'
    ) {
      return;
    }

    // TODO
    // Update challenge progress
  },
};
