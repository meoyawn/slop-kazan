import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { classifyFacade } from '../tools/kazan-facades.mjs';

describe('Facade evidence precedence', () => {
  test('a photographed multicolour facade replaces a conflicting single mapped colour', () => {
    const result = classifyFacade({ building: 'apartments', 'building:colour': 'yellow' },
      { facadeProfile: 'brick-white-red', appearance: { zoneWidth: 0.22 } },
      { 'brick-white-red': { wallColour: '#d3d6cd', accentColour: '#954738', masonry: 'brick', zoneWidth: 0.3 } });
    assert.equal(result.appearance.wallColour, '#d3d6cd');
    assert.equal(result.appearance.accentColour, '#954738');
    assert.equal(result.appearance.zoneWidth, 0.22);
    assert.equal(result.source, 'reviewed-photograph');
    assert.equal(result.confidence, 'reviewed');
  });

  test('mapped paint survives a material fallback and the construction year cannot invent red inserts', () => {
    const profiles = { 'brick-white': { wallColour: '#ccccbb', masonry: 'brick' }, 'mineral-neutral': { wallColour: '#cccccc' } };
    const painted = classifyFacade({ building: 'apartments', 'building:material': 'brick', 'building:colour': '#a68671' }, null, profiles);
    assert.equal(painted.appearance.wallColour, '#a68671');
    assert.equal(painted.source, 'osm-colour');
    const unknown = classifyFacade({ building: 'apartments', start_date: '2002' }, null, profiles);
    assert.equal(unknown.appearance.accentColour, undefined);
    assert.equal(unknown.confidence, 'low');
  });

  test('glazed building parts retain their own envelope instead of receiving masonry windows', () => {
    assert.equal(classifyFacade({ 'building:part': 'yes', 'building:material': 'glass' },
      { facadeProfile: 'brick-white-red' }, {}), null);
  });
});
