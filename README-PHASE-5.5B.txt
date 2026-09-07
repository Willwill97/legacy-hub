LEGACY HUB V27 — PHASE 5.5B
Always-On TikTok Battle Worker

WHAT IS NOW BUILT
- Production Supabase worker foundation + heartbeat table.
- Secure worker API Edge Function.
- Provider-agnostic Result Inbox hand-off.
- Node worker for TikTool Sandbox.
- Stable TikTool battleArmies completion logic:
  secsRemaining=0, status=2, wall-clock +30s, idle-gap 30s.
- Numeric TikTok host IDs are resolved to usernames so the worker can identify the creator's PK side.
- Team-battle members[] are supported.
- Each round uses matchId + sessionId as its external detection key.
- Hub Battles page shows worker status/heartbeat.

SANDBOX LIMIT
The current Legacy Hub backend is intentionally capped at 3 simultaneous watches.

IMPORTANT
The worker is deploy-ready but it is NOT running until it is placed on an always-running host
and given two environment secrets:
1) TIKTOOL_API_KEY
2) LEGACY_WORKER_TOKEN

Do not commit either secret to GitHub.
