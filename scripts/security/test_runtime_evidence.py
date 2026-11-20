import datetime
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('runtime_evidence', Path(__file__).with_name('collect-runtime-evidence.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
IMAGE = 'ghcr.io/emjaay20/aetherhost-api@sha256:' + 'a' * 64

class RuntimeEvidenceTests(unittest.TestCase):
    def test_observes_digest_and_hardening_without_copying_environment(self):
        data = dict(image=IMAGE, user='node', readonly=True, cap_drop=['ALL'], security_opt=['no-new-privileges:true'], env=['TOKEN=never-export'])
        result = module.validate_container(data, IMAGE)
        self.assertTrue(result['matches_release'])
        self.assertTrue(result['non_root'])
        self.assertTrue(result['readonly_root'])
        self.assertTrue(result['drops_all_capabilities'])
        self.assertTrue(result['no_new_privileges'])
        self.assertNotIn('never-export', json.dumps(result))

    def test_mutable_or_mismatched_images_do_not_pass(self):
        result = module.validate_container(dict(image='ghcr.io/emjaay20/aetherhost-api:latest', user='0'), IMAGE)
        self.assertFalse(result['matches_release'])
        self.assertFalse(result['non_root'])
        self.assertFalse(result['readonly_root'])
        self.assertEqual(result['image'], 'non-immutable-reference')

    def test_unavailable_inventory_is_not_success(self):
        self.assertEqual(module.validate_container({}, IMAGE)['status'], 'unavailable')

    def test_effective_sudo_summary_distinguishes_broad_authority(self):
        self.assertTrue(module.sudo_summary('    (ALL : ALL) NOPASSWD: ALL', 0)['broad_all_commands_grant'])
        self.assertFalse(module.sudo_summary('    (root) NOPASSWD: /srv/aetherhost/control/deploy/deploy-production.sh', 0)['broad_all_commands_grant'])
        self.assertEqual(module.sudo_summary('', 1)['status'], 'unavailable')

    def test_snapshot_age_enforces_recovery_point_without_exporting_paths(self):
        now = datetime.datetime(2026, 11, 20, 12, tzinfo=datetime.timezone.utc)
        recent = module.snapshot_summary([{'time': '2026-11-20T01:00:00Z', 'paths': ['/private/customer']}], now)
        stale = module.snapshot_summary([{'time': '2026-11-18T01:00:00Z'}], now)
        self.assertTrue(recent['within_24h'])
        self.assertFalse(stale['within_24h'])
        self.assertNotIn('/private/customer', json.dumps(recent))

    def test_future_or_missing_snapshot_does_not_pass(self):
        now = datetime.datetime(2026, 11, 20, 12, tzinfo=datetime.timezone.utc)
        self.assertFalse(module.snapshot_summary([{'time': '2026-11-21T01:00:00Z'}], now)['within_24h'])
        self.assertEqual(module.snapshot_summary([], now)['status'], 'unavailable')

    def test_scan_must_match_running_digest_and_only_exports_severity_counts(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'api.json'
            path.with_suffix('.image').write_text(IMAGE)
            path.write_text(json.dumps({'Results': [{'Vulnerabilities': [{'Severity': 'HIGH', 'Description': 'private-value'}]}]}))
            result = module.scan_summary(path, IMAGE, datetime.datetime.now(datetime.timezone.utc))
            self.assertTrue(result['matches_release'])
            self.assertEqual(result['findings'], {'HIGH': 1, 'CRITICAL': 0})
            self.assertNotIn('private-value', json.dumps(result))
            self.assertFalse(module.scan_summary(path, IMAGE + '0', datetime.datetime.now(datetime.timezone.utc))['matches_release'])

if __name__ == '__main__':
    unittest.main()
