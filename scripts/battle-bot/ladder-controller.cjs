'use strict';
class LadderController {
 constructor({format='gen7ou',delayMs=15000,send,selectTeam,onQueued=()=>{},onCancelled=()=>{},busy,log=()=>{},setTimer=setTimeout,clearTimer=clearTimeout}){
  if(format!=='gen7ou'||!Number.isInteger(delayMs)||delayMs<5000||delayMs>300000)throw Error('Ladder requires gen7ou and delayMs 5000–300000');
  Object.assign(this,{format,delayMs,send,selectTeam,onQueued,onCancelled,busy,log,setTimer,clearTimer});
  this.connected=false;this.searching=false;this.paused=false;this.timer=null;this.closed=false;
 }
 cancelTimer(){if(this.timer!==null)this.clearTimer(this.timer);this.timer=null;}
 arm(){if(this.closed||!this.connected||this.paused||this.searching||this.timer!==null)return;this.timer=this.setTimer(()=>{this.timer=null;this.queue();},this.delayMs);}
 online(){this.connected=true;this.arm();}
 queue(){
  if(this.closed||!this.connected||this.paused||this.searching)return;
  if(this.busy()){this.arm();return;}
  try{const team=this.selectTeam();this.searching=true;this.onQueued(team);this.send('/utm '+team.packed);this.send('/search '+this.format);this.log('Searching '+this.format+' ladder');}
  catch(error){this.pause('Search preparation failed: '+error.message);}
 }
 update(data){
  if(!Array.isArray(data.searching)||(data.games!==null&&(typeof data.games!=='object'||Array.isArray(data.games))))return;
  const queued=data.searching.includes(this.format),hasGames=!!data.games&&Object.keys(data.games).length>0;
  if(queued||hasGames){this.searching=queued||!this.busy();return;}
  if(this.searching){this.searching=false;this.onCancelled();}
  this.arm();
 }
 battle(){this.cancelTimer();this.searching=false;}
 finished(){this.searching=false;this.arm();}
 pause(reason){this.cancelTimer();this.paused=true;this.log('Ladder paused: '+reason+'; restart after resolving the server error');}
 disconnected(){this.cancelTimer();this.connected=false;this.searching=false;}
 close(){if(this.connected&&this.searching){try{this.send('/cancelsearch');}catch{}}this.closed=true;this.disconnected();}
}
module.exports={LadderController};
