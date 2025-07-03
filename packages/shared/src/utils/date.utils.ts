// Date utility functions
export const formatDate = (date: Date, format: 'short' | 'medium' | 'long' = 'medium'): string => {
  const optionsMap = {
    short: { year: 'numeric', month: 'short', day: 'numeric' } as const,
    medium: { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' } as const,
    long: { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' } as const,
  };
  
  return new Intl.DateTimeFormat('en-US', optionsMap[format]).format(date);
};

export const isValidDate = (date: any): boolean => {
  return date instanceof Date && !isNaN(date.getTime());
};

export const addDays = (date: Date, days: number): Date => {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
};

export const differenceInDays = (date1: Date, date2: Date): number => {
  const diffTime = Math.abs(date1.getTime() - date2.getTime());
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
};

export const isToday = (date: Date): boolean => {
  const today = new Date();
  return date.toDateString() === today.toDateString();
};

export const isWithinRange = (date: Date, startDate: Date, endDate: Date): boolean => {
  return date >= startDate && date <= endDate;
};