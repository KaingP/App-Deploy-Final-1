"""
Persist runtime state to a JSON file so the schedule, uploaded member data,
outside-shift config and incident log survive a server restart.

The state is one nested document (a schedule result contains its own member
lists), not relational data, so a single JSON file fits it better than SQLite.

Note on storage location: on ephemeral-disk hosts (Render free tier) this file
survives restarts and crashes but is wiped on redeploy. Point STATE_FILE at a
mounted volume if you need it to outlive deploys.
"""

import json
import os
import tempfile

STATE_FILE = os.getenv('STATE_FILE', 'state.json')

# Separator for flattening (day, slot) tuple keys into JSON object keys.
# Safe because no day name ("Thứ 2") or slot label ("7h - 9h") contains it.
SLOT_KEY_SEP = '|'

# Member fields keyed by (day, slot) tuples, which JSON cannot represent.
SLOT_KEYED_FIELDS = ('availability', 'committed_slots')


def encode_slot_keys(mapping):
    """Convert {(day, slot): value} into {"day|slot": value} for JSON."""
    return {f"{day}{SLOT_KEY_SEP}{slot}": value for (day, slot), value in mapping.items()}


def decode_slot_keys(mapping):
    """Convert {"day|slot": value} back into {(day, slot): value}."""
    decoded = {}
    for key, value in mapping.items():
        day, _, slot = key.partition(SLOT_KEY_SEP)
        decoded[(day, slot)] = value
    return decoded


def encode_member(member):
    """Return a JSON-safe copy of one member, flattening its tuple-keyed fields."""
    encoded = dict(member)
    for field in SLOT_KEYED_FIELDS:
        if isinstance(member.get(field), dict):
            encoded[field] = encode_slot_keys(member[field])
    return encoded


def decode_member(member):
    """Rebuild tuple-keyed fields on a member loaded from JSON."""
    decoded = dict(member)
    for field in SLOT_KEYED_FIELDS:
        if isinstance(member.get(field), dict):
            decoded[field] = decode_slot_keys(member[field])
    return decoded


def save_state(members=None, schedule=None, custom_ca_ngoai=None,
               enable_ca_ngoai=True, incident_logs=None, products=None, sales_logs=None):
    """
    Write current runtime state to STATE_FILE atomically.

    Returns True on success. Persistence is a convenience, not a hard
    requirement, so a failure here is reported but never raised into a request.
    """
    payload = {
        'version': 1,
        'enable_ca_ngoai': bool(enable_ca_ngoai),
        'custom_ca_ngoai': custom_ca_ngoai or [],
        'incident_logs': incident_logs or [],
        'schedule': schedule,
        'members': [encode_member(m) for m in (members or [])],
        'products': products or [],
        'sales_logs': sales_logs or []
    }

    target_dir = os.path.dirname(os.path.abspath(STATE_FILE))
    try:
        os.makedirs(target_dir, exist_ok=True)
        # Write to a temp file in the same directory, then rename, so a crash
        # mid-write cannot leave a truncated state file behind.
        fd, tmp_path = tempfile.mkstemp(dir=target_dir, suffix='.tmp')
        try:
            with os.fdopen(fd, 'w', encoding='utf-8') as f:
                json.dump(payload, f, ensure_ascii=False)
            os.replace(tmp_path, STATE_FILE)
        except BaseException:
            if os.path.exists(tmp_path):
                os.remove(tmp_path)
            raise
        return True
    except OSError as e:
        print(f"[state_store] Không lưu được trạng thái vào {STATE_FILE}: {e}")
        return False


def load_state():
    """
    Read STATE_FILE and return the stored state, or None if there is nothing
    usable. A corrupt or unreadable file is treated as absent so the app can
    still boot and rebuild from the bundled Excel files.
    """
    if not os.path.exists(STATE_FILE):
        return None

    try:
        with open(STATE_FILE, 'r', encoding='utf-8') as f:
            payload = json.load(f)
    except (OSError, json.JSONDecodeError) as e:
        print(f"[state_store] Trạng thái đã lưu không đọc được, bỏ qua ({e})")
        return None

    if not isinstance(payload, dict):
        print("[state_store] Trạng thái đã lưu sai định dạng, bỏ qua")
        return None

    return {
        'enable_ca_ngoai': payload.get('enable_ca_ngoai', True),
        'custom_ca_ngoai': payload.get('custom_ca_ngoai') or [],
        'incident_logs': payload.get('incident_logs') or [],
        'schedule': payload.get('schedule'),
        'members': [decode_member(m) for m in (payload.get('members') or [])],
        'products': payload.get('products') or [],
        'sales_logs': payload.get('sales_logs') or []
    }


def clear_state():
    """Delete the persisted state file. Used by tests and manual resets."""
    try:
        os.remove(STATE_FILE)
        return True
    except FileNotFoundError:
        return True
    except OSError as e:
        print(f"[state_store] Không xóa được {STATE_FILE}: {e}")
        return False
