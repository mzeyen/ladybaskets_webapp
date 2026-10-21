# LadyBaskets Jena e.V.

Responsive Vereinswebseite mit serverseitigem CMS, Redaktionslogin und Mitgliederverwaltung. Node.js ab Version 24; Abhängigkeiten mit `npm ci` installieren.

## Lokale Tiptap-Vorschau

`npm run start:preview` startet die lokale Testinstallation auf `http://127.0.0.1:3000` mit der vorhandenen lokalen Datenbank unter `data/club.sqlite` (einschließlich bestehender Benutzerkonten). Unter `http://127.0.0.1:3000/editor-demo.html` lässt sich Tiptap ohne Anmeldung ausprobieren. Entwürfe dieser Testseite werden ausschließlich im jeweiligen Browser gespeichert. Änderungen im angemeldeten CMS werden dagegen in der lokalen Datenbank gespeichert. Mit `DB_PATH` lässt sich bei Bedarf eine separate Testdatenbank auswählen. Die HTML-Vorschau verwendet dieselbe serverseitige Bereinigung wie das CMS. Die Testseite ist nur bei ausdrücklich aktivierter lokaler Vorschau, Loopback-Zugriff und außerhalb des Produktionsmodus verfügbar.

Beiträge und normale Vereinsseiten verwenden nun Tiptap mit Überschriften, Listen, Textformatierung, Ausrichtung, Links, Tabellen, Rückgängig/Wiederholen und einer Bildauswahl aus vorhandenen lokalen Vereinsbildern. Unter **Bild → Neues Bild hochladen** lassen sich JPEG-, PNG- und WebP-Dateien bis 5 MB und 40 Megapixel hochladen. Die Bilder werden geprüft, entsprechend ihrer EXIF-Ausrichtung gedreht, ohne Vergrößerung auf maximal 2400 × 2400 Pixel begrenzt und ohne EXIF-Metadaten als WebP gespeichert. Animierte Bilder und SVG sind nicht zugelassen. Für die gestaltete Startseite bleibt der bestehende Layouteditor aktiv, damit ihre Container und der automatische Nachrichtenbereich erhalten bleiben.

Das fertige Editor-Bundle liegt unter `public/assets/editor/` und wird ausschließlich vom eigenen Server geladen. Der Server benötigt die installierten Laufzeitabhängigkeiten einschließlich Sharp (`npm ci --omit=dev` für den Betrieb). Zur Weiterentwicklung beziehungsweise zum Neubauen: `npm ci` und `npm run build:editor`. Versionen sind in `package-lock.json` fixiert; Lizenzhinweise befinden sich unter `public/assets/editor/LICENSES.txt`. Der Build erzeugt auch die lokale Bildauswahlliste anhand des Importarchivs.

Uploads liegen im Unterordner `uploads` neben der jeweils verwendeten SQLite-Datenbank, in der lokalen Vorschau unter `data/uploads`. Die Tabelle `media` speichert ihre Metadaten. Datenbank und Uploadverzeichnis sind gemeinsam zu sichern. Identische optimierte Bilder werden nur einmal gespeichert. Bilddateien sind über ihre Bildadresse abrufbar, sobald sie hochgeladen sind. Die Upload- und Mediathek-API erfordert ein berechtigtes Redaktions-/Administrationskonto; ausschließlich die ausdrücklich aktivierte Loopback-Vorschau erlaubt Tests ohne Anmeldung. Uploads bleiben auch dann in der Mediathek, wenn ein Browserentwurf zurückgesetzt wird.

## Starten

```sh
npm ci
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

Vor einer Veröffentlichung sind die noch offenen Vereins- und Hostingangaben in Impressum und Datenschutzerklärung zu bestätigen sowie Trainingsdaten und Vereinsinhalte zu aktualisieren. Automatische Unsplash-Bildabrufe wurden entfernt. Der Stand der rechtlichen Prüfung ist unter `audit/RECHTSPRUEFUNG-2026-10-21.md` dokumentiert. Unter **Kontosicherheit** können Benutzer ihr Passwort ändern und alle eigenen Sitzungen beenden. Der Superadmin kann unter **Redaktion → Verwalten** Zugänge sperren, wieder freigeben, Passwörter zurücksetzen und Sitzungen beenden. Eine automatische E-Mail-Passwortzurücksetzung und Zwei-Faktor-Authentifizierung sind noch nicht implementiert. Die Mitgliederverwaltung umfasst Stammdaten, keine Beiträge oder Zahlungsabwicklung.

Die drei vorbelegten Archivbeiträge enthalten die vollständigen Originaltexte. Beim Start werden ausschließlich unveränderte frühere Kurzfassungen anhand von Titel, Datum und exaktem Text aktualisiert. Redaktionell bearbeitete Beiträge bleiben erhalten.

## Übernommene Vereinsseiten

Unter `public/seiten` stehen 221 übernommene Seiten mit Vereinsinformationen, Team-Unterseiten, Galerie, Kontaktdaten, Sponsoren, Datenschutz, Downloads und dem paginierten Beitragsarchiv bereit. 207 Dateien, darunter sieben PDF-Dokumente, liegen lokal unter `public/assets/original`. Spielpläne und Videos verlinken auf die ursprünglichen externen Anbieter. Die Kontaktseite verwendet E-Mail- und Telefonlinks.

Die Startseite und die 221 übernommenen Seiten werden beim ersten Start einmalig in die Tabelle `pages` importiert. Unter **Vereinsbereich → Seiten** können Superadmin und Redaktion bestehende Inhalte bearbeiten, Seiten suchen und neue Seiten mit eigener Adresse anlegen. Der Editor bietet Formatierung, Links und reinen Text. Entwürfe sind nur über die angemeldete Vorschau sichtbar; veröffentlichte Seiten können optional im Menü erscheinen. Bestehende Adressen bleiben erhalten. Die Startseite bleibt veröffentlicht und ihr Nachrichtenbereich wird automatisch aus den Beiträgen befüllt. Versionsprüfungen verhindern, dass parallele Änderungen unbemerkt überschrieben werden. Inhalte liegen in der SQLite-Datenbank und werden bei Deployments nicht durch die ursprünglichen Dateien ersetzt.

Zusätzlich sind 123 echte Vereinsbeiträge aus `content/imported-news.json` im CMS und unter „Aktuelles“ verfügbar. Beim Serverstart ordnet `article_imports` jede Originalquelle einmalig einem Beitrag zu. Vorhandene Änderungen und spätere Löschungen bleiben erhalten; die drei ursprünglich vorbelegten Beiträge werden nicht dupliziert. Vier lateinische Blindtexte der alten Vorlage sind ausgeschlossen. Die Reihenfolge folgt dem Originalarchiv; nicht belegte Veröffentlichungsdaten werden als „Aus dem Vereinsarchiv“ angezeigt. Die Originalbilder und Links bleiben in den Volltexten erhalten.

`content/site-migration.json` enthält die Zuordnung der Originaladressen und die Abruffehler für zwei bereits im Original fehlende Bilder. `node scripts/prepare-news-import.mjs` erzeugt die CMS-Importdatei aus den übernommenen Seiten und dem Original-Cache neu.

`node scripts/migrate-original.mjs` wiederholt den Import aus der Originalwebsite und verwendet dabei den lokalen Cache in `.migration/cache`. Ein erneuter Import überschreibt die statischen Seiten. Die Veröffentlichung läuft als `ladybaskets-webapp.service` unter `/opt/ladybaskets/app` auf Port 3001.
