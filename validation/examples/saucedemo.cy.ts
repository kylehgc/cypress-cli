/// <reference types="cypress" />

describe('cypress-cli generated test', () => {
	it('should complete the recorded flow', () => {
		cy.visit('https://www.saucedemo.com');
		cy.get('[data-test="username"]').clear().type('standard_user');
		cy.get('[data-test="password"]').clear().type('secret_sauce');
		cy.get('[data-test="login-button"]').click();
		cy.get('[data-test="add-to-cart-sauce-labs-backpack"]').click();
		cy.get('[data-test="shopping-cart-badge"]').click();
		cy.get('[data-test="inventory-item-name"]').should('have.text', 'Sauce Labs Backpack');
		cy.get('[data-test="checkout"]').click();
		cy.get('[data-test="firstName"]').clear().type('John');
		cy.get('[data-test="lastName"]').clear().type('Doe');
		cy.get('[data-test="postalCode"]').clear().type('90210');
		cy.get('[data-test="continue"]').click();
		cy.get('[data-test="subtotal-label"]').should('contain.text', '$29.99');
		cy.get('[data-test="finish"]').click();
		cy.get('[data-test="complete-header"]').should('have.text', 'Thank you for your order!');
		cy.url().should('include', 'checkout-complete');
	});
});
