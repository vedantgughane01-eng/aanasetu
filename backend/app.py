"""Annasetu Flask API. Demo-compatible API for the supplied static frontend."""
from datetime import datetime, timedelta, timezone
import hashlib
import os
import re
import time
from decimal import Decimal
from flask import Flask, jsonify, request
from flask_cors import CORS
from dotenv import load_dotenv
from db import connect

load_dotenv()
app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": ["http://127.0.0.1:5500", "http://localhost:5500", "http://127.0.0.1:8000", "http://localhost:8000", "null"]}})
CO2_PER_KG = float(os.getenv("CO2_PER_KG", "2.5"))
CATEGORIES = {"cooked": "Cooked meals", "packed": "Packed meals", "bakery": "Bakery", "sweets": "Sweets & desserts", "produce": "Fresh produce"}
FLOW = ["listed", "claimed", "enroute", "picked", "delivered"]
TRANSITIONS = {"listed": ["claimed", "expired"], "claimed": ["enroute", "picked", "expired"], "enroute": ["picked", "expired"], "picked": ["delivered"], "delivered": [], "expired": []}


def now_utc():
    return datetime.now(timezone.utc).replace(tzinfo=None)


def to_ms(value):
    if value is None: return None
    if value.tzinfo is None: value = value.replace(tzinfo=timezone.utc)
    return int(value.timestamp() * 1000)


def from_ms(value):
    return datetime.fromtimestamp(value / 1000, timezone.utc).replace(tzinfo=None)


def code_for(value):
    # A compact identifier for demo QR generation; it is not an authentication secret.
    return "AS-" + hashlib.sha256(value.encode()).hexdigest()[:6].upper()


def error(message, status=400):
    return jsonify({"ok": False, "msg": message, "error": message}), status


def event(cur, donation_id, status, actor, notes=None, at=None):
    cur.execute("INSERT INTO donation_events (donation_id,status,event_at,performed_by,notes) VALUES (%s,%s,%s,%s,%s)",
                (donation_id, status, at or now_utc(), actor, notes))


def partner_rows(cur, role=None):
    sql = "SELECT * FROM partners" + (" WHERE role=%s" if role else "") + " ORDER BY partner_id"
    cur.execute(sql, (role,) if role else ())
    rows = cur.fetchall()
    result = []
    for r in rows:
        x = dict(zip(cur.column_names, r))
        if x["role"] == "donor":
            result.append({"id": x["partner_id"], "name": x["name"], "type": x["partner_type"], "area": x["area"], "address": x["address"], "phone": x["phone"]})
        elif x["role"] == "ngo":
            result.append({"id": x["partner_id"], "name": x["name"], "area": x["area"], "address": x["address"], "capacity": x["capacity"], "phone": x["phone"]})
        else:
            result.append({"id": x["partner_id"], "name": x["name"], "vehicle": x["vehicle"], "ngoId": x["ngo_id"], "available": bool(x["available"])})
    return result


def donation_rows(cur):
    cur.execute("SELECT * FROM donations ORDER BY listed_at DESC, donation_id DESC")
    rows = [dict(zip(cur.column_names, r)) for r in cur.fetchall()]
    result = []
    for d in rows:
        cur.execute("SELECT status,event_at,performed_by FROM donation_events WHERE donation_id=%s ORDER BY event_at,event_id", (d["donation_id"],))
        log = [{"status": e[0], "at": to_ms(e[1]), "by": e[2]} for e in cur.fetchall()]
        result.append({"id": d["donation_id"], "code": d["qr_code"], "donorId": d["donor_id"], "ngoId": d["ngo_id"], "volunteerId": d["volunteer_id"],
            "food": {"name": d["food_name"], "category": d["category"], "veg": bool(d["vegetarian"])},
            "qty": {"meals": int(d["meals"]), "kg": float(d["weight_kg"])}, "listedAt": to_ms(d["listed_at"]), "expiresAt": to_ms(d["expires_at"]),
            "status": d["status"], "etaAt": to_ms(d["eta_at"]), "etaTotal": d["eta_total_ms"], "log": log})
    return result


def state_payload(cur):
    donors = partner_rows(cur, "donor")
    ngos = partner_rows(cur, "ngo")
    volunteers = partner_rows(cur, "volunteer")
    donations = donation_rows(cur)
    cur.execute("SELECT COUNT(*) FROM donations")
    seq = cur.fetchone()[0]
    return {"version": 3, "session": {"donorId": "D-001", "ngoId": "N-001"}, "donors": donors, "ngos": ngos, "volunteers": volunteers, "donations": donations, "seq": seq}


@app.get("/api/health")
def health():
    try:
        cn = connect(); cur = cn.cursor(); cur.execute("SELECT 1"); cur.fetchone(); cur.close(); cn.close()
        return jsonify({"ok": True, "service": "annasetu-api", "database": "connected"})
    except Exception as exc:
        app.logger.exception("Health check failed")
        return jsonify({"ok": False, "service": "annasetu-api", "database": "unavailable", "detail": str(exc)}), 503


@app.get("/api/bootstrap")
def bootstrap():
    try:
        cn = connect(); cur = cn.cursor(); data = state_payload(cur); cur.close(); cn.close()
        return jsonify({"ok": True, "state": data, "co2PerKg": CO2_PER_KG})
    except Exception:
        app.logger.exception("Bootstrap failed")
        return error("Could not load Annasetu data. Check MySQL setup and run database/seed.py.", 503)


@app.post("/api/donations")
def create_donation():
    data = request.get_json(silent=True) or {}
    donor_id = str(data.get("donorId", ""))
    name = str(data.get("name", "")).strip()
    category = str(data.get("category", ""))
    try:
        meals, kg, shelf = int(data.get("meals")), float(data.get("kg")), int(data.get("shelfMin"))
    except (TypeError, ValueError): return error("Meals, weight and safe-to-eat time must be valid numbers.")
    if not name or len(name) > 80: return error("Food name is required and must be 80 characters or fewer.")
    if category not in CATEGORIES: return error("Choose a valid food category.")
    if not 1 <= meals <= 5000: return error("Meals must be a whole number from 1 to 5000.")
    if not 0.5 <= kg <= 2000: return error("Weight must be between 0.5 and 2000 kg.")
    if not 10 <= shelf <= 720: return error("Safe-to-eat time must be 10 to 720 minutes.")
    try:
        cn = connect(); cur = cn.cursor(dictionary=True)
        cur.execute("SELECT name FROM partners WHERE partner_id=%s AND role='donor'", (donor_id,)); donor = cur.fetchone()
        if not donor: cn.rollback(); cur.close(); cn.close(); return error("Choose a valid donor.")
        now = now_utc(); cur.execute("SELECT COUNT(*) AS n FROM donations"); seq = cur.fetchone()["n"] + 1
        stamp = now.strftime("%y%m"); donation_id = f"DN-{stamp}-{seq:03d}"
        while True:
            code = code_for(donation_id + ("" if seq == 1 else str(seq)))
            cur.execute("SELECT 1 FROM donations WHERE donation_id=%s OR qr_code=%s", (donation_id, code))
            if not cur.fetchone(): break
            seq += 1; donation_id = f"DN-{stamp}-{seq:03d}"
        expires = now + timedelta(minutes=shelf)
        cur.execute("INSERT INTO donations(donation_id,qr_code,donor_id,food_name,category,vegetarian,meals,weight_kg,listed_at,expires_at,status) VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'listed')",
                    (donation_id, code, donor_id, name, category, bool(data.get("veg", True)), meals, kg, now, expires))
        event(cur, donation_id, "listed", donor["name"]); cn.commit()
        cur.close(); cn.close()
        return jsonify({"ok": True, "msg": "Donation listed. Show this QR to the NGO at pickup.", "id": donation_id}), 201
    except Exception:
        app.logger.exception("Create donation failed")
        return error("Could not create donation. Check server logs.", 500)


@app.post("/api/donations/<donation_id>/claim")
def claim_donation(donation_id):
    data = request.get_json(silent=True) or {}; ngo_id = str(data.get("ngoId", ""))
    try:
        cn = connect(); cur = cn.cursor(dictionary=True); cn.start_transaction()
        cur.execute("SELECT * FROM donations WHERE donation_id=%s FOR UPDATE", (donation_id,)); d = cur.fetchone()
        cur.execute("SELECT * FROM partners WHERE partner_id=%s AND role='ngo'", (ngo_id,)); ngo = cur.fetchone()
        if not d or not ngo: cn.rollback(); return error("Donation or NGO not found.", 404)
        if d["status"] != "listed": cn.rollback(); return error("This donation is no longer available.", 409)
        if d["expires_at"] <= now_utc(): cn.rollback(); return error("This donation has expired.", 409)
        cur.execute("SELECT COALESCE(SUM(meals),0) AS committed FROM donations WHERE ngo_id=%s AND status IN ('claimed','enroute','picked')", (ngo_id,)); committed = cur.fetchone()["committed"]
        if committed + d["meals"] > ngo["capacity"]: cn.rollback(); return error(f"{ngo['name']} can serve {ngo['capacity']} meals at a time and has {committed} committed. This needs {d['meals']}.", 409)
        cur.execute("UPDATE donations SET ngo_id=%s,status='claimed' WHERE donation_id=%s", (ngo_id, donation_id)); event(cur, donation_id, "claimed", ngo["name"]); cn.commit()
        cur.close(); cn.close(); return jsonify({"ok": True, "msg": f"Claimed by {ngo['name']}. Pickup QR is ready on the donor side."})
    except Exception:
        app.logger.exception("Claim failed"); return error("Could not claim donation.", 500)


@app.post("/api/donations/<donation_id>/dispatch")
def dispatch_donation(donation_id):
    data = request.get_json(silent=True) or {}; ngo_id = str(data.get("ngoId", ""))
    try:
        cn = connect(); cur = cn.cursor(dictionary=True); cn.start_transaction()
        cur.execute("SELECT * FROM donations WHERE donation_id=%s FOR UPDATE", (donation_id,)); d = cur.fetchone()
        if not d or d["status"] != "claimed" or d["ngo_id"] != ngo_id: cn.rollback(); return error("Only this NGO's claimed donations can be dispatched.", 409)
        cur.execute("SELECT p.* FROM partners p WHERE p.role='volunteer' AND p.ngo_id=%s AND p.available=1 AND p.partner_id NOT IN (SELECT volunteer_id FROM donations WHERE status='enroute' AND volunteer_id IS NOT NULL) ORDER BY p.partner_id LIMIT 1 FOR UPDATE", (ngo_id,)); v = cur.fetchone()
        if not v: cn.rollback(); return error("All your volunteers are on a trip. Try again soon.", 409)
        eta_ms = (6 + int(hashlib.sha256(donation_id.encode()).hexdigest()[:4], 16) % 9) * 60000; eta = now_utc() + timedelta(milliseconds=eta_ms)
        cur.execute("UPDATE donations SET volunteer_id=%s,status='enroute',eta_at=%s,eta_total_ms=%s WHERE donation_id=%s", (v["partner_id"], eta, eta_ms, donation_id)); event(cur, donation_id, "enroute", v["name"]); cn.commit()
        cur.close(); cn.close(); return jsonify({"ok": True, "msg": f"{v['name']} ({v['vehicle']}) is on the way to collect {d['food_name']}."})
    except Exception:
        app.logger.exception("Dispatch failed"); return error("Could not assign volunteer.", 500)


@app.post("/api/pickup/verify")
def verify_pickup():
    data = request.get_json(silent=True) or {}; code = str(data.get("code", "")).strip().upper(); ngo_id = str(data.get("ngoId", ""))
    if not code: return error("Enter or scan a code first.")
    try:
        cn = connect(); cur = cn.cursor(dictionary=True); cn.start_transaction()
        cur.execute("SELECT * FROM donations WHERE qr_code=%s FOR UPDATE", (code,)); d = cur.fetchone()
        cur.execute("SELECT name FROM partners WHERE partner_id=%s AND role='ngo'", (ngo_id,)); ngo = cur.fetchone()
        if not d or not ngo:
            if d: cur.execute("INSERT INTO pickup_verifications(donation_id,ngo_id,result,verified_at) VALUES(%s,%s,'failed',%s)", (d["donation_id"], ngo_id, now_utc()))
            cn.commit(); cur.close(); cn.close(); return error("Code not recognised or NGO not found.", 404)
        msg = None
        if d["status"] == "expired": msg = "This donation expired and cannot be collected."
        elif d["status"] == "listed": msg = "Claim this donation before scanning its QR."
        elif d["ngo_id"] != ngo_id:
            cur.execute("SELECT name FROM partners WHERE partner_id=%s", (d["ngo_id"],)); owner = cur.fetchone(); msg = f"This pickup belongs to {owner['name'] if owner else 'another NGO'}, not your NGO."
        elif d["status"] not in ("claimed", "enroute"): msg = f"Already {d['status']}. Nothing to change."
        if msg:
            cur.execute("INSERT INTO pickup_verifications(donation_id,ngo_id,result,verified_at) VALUES(%s,%s,'failed',%s)", (d["donation_id"], ngo_id, now_utc())); cn.commit(); cur.close(); cn.close(); return error(msg, 409)
        actor = d["volunteer_id"] or ngo_id
        cur.execute("SELECT name FROM partners WHERE partner_id=%s", (actor,)); actor_row = cur.fetchone(); actor_name = actor_row["name"] if actor_row else ngo["name"]
        cur.execute("UPDATE donations SET status='picked' WHERE donation_id=%s", (d["donation_id"],)); event(cur, d["donation_id"], "picked", actor_name)
        cur.execute("INSERT INTO pickup_verifications(donation_id,ngo_id,result,verified_at) VALUES(%s,%s,'success',%s)", (d["donation_id"], ngo_id, now_utc())); cn.commit()
        cur.close(); cn.close(); return jsonify({"ok": True, "msg": f"Verified. {d['food_name']} is now Picked up."})
    except Exception:
        app.logger.exception("Pickup verification failed"); return error("Could not verify pickup.", 500)


@app.post("/api/donations/<donation_id>/deliver")
def deliver_donation(donation_id):
    data = request.get_json(silent=True) or {}; ngo_id = str(data.get("ngoId", ""))
    try:
        cn = connect(); cur = cn.cursor(dictionary=True); cn.start_transaction()
        cur.execute("SELECT * FROM donations WHERE donation_id=%s FOR UPDATE", (donation_id,)); d = cur.fetchone()
        cur.execute("SELECT name FROM partners WHERE partner_id=%s AND role='ngo'", (ngo_id,)); ngo = cur.fetchone()
        if not d or not ngo or d["ngo_id"] != ngo_id: cn.rollback(); return error("Donation or NGO not found.", 404)
        if d["status"] != "picked": cn.rollback(); return error("Only picked-up donations can be delivered.", 409)
        cur.execute("UPDATE donations SET status='delivered' WHERE donation_id=%s", (donation_id,)); event(cur, donation_id, "delivered", ngo["name"]); cn.commit()
        cur.close(); cn.close(); return jsonify({"ok": True, "msg": "Delivery confirmed. Meals added to analytics."})
    except Exception:
        app.logger.exception("Delivery confirmation failed"); return error("Could not confirm delivery.", 500)


@app.post("/api/expire")
def expire_donations():
    try:
        cn = connect(); cur = cn.cursor(dictionary=True); now = now_utc()
        cur.execute("SELECT donation_id,donor_id FROM donations WHERE status IN ('listed','claimed','enroute') AND expires_at < %s", (now,)); rows = cur.fetchall()
        for d in rows:
            cur.execute("UPDATE donations SET status='expired' WHERE donation_id=%s", (d["donation_id"],)); event(cur, d["donation_id"], "expired", "System")
        cn.commit(); cur.close(); cn.close(); return jsonify({"ok": True, "expired": len(rows)})
    except Exception:
        app.logger.exception("Expiry sweep failed"); return error("Could not process expiry.", 500)


@app.post("/api/demo/reset")
def reset_demo():
    # Explicitly a local development/demo helper; never expose this route in a public deployment.
    try:
        from seed import seed_database
        seed_database(reset=True)
        return jsonify({"ok": True, "msg": "Demo data reset."})
    except Exception:
        app.logger.exception("Reset failed"); return error("Could not reset demo data.", 500)


if __name__ == "__main__":
    app.run(host=os.getenv("HOST", "127.0.0.1"), port=int(os.getenv("PORT", "5000")), debug=os.getenv("FLASK_DEBUG", "0") == "1")
