import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';

import { appendAuditLog, createId, readAdminDb, updateAdminDb, updateAdminDbAsync } from './db';
import { ADMIN_EXTRACTED_JSON_DIR, NISR_EXTRACTION_SCRIPT_PATH, REPORT_UPLOADS_DIR } from './constants';
import { getIndicatorCatalog, getIndicatorCatalogMap, IndicatorCatalogRecord } from './nisrCatalog';
import { appendOrUpdateWorkbookRecord, rebuildWorkbookFromApprovedRecords, WorkbookConflict } from './nisrWorkbook';
import {
  buildLocationKey,
  coerceYear,
  compareIndicatorScore,
  inferUnit,
  normalizeDistrict,
  normalizeLocation,
  normalizeProvince,
  normalizeText,
  parseNumberish,
  parseYearTokens,
  TableExtractionPayload
} from './nisrUtils';
import {
  AdminDatabase,
  ApprovedSdgDataRecord,
  DuplicateStatus,
  NisrExtractedTableRecord,
  NisrExtractedValueRecord,
  NisrFileType,
  NisrProcessingStatus,
  NisrReportRecord,
  ReviewStatus,
  SdgDataApprovalRecord,
  SdgIndicatorMappingRuleRecord
} from './types';

const LOW_CONFIDENCE_THRESHOLD = 0.72;
const CHANGE_WARNING_THRESHOLD = 0.35;
const DEFAULT_REVIEWER = 'admin';
const DEFAULT_AI_MODEL = process.env.OPENAI_MODEL?.trim() || 'gpt-4o';
const OPENAI_API_BASE = process.env.OPENAI_BASE_URL?.trim() || 'https://api.openai.com/v1';
const MAX_OPENAI_FILE_BYTES = 50 * 1024 * 1024;

interface RawExtractedTable {
  table_title: string;
  table_reference: string | null;
  page_number: number | null;
  sheet_name: string | null;
  cell_range: string | null;
  columns: string[];
  original_preview?: string[][];
  rows: Array<Record<string, unknown>>;
  sample_rows: Array<Record<string, unknown>>;
  warnings?: string[];
}

interface AiExtractedTablePayload extends TableExtractionPayload {
  headers: string[];
  original_preview: string[][];
  source_kind: 'table' | 'figure' | 'sheet' | 'unknown';
  warnings: string[];
}

interface AiExtractionDocumentPayload {
  report_name: string;
  report_year: string;
  extraction_notes: string[];
  tables: AiExtractedTablePayload[];
}

interface SuggestionResult {
  indicator: IndicatorCatalogRecord | null;
  confidenceScore: number;
  explanation: string;
}

export interface UploadReportInput {
  fileName: string;
  fileBuffer: Buffer;
  mimeType: string;
  reportName: string;
  reportYear: number | null;
  sourceUrl: string | null;
  tableOrFigureNumber: string | null;
  relatedSdgIndicator: string | null;
  uploadedBy?: string;
}

export interface ExtractionResultSummary {
  report: NisrReportRecord;
  extractedTables: NisrExtractedTableRecord[];
  extractedValues: NisrExtractedValueRecord[];
}

const safeString = (value: unknown): string => String(value ?? '').trim();

const deriveFileType = (fileName: string): NisrFileType => {
  const extension = path.extname(fileName).toLowerCase();
  if (extension === '.pdf') {
    return 'pdf';
  }
  if (extension === '.csv') {
    return 'csv';
  }
  return 'excel';
};

const sanitizeFileName = (fileName: string): string =>
  fileName.replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+/, '');

const parseJsonResponse = <T>(value: string): T => JSON.parse(value) as T;

const buildIndicatorReference = (limit = 80): string =>
  getIndicatorCatalog()
    .slice(0, limit)
    .map(
      (candidate) =>
        `${candidate.indicator_code} | ${candidate.indicator} | unit: ${candidate.unit || 'unknown'} | series: ${candidate.series || 'unknown'} | source refs: ${
          candidate.table_references.slice(0, 2).join(' || ') || 'none'
        }`
    )
    .join('\n');

const buildOpenAiExtractionSchema = (): Record<string, unknown> => ({
  type: 'object',
  additionalProperties: false,
  required: ['report_name', 'report_year', 'extraction_notes', 'tables'],
  properties: {
    report_name: { type: 'string' },
    report_year: { type: 'string' },
    extraction_notes: {
      type: 'array',
      items: { type: 'string' }
    },
    tables: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'report_name',
          'report_year',
          'table_number',
          'table_title',
          'page_number',
          'suggested_sdg_indicator',
          'confidence_score',
          'explanation',
          'headers',
          'original_preview',
          'source_kind',
          'warnings',
          'rows'
        ],
        properties: {
          report_name: { type: 'string' },
          report_year: { type: 'string' },
          table_number: { type: 'string' },
          table_title: { type: 'string' },
          page_number: { type: 'string' },
          suggested_sdg_indicator: { type: 'string' },
          confidence_score: { type: 'integer', minimum: 0, maximum: 100 },
          explanation: { type: 'string' },
          headers: {
            type: 'array',
            items: { type: 'string' }
          },
          original_preview: {
            type: 'array',
            items: {
              type: 'array',
              items: { type: 'string' }
            }
          },
          source_kind: {
            type: 'string',
            enum: ['table', 'figure', 'sheet', 'unknown']
          },
          warnings: {
            type: 'array',
            items: { type: 'string' }
          },
          rows: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: [
                'indicator_code',
                'series',
                'series_code',
                'unit',
                'location',
                'province',
                'district',
                'sex',
                'age_group',
                'time_period',
                'value',
                'source',
                'report_name',
                'table_number',
                'page_number',
                'notes'
              ],
              properties: {
                indicator_code: { type: 'string' },
                series: { type: 'string' },
                series_code: { type: 'string' },
                unit: { type: 'string' },
                location: { type: 'string' },
                province: { type: 'string' },
                district: { type: 'string' },
                sex: { type: 'string' },
                age_group: { type: 'string' },
                time_period: { type: 'string' },
                value: { type: 'string' },
                source: { type: 'string' },
                report_name: { type: 'string' },
                table_number: { type: 'string' },
                page_number: { type: 'string' },
                notes: { type: 'string' }
              }
            }
          }
        }
      }
    }
  }
});

const buildOpenAiFilePrompt = (report: NisrReportRecord, tableSelection: string | null): string =>
  [
    'Extract structured SDG-ready data from this Rwanda NISR report.',
    'Return only data that you can read directly from the file.',
    'If the file is a scanned PDF, use the page images as well as text.',
    'Prefer precision over recall. If anything is uncertain, keep confidence low and add a warning.',
    'Treat each detected table or figure as a separate extraction block.',
    'Do not invent indicator codes. Leave suggested_sdg_indicator and row.indicator_code empty when unsure.',
    'Use Rwanda administrative names when possible. If not certain, preserve the visible text in location and leave province/district blank.',
    'Detect units like percent, number, rate, and ratio from titles, headers, or notes.',
    'Detect years from column headers, row labels, titles, or nearby captions.',
    'Copy visible values exactly into rows, normalized as strings.',
    'Keep original_preview compact: include the header row and a few representative body rows only.',
    `Report metadata hint - name: ${report.report_name}`,
    `Report metadata hint - year: ${report.report_year ?? ''}`,
    `Report metadata hint - source URL: ${report.source_url ?? ''}`,
    `Report metadata hint - related indicator: ${report.related_sdg_indicator ?? ''}`,
    `Requested table or figure selection: ${tableSelection || 'extract all readable tables and figures'}`,
    'Candidate SDG indicators (code | name | unit | series):',
    buildIndicatorReference(),
    'If a table or figure is descriptive only and has no usable numeric rows, include it with warnings and an empty rows array.'
  ].join('\n');

const extractResponseText = (payload: any): string | null => {
  if (typeof payload?.output_text === 'string' && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  if (!Array.isArray(payload?.output)) {
    return null;
  }

  for (const item of payload.output) {
    if (!Array.isArray(item?.content)) {
      continue;
    }
    for (const content of item.content) {
      if (typeof content?.text === 'string' && content.text.trim()) {
        return content.text.trim();
      }
    }
  }

  return null;
};

const uploadFileToOpenAi = async (report: NisrReportRecord, absoluteReportPath: string): Promise<string> => {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not configured.');
  }

  const fileBuffer = fs.readFileSync(absoluteReportPath);
  if (fileBuffer.byteLength > MAX_OPENAI_FILE_BYTES) {
    throw new Error('Report file is too large for direct AI extraction. Please upload a file under 50 MB.');
  }

  const form = new FormData();
  form.set('purpose', 'user_data');
  form.set('file', new Blob([fileBuffer], { type: report.mime_type || 'application/octet-stream' }), report.original_file_name);

  const response = await fetch(`${OPENAI_API_BASE}/files`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`
    },
    body: form
  });

  if (!response.ok) {
    throw new Error(`OpenAI file upload failed with status ${response.status}.`);
  }

  const payload = (await response.json()) as { id?: string };
  if (!payload.id) {
    throw new Error('OpenAI file upload did not return a file id.');
  }

  return payload.id;
};

const deleteOpenAiFile = async (fileId: string): Promise<void> => {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey || !fileId) {
    return;
  }

  try {
    await fetch(`${OPENAI_API_BASE}/files/${fileId}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${apiKey}`
      }
    });
  } catch {
    // Best effort cleanup only.
  }
};

const getDefaultMappingRules = (): SdgIndicatorMappingRuleRecord[] => {
  const now = new Date().toISOString();
  return [
    {
      id: 'rule_poverty',
      pattern: 'poverty',
      pattern_type: 'contains',
      indicator_code: '1.2.1',
      series: null,
      series_code: null,
      unit: 'Percent',
      explanation: 'Poverty tables commonly map to SDG indicator 1.2.1.',
      priority: 90,
      active: true,
      created_at: now,
      updated_at: now
    },
    {
      id: 'rule_electricity',
      pattern: 'electricity',
      pattern_type: 'contains',
      indicator_code: '7.1.1',
      series: null,
      series_code: null,
      unit: 'Percent',
      explanation: 'Electricity access tables typically map to SDG indicator 7.1.1.',
      priority: 80,
      active: true,
      created_at: now,
      updated_at: now
    },
    {
      id: 'rule_sanitation',
      pattern: 'sanitation',
      pattern_type: 'contains',
      indicator_code: '6.2.1',
      series: null,
      series_code: null,
      unit: 'Percent',
      explanation: 'Sanitation access tables typically map to SDG indicator 6.2.1.',
      priority: 80,
      active: true,
      created_at: now,
      updated_at: now
    }
  ];
};

const ensureMappingRules = (db: AdminDatabase): void => {
  if (!db.sdg_indicator_mapping_rules.length) {
    db.sdg_indicator_mapping_rules = getDefaultMappingRules();
  }
};

const getReportById = (db: AdminDatabase, reportId: string): NisrReportRecord => {
  const report = db.nisr_reports.find((entry) => entry.id === reportId);
  if (!report) {
    throw new Error('Report not found.');
  }
  return report;
};

const getLatestApprovedValue = (db: AdminDatabase, value: NisrExtractedValueRecord): ApprovedSdgDataRecord | null => {
  const locationKey = buildLocationKey({
    indicator_code: value.indicator_code,
    series_code: value.series_code,
    location: value.location,
    province: value.province,
    district: value.district,
    sex: value.sex,
    age_group: value.age_group
  });

  const matches = db.approved_sdg_data
    .filter(
      (entry) =>
        entry.time_period === value.time_period &&
        buildLocationKey({
          indicator_code: entry.indicator_code,
          series_code: entry.series_code,
          location: entry.location,
          province: entry.province,
          district: entry.district,
          sex: entry.sex,
          age_group: entry.age_group
        }) === locationKey
    )
    .sort((left, right) => right.approved_at.localeCompare(left.approved_at));

  return matches[0] ?? null;
};

const getRulesBoost = (rules: SdgIndicatorMappingRuleRecord[], tableTitle: string, indicatorCode: string): number => {
  const normalizedTitle = normalizeText(tableTitle);
  const matchingRule = rules
    .filter((rule) => rule.active && rule.indicator_code === indicatorCode)
    .sort((left, right) => right.priority - left.priority)
    .find((rule) => {
      const pattern = normalizeText(rule.pattern);
      if (rule.pattern_type === 'exact') {
        return normalizedTitle === pattern;
      }
      if (rule.pattern_type === 'regex') {
        try {
          return new RegExp(rule.pattern, 'i').test(tableTitle);
        } catch {
          return false;
        }
      }
      return normalizedTitle.includes(pattern);
    });

  return matchingRule ? Math.min(0.2, matchingRule.priority / 1000) : 0;
};

const suggestIndicator = (
  tableTitle: string,
  tableReference: string | null,
  headers: string[],
  relatedIndicator: string | null,
  rules: SdgIndicatorMappingRuleRecord[]
): SuggestionResult => {
  const candidates = getIndicatorCatalog();
  let best: SuggestionResult = {
    indicator: null,
    confidenceScore: 0,
    explanation: 'No mapping suggestion available.'
  };

  for (const candidate of candidates) {
    const rulesBoost = getRulesBoost(rules, tableTitle, candidate.indicator_code);
    const comparison = compareIndicatorScore(candidate, tableTitle, tableReference, headers, relatedIndicator, rulesBoost);
    if (comparison.score > best.confidenceScore) {
      best = {
        indicator: candidate,
        confidenceScore: comparison.score,
        explanation: comparison.explanation
      };
    }
  }

  return best;
};

const guessDimensionColumns = (headers: string[]): {
  locationColumn: string | null;
  sexColumn: string | null;
  ageColumn: string | null;
  numericColumns: string[];
} => {
  let locationColumn: string | null = null;
  let sexColumn: string | null = null;
  let ageColumn: string | null = null;

  const excludedNumericTokens = ['lower', 'upper', 'change', 'difference', 'bound', 'interval'];

  for (const header of headers) {
    const normalized = normalizeText(header);
    if (!locationColumn && ['location', 'area', 'province', 'district', 'region', 'ref area'].some((token) => normalized.includes(token))) {
      locationColumn = header;
    }
    if (!sexColumn && normalized.includes('sex')) {
      sexColumn = header;
    }
    if (!ageColumn && normalized.includes('age')) {
      ageColumn = header;
    }
  }

  if (!locationColumn && headers.length) {
    locationColumn = headers[0];
  }

  const numericColumns = headers.filter((header, index) => {
    const normalized = normalizeText(header);
    if (header === locationColumn || header === sexColumn || header === ageColumn) {
      return false;
    }
    if (excludedNumericTokens.some((token) => normalized.includes(token))) {
      return false;
    }
    return index > 0;
  });

  return { locationColumn, sexColumn, ageColumn, numericColumns };
};

const buildHeuristicRows = (
  table: RawExtractedTable,
  report: NisrReportRecord,
  suggestion: SuggestionResult
): TableExtractionPayload => {
  const indicator = suggestion.indicator;
  const { locationColumn, sexColumn, ageColumn, numericColumns } = guessDimensionColumns(table.columns);
  const fallbackUnit = indicator?.unit || inferUnit(table.table_title, table.columns);
  const rows: TableExtractionPayload['rows'] = [];
  const reportYear = report.report_year ? String(report.report_year) : '';

  for (const row of table.rows) {
    const rowValues = Object.values(row);
    const joined = rowValues.map((value) => safeString(value)).join(' ').trim();
    if (!joined || normalizeText(joined).startsWith('source')) {
      continue;
    }

    const locationRaw = locationColumn ? safeString(row[locationColumn]) : '';
    const province = normalizeProvince(locationRaw);
    const district = normalizeDistrict(locationRaw);
    const location = normalizeLocation(locationRaw || province || district || 'Rwanda');
    const sex = sexColumn ? safeString(row[sexColumn]) : '';
    const ageGroup = ageColumn ? safeString(row[ageColumn]) : '';

    for (const column of numericColumns) {
      const numericValue = parseNumberish(row[column]);
      if (numericValue === null) {
        continue;
      }

      const headerYears = parseYearTokens(column);
      const titleYears = parseYearTokens(table.table_title);
      const timePeriod = headerYears[0] || reportYear || titleYears[0] || '';
      const notes = column !== timePeriod ? `Extracted from column: ${column}` : '';

      rows.push({
        indicator_code: indicator?.indicator_code || report.related_sdg_indicator || '',
        series: indicator?.series || table.table_title,
        series_code: indicator?.series_code || `NISR_${(indicator?.indicator_code || 'UNMAPPED').replaceAll('.', '_')}`,
        unit: fallbackUnit,
        location,
        province,
        district,
        sex,
        age_group: ageGroup,
        time_period: timePeriod,
        value: String(numericValue),
        source: 'NISR',
        report_name: report.report_name,
        table_number: table.table_reference || '',
        page_number: table.page_number === null ? '' : String(table.page_number),
        notes
      });
    }
  }

  return {
    report_name: report.report_name,
    report_year: reportYear,
    table_number: table.table_reference || '',
    table_title: table.table_title,
    page_number: table.page_number === null ? '' : String(table.page_number),
    suggested_sdg_indicator: indicator?.indicator_code || report.related_sdg_indicator || '',
    confidence_score: Math.round(suggestion.confidenceScore * 100),
    explanation: suggestion.explanation,
    rows
  };
};

const buildAiPrompt = (table: RawExtractedTable, report: NisrReportRecord, candidates: IndicatorCatalogRecord[]): string => {
  const preview = JSON.stringify(
    {
      table_title: table.table_title,
      table_number: table.table_reference,
      page_number: table.page_number,
      headers: table.columns,
      sample_rows: table.sample_rows
    },
    null,
    2
  );

  const candidateText = candidates
    .slice(0, 20)
    .map((candidate) => `${candidate.indicator_code}: ${candidate.indicator}`)
    .join('\n');

  return [
    'Extract SDG-ready structured rows from this single NISR table preview.',
    'Prefer accuracy over recall. If uncertain, keep confidence low and leave indicator_code empty.',
    'Do not invent values, years, locations, or units.',
    `Report name: ${report.report_name}`,
    `Report year: ${report.report_year ?? ''}`,
    `Related indicator hint: ${report.related_sdg_indicator ?? ''}`,
    'Candidate indicators:',
    candidateText,
    'Expected JSON schema:',
    '{',
    '"report_name": "",',
    '"report_year": "",',
    '"table_number": "",',
    '"table_title": "",',
    '"page_number": "",',
    '"suggested_sdg_indicator": "",',
    '"confidence_score": 0,',
    '"explanation": "",',
    '"rows": []',
    '}',
    'Table preview:',
    preview
  ].join('\n');
};

const buildTableExtractionSchema = (): Record<string, unknown> => ({
  type: 'object',
  additionalProperties: false,
  required: [
    'report_name',
    'report_year',
    'table_number',
    'table_title',
    'page_number',
    'suggested_sdg_indicator',
    'confidence_score',
    'explanation',
    'rows'
  ],
  properties: {
    report_name: { type: 'string' },
    report_year: { type: 'string' },
    table_number: { type: 'string' },
    table_title: { type: 'string' },
    page_number: { type: 'string' },
    suggested_sdg_indicator: { type: 'string' },
    confidence_score: { type: 'integer', minimum: 0, maximum: 100 },
    explanation: { type: 'string' },
    rows: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'indicator_code',
          'series',
          'series_code',
          'unit',
          'location',
          'province',
          'district',
          'sex',
          'age_group',
          'time_period',
          'value',
          'source',
          'report_name',
          'table_number',
          'page_number',
          'notes'
        ],
        properties: {
          indicator_code: { type: 'string' },
          series: { type: 'string' },
          series_code: { type: 'string' },
          unit: { type: 'string' },
          location: { type: 'string' },
          province: { type: 'string' },
          district: { type: 'string' },
          sex: { type: 'string' },
          age_group: { type: 'string' },
          time_period: { type: 'string' },
          value: { type: 'string' },
          source: { type: 'string' },
          report_name: { type: 'string' },
          table_number: { type: 'string' },
          page_number: { type: 'string' },
          notes: { type: 'string' }
        }
      }
    }
  }
});

const callOpenAiTableExtraction = async (
  table: RawExtractedTable,
  report: NisrReportRecord,
  topCandidates: IndicatorCatalogRecord[]
): Promise<TableExtractionPayload | null> => {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return null;
  }

  const response = await fetch(`${OPENAI_API_BASE}/responses`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: DEFAULT_AI_MODEL,
      input: [
        {
          role: 'system',
          content: [
            {
              type: 'input_text',
              text: 'You extract highly accurate structured SDG data from Rwanda NISR tables. Do not invent values.'
            }
          ]
        },
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: buildAiPrompt(table, report, topCandidates)
            }
          ]
        }
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'nisr_table_extraction',
          schema: buildTableExtractionSchema(),
          strict: true
        }
      }
    })
  });

  if (!response.ok) {
    return null;
  }

  const payload = await response.json();
  const content = extractResponseText(payload);
  if (!content) {
    return null;
  }

  return parseJsonResponse<TableExtractionPayload>(content);
};

const callOpenAiReportExtraction = async (
  report: NisrReportRecord,
  tableSelection: string | null
): Promise<AiExtractionDocumentPayload | null> => {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return null;
  }

  const absoluteReportPath = path.join(process.cwd(), report.stored_file_path);
  let fileId: string | null = null;

  try {
    fileId = await uploadFileToOpenAi(report, absoluteReportPath);

    const response = await fetch(`${OPENAI_API_BASE}/responses`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: DEFAULT_AI_MODEL,
        input: [
          {
            role: 'system',
            content: [
              {
                type: 'input_text',
                text:
                  'You extract highly accurate structured SDG data from Rwanda NISR reports. Prefer precision over recall. Return only JSON matching the supplied schema.'
              }
            ]
          },
          {
            role: 'user',
            content: [
              {
                type: 'input_text',
                text: buildOpenAiFilePrompt(report, tableSelection)
              },
              {
                type: 'input_file',
                file_id: fileId,
                detail: 'high'
              }
            ]
          }
        ],
        text: {
          format: {
            type: 'json_schema',
            name: 'nisr_report_extraction',
            schema: buildOpenAiExtractionSchema(),
            strict: true
          }
        }
      })
    });

    if (!response.ok) {
      const failureText = await response.text();
      throw new Error(`OpenAI extraction failed with status ${response.status}: ${failureText}`);
    }

    const payload = await response.json();
    const content = extractResponseText(payload);
    if (!content) {
      throw new Error('OpenAI extraction response did not contain structured output text.');
    }

    return parseJsonResponse<AiExtractionDocumentPayload>(content);
  } finally {
    if (fileId) {
      await deleteOpenAiFile(fileId);
    }
  }
};

const validateExtractedValue = (
  db: AdminDatabase,
  row: NisrExtractedValueRecord
): {
  issues: string[];
  duplicateStatus: DuplicateStatus;
  duplicateWithRecordId: string | null;
  changeWarning: string | null;
  overwriteWarning: string | null;
} => {
  const issues: string[] = [];
  const catalogMap = getIndicatorCatalogMap();
  const catalog = catalogMap.get(row.indicator_code);

  if (!row.indicator_code || !catalog) {
    issues.push('Indicator code is missing or does not exist in dashboard metadata.');
  }
  if (row.value === null) {
    issues.push('Value is missing or not numeric.');
  }
  if (!coerceYear(row.time_period)) {
    issues.push('Time period is missing or invalid.');
  }
  if (!row.location) {
    issues.push('Location is required.');
  }
  if (row.province && !normalizeProvince(row.province)) {
    issues.push('Province name does not match Rwanda administrative names.');
  }
  if (row.district && !normalizeDistrict(row.district)) {
    issues.push('District name does not match Rwanda administrative names.');
  }

  const latestApproved = getLatestApprovedValue(db, row);
  let duplicateStatus: DuplicateStatus = 'none';
  let duplicateWithRecordId: string | null = null;
  let changeWarning: string | null = null;
  let overwriteWarning: string | null = null;

  if (latestApproved) {
    duplicateWithRecordId = latestApproved.id;
    if (latestApproved.value === row.value) {
      duplicateStatus = 'exact_match';
      issues.push('This value duplicates an already approved record.');
    } else {
      duplicateStatus = 'conflict';
      overwriteWarning = 'An approved value already exists for this indicator, location, and time period. Approval will require overwrite confirmation.';
      const denominator = Math.max(Math.abs(latestApproved.value), 1);
      const delta = Math.abs((row.value ?? 0) - latestApproved.value) / denominator;
      if (delta >= CHANGE_WARNING_THRESHOLD) {
        changeWarning = `New value differs from the latest approved value by ${Math.round(delta * 100)}%.`;
      }
    }
  }

  return { issues, duplicateStatus, duplicateWithRecordId, changeWarning, overwriteWarning };
};

const buildValueRecord = (
  db: AdminDatabase,
  report: NisrReportRecord,
  tableRecord: NisrExtractedTableRecord,
  payloadRow: TableExtractionPayload['rows'][number],
  tablePayload: TableExtractionPayload,
  aiPayloadJson: string | null
): NisrExtractedValueRecord => {
  const catalog = getIndicatorCatalogMap().get(payloadRow.indicator_code);
  const { goal, target } = catalog
    ? { goal: catalog.goal || null, target: catalog.target || null }
    : payloadRow.indicator_code
      ? { goal: payloadRow.indicator_code.split('.')[0] || null, target: payloadRow.indicator_code.split('.').slice(0, 2).join('.') || null }
      : { goal: null, target: null };

  const valueRecord: NisrExtractedValueRecord = {
    id: createId('nisr_value'),
    report_id: report.id,
    extracted_table_id: tableRecord.id,
    goal,
    target,
    indicator: catalog?.indicator || null,
    indicator_code: payloadRow.indicator_code,
    series: payloadRow.series,
    series_code: payloadRow.series_code,
    unit: payloadRow.unit,
    location: payloadRow.location,
    province: payloadRow.province,
    district: payloadRow.district,
    sex: payloadRow.sex,
    age_group: payloadRow.age_group,
    time_period: payloadRow.time_period,
    value: parseNumberish(payloadRow.value),
    data_source: payloadRow.source,
    report_name: payloadRow.report_name || report.report_name,
    table_number: payloadRow.table_number || tablePayload.table_number || null,
    page_number: payloadRow.page_number ? Number(payloadRow.page_number) : tableRecord.page_number,
    source_url: report.source_url,
    notes: payloadRow.notes,
    confidence_score: tablePayload.confidence_score,
    suggestion_explanation: tablePayload.explanation,
    validation_issues: [],
    duplicate_status: 'none',
    duplicate_with_record_id: null,
    change_warning: null,
    overwrite_warning: null,
    review_status: 'pending',
    needs_review: false,
    ai_payload_json: aiPayloadJson,
    original_row_json: JSON.stringify(payloadRow),
    last_edited_at: new Date().toISOString(),
    last_edited_by: null
  };

  const validation = validateExtractedValue(db, valueRecord);
  valueRecord.validation_issues = validation.issues;
  valueRecord.duplicate_status = validation.duplicateStatus;
  valueRecord.duplicate_with_record_id = validation.duplicateWithRecordId;
  valueRecord.change_warning = validation.changeWarning;
  valueRecord.overwrite_warning = validation.overwriteWarning;
  valueRecord.needs_review =
    valueRecord.confidence_score / 100 < LOW_CONFIDENCE_THRESHOLD ||
    Boolean(valueRecord.validation_issues.length) ||
    valueRecord.duplicate_status !== 'none';
  if (valueRecord.needs_review) {
    valueRecord.review_status = 'pending';
  }

  return valueRecord;
};

const mapRawTableToStructuredData = async (
  db: AdminDatabase,
  report: NisrReportRecord,
  table: RawExtractedTable
): Promise<{ tablePayload: TableExtractionPayload; aiPayloadJson: string | null }> => {
  ensureMappingRules(db);
  const suggestion = suggestIndicator(
    table.table_title,
    table.table_reference,
    table.columns,
    report.related_sdg_indicator,
    db.sdg_indicator_mapping_rules
  );

  const topCandidates = getIndicatorCatalog()
    .map((candidate) => ({
      candidate,
      score: compareIndicatorScore(candidate, table.table_title, table.table_reference, table.columns, report.related_sdg_indicator, 0).score
    }))
    .sort((left, right) => right.score - left.score)
    .slice(0, 12)
    .map((entry) => entry.candidate);

  const aiPayload = await callOpenAiTableExtraction(table, report, topCandidates);
  if (aiPayload) {
    return { tablePayload: aiPayload, aiPayloadJson: JSON.stringify(aiPayload) };
  }

  return {
    tablePayload: buildHeuristicRows(table, report, suggestion),
    aiPayloadJson: null
  };
};

const normalizeAiRows = (
  rows: AiExtractedTablePayload['rows'],
  report: NisrReportRecord,
  table: AiExtractedTablePayload
): TableExtractionPayload['rows'] =>
  rows.map((row) => ({
    indicator_code: safeString(row.indicator_code),
    series: safeString(row.series) || table.table_title,
    series_code:
      safeString(row.series_code) ||
      `NISR_${(safeString(row.indicator_code) || safeString(table.suggested_sdg_indicator) || 'UNMAPPED').replaceAll('.', '_')}`,
    unit: safeString(row.unit),
    location: safeString(row.location),
    province: normalizeProvince(safeString(row.province)),
    district: normalizeDistrict(safeString(row.district)),
    sex: safeString(row.sex),
    age_group: safeString(row.age_group),
    time_period: safeString(row.time_period),
    value: safeString(row.value),
    source: safeString(row.source) || 'NISR',
    report_name: safeString(row.report_name) || report.report_name,
    table_number: safeString(row.table_number) || table.table_number,
    page_number: safeString(row.page_number) || table.page_number,
    notes: safeString(row.notes)
  }));

const normalizeAiTablePayload = (report: NisrReportRecord, table: AiExtractedTablePayload): AiExtractedTablePayload => ({
  report_name: safeString(table.report_name) || report.report_name,
  report_year: safeString(table.report_year) || String(report.report_year ?? ''),
  table_number: safeString(table.table_number),
  table_title: safeString(table.table_title) || 'Untitled extraction',
  page_number: safeString(table.page_number),
  suggested_sdg_indicator: safeString(table.suggested_sdg_indicator),
  confidence_score: Math.max(0, Math.min(100, Number(table.confidence_score) || 0)),
  explanation: safeString(table.explanation) || 'Extracted with AI file input.',
  headers: Array.isArray(table.headers) ? table.headers.map((header) => safeString(header)).filter(Boolean) : [],
  original_preview: Array.isArray(table.original_preview)
    ? table.original_preview.map((row) => row.map((cell) => safeString(cell)))
    : [],
  source_kind:
    table.source_kind === 'table' || table.source_kind === 'figure' || table.source_kind === 'sheet' ? table.source_kind : 'unknown',
  warnings: Array.isArray(table.warnings) ? table.warnings.map((warning) => safeString(warning)).filter(Boolean) : [],
  rows: normalizeAiRows(Array.isArray(table.rows) ? table.rows : [], report, table)
});

const buildRawRowsFromPreview = (headers: string[], rows: TableExtractionPayload['rows']): Array<Record<string, string>> => {
  const previewHeaders = headers.length ? headers : ['Location', 'Time Period', 'Value'];
  return rows.map((row) =>
    previewHeaders.reduce<Record<string, string>>((accumulator, header, index) => {
      const normalizedHeader = normalizeText(header);
      if (normalizedHeader.includes('location') || normalizedHeader.includes('area') || normalizedHeader.includes('district')) {
        accumulator[header] = row.location || row.district || row.province;
      } else if (normalizedHeader.includes('year') || normalizedHeader.includes('time')) {
        accumulator[header] = row.time_period;
      } else if (index === previewHeaders.length - 1) {
        accumulator[header] = row.value;
      } else {
        accumulator[header] = '';
      }
      return accumulator;
    }, {})
  );
};

const buildExtractionSummary = (
  engine: string,
  extractedTables: NisrExtractedTableRecord[],
  extractedValues: NisrExtractedValueRecord[],
  notes: string[] = []
): string =>
  [
    `Engine: ${engine}`,
    `Tables: ${extractedTables.length}`,
    `Rows: ${extractedValues.length}`,
    notes.length ? `Notes: ${notes.join(' | ')}` : null
  ]
    .filter(Boolean)
    .join(' • ');

const runExtractionScript = (report: NisrReportRecord, tableSelection: string | null): RawExtractedTable[] => {
  const absoluteReportPath = path.join(process.cwd(), report.stored_file_path);
  const stdout = execFileSync('python', [NISR_EXTRACTION_SCRIPT_PATH, absoluteReportPath, tableSelection || ''], {
    cwd: process.cwd(),
    encoding: 'utf-8'
  });
  const parsed = parseJsonResponse<{ tables: RawExtractedTable[] }>(stdout);
  return Array.isArray(parsed.tables) ? parsed.tables : [];
};

export const saveUploadedReport = (input: UploadReportInput): NisrReportRecord => {
  const reportId = createId('nisr_report');
  const sanitizedFileName = sanitizeFileName(input.fileName);
  const storedRelativePath = path.join('uploads', 'reports', `${reportId}_${sanitizedFileName}`);
  const absolutePath = path.join(process.cwd(), storedRelativePath);

  fs.mkdirSync(REPORT_UPLOADS_DIR, { recursive: true });
  fs.writeFileSync(absolutePath, input.fileBuffer);

  return updateAdminDb((db) => {
    ensureMappingRules(db);
    const report: NisrReportRecord = {
      id: reportId,
      report_name: input.reportName || sanitizedFileName.replace(path.extname(sanitizedFileName), ''),
      report_year: input.reportYear,
      file_type: deriveFileType(input.fileName),
      mime_type: input.mimeType,
      original_file_name: input.fileName,
      stored_file_path: storedRelativePath.replaceAll('\\', '/'),
      file_size_bytes: input.fileBuffer.byteLength,
      upload_date: new Date().toISOString(),
      uploaded_by: input.uploadedBy || DEFAULT_REVIEWER,
      source_url: input.sourceUrl,
      table_or_figure_number: input.tableOrFigureNumber,
      related_sdg_indicator: input.relatedSdgIndicator,
      processing_status: 'uploaded',
      extraction_engine: null,
      extraction_error: null,
      extraction_started_at: null,
      extraction_completed_at: null,
      extraction_summary: null,
      notes: null
    };

    db.nisr_reports.unshift(report);
    appendAuditLog(db, {
      actor: report.uploaded_by,
      action: 'nisr_report_uploaded',
      entity_type: 'report',
      entity_id: report.id,
      metadata: {
        file_type: report.file_type,
        report_year: report.report_year ?? 0
      }
    });
    return report;
  });
};

export const getNisrReports = (): NisrReportRecord[] =>
  readAdminDb().nisr_reports.slice().sort((left, right) => right.upload_date.localeCompare(left.upload_date));

export const getNisrReportDetail = (reportId: string): {
  report: NisrReportRecord;
  tables: NisrExtractedTableRecord[];
  values: NisrExtractedValueRecord[];
} => {
  const db = readAdminDb();
  const report = getReportById(db, reportId);
  return {
    report,
    tables: db.nisr_extracted_tables.filter((table) => table.report_id === reportId),
    values: db.nisr_extracted_values.filter((value) => value.report_id === reportId)
  };
};

export const deleteNisrReport = (
  reportId: string,
  deletedBy = DEFAULT_REVIEWER
): {
  deletedReportId: string;
  removedApprovedCount: number;
  removedExtractedValueCount: number;
  removedExtractedTableCount: number;
} =>
  updateAdminDb((db) => {
    const report = getReportById(db, reportId);
    const reportFilePath = path.join(process.cwd(), report.stored_file_path);
    const extractedJsonPath = path.join(process.cwd(), 'data', 'admin', 'extracted_json', `${reportId}.json`);
    const tableIds = new Set(
      db.nisr_extracted_tables.filter((table) => table.report_id === reportId).map((table) => table.id)
    );
    const removedExtractedTableCount = tableIds.size;
    const removedExtractedValueCount = db.nisr_extracted_values.filter((value) => value.report_id === reportId).length;
    const removedApprovedCount = db.approved_sdg_data.filter((record) => record.report_id === reportId).length;

    db.nisr_reports = db.nisr_reports.filter((entry) => entry.id !== reportId);
    db.nisr_extracted_tables = db.nisr_extracted_tables.filter((table) => table.report_id !== reportId);
    db.nisr_extracted_values = db.nisr_extracted_values.filter((value) => value.report_id !== reportId);
    db.sdg_data_approvals = db.sdg_data_approvals.filter((approval) => approval.report_id !== reportId);
    db.sdg_data_version_history = db.sdg_data_version_history.filter((entry) => entry.report_id !== reportId);
    db.source_log = db.source_log.filter((entry) => entry.report_id !== reportId);
    db.approved_sdg_data = db.approved_sdg_data.filter((record) => record.report_id !== reportId);

    appendAuditLog(db, {
      actor: deletedBy,
      action: 'nisr_report_deleted',
      entity_type: 'report',
      entity_id: reportId,
      metadata: {
        removed_approved_count: removedApprovedCount,
        removed_extracted_table_count: removedExtractedTableCount,
        removed_extracted_value_count: removedExtractedValueCount
      }
    });

    const indicatorLookup = getIndicatorCatalogMap();
    rebuildWorkbookFromApprovedRecords(db.approved_sdg_data, indicatorLookup);

    if (fs.existsSync(reportFilePath)) {
      fs.unlinkSync(reportFilePath);
    }
    if (fs.existsSync(extractedJsonPath)) {
      fs.unlinkSync(extractedJsonPath);
    }

    return {
      deletedReportId: reportId,
      removedApprovedCount,
      removedExtractedValueCount,
      removedExtractedTableCount
    };
  });

export const extractReportData = async (reportId: string, tableSelection: string | null): Promise<ExtractionResultSummary> => {
  const extractionStartedAt = new Date().toISOString();

  updateAdminDb((db) => {
    const report = getReportById(db, reportId);
    report.processing_status = 'processing';
    report.extraction_error = null;
    report.extraction_started_at = extractionStartedAt;
    report.extraction_completed_at = null;
    report.extraction_summary = null;
    report.extraction_engine = `openai-responses:${DEFAULT_AI_MODEL}`;
  });

  try {
    const snapshot = readAdminDb();
    const reportSnapshot = getReportById(snapshot, reportId);
    const effectiveTableSelection = tableSelection || reportSnapshot.table_or_figure_number || null;
    let extractionEngine = `openai-responses:${DEFAULT_AI_MODEL}`;
    let extractionNotes: string[] = [];
    let extractionArtifact: Record<string, unknown> = {};

    const aiDocument = await callOpenAiReportExtraction(reportSnapshot, effectiveTableSelection).catch((error) => {
      extractionNotes.push(error instanceof Error ? `AI file extraction failed: ${error.message}` : 'AI file extraction failed.');
      return null;
    });

    return await updateAdminDbAsync(async (db) => {
      const report = getReportById(db, reportId);
      const existingTableIds = new Set(
        db.nisr_extracted_tables.filter((table) => table.report_id === reportId).map((table) => table.id)
      );
      db.nisr_extracted_tables = db.nisr_extracted_tables.filter((table) => table.report_id !== reportId);
      db.nisr_extracted_values = db.nisr_extracted_values.filter((value) => !existingTableIds.has(value.extracted_table_id));

      const extractedTables: NisrExtractedTableRecord[] = [];
      const extractedValues: NisrExtractedValueRecord[] = [];

      if (aiDocument?.tables?.length) {
        extractionNotes.push(...(Array.isArray(aiDocument.extraction_notes) ? aiDocument.extraction_notes : []));
        extractionArtifact = aiDocument as unknown as Record<string, unknown>;

        for (let index = 0; index < aiDocument.tables.length; index += 1) {
          const normalizedTable = normalizeAiTablePayload(report, aiDocument.tables[index]);
          const preview = normalizedTable.original_preview.length
            ? normalizedTable.original_preview
            : [normalizedTable.headers, ...normalizedTable.rows.slice(0, 5).map((row) => [row.location, row.time_period, row.value])].filter(
                (row) => row.length
              );
          const rawRows = buildRawRowsFromPreview(normalizedTable.headers, normalizedTable.rows);
          const rawAiJson = JSON.stringify(normalizedTable);
          const tableRecord: NisrExtractedTableRecord = {
            id: createId('nisr_table'),
            report_id: reportId,
            table_index: index + 1,
            table_number: safeString(normalizedTable.table_number) || null,
            table_title: normalizedTable.table_title,
            page_number: normalizedTable.page_number ? Number(normalizedTable.page_number) : null,
            sheet_name: null,
            cell_range: null,
            headers: normalizedTable.headers,
            original_preview: preview,
            raw_rows: rawRows,
            sample_rows: rawRows.slice(0, 5),
            suggested_sdg_indicator: normalizedTable.suggested_sdg_indicator || null,
            suggestion_confidence_score: normalizedTable.confidence_score,
            suggestion_explanation: normalizedTable.explanation,
            processing_status:
              normalizedTable.warnings.length || normalizedTable.confidence_score / 100 < LOW_CONFIDENCE_THRESHOLD
                ? 'needs_review'
                : 'extracted',
            extraction_warnings: normalizedTable.warnings,
            source_kind: normalizedTable.source_kind,
            extraction_method: extractionEngine,
            raw_ai_json: rawAiJson,
            extracted_at: new Date().toISOString()
          };

          extractedTables.push(tableRecord);

          for (const payloadRow of normalizedTable.rows) {
            extractedValues.push(buildValueRecord(db, report, tableRecord, payloadRow, normalizedTable, rawAiJson));
          }
        }
      } else {
        const rawTables = runExtractionScript(report, effectiveTableSelection);
        extractionEngine = `python:${path.basename(NISR_EXTRACTION_SCRIPT_PATH)} -> openai-responses:${DEFAULT_AI_MODEL}`;
        extractionNotes.push('Fell back to local parsing because AI file extraction returned no usable tables.');
        extractionArtifact = {
          engine: extractionEngine,
          tables: rawTables
        };

        for (let index = 0; index < rawTables.length; index += 1) {
          const rawTable = rawTables[index];
          const mapping = await mapRawTableToStructuredData(db, report, rawTable);
          const tableRecord: NisrExtractedTableRecord = {
            id: createId('nisr_table'),
            report_id: reportId,
            table_index: index + 1,
            table_number: safeString(mapping.tablePayload.table_number || rawTable.table_reference) || null,
            table_title: rawTable.table_title,
            page_number: rawTable.page_number,
            sheet_name: rawTable.sheet_name,
            cell_range: rawTable.cell_range,
            headers: rawTable.columns,
            original_preview: rawTable.original_preview || [],
            raw_rows: rawTable.rows.map((row) =>
              Object.fromEntries(Object.entries(row).map(([key, value]) => [key, value === undefined ? null : (value as string | number | null)]))
            ),
            sample_rows: rawTable.sample_rows.map((row) =>
              Object.fromEntries(Object.entries(row).map(([key, value]) => [key, value === undefined ? null : (value as string | number | null)]))
            ),
            suggested_sdg_indicator: mapping.tablePayload.suggested_sdg_indicator || null,
            suggestion_confidence_score: mapping.tablePayload.confidence_score,
            suggestion_explanation: mapping.tablePayload.explanation,
            processing_status:
              rawTable.warnings?.length || mapping.tablePayload.confidence_score / 100 < LOW_CONFIDENCE_THRESHOLD
                ? 'needs_review'
                : 'extracted',
            extraction_warnings: rawTable.warnings || [],
            source_kind: rawTable.sheet_name ? 'sheet' : 'table',
            extraction_method: extractionEngine,
            raw_ai_json: mapping.aiPayloadJson,
            extracted_at: new Date().toISOString()
          };

          extractedTables.push(tableRecord);

          for (const payloadRow of mapping.tablePayload.rows) {
            extractedValues.push(buildValueRecord(db, report, tableRecord, payloadRow, mapping.tablePayload, mapping.aiPayloadJson));
          }
        }
      }

      db.nisr_extracted_tables.unshift(...extractedTables);
      db.nisr_extracted_values.unshift(...extractedValues);
      report.processing_status = extractedValues.some((value) => value.needs_review) ? 'needs_review' : 'extracted';
      report.extraction_engine = extractionEngine;
      report.extraction_error = null;
      report.extraction_completed_at = new Date().toISOString();
      report.extraction_summary = buildExtractionSummary(extractionEngine, extractedTables, extractedValues, extractionNotes);

      fs.mkdirSync(ADMIN_EXTRACTED_JSON_DIR, { recursive: true });
      fs.writeFileSync(
        path.join(ADMIN_EXTRACTED_JSON_DIR, `${reportId}.json`),
        `${JSON.stringify(
          {
            engine: extractionEngine,
            started_at: extractionStartedAt,
            completed_at: report.extraction_completed_at,
            notes: extractionNotes,
            payload: extractionArtifact
          },
          null,
          2
        )}\n`,
        'utf-8'
      );

      appendAuditLog(db, {
        actor: DEFAULT_REVIEWER,
        action: 'nisr_extraction_completed',
        entity_type: 'report',
        entity_id: report.id,
        metadata: {
          engine: extractionEngine,
          table_count: extractedTables.length,
          value_count: extractedValues.length
        }
      });

      return {
        report,
        extractedTables,
        extractedValues
      };
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Extraction failed.';
    updateAdminDb((db) => {
      const report = getReportById(db, reportId);
      report.processing_status = 'failed';
      report.extraction_error = message;
      report.extraction_completed_at = new Date().toISOString();
      appendAuditLog(db, {
        actor: DEFAULT_REVIEWER,
        action: 'nisr_extraction_failed',
        entity_type: 'report',
        entity_id: reportId,
        metadata: {
          message
        }
      });
    });
    throw error;
  }
};

export const listReviewData = (filters: { reportId?: string; tableId?: string; status?: ReviewStatus | 'needs_review' | 'all' } = {}): {
  reports: NisrReportRecord[];
  tables: NisrExtractedTableRecord[];
  values: NisrExtractedValueRecord[];
} => {
  const db = readAdminDb();
  const reports = getNisrReports();
  const tables = db.nisr_extracted_tables.filter((table) => !filters.reportId || table.report_id === filters.reportId);
  const values = db.nisr_extracted_values.filter((value) => {
    if (filters.reportId && value.report_id !== filters.reportId) {
      return false;
    }
    if (filters.tableId && value.extracted_table_id !== filters.tableId) {
      return false;
    }
    if (!filters.status || filters.status === 'all') {
      return true;
    }
    if (filters.status === 'needs_review') {
      return value.needs_review;
    }
    return value.review_status === filters.status;
  });

  return { reports, tables, values };
};

export const updateExtractedValue = (
  valueId: string,
  updates: Partial<
    Pick<
      NisrExtractedValueRecord,
      | 'indicator_code'
      | 'series'
      | 'series_code'
      | 'unit'
      | 'location'
      | 'province'
      | 'district'
      | 'sex'
      | 'age_group'
      | 'time_period'
      | 'value'
      | 'notes'
      | 'review_status'
    >
  >,
  editedBy = DEFAULT_REVIEWER
): NisrExtractedValueRecord =>
  updateAdminDb((db) => {
    const record = db.nisr_extracted_values.find((item) => item.id === valueId);
    if (!record) {
      throw new Error('Extracted value not found.');
    }

    Object.assign(record, updates);
    record.last_edited_at = new Date().toISOString();
    record.last_edited_by = editedBy;
    const validation = validateExtractedValue(db, record);
    record.validation_issues = validation.issues;
    record.duplicate_status = validation.duplicateStatus;
    record.duplicate_with_record_id = validation.duplicateWithRecordId;
    record.change_warning = validation.changeWarning;
    record.overwrite_warning = validation.overwriteWarning;
    record.needs_review =
      record.confidence_score / 100 < LOW_CONFIDENCE_THRESHOLD ||
      Boolean(record.validation_issues.length) ||
      record.duplicate_status !== 'none';
    if (record.review_status === 'approved' && record.needs_review) {
      record.review_status = 'pending';
    }

    appendAuditLog(db, {
      actor: editedBy,
      action: 'nisr_extracted_value_updated',
      entity_type: 'value',
      entity_id: record.id,
      metadata: {
        indicator_code: record.indicator_code,
        time_period: record.time_period
      }
    });

    return record;
  });

const createApprovalRecord = (
  db: AdminDatabase,
  value: NisrExtractedValueRecord,
  action: 'approve' | 'reject' | 'draft',
  reviewer: string,
  reviewNote: string | null,
  approvedRecordId: string | null
): SdgDataApprovalRecord => {
  const approval: SdgDataApprovalRecord = {
    id: createId('approval'),
    report_id: value.report_id,
    extracted_table_id: value.extracted_table_id,
    extracted_value_id: value.id,
    action,
    status: action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'draft',
    reviewer,
    review_note: reviewNote,
    approved_record_id: approvedRecordId,
    created_at: new Date().toISOString()
  };
  db.sdg_data_approvals.unshift(approval);
  return approval;
};

export const applyReviewAction = (
  input: {
    extractedValueIds: string[];
    action: 'approve' | 'reject' | 'draft';
    reviewer?: string;
    reviewNote?: string | null;
    confirmOverwrite?: boolean;
  }
): { approved: ApprovedSdgDataRecord[]; conflicts: Array<WorkbookConflict & { extracted_value_id: string; type: 'duplicate' | 'overwrite' }> } =>
  updateAdminDb((db) => {
    const reviewer = input.reviewer || DEFAULT_REVIEWER;
    const records = db.nisr_extracted_values.filter((value) => input.extractedValueIds.includes(value.id));
    if (!records.length) {
      throw new Error('No extracted values found for review.');
    }

    if (input.action !== 'approve') {
      for (const record of records) {
        record.review_status = input.action === 'reject' ? 'rejected' : 'draft';
        record.needs_review = input.action !== 'reject';
        createApprovalRecord(db, record, input.action, reviewer, input.reviewNote || null, null);
      }
      return { approved: [], conflicts: [] };
    }

    const catalogMap = getIndicatorCatalogMap();
    const conflicts: Array<WorkbookConflict & { extracted_value_id: string; type: 'duplicate' | 'overwrite' }> = [];
    const approved: ApprovedSdgDataRecord[] = [];

    for (const record of records) {
      const latestApproved = getLatestApprovedValue(db, record);
      if (latestApproved && latestApproved.value === record.value) {
        conflicts.push({
          extracted_value_id: record.id,
          rowIndex: -1,
          year: record.time_period,
          previousValue: latestApproved.value,
          newValue: latestApproved.value,
          type: 'duplicate'
        });
        continue;
      }

      const approvedRecord: ApprovedSdgDataRecord = {
        id: createId('approved'),
        extracted_value_id: record.id,
        report_id: record.report_id,
        goal: record.goal,
        target: record.target,
        indicator: record.indicator,
        indicator_code: record.indicator_code,
        series: record.series,
        series_code: record.series_code,
        unit: record.unit,
        location: record.location,
        province: record.province,
        district: record.district,
        sex: record.sex,
        age_group: record.age_group,
        time_period: record.time_period,
        value: Number(record.value),
        data_source: record.data_source,
        report_name: record.report_name,
        table_number: record.table_number,
        page_number: record.page_number,
        source_url: record.source_url,
        notes: record.notes,
        approved_by: reviewer,
        approved_at: new Date().toISOString()
      };

      const conflict = appendOrUpdateWorkbookRecord(
        approvedRecord,
        catalogMap.get(record.indicator_code),
        Boolean(input.confirmOverwrite)
      );

      if (conflict) {
        conflicts.push({
          extracted_value_id: record.id,
          ...conflict,
          type: 'overwrite'
        });
        continue;
      }

      if (latestApproved && latestApproved.value !== approvedRecord.value) {
        db.sdg_data_version_history.unshift({
          id: createId('version'),
          indicator_code: approvedRecord.indicator_code,
          approved_record_id: approvedRecord.id,
          report_id: approvedRecord.report_id,
          extracted_value_id: approvedRecord.extracted_value_id,
          time_period: approvedRecord.time_period,
          location_key: buildLocationKey({
            indicator_code: approvedRecord.indicator_code,
            series_code: approvedRecord.series_code,
            location: approvedRecord.location,
            province: approvedRecord.province,
            district: approvedRecord.district,
            sex: approvedRecord.sex,
            age_group: approvedRecord.age_group
          }),
          previous_value: latestApproved.value,
          new_value: approvedRecord.value,
          changed_by: reviewer,
          changed_at: approvedRecord.approved_at,
          reason: input.reviewNote || 'Admin approved updated value.'
        });
      }

      record.review_status = 'approved';
      record.needs_review = false;
      db.approved_sdg_data.unshift(approvedRecord);
      db.source_log.unshift({
        id: createId('source'),
        indicator_code: approvedRecord.indicator_code,
        indicator_name: approvedRecord.indicator || approvedRecord.series,
        value: approvedRecord.value,
        year: Number(approvedRecord.time_period),
        source_report_name: approvedRecord.report_name,
        institution: 'NISR',
        page_number: approvedRecord.page_number,
        upload_date: new Date().toISOString(),
        approved_by: reviewer,
        approved_at: approvedRecord.approved_at,
        report_id: approvedRecord.report_id,
        approved_record_id: approvedRecord.id,
        source_url: approvedRecord.source_url,
        table_number: approvedRecord.table_number
      });
      createApprovalRecord(db, record, 'approve', reviewer, input.reviewNote || null, approvedRecord.id);
      approved.push(approvedRecord);
    }

    if (conflicts.length && !input.confirmOverwrite) {
      return { approved: [], conflicts };
    }

    const impactedReports = new Set(approved.map((item) => item.report_id));
    for (const reportId of impactedReports) {
      const report = getReportById(db, reportId);
      report.processing_status = 'approved';
    }

    appendAuditLog(db, {
      actor: reviewer,
      action: 'nisr_review_action_applied',
      entity_type: 'approval',
      entity_id: approved[0]?.id || createId('approval_batch'),
      metadata: {
        action: input.action,
        count: approved.length
      }
    });

    return { approved, conflicts };
  });

export const listApprovedData = (filters: {
  goal?: string;
  indicator_code?: string;
  report_name?: string;
  year?: string;
  district?: string;
  province?: string;
} = {}): ApprovedSdgDataRecord[] =>
  readAdminDb().approved_sdg_data.filter((record) => {
    if (filters.goal && record.goal !== filters.goal) {
      return false;
    }
    if (filters.indicator_code && record.indicator_code !== filters.indicator_code) {
      return false;
    }
    if (filters.report_name && record.report_name !== filters.report_name) {
      return false;
    }
    if (filters.year && record.time_period !== filters.year) {
      return false;
    }
    if (filters.district && record.district !== filters.district) {
      return false;
    }
    if (filters.province && record.province !== filters.province) {
      return false;
    }
    return true;
  });
