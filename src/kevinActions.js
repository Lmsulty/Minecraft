// Kevin's ACTIONS: things he can actually DO when you ask in the chat
// (not just talk about).
//
// Both brains can pick an action to go with his reply:
//   online brain  the server (supabase/functions/kevin) asks Claude, which
//                 adds a tag like [do:stay] to the reply. The server only
//                 passes on names from its own list.
//   offline brain kevinBrain.js spots simple keywords (findActions below).
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
//
// You can ask for up to 3 in one message ("build a hut, then light it up").
// kevinOrders.js keeps the list and does them one after another.

export const ACTIONS = ['stay', 'follow', 'stop', 'wall', 'tower', 'hut', 'bridge', 'light', 'tunnel', 'stairs'];

// Keywords for the offline brain. Checked in order; first match wins.
// 'stay' goes first so "stop following me" and "don't follow me" mean stay,
// and 'follow' goes last so "come here to build a wall" means the wall.
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

// Every action a message asks for, in order (offline brain). The message is
// split on "and", "then", "also", commas and semicolons, and each part can
// ask for one action: "build a hut, then light it up and make a bridge"
// -> ['hut', 'light', 'bridge']. The same action twice in a row counts once.
export function findActions(message) {
  const parts = message.toLowerCase().split(/,|;|\band then\b|\bthen\b|\band\b|\balso\b/);
  const found = [];
  for (const part of parts) {
    const action = findAction(part);
    if (action && found[found.length - 1] !== action) found.push(action);
  }
  return found;
}

// ---- Names for his lines (kevinBrain.js and kevinOrders.js) ----

// In a list: "Right: a hut, then some lamps."
export const LIST_NAMES = {
  stay: 'stay put', follow: 'follow you', stop: 'stop',
  wall: 'a wall', tower: 'a tower', hut: 'a hut', bridge: 'a bridge',
  light: 'some lamps', tunnel: 'a tunnel', stairs: 'stairs down',
};
// When it's next: "Now the bridge."
export const NEXT_NAMES = {
  stay: 'staying put', follow: 'following you', stop: 'stopping',
  wall: 'the wall', tower: 'the tower', hut: 'the hut', bridge: 'the bridge',
  light: 'the lamps', tunnel: 'the tunnel', stairs: 'the stairs',
};
// When it's finished: "Hut done."
export const DONE_NAMES = {
  wall: 'Wall', tower: 'Tower', hut: 'Hut', bridge: 'Bridge',
  light: 'Lamps', tunnel: 'Tunnel', stairs: 'Staircase',
};

// The jobs he'll actually do from a list of actions: "stop" wipes out
// everything before it, and only the first `max` after that count.
// Returns { stop, jobs, tooMany }.
export function sortOrders(actions, max) {
  const valid = actions.filter(isAction);
  const lastStop = valid.lastIndexOf('stop');
  const after = valid.slice(lastStop + 1);
  return { stop: lastStop >= 0, jobs: after.slice(0, max), tooMany: after.length > max };
}
