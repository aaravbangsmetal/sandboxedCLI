import "server-only";

function requiredEnvironmentValue(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

export function supabasePublicConfig() {
  return {
    url: requiredEnvironmentValue("NEXT_PUBLIC_SUPABASE_URL"),
    publishableKey: requiredEnvironmentValue("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
  };
}

export function optionalSupabasePublicConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  return url && publishableKey ? { url, publishableKey } : null;
}

export function supabaseServiceRoleKey() {
  return requiredEnvironmentValue("SUPABASE_SERVICE_ROLE_KEY");
}
