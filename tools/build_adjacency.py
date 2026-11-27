"""Builds data/provinces.json (neighbour list + a label point for every province)
from the province borders. Run once with: python tools/build_adjacency.py
Needs: pip install shapely"""
import json
from shapely.geometry import shape

data = json.load(open("data/turkey-provinces.geojson", encoding="utf-8"))
names = [f["properties"]["name"] for f in data["features"]]
geoms = [shape(f["geometry"]).buffer(0) for f in data["features"]]
grown = [g.buffer(0.004) for g in geoms]          # small buffer closes tiny gaps between borders

adjacency = {n: [] for n in names}
for i in range(len(names)):
    for j in range(i + 1, len(names)):
        if grown[i].intersects(grown[j]) and grown[i].intersection(grown[j]).area > 1e-5:
            adjacency[names[i]].append(names[j])
            adjacency[names[j]].append(names[i])

centers = {n: [round(g.representative_point().y, 4), round(g.representative_point().x, 4)] for n, g in zip(names, geoms)}
json.dump({"adjacency": adjacency, "centers": centers}, open("data/provinces.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print("done:", len(names), "provinces")
