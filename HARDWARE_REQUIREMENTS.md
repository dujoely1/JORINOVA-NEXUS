# JORINOVA NEXUS ALIS-X — Hardware & Connectivity Requirements

What to install in the lab and **how each device connects** (LAN / WiFi / cable / Ethernet / serial / USB).
The system is **offline-first**: the core LIS runs on your **local network** even with no internet;
internet is only needed for cloud AI enrichment, SMS/email, and cloud sync.

---

## 0. Network backbone (install first)
| Item | Requirement | Connection |
|---|---|---|
| **ALIS-X server** (this system) | The machine/VM running the backend + database | Wired **Ethernet** to the switch (static IP recommended) |
| **Managed LAN switch** | Enough ports for all wired devices | — |
| **WiFi Access Point** | For tablets/phones + wireless sensors | WiFi (WPA2/WPA3) on the same subnet |
| **Internet (optional)** | Fiber / 4G / **Satellite (Starlink)** | Only for cloud AI, SMS/email, sync |
| **UPS** | Keep server + fridges alive during power cuts | Power |

> 🇷🇼 Ibikoresho byose bikwiye kuba kuri **network imwe (LAN)** na server ya ALIS-X.
> Wired (Ethernet) ni byiza ku bikoresho bikomeye; WiFi ku tablet/telefoni/sensors.

---

## 1. Laboratory analysers (Hematology, Chemistry, Immuno, Coag, etc.)
The system ingests results via **HL7 v2 / ASTM (LIS2-A2) / FHIR / JSON / CSV** (see `ai_services/iot_adapters`).

| Analyser interface | How to connect | Notes |
|---|---|---|
| **Ethernet / LAN (TCP-IP)** ✅ preferred | Straight cable to the switch, HL7/ASTM over TCP | Sysmex XN, Cobas, most modern analysers |
| **RS-232 Serial (older analysers)** | Serial cable → **Serial-to-Ethernet converter** (e.g., Moxa) → LAN | Or a small middleware PC per analyser |
| **USB** | USB to a connected workstation that forwards to ALIS-X | For bench devices with USB export |
| **Manual / Barcode entry** | Keyboard-wedge **USB/Bluetooth barcode scanner** | For analysers with no digital interface |

**Requirements per analyser:** fixed IP or hostname, the protocol (HL7/ASTM/FHIR), port, and the department it belongs to. Bidirectional (LIS→analyser worklist) needs the analyser's LIS/HL7 option enabled.

---

## 2. Cold chain — Fridges, Freezers, Incubators (IoT temperature)
Each cold-chain unit needs a **temperature sensor/probe** that posts readings to ALIS-X.

| Unit | Typical range | Sensor connection |
|---|---|---|
| **Refrigerator** (Blood Bank, reagents) | **2 – 8 °C** | WiFi / Ethernet IoT temp logger, or LoRaWAN, or Modbus over RS-485 → gateway |
| **Freezer** | **−20 °C** (or −40) | Same options; probe rated for low temp |
| **Ultra-low freezer** | **−70 to −80 °C** | Low-temp probe + gateway |
| **Incubator** (Micro) | **35 – 37 °C** | WiFi/Ethernet temp+humidity sensor |

**Connectivity options for sensors:**
- **WiFi** IoT loggers → post readings to ALIS-X (easiest; needs WiFi coverage).
- **Ethernet** loggers → wired to the switch (most reliable).
- **LoRaWAN / Zigbee** → a gateway on the LAN aggregates many sensors (good for large sites).
- **Modbus RS-485** → a Modbus→IP gateway.

**Requirements per unit:** name, location/department, **min/max temp thresholds**, and whether it has an IoT sensor (the install wizard captures exactly these). Alerts fire when a reading leaves the min–max band.

---

## 3. Printers & scanners
| Device | Use | Connection |
|---|---|---|
| **Label printer** (Zebra ZPL) | Sample/barcode labels | **Network (Ethernet/WiFi)** or USB |
| **A4 printer** (HP LaserJet…) | Reports, invoices | Network or USB |
| **Barcode/QR scanner** | Patient/sample ID, analyser entry | **USB (keyboard-wedge)** or **Bluetooth** |

---

## 4. Client devices
- **Workstations** (reception, benches): any modern PC, wired Ethernet, Chrome/Edge browser.
- **Tablets / phones** (ward rounds, phlebotomy): WiFi on the lab subnet; the app is an **installable PWA** (Add to Home screen → works offline).

---

## Connectivity summary
| Device | Best connection | Fallback | Protocol |
|---|---|---|---|
| Analyser (modern) | Ethernet/LAN | Serial→Ethernet | HL7 / ASTM / FHIR |
| Analyser (old) | RS-232 serial + converter | Manual/barcode | ASTM |
| Fridge/Freezer/Incubator | Ethernet IoT | WiFi / LoRa / Modbus | IoT POST |
| Label/A4 printer | Network | USB | IPP/ZPL |
| Barcode scanner | USB | Bluetooth | keyboard-wedge |
| Tablet/phone | WiFi | — | HTTPS (PWA) |
| ALIS-X server | Ethernet (static IP) | — | — |

> ✅ Rule of thumb: **wired Ethernet for anything critical/high-throughput** (server, analysers, printers, fridges); **WiFi for mobile + wireless sensors**. Keep everything on **one LAN/subnet** as the ALIS-X server.

You configure all of this in the installer **Step 5 — Hardware Setup** (analysers, cold-chain devices, printers), or later under **Settings / Connectivity**.
