describe('Toy app - actionability', () => {
	it('loads the actionability test page', () => {
		cy.visit('/demo/toy-app/actionability-test.html');
		cy.get('#action-btn').should('not.exist');
	});

	it('loads the todo app', () => {
		cy.visit('/demo/toy-app/todo.html');
		cy.get('h1').should('exist');
	});

	it('loads the form page', () => {
		cy.visit('/demo/toy-app/form.html');
		cy.get('form').should('exist');
	});
});
