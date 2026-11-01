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
