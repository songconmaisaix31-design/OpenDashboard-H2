import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { CONTRACT_EXAMPLE_SNAPSHOT } from '../src/contract-example.ts'

describe('CONTRACT_EXAMPLE_SNAPSHOT', () => {
  it('keeps references and fixture provenance internally consistent', () => {
    const snapshot = CONTRACT_EXAMPLE_SNAPSHOT
    const evidenceIds = new Set(snapshot.evidence.map(({ id }) => id))

    assert(snapshot.incident.evidenceIds.every((id) => evidenceIds.has(id)))
    assert(snapshot.workflow.evidenceIds.every((id) => evidenceIds.has(id)))

    if (!snapshot.approval || !snapshot.action || !snapshot.verification) {
      throw new Error('Recovered contract example is incomplete.')
    }

    assert.equal(snapshot.action.approvalId, snapshot.approval.id)
    assert.equal(snapshot.verification.targetId, snapshot.target.id)

    const provenance = [
      snapshot.target.provenance,
      snapshot.incident.provenance,
      snapshot.workflow.provenance,
      snapshot.approval.provenance,
      snapshot.action.provenance,
      snapshot.verification.provenance,
      ...snapshot.providerHealth.map(({ provenance: item }) => item),
      ...snapshot.evidence.map(({ provenance: item }) => item),
      ...snapshot.audit.map(({ provenance: item }) => item),
    ]

    assert(provenance.every((item) => item.mode === 'fixture' && item.mocked))
  })
})
