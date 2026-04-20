// ============================================================
// Personality Quiz — D&D Character Trait Assignment
// ============================================================
// New players answer 10 fun situational questions.
// Their answers map to trait tags, which are tallied to find
// their top 2 personality traits.
// ============================================================

export interface QuizQuestion {
  id: number;
  question: string;
  answers: Array<{
    text: string;
    traits: string[]; // 1-2 trait tags this answer points toward
  }>;
}

// ============================================================
// Trait Definitions (~16 traits)
// ============================================================

export const PERSONALITY_TRAITS: Record<
  string,
  { name: string; description: string }
> = {
  Brave: {
    name: "Brave",
    description: "You rush toward danger while others hesitate.",
  },
  Cautious: {
    name: "Cautious",
    description: "You look before you leap — every time.",
  },
  Witty: {
    name: "Witty",
    description: "You're quick with a quip and quicker with a plan.",
  },
  Loyal: {
    name: "Loyal",
    description: "You'd walk through fire for the people you care about.",
  },
  Curious: {
    name: "Curious",
    description: "You can't pass a mysterious door without knocking.",
  },
  Protective: {
    name: "Protective",
    description: "You put yourself between harm and those who can't defend themselves.",
  },
  Reckless: {
    name: "Reckless",
    description: "Plans are for people who aren't confident enough.",
  },
  Honorable: {
    name: "Honorable",
    description: "A promise made is a promise kept, no matter the cost.",
  },
  Cunning: {
    name: "Cunning",
    description: "You win by outsmarting, not out-muscling.",
  },
  Compassionate: {
    name: "Compassionate",
    description: "You feel others' pain deeply and always want to help.",
  },
  Stoic: {
    name: "Stoic",
    description: "Nothing rattles you — you've seen worse.",
  },
  Playful: {
    name: "Playful",
    description: "Life's too short not to have fun, even in a dungeon.",
  },
  Stubborn: {
    name: "Stubborn",
    description: "Once you decide something, a dragon couldn't change your mind.",
  },
  Idealistic: {
    name: "Idealistic",
    description: "You believe the world can be better, and you act like it.",
  },
  Pragmatic: {
    name: "Pragmatic",
    description: "You deal with what is, not what should be.",
  },
  Mysterious: {
    name: "Mysterious",
    description: "You share just enough to keep people wondering.",
  },
};

// ============================================================
// Quiz Questions (10 total)
// ============================================================

export const QUIZ_QUESTIONS: QuizQuestion[] = [
  {
    id: 1,
    question:
      "A stranger drops their coin purse in a crowded market. You...",
    answers: [
      {
        text: "Immediately shout and chase them down to return it.",
        traits: ["Honorable", "Brave"],
      },
      {
        text: "Quietly pick it up and slip it back into their pocket — no fuss needed.",
        traits: ["Cunning", "Mysterious"],
      },
      {
        text: "Return it cheerfully and strike up a conversation about it.",
        traits: ["Playful", "Compassionate"],
      },
      {
        text: "Check your surroundings first, then return it once you're sure it's safe.",
        traits: ["Cautious", "Pragmatic"],
      },
    ],
  },
  {
    id: 2,
    question:
      "Your group is lost in the woods and it's getting dark. What do you do?",
    answers: [
      {
        text: "Take charge and start scouting — you'll find the path.",
        traits: ["Brave", "Reckless"],
      },
      {
        text: "Suggest making camp and studying the stars to navigate in the morning.",
        traits: ["Cautious", "Curious"],
      },
      {
        text: "Keep everyone calm and make sure nobody panics.",
        traits: ["Protective", "Compassionate"],
      },
      {
        text: "Make a joke about it to lighten the mood while quietly working on a plan.",
        traits: ["Witty", "Cunning"],
      },
    ],
  },
  {
    id: 3,
    question:
      "You discover a locked door with a sign that reads: 'Do Not Open.' You...",
    answers: [
      {
        text: "Open it immediately. What's the worst that could happen?",
        traits: ["Reckless", "Curious"],
      },
      {
        text: "Try to find out who put the sign there and why before touching it.",
        traits: ["Cautious", "Pragmatic"],
      },
      {
        text: "Study everything around the door for clues — you need to understand this.",
        traits: ["Curious", "Mysterious"],
      },
      {
        text: "Leave it. Someone put that sign there for a reason, and you respect that.",
        traits: ["Honorable", "Stoic"],
      },
    ],
  },
  {
    id: 4,
    question:
      "A friend makes a terrible decision that you warned them about. When it blows up, you...",
    answers: [
      {
        text: "Help them fix it without saying 'I told you so.' That's what friends do.",
        traits: ["Loyal", "Compassionate"],
      },
      {
        text: "Tell them exactly where they went wrong so they don't do it again.",
        traits: ["Pragmatic", "Honorable"],
      },
      {
        text: "Laugh it off with them — at least it's a good story now.",
        traits: ["Playful", "Witty"],
      },
      {
        text: "Drop everything to be there for them, no questions asked.",
        traits: ["Protective", "Loyal"],
      },
    ],
  },
  {
    id: 5,
    question:
      "You're at a party where you don't know anyone. You...",
    answers: [
      {
        text: "Find the most interesting-looking person and introduce yourself.",
        traits: ["Curious", "Brave"],
      },
      {
        text: "Grab a drink, find a corner, and observe everyone before approaching.",
        traits: ["Mysterious", "Cautious"],
      },
      {
        text: "Make a scene — tell a story, crack a joke, get everyone laughing.",
        traits: ["Playful", "Reckless"],
      },
      {
        text: "Find the host and make sure everyone's having a good time.",
        traits: ["Protective", "Idealistic"],
      },
    ],
  },
  {
    id: 6,
    question:
      "An enemy you've been fighting surrenders and begs for mercy. You...",
    answers: [
      {
        text: "Show mercy. Even enemies deserve a second chance.",
        traits: ["Compassionate", "Idealistic"],
      },
      {
        text: "Let them go, but make it very clear what happens if you meet again.",
        traits: ["Stoic", "Honorable"],
      },
      {
        text: "Take them prisoner — mercy is fine, but you're not naive.",
        traits: ["Pragmatic", "Cautious"],
      },
      {
        text: "Absolutely show mercy. You'd want the same.",
        traits: ["Compassionate", "Loyal"],
      },
    ],
  },
  {
    id: 7,
    question:
      "You find a book in a strange language you've never seen before. You...",
    answers: [
      {
        text: "Drop everything and try to decode it. This is the most exciting thing you've seen all week.",
        traits: ["Curious", "Idealistic"],
      },
      {
        text: "Keep it safe. You don't know what it is, but it seems important.",
        traits: ["Cautious", "Stubborn"],
      },
      {
        text: "Find the nearest expert and figure out what it says.",
        traits: ["Pragmatic", "Curious"],
      },
      {
        text: "Flip through it just to see if anything looks dangerous.",
        traits: ["Reckless", "Witty"],
      },
    ],
  },
  {
    id: 8,
    question:
      "Your team is split — half want to take the safe route, half want the risky shortcut. You...",
    answers: [
      {
        text: "Vote for the risky shortcut. Fortune favors the bold.",
        traits: ["Brave", "Reckless"],
      },
      {
        text: "Vote for the safe route. You've seen too many 'shortcuts' go wrong.",
        traits: ["Cautious", "Stoic"],
      },
      {
        text: "Propose a third option nobody's thought of yet.",
        traits: ["Cunning", "Witty"],
      },
      {
        text: "Go with whatever keeps the team together and moving.",
        traits: ["Loyal", "Protective"],
      },
    ],
  },
  {
    id: 9,
    question:
      "Someone challenges you to a duel — but they're clearly better than you. You...",
    answers: [
      {
        text: "Accept. Win or lose, you don't back down.",
        traits: ["Brave", "Stubborn"],
      },
      {
        text: "Talk your way out of it — fighting is the last resort of the unimaginative.",
        traits: ["Cunning", "Witty"],
      },
      {
        text: "Accept but negotiate the terms — you'll fight on your own ground.",
        traits: ["Pragmatic", "Cautious"],
      },
      {
        text: "Decline, but challenge them to something you're actually good at.",
        traits: ["Playful", "Cunning"],
      },
    ],
  },
  {
    id: 10,
    question:
      "You stumble on a village being threatened by a local bully. They haven't asked for help. You...",
    answers: [
      {
        text: "Step in immediately. You can't walk past this.",
        traits: ["Protective", "Brave"],
      },
      {
        text: "Ask around quietly and find out the full story before doing anything.",
        traits: ["Cautious", "Curious"],
      },
      {
        text: "Confront the bully with words first — you'd rather embarrass them than fight.",
        traits: ["Honorable", "Witty"],
      },
      {
        text: "Help the villagers organize themselves. They don't need a hero — they need a plan.",
        traits: ["Idealistic", "Pragmatic"],
      },
    ],
  },
];

// ============================================================
// Scoring Function
// ============================================================

/**
 * Takes the trait tags selected from each quiz answer,
 * tallies up scores, and returns the top 2 traits.
 *
 * @param answers - Array of trait tag arrays, one per question.
 *                  e.g. [["Brave", "Reckless"], ["Cautious"], ...]
 * @returns The names of the top 2 traits by frequency.
 */
export function scoreQuiz(answers: string[][]): string[] {
  const scores: Record<string, number> = {};

  for (const answerTraits of answers) {
    for (const trait of answerTraits) {
      scores[trait] = (scores[trait] ?? 0) + 1;
    }
  }

  const sorted = Object.entries(scores)
    .sort((a, b) => b[1] - a[1])
    .map(([trait]) => trait);

  return sorted.slice(0, 2);
}
