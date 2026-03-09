/// <reference types="cypress" />

describe('cypress-cli generated test', () => {
	it('should complete the recorded flow', () => {
		cy.visit('https://demo.playwright.dev/todomvc');
		cy.get('input.new-todo').type('Buy groceries');
		cy.get('body').type('{Enter}');
		cy.get('input.new-todo').type('Walk the dog');
		cy.get('body').type('{Enter}');
		cy.get('input.new-todo').type('Read a book');
		cy.get('body').type('{Enter}');
		cy.get('html > body > section > div > section > ul > li:nth-of-type(1) > div > input').check();
		cy.get('html > body > section > div > section > ul > li:nth-of-type(1) > div > input').should('be.checked');
		cy.get('html > body > section > div > footer > span > strong').should('have.text', '2');
		cy.get('html > body > section > div > footer > ul > li:nth-of-type(3) > a').click();
		cy.get('[data-testid="todo-title"]').should('have.text', 'Buy groceries');
		cy.url().should('include', '/completed');
	});
});
