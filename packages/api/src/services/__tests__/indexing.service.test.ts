import logger from '../../utils/logger.js';
import { IndexingService } from '../indexing.service.js';
import { searchService } from '../search.service.js';

// Mock the search service
jest.mock('../search.service.js');
jest.mock('../../utils/logger.js');

// Mock Prisma client
const mockPrisma = {
  card: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    findFirst: jest.fn(),
  },
  company: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    findFirst: jest.fn(),
  },
};

describe('IndexingService', () => {
  let indexingService: IndexingService;

  beforeEach(() => {
    indexingService = new IndexingService(mockPrisma as any);
    jest.clearAllMocks();
  });

  describe('indexCard', () => {
    const mockCard = {
      id: 'card-123',
      userId: 'user-123',
      name: 'John Doe',
      title: 'Software Engineer',
      company: 'Tech Corp',
      email: 'john@example.com',
      phone: '+1234567890',
      website: 'https://johndoe.dev',
      address: '123 Tech St, Silicon Valley',
      extractedText: 'John Doe Software Engineer Tech Corp john@example.com',
      notes: 'Met at tech conference',
      tags: ['tech', 'networking'],
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-02'),
      companies: [
        {
          company: {
            id: 'company-123',
            name: 'Tech Corp',
            industry: 'Technology',
          },
        },
      ],
    };

    it('should index a card successfully', async () => {
      mockPrisma.card.findUnique.mockResolvedValue(mockCard);
      (searchService.indexDocument as jest.Mock).mockResolvedValue(undefined);

      await indexingService.indexCard('card-123');

      expect(mockPrisma.card.findUnique).toHaveBeenCalledWith({
        where: { id: 'card-123' },
        include: {
          companies: {
            include: {
              company: true,
            },
          },
        },
      });

      expect(searchService.indexDocument).toHaveBeenCalledWith({
        id: 'card-123',
        type: 'card',
        title: 'John Doe',
        content:
          'John Doe Software Engineer Tech Corp John Doe Software Engineer Tech Corp john@example.com Met at tech conference john@example.com +1234567890 https://johndoe.dev 123 Tech St, Silicon Valley Tech Corp',
        metadata: {
          userId: 'user-123',
          companyName: 'Tech Corp',
          personName: 'John Doe',
          email: 'john@example.com',
          phone: '+1234567890',
          website: 'https://johndoe.dev',
          address: '123 Tech St, Silicon Valley',
          jobTitle: 'Software Engineer',
          tags: ['tech', 'networking'],
          enriched: true,
        },
        createdAt: mockCard.createdAt,
        updatedAt: mockCard.updatedAt,
      });

      expect(logger.debug).toHaveBeenCalledWith('Successfully indexed card: card-123');
    });

    it('should handle card not found', async () => {
      mockPrisma.card.findUnique.mockResolvedValue(null);

      await indexingService.indexCard('nonexistent-card');

      expect(searchService.indexDocument).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledWith('Card not found for indexing: nonexistent-card');
    });

    it('should handle indexing errors', async () => {
      mockPrisma.card.findUnique.mockResolvedValue(mockCard);
      (searchService.indexDocument as jest.Mock).mockRejectedValue(new Error('Indexing failed'));

      await expect(indexingService.indexCard('card-123')).rejects.toThrow('Indexing failed');
      expect(logger.error).toHaveBeenCalledWith(
        'Failed to index card card-123:',
        expect.any(Error)
      );
    });

    it('should generate correct search document for card without company', async () => {
      const cardWithoutCompany = {
        ...mockCard,
        company: undefined,
        companies: [],
      };

      mockPrisma.card.findUnique.mockResolvedValue(cardWithoutCompany);
      (searchService.indexDocument as jest.Mock).mockResolvedValue(undefined);

      await indexingService.indexCard('card-123');

      const expectedDocument = expect.objectContaining({
        metadata: expect.objectContaining({
          companyName: undefined,
          enriched: false,
        }),
      });

      expect(searchService.indexDocument).toHaveBeenCalledWith(expectedDocument);
    });
  });

  describe('indexCompany', () => {
    const mockCompany = {
      id: 'company-123',
      name: 'Tech Corp',
      domain: 'techcorp.com',
      description: 'Leading technology company',
      industry: 'Technology',
      location: 'Silicon Valley',
      website: 'https://techcorp.com',
      size: 'Large',
      founded: 2010,
      createdAt: new Date('2024-01-01'),
      lastUpdated: new Date('2024-01-02'),
      cards: [{ id: 'card-123', name: 'John Doe' }],
    };

    it('should index a company successfully', async () => {
      mockPrisma.company.findUnique.mockResolvedValue(mockCompany);
      (searchService.indexDocument as jest.Mock).mockResolvedValue(undefined);

      await indexingService.indexCompany('company-123');

      expect(mockPrisma.company.findUnique).toHaveBeenCalledWith({
        where: { id: 'company-123' },
        include: {
          cards: true,
        },
      });

      expect(searchService.indexDocument).toHaveBeenCalledWith({
        id: 'company-123',
        type: 'company',
        title: 'Tech Corp',
        content:
          'Tech Corp Leading technology company Technology Silicon Valley https://techcorp.com',
        metadata: {
          domain: 'techcorp.com',
          industry: 'Technology',
          size: 'Large',
          description: 'Leading technology company',
          location: 'Silicon Valley',
          founded: 2010,
          tags: [],
          socialMedia: undefined,
        },
        createdAt: mockCompany.createdAt,
        updatedAt: undefined,
      });

      expect(logger.debug).toHaveBeenCalledWith('Successfully indexed company: company-123');
    });

    it('should handle company not found', async () => {
      mockPrisma.company.findUnique.mockResolvedValue(null);

      await indexingService.indexCompany('nonexistent-company');

      expect(searchService.indexDocument).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledWith(
        'Company not found for indexing: nonexistent-company'
      );
    });
  });

  describe('indexCards', () => {
    it('should index multiple cards successfully', async () => {
      const mockCards = [
        { id: 'card-1', name: 'John Doe', companies: [] },
        { id: 'card-2', name: 'Jane Smith', companies: [] },
      ];

      mockPrisma.card.findMany.mockResolvedValue(mockCards);
      (searchService.indexDocuments as jest.Mock).mockResolvedValue(undefined);

      await indexingService.indexCards(['card-1', 'card-2']);

      expect(mockPrisma.card.findMany).toHaveBeenCalledWith({
        where: { id: { in: ['card-1', 'card-2'] } },
        include: {
          companies: {
            include: {
              company: true,
            },
          },
        },
      });

      expect(searchService.indexDocuments).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ id: 'card-1' }),
          expect.objectContaining({ id: 'card-2' }),
        ])
      );

      expect(logger.info).toHaveBeenCalledWith('Successfully indexed 2 cards');
    });
  });

  describe('removeCard', () => {
    it('should remove card from index successfully', async () => {
      (searchService.removeDocument as jest.Mock).mockResolvedValue(undefined);

      await indexingService.removeCard('card-123');

      expect(searchService.removeDocument).toHaveBeenCalledWith('card-123', 'idx:cards');
      expect(logger.debug).toHaveBeenCalledWith('Successfully removed card from index: card-123');
    });

    it('should handle removal errors', async () => {
      (searchService.removeDocument as jest.Mock).mockRejectedValue(new Error('Removal failed'));

      await expect(indexingService.removeCard('card-123')).rejects.toThrow('Removal failed');
      expect(logger.error).toHaveBeenCalledWith(
        'Failed to remove card card-123 from index:',
        expect.any(Error)
      );
    });
  });

  describe('reindexAll', () => {
    it('should reindex all cards and companies', async () => {
      const mockCards = [
        {
          id: 'card-1',
          name: 'John Doe',
          companies: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];
      const mockCompanies = [
        {
          id: 'company-1',
          name: 'Tech Corp',
          cards: [],
          createdAt: new Date(),
          lastUpdated: new Date(),
        },
      ];

      mockPrisma.card.findMany.mockResolvedValue(mockCards);
      mockPrisma.company.findMany.mockResolvedValue(mockCompanies);
      (searchService.indexDocuments as jest.Mock).mockResolvedValue(undefined);

      await indexingService.reindexAll();

      expect(mockPrisma.card.findMany).toHaveBeenCalledWith({
        include: {
          companies: {
            include: {
              company: true,
            },
          },
        },
      });

      expect(mockPrisma.company.findMany).toHaveBeenCalledWith({
        include: {
          cards: true,
        },
      });

      expect(searchService.indexDocuments).toHaveBeenCalledTimes(2); // Cards and companies
      expect(logger.info).toHaveBeenCalledWith('Full reindex completed: 1 cards, 1 companies');
    });

    it('should handle reindex errors', async () => {
      mockPrisma.card.findMany.mockRejectedValue(new Error('Database error'));

      await expect(indexingService.reindexAll()).rejects.toThrow('Database error');
      expect(logger.error).toHaveBeenCalledWith('Full reindex failed:', expect.any(Error));
    });
  });

  describe('getIndexStats', () => {
    it('should return index statistics', async () => {
      mockPrisma.card.count.mockResolvedValue(10);
      mockPrisma.company.count.mockResolvedValue(5);
      mockPrisma.card.findFirst.mockResolvedValue({ updatedAt: new Date('2024-01-01') });
      mockPrisma.company.findFirst.mockResolvedValue({ lastUpdated: new Date('2024-01-02') });

      const stats = await indexingService.getIndexStats();

      expect(stats).toEqual({
        cards: {
          total: 10,
          lastIndexed: new Date('2024-01-01'),
        },
        companies: {
          total: 5,
          lastIndexed: new Date('2024-01-02'),
        },
      });
    });

    it('should handle null lastIndexed dates', async () => {
      mockPrisma.card.count.mockResolvedValue(0);
      mockPrisma.company.count.mockResolvedValue(0);
      mockPrisma.card.findFirst.mockResolvedValue(null);
      mockPrisma.company.findFirst.mockResolvedValue(null);

      const stats = await indexingService.getIndexStats();

      expect(stats).toEqual({
        cards: {
          total: 0,
          lastIndexed: null,
        },
        companies: {
          total: 0,
          lastIndexed: null,
        },
      });
    });
  });
});
