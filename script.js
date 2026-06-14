import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getDatabase,
  ref,
  set,
  onValue,
  runTransaction,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";
import { firebaseConfig } from "./firebase-config.js";

const els = {
  setupScreen: document.querySelector("#setupScreen"),
  gameScreen: document.querySelector("#gameScreen"),
  hostForm: document.querySelector("#hostForm"),
  joinForm: document.querySelector("#joinForm"),
  hostName: document.querySelector("#hostName"),
  guestName: document.querySelector("#guestName"),
  shareBox: document.querySelector("#shareBox"),
  shareText: document.querySelector("#shareText"),
  waitingLine: document.querySelector("#waitingLine"),
  shareLink: document.querySelector("#shareLink"),
  copyInvite: document.querySelector("#copyInvite"),
  copySave: document.querySelector("#copySave"),
  newGame: document.querySelector("#newGame"),
  connectionStatus: document.querySelector("#connectionStatus"),
  dayLabel: document.querySelector("#dayLabel"),
  turnLabel: document.querySelector("#turnLabel"),
  timerLine: document.querySelector("#timerLine"),
  survivors: document.querySelector("#survivors"),
  scenarioTag: document.querySelector("#scenarioTag"),
  scenarioTitle: document.querySelector("#scenarioTitle"),
  scenarioText: document.querySelector("#scenarioText"),
  sceneImage: document.querySelector("#sceneImage"),
  choices: document.querySelector("#choices"),
  log: document.querySelector("#log")
};

const TURN_SECONDS = 25;
const ARC_ROUNDS = 6;
const PLAYER_KEY = "dead-link-player-id";

const arcs = [
  {
    id: "hostel",
    title: "Hostel Outbreak",
    image: "assets/hostel-outbreak.svg",
    rounds: [
      {
        prompt: "Hostel lights go out. {other} says the noise was definitely human.",
        choices: [
          choice("Check corridor", "Brave, risky, trust up.", "brave", { health: -8, bonk: 12, trust: 8 }, "Brave choice. Bad hallway."),
          choice("Lock the door", "Safe, selfish, trust down.", "safe", { health: 4, snacks: 1, trust: -6 }, "Safe choice. Friendship side-eyed it."),
          choice("Send {other}", "You stay safe. They do not.", "betray", { health: 8, snacks: 1, otherHealth: -14, otherTrust: -22, betray: 1 }, "{other} will remember this hallway.")
        ]
      },
      {
        prompt: "Only one Maggi packet left. Both of you saw it first.",
        choices: [
          choice("Split it", "Both heal, trust rises.", "nice", { health: 4, otherHealth: 4, snacks: -1, trust: 14, otherTrust: 14 }, "Teamwork. Annoyingly healthy."),
          choice("Hide it", "Snack up, trust down.", "selfish", { snacks: 2, trust: -14, otherTrust: -8 }, "Selfish, but useful."),
          choice("Fight for it", "Random swing, big drama.", "chaos", { health: -9, bonk: 10, trust: -8, otherHealth: -6 }, "Bold move. Bad Maggi math.")
        ]
      },
      {
        prompt: "Zombies reach the staircase. The lift still works somehow.",
        choices: [
          choice("Take lift", "Fast but cursed.", "chaos", { health: -10, snacks: 1, bonk: 8 }, "The lift music made it worse."),
          choice("Take stairs", "Tiring but honest.", "safe", { health: -5, trust: 7, otherTrust: 7 }, "Boring survival is still survival."),
          choice("Push furniture", "Team block, costs time.", "nice", { health: -4, otherHealth: -4, trust: 12, otherTrust: 12, bonk: 5 }, "Both pushed. Both complained.")
        ]
      },
      {
        prompt: "{other} starts coughing. Suspicious timing.",
        choices: [
          choice("Ask calmly", "Trust check, small risk.", "nice", { trust: 12, otherTrust: 10, health: -3 }, "Calm talk. Weirdly mature."),
          choice("Step back", "Protect yourself.", "safe", { health: 5, trust: -6, otherTrust: -4 }, "Fair. Cold, but fair."),
          choice("Prepare escape", "Self-preservation mode.", "selfish", { health: 8, snacks: 1, trust: -16, otherTrust: -12 }, "Aura down. Survival up.")
        ]
      },
      {
        prompt: "Rooftop exit is open, but someone must hold the door.",
        choices: [
          choice("Hold it", "Hero move, hurts you.", "hero", { health: -14, trust: 22, otherTrust: 18, bonk: 8 }, "Main character moment. Knees disagreed."),
          choice("Make {other} hold", "Dirty but effective.", "betray", { health: 8, otherHealth: -14, otherTrust: -24, betray: 1 }, "Friendship took fall damage."),
          choice("Run first", "Solo points, trust crash.", "selfish", { health: 12, snacks: 1, trust: -20, otherTrust: -20, betray: 1 }, "You survived, but at what cost?")
        ]
      },
      {
        prompt: "Rescue drone arrives. One bag goes up, not both.",
        choices: [
          choice("Send snacks", "Future healing secured.", "safe", { snacks: 2, trust: 3 }, "Snacks reached the sky. Hope did too."),
          choice("Send weapons", "Bonk future secured.", "brave", { bonk: 16, trust: -3 }, "Bonk economy rising."),
          choice("Send proof", "Looks silly, may help.", "chaos", { trust: 8, otherTrust: 8, health: -5 }, "Selfie proof accepted. Somehow.")
        ]
      }
    ]
  },
  {
    id: "mall",
    title: "Mall Lockdown",
    image: "assets/abandoned-mall.svg",
    rounds: [
      {
        prompt: "Mall shutters close. Zombies are inside. Sale is also inside.",
        choices: [
          choice("Hide in Zara", "Safe, zero dignity.", "safe", { health: 6, trust: -3 }, "You hid behind expensive sadness."),
          choice("Loot snacks", "Snacks up, risk up.", "selfish", { health: -6, snacks: 2, trust: -8 }, "Snack bag acquired. Morals pending."),
          choice("Find exit", "Helpful route search.", "nice", { health: -5, trust: 12, otherTrust: 10 }, "You found arrows. They even meant something.")
        ]
      },
      {
        prompt: "{other} wants branded shoes for running faster.",
        choices: [
          choice("Allow it", "Trust up, time lost.", "nice", { health: -6, otherHealth: 5, trust: 12, otherTrust: 12 }, "Drip improved. Survival unclear."),
          choice("Drag them away", "Safer, bossy.", "safe", { health: 5, otherTrust: -6 }, "Correct choice. Annoying delivery."),
          choice("Steal better shoes", "You gain, trust drops.", "selfish", { health: 8, trust: -16, otherTrust: -10 }, "Fresh shoes. Stale friendship.")
        ]
      },
      {
        prompt: "A zombie blocks the food court. Fries are behind it.",
        choices: [
          choice("Risk fries", "Food glory or pain.", "chaos", { health: -9, snacks: 2, bonk: 4 }, "Fries were hot. Situation hotter."),
          choice("Stay hungry", "Safe, no snacks.", "safe", { health: 4, snacks: 0 }, "Responsible. Deeply boring."),
          choice("Distract zombie", "Help both, costs you.", "hero", { health: -10, otherHealth: 4, trust: 16, otherTrust: 14 }, "Heroic. Also loud.")
        ]
      },
      {
        prompt: "One scooter works. Battery 8 percent. Drama 100 percent.",
        choices: [
          choice("Ride together", "Trust up, risky.", "nice", { health: -6, otherHealth: -6, trust: 16, otherTrust: 16 }, "Two people, one scooter, zero grace."),
          choice("Let {other} ride", "Kind, costly.", "hero", { health: -12, otherHealth: 12, trust: 18, otherTrust: 18 }, "You walked. They owed you."),
          choice("Save battery", "Future safe choice.", "safe", { snacks: 1, trust: 4 }, "Battery survived. Legs complained.")
        ]
      },
      {
        prompt: "Security room has cameras and one zombie with staff ID.",
        choices: [
          choice("Sneak in", "Risk for info.", "brave", { health: -7, bonk: 8, trust: 5 }, "You saw the exit and ten bad ideas."),
          choice("Knock loudly", "Chaos button.", "chaos", { health: -14, bonk: 16 }, "Confidence detected. Safety not found."),
          choice("Send {other}", "Classic betrayal.", "betray", { health: 8, otherHealth: -16, otherTrust: -24, betray: 1 }, "{other} got promoted to bait.")
        ]
      },
      {
        prompt: "Exit opens ten seconds. {other} drops the snack bag.",
        choices: [
          choice("Save {other}", "Trust huge, snacks lost.", "hero", { snacks: -1, trust: 24, otherTrust: 24, otherHealth: 8 }, "Friendship beat chips. Rare."),
          choice("Save snacks", "Useful, brutal.", "betray", { snacks: 3, otherHealth: -12, otherTrust: -28, betray: 1 }, "Snacks saved. Reputation expired."),
          choice("Freeze dramatically", "Nobody respects it.", "chaos", { health: -8, otherHealth: -8, trust: -5, otherTrust: -5 }, "Oscar moment. Survival flop.")
        ]
      }
    ]
  },
  {
    id: "metro",
    title: "Metro Last Train",
    image: "assets/metro-train.svg",
    rounds: [
      {
        prompt: "Last metro arrives. Half the passengers look too hungry.",
        choices: [
          choice("Board fast", "Quick, risky.", "brave", { health: -7, bonk: 8 }, "You boarded. Personal space died first."),
          choice("Wait outside", "Safer now, worse later.", "safe", { health: 5, snacks: -1 }, "Patience survived. Snacks did not."),
          choice("Push through", "Selfish momentum.", "selfish", { health: 7, otherHealth: -8, otherTrust: -14 }, "You moved like a shopping cart.")
        ]
      },
      {
        prompt: "{other} finds a seat and suddenly forgets friendship.",
        choices: [
          choice("Sit anyway", "Petty health boost.", "selfish", { health: 8, otherTrust: -10 }, "You sat on principle and elbows."),
          choice("Stand proudly", "Trust up, legs down.", "hero", { health: -5, trust: 14, otherTrust: 14 }, "Noble. Slightly wobbly."),
          choice("Start argument", "Chaos, morale down.", "chaos", { bonk: 7, trust: -8, otherTrust: -8 }, "Argument won. Situation lost.")
        ]
      },
      {
        prompt: "Announcement says next station closed. Zombies disagree.",
        choices: [
          choice("Jump out", "Dangerous shortcut.", "brave", { health: -12, bonk: 10, snacks: 1 }, "Shortcut found. Ankles unhappy."),
          choice("Stay hidden", "Safe and quiet.", "safe", { health: 5, trust: 4 }, "Breathing quietly became a sport."),
          choice("Pull alarm", "Loud reset.", "chaos", { health: -8, otherHealth: -6, bonk: 12 }, "Alarm worked. Too well.")
        ]
      },
      {
        prompt: "A zombie is stuck in the doors. Free chance.",
        choices: [
          choice("Bonk it", "Bonk grows, risk small.", "brave", { health: -4, bonk: 18 }, "Clean bonk. Crowd impressed."),
          choice("Ignore it", "Safe, no glory.", "safe", { health: 4 }, "You chose peace. Boring peace."),
          choice("Take selfie", "Funny, risky.", "chaos", { health: -10, trust: -4, otherTrust: -4 }, "Content created. Survival questioned.")
        ]
      },
      {
        prompt: "{other}'s phone dies. Their panic is louder than zombies.",
        choices: [
          choice("Share powerbank", "Trust up, snack cost.", "nice", { snacks: -1, trust: 18, otherTrust: 18, otherHealth: 4 }, "Power shared. Panic reduced."),
          choice("Lie about battery", "Selfish calm.", "selfish", { health: 6, trust: -14, otherTrust: -14 }, "Lie detected emotionally."),
          choice("Use as distraction", "Hard betrayal.", "betray", { health: 10, otherHealth: -18, otherTrust: -28, betray: 1 }, "Their panic became your strategy.")
        ]
      },
      {
        prompt: "Train reaches depot. One tunnel. Two cowards.",
        choices: [
          choice("Lead first", "Hero path.", "hero", { health: -12, trust: 22, otherTrust: 20, bonk: 8 }, "You led. Feet regretted it."),
          choice("Follow {other}", "Safer, trust down.", "selfish", { health: 8, otherHealth: -8, otherTrust: -12 }, "Strategic following. Suspiciously close."),
          choice("Flip a coin", "Fate decides.", "chaos", { health: -6, otherHealth: -6, trust: 6, otherTrust: 6 }, "Coin landed on panic.")
        ]
      }
    ]
  },
  {
    id: "wedding",
    title: "Wedding Apocalypse",
    image: "assets/wedding-apocalypse.svg",
    rounds: [
      {
        prompt: "Baraat arrives. So do zombies. Same energy, different hunger.",
        choices: [
          choice("Hide in band", "Noisy cover.", "safe", { health: 5, bonk: 4 }, "You blended into chaos."),
          choice("Run buffet", "Snack dream, risk real.", "selfish", { health: -8, snacks: 3, trust: -5 }, "Buffet secured. Priorities exposed."),
          choice("Save bride", "Hero chaos.", "hero", { health: -12, trust: 20, otherTrust: 16, bonk: 8 }, "Hero move. Aunties approved.")
        ]
      },
      {
        prompt: "{other} refuses to leave before eating gulab jamun.",
        choices: [
          choice("Wait", "Kind, risky.", "nice", { health: -5, otherHealth: 8, trust: 12, otherTrust: 12 }, "Sweet dish, sweeter trust."),
          choice("Drag them", "Safer, rude.", "safe", { health: 6, otherTrust: -8 }, "Correct. Not gentle."),
          choice("Eat first", "Selfish dessert tech.", "selfish", { health: 10, snacks: 1, trust: -16, otherTrust: -12 }, "Selfish, but delicious.")
        ]
      },
      {
        prompt: "A zombie steals the garland. Ceremony paused. Survival too.",
        choices: [
          choice("Chase it", "Risk for bonk.", "brave", { health: -9, bonk: 16 }, "Garland recovered. Why? Unknown."),
          choice("Ignore it", "Safe, practical.", "safe", { health: 5, trust: 2 }, "Finally, a normal decision."),
          choice("Use garland", "Team trick.", "nice", { health: -5, otherHealth: -3, trust: 14, otherTrust: 14, bonk: 8 }, "Decor became equipment.")
        ]
      },
      {
        prompt: "DJ plays a banger. Zombies move in sync.",
        choices: [
          choice("Dance through", "Chaos escape.", "chaos", { health: -8, bonk: 12, trust: 5 }, "Rhythm saved you briefly."),
          choice("Kill music", "Helpful, dangerous.", "hero", { health: -10, otherHealth: 5, trust: 18, otherTrust: 18 }, "Silence never sounded better."),
          choice("Push {other}", "Betrayal on beat.", "betray", { health: 8, otherHealth: -18, otherTrust: -28, betray: 1 }, "Dance floor betrayal unlocked.")
        ]
      },
      {
        prompt: "Only one horse. {other} calls dibs.",
        choices: [
          choice("Share horse", "Trust high, risk high.", "nice", { health: -6, otherHealth: -6, trust: 18, otherTrust: 18 }, "Horse accepted the nonsense."),
          choice("Steal horse", "Solo boost.", "betray", { health: 14, otherHealth: -12, otherTrust: -30, betray: 1 }, "Horse theft. Friendship left walking."),
          choice("Run barefoot", "Pain, no drama.", "safe", { health: -6, trust: 6 }, "Shoes lost. Dignity also.")
        ]
      },
      {
        prompt: "Family says khaana kha ke jaana. Zombies are near.",
        choices: [
          choice("Respect elders", "Snack gain, danger.", "chaos", { health: -10, snacks: 3, trust: 5 }, "Risky, but culturally correct."),
          choice("Escape fast", "Safe now.", "safe", { health: 8, trust: -4 }, "Polite? No. Alive? Yes."),
          choice("Pack food", "Supplies, trust cost.", "selfish", { snacks: 3, trust: -10, otherTrust: -5 }, "Takeaway apocalypse edition.")
        ]
      }
    ]
  },
  {
    id: "gaming",
    title: "Gaming Cafe Outbreak",
    image: "assets/gaming-cafe.svg",
    rounds: [
      {
        prompt: "Zombies enter the gaming cafe. Match is still ranked.",
        choices: [
          choice("Finish match", "Terrible priority.", "chaos", { health: -12, bonk: 10, trust: -4 }, "Rank protected. Life questioned."),
          choice("Alt F4 life", "Smart escape.", "safe", { health: 6, trust: 3 }, "Finally, a useful shortcut."),
          choice("Blame lag", "Comedy, no safety.", "chaos", { health: -8, bonk: 8 }, "Lag was not the bite reason.")
        ]
      },
      {
        prompt: "{other} has headphones on and hears nothing. Classic.",
        choices: [
          choice("Pull headphones", "Helpful, annoying.", "nice", { health: -3, otherHealth: 8, trust: 12, otherTrust: 12 }, "Loud rescue performed."),
          choice("Let them cook", "Selfish silence.", "betray", { health: 8, otherHealth: -16, otherTrust: -24, betray: 1 }, "They cooked. Zombies ate."),
          choice("Type warning", "Nerd solution.", "safe", { bonk: 4, trust: 8, otherTrust: 8 }, "Message sent. Panic received.")
        ]
      },
      {
        prompt: "One chair has wheels. This is transportation now.",
        choices: [
          choice("Ride it", "Fast and dumb.", "chaos", { health: -8, bonk: 12 }, "Chair tech advanced too far."),
          choice("Push {other}", "Helpful maybe.", "nice", { health: -4, otherHealth: 8, trust: 12, otherTrust: 12 }, "Friendship on wheels."),
          choice("Use as shield", "Safe bonk.", "safe", { health: 5, bonk: 8 }, "Furniture carried the team.")
        ]
      },
      {
        prompt: "Power goes out. Someone whispers, who has mobile data?",
        choices: [
          choice("Share hotspot", "Trust up, snack cost.", "nice", { snacks: -1, trust: 16, otherTrust: 16 }, "Hotspot hero moment."),
          choice("Lie instantly", "Selfish calm.", "selfish", { health: 6, trust: -14, otherTrust: -12 }, "Lie speed: world record."),
          choice("Use flashlight", "Safe but visible.", "safe", { health: -5, bonk: 5, trust: 4 }, "Light helped. Zombies subscribed.")
        ]
      },
      {
        prompt: "Zombie grabs the snack shelf. Your chips are in danger.",
        choices: [
          choice("Save chips", "Snack gain, trust loss.", "selfish", { health: -6, snacks: 3, trust: -10 }, "Chips rescued. Values revealed."),
          choice("Save {other}", "Hero trade.", "hero", { health: -12, otherHealth: 10, trust: 22, otherTrust: 20 }, "Friendship beat chips. Historic."),
          choice("Save keyboard", "Questionable bonk.", "chaos", { health: -8, bonk: 14, otherTrust: -4 }, "Keyboard survived. Nobody asked.")
        ]
      },
      {
        prompt: "Exit code is hidden in the game lobby.",
        choices: [
          choice("Solve fast", "Skill check.", "brave", { health: -5, bonk: 8, trust: 8 }, "Brain cells carried."),
          choice("Guess wildly", "Chaos unlock.", "chaos", { health: -10, snacks: 1, bonk: 8 }, "Wrong twice. Dramatic once."),
          choice("Make {other} try", "Lazy betrayal.", "betray", { health: 6, otherHealth: -10, otherTrust: -18, betray: 1 }, "Delegation with bad vibes.")
        ]
      }
    ]
  }
];

const randomEvents = [
  "{actor} sneezed. Zombies noticed the confidence.",
  "{other} found chips. Trust became political.",
  "Someone shouted bhago and gave zero direction.",
  "{actor} found a bat. Main character music started.",
  "{other} dropped the bag. Friendship entered testing phase.",
  "Power returned for exactly three useless seconds.",
  "The door said PUSH. {actor} pulled. Aura decreased.",
  "{other} said they had a plan. Nobody relaxed.",
  "A snack machine blinked. Hope was restored.",
  "Zombies ignored everyone. Slightly insulting.",
  "Someone's ringtone ruined the stealth mission.",
  "{actor} found a helmet. It was child size.",
  "{other} whispered too loudly. Classic.",
  "The room smelled like bad decisions.",
  "One flashlight. Two egos.",
  "The exit sign lied."
];

let app = null;
let db = null;
let roomId = null;
let playerId = localStorage.getItem(PLAYER_KEY) || crypto.randomUUID();
let playerIndex = null;
let state = null;
let roomUnsubscribe = null;
let timerInterval = null;
let lastAutoTurn = -1;

localStorage.setItem(PLAYER_KEY, playerId);

function choice(label, detail, vibe, effect, result) {
  return { label, detail, vibe, effect, result };
}

function firebaseReady() {
  return Boolean(firebaseConfig.apiKey && firebaseConfig.databaseURL && firebaseConfig.projectId);
}

function showNotice(message, isError = false) {
  els.connectionStatus.textContent = message;
  els.connectionStatus.classList.remove("hidden");
  els.connectionStatus.classList.toggle("error", isError);
}

function cleanName(name, fallback) {
  const cleaned = name.trim().replace(/\s+/g, " ").slice(0, 18);
  return cleaned || fallback;
}

function makeRoomId() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function makeSeed() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function hashString(value) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function randomFor(...parts) {
  let x = hashString(parts.join("|")) || 1;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  return (x >>> 0) / 4294967296;
}

function pick(list, ...parts) {
  return list[Math.floor(randomFor(...parts) * list.length)];
}

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function roomRef(id = roomId) {
  return ref(db, `rooms/${id}`);
}

function buildRoomLink(id = roomId) {
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  url.searchParams.set("room", id);
  return url.toString();
}

async function copyText(text, button) {
  try {
    await navigator.clipboard.writeText(text);
    const old = button.textContent;
    button.textContent = "Copied";
    setTimeout(() => {
      button.textContent = old;
    }, 1100);
  } catch {
    window.prompt("Copy this link:", text);
  }
}

function createPlayer(name, role) {
  return {
    id: playerId,
    name,
    role,
    health: 100,
    supplies: 2,
    weapon: 5,
    trust: 60,
    betrayals: 0,
    saves: 0
  };
}

function createRoomState(hostName) {
  const seed = makeSeed();
  const arc = pick(arcs, seed, "arc");
  return {
    seed,
    arcId: arc.id,
    status: "waiting",
    turn: 0,
    maxTurns: ARC_ROUNDS,
    over: false,
    winner: null,
    outcome: null,
    finalTitle: "",
    finalText: "",
    turnStartedAt: Date.now(),
    updatedAt: serverTimestamp(),
    players: [createPlayer(hostName, "host")],
    log: [`${hostName} opened ${arc.title}. Confidence: questionable.`]
  };
}

function showHostWaiting(id) {
  els.shareText.textContent = "Send this link to player 2:";
  els.shareLink.value = buildRoomLink(id);
  els.shareBox.classList.remove("hidden");
  els.waitingLine.textContent = "Waiting for player 2 to join...";
  copyText(els.shareLink.value, els.copyInvite);
}

function showJoin(id) {
  els.hostForm.classList.add("hidden");
  els.shareBox.classList.add("hidden");
  els.joinForm.classList.remove("hidden");
  document.querySelector(".intro").textContent = `Room ${id} is open. Add your name and jump into the chaos.`;
  els.guestName.focus();
}

function subscribeToRoom(id) {
  if (roomUnsubscribe) roomUnsubscribe();
  roomUnsubscribe = onValue(roomRef(id), snapshot => {
    const next = snapshot.val();
    if (!next) {
      showNotice("This room does not exist anymore. Make a fresh room.", true);
      return;
    }
    state = next;
    playerIndex = state.players?.findIndex(player => player.id === playerId) ?? -1;

    if (state.status === "waiting") {
      els.setupScreen.classList.remove("hidden");
      els.gameScreen.classList.add("hidden");
      if (playerIndex === 0) {
        els.hostForm.classList.add("hidden");
        showHostWaiting(id);
      }
      return;
    }

    renderGame();
  });
}

async function hostGame(event) {
  event.preventDefault();
  if (!firebaseReady()) {
    showNotice("Add your Firebase details in firebase-config.js first. Then rooms will work online.", true);
    return;
  }
  if (!db) {
    showNotice("Firebase did not start. Check databaseURL and Realtime Database rules.", true);
    return;
  }
  const hostName = cleanName(els.hostName.value, "Host");
  roomId = makeRoomId();
  playerIndex = 0;
  try {
    await set(roomRef(roomId), createRoomState(hostName));
    history.replaceState(null, "", buildRoomLink(roomId));
    subscribeToRoom(roomId);
    showHostWaiting(roomId);
  } catch (error) {
    showNotice(`Could not create room: ${error.message}`, true);
  }
}

async function joinGame(event) {
  event.preventDefault();
  if (!db) {
    showNotice("Firebase did not start. Check databaseURL and Realtime Database rules.", true);
    return;
  }
  const guestName = cleanName(els.guestName.value, "Player 2");
  const joinId = els.joinForm.dataset.room;
  let joined = false;
  let reason = "Room is full or already started.";

  try {
    await runTransaction(roomRef(joinId), room => {
      if (!room) {
        reason = "That room does not exist.";
        return;
      }
      if (room.players?.some(player => player.id === playerId)) {
        joined = true;
        return room;
      }
      if (room.status !== "waiting" || (room.players?.length ?? 0) >= 2) {
        return;
      }
      room.players = [...room.players, createPlayer(guestName, "guest")];
      room.status = "playing";
      room.turn = 0;
      room.turnStartedAt = Date.now();
      room.updatedAt = serverTimestamp();
      room.log = [...(room.log || []), `${guestName} joined. The room locked at two survivors.`];
      joined = true;
      return room;
    });
  } catch (error) {
    showNotice(`Could not join room: ${error.message}`, true);
    return;
  }

  if (!joined) {
    showNotice(reason, true);
    return;
  }

  roomId = joinId;
  subscribeToRoom(roomId);
}

function activeIndex(room = state) {
  return room.turn % 2;
}

function otherIndex(room = state) {
  return activeIndex(room) === 0 ? 1 : 0;
}

function isMyTurn() {
  return !state.over && playerIndex === activeIndex();
}

function currentArc(room = state) {
  return arcs.find(arc => arc.id === room.arcId) || arcs[0];
}

function formatLine(text, actor, other) {
  return text
    .replaceAll("{player}", actor.name)
    .replaceAll("{actor}", actor.name)
    .replaceAll("{other}", other.name)
    .replaceAll("{p1}", state?.players?.[0]?.name || "P1")
    .replaceAll("{p2}", state?.players?.[1]?.name || "P2");
}

function getScenario(room = state) {
  const arc = currentArc(room);
  if (room.over) {
    return {
      type: "finale",
      title: room.finalTitle || "Finale",
      text: room.finalText || "The rescue siren fades. Choices have receipts.",
      image: imageForOutcome(room.outcome),
      choices: []
    };
  }
  const round = arc.rounds[room.turn] || arc.rounds[arc.rounds.length - 1];
  return {
    ...round,
    type: arc.id,
    title: arc.title,
    image: arc.image
  };
}

function imageForOutcome(outcome) {
  if (outcome === "duo") return "assets/duo-escape.svg";
  if (outcome === "disaster") return "assets/zombie-street.svg";
  return "assets/safehouse.svg";
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  })[char]);
}

function playerLabel(index) {
  if (state.over) {
    if (state.outcome === "duo") return "Escaped";
    if (state.outcome === "disaster") return "Doomed";
    return state.winner === index ? "Escaped" : "Left";
  }
  if (index === activeIndex()) return "Choosing";
  return "Waiting";
}

function renderPlayers() {
  els.survivors.innerHTML = "";
  state.players.forEach((player, index) => {
    const card = document.createElement("article");
    card.className = `player-card pop-in ${player.health <= 0 ? "dead" : ""} ${state.winner === index || state.outcome === "duo" ? "winner" : ""} ${index === activeIndex() && !state.over ? "active-player" : ""}`;
    const healthColor = player.health > 55 ? "var(--green)" : player.health > 25 ? "var(--yellow)" : "var(--red)";
    card.innerHTML = `
      <div class="player-head">
        <h3 class="player-name">${escapeHtml(player.name)}</h3>
        <span class="badge">${playerLabel(index)}</span>
      </div>
      <div class="stat"><span>Health</span><div class="bar"><span style="width:${player.health}%;background:${healthColor}"></span></div><strong>${player.health}</strong></div>
      <div class="stat"><span>Snacks</span><div class="bar"><span style="width:${clamp(player.supplies * 18)}%;background:var(--yellow)"></span></div><strong>${player.supplies}</strong></div>
      <div class="stat"><span>Bonk</span><div class="bar"><span style="width:${clamp(player.weapon)}%"></span></div><strong>${player.weapon}</strong></div>
      <div class="stat"><span>Trust</span><div class="bar"><span style="width:${player.trust}%;background:var(--accent)"></span></div><strong>${player.trust}</strong></div>
    `;
    els.survivors.appendChild(card);
  });
}

function renderLog() {
  els.log.innerHTML = "";
  (state.log || []).slice(-10).reverse().forEach(item => {
    const li = document.createElement("li");
    li.textContent = item;
    els.log.appendChild(li);
  });
}

function availableChoices() {
  const actor = state.players[activeIndex()];
  const other = state.players[otherIndex()];
  const scenario = getScenario();
  const choices = [...scenario.choices];

  if (actor.supplies > 0) {
    choices.push(choice("Eat snack", "-1 snack, heal yourself.", "snack", { snacks: -1, health: 14 }, "Snack used. Panic reduced."));
    choices.push(choice("Share snack", "-1 snack, heal both, trust up.", "nice", { snacks: -1, health: 6, otherHealth: 6, trust: 10, otherTrust: 10 }, "Shared snack. Suspiciously wholesome."));
  }

  if (actor.trust < 35 && other.betrayals > 0) {
    choices.push(choice("Settle score", "Revenge option unlocked by low trust.", "revenge", { health: 8, snacks: 1, otherHealth: -12, otherTrust: -12 }, "Revenge served. Not cold, just petty."));
  }

  if (actor.health < 30) {
    choices.push(choice("Desperate move", "Risky comeback attempt.", "chaos", { health: -6, snacks: 1, bonk: 18, trust: -4 }, "Desperation unlocked bonus chaos."));
  }

  return choices;
}

function renderScenario() {
  const scenario = getScenario();
  const actor = state.players[activeIndex()] || state.players[0];
  const other = state.players[otherIndex()] || state.players[1] || actor;
  els.dayLabel.textContent = state.over ? "-" : `${state.turn + 1}/${state.maxTurns}`;
  els.turnLabel.textContent = state.over ? "Game over" : isMyTurn() ? "Your choice!" : `${actor.name} is choosing`;
  els.scenarioTag.textContent = state.over ? "Ending" : `${scenario.title} - Round ${state.turn + 1}`;
  els.scenarioTitle.textContent = state.over ? scenario.title : "Choose fast";
  els.scenarioText.textContent = formatLine(scenario.text || scenario.prompt, actor, other);
  els.sceneImage.src = scenario.image || "assets/abandoned-mall.svg";
  els.choices.innerHTML = "";

  if (state.over) {
    const p = document.createElement("p");
    p.className = "final-text";
    p.textContent = endingSummary();
    els.choices.appendChild(p);
    return;
  }

  if (!isMyTurn()) {
    const wait = document.createElement("p");
    wait.className = "waiting-card";
    wait.textContent = `Waiting for ${actor.name}. Your revenge era may come later.`;
    els.choices.appendChild(wait);
  }

  availableChoices().forEach((item, index) => {
    const button = document.createElement("button");
    button.className = `choice-button vibe-${item.vibe}`;
    button.type = "button";
    button.disabled = !isMyTurn();
    button.style.animationDelay = `${index * 45}ms`;
    button.innerHTML = `<strong>${escapeHtml(formatLine(item.label, actor, other))}</strong><span>${escapeHtml(item.detail)}</span>`;
    button.addEventListener("click", () => choose(index, false));
    els.choices.appendChild(button);
  });
}

function endingSummary() {
  if (state.outcome === "duo") return "Both escaped. Rare friendship W.";
  if (state.outcome === "disaster") return "Both failed. The post-game blame session will be historic.";
  const winner = state.players[state.winner];
  const loser = state.players[state.winner === 0 ? 1 : 0];
  return `${winner.name} escaped. ${loser.name} got the emotional damage ending.`;
}

function renderGame() {
  els.setupScreen.classList.add("hidden");
  els.gameScreen.classList.remove("hidden");
  renderPlayers();
  renderScenario();
  renderLog();
  startTimer();
}

function secondsLeft(room = state) {
  const elapsed = Math.floor((Date.now() - (room.turnStartedAt || Date.now())) / 1000);
  return clamp(TURN_SECONDS - elapsed, 0, TURN_SECONDS);
}

function startTimer() {
  clearInterval(timerInterval);
  tickTimer();
  timerInterval = setInterval(tickTimer, 250);
}

function tickTimer() {
  if (!state || state.over || state.status !== "playing") {
    els.timerLine.textContent = "";
    return;
  }
  const left = secondsLeft();
  els.timerLine.textContent = `${left}s left${isMyTurn() ? "" : " - waiting"}`;
  els.timerLine.style.setProperty("--timer", `${(left / TURN_SECONDS) * 100}%`);

  if (left <= 0 && lastAutoTurn !== state.turn) {
    lastAutoTurn = state.turn;
    autoChoose();
  }
}

function addLog(room, message) {
  const log = [...(room.log || []), message];
  return log.slice(-50);
}

function damage(player, amount) {
  player.health = clamp(player.health - amount);
}

function heal(player, amount) {
  player.health = clamp(player.health + amount);
}

async function autoChoose() {
  const choices = availableChoices();
  if (!choices.length) return;
  const index = Math.floor(randomFor(state.seed, state.turn, "timeout") * choices.length);
  await choose(index, true);
}

async function choose(choiceIndex, timedOut) {
  if (!state || state.over) return;
  await runTransaction(roomRef(), room => {
    if (!room || room.over || room.status !== "playing") return room;
    if (!timedOut && room.players?.[room.turn % 2]?.id !== playerId) return room;
    if (timedOut && secondsLeft(room) > 0) return room;

    applyChoice(room, choiceIndex, timedOut);
    room.updatedAt = serverTimestamp();
    return room;
  });
}

function choicesForRoom(room) {
  const actor = room.players[activeIndex(room)];
  const other = room.players[otherIndex(room)];
  const arc = currentArc(room);
  const round = arc.rounds[room.turn] || arc.rounds[arc.rounds.length - 1];
  const choices = [...round.choices];
  if (actor.supplies > 0) {
    choices.push(choice("Eat snack", "-1 snack, heal yourself.", "snack", { snacks: -1, health: 14 }, "Snack used. Panic reduced."));
    choices.push(choice("Share snack", "-1 snack, heal both, trust up.", "nice", { snacks: -1, health: 6, otherHealth: 6, trust: 10, otherTrust: 10 }, "Shared snack. Suspiciously wholesome."));
  }
  if (actor.trust < 35 && other.betrayals > 0) {
    choices.push(choice("Settle score", "Revenge option unlocked by low trust.", "revenge", { health: 8, snacks: 1, otherHealth: -12, otherTrust: -12 }, "Revenge served. Not cold, just petty."));
  }
  if (actor.health < 30) {
    choices.push(choice("Desperate move", "Risky comeback attempt.", "chaos", { health: -6, snacks: 1, bonk: 18, trust: -4 }, "Desperation unlocked bonus chaos."));
  }
  return choices;
}

function applyChoice(room, choiceIndex, timedOut) {
  const actor = room.players[activeIndex(room)];
  const other = room.players[otherIndex(room)];
  const choices = choicesForRoom(room);
  const picked = choices[choiceIndex] || pick(choices, room.seed, room.turn, "fallback");
  const autoText = timedOut ? " Time ran out, so fate clicked." : "";

  applyEffect(actor, other, picked.effect || {});
  room.log = addLog(room, formatLine(`${actor.name}: ${picked.result}${autoText}`, actor, other));

  if (randomFor(room.seed, room.turn, "event") > 0.45) {
    room.log = addLog(room, formatLine(pick(randomEvents, room.seed, room.turn, "random-event"), actor, other));
  }

  room.players.forEach(player => {
    if (player.supplies <= 0 && player.health > 0) damage(player, 3);
  });

  room.turn += 1;
  room.turnStartedAt = Date.now();

  const living = room.players.map((player, index) => player.health > 0 ? index : null).filter(index => index !== null);
  if (living.length <= 1) {
    room.over = true;
    room.status = "over";
    room.outcome = living.length === 1 ? "solo" : "disaster";
    room.winner = living[0] ?? null;
    room.finalTitle = living.length === 1 ? "Solo Escape" : "Total Disaster";
    room.finalText = living.length === 1 ? `${room.players[living[0]].name} limps out alone.` : "Both survivors ran out of luck.";
    return;
  }

  if (room.turn >= room.maxTurns) {
    resolveEnding(room);
  }
}

function applyEffect(actor, other, effect) {
  changeHealth(actor, effect.health || 0);
  changeHealth(other, effect.otherHealth || 0);
  actor.supplies = Math.max(0, actor.supplies + (effect.snacks || 0));
  other.supplies = Math.max(0, other.supplies + (effect.otherSnacks || 0));
  actor.weapon = clamp(actor.weapon + (effect.bonk || 0));
  other.weapon = clamp(other.weapon + (effect.otherBonk || 0));
  actor.trust = clamp(actor.trust + (effect.trust || 0));
  other.trust = clamp(other.trust + (effect.otherTrust || 0));
  if (effect.betray) actor.betrayals += effect.betray;
  if ((effect.trust || 0) > 12 || (effect.otherTrust || 0) > 12) actor.saves += 1;
}

function changeHealth(player, amount) {
  if (amount >= 0) {
    heal(player, amount);
  } else {
    damage(player, Math.abs(amount));
  }
}

function resolveEnding(room) {
  const [p1, p2] = room.players;
  const totalSnacks = p1.supplies + p2.supplies;
  const averageTrust = (p1.trust + p2.trust) / 2;
  const bothHealthy = p1.health >= 35 && p2.health >= 35;
  const betrayals = p1.betrayals + p2.betrayals;
  const duoReady = bothHealthy && totalSnacks >= 2 && averageTrust >= 72 && betrayals <= 1;
  const disaster = p1.health < 20 && p2.health < 20 || totalSnacks === 0 && averageTrust < 35;

  room.over = true;
  room.status = "over";

  if (duoReady) {
    room.outcome = "duo";
    room.winner = null;
    room.finalTitle = "Duo Escape";
    room.finalText = "Rescue arrives with two seats. Trust paid rent today.";
    room.log = addLog(room, "Duo escape unlocked: high trust, enough snacks, low betrayal.");
    return;
  }

  if (disaster) {
    room.outcome = "disaster";
    room.winner = null;
    room.finalTitle = "Total Disaster";
    room.finalText = "No snacks, no trust, no plan. The math was rude.";
    room.log = addLog(room, "Both failed. The zombies did not even need strategy.");
    return;
  }

  const scores = room.players.map(player => {
    return player.health * 3 + player.supplies * 12 + player.weapon * 3 + player.trust * 1.4 - player.betrayals * 20 + player.saves * 10;
  });
  room.outcome = "solo";
  room.winner = scores[0] === scores[1] ? (p1.health >= p2.health ? 0 : 1) : (scores[0] > scores[1] ? 0 : 1);
  room.finalTitle = "Solo Escape";
  room.finalText = `${room.players[room.winner].name} gets the only clean exit. The other gets a story to complain about.`;
  room.log = addLog(room, `${room.players[room.winner].name} wins the solo escape. Trust was not high enough for both.`);
}

function boot() {
  if (!firebaseReady()) {
    showNotice("Firebase is not configured yet. Add your project details in firebase-config.js for live two-player rooms.", true);
  } else {
    try {
      app = initializeApp(firebaseConfig);
      db = getDatabase(app);
    } catch (error) {
      showNotice(`Firebase setup error: ${error.message}`, true);
    }
  }

  const params = new URLSearchParams(window.location.search);
  const urlRoom = params.get("room");
  if (urlRoom && firebaseReady() && db) {
    roomId = urlRoom;
    els.joinForm.dataset.room = urlRoom;
    showJoin(urlRoom);
    subscribeToRoom(urlRoom);
  }
}

els.hostForm.addEventListener("submit", hostGame);
els.joinForm.addEventListener("submit", joinGame);
els.copyInvite.addEventListener("click", () => copyText(els.shareLink.value, els.copyInvite));
els.copySave.addEventListener("click", () => copyText(buildRoomLink(), els.copySave));
els.newGame.addEventListener("click", () => {
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  window.location.href = url.toString();
});

boot();
