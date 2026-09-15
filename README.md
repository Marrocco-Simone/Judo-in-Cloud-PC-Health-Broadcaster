# PC Health Broadcaster

**English summary.** A single self-contained executable (Deno 2, no runtime to install) for the ~22
competition laptops of [Judo in Cloud](https://www.judoincloud.com). Every PC broadcasts a small
JSON telemetry packet over UDP on the local network at a randomized interval (10 s ± 3 s), listens
for the packets of the others, and serves a local web page on `127.0.0.1` with the whole fleet in
one table: PC number, CPU, RAM, battery, wifi signal, network and disk throughput, top process (OBS
highlighted), seconds since the last beat, live/stale/gone status, duplicate-number warnings,
one-click copy of the hardware specs and a CSV export of the session. No server, no account, no
internet, no remote commands. Builds for Windows 10, Ubuntu/Debian and macOS are produced by GitHub
Actions on every push to `main`. The rest of this document is in Italian.

---

## Cos'è

Durante una gara i PC di Judo in Cloud (tabelloni, CARE system, streaming) sono sparsi su più tatami
e non esiste un punto da cui vederli tutti. PC Health Broadcaster è un unico file eseguibile che,
avviato su ogni PC:

1. legge il **numero dell'etichetta fisica** del PC da `pc-number.txt` (lo chiede al primo avvio);
2. trasmette in **broadcast UDP** sulla rete locale l'anagrafica (modello, CPU, RAM, disco, OS) e la
   telemetria (CPU, RAM, batteria, wifi, rete, disco, temperatura, processi più pesanti);
3. **riceve** i pacchetti degli altri PC e mostra tutto in una **pagina locale** nel browser.

Nessun server, nessun account, nessuna installazione, nessuna connessione a internet.

## Download

Gli eseguibili sono prodotti automaticamente dalle GitHub Actions e pubblicati nelle
[Releases](../../releases/latest):

| Sistema               | File                                          | Note                                    |
| --------------------- | --------------------------------------------- | --------------------------------------- |
| Windows 10 (64 bit)   | `pc-health-broadcaster-<ver>-windows-x64.exe` | doppio clic                             |
| Ubuntu 24 / Debian    | `pc-health-broadcaster_<ver>_amd64.deb`       | `sudo apt install ./pc-health-…deb`     |
| Ubuntu 24 / Linux x64 | `pc-health-broadcaster-<ver>-linux-x64`       | `chmod +x` e doppio clic o da terminale |
| macOS Apple Silicon   | `pc-health-broadcaster-<ver>-macos-arm64`     | solo sviluppo                           |
| macOS Intel           | `pc-health-broadcaster-<ver>-macos-x64`       | solo sviluppo                           |

`SHA256SUMS.txt` contiene le impronte dei file.

## Avvio

**Windows.** Copia il file `.exe` in una cartella (es. `C:\jic\`) e fai doppio clic.

- SmartScreen mostra "PC protetto da Windows": clicca **Ulteriori informazioni → Esegui comunque**.
  Il file non è firmato.
- Al primo avvio il firewall chiede il consenso per la rete: clicca **Consenti** (rete privata).
  Senza consenso il PC trasmette ma non riceve.
- Resta aperta una finestra nera: è normale. Chiuderla ferma il programma.

**Ubuntu / Debian.** Con il `.deb`: `sudo apt install ./pc-health-broadcaster_<ver>_amd64.deb`, poi
cerca "PC Health Broadcaster" nel menu. Con il binario:
`chmod +x pc-health-broadcaster-<ver>-linux-x64` e avvialo. Se il firewall `ufw` è attivo:
`sudo ufw allow 47474/udp`.

**Primo avvio.** Si apre il browser su `http://127.0.0.1:47475/`. Se il numero non è ancora
impostato, la pagina chiede il numero dell'etichetta e lo salva in `pc-number.txt`.

## Il file `pc-number.txt`

È l'identità del PC (RF-1). Contiene solo il numero dell'etichetta, es. `7`. Sta **accanto
all'eseguibile**; se quella cartella non è scrivibile (es. `/usr/bin` dopo il `.deb`) viene usata
`~/.config/pc-health-broadcaster/` su Linux e `%APPDATA%\pc-health-broadcaster\` su Windows. Il nome
host non è mai usato come identità. Puoi preparare il file a mano per saltare la domanda al primo
avvio.

## Porte

| Porta   | Protocollo | Uso                                                             |
| ------- | ---------- | --------------------------------------------------------------- |
| `47474` | UDP        | broadcast e ricezione dei pacchetti, uguale su tutti i PC       |
| `47475` | TCP        | pagina locale, solo `127.0.0.1`; se occupata prova fino a 47484 |

## Opzioni da riga di comando

```
--once            stampa anagrafica e telemetria locali in JSON ed esce
--no-ui           non apre la pagina né il browser (solo trasmissione e ricezione)
--number=<n>      usa questo numero invece di pc-number.txt
--peers=<a,b,c>   invia ogni beat anche a questi IP (in aggiunta a peers.txt)
--port=<n>        porta UDP (default 47474)
--ui-port=<n>     prima porta tentata per la pagina (default 47475)
--version         stampa la versione ed esce
--help
```

`peers.txt`, accanto all'eseguibile, contiene un IP per riga (i commenti iniziano con `#`). Serve
quando il wifi ha l'isolamento client attivo o i PC stanno su sottoreti diverse (D1): il pacchetto
parte in broadcast **e** in unicast verso ogni peer.

## Requisiti di rete

- Rete locale, anche senza gateway, senza DNS e senza internet (RF-7).
- Broadcast UDP ammesso tra i PC: sui wifi "piatti" funziona da solo; con isolamento client o più
  sottoreti usa `peers.txt`.
- Traffico: un pacchetto di **meno di 1200 byte** ogni 10 s ± 3 s per PC, più l'anagrafica (circa
  300 byte) ogni 10 beat. Con 22 PC sono circa **1 kB/s in tutto**: impercettibile accanto a uno
  streaming video.
- Perdere pacchetti non è un errore: un PC diventa **stale** dopo 30 s senza notizie e **gone** dopo
  120 s; torna live al primo pacchetto ricevuto.

## La pagina di controllo

Ogni PC ha la sua pagina; apri quella del PC da cui vuoi controllare. Mostra per ogni macchina:
numero, host, ruolo e tatami (campi che compili tu, salvati nel browser di quel PC), CPU, RAM,
batteria, wifi, rete ↓/↑, disco R/W, processo più pesante (OBS evidenziato), secondi dall'ultimo
beat, stato. Se due PC dichiarano lo stesso numero compare un avviso rosso (D8).

- **Copia specs** copia in appunti un blocco di testo con anagrafica del PC, pronto da incollare
  nella pagina inventario dell'admin di Judo in Cloud (righe vuote per stato care system, porte e
  note). **Copia tutte le specs** fa lo stesso per tutte le macchine.
- **Scarica CSV sessione** esporta la telemetria ricevuta da quando la pagina è aperta, con ruolo e
  tatami. Il nome del file usa il campo "Gara" (es. `pc-health_Lavis_2026_2026-10-10.csv`). Lo
  storico sta in memoria (max 50 000 beat) solo sulla macchina di cui apri la pagina (D6); nessuna
  scrittura su disco.

## Impatto sulla macchina (RN-1)

Il programma non fa polling più veloce del beat e non scrive su disco (solo `pc-number.txt`, una
volta). Costo per beat:

- **Linux**: lettura di `/proc/stat`, `/proc/meminfo`, `/proc/net/dev`, `/proc/diskstats`,
  `/proc/net/wireless`, `/sys/class/power_supply`, `/sys/class/thermal`; un processo `ps`.
- **Windows**: **un** processo `powershell.exe` per beat che legge i contatori CIM (CPU totale e per
  core, batteria, rete, disco) e ogni 3° beat i processi più pesanti; un
  `netsh wlan show
  interfaces` per il wifi. Un avvio di PowerShell costa circa 0,3–1 s di CPU su
  una macchina del 2012, distribuito su 10 s: ~0,5–1 % di un core.
- **macOS** (solo sviluppo): `top -l 1`, `pmset`, `netstat`, `ps`.

Nota: `ps` riporta la media di CPU sulla vita del processo, non l'istantanea; è il compromesso
accettato per non pesare sulla macchina.

### Peso misurato

Da compilare dopo la misura su una macchina reale.

| Macchina          | OS         | CPU media app | RAM app | Frame persi in OBS (30 min) |
| ----------------- | ---------- | ------------- | ------- | --------------------------- |
| PC __ (2011–2012) | Ubuntu 24  | __ %          | __ MB   | __                          |
| PC __ (recente)   | Windows 10 | __ %          | __ MB   | __                          |

## Permessi Deno con cui è compilato

L'eseguibile è compilato con `--allow-all`. Non è una scorciatoia: da Deno 2 la lettura di `/proc` e
di `/sys` richiede il permesso totale e fallisce con `NotCapable: Requires all access` anche con
`--allow-read` senza restrizioni o con `--allow-read=/proc,/sys`. Sono le due sorgenti di quasi
tutta la telemetria Linux, quindi senza `--allow-all` su Linux restano solo hostname, RAM, OS,
kernel e processi.

Quello che il programma usa davvero è questo:

| Capacità        | Perché                                                                     |
| --------------- | -------------------------------------------------------------------------- |
| rete            | socket UDP 47474 e pagina HTTP su 127.0.0.1                                |
| lettura         | `/proc`, `/sys`, `/etc/os-release`, `pc-number.txt`, `peers.txt`           |
| scrittura       | scrivere `pc-number.txt` accanto all'eseguibile o nella cartella di config |
| sottoprocessi   | `ps`, `powershell`, `netsh`, `top`, apertura del browser                   |
| info di sistema | nome host, memoria, interfacce di rete, versione del kernel                |
| ambiente        | `HOME`, `XDG_CONFIG_HOME`, `APPDATA` per la cartella di config             |

La scrittura non è limitata a una cartella perché la cartella dell'eseguibile è nota solo a runtime;
il codice scrive comunque un solo file (`pc-number.txt`).

## Sviluppo

Serve solo [Deno 2](https://deno.com).

```
deno task dev            # avvia da sorgente
deno task test           # test unitari
deno task check          # fmt --check, lint, type check
deno task compile:linux  # oppure compile:win, compile:mac-arm, compile:mac-x64
```

La versione sta in `deno.json`. Ogni push su `main` compila i quattro target, costruisce il `.deb` e
pubblica (o aggiorna) la release `v<versione>`. Le PR eseguono `ci.yml`.

### Ciclo di test su una macchina reale

I collector di Linux e Windows si verificano solo sul sistema operativo di destinazione. Il ciclo è:

1. Modifica il codice e verifica con `deno task check` e `deno task test`.
2. Alza il terzo numero della versione in `deno.json` (es. `0.1.2` → `0.1.3`).
3. Committa e pusha su `main`: la release `v<versione>` compare dopo circa un minuto.
4. Sul PC di prova scarica il file della nuova versione e controlla con `--version` che sia quella.
5. `pc-health-broadcaster --once` stampa anagrafica e telemetria locali: un campo `null` è un
   collector che non legge quel valore su quella macchina.

Se un PC trasmette (gli altri lo vedono) ma non riceve (la sua pagina resta vuota), il firewall
blocca l'ingresso UDP 47474. Su Ubuntu e Omarchy con `ufw` attivo: `sudo ufw allow 47474/udp`.

## Requisiti → implementazione

| ID   | Requisito                                 | Dove                                                                                       |
| ---- | ----------------------------------------- | ------------------------------------------------------------------------------------------ |
| RF-1 | identità stabile = numero etichetta       | `src/identity.ts` (`pc-number.txt`), dialog in `src/ui/page.ts`, `--number`                |
| RF-2 | anagrafica + telemetria                   | `src/net/protocol.ts` (`Specs`, `Telemetry`), `src/collectors/*`                           |
| RF-3 | intervallo randomizzato, partenza sfasata | `src/net/broadcast.ts` (`nextDelayMs`, `initialPhaseMs`), `src/interval_test.ts`           |
| RF-4 | vista aggregata, stale/gone, ricezione on | `src/state.ts`, `src/net/listen.ts`, `src/ui/page.ts`; la ricezione parte con il programma |
| RF-5 | nessun server/account/config              | broadcast UDP + unicast opzionale; nessun file da copiare oltre l'eseguibile               |
| RF-6 | file pronto per OS, build automatiche     | `.github/workflows/release.yml`, `deno task compile:*`                                     |
| RF-7 | offline                                   | nessuna chiamata esterna; pagina inline senza CDN (`src/ui/page.ts`)                       |
| RF-8 | storico per gara                          | `Fleet.history` in `src/state.ts`, `/api/history`, "Scarica CSV sessione" con campo "Gara" |
| RF-9 | ruolo e tatami                            | colonne Ruolo/Tatami in `src/ui/page.ts`, salvate in `localStorage`, incluse nel CSV       |
| RN-1 | impatto trascurabile                      | un campionamento per beat, nessuna scrittura su disco; sezione "Impatto sulla macchina"    |
| RN-2 | non può fare danni                        | solo lettura del sistema; UI su 127.0.0.1; nessun comando accettato (`parsePacket`)        |
| RN-3 | Windows 10 e Ubuntu 24                    | `src/collectors/windows.ts`, `src/collectors/linux.ts`; target in `deno.json`              |
| RN-4 | nessuna dipendenza                        | `deno compile`, zero dipendenze runtime                                                    |
| RN-5 | sicurezza e privacy                       | `Telemetry`/`Specs` non contengono credenziali, nomi o percorsi; parser stretto e size cap |
| RN-6 | reti povere                               | perdita pacchetti tollerata (`statusFor`), unicast ai peer, errori di invio ignorati       |
| RN-7 | manutenibilità                            | una modifica → push → release con tutti gli eseguibili                                     |
| RN-8 | avvio rapido                              | eseguibile singolo, nessuna dipendenza; il browser si apre prima del primo beat            |
| D1   | indirizzamento                            | broadcast limitato + broadcast di sottorete + `peers.txt`                                  |
| D2   | porta                                     | UDP 47474 (`UDP_PORT`)                                                                     |
| D3   | intervallo                                | 10 s ± 3 s, fase iniziale 0–10 s (`BEAT_BASE_MS`, `BEAT_JITTER_MS`)                        |
| D5   | assegnazione numero                       | file `pc-number.txt`, richiesto dalla pagina al primo avvio                                |
| D6   | persistenza                               | solo in memoria sulla macchina di controllo                                                |
| D7   | integrazione con Judo in Cloud            | successiva: CSV e "Copia specs"                                                            |
| D8   | numeri duplicati                          | `duplicate` in `Fleet.snapshot`, avviso nella pagina, `src/state_test.ts`                  |
| D9   | superficie di visualizzazione             | pagina locale servita dall'eseguibile                                                      |

## Licenza

MIT — Simone Marrocco, 2026.
