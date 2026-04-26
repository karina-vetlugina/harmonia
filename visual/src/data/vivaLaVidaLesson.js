export const vivaLaVidaLesson = {
  songTitle: 'Viva La Vida',
  durationSeconds: 17,
  keyboardSize: 32,
  chunks: [
    {
      id: 'left-1',
      title: 'Left hand pattern',
      hand: 'left',
      startTime: 0,
      endTime: 4,
      targets: [
        { step: 1, pinkKey: 6, orangeKey: 11, holdMs: 1200 },
        { step: 2, pinkKey: 8, orangeKey: 13, holdMs: 1200 },
        { step: 3, pinkKey: 10, orangeKey: 15, holdMs: 1200 }
      ]
    },
    {
      id: 'right-1',
      title: 'Right hand melody',
      hand: 'right',
      startTime: 0,
      endTime: 4,
      targets: [
        { step: 1, greenKey: 22, holdMs: 800 },
        { step: 2, greenKey: 24, holdMs: 800 },
        { step: 3, greenKey: 21, holdMs: 800 },
        { step: 4, greenKey: 19, holdMs: 800 }
      ]
    },
    {
      id: 'both-1',
      title: 'Put it together',
      hand: 'both',
      startTime: 0,
      endTime: 4,
      targets: [
        { step: 1, pinkKey: 6, orangeKey: 11, greenKey: 22, holdMs: 1000 },
        { step: 2, pinkKey: 6, orangeKey: 11, greenKey: 24, holdMs: 1000 },
        { step: 3, pinkKey: 8, orangeKey: 13, greenKey: 21, holdMs: 1000 },
        { step: 4, pinkKey: 8, orangeKey: 13, greenKey: 19, holdMs: 1000 }
      ]
    }
  ]
};
