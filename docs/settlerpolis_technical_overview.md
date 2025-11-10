## Settlerpolis Technical Overview

### Purpose
This document introduces the Settlerpolis codebase for future Cursor agents. It describes the repository layout, explains how the shared simulation core (`@rugged/game`) connects the backend and frontend, and highlights key event flows, content pipelines, and runtime modes. Use it as a first-stop guide before diving into individual feature work.

---

### High-Level Architecture
- **Shared Simulation Core (`packages/game`)**  
	TypeScript library exporting `GameManager`, event definitions, and domain managers (players, inventory, NPCs, quests, scheduler, map, triggers, etc.). It is framework-agnostic and only depends on an `EventManager` adapter and content pack data.
- **Backend Adapter (`packages/backend`)**  
	Node/Express + Socket.IO service. Translates WebSocket traffic into the shared event bus contract, hosts the authoritative `GameManager`, and exposes REST endpoints for map JSON.
- **Frontend Adapter (`packages/frontend`)**  
	React + Phaser application. Runs either a local loop (client/server simulated in-memory) or connects to the backend over Socket.IO, rendering game state and UI layers.
- **Content Packs (`content/*`)**  
	TypeScript-defined quest/NPC/map/item data. Backend and frontend both import these packs to keep simulation deterministic and data-driven.

---

### Repository Layout (Top-Level)
- `docs/` – Planning documents (`settlers4_systems.md`, this overview).  
- `packages/game/` – Shared simulation library (`@rugged/game`).  
- `packages/backend/` – Express + Socket.IO server (`@rugged/backend`).  
- `packages/frontend/` – Vite-powered React/Phaser client (`@rugged/frontend`).  
- `content/` – Authoring packs (`debug`, `catch-the-rabbit`, etc.).  
- `vite/` – Environment-specific Vite configuration.  
- `railway.json`, `vercel.json` – Deployment metadata.  
- Root `package.json` – Defines npm workspaces and cross-package scripts.

---

### Package Deep Dives

**`@rugged/game` (`packages/game`)**
- Exports `GameManager`, all domain managers, event constants, and shared types.  
- Instantiation order of managers is carefully curated inside `GameManager` to satisfy cross-manager dependencies (e.g., `PlayersManager` depends on `InventoryManager`, `MapManager`, etc.).  
- `ContentLoader` loads maps, items, quests, NPCs, dialogues, cutscenes, flags, schedules, triggers, and affinity weights after `GameManager` boots.
- `Event` namespace wraps all event constant trees consumed by adapters. Managers emit and react to prefixed events (`cs:`, `sc:`, `ss:`) through the injected `EventManager`.

**`@rugged/backend` (`packages/backend`)**
- `src/index.ts` instantiates Express + Socket.IO, loads content pack (via `GAME_CONTENT` env), and spins up `GameManager`.  
- `NetworkManager` wraps Socket.IO and implements `EventManager`, handling groups, per-client timestamps, and bridging `Receiver` semantics.  
- `EventBusManager` resolves prefix semantics—routes client→server (`cs:`) events to registered handlers, emits server→client (`sc:`) responses through the network, and executes server→server (`ss:`) events locally.  
- Provides REST endpoints under `/api`, notably `/api/maps/:mapName.json` for frontend map fetches, using `BackendMapUrlService` to build URLs against the deployment host.

**`@rugged/frontend` (`packages/frontend`)**
- Bootstrapped by `main.tsx` ⇒ `App.tsx` ⇒ `PhaserGame` component.  
- `game/main.ts` configures Phaser and exposes `MultiplayerService` globally for scene access.  
- `MultiplayerService` listens on the shared `Event` namespace and forwards events between the Phaser/React `EventBus` and the active `EventManager` (local or networked).  
- `game/network/index.ts` chooses between `LocalManager` (offline simulation) and `NetworkManager` (Socket.IO).  
- `scripts/load-content.js` preloads content assets into `public/assets` and runs the shared map export script before Vite dev/build runs.

---

### Event System & Prefixes
- **`cs:` (Client → Server)**  
	UI interactions (movement, chat, building placement, etc.) emit `cs:` events. Backend `EventBusManager` subscribes and passes them to the shared managers.
- **`sc:` (Server → Client)**  
	Authoritative state changes are sent via `EventManager.emit` with `Receiver` targeting semantics. Frontend receives and forwards them to React/Phaser systems through `EventBus`.
- **`ss:` (Server ↔ Server)**  
	Internal backend events that never leave the server (e.g., scheduler ticks, AI decisions). Processed entirely inside `EventBusManager`.

`Receiver` enum controls audience targeting: `Sender`, `Group`, `NoSenderGroup`, `All`, `Client`. Backend `NetworkManager` uses Socket.IO rooms to model groups; frontend `LocalManager` mirrors the same semantics in-memory.

---

### Runtime Modes
- **Local Simulation**  
	Frontend creates paired `LocalEventManager` instances (`client` and `server`) to mimic backend behavior. Useful for offline development and automated testing.
- **Remote Multiplayer**  
	Frontend `NetworkManager` connects to backend Socket.IO path `/api/socket.io`. On connect it registers handlers for every shared event string and syncs group membership using `Event.Players.CS.Join` and related events.

Both modes rely on identical event payloads defined by the shared game package, keeping client/server logic consistent.

---

### Content Pipeline
1. **Authoring**: Define maps, NPCs, items, quests, triggers, etc. inside `content/<pack>/`.  
2. **Frontend Prep**: `scripts/load-content.js` copies pack assets into `public/assets` and runs `packages/game/scripts/export-maps.js` so Phaser can consume TMX/JSON content.  
3. **Backend Load**: On boot, backend resolves `GAME_CONTENT` to load the same pack. `ContentLoader` registers everything with managers and sets `defaultMap`.  
4. **Runtime Usage**: `MapManager` uses `MapUrlService` implementations (backend vs frontend) to load tilemaps from either `/api/maps/` or `/assets/maps/`.

Ensuring both adapters use the same pack keeps all gameplay deterministic across clients.

---

### Networking Flow (Remote Mode)
1. **Connection**  
	Frontend `NetworkManager.connect()` opens a Socket.IO connection, wraps it in `NetworkClient`, and starts heartbeats. Joined callbacks fire so systems can subscribe.
2. **Handshake**  
	Backend `NetworkManager` logs connection, associates the socket with a group (`GLOBAL` by default), and triggers joined lifecycle listeners.  
3. **Event Routing**  
	- Incoming `cs:` events reach backend `EventBusManager`, which proxies them to the relevant manager (e.g., `PlayersManager`).  
	- Server responses call `event.emit` with `Receiver.Group` or others, and `EventBusManager` routes them back through Socket.IO.  
	- Frontend `MultiplayerService` hears `sc:` events and re-emits them on the Phaser/React `EventBus`.
4. **Timeout Handling**  
	Backend `NetworkManager` tracks last message timestamps and disconnects inactive clients after 60s. `Receiver.Group` membership is updated on join/leave or transition.

---

### Typical Data Flow Examples

**Player Join (Remote)**
1. Frontend sends `cs:players.join`.  
2. Backend `EventBusManager` relays event to `PlayersManager`, which instantiates player state.  
3. `PlayersManager` emits `sc:players.joined` with initial spawn data.  
4. Frontend `MultiplayerService` forwards to `EventBus`; Phaser scene spawns player entity, React UI updates roster.

**Map Asset Request**
1. Frontend `MapManager` calls `FrontendMapUrlService.getMapUrl('map1')` ⇒ `/assets/maps/map1.json`.  
2. Backend `MapManager` uses `BackendMapUrlService` to respond with `/api/maps/map1.json`.  
3. Express handler reads `content/<pack>/maps/<map>.json` and responds with JSON payload.

**Construction Event (Planned)**
1. React UI emits `cs:buildings.place` with coordinates and building ID.  
2. Backend `BuildingManager` validates via `MapObjectsManager`; if accepted, emits `sc:buildings.started` to group.  
3. Clients visualize construction ghost/progress. Scheduler ticks eventually emit `sc:buildings.completed`.

---

### Environment & Configuration
- **Content Selection**  
	`GAME_CONTENT` env for backend; `VITE_GAME_CONTENT` for frontend. Defaults to `debug`.  
- **Scripts**  
	`npm run build:game/backend/frontend` to build individual packages. `npm run start:backend` boots the backend server (Socket.IO at `/api/socket.io`).  
- **Frontend Dev**  
	`npm run dev` (workspace) uses Vite config under `vite/config.dev.mjs`. `scripts/load-content.js` runs automatically (`predev`, `prebuild`).
- **Deployment**  
	Railway deployment expects backend server; Vercel config likely serves frontend static bundle.

Respect user rules during development: avoid `npm run dev` or `npm run start` misuse, keep JS files tab-indented, no semicolons (outside CSS), avoid ternaries in hooks, and ensure imports sit at top of files.

---

### Key Files & Snippets

```55:98:packages/backend/src/index.ts
const content: GameContent = require(path.join(contentPath, 'index.ts'))
// ...
const game = new GameManager(eventBus, content, mapUrlService)
```

```72:145:packages/backend/src/NetworkManager.ts
createNetworkClient(socket: Socket): EventClient {
	// ... existing code ...
}
```

```22:121:packages/backend/src/EventBusManager.ts
emit(to: Receiver, event: string, data: any, groupName?: string, originalClient?: EventClient): void {
	// ... existing code ...
}
```

```10:69:packages/frontend/src/game/network/index.ts
function getNetworkManager(): NetworkEventManager {
	// ... existing code ...
}
```

```47:111:packages/frontend/src/game/network/LocalManager.ts
	this.client = new LocalEventManager('client', (to, event, data, groupName) => {
	// ... existing code ...
```

```30:138:packages/frontend/src/game/network/NetworkManager.ts
	connect(onConnect: () => {}) {
	// ... existing code ...
```

```33:124:packages/game/src/ContentLoader/index.ts
	private async loadMaps() {
	// ... existing code ...
}
```

Use these snippets as anchors when exploring the codebase; they illustrate how adapters plug into shared systems.

---

### Recommended First Steps for New Contributors
1. **Read this document** to internalize architecture.  
2. **Spin up local simulation** (frontend-only) to test UI/gameplay changes.  
3. **Inspect `content/debug`** to understand current gameplay data definitions.  
4. **Trace an event** (e.g., player movement) from frontend UI → `cs:` emission → backend manager → `sc:` response.  
5. **Check `docs/settlers4_systems.md`** for high-level feature roadmap.

Armed with these references, you can confidently add new systems while respecting the event-driven structure.

