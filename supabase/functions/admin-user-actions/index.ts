import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify calling user
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller }, error: authError } = await userClient.auth.getUser();
    if (authError || !caller) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { action, target_user_id } = body;

    if (!action || !target_user_id) {
      return new Response(JSON.stringify({ error: "Missing action or target_user_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!["reset_password", "reset_mfa"].includes(action)) {
      return new Response(JSON.stringify({ error: "Invalid action" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Authorization: caller must be platform_admin OR org admin of the target user's org
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: callerRole } = await adminClient
      .from("user_roles")
      .select("role, organization_id")
      .eq("user_id", caller.id)
      .maybeSingle();

    const isPlatformAdmin = callerRole?.role === "platform_admin";

    if (!isPlatformAdmin) {
      // Must be org admin and target must be in the same org
      if (callerRole?.role !== "admin") {
        return new Response(JSON.stringify({ error: "Insufficient permissions" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: targetRole } = await adminClient
        .from("user_roles")
        .select("organization_id")
        .eq("user_id", target_user_id)
        .maybeSingle();

      if (!targetRole || targetRole.organization_id !== callerRole.organization_id) {
        return new Response(JSON.stringify({ error: "User not in your organization" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    if (action === "reset_password") {
      // Get user email, then send password recovery
      const { data: targetUser, error: getUserError } = await adminClient.auth.admin.getUserById(target_user_id);
      if (getUserError || !targetUser?.user?.email) {
        return new Response(JSON.stringify({ error: "User not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Generate a password reset link
      const { error: resetError } = await adminClient.auth.admin.generateLink({
        type: "recovery",
        email: targetUser.user.email,
      });

      if (resetError) {
        console.error("Password reset error:", resetError.message);
        return new Response(JSON.stringify({ error: "Failed to send password reset" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(
        JSON.stringify({ success: true, message: `Password reset email sent to ${targetUser.user.email}` }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "reset_mfa") {
      // List and unenroll all MFA factors for target user
      const { data: factors, error: factorsError } = await adminClient.auth.admin.mfa.listFactors({
        userId: target_user_id,
      });

      if (factorsError) {
        console.error("MFA list factors error:", factorsError.message);
        return new Response(JSON.stringify({ error: "Failed to reset 2FA" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const allFactors = [...(factors?.totp || []), ...(factors?.phone || [])];
      let unenrolled = 0;

      for (const factor of allFactors) {
        const { error: unenrollError } = await adminClient.auth.admin.mfa.deleteFactor({
          userId: target_user_id,
          factorId: factor.id,
        });
        if (!unenrollError) unenrolled++;
      }

      return new Response(
        JSON.stringify({ success: true, message: `Reset 2FA for user. Removed ${unenrolled} factor(s).` }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("admin-user-actions error:", err);
    return new Response(JSON.stringify({ error: "An internal error occurred" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
