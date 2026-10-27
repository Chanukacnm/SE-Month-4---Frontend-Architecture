import type { Paginated, User, UserInput, UserListParams } from '@/types';
import { createId } from '@/utils/id';
import { ApiError, request } from './client';
import { db, persist } from './db';

function findUser(id: string): User {
  const user = db.users.find((u) => u.id === id);
  if (!user) throw new ApiError('User not found', 404);
  return user;
}

function assertUniqueEmail(email: string, ignoreId?: string) {
  const taken = db.users.some((u) => u.email.toLowerCase() === email.toLowerCase() && u.id !== ignoreId && !u.deletedAt);
  if (taken) throw new ApiError('A user with this email already exists', 409);
}

export const usersApi = {
  list: (params: UserListParams): Promise<Paginated<User>> =>
    request(() => {
      const q = params.search.trim().toLowerCase();
      let rows = db.users.filter((u) => {
        if (params.status === 'deleted') return u.deletedAt !== null;
        if (u.deletedAt) return false;
        if (params.status === 'active' && !u.isActive) return false;
        if (params.status === 'inactive' && u.isActive) return false;
        if (params.role !== 'all' && u.role !== params.role) return false;
        if (q && !`${u.name} ${u.email} ${u.department}`.toLowerCase().includes(q)) return false;
        return true;
      });

      const dir = params.sortDir === 'asc' ? 1 : -1;
      rows = [...rows].sort((a, b) => a[params.sortBy].localeCompare(b[params.sortBy]) * dir);

      const total = rows.length;
      const totalPages = Math.max(1, Math.ceil(total / params.pageSize));
      const page = Math.min(params.page, totalPages);
      const start = (page - 1) * params.pageSize;
      return { items: rows.slice(start, start + params.pageSize), total, page, pageSize: params.pageSize, totalPages };
    }),

  get: (id: string): Promise<User> => request(() => findUser(id)),

  create: (input: UserInput): Promise<User> =>
    request(() => {
      assertUniqueEmail(input.email);
      const user: User = { ...input, id: createId('usr'), createdAt: new Date().toISOString(), deletedAt: null };
      db.users.unshift(user);
      persist();
      return user;
    }),

  update: (id: string, input: Partial<UserInput>): Promise<User> =>
    request(() => {
      if (input.email) assertUniqueEmail(input.email, id);
      const user = findUser(id);
      Object.assign(user, input);
      persist();
      return user;
    }),

  /** Soft delete: the record stays in the DB with a timestamp and can be restored. */
  remove: (id: string): Promise<User> =>
    request(() => {
      const user = findUser(id);
      user.deletedAt = new Date().toISOString();
      persist();
      return user;
    }),

  restore: (id: string): Promise<User> =>
    request(() => {
      const user = findUser(id);
      assertUniqueEmail(user.email, id);
      user.deletedAt = null;
      persist();
      return user;
    }),

  stats: () =>
    request(() => {
      const live = db.users.filter((u) => !u.deletedAt);
      return { total: live.length, active: live.filter((u) => u.isActive).length };
    }),
};
