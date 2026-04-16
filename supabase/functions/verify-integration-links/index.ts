import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGINS = [
  "https://stackseam.tech",
  "https://www.stackseam.tech",
  "http://localhost:8080",
  "http://localhost:5173",
];

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") || "";
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
    "Vary": "Origin",
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(req) });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify caller is platform admin via service-role client + JWT
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);
    const { data: { user }, error: authError } = await serviceClient.auth.getUser(jwt);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const { data: roleRow } = await serviceClient
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .maybeSingle();

    if (roleRow?.role !== "platform_admin") {
      return new Response(JSON.stringify({ error: "Platform admin access required" }), {
        status: 403,
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Fetch all integrations with documentation URLs
    const { data: integrations, error: fetchErr } = await serviceClient
      .from("integrations")
      .select("id, documentation_url, link_status")
      .not("documentation_url", "is", null)
      .neq("documentation_url", "");

    if (fetchErr) throw fetchErr;

    const results = {
      total: integrations?.length || 0,
      verified: 0,
      dead: 0,
      errors: 0,
      checked: [] as { id: string; url: string; status: string; httpStatus?: number }[],
    };

    // Process in parallel batches of 10
    const BATCH_SIZE = 10;
    for (let batchStart = 0; batchStart < (integrations?.length || 0); batchStart += BATCH_SIZE) {
      const batch = (integrations || []).slice(batchStart, batchStart + BATCH_SIZE);

      const batchResults = await Promise.allSettled(batch.map(async (integration) => {
        const url = integration.documentation_url;
        if (!url) return null;

        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 8000);

          const resp = await fetch(url, {
            method: "HEAD",
            signal: controller.signal,
            redirect: "follow",
            headers: { "User-Agent": "StackSeam-LinkChecker/1.0" },
          });

          clearTimeout(timeout);

          let linkStatus = "unchecked";
          if (resp.ok) {
            linkStatus = "verified";
          } else if (resp.status === 404 || resp.status === 410) {
            linkStatus = "dead";
          } else if (resp.status === 405) {
            const getResp = await fetch(url, {
              method: "GET",
              redirect: "follow",
              headers: { "User-Agent": "StackSeam-LinkChecker/1.0" },
            });
            await getResp.text();
            linkStatus = getResp.ok ? "verified" : "dead";
          } else {
            linkStatus = "dead";
          }

          await serviceClient
            .from("integrations")
            .update({ link_status: linkStatus, last_verified: new Date().toISOString() })
            .eq("id", integration.id);

          if (linkStatus === "verified") results.verified++;
          else results.dead++;

          results.checked.push({ id: integration.id, url, status: linkStatus, httpStatus: resp.status });
        } catch (e: any) {
          results.errors++;
          await serviceClient
            .from("integrations")
            .update({ link_status: "dead", last_verified: new Date().toISOString() })
            .eq("id", integration.id);
          results.checked.push({ id: integration.id, url, status: "dead" });
        }
        return null;
      }));
    }

    return new Response(JSON.stringify({ success: true, results }), {
      status: 200,
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("verify-integration-links error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });
  }
});
