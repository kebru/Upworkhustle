# Upwork HTML Fixtures

Dieses Verzeichnis enthält **manuell exportierte HTML-Snippets** (z. B. via DevTools „Copy element“) als **Fixtures**.
Ziel ist, die DOM-Struktur der Upwork-Seiten reproduzierbar zu testen (Parser/Extraktion), ohne jedes Mal live auf Upwork zuzugreifen.

## Dateien
- `search_jobs.entry_level.html`: Beispiel für `nx/search/jobs` (Search Results / Job Tiles).
- `upwork_jobs.feed.html`: Beispiel für den Feed/Best-Matches Flow (wenn vorhanden).

## Best Practices
- **Keine Secrets**: Niemals API Keys, Cookies oder Tokens in Fixtures speichern.
- **Datenschutz**: Wenn möglich, personenbezogene Daten entfernen/anonymisieren.
- **Stabilität**: Fixtures sind Momentaufnahmen – Upwork kann DOM-Strukturen ändern. Bei Parser-Bugs neue Fixtures hinzufügen statt alte zu überschreiben.

