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
// The brains only pick WHICH action. The game decides all the details
// (where, how big, which blocks: see kevinBlueprints.js and kevinBuild.js).
//
// Actions:
//   stay    stand still right where he is: no following, no teleporting to you
//   follow  back to normal: follow you around
//   stop    stop building or digging
//   wall, tower, hut, bridge   build one (kevinBlueprints.js has the sizes)
//   light   put glow lamps on the ground around you
//   tunnel  dig a tunnel straight ahead (kevinDig.js)
//   stairs  dig a staircase going down (kevinDig.js)

export const ACTIONS = ['stay', 'follow', 'stop', 'wall', 'tower', 'hut', 'bridge', 'light', 'tunnel', 'stairs'];

// Keywords for the offline brain. Checked in order; first match wins.
// 'stay' goes first so "stop following me" and "don't follow me" mean stay,
// and 'follow' goes last so "come here and build a wall" means the wall.
const ACTION_WORDS = [
  { action: 'stay', words: /\b(stay|wait (here|there|for me)|stop following|don'?t follow|stand still|hold (it|on)|guard (this|here))\b/ },
  { action: 'stop', words: /\b(stop|cancel|never ?mind|halt|that'?s enough)\b/ },
  { action: 'hut', words: /\b(hut|house|shelter|cabin|shack)\b/ },
  { action: 'tower', words: /\b(tower|pillar|beacon)\b/ },
  { action: 'bridge', words: /\b(bridge|walkway)\b/ },
  { action: 'wall', words: /\b(wall|barrier|fence)\b/ },
  { action: 'light', words: /\b(lights?|lamps?|lanterns?|brighten)\b/ },
  // "tunnel" before "dig", so "dig a tunnel" is a tunnel and plain "dig" means down.
  { action: 'tunnel', words: /\b(tunnel|dig (forward|ahead|straight|through|into))\b/ },
  { action: 'stairs', words: /\b(dig|stairs|staircase|steps down|mine down|go down|downstairs)\b/ },
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

// Make Kevin do it. `builder` is his KevinBuilder (kevinBuild.js).
// Returns { note, line }, both optional:
//   note  a short note for his memory of recent events (kevinTalk.js)
//   line  something he should say INSTEAD of his chat reply, because the
//         game found it can't be done (e.g. "That needs 71 planks...")
export function runAction(action, { kevin, builder }) {
  if (!isAction(action)) return {};
  if (action === 'stay') {
    kevin.stay();
    return { note: 'the player told Kevin to stay put' };
  }
  if (action === 'follow') {
    kevin.follow();
    return { note: 'the player told Kevin to follow them again' };
  }
  if (action === 'stop') {
    return builder.stop() ? { note: 'the player told Kevin to stop building' } : {};
  }

  // A build. Check it can be done before starting.
  const plan = builder.plan(action);
  if (!plan.ok) return { line: plan.line, note: `Kevin couldn't do the ${action} the player asked for` };
  builder.start(plan.job);
  if (action === 'light') return { note: 'the player asked Kevin to put up lamps' };
  if (action === 'tunnel') return { note: 'the player asked Kevin to dig a tunnel' };
  if (action === 'stairs') return { note: 'the player asked Kevin to dig a staircase down' };
  return { note: `the player asked Kevin to build a ${action}` };
}
