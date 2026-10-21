# Wiederherstellung der Symbolbilder

Die bei der Rechtsprüfung entfernten Unsplash-Motive werden wieder verwendet, jetzt als lokale JPEG-Dateien unter `public/assets/unsplash/`. Bildquellen und Lizenz sind in `public/assets/unsplash/SOURCES.md` dokumentiert. Die restriktive CSP (`img-src 'self'`) bleibt erhalten; es sind keine externen Bildabrufe erforderlich.

Das Startseitenmotiv und die Ersatzbilder für Beitragskarten sind wiederhergestellt. Die Ersatzbilder wiederholen sich für sämtliche Karten, auch nach „Alle Beiträge ansehen“. Eigene Vereinsbilder bleiben vorrangig. Alte Grafikbeschriftungen in bereits gespeicherten CMS-Startseiten werden beim Rendern gezielt korrigiert, ohne redaktionelle Inhalte in der Datenbank zu überschreiben.

Deployment: Die geänderten Dateien und lokalen Bilder als `images-release.tar.gz` nach `/opt/ladybaskets/` übertragen und `scripts/deploy-images.sh` ausführen. Das Skript sichert die bisherigen geänderten Programmdateien, prüft alle Tests und startet den Dienst neu. Datenbank und Rechtstexte werden nicht migriert. Bei Fehlern werden die bisherigen Programmdateien wiederhergestellt.

Diese Korrektur ersetzt die Entfernung der Bilder, die im Bericht `RECHTSPRUEFUNG-2026-10-21.md` beschrieben ist. Offene Vereins- und Hostingangaben bleiben bestehen.
