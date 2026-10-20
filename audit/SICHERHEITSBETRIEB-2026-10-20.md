# Sicherheitsänderungen und Betrieb

## Bereitgestellter Stand

20.10.2026: Wichtigste Befunde des Serveraudits behoben. Öffentliche Adresse: **https://91.98.29.130:3001**. Der alternative Standardport 443 ist auf dem Server konfiguriert, aber im Außenversuch nicht erreichbar; wahrscheinlich besteht eine vorgeschaltete Firewallregel. Port 3001 ist jetzt ausschließlich ein TLS-Eingang von Nginx. Das unverschlüsselte Anwendungsbackend lauscht nur auf `127.0.0.1:3002`. Das gültige Let's-Encrypt-IP-Zertifikat wird durch Certbot automatisch erneuert; die HTTP-01-Prüfung erfolgt über Port 80 und `/var/www/acme`. Eine Domain wurde nicht umgestellt.

Die andere bestehende Basketball-Webapp auf Port 80 bleibt über Nginx erreichbar. Ihre doppelte PM2-Instanz wurde gestoppt und der gleiche vorhandene systemd-Dienst aktiviert; dessen Backend lauscht nun ausschließlich auf `127.0.0.1:8080`. Die separate Anwendung auf Port 3000 wurde nicht verändert und ist nicht Bestandteil dieses Sicherheitsdeployments.

## Geschlossene Befunde

- S1: Gültiges HTTPS, HSTS, verpflichtende sichere Produktionscookies, fester zulässiger Origin, Backend nur lokal. HTTP auf dem bisherigen App-Port liefert keine Anwendung aus. Alte Sitzungen wurden nach Umstellung vollständig widerrufen.
- S2: Codeverzeichnisse 755, Dateien 644, Eigentümer root. Datenverzeichnis 700 und Datenbankdateien 600, Eigentümer ladybaskets. Die bestehenden systemd-Sandboxregeln bleiben aktiv.
- S3: Statischer Zugriff nur auf freigegebene Assets; alternative Seitenpfade sind gesperrt, nicht unterstützte Methoden erhalten 405. Lokale Tests prüfen auch eine tatsächlich zurückgezogene Seite.
- S4: Eigenes Passwort ändern, sämtliche eigenen Sitzungen beenden, Redaktionskonten sperren/freigeben, Passwörter administrativ zurücksetzen. Sperrung und Passwortwechsel widerrufen alle betroffenen Sitzungen. Superadmin kann nicht über die Kontenverwaltung gesperrt werden.
- S5: Konto- und zusätzliche IP-Limits, begrenzte gleichzeitige Passwortprüfungen, begrenzte Zählerspeicherung. Zehn Fehlversuche eines fremden Kontos sperren ein anderes Konto nicht mehr. IP-Header werden nur vom lokalen Proxy vertraut.
- S6: Strukturierte Ereignisse für Login, Konto- und Sitzungsänderungen sowie schreibende API-Aufrufe im systemd-Journal; keine Passwörter oder Sitzungstoken. Erfasst werden Zeit, Ereignis, gegebenenfalls Akteur sowie Methode/Pfad/Status. Unerwartete Fehler zeichnen ihren Typ auf.
- S7 teilweise: SSH-Passwort- und Tastaturauthentifizierung deaktiviert, Root-Schlüsselzugang bleibt aktiv und wurde erneut benutzt. Ein weiterer öffentlicher Dienst auf Port 3000 bleibt außerhalb des Anwendungsumfangs.
- S8: HTTP-Setup in Produktion ausnahmslos deaktiviert und am HTTPS-Proxy gesperrt. Lokale CLI für Ersteinrichtung vorhanden.
- Regelmäßige Sicherung ergänzt; Passwortberechnung läuft asynchron; abgelaufene Sitzungen und abgelaufene Limitzähler werden bereinigt.

## Sicherung und Wiederherstellung

`ladybaskets-backup.timer` erstellt täglich etwa 03:15 Uhr (Serverzeitzone) einen konsistenten SQLite-Snapshot unter `/var/backups/ladybaskets`. Jede Sicherung wird separat mit `PRAGMA integrity_check` und dem Zugriff auf die Anwendungstabellen geprüft. Dateien sind ausschließlich für root zugänglich. Datierte Sicherungen bleiben 30 Tage erhalten, `latest.sqlite` wird erst nach erfolgreicher Prüfung atomar ersetzt. Vor dem Deployment wurden zusätzlich Datenbank und Code gesichert.

Die Windows-Aufgabe `LadyBaskets-OffsiteBackup` kopiert täglich um 04:00 Uhr die letzte geprüfte Sicherung per SSH/SCP nach `data/server-backups` auf diesen Rechner. Der Ordner ist auf das aktuelle Windows-Konto und SYSTEM beschränkt und wird von Git ausgeschlossen. Ein erster Abruf und die anschließende tatsächliche Ausführung der geplanten Aufgabe waren erfolgreich (`LastTaskResult=0`). Der Task benötigt einen eingeschalteten Rechner, eine angemeldete ausführende Benutzeridentität und den vorhandenen funktionierenden SSH-Schlüsselzugang. Ausführung verpasster Termine ist aktiviert. Die Daten sind lokal nur durch Dateirechte geschützt; für Schutz bei Gerätediebstahl ist Laufwerksverschlüsselung sinnvoll. Die Offsite-Kopie ist weder hochverfügbar noch eine garantierte unbeaufsichtigte Sicherung bei ausgeschaltetem Rechner.

Wiederherstellung: Dienst stoppen, aktuellen Datenbankstand separat sichern, ausgewählten geprüften Snapshot als `data/club.sqlite` einsetzen, alte WAL-/SHM-Dateien nach Sicherung aus dem aktiven Datenverzeichnis nehmen, Besitzer ladybaskets und Dateimodus 600 setzen, Integrität prüfen und Dienst wieder starten. Bei Rückkehr auf einen alten Stand alle Sitzungen mit `node scripts/revoke-all-sessions.mjs --confirm` widerrufen. Danach HTTPS, Anmeldung und Inhalte prüfen. Der automatische Integritäts-/Tabellentest ist vorhanden; eine komplette Notfallwiederherstellung der Produktivinstallation wurde nicht durchgeführt.

## Verwaltung und Diagnose

- Lokal: `npm start`, anschließend `http://localhost:3000`. Keine öffentlichen Setup-Rechte vergeben. Erstkonto bei leerer Datenbank interaktiv per `node scripts/setup-admin.mjs`; auf dem Server mit dem Dienstbenutzer und dem richtigen `DB_PATH` ausführen.
- Anwendung: `systemctl status ladybaskets-webapp`, `journalctl -u ladybaskets-webapp`.
- Backups: `systemctl status ladybaskets-backup.timer`, `journalctl -u ladybaskets-backup.service`.
- Zertifikate: `/snap/bin/certbot certificates`, `/snap/bin/certbot renew --dry-run --no-random-sleep-on-renew`, `systemctl status snap.certbot.renew.timer`. Erfolgreiche Erneuerung lädt Nginx neu.
- Deployment: Paket ohne Datenbank, Umgebungsdateien oder private Schlüssel nach `/opt/ladybaskets/security-release.tar.gz` übertragen und `scripts/deploy-security.sh` ausführen. Der Host benötigt die bestehende Nginx-/Zertifikatskonfiguration. Das Skript ist auf diesen Server zugeschnitten; es beendet bei jedem Deployment alle Sitzungen. Anwendungscode bleibt root-eigen.
- SSH: `/etc/ssh/sshd_config.d/00-ladybaskets-hardening.conf`; vor Änderungen immer Schlüsselzugang prüfen. Vorherige Dienstkonfigurationen und PM2-Sicherung liegen nur auf dem Server unter `/var/backups/ladybaskets/config-before-security`.

## Prüfungen und verbleibende Arbeit

Lokal und auf dem Server: **9 Tests bestanden**. Neue Regressionen prüfen Kontosperren mit mehreren Sitzungen, Passwortwechsel und Passwortreset, Rollen, eigenen Sitzungswiderruf, deaktiviertes Setup, sichere Cookies, gesperrte statische Alternativpfade und voneinander getrennte Kontolimits. Öffentlich bestätigt: HTTPS auf Port 3001 liefert 200, Mitglieder-/Benutzer-/Seiten-API jeweils 401, Setup 403, `/seiten//teams.html` 404, neues Kontoverwaltungsmodul 200. Reines HTTP auf Port 3001 liefert 400 statt Anwendung. Produktive Konten wurden für die Prüfung nicht angelegt oder angemeldet. Die simulierte Zertifikatserneuerung (`certbot renew --dry-run`) war erfolgreich.

Die ursprünglichen Auditdateien beschreiben den Zustand vor den Korrekturen. `scripts/audit-project.mjs` ist ein historisches Reproduktionsskript und erwartet teilweise die damaligen Fehler; es darf nicht als aktuelle Sicherheitsabnahme verwendet werden. Aktuelle Regressionen: `npm test`.

Weiter offen: MFA, Versionskonfliktschutz und Historie für Artikel/Mitglieder, fachliche Aktualisierung der Datenschutz-/Anbieterinformationen, umfassende OS-/CVE-Prüfung und Neustart für einen bereits bereitstehenden neuen Kernel, unabhängige Fehler-/Backupalarmierung sowie vollständige Notfallwiederherstellungsprobe. Der Server meldete 55 aktualisierbare Pakete; diese wurden nicht pauschal mit einem Neustart aller dort betriebenen Anwendungen installiert. TLS-Port 443 kann nach Freigabe beim Hoster als Standardzugang genutzt werden; dann `PUBLIC_ORIGIN` passend ändern und den alten Zugang auf die neue Adresse umleiten.
