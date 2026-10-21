# Eingerichtete lokale Serversicherung

Am 21. Oktober 2026 auf ausdrücklichen Wunsch eingerichtet: Sicherungen auf dem Webserver selbst in einem anderen Pfad, ohne Abhängigkeit von Windows. Diese Umsetzung weicht von der vorgeschlagenen externen Backupstrategie ab: Sie schützt nicht vor Verlust oder vollständiger Kompromittierung dieses Servers und seiner Festplatte.

## Speicher und Schutz

- Verschlüsseltes, dedupliziertes Restic-Repository: `/var/backups/webserver/repository`.
- Private Arbeitskopien der aktuellen Datenbankexporte: `/var/backups/webserver/current`. Diese Arbeitsdateien sind nicht zusätzlich verschlüsselt, aber nur für root zugänglich.
- Backupkennwort: `/etc/webserver-backup/password`, nur root-lesbar, vom Repository ausgeschlossen. Eine unabhängige sichere Verwahrung dieses Kennworts durch den Betreiber ist noch erforderlich. Keine Kennwörter in Git oder in diesem Dokument.
- Ausführung: `/usr/local/lib/webserver-backup/run.py`; systemd-Units unter `/etc/systemd/system/webserver-*`.
- Vorhandene LadyBaskets-Sicherungen bleiben erhalten; Windows-Aufgaben wurden nicht verändert und werden von der neuen Einrichtung nicht benötigt.

## Umfang

Gesichert werden LadyBaskets unter `/opt/ladybaskets/app`, die Basketballanwendung unter `/root/basketball_webapp`, Waveboard unter `/opt/waveboard`, die Node-Laufzeit, `/etc`, `/var/www`, das neue Backupskript sowie die vorhandene PM2-Prozessdefinition. Paket-, Benutzer- und Gruppenlisten sowie ein Manifest sind enthalten. Dies ist eine datei- und datenbankbasierte Sicherung, kein bootfähiges vollständiges Festplattenabbild.

SQLite-Dateien in den Anwendungsverzeichnissen werden über die SQLite-Backup-API konsistent exportiert. Aktive Quelldatenbanken und deren WAL-/SHM-/Journaldateien werden nicht zusätzlich als inkonsistente Dateikopie gesichert. PostgreSQL-Datenbanken `postgres` und `basketball_webapp` werden als Custom-Dumps exportiert; Rollen und globale Einstellungen zusätzlich per `pg_dumpall --globals-only`. Zukünftige verbindbare, nicht als Template markierte PostgreSQL-Datenbanken werden ebenfalls exportiert.

Die Anwendungen bleiben während der Sicherung verfügbar. Die einzelnen Datenbankexporte sind konsistent; eine anwendungsübergreifende gemeinsame Transaktion einschließlich gleichzeitig veränderter Dateien wird nicht zugesichert. Vor Migrationen mit zusammengehörigen Datei-/Datenbankänderungen zusätzlich einen abgestimmten Sicherungspunkt anlegen.

## Zeitplan – Europe/Berlin

| Timer | Funktion |
| --- | --- |
| `webserver-backup.timer` | Täglich 00:15, 06:15, 12:15 und 18:15 Uhr |
| `webserver-check.timer` | Sonntags 03:30 Uhr: Repositoryprüfung mit 10 % Datenleseprüfung, anschließend Speicherbereinigung |
| `webserver-restore-test.timer` | Am Monatsersten 04:30 Uhr: vollständige Repository-Datenprüfung und Datenbank-Wiederherstellungstest |
| `webserver-watchdog.timer` | Stündlich um :45 Uhr: Fehler, wenn letzter vollständiger Erfolg mehr als sieben Stunden zurückliegt |

Alle Timer sind aktiviert und holen verpasste Kalenderausführungen nach. Aufbewahrung: sämtliche Stände für sieben Tage, danach 30 Tages-, 12 Wochen- und sechs Monatsstände. Ein ausbleibender Sicherungslauf führt nicht zur automatischen Löschung des letzten erfolgreichen Stands. Bei weniger als 2 GiB freiem Speicher wird kein neuer Sicherungslauf begonnen.

## Prüfung und Grenzen

Erster vollständiger Snapshot und Integritätsprüfung erfolgreich; Repository nach dem ersten Lauf rund 332 MB. Ein Restore des verschlüsselten Backups in ein privates Testverzeichnis war erfolgreich. SQLite wurde erneut auf Integrität geprüft. Beide PostgreSQL-Dumps wurden in neue temporäre Testdatenbanken eingespielt; diese wurden anschließend entfernt. Produktivdaten wurden nicht überschrieben. Alle drei Anwendungsdienste liefen danach weiter.

Eine komplette Wiederherstellung der Anwendungen auf einem Ersatzserver einschließlich HTTP, Anmeldung, Zertifikaten und DNS ist noch nicht erprobt. Der Datenbanktest ersetzt diese Notfallübung nicht.

Fehler erscheinen im systemd-Journal und als fehlgeschlagener Dienst; Zeitmarken stehen unter `/var/backups/webserver/last-success`, `last-check`, `last-restore-test` und bei Fehlern `last-failure`. Eine Fehlerzeitmarke dokumentiert auch behobene frühere Fehler und wird deshalb nicht als aktueller Gesamtstatus interpretiert. Es ist keine externe Alarmzustellung eingerichtet, weil kein Empfänger vorliegt. Bei Serverausfall kann eine ausschließlich dort laufende Überwachung nicht benachrichtigen.

## Bedienung

```sh
systemctl list-timers 'webserver-*'
systemctl start webserver-backup.service
systemctl start webserver-restore-test.service
journalctl -u webserver-backup.service -n 50 --no-pager
restic --repo /var/backups/webserver/repository --password-file /etc/webserver-backup/password snapshots
```

Für eine manuelle Wiederherstellung zunächst einen separaten privaten Zielordner anlegen und `restic restore <snapshot-id> --target <zielordner>` mit Repository und Passwortdatei aufrufen. Produktivdateien nicht ungeprüft überschreiben. Zugehörige Datenbankexporte und Originalpfade stehen im wiederhergestellten Manifest unter `var/backups/webserver/current/manifest.json`. Dienste für die tatsächliche Rücksicherung anhalten; Rollen/Rechte, zusammengehörige Datenstände und Sitzungswiderruf beachten.

Installationsquellen im Projekt: `scripts/webserver-backup.py` und `scripts/install-webserver-backup.sh`. Die neue Einrichtung wurde nicht zu GitHub hochgeladen.
