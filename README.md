# Legacy Hub V10 — Team Invites & Onboarding

V10 adds secure, team-specific onboarding to the V9 Admin Control Centre.

## Team invite features
- Network Admin can generate an invite for any Legacy team
- Team Managers can generate invites only for their own team
- Configure maximum uses (1–500)
- Configure expiry (1, 7, 14, 30 or 60 days in the UI; backend supports up to 90)
- Copy a newly generated signup link
- View recent invite links with team, expiry and usage count
- Re-copy an existing invite
- Revoke an active invite immediately
- Invalid, expired, revoked or fully-used invites are rejected

## Invite signup flow
1. Admin selects a team and generates a link.
2. Creator opens `?invite=<secure-token>`.
3. Legacy Hub validates the token with Supabase.
4. Signup automatically switches to Create Account.
5. Team selection is locked to the invited team.
6. The secure invite token is sent with signup metadata.
7. Supabase's existing signup trigger assigns the user to that team.
8. The new account remains `pending` until approved by a Team Manager or Network Admin.

## Existing V9 admin features retained
- Pending creator approvals / activation
- Suspend and reactivate access
- Search and filter creators
- Network-wide team and role management for Network Admins
- Team-scoped management for Team Managers
- Normal Members/Supporters do not see Admin
- Preview Mode uses safe demo data

## Teams
- Bulletproof Armour Unit (BAU)
- Once Upon a Nightmare (OUN)
- Redbull Warriors (RW)

The Supabase project has already received the V10 invite RPC migration. The front end uses the public `resolve_team_invite` function for signup validation and authenticated admin RPCs for create/list/revoke operations.

## V11 – Announcements & Notifications
- Network Admins can publish network-wide or team announcements.
- Team Managers can publish only to their own team.
- Announcements support categories, pinning, optional expiry, and deletion.
- Members see an unread notification count and can mark individual/all announcements read.
- Read state is persisted in Supabase via `announcement_reads`.
- V11 backend migration has already been applied to the connected Supabase project.


## V12 – Battle Reminders
- Claimed battles now surface in-app reminders inside the Dashboard.
- A 24-hour reminder appears when a claimed battle is within 24 hours.
- The 1-hour reminder uses the requested wording:
  “Battle starts in 1 hour, please think about going live to build your room up.”
- Reminder read state is persisted in Supabase through `battle_reminder_reads`.
- This V12 build implements in-app reminders. Background push/email delivery can be added as a later deployment step.

## V13 – Interactive Matchmaking
- Creators can post “Find me an opponent” requests.
- Other creators can respond with “Offer to Battle”.
- Request owners receive an in-app offer notification and can securely accept it.
- Accepting an offer creates a confirmed battle and closes competing offers atomically.
- Creators can post availability with one or more formats (1/3/5/7 rounds).
- Available battles that overlap a creator’s posted availability generate matching alerts.
- Confirmed matches and accepted offers generate persistent in-app notifications.

## V14 – Battle Results & Performance
- Claimed creators/managers can submit battle results.
- Results support win/loss/draw/cancelled, rounds for/against, points, diamonds and notes.
- Creator submissions are pending until verified by a Team Manager or Network Admin.
- Manager/admin submissions are verified immediately.
- Verified results feed creator and team performance views.
- New Leaderboard area shows creator rankings and team standings.
- Pending results can be verified/rejected from the Leaderboard screen.

## V15 – Achievements & Monthly Awards
- New Trophy Room with persistent creator badges.
- Automatic monthly badges: First Blood, On a Roll, Untouchable, Battle Tested, LIVE Target Complete, Perfect 8/8, Double Shift.
- Members can refresh badge eligibility for any month.
- Monthly honours are stored historically rather than overwritten.
- Network Admin can finalise past-month awards.
- Automatic awards currently include Top Battler, Team MVP for each team, and LIVE Champion.
- Awards can only be finalised after the month has ended.
