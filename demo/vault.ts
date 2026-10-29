// A made-up sample vault for the browser demo. Every note is fictional; `age` is days since it was
// last touched, so some memories are fresh and some have started to fade.

export interface DemoNote {
  path: string;
  age: number;
  fm?: Record<string, unknown>;
  body: string;
}

export const NOTES: DemoNote[] = [
  // Wall calendar: reviews
  { path: "reviews/2026-W43 weekly review.md", age: 2, body: `# Week 43 review

**Went well:** shipped the reading nook shelf, three morning walks, finished *The Left Hand of Darkness*.

**Didn't:** the sourdough starter died again.

**Next week**
- Book the dentist
- Draft the garden plan, see [[Grow tomatoes on the balcony]]
- Call Grandma on Sunday` },
  { path: "reviews/2026-W42 weekly review.md", age: 9, body: `# Week 42 review

A slow week. Rain most days, which was perfect for the [[Learn watercolour]] project.

- Two paintings, both of the same teapot
- Sleep was good, 7h average` },
  { path: "reviews/2026-09 monthly review.md", age: 38, body: `# September review

Theme of the month: *less phone, more paper.*

1. Read four books
2. Started the journal habit again
3. Moved the desk next to the window, best decision this year` },

  // Mirror: identity
  { path: "identity/USER.md", age: 4, body: `# About me

I like quiet mornings, long walks and tidy desks. I keep this vault so I remember what matters.

## Values
- Be kind first
- Make things with my hands
- Leave places nicer than I found them

## Currently into
Watercolour, lo-fi music, slow cooking.` },

  // Corkboard: questions and missions
  { path: "open-questions.md", age: 3, body: `# Open questions

- Should I learn Spanish or Japanese next?
- What would a four-day work week look like for me?
- Is a cat a good idea for a small flat? (DJ Whiskers says yes)` },
  { path: "missions/Walk 1000 km this year.md", age: 1, body: `# Walk 1000 km this year

Progress: **742 km** so far.

- [x] January to June: 410 km
- [x] July to September: 260 km
- [ ] October to December: 258 km to go` },
  { path: "missions/Cook every recipe in the blue book.md", age: 12, body: `# Cook every recipe in the blue book

31 of 64 done. Favourite so far: the miso aubergine.` },

  // Box at the foot of the bed: archive
  { path: "archive/2024 travel plans.md", age: 400, body: `# 2024 travel plans

Lisbon in spring, the Lake District in autumn. Both happened, both were lovely.` },
  { path: "archive/Old flat move checklist.md", age: 210, body: `# Moving checklist

- [x] Boxes from the corner shop
- [x] Change address everywhere
- [x] Say goodbye to the neighbour's dog` },
  { path: "archive/University notes index.md", age: 900, body: `# University notes index

Kept for nostalgia. Mostly coffee stains.` },

  // Window: interests
  { path: "keep/Birdwatching from the window.md", age: 2, body: `# Birdwatching from the window

Seen this month: robin, two blue tits, a very confused pigeon.

Next: put up the feeder.` },
  { path: "keep/Lo-fi music to study to.md", age: 6, body: `# Lo-fi music to study to

Rainy-day beats, vinyl crackle, a cat on the keys. The music player in the room plays these.` },
  { path: "keep/Japanese woodblock prints.md", age: 20, body: `# Japanese woodblock prints

Hokusai's waves, Hiroshige's rain. Would love one print for the hallway.` },

  // Desk: projects (STATUS.md per project, titled by folder)
  { path: "projects/Reading nook/STATUS.md", age: 1, body: `# Reading nook

**Status:** nearly done

- [x] Build the shelf
- [x] Find a beanbag
- [ ] Fairy lights above the window` },
  { path: "projects/Learn watercolour/STATUS.md", age: 3, body: `# Learn watercolour

**Status:** practising

Twenty minutes every evening. Current lesson: wet-on-wet skies.` },
  { path: "projects/Grow tomatoes on the balcony/STATUS.md", age: 8, body: `# Grow tomatoes on the balcony

**Status:** planning for spring

Varieties to try: Sungold, Gardener's Delight. Needs two big pots and a sunny corner.` },
  { path: "projects/Family recipe book/STATUS.md", age: 15, body: `# Family recipe book

**Status:** collecting

Grandma's lemon cake, Dad's Sunday curry, Auntie May's dumplings.` },

  // Filing cabinet: decisions
  { path: "decisions/2026-10-02 switch to a paper planner.md", age: 27, body: `# Switch to a paper planner

**Decision:** use a paper weekly planner and keep the vault for long notes.

**Why:** fewer notifications, and writing by hand helps me remember.` },
  { path: "decisions/2026-08-14 adopt a cat.md", age: 76, body: `# Adopt a cat

**Decision:** yes, a rescue cat, once the flat inspection is done.

**Name ideas:** Miso, Pixel, DJ Whiskers (winner).` },
  { path: "decisions/2026-10-20 no screens after 10pm.md", age: 4, body: `# No screens after 10pm

Trying it for a month. Books and tea instead.` },

  // Bookshelf: notes
  { path: "notes/How memory palaces work.md", age: 2, body: `# How memory palaces work

The *method of loci*: put each thing you want to remember in a place you know well, then walk through it in your mind.

This room is one. Each spot holds one kind of memory, and **Walk** visits them in order.` },
  { path: "notes/Sourdough troubleshooting.md", age: 5, body: `# Sourdough troubleshooting

- Flat loaf: starter not active enough
- Gummy crumb: cut it too early
- Starter died: probably forgot it for two weeks (again)` },
  { path: "notes/Book list 2026.md", age: 7, body: `# Book list 2026

1. *The Left Hand of Darkness*, Ursula K. Le Guin
2. *Piranesi*, Susanna Clarke
3. *A Psalm for the Wild-Built*, Becky Chambers
4. *Klara and the Sun*, Kazuo Ishiguro` },
  { path: "notes/Tea ratios.md", age: 14, body: `# Tea ratios

- Green: 80°C, 2 minutes
- Black: just off the boil, 4 minutes
- Chamomile: as long as you like` },
  { path: "notes/Houseplant watering.md", age: 22, body: `# Houseplant watering

Monstera weekly, snake plant monthly, the cactus basically never.` },
  { path: "notes/Keyboard shortcuts I keep forgetting.md", age: 40, body: `# Keyboard shortcuts I keep forgetting

In the room: **arrow keys** walk between spots, **Esc** steps back, **/** finds a memory.` },

  // Plant: daily logs
  { path: "daily/2026-10-28.md", age: 0, body: `# Tuesday

Morning walk by the canal, 6 km. Painted the teapot again. DJ Whiskers knocked a pen off the desk, twice.` },
  { path: "daily/2026-10-27.md", age: 1, body: `# Monday

Rainy. Soup, a book and an early night.` },
  { path: "daily/2026-10-25.md", age: 3, body: `# Saturday

Farmers' market: apples, sourdough (bought, not baked), a small cactus.` },
  { path: "daily/2026-10-19.md", age: 9, body: `# Sunday

Called Grandma. She wants the lemon cake recipe back.` },

  // Photo table: placed with the room-spot property
  { path: "people/Grandma.md", age: 9, fm: { "room-spot": "photo_table" }, body: `# Grandma

Makes the best lemon cake in the world. Call on Sundays.

Birthday: 3 March.` },
  { path: "people/Sam and Alex.md", age: 18, fm: { "room-spot": "photo_table" }, body: `# Sam and Alex

Neighbours upstairs. Board game night every other Friday.` },
  { path: "people/DJ Whiskers.md", age: 0, fm: { "room-spot": "photo_table" }, body: `# DJ Whiskers

The room's cat. Wanders about, eats from the dish, and dances when music plays.

Click the cat to say hello.` },

  // Music player
  { path: "music/Rainy day playlist.md", age: 6, fm: { "room-spot": "music_player" }, body: `# Rainy day playlist

Soft beats for wet afternoons. Press play on the music player and watch the cat dance.` },
];
