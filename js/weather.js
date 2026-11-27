// =============================================================
// weather.js – live weather of all 81 provinces (Open-Meteo)
// Open-Meteo is free and needs no API key: https://open-meteo.com
// =============================================================

// WMO weather codes -> short text + icon
function describeWeatherCode(code) {
    if (code === 0) return { text: "clear", icon: "☀️" };
    if (code <= 3) return { text: "cloudy", icon: "⛅" };
    if (code === 45 || code === 48) return { text: "fog", icon: "🌫️" };
    if (code >= 51 && code <= 57) return { text: "drizzle", icon: "🌦️" };
    if (code >= 61 && code <= 67) return { text: "rain", icon: "🌧️" };
    if (code >= 71 && code <= 77) return { text: "snow", icon: "❄️" };
    if (code >= 80 && code <= 82) return { text: "showers", icon: "🌧️" };
    if (code >= 85 && code <= 86) return { text: "snow showers", icon: "🌨️" };
    if (code >= 95) return { text: "thunderstorm", icon: "⛈️" };
    return { text: "unknown", icon: "❔" };
}

function isWetCode(code) {
    return (code >= 51 && code <= 67) || (code >= 71 && code <= 86) || code >= 95;
}

// CLOSURE: the weather of all provinces is loaded once and kept in
// the private "cache". Later calls return the same object.
function createWeatherService() {
    let cache = null;

    async function loadAll(centers) {
        if (cache) return cache;
        const names = Object.keys(centers);
        const lats = names.map(function (n) { return centers[n][0]; }).join(",");
        const lons = names.map(function (n) { return centers[n][1]; }).join(",");
        // one request for all 81 provinces (Open-Meteo accepts lists of coordinates)
        const url = "https://api.open-meteo.com/v1/forecast?latitude=" + lats + "&longitude=" + lons +
            "&current=temperature_2m,precipitation,weather_code&timezone=Europe%2FIstanbul";
        const result = { live: true, provinces: {} };
        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error("HTTP " + response.status);
            let data = await response.json();
            if (!Array.isArray(data)) data = [data];
            names.forEach(function (name, i) {
                const c = data[i].current;
                const d = describeWeatherCode(c.weather_code);
                result.provinces[name] = {
                    temp: Math.round(c.temperature_2m),
                    text: d.text,
                    icon: d.icon,
                    wet: isWetCode(c.weather_code) || c.precipitation > 0
                };
            });
        } catch (error) {
            // Offline backup: no live data -> a few random rainy provinces, clearly marked
            console.warn("Weather API failed, using offline demo rain.", error);
            result.live = false;
            names.forEach(function (name) {
                const wet = Math.random() < 0.15;
                result.provinces[name] = { temp: null, text: wet ? "rain (demo)" : "dry (demo)", icon: wet ? "🌧️" : "☁️", wet: wet };
            });
        }
        cache = result;
        return cache;
    }

    function clear() { cache = null; }

    return { loadAll, clear };
}
