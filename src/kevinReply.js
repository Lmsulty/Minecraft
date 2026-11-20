import { offlineReply } from './kevinBrain.js';
import { getKevinName } from './kevinName.js';

// ==========================================================
//  askKevin(): THE ONE PLACE KEVIN'S CHAT REPLIES COME FROM.
//
//  It asks Kevin's online brain (the Supabase Edge Function "kevin", which
//  calls Claude) and returns a promise of { text, mood }:
//    text  what he says
//    mood  'talking', or 'annoyed' (his face while he says it)
//
//  If the server can't be used, it falls back to the offline brain
//  (kevinBrain.js), so the game never breaks:
//    - VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY missing from .env
//    - the call fails, or takes longer than 8 seconds
//    - the reply doesn't look right
//
//  The Anthropic API key is NOT here: it stays on Supabase as a secret.
//  The anon key in .env is a public key, made to be used in browsers.
// ==========================================================

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const TIMEOUT_MS = 8000;
const MAX_MESSAGE_LENGTH = 300;  // same limit as the server
const HISTORY_LENGTH = 6;        // how many recent chat messages to send along
const OFFLINE_THINKING = [0.5, 1]; // seconds the offline brain "thinks" (so his thinking face shows)

// The conversation so far: [{ from: 'player' | 'kevin', text }, ...]
const history = [];

// `context` = a few facts about the game right now (see kevinChat.js).
export async function askKevin(message, context) {
  message = message.slice(0, MAX_MESSAGE_LENGTH);
  const answer = (await askServer(message, context)) ?? (await askOffline(message));
  remember('player', message);
  remember('kevin', answer.text);
  return answer;
}

// Is the online brain set up? (For the chat box's little "online/offline" label.)
export function isOnlineBrainConfigured() {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}

// The online brain. Returns { text, mood }, or null if it didn't work.
async function askServer(message, context) {
  if (!isOnlineBrainConfigured()) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`${SUPABASE_URL.replace(/\/$/, '')}/functions/v1/kevin`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        apikey: SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ message, name: getKevinName(), context, history: history.slice(-HISTORY_LENGTH) }),
      signal: controller.signal,
    });
    if (!response.ok) {
      console.warn(`Kevin's online brain answered ${response.status}; using the offline brain.`);
      return null;
    }
    const data = await response.json();
    if (typeof data?.text !== 'string' || !data.text.trim()) return null;
    return {
      text: data.text.trim().slice(0, MAX_MESSAGE_LENGTH),
      mood: data.mood === 'annoyed' ? 'annoyed' : 'talking',
    };
  } catch (err) {
    console.warn('Kevin\'s online brain is unreachable; using the offline brain.', err.name === 'AbortError' ? '(timed out)' : err);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// The offline brain, after a short pause so it feels like he's thinking.
async function askOffline(message) {
  const [a, b] = OFFLINE_THINKING;
  await new Promise((resolve) => setTimeout(resolve, (a + Math.random() * (b - a)) * 1000));
  return offlineReply(message);
}

function remember(from, text) {
  history.push({ from, text });
  if (history.length > HISTORY_LENGTH) history.shift();
}
