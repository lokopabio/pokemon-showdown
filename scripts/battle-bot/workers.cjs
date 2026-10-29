'use strict';
const {Worker} = require('node:worker_threads');
const path = require('node:path');
class RolloutPool {
  constructor(count) {
    this.queue = [];
    this.pending = new Map();
    this.nextId = 0;
    this.closed = false;
    this.workers = Array.from({length: count}, () => {
      const slot = {worker: new Worker(path.join(__dirname, 'rollout.cjs')), busy: false};
      slot.worker.on('message', message => {
        const task = this.pending.get(message.id);
        this.pending.delete(message.id);
        slot.busy = false;
        if (task) message.error ? task.reject(new Error(message.error)) : task.resolve(message.value);
        this.dispatch();
      });
      slot.worker.on('error', error => this.fail(error));
      slot.worker.on('exit', code => {if (!this.closed) this.fail(new Error(`Rollout worker exited (${code})`));});
      return slot;
    });
  }
  run(job) {
    if (this.closed) return Promise.reject(new Error('Worker pool is closed'));
    return new Promise((resolve, reject) => {this.queue.push({id: this.nextId++, job, resolve, reject}); this.dispatch();});
  }
  dispatch() {
    if (this.closed) return;
    for (const slot of this.workers) {
      if (slot.busy || !this.queue.length) continue;
      const task = this.queue.shift();
      this.pending.set(task.id, task);
      slot.busy = true;
      slot.worker.postMessage({id: task.id, job: task.job});
    }
  }
  fail(error) {
    for (const task of [...this.pending.values(), ...this.queue]) task.reject(error);
    this.pending.clear(); this.queue = [];
    void this.close();
  }
  async close() {
    this.closed = true;
    for (const task of [...this.pending.values(), ...this.queue]) task.reject(new Error('Worker pool closed'));
    this.pending.clear(); this.queue = [];
    await Promise.all(this.workers.map(s => s.worker.terminate()));
  }
}
module.exports = {RolloutPool};
