// Kevin's ACTIONS: things he can actually DO when you ask in the chat
// (not just talk about).
//
// Both brains can pick an action to go with his reply:
//   online brain  the server (supabase/functions/kevin) asks Claude, which
//                 adds a tag like [do:stay] to the reply. The server only
//                 passes on names from its own list.
//   offline brain kevinBrain.js spots simple keywords (findAction below).
// Either way, the game double-checks the name here (isAction) before
// running it, so a strange or made-up action is simply ignored.
//
// The brains only pick WHICH action. The game decides all the details.
//
// Actions so far:
//   stay    stand still right where he is: no following, no teleporting to you
//   follow  back to normal: follow you around
// (Building, digging and lights come in the next steps.)

export const ACTIONS = ['stay', 'follow'];

// Keywords for the offline brain. Checked in order; first match wins.
// 'stay' goes first so "stop following me" and "don't follow me" mean stay.
const ACTION_WORDS = [
  { action: 'stay', words: /\b(stay|wait (here|there|for me)|stop following|don'?t follow|stand still|hold (it|on)|guard (this|here))\b/ },
  { action: 'follow', words: /\b(follow|come (here|on|with me|back|along)|let'?s go|keep up|heel)\b/ },
];

export function isAction(name) {
  return ACTIONS.includes(name);
}

// The action a message asks for (offline brain), or null.
export function findAction(message) {
  const text = message.toLowerCase();
  return ACTION_WORDS.find(({ words }) => words.test(text))?.action ?? null;
}

// Make Kevin do it. Returns a short note for his memory of recent events
// (kevinTalk.js), or null if there was nothing to do.
export function runAction(action, kevin) {
  if (!isAction(action)) return null;
  if (action === 'stay') {
    kevin.stay();
    return 'the player told Kevin to stay put';
  }
  if (action === 'follow') {
    kevin.follow();
    return 'the player told Kevin to follow them again';
  }
  return null;
}
