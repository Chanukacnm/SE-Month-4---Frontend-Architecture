import type { Role, User } from '@/types';

const STORAGE_KEY = 'adminflow-db-v1';

const FIRST = ['Amara', 'Ben', 'Chen', 'Dilan', 'Elena', 'Farah', 'George', 'Hiro', 'Isla', 'Jamal', 'Kavya', 'Liam', 'Maya', 'Noah', 'Olivia', 'Priya', 'Quinn', 'Ravi', 'Sara', 'Tomás'];
const LAST = ['Perera', 'Smith', 'Wang', 'Silva', 'Garcia', 'Khan', 'Brown', 'Tanaka', 'Fernando', 'Okafor', 'Nair', 'Murphy', 'Cohen', 'Jensen', 'Rossi'];
const DEPARTMENTS = ['Engineering', 'Sales', 'Marketing', 'Support', 'Finance', 'Operations'];
const ROLES: Role[] = ['admin', 'editor', 'user', 'user', 'user', 'editor'];

/** Deterministic PRNG so the seeded dataset is identical on every machine. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedUsers(count = 137): User[] {
  const rand = mulberry32(42);
  const pick = <T,>(arr: T[]) => arr[Math.floor(rand() * arr.length)];
  const now = Date.UTC(2026, 9, 1);
  return Array.from({ length: count }, (_, i) => {
    const first = pick(FIRST);
    const last = pick(LAST);
    return {
      id: `usr_${(i + 1).toString().padStart(4, '0')}`,
      name: `${first} ${last}`,
      email: `${first}.${last}${i}@example.com`.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''),
      role: pick(ROLES),
      isActive: rand() > 0.18,
      department: pick(DEPARTMENTS),
      createdAt: new Date(now - Math.floor(rand() * 400) * 86_400_000).toISOString(),
      deletedAt: null,
    };
  });
}

interface DbShape {
  users: User[];
}

function load(): DbShape {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as DbShape;
  } catch {
    // Corrupt or unavailable storage — fall through to a fresh seed.
  }
  return { users: seedUsers() };
}

export const db: DbShape = load();

export function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  } catch {
    // Storage full or blocked; the in-memory copy still works for this session.
  }
}

export function resetDb() {
  db.users = seedUsers();
  persist();
}

export const departments = DEPARTMENTS;
