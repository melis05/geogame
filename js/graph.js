// =============================================================
// graph.js – provinces as a graph (neighbours + shortest route)
// =============================================================

// CLOSURE: the adjacency list is private. The returned functions
// answer questions about it (who are the neighbours, what is the
// shortest route) but nobody can change the map by mistake.
function createGraph(adjacency) {

    function neighbours(name) {
        return adjacency[name] || [];
    }

    function areNeighbours(a, b) {
        return neighbours(a).includes(b);
    }

    // Breadth-first search: the route with the fewest jumps
    function shortestPath(start, goal) {
        if (start === goal) return [start];
        const previous = { [start]: null };
        const queue = [start];
        while (queue.length > 0) {
            const current = queue.shift();
            for (const next of neighbours(current)) {
                if (next in previous) continue;
                previous[next] = current;
                if (next === goal) {
                    const path = [goal];
                    let step = current;
                    while (step !== null) { path.unshift(step); step = previous[step]; }
                    return path;
                }
                queue.push(next);
            }
        }
        return null;
    }

    // number of jumps from one province to all others (BFS layers)
    function jumpsFrom(start) {
        const dist = { [start]: 0 };
        const queue = [start];
        while (queue.length > 0) {
            const current = queue.shift();
            for (const next of neighbours(current)) {
                if (next in dist) continue;
                dist[next] = dist[current] + 1;
                queue.push(next);
            }
        }
        return dist;
    }

    return { neighbours, areNeighbours, shortestPath, jumpsFrom, names: Object.keys(adjacency) };
}
