"""Validate, summarize, and traverse the Astra for Work network using Python 3."""
import argparse
import json
import math
import re
import sys
from collections import Counter, defaultdict, deque
from pathlib import Path


DEFAULT_GRAPH = Path(__file__).resolve().parents[1] / "model" / "network.json"
NODE_KINDS = {"root", "group", "work"}
EDGE_ENDPOINTS = {
    "category": ("root", "group"),
    "membership": ("group", "work"),
    "workflow": ("work", "work"),
}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def validate(data):
    require(isinstance(data, dict) and data.get("schema_version") == "1.0",
            "Expected schema_version 1.0")
    require(isinstance(data.get("nodes"), list) and isinstance(data.get("edges"), list),
            "Expected arrays named nodes and edges")
    by_id = {}
    for node in data["nodes"]:
        require(isinstance(node, dict), "Each node must be an object")
        identifier = node.get("id")
        require(isinstance(identifier, str) and re.fullmatch(r"[a-z][a-z0-9_-]*", identifier),
                f"Invalid node ID: {identifier}")
        require(identifier not in by_id, f"Duplicate node ID: {identifier}")
        require(isinstance(node.get("kind"), str) and node["kind"] in NODE_KINDS, f"Unknown kind on {identifier}")
        for field in ("name", "name_en", "short_name", "description"):
            require(isinstance(node.get(field), str) and node[field].strip(),
                    f"Missing {field} on {identifier}")
        require(isinstance(node.get("color"), str) and re.fullmatch(r"#[0-9A-Fa-f]{6}", node["color"]),
                f"Invalid color on {identifier}")
        position = node.get("position")
        require(isinstance(position, dict) and set(position) == {"x", "y", "z"},
                f"Missing XYZ position on {identifier}")
        require(all(type(v) in (int, float) and math.isfinite(v) for v in position.values()),
                f"Non-finite coordinate on {identifier}")
        by_id[identifier] = node

    roots = [n for n in by_id.values() if n["kind"] == "root"]
    require(len(roots) == 1, "Expected exactly one root")
    seen_edges, parents = set(), {}
    for edge in data["edges"]:
        require(isinstance(edge, dict), "Each edge must be an object")
        start, end, kind = (edge.get(k) for k in ("source", "target", "kind"))
        require(isinstance(start, str) and start in by_id and isinstance(end, str) and end in by_id,
                f"Unknown endpoint on {start} -> {end}")
        require(isinstance(kind, str) and kind in EDGE_ENDPOINTS and EDGE_ENDPOINTS[kind] == (by_id[start]["kind"], by_id[end]["kind"]),
                f"Invalid {kind} edge: {start} -> {end}")
        require(start != end and (start, end, kind) not in seen_edges,
                f"Duplicate or self edge: {start} -> {end}")
        seen_edges.add((start, end, kind))
        for field in ("label", "reason"):
            require(isinstance(edge.get(field), str) and edge[field].strip(),
                    f"Missing edge {field}: {start} -> {end}")
        if kind == "workflow":
            require(by_id[start].get("group_id") != by_id[end].get("group_id"),
                    f"Expected different groups for workflow {start} -> {end}")
        else:
            require(end not in parents, f"Multiple category parents for {end}")
            parents[end] = start

    for node in by_id.values():
        if node["kind"] == "group":
            require(parents.get(node["id"]) == roots[0]["id"],
                    f"Missing root-to-group edge: {node['id']}")
        if node["kind"] == "work":
            require(node["id"] in parents and parents[node["id"]] == node.get("group_id"),
                    f"Missing or inconsistent group membership on {node['id']}")
    return by_id


def shortest_path(edges, source, target, mode):
    neighbors = defaultdict(list)
    for edge in edges:
        if mode != "atlas" and edge["kind"] != "workflow":
            continue
        start, end = edge["source"], edge["target"]
        neighbors[start].append((end, edge))
        if mode != "flow":
            neighbors[end].append((start, edge))

    queue = deque([source])
    previous = {source: None}
    while queue:
        current = queue.popleft()
        if current == target:
            path = []
            while previous[current] is not None:
                parent, edge = previous[current]
                path.append((parent, current, edge))
                current = parent
            return path[::-1]
        for other, edge in neighbors[current]:
            if other not in previous:
                previous[other] = (current, edge)
                queue.append(other)
    return None


def show_stats(graph):
    kinds = Counter(n["kind"] for n in graph["nodes"])
    links = Counter(e["kind"] for e in graph["edges"])
    members = Counter(n["group_id"] for n in graph["nodes"] if n["kind"] == "work")
    print(f"Nodes: {len(graph['nodes'])} (root={kinds['root']}, group={kinds['group']}, work={kinds['work']})")
    print(f"Edges: {len(graph['edges'])} (category={links['category']}, "
          f"membership={links['membership']}, workflow={links['workflow']})")
    for group in graph["nodes"]:
        if group["kind"] == "group":
            print(f"  {group['id']}: {members[group['id']]} works")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--graph", type=Path, default=DEFAULT_GRAPH, help="network JSON file")
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("validate", help="check the network schema and its relationships")
    commands.add_parser("stats", help="count nodes, edges, and works per category")
    path = commands.add_parser("path", help="find a minimum-hop route and explain each edge")
    path.add_argument("source")
    path.add_argument("target")
    path.add_argument("--mode", choices=("trace", "flow", "atlas"), default="trace",
                      help="trace=workflow both ways, flow=workflow forward, atlas=all edges both ways")
    args = parser.parse_args()
    try:
        graph = json.loads(args.graph.read_text(encoding="utf-8"))
        nodes = validate(graph)
        if args.command == "validate":
            print(f"Valid: {len(nodes)} nodes, {len(graph['edges'])} edges.")
        elif args.command == "stats":
            show_stats(graph)
        else:
            for identifier in (args.source, args.target):
                require(identifier in nodes, f"Unknown node ID: {identifier}")
            route = shortest_path(graph["edges"], args.source, args.target, args.mode)
            if route is None:
                print(f"No route: {args.source} -> {args.target} in mode {args.mode}.")
                return 1
            print(f"{args.mode}: {args.source} to {args.target}, {len(route)} hops")
            for start, end, edge in route:
                direction = "forward" if start == edge["source"] else "reverse"
                print(f"  {start} -> {end} [{direction}, {edge['kind']}] {edge['label']}")
                print(f"    {edge['reason']}")
    except (OSError, UnicodeError, ValueError) as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
