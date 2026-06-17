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
  introScreen: document.querySelector("#introScreen"),
  introLines: document.querySelector("#introLines"),
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
  phaseLabel: document.querySelector("#phaseLabel"),
  turnLabel: document.querySelector("#turnLabel"),
  timerLine: document.querySelector("#timerLine"),
  partyStrip: document.querySelector("#partyStrip"),
  sceneImage: document.querySelector("#sceneImage"),
  scenarioTag: document.querySelector("#scenarioTag"),
  scenarioTitle: document.querySelector("#scenarioTitle"),
  scenarioText: document.querySelector("#scenarioText"),
  privateInfo: document.querySelector("#privateInfo"),
  choices: document.querySelector("#choices"),
  chatPanel: document.querySelector("#chatPanel"),
  chatLog: document.querySelector("#chatLog"),
  chatPicks: document.querySelector("#chatPicks"),
  log: document.querySelector("#log")
};

const PLAYER_KEY = "deadline-player-id";
const INTRO_MS = 18000;
const OUTCOME_MS = 5200;

const introScript = [
  "Friday night.",
  "Sleepover at your friend's house.",
  "Half-finished pizza on the table.",
  "The movie cuts to black.",
  "A scream echoes outside.",
  "EMERGENCY ALERT: Stay indoors.",
  "Something crashes downstairs."
];

const dangerText = [
  "Quiet",
  "Movement outside",
  "Scratching at windows",
  "Figures outside",
  "House may be breached",
  "Emergency escape"
];

const events = {
  firstChoice: {
    label: "Discussion",
    tone: "yellow",
    timer: 40,
    title: "Something is moving downstairs.",
    text: "You both heard it. Nobody knows if it was inside the house.",
    image: "assets/sleepover-house.svg",
    chat: true,
    consensus: true,
    options: [
      { id: "investigate", label: "Investigate", detail: "More information, more exposure." },
      { id: "stay", label: "Stay Upstairs", detail: "Safer for now, less information." }
    ]
  },
  windows: {
    label: "Hidden Information",
    tone: "yellow",
    timer: 35,
    title: "You check the windows.",
    text: "Both of you see different parts of the same street.",
    image: "assets/sleepover-house.svg",
    chat: true,
    consensus: true,
    private: [
      "You hear people running down the street. They are not looking back.",
      "Someone is banging on a neighbor's door. The neighbor is about to open it."
    ],
    options: [
      { id: "watch", label: "Watch Longer", detail: "Gain information. Risk being seen." },
      { id: "leaveWindow", label: "Leave Window", detail: "Lose information. Stay safer." }
    ]
  },
  downstairs: {
    label: "Danger",
    tone: "red",
    timer: 15,
    title: "Dog panicking downstairs.",
    text: "A chair is on the floor. The dog is shaking beside it.",
    image: "assets/sleepover-house.svg",
    chat: false,
    consensus: true,
    options: [
      { id: "lights", label: "Turn On Lights", detail: "Clear view. Big noise risk." },
      { id: "flashlight", label: "Use Flashlight", detail: "Narrow view. Quieter." }
    ]
  },
  safeZone: {
    label: "Signal",
    tone: "green",
    timer: 22,
    title: "Safe zone broadcast found.",
    text: "Community Center accepting survivors. Distance: 3.2 km.",
    image: "assets/duo-escape.svg",
    chat: false,
    consensus: false,
    auto: true,
    options: [
      { id: "continue", label: "Continue", detail: "Prepare to search the house." }
    ]
  },
  search: {
    label: "House Search",
    tone: "yellow",
    timer: 35,
    title: "Each of you can search one room.",
    text: "You do not have time to search everything. Pick separately.",
    image: "assets/sleepover-house.svg",
    chat: true,
    consensus: false,
    options: [
      { id: "kitchen", label: "Kitchen", detail: "Possible food." },
      { id: "basement", label: "Basement", detail: "Possible route info." },
      { id: "bedroom", label: "Bedroom", detail: "Possible phone help." },
      { id: "bathroom", label: "Bathroom", detail: "Maybe first aid." }
    ]
  },
  leaveOrCharge: {
    label: "Discussion",
    tone: "yellow",
    timer: 40,
    title: "Phones are dying.",
    text: "You can leave now with weak battery, or charge first and lose time.",
    image: "assets/sleepover-house.svg",
    chat: true,
    consensus: true,
    options: [
      { id: "leaveNow", label: "Leave Now", detail: "Use map. No GPS." },
      { id: "charge", label: "Charge Phone", detail: "Battery restored. Danger rises." }
    ]
  },
  exit: {
    label: "Emergency Exit",
    tone: "red",
    timer: 18,
    title: "The house is no longer safe.",
    text: "Something hits the front door. You need to choose an exit.",
    image: "assets/sleepover-house.svg",
    chat: false,
    consensus: true,
    options: [
      { id: "frontDoor", label: "Front Door", detail: "Fastest. Most exposed." },
      { id: "backyard", label: "Backyard", detail: "Slower. More cover." }
    ]
  },
  complete: {
    label: "Arc 1 Complete",
    tone: "green",
    timer: 0,
    title: "You leave the house.",
    text: "Arc 1 prototype ends here. The road to the Community Center begins next.",
    image: "assets/duo-escape.svg",
    chat: false,
    consensus: false,
    options: []
  }
};

let app = null;
let db = null;
let roomId = null;
let playerId = localStorage.getItem(PLAYER_KEY) || crypto.randomUUID();
let playerIndex = -1;
let state = null;
let roomUnsubscribe = null;
let timerInterval = null;
let lastAutoKey = "";

localStorage.setItem(PLAYER_KEY, playerId);

function firebaseReady() {
  return Boolean(firebaseConfig.apiKey && firebaseConfig.databaseURL && firebaseConfig.projectId);
}

function roomRef(id = roomId) {
  return ref(db, `rooms/${id}`);
}

function cleanName(name, fallback) {
  const cleaned = name.trim().replace(/\s+/g, " ").slice(0, 18);
  return cleaned || fallback;
}

function makeRoomId() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function showNotice(message, isError = false) {
  els.connectionStatus.textContent = message;
  els.connectionStatus.classList.remove("hidden");
  els.connectionStatus.classList.toggle("error", isError);
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
    hp: 100,
    battery: role === "host" ? 17 : 14,
    items: {},
    ready: false
  };
}

function createRoomState(hostName) {
  return {
    game: "deadline-arc1",
    status: "waiting",
    eventId: "intro",
    danger: 0,
    eventStartedAt: Date.now(),
    outcomeStartedAt: 0,
    outcome: null,
    choices: {},
    chat: [],
    log: [`${hostName} started a sleepover room.`],
    players: [createPlayer(hostName, "host")],
    updatedAt: serverTimestamp()
  };
}

function currentEvent(room = state) {
  return events[room.eventId] || events.firstChoice;
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
  document.querySelector(".intro").textContent = `Room ${id}. Join the sleepover. The house phase begins when both players are in.`;
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

    if (playerIndex < 0 && state.status !== "waiting") {
      els.setupScreen.classList.remove("hidden");
      els.introScreen.classList.add("hidden");
      els.gameScreen.classList.add("hidden");
      els.hostForm.classList.add("hidden");
      els.joinForm.classList.add("hidden");
      els.shareBox.classList.add("hidden");
      showNotice("This room is already locked with two players.", true);
      return;
    }

    if (state.status === "waiting") {
      els.setupScreen.classList.remove("hidden");
      els.introScreen.classList.add("hidden");
      els.gameScreen.classList.add("hidden");
      if (playerIndex === 0) {
        els.hostForm.classList.add("hidden");
        showHostWaiting(id);
      }
      return;
    }

    if (state.status === "intro") {
      renderIntro();
      startTimer();
      return;
    }

    renderGame();
  });
}

async function hostGame(event) {
  event.preventDefault();
  if (!firebaseReady()) {
    showNotice("Add Firebase details in firebase-config.js before creating live rooms.", true);
    return;
  }
  if (!db) {
    showNotice("Firebase did not start. Check databaseURL and Realtime Database rules.", true);
    return;
  }
  const hostName = cleanName(els.hostName.value, "Player A");
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
  const guestName = cleanName(els.guestName.value, "Player B");
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
      room.status = "intro";
      room.eventId = "intro";
      room.eventStartedAt = Date.now();
      room.updatedAt = serverTimestamp();
      room.log = [...(room.log || []), `${guestName} joined. The room locked at two players.`];
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

function renderIntro() {
  els.setupScreen.classList.add("hidden");
  els.gameScreen.classList.add("hidden");
  els.introScreen.classList.remove("hidden");
  els.introLines.innerHTML = "";

  introScript.forEach((line, index) => {
    const p = document.createElement("p");
    p.textContent = line;
    p.style.animationDelay = `${index * 2.15}s`;
    els.introLines.appendChild(p);
  });
}

function renderGame() {
  els.setupScreen.classList.add("hidden");
  els.introScreen.classList.add("hidden");
  els.gameScreen.classList.remove("hidden");
  const event = currentEvent();

  document.body.dataset.tone = event.tone || "yellow";
  renderPartyStrip();
  renderPrompt(event);
  renderChoices(event);
  renderChat(event);
  renderLog();
  startTimer();
}

function renderPartyStrip() {
  const danger = state.danger ?? 0;
  els.partyStrip.innerHTML = `
    <div class="danger-chip danger-${danger}">
      <span>Danger</span>
      <strong>${danger}/5</strong>
      <small>${dangerText[danger] || "Unknown"}</small>
    </div>
    ${state.players.map(player => `
      <article class="mini-player ${player.id === playerId ? "you" : ""}">
        <strong>${escapeHtml(player.name)}</strong>
        <span>HP ${player.hp}</span>
        <span>Battery ${player.battery}%</span>
      </article>
    `).join("")}
  `;
}

function renderPrompt(event) {
  const me = state.players[playerIndex] || state.players[0];
  const privateLine = event.private?.[playerIndex] || "";
  els.phaseLabel.textContent = event.label;
  els.turnLabel.textContent = state.status === "outcome" ? "Result" : event.chat ? "Discuss. Match choices." : "Choose fast.";
  els.scenarioTag.textContent = toneLabel(event);
  els.scenarioTitle.textContent = event.title;
  els.scenarioText.textContent = event.text;
  els.sceneImage.src = event.image || "assets/sleepover-house.svg";
  els.privateInfo.classList.toggle("hidden", !privateLine);
  els.privateInfo.textContent = privateLine ? `${me.name}, you notice: ${privateLine}` : "";

  if (state.status === "outcome" && state.outcome) {
    els.scenarioTag.textContent = "Outcome";
    els.scenarioTitle.textContent = state.outcome.title;
    els.scenarioText.textContent = state.outcome.text;
    els.privateInfo.classList.add("hidden");
  }
}

function toneLabel(event) {
  if (event.tone === "green") return "Safehouse / Resting";
  if (event.tone === "red") return "Danger";
  return "Exploration / Suspicion";
}

function renderChoices(event) {
  els.choices.innerHTML = "";
  if (state.status === "outcome") {
    const card = document.createElement("div");
    card.className = "outcome-card";
    card.textContent = state.outcome?.text || "";
    els.choices.appendChild(card);
    return;
  }

  if (event.eventId === "complete" || event.options.length === 0) return;

  const myChoice = state.choices?.[playerId];
  const picks = Object.entries(state.choices || {});
  const bothPicked = picks.length >= 2;
  const consensusPending = event.consensus && bothPicked && new Set(picks.map(([, value]) => value)).size > 1;
  const pickStatus = choiceStatus(event);

  if (pickStatus) {
    const status = document.createElement("div");
    status.className = "pick-status";
    status.innerHTML = pickStatus;
    els.choices.appendChild(status);
  }

  if (consensusPending) {
    const warn = document.createElement("p");
    warn.className = "waiting-card mismatch";
    warn.textContent = "Choices do not match. Talk fast and pick the same option.";
    els.choices.appendChild(warn);
  } else if (myChoice) {
    const wait = document.createElement("p");
    wait.className = "waiting-card";
    wait.textContent = event.consensus ? "Locked in. Waiting for the other player to match." : "Locked in. Waiting for the other search.";
    els.choices.appendChild(wait);
  }

  event.options.forEach(option => {
    const button = document.createElement("button");
    const isPicked = myChoice === option.id;
    button.className = `choice-button ${isPicked ? "picked" : ""}`;
    button.type = "button";
    button.disabled = playerIndex < 0 || Boolean(myChoice && !consensusPending);
    button.innerHTML = `<strong>${escapeHtml(option.label)}</strong><span>${escapeHtml(option.detail)}</span>`;
    button.addEventListener("click", () => submitChoice(option.id));
    els.choices.appendChild(button);
  });
}

function choiceStatus(event) {
  const choices = state.choices || {};
  const entries = state.players
    .map(player => {
      const picked = choices[player.id];
      if (!picked) return `${escapeHtml(player.name)} is deciding...`;
      const label = event.options.find(option => option.id === picked)?.label || picked;
      return `${escapeHtml(player.name)} chose: ${escapeHtml(label)}`;
    });
  return entries.length ? entries.map(line => `<span>${line}</span>`).join("") : "";
}

function renderChat(event) {
  els.chatPanel.classList.toggle("hidden", !event.chat || state.status === "outcome");
  if (!event.chat || state.status === "outcome") return;

  els.chatLog.innerHTML = "";
  (state.chat || []).slice(-5).forEach(item => {
    const bubble = document.createElement("p");
    bubble.className = item.id === playerId ? "chat-bubble mine" : "chat-bubble";
    bubble.textContent = `${item.name}: ${item.text}`;
    els.chatLog.appendChild(bubble);
  });

  els.chatPicks.innerHTML = "";
  ["I saw something.", "Too risky.", "We need info.", "Match my choice."].forEach(text => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = text;
    button.addEventListener("click", () => sendChat(text));
    els.chatPicks.appendChild(button);
  });
}

function renderLog() {
  els.log.innerHTML = "";
  (state.log || []).slice(-5).reverse().forEach(item => {
    const li = document.createElement("li");
    li.textContent = item;
    els.log.appendChild(li);
  });
}

async function submitChoice(choiceId) {
  if (!state || state.status !== "event") return;
  await runTransaction(roomRef(), room => {
    if (!room || room.status !== "event") return room;
    if (!room.players?.some(player => player.id === playerId)) return room;
    room.choices = room.choices || {};
    room.choices[playerId] = choiceId;
    room.updatedAt = serverTimestamp();
    tryResolveEvent(room);
    return room;
  });
}

async function sendChat(text) {
  const me = state.players[playerIndex];
  if (!me) return;
  await runTransaction(roomRef(), room => {
    if (!room || room.status !== "event") return room;
    if (!room.players?.some(player => player.id === playerId)) return room;
    room.chat = [...(room.chat || []), { id: playerId, name: me.name, text, at: Date.now() }].slice(-10);
    room.updatedAt = serverTimestamp();
    return room;
  });
}

function tryResolveEvent(room, forced = false) {
  const event = currentEvent(room);
  const ids = room.players.map(player => player.id);
  const picks = ids.map(id => room.choices?.[id]).filter(Boolean);
  if (!forced && picks.length < ids.length && !event.auto) return;

  if (event.auto) {
    setOutcome(room, "Signal Locked", "Community Center. 3.2 km. Player A battery 17%. Player B battery 14%.", "search");
    return;
  }

  if (event.consensus) {
    const selected = forced ? forceConsensusPick(room, event) : picks[0];
    if (!selected || new Set(picks).size > 1 && !forced) return;
    applyConsensusChoice(room, event, selected);
    return;
  }

  if (room.eventId === "search") {
    resolveSearch(room, forced);
  }
}

function forceConsensusPick(room, event) {
  const picks = Object.values(room.choices || {});
  if (picks.length) return picks[0];
  return event.options[0]?.id;
}

function applyConsensusChoice(room, event, selected) {
  const nextByEvent = {
    firstChoice: selected === "investigate" ? "downstairs" : "windows",
    windows: "safeZone",
    downstairs: "safeZone",
    leaveOrCharge: "exit",
    exit: "complete"
  };

  const outcome = outcomeFor(room, event, selected);
  setOutcome(room, outcome.title, outcome.text, nextByEvent[room.eventId] || "complete", outcome.effects);
}

function outcomeFor(room, event, selected) {
  if (room.eventId === "firstChoice" && selected === "investigate") {
    return { title: "You go downstairs.", text: "The sound is real. So is the risk." };
  }
  if (room.eventId === "firstChoice") {
    return { title: "You stay upstairs.", text: "Safer. But the street keeps secrets." };
  }
  if (room.eventId === "windows" && selected === "watch") {
    return { title: "You watch too long.", text: "The neighbor opens the door and is attacked. The street is not safe.", effects: { danger: 1, log: "Information gained: the streets are dangerous." } };
  }
  if (room.eventId === "windows") {
    return { title: "You leave the window.", text: "No one sees you. No one learns enough.", effects: { log: "Safer option. No information gained." } };
  }
  if (room.eventId === "downstairs" && selected === "lights") {
    return { title: "Lights on.", text: "The dog knocked over a chair. It sees the light and starts barking.", effects: { danger: 1 } };
  }
  if (room.eventId === "downstairs") {
    return { title: "Flashlight only.", text: "The dog calms. Player A trips over the chair in the dark.", effects: { hp: { 0: -5 } } };
  }
  if (room.eventId === "leaveOrCharge" && selected === "charge") {
    return { title: "You charge the phones.", text: "Battery restored. The delay gives the house another sound to answer.", effects: { danger: 1, battery: 70 } };
  }
  if (room.eventId === "leaveOrCharge") {
    return { title: "You leave immediately.", text: "The paper map becomes your only guide. No GPS." };
  }
  if (room.eventId === "exit" && selected === "frontDoor") {
    return { title: "Front door.", text: "Fastest route. You step directly into whatever is outside.", effects: { danger: 1 } };
  }
  return { title: "Backyard.", text: "Slower route. More cover. Less certainty." };
}

function resolveSearch(room, forced) {
  const ids = room.players.map(player => player.id);
  const choices = ids.map((id, index) => room.choices?.[id] || (forced ? events.search.options[index]?.id : null));
  if (choices.some(choice => !choice)) return;

  const found = [];
  choices.forEach((choiceId, index) => {
    const player = room.players[index];
    if (choiceId === "kitchen") {
      player.items.snackPacks = (player.items.snackPacks || 0) + 2;
      found.push(`${player.name} found 2 snack packs.`);
    }
    if (choiceId === "basement") {
      player.items.map = 1;
      found.push(`${player.name} found a paper map.`);
    }
    if (choiceId === "bedroom") {
      player.items.charger = 1;
      found.push(`${player.name} found a phone charger.`);
    }
    if (choiceId === "bathroom") {
      const kit = randomFor(room.eventStartedAt, player.id, "bathroom") > 0.7;
      if (kit) {
        player.items.firstAid = 1;
        found.push(`${player.name} found a first aid kit.`);
      } else {
        found.push(`${player.name} found nothing useful.`);
      }
    }
  });

  setOutcome(room, "House searched.", found.join(" "), "leaveOrCharge");
}

function setOutcome(room, title, text, nextEventId, effects = {}) {
  applyEffects(room, effects);
  room.status = "outcome";
  room.outcome = { title, text, nextEventId };
  room.outcomeStartedAt = Date.now();
  room.choices = {};
  room.chat = [];
  room.log = [...(room.log || []), text].slice(-30);
}

function applyEffects(room, effects) {
  if (effects.danger) room.danger = Math.min(5, (room.danger || 0) + effects.danger);
  if (effects.battery) room.players.forEach(player => { player.battery = effects.battery; });
  if (effects.hp) {
    Object.entries(effects.hp).forEach(([index, delta]) => {
      room.players[index].hp = Math.max(0, room.players[index].hp + delta);
    });
  }
  if (effects.log) room.log = [...(room.log || []), effects.log].slice(-30);
}

function advanceOutcome(room) {
  const next = room.outcome?.nextEventId || "complete";
  room.eventId = next;
  room.status = next === "complete" ? "complete" : "event";
  room.eventStartedAt = Date.now();
  room.outcome = null;
  room.outcomeStartedAt = 0;
  room.choices = {};
  room.chat = [];
}

function secondsLeft(room = state) {
  if (!room || room.status === "intro") {
    return Math.max(0, Math.ceil((INTRO_MS - (Date.now() - (room?.eventStartedAt || Date.now()))) / 1000));
  }
  if (room.status === "outcome") {
    return Math.max(0, Math.ceil((OUTCOME_MS - (Date.now() - (room.outcomeStartedAt || Date.now()))) / 1000));
  }
  const event = currentEvent(room);
  return Math.max(0, event.timer - Math.floor((Date.now() - (room.eventStartedAt || Date.now())) / 1000));
}

function startTimer() {
  clearInterval(timerInterval);
  tickTimer();
  timerInterval = setInterval(tickTimer, 250);
}

function tickTimer() {
  if (!state || state.status === "waiting") return;
  const left = secondsLeft();
  const event = currentEvent();
  if (state.status === "intro") {
    els.timerLine.textContent = "";
  } else if (state.status === "outcome") {
    els.timerLine.textContent = "Next prompt incoming...";
  } else {
    els.timerLine.textContent = `${left}s`;
    els.timerLine.style.setProperty("--timer", `${event.timer ? left / event.timer * 100 : 0}%`);
  }

  const autoKey = `${state.status}-${state.eventId}-${state.eventStartedAt}-${state.outcomeStartedAt}`;
  if (left > 0 || lastAutoKey === autoKey) return;
  lastAutoKey = autoKey;

  runTransaction(roomRef(), room => {
    if (!room) return room;
    if (room.status === "intro") {
      room.status = "event";
      room.eventId = "firstChoice";
      room.eventStartedAt = Date.now();
      room.updatedAt = serverTimestamp();
      return room;
    }
    if (room.status === "outcome") {
      advanceOutcome(room);
      room.updatedAt = serverTimestamp();
      return room;
    }
    if (room.status === "event") {
      tryResolveEvent(room, true);
      room.updatedAt = serverTimestamp();
      return room;
    }
    return room;
  });
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

function randomFor(...parts) {
  let hash = 2166136261;
  const value = parts.join("|");
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  let x = hash >>> 0 || 1;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  return (x >>> 0) / 4294967296;
}

function boot() {
  if (!firebaseReady()) {
    showNotice("Firebase is not configured yet. Add project details in firebase-config.js for live rooms.", true);
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
