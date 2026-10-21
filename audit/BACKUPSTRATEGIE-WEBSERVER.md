# Backupstrategie für den Webserver

Stand: 21. Oktober 2026. Zielsystem: Webserver 91.98.29.130. Dieses Dokument beschreibt den vorgesehenen Betrieb; die neuen Sicherungen sind damit noch nicht eingerichtet.

## Ziel und Geltungsbereich

Die Sicherung läuft vollständig zwischen dem Linux-Webserver und einem unabhängigen Backupziel. Ein Windows-Rechner ist weder für Sicherungen noch für Zeitplanung oder Überwachung erforderlich.

Ziele: maximal sechs Stunden Datenverlust bei erfolgreicher externer Sicherung und Wiederherstellung der wichtigsten Website innerhalb von vier Stunden nach Bereitstellung eines Ersatzservers und Zugang zu den Schlüsseln. Die Wiederherstellungszeit ist ein Planungsziel und muss durch einen Probelauf belegt werden. Bei fehlgeschlagenen Backups erhöht sich der mögliche Datenverlust entsprechend.

Der gesamte Webserver ist einzubeziehen: LadyBaskets unter `/opt/ladybaskets/app`, die weitere Basketballanwendung hinter Port 80 sowie die Anwendung auf Port 3000. Pfade, Datenbanken und Abhängigkeiten der beiden weiteren Anwendungen müssen vor Einrichtung inventarisiert werden. Das bisherige LadyBaskets-Skript ist kein vollständiges Serverbackup.

## Vorhandener Stand

Laut vorhandener Betriebskonfiguration erstellt `ladybaskets-backup.timer` täglich eine LadyBaskets-SQLite-Sicherung unter `/var/backups/ladybaskets`. Das Skript `scripts/backup-server.mjs` erzeugt mit `VACUUM INTO` einen konsistenten Snapshot und prüft ihn mit `PRAGMA integrity_check` und Zugriffen auf Anwendungstabellen. Datierte Sicherungen werden nach 30 Tagen entfernt.

Diese Sicherung liegt auf demselben Server und schützt allein nicht vor dessen Verlust oder vollständiger Kompromittierung. Die dokumentierte Windows-Kopie ist kein Bestandteil der hier vorgeschlagenen Strategie. Der aktuelle Timer- und Sicherungsstatus ist vor der Umstellung auf dem Server zu kontrollieren.

## Architektur

1. Der Webserver erzeugt konsistente Datenbanksnapshots und ein Sicherungsmanifest in einem privaten Arbeitsverzeichnis.
2. Ein serverseitiger systemd-Dienst sichert diese Snapshots zusammen mit Dateien und Konfiguration verschlüsselt mittels Restic auf einen unabhängigen Backupserver.
3. Der Backupserver steht in einem anderen Ausfallbereich, möglichst bei einem anderen Anbieter. Er stellt einen authentifizierten Restic-REST-Endpunkt über HTTPS im Append-only-Modus bereit. Datenhaltung bevorzugt in der EU; Anbieter und vertragliche Bedingungen sind vor Einrichtung festzulegen.
4. Der Webserver erhält ausschließlich den für dieses Repository erforderlichen Zugang. Ein separater administrativer Zugang auf dem Backupserver führt Aufbewahrung, Bereinigung und Prüfungen aus. Löschberechtigte Zugangsdaten werden nicht auf dem Webserver gespeichert.
5. Ergänzende Hoster-Snapshots helfen bei schnellen Rückfällen vor Systemupdates. Sie ersetzen die unabhängige Sicherung nicht.

Append-only erschwert das Löschen bestehender Sicherungen über den Webserver-Zugang. Es ersetzt weder die Absicherung des Backupservers noch ein getrenntes Administrationskonto. Der Backupserver muss Schreibrechte auf den Repository-Dateien entsprechend begrenzen. Speicherauslastung und auffällige Datenzunahme sind zu überwachen.

## Sicherungsumfang

| Bestandteil | Sicherung |
| --- | --- |
| Datenbanken aller Anwendungen | Konsistenter Datenbankexport beziehungsweise Snapshot mit dem jeweiligen Datenbankwerkzeug |
| LadyBaskets-CMS und Mitglieder | SQLite-Snapshot einschließlich Seiten, Beiträgen, Konten, Rollen und Mitgliederdaten |
| Bilder, Uploads, Downloads und sonstige Nutzdateien | Dateien aller Anwendungen, einschließlich Dateien außerhalb von Git |
| Anwendung und Laufzeit | Bereitgestellter Programmstand, Commit-ID, Node-Version, Paket-/Versionslisten und erforderliche Buildartefakte |
| Nginx und systemd | Relevante Konfiguration, Units, Overrides und Timer |
| Betriebssystemkonfiguration | Paketquellen/-liste, Firewallregeln, benötigte Benutzer/UIDs/GIDs, Rechte und Verzeichnisstruktur |
| Geheimnisse und TLS | Benötigte Umgebungs-/Zugangsdateien und Zertifikatskonfiguration ausschließlich innerhalb der verschlüsselten Sicherung; Berechtigungen beibehalten |
| Wiederanlauf | Wiederherstellungsanleitung, Dienstabhängigkeiten und Inventar der Anwendungen |

Nicht pauschal sichern: `/proc`, `/sys`, `/dev`, `/run`, Caches, temporäre Dateien und das gesamte eigene Backupverzeichnis. Stattdessen wird nur der aktuelle geprüfte Snapshot-Satz aufgenommen, um alte Backups nicht wiederholt mitzunehmen. Sicherheitsprotokolle benötigen eine separat definierte, angemessene Aufbewahrung.

Eine laufende SQLite-Datenbank samt WAL/SHM darf nicht durch unkoordinierte Dateikopien als vermeintlich konsistentes Backup behandelt werden. Native Sicherungswerkzeuge verwenden. Falls Datenbank und veränderliche Uploads zusammengehören, Schreibzugriffe für den gemeinsamen Sicherungszeitpunkt kurz aussetzen oder einen konsistenten gemeinsamen Snapshot herstellen.

## Zeitplan und Aufbewahrung

Alle Zeiten ausdrücklich in `Europe/Berlin` konfigurieren und Sommerzeitverhalten bei Einrichtung prüfen.

| Vorgang | Zeitplan | Aufbewahrung |
| --- | --- | --- |
| Datenbanksnapshots und anschließendes externes Backup aller relevanten Änderungen | 00:15, 06:15, 12:15 und 18:15 Uhr | Sämtliche erfolgreichen Sicherungsstände der letzten 7 Tage |
| Ältere externe Stände | Auswahl aus denselben Sicherungen | 30 Tagesstände, 12 Wochenstände, 6 Monatsstände |
| Lokale Datenbanksnapshots für schnelle Rücksicherung | Vor jedem externen Lauf | 7 Tage; Bereinigung nach erfolgreicher externer Sicherung |
| Sicherung vor Deployment/Datenmigration | Unmittelbar vor Änderung | Mindestens 14 Tage extern erhalten, z. B. durch ein gesondertes Tag |
| Hoster-Snapshot | Vor Betriebssystemupdates | Wenige aktuelle Stände nach festgelegter Rotation |

Die tatsächliche Retention muss vor Aktivierung anhand vorhandener Mitgliederdaten und des Löschkonzepts bestätigt werden. Backups sind kein unbegrenztes Archiv. Die Regeln auf dem Backupziel werden getrennt vom Webserver ausgeführt. Das bestehende 30-Tage-Skript muss für den neuen lokalen Rhythmus angepasst werden; es erfüllt diese Rotation noch nicht.

## Ablauf eines Sicherungslaufs

1. Mit einer Sperre parallele Sicherungs-/Bereinigungsläufe verhindern; verfügbaren Speicher und Erreichbarkeit des Ziels prüfen.
2. In einem neuen privaten Arbeitsverzeichnis konsistente Snapshots aller Datenbanken erzeugen.
3. Integrität, erwartete Tabellen und Anwendbarkeit der Exporte prüfen. Manifest mit Zeitpunkt, Anwendungsversionen, Dateigrößen und Prüfsummen erstellen. Keine Geheimnisse in Protokollen ausgeben.
4. Geprüfte Snapshots und den definierten Datei-/Konfigurationsbestand verschlüsselt auf das externe Repository sichern.
5. Erst bei erfolgreichem Abschluss einschließlich aller Anwendungen einen Erfolgszeitpunkt an die unabhängige Überwachung melden.
6. Temporäre Dateien beseitigen und alte lokale Sicherungen gemäß Rotation bereinigen. Bei Fehlern den letzten geprüften Stand erhalten, alarmieren und zeitnah erneut versuchen.

## Schutz und Schlüsselverwaltung

- Dienste mit festen Pfaden, restriktiven Dateirechten und systemd-Härtung betreiben; Zugriff nur auf benötigte Daten. Benötigte Root-Rechte für Konfigurationssicherungen begrenzen.
- Transport per HTTPS, zusätzlich Restic-Verschlüsselung für Inhalte und Metadaten.
- Backupkennwort und Zielzugang nicht in Git, Shell-Historie oder lesbaren Logs speichern. Auf dem Webserver nur für den Sicherungsdienst zugänglich machen.
- Wiederherstellungsschlüssel und Notfallzugänge zusätzlich unabhängig vom Webserver in einem Passwortmanager und gegebenenfalls einem versiegelten Offline-Notfallbestand verwahren. Verantwortliche Personen benennen. Ein Schlüssel nur auf dem zu sichernden Server genügt nicht.
- Zugriff auf Mitgliederdaten und Sicherungen auf berechtigte Personen begrenzen. Nach einer Kompromittierung auch Geheimnisse und Zugangsdaten wechseln.

## Überwachung und Wiederherstellungstests

Eine unabhängige Überwachung meldet ausgebliebene erfolgreiche Backups spätestens sieben Stunden nach dem letzten Erfolg. Alarmierung muss auch bei komplett ausgefallenem Webserver funktionieren. Weitere Alarme: fehlgeschlagene Integritätsprüfung, knappes Speichervolumen, fehlende Anwendungsdaten oder unerwartet stark veränderte Sicherungsgrößen. Empfänger und Meldekanal sind vor Einrichtung festzulegen; eine systemd-Fehlermeldung allein genügt nicht.

Wöchentlich Repository-Struktur prüfen und einen wechselnden Teil der gespeicherten Daten lesen. Vollständige Datenprüfung im passenden Turnus nach Datenmenge planen. Monatlich eine Anwendung aus dem externen Backup in eine isolierte Umgebung zurückspielen und Datenbank, Bilder, Seiten, Rollen und Anmeldung prüfen. Wiederhergestellte Anwendungen dürfen keine echten E-Mails oder sonstigen produktiven Aktionen auslösen. Vierteljährlich und nach wesentlichen Infrastrukturänderungen den vollständigen Wiederaufbau auf einem Ersatzserver proben und Dauer sowie Probleme protokollieren.

## Wiederanlauf nach Serververlust

1. Sauberen Ersatzserver bereitstellen, Zugang absichern und benötigte Laufzeiten installieren.
2. Geprüften Sicherungsstand anhand Zeitpunkt, Manifest und Integrität auswählen und zunächst isoliert wiederherstellen.
3. Datenbanken und Dateien gemeinsam zurückspielen; Benutzer, Eigentümer und Rechte korrekt setzen. Geheimnisse sicher einspielen beziehungsweise nach einem Angriff erneuern.
4. Alte Anmeldesitzungen widerrufen. Aufbewahrte Lösch-/Sperrvorgaben auf wiederhergestellte personenbezogene Daten anwenden, damit alte Backups keine bereits erledigten Löschungen rückgängig machen.
5. Anwendungen zunächst intern prüfen, danach HTTPS, DNS und öffentliche Erreichbarkeit aktivieren.
6. Backup und Überwachung auf dem Ersatzserver aktivieren und ihren Erfolg nachweisen.

## Noch erforderliche Entscheidungen für die Einrichtung

- Unabhängiges Backupziel mit ausreichendem Speicher und administrativ getrenntem Zugang.
- Vollständiges Inventar der weiteren Anwendungen, Datenbanken und Datenverzeichnisse.
- Verantwortliche Personen, Aufbewahrungsfreigabe, Alarmempfänger und sicher hinterlegte Wiederherstellungsschlüssel.
- Erstes vollständiges Backup und erfolgreicher Wiederherstellungstest vor Ablösung bisheriger Sicherungswege.

## Technische Referenzen

- Restic: https://restic.net/
- Restic REST Server und Append-only-Betrieb: https://github.com/restic/rest-server
- SQLite-Sicherungsverfahren: https://www.sqlite.org/backup.html
