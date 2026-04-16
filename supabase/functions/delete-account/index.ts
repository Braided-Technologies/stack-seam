// delete-account: hard-deletes a user's account and (optionally) their organization
// User must confirm by sending their own email address in the request body.
// All FK relationships use ON DELETE CASCADE so user_roles, user_applications,
// org_settings, etc. clean up automatically.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

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
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Vary": "Origin",
  };
}

function redactEmail(email: string | null | undefined): string {
  if (!email) return "(none)";
  const [local, domain] = email.split("@");
  if (!local || !domain) return "***";
  return `${local[0]}***@${domain}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify the caller's identity via service-role client + JWT
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    const adminClient = createClient(supabaseUrl, serviceKey);
    const { data: { user }, error: authError } = await adminClient.auth.getUser(jwt);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const { confirm_email, delete_organization } = body;

    if (!confirm_email || confirm_email.toLowerCase() !== (user.email || "").toLowerCase()) {
      return new Response(JSON.stringify({ error: "Confirmation email does not match your account" }), {
        status: 400,
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Look up the user's org and role
    const { data: roleRow } = await adminClient
      .from("user_roles")
      .select("role, organization_id")
      .eq("user_id", user.id)
      .maybeSingle();

    const orgId = roleRow?.organization_id;
    const isOrgAdmin = roleRow?.role === "admin" || roleRow?.role === "platform_admin";

    // If the user requested org deletion AND they're an admin, delete the org first.
    // ON DELETE CASCADE will handle user_roles, user_applications, contacts, etc.
    if (delete_organization && orgId && isOrgAdmin) {
      // Make sure they're the only member, OR they explicitly want to delete with members
      const { count } = await adminClient
        .from("user_roles")
        .select("*", { count: "exact", head: true })
        .eq("organization_id", orgId);

      if ((count || 0) > 1) {
        return new Response(JSON.stringify({
          error: "Cannot delete organization while other members exist. Remove other members first or transfer ownership.",
        }), {
          status: 400,
          headers: { ...corsHeaders(req), "Content-Type": "application/json" },
        });
      }

      const { error: orgDeleteErr } = await adminClient
        .from("organizations")
        .delete()
        .eq("id", orgId);

      if (orgDeleteErr) {
        console.error("Org delete failed:", orgDeleteErr);
        return new Response(JSON.stringify({ error: "Failed to delete organization" }), {
          status: 500,
          headers: { ...corsHeaders(req), "Content-Type": "application/json" },
        });
      }
    }

    // Delete the auth user — this cascades to user_roles, etc.
    const { error: deleteErr } = await adminClient.auth.admin.deleteUser(user.id);
    if (deleteErr) {
      console.error("Auth user delete failed:", deleteErr);
      return new Response(JSON.stringify({ error: "Failed to delete account: " + deleteErr.message }), {
        status: 500,
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }

    console.log("Account deleted", { user_id: user.id, email: redactEmail(user.email), org_deleted: !!delete_organization });

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("delete-account error:", e);
    return new Response(JSON.stringify({ error: e.message || "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });
  }
});
