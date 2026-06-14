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

const FINAL_TURN = 18;
const TURN_SECONDS = 25;
const PLAYER_KEY = "dead-link-player-id";

const imageByType = {
  fight: "assets/zombie-street.svg",
  food: "assets/food-cache.svg",
  search: "assets/abandoned-mall.svg",
  betray: "assets/betrayal-alley.svg",
  rest: "assets/safehouse.svg",
  trap: "assets/zombie-street.svg",
  finale: "assets/safehouse.svg"
};

const scenarioDeck = [
  {
    type: "fight",
    title: "Zombie conga line at the snack shop",
    text: "{player} sees chips, soda, and six zombies doing the slowest group dance ever.",
    choices: [
      { label: "Bonk and run", detail: "Fight for snacks and maybe a useful stick.", kind: "fight" },
      { label: "Tiptoe like a cartoon thief", detail: "Safer, unless your shoe squeaks.", kind: "sneak" },
      { label: "Yell your friend's name", detail: "Mean, funny, and very risky for them.", kind: "bait" }
    ]
  },
  {
    type: "food",
    title: "Suspicious soup jackpot",
    text: "{player} finds cans labelled only with a smiley face. That is normal, probably.",
    choices: [
      { label: "Eat the smile soup", detail: "Could heal you. Could make you regret soup.", kind: "eat" },
      { label: "Share tiny bites", detail: "Both test it like brave little food scientists.", kind: "shareFood" },
      { label: "Hide it for later", detail: "No tummy risk, but your friend may judge you.", kind: "stash" }
    ]
  },
  {
    type: "search",
    title: "Mall trip, apocalypse edition",
    text: "The mall is open forever now. {player} gets one quick stop before the zombies notice the vibes.",
    choices: [
      { label: "Sports store", detail: "Maybe get a weapon. Maybe get a football helmet.", kind: "weapon" },
      { label: "Tiny clinic", detail: "Bandages, pills, and one creepy poster.", kind: "medicine" },
      { label: "Grab random stuff", detail: "Safe choice. Boring but useful.", kind: "supplies" }
    ]
  },
  {
    type: "betray",
    title: "One bicycle. Two survivors. Awkward.",
    text: "{player} spots a bike with one good wheel. It squeaks, but freedom also squeaks sometimes.",
    choices: [
      { label: "Ride away alone", detail: "Fast, selfish, dramatic.", kind: "escapeAlone" },
      { label: "Call dibs together", detail: "Teamwork. Annoyingly healthy.", kind: "honest" },
      { label: "Pop the tire", detail: "If you cannot have it, nobody has it.", kind: "sabotage" }
    ]
  },
  {
    type: "rest",
    title: "A couch that smells only slightly haunted",
    text: "{player} finds a room with a locked door and a couch that has seen things.",
    choices: [
      { label: "Power nap", detail: "Heal a lot, unless the couch bites first.", kind: "sleep" },
      { label: "Patch yourself up", detail: "Good healing, costs supplies.", kind: "patch" },
      { label: "Keep watch", detail: "You get tired, your friend gets safer.", kind: "watch" }
    ]
  },
  {
    type: "trap",
    title: "Radio says free rescue",
    text: "A radio promises rescue at sunset. {player} knows free things are often traps with better marketing.",
    choices: [
      { label: "Follow the signal", detail: "Could be help. Could be a spicy mistake.", kind: "signal" },
      { label: "Set your own trap", detail: "Spend supplies to outsmart trouble.", kind: "counterTrap" },
      { label: "Send friend first", detail: "A classic friendship speedrun.", kind: "sendOther" }
    ]
  }
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
    supplies: 1,
    weapon: 0,
    trust: 55,
    betrayals: 0
  };
}

function createRoomState(hostName) {
  return {
    seed: makeSeed(),
    status: "waiting",
    turn: 0,
    maxTurns: FINAL_TURN,
    over: false,
    winner: null,
    turnStartedAt: Date.now(),
    updatedAt: serverTimestamp(),
    players: [createPlayer(hostName, "host")],
    log: [`${hostName} made a room and is pretending not to be scared.`]
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
  document.querySelector(".intro").textContent = `Room ${id} is open. Add your name and jump in before the zombies get bored.`;
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
  const hostName = cleanName(els.hostName.value, "Host");
  roomId = makeRoomId();
  playerIndex = 0;
  await set(roomRef(roomId), createRoomState(hostName));
  history.replaceState(null, "", buildRoomLink(roomId));
  subscribeToRoom(roomId);
  showHostWaiting(roomId);
}

async function joinGame(event) {
  event.preventDefault();
  const guestName = cleanName(els.guestName.value, "Player 2");
  const joinId = els.joinForm.dataset.room;
  let joined = false;
  let reason = "Room is full or already started.";

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
    room.log = [...(room.log || []), `${guestName} joined. The zombies politely waited for both players.`];
    joined = true;
    return room;
  });

  if (!joined) {
    showNotice(reason, true);
    return;
  }

  roomId = joinId;
  subscribeToRoom(roomId);
}

function activeIndex() {
  return state.turn % 2;
}

function otherIndex() {
  return activeIndex() === 0 ? 1 : 0;
}

function isMyTurn() {
  return !state.over && playerIndex === activeIndex();
}

function getScenario(room = state) {
  if (room.over) {
    return {
      type: "finale",
      title: "Last survivor gets bragging rights",
      text: "The road is quiet. The zombies are tired. Someone gets to say, 'I told you so.'",
      choices: []
    };
  }
  const index = Math.floor(randomFor(room.seed, "scenario", room.turn) * scenarioDeck.length);
  return scenarioDeck[index];
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
  if (state.over) return state.winner === index ? "Winner" : "Lost";
  if (index === activeIndex()) return "Choosing";
  return "Waiting";
}

function renderPlayers() {
  els.survivors.innerHTML = "";
  state.players.forEach((player, index) => {
    const card = document.createElement("article");
    card.className = `player-card pop-in ${player.health <= 0 ? "dead" : ""} ${state.winner === index ? "winner" : ""} ${index === activeIndex() && !state.over ? "active-player" : ""}`;
    const healthColor = player.health > 55 ? "var(--green)" : player.health > 25 ? "var(--yellow)" : "var(--red)";
    card.innerHTML = `
      <div class="player-head">
        <h3 class="player-name">${escapeHtml(player.name)}</h3>
        <span class="badge">${playerLabel(index)}</span>
      </div>
      <div class="stat"><span>Health</span><div class="bar"><span style="width:${player.health}%;background:${healthColor}"></span></div><strong>${player.health}</strong></div>
      <div class="stat"><span>Snacks</span><div class="bar"><span style="width:${clamp(player.supplies * 18)}%;background:var(--yellow)"></span></div><strong>${player.supplies}</strong></div>
      <div class="stat"><span>Bonk</span><div class="bar"><span style="width:${clamp(player.weapon * 25)}%"></span></div><strong>${player.weapon}</strong></div>
      <div class="stat"><span>Trust</span><div class="bar"><span style="width:${player.trust}%;background:var(--accent)"></span></div><strong>${player.trust}</strong></div>
    `;
    els.survivors.appendChild(card);
  });
}

function renderLog() {
  els.log.innerHTML = "";
  (state.log || []).slice(-9).reverse().forEach(item => {
    const li = document.createElement("li");
    li.textContent = item;
    els.log.appendChild(li);
  });
}

function renderScenario() {
  const scenario = getScenario();
  const player = state.players[activeIndex()] || state.players[0];
  const day = Math.floor(state.turn / 2) + 1;
  els.dayLabel.textContent = Math.min(day, Math.ceil(state.maxTurns / 2));
  els.turnLabel.textContent = state.over ? "Game over" : isMyTurn() ? "Your choice!" : `${player.name} is choosing`;
  els.scenarioTag.textContent = state.over ? "Finale" : `${scenario.type} trouble`;
  els.scenarioTitle.textContent = scenario.title;
  els.scenarioText.textContent = scenario.text.replace("{player}", player.name);
  els.sceneImage.src = imageByType[scenario.type] || imageByType.search;
  els.choices.innerHTML = "";

  if (state.over) {
    const winner = state.players[state.winner];
    const p = document.createElement("p");
    p.className = "final-text";
    p.textContent = winner
      ? `${winner.name} wins with ${winner.health} health, ${winner.supplies} snacks, and ${winner.betrayals} betrayal${winner.betrayals === 1 ? "" : "s"}.`
      : "Nobody made it out. The zombies win and probably start a bowling league.";
    els.choices.appendChild(p);
    return;
  }

  if (!isMyTurn()) {
    const wait = document.createElement("p");
    wait.className = "waiting-card";
    wait.textContent = `Waiting for ${player.name}. You cannot choose on their turn.`;
    els.choices.appendChild(wait);
  }

  scenario.choices.forEach(choice => {
    const button = document.createElement("button");
    button.className = "choice-button";
    button.type = "button";
    button.disabled = !isMyTurn();
    button.innerHTML = `<strong>${escapeHtml(choice.label)}</strong><span>${escapeHtml(choice.detail)}</span>`;
    button.addEventListener("click", () => choose(choice.kind, false));
    els.choices.appendChild(button);
  });
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
  return log.slice(-45);
}

function damage(player, amount) {
  player.health = clamp(player.health - amount);
}

function heal(player, amount) {
  player.health = clamp(player.health + amount);
}

async function autoChoose() {
  const scenario = getScenario();
  if (!scenario.choices.length) return;
  const pick = scenario.choices[Math.floor(randomFor(state.seed, state.turn, "timeout") * scenario.choices.length)];
  await choose(pick.kind, true);
}

async function choose(kind, timedOut) {
  if (!state || state.over) return;
  await runTransaction(roomRef(), room => {
    if (!room || room.over || room.status !== "playing") return room;
    if (!timedOut && room.players?.[room.turn % 2]?.id !== playerId) return room;
    if (timedOut && secondsLeft(room) > 0) return room;

    applyChoice(room, kind, timedOut);
    room.updatedAt = serverTimestamp();
    return room;
  });
}

function applyChoice(room, kind, timedOut) {
  const actorIndex = room.turn % 2;
  const targetIndex = actorIndex === 0 ? 1 : 0;
  const actor = room.players[actorIndex];
  const other = room.players[targetIndex];
  const roll = randomFor(room.seed, room.turn, kind);
  const badRoll = randomFor(room.seed, room.turn, kind, "bad");
  const autoText = timedOut ? " Time ran out, so fate clicked for them." : "";
  let message = "";

  if (kind === "fight") {
    const hurt = Math.round(14 + badRoll * 20 - actor.weapon * 4);
    damage(actor, hurt);
    if (roll > 0.42) {
      actor.supplies += 2;
      actor.weapon += roll > 0.78 ? 1 : 0;
      message = `${actor.name} bonked through the zombie crowd, lost ${hurt} health, and stole snacks.${autoText}`;
    } else {
      message = `${actor.name} tried to be an action hero and lost ${hurt} health.${autoText}`;
    }
  }

  if (kind === "sneak") {
    if (roll > 0.25) {
      actor.supplies += 1;
      message = `${actor.name} tiptoed past the zombies and found emergency biscuits.${autoText}`;
    } else {
      damage(actor, 14);
      message = `${actor.name}'s shoe squeaked at the worst possible time.${autoText}`;
    }
  }

  if (kind === "bait") {
    actor.betrayals += 1;
    actor.trust = clamp(actor.trust - 28);
    other.trust = clamp(other.trust - 35);
    if (roll > 0.36) {
      damage(other, 24);
      actor.supplies += 2;
      message = `${actor.name} shouted ${other.name}'s name and ran. Evil? Yes. Useful? Also yes.${autoText}`;
    } else {
      damage(actor, 20);
      damage(other, 10);
      message = `${actor.name}'s betrayal failed and everyone got bitten by karma.${autoText}`;
    }
  }

  if (kind === "eat") {
    if (roll > 0.45) {
      heal(actor, 22);
      message = `${actor.name} ate the smile soup. Somehow, it slapped.${autoText}`;
    } else {
      damage(actor, 26);
      message = `${actor.name} learned that mystery soup is mostly mystery.${autoText}`;
    }
  }

  if (kind === "shareFood") {
    if (roll > 0.3) {
      heal(actor, 10);
      heal(other, 10);
      actor.trust = clamp(actor.trust + 8);
      other.trust = clamp(other.trust + 8);
      message = `${actor.name} shared food. Cute. Suspiciously cute.${autoText}`;
    } else {
      damage(actor, 12);
      damage(other, 12);
      message = `${actor.name} shared bad food. Group stomach disaster unlocked.${autoText}`;
    }
  }

  if (kind === "stash") {
    actor.supplies += 2;
    actor.trust = clamp(actor.trust - 8);
    message = `${actor.name} hid the soup like a tiny apocalypse rascal. Nobody clapped.${autoText}`;
  }

  if (kind === "weapon") {
    actor.weapon += roll > 0.35 ? 1 : 0;
    damage(actor, roll > 0.35 ? 4 : 15);
    message = roll > 0.35 ? `${actor.name} found a good bonking tool.${autoText}` : `${actor.name} found a treadmill and emotional damage.${autoText}`;
  }

  if (kind === "medicine") {
    heal(actor, roll > 0.25 ? 20 : 6);
    actor.supplies += roll > 0.55 ? 1 : 0;
    message = `${actor.name} raided the tiny clinic and felt slightly less doomed.${autoText}`;
  }

  if (kind === "supplies") {
    actor.supplies += 1;
    heal(actor, 5);
    message = `${actor.name} grabbed batteries, noodles, and one useless celebrity calendar.${autoText}`;
  }

  if (kind === "escapeAlone") {
    actor.betrayals += 1;
    actor.trust = clamp(actor.trust - 40);
    other.trust = clamp(other.trust - 45);
    heal(actor, 8);
    damage(other, 18);
    message = `${actor.name} rode away alone on the squeaky bike. The drama was loud.${autoText}`;
  }

  if (kind === "honest") {
    actor.trust = clamp(actor.trust + 14);
    other.trust = clamp(other.trust + 14);
    heal(actor, 8);
    heal(other, 5);
    message = `${actor.name} chose teamwork. The bike squeaked with approval.${autoText}`;
  }

  if (kind === "sabotage") {
    actor.betrayals += 1;
    actor.trust = clamp(actor.trust - 18);
    actor.supplies += roll > 0.5 ? 1 : 0;
    message = `${actor.name} popped the tire. Petty points awarded.${autoText}`;
  }

  if (kind === "sleep") {
    heal(actor, 25);
    if (roll < 0.32) {
      damage(actor, 18);
      message = `${actor.name} napped well, then woke up to rude zombie knocking.${autoText}`;
    } else {
      message = `${actor.name} had a beautiful nap during the end of the world.${autoText}`;
    }
  }

  if (kind === "patch") {
    heal(actor, 15);
    actor.supplies = Math.max(0, actor.supplies - 1);
    message = `${actor.name} used supplies and patched the leaky human parts.${autoText}`;
  }

  if (kind === "watch") {
    damage(actor, 6);
    heal(other, 8);
    actor.trust = clamp(actor.trust + 12);
    other.trust = clamp(other.trust + 12);
    message = `${actor.name} kept watch and only complained a normal amount.${autoText}`;
  }

  if (kind === "signal") {
    if (roll > 0.48) {
      actor.supplies += 2;
      heal(actor, 10);
      message = `${actor.name} followed the radio and found actual useful stuff. Weird!${autoText}`;
    } else {
      damage(actor, 24);
      message = `${actor.name} followed the radio into a very obvious trap.${autoText}`;
    }
  }

  if (kind === "counterTrap") {
    actor.supplies = Math.max(0, actor.supplies - 1);
    if (roll > 0.28) {
      actor.weapon += 1;
      message = `${actor.name} set a trap and looked clever for once.${autoText}`;
    } else {
      damage(actor, 16);
      message = `${actor.name}'s trap made a loud clank and achieved nothing.${autoText}`;
    }
  }

  if (kind === "sendOther") {
    actor.betrayals += 1;
    actor.trust = clamp(actor.trust - 26);
    other.trust = clamp(other.trust - 30);
    damage(other, roll > 0.5 ? 12 : 28);
    actor.supplies += roll > 0.5 ? 1 : 0;
    message = `${actor.name} sent ${other.name} first. Friendship took damage.${autoText}`;
  }

  room.players.forEach(player => {
    if (player.supplies <= 0 && player.health > 0) damage(player, 4);
  });

  room.log = addLog(room, message);
  room.turn += 1;
  room.turnStartedAt = Date.now();

  const living = room.players.map((player, index) => player.health > 0 ? index : null).filter(index => index !== null);
  if (living.length <= 1) {
    room.over = true;
    room.status = "over";
    room.winner = living[0] ?? null;
  } else if (room.turn >= room.maxTurns) {
    room.over = true;
    room.status = "over";
    const scores = room.players.map(player => player.health * 3 + player.supplies * 8 + player.weapon * 6 + player.trust - player.betrayals * 3);
    room.winner = scores[0] === scores[1] ? (room.players[0].health >= room.players[1].health ? 0 : 1) : (scores[0] > scores[1] ? 0 : 1);
    room.log = addLog(room, `${room.players[room.winner].name} reaches the rescue road first and gets unlimited bragging rights.`);
  }
}

function boot() {
  if (!firebaseReady()) {
    showNotice("Firebase is not configured yet. Add your project details in firebase-config.js for live two-player rooms.", true);
  } else {
    app = initializeApp(firebaseConfig);
    db = getDatabase(app);
  }

  const params = new URLSearchParams(window.location.search);
  const urlRoom = params.get("room");
  if (urlRoom && firebaseReady()) {
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
