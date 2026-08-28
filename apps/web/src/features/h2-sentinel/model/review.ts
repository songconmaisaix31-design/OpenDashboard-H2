import type {
  H2LocalReviewActor,
  H2ReviewAction,
  H2ReviewState,
} from '@opendashboard/h2-contracts'

export interface H2ReviewDraft {
  readonly action: H2ReviewAction
  readonly actorName: string
  readonly note: string
}

export interface H2ReviewTarget {
  readonly runId: string
  readonly eventId: string
  readonly revision: number
}

export function isH2ReviewTargetCurrent(
  active: H2ReviewTarget | null,
  submitted: H2ReviewTarget,
): boolean {
  return active !== null &&
    active.runId === submitted.runId &&
    active.eventId === submitted.eventId &&
    active.revision === submitted.revision
}

export type H2ReviewDraftValidation =
  | {
      readonly valid: true
      readonly actor: H2LocalReviewActor
      readonly note?: string
    }
  | { readonly valid: false; readonly message: string }

export function validateH2ReviewDraft(
  draft: H2ReviewDraft,
): H2ReviewDraftValidation {
  const actorName = draft.actorName.trim()
  const note = draft.note.trim()
  if (
    actorName.length === 0 ||
    Array.from(actorName).length > 64 ||
    /[\u0000-\u001f\u007f]/u.test(actorName)
  ) {
    return {
      valid: false,
      message: '本地操作人名称需为 1–64 个字符，且不能包含控制字符。',
    }
  }
  if (
    Array.from(note).length > 2_000 ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(note)
  ) {
    return {
      valid: false,
      message: '复核备注最多 2,000 个字符，且不能包含非法控制字符。',
    }
  }
  if (draft.action !== 'confirm' && note.length === 0) {
    return {
      valid: false,
      message: '驳回、闭环、重开和添加备注都必须填写原因。',
    }
  }
  return {
    valid: true,
    actor: { kind: 'local_operator', displayName: actorName },
    ...(note.length > 0 ? { note } : {}),
  }
}

export function getH2ReviewActions(
  state: H2ReviewState,
): readonly H2ReviewAction[] {
  if (state === 'open') return ['confirm', 'reject', 'add_note']
  if (state === 'confirmed') return ['resolve', 'reopen', 'add_note']
  return ['reopen', 'add_note']
}

export function isH2ReviewConflict(error: unknown): boolean {
  const codes = readH2ErrorCodes(error)
  return codes.includes('review.conflict') || codes.includes('review_conflict')
}

export function h2ReviewFailureMessage(error: unknown): string {
  const codes = readH2ErrorCodes(error)
  if (codes.includes('review.note_required') || codes.includes('review_note_required')) {
    return '该复核操作必须填写备注；没有保存任何变更。'
  }
  if (codes.includes('review.invalid_transition') || codes.includes('review_invalid_transition')) {
    return '当前状态不允许该复核操作；请重新加载后再试。'
  }
  if (
    codes.includes('review.idempotency_conflict') ||
    codes.includes('review_idempotency_conflict')
  ) {
    return '复核请求标识发生冲突；没有重复写入记录。'
  }
  return '复核未保存；事件检测结果和当前日志保持不变。'
}

let fallbackRequestSequence = 0

export function createH2ReviewRequestId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return `web-${globalThis.crypto.randomUUID()}`
  }
  fallbackRequestSequence += 1
  return `web-${Date.now()}-${fallbackRequestSequence}`
}

function readH2ErrorCodes(error: unknown): readonly string[] {
  if (typeof error !== 'object' || error === null) return []
  const codes: string[] = []
  if ('code' in error && typeof error.code === 'string') codes.push(error.code)
  if ('remoteCode' in error && typeof error.remoteCode === 'string') {
    codes.push(error.remoteCode)
  }
  return codes
}
