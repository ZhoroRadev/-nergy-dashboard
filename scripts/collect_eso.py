
#!/usr/bin/env python3
"""Collect real Bulgarian electricity system load from ESO."""

import datetime as dt
import json
import pathlib
import sys
import urllib.request
from zoneinfo import ZoneInfo

ROOT = pathlib.Path(__file__).resolve().parents[1]
URL = "https://www.eso.bg/api/last24load.json.php"
OUT = ROOT / "data" / "eso.json"
SOFIA = ZoneInfo("Europe/Sofia")


def normalize_load(payload):
    """Convert ESO [Unix milliseconds, MW] pairs to dashboard format."""
    if isinstance(payload, dict):
        for key in ("load_mw", "data", "values"):
            if isinstance(payload.get(key), list):
                payload = payload[key]
                break

    if not isinstance(payload, list):
        return []

    result = []
    now = dt.datetime.now(dt.timezone.utc)

    for item in payload:
        try:
            if isinstance(item, list) and len(item) == 2:
                timestamp, value = item
                timestamp = dt.datetime.fromtimestamp(
                    float(timestamp) / 1000,
                    tz=dt.timezone.utc
                )
            elif isinstance(item, dict):
                raw_time = item.get(
                    "timestamp", item.get("datetime")
                )
                value = item.get(
                    "value", item.get("load_mw")
                )

                if isinstance(raw_time, (int, float)):
                    timestamp = dt.datetime.fromtimestamp(
                        raw_time / 1000, tz=dt.timezone.utc
                    )
                else:
                    timestamp = dt.datetime.fromisoformat(
                        str(raw_time).replace("Z", "+00:00")
                    )
                    if timestamp.tzinfo is None:
                        timestamp = timestamp.replace(
                            tzinfo=SOFIA
                        )
                    timestamp = timestamp.astimezone(
                        dt.timezone.utc
                    )
            else:
                continue

            value = float(value)

            if not 0 <= value <= 15000:
                continue

            if not (
                now - dt.timedelta(hours=48)
                <= timestamp
                <= now + dt.timedelta(minutes=15)
            ):
                continue

            local_time = timestamp.astimezone(SOFIA)

            result.append({
                "timestamp": local_time.isoformat(
                    timespec="seconds"
                ),
                "value": value
            })

        except (ValueError, TypeError, OverflowError, OSError):
            continue

    return sorted(result, key=lambda x: x["timestamp"])


def main():
    request = urllib.request.Request(
        URL,
        headers={
            "User-Agent": "EnergyIntelDashboard/1.1",
            "Accept": "application/json"
        }
    )

    try:
        with urllib.request.urlopen(
            request, timeout=30
        ) as response:
            payload = json.load(response)

        load = normalize_load(payload)

        if not load:
            raise ValueError(
                "ESO returned no valid recent load observations"
            )

        snapshot = {
            "source": URL,
            "fetched_at": dt.datetime.now(
                dt.timezone.utc
            ).isoformat(timespec="seconds"),
            "load_mw": load
        }

        OUT.parent.mkdir(parents=True, exist_ok=True)
        temporary = OUT.with_suffix(".tmp")

        temporary.write_text(
            json.dumps(
                snapshot,
                ensure_ascii=False,
                indent=2
            ) + "\n",
            encoding="utf-8"
        )

        temporary.replace(OUT)

        print(f"SUCCESS: {len(load)} ESO observations")
        print(f"Latest load: {load[-1]['value']} MW")
        print(f"Timestamp: {load[-1]['timestamp']}")

        return 0

    except Exception as error:
        print(f"ESO collector failed: {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
