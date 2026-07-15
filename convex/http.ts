import { httpRouter } from "convex/server";
import { internal } from "./_generated/api";
import { httpAction } from "./_generated/server";

const http = httpRouter();

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function retroPage(title: string, message: string, tone: "ok" | "error"): Response {
  const color = tone === "ok" ? "#39ff14" : "#ff2244";
  const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>BitPoint Arcade</title></head>
<body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#08000f;font-family:monospace;color:#e8e6f0;text-align:center;">
  <div style="border:3px solid ${color};box-shadow:0 0 24px ${color};padding:40px;max-width:520px;">
    <div style="font-size:40px;margin-bottom:16px;">👾</div>
    <h1 style="color:${color};font-size:18px;letter-spacing:2px;">${escapeHtml(title)}</h1>
    <p style="line-height:1.7;">${escapeHtml(message)}</p>
    <p style="opacity:.6;font-size:12px;">You can close this tab and return to the arcade.</p>
  </div>
</body></html>`;
  return new Response(html, {
    status: tone === "ok" ? 200 : 400,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

/**
 * Linear OAuth redirect lands here:
 *   https://<deployment>.convex.site/linear/callback
 * Exchanges the code server-side, then bounces back to the app (APP_URL).
 */
http.route({
  path: "/linear/callback",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const error = url.searchParams.get("error");
    if (error) {
      return retroPage(
        "CONNECTION REFUSED",
        `Linear said: ${url.searchParams.get("error_description") ?? error}`,
        "error",
      );
    }
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    if (!code || !state) {
      return retroPage("BAD CALLBACK", "Missing code or state parameter.", "error");
    }
    try {
      const redirectTo = await ctx.runAction(internal.linear.completeOauth, { code, state });
      if (redirectTo) return Response.redirect(redirectTo, 302);
      return retroPage(
        "LINEAR CONNECTED",
        "Workspace linked! Set the APP_URL env var on Convex to enable automatic redirects.",
        "ok",
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return retroPage("HANDSHAKE FAILED", message, "error");
    }
  }),
});

export default http;
