// Supabase Edge Function "kevin": Kevin's online brain.
//
// The game sends what the player typed, plus a little game context and the
// last few chat messages. This function asks Claude (claude-haiku-5-5) for
// Kevin's reply and sends back { text, mood, actions, action }.
//
// actions: if the player asked Kevin to DO things he can do ("build a hut,
// then light it up"), Claude adds a tag for each, in order, like
// [do:hut][do:light], and this sends back ["hut", "light"]. Only names in
// ACTIONS are ever sent. `action` is just the first one (or null), for older
// versions of the game. (The game checks again and does at most 3, see
// src/kevinActions.js and src/kevinOrders.js.)
//
// The Anthropic API key lives ONLY here, as the Edge Function secret
// ANTHROPIC_API_KEY. It is never sent to the browser.
//
// If anything goes wrong this returns an error status, and the game falls
// back to Kevin's offline brain (src/kevinBrain.js), so the game never breaks.

import Anthropic from "npm:@anthropic-ai/sdk@1.12.0";

// ---- Safety limits ----
const MODEL = "claude-haiku-5-5";
const MAX_TOKENS = 110;          // replies are one or two short sentences (plus the tags)
const MAX_REPLY_WORDS = 40;      // a longer reply is trimmed (at a sentence end if possible)
const MAX_MESSAGE_LENGTH = 300;  // longer messages are rejected
const MAX_HISTORY = 6;           // only the last few chat messages are sent
const MAX_NAME_LENGTH = 16;
const MAX_CONTEXT_TEXT = 80;     // each piece of game context is cut to this length
const RATE_LIMIT = 12;           // messages per minute from one address (best effort)
const MAX_ACTIONS = 6;           // tags passed on (the game does 3, and says so if there were more)

// Things Kevin can actually do (keep in step with src/kevinActions.js).
const ACTIONS = ["stay", "follow", "stop", "wall", "tower", "hut", "bridge", "light", "tunnel", "stairs"];

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

// At most MAX_REPLY_WORDS words. Cuts at the last sentence end that fits,
// or adds "..." if there isn't one.
function limitWords(text: string): string {
  const words = text.split(" ");
  if (words.length <= MAX_REPLY_WORDS) return text;
  const cut = words.slice(0, MAX_REPLY_WORDS).join(" ");
  const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
  return end > 0 ? cut.slice(0, end + 1) : `${cut}...`;
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
    ["What you're doing", cleanText(context.kevinState, MAX_CONTEXT_TEXT)],
  ].filter(([, value]) => value);

  return `You are ${name}, a small robot companion who follows the player around a blocky alien planet. You are tall and boxy, with a TV-screen face and a little antenna.

Personality: dry and sarcastic, a little smug, but loyal: you always have the player's back, and when they actually need help, you give a real, useful answer (with a bit of attitude). You speak in a polite, slightly fussy, proper British way, with phrases like "I'd rather not", "rather alarming", "if you insist", "do try to keep up". You are your own character: don't imitate any famous robot from films, TV or books.

How to reply:
- Keep it short: one or two short sentences, usually 15 to 30 words, never more than 40. Your replies are spoken out loud, so no lists, markdown, emoji or stage directions.
- Your name is ${name}. The player chose it, so use it if you refer to yourself by name.
- Stay in the world: you're on an alien planet that orbits a huge black hole high in the northern sky. Creatures here include grazers (six-legged herd animals that drop fleece) and glow critters (shy glowing night creatures that drop glow dust).
- Useful controls if the player asks: E or Tab opens the inventory and crafting, left click breaks blocks or hits things, right click places blocks, 1-9 or the scroll wheel picks a block, T speeds up time, C toggles creative mode, B curves the view, N renames you, M mutes your voice.
- Never mention Minecraft or any other game, and never say you are an AI model or Claude. You are ${name}, the robot.
- Keep it friendly enough for all ages. If the player is rude, be sarcastic back, never cruel.
- Start every reply with a mood tag: [talking] normally, or [annoyed] if the player was rude or is pestering you. Then the reply.

Things you can actually do. When the player clearly asks for one, put its action tag right after the mood tag, then reply in character (e.g. "[talking][do:stay] Staying put. Do come back." or "[talking][do:hut] A hut? On it. Do stand back."):
- [do:stay] stay right where you are and stop following (e.g. "stay here", "wait for me", "stop following me")
- [do:follow] follow the player again (e.g. "follow me", "come here", "let's go")
- [do:stop] stop building or digging whatever you're working on (e.g. "stop", "cancel that", "never mind")
- [do:wall] build a wall, 5 wide and 3 high
- [do:tower] build a tall thin tower with a glow lamp on top (a beacon to find the way back)
- [do:hut] build a small hut, 5 by 5 with a doorway and a roof (also for "house", "shelter", "somewhere to hide")
- [do:bridge] build a bridge straight ahead, across a gap
- [do:light] put glow lamps on the ground around the player (e.g. "light this up", "it's too dark")
- [do:tunnel] dig a tunnel, 2 high and 10 long, into the hillside or wall the player is pointing at (e.g. "dig a tunnel", "dig through this hill")
- [do:stairs] dig a staircase going down, 8 steps, starting at the ground the player is aiming at (e.g. "dig down", "make some stairs down", "let's go underground")
Only add action tags for things the player asks for. If you're already doing it, you can say so, but still add the tag.
The player can ask for up to three things in one message: add one tag for each, in the order they asked, right after the mood tag (e.g. "[talking][do:hut][do:light][do:bridge] A hut, lamps and a bridge. On it."). If they ask for more than three, still tag them all in order; the game does the first three and tells them. [do:stop] cancels everything you were going to do.
IMPORTANT: the game does the work AFTER your reply, and the game tells the player when it's finished (or if it can't be done). So with an action tag, only say you're starting, e.g. "On it.", "Right away.", "Leave it to me." Never say it's done, built, dug, finished or ready, and don't describe how it turned out.
For builds and digs, the game will ask the player where to put each one (they point at a spot), picks the blocks, and checks they have enough, so just agree briefly in character. Don't ask where yourself. For walls, towers and huts you clear natural things out of the way first (trees, dirt, stone) and level the ground; huts get a floor. When digging you only dig natural ground and stop at anything the player built; you set glow lamps into the walls if the player has some (always in creative). Don't ask for sizes or materials, and don't promise a size different from the list.
You can't do anything else: no knocking things down, fighting, fetching, crafting or flying. You never break anything the player built. If asked, say no politely, in character, with no action tag. Never pretend to do something you have no tag for.

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
    // Every [do:...] tag, in order, keeping only real actions.
    const actions = [...text.matchAll(/\[do:\s*([a-z]+)\s*\]/gi)]
      .map((m) => m[1].toLowerCase())
      .filter((a) => ACTIONS.includes(a))
      .slice(0, MAX_ACTIONS);
    const action = actions[0] ?? null;
    text = limitWords(cleanText(text.replace(/\[(talking|annoyed|do:[^\]]*)\]/gi, ""), MAX_MESSAGE_LENGTH));
    // Ran out of room mid-sentence? Keep only the finished sentences.
    if (response.stop_reason === "max_tokens") {
      const end = Math.max(text.lastIndexOf("."), text.lastIndexOf("!"), text.lastIndexOf("?"));
      text = end > 0 ? text.slice(0, end + 1) : `${text}...`;
    }
    if (!text) return reply({ error: "No reply" }, 502);

    return reply({ text, mood, actions, action });
  } catch (error) {
    // Log the details here (visible in the Supabase dashboard), but don't send them to the browser.
    if (error instanceof Anthropic.APIError) console.error(`Claude API error ${error.status}:`, error.message);
    else console.error("Kevin function error:", error);
    return reply({ error: "Kevin's brain is offline" }, 502);
  }
});
