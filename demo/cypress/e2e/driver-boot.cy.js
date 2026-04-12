describe('CypressLite driver boot', () => {
	beforeEach(() => {
		cy.visit('/demo/driver-test.html');
	});

	it('boots the driver and passes all MVP tests', () => {
		cy.get('#log', { timeout: 30000 }).should(
			'contain.text',
			'ALL MVP TESTS PASSED',
		);
	});

	it('passes all extended actionability tests', () => {
		cy.get('#log', { timeout: 30000 }).should(
			'contain.text',
			'ALL EXTENDED TESTS PASSED',
		);
	});

	it('reports no fatal errors', () => {
		cy.get('#log', { timeout: 30000 })
			.should('contain.text', 'ALL EXTENDED TESTS PASSED')
			.and('not.contain.text', 'FATAL');
	});
});
