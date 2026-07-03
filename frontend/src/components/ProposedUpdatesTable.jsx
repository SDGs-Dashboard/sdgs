export function ProposedUpdatesTable({ updates, onAction }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table>
        <thead>
          <tr>
            <th>Indicator</th>
            <th>Series Code</th>
            <th>Year</th>
            <th>Old Value</th>
            <th>New Value</th>
            <th>Confidence</th>
            <th>Source</th>
            <th>Evidence</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {updates.map((update) => (
            <tr key={update.update_id}>
              <td>{update.indicator}</td>
              <td>{update.series_code || "-"}</td>
              <td>{update.year}</td>
              <td>{update.old_value ?? "-"}</td>
              <td>{update.new_value ?? "-"}</td>
              <td>{update.confidence_score ? `${Math.round(update.confidence_score * 100)}%` : "-"}</td>
              <td>{update.source_report || "-"}</td>
              <td>{update.source_evidence || update.table_or_sheet || "-"}</td>
              <td><span className="status-pill">{update.status}</span></td>
              <td className="table-actions">
                <button onClick={() => onAction(update.update_id, "approve")}>Approve</button>
                <button className="reject" onClick={() => onAction(update.update_id, "reject")}>Reject</button>
                <button className="secondary" onClick={() => onAction(update.update_id, "needs_review")}>Needs Review</button>
              </td>
            </tr>
          ))}
          {!updates.length ? (
            <tr>
              <td colSpan={10}>No proposed updates yet.</td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
