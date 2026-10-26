// Response-only automation: drive the same jump phase under the chosen brush
// clock without adding a debug API or automatic input to the shipped game.
exports.instrument = source => source
 .replace('  function start() {','  function start() {\n    window.testAirClock=0;')
 .replace('    player.jumps++;','    player.jumps++;\n    if(player.jumps===1)window.testAirClock=0;')
 .replace('    if (!player.grounded) {','    if (!player.grounded) {\n      window.testAirClock=(window.testAirClock||0)+jumpDt;')
 .replace(' hud();requestAnimationFrame(frame);',`
window.jumpController={
 phase:()=>window.testAirClock||0,
 duration:phase=>{let elapsed=0,left=phase;while(left>1e-9){const step=Math.min(left,.01),guess=step/jumpRate(Math.max(0,boostRemaining-elapsed),time+elapsed);elapsed+=step/jumpRate(Math.max(0,boostRemaining-elapsed-guess/2),time+elapsed+guess/2);left-=step;}return elapsed;},
 travel:phase=>predictTravel(window.jumpController.duration(phase)),
 until:phase=>Math.max(0,(phase-(window.testAirClock||0))/jumpRate())
};
 hud();requestAnimationFrame(frame);`);
