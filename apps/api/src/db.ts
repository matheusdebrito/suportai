import pg from 'pg';
export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
export const query = (text: string, values: unknown[] = []) => pool.query(text, values);
export async function transaction<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}
export const audit = async (actor: string | null, action: string, resource: string | null = null) => {
  await query('INSERT INTO audit_events(actor_id,action,resource_id) VALUES($1,$2,$3)',[actor,action,resource]);
};
