import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
} from "./_generated/server";
import {
  OAUTH_STATE_TTL_MS,
  buildConsensusComment,
  randomToken,
  requireHost,
} from "./lib/game";

const LINEAR_AUTHORIZE_URL = "https://linear.app/oauth/authorize";
const LINEAR_TOKEN_URL = "https://api.linear.app/oauth/token";
const LINEAR_GRAPHQL_URL = "https://api.linear.app/graphql";

/* ──────────────────────────────────────────────────────────────────────────
 * GraphQL plumbing
 * ────────────────────────────────────────────────────────────────────────── */

/** Personal API keys are sent bare; OAuth access tokens need `Bearer`. */
function authHeader(token: string): string {
  return token.startsWith("lin_api_") ? token : `Bearer ${token}`;
}

async function linearGql<T>(
  accessToken: string,
  query: string,
  variables: Record<string, unknown> = {},
): Promise<T> {
  const response = await fetch(LINEAR_GRAPHQL_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: authHeader(accessToken),
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = (await response.json()) as { data?: T; errors?: Array<{ message: string }> };
  if (!response.ok || json.errors?.length) {
    throw new Error(json.errors?.[0]?.message ?? `Linear API error (HTTP ${response.status})`);
  }
  if (!json.data) throw new Error("Linear API returned no data");
  return json.data;
}

interface LinearTeam {
  id: string;
  key: string;
  name: string;
}

/* ──────────────────────────────────────────────────────────────────────────
 * OAuth handshake
 * ────────────────────────────────────────────────────────────────────────── */

/** Purge stale CSRF states, mint a fresh one bound to (room, host session). */
export const createOauthState = internalMutation({
  args: { roomId: v.id("rooms"), sessionId: v.string() },
  handler: async (ctx, { roomId, sessionId }): Promise<string> => {
    await requireHost(ctx, roomId, sessionId);
    const now = Date.now();
    const all = await ctx.db.query("oauthStates").collect();
    for (const state of all) {
      if (now - state.createdAt > OAUTH_STATE_TTL_MS) await ctx.db.delete(state._id);
    }
    const nonce = randomToken();
    await ctx.db.insert("oauthStates", { roomId, sessionId, nonce, createdAt: now });
    return nonce;
  },
});

/** Consume (validate + delete) a CSRF state. Single-use. */
export const takeState = internalMutation({
  args: { state: v.string() },
  handler: async (ctx, { state }): Promise<{ roomId: Id<"rooms"> }> => {
    const row = await ctx.db
      .query("oauthStates")
      .withIndex("by_nonce", (q) => q.eq("nonce", state))
      .unique();
    if (!row) throw new Error("Unknown or reused OAuth state — restart the connect flow.");
    await ctx.db.delete(row._id);
    if (Date.now() - row.createdAt > OAUTH_STATE_TTL_MS) {
      throw new Error("OAuth state expired — restart the connect flow.");
    }
    return { roomId: row.roomId };
  },
});

export const attachLinear = internalMutation({
  args: {
    roomId: v.id("rooms"),
    accessToken: v.string(),
    userName: v.optional(v.string()),
    workspaceName: v.optional(v.string()),
    team: v.optional(v.object({ id: v.string(), name: v.string() })),
  },
  handler: async (ctx, { roomId, accessToken, userName, workspaceName, team }): Promise<string> => {
    const room = await ctx.db.get(roomId);
    if (!room) throw new Error("Room vanished mid-handshake");
    await ctx.db.patch(roomId, {
      linear: {
        accessToken,
        userName,
        workspaceName,
        teamId: team?.id,
        teamName: team?.name,
      },
    });
    return room.code;
  },
});

/** Like attachLinear, but gated on the host's session (API-key flow). */
export const attachLinearAsHost = internalMutation({
  args: {
    roomId: v.id("rooms"),
    sessionId: v.string(),
    accessToken: v.string(),
    userName: v.optional(v.string()),
    workspaceName: v.optional(v.string()),
    team: v.optional(v.object({ id: v.string(), name: v.string() })),
  },
  handler: async (
    ctx,
    { roomId, sessionId, accessToken, userName, workspaceName, team },
  ): Promise<void> => {
    await requireHost(ctx, roomId, sessionId);
    await ctx.db.patch(roomId, {
      linear: {
        accessToken,
        userName,
        workspaceName,
        teamId: team?.id,
        teamName: team?.name,
      },
    });
  },
});

/**
 * Connect with a Linear personal API key instead of OAuth — for hosts whose
 * workspace role can't create OAuth applications. The key is validated
 * against Linear before it is stored, and it never leaves the server after
 * this call: public queries only ever report `connected: true`.
 */
export const connectApiKey = action({
  args: { roomId: v.id("rooms"), sessionId: v.string(), apiKey: v.string() },
  handler: async (
    ctx,
    { roomId, sessionId, apiKey },
  ): Promise<{ workspace?: string; user?: string; teamCount: number }> => {
    const key = apiKey.trim();
    if (!key) throw new ConvexError("PASTE A LINEAR API KEY FIRST");

    let data: {
      viewer: { name: string };
      organization: { name: string };
      teams: { nodes: LinearTeam[] };
    };
    try {
      data = await linearGql(
        key,
        `query KeyCheck {
          viewer { name }
          organization { name }
          teams(first: 50) { nodes { id key name } }
        }`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new ConvexError(`LINEAR REJECTED THE KEY: ${message.slice(0, 100)}`);
    }

    const teams = data.teams.nodes;
    await ctx.runMutation(internal.linear.attachLinearAsHost, {
      roomId,
      sessionId,
      accessToken: key,
      userName: data.viewer.name,
      workspaceName: data.organization.name,
      team: teams.length === 1 ? { id: teams[0].id, name: teams[0].name } : undefined,
    });
    return {
      workspace: data.organization.name,
      user: data.viewer.name,
      teamCount: teams.length,
    };
  },
});

/** Host-only read of the stored token. Internal — never exposed publicly. */
export const hostToken = internalQuery({
  args: { roomId: v.id("rooms"), sessionId: v.string() },
  handler: async (
    ctx,
    { roomId, sessionId },
  ): Promise<{ accessToken: string } | null> => {
    const room = await requireHost(ctx, roomId, sessionId);
    if (!room.linear) return null;
    return { accessToken: room.linear.accessToken };
  },
});

/**
 * Build the Linear authorization URL. The redirect lands on this deployment's
 * HTTP router (`<convex-site>/linear/callback`), keeping the client secret
 * server-side for the code exchange.
 */
export const authUrl = action({
  args: { roomId: v.id("rooms"), sessionId: v.string() },
  handler: async (ctx, { roomId, sessionId }): Promise<string> => {
    const clientId = process.env.LINEAR_CLIENT_ID;
    if (!clientId) {
      throw new ConvexError(
        "LINEAR OAUTH NOT CONFIGURED — run `npx convex env set LINEAR_CLIENT_ID …` (see README)",
      );
    }
    const nonce: string = await ctx.runMutation(internal.linear.createOauthState, {
      roomId,
      sessionId,
    });
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: `${process.env.CONVEX_SITE_URL}/linear/callback`,
      response_type: "code",
      scope: "read,write",
      state: nonce,
      prompt: "consent",
      actor: "user",
    });
    return `${LINEAR_AUTHORIZE_URL}?${params.toString()}`;
  },
});

/** Called by the HTTP callback: exchange the code, attach the workspace. */
export const completeOauth = internalAction({
  args: { code: v.string(), state: v.string() },
  handler: async (ctx, { code, state }): Promise<string | null> => {
    const clientId = process.env.LINEAR_CLIENT_ID;
    const clientSecret = process.env.LINEAR_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      throw new Error("LINEAR_CLIENT_ID / LINEAR_CLIENT_SECRET are not set on this deployment.");
    }

    const { roomId } = await ctx.runMutation(internal.linear.takeState, { state });

    const tokenResponse = await fetch(LINEAR_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: `${process.env.CONVEX_SITE_URL}/linear/callback`,
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });
    if (!tokenResponse.ok) {
      throw new Error(`Token exchange failed (HTTP ${tokenResponse.status})`);
    }
    const tokenJson = (await tokenResponse.json()) as { access_token?: string };
    if (!tokenJson.access_token) throw new Error("Linear returned no access token");

    const data = await linearGql<{
      viewer: { name: string };
      organization: { name: string };
      teams: { nodes: LinearTeam[] };
    }>(
      tokenJson.access_token,
      `query Bootstrap {
        viewer { name }
        organization { name }
        teams(first: 50) { nodes { id key name } }
      }`,
    );

    const teams = data.teams.nodes;
    const roomCode: string = await ctx.runMutation(internal.linear.attachLinear, {
      roomId,
      accessToken: tokenJson.access_token,
      userName: data.viewer.name,
      workspaceName: data.organization.name,
      team: teams.length === 1 ? { id: teams[0].id, name: teams[0].name } : undefined,
    });

    const appUrl = process.env.APP_URL;
    if (!appUrl) return null;
    return `${appUrl.replace(/\/+$/, "")}/room/${roomCode}?linear=connected`;
  },
});

/* ──────────────────────────────────────────────────────────────────────────
 * Workspace / backlog
 * ────────────────────────────────────────────────────────────────────────── */

export const teams = action({
  args: { roomId: v.id("rooms"), sessionId: v.string() },
  handler: async (ctx, { roomId, sessionId }): Promise<LinearTeam[]> => {
    const auth = await ctx.runQuery(internal.linear.hostToken, { roomId, sessionId });
    if (!auth) throw new ConvexError("LINEAR NOT CONNECTED");
    const data = await linearGql<{ teams: { nodes: LinearTeam[] } }>(
      auth.accessToken,
      `query Teams { teams(first: 50) { nodes { id key name } } }`,
    );
    return data.teams.nodes;
  },
});

export const disconnect = mutation({
  args: { roomId: v.id("rooms"), sessionId: v.string() },
  handler: async (ctx, { roomId, sessionId }) => {
    await requireHost(ctx, roomId, sessionId);
    await ctx.db.patch(roomId, { linear: undefined });
  },
});

interface LinearIssueNode {
  id: string;
  identifier: string;
  title: string;
  description: string | null;
  url: string;
  priority: number;
  estimate: number | null;
  labels: { nodes: Array<{ name: string }> };
}

export interface TriagePreviewItem {
  id: string;
  identifier: string;
  title: string;
  priority: number;
  teamId: string;
  teamKey: string;
  teamName: string;
}

/**
 * List issues in the **triage** state — the only state the tournament will
 * ever touch, so in-progress work is protected by construction. Scope with
 * `teamIds` (one or many); omit or pass empty for every team the token sees.
 */
export const previewTriage = action({
  args: {
    roomId: v.id("rooms"),
    sessionId: v.string(),
    teamIds: v.optional(v.array(v.string())),
  },
  handler: async (ctx, { roomId, sessionId, teamIds }): Promise<TriagePreviewItem[]> => {
    const auth = await ctx.runQuery(internal.linear.hostToken, { roomId, sessionId });
    if (!auth) throw new ConvexError("LINEAR NOT CONNECTED");

    const filter: Record<string, unknown> = { state: { type: { eq: "triage" } } };
    if (teamIds && teamIds.length > 0) filter.team = { id: { in: teamIds } };

    const data = await linearGql<{
      issues: {
        nodes: Array<{
          id: string;
          identifier: string;
          title: string;
          priority: number;
          team: { id: string; key: string; name: string };
        }>;
      };
    }>(
      auth.accessToken,
      `query Triage($filter: IssueFilter) {
        issues(first: 100, filter: $filter, orderBy: updatedAt) {
          nodes { id identifier title priority team { id key name } }
        }
      }`,
      { filter },
    );

    return data.issues.nodes.map((node) => ({
      id: node.id,
      identifier: node.identifier,
      title: node.title,
      priority: node.priority,
      teamId: node.team.id,
      teamKey: node.team.key,
      teamName: node.team.name,
    }));
  },
});

/**
 * Import the host's hand-picked triage issues as bosses. The triage-state
 * filter is re-applied server-side on the fetch, so even a hand-crafted id
 * list can never pull an in-progress issue into the tournament.
 */
export const importSelected = action({
  args: {
    roomId: v.id("rooms"),
    sessionId: v.string(),
    issueIds: v.array(v.string()),
  },
  handler: async (
    ctx,
    { roomId, sessionId, issueIds },
  ): Promise<{ inserted: number; skipped: number }> => {
    if (issueIds.length === 0) throw new ConvexError("SELECT AT LEAST ONE ISSUE");
    if (issueIds.length > 100) throw new ConvexError("MAX 100 ISSUES PER IMPORT");
    const auth = await ctx.runQuery(internal.linear.hostToken, { roomId, sessionId });
    if (!auth) throw new ConvexError("LINEAR NOT CONNECTED");

    const data = await linearGql<{ issues: { nodes: LinearIssueNode[] } }>(
      auth.accessToken,
      `query TriageByIds($filter: IssueFilter) {
        issues(first: 100, filter: $filter) {
          nodes {
            id identifier title description url priority estimate
            labels { nodes { name } }
          }
        }
      }`,
      { filter: { id: { in: issueIds }, state: { type: { eq: "triage" } } } },
    );

    const issues = data.issues.nodes.map((node) => ({
      linearIssueId: node.id,
      identifier: node.identifier,
      title: node.title,
      description: node.description ?? "No description provided. A mysterious foe.",
      url: node.url,
      labels: node.labels.nodes.map((label) => label.name),
      priority: node.priority,
    }));

    const result: { inserted: number; skipped: number } = await ctx.runMutation(
      internal.tickets.importMany,
      { roomId, issues },
    );
    return result;
  },
});

/* ──────────────────────────────────────────────────────────────────────────
 * Defeat → estimate + high-score comment
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * The SYNC & ADVANCE button. Finalizes the boss (victory animation + next
 * level scheduling happen in the mutation), then — if this ticket came from
 * Linear — writes `estimate = max(complexity, uncertainty)` and posts the
 * consensus board comment. Linear failures never block the game loop.
 */
export const defeatTicket = action({
  args: { roomId: v.id("rooms"), sessionId: v.string() },
  handler: async (
    ctx,
    { roomId, sessionId },
  ): Promise<{ synced: boolean; detail: string }> => {
    const payload = await ctx.runMutation(internal.tickets.finalizeActive, {
      roomId,
      sessionId,
    });

    if (!payload.linear) {
      return { synced: false, detail: "OFFLINE BOSS — NOTHING TO SYNC" };
    }

    try {
      if (payload.finalPoints !== undefined) {
        await linearGql<{ issueUpdate: { success: boolean } }>(
          payload.linear.accessToken,
          `mutation SetEstimate($id: String!, $estimate: Int!) {
            issueUpdate(id: $id, input: { estimate: $estimate }) { success }
          }`,
          { id: payload.linear.issueId, estimate: payload.finalPoints },
        );
      }
      const body = buildConsensusComment({
        identifier: payload.identifier,
        title: payload.title,
        finalComplexity: payload.finalComplexity,
        finalUncertainty: payload.finalUncertainty,
        finalPoints: payload.finalPoints,
        unanimous: payload.unanimous,
        votes: payload.votes,
        pairingSummary: payload.pairingSummary,
        roomName: payload.roomName,
      });
      await linearGql<{ commentCreate: { success: boolean } }>(
        payload.linear.accessToken,
        `mutation PostBoard($issueId: String!, $body: String!) {
          commentCreate(input: { issueId: $issueId, body: $body }) { success }
        }`,
        { issueId: payload.linear.issueId, body },
      );
      await ctx.runMutation(internal.tickets.markSync, {
        ticketId: payload.ticketId,
        state: "synced",
      });
      return { synced: true, detail: `ESTIMATE ${payload.finalPoints ?? "—"} PUSHED TO LINEAR` };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await ctx.runMutation(internal.tickets.markSync, {
        ticketId: payload.ticketId,
        state: "error",
        error: message.slice(0, 500),
      });
      return { synced: false, detail: `LINEAR SYNC FAILED: ${message.slice(0, 120)}` };
    }
  },
});
