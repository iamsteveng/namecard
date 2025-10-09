const DEMO_EMAIL = Cypress.env('demoEmail') ?? 'demo@namecard.app';
const DEMO_PASSWORD = Cypress.env('demoPassword') ?? 'DemoPass123!';

const expectApiSuccess = <T = Record<string, unknown>>(response: Cypress.Response<any>) => {
  expect(response.body).to.have.property('success', true);
  expect(response.body).to.have.property('data');
  return response.body.data as T;
};

const loginAndGetToken = () =>
  cy
    .request({
      method: 'POST',
      url: '/v1/auth/login',
      body: {
        email: DEMO_EMAIL,
        password: DEMO_PASSWORD,
      },
    })
    .then((response) => {
      const data = expectApiSuccess<{ session: { accessToken: string } }>(response);
      expect(data).to.have.nested.property('session.accessToken');
      return data.session.accessToken;
    });

describe('Cards API', () => {
  it('confirms the cards service health endpoint is reachable', () => {
    cy.request('/v1/cards/health').then((response) => {
      expect(response.status).to.eq(200);
      const data = expectApiSuccess<{
        service: string;
        status: string;
        metrics: Record<string, unknown>;
      }>(response);
      expect(data).to.have.property('service', 'cards');
      expect(data).to.have.property('status', 'ok');
    });
  });

  it('lists cards for the demo user', () => {
    loginAndGetToken().then((token) => {
      cy.request({
        method: 'GET',
        url: '/v1/cards',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }).then((response) => {
        expect(response.status).to.eq(200);
        const data = expectApiSuccess<{ cards: unknown[]; pagination: Record<string, unknown> }>(
          response
        );
        expect(data)
          .to.have.property('cards')
          .and.to.be.an('array');
        expect(data).to.have.property('pagination');
      });
    });
  });

  it('returns card statistics for the demo user', () => {
    loginAndGetToken().then((token) => {
      cy.request({
        method: 'GET',
        url: '/v1/cards/stats',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }).then((response) => {
        expect(response.status).to.eq(200);
        const data = expectApiSuccess<{ stats: { totalCards?: number } }>(response);
        expect(data).to.have.nested.property('stats.totalCards');
      });
    });
  });

  it('performs a search query against the card index', () => {
    loginAndGetToken().then((token) => {
      cy.request({
        method: 'GET',
        url: '/v1/cards/search',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        qs: {
          q: 'demo',
        },
      }).then((response) => {
        expect(response.status).to.eq(200);
        const data = expectApiSuccess<{ results: unknown[]; searchMeta: Record<string, unknown> }>(
          response
        );
        expect(data)
          .to.have.property('results')
          .and.to.be.an('array');
        expect(data).to.have.property('searchMeta');
      });
    });
  });
});
