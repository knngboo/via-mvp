"""
GTFS-realtime integration.

Parses the bundled protobuf feeds in google_transit/ (vehicle positions and
service alerts) using the schema in gtfs-realtime.proto, via the compiled
google.transit.gtfs_realtime_pb2 bindings.

If a live feed URL is configured (VIA_VEHICLE_POSITIONS_URL / VIA_ALERTS_URL),
that is fetched instead and the bundled .pb is used only as a fallback — so the
same code path serves a real-time feed in production and the snapshot in dev.

Exposes:
  - get_vehicle_positions() / get_service_alerts() — used by Buffi's map tools
  - vehicles_as_map_points() — converts vehicles to MapView's point format
  - a Flask blueprint at /api/realtime/{vehicles,alerts} for direct frontend use
"""

import glob
import os

import requests
from flask import Blueprint, jsonify

from google.transit import gtfs_realtime_pb2

GTFS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "google_transit")
VIA_RED = "#CB2128"


def _load_feed(url_env, file_glob):
    """Return a parsed FeedMessage from a live URL (if configured) or a bundled .pb."""
    data = None

    url = os.environ.get(url_env)
    if url:
        try:
            resp = requests.get(url, timeout=10)
            resp.raise_for_status()
            data = resp.content
        except Exception as e:  # fall back to the bundled snapshot
            print("realtime: live fetch from {} failed ({}); using bundled feed".format(url_env, e))

    if data is None:
        matches = sorted(glob.glob(os.path.join(GTFS_DIR, file_glob)))
        if not matches:
            return None
        with open(matches[0], "rb") as fh:
            data = fh.read()

    feed = gtfs_realtime_pb2.FeedMessage()
    feed.ParseFromString(data)
    return feed


def _translated(translated_string):
    """Pull the first translation out of a GTFS-realtime TranslatedString."""
    try:
        if translated_string and translated_string.translation:
            return translated_string.translation[0].text
    except Exception:
        pass
    return ""


def get_vehicle_positions(limit=1000):
    """Live vehicle positions: list of {id, route_id, trip_id, latitude, longitude, ...}."""
    feed = _load_feed("VIA_VEHICLE_POSITIONS_URL", "vehiclepositions*.pb")
    if feed is None:
        return []

    out = []
    for ent in feed.entity:
        if not ent.HasField("vehicle"):
            continue
        v = ent.vehicle
        if not v.HasField("position"):
            continue
        pos = v.position
        out.append({
            "id": (v.vehicle.id or ent.id) if v.HasField("vehicle") else ent.id,
            "label": v.vehicle.label if v.HasField("vehicle") else "",
            "route_id": v.trip.route_id if v.HasField("trip") else "",
            "trip_id": v.trip.trip_id if v.HasField("trip") else "",
            "latitude": pos.latitude,
            "longitude": pos.longitude,
            "bearing": pos.bearing if pos.HasField("bearing") else None,
            "speed": pos.speed if pos.HasField("speed") else None,
            "timestamp": v.timestamp or feed.header.timestamp,
        })
        if len(out) >= limit:
            break
    return out


def get_service_alerts(limit=100):
    """Active service alerts: list of {id, header, description, routes, stops}."""
    feed = _load_feed("VIA_ALERTS_URL", "alerts*.pb")
    if feed is None:
        return []

    out = []
    for ent in feed.entity:
        if not ent.HasField("alert"):
            continue
        a = ent.alert
        routes, stops = [], []
        for ie in a.informed_entity:
            if ie.route_id:
                routes.append(ie.route_id)
            if ie.stop_id:
                stops.append(ie.stop_id)
        out.append({
            "id": ent.id,
            "header": _translated(a.header_text),
            "description": _translated(a.description_text),
            "routes": sorted(set(routes)),
            "stops": sorted(set(stops)),
        })
        if len(out) >= limit:
            break
    return out


def vehicles_as_map_points(vehicles):
    """Convert vehicle dicts into MapView's highlightData point format."""
    points = []
    for v in vehicles:
        lat, lon = v.get("latitude"), v.get("longitude")
        if lat is None or lon is None:
            continue
        route = v.get("route_id") or "?"
        points.append({
            "Latitude": lat,
            "Longitude": lon,
            "name": "Route {} • Bus {}".format(route, v.get("label") or v.get("id") or ""),
            "route_id": route,
            "vehicle_id": v.get("id"),
            "bearing": v.get("bearing"),
            "color": VIA_RED,
            "marker_radius": 6,
        })
    return points


def create_realtime_blueprint():
    bp = Blueprint("realtime", __name__)

    @bp.route("/vehicles", methods=["GET"])
    def vehicles():
        try:
            data = get_vehicle_positions()
            return jsonify({"count": len(data), "vehicles": data})
        except Exception as e:
            print("realtime vehicles error:", e)
            return jsonify({"count": 0, "vehicles": []})

    @bp.route("/alerts", methods=["GET"])
    def alerts():
        try:
            data = get_service_alerts()
            return jsonify({"count": len(data), "alerts": data})
        except Exception as e:
            print("realtime alerts error:", e)
            return jsonify({"count": 0, "alerts": []})

    return bp
