# Sicherheitsaudit der produktiven LadyBaskets-Webapp

Stand: 20.10.2026, Prüfung etwa 18:32–18:34 Uhr MESZ. Ziel: `91.98.29.130:3001`, Dienst `ladybaskets-webapp.service`, Installation `/opt/ladybaskets/app`.

## Ergebnis

**Für den Betrieb mit Anmeldungen und personenbezogenen Mitgliederdaten besteht dringender Handlungsbedarf.** Zwei hohe Betriebsrisiken sind bestätigt: unverschlüsselter öffentlicher HTTP-Zugang und für alle lokalen Benutzer beschreibbarer Anwendungscode. Zusätzlich bestehen Fehler bei der Auslieferung zurückgezogener Seiten sowie Lücken bei Kontoverwaltung und Nachvollziehbarkeit.

Es wurden keine Produktivdaten geändert, keine Konten angelegt und keine Anmeldeversuche gegen Produktion ausgeführt. Serverseitig erfolgten ausschließlich lesende SSH-Abfragen; öffentlich wenige HTTP-GET-/HEAD-Anfragen. Fehler mit Schreibzugriff wurden ausschließlich mit synthetischen Konten in einer temporären lokalen Datenbank reproduziert. Vorhandene Arbeitsänderungen blieben erhalten.

## Methode und Aussagegrenzen

- Server: systemd-Konfiguration, offene Listener, UFW, Dateirechte, Timer/Cron-Dateinamen, Sicherungsdateinamen, effektive SSH-Grundkonfiguration und letzte Dienstmeldungen.
- Außenprüfung: HTTP-Header, geschützte APIs, ausgewählte sensible Dateipfade und alternative Seitenadresse.
- Quellcode: `server.mjs`, `auth.mjs`, `pages.mjs`, Tests und Deployment-Skripte. SHA-256 dieser drei Module stimmt zwischen lokalem Arbeitsstand und Server überein; dadurch sind die lokalen Reproduktionen für diese produktiven Module relevant. Andere Dateien wurden nicht vollständig abgeglichen.
- `npm.cmd test`: **7/7 erfolgreich**. `node scripts/audit-project.mjs`: alle enthaltenen Audit-Prüfungen erfolgreich, einschließlich Nachweis der unten beschriebenen Fehler. Diese Prüfungen erwarten teilweise bewusst den unsicheren Istzustand und sind kein Sicherheitsfreigabenachweis.
- Kein Belastungstest, keine vollständige XSS-Prüfung, keine Prüfung aller Serverdienste, keine Einsicht in Mitglieder- oder Passwortdaten, keine Wiederherstellung, kein Nachweis oder Ausschluss einer früheren Kompromittierung. Ein möglicher vorgeschalteter externer HTTPS-Dienst oder weitere Domains wurden nicht ermittelt. Der direkte HTTP-Zugang bleibt unabhängig davon nachgewiesen.
- Node auf Server: v24.22.0; lokale Tests: v26.1.0. Keine vollständige CVE-/Betriebssystem-Patchprüfung durchgeführt.

## Priorisierte Sicherheitsbefunde

### S1 – Hoch: Öffentlich erreichbare Anmeldung ohne erzwungenes HTTPS

**Nachweis:** `http://91.98.29.130:3001/` antwortet extern mit 200 ohne HTTPS-Weiterleitung. Dienst bindet `HOST=0.0.0.0`, Port 3001 ist in UFW für alle freigegeben. Kein Listener auf 443 in der geprüften Serveransicht. `COOKIE_SECURE` fehlt in der systemd-Unit; der abgeglichene Code setzt `Secure` ausschließlich bei `COOKIE_SECURE=1`. Die tatsächliche Umgebung des laufenden Prozesses und ein echter Login-Cookie wurden nicht ausgelesen.

**Folge:** Bei Nutzung der HTTP-Adresse können Netzwerkangreifer Passwörter, Sitzungen und nach Anmeldung Mitgliederdaten mitlesen oder Antworten manipulieren. HttpOnly und SameSite verschlüsseln den Transport nicht.

**Maßnahme:** HTTPS mit gültigem Zertifikat an der vorgesehenen Domain einrichten, HTTP umleiten, App auf Loopback binden und öffentlichen Port 3001 schließen. Sichere Cookies in Produktion erzwingen; HSTS nach erfolgreicher HTTPS-Einrichtung aktivieren. Das entspricht den Empfehlungen zur [TLS-Absicherung](https://cheatsheetseries.owasp.org/cheatsheets/Transport_Layer_Security_Cheat_Sheet.html) und zu [Sitzungscookies](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html) von OWASP.

**Abnahme:** Öffentlich funktioniert nur HTTPS bzw. HTTP-Weiterleitung; direkter Backend-Port ist extern gesperrt; Login setzt `Secure; HttpOnly; SameSite=Strict`.

### S2 – Hoch: Anwendungscode für alle lokalen Benutzer beschreibbar

**Nachweis:** `/opt/ladybaskets/app` hat Modus **777**; `server.mjs` und `auth.mjs` haben **666**, Eigentümer jeweils `ladybaskets:ladybaskets`. Elternverzeichnisse `/opt` und `/opt/ladybaskets` sind 755.

**Folge:** Andere lokale Benutzer bzw. kompromittierte Dienste mit passenden Dateisystemzugriffen können den Code ändern oder Dateien ersetzen. Beim nächsten Start wird manipulierter Code als Dienstbenutzer ausgeführt; Zugriff auf Sitzungen und Mitgliederdaten wäre möglich. Es ist keine von außen bestätigte Codeausführung. Die systemd-Schreibsperre schützt die Dienstinstanz, nicht andere Prozesse auf dem Host.

**Maßnahme:** Code und Verzeichnisse unter administrativem Eigentum mit 644/755 halten, Schreibzugriff auf benötigte Datenverzeichnisse begrenzen und Deployment-Rechte entsprechend trennen. Alle ausgelieferten Dateien auf gleiche Fehlkonfiguration kontrollieren.

**Zusatz:** Datenbank und WAL haben 666, das Datenverzeichnis jedoch 700. Daher ist ein Zugriff beliebiger lokaler Benutzer auf die Datenbank derzeit durch das Verzeichnis blockiert; eine pauschale Behauptung öffentlich lesbarer Mitgliederdaten wäre falsch. Dateirechte trotzdem auf 600 korrigieren. `UMask=0077` korrigiert bestehende Dateien nicht rückwirkend.

**Abnahme:** Unprivilegierte andere Benutzer können Code weder ändern noch ersetzen; Datenbankzugriff bleibt auf berechtigte Identitäten begrenzt.

### S3 – Mittel: Statische Originalseiten umgehen den CMS-Veröffentlichungsstatus

**Nachweis:** Öffentlich liefert `/seiten//teams.html` 200. Lokal liefert nach Umstellung der Teamseite auf Entwurf die kanonische Adresse 404, die Adresse mit doppeltem Schrägstrich dagegen 200 mit dem statischen Originaltext. Auch POST auf die normale Adresse liefert lokal die Originaldatei. In Produktion wurde kein Veröffentlichungsstatus verändert.

**Folge:** Zurückgezogene oder korrigierte importierte Inhalte bleiben über alternative Pfade verfügbar. Neue, ausschließlich in der Datenbank vorhandene Entwürfe wurden damit nicht ausgelesen.

**Maßnahme/Abnahme:** Seiten ausschließlich über CMS-Routing ausliefern; statischen Zugriff auf freigegebene Assets beschränken, Pfade normalisieren und andere Methoden ablehnen. Eine zurückgezogene importierte Seite darf auch mit alternativen Pfaden und Methoden keinen Originalinhalt liefern.

### S4 – Hoch: Kontosperrung, Passwortänderung und globaler Sitzungswiderruf fehlen

**Nachweis:** Benutzer-API bietet Liste und Anlage, aber keine Deaktivierung, Löschung oder Passwortänderung. Lokal liefert Benutzerlöschung 404. Sitzungen gelten acht Stunden; Logout entfernt nur die übergebene Sitzung.

**Folge:** Ausgeschiedene oder kompromittierte Redaktionskonten lassen sich über die Anwendung nicht sofort entziehen. Abhilfe erfordert manuelle Datenbankarbeit.

**Maßnahme/Abnahme:** Konto deaktivieren, Passwort ändern/zurücksetzen und sämtliche Sitzungen eines Kontos widerrufen können; letzten Superadmin schützen. Nach Deaktivierung müssen bestehende Cookies sofort wirkungslos sein. MFA für privilegierte Konten ergänzen, entsprechend [OWASP-Authentifizierungsempfehlungen](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html).

### S5 – Mittel: Login-Begrenzung ermöglicht gemeinsame Aussperrung

**Nachweis:** Lokal sperren zehn Fehlversuche einer Socket-IP auch die richtige Anmeldung eines anderen Kontos mit 429. Zähler liegen nur im Arbeitsspeicher. Der aktuelle direkte Betrieb betrifft insbesondere gemeinsame Internetanschlüsse; bei Einführung eines lokalen Proxys ohne Anpassung teilen potenziell alle Besucher dieselbe Socket-IP.

**Maßnahme/Abnahme:** Begrenzte Konto-, IP- und Gesamtlimits kombinieren; Proxyadressen nur aus vertrauenswürdiger Konfiguration übernehmen. Ein Angreifer darf nicht alle unabhängigen Konten mit zehn Anfragen sperren können. Kein Produktions-Brute-Force-Test ausgeführt.

### S6 – Mittel: Sicherheitsprotokolle und verlässliche Fehlerdiagnose fehlen

**Nachweis:** Kein strukturiertes Protokoll für Anmeldung, Benutzeranlage oder Inhaltsänderungen im geprüften Code. Der globale Fehlerfänger antwortet pauschal 400 ohne interne Fehleraufzeichnung. Die geprüften Dienstmeldungen zeigen Start-/Stop-Ereignisse.

**Maßnahme/Abnahme:** Sicherheitsereignisse mit Zeitpunkt, Akteur, Aktion und Ergebnis aufzeichnen; Serverfehler intern unterscheiden und alarmieren. Keine Passwörter, Sitzungstoken oder vollständigen Mitgliederdatensätze protokollieren. Retention und Zugriff regeln.

### S7 – Mittel: Weitere öffentlich freigegebene Dienste und SSH-Passwortauthentifizierung

**Nachweis:** Zusätzlich lauschen Dienste auf 80 und 3000 auf öffentlichen Interfaces; UFW erlaubt 22/80/3000/3001 allgemein. Die Dienste auf 80/3000 wurden nicht inhaltlich auditiert. `sshd -T` meldet `passwordauthentication yes`, `permitrootlogin without-password`, `pubkeyauthentication yes`; Fail2ban ist aktiv. Root-Passwortlogin ist nach dieser Konfiguration untersagt. Benutzer-/Adress-spezifische Match-Regeln wurden nicht separat ausgewertet.

**Maßnahme/Abnahme:** Bedarf und Zuständigkeit der weiteren Webdienste klären, unnötige Freigaben schließen, SSH nach Prüfung vorhandener Schlüsselzugänge möglichst auf Schlüssel und geeignete Quellnetze/VPN begrenzen. Vor jeder Änderung Zugangserhalt sicherstellen. Das Vorhandensein dieser Dienste belegt allein keine ausnutzbare Schwachstelle.

### S8 – Bedingt kritisch: Ersteinrichtung hinter künftigem lokalen Proxy

**Nachweis:** Produktion meldet `/api/session`: `setup:false`; damit aktuell keine offene Ersteinrichtung. Lokal kann bei leerer Datenbank ein externer Aufruf über einen Loopback-Proxy das erste Superadmin-Konto anlegen, weil nur die Socket-IP geprüft wird.

**Maßnahme/Abnahme:** Einrichtung per lokalem CLI oder explizitem einmaligem Geheimnis durchführen; öffentliche Setup-Route sperren. Vor Einführung des für S1 benötigten Proxys berücksichtigen. Auch bei leerer Datenbank darf ein öffentlicher Besucher kein Administrationskonto erzeugen.

## Fehlende Funktionen und Betriebsnachweise

| Priorität | Lücke | Empfehlung und Abnahme |
|---|---|---|
| Hoch | Kontosperre, Passwortwechsel, Widerruf aller Sitzungen | Siehe S4; unverzüglicher Zugriffsentzug testen |
| Hoch | Geplante getrennte Sicherungen und geprüfte Wiederherstellung nicht nachgewiesen | Release-Snapshots sind auf demselben Server vorhanden. In den geprüften Timern und Cron-Dateinamen ist kein anwendungsspezifischer Backupjob erkennbar; externe Sicherungen bleiben offen. Regelmäßige konsistente SQLite-Backups, getrennte Aufbewahrung, Aufbewahrungsfristen und Restore-Test nachweisen |
| Mittel | MFA für Administration | TOTP oder WebAuthn mit sicherem Wiederherstellungsprozess |
| Mittel | Versionsschutz und Historie für Artikel/Mitglieder | Seiten besitzen Versionsschutz; Artikel lassen sich lokal mit veraltetem Stand überschreiben. Versionsprüfung, 409 bei Konflikt und Wiederherstellbarkeit ergänzen |
| Mittel | Wartungs- und Alarmierungskonzept | Patchstand von OS, Node und übrigen Diensten prüfen; Verfügbarkeit, Speicher, Backupfehler und Sicherheitsereignisse überwachen |
| Mittel | Begrenzte Ressourcenpflege | Synchrone scrypt-Berechnung blockiert den Hauptthread; abgelaufene Sitzungen und IP-Zähler werden nicht allgemein bereinigt. Asynchrone Berechnung und begrenzte Bereinigung ergänzen; keine Überlastung produktiv getestet |
| Mittel | Auf Installation abgestimmte Datenschutz-/Anbieterinformationen | Importierter Text nennt nicht implementierte Newsletterfunktionen; CSS nutzt externe Unsplash-Bilder. Angaben und tatsächliche Verarbeitung einschließlich Mitgliederverwaltung fachlich prüfen, Impressum klar zugänglich machen; keine juristische Abnahme |
| Niedrig | Eigene Artikeladressen, Sitemap, Suchmaschinenmetadaten | Artikel überwiegend per JavaScript/Dialog; Sitemap und robots.txt fehlen lokal. Produktverbesserung, keine Sicherheitslücke |
| Nach Bedarf | Beiträge/Zahlungen und Mitglieder-Selbstbedienung | Nicht implementiert, laut README außerhalb der bisherigen Stammdatenverwaltung |

## Positiv bestätigte Schutzmaßnahmen

- Extern: `/api/members`, `/api/users`, `/api/pages` liefern anonym **401**; `/data/club.sqlite`, `/.env`, `/server.mjs` liefern **404**.
- Sicherheitsheader CSP, nosniff, Frame-Sperre und Referrer-Policy sind öffentlich vorhanden.
- Abgeglichener Code verwendet scrypt mit individuellen Salts, zufällige serverseitige Sitzungen, parametrisierte SQL-Abfragen und Origin-Prüfung. HttpOnly/SameSite sind im Code gesetzt; der echte Produktionscookie wurde nicht durch Anmeldung getestet.
- Dienst läuft als eigener Benutzer mit `NoNewPrivileges`, `PrivateTmp`, `ProtectSystem=strict`, `ProtectHome`, begrenztem `ReadWritePaths` und UMask 0077.
- UFW ist aktiv mit standardmäßig gesperrtem Eingang; PostgreSQL lauscht nur lokal. Fail2ban ist aktiv; konkrete Schutzwirkung nicht getestet.
- Lokal: sieben Bestandstests erfolgreich; 222 initiale CMS-Seiten und 432 lokale Link-/Assetziele erreichbar. HTML-Bereinigung vorhanden, jedoch regexbasiert und nicht umfassend gegen alle XSS-Varianten geprüft.

## Umsetzungsreihenfolge

1. HTTPS/Backend-Abschirmung und Code-Dateirechte korrigieren; Setup-Schutz bei Proxy-Einführung berücksichtigen.
2. Kontosperre, Passwortwechsel und Sitzungswiderruf bereitstellen; Sicherungs- und Wiederherstellungsverfahren nachweisen.
3. Statischen CMS-Ausweichpfad und Login-Limits beheben; Regressionstests ergänzen.
4. Sicherheitsprotokolle, MFA, Konfliktschutz und Betriebsüberwachung ergänzen; Datenschutzinhalte abstimmen.

Der vorhandene lokale Detailbericht `AUDIT-2026-10-20.md` und `evidence-2026-10-20.json` dokumentieren ergänzende isolierte Reproduktionen. Dessen damalige Aussagen „keine Produktionsprüfung“ gelten für diesen älteren Bericht; die vorliegende Datei ergänzt die tatsächlich erhobenen Serverbefunde. Keine Behebung oder Veröffentlichung wurde mit diesem Audit durchgeführt.
