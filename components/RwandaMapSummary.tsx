import { useEffect, useState } from 'react';

import { ComposableMap, Geographies, Geography } from 'react-simple-maps';

import { ProvinceCoveragePoint } from '../utils/types';

interface RwandaMapSummaryProps {
  coverage: ProvinceCoveragePoint[];
  geojsonUrl?: string;
}

type Coordinate = [number, number];
type Ring = Coordinate[];
type PolygonRings = Ring[];
type MultiPolygonRings = PolygonRings[];

interface GeoJsonFeature {
  geometry?: {
    type: string;
    coordinates: unknown;
  };
}

interface GeoJsonData {
  type: string;
  features: GeoJsonFeature[];
}

const COVERAGE_COLORS = {
  none: '#CBD5E1',
  low: '#A8CBE3',
  medium: '#72B5DD',
  high: '#2A78B8',
  veryHigh: '#00457C'
} as const;

const ringSignedArea = (ring: Ring): number => {
  let sum = 0;
  for (let index = 0; index < ring.length - 1; index += 1) {
    const [x1, y1] = ring[index];
    const [x2, y2] = ring[index + 1];
    sum += x1 * y2 - x2 * y1;
  }
  return sum / 2;
};

const toClockwiseRing = (ring: Ring): Ring => (ringSignedArea(ring) < 0 ? ring : [...ring].reverse());
const toCounterClockwiseRing = (ring: Ring): Ring => (ringSignedArea(ring) > 0 ? ring : [...ring].reverse());

const normalizePolygonRingsForD3 = (rings: PolygonRings): PolygonRings =>
  rings.map((ring, index) => (index === 0 ? toClockwiseRing(ring) : toCounterClockwiseRing(ring)));

const normalizeMapWindingForD3 = (data: GeoJsonData): GeoJsonData => ({
  ...data,
  features: data.features.map((feature) => {
    const geometry = feature.geometry;
    if (!geometry) {
      return feature;
    }

    if (geometry.type === 'Polygon') {
      const polygon = geometry.coordinates as PolygonRings;
      return {
        ...feature,
        geometry: {
          ...geometry,
          coordinates: normalizePolygonRingsForD3(polygon)
        }
      };
    }

    if (geometry.type === 'MultiPolygon') {
      const multiPolygon = geometry.coordinates as MultiPolygonRings;
      return {
        ...feature,
        geometry: {
          ...geometry,
          coordinates: multiPolygon.map((polygon) => normalizePolygonRingsForD3(polygon))
        }
      };
    }

    return feature;
  })
});

const getFillColor = (value: number, maxValue: number): string => {
  if (!maxValue || value <= 0) {
    return COVERAGE_COLORS.none;
  }

  const ratio = value / maxValue;
  if (ratio >= 0.75) {
    return COVERAGE_COLORS.veryHigh;
  }
  if (ratio >= 0.5) {
    return COVERAGE_COLORS.high;
  }
  if (ratio >= 0.25) {
    return COVERAGE_COLORS.medium;
  }
  return COVERAGE_COLORS.low;
};

export function RwandaMapSummary({
  coverage,
  geojsonUrl = '/geo/rwanda-regions.geojson'
}: RwandaMapSummaryProps): JSX.Element {
  const maxCount = Math.max(...coverage.map((item) => item.indicatorCount), 0);
  const legendItems = [
    { color: COVERAGE_COLORS.none, label: 'No coverage' },
    { color: COVERAGE_COLORS.low, label: 'Low coverage' },
    { color: COVERAGE_COLORS.medium, label: 'Moderate coverage' },
    { color: COVERAGE_COLORS.high, label: 'High coverage' },
    { color: COVERAGE_COLORS.veryHigh, label: 'Very high coverage' }
  ];
  const [geojson, setGeojson] = useState<GeoJsonData | null>(null);

  const coverageMap = Object.fromEntries(coverage.map((item) => [item.province, item]));

  useEffect(() => {
    let active = true;
    fetch(geojsonUrl)
      .then((response) => response.json())
      .then((data) => {
        if (active) {
          setGeojson(normalizeMapWindingForD3(data as GeoJsonData));
        }
      })
      .catch(() => {
        if (active) {
          setGeojson({ type: 'FeatureCollection', features: [] });
        }
      });

    return () => {
      active = false;
    };
  }, [geojsonUrl]);

  return (
    <div className="panel border border-slate-200 p-5">
      <h3 className="font-heading text-base font-semibold text-slate-900">National map summary</h3>
      <p className="mt-1 text-sm text-slate-600">
        Province shading reflects the number of indicators with disaggregated provincial data.
      </p>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <div className="rounded-2xl border border-slate-100 bg-slate-50 p-2">
          {geojson ? (
            <ComposableMap projection="geoMercator" projectionConfig={{ scale: 11000, center: [29.95, -1.95] }}>
              <Geographies geography={geojson}>
                {({ geographies }: { geographies: Array<any> }) =>
                  geographies.map((geo: any) => {
                    const properties = geo.properties as Record<string, unknown>;
                    const provinceName = String(properties.name ?? '');
                    const stats = coverageMap[provinceName];
                    const count = stats?.indicatorCount ?? 0;

                    return (
                      <Geography
                        key={geo.rsmKey}
                        geography={geo}
                        fill={getFillColor(count, maxCount)}
                        stroke="#ffffff"
                        strokeWidth={1}
                        style={{
                          default: { outline: 'none' },
                          hover: { outline: 'none', fill: '#00A651' },
                          pressed: { outline: 'none' }
                        }}
                      />
                    );
                  })
                }
              </Geographies>
            </ComposableMap>
          ) : (
            <div className="flex h-[310px] items-center justify-center text-sm text-slate-500">
              Loading map geometry...
            </div>
          )}

          <div className="mt-2 border-t border-slate-200 px-1 pt-3">
            <p className="text-[11px] uppercase tracking-[0.12em] text-slate-500">Coverage legend</p>
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-2 text-xs text-slate-600">
              {legendItems.map((item) => (
                <span key={item.label} className="inline-flex items-center gap-1.5">
                  <span
                    className="h-3 w-3 rounded-sm border border-slate-300"
                    style={{ backgroundColor: item.color }}
                    aria-hidden="true"
                  />
                  {item.label}
                </span>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-slate-500">
              Coverage is based on indicators with province-disaggregated observations. Max observed coverage:{' '}
              {maxCount} indicators.
            </p>
          </div>
        </div>

        <div className="space-y-2">
          {coverage.map((province) => (
            <div key={province.province} className="rounded-xl border border-slate-100 bg-white p-3">
              <p className="text-sm font-semibold text-slate-900">{province.province}</p>
              <div className="mt-1 flex items-center justify-between text-xs text-slate-600">
                <span>Indicators</span>
                <span>{province.indicatorCount}</span>
              </div>
              <div className="mt-1 flex items-center justify-between text-xs text-slate-600">
                <span>Average latest year</span>
                <span>{province.latestAverageYear ?? 'N/A'}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
