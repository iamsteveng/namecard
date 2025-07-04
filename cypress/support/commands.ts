// Custom Cypress commands
declare global {
  namespace Cypress {
    interface Chainable {
      login(email?: string, password?: string): Chainable<void>;
      logout(): Chainable<void>;
      uploadFile(fileName: string, fileType?: string): Chainable<void>;
      interceptAPI(): Chainable<void>;
    }
  }
}

// Login command
Cypress.Commands.add('login', (email = 'test@example.com', password = 'password123') => {
  cy.session([email, password], () => {
    cy.visit('/login');
    cy.get('[data-cy="email-input"]').type(email);
    cy.get('[data-cy="password-input"]').type(password);
    cy.get('[data-cy="login-button"]').click();
    cy.url().should('not.include', '/login');
  });
});

// Logout command
Cypress.Commands.add('logout', () => {
  cy.get('[data-cy="user-menu"]').click();
  cy.get('[data-cy="logout-button"]').click();
  cy.url().should('include', '/login');
});

// File upload command
Cypress.Commands.add('uploadFile', (fileName: string, fileType = 'image/jpeg') => {
  cy.fixture(fileName, 'base64').then((fileContent) => {
    cy.get('[data-cy="file-upload"]').selectFile({
      contents: fileContent,
      fileName,
      mimeType: fileType,
    }, { force: true });
  });
});

// API interception setup
Cypress.Commands.add('interceptAPI', () => {
  cy.intercept('POST', '/api/auth/login', { fixture: 'auth/login-response.json' }).as('login');
  cy.intercept('GET', '/api/cards', { fixture: 'cards/cards-list.json' }).as('getCards');
  cy.intercept('POST', '/api/cards/scan', { fixture: 'cards/scan-response.json' }).as('scanCard');
});