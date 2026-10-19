# LadyBaskets Jena e.V.

Responsive Vereinswebseite mit serverseitigem CMS, Redaktionslogin und Mitgliederverwaltung. Node.js ab Version 24; keine Paketinstallation erforderlich.

## Starten

```sh
npm start
```

Anschließend http://localhost:3000 öffnen. Unter **Vereinsbereich** einmalig ein Administrationskonto mit eigener E-Mail und einem Passwort mit mindestens 12 Zeichen erstellen. Die Ersteinrichtung ist nur vom lokalen Rechner aus möglich. Es gibt keine Standardpasswörter.

## Funktionen

- Öffentliche Nachrichten, Kategorien, Artikelansicht, Teams und Kontakt.
- Artikel erstellen, bearbeiten, löschen, als Entwurf speichern und veröffentlichen.
- PlainText und visueller Editor mit Überschriften, Fettdruck, Kursivschrift und Listen.
- Administration: Mitglieder mit Name, E-Mail, Team und Aktiv-/Passivstatus anlegen, suchen, ändern und löschen.
- Administration: zusätzliche Redaktionskonten anlegen. Diese haben keinen Zugriff auf Mitglieder oder Benutzerverwaltung.
- SQLite-Datenbank unter `data/club.sqlite`, einschließlich serverseitiger Sitzungen. Passwörter mit scrypt und individuellen Salts; HttpOnly-/SameSite-Cookies, Anmeldelimitierung und Prüfung des Anfrageursprungs.

## Prüfen

```sh
npm test
```

Integrationstest mit separater temporärer Datenbank: Einrichtung, Login, Rollen, CSRF-Abwehr, Artikel- und Mitgliederverwaltung, HTML-Bereinigung und Logout.

## Betrieb und Inhalte

Die Installation startet lokal auf `127.0.0.1:3000`. `PORT`, `HOST`, `DB_PATH` sind konfigurierbar. Für einen öffentlichen Betrieb hinter einem HTTPS-Reverse-Proxy `COOKIE_SECURE=1` setzen. Der Proxy muss den ursprünglichen Host erhalten. Datenbank und SQLite-WAL-Dateien konsistent sichern, vorzugsweise über die SQLite-Backup-Funktion oder bei gestopptem Server. Den Ordner `data` niemals öffentlich bereitstellen.

Vor einer Veröffentlichung sind vollständiges Impressum, Datenschutzerklärung, bestätigte Trainingsdaten sowie aktuelle Vereinsinhalte einzupflegen. Die enthaltenen Nachrichten sind kurze Zusammenfassungen aus dem historischen Archiv https://www.ladybaskets.de/ mit ursprünglichen Daten; es wurde keine vollständige Inhaltsmigration vorgenommen. Unsplash-Fotos sind als Symbolbilder zu verstehen und zeigen keine verifizierten Vereinsmannschaften. Kontakt verweist auf die alte Vereinsseite. Der Login bietet derzeit keine automatische Passwortzurücksetzung, Kontolöschung oder Zwei-Faktor-Authentifizierung. Die Mitgliederverwaltung umfasst Stammdaten, keine Beiträge oder Zahlungsabwicklung.

Die drei vorbelegten Archivbeiträge enthalten die vollständigen Originaltexte. Beim Start werden ausschließlich unveränderte frühere Kurzfassungen anhand von Titel, Datum und exaktem Text aktualisiert. Redaktionell bearbeitete Beiträge bleiben erhalten.

## Übernommene Vereinsseiten

Unter `public/seiten` stehen 221 übernommene Seiten mit Vereinsinformationen, Team-Unterseiten, Galerie, Kontaktdaten, Sponsoren, Datenschutz, Downloads und dem paginierten Beitragsarchiv bereit. 207 Dateien, darunter sieben PDF-Dokumente, liegen lokal unter `public/assets/original`. Spielpläne und Videos verlinken auf die ursprünglichen externen Anbieter. Die Kontaktseite verwendet E-Mail- und Telefonlinks.

Die übernommenen Seiten sind statische Inhalte. Zusätzlich sind 123 echte Vereinsbeiträge aus `content/imported-news.json` im CMS und unter „Aktuelles“ verfügbar. Beim Serverstart ordnet `article_imports` jede Originalquelle einmalig einem Beitrag zu. Vorhandene Änderungen und spätere Löschungen bleiben erhalten; die drei ursprünglich vorbelegten Beiträge werden nicht dupliziert. Vier lateinische Blindtexte der alten Vorlage sind ausgeschlossen. Die Reihenfolge folgt dem Originalarchiv; nicht belegte Veröffentlichungsdaten werden als „Aus dem Vereinsarchiv“ angezeigt. Die Originalbilder und Links bleiben in den Volltexten erhalten.

`content/site-migration.json` enthält die Zuordnung der Originaladressen und die Abruffehler für zwei bereits im Original fehlende Bilder. `node scripts/prepare-news-import.mjs` erzeugt die CMS-Importdatei aus den übernommenen Seiten und dem Original-Cache neu.

`node scripts/migrate-original.mjs` wiederholt den Import aus der Originalwebsite und verwendet dabei den lokalen Cache in `.migration/cache`. Ein erneuter Import überschreibt die statischen Seiten. Die Veröffentlichung läuft als `ladybaskets-webapp.service` unter `/opt/ladybaskets/app` auf Port 3001.
