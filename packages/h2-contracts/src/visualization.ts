import type { H2AnomalyCode } from './anomaly.ts'

export type H2ChartPresentation =
  | 'line'
  | 'dual_axis'
  | 'threshold_band'
  | 'stacked_scatter'
  | 'area_band'

export interface H2ChartRequirement {
  readonly code: H2AnomalyCode
  readonly presentation: H2ChartPresentation
  readonly requiredVariables: readonly string[]
  readonly fallback: 'event_evidence_series'
}

export const H2_EVENT_CHART_REQUIREMENTS = [
  {
    code: 'C01',
    presentation: 'dual_axis',
    requiredVariables: [
      'ems_total_elz_target_kw',
      'bess_power_actual_kw',
      'pcc_power_actual_kw',
    ],
    fallback: 'event_evidence_series',
  },
  {
    code: 'C02',
    presentation: 'threshold_band',
    requiredVariables: [
      'elz1_reported_available_capacity_kw',
      'elz1_actual_available_capacity_kw',
      'elz2_reported_available_capacity_kw',
      'elz2_actual_available_capacity_kw',
      'elz3_reported_available_capacity_kw',
      'elz3_actual_available_capacity_kw',
    ],
    fallback: 'event_evidence_series',
  },
  {
    code: 'C03',
    presentation: 'line',
    requiredVariables: [
      'bess_power_cmd_kw',
      'bess_power_actual_kw',
      'pcc_power_actual_kw',
    ],
    fallback: 'event_evidence_series',
  },
  {
    code: 'C04',
    presentation: 'threshold_band',
    requiredVariables: [
      'pcc_power_actual_kw',
      'grid_export_power_limit_kw',
      'grid_import_power_limit_kw',
    ],
    fallback: 'event_evidence_series',
  },
  {
    code: 'C05',
    presentation: 'dual_axis',
    requiredVariables: [
      'grid_export_energy_quota_kwh_day',
      'grid_import_energy_quota_kwh_day',
      'grid_export_energy_used_kwh_day',
      'grid_import_energy_used_kwh_day',
      'pcc_power_actual_kw',
    ],
    fallback: 'event_evidence_series',
  },
  {
    code: 'C06',
    presentation: 'stacked_scatter',
    requiredVariables: [
      'elz1_power_actual_kw',
      'elz2_power_actual_kw',
      'elz3_power_actual_kw',
      'elz1_specific_energy_kwh_per_kg',
      'elz2_specific_energy_kwh_per_kg',
      'elz3_specific_energy_kwh_per_kg',
    ],
    fallback: 'event_evidence_series',
  },
  {
    code: 'C07',
    presentation: 'area_band',
    requiredVariables: [
      'soc_target_pct',
      'bess_soc_pct',
      'bess_available_charge_energy_kwh',
      'bess_available_discharge_energy_kwh',
      'bess_regulation_reserve_target_kwh',
    ],
    fallback: 'event_evidence_series',
  },
] as const satisfies readonly H2ChartRequirement[]
