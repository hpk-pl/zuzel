# Osobne konto SSH tylko do stagingu (zuzel-dev)

Deweloper dostaje **własnego użytkownika Linux** (np. `zuzeldev`), **bez** dostępu do `/home/deploy`, **bez** restartu `playclub` / `zuzel` prod.

---

## Co zyskujecie

| | `deploy` (Ty) | `zuzeldev` (dev 2) |
|---|---------------|---------------------|
| `~/projects/zuzel` (playclub) | tak | **nie** |
| Staging app | opcjonalnie | **`/home/zuzeldev/zuzel`** |
| `sudo systemctl restart playclub` | tak | **nie** |
| `sudo systemctl restart zuzel-dev` | tak | **tylko to** (sudoers) |
| GitHub Actions deploy | może używać `zuzeldev` zamiast `deploy` | — |

---

## Jednorazowa migracja (operator, root + deploy)

Obecny staging jest w `~/projects/zuzel-dev`. Przenieś go pod dedykowego użytkownika:

```bash
# 1. Użytkownik
sudo adduser --disabled-password --gecos "Zuzel staging dev" zuzeldev

# 2. Katalog aplikacji (przeniesienie istniejącego clone)
sudo systemctl stop zuzel-dev
sudo mv /home/deploy/projects/zuzel-dev /home/zuzeldev/zuzel
sudo chown -R zuzeldev:zuzeldev /home/zuzeldev/zuzel

# 3. systemd — uruchom Node jako zuzeldev
sudo sed -i 's|WorkingDirectory=.*|WorkingDirectory=/home/zuzeldev/zuzel|' /etc/systemd/system/zuzel-dev.service
sudo sed -i '/^User=/d;/^Group=/d' /etc/systemd/system/zuzel-dev.service
# Dodaj pod [Service]: User=zuzeldev, Group=zuzeldev (ręcznie visudo/systemctl edit lub edytor)
sudo systemctl daemon-reload
sudo systemctl start zuzel-dev
curl -s http://127.0.0.1:3083/health
```

Plik unit w repo po migracji powinien wyglądać jak `deploy/zuzel-dev.service` z `User=zuzeldev` i `WorkingDirectory=/home/zuzeldev/zuzel` (można zsynchronizować w kolejnym commicie).

---

## Klucz SSH dev 2

**Dev** generuje u siebie klucz i wysyła **tylko publiczny** `.pub`.

**Ty (root):**

```bash
sudo mkdir -p /home/zuzeldev/.ssh
sudo nano /home/zuzeldev/.ssh/authorized_keys
# wklej jedną linię: ssh-ed25519 AAAA... dev@laptop
sudo chown -R zuzeldev:zuzeldev /home/zuzeldev/.ssh
sudo chmod 700 /home/zuzeldev/.ssh
sudo chmod 600 /home/zuzeldev/.ssh/authorized_keys
```

Test (dev):

```bash
ssh zuzeldev@TWÓJ_SERWER
pwd   # /home/zuzeldev
ls    # zuzel/
```

Nie powinien wejść do `/home/deploy` (Permission denied).

---

## Sudo tylko restart stagingu

```bash
sudo visudo -f /etc/sudoers.d/zuzeldev-staging
```

```
zuzeldev ALL=(ALL) NOPASSWD: /usr/bin/systemctl restart zuzel-dev
```

```bash
sudo visudo -c -f /etc/sudoers.d/zuzeldev-staging
```

**Nie** dawaj `NOPASSWD: ALL` ani restartu `playclub` / `zuzel`.

---

## Wdrożenie przez dev (po pushu na develop)

```bash
ssh zuzeldev@serwer
cd ~/zuzel
git pull origin develop
npm install --omit=dev
sudo systemctl restart zuzel-dev
curl -s http://127.0.0.1:3083/health
```

Albo po merge skryptu w repo:

```bash
cd ~/zuzel && ./deploy/staging-deploy.sh
```

---

## GitHub Actions (opcjonalnie)

Zamiast `STAGING_SSH_USER=deploy` ustaw **`zuzeldev`** i klucz dodany do `/home/zuzeldev/.ssh/authorized_keys`. Workflow nadal tylko `pull` + `restart zuzel-dev`.

---

## Ochrona `main` / playclub

- Dev: Write na GitHub, merge PR → **`develop`**, SSH jako **`zuzeldev`**.
- Ty: branch protection na **`main`**, produkcja w **`/home/deploy/projects/zuzel`**.

---

## sshd (opcjonalnie, mocniejsza izolacja)

W `/etc/ssh/sshd_config.d/zuzeldev.conf`:

```
Match User zuzeldev
    X11Forwarding no
    AllowTcpForwarding no
    PermitTTY yes
```

`sudo systemctl reload sshd`

(RSF jeśli kiedyś potrzebny tunel — wtedy nie wyłączaj forwarding.)
