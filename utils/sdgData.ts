import fs from 'fs';
import path from 'path';

import matter from 'gray-matter';
import XLSX from 'xlsx';

import { SDG_GOAL_MAP, SDG_GOALS } from '../data/sdgGoals';
import { CURRENT_YEAR, parseDate, toIndicatorSlug } from './format';
import {
  DashboardDataset,
  DisaggregationData,
  GoalSummary,
  IndicatorDetail,
  IndicatorMetadata,
  IndicatorSummary,
  ProgressStatus,
  TargetDirection
} from './types';

interface ParsedRow {
  indicatorCode: string;
  title: string;
  seriesCode: string;
  unitCode: string;
  source: string;
  description: string;
  sex: string | null;
  age: string | null;
  province: string | null;
  district: string | null;
  urbanization: string | null;
  education: string | null;
  occupation: string | null;
  refArea: string | null;
  yearValues: Array<{ year: number; value: number }>;
}

interface IndicatorBucket {
  code: string;
  goal: number;
  target: string;
  title: string;
  unitCode: string;
  source: string;
  description: string;
  rows: ParsedRow[];
  yearsWithAnyData: Set<number>;
  sexes: Set<string>;
  locations: Set<string>;
  ages: Set<string>;
}

const resolvePublicExcelPath = (): string => {
  const envPath = process.env.PUBLIC_SDG_DATA_PATH?.trim();
  if (envPath) {
    const absolute = path.isAbsolute(envPath) ? envPath : path.join(process.cwd(), envPath);
    if (fs.existsSync(absolute)) {
      return absolute;
    }
  }

  const approvedPath = path.join(process.cwd(), 'data', 'approved', '2025_RW-SDG_Data.xlsx');
  if (fs.existsSync(approvedPath)) {
    return approvedPath;
  }

  const fallbackMainPath = path.join(process.cwd(), 'data', '2025_RW-SDG_Data.xlsx');
  if (fs.existsSync(fallbackMainPath)) {
    fs.mkdirSync(path.dirname(approvedPath), { recursive: true });
    fs.copyFileSync(fallbackMainPath, approvedPath);
    return approvedPath;
  }

  return approvedPath;
};

const EXCEL_PATH = resolvePublicExcelPath();
const META_DIR = path.join(process.cwd(), 'meta');
const GEOJSON_PATH = path.join(process.cwd(), 'geojsons', 'RwandaRegions.geojson');
const PUBLIC_DATA_SOURCE_FILTER = (process.env.PUBLIC_DATA_SOURCE_FILTER || 'nisr').trim().toLowerCase();

const PROVINCE_NAME_MAP: Record<string, string> = {
  'eastern province': 'East Province',
  'kigali city': 'Kigali City',
  'northern province': 'Northern Province, Rwanda',
  'southern province': 'Southern Province, Rwanda',
  'western province': 'Western Province, Rwanda'
};

let cachedDataset: DashboardDataset | null = null;
let cachedDatasetMtimeMs: number | null = null;
const TARGET_YEAR = 2030;

const DECREASE_HINTS = [
  'poverty',
  'mortality',
  'deaths',
  'death',
  'hiv',
  'tuberculosis',
  'malaria',
  'violence',
  'crime',
  'pollution',
  'waste',
  'emission',
  'stunting',
  'underweight',
  'unemployment',
  'slum',
  'injury',
  'child marriage',
  'abuse',
  'trafficking',
  'co2',
  'incidence',
  'prevalence',
  'victim',
  'inequality',
  'below',
  'corruption'
];

const INCREASE_HINTS = [
  'coverage',
  'access',
  'completion',
  'literacy',
  'enrolment',
  'enrollment',
  'attendance',
  'immunization',
  'vaccination',
  'renewable',
  'protected area',
  'representation',
  'internet',
  'electricity',
  'sanitation',
  'water service',
  'financial inclusion',
  'birth registration',
  'policy',
  'expenditure',
  'productivity',
  'skills',
  'employment'
];

const DECREASE_TARGET_HINTS = ['reduce', 'eliminate', 'end', 'eradicate', 'decrease', 'lower', 'halve', 'prevent'];
const INCREASE_TARGET_HINTS = ['increase', 'achieve', 'ensure', 'universal', 'expand', 'improve', 'promote'];

const safeString = (value: unknown): string => {
  if (value === null || value === undefined) {
    return '';
  }

  return String(value).trim();
};

const sourcePassesFilter = (source: string): boolean => {
  if (!PUBLIC_DATA_SOURCE_FILTER || PUBLIC_DATA_SOURCE_FILTER === 'all') {
    return true;
  }

  const normalizedSource = source.trim().toLowerCase();
  if (!normalizedSource) {
    return false;
  }

  if (PUBLIC_DATA_SOURCE_FILTER === 'nisr') {
    return normalizedSource.includes('nisr');
  }

  const tokens = PUBLIC_DATA_SOURCE_FILTER
    .split(',')
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean);
  if (!tokens.length) {
    return true;
  }

  return tokens.some((token) => normalizedSource.includes(token));
};

const normalizedDimension = (value: unknown): string | null => {
  const cleaned = safeString(value);
  if (!cleaned || cleaned === '_T') {
    return null;
  }
  return cleaned;
};

const safeNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const numeric = typeof value === 'number' ? value : Number(String(value).replaceAll(',', ''));
  if (!Number.isFinite(numeric)) {
    return null;
  }
  return numeric;
};

const sortNatural = (a: string, b: string): number =>
  a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });

const clampPercent = (value: number): number => Math.max(0, Math.min(100, value));

const getGoalTarget = (code: string): { goal: number; target: string } => {
  const [goalPart, targetPart] = code.split('.');
  return {
    goal: Number(goalPart),
    target: `${goalPart}.${targetPart ?? ''}`.replace(/\.$/, '')
  };
};

const normalizeProvinceName = (value: string): string => {
  const key = value.trim().toLowerCase();
  return PROVINCE_NAME_MAP[key] ?? value.trim();
};

const getSpecificityScore = (row: ParsedRow): number => {
  const dimensions = [
    row.sex,
    row.age,
    row.province,
    row.district,
    row.urbanization,
    row.education,
    row.occupation
  ];
  return dimensions.filter((value) => Boolean(value)).length;
};

const containsAny = (text: string, keywords: string[]): boolean =>
  keywords.some((keyword) => text.includes(keyword));

const inferDirection = (
  title: string,
  description: string,
  targetText: string,
  unitText: string
): TargetDirection => {
  const combined = `${title} ${description}`.toLowerCase();
  const targetLower = targetText.toLowerCase();
  const unitLower = unitText.toLowerCase();

  if (containsAny(targetLower, DECREASE_TARGET_HINTS)) {
    return 'Decrease';
  }
  if (containsAny(targetLower, INCREASE_TARGET_HINTS)) {
    return 'Increase';
  }

  const hasDecreaseHint = containsAny(combined, DECREASE_HINTS);
  const hasIncreaseHint = containsAny(combined, INCREASE_HINTS);

  if (hasDecreaseHint && !hasIncreaseHint) {
    return 'Decrease';
  }
  if (hasIncreaseHint && !hasDecreaseHint) {
    return 'Increase';
  }

  if (/%|percent|percentage|proportion|share/.test(unitLower)) {
    return 'Increase';
  }

  return 'Unclear';
};

const inferTargetValue = (
  direction: TargetDirection,
  unit: string,
  baselineValue: number,
  latestValue: number,
  trend: Array<{ year: number; value: number }>
): number | null => {
  if (direction === 'Unclear') {
    return null;
  }

  const unitLower = unit.toLowerCase();
  const looksLikePercent = /%|percent|percentage|proportion|share/.test(unitLower);

  if (looksLikePercent) {
    return direction === 'Increase' ? 100 : 0;
  }

  const values = trend.map((point) => point.value);
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const observedRange = Math.max(maxValue - minValue, Math.abs(latestValue - baselineValue), 1);
  const improvementStep = Math.max(observedRange * 0.5, Math.abs(baselineValue) * 0.1, 1);

  if (direction === 'Increase') {
    return Math.max(latestValue, baselineValue) + improvementStep;
  }

  const targetCandidate = Math.min(latestValue, baselineValue) - improvementStep;
  if (minValue >= 0) {
    return Math.max(0, targetCandidate);
  }
  return targetCandidate;
};

interface TargetAnalysis {
  status: ProgressStatus;
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
  note: string;
}

const analyzeTargetProgress = (
  trend: Array<{ year: number; value: number }>,
  title: string,
  description: string,
  targetText: string,
  unit: string
): TargetAnalysis => {
  const hasData = trend.length > 0;
  if (!hasData) {
    return {
      status: 'No data',
      direction: 'Unclear',
      baselineYear: null,
      baselineValue: null,
      targetYear: TARGET_YEAR,
      targetValue: null,
      projectedValue2030: null,
      targetProgressPercent: null,
      projectedProgressPercent: null,
      gapToTarget: null,
      requiredAnnualChange: null,
      actualAnnualChange: null,
      note: 'No observations available for target analysis.'
    };
  }

  const baselinePoint = trend[0];
  const latestPoint = trend[trend.length - 1];
  const direction = inferDirection(title, description, targetText, unit);

  if (trend.length < 2) {
    return {
      status: 'Moderate progress',
      direction,
      baselineYear: baselinePoint.year,
      baselineValue: baselinePoint.value,
      targetYear: TARGET_YEAR,
      targetValue: null,
      projectedValue2030: null,
      targetProgressPercent: null,
      projectedProgressPercent: null,
      gapToTarget: null,
      requiredAnnualChange: null,
      actualAnnualChange: null,
      note: 'At least two time points are required for trajectory analysis.'
    };
  }

  const targetValue = inferTargetValue(direction, unit, baselinePoint.value, latestPoint.value, trend);
  if (targetValue === null || direction === 'Unclear') {
    return {
      status: latestPoint.year >= CURRENT_YEAR - 3 ? 'Moderate progress' : 'Needs attention',
      direction,
      baselineYear: baselinePoint.year,
      baselineValue: baselinePoint.value,
      targetYear: TARGET_YEAR,
      targetValue: null,
      projectedValue2030: null,
      targetProgressPercent: null,
      projectedProgressPercent: null,
      gapToTarget: null,
      requiredAnnualChange: null,
      actualAnnualChange: null,
      note: 'Direction toward target could not be inferred reliably from available metadata.'
    };
  }

  const elapsedYears = Math.max(1, latestPoint.year - baselinePoint.year);
  const remainingYears = Math.max(1, TARGET_YEAR - latestPoint.year);

  const denominator =
    direction === 'Increase'
      ? targetValue - baselinePoint.value
      : baselinePoint.value - targetValue;

  if (denominator <= 0) {
    return {
      status: 'Moderate progress',
      direction,
      baselineYear: baselinePoint.year,
      baselineValue: baselinePoint.value,
      targetYear: TARGET_YEAR,
      targetValue,
      projectedValue2030: latestPoint.value,
      targetProgressPercent: null,
      projectedProgressPercent: null,
      gapToTarget: null,
      requiredAnnualChange: null,
      actualAnnualChange: null,
      note: 'Baseline already meets or exceeds the inferred target threshold.'
    };
  }

  const achieved =
    direction === 'Increase'
      ? latestPoint.value - baselinePoint.value
      : baselinePoint.value - latestPoint.value;

  const targetProgressPercent = (achieved / denominator) * 100;
  const actualAnnualChange = achieved / elapsedYears;

  const remainingGap =
    direction === 'Increase' ? targetValue - latestPoint.value : latestPoint.value - targetValue;
  const requiredAnnualChange = remainingGap / remainingYears;

  const projectedValue2030 =
    direction === 'Increase'
      ? latestPoint.value + actualAnnualChange * remainingYears
      : latestPoint.value - actualAnnualChange * remainingYears;

  const projectedAchieved =
    direction === 'Increase'
      ? projectedValue2030 - baselinePoint.value
      : baselinePoint.value - projectedValue2030;

  const projectedProgressPercent = (projectedAchieved / denominator) * 100;

  let status: ProgressStatus = 'Needs attention';
  if (projectedProgressPercent >= 100) {
    status = 'On track';
  } else if (projectedProgressPercent >= 70) {
    status = 'Moderate progress';
  }

  if (latestPoint.year <= CURRENT_YEAR - 5) {
    status = 'Needs attention';
  }

  const note =
    status === 'On track'
      ? 'Current trajectory is likely to meet the inferred 2030 target.'
      : status === 'Moderate progress'
        ? 'Progress is positive but acceleration is needed to fully reach target by 2030.'
        : 'Current trend is insufficient to meet the inferred 2030 target.';

  return {
    status,
    direction,
    baselineYear: baselinePoint.year,
    baselineValue: baselinePoint.value,
    targetYear: TARGET_YEAR,
    targetValue,
    projectedValue2030: Number(projectedValue2030.toFixed(3)),
    targetProgressPercent: Number(targetProgressPercent.toFixed(2)),
    projectedProgressPercent: Number(projectedProgressPercent.toFixed(2)),
    gapToTarget: Number(Math.max(0, remainingGap).toFixed(3)),
    requiredAnnualChange: Number(requiredAnnualChange.toFixed(4)),
    actualAnnualChange: Number(actualAnnualChange.toFixed(4)),
    note
  };
};

const pickPrimarySeries = (rows: ParsedRow[]): ParsedRow | null => {
  const withValues = rows.filter((row) => row.yearValues.length > 0);
  if (!withValues.length) {
    return null;
  }

  return [...withValues].sort((a, b) => {
    const scoreDiff = getSpecificityScore(a) - getSpecificityScore(b);
    if (scoreDiff !== 0) {
      return scoreDiff;
    }
    return b.yearValues.length - a.yearValues.length;
  })[0];
};

type DisaggregationDimensionKey =
  | 'sex'
  | 'province'
  | 'urbanization'
  | 'age'
  | 'education'
  | 'occupation'
  | 'district';

const buildDisaggregation = (rows: ParsedRow[], latestYear: number | null): DisaggregationData | null => {
  if (!latestYear) {
    return null;
  }

  const dimensions: Array<{ key: DisaggregationDimensionKey; label: string }> = [
    { key: 'sex', label: 'Sex' },
    { key: 'province', label: 'Province' },
    { key: 'urbanization', label: 'Urbanization' },
    { key: 'age', label: 'Age group' },
    { key: 'education', label: 'Education' },
    { key: 'occupation', label: 'Occupation' },
    { key: 'district', label: 'District' }
  ];

  for (const dimension of dimensions) {
    const grouped: Record<string, number[]> = {};

    for (const row of rows) {
      const label = row[dimension.key];
      if (!label) {
        continue;
      }

      const point = row.yearValues.find((yearValue) => yearValue.year === latestYear);
      if (!point) {
        continue;
      }

      if (!grouped[label]) {
        grouped[label] = [];
      }
      grouped[label].push(point.value);
    }

    const labels = Object.keys(grouped);
    if (labels.length < 2) {
      continue;
    }

    const data = labels
      .map((label) => {
        const values = grouped[label];
        const average = values.reduce((sum, value) => sum + value, 0) / values.length;
        return {
          label,
          value: Number(average.toFixed(2))
        };
      })
      .sort((a, b) => b.value - a.value)
      .slice(0, 12);

    return {
      dimension: dimension.label,
      year: latestYear,
      data
    };
  }

  return null;
};

const toDownloadRows = (bucket: IndicatorBucket): Record<string, string | number | null>[] => {
  const rows: Record<string, string | number | null>[] = [];
  for (const row of bucket.rows) {
    for (const point of row.yearValues) {
      rows.push({
        Indicator: bucket.code,
        Series: bucket.title,
        Series_Code: row.seriesCode,
        Year: point.year,
        Value: point.value,
        Unit: bucket.unitCode,
        Source: bucket.source,
        Sex: row.sex ?? 'Total',
        Age: row.age ?? 'Total',
        Province: row.province,
        District: row.district,
        Urbanization: row.urbanization,
        Education: row.education,
        Occupation: row.occupation,
        Description: row.description || bucket.description
      });
    }
  }
  return rows;
};

const parseMetadata = (): Record<string, IndicatorMetadata> => {
  const metadataByIndicator: Record<string, IndicatorMetadata> = {};

  if (!fs.existsSync(META_DIR)) {
    return metadataByIndicator;
  }

  const files = fs.readdirSync(META_DIR).filter((fileName) => fileName.endsWith('.md'));
  for (const fileName of files) {
    const fullPath = path.join(META_DIR, fileName);
    const raw = fs.readFileSync(fullPath, 'utf-8');
    const parsed = matter(raw);
    const frontmatter = parsed.data as Record<string, unknown>;
    const code = safeString(frontmatter.indicator_number) || fileName.replace('.md', '').replaceAll('-', '.');
    if (!code) {
      continue;
    }

    metadataByIndicator[code.toLowerCase()] = {
      indicatorDefinition: safeString(frontmatter.indicator_definition) || undefined,
      targetName: safeString(frontmatter.target_name) || undefined,
      graphTitle: safeString(frontmatter.graph_title) || undefined,
      computationUnits: safeString(frontmatter.computation_units) || undefined,
      sourceOrganisation: safeString(frontmatter.source_organisation_1) || undefined,
      sourceUrl: safeString(frontmatter.source_url_1) || undefined,
      sourceUrlText: safeString(frontmatter.source_url_text_1) || undefined,
      dataLastUpdated: safeString(frontmatter.data_last_updated) || undefined,
      metadataLastUpdated: safeString(frontmatter.metadata_last_updated) || undefined,
      body: parsed.content.trim() || undefined
    };
  }

  return metadataByIndicator;
};

const loadRows = (): {
  buckets: Record<string, IndicatorBucket>;
  years: number[];
  provinceCoverageRows: Array<{ indicatorCode: string; province: string; latestYear: number | null }>;
} => {
  const workbook = XLSX.readFile(EXCEL_PATH, { cellDates: false });
  const dataSheet = workbook.Sheets.Data || workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(dataSheet, { defval: null });

  if (!rows.length) {
    return { buckets: {}, years: [], provinceCoverageRows: [] };
  }

  const normalizedRows = rows.map((row) =>
    Object.fromEntries(Object.entries(row).map(([key, value]) => [key.trim(), value]))
  );

  const years = Object.keys(normalizedRows[0])
    .map((key) => Number(key))
    .filter((key) => Number.isInteger(key) && key > 1900 && key < 2101)
    .sort((a, b) => a - b);

  const buckets: Record<string, IndicatorBucket> = {};
  const provinceCoverageRows: Array<{ indicatorCode: string; province: string; latestYear: number | null }> = [];

  for (const row of normalizedRows) {
    const indicatorCode = safeString(row.Indicator);
    if (!indicatorCode) {
      continue;
    }
    const source = safeString(row['Data Source']);
    if (!sourcePassesFilter(source)) {
      continue;
    }

    const { goal, target } = getGoalTarget(indicatorCode);
    if (!buckets[indicatorCode]) {
      buckets[indicatorCode] = {
        code: indicatorCode,
        goal,
        target,
        title: safeString(row.Series),
        unitCode: safeString(row.Unit_Code),
        source,
        description: safeString(row.Description),
        rows: [],
        yearsWithAnyData: new Set<number>(),
        sexes: new Set<string>(),
        locations: new Set<string>(),
        ages: new Set<string>()
      };
    }

    const parsedRow: ParsedRow = {
      indicatorCode,
      title: safeString(row.Series),
      seriesCode: safeString(row.Series_Code),
      unitCode: safeString(row.Unit_Code),
      source,
      description: safeString(row.Description),
      sex: normalizedDimension(row.Sex),
      age: normalizedDimension(row.Age),
      province: normalizedDimension(row.Province),
      district: normalizedDimension(row.District),
      urbanization: normalizedDimension(row.Urbanization),
      education: normalizedDimension(row.Education),
      occupation: normalizedDimension(row.Occupation),
      refArea: normalizedDimension(row.Ref_Area),
      yearValues: []
    };

    let latestYearForRow: number | null = null;
    for (const year of years) {
      const value = safeNumber(row[String(year)]);
      if (value === null) {
        continue;
      }
      parsedRow.yearValues.push({ year, value });
      buckets[indicatorCode].yearsWithAnyData.add(year);
      latestYearForRow = year;
    }

    if (parsedRow.sex) {
      buckets[indicatorCode].sexes.add(parsedRow.sex);
    }
    if (parsedRow.age) {
      buckets[indicatorCode].ages.add(parsedRow.age);
    }

    const locationCandidates = [parsedRow.province, parsedRow.district, parsedRow.urbanization];
    for (const location of locationCandidates) {
      if (location) {
        buckets[indicatorCode].locations.add(location);
      }
    }

    if (parsedRow.province) {
      provinceCoverageRows.push({
        indicatorCode,
        province: normalizeProvinceName(parsedRow.province),
        latestYear: latestYearForRow
      });
    }

    buckets[indicatorCode].rows.push(parsedRow);
  }

  return { buckets, years, provinceCoverageRows };
};

const getGoalStatus = (goalSummary: GoalSummary): ProgressStatus => {
  if (goalSummary.noData === goalSummary.indicatorCount) {
    return 'No data';
  }

  if (goalSummary.onTrack / goalSummary.indicatorCount >= 0.5) {
    return 'On track';
  }

  if (goalSummary.needsAttention / goalSummary.indicatorCount >= 0.4) {
    return 'Needs attention';
  }

  return 'Moderate progress';
};

const getLastUpdated = (metadataByIndicator: Record<string, IndicatorMetadata>): string | null => {
  const dates: Date[] = [];
  for (const metadata of Object.values(metadataByIndicator)) {
    for (const value of [metadata.dataLastUpdated, metadata.metadataLastUpdated]) {
      if (!value) {
        continue;
      }
      const parsed = parseDate(value);
      if (parsed) {
        dates.push(parsed);
      }
    }
  }

  if (!dates.length) {
    if (!fs.existsSync(EXCEL_PATH)) {
      return null;
    }
    return fs.statSync(EXCEL_PATH).mtime.toISOString();
  }

  dates.sort((a, b) => b.getTime() - a.getTime());
  return dates[0].toISOString();
};

const overallOnTrackWeighted = (indicators: IndicatorSummary[]): number => {
  const onTrack = indicators.filter((indicator) => indicator.status === 'On track').length;
  const moderate = indicators.filter((indicator) => indicator.status === 'Moderate progress').length;
  return onTrack + moderate * 0.5;
};

const buildDataset = (): DashboardDataset => {
  const metadataByIndicator = parseMetadata();
  const { buckets, years, provinceCoverageRows } = loadRows();

  const indicators: IndicatorSummary[] = [];
  const details: Record<string, IndicatorDetail> = {};

  const filterSex = new Set<string>();
  const filterLocations = new Set<string>();
  const filterAges = new Set<string>();

  for (const bucket of Object.values(buckets)) {
    const primarySeries = pickPrimarySeries(bucket.rows);
    const trend = primarySeries
      ? [...primarySeries.yearValues].sort((a, b) => a.year - b.year)
      : [];

    const latestPoint = trend.length ? trend[trend.length - 1] : null;
    const latestYear = latestPoint?.year ?? null;
    const latestValue = latestPoint?.value ?? null;
    const hasData = trend.length > 0;
    const availabilityRatio = years.length ? trend.length / years.length : 0;

    const metadata =
      metadataByIndicator[bucket.code.toLowerCase()] ??
      metadataByIndicator[bucket.code.replaceAll('.', '-').toLowerCase()] ??
      {};

    const analysis = analyzeTargetProgress(
      trend,
      bucket.title,
      bucket.description,
      metadata.targetName ?? '',
      metadata.computationUnits || bucket.unitCode || ''
    );

    const summary: IndicatorSummary = {
      code: bucket.code,
      slug: toIndicatorSlug(bucket.code),
      goal: bucket.goal,
      target: bucket.target,
      title: bucket.title || metadata.graphTitle || `Indicator ${bucket.code}`,
      unit: metadata.computationUnits || bucket.unitCode || 'N/A',
      source: metadata.sourceOrganisation || bucket.source || 'NISR / National sources',
      latestValue,
      latestYear,
      status: analysis.status,
      hasData,
      availabilityRatio,
      direction: analysis.direction,
      baselineYear: analysis.baselineYear,
      baselineValue: analysis.baselineValue,
      targetYear: analysis.targetYear,
      targetValue: analysis.targetValue,
      projectedValue2030: analysis.projectedValue2030,
      targetProgressPercent:
        analysis.targetProgressPercent === null ? null : clampPercent(analysis.targetProgressPercent),
      projectedProgressPercent:
        analysis.projectedProgressPercent === null ? null : clampPercent(analysis.projectedProgressPercent),
      gapToTarget: analysis.gapToTarget,
      requiredAnnualChange: analysis.requiredAnnualChange,
      actualAnnualChange: analysis.actualAnnualChange,
      analysisNote: analysis.note,
      observationCount: bucket.rows.reduce((count, row) => count + row.yearValues.length, 0),
      yearsWithData: [...bucket.yearsWithAnyData].sort((a, b) => a - b),
      availableSexes: [...bucket.sexes].sort(sortNatural),
      availableLocations: [...bucket.locations].sort(sortNatural),
      availableAgeGroups: [...bucket.ages].sort(sortNatural)
    };

    for (const sex of summary.availableSexes) {
      filterSex.add(sex);
    }
    for (const location of summary.availableLocations) {
      filterLocations.add(location);
    }
    for (const age of summary.availableAgeGroups) {
      filterAges.add(age);
    }

    indicators.push(summary);

    details[summary.code] = {
      summary,
      trend,
      disaggregation: buildDisaggregation(bucket.rows, latestYear),
      metadata,
      downloadableRows: toDownloadRows(bucket)
    };
  }

  indicators.sort((a, b) => sortNatural(a.code, b.code));

  const goals: GoalSummary[] = SDG_GOALS.map((goalInfo) => {
    const byGoal = indicators.filter((indicator) => indicator.goal === goalInfo.goal);
    const indicatorCount = byGoal.length;
    const withDataCount = byGoal.filter((indicator) => indicator.hasData).length;
    const analyzable = byGoal.filter((indicator) => indicator.targetProgressPercent !== null);
    const analyzableCount = analyzable.length;
    const onTrack = byGoal.filter((indicator) => indicator.status === 'On track').length;
    const moderate = byGoal.filter((indicator) => indicator.status === 'Moderate progress').length;
    const needsAttention = byGoal.filter((indicator) => indicator.status === 'Needs attention').length;
    const noData = byGoal.filter((indicator) => indicator.status === 'No data').length;
    const targetProgressPercent = analyzableCount
      ? analyzable.reduce((sum, indicator) => sum + (indicator.targetProgressPercent ?? 0), 0) / analyzableCount
      : 0;
    const projectedOnTrackPercent = analyzableCount ? ((onTrack + moderate * 0.5) / analyzableCount) * 100 : 0;

    const summary: GoalSummary = {
      goal: goalInfo.goal,
      name: goalInfo.name,
      shortName: goalInfo.shortName,
      color: goalInfo.color,
      indicatorCount,
      withDataCount,
      analyzableCount,
      targetProgressPercent,
      projectedOnTrackPercent,
      onTrack,
      moderate,
      needsAttention,
      noData,
      status: 'Moderate progress'
    };

    summary.status = getGoalStatus(summary);
    return summary;
  });

  const insufficientDataIndicators = indicators.filter(
    (indicator) => !indicator.hasData || indicator.targetProgressPercent === null
  );
  const likelyToMeetTargetIndicators = indicators.filter((indicator) => indicator.status === 'On track');
  const offTrackIndicators = indicators.filter((indicator) => indicator.status === 'Needs attention');
  const farFromTargetIndicators = [...offTrackIndicators]
    .filter((indicator) => indicator.gapToTarget !== null)
    .sort((a, b) => (b.gapToTarget ?? 0) - (a.gapToTarget ?? 0));

  const targetByGoal = goals.map((goal) => {
    const goalIndicators = indicators.filter((indicator) => indicator.goal === goal.goal);
    const onTrackCount = goalIndicators.filter((indicator) => indicator.status === 'On track').length;
    const needsAttentionCount = goalIndicators.filter(
      (indicator) => indicator.status === 'Needs attention'
    ).length;

    return {
      goal: goal.goal,
      goalName: goal.shortName,
      targetProgressPercent: Number(goal.targetProgressPercent.toFixed(1)),
      onTrackCount,
      needsAttentionCount
    };
  });

  const analyzableIndicators = indicators.filter((indicator) => indicator.targetProgressPercent !== null);

  const overallProgress = {
    onTrack: indicators.filter((indicator) => indicator.status === 'On track').length,
    moderate: indicators.filter((indicator) => indicator.status === 'Moderate progress').length,
    needsAttention: indicators.filter((indicator) => indicator.status === 'Needs attention').length,
    noData: indicators.filter((indicator) => indicator.status === 'No data').length,
    averageTargetProgress: analyzableIndicators.length
      ? analyzableIndicators.reduce((sum, indicator) => sum + (indicator.targetProgressPercent ?? 0), 0) /
        analyzableIndicators.length
      : 0,
    projectedOnTrackRate: analyzableIndicators.length
      ? ((overallOnTrackWeighted(indicators)) / analyzableIndicators.length) * 100
      : 0
  };

  const geojsonRaw = fs.existsSync(GEOJSON_PATH)
    ? JSON.parse(fs.readFileSync(GEOJSON_PATH, 'utf-8'))
    : { type: 'FeatureCollection', features: [] };

  const provinceMap: Record<
    string,
    {
      indicators: Set<string>;
      latestYears: number[];
    }
  > = {};

  for (const row of provinceCoverageRows) {
    if (!provinceMap[row.province]) {
      provinceMap[row.province] = {
        indicators: new Set<string>(),
        latestYears: []
      };
    }
    provinceMap[row.province].indicators.add(row.indicatorCode);
    if (row.latestYear !== null) {
      provinceMap[row.province].latestYears.push(row.latestYear);
    }
  }

  const geoFeatures = Array.isArray(geojsonRaw.features) ? geojsonRaw.features : [];
  const provinceCoverage = geoFeatures.map((feature: Record<string, unknown>) => {
    const properties = (feature.properties as Record<string, unknown>) ?? {};
    const provinceName = safeString(properties.name);
    const stats = provinceMap[provinceName];
    const latestAverageYear =
      stats && stats.latestYears.length
        ? Math.round(stats.latestYears.reduce((sum, year) => sum + year, 0) / stats.latestYears.length)
        : null;

    return {
      province: provinceName,
      indicatorCount: stats ? stats.indicators.size : 0,
      latestAverageYear
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    lastUpdated: getLastUpdated(metadataByIndicator),
    totals: {
      sdgs: SDG_GOALS.length,
      indicators: indicators.length,
      indicatorsWithData: indicators.filter((indicator) => indicator.hasData).length,
      indicatorsMissingData: indicators.filter((indicator) => !indicator.hasData).length
    },
    overallProgress,
    filters: {
      years,
      sexes: [...filterSex].sort(sortNatural),
      locations: [...filterLocations].sort(sortNatural),
      ages: [...filterAges].sort(sortNatural),
      goals: SDG_GOALS.map((goal) => goal.goal)
    },
    goals,
    indicators,
    dataQuality: {
      insufficientDataIndicators,
      likelyToMeetTargetIndicators,
      offTrackIndicators,
      farFromTargetIndicators
    },
    targetByGoal,
    geojson: geojsonRaw,
    provinceCoverage,
    details
  };
};

export const getDashboardDataset = (): DashboardDataset => {
  const workbookPath = resolvePublicExcelPath();
  const workbookMtimeMs = fs.existsSync(workbookPath) ? fs.statSync(workbookPath).mtimeMs : null;

  if (!cachedDataset || cachedDatasetMtimeMs !== workbookMtimeMs) {
    cachedDataset = buildDataset();
    cachedDatasetMtimeMs = workbookMtimeMs;
  }
  return cachedDataset;
};

export const getIndicatorDetail = (code: string): IndicatorDetail | null => {
  const dataset = getDashboardDataset();
  return dataset.details[code] ?? null;
};

export const getIndicatorCodes = (): string[] => getDashboardDataset().indicators.map((indicator) => indicator.code);

export const getGoalColor = (goal: number): string => SDG_GOAL_MAP[goal]?.color ?? '#5C6B76';
