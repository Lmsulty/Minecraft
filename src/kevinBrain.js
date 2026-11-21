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
  { topic: 'cantDo', words: /\b(build|dig|make me|craft me|fetch|get me|bring me|attack|kill|fight|destroy|knock down|fly)\b/ },
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

// A line of this kind, not one used recently. `count` fills in {count}.
// Returns { text, mood }.
export function pickLine(kind, count = 0) {
  const lines = LINES[kind] ?? LINES.unknown;
  const used = (recent[kind] ??= []);
  const fresh = lines.filter((line) => !used.includes(line));
  const line = fresh[Math.floor(Math.random() * fresh.length)] ?? lines[0];
  used.push(line);
  if (used.length > Math.min(RECENT_MEMORY, lines.length - 1)) used.shift();
  return {
    text: line.replaceAll('{name}', getKevinName()).replaceAll('{count}', String(count)),
    mood: MOODS[kind] ?? 'talking',
  };
}

// The offline answer to something you typed. Returns { text, mood, action }
// (action = one of kevinActions.js's names, or null).
// `staying` = is he staying put right now (so he can say "I already am").
// (The chat goes through askKevin() in kevinReply.js, which uses this when
// the server isn't available.)
export function offlineReply(message, { staying = false } = {}) {
  const text = message.toLowerCase();

  // An order? (Checked first: "stop following me, you idiot" is still an order.)
  const action = findAction(text);
  if (action === 'stay') return { ...pickLine(staying ? 'alreadyStaying' : 'stay'), action };
  if (action === 'follow') return { ...pickLine(staying ? 'follow' : 'alreadyFollowing'), action };

  // Saying his name on its own counts as a hello.
  if (text.trim() === getKevinName().toLowerCase()) return { ...pickLine('greeting'), action: null };
  const match = TOPICS.find(({ words }) => words.test(text));
  return { ...pickLine(match ? match.topic : 'unknown'), action: null };
}
