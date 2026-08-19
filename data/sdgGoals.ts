// Static SDG goal catalogue used for labels, colors, and goal ordering.
// Indicator data comes from the workbook; this file supplies the official 17-goal frame.
export interface SdgGoalInfo {
  goal: number;
  name: string;
  shortName: string;
  color: string;
}

export const SDG_GOALS: SdgGoalInfo[] = [
  { goal: 1, name: 'No Poverty', shortName: 'Poverty', color: '#E5243B' },
  { goal: 2, name: 'Zero Hunger', shortName: 'Hunger', color: '#DDA63A' },
  { goal: 3, name: 'Good Health and Well-being', shortName: 'Health', color: '#4C9F38' },
  { goal: 4, name: 'Quality Education', shortName: 'Education', color: '#C5192D' },
  { goal: 5, name: 'Gender Equality', shortName: 'Gender', color: '#FF3A21' },
  { goal: 6, name: 'Clean Water and Sanitation', shortName: 'Water', color: '#26BDE2' },
  { goal: 7, name: 'Affordable and Clean Energy', shortName: 'Energy', color: '#FCC30B' },
  { goal: 8, name: 'Decent Work and Economic Growth', shortName: 'Work', color: '#A21942' },
  { goal: 9, name: 'Industry, Innovation and Infrastructure', shortName: 'Innovation', color: '#FD6925' },
  { goal: 10, name: 'Reduced Inequalities', shortName: 'Inequality', color: '#DD1367' },
  { goal: 11, name: 'Sustainable Cities and Communities', shortName: 'Cities', color: '#FD9D24' },
  { goal: 12, name: 'Responsible Consumption and Production', shortName: 'Consumption', color: '#BF8B2E' },
  { goal: 13, name: 'Climate Action', shortName: 'Climate', color: '#3F7E44' },
  { goal: 14, name: 'Life Below Water', shortName: 'Oceans', color: '#0A97D9' },
  { goal: 15, name: 'Life on Land', shortName: 'Land', color: '#56C02B' },
  { goal: 16, name: 'Peace, Justice and Strong Institutions', shortName: 'Institutions', color: '#00689D' },
  { goal: 17, name: 'Partnerships for the Goals', shortName: 'Partnerships', color: '#19486A' }
];

export const SDG_GOAL_MAP = Object.fromEntries(SDG_GOALS.map((goal) => [goal.goal, goal]));
