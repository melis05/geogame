// =============================================================
// main.js – screens, event handlers and the game loop
// =============================================================

const weatherService = createWeatherService();
const highScores = createHighScores("patiRotasiHighScores", 5);

let PROVINCES = null;      // turkey-provinces.geojson
let INFO = null;           // provinces.json: adjacency + centre points
let graph = null, game = null, catMap = null, resultMap = null, jumpChart = null;
let weather = null;        // live weather of all provinces
let timer = null;
let playing = false;       // a round is running
let busy = false;          // the cat is in the air

const $ = function (id) { return document.getElementById(id); };

const GOAL_LINES = {
    "Van": "Your cousin, the white Van cat with one blue and one amber eye, is waiting in Van!",
    "Ankara": "The fluffy Ankara cat invited you for tea in Ankara!",
    "İstanbul": "The street cats of İstanbul are having a party. Don't be late!",
    "Niğde": "Grandma cat in Niğde made you a fish dinner!"
};
const OTHER_LINES = [
    "A warm blanket is waiting for you in {city}.",
    "Your best friend is waiting for you in {city}.",
    "There is a sunny window in {city}. Go and nap!",
    "Someone in {city} has a box. You MUST sit in it."
];

// ---------- small DOM helpers ----------
function showScreen(id) {
    document.querySelectorAll(".screen").forEach(function (s) { s.classList.remove("active"); });
    $(id).classList.add("active");
    $("topbar").classList.toggle("hidden", id === "start-screen");
}

function say(text, sprite) {
    $("cat-text").textContent = text;
    $("talk-cat").src = "assets/sprites/cat-" + (sprite || "sit") + ".png";
}

function updateTopbar() {
    const s = game.getState();
    const lives = Math.max(0, s.lives);
    $("stat-round").textContent = Math.max(1, s.round);
    $("stat-total").textContent = TOTAL_ROUNDS;
    $("stat-score").textContent = s.score;
    $("stat-lives").textContent = "♥".repeat(lives) + "♡".repeat(START_LIVES - lives);
    $("stat-best").textContent = Math.max(highScores.best(), s.score);
}

function updateCounters() {
    const r = game.getState().current;
    if (!r) return;
    $("jumps").textContent = r.path.length - 1;
    $("fish-count").textContent = r.fishEaten;
}

function renderHighScores(listElement) {
    const list = highScores.load();
    listElement.innerHTML = "";
    if (list.length === 0) { listElement.innerHTML = '<li class="empty">No scores yet</li>'; return; }
    list.forEach(function (e) {
        const li = document.createElement("li");
        li.innerHTML = e.name + " <span>" + e.score + "</span>";
        listElement.appendChild(li);
    });
}

function kmBetween(a, b) {
    const pa = INFO.centers[a], pb = INFO.centers[b];
    // Turf.js uses [longitude, latitude]
    return turf.distance(turf.point([pa[1], pa[0]]), turf.point([pb[1], pb[0]]), { units: "kilometers" });
}

function onTick(left, total) {
    $("timer-fill").style.width = Math.min(100, left / total * 100) + "%";
    $("timer-fill").classList.toggle("danger", left <= 10);
    $("timer-text").textContent = String(Math.floor(left / 60)).padStart(2, "0") + ":" + String(left % 60).padStart(2, "0");
}

// ---------- start ----------
async function init() {
    try {
        const [geoRes, infoRes] = await Promise.all([fetch("data/turkey-provinces.geojson"), fetch("data/provinces.json")]);
        PROVINCES = await geoRes.json();
        INFO = await infoRes.json();
    } catch (error) {
        alert("Data could not be loaded. Please open the game with Live Server or GitHub Pages.");
        return;
    }
    graph = createGraph(INFO.adjacency);
    game = createGame(graph);
    renderHighScores($("start-highscores"));
}

async function startGame() {
    game.reset($("player-name").value.trim() || "Player");
    showScreen("game-screen");
    if (!catMap) catMap = createCatMap("map", PROVINCES, INFO.centers, onProvinceClick);
    catMap.refresh();
    updateTopbar();
    say("Checking the weather... cats don't like rain!");

    weatherService.clear();
    weather = await weatherService.loadAll(INFO.centers);
    const wetNames = Object.keys(weather.provinces).filter(function (n) { return weather.provinces[n].wet; });
    catMap.setWeather(wetNames);
    $("weather-note").textContent = weather.live
        ? "Live weather (Open-Meteo): it is raining or snowing now in " + wetNames.length + " provinces."
        : "Weather service not reachable: demo rain is used.";
    startRound();
}

// ---------- one round ----------
function startRound() {
    const r = game.newRound();
    catMap.startRound(r);
    catMap.setReachable(graph.neighbours(r.start));
    updateTopbar();
    updateCounters();

    const line = GOAL_LINES[r.goal] || OTHER_LINES[r.number % OTHER_LINES.length].replace("{city}", r.goal);
    $("mission-text").textContent = "Go from " + r.start + " to " + r.goal + "! " + line;
    $("mission-info").textContent = r.goal + " is " + Math.round(kmBetween(r.start, r.goal)) +
        " km away. The shortest route has " + (r.optimal.length - 1) + " jumps.";
    say("Meow! Click a pink province next to me to jump.");

    if (timer) timer.stop();
    timer = createTimer(r.timeLimit, onTick, onTimeUp);
    timer.start();
    playing = true;
    busy = false;
}

function onProvinceClick(name) {
    if (!playing || busy) return;
    const s = game.getState();
    if (name === s.catAt) return;
    if (!graph.areNeighbours(s.catAt, name)) {
        catMap.shake();
        say("Too far! I can only jump to a neighbouring province. 🐾");
        return;
    }
    busy = true;
    const isWet = weather.provinces[name].wet;
    const res = game.jump(name, isWet);
    catMap.moveCat(name, res.rain ? "wet" : "sit", function () {
        if (res.fish) catMap.removeItem(name);
        if (res.dog) catMap.removeItem(name);
        updateTopbar();
        updateCounters();

        const notes = [];
        if (res.fish) notes.push("Yum, a fish! +" + FISH_BONUS + " s");
        if (res.dog) notes.push("WOOF! A dog! I lost a life.");
        if (res.rain) notes.push("Brrr, it's " + weather.provinces[name].text + " in " + name + "! −" + RAIN_PENALTY + " s");
        say(notes.length ? notes.join(" ") : pickJumpLine(name), res.rain ? "wet" : (res.dog ? "jump" : "sit"));

        if (res.timeChange) timer.addTime(res.timeChange);
        if (!playing) return;                       // time ran out because of the rain penalty

        if (res.gameOver) { endRound(false, false); return; }
        if (res.arrived) { endRound(true, true); return; }
        catMap.setReachable(graph.neighbours(name));
        busy = false;
    });
}

function pickJumpLine(name) {
    const w = weather.provinces[name];
    const t = w.temp === null ? "" : " (" + w.icon + " " + w.temp + "°C)";
    return "Hop! Now I'm in " + name + t + ".";
}

function onTimeUp() {
    if (!playing) return;
    endRound(false, true);
}

function useHint() {
    if (!playing || busy) return;
    const next = game.hint();
    if (!next) return;
    catMap.showHint(next);
    say("Psst... jump to " + next + " (green). −" + HINT_COST + " s");
    timer.addTime(-HINT_COST);
}

function endRound(success, timeoutPenalty) {
    playing = false;
    busy = true;
    timer.stop();
    catMap.setReachable([]);
    const left = success ? timer.getRemaining() : 0;
    const out = game.finishRound(success, left, timeoutPenalty);
    updateTopbar();
    showRoundResult(out.record, out.gameOver);
}

function showRoundResult(r, gameOver) {
    const s = game.getState();
    if (r.success) {
        $("rr-title").textContent = "🏠 You made it to " + r.goal + "!";
        $("rr-cat").src = "assets/sprites/cat-jump.png";
    } else if (s.lives <= 0 && r.dogHits > 0) {
        $("rr-title").textContent = "🐕 Oh no, the dogs got all 9 lives!";
        $("rr-cat").src = "assets/sprites/cat-wet.png";
    } else {
        $("rr-title").textContent = "⏰ Time's up! −" + TIMEOUT_LIVES + " lives";
        $("rr-cat").src = "assets/sprites/cat-wet.png";
    }
    $("rr-table").innerHTML =
        "<tr><td>🐾 Your jumps / shortest route</td><td>" + r.jumps + " / " + r.best + "</td></tr>" +
        "<tr><td>⭐ Route points</td><td>" + r.routePoints + "</td></tr>" +
        "<tr><td>⏱️ Time points (2 per second left)</td><td>" + r.timePoints + "</td></tr>" +
        "<tr><td>🐟 Fish / 🐕 dogs / 🌧️ rain / 💡 hints</td><td>" + r.fishEaten + " / " + r.dogHits + " / " + r.rainHits + " / " + r.hints + "</td></tr>";
    $("rr-total").innerHTML = "<b>+" + r.points + " points</b> · Lives left: " + Math.max(0, s.lives);
    $("rr-continue").textContent = gameOver ? "SEE RESULTS" : "NEXT ROUND";
    $("round-result").classList.remove("hidden");
    $("rr-continue").focus();
}

function continueAfterRound() {
    $("round-result").classList.add("hidden");
    if (game.isOver()) endGame();
    else startRound();
}

// ---------- end of game ----------
function endGame() {
    const s = game.getState();
    const list = highScores.add(s.player, s.score);
    showScreen("end-screen");
    updateTopbar();

    const success = s.history.filter(function (r) { return r.success; }).length;
    $("final-title").textContent = s.lives > 0 ? "ALL ROUNDS DONE!" : "OUT OF LIVES!";
    $("final-cat").src = "assets/sprites/cat-" + (s.lives > 0 ? "jump" : "wet") + ".png";
    $("final-score").textContent = s.score + " pts";
    $("final-info").textContent = "Goals reached: " + success + " / " + s.history.length + " · Lives left: " + Math.max(0, s.lives) +
        (list[0] && list[0].score === s.score && s.score > 0 ? " · 🏆 NEW BEST!" : "");
    renderHighScores($("end-highscores"));

    if (!resultMap) resultMap = createCatMap("result-map", PROVINCES, INFO.centers, function () {});
    resultMap.refresh();
    resultMap.drawSummary(s.history);

    let km = 0;
    s.history.forEach(function (r) {
        for (let i = 1; i < r.path.length; i++) km += kmBetween(r.path[i - 1], r.path[i]);
    });
    $("route-km").textContent = "The cat travelled " + Math.round(km).toLocaleString("en") + " km (Turf.js, centre to centre).";

    const labels = s.history.map(function (r) { return r.number + ". " + r.goal; });
    if (jumpChart) jumpChart.destroy();
    jumpChart = new Chart($("jump-chart"), {
        type: "bar",
        data: {
            labels: labels,
            datasets: [
                { label: "Your jumps", data: s.history.map(function (r) { return r.jumps; }), backgroundColor: "#c98f96", borderColor: "#5a3d42", borderWidth: 2 },
                { label: "Shortest route", data: s.history.map(function (r) { return r.best; }), backgroundColor: "#f6e4e3", borderColor: "#5a3d42", borderWidth: 2 }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
            plugins: { tooltip: { callbacks: { afterBody: function (items) {
                const r = s.history[items[0].dataIndex];
                return r.success ? "+" + r.points + " points" : "goal not reached";
            } } } }
        }
    });
}

// =============================================================
// EVENT HANDLERS
// =============================================================

// 1) Province click + hover (inside map.js, Leaflet layer.on("click"/"mouseover"/"mouseout"))

// 2) Buttons
$("start-btn").addEventListener("click", startGame);
$("hint-btn").addEventListener("click", useHint);
$("rr-continue").addEventListener("click", continueAfterRound);
$("again-btn").addEventListener("click", function () {
    renderHighScores($("start-highscores"));
    showScreen("start-screen");
});

// 3) Keyboard: Enter starts the game, H = hint, Enter/Space = next round
document.addEventListener("keydown", function (e) {
    if ($("start-screen").classList.contains("active") && e.key === "Enter") { startGame(); return; }
    if (!$("round-result").classList.contains("hidden") && (e.key === "Enter" || e.key === " ")) {
        if (document.activeElement === $("rr-continue")) return;   // the button's own click handles it
        e.preventDefault();
        continueAfterRound();
        return;
    }
    if ($("game-screen").classList.contains("active") && (e.key === "h" || e.key === "H")) useHint();
});

init();
