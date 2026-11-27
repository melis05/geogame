// =============================================================
// game.js – rules and state of Pati Rotası
// =============================================================

const TOTAL_ROUNDS = 6;
const START_LIVES = 9;            // a cat has 9 lives!
const FISH_BONUS = 5;             // seconds
const RAIN_PENALTY = 4;           // seconds
const HINT_COST = 5;              // seconds
const TIMEOUT_LIVES = 2;          // lives lost when the time runs out

// difficulty: how far the goal is (in jumps) and how many dogs / fish
function roundSettings(round) {
    if (round <= 2) return { minJumps: 3, maxJumps: 4, dogs: 2, fish: 4, secondsPerJump: 7, factor: 1.0 };
    if (round <= 4) return { minJumps: 5, maxJumps: 6, dogs: 4, fish: 4, secondsPerJump: 6, factor: 0.9 };
    return { minJumps: 7, maxJumps: 9, dogs: 6, fish: 3, secondsPerJump: 5, factor: 0.8 };
}

// CLOSURE: the whole game state is private
function createGame(graph) {
    let state;

    function reset(playerName) {
        state = {
            player: playerName || "Player",
            round: 0,
            score: 0,
            lives: START_LIVES,
            catAt: "Ankara",
            current: null,       // the running round
            history: []          // finished rounds
        };
    }

    function getState() { return JSON.parse(JSON.stringify(state)); }

    function pickRandom(list, n) {
        const copy = list.slice();
        for (let i = copy.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [copy[i], copy[j]] = [copy[j], copy[i]];
        }
        return copy.slice(0, n);
    }

    function newRound() {
        state.round += 1;
        const s = roundSettings(state.round);
        const fromStart = graph.jumpsFrom(state.catAt);
        let candidates = graph.names.filter(function (n) {
            return fromStart[n] >= s.minJumps && fromStart[n] <= s.maxJumps;
        });
        if (candidates.length === 0) {            // e.g. starting in a corner: take the farthest ones
            const maxD = Math.max.apply(null, Object.values(fromStart));
            candidates = graph.names.filter(function (n) { return fromStart[n] === maxD; });
        }
        const goal = pickRandom(candidates, 1)[0];
        const optimal = graph.shortestPath(state.catAt, goal);
        const best = optimal.length - 1;

        // fish and dogs near the useful corridor between start and goal
        const fromGoal = graph.jumpsFrom(goal);
        const corridor = graph.names.filter(function (n) {
            return n !== state.catAt && n !== goal && fromStart[n] + fromGoal[n] <= best + 2;
        });
        const picked = pickRandom(corridor, s.dogs + s.fish);
        const dogs = picked.slice(0, s.dogs);
        const fish = picked.slice(s.dogs);

        state.current = {
            number: state.round,
            start: state.catAt,
            goal: goal,
            optimal: optimal,
            path: [state.catAt],
            dogs: dogs,
            fish: fish,
            fishEaten: 0,
            dogHits: 0,
            rainHits: 0,
            hints: 0,
            timeLimit: Math.round((best * s.secondsPerJump + 12) * s.factor)
        };
        return getState().current;
    }

    // try to jump; returns what happened
    function jump(to, isWet) {
        const r = state.current;
        if (!graph.areNeighbours(state.catAt, to)) return { ok: false };
        state.catAt = to;
        r.path.push(to);
        const result = { ok: true, timeChange: 0, lostLife: false, fish: false, dog: false, rain: false, arrived: to === r.goal };
        if (r.fish.includes(to)) {
            r.fish = r.fish.filter(function (n) { return n !== to; });
            r.fishEaten += 1; result.fish = true; result.timeChange += FISH_BONUS;
        }
        if (r.dogs.includes(to)) {
            r.dogs = r.dogs.filter(function (n) { return n !== to; });
            r.dogHits += 1; state.lives -= 1; result.dog = true; result.lostLife = true;
        }
        if (isWet) { r.rainHits += 1; result.rain = true; result.timeChange -= RAIN_PENALTY; }
        result.gameOver = state.lives <= 0;
        return result;
    }

    function hint() {
        const path = graph.shortestPath(state.catAt, state.current.goal);
        state.current.hints += 1;
        return path && path.length > 1 ? path[1] : null;
    }

    // success: points for a short route + points for the time that is left
    function finishRound(success, secondsLeft, timeoutPenalty) {
        const r = state.current;
        const jumps = r.path.length - 1;
        const best = r.optimal.length - 1;
        let routePoints = 0, timePoints = 0;
        if (success) {
            routePoints = Math.round(100 * best / Math.max(jumps, best));
            timePoints = 2 * secondsLeft;
        } else if (timeoutPenalty !== false) {
            state.lives -= TIMEOUT_LIVES;
        }
        const points = routePoints + timePoints;
        state.score += points;
        const record = {
            number: r.number, start: r.start, goal: r.goal, path: r.path, optimal: r.optimal,
            jumps: jumps, best: best, success: success, routePoints: routePoints, timePoints: timePoints,
            points: points, fishEaten: r.fishEaten, dogHits: r.dogHits, rainHits: r.rainHits, hints: r.hints
        };
        state.history.push(record);
        return { record: record, gameOver: isOver() };
    }

    function isOver() {
        return state.lives <= 0 || state.round >= TOTAL_ROUNDS;
    }

    reset();
    return { reset, getState, newRound, jump, hint, finishRound, isOver };
}

// CLOSURE: high scores saved in localStorage
function createHighScores(storageKey, maxEntries) {
    function load() {
        try { return JSON.parse(localStorage.getItem(storageKey)) || []; }
        catch (e) { return []; }
    }
    function add(name, score) {
        const list = load();
        list.push({ name: name, score: score });
        list.sort(function (a, b) { return b.score - a.score; });
        const top = list.slice(0, maxEntries);
        try { localStorage.setItem(storageKey, JSON.stringify(top)); } catch (e) { /* storage blocked */ }
        return top;
    }
    function best() {
        const list = load();
        return list.length ? list[0].score : 0;
    }
    return { load, add, best };
}
