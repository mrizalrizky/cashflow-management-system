import { permissionsFor, PolicyActor, PolicySubject } from './transaction-policy.js';

const ADMIN: PolicyActor = { id: 'u-1', role: 'SUPER_ADMIN' };

function subject(overrides: Partial<PolicySubject> = {}): PolicySubject {
  return { status: 'APPROVED', createdById: 'u-1', isTransfer: false, ...overrides };
}

describe('permissionsFor', () => {
  it('lets a recorded transaction be edited, given proof and voided', () => {
    expect(permissionsFor(ADMIN, subject())).toEqual({ canEdit: true, canAttach: true, canVoid: true });
  });

  it('allows nothing on a voided transaction', () => {
    expect(permissionsFor(ADMIN, subject({ status: 'VOID' }))).toEqual({
      canEdit: false,
      canAttach: false,
      canVoid: false,
    });
  });

  it('only lets a transfer side be voided, together with its pair', () => {
    expect(permissionsFor(ADMIN, subject({ isTransfer: true }))).toEqual({
      canEdit: false,
      canAttach: false,
      canVoid: true,
    });
  });
});
