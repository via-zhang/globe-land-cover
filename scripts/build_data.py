"""Build the static data payload the web app reads.

Reads globe_land_cover.gpkg (a plain SQLite file) and writes into public/data:

  meta.json       counts, date range, land-cover groups, field labels
  countries.json  99 entries: code, name, count, zoom bbox (Natural Earth)
  points.json     columnar map index: fid, lon, lat, day, country, cover, photos
  calendar.json   [[dayIndex, count], ...] for the calendar heatmap
  outlines.json   country outlines for the dark basemap
  obs/NNNN.json   full attributes, 250 observations per shard

Country outlines and zoom boxes come from Natural Earth (public domain). The
source GeoJSON is cached under scripts/vendor/ so repeat builds need no network.
"""

from __future__ import annotations

import json
import math
import os
import re
import sqlite3
import struct
import sys
import urllib.request
from collections import Counter, defaultdict
from datetime import date

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GPKG = os.path.join(ROOT, "globe_land_cover.gpkg")
OUT = os.path.join(ROOT, "public", "data")
VENDOR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "vendor")

TABLE = "globe_land_cover"
EPOCH = date(2010, 1, 1)
SHARD = 250

NE_50M = (
    "https://d2ad6b4ur7yvpq.cloudfront.net/naturalearth-3.3.0/"
    "ne_50m_admin_0_countries.geojson"
)
NE_110M = (
    "https://d2ad6b4ur7yvpq.cloudfront.net/naturalearth-3.3.0/"
    "ne_110m_admin_0_countries.geojson"
)

DIRECTIONS = ["North", "East", "South", "West", "Upward", "Downward"]
# Only the four horizontal directions carry MUC classification strings.
CLASSIFIED_DIRECTIONS = ["North", "East", "South", "West"]

# Canonical land-cover groups. The GPKG mixes two MUC vocabularies: the short
# GLOBE Observer list ("Trees", "Wetlands") and the full MUC hierarchy
# ("Closed Forest", "Wetland"). Both normalise into these eight with no
# leftovers - verified against every distinct value in the file.
COVER_GROUPS = [
    {"id": 0, "label": "Forest / Trees", "color": "#2f9e58"},
    {"id": 1, "label": "Grassland / Herbaceous", "color": "#a3c556"},
    {"id": 2, "label": "Shrubland", "color": "#c99a3f"},
    {"id": 3, "label": "Cultivated", "color": "#e0b33a"},
    {"id": 4, "label": "Barren", "color": "#b08968"},
    {"id": 5, "label": "Urban", "color": "#c96f6f"},
    {"id": 6, "label": "Open Water", "color": "#4a9fd8"},
    {"id": 7, "label": "Wetland", "color": "#5ec0b0"},
]

COVER_LOOKUP = {
    "Trees": 0,
    "Woodland": 0,
    "Closed Forest": 0,
    "Herbaceous/Grassland": 1,
    "Herbaceous Vegetation": 1,
    "Shrubs": 2,
    "Shrubland or Thicket": 2,
    "Dwarf-Shrubland or Dwarf-Thicket": 2,
    "Cultivated": 3,
    "Cultivated Land": 3,
    "Barren": 4,
    "Barren Land": 4,
    "Urban": 5,
    "Open Water": 6,
    "Wetland": 7,
    "Wetlands": 7,
}

# "70% MUC 12 (n) [Trees, Loosely Spaced, Deciduous - Needle Leaved]; 60% ..."
CLASSIFICATION_RE = re.compile(
    r"(\d+)%\s*MUC\s*([0-9]+)\s*(?:\(([^)]*)\))?\s*\[([^\]]*)\]"
)

# data.globe.gov stores a literal "rejected" where a photo was moderated away.
PHOTO_SENTINELS = {"", "rejected", "null", "none"}


# --------------------------------------------------------------------------
# GeoPackage geometry
# --------------------------------------------------------------------------

_ENVELOPE_BYTES = {0: 0, 1: 32, 2: 48, 3: 48, 4: 64}


def decode_point(blob: bytes) -> tuple[float, float]:
    """Return (lon, lat) from a GeoPackage WKB point blob."""
    envelope = (blob[3] >> 1) & 0x07
    wkb = blob[8 + _ENVELOPE_BYTES[envelope]:]
    endian = "<" if wkb[0] == 1 else ">"
    return struct.unpack(endian + "dd", wkb[5:21])


# --------------------------------------------------------------------------
# Natural Earth
# --------------------------------------------------------------------------


def fetch_natural_earth(url: str, name: str) -> dict:
    os.makedirs(VENDOR, exist_ok=True)
    cached = os.path.join(VENDOR, name)
    if not os.path.exists(cached):
        print(f"  downloading {name} ...")
        with urllib.request.urlopen(url, timeout=300) as response:
            data = response.read()
        with open(cached, "wb") as handle:
            handle.write(data)
    with open(cached, "rb") as handle:
        return json.load(handle)


def outer_rings(geometry: dict) -> list[list[list[float]]]:
    if geometry["type"] == "Polygon":
        return [geometry["coordinates"][0]]
    return [polygon[0] for polygon in geometry["coordinates"]]


def ring_area(ring: list[list[float]]) -> float:
    total = 0.0
    for i in range(len(ring) - 1):
        x1, y1 = ring[i][0], ring[i][1]
        x2, y2 = ring[i + 1][0], ring[i + 1][1]
        total += x1 * y2 - x2 * y1
    return abs(total) / 2


def zoom_bbox(features: list[dict]) -> list[float]:
    """Bounding box for fitBounds, unwrapped across the antimeridian.

    A raw min/max box makes the USA, Russia and New Zealand span the globe.
    Dropping slivers under 1% of the country's area and re-anchoring every
    longitude to the largest polygon's frame yields the expected view.
    """
    rings = [ring for feature in features for ring in outer_rings(feature["geometry"])]
    rings.sort(key=ring_area, reverse=True)
    total = sum(ring_area(ring) for ring in rings)
    kept = [ring for ring in rings if ring_area(ring) >= 0.01 * total] or rings[:1]

    anchor_xs = [point[0] for point in rings[0]]
    anchor = (min(anchor_xs) + max(anchor_xs)) / 2

    xs: list[float] = []
    ys: list[float] = []
    for ring in kept:
        for x, y in ((p[0], p[1]) for p in ring):
            while x - anchor > 180:
                x -= 360
            while x - anchor < -180:
                x += 360
            xs.append(x)
            ys.append(y)
    return [
        round(min(xs), 4),
        round(min(ys), 4),
        round(max(xs), 4),
        round(max(ys), 4),
    ]


def round_geometry(geometry: dict, places: int = 2) -> dict:
    """Drop coordinate precision - these outlines are drawn, never measured."""

    def walk(node):
        if isinstance(node[0], (int, float)):
            return [round(node[0], places), round(node[1], places)]
        return [walk(child) for child in node]

    return {"type": geometry["type"], "coordinates": walk(geometry["coordinates"])}


def build_outlines() -> dict:
    source = fetch_natural_earth(NE_110M, "ne_110m_admin_0_countries.geojson")
    features = []
    for feature in source["features"]:
        properties = feature["properties"]
        code = properties.get("iso_a3")
        if not code or code == "-99":
            code = properties.get("adm0_a3") or ""
        features.append(
            {
                "type": "Feature",
                "properties": {"code": code, "name": properties.get("name") or ""},
                "geometry": round_geometry(feature["geometry"]),
            }
        )
    return {"type": "FeatureCollection", "features": features}


# --------------------------------------------------------------------------
# Attribute helpers
# --------------------------------------------------------------------------


def photo_url(value: str | None) -> str | None:
    """First usable URL in a cell, or None.

    Every cell in this file holds exactly one URL, but the column is free text
    so we split defensively and reject the "rejected" sentinel either way.
    """
    if value is None:
        return None
    text = value.strip()
    if text.lower() in PHOTO_SENTINELS:
        return None
    first = re.split(r"[;,\s]+", text)[0].strip()
    return first if first.lower().startswith("http") else None


def cover_groups_for(row: sqlite3.Row) -> list[int]:
    """Every canonical cover group present at this site.

    Uses the site-level MUC code plus each direction's classification string,
    so a plot that is 70% trees and 40% urban matches both filters.
    """
    found: set[int] = set()

    description = (row["MucDescription"] or "").strip()
    if description:
        group = COVER_LOOKUP.get(description.split(",")[0].strip())
        if group is not None:
            found.add(group)

    for direction in CLASSIFIED_DIRECTIONS:
        text = row[f"{direction}Classifications"] or ""
        for _percent, _code, _modifier, label in CLASSIFICATION_RE.findall(text):
            group = COVER_LOOKUP.get(label.split(",")[0].strip())
            if group is not None:
                found.add(group)

    return sorted(found)


def primary_cover_group(row: sqlite3.Row) -> int:
    """The one group that best represents the site, or -1 if unclassified.

    Used to colour the map. The site-level MUC code wins where it exists;
    otherwise the largest share recorded in any direction. `cover_groups_for`
    stays the basis for filtering, since a site legitimately matches several.
    """
    description = (row["MucDescription"] or "").strip()
    if description:
        group = COVER_LOOKUP.get(description.split(",")[0].strip())
        if group is not None:
            return group

    best_group = -1
    best_percent = -1
    for direction in CLASSIFIED_DIRECTIONS:
        text = row[f"{direction}Classifications"] or ""
        for percent, _code, _modifier, label in CLASSIFICATION_RE.findall(text):
            group = COVER_LOOKUP.get(label.split(",")[0].strip())
            if group is not None and int(percent) > best_percent:
                best_group = group
                best_percent = int(percent)
    return best_group


def day_index(measured_date: str) -> int:
    year, month, day = (int(part) for part in measured_date.split("-"))
    return (date(year, month, day) - EPOCH).days


def write_json(path: str, payload, indent: int | None = None) -> int:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    text = json.dumps(payload, separators=(",", ":"), indent=indent, ensure_ascii=False)
    with open(path, "w", encoding="utf-8") as handle:
        handle.write(text)
    return len(text.encode("utf-8"))


# --------------------------------------------------------------------------
# Build
# --------------------------------------------------------------------------


def main() -> None:
    if not os.path.exists(GPKG):
        sys.exit(f"missing {GPKG}")

    connection = sqlite3.connect(GPKG)
    connection.row_factory = sqlite3.Row

    columns = [
        info[1]
        for info in connection.execute(f"PRAGMA table_info('{TABLE}')")
        if info[1] not in ("fid", "geom")
    ]

    print("reading observations ...")
    rows = connection.execute(f'SELECT * FROM "{TABLE}" ORDER BY fid').fetchall()
    connection.close()
    print(f"  {len(rows)} observations, {len(columns)} attribute columns")

    print("building country table ...")
    ne50 = fetch_natural_earth(NE_50M, "ne_50m_admin_0_countries.geojson")
    by_iso: dict[str, list[dict]] = defaultdict(list)
    by_adm: dict[str, list[dict]] = defaultdict(list)
    for feature in ne50["features"]:
        properties = feature["properties"]
        if properties.get("iso_a3") and properties["iso_a3"] != "-99":
            by_iso[properties["iso_a3"]].append(feature)
        if properties.get("adm0_a3"):
            by_adm[properties["adm0_a3"]].append(feature)

    country_counts: Counter[str] = Counter()
    country_names: dict[str, str] = {}
    for row in rows:
        code = (row["CountryCode"] or "").strip()
        if code:
            country_counts[code] += 1
            country_names.setdefault(code, (row["CountryName"] or code).strip())

    countries = []
    for code in sorted(country_counts, key=lambda c: (-country_counts[c], c)):
        features = by_iso.get(code) or by_adm.get(code)
        countries.append(
            {
                "code": code,
                "name": country_names[code],
                "count": country_counts[code],
                "bbox": zoom_bbox(features) if features else None,
            }
        )
    unmatched = [c["code"] for c in countries if c["bbox"] is None]
    print(f"  {len(countries)} countries, {len(unmatched)} without a Natural Earth match")
    if unmatched:
        print(f"  unmatched: {unmatched}")

    country_index = {country["code"]: i for i, country in enumerate(countries)}

    print("building point index ...")
    fids, lons, lats, days, country_ids, covers, photo_counts = [], [], [], [], [], [], []
    primary_groups: list[int] = []
    calendar: Counter[int] = Counter()

    for row in rows:
        lon, lat = decode_point(row["geom"])
        day = day_index(row["MeasuredDate"])
        fids.append(row["fid"])
        lons.append(round(lon, 5))
        lats.append(round(lat, 5))
        days.append(day)
        # 255 marks the 32 observations with no country code.
        country_ids.append(country_index.get((row["CountryCode"] or "").strip(), 255))
        covers.append(cover_groups_for(row))
        primary_groups.append(primary_cover_group(row))
        photo_counts.append(
            sum(1 for d in DIRECTIONS if photo_url(row[f"{d}PhotoUrl"]) is not None)
        )
        calendar[day] += 1

    print("writing observation shards ...")
    os.makedirs(os.path.join(OUT, "obs"), exist_ok=True)
    shard_bytes = 0
    shard_count = 0
    for start in range(0, len(rows), SHARD):
        chunk = rows[start:start + SHARD]
        records = []
        for row in chunk:
            lon, lat = decode_point(row["geom"])
            record = {"fid": row["fid"], "lon": round(lon, 6), "lat": round(lat, 6)}
            for column in columns:
                value = row[column]
                if value is None:
                    continue
                if isinstance(value, str):
                    value = value.strip()
                    if not value:
                        continue
                record[column] = value
            records.append(record)
        path = os.path.join(OUT, "obs", f"{start // SHARD:04d}.json")
        shard_bytes += write_json(path, records)
        shard_count += 1

    meta = {
        "generated": date.today().isoformat(),
        "source": "GLOBE Land Cover (globe_land_cover.gpkg)",
        "protocol": "land_covers",
        "total": len(rows),
        "shardSize": SHARD,
        "shardCount": shard_count,
        "epoch": EPOCH.isoformat(),
        "dayRange": [min(days), max(days)],
        "dateRange": [
            min(row["MeasuredDate"] for row in rows),
            max(row["MeasuredDate"] for row in rows),
        ],
        "coverGroups": COVER_GROUPS,
        "coverCounts": {
            str(group["id"]): sum(1 for c in covers if group["id"] in c)
            for group in COVER_GROUPS
        },
        "unclassified": sum(1 for c in covers if not c),
        "withPhotos": sum(1 for count in photo_counts if count > 0),
        "withoutPhotos": sum(1 for count in photo_counts if count == 0),
        "columns": columns,
        "attribution": {
            "basemap": "© OpenStreetMap contributors © CARTO",
            "boundaries": "Natural Earth (public domain)",
            "imagery": "Microsoft Planetary Computer",
            "observations": "NASA GLOBE Program",
        },
    }

    sizes = {
        "meta.json": write_json(os.path.join(OUT, "meta.json"), meta, indent=2),
        "countries.json": write_json(os.path.join(OUT, "countries.json"), countries),
        "points.json": write_json(
            os.path.join(OUT, "points.json"),
            {
                "fid": fids,
                "lon": lons,
                "lat": lats,
                "d": days,
                "cc": country_ids,
                "lc": covers,
                "pg": primary_groups,
                "pc": photo_counts,
            },
        ),
        "calendar.json": write_json(
            os.path.join(OUT, "calendar.json"),
            [[day, calendar[day]] for day in sorted(calendar)],
        ),
        "outlines.json": write_json(os.path.join(OUT, "outlines.json"), build_outlines()),
    }

    print("\nwrote public/data:")
    for name, size in sizes.items():
        print(f"  {name:16s} {size / 1024:8.1f} KB")
    print(f"  obs/*.json       {shard_bytes / 1024 / 1024:8.1f} MB in {shard_count} shards")
    print(f"\n  cover groups: {meta['coverCounts']}")
    print(f"  unclassified: {meta['unclassified']}  |  no photos: {meta['withoutPhotos']}")


if __name__ == "__main__":
    main()
