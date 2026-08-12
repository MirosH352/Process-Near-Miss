# Evidence chyb a near missu

Frontend a Python backend pro evidenci incidentu s prihlasenim pres email a heslo, serverovou session a administracnim uctem.

## Co aplikace umi

- Prihlaseni pres serverovou session
- Rucni zalozeni prvniho admina pri prvnim spusteni
- Sprava dalsich uzivatelu s roli `admin`
- Evidence chyb a near missu
- Editace, mazani a zmena stavu zaznamu
- Kanban i tabulkove zobrazeni

## Lokalne

Spust aplikaci:

```bash
python app.py
```

Pak otevri `http://127.0.0.1:8000`.

Pro lokalni provoz bez databazove sluzby pouzije aplikace SQLite soubor `near_miss.sqlite3` v repozitari.

## Nasazeni zdarma

Nejjednodussi kombinace je:

- hosting aplikace: [Render](https://render.com/)
- databaze: [Supabase Postgres](https://supabase.com/)

### 1. Vytvor Supabase projekt

1. Zaloz novy projekt v Supabase.
2. V sekci databaze si najdi connection string pro Postgres.
3. Pro backend pouzij `session` / pooler variantu connection stringu, ne primo `localhost`.

### 2. Vytvor Render Web Service

1. Nahraj projekt na GitHub.
2. Na Renderu vytvor novy `Web Service` napojeny na ten GitHub repozitar.
3. Nastav:
   - `Build Command`: `pip install -r requirements.txt`
   - `Start Command`: `python app.py`
4. Pridej promenne prostredi:
   - `DATABASE_URL` = connection string ze Supabase
   - `SESSION_SECURE` = `1`
   - `APP_ORIGIN` = verejny origin aplikace, napr. `https://moje-appka.com`

### 3. Prvni admin

Po prvnim nasazeni otevri aplikaci a zaloz prvniho admina pres bootstrap formular. Potom se uz prihlasuj pres email a heslo.

## Poznamky k free planum

- Render free web service se muze uspavat po neaktivite.
- Supabase free plan ma limity na zdroje a velikost projektu.
- Pro produkci je vhodne hlidat bezpecnou hodnotu `SESSION_SECURE` a spravne nastavenou adresu aplikace.
- Pro produkci je vhodne nastavit i `APP_ORIGIN`, aby backend mohl kontrolovat puvod mutujicich requestu.

## Kdyz chces jen lokalni vyvoj

Soubor `start.bat` spusti lokalni server a otevre aplikaci v prohlizeci.
