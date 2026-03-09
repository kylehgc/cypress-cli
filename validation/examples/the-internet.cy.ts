/// <reference types="cypress" />

describe('cypress-cli generated test', () => {
	it('should complete the recorded flow', () => {
		cy.visit('https://the-internet.herokuapp.com');
		cy.visit('https://the-internet.herokuapp.com/checkboxes');
		cy.get('#checkboxes > input:nth-of-type(1)').check();
		cy.get('#checkboxes > input:nth-of-type(2)').uncheck();
		cy.get('#checkboxes > input:nth-of-type(1)').should('be.checked');
		cy.get('#checkboxes > input:nth-of-type(2)').should('not.be.checked');
		cy.visit('https://the-internet.herokuapp.com/dropdown');
		cy.get('#dropdown').select('Option 2');
		cy.get('#dropdown').should('have.value', '2');
		cy.visit('https://the-internet.herokuapp.com/login');
		cy.get('#username').clear().type('tomsmith');
		cy.get('#password').clear().type('SuperSecretPassword!');
		cy.get('button.radius').click();
		cy.url().should('include', '/secure');
		cy.visit('https://the-internet.herokuapp.com/javascript_alerts');
		cy.once('window:confirm', () => true);
		cy.once('window:alert', () => true);
		cy.get('#content > div > ul > li:nth-of-type(1) > button').click();
		cy.get('#result').should('have.text', 'You successfully clicked an alert');
		cy.visit('https://the-internet.herokuapp.com/key_presses');
		cy.get('body').type('{esc}');
	});
});
