import { permissionsFor, PolicySubject } from './transaction-policy.js';

function subject(overrides: Partial<PolicySubject> = {}): PolicySubject {
  return { status: 'APPROVED', createdById: 'u-1', isTransfer: false, ...overrides };
}

describe('permissionsFor', () => {
  it('lets a recorded transaction be edited, given proof and voided', () => {
    expect(permissionsFor(subject())).toEqual({ canEdit: true, canAttach: true, canVoid: true });
  });

  it('allows nothing on a voided transaction', () => {
    expect(permissionsFor(subject({ status: 'VOID' }))).toEqual({
      canEdit: false,
      canAttach: false,
      canVoid: false,
    });
  });

  it('only lets a transfer side be voided, together with its pair', () => {
    expect(permissionsFor(subject({ isTransfer: true }))).toEqual({
      canEdit: false,
      canAttach: false,
      canVoid: true,
    });
  });
});
