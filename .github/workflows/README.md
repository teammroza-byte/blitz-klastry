# Blitz Klastry

Aplikacja dla Windowsa do blokowania wybranych klastrów World of Tanks Blitz
(EU, NA, ASIA), żeby gra łączyła tylko z tymi, które wybierzesz.

## Jak działa
- Blokada to wpisy `0.0.0.0 loginN.wotblitz.eu` w pliku hosts Windowsa,
  w osobnym, oznaczonym bloku. Reszta pliku zostaje nietknięta.
- Przy pierwszym zapisie aplikacja robi kopię oryginalnego pliku hosts
  (menu **Więcej → Przywróć kopię pliku hosts**).
- **Zmierz ping** pokazuje prawdziwy ping i adres IP każdego klastra, także zablokowanego.
- Nie można zablokować wszystkich klastrów regionu naraz.
- **Kopiuj domeny** kopiuje zaznaczone adresy, np. do filtra DNS na telefonie (NextDNS, AdGuard DNS).
- Aplikacja wymaga uprawnień administratora (Windows zapyta przy uruchomieniu).

## Klastry EU (strona pomocy Wargaming, PingPlotter)
login0–login4.wotblitz.eu. Lokalizacje w aplikacji są wg graczy – najlepiej kierować się pingiem.
Nowy klaster można dopisać polem „Dodaj klaster”.

## Wskazówki
- Zamknij grę przed zmianą, uruchom ponownie po „Zastosuj”.
- Jeśli gra dalej łączy z zablokowanym klastrem, odczekaj ok. 20 minut.
- Zostaw otwarte co najmniej dwa klastry (restarty serwerów po północy).
