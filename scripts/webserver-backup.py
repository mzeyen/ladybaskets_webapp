#!/usr/bin/python3
"""Local encrypted backups; installed as /usr/local/lib/webserver-backup/run.py."""
import datetime
import fcntl
import json
import os
from pathlib import Path
import shutil
import sqlite3
import subprocess
import sys
import tempfile

BASE = Path('/var/backups/webserver')
STAGE = BASE / 'current'
REPO = BASE / 'repository'
KEY = Path('/etc/webserver-backup/password')
APPS = [Path('/opt/ladybaskets/app'), Path('/root/basketball_webapp'), Path('/opt/waveboard')]
os.umask(0o077)


def run(args, **kw):
    return subprocess.run(args, check=True, **kw)


def pg(args, **kw):
    return run(['runuser', '-u', 'postgres', '--', *args], **kw)


def restic(*args):
    return run(['restic', '--repo', str(REPO), '--password-file', str(KEY), *args])


def stamp():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def status(name):
    temporary = BASE / (name + '.tmp')
    temporary.write_text(stamp() + '\n')
    temporary.replace(BASE / name)


def backup():
    if shutil.disk_usage(BASE).free < 2 * 1024**3:
        raise RuntimeError('Less than 2 GiB free; refusing new backup')
    STAGE.mkdir(exist_ok=True)
    databases = STAGE / 'databases'
    databases.mkdir(exist_ok=True)
    for previous in databases.iterdir():
        if previous.is_file() and not previous.is_symlink():
            previous.unlink()
    mapping = []
    excludes = ['--exclude', str(STAGE / 'unused')]
    expected = APPS[0] / 'data/club.sqlite'
    if not expected.is_file():
        raise RuntimeError('Expected LadyBaskets database is missing')
    for app in APPS:
        if not app.is_dir():
            raise RuntimeError('Expected application directory is missing: ' + str(app))
        for folder, dirs, files in os.walk(app):
            dirs[:] = [d for d in dirs if d not in ['node_modules', '.git', 'server-backups', 'legal-backups']]
            for name in files:
                source = Path(folder) / name
                if source.suffix.lower() not in ['.db', '.sqlite', '.sqlite3']:
                    continue
                with source.open('rb') as f:
                    if f.read(16) != b'SQLite format 3\x00':
                        continue
                target = databases / (str(source).strip('/').replace('/', '__') + '.sqlite')
                target.unlink(missing_ok=True)
                with sqlite3.connect(source.as_uri() + '?mode=ro', uri=True) as src:
                    with sqlite3.connect(target) as dst:
                        src.backup(dst)
                        if dst.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
                            raise RuntimeError('SQLite integrity check failed')
                mapping.append({'source': str(source), 'snapshot': str(target)})
                for suffix in ['', '-wal', '-shm', '-journal']:
                    excludes += ['--exclude', str(source) + suffix]
    if not any(m['source'] == str(expected) for m in mapping):
        raise RuntimeError('LadyBaskets SQLite snapshot not found')
    names = pg(['psql', '-Atc', 'SELECT datname FROM pg_database WHERE NOT datistemplate AND datallowconn'], capture_output=True, text=True).stdout.splitlines()
    for i, name in enumerate(names):
        target = databases / ('postgres-' + str(i) + '.dump')
        with target.open('wb') as f:
            pg(['pg_dump', '--format=custom', '--dbname', name], stdout=f)
        run(['pg_restore', '--list', str(target)], stdout=subprocess.DEVNULL)
        mapping.append({'postgres_database': name, 'snapshot': str(target)})
    with (databases / 'postgres-globals.sql').open('wb') as f:
        pg(['pg_dumpall', '--globals-only'], stdout=f)
    (STAGE / 'manifest.json').write_text(json.dumps({'created': stamp(), 'databases': mapping}, indent=2))
    with (STAGE / 'packages.txt').open('wb') as f:
        run(['dpkg-query', '-W'], stdout=f)
    with (STAGE / 'accounts.txt').open('wb') as f:
        run(['getent', 'passwd'], stdout=f)
    with (STAGE / 'groups.txt').open('wb') as f:
        run(['getent', 'group'], stdout=f)
    # UFW's status command writes a lock in /run; preserve its configuration
    # through /etc instead of granting this backup service extra write access.
    paths = [str(STAGE), *map(str, APPS), '/opt/ladybaskets/runtime', '/etc', '/var/www', '/usr/local/lib/webserver-backup']
    if Path('/root/.pm2/dump.pm2').is_file():
        paths.append('/root/.pm2/dump.pm2')
    restic('backup', '--tag', 'webserver', '--exclude', str(KEY), '--exclude', '**/.git', '--exclude', '**/server-backups', *excludes, *paths)
    # Expiration occurs only after a successful complete backup.
    restic('forget', '--tag', 'webserver', '--group-by', 'host,tags', '--keep-within', '7d', '--keep-daily', '30', '--keep-weekly', '12', '--keep-monthly', '6')
    status('last-success')
    print('Complete local server backup succeeded')


def restore_test():
    # No production files are overwritten. Restored content stays root-private.
    restic('check', '--read-data')
    with tempfile.TemporaryDirectory(prefix='restore-', dir=BASE) as temporary:
        restic('restore', 'latest', '--tag', 'webserver', '--target', temporary, '--include', str(STAGE))
        restored = Path(temporary) / str(STAGE).lstrip('/')
        manifest = json.loads((restored / 'manifest.json').read_text())
        for database in manifest['databases']:
            snapshot = restored / Path(database['snapshot']).relative_to(STAGE)
            if 'source' in database:
                with sqlite3.connect(snapshot.as_uri() + '?mode=ro', uri=True) as db:
                    if db.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
                        raise RuntimeError('Restored SQLite integrity check failed')
            else:
                # Restore into a fresh, never served test database, then drop it.
                name = 'backup_verify_' + str(os.getpid())
                pg(['createdb', '--template=template0', name])
                try:
                    with snapshot.open('rb') as f:
                        pg(['pg_restore', '--exit-on-error', '--no-owner', '--no-acl', '--dbname', name], stdin=f)
                    pg(['psql', '--dbname', name, '-Atc', 'SELECT count(*) FROM pg_catalog.pg_class'], stdout=subprocess.DEVNULL)
                finally:
                    pg(['dropdb', name])
    status('last-restore-test')
    print('SQLite and PostgreSQL restore test succeeded')


def main():
    BASE.mkdir(parents=True, exist_ok=True, mode=0o700)
    action = sys.argv[1] if len(sys.argv) > 1 else 'backup'
    # This read-only check must also work while backup/check holds the lock.
    if action == 'watchdog':
        age = datetime.datetime.now(datetime.timezone.utc) - datetime.datetime.fromisoformat((BASE / 'last-success').read_text().strip())
        if age.total_seconds() > 7 * 3600:
            raise RuntimeError('No successful server backup in the last seven hours')
        return
    with (BASE / 'operation.lock').open('w') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        if action == 'backup':
            backup()
        elif action == 'check':
            restic('check', '--read-data-subset=10%')
            restic('prune')
            status('last-check')
        elif action == 'restore-test':
            restore_test()
        else:
            raise ValueError('Unknown backup action')


if __name__ == '__main__':
    try:
        main()
    except Exception:
        BASE.mkdir(parents=True, exist_ok=True, mode=0o700)
        status('last-failure')
        raise
