const assert = require('node:assert/strict');
const createEngine = require('../build/field-lab/engine.js');
(async () => {
  const e = await createEngine(); e._lab_init();
  const ticks = n => { for(let i=0;i<n;i++) e._lab_tick(); };
  assert.equal(e._lab_value(1),6);
  e._lab_key(3,1); ticks(10); e._lab_key(3,0); ticks(1);
  assert.equal(e._lab_entity(0,0),-4.8);
  e._lab_control(0); e._lab_key(3,1); e._lab_advance(1);
  assert.equal(e._lab_value(0),0); e._lab_advance(17);
  assert.equal(e._lab_entity(0,0),-5.34,'input survives a zero-tick frame');
  e._lab_control(0); e._lab_key(5,1); ticks(1); e._lab_key(5,0); ticks(1);
  e._lab_key(3,1); ticks(30); assert.equal(e._lab_entity(0,0),-5.4,'priority context masks movement');
  e._lab_control(1); e._lab_key(3,1); ticks(20); e._lab_key(3,0); e._lab_key(4,1); ticks(1);
  e._lab_key(4,0); ticks(10); e._lab_control(2);
  const expected=e._lab_value(6), length=e._lab_value(5);
  assert.equal(e._lab_value(1),7,'deferred spawn commits');
  for(let i=0;i<3;i++) { e._lab_control(3); ticks(length); assert.equal(e._lab_value(6),expected); assert.equal(e._lab_value(3),3); }
  e._lab_control(0); assert.equal(e._lab_value(1),6);
  e._lab_control(4); ticks(361); assert.equal(e._lab_value(2),4,'demo collects four beacons');
  const demo=e._lab_value(6); e._lab_control(3); ticks(361); assert.equal(e._lab_value(6),demo);
  console.log('Field Lab WASM: movement, zero-tick input, priority masking, deferred spawn, reset, and repeated replay passed.');
})().catch(error => { console.error(error); process.exit(1); });
