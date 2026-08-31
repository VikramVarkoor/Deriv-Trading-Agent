/**
 * Cypress E2E — Dashboard critical flow
 *
 * Tests the primary user journey:
 *   1. Load the dashboard
 *   2. See the hero title
 *   3. See the trade log section with filter controls
 *   4. Interact with the status filter (change ALL → CLOSED)
 *   5. Verify the filter change is reflected in the UI
 *
 * PRE-REQUISITE: `npm run dev` must be running on localhost:3000.
 * Run with: `npm run test:e2e:open` (interactive) or `npm run test:e2e` (CI).
 */

describe('Dashboard — critical user flow', () => {
  beforeEach(() => {
    cy.visit('/');
  });

  // ── 1. Page loads ─────────────────────────────────────────────────────────

  it('displays the hero title', () => {
    cy.contains('Deriv Trading').should('be.visible');
    cy.contains('Agent').should('be.visible');
  });

  it('shows the LIVE pill badge', () => {
    cy.contains('LIVE · EUR/USD · PAPER TRADING').should('be.visible');
  });

  // ── 2. Trade log section ──────────────────────────────────────────────────

  it('renders the trade log section', () => {
    cy.contains('Trade Log').should('be.visible');
  });

  it('renders the trade filter controls', () => {
    cy.get('[data-testid="trade-filters"]').should('exist');
    cy.get('[data-testid="filter-status"]').should('exist');
    cy.get('[data-testid="filter-action"]').should('exist');
    cy.get('[data-testid="filter-confidence"]').should('exist');
  });

  // ── 3. Filter interaction ─────────────────────────────────────────────────

  it('status filter defaults to ALL', () => {
    cy.get('[data-testid="filter-status"]').should('have.value', 'ALL');
  });

  it('changes status filter from ALL to CLOSED', () => {
    cy.get('[data-testid="filter-status"]').select('CLOSED');
    cy.get('[data-testid="filter-status"]').should('have.value', 'CLOSED');
  });

  it('shows Reset button after applying a filter', () => {
    // Reset button only appears when filters are non-default
    cy.get('[data-testid="filter-reset"]').should('not.exist');
    cy.get('[data-testid="filter-status"]').select('CLOSED');
    cy.get('[data-testid="filter-reset"]').should('be.visible');
  });

  it('Reset button restores filters to defaults', () => {
    cy.get('[data-testid="filter-status"]').select('OPEN');
    cy.get('[data-testid="filter-action"]').select('BUY');
    cy.get('[data-testid="filter-reset"]').click();
    cy.get('[data-testid="filter-status"]').should('have.value', 'ALL');
    cy.get('[data-testid="filter-action"]').should('have.value', 'ALL');
    cy.get('[data-testid="filter-reset"]').should('not.exist');
  });

  // ── 4. WinRateSummary renders ─────────────────────────────────────────────

  it('renders the win rate summary widget', () => {
    cy.get('[data-testid="win-rate-summary"]').should('exist');
  });

  // ── 5. Agent controls ─────────────────────────────────────────────────────

  it('displays the Run Agent button', () => {
    cy.contains('Run Agent').should('be.visible');
  });

  it('displays Force BUY and Force SELL buttons', () => {
    cy.contains('Force BUY').should('be.visible');
    cy.contains('Force SELL').should('be.visible');
  });
});
