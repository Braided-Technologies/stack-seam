import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js/cors";

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
    const scalepadApiKey = Deno.env.get("SCALEPAD_API_KEY");

    if (!scalepadApiKey) {
      return new Response(
        JSON.stringify({ error: "ScalePad API key not configured" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

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
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch assets from ScalePad Lifecycle Manager API
    // ScalePad API: GET /api/v1/assets with Authorization: Bearer <key>
    const scalepadBaseUrl = "https://app.scalepad.com/api/v1";
    
    const assetsRes = await fetch(`${scalepadBaseUrl}/assets`, {
      headers: {
        Authorization: `Bearer ${scalepadApiKey}`,
        Accept: "application/json",
      },
    });

    if (!assetsRes.ok) {
      const errText = await assetsRes.text();
      return new Response(
        JSON.stringify({ error: `ScalePad API error: ${assetsRes.status}`, details: errText }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const assetsData = await assetsRes.json();
    const assets = Array.isArray(assetsData) ? assetsData : assetsData.data || assetsData.items || [];

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

    for (const asset of assets) {
      // Try to match by product/vendor name
      const assetName = (asset.productName || asset.product_name || asset.name || "").toLowerCase().trim();
      const vendorName = (asset.vendorName || asset.vendor_name || asset.manufacturer || "").toLowerCase().trim();

      let appId: string | undefined;

      // Try exact match first
      appId = appNameMap.get(assetName);

      // Try vendor name
      if (!appId && vendorName) {
        appId = appNameMap.get(vendorName);
      }

      // Try partial match
      if (!appId) {
        for (const [name, id] of appNameMap.entries()) {
          if (assetName.includes(name) || name.includes(assetName)) {
            appId = id;
            break;
          }
        }
      }

      if (!appId) continue;
      matched++;

      // Extract contract data from ScalePad asset
      const contractEnd = asset.warrantyEndDate || asset.warranty_end_date || asset.contractEndDate || asset.contract_end_date || null;
      const cost = asset.purchasePrice || asset.purchase_price || asset.cost || null;
      const licenseCount = asset.quantity || asset.license_count || null;

      const updateData: Record<string, any> = {};
      if (contractEnd) updateData.renewal_date = contractEnd;
      if (cost) updateData.cost_annual = Number(cost);
      if (licenseCount) updateData.license_count = Number(licenseCount);

      if (Object.keys(updateData).length === 0) continue;

      if (existingAppIds.has(appId)) {
        // Update existing
        const uaId = existingUAMap.get(appId);
        if (uaId) {
          await serviceClient
            .from("user_applications")
            .update(updateData)
            .eq("id", uaId);
          updated++;
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        total_assets: assets.length,
        matched,
        updated,
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
