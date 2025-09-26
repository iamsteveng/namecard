import { PrismaClient } from '@prisma/client';

import logger from '../utils/logger.js';

const prisma = new PrismaClient();

async function main() {
  try {
    logger.info('Starting database seed...');

    // Create test user
    const testUser = await prisma.user.upsert({
      where: { email: 'test@namecard.app' },
      update: {},
      create: {
        email: 'test@namecard.app',
        name: 'Test User',
        cognitoId: 'test-cognito-id',
        preferences: {
          theme: 'light',
          notifications: true,
        },
      },
    });

    logger.info(`Created/updated user: ${testUser.email}`);

    // Create test companies
    const companies = await Promise.all([
      prisma.company.upsert({
        where: { name: 'Tech Corp' },
        update: {},
        create: {
          name: 'Tech Corp',
          industry: 'Technology',
          size: '500-1000',
          headquarters: 'San Francisco, CA',
          website: 'https://techcorp.com',
          description: 'Leading technology company focused on innovation.',
        },
      }),
      prisma.company.upsert({
        where: { name: 'Innovation Ltd' },
        update: {},
        create: {
          name: 'Innovation Ltd',
          industry: 'Product Development',
          size: '100-500',
          headquarters: 'Austin, TX',
          website: 'https://innovation.ltd',
          description: 'Product development and design consultancy.',
        },
      }),
      prisma.company.upsert({
        where: { name: 'Creative Studio' },
        update: {},
        create: {
          name: 'Creative Studio',
          industry: 'Design',
          size: '10-50',
          headquarters: 'New York, NY',
          website: 'https://creativestudio.com',
          description: 'Full-service creative and design agency.',
        },
      }),
    ]);

    logger.info(`Created/updated ${companies.length} companies`);

    // Create test business cards
    const cards = await Promise.all([
      prisma.card.create({
        data: {
          userId: testUser.id,
          originalImageUrl: 'https://example.com/card1.jpg',
          extractedText: 'John Smith\nSenior Developer\nTech Corp\njohn@techcorp.com\n+1-555-0123',
          confidence: 0.95,
          name: 'John Smith',
          title: 'Senior Developer',
          company: 'Tech Corp',
          email: 'john@techcorp.com',
          phone: '+1-555-0123',
          address: '123 Tech Street, San Francisco, CA 94105',
          website: 'https://techcorp.com',
          notes: 'Met at tech conference. Very knowledgeable about React.',
          tags: ['developer', 'react', 'frontend'],
          scanDate: new Date('2024-01-15'),
        },
      }),
      prisma.card.create({
        data: {
          userId: testUser.id,
          originalImageUrl: 'https://example.com/card2.jpg',
          extractedText:
            'Sarah Johnson\nProduct Manager\nInnovation Ltd\nsarah@innovation.ltd\n+1-555-0456',
          confidence: 0.92,
          name: 'Sarah Johnson',
          title: 'Product Manager',
          company: 'Innovation Ltd',
          email: 'sarah@innovation.ltd',
          phone: '+1-555-0456',
          address: '456 Innovation Ave, Austin, TX 78701',
          website: 'https://innovation.ltd',
          notes: 'Great insights on product strategy. Interested in collaboration.',
          tags: ['product', 'strategy', 'management'],
          scanDate: new Date('2024-01-20'),
        },
      }),
      prisma.card.create({
        data: {
          userId: testUser.id,
          originalImageUrl: 'https://example.com/card3.jpg',
          extractedText:
            'Michael Chen\nDesign Lead\nCreative Studio\nmichael@creativestudio.com\n+1-555-0789',
          confidence: 0.88,
          name: 'Michael Chen',
          title: 'Design Lead',
          company: 'Creative Studio',
          email: 'michael@creativestudio.com',
          phone: '+1-555-0789',
          address: '789 Creative Blvd, New York, NY 10001',
          website: 'https://creativestudio.com',
          notes: 'Amazing portfolio. Could be good for design projects.',
          tags: ['design', 'ui', 'branding'],
          scanDate: new Date('2024-01-25'),
        },
      }),
    ]);

    logger.info(`Created ${cards.length} business cards`);

    // Link cards to companies
    for (let i = 0; i < cards.length; i++) {
      await prisma.cardCompany.create({
        data: {
          cardId: cards[i].id,
          companyId: companies[i].id,
        },
      });
    }

    logger.info('Linked cards to companies');

    // Create sample calendar events
    await Promise.all([
      prisma.calendarEvent.create({
        data: {
          cardId: cards[0].id,
          title: 'Tech Conference 2024',
          eventDate: new Date('2024-01-15T10:00:00Z'),
          location: 'Moscone Center, San Francisco',
          attendees: ['john@techcorp.com', 'test@namecard.app'],
          source: 'google',
        },
      }),
      prisma.calendarEvent.create({
        data: {
          cardId: cards[1].id,
          title: 'Product Strategy Meeting',
          eventDate: new Date('2024-01-20T14:00:00Z'),
          location: 'Austin Convention Center',
          attendees: ['sarah@innovation.ltd', 'test@namecard.app'],
          source: 'outlook',
        },
      }),
    ]);

    logger.info('Created calendar events');

    // Create sample news articles
    await Promise.all([
      prisma.newsArticle.create({
        data: {
          companyId: companies[0].id,
          title: 'Tech Corp Announces Major Product Update',
          summary: 'Tech Corp releases new features that revolutionize user experience.',
          url: 'https://techcorp.com/news/major-update',
          publishedDate: new Date('2024-01-10'),
          source: 'TechCrunch',
        },
      }),
      prisma.newsArticle.create({
        data: {
          companyId: companies[1].id,
          title: 'Innovation Ltd Secures Series B Funding',
          summary: 'Company raises $50M to expand product development capabilities.',
          url: 'https://innovation.ltd/news/series-b',
          publishedDate: new Date('2024-01-18'),
          source: 'VentureBeat',
        },
      }),
    ]);

    logger.info('Created news articles');

    logger.info('Database seed completed successfully!');

    // Print summary
    const totalUsers = await prisma.user.count();
    const totalCards = await prisma.card.count();
    const totalCompanies = await prisma.company.count();

    logger.info(`Database summary:
      - Users: ${totalUsers}
      - Cards: ${totalCards}
      - Companies: ${totalCompanies}
    `);
  } catch (error) {
    logger.error('Error seeding database:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the seed function
main().catch(error => {
  console.error(error);
  process.exit(1);
});
