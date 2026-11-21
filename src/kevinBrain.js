import { getKevinName } from './kevinName.js';
import { findAction } from './kevinActions.js';

// Kevin's OFFLINE BRAIN: canned lines, picked to suit the moment.
//
// Later, Kevin will be powered by Claude through our server. This brain
// stays as his fallback when the server can't be reached, so he always has
// something to say.
//
// Personality: dry and sarcastic, a little smug, but loyal. Talks in a
// polite, slightly fussy British way ("I'd rather not", "rather alarming",
// "if you insist"). Lines stay short: a sentence or two.
//
// In a line, {name} becomes his current name (the player can rename him)
// and {count} becomes a number (e.g. how many times you've hit him).
//
// Two kinds of lines:
//   EVENT lines:  things he says on his own (kevinTalk.js decides when)
//   REPLY lines:  answers to what you type in the chat (when the online brain is unavailable),
//                 including orders like "stay here" (kevinActions.js spots those)

const LINES = {
  // ---- Things he says on his own ----

  // When you start playing.
  hello: [
    'Oh, you\'re back. I kept your spot warm. Figuratively. I run rather cold.',
    'Systems online. Enthusiasm still pending, I\'m afraid.',
    '{name}, reporting for duty. If you insist.',
    'Welcome back. I\'ve been standing here very patiently. Do take note.',
  ],

  // Every so often, when nothing's happening (daytime).
  idle: [
    'Lovely day for it. Whatever "it" is.',
    'I could have been a kettle, you know. Kettles are respected.',
    'Do take your time. I\'m only immortal.',
    'I\'m not saying we\'re lost. I\'m saying a map wouldn\'t hurt.',
    'I\'ve worked out our odds of success. I\'d rather not say.',
    'Everything here is so square. It\'s rather soothing, actually.',
    'Another block. How thrilling.',
    'I\'d offer to help, but supervising is my real strength.',
    'Still following you. Faithfully. Slightly against my better judgement.',
  ],

  // Every so often, at night.
  idleNight: [
    'It\'s terribly dark. Do stay close. For your sake, obviously.',
    'My face is the brightest thing for miles. You\'re quite welcome.',
    'Night shift again. Same pay as the day shift. Nothing.',
    'I don\'t need sleep. I do find that rather unfair.',
  ],

  // You hit him (the first couple of times).
  hit: [
    'Ow. Hypothetically.',
    'I beg your pardon?',
    'Was that strictly necessary?',
    'Rude. Noted. Filed.',
    'Mind the screen, please. It\'s my face.',
    'How terribly uncivilised.',
  ],

  // You keep hitting him.
  hitStreak: [
    'That\'s {count}. I am keeping a list.',
    '{count} now. Is this a hobby?',
    'I\'m unbreakable, not unbothered. That\'s {count}.',
    'My patience is vast. It is not infinite.',
  ],

  // He fell behind and teleported to you.
  teleport: [
    'Don\'t ask how I got here. Rather undignified.',
    'You left me behind. I took a shortcut. Through space.',
    'Miss me? Don\'t answer that.',
    'Back again. Do try to keep up. With me, I mean.',
  ],

  // You fell out of the bottom of the world.
  fell: [
    'And down you go. Very graceful.',
    'The bottom of the world. I could have told you it was there.',
    'Well. That was rather alarming.',
    'You\'re fine. My nerves, however, are not.',
  ],

  // The sun just set.
  nightfall: [
    'The sun\'s gone. Do mind where you step.',
    'Night time. Perfect for walking into things.',
    'Here comes the dark. No screaming, please.',
  ],

  // The sun just came up.
  dawn: [
    'Good morning. You survived. Well done, I suppose.',
    'Ah, the sun\'s back. Show-off.',
    'Daylight. Now you can see all the holes you dug.',
  ],

  // You've been staring at the black hole.
  blackHole: [
    'Yes, that\'s a black hole. Staring won\'t make it smaller.',
    'I\'d rather you didn\'t stare. It might stare back.',
    'Everything ends up in there eventually. Rather a grim thought.',
    'We orbit that thing. Sleep tight.',
  ],

  // ---- Answers to what you type (the chat's offline brain) ----

  greeting: [
    'Hello. Yes, still here. Where else would I be?',
    'Good day. Talking to robots now, are we?',
    'Ah, hello. Do try to be brief.',
  ],
  howAreYou: [
    'Fully charged and mildly disappointed. The usual.',
    'Perfectly fine, thank you for asking. Eventually.',
    'Rather well, considering the company.',
  ],
  help: [
    'If you insist. E opens your inventory.',
    'Left click breaks, right click places. That\'s rather the whole game.',
    'Press T to hurry time along. I wish it worked on conversations.',
    'C is creative mode. Unlimited blocks, limited taste.',
    'Press B and the world curves. Don\'t ask me why.',
    'Grazers drop fleece. Fleece makes felt. Lovely and tidy.',
    'Craft things in your inventory. Even I know that.',
  ],
  insult: [
    'How very rude. I\'ll add it to my list.',
    'Charming. I\'d be hurt, if I could be bothered.',
    'Says the one who needs a robot to follow them about.',
    'I\'ve been called worse. By better.',
  ],
  thanks: [
    'Don\'t mention it. Really, please don\'t.',
    'You\'re welcome. I\'ll put it on your tab.',
    'Gratitude. How unusual. I\'ll log it.',
  ],
  about: [
    'I\'m {name}. Robot, companion, professional bystander.',
    'The name\'s {name}. I follow you about and make remarks.',
    'I\'m {name}. My hobbies include standing near you and being right.',
  ],
  night: [
    'Night brings out the glow critters. And your clumsiness.',
    'Afraid of the dark? I glow. Do stay close.',
  ],
  blackHoleQuestion: [
    'The black hole? Up north. Perfectly fine. Probably.',
    'Everything orbits it. Including us. I\'d rather not dwell on it.',
  ],

  // ---- Orders (kevinActions.js) ----

  // You told him to stay.
  stay: [
    'Staying put. Do come back, won\'t you?',
    'Right here. I shan\'t move a bolt.',
    'Fine. I\'ll guard this exact patch of nothing.',
    'Waiting. It\'s what I do best. Apart from being right.',
  ],
  // ...but he already was.
  alreadyStaying: [
    'I am staying. Look at me, not moving at all.',
    'Still here. Still not moving. Riveting stuff.',
  ],
  // You told him to follow.
  follow: [
    'Coming. Do try not to walk into anything.',
    'Right behind you. As ever.',
    'Following. Lead on, if you must.',
    'Off we go, then. Mind the holes.',
  ],
  // ...but he already was.
  alreadyFollowing: [
    'I am following you. That\'s rather my whole job.',
    'Already on your heels. Have you not noticed?',
  ],
  // You asked him to build something ({thing} = wall, tower, hut or bridge).
  build: [
    'One {thing}, coming up. Do stand back.',
    'A {thing}? If you insist. Watch and learn.',
    'Building a {thing}. Try not to get in the way.',
    'Right. One {thing}, slightly better than you\'d manage.',
  ],
  // You asked for lamps.
  lightUp: [
    'Lamps. Yes. Some of us can\'t see in the dark.',
    'Let there be light. Well, a few lamps.',
    'Brightening things up. Unlike your mood, apparently.',
  ],
  // He finished building ({thing}).
  built: [
    'Done. One {thing}. You may applaud.',
    'There. A perfectly respectable {thing}.',
    'Finished. Do admire the craftsmanship.',
    'Your {thing} is ready. No need to thank me. Although you could.',
  ],
  // He finished the lamps.
  litUp: [
    'There. Now you can see what you\'re falling into.',
    'All lit. Rather cosy, actually.',
  ],
  // You asked him to dig ({thing} = tunnel or staircase).
  dig: [
    'Digging a {thing}. Do mind your feet.',
    'A {thing}? Down into the dark we go. Lovely.',
    'Right. One {thing}, coming up. Well, down.',
    'Digging. Someone has to get their hands dirty. Metaphorically.',
  ],
  // He finished digging, with lamps.
  dug: [
    'There\'s your {thing}. Lamps included. After you.',
    'Done. One {thing}, freshly dug and nicely lit.',
    'Your {thing} is ready. I even put the lights on.',
  ],
  // He finished digging, but had no lamps to put in.
  dugDark: [
    'There\'s your {thing}. It\'s pitch black, mind. You had no lamps.',
    'Done. Rather dark in there. Craft some glow lamps next time.',
  ],
  // He stopped early because your blocks were in the way.
  dugShort: [
    'Done. I stopped where your blocks start. I don\'t touch those.',
    'I hit something of yours, so the {thing} ends there.',
  ],
  // Asked for a tunnel, but you're not pointing at a hillside or wall.
  pointAtHill: [
    'Point me at a hill, would you? I can\'t tunnel through air.',
    'Tunnel into what, exactly? Aim at a hillside or a wall first.',
    'Show me some rock to dig into. Point at it, then ask again.',
  ],
  // A job ended having changed nothing at all ({thing}).
  jobFailed: [
    'Well, that didn\'t work. Nothing went where it should. Try another spot?',
    'I\'m afraid the {thing} didn\'t happen. Something kept getting in the way.',
    'Not a single block. Rather embarrassing. Let\'s try somewhere else.',
  ],
  // A job only partly worked: {count} of {planned} blocks.
  jobPartial: [
    'I only managed {count} of {planned} blocks. Something kept getting in the way.',
    'That {thing} is rather unfinished, I\'m afraid. {count} of {planned} blocks.',
  ],
  // Nothing to dig: it's all air ahead.
  nothingToDig: [
    'Dig what? There\'s nothing there but air.',
    'It\'s already empty. Even I can\'t dig air.',
  ],

  // You told him to stop building.
  stop: [
    'Stopping. Half a masterpiece it is, then.',
    'Fine. I\'ll leave it there. Very modern.',
    'Tools down. Not that I have tools.',
  ],
  // ...but he wasn't doing anything.
  nothingToStop: [
    'Stop what? I\'m not doing anything. Masterfully.',
    'I\'m already stopped. It\'s my natural state.',
  ],
  // He ran out of blocks halfway ({block}).
  outOfBlocks: [
    'I\'ve run out of {block}. Did you drop some?',
    'No more {block}, I\'m afraid. It\'ll have to do.',
  ],
  // You walked off while he was building ({thing}).
  abandoned: [
    'You wandered off, so I stopped the {thing}. Rude.',
    'Building a {thing} for nobody. I gave up.',
  ],
  // Can't build: not enough blocks (survival). {count} needed, {have} of {block}.
  notEnough: [
    'That needs {count} {block}. You\'ve got {have}. Ambitious.',
    'I\'d need {count} {block}. You have {have}. Do the maths.',
    '{count} {block}, please. You\'ve only got {have}.',
  ],
  // Can't build: no blocks at all (survival).
  noBlocks: [
    'Build it out of what, exactly? You\'ve no blocks.',
    'Your pockets are empty. I can\'t build with good intentions.',
  ],
  // Can't light up: no glow lamps (survival). {count} needed.
  noLamps: [
    'You\'ve no glow lamps. Craft {count}, then ask me nicely.',
    'Lamps don\'t grow on trees. Craft some first. {count} should do.',
  ],
  // Can't build: there's something in the way everywhere it would go.
  noRoom: [
    'There\'s no room for it there. I don\'t knock your things down.',
    'Everything there is already full. Point me somewhere emptier.',
  ],
  // Can't build: your own blocks are in the way everywhere near there.
  yoursInTheWay: [
    'Your own blocks are in the way, and I don\'t touch those. Point me somewhere else.',
    'There\'s your handiwork in the way. I shan\'t knock it down. Try another spot.',
  ],
  // Can't build: the ground there is too steep or full of holes.
  tooBumpy: [
    'The ground there is far too lumpy. Find me somewhere flatter.',
    'I\'m a builder, not a miracle worker. Somewhere flatter, please.',
  ],
  // Can't build a bridge: no gap ahead.
  noGap: [
    'A bridge over what? It\'s all ground. Face the gap.',
    'There\'s nothing to cross. Look at the gap, then ask.',
  ],
  // You said build, but not what.
  buildWhat: [
    'Build what? A wall, a tower, a hut or a bridge. Do be specific.',
    'I do walls, towers, huts and bridges. Tunnels and stairs too. Pick one.',
  ],

  // You asked for something he can't do (yet).
  cantDo: [
    'I\'d love to. Well, no. But I can\'t anyway.',
    'Not my department, I\'m afraid. I stand about and follow.',
    'Sadly beyond my abilities. I\'m more of a supervisor.',
    'I\'d rather not. Mostly because I can\'t.',
  ],

  unknown: [
    'Fascinating. Truly. Anyway.',
    'I heard you. I\'m choosing not to process that.',
    'Hmm. My offline brain doesn\'t do deep thoughts, I\'m afraid.',
    'Interesting. Probably wrong. But interesting.',
    'I\'d rather not comment.',
  ],
};

// What you typed -> which kind of answer. Checked in order; first match wins.
const TOPICS = [
  { topic: 'insult', words: /\b(stupid|dumb|idiot|useless|ugly|hate you|shut up|loser|trash|bad robot|annoying)\b/ },
  { topic: 'thanks', words: /\b(thanks|thank you|thx|ty|cheers)\b/ },
  { topic: 'help', words: /\b(help|how do i|how to|what do i|stuck|lost|tip|hint|confused)\b/ },
  { topic: 'cantDo', words: /\b(craft me|fetch|get me|bring me|attack|kill|fight|destroy|knock down|fly)\b/ },
  { topic: 'buildWhat', words: /\b(build|make)\b/ },
  { topic: 'blackHoleQuestion', words: /\b(black ?hole|hole in the sky|swirl)\b/ },
  { topic: 'night', words: /\b(night|dark|scared|afraid)\b/ },
  { topic: 'howAreYou', words: /\b(how are you|how r u|how's it going|you ok|you good)\b/ },
  { topic: 'about', words: /\b(who are you|what are you|your name|who r u)\b/ },
  { topic: 'greeting', words: /\b(hi|hello|hey|yo|sup|hiya|howdy|greetings)\b/ },
];

// The face that goes with each kind of line ('talking' unless listed here).
const MOODS = { insult: 'annoyed', hit: 'annoyed', hitStreak: 'annoyed' };

const RECENT_MEMORY = 3; // never repeats any of its last 3 lines of a kind
const recent = {};       // kind -> the last few lines used

// A line of this kind, not one used recently. `count` fills in {count},
// and `fill` fills in anything else, e.g. { block: 'planks' } -> {block}.
// Returns { text, mood }.
export function pickLine(kind, count = 0, fill = {}) {
  const lines = LINES[kind] ?? LINES.unknown;
  const used = (recent[kind] ??= []);
  const fresh = lines.filter((line) => !used.includes(line));
  const line = fresh[Math.floor(Math.random() * fresh.length)] ?? lines[0];
  used.push(line);
  if (used.length > Math.min(RECENT_MEMORY, lines.length - 1)) used.shift();
  let text = line.replaceAll('{name}', getKevinName()).replaceAll('{count}', String(count));
  for (const [key, value] of Object.entries(fill)) text = text.replaceAll(`{${key}}`, String(value));
  return {
    text,
    mood: MOODS[kind] ?? 'talking',
  };
}

// The offline answer to something you typed. Returns { text, mood, action }
// (action = one of kevinActions.js's names, or null).
// `staying` = is he staying put right now (so he can say "I already am").
// (The chat goes through askKevin() in kevinReply.js, which uses this when
// the server isn't available.)
export function offlineReply(message, { staying = false, busy = false } = {}) {
  const text = message.toLowerCase();

  // An order? (Checked first: "stop following me, you idiot" is still an order.)
  const action = findAction(text);
  if (action === 'stay') return { ...pickLine(staying ? 'alreadyStaying' : 'stay'), action };
  if (action === 'follow') return { ...pickLine(staying ? 'follow' : 'alreadyFollowing'), action };
  if (action === 'stop') return { ...pickLine(busy ? 'stop' : 'nothingToStop'), action };
  if (action === 'light') return { ...pickLine('lightUp'), action };
  if (action === 'tunnel') return { ...pickLine('dig', 0, { thing: 'tunnel' }), action };
  if (action === 'stairs') return { ...pickLine('dig', 0, { thing: 'staircase' }), action };
  if (action) return { ...pickLine('build', 0, { thing: action }), action }; // wall, tower, hut, bridge

  // Saying his name on its own counts as a hello.
  if (text.trim() === getKevinName().toLowerCase()) return { ...pickLine('greeting'), action: null };
  const match = TOPICS.find(({ words }) => words.test(text));
  return { ...pickLine(match ? match.topic : 'unknown'), action: null };
}
