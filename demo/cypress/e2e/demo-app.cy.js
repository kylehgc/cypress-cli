describe('Demo app', () => {
	beforeEach(() => {
		cy.visit('/demo/index.html');
	});

	it('loads the demo page', () => {
		cy.get('h1').should('exist');
	});
});
