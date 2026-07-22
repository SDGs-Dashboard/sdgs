import { IndicatorCatalogRecord } from './nisrCatalog';
import { LOCATION_ALIASES, PROVINCE_ALIASES, RWANDA_DISTRICTS, RWANDA_PROVINCES } from './rwandaLocations';

export interface TableExtractionPayload {
  report_name: string;
  report_year: string;
  table_number: string;
  table_title: string;
  page_number: string;
  suggested_sdg_indicator: string;
  confidence_score: number;
  explanation: string;
  rows: Array<{
    indicator_code: string;
    series: string;
    series_code: string;
    unit: string;
    location: string;
    province: string;
    district: string;
    sex: string;
    age_group: string;
    time_period: string;
    value: string;
    source: string;
    report_name: string;
    table_number: string;
    page_number: string;
    notes: string;
  }>;
}

export const normalizeText = (value: unknown): string =>
  String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9.%/\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export const tokenize = (value: string): string[] =>
  Array.from(
    new Set(
      normalizeText(value)
        .split(' ')
        .map((token) => token.trim())
        .filter((token) => token.length > 2)
    )
  );

export const toTitle = (value: string): string =>
  value
    .split(' ')
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1).toLowerCase()}`)
    .join(' ');

export const parseNumberish = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  const cleaned = String(value).replaceAll(',', '').trim();
  if (!cleaned) {
    return null;
  }

  const numeric = Number(cleaned.replace('%', ''));
  return Number.isFinite(numeric) ? numeric : null;
};

export const inferUnit = (tableTitle: string, headers: string[]): string => {
  const combined = `${tableTitle} ${headers.join(' ')}`.toLowerCase();
  if (combined.includes('%') || combined.includes('percent') || combined.includes('percentage')) {
    return 'Percent';
  }
  if (combined.includes('rate')) {
    return 'Rate';
  }
  if (combined.includes('ratio')) {
    return 'Ratio';
  }
  if (combined.includes('number') || combined.includes('count') || combined.includes('households')) {
    return 'Number';
  }
  return '';
};

export const parseYearTokens = (value: string): string[] => {
  const matches = value.match(/\b(19|20)\d{2}(?:\/\d{2})?\b/g);
  return matches ? Array.from(new Set(matches)) : [];
};

export const coerceYear = (value: string): number | null => {
  const yearMatch = value.match(/\b(19|20)\d{2}\b/);
  if (!yearMatch) {
    return null;
  }
  const numeric = Number(yearMatch[0]);
  if (numeric < 1900 || numeric > new Date().getFullYear() + 1) {
    return null;
  }
  return numeric;
};

export const normalizeProvince = (value: string): string => {
  const normalized = normalizeText(value);
  return PROVINCE_ALIASES[normalized] ?? RWANDA_PROVINCES.find((item) => normalizeText(item) === normalized) ?? '';
};

export const normalizeDistrict = (value: string): string => {
  const normalized = normalizeText(value);
  const direct = RWANDA_DISTRICTS.find((item) => normalizeText(item) === normalized);
  return direct ?? '';
};

export const normalizeLocation = (value: string): string => {
  const normalized = normalizeText(value);
  return LOCATION_ALIASES[normalized] ?? value.trim();
};

export const buildLocationKey = (record: {
  indicator_code: string;
  series_code: string;
  location: string;
  province: string;
  district: string;
  sex: string;
  age_group: string;
}): string =>
  [
    record.indicator_code,
    record.series_code,
    normalizeText(record.location),
    normalizeText(record.province),
    normalizeText(record.district),
    normalizeText(record.sex),
    normalizeText(record.age_group)
  ].join('|');

const normalizeTableReference = (value: string): string =>
  value
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/\btable\s*/g, 'table ')
    .replace(/\s*\.\s*/g, '.')
    .replace(/[^a-z0-9.:()\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const extractTableReferenceTokens = (value: string): string[] => {
  const normalized = normalizeTableReference(value);
  if (!normalized) {
    return [];
  }

  const variants = new Set<string>([normalized]);
  const numberMatch = normalized.match(/\btable\s+(\d+(?:\.\d+)*)\b/);
  if (numberMatch?.[1]) {
    variants.add(`table ${numberMatch[1]}`);
    variants.add(numberMatch[1]);
  }

  return Array.from(variants);
};

export const compareIndicatorScore = (
  candidate: IndicatorCatalogRecord,
  tableTitle: string,
  tableReference: string | null,
  headers: string[],
  relatedIndicator: string | null,
  rulesBoost: number
): { score: number; explanation: string } => {
  if (relatedIndicator && candidate.indicator_code === relatedIndicator) {
    return { score: 0.98, explanation: 'Admin provided a related SDG indicator for this report.' };
  }

  const extractedReferenceTokens = Array.from(
    new Set([...(tableReference ? extractTableReferenceTokens(tableReference) : []), ...extractTableReferenceTokens(tableTitle)])
  );
  const matchedReferenceToken =
    extractedReferenceTokens.find((token) => candidate.table_reference_tokens.includes(token)) ||
    candidate.table_references.find((reference) => {
      const normalizedReference = normalizeTableReference(reference);
      return extractedReferenceTokens.some((token) => normalizedReference.includes(token) || token.includes(normalizedReference));
    });

  if (matchedReferenceToken) {
    return {
      score: 0.995,
      explanation: `Matched source table reference: ${matchedReferenceToken}.`
    };
  }

  const tableTokens = tokenize([tableTitle, headers.join(' ')].join(' '));
  const candidateTokens = candidate.keywords;
  const overlap = tableTokens.filter((token) => candidateTokens.includes(token));
  const overlapRatio = tableTokens.length ? overlap.length / tableTokens.length : 0;
  const titleText = normalizeText(tableTitle);
  const bonus = normalizeText(candidate.indicator).includes(titleText) || titleText.includes(normalizeText(candidate.indicator)) ? 0.18 : 0;
  const score = Math.min(0.99, overlapRatio * 0.72 + bonus + rulesBoost);

  return {
    score,
    explanation: overlap.length
      ? `Matched title/header keywords: ${overlap.slice(0, 8).join(', ')}.`
      : 'No strong keyword overlap was found, so this mapping is low confidence.'
  };
};
