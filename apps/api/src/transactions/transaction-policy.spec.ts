import type { Role, TxStatus } from '../generated/prisma/client.js';
import {
  canRecordFor,
  permissionsFor,
  PolicyActor,
  PolicySubject,
  TransactionPermissions,
} from './transaction-policy.js';

const PROJECT_A = 'project-a';
const PROJECT_B = 'project-b';

const admin: PolicyActor = { id: 'admin', role: 'SUPER_ADMIN', assignedProjectIds: new Set() };
const manager: PolicyActor = {
  id: 'manager',
  role: 'PROJECT_MANAGER',
  assignedProjectIds: new Set([PROJECT_A]),
};
const staff: PolicyActor = { id: 'staff', role: 'STAFF', assignedProjectIds: new Set() };

function tx(overrides: Partial<PolicySubject> = {}): PolicySubject {
  return {
    status: 'PENDING',
    projectId: PROJECT_A,
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
      expect(granted(admin, tx({ status, projectId: null }))).toEqual(expected);
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

  describe('PROJECT_MANAGER reviewing', () => {
    it.each<[string, Partial<PolicySubject>, boolean]>([
      ["a staff member's transaction on an assigned project", {}, true],
      ["an admin's transaction on an assigned project", { creatorRole: 'SUPER_ADMIN' }, true],
      ["another project manager's transaction on an assigned project", { creatorRole: 'PROJECT_MANAGER' }, false],
      ['a transaction on a project they are not assigned to', { projectId: PROJECT_B }, false],
      ['an overhead transaction', { projectId: null }, false],
      ['a transaction that is no longer pending', { status: 'REJECTED' }, false],
      ['an approved transaction', { status: 'APPROVED' }, false],
    ])('%s: %s', (_label, overrides, expected) => {
      expect(permissionsFor(manager, tx(overrides)).canReview).toBe(expected);
    });

    it("may do nothing else to someone else's transaction", () => {
      expect(granted(manager, tx())).toEqual(['canReview']);
      expect(granted(manager, tx({ status: 'APPROVED' }))).toEqual([]);
    });
  });

  it("gives STAFF nothing on someone else's transaction", () => {
    for (const status of ['PENDING', 'REJECTED', 'APPROVED', 'VOID'] as const) {
      expect(permissionsFor(staff, tx({ status }))).toEqual(NOTHING);
    }
  });

  it('answers by ownership even for a project the manager no longer belongs to', () => {
    // Yang menyembunyikan transaksi ini dari koordinator adalah scope, bukan policy.
    const own = tx({ createdById: 'manager', creatorRole: 'PROJECT_MANAGER', projectId: PROJECT_B });
    expect(granted(manager, own)).toEqual(['canAttach', 'canCancel', 'canEdit']);
  });

  describe('a transfer leg', () => {
    it.each<[TxStatus, string[]]>([
      ['APPROVED', ['canVoid']],
      ['VOID', []],
      ['PENDING', []],
    ])('when %s lets the admin %j', (status, expected) => {
      expect(granted(admin, tx({ status, isTransfer: true, projectId: null }))).toEqual(expected);
    });

    it('lets nobody else do anything, even its creator', () => {
      const leg = tx({ isTransfer: true, status: 'APPROVED', createdById: 'staff' });
      expect(permissionsFor(staff, leg)).toEqual(NOTHING);
      expect(permissionsFor(manager, leg)).toEqual(NOTHING);
    });
  });

  it('gives a role it does not know nothing at all', () => {
    const stranger = { id: 'x', role: 'AUDITOR' as Role, assignedProjectIds: new Set([PROJECT_A]) };
    for (const status of ['PENDING', 'REJECTED', 'APPROVED', 'VOID'] as const) {
      expect(permissionsFor(stranger, tx({ status, createdById: 'x' }))).toEqual(NOTHING);
    }
  });
});

describe('canRecordFor', () => {
  it.each<[string, PolicyActor, string | null, boolean]>([
    ['SUPER_ADMIN on any project', admin, PROJECT_B, true],
    ['SUPER_ADMIN on overhead', admin, null, true],
    ['STAFF on any project', staff, PROJECT_B, true],
    ['STAFF on overhead', staff, null, true],
    ['PROJECT_MANAGER on an assigned project', manager, PROJECT_A, true],
    ['PROJECT_MANAGER on an unassigned project', manager, PROJECT_B, false],
    ['PROJECT_MANAGER on overhead', manager, null, false],
    ['an unknown role', { id: 'x', role: 'AUDITOR' as Role, assignedProjectIds: new Set() }, PROJECT_A, false],
  ])('%s', (_label, actor, projectId, expected) => {
    expect(canRecordFor(actor, projectId)).toBe(expected);
  });
});
