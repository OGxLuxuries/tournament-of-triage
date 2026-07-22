import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
} from "./_generated/server";
import { buildConsensusComment, requireHost } from "./lib/game";

const LINEAR_GRAPHQL_URL = "https://api.linear.app/graphql";

/* ──────────────────────────────────────────────────────────────────────────
 * GraphQL plumbing
 * ────────────────────────────────────────────────────────────────────────── */

/** Linear personal API keys are sent bare in the Authorization header. */
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
 * Connect (personal API key)
 * ────────────────────────────────────────────────────────────────────────── */

/** Store the validated credentials on the room. Gated on the host session. */
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
 * Connect the room to Linear with a personal API key — any workspace member
 * can mint one. The key is validated against Linear before it is stored, and
 * it never leaves the server after this call: public queries only ever
 * report `connected: true`.
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
      currentEstimate: node.estimate ?? undefined,
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
        bidders: payload.bidders,
        wonBy: payload.wonBy,
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
