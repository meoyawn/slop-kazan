import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { classifyFacade } from '../tools/kazan-facades.mjs';

describe('Facade evidence precedence', () => {
  test('a procedural academic assignment cannot claim photographic review and preserves mapped paint', () => {
    const observation={facadeProfile:'academic-neutral',appearanceEvidence:'procedural-estimate'},profiles={'academic-neutral':{wallColour:'#c8c6bc',windows:false}};
    const inferred=classifyFacade({building:'yes',amenity:'university'},observation,profiles);
    assert.equal(inferred.source,'procedural-estimate');
    assert.equal(inferred.confidence,'inferred');
    const mapped=classifyFacade({building:'yes','building:colour':'#a68671'},observation,profiles);
    assert.equal(mapped.appearance.wallColour,'#a68671');
    assert.equal(mapped.source,'osm-colour');
    assert.equal(mapped.confidence,'mapped');
  });

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
    for (const tags of [{ start_date: '1974' }, { start_date: '2002' }, { 'building:material': 'concrete' }]) {
      const unknown = classifyFacade({ building: 'apartments', ...tags }, null, profiles);
      assert.equal(unknown.appearance.accentColour, undefined);
      assert.equal(unknown.confidence, 'low');
      assert.equal(unknown.family, 'mineral-neutral', 'neither an age nor generic concrete proves prefabricated panel construction');
    }
  });

  test('glazed building parts retain their own envelope instead of receiving masonry windows', () => {
    assert.equal(classifyFacade({ 'building:part': 'yes', 'building:material': 'glass' },
      { facadeProfile: 'brick-white-red' }, {}), null);
  });

  test('school classroom and gym families retain paint evidence without borrowing residential balconies or kindergarten layouts', () => {
    const classroom = { wallColour: '#deded0', bayWidth: 3.3, windowRatioX: 0.58, balconyZones: false };
    const profiles = { 'school-plaster-classroom': classroom, 'school-brick-classroom': { ...classroom, masonry: 'brick' },
      'school-panel-classroom': { ...classroom, joints: 'panels' }, 'school-historic-classroom': { ...classroom, windowRatioX: 0.46 },
      'school-sports-hall': { ...classroom, floorHeight: 6, windowRatioY: 0.3 },
      'kindergarten-plaster': { ...classroom, bayWidth: 2.8 } };
    const mapped = classifyFacade({ building: 'school', 'building:material': 'brick', 'building:colour': '#ac7654' }, null, profiles);
    assert.ok(mapped, 'school bodies receive classroom facades rather than the generic residential-like fallback');
    assert.equal(mapped.appearance.wallColour, '#ac7654');
    assert.equal(mapped.appearance.masonry, 'brick');
    assert.equal(mapped.appearance.balconyZones, false);
    assert.equal(mapped.source, 'osm-colour');
    const unknown = classifyFacade({ building: 'school' }, null, profiles);
    assert.equal(unknown.confidence, 'inferred');
    assert.equal(unknown.source, 'procedural-school');
    const gym = classifyFacade({ building: 'yes', amenity: 'school', leisure: 'sports_hall' }, null, profiles);
    assert.ok(gym.appearance.floorHeight > unknown.appearance.floorHeight || gym.appearance.windowRatioY < 0.5);
    const old = classifyFacade({ building: 'school', start_date: '1935' }, null, profiles);
    assert.ok(old.appearance.windowRatioX < unknown.appearance.windowRatioX);
    const child = classifyFacade({ building: 'kindergarten' }, null, profiles);
    assert.equal(child.family, 'kindergarten-plaster', 'kindergartens use their own family');
    assert.ok(child.appearance.bayWidth < classroom.bayWidth);
    assert.equal(classifyFacade({ building: 'school', amenity: 'kindergarten' }, null, profiles).family, child.family,
      'a former school used by a kindergarten keeps childcare classification');
  });
});
