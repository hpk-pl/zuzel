# Samodzielne wdrożenie stagingu (bez operatora)

Cel: drugi deweloper **sam** merguje do `develop` i **sam** wdraża na https://zuzel-dev.hpkgrupa.pl. Ty **nie** robisz merge ani `git pull` na staging za każdym razem. **playclub.pl** nadal tylko Ty (branch `main`).

---

## Model ról

| | Deweloper 2 | Ty (operator) |
|---|-------------|----------------|
| Branch | `develop` (push / merge własnych PR) | **`main`** — merge `develop` → `main` tylko przy release |
| Staging | push → auto deploy **lub** `./deploy/staging-deploy.sh` | Jednorazowa konfiguracja poniżej |
| playclub.pl | brak dostępu | `git pull main` + restart `playclub` |

---

## Wariant A (zalecany): GitHub Actions — zero SSH dla deva

Po **każdym pushu na `develop`** workflow wdraża staging na serwerze.

### Ty — jednorazowa konfiguracja

**1. Klucz SSH tylko do deployu stagingu** (na laptopie):

```bash
ssh-keygen -t ed25519 -f ~/.ssh/zuzel-staging-deploy -C "github-actions-staging" -N ""
cat ~/.ssh/zuzel-staging-deploy.pub
```

**2. Na serwerze** (user `deploy`):

```bash
mkdir -p ~/.ssh && chmod 700 ~/.ssh
echo 'WKLEJ_PUBLIC_KEY' >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
```

**3. Sudo bez hasła tylko dla restartu stagingu** (root):

```bash
sudo visudo -f /etc/sudoers.d/zuzel-staging-deploy
```

Wklej linię z pliku `deploy/sudoers-staging-deploy.example`:

```
deploy ALL=(ALL) NOPASSWD: /usr/bin/systemctl restart zuzel-dev
```

```bash
sudo visudo -c -f /etc/sudoers.d/zuzel-staging-deploy
```

**4. Sekrety GitHub** — repo `hpk-pl/zuzel` → Settings → Secrets and variables → Actions:

| Sekret | Wartość |
|--------|---------|
| `STAGING_SSH_HOST` | IP serwera lub hostname (np. `178.105.142.153`) |
| `STAGING_SSH_USER` | `deploy` |
| `STAGING_SSH_PRIVATE_KEY` | cała zawartość `~/.ssh/zuzel-staging-deploy` (klucz prywatny) |

**5. Ochrona `main`** (Settings → Branches → branch protection):

- `main`: wymagany PR, **merge tylko Ty** (albo wybrani maintainerzy)
- `develop`: dev z Write może pushować / mergować PR

**6. Merge PR z workflow** (jeśli jeszcze nie ma `.github/workflows/deploy-staging.yml` na `main`).

### Deweloper 2 — codziennie

1. Feature branch → PR do **`develop`** → **sam merge** (masz Write).
2. Po merge/pushu: Actions → „Deploy staging (develop)” → zielone.
3. Test: https://zuzel-dev.hpkgrupa.pl

Nie potrzebujesz sudo, SSH ani Ciebie do wdrożenia stagingu.

---

## Wariant B: dev ma SSH jako `deploy`

Ten sam wpis **sudoers** co wyżej.

Dev po pushu na `develop`:

```bash
ssh deploy@TWÓJ_SERWER
cd ~/projects/zuzel-dev
git pull origin develop
./deploy/staging-deploy.sh
```

Nadal **nie** może restartować `playclub` / `zuzel` (brak sudo).

---

## Wariant C (zalecany przy SSH): osobny user Linux `zuzeldev`

Konto **tylko** pod staging — bez dostępu do `/home/deploy` i playclub.

Pełna procedura migracji i sudoers: **[deploy-staging-dedicated-ssh-user.md](deploy-staging-dedicated-ssh-user.md)**

Dev łączy się: `ssh zuzeldev@serwer`, kod w `~/zuzel`, deploy `./deploy/staging-deploy.sh`.

---

## Produkcja playclub — bez zmian

Tylko Ty, ręcznie, po akceptacji stagingu:

```bash
cd ~/projects/zuzel
git pull origin main
npm install --omit=dev
sudo systemctl restart playclub zuzel
```

---

## Pliki

| Plik | Rola |
|------|------|
| `.github/workflows/deploy-staging.yml` | Auto deploy po pushu `develop` |
| `deploy/staging-deploy.sh` | Ręczny deploy z `~/projects/zuzel-dev` |
| `deploy/sudoers-staging-deploy.example` | Szablon sudoers |
