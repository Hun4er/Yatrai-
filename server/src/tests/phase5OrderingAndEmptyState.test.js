import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AlternativesEngineService } from '../services/rail/alternativesEngine.service.js';
import { ActionBudgetService } from '../services/rail/actionBudget.service.js';
import {
  hasConfirmedDirect,
  determineDisplayOrder,
  selectDisplayOrder,
  computeEmptyStateFacts,
} from '../../../client/src/utils/journeyViewModel.js';

describe('Phase 5 — Alternatives-First Ordering & Empty State Suite', () => {
  describe('1. hasConfirmedDirect Selector', () => {
    it('returns true when a train has an AVAILABLE checked class', () => {
      const direct = [
        {
          trainNumber: '12310',
          classes: [
            { class: '3A', state: 'CHECKED', tier: 'WAITLIST', availabilityText: 'WL 11' },
            { class: '2A', state: 'CHECKED', tier: 'AVAILABLE', availabilityText: 'AVAILABLE-0012' },
          ],
        },
      ];
      assert.equal(hasConfirmedDirect(direct), true);
    });

    it('returns true when availabilityText starts with AVL or AVAILABLE', () => {
      const direct = [
        {
          trainNumber: '12394',
          classes: [
            { class: 'SL', state: 'CHECKED', tier: 'UNKNOWN', availabilityText: 'AVL 12' },
          ],
        },
      ];
      assert.equal(hasConfirmedDirect(direct), true);
    });

    it('returns false when all classes are WAITLIST, RAC, or UNAVAILABLE', () => {
      const direct = [
        {
          trainNumber: '12310',
          classes: [
            { class: '3A', state: 'CHECKED', tier: 'WAITLIST', availabilityText: 'WL 11' },
            { class: '2A', state: 'CHECKED', tier: 'RAC', availabilityText: 'RAC 3' },
            { class: '1A', state: 'CHECKED', tier: 'UNAVAILABLE', availabilityText: 'NOT AVAILABLE' },
          ],
        },
      ];
      assert.equal(hasConfirmedDirect(direct), false);
    });

    it('returns false for empty or non-array direct trains', () => {
      assert.equal(hasConfirmedDirect([]), false);
      assert.equal(hasConfirmedDirect(null), false);
    });
  });

  describe('2. determineDisplayOrder Selector (All 4 Cases)', () => {
    it('Case 1: "confirmed direct" when direct has confirmed seats', () => {
      const order = determineDisplayOrder({
        hasConfirmedDirect: true,
        alternatives: [{ id: 'alt-1' }],
        isLoadingAlternatives: false,
      });
      assert.equal(order, 'confirmed direct');

      const select = selectDisplayOrder({ hasConfirmedDirect: true });
      assert.equal(select.mode, 'confirmed direct');
      assert.equal(select.isConfirmedDirect, true);
      assert.equal(select.primarySection, 'direct');
      assert.equal(select.secondarySection, 'alternatives');
    });

    it('Case 2: "no confirmed direct with alternatives" when alternatives exist and no direct confirmed seat', () => {
      const order = determineDisplayOrder({
        hasConfirmedDirect: false,
        alternatives: [{ id: 'alt-1' }],
        isLoadingAlternatives: false,
      });
      assert.equal(order, 'no confirmed direct with alternatives');

      const select = selectDisplayOrder({
        hasConfirmedDirect: false,
        alternatives: [{ id: 'alt-1' }],
        isLoadingAlternatives: false,
      });
      assert.equal(select.mode, 'no confirmed direct with alternatives');
      assert.equal(select.isAlternativesFirst, true);
      assert.equal(select.primarySection, 'alternatives');
      assert.equal(select.secondarySection, 'direct');
    });

    it('Case 3: "nothing confirmed" when no direct seats and alternatives returned 0 plans', () => {
      const order = determineDisplayOrder({
        hasConfirmedDirect: false,
        alternatives: [],
        isLoadingAlternatives: false,
      });
      assert.equal(order, 'nothing confirmed');

      const select = selectDisplayOrder({
        hasConfirmedDirect: false,
        alternatives: [],
        isLoadingAlternatives: false,
      });
      assert.equal(select.mode, 'nothing confirmed');
      assert.equal(select.isNothingConfirmed, true);
      assert.equal(select.primarySection, 'alternatives');
    });

    it('Case 4: "loading" when alternatives are fetching for non-confirmed direct route', () => {
      const order = determineDisplayOrder({
        hasConfirmedDirect: false,
        alternatives: [],
        isLoadingAlternatives: true,
      });
      assert.equal(order, 'loading');

      const select = selectDisplayOrder({
        hasConfirmedDirect: false,
        alternatives: [],
        isLoadingAlternatives: true,
      });
      assert.equal(select.mode, 'loading');
      assert.equal(select.isLoading, true);
      assert.equal(select.primarySection, 'alternatives');
    });
  });

  describe('3. computeEmptyStateFacts Selector', () => {
    it('computes exact factual counts and finds closest waitlist candidate with prediction %', () => {
      const direct = [
        {
          trainNumber: '12310',
          trainName: 'Rajdhani Express',
          from: 'NDLS',
          to: 'DNR',
          classes: [
            {
              class: '3A',
              state: 'CHECKED',
              tier: 'WAITLIST',
              availabilityText: 'WL 11',
              waitlistPosition: 11,
              predictionPercentage: 89,
            },
            {
              class: '2A',
              state: 'CHECKED',
              tier: 'WAITLIST',
              availabilityText: 'WL 4',
              waitlistPosition: 4,
              predictionPercentage: 91,
            },
          ],
        },
        {
          trainNumber: '12394',
          trainName: 'Sampoorna Kranti',
          from: 'NDLS',
          to: 'PNBE',
          classes: [
            {
              class: 'SL',
              state: 'CHECKED',
              tier: 'UNAVAILABLE',
              availabilityText: 'NOT AVAILABLE',
            },
            {
              class: '3A',
              state: 'CHECKED',
              tier: 'ERROR',
              availabilityText: "couldn't check",
            },
          ],
        },
      ];

      const facts = computeEmptyStateFacts({ direct });
      assert.equal(facts.trainsCount, 2);
      assert.equal(facts.totalSegments, 4);
      assert.equal(facts.waitlistedCount, 2);
      assert.equal(facts.unavailableCount, 1);
      assert.equal(facts.errorCount, 1);
      assert.equal(facts.allInError, false);
      assert.ok(facts.closestCandidate);
      assert.equal(facts.closestCandidate.trainNumber, '12310');
      assert.equal(facts.closestCandidate.class, '2A');
      assert.equal(facts.closestCandidate.waitlistPosition, 4);
      assert.equal(facts.closestCandidate.predictionPercentage, 91);
      assert.ok(facts.summaryText.includes('Checked 4 segments on 2 trains. 2 waitlisted, 1 unavailable, 1 could not be checked.'));
      assert.ok(facts.summaryText.includes('Closest: 12310 NDLS->DNR 2A WL 4 (91%).'));
    });

    it('identifies when all checked segments ended in error', () => {
      const direct = [
        {
          trainNumber: '12310',
          classes: [
            { class: '3A', state: 'CHECKED', tier: 'ERROR', availabilityText: "couldn't check" },
            { class: '2A', state: 'CHECKED', tier: 'ERROR', availabilityText: "couldn't check" },
          ],
        },
      ];

      const facts = computeEmptyStateFacts({ direct });
      assert.equal(facts.allInError, true);
      assert.equal(facts.errorCount, 2);
      assert.equal(facts.totalSegments, 2);
    });
  });

  describe('4. Strict-empty -> Risky Plans Fallback', () => {
    it('runs second pass for risky/waitlist alternatives when strict search finds 0 confirmed plans', async () => {
      const budget = new ActionBudgetService();
      const actionId = 'test_risky_' + Date.now();
      await budget.getOrCreate(actionId, 'default');

      // Setup AltEngine where all train availability returns WAITLIST (WL 5, 85% prediction)
      const altEngine = new AlternativesEngineService({
        railKit: {
          hasCachedSearch: () => true,
          hasCachedInfo: () => true,
          async searchTrainBetweenStations(from, to) {
            if (from === 'NDLS' && to === 'CNB') {
              return {
                success: true,
                data: [
                  {
                    train_number: '12004',
                    from: { code: 'NDLS', departure: '06:00' },
                    to: { code: 'CNB', arrival: '11:00' },
                    classes: ['3A'],
                    duration: 300,
                  },
                ],
              };
            }
            if (from === 'CNB' && to === 'PNBE') {
              return {
                success: true,
                data: [
                  {
                    train_number: '12394',
                    from: { code: 'CNB', departure: '12:30' }, // layover 90 min (valid 30-180m)
                    to: { code: 'PNBE', arrival: '18:00' },
                    classes: ['3A'],
                    duration: 330,
                  },
                ],
              };
            }
            return { success: true, data: [] };
          },
        },
        availabilityService: {
          hasCached: () => true,
          async checkLegAvailability() {
            return {
              normalizedStatus: 'WAITLIST',
              waitlistPosition: 5,
              predictionPercentage: 85,
              fare: { totalFare: 1100 },
            };
          },
        },
        actionBudgetService: budget,
      });

      // Strict search (allowRisky = false) must return 0 plans
      const strictPlans = await altEngine._crossTrainSearch({
        originCode: 'NDLS',
        destCode: 'PNBE',
        hubCode: 'CNB',
        laneClass: '3A',
        dateStr: '2026-10-30',
        quota: 'GN',
        actionId,
        budget,
        directDistanceKm: 1000,
        isDeep: false,
        allowRisky: false,
      });
      assert.equal(strictPlans.length, 0, 'Strict search must return 0 plans when seats are waitlisted');

      // Second pass (allowRisky = true) must return the plan labelled risky
      const riskyPlans = await altEngine._crossTrainSearch({
        originCode: 'NDLS',
        destCode: 'PNBE',
        hubCode: 'CNB',
        laneClass: '3A',
        dateStr: '2026-10-30',
        quota: 'GN',
        actionId,
        budget,
        directDistanceKm: 1000,
        isDeep: false,
        allowRisky: true,
      });

      assert.equal(riskyPlans.length, 1, 'Second pass must return the viable waitlisted combination');
      const plan = riskyPlans[0];
      assert.equal(plan.isRisky, true);
      assert.equal(plan.tier, 'WAITLIST');
      assert.equal(plan.badge, 'Risky — waitlisted');
      assert.ok(plan.notice.includes('Waitlisted — not guaranteed'));
      assert.equal(plan.totalFare, 2200);
    });
  });
});
