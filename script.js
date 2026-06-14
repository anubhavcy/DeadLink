const els = {
  setupScreen: document.querySelector("#setupScreen"),
  gameScreen: document.querySelector("#gameScreen"),
  hostForm: document.querySelector("#hostForm"),
  joinForm: document.querySelector("#joinForm"),
  hostName: document.querySelector("#hostName"),
  guestName: document.querySelector("#guestName"),
  shareBox: document.querySelector("#shareBox"),
  shareLink: document.querySelector("#shareLink"),
  copyInvite: document.querySelector("#copyInvite"),
  copySave: document.querySelector("#copySave"),
  newGame: document.querySelector("#newGame"),
  dayLabel: document.querySelector("#dayLabel"),
  turnLabel: document.querySelector("#turnLabel"),
  survivors: document.querySelector("#survivors"),
  scenarioTag: document.querySelector("#scenarioTag"),
  scenarioTitle: document.querySelector("#scenarioTitle"),
  scenarioText: document.querySelector("#scenarioText"),
  sceneImage: document.querySelector("#sceneImage"),
  choices: document.querySelector("#choices"),
  log: document.querySelector("#log")
};

const FINAL_TURN = 18;
const STORAGE_PREFIX = "dead-link-save-";

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
    title: "A horde blocks the pharmacy",
    text: "{player} hears medicine rattling behind a shutter, but the street is packed with infected.",
    choices: [
      { label: "Fight through", detail: "High risk, possible supplies", kind: "fight" },
      { label: "Sneak around back", detail: "Safer, but slow and uncertain", kind: "sneak" },
      { label: "Use the other survivor as a distraction", detail: "Betrayal hurts them if it works", kind: "bait" }
    ]
  },
  {
    type: "food",
    title: "Mystery cans in a flooded shop",
    text: "{player} finds unlabelled food tins. Some smell fine. One smells like a dare.",
    choices: [
      { label: "Eat now", detail: "Could heal or poison you", kind: "eat" },
      { label: "Share a careful meal", detail: "Lower risk, both affected", kind: "shareFood" },
      { label: "Save it for leverage", detail: "Gain supplies and trust nobody", kind: "stash" }
    ]
  },
  {
    type: "search",
    title: "A mall generator coughs to life",
    text: "Lights flicker in the mall. {player} can search quickly before the noise attracts trouble.",
    choices: [
      { label: "Raid the sporting goods store", detail: "Chance for a weapon", kind: "weapon" },
      { label: "Check the clinic", detail: "Chance for medicine", kind: "medicine" },
      { label: "Take only what fits", detail: "Reliable supplies", kind: "supplies" }
    ]
  },
  {
    type: "betray",
    title: "Only one bike has air in the tires",
    text: "{player} spots a working bicycle beside the wreckage. The other survivor has not noticed yet.",
    choices: [
      { label: "Escape alone", detail: "Big advantage, brutal betrayal", kind: "escapeAlone" },
      { label: "Call it out", detail: "Gain trust and a small heal", kind: "honest" },
      { label: "Sabotage it quietly", detail: "Nobody gets it, but you may gain time", kind: "sabotage" }
    ]
  },
  {
    type: "rest",
    title: "An apartment with a bolted door",
    text: "For once, the hallway is quiet. {player} can use the room before night falls.",
    choices: [
      { label: "Sleep deeply", detail: "Heal, but risk ambush", kind: "sleep" },
      { label: "Patch wounds", detail: "Reliable healing", kind: "patch" },
      { label: "Keep watch for both", detail: "Trust rises, small fatigue", kind: "watch" }
    ]
  },
  {
    type: "trap",
    title: "A radio repeats a rescue signal",
    text: "The broadcast says evacuation leaves at sunset. {player} sees footprints leading into the station.",
    choices: [
      { label: "Follow the signal", detail: "Could be rescue or raiders", kind: "signal" },
      { label: "Set a counter-trap", detail: "Risk supplies for safety", kind: "counterTrap" },
      { label: "Send the other survivor first", detail: "A very ugly test", kind: "sendOther" }
    ]
  }
];

let state = null;
let currentScenario = null;

function makeSeed() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function cleanName(name, fallback) {
  const cleaned = name.trim().replace(/\s+/g, " ").slice(0, 18);
  return cleaned || fallback;
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
  return ((x >>> 0) / 4294967296);
}

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function encodeState(save) {
  const json = JSON.stringify(save);
  return btoa(unescape(encodeURIComponent(json))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decodeState(value) {
  try {
    const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
    return JSON.parse(decodeURIComponent(escape(atob(padded))));
  } catch {
    return null;
  }
}

function buildInviteUrl(seed, host) {
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  url.searchParams.set("seed", seed);
  url.searchParams.set("host", host);
  return url.toString();
}

function buildSaveUrl() {
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  url.searchParams.set("state", encodeState(state));
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

function saveLocal() {
  if (!state) return;
  localStorage.setItem(STORAGE_PREFIX + state.seed, JSON.stringify(state));
  history.replaceState(null, "", buildSaveUrl());
}

function loadFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const encoded = params.get("state");
  if (encoded) {
    const loaded = decodeState(encoded);
    if (loaded && loaded.players && loaded.players.length === 2) return loaded;
  }

  const seed = params.get("seed");
  const host = params.get("host");
  if (seed && host) {
    const local = localStorage.getItem(STORAGE_PREFIX + seed);
    if (local) {
      try {
        const loaded = JSON.parse(local);
        if (loaded.players && loaded.players.length === 2) return loaded;
      } catch {
        localStorage.removeItem(STORAGE_PREFIX + seed);
      }
    }
    return { pendingSeed: seed, pendingHost: host };
  }
  return null;
}

function createGame(host, guest, seed) {
  return {
    seed,
    turn: 0,
    maxTurns: FINAL_TURN,
    over: false,
    winner: null,
    players: [
      { name: host, health: 100, supplies: 1, weapon: 0, trust: 55, betrayals: 0 },
      { name: guest, health: 100, supplies: 1, weapon: 0, trust: 55, betrayals: 0 }
    ],
    log: [`${host} and ${guest} enter the dead city together. For now.`]
  };
}

function activeIndex() {
  return state.turn % 2;
}

function otherIndex() {
  return activeIndex() === 0 ? 1 : 0;
}

function getScenario() {
  if (state.over) {
    return {
      type: "finale",
      title: "The last survivor",
      text: "The road is silent now. The apocalypse keeps score in scars.",
      choices: []
    };
  }
  const index = Math.floor(randomFor(state.seed, "scenario", state.turn) * scenarioDeck.length);
  return scenarioDeck[index];
}

function playerLabel(index) {
  return index === activeIndex() && !state.over ? "Choosing" : "Waiting";
}

function renderPlayers() {
  els.survivors.innerHTML = "";
  state.players.forEach((player, index) => {
    const card = document.createElement("article");
    card.className = `player-card ${player.health <= 0 ? "dead" : ""} ${state.winner === index ? "winner" : ""}`;
    const healthColor = player.health > 55 ? "var(--green)" : player.health > 25 ? "var(--yellow)" : "var(--red)";
    card.innerHTML = `
      <div class="player-head">
        <h3 class="player-name">${escapeHtml(player.name)}</h3>
        <span class="badge">${state.over ? (state.winner === index ? "Winner" : "Lost") : playerLabel(index)}</span>
      </div>
      <div class="stat"><span>Health</span><div class="bar"><span style="width:${player.health}%;background:${healthColor}"></span></div><strong>${player.health}</strong></div>
      <div class="stat"><span>Supplies</span><div class="bar"><span style="width:${clamp(player.supplies * 18)}%;background:var(--yellow)"></span></div><strong>${player.supplies}</strong></div>
      <div class="stat"><span>Weapon</span><div class="bar"><span style="width:${clamp(player.weapon * 25)}%"></span></div><strong>${player.weapon}</strong></div>
      <div class="stat"><span>Trust</span><div class="bar"><span style="width:${player.trust}%;background:var(--accent)"></span></div><strong>${player.trust}</strong></div>
    `;
    els.survivors.appendChild(card);
  });
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  })[char]);
}

function renderLog() {
  els.log.innerHTML = "";
  state.log.slice(-9).reverse().forEach(item => {
    const li = document.createElement("li");
    li.textContent = item;
    els.log.appendChild(li);
  });
}

function renderScenario() {
  currentScenario = getScenario();
  const player = state.players[activeIndex()];
  const day = Math.floor(state.turn / 2) + 1;
  els.dayLabel.textContent = Math.min(day, Math.ceil(state.maxTurns / 2));
  els.turnLabel.textContent = state.over ? "Game over" : `${player.name}'s choice`;
  els.scenarioTag.textContent = state.over ? "Finale" : `${currentScenario.type} scenario`;
  els.scenarioTitle.textContent = currentScenario.title;
  els.scenarioText.textContent = currentScenario.text.replace("{player}", player.name);
  els.sceneImage.src = imageByType[currentScenario.type] || imageByType.search;
  els.choices.innerHTML = "";

  if (state.over) {
    const winner = state.players[state.winner];
    const p = document.createElement("p");
    p.textContent = winner
      ? `${winner.name} survives with ${winner.health} health, ${winner.supplies} supplies, and ${winner.betrayals} betrayal${winner.betrayals === 1 ? "" : "s"}.`
      : "No one made it out. The city wins.";
    els.choices.appendChild(p);
    return;
  }

  currentScenario.choices.forEach(choice => {
    const button = document.createElement("button");
    button.className = "choice-button";
    button.type = "button";
    button.innerHTML = `<strong>${escapeHtml(choice.label)}</strong><span>${escapeHtml(choice.detail)}</span>`;
    button.addEventListener("click", () => choose(choice.kind));
    els.choices.appendChild(button);
  });
}

function renderGame() {
  els.setupScreen.classList.add("hidden");
  els.gameScreen.classList.remove("hidden");
  renderPlayers();
  renderScenario();
  renderLog();
}

function addLog(message) {
  state.log.push(message);
  if (state.log.length > 40) state.log.shift();
}

function damage(player, amount) {
  player.health = clamp(player.health - amount);
}

function heal(player, amount) {
  player.health = clamp(player.health + amount);
}

function choose(kind) {
  const actor = state.players[activeIndex()];
  const other = state.players[otherIndex()];
  const roll = randomFor(state.seed, state.turn, kind);
  const badRoll = randomFor(state.seed, state.turn, kind, "bad");

  if (kind === "fight") {
    const hurt = Math.round(18 + badRoll * 22 - actor.weapon * 4);
    damage(actor, hurt);
    if (roll > 0.42) {
      actor.supplies += 2;
      actor.weapon += roll > 0.78 ? 1 : 0;
      addLog(`${actor.name} fought through the horde, lost ${hurt} health, and grabbed supplies.`);
    } else {
      addLog(`${actor.name} fought hard but got dragged down for ${hurt} health.`);
    }
  }

  if (kind === "sneak") {
    if (roll > 0.25) {
      actor.supplies += 1;
      addLog(`${actor.name} slipped past the infected and found a clean bandage.`);
    } else {
      damage(actor, 14);
      addLog(`${actor.name} stepped on glass and attracted teeth in the dark.`);
    }
  }

  if (kind === "bait") {
    actor.betrayals += 1;
    actor.trust = clamp(actor.trust - 28);
    other.trust = clamp(other.trust - 35);
    if (roll > 0.36) {
      damage(other, 24);
      actor.supplies += 2;
      addLog(`${actor.name} used ${other.name} as bait and escaped with loot.`);
    } else {
      damage(actor, 20);
      damage(other, 10);
      addLog(`${actor.name}'s betrayal backfired and both survivors paid in blood.`);
    }
  }

  if (kind === "eat") {
    if (roll > 0.45) {
      heal(actor, 22);
      addLog(`${actor.name} ate the mystery food. Somehow, it was good.`);
    } else {
      damage(actor, 26);
      addLog(`${actor.name} ate poisoned food and spent the hour shaking.`);
    }
  }

  if (kind === "shareFood") {
    if (roll > 0.3) {
      heal(actor, 10);
      heal(other, 10);
      actor.trust = clamp(actor.trust + 8);
      other.trust = clamp(other.trust + 8);
      addLog(`${actor.name} shared a careful meal. Both survivors recovered.`);
    } else {
      damage(actor, 12);
      damage(other, 12);
      addLog(`${actor.name} shared bad food. Nobody is feeling heroic.`);
    }
  }

  if (kind === "stash") {
    actor.supplies += 2;
    actor.trust = clamp(actor.trust - 8);
    addLog(`${actor.name} hid the food for later and avoided the stomach lottery.`);
  }

  if (kind === "weapon") {
    actor.weapon += roll > 0.35 ? 1 : 0;
    damage(actor, roll > 0.35 ? 4 : 15);
    addLog(roll > 0.35 ? `${actor.name} found a solid weapon.` : `${actor.name} found only noise and bruises.`);
  }

  if (kind === "medicine") {
    heal(actor, roll > 0.25 ? 20 : 6);
    actor.supplies += roll > 0.55 ? 1 : 0;
    addLog(`${actor.name} raided the clinic and patched what could be patched.`);
  }

  if (kind === "supplies") {
    actor.supplies += 1;
    heal(actor, 5);
    addLog(`${actor.name} kept the search boring, which is a rare kind of genius.`);
  }

  if (kind === "escapeAlone") {
    actor.betrayals += 1;
    actor.trust = clamp(actor.trust - 40);
    other.trust = clamp(other.trust - 45);
    heal(actor, 8);
    damage(other, 18);
    addLog(`${actor.name} took the bike alone and left ${other.name} exposed.`);
  }

  if (kind === "honest") {
    actor.trust = clamp(actor.trust + 14);
    other.trust = clamp(other.trust + 14);
    heal(actor, 8);
    heal(other, 5);
    addLog(`${actor.name} called out the bike. Cooperation bought them another hour.`);
  }

  if (kind === "sabotage") {
    actor.betrayals += 1;
    actor.trust = clamp(actor.trust - 18);
    actor.supplies += roll > 0.5 ? 1 : 0;
    addLog(`${actor.name} made sure nobody rode away clean.`);
  }

  if (kind === "sleep") {
    heal(actor, 25);
    if (roll < 0.32) {
      damage(actor, 18);
      addLog(`${actor.name} slept deeply, then woke to hands at the door.`);
    } else {
      addLog(`${actor.name} slept like the world was not ending and recovered well.`);
    }
  }

  if (kind === "patch") {
    heal(actor, 15);
    actor.supplies = Math.max(0, actor.supplies - 1);
    addLog(`${actor.name} patched wounds and spent a supply.`);
  }

  if (kind === "watch") {
    damage(actor, 6);
    heal(other, 8);
    actor.trust = clamp(actor.trust + 12);
    other.trust = clamp(other.trust + 12);
    addLog(`${actor.name} kept watch while ${other.name} rested.`);
  }

  if (kind === "signal") {
    if (roll > 0.48) {
      actor.supplies += 2;
      heal(actor, 10);
      addLog(`${actor.name} followed the signal and found a real survivor cache.`);
    } else {
      damage(actor, 24);
      addLog(`${actor.name} followed the signal into a raider trap.`);
    }
  }

  if (kind === "counterTrap") {
    actor.supplies = Math.max(0, actor.supplies - 1);
    if (roll > 0.28) {
      actor.weapon += 1;
      addLog(`${actor.name} set a counter-trap and stole a weapon from the raiders.`);
    } else {
      damage(actor, 16);
      addLog(`${actor.name}'s counter-trap failed loudly.`);
    }
  }

  if (kind === "sendOther") {
    actor.betrayals += 1;
    actor.trust = clamp(actor.trust - 26);
    other.trust = clamp(other.trust - 30);
    damage(other, roll > 0.5 ? 12 : 28);
    actor.supplies += roll > 0.5 ? 1 : 0;
    addLog(`${actor.name} sent ${other.name} first. The station answered with violence.`);
  }

  afterChoice();
}

function afterChoice() {
  state.players.forEach(player => {
    if (player.supplies <= 0 && player.health > 0) {
      damage(player, 4);
    }
  });

  const living = state.players.map((player, index) => player.health > 0 ? index : null).filter(index => index !== null);
  state.turn += 1;

  if (living.length <= 1) {
    state.over = true;
    state.winner = living[0] ?? null;
  } else if (state.turn >= state.maxTurns) {
    state.over = true;
    const scores = state.players.map(player => player.health * 3 + player.supplies * 8 + player.weapon * 6 + player.trust - player.betrayals * 3);
    state.winner = scores[0] === scores[1] ? (state.players[0].health >= state.players[1].health ? 0 : 1) : (scores[0] > scores[1] ? 0 : 1);
    addLog(`${state.players[state.winner].name} reaches the evacuation road first.`);
  }

  saveLocal();
  renderGame();
}

function showJoin(seed, host) {
  els.hostForm.classList.add("hidden");
  els.shareBox.classList.add("hidden");
  els.joinForm.classList.remove("hidden");
  els.guestName.focus();
  els.joinForm.dataset.seed = seed;
  els.joinForm.dataset.host = host;
  document.querySelector(".intro").textContent = `${host} invited you into the apocalypse. Enter your survivor name and start the run.`;
}

function boot() {
  const loaded = loadFromUrl();
  if (loaded && loaded.players) {
    state = loaded;
    saveLocal();
    renderGame();
    return;
  }
  if (loaded && loaded.pendingSeed) {
    showJoin(loaded.pendingSeed, loaded.pendingHost);
  }
}

els.hostForm.addEventListener("submit", event => {
  event.preventDefault();
  const host = cleanName(els.hostName.value, "Host");
  const seed = makeSeed();
  const link = buildInviteUrl(seed, host);
  els.shareLink.value = link;
  els.shareBox.classList.remove("hidden");
  copyText(link, els.copyInvite);
});

els.joinForm.addEventListener("submit", event => {
  event.preventDefault();
  const host = cleanName(els.joinForm.dataset.host || "Host", "Host");
  const guest = cleanName(els.guestName.value, "Receiver");
  state = createGame(host, guest, els.joinForm.dataset.seed || makeSeed());
  saveLocal();
  renderGame();
});

els.copyInvite.addEventListener("click", () => copyText(els.shareLink.value, els.copyInvite));
els.copySave.addEventListener("click", () => copyText(buildSaveUrl(), els.copySave));
els.newGame.addEventListener("click", () => {
  state = null;
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  history.replaceState(null, "", url.toString());
  window.location.reload();
});

boot();
