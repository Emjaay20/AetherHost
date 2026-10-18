import { parseGithubOwnerRepo, normalizeRepoFullName } from './github-utils';

describe('github-utils', () => {
  describe('parseGithubOwnerRepo', () => {
    it('parses standard https github URL', () => {
      const res = parseGithubOwnerRepo('https://github.com/Emjaay20/Smart-Crawler-II');
      expect(res).toEqual({ owner: 'Emjaay20', repo: 'Smart-Crawler-II' });
    });

    it('parses https URL with .git suffix', () => {
      const res = parseGithubOwnerRepo('https://github.com/Emjaay20/Smart-Crawler-II.git');
      expect(res).toEqual({ owner: 'Emjaay20', repo: 'Smart-Crawler-II' });
    });

    it('parses https URL with trailing slash', () => {
      const res = parseGithubOwnerRepo('https://github.com/Emjaay20/Smart-Crawler-II/');
      expect(res).toEqual({ owner: 'Emjaay20', repo: 'Smart-Crawler-II' });
    });

    it('parses git ssh format', () => {
      const res = parseGithubOwnerRepo('git@github.com:Emjaay20/Smart-Crawler-II.git');
      expect(res).toEqual({ owner: 'Emjaay20', repo: 'Smart-Crawler-II' });
    });

    it('parses owner/repo shorthand', () => {
      const res = parseGithubOwnerRepo('Emjaay20/Smart-Crawler-II');
      expect(res).toEqual({ owner: 'Emjaay20', repo: 'Smart-Crawler-II' });
    });

    it('returns null for null or invalid inputs', () => {
      expect(parseGithubOwnerRepo(null)).toBeNull();
      expect(parseGithubOwnerRepo('')).toBeNull();
      expect(parseGithubOwnerRepo('invalid-url-with-no-slash')).toBeNull();
    });
  });

  describe('normalizeRepoFullName', () => {
    it('normalizes various URL formats to lowercase owner/repo', () => {
      expect(normalizeRepoFullName('https://github.com/Emjaay20/Smart-Crawler-II.git')).toBe(
        'emjaay20/smart-crawler-ii',
      );
      expect(normalizeRepoFullName('https://github.com/Emjaay20/Smart-Crawler-II')).toBe(
        'emjaay20/smart-crawler-ii',
      );
      expect(normalizeRepoFullName('git@github.com:Emjaay20/Smart-Crawler-II.git')).toBe(
        'emjaay20/smart-crawler-ii',
      );
      expect(normalizeRepoFullName('Emjaay20/Smart-Crawler-II')).toBe(
        'emjaay20/smart-crawler-ii',
      );
    });

    it('returns null for empty or invalid input', () => {
      expect(normalizeRepoFullName(undefined)).toBeNull();
      expect(normalizeRepoFullName('')).toBeNull();
    });
  });
});
