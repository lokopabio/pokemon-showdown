'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {assignments}=require('./foul-play-benchmark.cjs');
test('matched benchmark crosses team ownership and player positions independently',()=>{
  const a=[{species:'A'}],b=[{species:'B'}];
  const games=assignments(a,b);
  assert.equal(games.length,4);
  assert.equal(new Set(games.map(g=>`${g.foulSide}:${g.foulTeam}`)).size,4);
  for(const game of games){const actual=game.foulSide==='p1'?game.team1:game.team2;assert.equal(actual,game.foulTeam===0?a:b);}
});
