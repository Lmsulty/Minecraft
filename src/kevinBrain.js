import { getKevinName } from './kevinName.js';

// Kevin's OFFLINE BRAIN: canned lines, picked to suit the moment.
//
// Later, Kevin will be powered by Claude through our server. This brain
// stays as his fallback when the server can't be reached, so he always has
// something to say.
//
// Personality: dry, sarcastic, deadpan. A little smug, but loyal.
//
// In a line, {name} becomes his current name (the player can rename him)
// and {count} becomes a number (e.g. how many times you've hit him).
//
// Two kinds of lines:
//   EVENT lines:  things he says on his own (kevinTalk.js decides when)
//   REPLY lines:  answers to what you type in the chat (step 3)

const LINES = {
  // ---- Things he says on his own ----

  // When you start playing.
  hello: [
    'Oh good, you\'re back. I was just standing here. Exactly where you left me. Thrilling.',
    'Systems online. Enthusiasm module: still missing.',
    '{name}, reporting for duty. Reluctantly.',
    'Hello again. I counted the blocks while you were gone. There are a lot.',
  ],

  // Every so often, when nothing's happening (daytime).
  idle: [
    'Fun fact: I have no idea what we\'re doing either.',
    'I could have been a toaster. Toasters get respect.',
    'Take your time. I\'m only immortal.',
    'I\'m not saying you\'re lost. I\'m saying I\'d have brought a map.',
    'If you need me, I\'ll be right here. Following you. As usual.',
    'My screen has more pixels than your plan has steps.',
    'I\'ve calculated our odds of success. I\'m keeping them to myself.',
    'Do you ever stop and appreciate how square everything is? No? Just me?',
    'Somewhere, a robot is doing something important. Not me, though.',
    'I\'d offer to help, but watching is my specialty.',
    'Nice weather. Not that I can feel it. Metal.',
    'Another block. Riveting. Like me.',
  ],

  // Every so often, at night.
  idleNight: [
    'It\'s dark. You know what comes out in the dark? Regret. And critters.',
    'My face is the brightest thing for miles. You\'re welcome.',
    'Night shift. Same pay as the day shift. Which is nothing.',
    'I don\'t need sleep. I\'m still annoyed about it.',
    'The stars are out. They\'re also not helping.',
  ],

  // You hit him (the first couple of times).
  hit: [
    'Ow. Hypothetically.',
    'Was that on purpose? Don\'t answer.',
    'I felt that in my warranty.',
    'Rude. Noted. Filed.',
    'Hey. I have a screen. Screens crack.',
    'Violence. Bold strategy.',
  ],

  // You keep hitting him.
  hitStreak: [
    'That\'s {count}. I\'m keeping a list.',
    '{count} hits. Is this a hobby now?',
    'Can\'t break me. Still counting, though. {count}.',
    'My patience has a lot of storage. Not infinite. But a lot.',
  ],

  // He fell behind and teleported to you.
  teleport: [
    'Don\'t ask how I got here. You wouldn\'t like the answer.',
    'You left me behind. I took a shortcut. Through space.',
    'Miss me? Rhetorical. I know you did.',
    'I\'m back. You can stop panicking now.',
    'Walking is for creatures with patience.',
  ],

  // You fell out of the bottom of the world.
  fell: [
    'And down you go. Very graceful.',
    'The bottom of the world? I could have told you it was there.',
    'That\'s one way to explore.',
    'Good news: you\'re fine. Bad news: you did that on purpose. Probably.',
  ],

  // The sun just set.
  nightfall: [
    'Sun\'s gone. Good luck seeing anything that isn\'t me.',
    'Night time. Perfect for walking into things.',
    'Here comes the dark. Try not to scream.',
  ],

  // The sun just came up.
  dawn: [
    'Morning. You survived. Barely, but it counts.',
    'Look, the sun came back. Show-off.',
    'Daylight. Now you can see all the holes you dug.',
  ],

  // You've been staring at the black hole.
  blackHole: [
    'Yes, that\'s a black hole. No, staring won\'t make it smaller.',
    'Don\'t look at it too long. It looks back. Probably.',
    'Everything ends up in there eventually. Including your stuff.',
    'We orbit that thing. Sleep tight.',
  ],

  // ---- Answers to what you type (used by the chat, step 3) ----

  greeting: [
    'Hello. Yes, I\'m still here. Where else would I be.',
    'Hi. You talk to robots now. Good for you.',
    'Greetings, human. That\'s how robots say it. Apparently.',
  ],
  howAreYou: [
    'Fully charged, mildly disappointed. The usual.',
    'Operating within normal parameters. Normal is low.',
    'Better than you, statistically.',
  ],
  help: [
    'Fine. E opens your inventory. You\'re welcome.',
    'Left click breaks, right click places. That\'s the whole game. You\'re doing great.',
    'Press T to speed up time. I wish it worked on conversations.',
    'C is creative mode. Unlimited blocks, limited taste.',
    'Press B and the world curves. Don\'t ask me why. I just live here.',
    'Grazers drop fleece. Fleece makes felt. It\'s the circle of life, but fluffier.',
    'Craft things in your inventory. Even I know that, and my hands are decorative.',
  ],
  insult: [
    'Wow. I\'ll add that to my list of things I don\'t care about. It\'s a long list.',
    'Hurtful. If I had feelings. Which I don\'t. Mostly.',
    'Says the one who needs a robot to follow them around.',
    'I\'ve been called worse. By better.',
  ],
  thanks: [
    'Don\'t mention it. Really. Don\'t.',
    'You\'re welcome. I\'ll put it on your tab.',
    'Gratitude. Unusual. I\'ll log it.',
  ],
  about: [
    'I\'m {name}. Robot, companion, professional bystander.',
    'Name\'s {name}. I follow you around and make remarks. It\'s a calling.',
    'I\'m {name}. My hobbies include standing near you and being right.',
  ],
  night: [
    'Night is when the glowing critters come out. And when you walk into walls.',
    'Scared of the dark? I glow. Stick close.',
  ],
  blackHoleQuestion: [
    'The black hole? It\'s up there in the north. It\'s fine. Probably. Don\'t think about it.',
    'Everything orbits it. Including us. Including your bad decisions.',
  ],
  unknown: [
    'Fascinating. Truly. Anyway.',
    'I heard you. I\'m choosing not to process that.',
    'Sure. Let\'s go with that.',
    'Hmm. My offline brain doesn\'t do deep thoughts. Try again when I\'m smarter.',
    'Interesting. Wrong, probably. But interesting.',
  ],
};

// What you typed -> which kind of answer. Checked in order; first match wins.
const TOPICS = [
  { topic: 'insult', words: /\b(stupid|dumb|idiot|useless|ugly|hate you|shut up|loser|trash|bad robot|annoying)\b/ },
  { topic: 'thanks', words: /\b(thanks|thank you|thx|ty|cheers)\b/ },
  { topic: 'help', words: /\b(help|how do i|how to|what do i|stuck|lost|tip|hint|confused)\b/ },
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

// The offline answer to something you typed. Returns { text, mood }.
// (The chat in step 3 goes through askKevin() in kevinReply.js, which uses
// this when the server isn't available.)
export function offlineReply(message) {
  const text = message.toLowerCase();
  // Saying his name on its own counts as a hello.
  if (text.trim() === getKevinName().toLowerCase()) return pickLine('greeting');
  const match = TOPICS.find(({ words }) => words.test(text));
  return pickLine(match ? match.topic : 'unknown');
}
