// Investor DMS dashboard: the (i) text of every card, in one place (version 3, 27 Nov 2026).
// Kept short and plain on purpose (product owner): what the card is for, in one line.
export const DEF = {
  trend: 'How this number moved over the period. Click a bar to see its records.',
  today: 'What needs your attention today. Click a row to open the records.',
  dealOutcomes: 'Deals whose meeting fell in this period, and how they ended. Closed = marked Completed, with its final amount.',
  pipelineAhead: 'Deals planned from today on, by when the meeting is. Planned amounts are not certain.',
  dealProducts: 'The planned amount of the deals in this period, by product.',
  status: 'Investors held now: Active, Inactive, or Prospect Investor (not invested yet).',
  bands: 'Investors held now, by the size of their AUM.',
  atRisk: 'Investors who may slip: turning Inactive soon, Prospect Investors running out of time, not called for 60 days.',
  heat: 'Every weekday and hour of the period: the darker the cell, the more calls were picked up. Grey cells had too few calls to judge. A cell opens its calls.',
  gauge: 'Connected calls out of all calls, against the 75% at which the connect rate turns green.',
  byHour: 'Calls at each hour of the day: the dark part of each bar is connected calls.',
  outcomes: 'How calls ended, most common first. Click a bar to see those calls.',
  effort: 'Calls a day against a result, for each IS or each team. The dashed lines are the company medians; they split people into Star, Hard worker, Smart worker and Needs attention.',
  people: 'Each person’s book, calls and deals in this period, by team. Click a name to see their dashboard.',
  compare: 'The teams or people chosen in the picker, day by day and against the Money Honey average.',
  // Admin operations
  unassigned: 'Unassigned Investors now: by reason (read from the investor\'s status) and by days in the queue.',
}
