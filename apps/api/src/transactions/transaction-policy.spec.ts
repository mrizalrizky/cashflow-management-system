import type { Role, TxStatus } from '../generated/prisma/client.js';
import {
  permissionsFor,
  PolicyActor,
  PolicySubject,
  TransactionPermissions,
} from './transaction-policy.js';

const admin: PolicyActor = { id: 'admin', role: 'SUPER_ADMIN' };
const manager: PolicyActor = { id: 'manager', role: 'PROJECT_MANAGER' };
const staff: PolicyActor = { id: 'staff', role: 'STAFF' };

function tx(overrides: Partial<PolicySubject> = {}): PolicySubject {
  return {
    status: 'PENDING',
    createdById: 'someone-else',
    creatorRole: 'STAFF',
    isTransfer: false,
    ...overrides,
  };
}

const NOTHING: TransactionPermissions = {
  canEdit: false,
  canCancel: false,
  canReview: false,
  canVoid: false,
  canAttach: false,
};

/** Hanya izin yang bernilai true, supaya tabel di bawah mudah dibaca. */
function granted(actor: PolicyActor, subject: PolicySubject): string[] {
  return Object.entries(permissionsFor(actor, subject))
    .filter(([, allowed]) => allowed)
    .map(([name]) => name)
    .sort();
}

describe('permissionsFor', () => {
  describe('SUPER_ADMIN', () => {
    it.each<[TxStatus, string[]]>([
      ['PENDING', ['canAttach', 'canCancel', 'canEdit', 'canReview']],
      ['REJECTED', ['canAttach', 'canEdit']],
      ['APPROVED', ['canVoid']],
      ['VOID', []],
    ])('on a %s transaction of anyone may %j', (status, expected) => {
      expect(granted(admin, tx({ status }))).toEqual(expected);
    });

    it('may review their own transaction', () => {
      expect(permissionsFor(admin, tx({ createdById: 'admin', creatorRole: 'SUPER_ADMIN' })).canReview).toBe(
        true,
      );
    });
  });

  describe.each<[string, PolicyActor]>([
    ['PROJECT_MANAGER', manager],
    ['STAFF', staff],
  ])('%s on their own transaction', (_role, actor) => {
    const own = { createdById: actor.id, creatorRole: actor.role };

    it.each<[TxStatus, string[]]>([
      ['PENDING', ['canAttach', 'canCancel', 'canEdit']],
      ['REJECTED', ['canAttach', 'canEdit']],
      ['APPROVED', []],
      ['VOID', []],
    ])('when %s may %j', (status, expected) => {
      expect(granted(actor, tx({ ...own, status }))).toEqual(expected);
    });

    it('may never review it', () => {
      expect(permissionsFor(actor, tx(own)).canReview).toBe(false);
    });
  });

  it.each<[string, PolicyActor]>([
    ['PROJECT_MANAGER', manager],
    ['STAFF', staff],
  ])("gives a %s nothing on someone else's transaction", (_role, actor) => {
    for (const status of ['PENDING', 'REJECTED', 'APPROVED', 'VOID'] as const) {
      expect(permissionsFor(actor, tx({ status }))).toEqual(NOTHING);
    }
  });

  describe('a transfer leg', () => {
    it.each<[TxStatus, string[]]>([
      ['APPROVED', ['canVoid']],
      ['VOID', []],
      ['PENDING', []],
    ])('when %s lets the admin %j', (status, expected) => {
      expect(granted(admin, tx({ status, isTransfer: true }))).toEqual(expected);
    });

    it('lets nobody else do anything, even its creator', () => {
      const leg = tx({ isTransfer: true, status: 'APPROVED', createdById: 'staff' });
      expect(permissionsFor(staff, leg)).toEqual(NOTHING);
      expect(permissionsFor(manager, leg)).toEqual(NOTHING);
    });
  });

  it('gives a role it does not know nothing at all', () => {
    const stranger = { id: 'x', role: 'AUDITOR' as Role };
    for (const status of ['PENDING', 'REJECTED', 'APPROVED', 'VOID'] as const) {
      expect(permissionsFor(stranger, tx({ status, createdById: 'x' }))).toEqual(NOTHING);
    }
  });
});
