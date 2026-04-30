"""
routes/reports.py - Administrative reports (JSON).

Only code requirements: provides report endpoints; does not generate docs/manuals.
"""

from __future__ import annotations

from flask import Blueprint, jsonify

from security import require_admin
from odoo_client import jsonrpc_call


reports_bp = Blueprint("reports", __name__)


@reports_bp.route("/donations/summary", methods=["GET"])
@require_admin
def donations_summary():
    """
    Admin report: aggregate donation campaigns and total confirmed donations.
    """
    try:
        campaigns_open = int(
            jsonrpc_call(
                "x.emergelens.donation.request",
                "search_count",
                [[["x_state", "=", "open"]]],
            )
            or 0
        )
        campaigns_done = int(
            jsonrpc_call(
                "x.emergelens.donation.request",
                "search_count",
                [[["x_state", "=", "done"]]],
            )
            or 0
        )
        total_confirmed = jsonrpc_call(
            "x.emergelens.donation",
            "read_group",
            [[["x_state", "=", "confirmed"]]],
            {"fields": ["x_amount:sum"], "groupby": []},
        )
        total_amount = 0
        if isinstance(total_confirmed, list) and total_confirmed:
            total_amount = float(total_confirmed[0].get("x_amount_sum") or 0)

        top = jsonrpc_call(
            "x.emergelens.donation.request",
            "search_read",
            [[["x_state", "in", ["open", "done"]]]],
            {
                "fields": ["id", "x_name", "x_goal_amount", "x_total_received", "x_donations_count"],
                "order": "x_total_received desc",
                "limit": 5,
            },
        )

        return jsonify(
            {
                "ok": True,
                "campaigns": {"open": campaigns_open, "done": campaigns_done},
                "donations_total_amount": total_amount,
                "top_campaigns": [
                    {
                        "id": c.get("id"),
                        "title": c.get("x_name") or "",
                        "goal": c.get("x_goal_amount") or 0,
                        "raised": c.get("x_total_received") or 0,
                        "donations": c.get("x_donations_count") or 0,
                    }
                    for c in (top or [])
                ],
            }
        )
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500

