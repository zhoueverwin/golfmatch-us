import { isValidVideoUri } from '../components/VideoPlayer';

describe('VideoPlayer URL Validation', () => {
  describe('isValidVideoUri', () => {
    it('should validate correct HTTP URLs', () => {
      const validUrls = [
        'https://example.com/video.mp4',
        'https://storage.supabase.co/object/public/videos/test.mp4',
        'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
        'http://example.com/video.mov',
      ];

      for (const url of validUrls) {
        expect(isValidVideoUri(url)).toBe(true);
      }
    });

    it('should validate file:// URLs', () => {
      const validUrls = [
        'file:///path/to/video.mp4',
        'file://localhost/video.mov',
      ];

      for (const url of validUrls) {
        expect(isValidVideoUri(url)).toBe(true);
      }
    });

    it('should reject invalid URLs', () => {
      const invalidUrls = [
        '',
        'not-a-url',
        'http://',
        'https://',
        'file://',
        'ftp://example.com/video.mp4',
        'javascript:alert(1)',
        null,
        undefined,
      ];

      for (const url of invalidUrls) {
        expect(isValidVideoUri(url as any)).toBe(false);
      }
    });

    it('should reject malformed URLs', () => {
      const malformedUrls = [
        'http:/example.com',
        'https//example.com',
        'http:example.com',
      ];

      for (const url of malformedUrls) {
        expect(isValidVideoUri(url)).toBe(false);
      }
    });
  });
});

