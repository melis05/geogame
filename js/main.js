// =============================================================
// main.js – screens, event handlers and the game loop
// =============================================================

const weatherService = createWeatherService();
const highScores = createHighScores("patiRotasiHighScores", 5);

let PROVINCES = null;      // turkey-provinces.geojson
let INFO = null;           // provinces.json: adjacency + centre points
let graph = null, game = null, catMap = null, resultMap = null, jumpChart = null;
let weather = null;        // live weather of all provinces
let snowNames = [];        // provinces where it snows now (closed from round 3)
let timer = null;
let playing = false;       // a round is running
let busy = false;          // the cat is in the air

const $ = function (id) { return document.getElementById(id); };

const GOAL_LINES = {
    "Van": "Bir gözü mavi, bir gözü kehribar renkli kuzenin Van kedisi seni Van'da bekliyor!",
    "Ankara": "Tüylü Ankara kedisi seni Ankara'ya çaya davet etti!",
    "İstanbul": "İstanbul'un sokak kedileri parti veriyor. Geç kalma!",
    "Niğde": "Niğde'deki babaanne kedi sana balık yaptı!"
};
const OTHER_LINES = [
    "{in} seni sıcacık bir battaniye bekliyor.",
    "En yakın arkadaşın seni {in} bekliyor.",
    "{in} güneş alan bir pencere var. Git ve uyu!",
    "{in} birinin bir kutusu var. İçine oturmak ZORUNDASIN."
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
    if (list.length === 0) { listElement.innerHTML = '<li class="empty">Henüz puan yok</li>'; return; }
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
        alert("Veriler yüklenemedi. Lütfen oyunu Live Server ya da GitHub Pages ile aç.");
        return;
    }
    graph = createGraph(INFO.adjacency);
    game = createGame(graph);
    renderHighScores($("start-highscores"));
}

async function startGame() {
    game.reset($("player-name").value.trim() || "Oyuncu");
    showScreen("game-screen");
    if (!catMap) catMap = createCatMap("map", PROVINCES, INFO.centers, onProvinceClick);
    catMap.refresh();
    updateTopbar();
    say("Hava durumuna bakıyorum... kediler yağmuru sevmez!");

    weatherService.clear();
    weather = await weatherService.loadAll(INFO.centers);
    const wetNames = Object.keys(weather.provinces).filter(function (n) { return weather.provinces[n].wet; });
    snowNames = Object.keys(weather.provinces).filter(function (n) { return weather.provinces[n].snow; });
    catMap.setWeather(wetNames, snowNames);
    $("weather-note").textContent = weather.live
        ? "Canlı hava durumu (Open-Meteo): şu an " + wetNames.length + " ilde yağış var (" + snowNames.length + " ilde kar)."
        : "Hava durumu servisine ulaşılamadı: deneme amaçlı yağmur/kar kullanılıyor.";
    startRound();
}

// ---------- one round ----------
function startRound() {
    const r = game.newRound(snowNames);
    catMap.startRound(r);
    catMap.setRules(r.rules, r.blocked);
    catMap.setReachable(graph.neighbours(r.start));
    updateTopbar();
    updateCounters();

    const line = GOAL_LINES[r.goal] || OTHER_LINES[r.number % OTHER_LINES.length].replace("{in}", locative(r.goal));
    $("mission-text").textContent = r.start + " → " + r.goal + "! " + line;
    let info = r.goal + " kuş uçuşu " + Math.round(kmBetween(r.start, r.goal)) + " km uzakta.";
    if (r.rules.showJumpCount) info += " En kısa rota " + (r.optimal.length - 1) + " zıplama.";
    if (!r.rules.showNames) info += " ❗ İl isimleri gizli, kar yağan ❄️ iller kapalı, köpekler dolaşıyor.";
    if (!r.rules.highlight) info += " ❗ Pembe yardım yok, yanlış tıklama −" + WRONG_CLICK_PENALTY + " sn, köpekler seni KOVALIYOR!";
    $("mission-info").textContent = info;
    say(r.rules.highlight ? "Miyav! Zıplamak için yanımdaki pembe illerden birine tıkla."
                          : "Zor mod! Artık pembe yardım yok. Hangi iller benimkine komşu?");

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
    const isWet = weather.provinces[name].wet;
    const res = game.jump(name, isWet);
    if (!res.ok) {
        catMap.shake();
        if (res.blocked) say("Orada çok kar var! ❄️ O il kapalı.", "wet");
        else say("Çok uzak! Sadece komşu bir ile zıplayabilirim. 🐾" + (res.penalty ? " −" + res.penalty + " sn" : ""));
        if (res.penalty) timer.addTime(-res.penalty);
        return;
    }
    busy = true;
    catMap.moveCat(name, res.rain ? "wet" : "sit", function () {
        if (res.fish) catMap.removeItem(name);
        if (res.dog) catMap.removeItem(name);
        updateTopbar();
        updateCounters();

        const notes = [];
        if (res.fish) notes.push("Mmm, balık! +" + FISH_BONUS + " sn");
        if (res.dog) notes.push("HAV! Köpek! Bir canımı kaybettim.");
        if (res.rain) notes.push("Brrr, " + name + " ıslak (" + weatherTr(weather.provinces[name].text) + ")! −" + RAIN_PENALTY + " sn");
        say(notes.length ? notes.join(" ") : pickJumpLine(name), res.rain ? "wet" : (res.dog ? "jump" : "sit"));

        if (res.timeChange) timer.addTime(res.timeChange);
        if (!playing) return;                       // time ran out because of the rain penalty

        if (res.gameOver) { endRound(false, false); return; }
        if (res.arrived) { endRound(true, true); return; }

        // hardest rounds: the dogs walk after every jump
        if (game.getState().current.rules.dogsMove) {
            const dm = game.moveDogs();
            dm.moves.forEach(function (m) { catMap.moveItem(m.from, m.to); });
            if (dm.caught) {
                catMap.removeItem(name);
                updateTopbar();
                say("Bir köpek peşime düştü ve beni yakaladı! −1 can 🐕", "jump");
            }
            if (dm.gameOver) { endRound(false, false); return; }
        }
        catMap.setReachable(graph.neighbours(name));
        busy = false;
    });
}

// Turkish locative suffix with vowel harmony: Van'da, İzmir'de, Kars'ta, Sinop'ta
function locative(name) {
    const lower = name.toLocaleLowerCase("tr");
    const vowels = lower.match(/[aeıioöuü]/g) || ["a"];
    const back = "aıou".includes(vowels[vowels.length - 1]);
    const hard = "çfhkpsşt".includes(lower[lower.length - 1]);
    return name + "'" + (hard ? "t" : "d") + (back ? "a" : "e");
}

const WEATHER_TR = {
    "clear": "açık", "cloudy": "bulutlu", "fog": "sisli", "drizzle": "çisenti", "rain": "yağmur",
    "snow": "kar", "showers": "sağanak", "snow showers": "kar sağanağı", "thunderstorm": "fırtına",
    "unknown": "bilinmiyor", "rain (demo)": "yağmur (deneme)", "snow (demo)": "kar (deneme)", "dry (demo)": "kuru (deneme)"
};
function weatherTr(text) { return WEATHER_TR[text] || text; }

function pickJumpLine(name) {
    const w = weather.provinces[name];
    const t = w.temp === null ? "" : " (" + w.icon + " " + w.temp + "°C)";
    const loc = locative(name);
    return "Hop! Şimdi " + loc + (loc.endsWith("a") ? "yım" : "yim") + t + ".";
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
    const named = game.getState().current.rules.showNames;
    say("Psst... sıradaki il: " + (named ? next : "yeşil olan") + ". −" + HINT_COST + " sn");
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
        $("rr-title").textContent = "🏠 " + r.goal + " hedefine ulaştın!";
        $("rr-cat").src = "assets/sprites/cat-jump.png";
    } else if (s.lives <= 0 && r.dogHits > 0) {
        $("rr-title").textContent = "🐕 Eyvah, köpekler 9 canın hepsini aldı!";
        $("rr-cat").src = "assets/sprites/cat-wet.png";
    } else {
        $("rr-title").textContent = "⏰ Süre bitti! −" + TIMEOUT_LIVES + " can";
        $("rr-cat").src = "assets/sprites/cat-wet.png";
    }
    $("rr-table").innerHTML =
        "<tr><td>🐾 Senin zıplaman / en kısa rota</td><td>" + r.jumps + " / " + r.best + "</td></tr>" +
        "<tr><td>⭐ Rota puanı</td><td>" + r.routePoints + "</td></tr>" +
        "<tr><td>⏱️ Süre puanı (kalan her saniye 2)</td><td>" + r.timePoints + "</td></tr>" +
        "<tr><td>🐟 Balık / 🐕 köpek / 🌧️ yağmur / 💡 ipucu / ❌ yanlış tıklama</td><td>" + r.fishEaten + " / " + r.dogHits + " / " + r.rainHits + " / " + r.hints + " / " + r.wrongClicks + "</td></tr>";
    $("rr-total").innerHTML = "<b>+" + r.points + " puan</b> · Kalan can: " + Math.max(0, s.lives);
    $("rr-continue").textContent = gameOver ? "SONUÇLARI GÖR" : "SONRAKİ TUR";
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
    $("final-title").textContent = s.lives > 0 ? "TÜM TURLAR BİTTİ!" : "CANIN KALMADI!";
    $("final-cat").src = "assets/sprites/cat-" + (s.lives > 0 ? "jump" : "wet") + ".png";
    $("final-score").textContent = s.score + " puan";
    $("final-info").textContent = "Ulaşılan hedef: " + success + " / " + s.history.length + " · Kalan can: " + Math.max(0, s.lives) +
        (list[0] && list[0].score === s.score && s.score > 0 ? " · 🏆 YENİ REKOR!" : "");
    renderHighScores($("end-highscores"));

    if (!resultMap) resultMap = createCatMap("result-map", PROVINCES, INFO.centers, function () {});
    resultMap.refresh();
    resultMap.drawSummary(s.history);

    let km = 0;
    s.history.forEach(function (r) {
        for (let i = 1; i < r.path.length; i++) km += kmBetween(r.path[i - 1], r.path[i]);
    });
    $("route-km").textContent = "Kedi toplam " + Math.round(km).toLocaleString("tr") + " km yol yaptı (Turf.js, il merkezleri arası).";

    const labels = s.history.map(function (r) { return r.number + ". " + r.goal; });
    if (jumpChart) jumpChart.destroy();
    jumpChart = new Chart($("jump-chart"), {
        type: "bar",
        data: {
            labels: labels,
            datasets: [
                { label: "Senin zıplaman", data: s.history.map(function (r) { return r.jumps; }), backgroundColor: "#c98f96", borderColor: "#5a3d42", borderWidth: 2 },
                { label: "En kısa rota", data: s.history.map(function (r) { return r.best; }), backgroundColor: "#f6e4e3", borderColor: "#5a3d42", borderWidth: 2 }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
            plugins: { tooltip: { callbacks: { afterBody: function (items) {
                const r = s.history[items[0].dataIndex];
                return r.success ? "+" + r.points + " puan" : "hedefe ulaşılamadı";
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
