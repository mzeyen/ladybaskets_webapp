# Rechtliche und technische Prüfung vom 21. Oktober 2026

Geprüft wurde das lokale Websiteprojekt einschließlich CMS und Node-Server. Die produktive Website, die externe Fotogalerie, Hostingverträge und Nachweise für Veröffentlichungsrechte waren nicht Gegenstand der Prüfung. Eine vollständige rechtliche Freigabe ist mit den verfügbaren Angaben nicht möglich.

## Behobene Befunde

- Eigene Impressumsseite ergänzt und auf allen statischen Seiten sowie im CMS-Footer unmittelbar verlinkt. Vorhandene Vereinsanschrift, Kontakt und VR 1186 übernommen; fehlende Register- und Vertretungsangaben ausdrücklich als unbestätigt gekennzeichnet.
- Veraltete Datenschutzerklärung mit dem ungültigen Privacy Shield ersetzt. Nicht implementierte Newsletter, Erfolgsmessung und Marktforschung aus der Erklärung entfernt.
- Datenschutzangaben auf die implementierten Konten, Mitgliederverwaltung, Sicherheitsprotokolle, Anmeldelimitierung und Sitzungen ausgerichtet. Das Cookie `session` hat tatsächlich eine Laufzeit von acht Stunden; die Ausnahme für erforderlichen Endgerätezugriff wird mit § 25 Abs. 2 Nr. 2 TDDDG bezeichnet.
- Automatische externe Unsplash-Bildabrufe aus CSS entfernt und durch lokale CSS-Verläufe ersetzt. CSP erlaubt Bilder nur noch vom eigenen Ursprung. Bestehende Vereinsbilder bleiben lokal eingebunden.
- Alten JavaScript-Dialog mit unzutreffenden bzw. überholten Rechtshinweisen entfernt.
- Lokale CMS-Rechtstexte über `node scripts/update-legal-pages.mjs` aktualisiert. Vorheriger CMS-Inhalt liegt unter `data/legal-backups/`; die ursprüngliche statische Datenschutzerklärung ist als `audit/datenschutz-vor-pruefung-2026-10-21.html` gesichert. Bestehende Seiten werden beim normalen Start weiterhin nicht überschrieben.

## Vor Veröffentlichung zu klären

1. Registergericht für VR 1186; aktuelle Vertretungsberechtigte und konkrete Vertretungsregel anhand des Vereinsregisters bestätigen.
2. Redaktionelle Verantwortung nach § 18 Abs. 2 MStV prüfen und erforderlichenfalls Name und Anschrift ergänzen. Gegebenenfalls vorhandene Umsatzsteuer-ID bestätigen.
3. Hosting- und E-Mail-Anbieter, Serverstandorte, Empfänger und mögliche Drittlandübermittlungen sowie zugehörige Garantien feststellen. Auftragsverarbeitungsverträge prüfen. Erforderlichkeit eines Datenschutzbeauftragten klären.
4. Tatsächliche Löschfristen und Umsetzung für Zugriffs- und Sicherheitsprotokolle, Konten, Mitgliederdaten und Backups bestätigen. Keine pauschale siebentägige Log-Löschung zugesichert, deren Umsetzung nicht belegt ist.
5. Rechte und Rechtsgrundlagen für importierte Fotos, Texte, Logos und Downloads einschließlich Einwilligungen bei Kinderfotos prüfen. Solche Nachweise lassen sich aus dem Quellcode nicht ableiten.
6. Externe Fotogalerie separat auf Datenschutz und Veröffentlichungsrechte prüfen.

## Übernahme in bestehende Installationen

Quelldateien aktualisieren und Anwendung neu starten, damit Templates und CSP geladen werden. Die CMS-Inhalte bestehender Installationen werden mit `node scripts/update-legal-pages.mjs` gezielt aktualisiert (`DB_PATH` bei abweichendem Datenbankpfad). Das Skript sichert die vorherigen Rechtsseiten und erhöht die CMS-Versionen; es ersetzt deren Text, erhält aber bestehende Veröffentlichungszustände. Die produktive Installation wurde im Rahmen dieser Prüfung nicht verändert.

## Rechtsquellen

- Anbieterkennzeichnung: https://www.gesetze-im-internet.de/ddg/__5.html
- Erforderlicher Endgerätezugriff: https://www.gesetze-im-internet.de/ttdsg/__25.html
- DSGVO, insbesondere Art. 6, 13 und 44 ff.: https://eur-lex.europa.eu/eli/reg/2016/679/oj?locale=de
- Ungültigkeit des Privacy Shield: https://www.datenschutzkonferenz-online.de/media/pm/20200616_pm_schrems2.pdf
- Beschwerde und Hilfestellungen: https://tlfdi.de/infothek/hilfestellungen-und-mustervorlagen-zur-ds-gvo/

Diese Texte sind Vorlagen. Vor der Veröffentlichung durch eine Anwältin oder einen Anwalt prüfen lassen.
