import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify caller is platform admin
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: isPlatformAdmin } = await userClient.rpc("is_platform_admin");
    if (!isPlatformAdmin) {
      return new Response(JSON.stringify({ error: "Platform admin access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);

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

    for (const integration of integrations || []) {
      const url = integration.documentation_url;
      if (!url) continue;

      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);

        const resp = await fetch(url, {
          method: "HEAD",
          signal: controller.signal,
          redirect: "follow",
          headers: {
            "User-Agent": "StackSeam-LinkChecker/1.0",
          },
        });

        clearTimeout(timeout);

        let linkStatus = "unchecked";
        if (resp.ok) {
          linkStatus = "verified";
          results.verified++;
        } else if (resp.status === 404 || resp.status === 410) {
          linkStatus = "dead";
          results.dead++;
        } else if (resp.status === 405) {
          // HEAD not supported, try GET
          const getResp = await fetch(url, {
            method: "GET",
            redirect: "follow",
            headers: { "User-Agent": "StackSeam-LinkChecker/1.0" },
          });
          // Consume the body
          await getResp.text();
          if (getResp.ok) {
            linkStatus = "verified";
            results.verified++;
          } else {
            linkStatus = "dead";
            results.dead++;
          }
        } else {
          linkStatus = "dead";
          results.dead++;
        }

        await serviceClient
          .from("integrations")
          .update({ link_status: linkStatus, last_verified: new Date().toISOString() })
          .eq("id", integration.id);

        results.checked.push({
          id: integration.id,
          url,
          status: linkStatus,
          httpStatus: resp.status,
        });
      } catch (e: any) {
        results.errors++;
        await serviceClient
          .from("integrations")
          .update({ link_status: "dead", last_verified: new Date().toISOString() })
          .eq("id", integration.id);

        results.checked.push({
          id: integration.id,
          url,
          status: "dead",
        });
      }

      // Small delay to avoid hammering external servers
      await new Promise(r => setTimeout(r, 200));
    }

    return new Response(JSON.stringify({ success: true, results }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("verify-integration-links error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
