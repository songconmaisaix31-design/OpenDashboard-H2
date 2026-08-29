import type { H2ImportProgressState } from '../../model/view-state.ts'

export function CsvImportProgress({
  onCancel,
  progress,
}: {
  readonly onCancel: () => void
  readonly progress: H2ImportProgressState
}) {
  const percent = progress.totalBytes === 0
    ? 0
    : Math.min(100, Math.round(progress.uploadedBytes / progress.totalBytes * 100))
  const phaseLabel = {
    preparing: '正在创建本地分片会话',
    uploading: `正在顺序上传第 ${Math.min(progress.completedChunks + 1, progress.totalChunks)} / ${progress.totalChunks} 片`,
    retrying: '当前分片可重试，正在用相同请求 ID 与哈希执行一次幂等重试',
    finalizing: '正在核对总字节数、分片数与完整 SHA-256',
  }[progress.phase]
  return (
    <div className="h2-import-progress" role="status">
      <div><strong>{phaseLabel}</strong><span>{percent}%</span></div>
      <progress aria-label="CSV 分片导入进度" max={100} value={percent}>{percent}%</progress>
      <p>{progress.uploadedBytes.toLocaleString('zh-CN')} / {progress.totalBytes.toLocaleString('zh-CN')} 字节</p>
      <button className="h2-button h2-button--ghost" onClick={onCancel} type="button">
        取消导入
      </button>
    </div>
  )
}
