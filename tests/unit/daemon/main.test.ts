import { describe, it, expect } from 'vitest';

import { seedInitialNavigateHistory } from '../../../src/daemon/main.js';
import { Session } from '../../../src/daemon/session.js';

describe('daemon main', () => {
	describe('seedInitialNavigateHistory', () => {
		it('records an initial navigate entry for open-created sessions', () => {
			const session = new Session({
				id: 'seeded-session',
				url: 'https://example.com/dashboard',
			});

			seedInitialNavigateHistory(session, {});

			expect(session.commandHistory).toHaveLength(1);
			expect(session.commandHistory[0].command).toMatchObject({
				action: 'navigate',
				text: 'https://example.com/dashboard',
			});
			expect(session.commandHistory[0].result).toMatchObject({
				success: true,
				cypressCommand: "cy.visit('https://example.com/dashboard')",
			});
		});

		it('does not duplicate navigate history or seed resumed sessions', () => {
			const session = new Session({
				id: 'existing-session',
				url: 'https://example.com/dashboard',
			});

			seedInitialNavigateHistory(session, {});
			seedInitialNavigateHistory(session, {});
			seedInitialNavigateHistory(session, { resume: 'existing-session' });

			expect(session.commandHistory).toHaveLength(1);
		});
	});
});
