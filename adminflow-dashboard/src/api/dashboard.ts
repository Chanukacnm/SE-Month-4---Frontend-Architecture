import type { Activity, DashboardData, TrendPoint } from '@/types';
import { request } from './client';
import { db } from './db';

const MONTHS = ['Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct'];

const TREND: TrendPoint[] = MONTHS.map((label, i) => ({
  label,
  revenue: Math.round(42_000 + i * 3_100 + Math.sin(i * 1.3) * 5_500),
  orders: Math.round(610 + i * 38 + Math.cos(i * 1.1) * 70),
}));

const ACTIVITY: Activity[] = [
  { id: 'a1', actor: 'Alex Admin', action: 'invited', target: 'Priya Nair', at: minutesAgo(4) },
  { id: 'a2', actor: 'Erin Editor', action: 'updated role for', target: 'Ben Smith', at: minutesAgo(27) },
  { id: 'a3', actor: 'System', action: 'processed refund for', target: 'order #48213', at: minutesAgo(65) },
  { id: 'a4', actor: 'Alex Admin', action: 'deactivated', target: 'Quinn Murphy', at: minutesAgo(180) },
  { id: 'a5', actor: 'Erin Editor', action: 'published', target: 'October pricing page', at: minutesAgo(420) },
];

function minutesAgo(m: number) {
  return new Date(Date.now() - m * 60_000).toISOString();
}

export const dashboardApi = {
  get: (): Promise<DashboardData> =>
    request(() => {
      const live = db.users.filter((u) => !u.deletedAt);
      const last = TREND[TREND.length - 1];
      const prev = TREND[TREND.length - 2];
      const pct = (a: number, b: number) => Number((((a - b) / b) * 100).toFixed(1));
      return {
        metrics: [
          { id: 'users', label: 'Total users', value: live.length, format: 'number', change: 4.2 },
          { id: 'revenue', label: 'Revenue (Oct)', value: last.revenue, format: 'currency', change: pct(last.revenue, prev.revenue) },
          { id: 'orders', label: 'Orders (Oct)', value: last.orders, format: 'number', change: pct(last.orders, prev.orders) },
          {
            id: 'conversion',
            label: 'Active rate',
            value: (live.filter((u) => u.isActive).length / Math.max(live.length, 1)) * 100,
            format: 'percent',
            change: -0.8,
          },
        ],
        trend: TREND,
        activity: ACTIVITY,
      };
    }),
};
