interface FilterPanelProps {
  search: string;
  goal: string;
  status: string;
  year: string;
  sex: string;
  location: string;
  age: string;
  goals: number[];
  years: number[];
  sexes: string[];
  locations: string[];
  ages: string[];
  onChange: (field: string, value: string) => void;
  onReset: () => void;
}

export function FilterPanel(props: FilterPanelProps): JSX.Element {
  const {
    search,
    goal,
    status,
    year,
    sex,
    location,
    age,
    goals,
    years,
    sexes,
    locations,
    ages,
    onChange,
    onReset
  } = props;

  return (
    <aside className="panel border border-slate-200 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-heading text-base font-semibold text-slate-900">Filter Indicators</h3>
        <button
          type="button"
          onClick={onReset}
          className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
        >
          Reset
        </button>
      </div>

      <div className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-600">Search</span>
          <input
            value={search}
            onChange={(event) => onChange('search', event.target.value)}
            placeholder="Code or title"
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-rwBlue"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-600">SDG goal</span>
          <select
            value={goal}
            onChange={(event) => onChange('goal', event.target.value)}
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-rwBlue"
          >
            <option value="">All goals</option>
            {goals.map((goalNumber) => (
              <option key={goalNumber} value={goalNumber}>
                Goal {goalNumber}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-600">Target status</span>
          <select
            value={status}
            onChange={(event) => onChange('status', event.target.value)}
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-rwBlue"
          >
            <option value="">All</option>
            <option value="On track">On track</option>
            <option value="Moderate progress">Moderate progress</option>
            <option value="Needs attention">Needs attention</option>
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-600">Year</span>
          <select
            value={year}
            onChange={(event) => onChange('year', event.target.value)}
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-rwBlue"
          >
            <option value="">All years</option>
            {[...years].reverse().map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-600">Sex</span>
          <select
            value={sex}
            onChange={(event) => onChange('sex', event.target.value)}
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-rwBlue"
          >
            <option value="">All</option>
            {sexes.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-600">Location</span>
          <select
            value={location}
            onChange={(event) => onChange('location', event.target.value)}
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-rwBlue"
          >
            <option value="">All</option>
            {locations.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-600">Age group</span>
          <select
            value={age}
            onChange={(event) => onChange('age', event.target.value)}
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-rwBlue"
          >
            <option value="">All</option>
            {ages.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
      </div>
    </aside>
  );
}
