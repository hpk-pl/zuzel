# Instancja deweloperska (staging) — operator

Drugą instancję **konfiguruje operator** (Ty), nie drugi deweloper. Produkcja **playclub.pl** i **zuzel.hpkgrupa.pl** zostają w `~/projects/zuzel` na branchu `main`. Staging to **osobny katalog**, **osobny port**, **osobna subdomena**, **osobny branch Git**.

## Izolacja (dlaczego playclub.pl jest bezpieczny)

| | Produkcja | Staging dev |
|---|-----------|-------------|
| Katalog | `/home/deploy/projects/zuzel` | `/home/deploy/projects/zuzel-dev` |
| Git branch | `main` | `develop` (domyślnie) |
| systemd | `zuzel` (3080), `playclub` (3081) | `zuzel-dev` (3083) |
| Domena | `playclub.pl`, `zuzel.hpkgrupa.pl` | `zuzel-dev.hpkgrupa.pl` |
| `data/` | ranking + analityka prod | osobne pliki w clone |

Push na `develop` + `./deploy/dev-update.sh` **nie** robi `git pull` w katalogu produkcyjnym i **nie** restartuje `playclub` ani `zuzel`.

## Checklist operatora (jednorazowo)

### 1. Branch `develop` na GitHub

```bash
# lokalnie lub z dowolnego klona
git push origin main:develop
```

Drugiego dewelopera prosisz o pracę na branchu `develop` (lub feature → PR → merge do `develop`). Na staging wdrażasz **`develop`**, nie `main`.

### 2. DNS

W strefie **hpkgrupa.pl**:

| Typ | Nazwa | Wartość |
|-----|-------|---------|
| A | `zuzel-dev` | IP serwera Hetzner (jak `zuzel`) |

### 3. Instalacja na serwerze (jako `deploy`)

```bash
ssh deploy@<serwer>
cd ~/projects/zuzel
git pull origin main
chmod +x deploy/dev-install.sh deploy/dev-update.sh
./deploy/dev-install.sh
```

Skrypt: klonuje `~/projects/zuzel-dev`, checkout `develop`, `npm install`, `zuzel-dev.service`, nginx.

### 4. SSL

```bash
sudo certbot --nginx -d zuzel-dev.hpkgrupa.pl
```

### 5. Weryfikacja

```bash
curl -s http://127.0.0.1:3083/health
curl -sI https://zuzel-dev.hpkgrupa.pl/health
sudo systemctl status zuzel-dev
# playclub nadal z tego samego katalogu prod:
sudo systemctl status playclub zuzel
```

## Codzienny workflow

**Deweloper 2**

1. Clone repo z GitHub.
2. Branch od `develop`: `git checkout develop && git pull`.
3. Commity + push na `develop` lub PR do `develop`.
4. **Nie** loguje się na produkcję ani nie uruchamia `install.sh` / `playclub-install.sh`.

**Operator (Ty) — wdrożenie zmian na staging**

```bash
ssh deploy@<serwer>
cd ~/projects/zuzel && git pull origin main
./deploy/dev-update.sh
```

**Operator — wdrożenie na playclub.pl (produkcja)**

```bash
cd ~/projects/zuzel
git pull origin main          # tylko main
npm install --production
sudo systemctl restart playclub zuzel
```

Merge `develop` → `main` dopiero gdy staging jest OK.

## Dostęp dla dewelopera

Minimum:

- URL: **https://zuzel-dev.hpkgrupa.pl**
- Git: write access do `hpk-pl/zuzel`, praca na `develop`
- **Bez** SSH do produkcji (opcjonalnie, jeśli ufasz — i tak nie powinien restartować prod)

Opcjonalnie: osobny klucz SSH tylko do odczytu logów `journalctl -u zuzel-dev -f` — wtedy dodaj mu usera lub sudoers; domyślnie wystarczy Git + Ty odpalasz `dev-update.sh`.

## Pliki w repo

| Plik | Rola |
|------|------|
| `deploy/zuzel-dev.service` | systemd, port 3083, `WorkingDirectory=.../zuzel-dev` |
| `deploy/nginx-zuzel-dev.hpkgrupa.pl.conf` | reverse proxy |
| `deploy/dev-install.sh` | pierwsza instalacja stagingu |
| `deploy/dev-update.sh` | pull branch + restart tylko `zuzel-dev` |

## Inna subdomena lub branch

```bash
DEV_BRANCH=feature/foo APP_DIR=$HOME/projects/zuzel-dev ./deploy/dev-update.sh
```

Dla innej domeny skopiuj i dostosuj pliki nginx + `DOMAIN` w skryptach (lub zmienne — rozszerzenie na życzenie).

---

## Faza 4 — Go-live na **nowej domenie** (po akceptacji wersji z stagingu)

Staging (`zuzel-dev`) służy do testów. Gdy wersja z `develop` ma wejść **obok** playclub.pl na **nowej domenie** (np. `gra.example.pl`), nie podmieniasz od razu `playclub.pl` — stawiasz **trzecią instancję** (albo migrujesz DNS później).

### Schemat trzech etapów

| Etap | Domena | Katalog | Branch | Cel |
|------|--------|---------|--------|-----|
| 1 Prod dziś | `playclub.pl` | `~/projects/zuzel` | `main` | użytkownicy |
| 2 Staging | `zuzel-dev.hpkgrupa.pl` | `~/projects/zuzel-dev` | `develop` | dev 2 + QA |
| 3 Nowa prod | **Twoja nowa domena** | np. `~/projects/zuzel-v2` | `main` (po merge) | publiczny start nowej wersji |

### Krok po kroku (operator) — nowa domena

**A. Zamroź wersję w Git**

1. PR: `develop` → `main` na GitHubie (review + merge).
2. Upewnij się, że `main` ma to, co testowałeś na `zuzel-dev`.

**B. DNS nowej domeny**

| Typ | Nazwa | Wartość |
|-----|-------|---------|
| A | `@` (i ewent. `www`) | IP Hetzner (jak playclub) |

**C. Nowy katalog + usługa (izolacja od playclub)**

Wybierz wolny port (np. **3084**). Na serwerze:

```bash
cd ~/projects
git clone https://github.com/hpk-pl/zuzel.git zuzel-v2
cd zuzel-v2
git checkout main
git pull origin main
npm install --production
```

Skopiuj i dostosuj szablony z repo:

- `deploy/playclub.service` → np. `deploy/nowadomena.service`  
  - `WorkingDirectory=/home/deploy/projects/zuzel-v2`  
  - `Environment=PORT=3084`  
  - `Environment=BASE_PATH=/gry/zuzel` *(jeśli lobby + gra jak playclub)* **albo** bez `BASE_PATH` *(sama gra pod `/`)*  
- `deploy/nginx-playclub.pl.conf` → `deploy/nginx-<domena>.conf`  
  - `server_name` = nowa domena  
  - `proxy_pass http://127.0.0.1:3084;`

```bash
sudo cp deploy/nowadomena.service /etc/systemd/system/nowadomena.service
sudo systemctl daemon-reload
sudo systemctl enable nowadomena
sudo systemctl start nowadomena
sudo cp deploy/nginx-<domena>.conf /etc/nginx/sites-available/<domena>
sudo ln -sf /etc/nginx/sites-available/<domena> /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d <domena> -d www.<domena>
curl -s http://127.0.0.1:3084/health
```

**D. Co z playclub.pl**

- **Równolegle:** stary playclub działa z `~/projects/zuzel` aż do 301 / wyłączenia.
- **Cutover:** gdy nowa domena OK — 301 z playclub lub zamiana treści w DNS (osobna decyzja produktowa).

**E. Staging zostaje**

`zuzel-dev` + `develop` nadal służy kolejnym iteracjom; go-live na nową domenę zawsze idzie z **`main`**, nie z bezpośredniego pusha na prod.

*(Docelowo można dodać `deploy/new-domain-install.sh` z parametrami `DOMAIN`, `PORT`, `APP_DIR` — na życzenie w osobnym PR.)*

