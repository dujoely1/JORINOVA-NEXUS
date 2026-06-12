# AI BUILD PROMPT — JORINOVA NEXUS Staff Mobile Hub (cross‑platform app)

Copy everything below the line into your AI coding agent (Claude Code, Cursor,
etc.). It is a complete, self‑contained brief. The **backend already exists and
is live** — you are building only the mobile client against its REST API.

> Pick ONE stack on the first line and delete the other before you start.

---

## ROLE & GOAL
You are a senior mobile engineer. Build the **JORINOVA NEXUS Staff Mobile Hub**,
a secure companion app for a hospital‑laboratory system used in Rwanda. It must
run from **one codebase** on **Android phones, iPhones, and tablets** (responsive
layouts for large screens).

**Stack (choose one, delete the other):**
- **Flutter (Dart)** — recommended. Use Riverpod, Dio, drift (SQLCipher), camera, geolocator, firebase_messaging, flutter_secure_storage.
- **React Native + Expo (TypeScript)** — if the team prefers React. Use expo-router, TanStack Query, expo-camera, expo-location, expo-secure-store, expo-sqlite, expo-notifications.

The app is a **field extension** of the web system: it captures photos, lets
staff self‑serve (leave, inventory, field work), and **works offline**, syncing
when connectivity returns (satellite/4G friendly).

## BACKEND CONTRACT (already built — do NOT change the server)
- Base URL: configurable; must be **HTTPS**. Example: `https://<pilot-host>/api/v1/`
- Auth: `POST auth/token` (form‑urlencoded `username`, `password`, `grant_type=password`) → `{ access_token, role }`.
  Send `Authorization: Bearer <token>` on every other call.
- Send `X-Lang: en|fr|rw` on every call → the backend returns **localized error messages** (match the user's chosen language).
- Errors: non‑2xx returns `{ "detail": "<message already localized>" }`. Show `detail` to the user.

### Endpoints
| Purpose | Method & path | Body |
|---|---|---|
| Login | `POST auth/token` | form: username, password, grant_type |
| Register this device | `POST staff-mobile/devices/register` | `{device_id, device_name?, push_token?, platform}` |
| List devices (admin) | `GET staff-mobile/devices` | — |
| Approve device (admin) | `POST staff-mobile/devices/{id}/approve` | — |
| Leave request | `POST staff-mobile/leave-request` | `{leave_type, start_date, end_date, reason?, txn_id?}` |
| Inventory request | `POST staff-mobile/inventory-request` | `{item_name, item_code?, quantity, unit?, reason?, txn_id?}` |
| Field / GeoTrack report | `POST staff-mobile/field-activity` | `{activity_type, title?, notes?, latitude?, longitude?, photo_urls?, sample_data?, occurred_at?, txn_id?}` |
| List field activities | `GET staff-mobile/field-activities?limit=` | — |
| Check‑in / out | `POST staff-mobile/check-in` · `check-out` | `{latitude?, longitude?, note?, txn_id?}` |
| Notifications | `GET staff-mobile/notifications?unread_only=&limit=` | — |
| Patient photo | `POST staff-mobile/patient/{id}/photo` | multipart `file` |
| Staff photo | `POST staff-mobile/staff/{user_id}/photo` | multipart `file` |
| Offline batch flush | `POST staff-mobile/sync` | `{operations:[{op,payload}]}`, op ∈ leave\|inventory\|field\|check_in\|check_out |

## FEATURES TO BUILD
**A. Auth & device** — login, store JWT in OS secure storage, register the device
on first login, then **block all actions until an admin approves the device**
(poll `GET devices` for `is_approved`).

**B. Triggered photo capture** — from a push message ("capture request") OR a
button, open the camera, take a photo, upload to `patient/{id}/photo` or
`staff/{id}/photo`, show the linked record updated.

**C. Staff self‑service** — forms for: leave request, inventory/reagent request,
field‑mission request; a notifications inbox (poll `GET notifications`); check‑in
/ check‑out with optional GPS.

**D. Field work & GeoTrack** — create field reports with notes, photos, sample
data, and GPS coordinates; they appear on the web Surveillance → Field/GeoTrack
tab automatically.

**E. Offline sync (critical)** — every create works offline: write it to a local
encrypted DB with a **`txn_id` = UUID v4** generated on the device, queue it, and
flush via `POST sync` (or the individual endpoints) when online. The backend is
**idempotent per `txn_id`**, so retries never duplicate. Photos: store the file
locally (encrypted) and upload on reconnect. Show each item's status (queued /
synced / failed).

**F. Security** — HTTPS/TLS only (no cleartext); JWT + offline data in encrypted
storage (Keystore/Keychain); role‑based UI; audit‑friendly (every photo/action is
tied to the authenticated user by the backend).

## UX / SCREENS
Login → Device‑pending gate → Home (role‑aware tiles) → Camera capture · Leave ·
Inventory · Field report (map + GPS) · Notifications · Sync status. Tablet:
two‑pane layouts. Support **English, French, Kinyarwanda** (let the user pick;
send the choice as `X-Lang`).

## BUILD ORDER (milestones)
1. Project skeleton + secure HTTP client (base URL, Bearer + X‑Lang interceptors).
2. Login + secure token storage + device registration/approval gate.
3. Notifications inbox (read‑only) to prove the data path.
4. Local encrypted DB + offline queue + `txn_id` + SyncWorker/background task.
5. Leave + inventory forms (offline‑first).
6. Camera capture + photo upload (+ offline photo queue).
7. GPS + field/GeoTrack reports + check‑in/out.
8. Push (FCM/APNs) incl. the web→camera "capture request" trigger.
9. Tablet responsive polish + i18n (en/fr/rw).

## ACCEPTANCE CRITERIA
- Runs on Android phone, iPhone, and a 10" tablet from one codebase.
- Airplane‑mode test: create a leave request, an inventory request, a field
  report with a photo → all queue; re‑enable network → all sync, **no
  duplicates** even if you trigger sync twice.
- Wrong‑password login shows the localized `detail` (fr/rw) per the chosen language.
- A captured patient photo appears on that patient's web profile.
- All network calls are HTTPS and carry Bearer + X‑Lang.

## DELIVERABLES
Source repo, README (build/run for Android + iOS), a signed Android APK/AAB and
an iOS build, and a short test report against the acceptance criteria above.
