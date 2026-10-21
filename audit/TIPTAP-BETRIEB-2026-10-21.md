# Tiptap und Bilderupload

Der visuelle Editor für Beiträge und normale Vereinsseiten verwendet Tiptap 3.32.0 mit lokalem JavaScript-Bundle. Die gestaltete Startseite behält den bisherigen Layouteditor. Tabellen, Ausrichtung und lokale Bilder bleiben durch die serverseitige HTML-Bereinigung erhalten.

Der Bilderupload erlaubt JPEG, PNG und WebP bis 5 MB und 40 Megapixel. Sharp prüft und dekodiert die Dateien, richtet sie gemäß EXIF aus, verkleinert sie auf maximal 2400 × 2400 Pixel und speichert WebP ohne übernommene EXIF-Metadaten. SVG, animierte und beschädigte Bilder werden abgewiesen. Hochgeladene Bilder sind unmittelbar über ihre Bildadresse abrufbar, auch bevor sie in einem veröffentlichten Beitrag verwendet werden.

Dateien liegen unter `data/uploads` neben der jeweiligen SQLite-Datenbank; Metadaten in der Tabelle `media`. Dateien und Datenbank gemeinsam sichern. Das eingerichtete Serverbackup erfasst das Anwendungsverzeichnis einschließlich der Uploads und erstellt einen konsistenten SQLite-Snapshot. Die Mediathek kombiniert Uploads und vorhandene Archivbilder. Identische optimierte Dateien werden anhand ihres SHA-256-Hashes wiederverwendet. Ein Löschdialog für Uploads ist noch nicht enthalten.

Außerhalb der ausdrücklich aktivierten lokalen Vorschau verlangen Upload und Mediathek ein angemeldetes Redaktions-/Administrationskonto. Schreibende Aufrufe unterliegen der vorhandenen Origin-Prüfung. Die Testseite und die anonyme Vorschau sind im Produktionsmodus gesperrt.

## Lokale Vorschau

`npm run start:preview` verwendet nun standardmäßig `data/club.sqlite`, sodass vorhandene lokale Benutzerkonten funktionieren. Mit `DB_PATH` kann eine eigene Testdatenbank gewählt werden. Die Testseite unter `/editor-demo.html` speichert Entwürfe nur im Browser; die angemeldete CMS-Bearbeitung schreibt in die gewählte lokale Datenbank. Lokale Passwortänderungen werden nicht auf den Webserver übertragen und gehören nicht in Git.

## Bereitstellung

Der fertige Editor-Build und Lizenzhinweise befinden sich unter `public/assets/editor`. `node_modules` und `data` werden nicht mit Git übertragen. Auf Linux ist `npm ci --omit=dev` erforderlich, damit die passenden nativen Sharp-Abhängigkeiten installiert werden. Zum Neubauen des Browser-Bundles sind zusätzlich die Entwicklungsabhängigkeiten und `npm run build:editor` erforderlich.

`scripts/deploy-tiptap.sh` installiert den Commit zunächst in einem separaten Releaseverzeichnis, prüft alle 14 Tests und die Lesbarkeit für den Dienstbenutzer. Danach erstellt es das Serverbackup und eine Codesicherung, übernimmt den geprüften Stand und startet den Dienst neu. Bei einem Fehler nach der Übernahme wird der vorherige Programmstand wiederhergestellt. Bestehende Konten, Passwörter und Inhalte bleiben erhalten; die Tabelle `media` wird bei Bedarf ergänzt. Öffentliche Prüfungen kontrollieren Bundle, Stylesheet und die Sperren für Testseite und anonyme Mediathek.
