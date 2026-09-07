# Node System

Resource allocation + process orchestration backend. Your Minecraft panel and VM panel connect to this to manage processes and track RAM/CPU usage across all servers.

---

## Setup

```bash
npm install
node scripts/setup.js    # creates .env and data/ dirs
# edit .env — set NODE_SECRET, MAX_TOTAL_RAM_MB, MAX_TOTAL_CPU_CORES
npm start
```

Default port: **4000**

---

## Authentication

Every request must include the shared secret header:

```
X-Node-Secret: <NODE_SECRET from .env>
```

WebSocket connection (for real-time logs/metrics):

```
ws://host:4000/?secret=<NODE_SECRET>
```

---

## API Reference

### Health (no auth)
```
GET /health
→ { status, uptime, ts }
```

---

### Allocation — check free resources
```
GET  /api/allocation
→ { limits: { ramMB, cores }, used: { ramMB, cores }, available: { ramMB, cores }, count }

POST /api/allocation/check
Body: { allocatedRamMB, allocatedCpuCores }
→ { ok: true, available } | { ok: false, reason }
```

---

### Resources — register servers with the node
```
GET /api/resources
→ { stats, servers[] }

POST /api/resources
Body: { id?, type, label, allocatedRamMB, allocatedCpuCores }
→ { entry }    (use the returned id for all subsequent calls)

PATCH /api/resources/:id
Body: { allocatedRamMB?, allocatedCpuCores?, label? }
→ { entry }

DELETE /api/resources/:id
→ { message }
```

`type` is a free string — use `"minecraft"` or `"vm"` to match your panels.

---

### Processes — start/stop/monitor
```
POST /api/processes/:id/start
Body: {
  command: "java",
  args: ["-Xmx1024M", "-jar", "server.jar", "nogui"],
  cwd: "/path/to/server",
  env: {},
  restartPolicy: "always" | "never"   // watchdog auto-restarts on crash
}
→ { pid, status }

POST /api/processes/:id/stop
Body: { force: false }    // force=true sends SIGKILL immediately
→ { message }

POST /api/processes/:id/input
Body: { text: "say Hello" }    // writes a line to stdin (Minecraft console etc.)
→ { message }

GET /api/processes/:id/logs?lines=100
→ { logs: [{ ts, line }] }

GET /api/processes/:id/status
→ { id, type, label, allocatedRamMB, allocatedCpuCores, pid, status, running }

GET /api/processes
→ { running: [{ id, pid }] }
```

---

### Metrics — live system stats
```
GET /api/metrics
→ { ts, cpu: { totalLoad, cores[] }, memory: { totalMB, usedMB, freeMB, pct }, disk[], network[] }

GET /api/metrics/fresh    # forces immediate collection
→ same shape
```

---

## WebSocket Events (pushed to panels)

Connect: `ws://host:4000/?secret=<NODE_SECRET>`

| Event type | Payload |
|---|---|
| `connected` | `{ ts }` |
| `metrics` | full metrics snapshot (every METRICS_INTERVAL_MS) |
| `log` | `{ id, line }` — stdout/stderr line from a process |
| `status` | `{ id, status, pid?, code?, error? }` — process state change |
| `pong` | reply to `{ type: "ping" }` |

---

## Typical Panel Flow

### Creating a Minecraft server
1. `POST /api/allocation/check` — verify enough RAM/CPU
2. `POST /api/resources` — register the slot, get `id`
3. Store `id` in your panel DB alongside the server record
4. When user hits Start: `POST /api/processes/{id}/start`
5. Stream logs via WebSocket `log` events filtered by `id`
6. When user hits Stop: `POST /api/processes/{id}/stop`
7. If server deleted: `POST /api/processes/{id}/stop` then `DELETE /api/resources/{id}`

### Adjusting RAM on a running server
1. Stop the process first
2. `PATCH /api/resources/{id}` with new `allocatedRamMB`
3. Restart with updated `args`

---

## Watchdog / Auto-restart

Pass `restartPolicy: "always"` in the start body. The watchdog will:
- Detect crashed processes (status = `crashed`)
- Retry with exponential backoff: 3s → 6s → 12s → 24s → 48s
- Give up after 5 attempts and log an error
- Stop retrying if you call `POST /api/processes/:id/stop`

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| PORT | 4000 | HTTP port |
| HOST | 0.0.0.0 | Bind address |
| NODE_SECRET | (required) | Shared secret for panel auth |
| MAX_TOTAL_RAM_MB | 8192 | Total RAM this node can allocate |
| MAX_TOTAL_CPU_CORES | 4 | Total CPU cores this node can allocate |
| METRICS_INTERVAL_MS | 5000 | How often metrics are pushed |
| LOG_LEVEL | info | winston log level |
| LOG_DIR | ./logs | Log file directory |
