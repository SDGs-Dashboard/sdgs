export function ReportsPanel({ reports, busyReportId, onExtract }) {
  return (
    <div className="panel">
      <div className="panel-header">
        <h2>Report Register</h2>
        <p>{reports.length} reports tracked</p>
      </div>
      <div className="report-list">
        {reports.map((report) => (
          <div key={report.report_id} className="report-row">
            <div>
              <strong>{report.report_name}</strong>
              <div>{report.report_family || "Unspecified family"} • {report.report_type}</div>
              <div>{report.extraction_summary || report.status}</div>
            </div>
            <div>
              {report.report_type === "excel" || report.report_type === "pdf" ? (
                <button
                  className={busyReportId === report.report_id ? "secondary" : ""}
                  onClick={() => onExtract(report.report_id)}
                  disabled={busyReportId === report.report_id}
                >
                  {busyReportId === report.report_id ? "Extracting..." : "Run extraction"}
                </button>
              ) : (
                <span className="status-pill">{report.status}</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
