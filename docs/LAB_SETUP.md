# Lab Setup Guide — Master & Worker Nodes

Step-by-step setup for running the YouTube analytics cluster on lab machines (1 master + 2 or more workers on the same network). Every step below exists because it caused an error during our first setup. The **Troubleshooting** section at the end maps each error message to its fix.

---

## 0. Before you start

### What runs where

| Machine | Runs | Folder |
|---|---|---|
| **Master** (Windows) | HDFS NameNode, Spark Master, MongoDB, backend API, React dashboard | repo root |
| **Worker 1, 2, …** (Windows or Mac) | HDFS DataNode, Spark Worker | `worker-youtube/` |

### Requirements on every machine

- **Docker Desktop**, installed and **running** (whale icon in the tray / menu bar)
- **Git**, to clone the repo
- All machines on the **same Wi-Fi / LAN**

Master only:
- **Node.js** (for the backend and dashboard)
- The 4 dataset CSVs (`CAvideos.csv`, `GBvideos.csv`, `INvideos.csv`, `USvideos.csv`) from the [Kaggle dataset](https://www.kaggle.com/datasets/datasnaek/youtube-new). They are not in the repo.

### Get the code (every machine)

```bash
git clone https://github.com/nsiddiqui12/youtube-bigdata-analytics.git
cd youtube-bigdata-analytics
```

### Which terminal to use

Use **PowerShell** on Windows and **Terminal** on Mac.

If you use **Git Bash** (the default in VS Code on Windows), run these once per terminal first, or add them to `~/.bashrc`:

```bash
export PATH="$PATH:/c/Program Files/Docker/Docker/resources/bin:/c/Users/$USERNAME/AppData/Local/Programs/DockerDesktop/resources/bin"
export MSYS_NO_PATHCONV=1
```

- The first line fixes `bash: docker: command not found`.
- The second fixes `No FileSystem for scheme "C"`. Git Bash rewrites paths like `/youtube/raw` into Windows paths unless it's set.

---

## 1. Write down every machine's IP

Lab IPs change between sessions. **Do this every time.**

| OS | Command | What to read |
|---|---|---|
| Windows | `ipconfig` | **IPv4 Address** under **Wi-Fi** (or Ethernet) |
| Mac | `ipconfig getifaddr en0` | the printed address |

Ignore addresses starting with `172.` on Windows. Those belong to Docker/WSL, not the LAN.

Fill in this table before going further:

| Machine | LAN IP | DataNode port |
|---|---|---|
| Master | `_______` | — |
| Worker 1 | `_______` | `9866` |
| Worker 2 | `_______` | `9876` |
| Worker 3 | `_______` | `9886` |

> **Every worker needs a different DataNode port.** Docker on the master makes all workers appear to come from the same address (`172.18.0.1`). If two workers use the same port, HDFS treats them as one node and they keep replacing each other.
>
> **Never use port `9867`.** It is the DataNode's built-in IPC port, and the DataNode will crash with `Address already in use`.

Check the network from each worker (replace with the master's IP):

```bash
ping <MASTER_IP>
```

---

## 2. Master node setup

All commands run in the **repo root** on the master.

### 2.1 Set the master IP (only if it changed)

The master IP appears in 3 files. If the master's IP is not `10.77.120.200`, replace it in all of them:

| File | Lines |
|---|---|
| `docker-compose.yml` | `CORE_CONF_fs_defaultFS`, `SPARK_PUBLIC_DNS` |
| `scripts/a.py` | `MASTER_IP = "..."` |
| `scripts/run_spark.ps1` | `--master spark://...`, `spark.driver.host=...` |

In VS Code, **Ctrl+Shift+H** (Replace in Files) does this in one go: search `10.77.120.200`, replace with the new IP.

### 2.2 Open the firewall (PowerShell **as Administrator**, once per machine)

Lab Wi-Fi is usually a **Public** network, and Windows Firewall blocks all incoming connections on Public networks. Ping still works, so the machine *looks* reachable, but workers can't connect.

```powershell
New-NetFirewallRule -DisplayName "YouTube cluster - master" -Direction Inbound -Protocol TCP `
  -LocalPort 9000,9870,7077,7078,7079,8080,27017 `
  -RemoteAddress LocalSubnet -Action Allow -Profile Any
```

### 2.3 Put the CSVs in `data/`

```
data/CAvideos.csv
data/GBvideos.csv
data/INvideos.csv
data/USvideos.csv
```

### 2.4 Start the master services

```powershell
docker compose up -d
docker compose ps
```

You should see `namenode` (healthy), `spark-master` and `mongodb`, all **Up**.

Check in a browser:
- Spark Master UI: http://localhost:8080
- HDFS NameNode UI: http://localhost:9870

---

## 3. Worker node setup

Repeat on **each** worker. All commands run in the `worker-youtube/` folder.

### 3.1 Create the `.env` file

```bash
cd worker-youtube
copy .env.example .env      # Windows
cp .env.example .env        # Mac
```

Edit `.env` and set the 3 values from your table in step 1:

```ini
MASTER_IP=10.77.120.200     # the master's IP
WORKER_IP=10.77.120.170     # THIS machine's IP
DATANODE_PORT=9866          # unique per worker: 9866, 9876, 9886 ...
```

> `.env` must be in the **same folder** as `docker-compose.yml`. If it's missing, Docker stops with `required variable ... is missing a value`, which is the intended behaviour.

You don't need to edit `docker-compose.yml` on workers. Everything comes from `.env`.

### 3.2 Open the firewall

The master connects **back** to each worker, so workers need open ports too.

**Windows worker** (PowerShell as Administrator). Use this worker's `DATANODE_PORT` in place of `9866`:

```powershell
New-NetFirewallRule -DisplayName "YouTube cluster - worker" -Direction Inbound -Protocol TCP `
  -LocalPort 9864,9866,8081,7079 `
  -RemoteAddress LocalSubnet -Action Allow -Profile Any
```

**Mac worker.** The macOS firewall works per app, not per port. Allow Docker:

```bash
sudo /usr/libexec/ApplicationFirewall/socketfilterfw --add /Applications/Docker.app
sudo /usr/libexec/ApplicationFirewall/socketfilterfw --unblockapp /Applications/Docker.app
```

Or use **System Settings → Network → Firewall → Options → + → Docker → Allow incoming connections**. Then restart Docker Desktop.

### 3.3 Test the connection to the master

```powershell
Test-NetConnection <MASTER_IP> -Port 7077     # Windows
Test-NetConnection <MASTER_IP> -Port 9870
```
```bash
nc -vz <MASTER_IP> 7077                        # Mac
nc -vz <MASTER_IP> 9870
```

Both must succeed (`TcpTestSucceeded : True` / `succeeded`). If not, fix the **master's** firewall (step 2.2) before continuing.

### 3.4 Start the worker

```bash
docker compose up -d
docker compose ps
```

Both `datanode` and `spark-worker` must be **Up**. If one shows **Exited**, read its log:

```bash
docker logs --tail 30 datanode
docker logs --tail 30 spark-worker
```

Good signs in the logs:
- datanode: `successfully registered with NN`, appearing **once**, not repeating every 3 seconds
- spark-worker: `Successfully registered with master spark://...`

---

## 4. Verify the cluster (on the master)

Wait about 30 seconds after the last worker starts.

```powershell
docker exec namenode hdfs dfsadmin -report | Select-String "Live datanodes|Hostname"
```

Expected, for 2 workers:

```
Live datanodes (2):
Hostname: <worker 1 IP>
Hostname: <worker 2 IP>
```

Also open http://localhost:8080 and check that **Alive Workers** equals the number of workers, each listed with its real LAN IP.

**Checklist — don't continue until all are true:**

- [ ] Live datanodes = number of workers, and the count stays the same if you run the command again a few seconds later
- [ ] Each datanode shows a **different port** (`:9866`, `:9876`, …)
- [ ] Each hostname is that worker's **real** IP
- [ ] Spark shows **Alive Workers** = number of workers

---

## 5. Load data and run the job (on the master)

### 5.1 Upload the CSVs to HDFS

```powershell
docker exec namenode hdfs dfs -mkdir -p /youtube/raw
docker exec namenode sh -c "hdfs dfs -put -f /data/*.csv /youtube/raw/"
docker exec namenode hdfs dfs -ls /youtube/raw
```

Wait until the `put` command returns. The listing must show **4 `.csv` files** and **no** `._COPYING_` files. A `._COPYING_` file means an upload is still in progress or was interrupted. If one remains, run the `put` again.

### 5.2 Run the Spark job

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\run_spark.ps1
```

It takes a few minutes (longer the first time while it downloads the MongoDB connector). It finishes with:

```
    Saved collection: category_stats (...)
    Saved collection: hourly_trends (...)
    Saved collection: top_videos (...)
    Saved collection: channel_leaderboard (...)
>>> Pipeline completed successfully!
```

Some `FetchFailedException` errors in the middle are **normal** on Wi-Fi. Spark retries those tasks. Only worry if the final success line is missing.

You only need to re-run the job when the CSVs or `scripts/a.py` change. Results stay in MongoDB.

---

## 6. Start the backend and dashboard (on the master)

Two separate terminals:

```powershell
cd backend
npm install        # first time only
node server.js     # → API server running on http://localhost:5000
```

```powershell
cd frontend\frontend
npm install        # first time only
npm run dev        # → http://localhost:5173
```

Check that the API returns data, not `[]`:

```powershell
curl.exe http://localhost:5000/api/categories?country=IN
```

Then open **http://localhost:5173**.

---

## 7. Shutting down

```bash
docker compose down        # on each worker, in worker-youtube/
docker compose down        # on the master, in the repo root
```

Stop the backend and dashboard with **Ctrl+C** in their terminals.

`down` keeps the data volumes (HDFS files, MongoDB results). **Don't** add `-v` unless you want to wipe them.

---

## 8. Troubleshooting

| Symptom / error message | Where | Cause | Fix |
|---|---|---|---|
| `bash: docker: command not found` | Git Bash | Docker isn't on Git Bash's PATH | Use PowerShell, or the `export PATH=...` line in step 0 |
| `No FileSystem for scheme "C"` | Git Bash | Git Bash rewrote an HDFS path into a Windows path | `export MSYS_NO_PATHCONV=1`, or use PowerShell |
| `10.77.x.x:9870 is not available yet` repeating; `Retrying connection to master` | Worker logs | Master's firewall blocks the worker. Ping works but ports don't. | Step 2.2 on the master; test with step 3.3 |
| `required variable ... is missing a value` | Worker `docker compose up` | No `.env`, or `.env` is in the wrong folder | Step 3.1 |
| Spark worker: `BindException: Cannot assign requested address ... sparkWorker failed after 16 retries` | Worker logs | `SPARK_LOCAL_HOSTNAME` set to the LAN IP, which doesn't exist inside the container | Use the repo's `worker-youtube/docker-compose.yml` as is (`SPARK_LOCAL_IP=0.0.0.0` + `SPARK_PUBLIC_DNS`) |
| DataNode log repeats `DNA_REGISTER` … `successfully registered with NN` every ~3 s; master shows fewer live datanodes than workers | Worker logs / master | Two workers use the same `DATANODE_PORT` and replace each other | Give each worker a unique `DATANODE_PORT` (step 1) |
| DataNode exits: `Problem binding to [0.0.0.0:9867] ... Address already in use` | Worker logs | `DATANODE_PORT=9867` collides with the DataNode's IPC port | Use `9876`, `9886`, … |
| Datanode / worker shows the wrong IP (e.g. the router's) in the master UI | Master UI | Wrong `WORKER_IP` in `.env` | Re-check with `ipconfig` / `ipconfig getifaddr en0`, fix `.env`, then `docker compose up -d --force-recreate` |
| `Test-NetConnection <worker> -Port <DATANODE_PORT>` fails from the master | Master | Worker firewall, or the datanode container exited | `docker compose ps` on the worker; step 3.2 |
| `Live datanodes (0)` / `Configured Capacity: 0` | Master | No workers connected | Steps 3.3–3.4 |
| `hdfs dfs -put` fails or hangs | Master | No live datanodes, or the master can't reach the worker's DataNode port | Section 4 checklist |
| `._COPYING_` file left in `/youtube/raw` | Master | Upload interrupted | Re-run the `put` command in step 5.1 |
| `run_spark.ps1 cannot be loaded because running scripts is disabled` | Master | PowerShell execution policy | Use `powershell -ExecutionPolicy Bypass -File .\scripts\run_spark.ps1` |
| Spark job stuck with `Initial job has not accepted any resources` | Master | No Spark workers alive, or they can't reach the driver on 7078/7079 | Check http://localhost:8080; check the master firewall includes 7078, 7079 |
| Dashboard empty / API returns `[]` | Master | Spark job not run yet, or it failed | Step 5.2. Look for `Pipeline completed successfully!` |
| Dashboard shows "Can't reach the analytics API" | Browser | Backend not running, or MongoDB down | Step 6; `docker compose ps` on the master |
| `port is already allocated` / `EADDRINUSE` | Any | An old container or Node process still holds the port | `docker compose down`; for Node: `Stop-Process -Name node` (stops **all** Node processes) |
| `Import "pyspark" could not be resolved` in VS Code | Editor | pyspark isn't installed locally. It runs inside Docker, so this is only an editor warning. | Optional: `pip install "pyspark==3.5.*"`, then **Developer: Reload Window** |

### Quick diagnostic commands

```powershell
# Master: what's connected?
docker exec namenode hdfs dfsadmin -report | Select-String "Live datanodes|Name:|Hostname"
docker compose ps

# Worker: are containers up, and why did one stop?
docker compose ps
docker logs --tail 30 datanode
docker logs --tail 30 spark-worker

# Any machine: is a port reachable?
Test-NetConnection <IP> -Port <PORT>      # Windows
nc -vz <IP> <PORT>                        # Mac
```

---

## Port reference

| Port | Service | Opened on |
|---|---|---|
| 9000 | HDFS NameNode RPC | Master |
| 9870 | HDFS NameNode web UI | Master |
| 7077 | Spark Master | Master |
| 7078 | Spark driver | Master |
| 7079 | Spark block manager / worker RPC | Master + workers |
| 8080 | Spark Master web UI | Master |
| 27017 | MongoDB | Master |
| 5000 | Backend API | Master (local) |
| 5173 | Dashboard | Master (local) |
| 9864 | DataNode web UI | Workers |
| `DATANODE_PORT` (9866, 9876, …) | DataNode data transfer | Workers |
| 8081 | Spark Worker web UI | Workers |
