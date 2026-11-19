import datetime
import importlib.util
import json
import pathlib
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('policy', pathlib.Path(__file__).with_name('check-policy.py'))
policy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(policy)

class PolicyTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = pathlib.Path(self.temp.name)
        (self.root / '.github/workflows').mkdir(parents=True)
        (self.root / 'docs/security').mkdir(parents=True)
        self.today = datetime.date(2026, 11, 19)
        self.entry = dict(id='CVE-example', owner='maintainer', reason='temporary mitigation', expires='2026-11-26', tracking='issue/example')
        self.write([self.entry])
        (self.root / '.github/workflows/ci.yml').write_text('uses: owner/action@' + 'a' * 40)

    def write(self, entries):
        (self.root / 'docs/security/vulnerability-exceptions.json').write_text(json.dumps(entries))
        (self.root / '.trivyignore').write_text('CVE-example\n')

    def test_valid_time_limited_exception(self):
        self.assertEqual(policy.validate(self.root, self.today), [])

    def test_expired_and_missing_exceptions_block(self):
        self.entry['expires'] = '2026-11-19'
        self.write([self.entry])
        self.assertTrue(policy.validate(self.root, self.today))
        self.write([])
        self.assertTrue(policy.validate(self.root, self.today))

    def test_mutable_action_and_overlong_exception_block(self):
        (self.root / '.github/workflows/ci.yml').write_text('uses: owner/action@main')
        self.assertTrue(policy.validate(self.root, self.today))
        self.entry['expires'] = '2027-01-01'
        self.write([self.entry])
        self.assertTrue(policy.validate(self.root, self.today))

if __name__ == '__main__':
    unittest.main()
