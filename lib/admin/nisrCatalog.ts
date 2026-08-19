// Builds an indicator catalogue from approved workbook data and metadata files.
import fs from 'fs';
import path from 'path';

import matter from 'gray-matter';
import XLSX from 'xlsx';

import { PUBLIC_APPROVED_WORKBOOK_PATH } from './constants';

export interface IndicatorCatalogRecord {
  indicator_code: string;
  goal: string;
  target: string;
  indicator: string;
  indicator_definition: string;
  target_name: string;
  unit: string;
  series: string;
  series_code: string;
  source_url: string;
  keywords: string[];
  table_references: string[];
  table_reference_tokens: string[];
}

let cachedCatalog: IndicatorCatalogRecord[] | null = null;

const normalizeText = (value: unknown): string =>
  String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9.%/\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const tokenize = (value: string): string[] =>
  Array.from(
    new Set(
      normalizeText(value)
        .split(' ')
        .map((token) => token.trim())
        .filter((token) => token.length > 2)
      )
  );

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

interface WorkbookHintRecord {
  unit: string;
  series: string;
  series_code: string;
  table_references: string[];
  table_reference_tokens: string[];
}

const findReferenceWorkbookPaths = (): string[] => {
  const candidatePaths = [
    PUBLIC_APPROVED_WORKBOOK_PATH,
    path.join(process.cwd(), 'data', '2025_RW-SDG_Data.xlsx')
  ];
  const uploadsDir = path.join(process.cwd(), 'uploads', 'reports');

  if (fs.existsSync(uploadsDir)) {
    const uploadedWorkbooks = fs
      .readdirSync(uploadsDir)
      .filter((fileName) => /\.xlsx?$/i.test(fileName))
      .map((fileName) => path.join(uploadsDir, fileName));
    uploadedWorkbooks.sort(
      (left, right) => fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs
    );
    candidatePaths.unshift(...uploadedWorkbooks);
  }

  return Array.from(new Set(candidatePaths.filter((candidatePath) => fs.existsSync(candidatePath))));
};

const readWorkbookHints = (): Map<string, WorkbookHintRecord> => {
  const hints = new Map<string, WorkbookHintRecord>();

  for (const workbookPath of findReferenceWorkbookPaths()) {
    const workbook = XLSX.readFile(workbookPath);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
    const hasTableReferenceColumn = rows.some((row) => Object.prototype.hasOwnProperty.call(row, 'Table name and number'));

    for (const row of rows) {
      const indicatorCode = String(row.Indicator ?? '').trim();
      if (!indicatorCode) {
        continue;
      }

      const existing = hints.get(indicatorCode) || {
        unit: '',
        series: '',
        series_code: '',
        table_references: [],
        table_reference_tokens: []
      };
      const tableReferences = new Set(existing.table_references);
      const tableReferenceTokens = new Set(existing.table_reference_tokens);
      const tableReference = String(row['Table name and number'] ?? '').trim();

      if (hasTableReferenceColumn && tableReference) {
        tableReferences.add(tableReference);
        extractTableReferenceTokens(tableReference).forEach((token) => tableReferenceTokens.add(token));
      }

      hints.set(indicatorCode, {
        unit: existing.unit || String(row.Unit_Code ?? '').trim(),
        series: existing.series || String(row.Series ?? '').trim(),
        series_code: existing.series_code || String(row.Series_Code ?? '').trim(),
        table_references: Array.from(tableReferences),
        table_reference_tokens: Array.from(tableReferenceTokens)
      });
    }
  }

  return hints;
};

export const getIndicatorCatalog = (): IndicatorCatalogRecord[] => {
  if (cachedCatalog) {
    return cachedCatalog;
  }

  const workbookHints = readWorkbookHints();
  const metaDir = path.join(process.cwd(), 'meta');
  const files = fs.existsSync(metaDir) ? fs.readdirSync(metaDir).filter((file) => file.endsWith('.md')) : [];

  cachedCatalog = files
    .map((fileName) => {
      const filePath = path.join(metaDir, fileName);
      const parsed = matter(fs.readFileSync(filePath, 'utf-8'));
      const indicatorCode = String(parsed.data.indicator_number ?? fileName.replace('.md', '').replaceAll('-', '.')).trim();
      const [goal = '', targetMinor = ''] = indicatorCode.split('.');
      const target = targetMinor ? `${goal}.${targetMinor}` : goal;
      const workbookHint = workbookHints.get(indicatorCode);
      const indicator = String(
        parsed.data.indicator_name ?? parsed.data.title ?? parsed.data.graph_title ?? indicatorCode
      ).trim();
      const indicatorDefinition = String(parsed.data.indicator_definition ?? '').trim();
      const targetName = String(parsed.data.target_name ?? '').trim();
      const unit = String(parsed.data.computation_units ?? workbookHint?.unit ?? '').trim();
      const series = String(parsed.data.graph_title ?? indicator ?? workbookHint?.series ?? '').trim();
      const seriesCode = String(workbookHint?.series_code ?? indicatorCode.replaceAll('.', '_')).trim();
      const sourceUrl = String(parsed.data.source_url_1 ?? '').trim();
      const body = typeof parsed.content === 'string' ? parsed.content.trim() : '';
      const keywords = tokenize([indicator, indicatorDefinition, targetName, body, unit].join(' '));

      return {
        indicator_code: indicatorCode,
        goal,
        target,
        indicator,
        indicator_definition: indicatorDefinition,
        target_name: targetName,
        unit,
        series,
        series_code: seriesCode,
        source_url: sourceUrl,
        keywords,
        table_references: workbookHint?.table_references || [],
        table_reference_tokens: workbookHint?.table_reference_tokens || []
      } satisfies IndicatorCatalogRecord;
    })
    .sort((left, right) => left.indicator_code.localeCompare(right.indicator_code, undefined, { numeric: true }));

  return cachedCatalog;
};

export const getIndicatorCatalogMap = (): Map<string, IndicatorCatalogRecord> =>
  new Map(getIndicatorCatalog().map((item) => [item.indicator_code, item]));

export const resetIndicatorCatalogCache = (): void => {
  cachedCatalog = null;
};
