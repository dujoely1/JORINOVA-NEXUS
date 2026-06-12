# JORINOVA NEXUS — Staff Mobile Hub (Android companion app)

Starter scaffold for the Android app that extends JORINOVA NEXUS to the field.
The **backend it talks to is already built and live** (`/api/v1/staff-mobile/*`).
This module is the **client**; open it in **Android Studio** and continue.

> This is a scaffold, not a finished app. It compiles the wiring (API client,
> secure token storage, offline sync worker, permissions) and one login screen.
> The UI screens (camera capture, leave/inventory forms, field reports) are
> stubbed with TODOs — a few weeks of work for an Android developer.

## Stack
- Kotlin + Jetpack Compose (UI)
- Retrofit + OkHttp (REST to the NEXUS backend)
- EncryptedSharedPreferences (secure JWT + offline data) — *encrypted on-device storage*
- WorkManager (offline queue flush → `POST /staff-mobile/sync`)
- CameraX (photo capture) · FusedLocationProvider (GPS) · Firebase Cloud Messaging (push + web→camera trigger)

## Backend endpoints already available (no server work needed)
| App action | Endpoint |
|---|---|
| Login | `POST /api/v1/auth/token` |
| Register device | `POST /api/v1/staff-mobile/devices/register` |
| Leave request | `POST /api/v1/staff-mobile/leave-request` |
| Inventory request | `POST /api/v1/staff-mobile/inventory-request` |
| Field activity (GPS, notes, photos) | `POST /api/v1/staff-mobile/field-activity` |
| Check-in / check-out | `POST /api/v1/staff-mobile/check-in` · `/check-out` |
| Notifications | `GET /api/v1/staff-mobile/notifications` |
| Patient / staff photo | `POST /api/v1/staff-mobile/patient/{id}/photo` · `/staff/{id}/photo` |
| Offline batch flush | `POST /api/v1/staff-mobile/sync` |

Every write accepts a `txn_id` (a UUID the app generates per queued item) so
retries never create duplicates — that is the offline-sync contract.

## Build
1. Install Android Studio (Giraffe+), JDK 17, Android SDK 34.
2. Open the `mobile/` folder.
3. Set the backend URL in `app/src/main/java/rw/jorinova/nexus/net/ApiClient.kt`
   (`BASE_URL`) to your tunnel/domain — must be **HTTPS** (camera + secure context).
4. Run on a device/emulator.

## What's left to implement (TODOs in code)
- [ ] Compose screens: Home, Leave form, Inventory form, Field report, Notifications.
- [ ] CameraX capture screen → upload via `uploadPhoto()`.
- [ ] Room DB for the offline queue + enqueue/flush in `SyncWorker`.
- [ ] FCM: receive the web→camera "capture request" data message → open camera.
- [ ] FusedLocationProvider → attach lat/lng to field activities.
- [ ] Device-approval gate (block actions until admin approves the device).

## Security
- JWT stored in EncryptedSharedPreferences (Android Keystore-backed).
- All traffic over HTTPS/TLS (enforced: cleartext disabled in the manifest).
- Device must be approved by an admin (`POST /staff-mobile/devices/{id}/approve`)
  before it can act.
