# Uchovávání údajů v Process Tools

Správce: Miroslav Hilšer (`miroslav.hilser@alza.cz`).

Schválené lhůty pro aplikaci:

| Údaje | Počátek lhůty | Nejdelší doba |
| --- | --- | --- |
| Hlášení událostí včetně údajů o osobách | Poslední úprava záznamu (`entries.updated_at`) | 2 roky |
| Historie přihlášení včetně e-mailu, IP a prohlížeče | Vznik události (`login_events.created_at`) | 2 roky |
| Neaktivní účet, profil a související údaje | Ukončení přístupu | 2 roky |
| Aktivní účet | Po dobu potřebnou k přístupu | Po ukončení přístupu platí dvouletá lhůta |

Automatické mazání dvouletých záznamů zatím není implementováno. Do jeho zavedení je nutné pravidelně kontrolovat záznamy po lhůtě a zajistit jejich ruční odstranění; zahrnout se musí také kopie v zálohách podle jejich režimu uchovávání. Bez tohoto postupu nelze slíbenou dvouletou lhůtu dodržet. Před odstraněním účtu je nutné ověřit, zda jeho záznamy nebo historie přihlášení nemají samostatnou platnou lhůtu či důvod dalšího uchování. Tento soubor není pokyn spouštět plošné mazání databáze bez kontroly.

Zvolený právní základ a případné výjimky z dvouleté lhůty musí odpovídat skutečnému provozu. Informace na webu musí odpovídat zavedenému postupu mazání.
