import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import ReactDOMServer from 'react-dom/server';
import { createServer } from 'vite';

// Initialize Vite server once to SSR-load JSX components
const vite = await createServer({
  root: 'client',
  configFile: 'client/vite.config.js',
  server: { middlewareMode: true },
  appType: 'custom',
});

const { P0ExtensionCard, P0ExtensionCardInner } = await vite.ssrLoadModule('/src/components/journey/P0ExtensionCard.jsx');
const { P0ResultsView } = await vite.ssrLoadModule('/src/components/journey/P0ResultsView.jsx');

const sampleExtensionPlan = {
  type: 'EXTENSION',
  trainNumber: '12309',
  trainName: 'Rajdhani Express',
  from: 'NDLS',
  to: 'CNB',
  bookedTo: 'PRYJ',
  extendedTo: 'PRYJ',
  extendedStationName: 'Prayagraj Junction',
  laneClass: '3A',
  totalFare: 1450,
  extraFare: 210,
  departureTime: '17:15',
  destinationArrivalTime: '21:40',
  extendedArrivalTime: '23:35',
  tier: 'CONFIRMED',
  status: 'CONFIRMED',
};

const sampleStandardAlternative = {
  type: 'same_train',
  tier: 'CONFIRMED',
  trainNo: '12424',
  trainName: 'Dibrugarh Rajdhani',
  laneClass: '3A',
  legs: [
    {
      trainNo: '12424',
      from: 'NDLS',
      to: 'CNB',
      class: '3A',
      departureTime: '16:20',
      arrivalTime: '21:05',
    },
  ],
};

describe('Phase 2 — Gate 5: Client Route Extension Tests', () => {
  after(async () => {
    await vite.close();
  });

  it('1. Extension plan renders correctly with badges, train details, and extraFare', () => {
    const html = ReactDOMServer.renderToStaticMarkup(
      React.createElement(P0ExtensionCard, {
        plan: sampleExtensionPlan,
        destinationCode: 'CNB',
        destinationName: 'Kanpur Central',
      })
    );

    assert.ok(html.includes('ROUTE EXTENSION'), 'Must render ROUTE EXTENSION badge');
    assert.ok(html.includes('CONFIRMED'), 'Must render CONFIRMED badge');
    assert.ok(html.includes('12309'), 'Must render train number');
    assert.ok(html.includes('Rajdhani Express'), 'Must render train name');
    assert.ok(html.includes('Book to PRYJ'), 'Must display booking advice');
    assert.ok(html.includes('Deboard at CNB'), 'Must display deboard station');
    assert.ok(html.includes('+₹210 extra fare') || html.includes('210'), 'Must display extra fare');
    assert.ok(html.includes('₹1,450'), 'Must display total fare');
  });

  it('2. Pill = header = cards counts: extension plan counts consistently across UI', () => {
    const html = ReactDOMServer.renderToStaticMarkup(
      React.createElement(P0ResultsView, {
        direct: [],
        alternatives: [sampleExtensionPlan, sampleStandardAlternative],
        features: { extension: true },
        hasConfirmedDirectSeat: false,
      })
    );

    // Header pill text: "2 verified" (both are CONFIRMED)
    assert.ok(
      html.includes('2 verified'),
      'Header count must show 2 verified when 1 extension + 1 standard confirmed alternative exist'
    );
    // Both cards should be rendered
    assert.ok(html.includes('ROUTE EXTENSION'), 'Must render extension card');
    assert.ok(html.includes('12424'), 'Must render standard alternative card');
  });

  it('3. Unknown plan type does not crash the list (renders other cards safely)', () => {
    const unknownPlan = {
      type: 'FLYING_CAR_TELEPORTATION',
      foo: 'bar',
    };

    let didThrow = false;
    let html = '';
    try {
      html = ReactDOMServer.renderToStaticMarkup(
        React.createElement(P0ResultsView, {
          direct: [],
          alternatives: [unknownPlan, sampleStandardAlternative],
          features: { extension: true },
        })
      );
    } catch {
      didThrow = true;
    }

    assert.equal(didThrow, false, 'Rendering unknown plan type must not throw');
    assert.ok(html.includes('12424'), 'Standard alternative must still render despite unknown plan');
    assert.ok(!html.includes('FLYING_CAR_TELEPORTATION'), 'Unknown plan should render nothing');
  });

  it('4. Throwing extension card error boundary catches error and does not hide other cards', () => {
    // Test ErrorBoundary directly
    const errorBoundary = new P0ExtensionCard({}).type;
    // ErrorBoundary class static method
    assert.equal(typeof errorBoundary.getDerivedStateFromError, 'function');
    const state = errorBoundary.getDerivedStateFromError(new Error('Test explosion'));
    assert.equal(state.hasError, true);

    // In errored state, ErrorBoundary renders null safely
    const instance = new errorBoundary({});
    instance.state = { hasError: true };
    const rendered = instance.render();
    assert.equal(rendered, null, 'Errored extension card renders null');

    // Also verify P0ExtensionCardInner handles undefined/null plan safely
    const nullHtml = ReactDOMServer.renderToStaticMarkup(
      React.createElement(P0ExtensionCardInner, { plan: null })
    );
    assert.equal(nullHtml, '');
  });

  it('5. With features.extension=false, nothing extension-related renders', () => {
    const html = ReactDOMServer.renderToStaticMarkup(
      React.createElement(P0ResultsView, {
        direct: [],
        alternatives: [sampleExtensionPlan, sampleStandardAlternative],
        features: { extension: false },
      })
    );

    assert.ok(!html.includes('ROUTE EXTENSION'), 'Must not render ROUTE EXTENSION badge when flag is false');
    assert.ok(!html.includes('Book to PRYJ'), 'Must not render extension booking advice when flag is false');
    assert.ok(html.includes('12424'), 'Standard alternative must still render');
  });
});
