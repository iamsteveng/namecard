describe('Card Scanning', () => {
  beforeEach(() => {
    cy.interceptAPI();
    cy.login();
  });

  it('should scan a business card successfully', () => {
    cy.visit('/scan');
    
    cy.uploadFile('sample-card.jpg');
    cy.get('[data-cy="scan-button"]').click();
    
    cy.wait('@scanCard');
    cy.get('[data-cy="scan-result"]').should('be.visible');
    cy.get('[data-cy="extracted-name"]').should('contain', 'John Doe');
    cy.get('[data-cy="extracted-company"]').should('contain', 'Tech Corp');
    cy.get('[data-cy="extracted-email"]').should('contain', 'john.doe@techcorp.com');
  });

  it('should allow editing extracted information', () => {
    cy.visit('/scan');
    
    cy.uploadFile('sample-card.jpg');
    cy.get('[data-cy="scan-button"]').click();
    cy.wait('@scanCard');
    
    cy.get('[data-cy="edit-button"]').click();
    cy.get('[data-cy="name-input"]').clear().type('John Smith');
    cy.get('[data-cy="save-button"]').click();
    
    cy.get('[data-cy="extracted-name"]').should('contain', 'John Smith');
  });

  it('should save card to collection', () => {
    cy.visit('/scan');
    
    cy.uploadFile('sample-card.jpg');
    cy.get('[data-cy="scan-button"]').click();
    cy.wait('@scanCard');
    
    cy.get('[data-cy="save-card-button"]').click();
    cy.get('[data-cy="success-message"]').should('contain', 'Card saved successfully');
  });

  it('should handle scan errors gracefully', () => {
    cy.intercept('POST', '/api/cards/scan', { statusCode: 400, body: { error: 'Invalid image format' } }).as('scanError');
    
    cy.visit('/scan');
    cy.uploadFile('invalid-file.txt', 'text/plain');
    cy.get('[data-cy="scan-button"]').click();
    
    cy.wait('@scanError');
    cy.get('[data-cy="error-message"]').should('contain', 'Invalid image format');
  });
});