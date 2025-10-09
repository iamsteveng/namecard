const DEMO_EMAIL = Cypress.env('demoEmail') ?? 'demo@namecard.app';
const DEMO_PASSWORD = Cypress.env('demoPassword') ?? 'DemoPass123!';

const expectApiSuccess = <T = Record<string, unknown>>(response: Cypress.Response<any>) => {
  expect(response.body).to.have.property('success', true);
  expect(response.body).to.have.property('data');
  return response.body.data as T;
};

type SessionPayload = {
  accessToken: string;
  refreshToken: string;
  expiresAt?: string;
};

const login = () =>
  cy
    .request({
      method: 'POST',
      url: '/v1/auth/login',
      body: {
        email: DEMO_EMAIL,
        password: DEMO_PASSWORD,
      },
    })
    .then((response) => expectApiSuccess<{ user: unknown; session: SessionPayload }>(response));

describe('Auth API', () => {
  it('logs in the demo user and returns tokens', () => {
    login().then((data) => {
      expect(data).to.have.property('user');
      expect(data).to.have.nested.property('session.accessToken').and.to.be.a('string');
      expect(data).to.have.nested.property('session.refreshToken').and.to.be.a('string');
    });
  });

  it('retrieves the current profile with a valid access token', () => {
    login().then((loginData) => {
      const token = loginData.session.accessToken as string;

      cy.request({
        method: 'GET',
        url: '/v1/auth/profile',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }).then((profileResponse) => {
        const profileData = expectApiSuccess<{ profile: { email: string } }>(profileResponse);
        expect(profileData).to.have.nested.property('profile.email', DEMO_EMAIL);
      });
    });
  });

  it('refreshes a session using the refresh token', () => {
    login().then((loginData) => {
      const refreshToken = loginData.session.refreshToken as string;

      cy.request({
        method: 'POST',
        url: '/v1/auth/refresh',
        body: { refreshToken },
      }).then((refreshResponse) => {
        const refreshData = expectApiSuccess<{
          accessToken: string;
          refreshToken: string;
        }>(refreshResponse);
        expect(refreshData).to.have.property('accessToken').and.to.be.a('string');
        expect(refreshData).to.have.property('refreshToken').and.to.be.a('string');
      });
    });
  });

  it('logs out and invalidates the access token', () => {
    login().then((loginData) => {
      const token = loginData.session.accessToken as string;

      cy.request({
        method: 'POST',
        url: '/v1/auth/logout',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }).then((logoutResponse) => {
        expectApiSuccess(logoutResponse);

        cy.request({
          method: 'GET',
          url: '/v1/auth/profile',
          headers: {
            Authorization: `Bearer ${token}`,
          },
          failOnStatusCode: false,
        }).its('status').should('eq', 401);
      });
    });
  });

  it('rejects invalid credentials', () => {
    cy
      .request({
        method: 'POST',
        url: '/v1/auth/login',
        body: {
          email: 'invalid@example.com',
          password: 'wrong-password',
        },
        failOnStatusCode: false,
      })
      .then((response) => {
        expect(response.status).to.eq(401);
        expect(response.body).to.have.property('success', false);
        expect(response.body)
          .to.have.nested.property('error.code')
          .and.to.eq('INVALID_CREDENTIALS');
        expect(response.body)
          .to.have.nested.property('error.message')
          .and.to.be.a('string');
    });
  });
});
