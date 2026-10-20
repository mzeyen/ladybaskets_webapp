# LadyBaskets Jena e.V.

Responsive Vereinswebseite mit serverseitigem CMS, Redaktionslogin und Mitgliederverwaltung. Node.js ab Version 24; keine Paketinstallation erforderlich.

## Starten

```sh
npm start
```

Anschließend http://localhost:3000 öffnen. Falls noch kein Konto existiert, auf dem lokalen Rechner interaktiv `node scripts/setup-admin.mjs` ausführen. Das Passwort wird verdeckt abgefragt (12 bis 256 Zeichen); es gibt keine Standardpasswörter. Die HTTP-Ersteinrichtung ist standardmäßig deaktiviert und in Produktion immer gesperrt. Für isolierte Entwicklungs-/Testinstallationen kann sie ausdrücklich mit `ALLOW_SETUP=1` eingeschaltet werden.

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

Die Installation startet lokal auf `127.0.0.1:3000`. `PORT`, `HOST`, `DB_PATH` sind konfigurierbar. Produktion erfordert `COOKIE_SECURE=1` und eine explizite HTTPS-Adresse in `PUBLIC_ORIGIN`; andernfalls startet der Dienst nicht. Der Reverse-Proxy erhält den Host und überschreibt `X-Real-IP`; nur beim ausschließlich lokal erreichbaren Backend darf `TRUST_PROXY=loopback` gesetzt werden. Den Ordner `data` niemals öffentlich bereitstellen. Betrieb und Wiederherstellung sind unter [Sicherheitsbetrieb](audit/SICHERHEITSBETRIEB-2026-10-20.md) beschrieben.

Unter **Anmelden** oder `/#vereinsbereich` können sich bestehende Benutzer mit E-Mail und Passwort anmelden. Die einmalige Einrichtung ist eine separate Option und wird nur angeboten, solange noch kein Konto existiert. Das erste vorhandene Administrationskonto wird beim Start als **Superadmin** übernommen; sein Passwort bleibt erhalten. Nur dieser kann unter **Redaktion** neue Redaktionskonten erstellen. Redakteure können Beiträge verwalten, haben aber keinen Zugriff auf Benutzer- oder Mitgliederverwaltung.

Vor einer Veröffentlichung sind vollständiges Impressum, Datenschutzerklärung, bestätigte Trainingsdaten sowie aktuelle Vereinsinhalte einzupflegen. Unsplash-Fotos sind als Symbolbilder zu verstehen und zeigen keine verifizierten Vereinsmannschaften. Unter **Kontosicherheit** können Benutzer ihr Passwort ändern und alle eigenen Sitzungen beenden. Der Superadmin kann unter **Redaktion → Verwalten** Zugänge sperren, wieder freigeben, Passwörter zurücksetzen und Sitzungen beenden. Eine automatische E-Mail-Passwortzurücksetzung und Zwei-Faktor-Authentifizierung sind noch nicht implementiert. Die Mitgliederverwaltung umfasst Stammdaten, keine Beiträge oder Zahlungsabwicklung.

Die drei vorbelegten Archivbeiträge enthalten die vollständigen Originaltexte. Beim Start werden ausschließlich unveränderte frühere Kurzfassungen anhand von Titel, Datum und exaktem Text aktualisiert. Redaktionell bearbeitete Beiträge bleiben erhalten.

## Übernommene Vereinsseiten

Unter `public/seiten` stehen 221 übernommene Seiten mit Vereinsinformationen, Team-Unterseiten, Galerie, Kontaktdaten, Sponsoren, Datenschutz, Downloads und dem paginierten Beitragsarchiv bereit. 207 Dateien, darunter sieben PDF-Dokumente, liegen lokal unter `public/assets/original`. Spielpläne und Videos verlinken auf die ursprünglichen externen Anbieter. Die Kontaktseite verwendet E-Mail- und Telefonlinks.

Die Startseite und die 221 übernommenen Seiten werden beim ersten Start einmalig in die Tabelle `pages` importiert. Unter **Vereinsbereich → Seiten** können Superadmin und Redaktion bestehende Inhalte bearbeiten, Seiten suchen und neue Seiten mit eigener Adresse anlegen. Der Editor bietet Formatierung, Links und reinen Text. Entwürfe sind nur über die angemeldete Vorschau sichtbar; veröffentlichte Seiten können optional im Menü erscheinen. Bestehende Adressen bleiben erhalten. Die Startseite bleibt veröffentlicht und ihr Nachrichtenbereich wird automatisch aus den Beiträgen befüllt. Versionsprüfungen verhindern, dass parallele Änderungen unbemerkt überschrieben werden. Inhalte liegen in der SQLite-Datenbank und werden bei Deployments nicht durch die ursprünglichen Dateien ersetzt.

Zusätzlich sind 123 echte Vereinsbeiträge aus `content/imported-news.json` im CMS und unter „Aktuelles“ verfügbar. Beim Serverstart ordnet `article_imports` jede Originalquelle einmalig einem Beitrag zu. Vorhandene Änderungen und spätere Löschungen bleiben erhalten; die drei ursprünglich vorbelegten Beiträge werden nicht dupliziert. Vier lateinische Blindtexte der alten Vorlage sind ausgeschlossen. Die Reihenfolge folgt dem Originalarchiv; nicht belegte Veröffentlichungsdaten werden als „Aus dem Vereinsarchiv“ angezeigt. Die Originalbilder und Links bleiben in den Volltexten erhalten.

`content/site-migration.json` enthält die Zuordnung der Originaladressen und die Abruffehler für zwei bereits im Original fehlende Bilder. `node scripts/prepare-news-import.mjs` erzeugt die CMS-Importdatei aus den übernommenen Seiten und dem Original-Cache neu.

`node scripts/migrate-original.mjs` wiederholt den Import aus der Originalwebsite und verwendet dabei den lokalen Cache in `.migration/cache`. Ein erneuter Import überschreibt die statischen Seiten. Die Veröffentlichung läuft als `ladybaskets-webapp.service` unter `/opt/ladybaskets/app` auf Port 3001.
