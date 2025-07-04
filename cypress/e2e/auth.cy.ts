describe('Authentication', () => {
  beforeEach(() => {
    cy.interceptAPI();
  });

  it('should login successfully', () => {
    cy.visit('/login');
    
    cy.get('[data-cy="email-input"]').type('test@example.com');
    cy.get('[data-cy="password-input"]').type('password123');
    cy.get('[data-cy="login-button"]').click();
    
    cy.wait('@login');
    cy.url().should('not.include', '/login');
    cy.get('[data-cy="user-menu"]').should('be.visible');
  });

  it('should show validation errors for invalid inputs', () => {
    cy.visit('/login');
    
    cy.get('[data-cy="login-button"]').click();
    cy.get('[data-cy="email-error"]').should('contain', 'Email is required');
    cy.get('[data-cy="password-error"]').should('contain', 'Password is required');
  });

  it('should logout successfully', () => {
    cy.login();
    cy.visit('/dashboard');
    cy.logout();
    cy.url().should('include', '/login');
  });

  it('should redirect to login when accessing protected routes', () => {
    cy.visit('/dashboard');
    cy.url().should('include', '/login');
  });
});