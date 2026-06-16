""" 
US Census American Community Survey (ACS 5-year) integration.

Fetches demographic/economic statistics by ZIP Code Tabulation Area (ZCTA) for
the San Antonio service area and exposes them for the map heat-map feature.

The Census API requires a free API key (set CENSUS_API_KEY). Results are cached
in-process because ACS 5-year data only changes once a year.

Exposes:
  - get_heatmap() -> {year, stats:[{id,label,format,values:{zip:val},min,max}]}
  - STAT_IDS for tool validation
  - a Flask blueprint at /api/census/heatmap
"""

import os
import time

import requests
from flask import Blueprint, jsonify

ACS_YEAR = os.environ.get("CENSUS_ACS_YEAR", "2022")
ACS_BASE = "https://api.census.gov/data/{}/acs/acs5".format(ACS_YEAR)
CACHE_TTL = 24 * 3600  # ACS 5-year updates annually; a day is plenty

# Statistics are reported at the census TRACT level for Bexar County (San Antonio).
# Tracts nest in state+county, so we query by FIPS: Texas = 48, Bexar = 029.
STATE_FIPS = os.environ.get("CENSUS_STATE_FIPS", "48")
COUNTY_FIPS = os.environ.get("CENSUS_COUNTY_FIPS", "029")

# TIGERweb generalized tract geometry (ArcGIS GeoServices, layer 0 = Census Tracts).
TIGERWEB_TRACTS = (
    "https://tigerweb.geo.census.gov/arcgis/rest/services/"
    "TIGERweb/Tracts_Blocks/MapServer/0/query"
)

# Each stat maps to one ACS variable, or a ratio of two (numerator/denominator * 100).
STATS = [
    {"id": "population",        "label": "Total Population",          "format": "number",   "vars": ["B01003_001E"]},
    {"id": "median_income",     "label": "Median Household Income",   "format": "currency", "vars": ["B19013_001E"]},
    {"id": "per_capita_income", "label": "Per Capita Income",         "format": "currency", "vars": ["B19301_001E"]},
    {"id": "median_home_value", "label": "Median Home Value",         "format": "currency", "vars": ["B25077_001E"]},
    {"id": "median_age",        "label": "Median Age",                "format": "decimal",  "vars": ["B01002_001E"]},
    {"id": "poverty_rate",      "label": "Poverty Rate",              "format": "percent",  "vars": ["B17001_002E", "B17001_001E"], "ratio": True},
    {"id": "unemployment_rate", "label": "Unemployment Rate",         "format": "percent",  "vars": ["B23025_005E", "B23025_003E"], "ratio": True},
]

STAT_IDS = [s["id"] for s in STATS]

_cache = {"ts": 0, "data": None}


def _all_vars():
    seen = []
    for st in STATS:
        for v in st["vars"]:
            if v not in seen:
                seen.append(v)
    return seen


def _to_num(x):
    """Parse a Census value, treating its large-negative null annotations as None."""
    try:
        v = float(x)
    except (TypeError, ValueError):
        return None
    # ACS uses sentinels like -666666666 for "not available".
    if v <= -666666666:
        return None
    return v


def _fetch_acs_by_tract():
    """Fetch ACS variables for every tract in the county, keyed by 11-digit GEOID."""
    key = os.environ.get("CENSUS_API_KEY")
    if not key:
        raise RuntimeError("CENSUS_API_KEY is not configured on the server.")

    variables = _all_vars()
    params = {
        "get": "NAME," + ",".join(variables),
        "for": "tract:*",
        "in": "state:{} county:{}".format(STATE_FIPS, COUNTY_FIPS),
        "key": key,
    }
    resp = requests.get(ACS_BASE, params=params, timeout=30)
    resp.raise_for_status()
    rows = resp.json()

    header = rows[0]
    idx = {h: i for i, h in enumerate(header)}
    try:
        si, ci, ti = idx["state"], idx["county"], idx["tract"]
    except KeyError:
        raise RuntimeError("Unexpected Census response shape (no tract columns).")

    per_tract = {}
    for row in rows[1:]:
        geoid = row[si] + row[ci] + row[ti]  # e.g. 48 + 029 + 110100
        per_tract[geoid] = {v: _to_num(row[idx[v]]) for v in variables if v in idx}
    return per_tract


def _fetch_tract_geometry():
    """Fetch generalized tract polygons (GeoJSON) for the county from TIGERweb."""
    params = {
        "where": "STATE='{}' AND COUNTY='{}'".format(STATE_FIPS, COUNTY_FIPS),
        "outFields": "GEOID,BASENAME",
        "returnGeometry": "true",
        "maxAllowableOffset": "0.0008",  # generalize to keep the payload light
        "outSR": "4326",
        "f": "geojson",
    }
    resp = requests.get(TIGERWEB_TRACTS, params=params, timeout=30)
    resp.raise_for_status()
    gj = resp.json()
    # Trim properties to just what the map needs.
    for feat in gj.get("features", []):
        p = feat.get("properties", {}) or {}
        feat["properties"] = {"GEOID": p.get("GEOID"), "name": p.get("BASENAME")}
    return gj


def get_heatmap():
    """Combined tract stats + geometry. Cached for CACHE_TTL seconds."""
    now = time.time()
    if _cache["data"] and (now - _cache["ts"]) < CACHE_TTL:
        return _cache["data"]

    per_tract = _fetch_acs_by_tract()      # raises RuntimeError if no API key
    geojson = _fetch_tract_geometry()

    stats_out = []
    for st in STATS:
        values = {}
        for geoid, vmap in per_tract.items():
            if st.get("ratio"):
                num = vmap.get(st["vars"][0])
                den = vmap.get(st["vars"][1])
                val = (num / den * 100) if (num is not None and den) else None
            else:
                val = vmap.get(st["vars"][0])
            if val is not None:
                values[geoid] = round(val, 2)
        nums = list(values.values())
        stats_out.append({
            "id": st["id"],
            "label": st["label"],
            "format": st["format"],
            "values": values,
            "min": min(nums) if nums else 0,
            "max": max(nums) if nums else 0,
        })

    data = {"year": ACS_YEAR, "geography": "tract", "stats": stats_out, "geojson": geojson}
    _cache.update(ts=now, data=data)
    return data


def stat_label(stat_id):
    for st in STATS:
        if st["id"] == stat_id:
            return st["label"]
    return stat_id


def create_census_blueprint():
    bp = Blueprint("census", __name__)

    @bp.route("/heatmap", methods=["GET"])
    def heatmap():
        try:
            return jsonify(get_heatmap())
        except RuntimeError as e:
            # Misconfiguration (no key) — tell the client clearly.
            return jsonify({"error": str(e), "stats": []}), 503
        except Exception as e:
            print("census heatmap error:", e)
            return jsonify({"error": "Failed to fetch Census data.", "stats": []}), 502

    return bp
