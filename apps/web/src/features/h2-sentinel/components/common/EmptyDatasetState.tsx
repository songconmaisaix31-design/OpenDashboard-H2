import type { H2DatasetMode } from '@opendashboard/h2-contracts'
import { H2_CSV_MAX_BYTES } from '../../model/workspace-loader.ts'
import { StatusBadge } from './StatusBadge.tsx'

export interface EmptyDatasetStateProps {
  readonly error: string | null
  readonly mode: H2DatasetMode
  readonly onImport: (file: File) => void
  readonly onRetry: () => void
  readonly pending: boolean
}

export function EmptyDatasetState({
  error,
  mode,
  onImport,
  onRetry,
  pending,
}: EmptyDatasetStateProps) {
  const maxMegabytes = H2_CSV_MAX_BYTES / (1024 * 1024)

  return (
    <main className="h2-view-state h2-empty-dataset-state">
      <div aria-hidden="true" className="h2-view-state__mark">H2</div>
      <p className="h2-eyebrow">Empty state · import ready</p>
      <h1>导入第一份本地数据</h1>
      <p>
        {mode === 'LIVE_ANALYSIS'
          ? '本地分析服务已就绪，但还没有数据集。选择 CSV 后将通过注入的数据源完成质量检查与分析。'
          : '固定样例数据源没有返回数据集；可重新检查数据源。'}
      </p>
      <div className="h2-empty-dataset-state__actions">
        {mode === 'LIVE_ANALYSIS' ? (
          <label className="h2-file-picker h2-file-picker--large">
            <span>{pending ? '正在导入与分析…' : '选择 .csv 文件'}</span>
            <input
              accept=".csv,text/csv"
              aria-describedby="h2-empty-file-policy"
              disabled={pending}
              onChange={(event) => {
                const file = event.currentTarget.files?.[0]
                if (file) onImport(file)
                event.currentTarget.value = ''
              }}
              type="file"
            />
          </label>
        ) : null}
        <button
          className="h2-button h2-button--ghost"
          disabled={pending}
          onClick={onRetry}
          type="button"
        >
          重新检查数据源
        </button>
      </div>
      <p className="h2-file-policy" id="h2-empty-file-policy">
        仅接受 .csv，最大 {maxMegabytes} MiB。不会读取任意本地路径或自动上传其他文件。
      </p>
      {error ? <p className="h2-message h2-message--error" role="alert">{error}</p> : null}
      <StatusBadge tone={mode === 'LIVE_ANALYSIS' ? 'live' : 'fixture'}>
        {mode === 'LIVE_ANALYSIS' ? 'LIVE · 本地分析' : 'FIXTURE · 固定样例'}
      </StatusBadge>
    </main>
  )
}
