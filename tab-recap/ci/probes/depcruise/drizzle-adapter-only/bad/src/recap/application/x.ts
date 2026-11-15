import { sql } from 'drizzle-orm';

export const probe = (): unknown => sql`select 1`;
