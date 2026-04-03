import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js/cors";

const SCALEPAD_BASE = "https://api.scalepad.com/core/v1";

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
    let scalepadApiKey = Deno.env.get("SCALEPAD_API_KEY") || "";

    // Verify user
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get user's org
    const { data: orgIdData } = await userClient.rpc("get_user_org_id");
    if (!orgIdData) {
      return new Response(JSON.stringify({ error: "No organization found" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const orgId = orgIdData;

    // Check admin
    const { data: isAdmin } = await userClient.rpc("is_org_admin", { _org_id: orgId });
    const { data: isPlatformAdmin } = await userClient.rpc("is_platform_admin");
    if (!isAdmin && !isPlatformAdmin) {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch ALL hardware assets from ScalePad (paginated)
    const allAssets: any[] = [];
    let cursor: string | null = null;

    do {
      const url = new URL(`${SCALEPAD_BASE}/assets/hardware`);
      url.searchParams.set("page_size", "200");
      if (cursor) url.searchParams.set("cursor", cursor);

      const res = await fetch(url.toString(), {
        headers: {
          "x-api-key": scalepadApiKey,
          "Accept": "application/json",
        },
      });

      if (!res.ok) {
        const errText = await res.text();
        return new Response(
          JSON.stringify({ error: `ScalePad API error: ${res.status}`, details: errText }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const body = await res.json();
      const pageData = body.data || [];
      allAssets.push(...pageData);
      cursor = body.next_cursor || null;
    } while (cursor);

    // Get all applications from our DB
    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);
    const { data: applications } = await serviceClient
      .from("applications")
      .select("id, name");

    if (!applications) {
      return new Response(
        JSON.stringify({ error: "Failed to fetch applications" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build name lookup (lowercase)
    const appNameMap = new Map<string, string>();
    applications.forEach((app) => {
      appNameMap.set(app.name.toLowerCase(), app.id);
    });

    // Get existing user_applications for this org
    const { data: existingUAs } = await serviceClient
      .from("user_applications")
      .select("id, application_id")
      .eq("organization_id", orgId);

    const existingAppIds = new Set((existingUAs || []).map((ua) => ua.application_id));
    const existingUAMap = new Map((existingUAs || []).map((ua) => [ua.application_id, ua.id]));

    let matched = 0;
    let updated = 0;

    for (const asset of allAssets) {
      // ScalePad hardware asset fields:
      // asset.name - device name (e.g. "TYUIAJHEVI014")
      // asset.manufacturer.name - e.g. "HP Inc."
      // asset.model.number - e.g. "OptiPlex 7090"
      // asset.model.description - e.g. "Dell OptiPlex 7090 Desktop Computer"
      // asset.client.name - client org name

      const manufacturerName = (asset.manufacturer?.name || "").toLowerCase().trim();
      const modelNumber = (asset.model?.number || "").toLowerCase().trim();
      const modelDescription = (asset.model?.description || "").toLowerCase().trim();

      let appId: string | undefined;

      // Try manufacturer name match (e.g. "HP Inc." -> "HP")
      if (manufacturerName) {
        appId = appNameMap.get(manufacturerName);
        // Try partial match on manufacturer
        if (!appId) {
          for (const [name, id] of appNameMap.entries()) {
            if (manufacturerName.includes(name) || name.includes(manufacturerName)) {
              appId = id;
              break;
            }
          }
        }
      }

      // Try model description match
      if (!appId && modelDescription) {
        for (const [name, id] of appNameMap.entries()) {
          if (modelDescription.includes(name) || name.includes(modelDescription)) {
            appId = id;
            break;
          }
        }
      }

      // Try model number match
      if (!appId && modelNumber) {
        appId = appNameMap.get(modelNumber);
      }

      if (!appId) continue;
      matched++;

      // Hardware assets don't have contract/cost data directly,
      // but we track the match for reporting
      if (existingAppIds.has(appId)) {
        // Asset is already in the org's stack — could update metadata if needed
        updated++;
      }
    }

    // Also try to fetch clients for org-level info
    let clientCount = 0;
    try {
      const clientsRes = await fetch(`${SCALEPAD_BASE}/clients?page_size=10`, {
        headers: {
          "x-api-key": scalepadApiKey,
          "Accept": "application/json",
        },
      });
      if (clientsRes.ok) {
        const clientsBody = await clientsRes.json();
        clientCount = clientsBody.total_count || (clientsBody.data?.length || 0);
      }
    } catch (_e) {
      // Non-critical, continue
    }

    return new Response(
      JSON.stringify({
        success: true,
        total_assets: allAssets.length,
        matched,
        updated,
        clients_found: clientCount,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
