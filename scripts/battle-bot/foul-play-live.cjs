'use strict';
const path=require('node:path');
const {spawn}=require('node:child_process');
const readline=require('node:readline');
class FoulPlayLive {
  constructor({python,foul,bank,searchMs=100,passwordEnv,diagnostics=false}) {
    this.events=[];this.pending=null;this.closed=false;this.stderr='';
    const env={...process.env,PYTHONUTF8:'1',ROMAN_FOUL_PLAY:path.resolve(foul),ROMAN_METAGAME_BANK:path.resolve(bank),ROMAN_SEARCH_MS:String(searchMs)};
    if(diagnostics)env.ROMAN_DIAGNOSTICS='1';else delete env.ROMAN_DIAGNOSTICS;
    if(passwordEnv)delete env[passwordEnv];
    this.process=spawn(path.resolve(python),[path.join(__dirname,'foul-play-bridge.py')],{env,stdio:['pipe','pipe','pipe']});
    this.process.stdin.on('error',error=>this.fail(error));
    this.process.stderr.on('data',data=>{this.stderr=(this.stderr+data).slice(-16000);});
    this.process.on('error',e=>this.fail(new Error('Foul Play process failed: '+e.message)));
    this.process.on('exit',code=>{if(!this.closed)this.fail(new Error(`Foul Play exited ${code}: ${this.stderr}`));});
    this.lines=readline.createInterface({input:this.process.stdout});
    this.lines.on('line',line=>{
      try {const result=JSON.parse(line);this.lastDecision=result;if(this.pending){const current=this.pending;this.pending=null;clearTimeout(current.timer);current.resolve(result.choice);}}
      catch {this.fail(new Error('Invalid response from Foul Play bridge'));}
    });
  }
  observe(event) {if(!event.startsWith('|request|'))this.events.push(event);}
  setTeam() {} // Own exact team is supplied in Showdown's private request.
  choose(request) {
    if(this.closed)return Promise.reject(this.failure||new Error('Foul Play bridge closed'));
    if(this.pending)return Promise.reject(new Error('Overlapping Foul Play decisions'));
    const events=this.events;this.events=[];
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>this.fail(new Error('Foul Play decision timed out')),30000);
      this.pending={resolve,reject,timer};
      this.process.stdin.write(JSON.stringify({events,request})+'\n',error=>{if(error)this.fail(error);});
    });
  }
  fail(error) {
    this.failure=error;
    if(this.pending){clearTimeout(this.pending.timer);this.pending.reject(error);this.pending=null;}
    this.close();
  }
  close() {if(this.closed)return;this.closed=true;this.lines?.close();this.process.kill();if(this.pending){clearTimeout(this.pending.timer);this.pending.reject(new Error('Battle closed'));this.pending=null;}}
}
module.exports={FoulPlayLive};
