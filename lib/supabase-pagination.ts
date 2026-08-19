export const SUPABASE_PAGE_SIZE = 1000;

type SupabasePageError = { message: string } | null;

type SupabasePage<T> = {
  data: T[] | null;
  error: SupabasePageError;
};

export async function fetchAllSupabaseRows<T>(
  fetchPage: (from: number, to: number) => PromiseLike<SupabasePage<T>>,
  label: string,
): Promise<T[]> {
  const rows: T[] = [];

  for (let from = 0; ; from += SUPABASE_PAGE_SIZE) {
    const { data, error } = await fetchPage(
      from,
      from + SUPABASE_PAGE_SIZE - 1,
    );

    if (error) {
      throw new Error(`${label}: ${error.message}`);
    }

    const page = data || [];
    rows.push(...page);

    if (page.length < SUPABASE_PAGE_SIZE) {
      return rows;
    }
  }
}
