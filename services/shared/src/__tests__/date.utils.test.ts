import {
  formatDate,
  isValidDate,
  addDays,
  differenceInDays,
  isToday,
  isWithinRange,
} from '../utils/date.utils';

describe('Date Utils', () => {
  describe('formatDate', () => {
    const testDate = new Date('2024-01-15T10:30:00Z');

    it('should format date with medium format by default', () => {
      const result = formatDate(testDate);
      expect(result).toMatch(/Jan 15, 2024/);
    });

    it('should format date with short format', () => {
      const result = formatDate(testDate, 'short');
      expect(result).toMatch(/Jan 15, 2024/);
    });

    it('should format date with long format', () => {
      const result = formatDate(testDate, 'long');
      expect(result).toMatch(/January 15, 2024/);
    });
  });

  describe('isValidDate', () => {
    it('should return true for valid date', () => {
      const validDate = new Date('2024-01-15');
      expect(isValidDate(validDate)).toBe(true);
    });

    it('should return false for invalid date', () => {
      const invalidDate = new Date('invalid');
      expect(isValidDate(invalidDate)).toBe(false);
    });

    it('should return false for non-date values', () => {
      expect(isValidDate('2024-01-15')).toBe(false);
      expect(isValidDate(123)).toBe(false);
      expect(isValidDate(null)).toBe(false);
      expect(isValidDate(undefined)).toBe(false);
    });
  });

  describe('addDays', () => {
    it('should add days to a date', () => {
      const date = new Date('2024-01-15');
      const result = addDays(date, 5);
      expect(result.getDate()).toBe(20);
    });

    it('should subtract days from a date', () => {
      const date = new Date('2024-01-15');
      const result = addDays(date, -5);
      expect(result.getDate()).toBe(10);
    });

    it('should not modify the original date', () => {
      const date = new Date('2024-01-15');
      const originalDate = date.getDate();
      addDays(date, 5);
      expect(date.getDate()).toBe(originalDate);
    });
  });

  describe('differenceInDays', () => {
    it('should calculate difference between two dates', () => {
      const date1 = new Date('2024-01-15');
      const date2 = new Date('2024-01-20');
      expect(differenceInDays(date1, date2)).toBe(5);
      expect(differenceInDays(date2, date1)).toBe(5);
    });

    it('should return 0 for same dates', () => {
      const date = new Date('2024-01-15');
      expect(differenceInDays(date, date)).toBe(0);
    });
  });

  describe('isToday', () => {
    it('should return true for today', () => {
      const today = new Date();
      expect(isToday(today)).toBe(true);
    });

    it('should return false for different day', () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      expect(isToday(yesterday)).toBe(false);
    });
  });

  describe('isWithinRange', () => {
    const startDate = new Date('2024-01-10');
    const endDate = new Date('2024-01-20');

    it('should return true for date within range', () => {
      const dateInRange = new Date('2024-01-15');
      expect(isWithinRange(dateInRange, startDate, endDate)).toBe(true);
    });

    it('should return true for date at range boundaries', () => {
      expect(isWithinRange(startDate, startDate, endDate)).toBe(true);
      expect(isWithinRange(endDate, startDate, endDate)).toBe(true);
    });

    it('should return false for date outside range', () => {
      const dateOutside = new Date('2024-01-25');
      expect(isWithinRange(dateOutside, startDate, endDate)).toBe(false);
    });
  });
});
