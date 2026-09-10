# Process Homepage

Společný rozcestník procesních nástrojů, které usnadňují každodenní práci týmu.
Zahrnuje evidenci incidentů a Near Miss událostí, pracovní checklisty a Check APP pro kontrolu dat.
Aplikace se postupně rozšiřuje o další pomocníky a nástroje podle potřeb týmu.
Frontend a Python backend používají přihlášení emailem a heslem, serverové session a správu účtů.

## Co aplikace umi

- Prihlaseni pres serverovou session
- Rucni zalozeni prvniho admina pri prvnim spusteni
- Sprava dalsich uzivatelu s roli `admin`
- Evidence chyb a near missu
- Editace, mazani a zmena stavu zaznamu
- Kanban i tabulkove zobrazeni
- Pracovní checklisty pro AlzaBoxy, trasy a dropshipment
- Check APP pro porovnání pořadí z Excelu a konzole s exportem výsledků do CSV

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

## Check APP

Stránka `#check-app` je dostupná z rozcestníku a hlavní navigace všem přihlášeným uživatelům.
Porovnává pořadí na trase podle kódu `AB` následovaného číslicemi. Korekce času se stejně jako
v desktopové Check APP neporovnává. Duplicitní kódy jsou označeny k ruční kontrole.

- Referenční data: XLSX, XLS, CSV, TSV nebo TXT. V Excelu se automaticky vybere nejlépe odpovídající list.
- Druhý vstup: export ve stejných formátech nebo tabulka vložená přes Ctrl+V, včetně původního textového výpisu.
- Filtry výsledků, hledání AB kódu, stránkování po 100 položkách a export celého reportu CSV.
- Čtení a porovnání běží pouze v prohlížeči ve Web Workeru. Data se neodesílají ani neukládají do databáze,
  localStorage nebo na server. Odhlášení, vymazání dat a obnovení stránky je odstraní z UI.
- Limit 10 MB na vstup, 50 000 datových řádků, 200 sloupců v Excelu a 60 sekund na zpracování.
- Knihovna SheetJS CE 0.20.3 je přiložena v `vendor/` včetně licence Apache-2.0. Načítá se až při porovnání.
  Nasazení používá současnou službu Render; nepotřebuje nové proměnné prostředí ani migraci databáze.

Testy: `node tests/check-core.test.cjs` a `node tests/check-worker.test.cjs`.
Testovací sešity pro ruční kontrolu vytvoří `node tests/check-worker.test.cjs --fixtures` do ignorované složky `.check-preview/`.

## Teams integrace – nastavení

Projekt ted obsahuje callback pro **Microsoft Teams Outgoing Webhook** na adrese `/api/teams/outgoing-webhook`.

Co to umi:

- prijme dotaz z Teams kanalu pres `@mention`
- overi HMAC podpis z Teams
- projde tabulku `entries`
- vrati nejpodobnejsi incidenty nebo near miss záznamy

Co musis udelat ty:

1. Nastav verejne dostupnou HTTPS adresu aplikace.
2. V Teams zaloz **Outgoing Webhook** a jako callback URL dej `https://tvoje-domena/api/teams/outgoing-webhook`.
3. Z Teams si vezmi podpisovy klic webhooku a nastav ho jako promenou prostredi `TEAMS_OUTGOING_WEBHOOK_SECRET`.
4. Spust aplikaci znovu.

Poznamka:

- Outgoing Webhook funguje v kanalech v teamu, ne v soukromem 1:1 chatu.
- Pokud chces opravdu soukromy bot do chatu, bude dalsi krok Azure Bot / Bot Framework. Tenhle projekt na to uz ma hotovou vyhledavaci logiku, ale samotne Teams cloud napojeni je dalsi integracni krok.
