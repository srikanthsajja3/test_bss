# OneBSS Partner Portal (React + Vite + TypeScript)

A modern, responsive web application for managing broadband & IPTV partners via the **OneBSS API** (`https://demo.onebss.in/b_bss/`).

Built with:
- **React 19**
- **Vite 8**
- **TypeScript**
- **Tailwind CSS v4**
- **Lucide Icons**

---

## 🚀 Getting Started

### 1. Installation
Navigate to the project directory:
```bash
cd onebss-portal
npm install
```

### 2. Run the Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 📡 API Integration & Proxy Configuration

To prevent browser CORS (Cross-Origin Resource Sharing) restrictions when calling `https://demo.onebss.in` from `localhost`, Vite is configured with an integrated reverse proxy:

```ts
// vite.config.ts
server: {
  port: 3000,
  proxy: {
    '/b_bss': {
      target: 'https://demo.onebss.in',
      changeOrigin: true,
      secure: false,
    },
  },
}
```

You can toggle between the **Vite Dev Proxy** (`/b_bss`) and **Direct Cloud API** (`https://demo.onebss.in/b_bss`) at runtime from the **API Configuration** modal in the top navigation bar.

---

## 📑 Implemented Endpoints & Features

| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/b_bss/login.php` | `POST` | Authenticates user credentials and stores JWT Bearer token |
| `/b_bss/partner.php?role={role}` | `GET` | Fetches partners filtered by role (`operator` or `admin`) |
| `/b_bss/partner.php?id={id}` | `GET` | Fetches full partner record and RADIUS/IPTV configs by ID |
| `/b_bss/partner.php` | `POST` | Registers a new partner with login credentials and integrations |
| `/b_bss/partner.php?id={id}` | `PUT` | Updates partner details and mapping configurations |
| `/b_bss/internet_plan_sync.php?partner_id={id}` | `POST` | Triggers catalog sync from operator RADIUS server |
| `/b_bss/internet_plan_mapping.php?partner_id={id}` | `GET` | Fetches internet plans and sub-plans with mapping status |
| `/b_bss/internet_plan_mapping.php` | `POST` | Maps selected internet sub-plans with custom offer prices |
| `/b_bss/iptv_plan_sync.php?partner_id={id}` | `POST` | Triggers catalog sync from operator IPTV provider |
| `/b_bss/iptv_plan_mapping.php?partner_id={id}` | `GET` | Fetches IPTV plans, channel bouquets, and mapping status |
| `/b_bss/iptv_plan_mapping.php` | `POST` | Maps selected IPTV plans and bouquets with custom offer prices |

### Key Features:
1. **Interactive Authentication**:
   - Includes 1-click **"Fill Demo Credentials"** button (`onebss` / `onebss`)
   - Decodes JWT claims (role, partner ID, expiry) and manages token state
2. **Partner Directory & Filters**:
   - Filter by **Operators**, **Admins**, or **All**
   - Real-time search across names, phone numbers, emails, and regions
   - Metrics cards showing total count, active roles, and enabled status
   - Direct lookup by Partner ID (`GET /b_bss/partner.php?id={id}`)
3. **Partner Registration & Updates**:
   - Comprehensive multi-section form (General, Login Credentials, RADIUS mapping, IPTV mapping)
   - 1-click **"Doc Sample"** button to auto-fill sample data from the documentation (`Sai Ram Cable Network`)
4. **Internet & IPTV Plan Mapping**:
   - Dedicated modal with tabbed views for Internet Plans (RADIUS) and IPTV Plans
   - 1-click **Catalog Sync** with live feedback on added/skipped plans
   - Filter by Mapped / Unmapped / All and search by name/type
   - Custom offer pricing adjustments and batch saving
5. **Live API Inspector & cURL Generator**:
   - Built-in live terminal / drawer that logs every outgoing request and response
   - Displays real status codes, latency in ms, and request/response JSON
   - Copy exact cURL commands matching the API specification

---

## 🛠️ Build for Production

```bash
npm run build
```
Production assets are generated in `dist/`.
