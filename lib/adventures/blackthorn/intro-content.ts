/**
 * First-time-player onboarding copy for "Rescue of the Blackthorn Clan".
 *
 * Original prose. The product framing (AI Dungeon Master, per-phone rating
 * picks, no handouts, no DM-swap) intentionally diverges from the source
 * book's tabletop framing. The character context is synthesized from the
 * source backstories (Tarric pp. 59-60, Wynn pp. 65-66) but written fresh.
 *
 * Edits are welcome — this is just typed copy, no schema-validated content.
 */

export interface RatingTier {
  tier: 'G' | 'PG' | 'PG-13' | 'R' | 'NC-17'
  desc: string
}

export interface IntroPanel {
  title: string
  body: string
}

export interface IntroContent {
  welcome: IntroPanel
  rating: {
    title: string
    intro: string
    tiers: RatingTier[]
    outro: string
  }
  genderOrientation: IntroPanel
  storyOverRules: IntroPanel
  narrative: IntroPanel
}

export const BLACKTHORN_INTRO: IntroContent = {
  welcome: {
    title: 'Welcome',
    body: `Welcome to *Rescue of the Blackthorn Clan*, the first adventure in the Date Night Dungeons series — a Dungeons & Dragons campaign written for two players to share. It's a fifth-edition fantasy adventure with a romance layer woven through it: as your characters fight together, travel together, and look out for each other, an attraction score quietly tracks between them. By the end you'll know whether the story closes on true love, a single kiss, or two people glad to be done with each other. The dice decide.

This isn't a video game — it's a *role-playing* game. There's a story, there are stakes, and there are choices you'll make in your own voice. An AI Dungeon Master narrates the world, voices every character but your own, and calls for rolls when the outcome is in doubt. You don't need to have played D&D before; it will teach you the rules as they come up.

The adventure runs across four scenarios, each roughly one to two hours. You can do them one a night or in one long sitting — whatever fits.

If you'd rather play this without the romance layer, you can; the AI will skip those rolls and run it as a normal fantasy adventure. But it was built with couples in mind, and it's at its best when it leans into that.`,
  },

  rating: {
    title: 'The Rating',
    intro: `The romance layer can be as sweet or as spicy as both players want — and only as spicy as the more cautious of you wants. Before you start, each of you picks a comfort level on your phone, privately:`,
    tiers: [
      { tier: 'G', desc: 'Sweet. Hand-holding, longing looks.' },
      { tier: 'PG', desc: 'Warm. Kisses, the occasional fade-to-black.' },
      { tier: 'PG-13', desc: 'Suggestive but tasteful. Implied, not described.' },
      { tier: 'R', desc: 'Adult. Described, not graphic.' },
      { tier: 'NC-17', desc: 'Anything goes.' },
    ],
    outro: `The session runs at whichever of the two picks is more cautious. Your partner sees the final setting, not your individual pick. You can revisit this between scenarios — what felt right on the first night might shift by the third.`,
  },

  genderOrientation: {
    title: 'Gender and Orientation',
    body: `The two characters are written as a woman and a man — Wynn and Tarric — but that's just the shape they were drawn in. You are entirely free to play either character as any gender or orientation that feels right to you, and the story works the same in any direction. The romance is between *these two people*, however the two of you choose to imagine them.`,
  },

  storyOverRules: {
    title: 'Story Over Rules',
    body: `Dungeons & Dragons has a lot of rules. The AI cares about getting them right enough to keep the game fair, but not so right that the story or the romance gets lost to a rules argument. If a roll doesn't come out the way you expected, or a ruling gets bent in the heat of a scene, that's the game working as intended. The point is that the two of you have a good time. Story trumps rules; romance trumps both.`,
  },

  narrative: {
    title: 'Palor Altor — Autumn',
    body: `The town sits where farmland gives way to forest, along a sparkling stream that turns an old grain mill far down the valley. Its Thane is **Stirling Blackthorn** — steady, well-loved, and lately not well at all. For months he has been losing weight, sometimes confused. The healers can't find the cause. Two people who love him got word, and made their way home.

**Wynn Blackthorn** is the Thane's daughter and heir — twenty-two, sharp-tongued when she has reason to be, raised on equal parts statecraft and old books. Sorcery woke up in her not long after her mother died, when she was twelve, and her father sent her to a family friend, a sorcerer named **Melick**, to learn to hold what runs through her hands. She has spent the years since studying magic, history, and the shape of leadership Palor Altor will one day need from her. Her own romantic life is a thinner thread — at seventeen she accidentally cast **Charm Person** on a young man she was kissing, and when the spell wore off he was furious. She has been slow to trust anyone with her magic or her heart since. The letter telling her about her father's illness reached her a week ago. She set out for home the same hour.

**Tarric Greycloak** is a ranger who grew up in the city of San Francillieth and could not get away from it fast enough. His father — a city guard — died in the line of duty when Tarric was young, and Tarric chose the woods around Mill Vale over the stone walls he had grown up among. He trained there as a ranger, raised a wolf cub he calls **Briar**, and earned a reputation with the local militia for being both smart and tough. A year ago Stirling hired him to recover the Thane's young son, Carrow, from kidnappers — a job that ended well, though the men who took the boy were never caught, and other children have disappeared since. Tarric stayed on afterward, first as guard, somewhere along the way as a friend. It was Tarric who wrote to Wynn about her father.

She arrived last night, late. Tarric saw her come in from the gatehouse window and kept his distance — let father and daughter have the evening. Karsyn, Stirling's wife, was away tending a sick leaseholder; she was due back in the morning.

In the small hours, Tarric was outside with a pipe while Briar took a turn in the courtyard, and he saw a face moving past an upstairs window where no one should be. By the time he and Briar reached the master bedroom, two armed men already stood over the Thane in the dark, and the fight was underway. When it was over, the intruders didn't get back up.

But the lock on the front door had been broken, the guards on the grounds were dead, and by dawn the chambermaid was screaming from Wynn's bedroom. The bed was rumpled, the room empty, and a ransom letter lay on the pillow.

Stirling has six hours to gather a thousand gold in platinum and gems. Tarric has six hours to find her before he has to. Two of the Thane's men rode out with him at first light, but an ambush on the road sent them back wounded — and Tarric and Briar pressed on alone, tracking Wynn's scent down the stream toward an old grain mill the local woodsfolk have been muttering about lately, for the wrong reasons.

That is where the story begins.`,
  },
}
