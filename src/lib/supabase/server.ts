import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

type CookieStore = Awaited<ReturnType<typeof cookies>>;

function buildClient(cookieStore: CookieStore, writable: boolean) {
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet: Array<{ name: string; value: string; options?: Record<string, unknown> }>) => {
        if (!writable) return;
        cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options as any));
      }
    }
  });
}

export async function createClient() {
  const cookieStore = await cookies();
  return buildClient(cookieStore, true);
}

export async function createReadOnlyClient() {
  const cookieStore = await cookies();
  return buildClient(cookieStore, false);
}
