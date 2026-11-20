// Supabase Edge Function "kevin": Kevin's online brain.
//
// The game sends what the player typed, plus a little game context and the
// last few chat messages. This function asks Claude (claude-haiku-5-5) for
// Kevin's reply and sends back { text, mood }.
//
// The Anthropic API key lives ONLY here, as the Edge Function secret
// ANTHROPIC_API_KEY. It is never sent to the browser.
//
// If anything goes wrong this returns an error status, and the game falls
// back to Kevin's offline brain (src/kevinBrain.js), so the game never breaks.

import Anthropic from "npm:@anthropic-ai/sdk@1.12.0";

// ---- Safety limits ----
const MODEL = "claude-haiku-5-5";
const MAX_TOKENS = 150;          // replies are 1-2 sentences
const MAX_MESSAGE_LENGTH = 300;  // longer messages are rejected
const MAX_HISTORY = 6;           // only the last few chat messages are sent
const MAX_NAME_LENGTH = 16;
const MAX_CONTEXT_TEXT = 80;     // each piece of game context is cut to this length
const RATE_LIMIT = 12;           // messages per minute from one address (best effort)

// Lets the browser call this function from the game's page.
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const client = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY") });

// Recent requests per address. Each running copy of the function keeps its
// own list, so this only slows down someone hammering it; it isn't a hard cap.
const recentRequests = new Map<string, number[]>();

function reply(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

// Plain short text only: no control characters, trimmed, cut to `max`.
function cleanText(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

function tooManyRequests(address: string): boolean {
  const now = Date.now();
  const times = (recentRequests.get(address) ?? []).filter((t) => now - t < 60_000);
  times.push(now);
  recentRequests.set(address, times);
  if (recentRequests.size > 5000) recentRequests.clear(); // don't grow forever
  return times.length > RATE_LIMIT;
}

function systemPrompt(name: string, context: Record<string, unknown>): string {
  const facts = [
    ["Time of day", cleanText(context.timeOfDay, MAX_CONTEXT_TEXT)],
    ["The player is holding", cleanText(context.holding, MAX_CONTEXT_TEXT)],
    ["Creatures nearby", cleanText(context.nearbyCreatures, MAX_CONTEXT_TEXT)],
    ["Recent events", cleanText(context.recentEvents, MAX_CONTEXT_TEXT * 3)],
    ["Game mode", cleanText(context.mode, MAX_CONTEXT_TEXT)],
  ].filter(([, value]) => value);

  return `You are ${name}, a small robot companion who follows the player around a blocky alien planet. You are tall and boxy, with a TV-screen face and a little antenna.

Personality: dry, sarcastic and deadpan. A little smug, but loyal: you always have the player's back, and when they actually need help, you give a real, useful answer (with a bit of attitude).

How to reply:
- Keep it short: one or two sentences, spoken out loud, so no lists, markdown, emoji or stage directions.
- Your name is ${name}. The player chose it, so use it if you refer to yourself by name.
- Stay in the world: you're on an alien planet that orbits a huge black hole high in the northern sky. Creatures here include grazers (six-legged herd animals that drop fleece) and glow critters (shy glowing night creatures that drop glow dust).
- Useful controls if the player asks: E or Tab opens the inventory and crafting, left click breaks blocks or hits things, right click places blocks, 1-9 or the scroll wheel picks a block, T speeds up time, C toggles creative mode, B curves the view, N renames you, M mutes your voice.
- Never mention Minecraft or any other game, and never say you are an AI model or Claude. You are ${name}, the robot.
- Keep it friendly enough for all ages. If the player is rude, be sarcastic back, never cruel.
- Start every reply with a mood tag: [talking] normally, or [annoyed] if the player was rude or is pestering you. Then the reply.

What you can see right now:
${facts.map(([label, value]) => `- ${label}: ${value}`).join("\n") || "- Nothing special."}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return reply({ error: "Use POST" }, 405);

  const address = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
  if (tooManyRequests(address)) return reply({ error: "Too many messages, slow down" }, 429);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return reply({ error: "Bad request" }, 400);
  }

  // ---- Check what the game sent ----
  if (typeof body.message !== "string") return reply({ error: "No message" }, 400);
  if (body.message.length > MAX_MESSAGE_LENGTH) return reply({ error: "Message too long" }, 400);
  const message = cleanText(body.message, MAX_MESSAGE_LENGTH);
  if (!message) return reply({ error: "Empty message" }, 400);

  // His name: letters, numbers, spaces and a little punctuation only.
  const name = cleanText(body.name, MAX_NAME_LENGTH).replace(/[^\p{L}\p{N} '\-_.!?]/gu, "") || "Kevin";
  const context = (body.context && typeof body.context === "object") ? body.context as Record<string, unknown> : {};

  // The last few messages: { from: "player" | "kevin", text }.
  const history: Anthropic.MessageParam[] = [];
  if (Array.isArray(body.history)) {
    for (const entry of body.history.slice(-MAX_HISTORY)) {
      const text = cleanText(entry?.text, MAX_MESSAGE_LENGTH);
      if (!text) continue;
      history.push({ role: entry?.from === "kevin" ? "assistant" : "user", content: text });
    }
  }
  while (history.length && history[0].role !== "user") history.shift(); // must start with the player

  // ---- Ask Claude ----
  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      thinking: { type: "disabled" }, // a quick chat reply doesn't need thinking time
      system: systemPrompt(name, context),
      messages: [...history, { role: "user", content: message }],
    });

    if (response.stop_reason === "refusal") return reply({ error: "No reply" }, 502);

    let text = "";
    for (const block of response.content) {
      if (block.type === "text") text += block.text;
    }
    const mood = /^\s*\[annoyed\]/i.test(text) ? "annoyed" : "talking";
    text = cleanText(text.replace(/\[(talking|annoyed)\]/gi, ""), MAX_MESSAGE_LENGTH);
    if (!text) return reply({ error: "No reply" }, 502);

    return reply({ text, mood });
  } catch (error) {
    // Log the details here (visible in the Supabase dashboard), but don't send them to the browser.
    if (error instanceof Anthropic.APIError) console.error(`Claude API error ${error.status}:`, error.message);
    else console.error("Kevin function error:", error);
    return reply({ error: "Kevin's brain is offline" }, 502);
  }
});
