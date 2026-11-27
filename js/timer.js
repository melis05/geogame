// =============================================================
// timer.js – countdown timer
// =============================================================

// CLOSURE: "remaining" and "intervalId" are private. Each call of
// createTimer() makes a new, independent timer with its own state.
function createTimer(totalSeconds, onTick, onEnd) {
    let remaining = totalSeconds;
    let intervalId = null;

    function start() {
        stop();
        onTick(remaining, totalSeconds);
        intervalId = setInterval(function () {
            remaining -= 1;
            onTick(remaining, totalSeconds);
            if (remaining <= 0) {
                stop();
                onEnd();
            }
        }, 1000);
    }

    function stop() {
        if (intervalId !== null) {
            clearInterval(intervalId);
            intervalId = null;
        }
    }

    // fish (+) and rain / hints (-) change the time that is left
    function addTime(seconds) {
        remaining = Math.max(0, remaining + seconds);
        onTick(remaining, totalSeconds);
        if (remaining <= 0 && intervalId !== null) {
            stop();
            onEnd();
        }
    }

    function getRemaining() {
        return Math.max(0, remaining);
    }

    return { start, stop, addTime, getRemaining };
}
