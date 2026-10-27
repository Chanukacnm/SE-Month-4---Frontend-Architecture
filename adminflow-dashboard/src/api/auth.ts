import type { AuthUser, Credentials } from '@/types';
import { ApiError, request } from './client';

/** Demo accounts — documented on the login screen and in the README. */
const ACCOUNTS: Array<AuthUser & { password: string }> = [
  { id: 'adm_1', name: 'Alex Admin', email: 'admin@adminflow.io', role: 'admin', password: 'Admin@123' },
  { id: 'edt_1', name: 'Erin Editor', email: 'editor@adminflow.io', role: 'editor', password: 'Editor@123' },
];

export const authApi = {
  login: ({ email, password }: Credentials): Promise<{ user: AuthUser; token: string }> =>
    request(() => {
      const account = ACCOUNTS.find((a) => a.email === email.trim().toLowerCase());
      if (!account || account.password !== password) {
        throw new ApiError('Invalid email or password', 401);
      }
      const { password: _omit, ...user } = account;
      void _omit;
      // Opaque fake token; a real backend would return a signed JWT.
      const token = btoa(`${user.id}:${Date.now()}`);
      return { user, token };
    }),
};
