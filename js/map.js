// =============================================================
// map.js – the Leaflet map: provinces, cat, fish, dogs, goal
// =============================================================

const COLORS = {
    base: "#f6e4e3", border: "#c98f96", reach: "#e8b4bc", reachHover: "#c98f96",
    goal: "#fbe3a4", wet: "#cfdeea", wetReach: "#b9c9e6", visited: "#f1d0d4", hint: "#9be0b0"
};

function pixelIcon(src, size) {
    return L.divIcon({
        className: "",
        html: '<img class="pixel-icon" src="' + src + '" style="width:' + size + 'px;height:' + size + 'px">',
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2]
    });
}

// CLOSURE: all Leaflet objects and the drawing state are private.
function createCatMap(elementId, provincesGeojson, centers, onProvinceClick) {
    const map = L.map(elementId, { zoomSnap: 0.25, minZoom: 5, maxZoom: 9 });
    map.attributionControl.addAttribution("Weather: Open-Meteo · Borders: tr-geojson");

    let catAt = null, goal = null;
    let reachable = [], wet = new Set(), visited = new Set(), hintName = null;
    const layersByName = {};

    function styleFor(name) {
        let fill = COLORS.base;
        if (visited.has(name)) fill = COLORS.visited;
        if (wet.has(name)) fill = COLORS.wet;
        if (reachable.includes(name)) fill = wet.has(name) ? COLORS.wetReach : COLORS.reach;
        if (name === goal) fill = COLORS.goal;
        if (name === hintName) fill = COLORS.hint;
        return { color: COLORS.border, weight: reachable.includes(name) ? 2 : 1, fillColor: fill, fillOpacity: 1 };
    }

    const provinces = L.geoJSON(provincesGeojson, {
        style: function (f) { return styleFor(f.properties.name); },
        onEachFeature: function (feature, layer) {
            const name = feature.properties.name;
            layersByName[name] = layer;
            layer.bindTooltip(name, { sticky: true, direction: "top" });
            // event handlers: hover highlight for reachable provinces, click to jump
            layer.on("mouseover", function () {
                if (reachable.includes(name)) layer.setStyle({ fillColor: COLORS.reachHover });
            });
            layer.on("mouseout", function () { layer.setStyle(styleFor(name)); });
            layer.on("click", function () { onProvinceClick(name); });
        }
    }).addTo(map);

    const bounds = provinces.getBounds();
    map.fitBounds(bounds, { padding: [8, 8] });
    map.setMaxBounds(bounds.pad(0.4));

    const rainLayer = L.layerGroup().addTo(map);
    const itemLayer = L.layerGroup().addTo(map);
    const pathLayer = L.layerGroup().addTo(map);
    const items = {};                  // province -> marker
    let catMarker = null, goalMarker = null, pathLine = null;

    function restyleAll() {
        Object.keys(layersByName).forEach(function (n) { layersByName[n].setStyle(styleFor(n)); });
    }

    function setWeather(wetNames) {
        wet = new Set(wetNames);
        rainLayer.clearLayers();
        wetNames.forEach(function (n) {
            L.marker(centers[n], { icon: pixelIcon("assets/sprites/rain.png", 26), interactive: false }).addTo(rainLayer);
        });
        restyleAll();
    }

    function startRound(round) {
        catAt = round.start;
        goal = round.goal;
        hintName = null;
        visited = new Set([catAt]);
        itemLayer.clearLayers();
        pathLayer.clearLayers();
        Object.keys(items).forEach(function (k) { delete items[k]; });

        round.fish.forEach(function (n) {
            items[n] = L.marker(centers[n], { icon: pixelIcon("assets/sprites/fish.png", 30), interactive: false }).addTo(itemLayer);
        });
        round.dogs.forEach(function (n) {
            items[n] = L.marker(centers[n], { icon: pixelIcon("assets/sprites/dog.png", 32), interactive: false }).addTo(itemLayer);
        });
        goalMarker = L.marker(centers[goal], { icon: pixelIcon("assets/sprites/goal.png", 40), interactive: false }).addTo(itemLayer);

        pathLine = L.polyline([centers[catAt]], { color: "#c0505f", weight: 4, dashArray: "2 8", lineCap: "round" }).addTo(pathLayer);

        if (!catMarker) {
            catMarker = L.marker(centers[catAt], { icon: pixelIcon("assets/sprites/cat-sit.png", 52), zIndexOffset: 1000, interactive: false }).addTo(map);
        } else {
            catMarker.setLatLng(centers[catAt]);
        }
        setCatSprite("sit");

        const view = L.latLngBounds([centers[catAt], centers[goal]]).pad(0.6);
        map.flyToBounds(view, { duration: 0.8, maxZoom: 7 });
    }

    function setReachable(list) {
        reachable = list;
        restyleAll();
    }

    function setCatSprite(kind) {
        if (!catMarker) return;
        catMarker.setIcon(pixelIcon("assets/sprites/cat-" + kind + ".png", 52));
    }

    // jump animation (a small arc between the two province centres)
    function moveCat(to, landingSprite, done) {
        const from = catMarker.getLatLng();
        const target = L.latLng(centers[to]);
        const startTime = performance.now();
        const duration = 380;
        setCatSprite("jump");
        function frame(now) {
            const t = Math.min(1, (now - startTime) / duration);
            const lat = from.lat + (target.lat - from.lat) * t + Math.sin(Math.PI * t) * 0.25;
            const lng = from.lng + (target.lng - from.lng) * t;
            catMarker.setLatLng([lat, lng]);
            if (t < 1) { requestAnimationFrame(frame); return; }
            catAt = to;
            visited.add(to);
            hintName = null;
            pathLine.addLatLng(target);
            setCatSprite(landingSprite);
            restyleAll();
            if (done) done();
        }
        requestAnimationFrame(frame);
    }

    function removeItem(name) {
        if (items[name]) { itemLayer.removeLayer(items[name]); delete items[name]; }
    }

    function showHint(name) {
        hintName = name;
        restyleAll();
    }

    function shake() {
        const el = document.getElementById(elementId);
        el.classList.remove("shake");
        void el.offsetWidth;          // restart the CSS animation
        el.classList.add("shake");
    }

    // end of game: every round's route
    function drawSummary(rounds) {
        itemLayer.clearLayers();
        pathLayer.clearLayers();
        rainLayer.clearLayers();
        reachable = []; visited = new Set(); goal = null; hintName = null;
        restyleAll();
        if (catMarker) { map.removeLayer(catMarker); catMarker = null; }
        const all = [];
        rounds.forEach(function (r, i) {
            const mine = r.path.map(function (n) { return centers[n]; });
            const best = r.optimal.map(function (n) { return centers[n]; });
            L.polyline(best, { color: "#5a3d42", weight: 2, dashArray: "6 6" }).addTo(pathLayer);
            L.polyline(mine, { color: "#c0505f", weight: 4, opacity: 0.85 }).addTo(pathLayer);
            L.marker(centers[r.goal], {
                icon: L.divIcon({ className: "", html: '<div class="round-num">' + (i + 1) + "</div>", iconSize: [24, 24], iconAnchor: [12, 12] })
            }).addTo(pathLayer);
            all.push.apply(all, mine);
        });
        if (all.length) map.fitBounds(L.latLngBounds(all).pad(0.15));
    }

    function refresh() { map.invalidateSize(); }

    return { setWeather, startRound, setReachable, setCatSprite, moveCat, removeItem, showHint, shake, drawSummary, refresh };
}
