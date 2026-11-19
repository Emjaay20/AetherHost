"""Exercise release rejection paths with controlled subprocess doubles, not live registry evidence."""
import os
import pathlib
import subprocess
import tempfile
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[2]
IMAGE = 'ghcr.io/emjaay20/aetherhost-api'
REVISION = 'a' * 40
DIGEST = 'b' * 64

class ReleaseTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.bin = pathlib.Path(self.temp.name)
        self.env = {**os.environ, 'PATH': str(self.bin) + os.pathsep + os.environ['PATH']}
        self.tool('docker', f'''#!/bin/sh
if [ "$1" = pull ]; then exit 0; fi
case "$*" in
  *RepoDigests*) echo '{IMAGE}@sha256:{DIGEST}';;
  *) echo "${{MOCK_REVISION:-{REVISION}}}";;
esac
''')
        self.tool('cosign', '''#!/bin/sh
case "$*" in
 *--certificate-identity-regexp*--certificate-oidc-issuer*) exit "${MOCK_SIGNATURE_STATUS:-0}";;
 *) exit 9;;
esac
''')

    def tool(self, name, body):
        path = self.bin / name
        path.write_text(body)
        path.chmod(0o755)

    def run_verifier(self, image=IMAGE, revision=REVISION):
        return subprocess.run(['bash', str(ROOT / 'deploy/verify-image.sh'), image, revision], env=self.env, capture_output=True, text=True)

    def test_verified_digest_is_output(self):
        result = self.run_verifier()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout.strip(), IMAGE + '@sha256:' + DIGEST)

    def test_unsigned_or_untrusted_image_rejected(self):
        self.env['MOCK_SIGNATURE_STATUS'] = '1'
        self.assertNotEqual(self.run_verifier().returncode, 0)

    def test_wrong_revision_rejected(self):
        self.env['MOCK_REVISION'] = 'c' * 40
        self.assertNotEqual(self.run_verifier().returncode, 0)

    def test_arbitrary_repository_and_shell_input_rejected(self):
        self.assertNotEqual(self.run_verifier(image='example.com/attacker/image').returncode, 0)
        self.assertNotEqual(self.run_verifier(revision='main; echo unsafe').returncode, 0)

if __name__ == '__main__':
    unittest.main()
