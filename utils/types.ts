// Shared TypeScript models for the public SDG dashboard.
// These interfaces describe the normalized build-time dataset consumed by pages
// and visualization components.
export type ProgressStatus = 'On track' | 'Moderate progress' | 'Needs attention' | 'No data';
export type TargetDirection = 'Increase' | 'Decrease' | 'Unclear';

export interface IndicatorSummary {
  code: string;
  slug: string;
  goal: number;
  target: string;
  title: string;
  unit: string;
  source: string;
  latestValue: number | null;
  latestYear: number | null;
  status: ProgressStatus;
  hasData: boolean;
  availabilityRatio: number;
  direction: TargetDirection;
  baselineYear: number | null;
  baselineValue: number | null;
  targetYear: number;
  targetValue: number | null;
  projectedValue2030: number | null;
  targetProgressPercent: number | null;
  projectedProgressPercent: number | null;
  gapToTarget: number | null;
  requiredAnnualChange: number | null;
  actualAnnualChange: number | null;
  analysisNote: string;
  observationCount: number;
  yearsWithData: number[];
  availableSexes: string[];
  availableLocations: string[];
  availableAgeGroups: string[];
}

export interface GoalSummary {
  goal: number;
  name: string;
  shortName: string;
  color: string;
  indicatorCount: number;
  withDataCount: number;
  analyzableCount: number;
  targetProgressPercent: number;
  projectedOnTrackPercent: number;
  onTrack: number;
  moderate: number;
  needsAttention: number;
  noData: number;
  status: ProgressStatus;
}

export interface TrendPoint {
  year: number;
  value: number;
}

export interface DisaggregationPoint {
  label: string;
  value: number;
}

export interface DisaggregationData {
  dimension: string;
  year: number;
  data: DisaggregationPoint[];
}

export interface IndicatorMetadata {
  indicatorDefinition?: string;
  targetName?: string;
  graphTitle?: string;
  computationUnits?: string;
  sourceOrganisation?: string;
  sourceUrl?: string;
  sourceUrlText?: string;
  dataLastUpdated?: string;
  metadataLastUpdated?: string;
  body?: string;
}

export interface IndicatorDetail {
  summary: IndicatorSummary;
  trend: TrendPoint[];
  disaggregation: DisaggregationData | null;
  metadata: IndicatorMetadata;
  downloadableRows: Record<string, string | number | null>[];
}

export interface DataQualitySummary {
  insufficientDataIndicators: IndicatorSummary[];
  likelyToMeetTargetIndicators: IndicatorSummary[];
  offTrackIndicators: IndicatorSummary[];
  farFromTargetIndicators: IndicatorSummary[];
}

export interface GoalTargetPoint {
  goal: number;
  goalName: string;
  targetProgressPercent: number;
  analyzableCount: number;
  onTrackCount: number;
  needsAttentionCount: number;
}

export interface DashboardDataset {
  generatedAt: string;
  lastUpdated: string | null;
  totals: {
    sdgs: number;
    indicators: number;
    indicatorsWithData: number;
    indicatorsMissingData: number;
  };
  overallProgress: {
    onTrack: number;
    moderate: number;
    needsAttention: number;
    noData: number;
    averageTargetProgress: number;
    projectedOnTrackRate: number;
  };
  filters: {
    years: number[];
    sexes: string[];
    locations: string[];
    ages: string[];
    goals: number[];
  };
  goals: GoalSummary[];
  indicators: IndicatorSummary[];
  dataQuality: DataQualitySummary;
  targetByGoal: GoalTargetPoint[];
  details: Record<string, IndicatorDetail>;
}
