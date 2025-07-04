// Component testing support file
import './commands';
import { mount } from 'cypress/react18';

// Make mount available globally
declare global {
  namespace Cypress {
    interface Chainable {
      mount: typeof mount;
    }
  }
}

Cypress.Commands.add('mount', mount);