import { ChangeEvent, useMemo, useState } from 'react';

import type { GetStaticProps } from 'next';
import { FiCheckCircle, FiDownload, FiFileText, FiSearch, FiUploadCloud } from 'react-icons/fi';
import * as XLSX from 'xlsx';

import { KpiCard } from '../../components/KpiCard';
import { Layout } from '../../components/Layout';
import { getDashboardDataset } from '../../utils/sdgData';

type CellValue = string | number | boolean | Date | null;

interface StaticMappingRow {
  mappingId: string;
  indicator: string;
  series: string;
  seriesCode: string;
  dashboardDescription: string;
  unitCode: string;
  dataSource: string;
  latestYear: number | null;
  latestValue: number | null;
  reportFamily: string;
  reportName: string;
  reportYear: number | null;
  sheetOrPage: string;
  tableNo: string;
  tableTitle: string;
  reportIndicatorName: string;
  rowLabel: string;
  columnLabel: string;
  geography: string;
  disaggregation: string;
  notes: string;
}

interface StaticExtractionResult {
  mappingId: string;
  indicator: string;
  seriesCode: string;
  series: string;
  status: 'extracted' | 'needs_review' | 'not_found' | 'missing_mapping';
  reason: string;
  expectedTable: string;
  expectedRow: string;
  expectedColumn: string;
  oldValue: number | null;
  newValue: number | null;
  difference: number | null;
  unitCode: string;
  confidenceScore: number;
  sourceSheet: string;
  matchedCell: string;
  closestMatchedRow: string;
  closestMatchedColumn: string;
}

interface PreparedSheet {
  name: string;
  rows: string[][];
}

interface AdminStaticPageProps {
  searchItems: Array<{ code: string; slug: string; title: string; goal: number }>;
  years: number[];
  goals: number[];
  mappingRows: StaticMappingRow[];
}

const cellToText = (value: CellValue | undefined): string => String(value ?? '').trim();

const cleanText = (value: string): string => value.toLowerCase().replace(/[^a-z0-9]+/g, '');

const toNumber = (value: string): number | null => {
  const cleaned = value.replace(/,/g, '').replace(/%/g, '').trim();
  if (!cleaned) {
    return null;
  }
  const numberValue = Number(cleaned);
  return Number.isFinite(numberValue) ? numberValue : null;
};

const levenshteinDistance = (left: string, right: string): number => {
  const matrix = Array.from({ length: left.length + 1 }, () => Array(right.length + 1).fill(0));
  for (let index = 0; index <= left.length; index += 1) {
    matrix[index][0] = index;
  }
  for (let index = 0; index <= right.length; index += 1) {
    matrix[0][index] = index;
  }

  for (let rowIndex = 1; rowIndex <= left.length; rowIndex += 1) {
    for (let columnIndex = 1; columnIndex <= right.length; columnIndex += 1) {
      const cost = left[rowIndex - 1] === right[columnIndex - 1] ? 0 : 1;
      matrix[rowIndex][columnIndex] = Math.min(
        matrix[rowIndex - 1][columnIndex] + 1,
        matrix[rowIndex][columnIndex - 1] + 1,
        matrix[rowIndex - 1][columnIndex - 1] + cost
      );
    }
  }

  return matrix[left.length][right.length];
};

const textScore = (expected: string, actual: string): number => {
  const expectedClean = cleanText(expected);
  const actualClean = cleanText(actual);
  if (!expectedClean || !actualClean) {
    return 0;
  }
  if (expectedClean === actualClean) {
    return 100;
  }
  if (actualClean.includes(expectedClean) || expectedClean.includes(actualClean)) {
    return 92;
  }
  const longest = Math.max(expectedClean.length, actualClean.length);
  if (!longest) {
    return 0;
  }
  return Math.round(((longest - levenshteinDistance(expectedClean, actualClean)) / longest) * 100);
};

const bestScore = (expectedValues: string[], actual: string): number =>
  Math.max(0, ...expectedValues.map((expected) => textScore(expected, actual)));

const cellRef = (rowIndex: number, columnIndex: number): string => {
  let column = '';
  let value = columnIndex + 1;
  while (value > 0) {
    const remainder = (value - 1) % 26;
    column = String.fromCharCode(65 + remainder) + column;
    value = Math.floor((value - remainder) / 26);
  }
  return `${column}${rowIndex + 1}`;
};

const prepareWorkbookSheets = (workbook: XLSX.WorkBook): PreparedSheet[] =>
  workbook.SheetNames.map((name) => {
    const worksheet = workbook.Sheets[name];
    const rows = XLSX.utils.sheet_to_json<CellValue[]>(worksheet, {
      header: 1,
      raw: false,
      defval: ''
    });

    return {
      name,
      rows: rows.map((row) => row.map((cell) => cellToText(cell)))
    };
  });

const findColumn = (
  sheet: PreparedSheet,
  rowIndex: number,
  targets: string[]
): { columnIndex: number | null; score: number; label: string } => {
  let best = { columnIndex: null as number | null, score: 0, label: '' };
  const start = Math.max(0, rowIndex - 10);
  const end = Math.min(sheet.rows.length - 1, rowIndex + 2);

  for (let headerRowIndex = start; headerRowIndex <= end; headerRowIndex += 1) {
    const headerRow = sheet.rows[headerRowIndex] || [];
    for (let columnIndex = 0; columnIndex < headerRow.length; columnIndex += 1) {
      const label = headerRow[columnIndex];
      const score = bestScore(targets, label);
      if (score > best.score) {
        best = { columnIndex, score, label };
      }
    }
  }

  return best;
};

const findNearestNumeric = (
  row: string[],
  preferredColumn: number | null
): { value: number | null; columnIndex: number | null } => {
  if (preferredColumn !== null) {
    const directValue = toNumber(row[preferredColumn] ?? '');
    if (directValue !== null) {
      return { value: directValue, columnIndex: preferredColumn };
    }
  }

  const startColumn = preferredColumn === null ? 1 : Math.max(0, preferredColumn - 3);
  const endColumn = preferredColumn === null ? row.length - 1 : Math.min(row.length - 1, preferredColumn + 3);
  for (let columnIndex = startColumn; columnIndex <= endColumn; columnIndex += 1) {
    const numericValue = toNumber(row[columnIndex] ?? '');
    if (numericValue !== null) {
      return { value: numericValue, columnIndex };
    }
  }

  return { value: null, columnIndex: null };
};

const extractMappingRow = (mapping: StaticMappingRow, sheets: PreparedSheet[]): StaticExtractionResult => {
  const rowTargets = [
    mapping.rowLabel,
    mapping.reportIndicatorName,
    mapping.dashboardDescription,
    mapping.series
  ].filter(Boolean);
  const columnTargets = [
    mapping.columnLabel,
    mapping.reportYear ? String(mapping.reportYear) : '',
    mapping.latestYear ? String(mapping.latestYear) : ''
  ].filter(Boolean);
  const tableTargets = [mapping.tableNo, mapping.tableTitle].filter(Boolean);
  const expectedTable = [mapping.tableNo, mapping.tableTitle].filter(Boolean).join(' - ');
  const expectedRow = rowTargets[0] || '';
  const expectedColumn = columnTargets[0] || '';

  if (!rowTargets.length) {
    return {
      mappingId: mapping.mappingId,
      indicator: mapping.indicator,
      seriesCode: mapping.seriesCode,
      series: mapping.series,
      status: 'missing_mapping',
      reason: 'Missing row label or report indicator name in the mapping file.',
      expectedTable,
      expectedRow,
      expectedColumn,
      oldValue: mapping.latestValue,
      newValue: null,
      difference: null,
      unitCode: mapping.unitCode,
      confidenceScore: 0,
      sourceSheet: '',
      matchedCell: '',
      closestMatchedRow: '',
      closestMatchedColumn: ''
    };
  }

  let bestRow = {
    sheet: null as PreparedSheet | null,
    rowIndex: -1,
    rowScore: 0,
    tableScore: 0,
    rowText: ''
  };

  for (const sheet of sheets) {
    const preferredSheetScore = mapping.sheetOrPage ? textScore(mapping.sheetOrPage, sheet.name) : 0;
    for (let rowIndex = 0; rowIndex < sheet.rows.length; rowIndex += 1) {
      const rowText = sheet.rows[rowIndex].join(' | ');
      const rowScore = bestScore(rowTargets, rowText);
      const tableScore = Math.max(bestScore(tableTargets, rowText), preferredSheetScore);
      const combinedScore = rowScore + tableScore * 0.15;
      const currentBestScore = bestRow.rowScore + bestRow.tableScore * 0.15;
      if (combinedScore > currentBestScore) {
        bestRow = { sheet, rowIndex, rowScore, tableScore, rowText };
      }
    }
  }

  if (!bestRow.sheet || bestRow.rowScore < 50) {
    return {
      mappingId: mapping.mappingId,
      indicator: mapping.indicator,
      seriesCode: mapping.seriesCode,
      series: mapping.series,
      status: 'not_found',
      reason: 'Row label was not found in the uploaded report.',
      expectedTable,
      expectedRow,
      expectedColumn,
      oldValue: mapping.latestValue,
      newValue: null,
      difference: null,
      unitCode: mapping.unitCode,
      confidenceScore: Math.max(0, Math.round(bestRow.rowScore) / 100),
      sourceSheet: bestRow.sheet?.name || '',
      matchedCell: '',
      closestMatchedRow: bestRow.rowText,
      closestMatchedColumn: ''
    };
  }

  const columnMatch = columnTargets.length ? findColumn(bestRow.sheet, bestRow.rowIndex, columnTargets) : { columnIndex: null, score: 0, label: '' };
  const nearestNumeric = findNearestNumeric(bestRow.sheet.rows[bestRow.rowIndex] || [], columnMatch.columnIndex);
  const confidenceScore = Math.min(
    0.98,
    Math.max(0.45, (bestRow.rowScore * 0.65 + columnMatch.score * 0.25 + bestRow.tableScore * 0.1) / 100)
  );

  if (nearestNumeric.value === null) {
    return {
      mappingId: mapping.mappingId,
      indicator: mapping.indicator,
      seriesCode: mapping.seriesCode,
      series: mapping.series,
      status: 'not_found',
      reason: columnMatch.columnIndex === null ? 'Year/column label was not found and no nearby numeric value was found.' : 'Matched row was found but the value cell is empty.',
      expectedTable,
      expectedRow,
      expectedColumn,
      oldValue: mapping.latestValue,
      newValue: null,
      difference: null,
      unitCode: mapping.unitCode,
      confidenceScore: Number(confidenceScore.toFixed(2)),
      sourceSheet: bestRow.sheet.name,
      matchedCell: '',
      closestMatchedRow: bestRow.rowText,
      closestMatchedColumn: columnMatch.label
    };
  }

  const strongMatch = bestRow.rowScore >= 80 && (!columnTargets.length || columnMatch.score >= 80);
  const status = strongMatch ? 'extracted' : 'needs_review';
  const reason = strongMatch
    ? 'Matched row and year/column with high confidence in the uploaded workbook.'
    : 'Value found, but row or column confidence is below the safe approval threshold.';

  return {
    mappingId: mapping.mappingId,
    indicator: mapping.indicator,
    seriesCode: mapping.seriesCode,
    series: mapping.series,
    status,
    reason,
    expectedTable,
    expectedRow,
    expectedColumn,
    oldValue: mapping.latestValue,
    newValue: nearestNumeric.value,
    difference: mapping.latestValue === null ? null : Number((nearestNumeric.value - mapping.latestValue).toFixed(4)),
    unitCode: mapping.unitCode,
    confidenceScore: Number(confidenceScore.toFixed(2)),
    sourceSheet: bestRow.sheet.name,
    matchedCell: nearestNumeric.columnIndex === null ? '' : cellRef(bestRow.rowIndex, nearestNumeric.columnIndex),
    closestMatchedRow: bestRow.rowText,
    closestMatchedColumn: columnMatch.label
  };
};

const exportResults = (results: StaticExtractionResult[], reportName: string): void => {
  const extractionDate = new Date().toISOString();
  const proposedRows = results
    .filter((result) => result.status === 'extracted' || result.status === 'needs_review')
    .map((result, index) => ({
      Update_ID: `STATIC-${String(index + 1).padStart(4, '0')}`,
      Mapping_ID: result.mappingId,
      Indicator: result.indicator,
      Series_Code: result.seriesCode,
      Year: '',
      Old_Value: result.oldValue,
      New_Value: result.newValue,
      Difference: result.difference,
      Source_Report: reportName,
      Table_or_Sheet: result.sourceSheet,
      Evidence_Page: result.matchedCell,
      Extraction_Date: extractionDate,
      Status: result.status === 'extracted' ? 'Pending Review' : 'Needs Review',
      Reviewer_Comment: result.reason,
      Confidence_Score: result.confidenceScore
    }));

  const debugRows = results.map((result) => ({
    Indicator: result.indicator,
    Series_Code: result.seriesCode,
    Report_expected: reportName,
    Table_expected: result.expectedTable,
    Row_expected: result.expectedRow,
    Column_year_expected: result.expectedColumn,
    Status: result.status,
    Reason: result.reason,
    Closest_matched_row: result.closestMatchedRow,
    Closest_matched_column: result.closestMatchedColumn,
    Confidence_score: result.confidenceScore,
    Source_sheet: result.sourceSheet,
    Matched_cell: result.matchedCell,
    Extracted_value: result.newValue
  }));

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(proposedRows), 'Proposed_Updates');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(debugRows), 'Extraction_Debug_Report');
  XLSX.writeFile(workbook, 'NISR_GitHub_Pages_Proposed_Updates.xlsx');
};

const statusClassName = (status: StaticExtractionResult['status']): string => {
  switch (status) {
    case 'extracted':
      return 'bg-emerald-100 text-emerald-800';
    case 'needs_review':
      return 'bg-amber-100 text-amber-800';
    case 'missing_mapping':
      return 'bg-sky-100 text-sky-800';
    default:
      return 'bg-rose-100 text-rose-800';
  }
};

export default function AdminStaticPage({
  searchItems,
  years,
  goals,
  mappingRows
}: AdminStaticPageProps): JSX.Element {
  const [selectedFileName, setSelectedFileName] = useState('');
  const [reportName, setReportName] = useState('');
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [results, setResults] = useState<StaticExtractionResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const summary = useMemo(
    () => ({
      extracted: results.filter((result) => result.status === 'extracted').length,
      needsReview: results.filter((result) => result.status === 'needs_review').length,
      notFound: results.filter((result) => result.status === 'not_found').length,
      missingMapping: results.filter((result) => result.status === 'missing_mapping').length
    }),
    [results]
  );

  const onFileChange = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0];
    setError(null);
    setResults([]);
    setSheetNames([]);

    if (!file) {
      return;
    }
    if (!/\.(xlsx|xls|csv)$/i.test(file.name)) {
      setError('GitHub Pages browser extraction supports Excel and CSV files. PDF extraction needs a server backend.');
      return;
    }

    setBusy(true);
    setSelectedFileName(file.name);
    setReportName(file.name.replace(/\.[^.]+$/, ''));

    try {
      const workbook = /\.csv$/i.test(file.name)
        ? XLSX.read(await file.text(), { type: 'string' })
        : XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const sheets = prepareWorkbookSheets(workbook);
      const extractedResults = mappingRows.map((mapping) => extractMappingRow(mapping, sheets));
      setSheetNames(sheets.map((sheet) => sheet.name));
      setResults(extractedResults);
    } catch (readError) {
      setError(readError instanceof Error ? readError.message : 'Could not read the uploaded report.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Layout title="Admin Section" searchItems={searchItems} years={years} goals={goals}>
      <section className="panel border border-slate-200 p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-rwBlue">Admin Section</p>
        <h1 className="mt-2 font-heading text-3xl font-semibold text-rwNavy">NISR Data Automation for GitHub Pages</h1>
        <p className="mt-3 max-w-4xl text-sm leading-relaxed text-slate-600">
          This version runs directly on GitHub Pages in the browser. Staff can upload an Excel or CSV NISR report,
          compare it against the dashboard mapping metadata, review extraction results, and export proposed updates.
          No data is uploaded to a server, and nothing is saved automatically.
        </p>
        <div className="mt-5 rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm leading-relaxed text-sky-900">
          GitHub Pages can run static React and browser JavaScript. It cannot run FastAPI, SQLite, secure server login,
          or permanent file uploads. For that reason, this page exports reviewed files instead of writing directly to a database.
        </div>
      </section>

      <section className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Mapping rows" value={String(mappingRows.length)} helper="Checked in browser" accent="blue" icon={<FiSearch />} />
        <KpiCard label="Extracted" value={String(summary.extracted)} helper="High-confidence matches" accent="green" icon={<FiCheckCircle />} />
        <KpiCard label="Needs review" value={String(summary.needsReview)} helper="Possible values" accent="yellow" icon={<FiFileText />} />
        <KpiCard label="Not found" value={String(summary.notFound + summary.missingMapping)} helper="Missing or unmatched" accent="blue" icon={<FiUploadCloud />} />
      </section>

      <section className="mt-5 grid gap-5 xl:grid-cols-[380px_minmax(0,1fr)]">
        <div className="panel border border-slate-200 p-5">
          <h2 className="font-heading text-lg font-semibold text-slate-900">Upload report</h2>
          <p className="mt-2 text-sm text-slate-600">
            Supported on GitHub Pages: <code>.xlsx</code>, <code>.xls</code>, and <code>.csv</code>.
          </p>
          <label className="mt-4 block rounded-2xl border border-dashed border-rwBlue/40 bg-rwBlue/5 p-5 text-sm">
            <span className="flex items-center gap-2 font-semibold text-rwNavy">
              <FiUploadCloud className="h-4 w-4 text-rwBlue" />
              Select NISR report
            </span>
            <input type="file" accept=".xlsx,.xls,.csv" onChange={(event) => void onFileChange(event)} className="mt-3 w-full text-sm" />
          </label>

          <label className="mt-4 block text-sm">
            <span className="mb-1 block font-medium text-slate-700">Report name for export</span>
            <input
              value={reportName}
              onChange={(event) => setReportName(event.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 outline-none focus:border-rwBlue"
              placeholder="Report name"
            />
          </label>

          {selectedFileName ? <p className="mt-3 text-xs text-slate-500">Selected: {selectedFileName}</p> : null}
          {sheetNames.length ? <p className="mt-2 text-xs text-slate-500">Sheets read: {sheetNames.join(', ')}</p> : null}
          {busy ? <p className="mt-3 text-sm text-rwBlue">Reading report and checking mapping rows...</p> : null}
          {error ? <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</p> : null}

          <button
            type="button"
            disabled={!results.length}
            onClick={() => exportResults(results, reportName || selectedFileName || 'NISR report')}
            className="mt-5 inline-flex items-center gap-2 rounded-full bg-rwGreen px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            <FiDownload className="h-4 w-4" />
            Export proposed updates
          </button>
        </div>

        <div className="panel overflow-hidden border border-slate-200">
          <div className="border-b border-slate-200 px-5 py-4">
            <h2 className="font-heading text-lg font-semibold text-slate-900">Extraction Results</h2>
            <p className="mt-1 text-sm text-slate-500">
              Every mapping row is shown with a status and reason. Review exported values before using them in the final dashboard workbook.
            </p>
          </div>

          <div className="max-h-[620px] overflow-auto">
            <table className="min-w-full text-left text-xs">
              <thead className="sticky top-0 bg-slate-50 uppercase tracking-[0.08em] text-slate-500">
                <tr>
                  <th className="px-3 py-2">Indicator</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Old</th>
                  <th className="px-3 py-2">New</th>
                  <th className="px-3 py-2">Confidence</th>
                  <th className="px-3 py-2">Evidence</th>
                  <th className="px-3 py-2">Reason</th>
                </tr>
              </thead>
              <tbody>
                {results.length ? (
                  results.map((result) => (
                    <tr key={result.mappingId} className="border-t border-slate-100 align-top text-slate-700">
                      <td className="px-3 py-2">
                        <p className="font-semibold text-slate-900">{result.indicator}</p>
                        <p className="max-w-[260px] truncate text-slate-500">{result.series}</p>
                      </td>
                      <td className="px-3 py-2">
                        <span className={`rounded-full px-2 py-1 font-semibold ${statusClassName(result.status)}`}>
                          {result.status.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-3 py-2">{result.oldValue ?? '-'}</td>
                      <td className="px-3 py-2 font-semibold">{result.newValue ?? '-'}</td>
                      <td className="px-3 py-2">{Math.round(result.confidenceScore * 100)}%</td>
                      <td className="px-3 py-2">
                        {result.sourceSheet ? `${result.sourceSheet}${result.matchedCell ? ` / ${result.matchedCell}` : ''}` : '-'}
                      </td>
                      <td className="max-w-[360px] px-3 py-2">{result.reason}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className="px-3 py-8 text-center text-slate-500">
                      Upload an Excel or CSV report to see browser-side extraction results.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </Layout>
  );
}

const stringValue = (value: unknown): string => String(value ?? '').trim();

const numberValue = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const loadMappingRows = (): StaticMappingRow[] => {
  const workbook = XLSX.readFile('data/NISR_SDG_Automation_Mapping_Built.xlsx');
  const worksheet = workbook.Sheets.NISR_Source_Mapping;
  if (!worksheet) {
    return [];
  }

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, { defval: null });
  return rows.map((row) => ({
    mappingId: stringValue(row.Mapping_ID),
    indicator: stringValue(row.Indicator),
    series: stringValue(row.Series),
    seriesCode: stringValue(row.Series_Code),
    dashboardDescription: stringValue(row.Dashboard_Description),
    unitCode: stringValue(row.Unit_Code),
    dataSource: stringValue(row.Data_Source),
    latestYear: numberValue(row.Latest_Year),
    latestValue: numberValue(row.Latest_Value),
    reportFamily: stringValue(row.Report_Family),
    reportName: stringValue(row.Report_Name),
    reportYear: numberValue(row.Report_Year),
    sheetOrPage: stringValue(row.Sheet_or_Page),
    tableNo: stringValue(row.Table_No),
    tableTitle: stringValue(row.Table_Title),
    reportIndicatorName: stringValue(row.Report_Indicator_Name),
    rowLabel: stringValue(row.Row_Label),
    columnLabel: stringValue(row.Column_Label),
    geography: stringValue(row.Geography),
    disaggregation: stringValue(row.Disaggregation),
    notes: stringValue(row.Notes)
  }));
};

export const getStaticProps: GetStaticProps<AdminStaticPageProps> = async () => {
  const dataset = getDashboardDataset();

  return {
    props: {
      searchItems: dataset.indicators.map((indicator) => ({
        code: indicator.code,
        slug: indicator.slug,
        title: indicator.title,
        goal: indicator.goal
      })),
      years: dataset.filters.years,
      goals: dataset.filters.goals,
      mappingRows: loadMappingRows()
    }
  };
};
